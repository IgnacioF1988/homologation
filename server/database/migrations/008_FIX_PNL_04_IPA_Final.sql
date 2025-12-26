-- Migration 008: Fix PNL_04 to use staging.IPA_Final instead of staging.IPA
-- Bug: PNL_04 searches for data in staging.IPA but IPA_07 saves to staging.IPA_Final
-- Result: PNL_04 always fails with "No hay datos en IPA"

-- Drop and recreate PNL_04 with correct table references
IF OBJECT_ID('staging.PNL_04_CrearRegistrosAjusteIPA_v2', 'P') IS NOT NULL
    DROP PROCEDURE staging.PNL_04_CrearRegistrosAjusteIPA_v2;
GO

CREATE PROCEDURE [staging].[PNL_04_CrearRegistrosAjusteIPA_v2]
    @ID_Ejecucion BIGINT,
    @FechaReporte NVARCHAR(10),
    @ID_Fund INT,
    @Portfolio_PNL NVARCHAR(50),
    @DebugMode BIT = 0,
    @RowsProcessed INT OUTPUT,
    @ErrorCount INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @StartTime DATETIME = GETDATE();
    DECLARE @PNLCount INT;
    DECLARE @IPACount INT;
    DECLARE @TotalMValSum FLOAT;
    DECLARE @ProcName NVARCHAR(100) = 'PNL_04_v2';

    SET @RowsProcessed = 0;
    SET @ErrorCount = 0;

    BEGIN TRY
        -- Validaciones sin RAISERROR para evitar uncommittable
        IF @ID_Ejecucion IS NULL OR @ID_Ejecucion <= 0
        BEGIN
            SET @ErrorCount = 1;
            PRINT 'PNL_04_v2 ERROR: ID_Ejecucion inválido';
            RETURN 3;
        END

        IF @ID_Fund IS NULL OR @ID_Fund <= 0
        BEGIN
            SET @ErrorCount = 1;
            PRINT 'PNL_04_v2 ERROR: ID_Fund inválido';
            RETURN 3;
        END

        SELECT @PNLCount = COUNT(*)
        FROM [staging].[PNL]
        WHERE ID_Ejecucion = @ID_Ejecucion
          AND ID_Fund = @ID_Fund
          AND FechaReporte = @FechaReporte;

        IF @PNLCount = 0
        BEGIN
            SET @ErrorCount = 1;

            INSERT INTO sandbox.Fondos_Problema (
                FechaReporte, ID_Fund, Proceso, Tipo_Problema, FechaProceso
            )
            VALUES (
                @FechaReporte,
                @ID_Fund,
                'PNL_04',
                'Sin datos en staging.PNL',
                CONVERT(NVARCHAR, GETDATE(), 120)
            );

            PRINT @ProcName + ': No hay datos en PNL para Portfolio ' + @Portfolio_PNL + ' - Error crítico (código 3)';
            RETURN 3;
        END

        -- ============================================
        -- FIX: Cambiar staging.IPA → staging.IPA_Final
        -- ============================================
        SELECT @IPACount = COUNT(*)
        FROM [staging].[IPA_Final]  -- FIXED: era staging.IPA
        WHERE ID_Ejecucion = @ID_Ejecucion
          AND ID_Fund = @ID_Fund
          AND FechaReporte = @FechaReporte;

        IF @IPACount = 0
        BEGIN
            SET @ErrorCount = 1;

            INSERT INTO sandbox.Fondos_Problema (
                FechaReporte, ID_Fund, Proceso, Tipo_Problema, FechaProceso
            )
            VALUES (
                @FechaReporte,
                @ID_Fund,
                'PNL_04',
                'Sin datos en staging.IPA_Final',  -- FIXED: mensaje actualizado
                CONVERT(NVARCHAR, GETDATE(), 120)
            );

            PRINT @ProcName + ': No hay datos en IPA_Final para Portfolio ' + @Portfolio_PNL + ' - Error crítico (código 3)';
            RETURN 3;
        END

        DELETE FROM [staging].[Ajuste_PNL]
        WHERE ID_Ejecucion = @ID_Ejecucion AND ID_Fund = @ID_Fund;

        CREATE TABLE #InstrumentosPNL (
            ID_Instrumento INT,
            id_CURR INT,
            INDEX IX_PNL_Temp CLUSTERED (ID_Instrumento, id_CURR)
        );

        INSERT INTO #InstrumentosPNL (ID_Instrumento, id_CURR)
        SELECT DISTINCT
            ID_Instrumento,
            id_CURR
        FROM [staging].[PNL]
        WHERE ID_Ejecucion = @ID_Ejecucion
          AND ID_Fund = @ID_Fund
          AND FechaReporte = @FechaReporte
          AND ID_Instrumento IS NOT NULL
          AND id_CURR IS NOT NULL;

        CREATE TABLE #InstrumentosIPA (
            ID_Instrumento INT,
            id_CURR INT,
            INDEX IX_IPA_Temp CLUSTERED (ID_Instrumento, id_CURR)
        );

        -- ============================================
        -- FIX: Cambiar staging.IPA → staging.IPA_Final
        -- ============================================
        INSERT INTO #InstrumentosIPA (ID_Instrumento, id_CURR)
        SELECT DISTINCT
            ID_Instrumento,
            id_CURR
        FROM [staging].[IPA_Final]  -- FIXED: era staging.IPA
        WHERE ID_Ejecucion = @ID_Ejecucion
          AND ID_Fund = @ID_Fund
          AND FechaReporte = @FechaReporte
          AND ID_Instrumento IS NOT NULL
          AND id_CURR IS NOT NULL;

        CREATE TABLE #InstrumentosFaltantesEnIPA (
            ID_Instrumento INT,
            id_CURR INT,
            INDEX IX_Faltantes CLUSTERED (ID_Instrumento, id_CURR)
        );

        INSERT INTO #InstrumentosFaltantesEnIPA (ID_Instrumento, id_CURR)
        SELECT ID_Instrumento, id_CURR
        FROM #InstrumentosPNL
        EXCEPT
        SELECT ID_Instrumento, id_CURR
        FROM #InstrumentosIPA;

        SET @RowsProcessed = @@ROWCOUNT;

        IF @RowsProcessed > 0
        BEGIN
            INSERT INTO [staging].[Ajuste_PNL]
            (
                ID_Ejecucion,
                ID_Fund,
                PK2,
                ID_Instrumento,
                id_CURR,
                FechaReporte,
                FechaCartera,
                BalanceSheet,
                Source,
                LocalPrice,
                Qty,
                OriginalFace,
                Factor,
                AI,
                MVBook,
                TotalMVal,
                TotalMVal_Balance,
                FechaProceso
            )
            SELECT
                @ID_Ejecucion,
                @ID_Fund,
                CAST(f.ID_Instrumento AS NVARCHAR(MAX)) + '-' + CAST(f.id_CURR AS NVARCHAR(MAX)) AS PK2,
                CAST(f.ID_Instrumento AS NVARCHAR(MAX)),
                CAST(f.id_CURR AS NVARCHAR(MAX)),
                @FechaReporte AS FechaReporte,
                @FechaReporte AS FechaCartera,
                NULL AS BalanceSheet,
                'GENEVA' AS Source,
                0 AS LocalPrice,
                0 AS Qty,
                0 AS OriginalFace,
                1 AS Factor,
                0 AS AI,
                0 AS MVBook,
                0 AS TotalMVal,
                0 AS TotalMVal_Balance,
                CONVERT(NVARCHAR(MAX), GETDATE(), 120) AS FechaProceso
            FROM #InstrumentosFaltantesEnIPA f;

            SELECT @TotalMValSum = SUM(TotalMVal)
            FROM [staging].[Ajuste_PNL]
            WHERE ID_Ejecucion = @ID_Ejecucion
              AND ID_Fund = @ID_Fund
              AND FechaReporte = @FechaReporte
              AND Source = 'GENEVA';

            IF ISNULL(@TotalMValSum, 0) <> 0
            BEGIN
                PRINT @ProcName + ' WARNING: La suma de TotalMVal no es 0';
                SET @ErrorCount = 1;
            END
        END

        DROP TABLE IF EXISTS #InstrumentosPNL;
        DROP TABLE IF EXISTS #InstrumentosIPA;
        DROP TABLE IF EXISTS #InstrumentosFaltantesEnIPA;

        DECLARE @Duracion INT = DATEDIFF(SECOND, @StartTime, GETDATE());
        PRINT @ProcName + ' OK: ' + CAST(@RowsProcessed AS VARCHAR(10)) + ' ajustes creados | ' +
              'Duración: ' + CAST(@Duracion AS VARCHAR(10)) + 's';

        RETURN 0;

    END TRY
    BEGIN CATCH
        DROP TABLE IF EXISTS #InstrumentosPNL;
        DROP TABLE IF EXISTS #InstrumentosIPA;
        DROP TABLE IF EXISTS #InstrumentosFaltantesEnIPA;

        SET @ErrorCount = 1;

        DECLARE @ErrorNumber INT = ERROR_NUMBER();
        DECLARE @ErrorMessage NVARCHAR(4000) = ERROR_MESSAGE();
        DECLARE @ErrorLine INT = ERROR_LINE();

        PRINT @ProcName + ' ERROR: ' + @ErrorMessage + ' (Línea ' + CAST(@ErrorLine AS VARCHAR(10)) + ')';

        IF @ErrorNumber = 1205 RETURN 2;
        IF @ErrorNumber IN (-2, 1222) RETURN 2;

        RETURN 3;
    END CATCH
END;
GO

PRINT '✅ Migration 008 completed: PNL_04 now uses staging.IPA_Final';
