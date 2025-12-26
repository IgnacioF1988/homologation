-- =============================================
-- Migration 016: Create SP to tag extraction data with ID_Ejecucion
-- Purpose: Assign ID_Ejecucion to extract.* rows based on Portfolio mapping
-- Phase: 2 - Parametrización de Tablas Extract (Simplified Approach)
-- =============================================

SET NOCOUNT ON;
GO

PRINT 'Starting Migration 016: Creating SP to tag extraction data';
GO

-- =============================================
-- SP: extract.Tag_Extraction_Data
-- Purpose: Update ID_Ejecucion in extract.* tables based on Portfolio→Fund→Ejecucion mapping
-- Called: After batch extraction completes, before parallel fund processing
-- =============================================

IF OBJECT_ID('extract.Tag_Extraction_Data', 'P') IS NOT NULL
    DROP PROCEDURE extract.Tag_Extraction_Data;
GO

CREATE PROCEDURE extract.Tag_Extraction_Data
    @ID_Proceso BIGINT,
    @FechaReporte NVARCHAR(10)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @ErrorMessage NVARCHAR(4000);
    DECLARE @RowsAffected INT = 0;
    DECLARE @TotalRows INT = 0;

    BEGIN TRY
        PRINT '========================================';
        PRINT 'Tagging extraction data with ID_Ejecucion';
        PRINT '  ID_Proceso: ' + CAST(@ID_Proceso AS NVARCHAR(20));
        PRINT '  FechaReporte: ' + @FechaReporte;
        PRINT '========================================';

        -- Create temp table with Portfolio → ID_Ejecucion mapping
        CREATE TABLE #PortfolioMapping (
            Portfolio_Geneva NVARCHAR(50),
            Portfolio_CAPM NVARCHAR(50),
            Portfolio_Derivados NVARCHAR(50),
            Portfolio_UBS NVARCHAR(50),
            ID_Ejecucion BIGINT,
            ID_Fund INT
        );

        -- Populate mapping from current proceso's executions
        INSERT INTO #PortfolioMapping (
            Portfolio_Geneva, Portfolio_CAPM, Portfolio_Derivados, Portfolio_UBS,
            ID_Ejecucion, ID_Fund
        )
        SELECT
            ef.Portfolio_Geneva,
            ef.Portfolio_CAPM,
            ef.Portfolio_Derivados,
            ef.Portfolio_UBS,
            e.ID_Ejecucion,
            e.ID_Fund
        FROM logs.Ejecuciones e
        INNER JOIN logs.Ejecucion_Fondos ef ON e.ID_Ejecucion = ef.ID_Ejecucion
        WHERE e.ID_Proceso = @ID_Proceso;

        PRINT 'Portfolio mapping created: ' + CAST(@@ROWCOUNT AS NVARCHAR(10)) + ' fondos';

        -- ========================================
        -- Tag extract.IPA (uses Portfolio_Geneva)
        -- ========================================
        UPDATE ipa
        SET ipa.ID_Ejecucion = pm.ID_Ejecucion
        FROM extract.IPA ipa
        INNER JOIN #PortfolioMapping pm
            ON ipa.Portfolio = pm.Portfolio_Geneva
        WHERE ipa.FechaReporte = @FechaReporte
          AND ipa.ID_Ejecucion IS NULL;

        SET @RowsAffected = @@ROWCOUNT;
        SET @TotalRows = @TotalRows + @RowsAffected;
        PRINT '  extract.IPA tagged: ' + CAST(@RowsAffected AS NVARCHAR(10)) + ' rows';

        -- ========================================
        -- Tag extract.CAPM (uses Portfolio_CAPM)
        -- ========================================
        UPDATE capm
        SET capm.ID_Ejecucion = pm.ID_Ejecucion
        FROM extract.CAPM capm
        INNER JOIN #PortfolioMapping pm
            ON capm.Portfolio = pm.Portfolio_CAPM
        WHERE capm.FechaReporte = @FechaReporte
          AND capm.ID_Ejecucion IS NULL;

        SET @RowsAffected = @@ROWCOUNT;
        SET @TotalRows = @TotalRows + @RowsAffected;
        PRINT '  extract.CAPM tagged: ' + CAST(@RowsAffected AS NVARCHAR(10)) + ' rows';

        -- ========================================
        -- Tag extract.PosModRF (uses Portfolio_Geneva)
        -- ========================================
        UPDATE pm_table
        SET pm_table.ID_Ejecucion = pm.ID_Ejecucion
        FROM extract.PosModRF pm_table
        INNER JOIN #PortfolioMapping pm
            ON pm_table.Portfolio = pm.Portfolio_Geneva
        WHERE pm_table.FechaReporte = @FechaReporte
          AND pm_table.ID_Ejecucion IS NULL;

        SET @RowsAffected = @@ROWCOUNT;
        SET @TotalRows = @TotalRows + @RowsAffected;
        PRINT '  extract.PosModRF tagged: ' + CAST(@RowsAffected AS NVARCHAR(10)) + ' rows';

        -- ========================================
        -- Tag extract.SONA (uses Portfolio_Geneva)
        -- ========================================
        UPDATE sona
        SET sona.ID_Ejecucion = pm.ID_Ejecucion
        FROM extract.SONA sona
        INNER JOIN #PortfolioMapping pm
            ON sona.Portfolio = pm.Portfolio_Geneva
        WHERE sona.FechaReporte = @FechaReporte
          AND sona.ID_Ejecucion IS NULL;

        SET @RowsAffected = @@ROWCOUNT;
        SET @TotalRows = @TotalRows + @RowsAffected;
        PRINT '  extract.SONA tagged: ' + CAST(@RowsAffected AS NVARCHAR(10)) + ' rows';

        -- ========================================
        -- Tag extract.Derivados (uses Portfolio_Derivados)
        -- ========================================
        UPDATE deriv
        SET deriv.ID_Ejecucion = pm.ID_Ejecucion
        FROM extract.Derivados deriv
        INNER JOIN #PortfolioMapping pm
            ON deriv.Portfolio = pm.Portfolio_Derivados
        WHERE deriv.FechaReporte = @FechaReporte
          AND deriv.ID_Ejecucion IS NULL;

        SET @RowsAffected = @@ROWCOUNT;
        SET @TotalRows = @TotalRows + @RowsAffected;
        PRINT '  extract.Derivados tagged: ' + CAST(@RowsAffected AS NVARCHAR(10)) + ' rows';

        -- ========================================
        -- Tag extract.UBS (uses Portfolio_UBS)
        -- ========================================
        UPDATE ubs
        SET ubs.ID_Ejecucion = pm.ID_Ejecucion
        FROM extract.UBS ubs
        INNER JOIN #PortfolioMapping pm
            ON ubs.Portfolio = pm.Portfolio_UBS
        WHERE ubs.FechaReporte = @FechaReporte
          AND ubs.ID_Ejecucion IS NULL;

        SET @RowsAffected = @@ROWCOUNT;
        SET @TotalRows = @TotalRows + @RowsAffected;
        PRINT '  extract.UBS tagged: ' + CAST(@RowsAffected AS NVARCHAR(10)) + ' rows';

        -- Cleanup
        DROP TABLE #PortfolioMapping;

        PRINT '========================================';
        PRINT 'Tagging completed successfully';
        PRINT '  Total rows tagged: ' + CAST(@TotalRows AS NVARCHAR(10));
        PRINT '========================================';

        RETURN 0;

    END TRY
    BEGIN CATCH
        SET @ErrorMessage = ERROR_MESSAGE();
        PRINT 'ERROR: ' + @ErrorMessage;
        RAISERROR(@ErrorMessage, 16, 1);
        RETURN -1;
    END CATCH
END;
GO

PRINT '✅ Migration 016 completed successfully';
PRINT '';
PRINT 'Created: extract.Tag_Extraction_Data';
PRINT '';
PRINT 'This SP should be called after batch extraction completes,';
PRINT 'before parallel fund processing begins.';
GO
