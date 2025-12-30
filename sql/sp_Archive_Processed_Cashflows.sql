USE [MonedaHomologacion]
GO

SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO

-- ============================================================================
-- sandbox.sp_Archive_Processed_Cashflows
-- Watches for instruments with imported cashflows and BBG characteristics
-- 1. Inserts to stock.instrumentos (or versions if exists)
-- 2. Inserts to stock.homol_instrumentos
-- 3. Archives to colaPendientes_historico
-- 4. Deletes from colaPendientes
-- Called periodically by the Node.js background job
-- ============================================================================
CREATE OR ALTER PROCEDURE [sandbox].[sp_Archive_Processed_Cashflows]
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;  -- Ensures automatic rollback on any error (including in nested SPs)

    DECLARE @ArchivedCount INT = 0;
    DECLARE @InsertedToStock INT = 0;
    DECLARE @VersionedCount INT = 0;

    BEGIN TRY
        BEGIN TRANSACTION;

        -- =====================================================================
        -- Find instruments that:
        -- 1. Have cashflows imported to metrics.Cashflows
        -- 2. Have BBG characteristics enriched in datosOrigen (coco_bbg, callable_bbg, etc.)
        -- 3. Are still in colaPendientes with estado = 'esperando_bbg'
        -- 4. Are NOT currently being processed (no archive_started_at or it's stale > 1 hour)
        -- =====================================================================

        -- First, mark records we're about to process to prevent concurrent runs
        -- NOTE: coco_bbg, callable_bbg, sinkable_bbg are now OPTIONAL - only yas_yld_flag_bbg required
        UPDATE sandbox.colaPendientes
        SET datosOrigen = JSON_MODIFY(datosOrigen, '$.archive_started_at', CONVERT(NVARCHAR(30), GETDATE(), 126))
        WHERE estado = 'esperando_bbg'
          AND JSON_VALUE(datosOrigen, '$.yieldSource') = 'BBG'
          AND JSON_VALUE(datosOrigen, '$.yas_yld_flag_bbg') IS NOT NULL
          -- Not already being processed (or stale processing > 1 hour)
          AND (JSON_VALUE(datosOrigen, '$.archive_started_at') IS NULL
               OR DATEDIFF(MINUTE, TRY_CAST(JSON_VALUE(datosOrigen, '$.archive_started_at') AS DATETIME), GETDATE()) > 60);

        -- Build pk2 from colaPendientes to match against metrics.Cashflows
        ;WITH ProcessedInstruments AS (
            SELECT DISTINCT
                cp.id,
                cp.idInstrumentoOrigen,
                cp.moneda,
                cp.datosOrigen,
                cp.nombreFuente,
                cp.fuente,
                cp.fechaIngreso,
                cp.fechaProcesado,
                CAST(cp.idInstrumentoOrigen AS NVARCHAR(50)) + '-' +
                    CAST(ISNULL(JSON_VALUE(cp.datosOrigen, '$.subId'), cp.moneda) AS NVARCHAR(10)) AS pk2
            FROM sandbox.colaPendientes cp
            WHERE cp.estado = 'esperando_bbg'
              AND JSON_VALUE(cp.datosOrigen, '$.yieldSource') = 'BBG'
              -- Only yas_yld_flag_bbg is required; coco_bbg, callable_bbg, sinkable_bbg are optional
              AND JSON_VALUE(cp.datosOrigen, '$.yas_yld_flag_bbg') IS NOT NULL
              -- Must have archive_started_at set by us (within last minute)
              AND JSON_VALUE(cp.datosOrigen, '$.archive_started_at') IS NOT NULL
              AND DATEDIFF(MINUTE, TRY_CAST(JSON_VALUE(cp.datosOrigen, '$.archive_started_at') AS DATETIME), GETDATE()) <= 1
        ),
        MatchedWithCashflows AS (
            SELECT DISTINCT
                pi.*
            FROM ProcessedInstruments pi
            INNER JOIN metrics.Cashflows cf ON pi.pk2 = cf.pk2
            WHERE cf.fetched_at >= DATEADD(DAY, -7, GETDATE())  -- Only check recent imports
        )
        -- Store matched records in temp table for processing
        SELECT * INTO #ReadyInstruments FROM MatchedWithCashflows;

        -- =====================================================================
        -- Process each instrument: INSERT or VERSION to stock.instrumentos
        -- =====================================================================
        DECLARE @currentId INT;
        DECLARE @idInstrumento INT;
        DECLARE @moneda INT;
        DECLARE @datosOrigen NVARCHAR(MAX);
        DECLARE @nombreFuente NVARCHAR(255);
        DECLARE @fuente NVARCHAR(50);
        DECLARE @coco NCHAR(1);
        DECLARE @callable NCHAR(1);
        DECLARE @sinkable NCHAR(1);
        DECLARE @yasYldFlag NVARCHAR(10);
        DECLARE @endDate DATE = '2050-12-31';
        DECLARE @today DATE = CAST(GETDATE() AS DATE);

        DECLARE instrument_cursor CURSOR LOCAL FAST_FORWARD FOR
            SELECT id, idInstrumentoOrigen, moneda, datosOrigen, nombreFuente, fuente
            FROM #ReadyInstruments;

        OPEN instrument_cursor;
        FETCH NEXT FROM instrument_cursor INTO @currentId, @idInstrumento, @moneda, @datosOrigen, @nombreFuente, @fuente;

        WHILE @@FETCH_STATUS = 0
        BEGIN
            -- Extract BBG fields
            SET @coco = JSON_VALUE(@datosOrigen, '$.coco_bbg');
            SET @callable = JSON_VALUE(@datosOrigen, '$.callable_bbg');
            SET @sinkable = JSON_VALUE(@datosOrigen, '$.sinkable_bbg');
            SET @yasYldFlag = JSON_VALUE(@datosOrigen, '$.yas_yld_flag_bbg');

            -- Log warning if any optional BBG characteristic is missing
            IF @coco IS NULL OR @callable IS NULL OR @sinkable IS NULL
            BEGIN
                BEGIN TRY
                    INSERT INTO logs.BBG_Log (log_level, message, details, created_at)
                    VALUES ('WARNING',
                            'Instrument archived with missing BBG characteristics',
                            'idInstrumento=' + CAST(@idInstrumento AS NVARCHAR(10)) +
                            ', moneda=' + CAST(@moneda AS NVARCHAR(10)) +
                            ', coco=' + ISNULL(@coco, 'NULL') +
                            ', callable=' + ISNULL(@callable, 'NULL') +
                            ', sinkable=' + ISNULL(@sinkable, 'NULL'),
                            GETDATE());
                END TRY
                BEGIN CATCH
                    -- Ignore logging errors
                END CATCH
            END

            -- Check if instrument already exists in stock.instrumentos (Inteligencia_Producto_Dev)
            IF EXISTS (
                SELECT 1 FROM Inteligencia_Producto_Dev.stock.instrumentos
                WHERE idInstrumento = @idInstrumento
                  AND moneda = @moneda
                  AND Valid_To = @endDate
            )
            BEGIN
                -- VERSION: Close old record and insert new
                EXEC sandbox.sp_Version_Instrument
                    @idInstrumento = @idInstrumento,
                    @moneda = @moneda,
                    @datosOrigenJson = @datosOrigen,
                    @coco = @coco,
                    @callable = @callable,
                    @sinkable = @sinkable,
                    @yasYldFlag = @yasYldFlag;

                SET @VersionedCount = @VersionedCount + 1;
            END
            ELSE
            BEGIN
                -- NEW: Insert directly to stock.instrumentos (Inteligencia_Producto_Dev)
                INSERT INTO Inteligencia_Producto_Dev.stock.instrumentos (
                    idInstrumento, moneda, subId, nombreFuente, fuente,
                    investmentTypeCode, nameInstrumento, companyName, issuerTypeCode,
                    sectorGICS, issueTypeCode, sectorChileTypeCode, publicDataSource,
                    isin, tickerBBG, sedol, cusip,
                    issueCountry, riskCountry, issueCurrency, riskCurrency, emisionNacional,
                    couponTypeCode, yieldType, yieldSource, perpetuidad, rendimiento,
                    couponFrequency, coco, callable, sinkable, yasYldFlag,
                    rankCode, cashTypeCode, bankDebtTypeCode, fundTypeCode,
                    esReestructuracion, idPredecesor, monedaPredecesor, tipoContinuador, diaValidez,
                    comentarios, fechaCreacion, fechaModificacion, usuarioCreacion, usuarioModificacion,
                    Valid_From, Valid_To
                )
                SELECT
                    @idInstrumento,
                    @moneda,
                    JSON_VALUE(@datosOrigen, '$.subId'),
                    @nombreFuente,
                    @fuente,
                    CAST(JSON_VALUE(@datosOrigen, '$.investmentTypeCode') AS INT),
                    JSON_VALUE(@datosOrigen, '$.nameInstrumento'),
                    JSON_VALUE(@datosOrigen, '$.companyName'),
                    CAST(JSON_VALUE(@datosOrigen, '$.issuerTypeCode') AS INT),
                    JSON_VALUE(@datosOrigen, '$.sectorGICS'),
                    CAST(JSON_VALUE(@datosOrigen, '$.issueTypeCode') AS INT),
                    CAST(JSON_VALUE(@datosOrigen, '$.sectorChileTypeCode') AS INT),
                    JSON_VALUE(@datosOrigen, '$.publicDataSource'),
                    JSON_VALUE(@datosOrigen, '$.isin'),
                    JSON_VALUE(@datosOrigen, '$.tickerBBG'),
                    JSON_VALUE(@datosOrigen, '$.sedol'),
                    JSON_VALUE(@datosOrigen, '$.cusip'),
                    JSON_VALUE(@datosOrigen, '$.issueCountry'),
                    JSON_VALUE(@datosOrigen, '$.riskCountry'),
                    CAST(JSON_VALUE(@datosOrigen, '$.issueCurrency') AS INT),
                    CAST(JSON_VALUE(@datosOrigen, '$.riskCurrency') AS INT),
                    CASE WHEN JSON_VALUE(@datosOrigen, '$.emisionNacional') IN ('true', 'S') THEN 'S' ELSE NULL END,
                    CAST(JSON_VALUE(@datosOrigen, '$.couponTypeCode') AS INT),
                    JSON_VALUE(@datosOrigen, '$.yieldType'),
                    JSON_VALUE(@datosOrigen, '$.yieldSource'),
                    CASE WHEN JSON_VALUE(@datosOrigen, '$.perpetuidad') IN ('true', 'S') THEN 'S' ELSE NULL END,
                    CASE WHEN JSON_VALUE(@datosOrigen, '$.rendimiento') IN ('true', 'S') THEN 'S' ELSE NULL END,
                    CAST(JSON_VALUE(@datosOrigen, '$.couponFrequency') AS INT),
                    @coco,
                    @callable,
                    @sinkable,
                    @yasYldFlag,
                    CAST(JSON_VALUE(@datosOrigen, '$.rankCode') AS INT),
                    CAST(JSON_VALUE(@datosOrigen, '$.cashTypeCode') AS INT),
                    CAST(JSON_VALUE(@datosOrigen, '$.bankDebtTypeCode') AS INT),
                    CAST(JSON_VALUE(@datosOrigen, '$.fundTypeCode') AS INT),
                    CASE WHEN JSON_VALUE(@datosOrigen, '$.esReestructuracion') IN ('true', 'S') THEN 'S' ELSE NULL END,
                    CAST(JSON_VALUE(@datosOrigen, '$.idPredecesor') AS INT),
                    CAST(JSON_VALUE(@datosOrigen, '$.monedaPredecesor') AS INT),
                    CAST(JSON_VALUE(@datosOrigen, '$.tipoContinuador') AS INT),
                    CAST(JSON_VALUE(@datosOrigen, '$.diaValidez') AS DATE),
                    JSON_VALUE(@datosOrigen, '$.comentarios'),
                    GETDATE(),
                    NULL,
                    JSON_VALUE(@datosOrigen, '$.usuarioCreacion'),
                    NULL,
                    CAST('1990-01-01' AS DATE),
                    @endDate;

                SET @InsertedToStock = @InsertedToStock + 1;
            END

            -- Insert to homol_instrumentos
            EXEC sandbox.sp_Insert_Homol_Instrumento
                @idInstrumento = @idInstrumento,
                @moneda = @moneda,
                @nombreFuente = @nombreFuente,
                @fuente = @fuente;

            FETCH NEXT FROM instrument_cursor INTO @currentId, @idInstrumento, @moneda, @datosOrigen, @nombreFuente, @fuente;
        END

        CLOSE instrument_cursor;
        DEALLOCATE instrument_cursor;

        -- =====================================================================
        -- Archive to colaPendientes_historico
        -- =====================================================================
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
            ri.id,
            ri.nombreFuente,
            ri.fuente,
            ri.moneda,
            ri.fechaIngreso,
            'completado',
            ri.fechaProcesado,
            ri.idInstrumentoOrigen,
            ri.moneda,
            'EXACT',
            'SYSTEM',
            GETDATE()
        FROM #ReadyInstruments ri;

        SET @ArchivedCount = @@ROWCOUNT;

        -- Delete archived records from colaPendientes
        IF @ArchivedCount > 0
        BEGIN
            DELETE cp
            FROM sandbox.colaPendientes cp
            INNER JOIN #ReadyInstruments ri ON cp.id = ri.id;

            -- Log the archival
            INSERT INTO logs.BBG_Log (log_level, message, created_at)
            VALUES ('INFO',
                    'sp_Archive_Processed_Cashflows: archived=' +
                    CAST(@ArchivedCount AS NVARCHAR(10)) +
                    ', inserted=' + CAST(@InsertedToStock AS NVARCHAR(10)) +
                    ', versioned=' + CAST(@VersionedCount AS NVARCHAR(10)),
                    GETDATE());
        END

        DROP TABLE #ReadyInstruments;

        COMMIT TRANSACTION;

        -- Return counts
        SELECT
            @ArchivedCount AS instruments_archived,
            @InsertedToStock AS instruments_inserted,
            @VersionedCount AS instruments_versioned;

    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;

        IF OBJECT_ID('tempdb..#ReadyInstruments') IS NOT NULL
            DROP TABLE #ReadyInstruments;

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
        SELECT 0 AS instruments_archived, 0 AS instruments_inserted, 0 AS instruments_versioned;
    END CATCH
END
GO
