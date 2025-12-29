USE [MonedaHomologacion]
GO

SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO

-- ============================================================================
-- sandbox.sp_Complete_BBG_Instrument
-- Batch UPDATE of colaPendientes.datosOrigen with BBG characteristics data
-- Receives JSON array from bloomberg.routes.js (parsed from bond_characteristics.csv)
-- Does NOT insert to stock.instrumentos (that's sp_Archive's job)
-- ============================================================================
CREATE OR ALTER PROCEDURE [sandbox].[sp_Complete_BBG_Instrument]
    @bbgDataJson NVARCHAR(MAX)  -- JSON array: [{pk2, coco, callable, sinkable, yas_yld_flag}, ...]
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @UpdatedCount INT = 0;

    BEGIN TRY
        -- =====================================================================
        -- Parse JSON and batch UPDATE colaPendientes.datosOrigen
        -- Match by pk2 (built from idInstrumentoOrigen + subId/moneda)
        -- =====================================================================

        -- Update datosOrigen with BBG fields using JSON_MODIFY
        UPDATE cp
        SET datosOrigen = JSON_MODIFY(
                JSON_MODIFY(
                    JSON_MODIFY(
                        JSON_MODIFY(
                            cp.datosOrigen,
                            '$.coco_bbg', bbg.coco
                        ),
                        '$.callable_bbg', bbg.callable
                    ),
                    '$.sinkable_bbg', bbg.sinkable
                ),
                '$.yas_yld_flag_bbg', bbg.yas_yld_flag
            )
        FROM sandbox.colaPendientes cp
        INNER JOIN OPENJSON(@bbgDataJson)
            WITH (
                pk2 NVARCHAR(50) '$.pk2',
                coco NVARCHAR(1) '$.coco',
                callable NVARCHAR(1) '$.callable',
                sinkable NVARCHAR(1) '$.sinkable',
                yas_yld_flag NVARCHAR(10) '$.yas_yld_flag'
            ) AS bbg
            ON (
                -- Build pk2 from colaPendientes to match
                CAST(cp.idInstrumentoOrigen AS NVARCHAR(50)) + '-' +
                CAST(ISNULL(JSON_VALUE(cp.datosOrigen, '$.subId'), cp.moneda) AS NVARCHAR(10))
            ) = bbg.pk2
        WHERE cp.estado = 'en_proceso'
          AND JSON_VALUE(cp.datosOrigen, '$.yieldSource') = 'BBG';

        SET @UpdatedCount = @@ROWCOUNT;

        -- Log the update
        IF @UpdatedCount > 0
        BEGIN
            INSERT INTO logs.BBG_Log (log_level, message, created_at)
            VALUES ('INFO',
                    'sp_Complete_BBG_Instrument updated ' +
                    CAST(@UpdatedCount AS NVARCHAR(10)) + ' colaPendientes records with BBG data',
                    GETDATE());
        END

        -- Return count of updated records
        SELECT @UpdatedCount AS records_updated;

    END TRY
    BEGIN CATCH
        DECLARE @ErrorMessage NVARCHAR(4000) = ERROR_MESSAGE();

        -- Log the error
        BEGIN TRY
            INSERT INTO logs.BBG_Log (log_level, message, details, created_at)
            VALUES ('ERROR', 'sp_Complete_BBG_Instrument failed', @ErrorMessage, GETDATE());
        END TRY
        BEGIN CATCH
            -- Ignore logging errors
        END CATCH

        -- Re-raise the error
        DECLARE @ErrorSeverity INT = ERROR_SEVERITY();
        DECLARE @ErrorState INT = ERROR_STATE();
        RAISERROR (@ErrorMessage, @ErrorSeverity, @ErrorState);
    END CATCH
END
GO
