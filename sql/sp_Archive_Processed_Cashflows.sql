USE [MonedaHomologacion]
GO

SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO

-- ============================================================================
-- sandbox.sp_Archive_Processed_Cashflows
-- Watches for instruments with imported cashflows and moves them to historico
-- Called periodically by the Node.js background job
-- ============================================================================
CREATE OR ALTER PROCEDURE [sandbox].[sp_Archive_Processed_Cashflows]
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @ArchivedCount INT = 0;

    BEGIN TRY
        BEGIN TRANSACTION;

        -- =====================================================================
        -- Find instruments that have cashflows imported to bbg.Cashflows
        -- and are still in colaPendientes with estado = 'en_proceso'
        -- (sp_Process_Completed_Queue marks them as en_proceso after creating job)
        -- =====================================================================
        -- Build pk2 from colaPendientes to match against bbg.Cashflows
        WITH ProcessedInstruments AS (
            SELECT DISTINCT
                cp.id,
                CAST(cp.idInstrumentoOrigen AS NVARCHAR(50)) + '-' +
                    CAST(ISNULL(JSON_VALUE(cp.datosOrigen, '$.SubID'), cp.moneda) AS NVARCHAR(10)) AS pk2
            FROM sandbox.colaPendientes cp
            WHERE cp.estado = 'en_proceso'
              AND JSON_VALUE(cp.datosOrigen, '$.yield_Source') = 'BBG'
        ),
        MatchedWithCashflows AS (
            SELECT DISTINCT
                pi.id,
                pi.pk2
            FROM ProcessedInstruments pi
            INNER JOIN bbg.Cashflows cf ON pi.pk2 = cf.pk2
            WHERE cf.fetched_at >= DATEADD(DAY, -7, GETDATE())  -- Only check recent imports
        )
        -- Archive matched instruments
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
            'completado',  -- Archive as completado (the final state)
            cp.fechaProcesado,
            cp.id,
            cp.moneda,
            'EXACT',
            'SYSTEM',
            GETDATE()
        FROM sandbox.colaPendientes cp
        INNER JOIN MatchedWithCashflows mwc ON cp.id = mwc.id;

        SET @ArchivedCount = @@ROWCOUNT;

        -- Delete archived records from colaPendientes
        IF @ArchivedCount > 0
        BEGIN
            DELETE cp
            FROM sandbox.colaPendientes cp
            WHERE cp.id IN (
                SELECT DISTINCT pi.id
                FROM (
                    SELECT
                        cp2.id,
                        CAST(cp2.idInstrumentoOrigen AS NVARCHAR(50)) + '-' +
                            CAST(ISNULL(JSON_VALUE(cp2.datosOrigen, '$.SubID'), cp2.moneda) AS NVARCHAR(10)) AS pk2
                    FROM sandbox.colaPendientes cp2
                    WHERE cp2.estado = 'en_proceso'
                      AND JSON_VALUE(cp2.datosOrigen, '$.yield_Source') = 'BBG'
                ) pi
                INNER JOIN bbg.Cashflows cf ON pi.pk2 = cf.pk2
                WHERE cf.fetched_at >= DATEADD(DAY, -7, GETDATE())
            );

            -- Log the archival
            INSERT INTO logs.BBG_Log (log_level, message, created_at)
            VALUES ('INFO',
                    'sp_Archive_Processed_Cashflows archived ' +
                    CAST(@ArchivedCount AS NVARCHAR(10)) + ' instruments',
                    GETDATE());
        END

        COMMIT TRANSACTION;

        -- Return count of archived instruments
        SELECT @ArchivedCount AS instruments_archived;

    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;

        DECLARE @ErrorMessage NVARCHAR(4000) = ERROR_MESSAGE();

        -- Log the error
        BEGIN TRY
            INSERT INTO logs.BBG_Log (log_level, message, details, created_at)
            VALUES ('ERROR', 'sp_Archive_Processed_Cashflows failed', @ErrorMessage, GETDATE());
        END TRY
        BEGIN CATCH
            -- Ignore logging errors
        END CATCH

        -- Return 0 on error (don't raise - this runs in background)
        SELECT 0 AS instruments_archived;
    END CATCH
END
GO
