/*
================================================================================
SP: staging.sp_CreateAdjustment
Descripción: Crea un registro de ajuste en la tabla temporal ##Ajustes
             y lo registra en staging.Log_Ajustes para auditoría.

Tipos de ajuste:
  - CAPM: Diferencia entre IPA_Cash y CAPM
  - DERIVADOS: Diferencia entre IPA_MTM y Derivados
  - PARIDADES: Diferencia entre MTM y TotalMVal de derivados
  - SONA: Diferencia entre total IPA y SONA

IDs de instrumentos de ajuste:
  - 1505: Ajuste CAPM (IPA-CASHAPP)
  - 1506: Ajuste SONA (SONA-IPA)
  - 1507: Ajuste Derivados
  - 1508: Ajuste Paridades

Autor: Refactorización Pipeline IPA
Fecha: 2026-01-02
================================================================================
*/

CREATE OR ALTER PROCEDURE [staging].[sp_CreateAdjustment]
    @ID_Ejecucion BIGINT,
    @ID_Proceso BIGINT,
    @ID_Fund INT,
    @FechaReporte NVARCHAR(10),
    @TipoAjuste NVARCHAR(50),        -- 'CAPM', 'DERIVADOS', 'PARIDADES', 'SONA'
    @id_CURR INT,
    @Diferencia DECIMAL(18,4),
    @ValorOriginal DECIMAL(18,4) = NULL,
    @ValorComparado DECIMAL(18,4) = NULL,
    @UmbralAplicado DECIMAL(18,4) = NULL,
    @TempTableAjustes NVARCHAR(200),  -- ##Ajustes_{ID_Ejecucion}_{ID_Proceso}_{ID_Fund}
    -- Output
    @AjusteCreado BIT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    SET @AjusteCreado = 0;

    DECLARE @SQL NVARCHAR(MAX);
    DECLARE @ID_Instrumento INT;
    DECLARE @Source NVARCHAR(50);
    DECLARE @PK2 NVARCHAR(50);
    DECLARE @BalanceSheet NVARCHAR(20);

    BEGIN TRY
        -- ═══════════════════════════════════════════════════════════════════
        -- PASO 1: Determinar ID_Instrumento y Source según tipo de ajuste
        -- ═══════════════════════════════════════════════════════════════════

        SELECT @ID_Instrumento = CASE @TipoAjuste
            WHEN 'CAPM' THEN 1505
            WHEN 'SONA' THEN 1506
            WHEN 'DERIVADOS' THEN 1507
            WHEN 'PARIDADES' THEN 1508
            ELSE 1509  -- Genérico
        END;

        SELECT @Source = CASE @TipoAjuste
            WHEN 'CAPM' THEN 'CASH APPRAISAL'
            WHEN 'SONA' THEN 'GENEVA'
            WHEN 'DERIVADOS' THEN 'DERIVADOS'
            WHEN 'PARIDADES' THEN 'DERIVADOS'
            ELSE 'AJUSTE'
        END;

        -- ═══════════════════════════════════════════════════════════════════
        -- PASO 2: Calcular campos derivados
        -- ═══════════════════════════════════════════════════════════════════

        SET @PK2 = CAST(@ID_Instrumento AS VARCHAR(10)) + '-' + CAST(@id_CURR AS VARCHAR(10));
        SET @BalanceSheet = CASE WHEN @Diferencia >= 0 THEN 'Asset' ELSE 'Liability' END;

        -- ═══════════════════════════════════════════════════════════════════
        -- PASO 3: Insertar en tabla temporal de ajustes
        -- ═══════════════════════════════════════════════════════════════════

        SET @SQL = N'
        INSERT INTO ' + @TempTableAjustes + ' (
            ID_Ejecucion, ID_Proceso, ID_Fund, PK2, ID_Instrumento, id_CURR,
            FechaReporte, FechaCartera, BalanceSheet, Source, TipoAjuste,
            LocalPrice, Qty, OriginalFace, Factor, AI,
            MVBook, TotalMVal, TotalMVal_Balance, FechaProceso
        )
        VALUES (
            @ID_Ejecucion, @ID_Proceso, @ID_Fund, @PK2, @ID_Instrumento, @id_CURR,
            @FechaReporte, @FechaReporte, @BalanceSheet, @Source, @TipoAjuste,
            0, 0, NULL, NULL, 0,
            @Diferencia, @Diferencia, @Diferencia, GETDATE()
        )';

        EXEC sp_executesql @SQL,
            N'@ID_Ejecucion BIGINT, @ID_Proceso BIGINT, @ID_Fund INT, @PK2 NVARCHAR(50),
              @ID_Instrumento INT, @id_CURR INT, @FechaReporte NVARCHAR(10),
              @BalanceSheet NVARCHAR(20), @Source NVARCHAR(50), @TipoAjuste NVARCHAR(50),
              @Diferencia DECIMAL(18,4)',
            @ID_Ejecucion, @ID_Proceso, @ID_Fund, @PK2,
            @ID_Instrumento, @id_CURR, @FechaReporte,
            @BalanceSheet, @Source, @TipoAjuste,
            @Diferencia;

        -- ═══════════════════════════════════════════════════════════════════
        -- PASO 4: Registrar en tabla física de log (auditoría)
        -- ═══════════════════════════════════════════════════════════════════

        INSERT INTO staging.Log_Ajustes (
            ID_Ejecucion, ID_Proceso, ID_Fund, FechaReporte, TipoAjuste,
            PK2, ID_Instrumento, id_CURR, BalanceSheet, Source,
            MVBook, TotalMVal, TotalMVal_Balance,
            ValorOriginal, ValorComparado, Diferencia, UmbralAplicado,
            FechaProceso
        )
        VALUES (
            @ID_Ejecucion, @ID_Proceso, @ID_Fund, @FechaReporte, @TipoAjuste,
            @PK2, @ID_Instrumento, @id_CURR, @BalanceSheet, @Source,
            @Diferencia, @Diferencia, @Diferencia,
            @ValorOriginal, @ValorComparado, @Diferencia, @UmbralAplicado,
            GETDATE()
        );

        SET @AjusteCreado = 1;

        PRINT 'sp_CreateAdjustment: Ajuste ' + @TipoAjuste + ' creado. Diferencia: ' + CAST(@Diferencia AS NVARCHAR(20));

        RETURN 0;

    END TRY
    BEGIN CATCH
        PRINT 'sp_CreateAdjustment ERROR: ' + ERROR_MESSAGE();

        IF ERROR_NUMBER() IN (1205, -2, 1222)
            RETURN 2;  -- RETRY

        RETURN 3;  -- ERROR_CRITICO
    END CATCH
END;
GO

/*
================================================================================
FUNCIÓN: staging.fn_GetUmbral
Descripción: Obtiene el umbral configurado para un fondo y fuente de ajuste.
             Si no hay umbral específico para el fondo, usa el global (ID_Fund = NULL).
================================================================================
*/

CREATE OR ALTER FUNCTION [staging].[fn_GetUmbral](
    @ID_Fund INT,
    @Fuente NVARCHAR(50)
)
RETURNS DECIMAL(18,4)
AS
BEGIN
    DECLARE @Umbral DECIMAL(18,4);

    -- Buscar umbral específico para el fondo
    SELECT TOP 1 @Umbral = Umbral
    FROM config.Umbrales_Ajuste
    WHERE ID_Fund = @ID_Fund
      AND Fuente = @Fuente
      AND Activo = 1
      AND FechaVigencia <= GETDATE()
    ORDER BY FechaVigencia DESC;

    -- Si no hay específico, buscar global
    IF @Umbral IS NULL
    BEGIN
        SELECT TOP 1 @Umbral = Umbral
        FROM config.Umbrales_Ajuste
        WHERE ID_Fund IS NULL
          AND Fuente = @Fuente
          AND Activo = 1
          AND FechaVigencia <= GETDATE()
        ORDER BY FechaVigencia DESC;
    END

    -- Default si no hay ninguno
    IF @Umbral IS NULL
        SET @Umbral = 1.0;

    RETURN @Umbral;
END;
GO
