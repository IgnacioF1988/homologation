USE [MonedaHomologacion]
GO

SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO

-- ============================================================================
-- sandbox.sp_Process_Completed_Queue
-- Scans colaPendientes for completed instruments and creates Bloomberg jobs
-- or archives them based on yield_Source
-- ============================================================================
CREATE OR ALTER PROCEDURE [sandbox].[sp_Process_Completed_Queue]
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @JobsCreated INT = 0;
    DECLARE @BBGInstrumentsQueued INT = 0;
    DECLARE @NonBBGArchived INT = 0;
    DECLARE @NewJobId BIGINT = NULL;

    -- Temp table for BBG instruments (fixed income with yield_Source = 'BBG')
    CREATE TABLE #BBGInstruments (
        id INT,
        pk2 NVARCHAR(50),
        isin NVARCHAR(50)
    );

    -- Temp table for non-BBG instruments
    CREATE TABLE #NonBBGInstruments (
        id INT
    );

    BEGIN TRY
        BEGIN TRANSACTION;

        -- =====================================================================
        -- Identify BBG instruments (fixed income with yield_Source = 'BBG')
        -- Only parse JSON for records that might be fixed income (optimization)
        -- =====================================================================
        INSERT INTO #BBGInstruments (id, pk2, isin)
        SELECT
            cp.id,
            -- pk2 = idInstrumentoOrigen + '-' + moneda (or SubID from datosOrigen if available)
            CAST(cp.idInstrumentoOrigen AS NVARCHAR(50)) + '-' +
                CAST(ISNULL(JSON_VALUE(cp.datosOrigen, '$.SubID'), cp.moneda) AS NVARCHAR(10)) AS pk2,
            JSON_VALUE(cp.datosOrigen, '$.isin') AS isin
        FROM sandbox.colaPendientes cp
        WHERE cp.estado = 'completado'
          AND JSON_VALUE(cp.datosOrigen, '$.yield_Source') = 'BBG'
          AND JSON_VALUE(cp.datosOrigen, '$.isin') IS NOT NULL;

        SET @BBGInstrumentsQueued = @@ROWCOUNT;

        -- =====================================================================
        -- Identify non-BBG instruments (yield_Source != 'BBG' or NULL)
        -- =====================================================================
        INSERT INTO #NonBBGInstruments (id)
        SELECT cp.id
        FROM sandbox.colaPendientes cp
        WHERE cp.estado = 'completado'
          AND cp.id NOT IN (SELECT id FROM #BBGInstruments);

        -- =====================================================================
        -- Create Bloomberg job if there are BBG instruments
        -- =====================================================================
        IF EXISTS (SELECT 1 FROM #BBGInstruments)
        BEGIN
            DECLARE @InstrumentsJSON NVARCHAR(MAX);

            -- Build instruments JSON array for the job
            SELECT @InstrumentsJSON = (
                SELECT pk2, isin
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
            SET @JobsCreated = 1;

            -- Log the job creation
            INSERT INTO logs.BBG_Log (job_id, log_level, message, created_at)
            VALUES (@NewJobId, 'INFO',
                    'Job created by sp_Process_Completed_Queue with ' +
                    CAST(@BBGInstrumentsQueued AS NVARCHAR(10)) + ' instruments',
                    GETDATE());

            -- Mark BBG instruments as en_proceso so they don't get picked up again
            UPDATE cp
            SET estado = 'en_proceso'
            FROM sandbox.colaPendientes cp
            INNER JOIN #BBGInstruments bbg ON cp.id = bbg.id;
        END

        -- =====================================================================
        -- Archive non-BBG instruments directly to historico
        -- Matches actual colaPendientes_historico structure:
        -- id, nombreFuente, fuente, moneda, fechaIngreso, estado, fechaProcesado,
        -- idInstrumentoAsignado, monedaAsignada, tipoCoincidencia, usuarioProceso, fechaArchivado
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
            @NewJobId AS job_id,
            @BBGInstrumentsQueued AS bbg_instruments_queued,
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
    DROP TABLE #NonBBGInstruments;
END
GO
