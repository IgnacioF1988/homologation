/*
================================================================================
SP: staging.sp_Process_CAPM
Descripción: Procesa datos de CAPM (Cash Appraisal).
             - Carga extract.CAPM → ##CAPM_Work
             - Homologa instrumentos y monedas
             - Valida vs ##IPA_Cash (diferencia dentro de umbral)
             - Si diferencia > umbral → código 7 (DESCUADRES_CAPM)
             - Si diferencia <= umbral → crea ajuste en ##Ajustes

Prerequisito: sp_Process_IPA debe haber completado

Códigos de retorno:
  0  = OK
  1  = WARNING (sin datos CAPM)
  2  = RETRY
  3  = ERROR_CRITICO
  7  = DESCUADRES_CAPM

Autor: Refactorización Pipeline IPA
Fecha: 2026-01-02
================================================================================
*/

CREATE OR ALTER PROCEDURE [staging].[sp_Process_CAPM]
    @ID_Ejecucion BIGINT,
    @ID_Proceso BIGINT,
    @ID_Fund INT,
    @FechaReporte NVARCHAR(10),
    @Portfolio NVARCHAR(100) = NULL,
    -- Outputs
    @RowsProcessed INT OUTPUT,
    @TotalIPA_Cash DECIMAL(18,4) OUTPUT,
    @TotalCAPM DECIMAL(18,4) OUTPUT,
    @Diferencia DECIMAL(18,4) OUTPUT,
    @AjusteCreado BIT OUTPUT,
    @ErrorCount INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    -- Inicializar outputs
    SET @RowsProcessed = 0;
    SET @TotalIPA_Cash = 0;
    SET @TotalCAPM = 0;
    SET @Diferencia = 0;
    SET @AjusteCreado = 0;
    SET @ErrorCount = 0;

    -- Variables locales
    DECLARE @StartTime DATETIME = GETDATE();
    DECLARE @SQL NVARCHAR(MAX);
    DECLARE @ReturnCode INT = 0;
    DECLARE @ErrorMessage NVARCHAR(500);
    DECLARE @Source NVARCHAR(50) = 'CASH APPRAISAL';
    DECLARE @Umbral DECIMAL(18,4);
    DECLARE @id_CURR_Fondo INT;

    -- Nombres de tablas temporales
    DECLARE @Suffix NVARCHAR(100) = CAST(@ID_Ejecucion AS NVARCHAR(20)) + '_' +
                                    CAST(@ID_Proceso AS NVARCHAR(10)) + '_' +
                                    CAST(@ID_Fund AS NVARCHAR(10));
    DECLARE @TempCAPM NVARCHAR(200) = '##CAPM_Work_' + @Suffix;
    DECLARE @TempIPACash NVARCHAR(200) = '##IPA_Cash_' + @Suffix;
    DECLARE @TempAjustes NVARCHAR(200) = '##Ajustes_' + @Suffix;

    -- Variables para homologación
    DECLARE @ProblemasFondo INT, @ProblemasInstrumento INT, @ProblemasMoneda INT;

    BEGIN TRY
        -- ═══════════════════════════════════════════════════════════════════
        -- PASO 0: Validaciones previas
        -- ═══════════════════════════════════════════════════════════════════

        -- Verificar que existe ##IPA_Cash
        SET @SQL = N'IF OBJECT_ID(''tempdb..' + @TempIPACash + ''', ''U'') IS NULL
                     RAISERROR(''Tabla ' + @TempIPACash + ' no existe. Ejecutar sp_Process_IPA primero.'', 16, 1)';
        EXEC sp_executesql @SQL;

        -- Obtener umbral configurado
        SET @Umbral = staging.fn_GetUmbral(@ID_Fund, 'CAPM');

        -- Obtener moneda del fondo
        SELECT @id_CURR_Fondo = id_CURR
        FROM dimensionales.BD_Funds
        WHERE ID_Fund = @ID_Fund;

        -- Obtener Portfolio si no se proporcionó
        IF @Portfolio IS NULL
        BEGIN
            SELECT @Portfolio = Portfolio
            FROM dimensionales.HOMOL_Funds
            WHERE ID_Fund = @ID_Fund AND Source = @Source;
        END

        PRINT 'sp_Process_CAPM: Iniciando para Fondo ' + CAST(@ID_Fund AS NVARCHAR(10)) +
              ' | Umbral: ' + CAST(@Umbral AS NVARCHAR(10));

        -- ═══════════════════════════════════════════════════════════════════
        -- PASO 1: Calcular total de Cash en IPA
        -- ═══════════════════════════════════════════════════════════════════

        SET @SQL = N'SELECT @Total = ISNULL(SUM(ISNULL(MVBook, 0) + ISNULL(AI, 0)), 0)
                     FROM ' + @TempIPACash;
        EXEC sp_executesql @SQL, N'@Total DECIMAL(18,4) OUTPUT', @TotalIPA_Cash OUTPUT;

        PRINT 'sp_Process_CAPM: Total IPA Cash = ' + CAST(@TotalIPA_Cash AS NVARCHAR(20));

        -- ═══════════════════════════════════════════════════════════════════
        -- PASO 2: Crear tabla temporal ##CAPM_Work
        -- ═══════════════════════════════════════════════════════════════════

        SET @SQL = N'
        IF OBJECT_ID(''tempdb..' + @TempCAPM + ''', ''U'') IS NOT NULL
            DROP TABLE ' + @TempCAPM + ';

        CREATE TABLE ' + @TempCAPM + ' (
            RowID INT IDENTITY(1,1) PRIMARY KEY,
            ID_Ejecucion BIGINT NOT NULL,
            ID_Proceso BIGINT NOT NULL,
            ID_Fund INT NULL,
            PK2 NVARCHAR(50) NULL,
            ID_Instrumento INT NULL,
            id_CURR INT NULL,
            FechaReporte NVARCHAR(10) NOT NULL,
            FechaCartera NVARCHAR(10) NULL,
            Portfolio NVARCHAR(100) NOT NULL,
            InvestID NVARCHAR(255) NOT NULL,
            InvestDescription NVARCHAR(500) NULL,
            LocalCurrency NVARCHAR(50) NULL,
            BalanceSheet NVARCHAR(20) NULL,
            Source NVARCHAR(50) NULL,
            LocalPrice DECIMAL(18,6) NULL,
            Qty DECIMAL(18,6) NULL,
            OriginalFace DECIMAL(18,4) NULL,
            Factor DECIMAL(18,6) NULL,
            AI DECIMAL(18,4) NULL,
            MVBook DECIMAL(18,4) NULL,
            TotalMVal DECIMAL(18,4) NULL,
            TotalMVal_Balance DECIMAL(18,4) NULL,
            FechaProceso DATETIME NOT NULL DEFAULT GETDATE()
        );';
        EXEC sp_executesql @SQL;

        -- ═══════════════════════════════════════════════════════════════════
        -- PASO 3: Cargar datos desde extract.CAPM
        -- ═══════════════════════════════════════════════════════════════════

        SET @SQL = N'
        INSERT INTO ' + @TempCAPM + ' (
            ID_Ejecucion, ID_Proceso, FechaReporte, FechaCartera,
            Portfolio, InvestID, InvestDescription, LocalCurrency,
            BalanceSheet, Source, LocalPrice, Qty, AI, MVBook, TotalMVal, TotalMVal_Balance
        )
        SELECT
            @ID_Ejecucion,
            @ID_Proceso,
            capm.FechaReporte,
            capm.FechaReporte AS FechaCartera,
            capm.Portfolio,
            capm.InvestID,
            capm.InvestDescription,
            capm.LocalCurrency,
            CASE WHEN ISNULL(capm.MVBook, 0) >= 0 THEN ''Asset'' ELSE ''Liability'' END,
            ''CASH APPRAISAL'',
            capm.LocalPrice,
            capm.Qty,
            capm.AI,
            capm.MVBook,
            ISNULL(capm.MVBook, 0) + ISNULL(capm.AI, 0) AS TotalMVal,
            ISNULL(capm.MVBook, 0) + ISNULL(capm.AI, 0) AS TotalMVal_Balance
        FROM extract.CAPM capm
        INNER JOIN dimensionales.HOMOL_Funds hf
            ON capm.Portfolio = hf.Portfolio AND hf.Source = ''CASH APPRAISAL''
        WHERE capm.ID_Ejecucion = @ID_Ejecucion
          AND capm.FechaReporte = @FechaReporte
          AND hf.ID_Fund = @ID_Fund';

        EXEC sp_executesql @SQL,
            N'@ID_Ejecucion BIGINT, @ID_Proceso BIGINT, @ID_Fund INT, @FechaReporte NVARCHAR(10)',
            @ID_Ejecucion, @ID_Proceso, @ID_Fund, @FechaReporte;

        SET @RowsProcessed = @@ROWCOUNT;

        IF @RowsProcessed = 0
        BEGIN
            PRINT 'sp_Process_CAPM: Sin datos CAPM para el fondo';
            -- Si no hay CAPM pero hay Cash en IPA, es un warning
            IF @TotalIPA_Cash != 0
                PRINT 'WARNING: Hay Cash en IPA pero no hay datos CAPM';
            RETURN 1;  -- WARNING
        END

        PRINT 'sp_Process_CAPM: ' + CAST(@RowsProcessed AS NVARCHAR(10)) + ' registros CAPM cargados';

        -- ═══════════════════════════════════════════════════════════════════
        -- PASO 4: Homologar instrumentos y monedas
        -- ═══════════════════════════════════════════════════════════════════

        EXEC @ReturnCode = staging.sp_Homologate
            @TempTableName = @TempCAPM,
            @Source = @Source,
            @ID_Ejecucion = @ID_Ejecucion,
            @ID_Proceso = @ID_Proceso,
            @ID_Fund = @ID_Fund,
            @FechaReporte = @FechaReporte,
            @InvestIDColumn = 'InvestID',
            @CurrencyColumn = 'LocalCurrency',
            @PortfolioColumn = 'Portfolio',
            @ProblemasFondo = @ProblemasFondo OUTPUT,
            @ProblemasInstrumento = @ProblemasInstrumento OUTPUT,
            @ProblemasMoneda = @ProblemasMoneda OUTPUT;

        IF @ReturnCode != 0
        BEGIN
            SET @ErrorCount = 1;
            RETURN @ReturnCode;
        END

        -- Actualizar ID_Fund
        SET @SQL = N'UPDATE ' + @TempCAPM + ' SET ID_Fund = @ID_Fund';
        EXEC sp_executesql @SQL, N'@ID_Fund INT', @ID_Fund;

        -- ═══════════════════════════════════════════════════════════════════
        -- PASO 5: Calcular total CAPM y diferencia
        -- ═══════════════════════════════════════════════════════════════════

        SET @SQL = N'SELECT @Total = ISNULL(SUM(TotalMVal), 0) FROM ' + @TempCAPM;
        EXEC sp_executesql @SQL, N'@Total DECIMAL(18,4) OUTPUT', @TotalCAPM OUTPUT;

        SET @Diferencia = @TotalIPA_Cash - @TotalCAPM;

        PRINT 'sp_Process_CAPM: Total CAPM = ' + CAST(@TotalCAPM AS NVARCHAR(20));
        PRINT 'sp_Process_CAPM: Diferencia = ' + CAST(@Diferencia AS NVARCHAR(20));

        -- ═══════════════════════════════════════════════════════════════════
        -- PASO 6: Validar diferencia vs umbral
        -- ═══════════════════════════════════════════════════════════════════

        IF ABS(@Diferencia) > @Umbral
        BEGIN
            -- Diferencia excede umbral → Stand-by
            PRINT 'ERROR: Descuadre CAPM excede umbral (' + CAST(@Umbral AS NVARCHAR(10)) + ')';

            -- Registrar alerta
            INSERT INTO sandbox.Alertas_Descuadre_Cash (
                ID_Ejecucion, ID_Fund, FechaReporte, Portfolio,
                Total_IPA_Cash, Total_CAPM, Diferencia, UmbralAplicado, FechaProceso
            )
            VALUES (
                @ID_Ejecucion, @ID_Fund, @FechaReporte, @Portfolio,
                @TotalIPA_Cash, @TotalCAPM, @Diferencia, @Umbral, GETDATE()
            );

            SET @ErrorCount = 1;
            RETURN 7;  -- DESCUADRES_CAPM
        END

        -- ═══════════════════════════════════════════════════════════════════
        -- PASO 7: Crear ajuste si hay diferencia (dentro del umbral)
        -- ═══════════════════════════════════════════════════════════════════

        IF ABS(@Diferencia) > 0.01  -- Tolerancia mínima
        BEGIN
            EXEC staging.sp_CreateAdjustment
                @ID_Ejecucion = @ID_Ejecucion,
                @ID_Proceso = @ID_Proceso,
                @ID_Fund = @ID_Fund,
                @FechaReporte = @FechaReporte,
                @TipoAjuste = 'CAPM',
                @id_CURR = @id_CURR_Fondo,
                @Diferencia = @Diferencia,
                @ValorOriginal = @TotalIPA_Cash,
                @ValorComparado = @TotalCAPM,
                @UmbralAplicado = @Umbral,
                @TempTableAjustes = @TempAjustes,
                @AjusteCreado = @AjusteCreado OUTPUT;
        END

        -- ═══════════════════════════════════════════════════════════════════
        -- RESUMEN
        -- ═══════════════════════════════════════════════════════════════════

        PRINT '========================================';
        PRINT 'sp_Process_CAPM COMPLETADO';
        PRINT 'Fondo: ' + CAST(@ID_Fund AS NVARCHAR(10));
        PRINT 'Registros CAPM: ' + CAST(@RowsProcessed AS NVARCHAR(10));
        PRINT 'Total IPA Cash: ' + CAST(@TotalIPA_Cash AS NVARCHAR(20));
        PRINT 'Total CAPM: ' + CAST(@TotalCAPM AS NVARCHAR(20));
        PRINT 'Diferencia: ' + CAST(@Diferencia AS NVARCHAR(20));
        PRINT 'Ajuste creado: ' + CASE WHEN @AjusteCreado = 1 THEN 'SI' ELSE 'NO' END;
        PRINT 'Tiempo: ' + CAST(DATEDIFF(MILLISECOND, @StartTime, GETDATE()) AS NVARCHAR(10)) + ' ms';
        PRINT '========================================';

        RETURN 0;  -- OK

    END TRY
    BEGIN CATCH
        SET @ErrorCount = 1;

        EXEC staging.sp_HandleError
            @ProcName = 'sp_Process_CAPM',
            @ID_Ejecucion = @ID_Ejecucion,
            @ID_Proceso = @ID_Proceso,
            @ID_Fund = @ID_Fund,
            @TempTablesToClean = @TempCAPM,
            @ReturnCode = @ReturnCode OUTPUT,
            @ErrorMessage = @ErrorMessage OUTPUT;

        RETURN @ReturnCode;
    END CATCH
END;
GO
