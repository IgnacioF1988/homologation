-- ============================================
-- Script: Hacer @Ticker OPCIONAL en PNL_02_Ajuste_v2
-- Propósito: Solo 2 fondos (SMULEF, MSCLUX) usan Ticker para validar día hábil
--            El resto (41 fondos) no necesitan Ticker y asumirán día hábil
-- Fecha: 2025-12-22
-- Autor: Claude Code
-- ============================================

USE Inteligencia_Producto_Dev;
GO

PRINT '========================================';
PRINT 'Haciendo @Ticker OPCIONAL en PNL_02_Ajuste_v2';
PRINT '========================================';
PRINT '';

-- ============================================
-- Modificar PNL_02_Ajuste_v2
-- ============================================
PRINT 'Modificando staging.PNL_02_Ajuste_v2...';
GO

ALTER PROCEDURE [staging].[PNL_02_Ajuste_v2]
    @ID_Ejecucion BIGINT,
    @FechaReporte NVARCHAR(10),
    @ID_Fund INT,
    @Portfolio_PNL NVARCHAR(50),
    @Ticker NVARCHAR(50) = NULL,  -- OPCIONAL: solo para fondos en config.UBS_CONFIG_PORTFOLIOS
    @DebugMode BIT = 0,
    @RowsProcessed INT OUTPUT,
    @ErrorCount INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @StartTime DATETIME = GETDATE();
    DECLARE @EsDiaHabil BIT;
    DECLARE @TotalAcumulado FLOAT = 0;
    DECLARE @TotalTransferido FLOAT = 0;
    DECLARE @TotalDestinoAntes FLOAT = 0;
    DECLARE @TotalDestinoDespues FLOAT = 0;
    DECLARE @DiferenciaValidacion FLOAT = 0;
    DECLARE @RegistrosInsertados INT = 0;
    DECLARE @ProcName NVARCHAR(100) = 'PNL_02_v2';

    -- Inicializar OUTPUT params
    SET @RowsProcessed = 0;
    SET @ErrorCount = 0;

    BEGIN TRY
        -- Validar parámetros
        IF @ID_Ejecucion IS NULL OR @ID_Ejecucion <= 0
        BEGIN
            SET @ErrorCount = 1;
            RAISERROR('ID_Ejecucion inválido', 16, 1);
            RETURN 3; -- CRITICAL
        END

        IF @ID_Fund IS NULL OR @ID_Fund <= 0
        BEGIN
            SET @ErrorCount = 1;
            RAISERROR('ID_Fund inválido', 16, 1);
            RETURN 3; -- CRITICAL
        END

        IF @Portfolio_PNL IS NULL OR LEN(@Portfolio_PNL) = 0
        BEGIN
            SET @ErrorCount = 1;
            RAISERROR('Portfolio_PNL es requerido', 16, 1);
            RETURN 3; -- CRITICAL
        END

        -- Verificar si es día hábil
        -- Si @Ticker es NULL, asumir día hábil (mayoría de fondos no tienen Ticker)
        -- Si @Ticker existe, verificar en TBL_RENTABILIDADES_DW
        SET @EsDiaHabil = CASE
            WHEN @Ticker IS NULL THEN 1  -- Asume día hábil si no hay Ticker
            WHEN EXISTS(
                SELECT 1 FROM [DW_MONEDA].[dbo].[TBL_RENTABILIDADES_DW]
                WHERE daydate = @FechaReporte
                AND instrumentcode = @Ticker COLLATE SQL_Latin1_General_CP1_CS_AS
                AND ABS(dailyreturn) > 0
            ) THEN 1
            ELSE 0
        END;

        IF @DebugMode = 1
            PRINT @ProcName + ': Portfolio ' + @Portfolio_PNL + ' - Día ' +
                  CASE WHEN @EsDiaHabil = 1 THEN 'HÁBIL' ELSE 'NO HÁBIL' END;

        IF @EsDiaHabil = 0
        BEGIN
            -- =============================================
            -- DÍA NO HÁBIL: Acumular valores
            -- =============================================
            INSERT INTO [staging].[PNL_ValoresAcumulados]
            (ID_Ejecucion, ID_Fund, Portfolio, FechaOrigen, FechaCartera, Group1, Symb, PRgain, PUgain, FxRgain,
             FxUgain, Income, TotGL, PctGL, BasisPoint, Source, ID_Instrumento,
             id_CURR, PK2, LocalCurrency, Estado)
            SELECT
                ID_Ejecucion,
                ID_Fund,
                Portfolio,
                @FechaReporte,
                FechaCartera,
                Group1,
                Symb,
                PRgain,
                PUgain,
                FxRgain,
                FxUgain,
                Income,
                TotGL,
                PctGL,
                BasisPoint,
                Source,
                ID_Instrumento,
                id_CURR,
                PK2,
                LocalCurrency,
                'PENDIENTE'
            FROM [staging].[PNL_WorkTable]
            WHERE ID_Ejecucion = @ID_Ejecucion
              AND ID_Fund = @ID_Fund
              AND Portfolio = @Portfolio_PNL
              AND FechaReporte = @FechaReporte
              AND ISNULL(TotGL, 0) <> 0;

            SET @RegistrosInsertados = @@ROWCOUNT;

            SELECT @TotalAcumulado = ISNULL(SUM(TotGL), 0)
            FROM [staging].[PNL_ValoresAcumulados]
            WHERE ID_Ejecucion = @ID_Ejecucion
              AND ID_Fund = @ID_Fund
              AND Portfolio = @Portfolio_PNL
              AND FechaOrigen = @FechaReporte
              AND Estado = 'PENDIENTE';

            -- Poner valores a cero en WorkTable
            UPDATE [staging].[PNL_WorkTable]
            SET PRgain = 0, PUgain = 0, FxRgain = 0, FxUgain = 0,
                Income = 0, TotGL = 0, PctGL = 0, BasisPoint = 0
            WHERE ID_Ejecucion = @ID_Ejecucion
              AND ID_Fund = @ID_Fund
              AND Portfolio = @Portfolio_PNL
              AND FechaReporte = @FechaReporte;

            SET @RowsProcessed = @@ROWCOUNT;

            IF @DebugMode = 1
                PRINT '  Acumulado: ' + FORMAT(@TotalAcumulado, 'N2') + ' (' +
                      CAST(@RegistrosInsertados AS VARCHAR(10)) + ' registros)';
        END
        ELSE
        BEGIN
            -- =============================================
            -- DÍA HÁBIL: Transferir valores pendientes
            -- =============================================

            -- Capturar total pendiente ANTES de transferir
            SELECT @TotalTransferido = ISNULL(SUM(TotGL), 0)
            FROM [staging].[PNL_ValoresAcumulados]
            WHERE ID_Ejecucion = @ID_Ejecucion
              AND ID_Fund = @ID_Fund
              AND Portfolio = @Portfolio_PNL
              AND Estado = 'PENDIENTE'
              AND FechaOrigen < @FechaReporte;

            -- Capturar total en destino ANTES
            SELECT @TotalDestinoAntes = ISNULL(SUM(TotGL), 0)
            FROM [staging].[PNL_WorkTable]
            WHERE ID_Ejecucion = @ID_Ejecucion
              AND ID_Fund = @ID_Fund
              AND Portfolio = @Portfolio_PNL
              AND FechaReporte = @FechaReporte;

            -- Actualizar símbolos existentes en WorkTable
            ;WITH ValoresTransferir AS (
                SELECT
                    Symb,
                    SUM(PRgain) AS PRgain, SUM(PUgain) AS PUgain,
                    SUM(FxRgain) AS FxRgain, SUM(FxUgain) AS FxUgain,
                    SUM(Income) AS Income, SUM(TotGL) AS TotGL,
                    SUM(PctGL) AS PctGL, SUM(BasisPoint) AS BasisPoint
                FROM [staging].[PNL_ValoresAcumulados]
                WHERE ID_Ejecucion = @ID_Ejecucion
                  AND ID_Fund = @ID_Fund
                  AND Portfolio = @Portfolio_PNL
                  AND Estado = 'PENDIENTE'
                  AND FechaOrigen < @FechaReporte
                GROUP BY Symb
            )
            UPDATE p
            SET
                p.PRgain = p.PRgain + ISNULL(v.PRgain, 0),
                p.PUgain = p.PUgain + ISNULL(v.PUgain, 0),
                p.FxRgain = p.FxRgain + ISNULL(v.FxRgain, 0),
                p.FxUgain = p.FxUgain + ISNULL(v.FxUgain, 0),
                p.Income = p.Income + ISNULL(v.Income, 0),
                p.TotGL = p.TotGL + ISNULL(v.TotGL, 0),
                p.PctGL = p.PctGL + ISNULL(v.PctGL, 0),
                p.BasisPoint = p.BasisPoint + ISNULL(v.BasisPoint, 0)
            FROM [staging].[PNL_WorkTable] p
            INNER JOIN ValoresTransferir v ON p.Symb = v.Symb
            WHERE p.ID_Ejecucion = @ID_Ejecucion
              AND p.ID_Fund = @ID_Fund
              AND p.Portfolio = @Portfolio_PNL
              AND p.FechaReporte = @FechaReporte;

            -- Insertar símbolos que no existen en WorkTable
            ;WITH ValoresNuevos AS (
                SELECT
                    Portfolio,
                    Symb,
                    MAX(Group1) AS Group1,
                    MAX(Source) AS Source,
                    MAX(ID_Instrumento) AS ID_Instrumento,
                    MAX(id_CURR) AS id_CURR,
                    MAX(PK2) AS PK2,
                    MAX(LocalCurrency) AS LocalCurrency,
                    SUM(PRgain) AS PRgain, SUM(PUgain) AS PUgain,
                    SUM(FxRgain) AS FxRgain, SUM(FxUgain) AS FxUgain,
                    SUM(Income) AS Income, SUM(TotGL) AS TotGL,
                    SUM(PctGL) AS PctGL, SUM(BasisPoint) AS BasisPoint
                FROM [staging].[PNL_ValoresAcumulados]
                WHERE ID_Ejecucion = @ID_Ejecucion
                  AND ID_Fund = @ID_Fund
                  AND Portfolio = @Portfolio_PNL
                  AND Estado = 'PENDIENTE'
                  AND FechaOrigen < @FechaReporte
                GROUP BY Portfolio, Symb
            )
            INSERT INTO [staging].[PNL_WorkTable]
            (ID_Ejecucion, ID_Fund, Portfolio, FechaReporte, FechaCartera, Group1, Symb, PRgain, PUgain, FxRgain,
             FxUgain, Income, TotGL, PctGL, BasisPoint, Source, ID_Instrumento,
             id_CURR, PK2, LocalCurrency)
            SELECT
                @ID_Ejecucion,
                @ID_Fund,
                v.Portfolio,
                @FechaReporte,
                @FechaReporte,
                v.Group1,
                v.Symb,
                v.PRgain, v.PUgain, v.FxRgain, v.FxUgain,
                v.Income, v.TotGL, v.PctGL, v.BasisPoint,
                v.Source, v.ID_Instrumento,
                v.id_CURR, v.PK2, v.LocalCurrency
            FROM ValoresNuevos v
            WHERE NOT EXISTS (
                SELECT 1 FROM [staging].[PNL_WorkTable] p
                WHERE p.ID_Ejecucion = @ID_Ejecucion
                  AND p.ID_Fund = @ID_Fund
                  AND p.Portfolio = v.Portfolio
                  AND p.Symb = v.Symb
                  AND p.FechaReporte = @FechaReporte
            );

            SET @RegistrosInsertados = @@ROWCOUNT;

            -- Marcar como transferido
            UPDATE [staging].[PNL_ValoresAcumulados]
            SET Estado = 'TRANSFERIDO',
                FechaDestino = @FechaReporte,
                FechaTransferencia = GETDATE()
            WHERE ID_Ejecucion = @ID_Ejecucion
              AND ID_Fund = @ID_Fund
              AND Portfolio = @Portfolio_PNL
              AND Estado = 'PENDIENTE'
              AND FechaOrigen < @FechaReporte;

            -- Capturar total en destino DESPUÉS
            SELECT @TotalDestinoDespues = ISNULL(SUM(TotGL), 0)
            FROM [staging].[PNL_WorkTable]
            WHERE ID_Ejecucion = @ID_Ejecucion
              AND ID_Fund = @ID_Fund
              AND Portfolio = @Portfolio_PNL
              AND FechaReporte = @FechaReporte;

            SET @DiferenciaValidacion = ABS((@TotalDestinoDespues - @TotalDestinoAntes) - @TotalTransferido);

            IF @DebugMode = 1 AND @TotalTransferido <> 0
            BEGIN
                PRINT '  Transferido: ' + FORMAT(@TotalTransferido, 'N2');
                IF @RegistrosInsertados > 0
                    PRINT '  Símbolos nuevos insertados: ' + CAST(@RegistrosInsertados AS VARCHAR(10));
            END

            IF @DiferenciaValidacion > 0.01
            BEGIN
                PRINT @ProcName + ' WARNING: Diferencia en validación: ' + FORMAT(@DiferenciaValidacion, 'N2');
                SET @ErrorCount = 1;
            END

            SET @RowsProcessed = @RegistrosInsertados;
        END

        -- Log de éxito
        DECLARE @Duracion INT = DATEDIFF(SECOND, @StartTime, GETDATE());
        PRINT @ProcName + ' OK: ' + CASE WHEN @EsDiaHabil = 1 THEN 'Transferido' ELSE 'Acumulado' END +
              ' | Duración: ' + CAST(@Duracion AS VARCHAR(10)) + 's';

        RETURN 0; -- OK

    END TRY
    BEGIN CATCH
        SET @ErrorCount = 1;

        DECLARE @ErrorNumber INT = ERROR_NUMBER();
        DECLARE @ErrorMessage NVARCHAR(4000) = ERROR_MESSAGE();
        DECLARE @ErrorLine INT = ERROR_LINE();

        -- Log de error
        PRINT @ProcName + ' ERROR: ' + @ErrorMessage + ' (Línea ' + CAST(@ErrorLine AS VARCHAR(10)) + ')';

        -- Log error para debugging (sin THROW)
        BEGIN TRY
            INSERT INTO logs.SP_Errors (ID_Ejecucion, ID_Fund, SP_Name, ErrorNumber, ErrorMessage, ErrorSeverity, ErrorState, ErrorLine)
            VALUES (@ID_Ejecucion, @ID_Fund, OBJECT_NAME(@@PROCID), ERROR_NUMBER(), ERROR_MESSAGE(), ERROR_SEVERITY(), ERROR_STATE(), ERROR_LINE());
        END TRY
        BEGIN CATCH
            -- Ignorar errores de logging
        END CATCH

        -- Detectar deadlock para retry automático
        IF @ErrorNumber = 1205 -- Deadlock
        BEGIN
            PRINT @ProcName + ': Deadlock detectado - Retry recomendado';
            RETURN 2; -- RETRY
        END

        -- Error timeout
        IF @ErrorNumber IN (-2, 1222) -- Timeout
        BEGIN
            PRINT @ProcName + ': Timeout detectado - Retry recomendado';
            RETURN 2; -- RETRY
        END

        -- Otros errores críticos
        RETURN 3; -- CRITICAL
    END CATCH
END;
GO

PRINT '✓ PNL_02_Ajuste_v2 modificado';
PRINT '';
PRINT '========================================';
PRINT 'Cambios aplicados:';
PRINT '1. ✓ @Ticker ahora es OPCIONAL (default NULL)';
PRINT '2. ✓ Si Ticker es NULL, asume día hábil';
PRINT '3. ✓ Si Ticker existe, verifica en TBL_RENTABILIDADES_DW';
PRINT '4. ✓ Agregado COLLATE para evitar conflictos de collation';
PRINT '5. ✓ Agregado logging a logs.SP_Errors';
PRINT '6. ✓ Removido THROW (mantiene RETURN codes)';
PRINT '';
PRINT 'Uso del SP:';
PRINT '-- Para fondos SIN Ticker (mayoría):';
PRINT 'EXEC staging.PNL_02_Ajuste_v2';
PRINT '  @ID_Ejecucion = 123,';
PRINT '  @FechaReporte = ''2025-12-22'',';
PRINT '  @ID_Fund = 1,';
PRINT '  @Portfolio_PNL = ''MLAT'',';
PRINT '  @RowsProcessed = @Rows OUTPUT,';
PRINT '  @ErrorCount = @Errors OUTPUT;';
PRINT '';
PRINT '-- Para fondos CON Ticker (SMULEF, MSCLUX):';
PRINT 'EXEC staging.PNL_02_Ajuste_v2';
PRINT '  @ID_Ejecucion = 123,';
PRINT '  @FechaReporte = ''2025-12-22'',';
PRINT '  @ID_Fund = 34,';
PRINT '  @Portfolio_PNL = ''SMULEF'',';
PRINT '  @Ticker = ''MONLAEI LX Equity'',';
PRINT '  @RowsProcessed = @Rows OUTPUT,';
PRINT '  @ErrorCount = @Errors OUTPUT;';
PRINT '========================================';
GO
