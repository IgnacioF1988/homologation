USE [MonedaHomologacion]
GO

SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO

-- ============================================================================
-- sandbox.sp_Queue_BBG_From_Stock_Mismatch
--
-- Scans stock.instrumentos for Fixed Income instruments with yieldSource='BBG'
-- and compares their yasYldFlag/override with existing cashflows in metrics.Cashflows.
--
-- This SP handles MODIFICATIONS only (pk2 stays intact).
-- New instruments and restructures (pk2 changes) go through colaPendientes
-- and are handled by sp_Process_Completed_Queue.
--
-- Creates a BBG job when:
--   1. Cashflows exist but yas_yld_flag doesn't match instrument's yasYldFlag
--   2. Instrument has override='True' but cashflows have override='False' (or NULL)
--
-- This SP should be run periodically (e.g., every 5-10 minutes via SQL Agent)
-- to pick up modified instruments from SearchHelper that need BBG reprocessing.
--
-- pk2 format: idInstrumento-subId (e.g., '30425-1')
-- ============================================================================
CREATE OR ALTER PROCEDURE [sandbox].[sp_Queue_BBG_From_Stock_Mismatch]
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @JobsCreated INT = 0;
    DECLARE @InstrumentsQueued INT = 0;
    DECLARE @NewJobId BIGINT = NULL;

    -- Temp table for instruments that need BBG processing
    CREATE TABLE #InstrumentsToProcess (
        idInstrumento INT,
        subId INT,
        pk2 NVARCHAR(50),
        isin NVARCHAR(50),
        yasYldFlag NVARCHAR(10),
        override NVARCHAR(5),
        mismatch_reason NVARCHAR(100)
    );

    BEGIN TRY
        -- =====================================================================
        -- Find BBG instruments with mismatched or missing cashflows
        -- stock.instrumentos is in Inteligencia_Producto_Dev database
        -- metrics.Cashflows is in MonedaHomologacion database (current)
        -- =====================================================================

        -- Use explicit collation (SQL_Latin1_General_CP1_CI_AS) for cross-database string comparisons
        -- Inteligencia_Producto_Dev uses SQL_Latin1_General_CP1_CS_AS
        -- MonedaHomologacion uses SQL_Latin1_General_CP1_CI_AS

        INSERT INTO #InstrumentsToProcess (idInstrumento, subId, pk2, isin, yasYldFlag, override, mismatch_reason)
        SELECT
            i.idInstrumento,
            i.subId,
            -- Construct pk2: idInstrumento-subId
            CAST(i.idInstrumento AS NVARCHAR(20)) + N'-' + CAST(ISNULL(i.subId, i.moneda) AS NVARCHAR(20)) AS pk2,
            i.isin COLLATE SQL_Latin1_General_CP1_CI_AS,
            i.yasYldFlag COLLATE SQL_Latin1_General_CP1_CI_AS,
            ISNULL(i.override COLLATE SQL_Latin1_General_CP1_CI_AS, N'False') AS override,
            CASE
                WHEN ISNULL(cf.yas_yld_flag, N'') COLLATE SQL_Latin1_General_CP1_CI_AS <> ISNULL(i.yasYldFlag COLLATE SQL_Latin1_General_CP1_CI_AS, N'') THEN N'YAS_YLD_FLAG_MISMATCH'
                WHEN i.override COLLATE SQL_Latin1_General_CP1_CI_AS = N'True' AND ISNULL(cf.override, N'False') COLLATE SQL_Latin1_General_CP1_CI_AS <> N'True' THEN N'OVERRIDE_MISMATCH'
                ELSE N'UNKNOWN'
            END AS mismatch_reason
        FROM Inteligencia_Producto_Dev.stock.instrumentos i
        -- Get the most recent cashflow for each pk2 to compare (INNER JOIN = only if cashflows exist)
        CROSS APPLY (
            SELECT TOP 1 c.pk2, c.yas_yld_flag, c.override
            FROM metrics.Cashflows c
            WHERE c.pk2 COLLATE SQL_Latin1_General_CP1_CI_AS =
                  (CAST(i.idInstrumento AS NVARCHAR(20)) + N'-' + CAST(ISNULL(i.subId, i.moneda) AS NVARCHAR(20))) COLLATE SQL_Latin1_General_CP1_CI_AS
            ORDER BY c.fetched_at DESC
        ) cf
        WHERE
            -- Only current versions
            i.Valid_To = '2050-12-31'
            -- Only BBG yield source
            AND i.yieldSource COLLATE SQL_Latin1_General_CP1_CI_AS = N'BBG'
            -- Must have ISIN for BBG lookup
            AND i.isin IS NOT NULL
            AND LEN(LTRIM(RTRIM(i.isin))) > 0
            -- Mismatch conditions (cashflows exist but don't match):
            AND (
                -- Case 1: yas_yld_flag doesn't match
                ISNULL(cf.yas_yld_flag, N'') COLLATE SQL_Latin1_General_CP1_CI_AS <> ISNULL(i.yasYldFlag COLLATE SQL_Latin1_General_CP1_CI_AS, N'')
                -- Case 2: Instrument wants override but cashflows don't have it
                OR (i.override COLLATE SQL_Latin1_General_CP1_CI_AS = N'True' AND ISNULL(cf.override, N'False') COLLATE SQL_Latin1_General_CP1_CI_AS <> N'True')
            );

        SET @InstrumentsQueued = @@ROWCOUNT;

        -- =====================================================================
        -- If there are instruments to process, create a BBG job
        -- =====================================================================
        IF @InstrumentsQueued > 0
        BEGIN
            BEGIN TRANSACTION;

            DECLARE @InstrumentsJSON NVARCHAR(MAX);

            -- Build instruments JSON array matching the format expected by BBG worker
            -- Format: [{"pk2":"30425-1","isin":"USP40070AB35","override":"True","yas_yld_flag":"15"}]
            SELECT @InstrumentsJSON = (
                SELECT
                    pk2,
                    isin,
                    override,
                    yasYldFlag AS yas_yld_flag
                FROM #InstrumentsToProcess
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
                'sp_Queue_BBG_From_Stock_Mismatch'
            );

            SET @NewJobId = SCOPE_IDENTITY();
            SET @JobsCreated = 1;

            -- Log the job creation with details
            INSERT INTO logs.BBG_Log (job_id, log_level, message, details, created_at)
            VALUES (
                @NewJobId,
                'INFO',
                'Job created by sp_Queue_BBG_From_Stock_Mismatch with ' + CAST(@InstrumentsQueued AS NVARCHAR(10)) + ' instruments',
                (
                    SELECT
                        pk2,
                        isin,
                        yasYldFlag,
                        override,
                        mismatch_reason
                    FROM #InstrumentsToProcess
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
                VALUES ('DEBUG', 'sp_Queue_BBG_From_Stock_Mismatch: No instruments with mismatched cashflows found', GETDATE());
            END TRY
            BEGIN CATCH
                -- Ignore logging errors
            END CATCH
        END

        -- Return summary
        SELECT
            @JobsCreated AS bbg_jobs_created,
            @NewJobId AS job_id,
            @InstrumentsQueued AS instruments_queued,
            (SELECT COUNT(*) FROM #InstrumentsToProcess WHERE mismatch_reason = 'YAS_YLD_FLAG_MISMATCH') AS yas_yld_mismatch_count,
            (SELECT COUNT(*) FROM #InstrumentsToProcess WHERE mismatch_reason = 'OVERRIDE_MISMATCH') AS override_mismatch_count;

    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;

        DECLARE @ErrorMessage NVARCHAR(4000) = ERROR_MESSAGE();
        DECLARE @ErrorSeverity INT = ERROR_SEVERITY();
        DECLARE @ErrorState INT = ERROR_STATE();

        -- Log the error
        BEGIN TRY
            INSERT INTO logs.BBG_Log (log_level, message, details, created_at)
            VALUES ('ERROR', 'sp_Queue_BBG_From_Stock_Mismatch failed', @ErrorMessage, GETDATE());
        END TRY
        BEGIN CATCH
            -- Ignore logging errors
        END CATCH

        RAISERROR (@ErrorMessage, @ErrorSeverity, @ErrorState);
    END CATCH

    DROP TABLE #InstrumentsToProcess;
END
GO

-- ============================================================================
-- Recommended: Create index on metrics.Cashflows for faster pk2 lookups
-- Run this separately to improve SP performance
-- ============================================================================
/*
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('metrics.Cashflows')
    AND name = 'IX_Cashflows_pk2_fetched'
)
BEGIN
    CREATE NONCLUSTERED INDEX IX_Cashflows_pk2_fetched
    ON metrics.Cashflows (pk2, fetched_at DESC)
    INCLUDE (yas_yld_flag, override);
    PRINT 'Created index IX_Cashflows_pk2_fetched on metrics.Cashflows';
END
GO
*/

-- ============================================================================
-- To schedule this SP (SQL Server Agent):
-- Run every 5-10 minutes to pick up modifications from SearchHelper
-- ============================================================================
/*
EXEC sandbox.sp_Queue_BBG_From_Stock_Mismatch;
*/
