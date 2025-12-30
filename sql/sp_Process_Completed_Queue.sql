USE [MonedaHomologacion]
GO

SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO

-- ============================================================================
-- sandbox.sp_Process_Completed_Queue
-- Scans colaPendientes for completed instruments and creates Bloomberg jobs
-- or archives them based on yield_Source (Fixed Income) or publicDataSource (Equity)
--
-- Supports:
--   - Fixed Income with yieldSource = 'BBG' -> BDS cashflows
--   - Equity with publicDataSource = 'BBG' -> BDH market caps
-- ============================================================================
CREATE OR ALTER PROCEDURE [sandbox].[sp_Process_Completed_Queue]
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;  -- Ensures automatic rollback on any error

    DECLARE @JobsCreated INT = 0;
    DECLARE @BBGInstrumentsQueued INT = 0;
    DECLARE @EquityBBGQueued INT = 0;
    DECLARE @NonBBGArchived INT = 0;
    DECLARE @NewJobId BIGINT = NULL;
    DECLARE @EquityJobId BIGINT = NULL;

    -- Temp table for BBG Fixed Income instruments (yieldSource = 'BBG')
    CREATE TABLE #BBGInstruments (
        id INT,
        pk2 NVARCHAR(50),
        isin NVARCHAR(50),
        override NVARCHAR(5),      -- 'True' or 'False' from datosOrigen
        yas_yld_flag NVARCHAR(10)  -- yas_yld_flag from datosOrigen (for override)
    );

    -- Temp table for BBG Equity instruments (publicDataSource = 'BBG')
    CREATE TABLE #EquityBBGInstruments (
        id INT,
        pk2 NVARCHAR(50),
        ticker_bbg NVARCHAR(100),
        fecha_ingreso DATE
    );

    -- Temp table for non-BBG instruments
    CREATE TABLE #NonBBGInstruments (
        id INT
    );

    BEGIN TRY
        BEGIN TRANSACTION;

        -- =====================================================================
        -- Identify BBG Fixed Income instruments (yieldSource = 'BBG')
        -- Frontend sets estado = 'esperando_bbg' when saving BBG Fixed Income
        -- Only pick up records that don't have a bbg_job_id yet (prevents duplicates)
        -- =====================================================================
        INSERT INTO #BBGInstruments (id, pk2, isin, override, yas_yld_flag)
        SELECT
            cp.id,
            -- pk2 = idInstrumentoOrigen + '-' + moneda (or subId from datosOrigen if available)
            CAST(cp.idInstrumentoOrigen AS NVARCHAR(50)) + '-' +
                CAST(ISNULL(JSON_VALUE(cp.datosOrigen, '$.subId'), cp.moneda) AS NVARCHAR(10)) AS pk2,
            JSON_VALUE(cp.datosOrigen, '$.isin') AS isin,
            -- Override flag: 'True' means use yasYldFlag from form, don't fetch from BBG
            ISNULL(JSON_VALUE(cp.datosOrigen, '$.override'), 'False') AS override,
            -- yasYldFlag from form (used when override='True')
            JSON_VALUE(cp.datosOrigen, '$.yasYldFlag') AS yas_yld_flag
        FROM sandbox.colaPendientes cp
        WHERE cp.estado = 'esperando_bbg'
          AND JSON_VALUE(cp.datosOrigen, '$.yieldSource') = 'BBG'
          AND JSON_VALUE(cp.datosOrigen, '$.isin') IS NOT NULL
          AND JSON_VALUE(cp.datosOrigen, '$.bbg_job_id') IS NULL;  -- Not yet queued

        SET @BBGInstrumentsQueued = @@ROWCOUNT;

        -- =====================================================================
        -- Identify BBG Equity instruments (publicDataSource = 'BBG')
        -- Equity uses tickerBBG instead of ISIN for Bloomberg lookup
        -- =====================================================================
        INSERT INTO #EquityBBGInstruments (id, pk2, ticker_bbg, fecha_ingreso)
        SELECT
            cp.id,
            -- pk2 = idInstrumentoOrigen + '-' + moneda (or subId from datosOrigen if available)
            CAST(cp.idInstrumentoOrigen AS NVARCHAR(50)) + '-' +
                CAST(ISNULL(JSON_VALUE(cp.datosOrigen, '$.subId'), cp.moneda) AS NVARCHAR(10)) AS pk2,
            JSON_VALUE(cp.datosOrigen, '$.tickerBBG') AS ticker_bbg,
            -- Use fechaIngreso column from colaPendientes, fallback to current date if null
            ISNULL(CAST(cp.fechaIngreso AS DATE), CAST(GETDATE() AS DATE)) AS fecha_ingreso
        FROM sandbox.colaPendientes cp
        WHERE cp.estado = 'esperando_bbg'
          -- Equity investment type (2, EQ, or Equity)
          AND (
              JSON_VALUE(cp.datosOrigen, '$.investmentTypeCode') IN ('2', 'EQ', 'Equity')
              OR TRY_CAST(JSON_VALUE(cp.datosOrigen, '$.investmentTypeCode') AS INT) = 2
          )
          -- BBG public data source (3, BBG, or Bloomberg)
          AND (
              JSON_VALUE(cp.datosOrigen, '$.publicDataSource') IN ('3', 'BBG', 'Bloomberg')
              OR TRY_CAST(JSON_VALUE(cp.datosOrigen, '$.publicDataSource') AS INT) = 3
          )
          AND JSON_VALUE(cp.datosOrigen, '$.tickerBBG') IS NOT NULL
          AND JSON_VALUE(cp.datosOrigen, '$.bbg_job_id') IS NULL;  -- Not yet queued

        SET @EquityBBGQueued = @@ROWCOUNT;

        -- =====================================================================
        -- Identify non-BBG instruments that are completado (ready to archive)
        -- These don't need BBG enrichment, go directly to historico
        -- =====================================================================
        INSERT INTO #NonBBGInstruments (id)
        SELECT cp.id
        FROM sandbox.colaPendientes cp
        WHERE cp.estado = 'completado'
          AND cp.id NOT IN (SELECT id FROM #BBGInstruments)
          AND cp.id NOT IN (SELECT id FROM #EquityBBGInstruments);

        -- =====================================================================
        -- Create Bloomberg job for Fixed Income BBG instruments
        -- =====================================================================
        IF EXISTS (SELECT 1 FROM #BBGInstruments)
        BEGIN
            DECLARE @InstrumentsJSON NVARCHAR(MAX);

            -- Build instruments JSON array for the job
            -- Include instrument_type='FI' for worker to identify
            SELECT @InstrumentsJSON = (
                SELECT
                    'FI' AS instrument_type,
                    pk2,
                    isin,
                    override,
                    yas_yld_flag
                FROM #BBGInstruments
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
                @BBGInstrumentsQueued,
                'sp_Process_Completed_Queue'
            );

            SET @NewJobId = SCOPE_IDENTITY();
            SET @JobsCreated = @JobsCreated + 1;

            -- Log the job creation
            INSERT INTO logs.BBG_Log (job_id, log_level, message, created_at)
            VALUES (@NewJobId, 'INFO',
                    'FI BBG Job created by sp_Process_Completed_Queue with ' +
                    CAST(@BBGInstrumentsQueued AS NVARCHAR(10)) + ' instruments',
                    GETDATE());

            -- Store bbg_job_id in datosOrigen to prevent duplicate job creation
            -- Estado stays as 'esperando_bbg' for UI visibility
            UPDATE cp
            SET datosOrigen = JSON_MODIFY(cp.datosOrigen, '$.bbg_job_id', @NewJobId)
            FROM sandbox.colaPendientes cp
            INNER JOIN #BBGInstruments bbg ON cp.id = bbg.id;
        END

        -- =====================================================================
        -- Create Bloomberg job for Equity BBG instruments
        -- =====================================================================
        IF EXISTS (SELECT 1 FROM #EquityBBGInstruments)
        BEGIN
            DECLARE @EquityJSON NVARCHAR(MAX);

            -- Build instruments JSON array for Equity
            -- Include instrument_type='EQ' and fecha_ingreso for date range calculation
            SELECT @EquityJSON = (
                SELECT
                    'EQ' AS instrument_type,
                    pk2,
                    ticker_bbg,
                    CONVERT(NVARCHAR(10), fecha_ingreso, 23) AS fecha_ingreso  -- YYYY-MM-DD
                FROM #EquityBBGInstruments
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
                @EquityJSON,
                CAST(GETDATE() AS DATE),
                'PENDING',
                GETDATE(),
                @EquityBBGQueued,
                'sp_Process_Completed_Queue'
            );

            SET @EquityJobId = SCOPE_IDENTITY();
            SET @JobsCreated = @JobsCreated + 1;

            -- Log the job creation
            INSERT INTO logs.BBG_Log (job_id, log_level, message, created_at)
            VALUES (@EquityJobId, 'INFO',
                    'EQ BBG Job created by sp_Process_Completed_Queue with ' +
                    CAST(@EquityBBGQueued AS NVARCHAR(10)) + ' instruments',
                    GETDATE());

            -- Store bbg_job_id in datosOrigen
            UPDATE cp
            SET datosOrigen = JSON_MODIFY(cp.datosOrigen, '$.bbg_job_id', @EquityJobId)
            FROM sandbox.colaPendientes cp
            INNER JOIN #EquityBBGInstruments eq ON cp.id = eq.id;
        END

        -- =====================================================================
        -- Archive non-BBG instruments directly to historico
        -- =====================================================================
        IF EXISTS (SELECT 1 FROM #NonBBGInstruments)
        BEGIN
            INSERT INTO sandbox.colaPendientes_historico (
                id,
                nombreFuente,
                fuente,
                moneda,
                fechaIngreso,
                estado,
                fechaProcesado,
                idInstrumentoAsignado,
                monedaAsignada,
                tipoCoincidencia,
                usuarioProceso,
                fechaArchivado
            )
            SELECT
                cp.id,
                cp.nombreFuente,
                cp.fuente,
                cp.moneda,
                cp.fechaIngreso,
                cp.estado,
                cp.fechaProcesado,
                cp.id,
                cp.moneda,
                'EXACT',
                'SYSTEM',
                GETDATE()
            FROM sandbox.colaPendientes cp
            INNER JOIN #NonBBGInstruments nbbg ON cp.id = nbbg.id;

            SET @NonBBGArchived = @@ROWCOUNT;

            -- Delete from colaPendientes
            DELETE cp
            FROM sandbox.colaPendientes cp
            INNER JOIN #NonBBGInstruments nbbg ON cp.id = nbbg.id;
        END

        COMMIT TRANSACTION;

        -- Return summary
        SELECT
            @JobsCreated AS bbg_jobs_created,
            @NewJobId AS fi_job_id,
            @EquityJobId AS eq_job_id,
            @BBGInstrumentsQueued AS fi_bbg_instruments_queued,
            @EquityBBGQueued AS eq_bbg_instruments_queued,
            @NonBBGArchived AS non_bbg_archived;

    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;

        DECLARE @ErrorMessage NVARCHAR(4000) = ERROR_MESSAGE();
        DECLARE @ErrorSeverity INT = ERROR_SEVERITY();
        DECLARE @ErrorState INT = ERROR_STATE();

        -- Log the error
        BEGIN TRY
            INSERT INTO logs.BBG_Log (log_level, message, details, created_at)
            VALUES ('ERROR', 'sp_Process_Completed_Queue failed', @ErrorMessage, GETDATE());
        END TRY
        BEGIN CATCH
            -- Ignore logging errors
        END CATCH

        RAISERROR (@ErrorMessage, @ErrorSeverity, @ErrorState);
    END CATCH

    DROP TABLE #BBGInstruments;
    DROP TABLE #EquityBBGInstruments;
    DROP TABLE #NonBBGInstruments;
END
GO
