USE [MonedaHomologacion]
GO

SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO

-- ============================================================================
-- sandbox.sp_Process_Equity_MktCaps_CSV
--
-- Processes equity_mktcaps.csv file containing historical market cap data
-- fetched from Bloomberg via BDH (CUR_MKT_CAP field).
--
-- Input CSV format (expected columns):
--   pk2, ticker_bbg, trade_date, market_cap_usd, job_id
--
-- Actions:
--   1. BULK INSERT from CSV into staging table
--   2. Insert into metrics.EquityMktCaps
--   3. Update stock.instrumentos.latestMarketCapUSD with most recent value
--   4. Update job status to COMPLETED
--
-- Usage:
--   EXEC sandbox.sp_Process_Equity_MktCaps_CSV @FilePath = 'C:\path\to\equity_mktcaps.csv';
-- ============================================================================
CREATE OR ALTER PROCEDURE [sandbox].[sp_Process_Equity_MktCaps_CSV]
    @FilePath NVARCHAR(500)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @RowsInserted INT = 0;
    DECLARE @JobsCompleted INT = 0;

    -- Staging table for CSV import
    CREATE TABLE #EquityMktCaps_Stage (
        pk2 NVARCHAR(50),
        ticker_bbg NVARCHAR(100),
        trade_date DATE,
        market_cap_usd DECIMAL(20,2),
        job_id BIGINT
    );

    BEGIN TRY
        -- =====================================================================
        -- Step 1: BULK INSERT from CSV
        -- =====================================================================
        DECLARE @BulkInsertSQL NVARCHAR(MAX) = N'
            BULK INSERT #EquityMktCaps_Stage
            FROM ''' + @FilePath + '''
            WITH (
                FIELDTERMINATOR = '','',
                ROWTERMINATOR = ''\n'',
                FIRSTROW = 2,
                TABLOCK
            );';

        EXEC sp_executesql @BulkInsertSQL;

        -- =====================================================================
        -- Step 2: Insert into metrics.EquityMktCaps
        -- =====================================================================
        BEGIN TRANSACTION;

        INSERT INTO metrics.EquityMktCaps (pk2, ticker_bbg, trade_date, market_cap_usd, job_id, fetched_at)
        SELECT
            pk2,
            ticker_bbg,
            trade_date,
            market_cap_usd,
            job_id,
            GETDATE()
        FROM #EquityMktCaps_Stage
        WHERE pk2 IS NOT NULL
          AND trade_date IS NOT NULL;

        SET @RowsInserted = @@ROWCOUNT;

        -- =====================================================================
        -- Step 3: Update job status to COMPLETED
        -- =====================================================================
        UPDATE sandbox.rescatar_flujos_bbg
        SET
            status = 'COMPLETED',
            completed_at = GETDATE(),
            instruments_processed = (
                SELECT COUNT(DISTINCT pk2)
                FROM #EquityMktCaps_Stage s
                WHERE s.job_id = rescatar_flujos_bbg.id
            )
        WHERE id IN (SELECT DISTINCT job_id FROM #EquityMktCaps_Stage)
          AND status IN ('PROCESSING', 'PENDING');

        SET @JobsCompleted = @@ROWCOUNT;

        -- Log success
        INSERT INTO logs.BBG_Log (log_level, message, details, created_at)
        VALUES (
            'INFO',
            'sp_Process_Equity_MktCaps_CSV completed successfully',
            (SELECT
                @RowsInserted AS rows_inserted,
                @JobsCompleted AS jobs_completed
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
            GETDATE()
        );

        COMMIT TRANSACTION;

        -- Return summary
        SELECT
            @RowsInserted AS mktcaps_inserted,
            @JobsCompleted AS jobs_completed;

    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;

        DECLARE @ErrorMessage NVARCHAR(4000) = ERROR_MESSAGE();
        DECLARE @ErrorSeverity INT = ERROR_SEVERITY();
        DECLARE @ErrorState INT = ERROR_STATE();

        -- Log the error
        BEGIN TRY
            INSERT INTO logs.BBG_Log (log_level, message, details, created_at)
            VALUES ('ERROR', 'sp_Process_Equity_MktCaps_CSV failed', @ErrorMessage, GETDATE());
        END TRY
        BEGIN CATCH
            -- Ignore logging errors
        END CATCH

        RAISERROR (@ErrorMessage, @ErrorSeverity, @ErrorState);
    END CATCH

    DROP TABLE #EquityMktCaps_Stage;
END
GO
