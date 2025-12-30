USE [MonedaHomologacion]
GO

SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO

-- ============================================================================
-- sandbox.sp_Queue_BBG_Equity_From_Stock
--
-- Scans stock.instrumentos for Equity instruments with publicDataSource='BBG'
-- and checks if they need market cap data fetched from Bloomberg.
--
-- This SP handles MODIFICATIONS only (pk2 stays intact).
-- New instruments go through colaPendientes and are handled by
-- sp_Process_Completed_Queue.
--
-- Creates a BBG job when:
--   1. No data in metrics.EquityMktCaps for this pk2
--
-- pk2 format: idInstrumento-subId (e.g., '12345-1')
-- ============================================================================
CREATE OR ALTER PROCEDURE [sandbox].[sp_Queue_BBG_Equity_From_Stock]
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @JobsCreated INT = 0;
    DECLARE @InstrumentsQueued INT = 0;
    DECLARE @NewJobId BIGINT = NULL;

    -- Temp table for instruments that need BBG processing
    CREATE TABLE #EquityToProcess (
        idInstrumento INT,
        subId INT,
        pk2 NVARCHAR(50),
        tickerBBG NVARCHAR(100),
        fechaCreacion DATE,
        reason NVARCHAR(100)
    );

    BEGIN TRY
        -- =====================================================================
        -- Find BBG Equity instruments that need market cap data
        -- stock.instrumentos is in Inteligencia_Producto_Dev database
        -- metrics.EquityMktCaps is in MonedaHomologacion database (current)
        -- =====================================================================

        -- Use explicit collation (SQL_Latin1_General_CP1_CI_AS) for cross-database comparisons
        INSERT INTO #EquityToProcess (idInstrumento, subId, pk2, tickerBBG, fechaCreacion, reason)
        SELECT
            i.idInstrumento,
            i.subId,
            CAST(i.idInstrumento AS NVARCHAR(20)) + N'-' + CAST(ISNULL(i.subId, i.moneda) AS NVARCHAR(20)) AS pk2,
            i.tickerBBG COLLATE SQL_Latin1_General_CP1_CI_AS,
            CAST(i.fechaCreacion AS DATE) AS fechaCreacion,
            N'NO_MKTCAP_DATA' AS reason
        FROM Inteligencia_Producto_Dev.stock.instrumentos i
        -- LEFT JOIN to check if we have any market cap data for this pk2
        LEFT JOIN (
            SELECT DISTINCT pk2 COLLATE SQL_Latin1_General_CP1_CI_AS AS pk2
            FROM metrics.EquityMktCaps
        ) em ON em.pk2 = (CAST(i.idInstrumento AS NVARCHAR(20)) + N'-' + CAST(ISNULL(i.subId, i.moneda) AS NVARCHAR(20))) COLLATE SQL_Latin1_General_CP1_CI_AS
        WHERE
            -- Only current versions
            i.Valid_To = '2050-12-31'
            -- Only Equity (investmentTypeCode = 2 or 'EQ' or 'Equity')
            AND (
                CAST(i.investmentTypeCode AS NVARCHAR(20)) COLLATE SQL_Latin1_General_CP1_CI_AS IN (N'2', N'EQ', N'Equity')
            )
            -- Only BBG public data source
            AND (
                CAST(i.publicDataSource AS NVARCHAR(20)) COLLATE SQL_Latin1_General_CP1_CI_AS IN (N'3', N'BBG', N'Bloomberg')
            )
            -- Must have tickerBBG for Bloomberg lookup
            AND i.tickerBBG IS NOT NULL
            AND LEN(LTRIM(RTRIM(i.tickerBBG))) > 0
            -- Must have fechaCreacion for date range
            AND i.fechaCreacion IS NOT NULL
            -- Needs market cap data (no data in metrics.EquityMktCaps)
            AND em.pk2 IS NULL;

        SET @InstrumentsQueued = @@ROWCOUNT;

        -- =====================================================================
        -- If there are instruments to process, create a BBG job
        -- =====================================================================
        IF @InstrumentsQueued > 0
        BEGIN
            BEGIN TRANSACTION;

            DECLARE @InstrumentsJSON NVARCHAR(MAX);

            -- Build instruments JSON array for BBG worker
            -- Format: [{"instrument_type":"EQ","pk2":"12345-1","ticker_bbg":"AAPL US Equity","fecha_ingreso":"2024-06-15"}]
            SELECT @InstrumentsJSON = (
                SELECT
                    'EQ' AS instrument_type,
                    pk2,
                    tickerBBG AS ticker_bbg,
                    CONVERT(NVARCHAR(10), fechaCreacion, 23) AS fecha_ingreso  -- YYYY-MM-DD format
                FROM #EquityToProcess
                FOR JSON PATH
            );

            -- Insert job into rescatar_flujos_bbg
            INSERT INTO sandbox.rescatar_flujos_bbg (
                instruments_json,
                report_date,
                status,
                created_at,
                instruments_total,
                created_by
            )
            VALUES (
                @InstrumentsJSON,
                CAST(GETDATE() AS DATE),
                'PENDING',
                GETDATE(),
                @InstrumentsQueued,
                'sp_Queue_BBG_Equity_From_Stock'
            );

            SET @NewJobId = SCOPE_IDENTITY();
            SET @JobsCreated = 1;

            -- Log the job creation with details
            INSERT INTO logs.BBG_Log (job_id, log_level, message, details, created_at)
            VALUES (
                @NewJobId,
                'INFO',
                'Equity BBG job created by sp_Queue_BBG_Equity_From_Stock with ' + CAST(@InstrumentsQueued AS NVARCHAR(10)) + ' instruments',
                (
                    SELECT
                        pk2,
                        tickerBBG,
                        fechaCreacion,
                        reason
                    FROM #EquityToProcess
                    FOR JSON PATH
                ),
                GETDATE()
            );

            COMMIT TRANSACTION;
        END
        ELSE
        BEGIN
            -- Log that no instruments needed processing
            BEGIN TRY
                INSERT INTO logs.BBG_Log (log_level, message, created_at)
                VALUES ('DEBUG', 'sp_Queue_BBG_Equity_From_Stock: No Equity instruments needing market cap data found', GETDATE());
            END TRY
            BEGIN CATCH
                -- Ignore logging errors
            END CATCH
        END

        -- Return summary
        SELECT
            @JobsCreated AS bbg_jobs_created,
            @NewJobId AS job_id,
            @InstrumentsQueued AS instruments_queued;

    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;

        DECLARE @ErrorMessage NVARCHAR(4000) = ERROR_MESSAGE();
        DECLARE @ErrorSeverity INT = ERROR_SEVERITY();
        DECLARE @ErrorState INT = ERROR_STATE();

        -- Log the error
        BEGIN TRY
            INSERT INTO logs.BBG_Log (log_level, message, details, created_at)
            VALUES ('ERROR', 'sp_Queue_BBG_Equity_From_Stock failed', @ErrorMessage, GETDATE());
        END TRY
        BEGIN CATCH
            -- Ignore logging errors
        END CATCH

        RAISERROR (@ErrorMessage, @ErrorSeverity, @ErrorState);
    END CATCH

    DROP TABLE #EquityToProcess;
END
GO
