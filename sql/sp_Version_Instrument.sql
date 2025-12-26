USE [MonedaHomologacion]
GO

SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO

-- ============================================================================
-- sandbox.sp_Version_Instrument
-- Creates a new version of an existing instrument
-- 1. Closes the current record (Valid_To = today - 1)
-- 2. Inserts new version (Valid_From = today, Valid_To = 2050-12-31)
-- ============================================================================
CREATE OR ALTER PROCEDURE [sandbox].[sp_Version_Instrument]
    @idInstrumento INT,
    @moneda INT,
    @datosOrigenJson NVARCHAR(MAX),  -- JSON with new instrument data
    @coco NCHAR(1) = NULL,
    @callable NCHAR(1) = NULL,
    @sinkable NCHAR(1) = NULL,
    @yasYldFlag NVARCHAR(10) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @today DATE = CAST(GETDATE() AS DATE);
    DECLARE @yesterday DATE = DATEADD(DAY, -1, @today);
    DECLARE @endDate DATE = '2050-12-31';

    BEGIN TRY
        BEGIN TRANSACTION;

        -- =====================================================================
        -- Step 1: Close the current version (set Valid_To = yesterday)
        -- =====================================================================
        UPDATE stock.instrumentos
        SET Valid_To = @yesterday,
            fechaModificacion = GETDATE()
        WHERE idInstrumento = @idInstrumento
          AND moneda = @moneda
          AND Valid_To = @endDate;

        IF @@ROWCOUNT = 0
        BEGIN
            -- No current record found, this shouldn't happen
            RAISERROR('No current version found for idInstrumento=%d, moneda=%d', 16, 1, @idInstrumento, @moneda);
        END

        -- =====================================================================
        -- Step 2: Insert new version with updated data
        -- Parse datosOrigen JSON and merge with BBG data
        -- =====================================================================
        INSERT INTO stock.instrumentos (
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
            JSON_VALUE(@datosOrigenJson, '$.subId'),
            JSON_VALUE(@datosOrigenJson, '$.nombreFuente'),
            JSON_VALUE(@datosOrigenJson, '$.fuente'),
            CAST(JSON_VALUE(@datosOrigenJson, '$.investmentTypeCode') AS INT),
            JSON_VALUE(@datosOrigenJson, '$.nameInstrumento'),
            JSON_VALUE(@datosOrigenJson, '$.companyName'),
            CAST(JSON_VALUE(@datosOrigenJson, '$.issuerTypeCode') AS INT),
            JSON_VALUE(@datosOrigenJson, '$.sectorGICS'),
            CAST(JSON_VALUE(@datosOrigenJson, '$.issueTypeCode') AS INT),
            CAST(JSON_VALUE(@datosOrigenJson, '$.sectorChileTypeCode') AS INT),
            JSON_VALUE(@datosOrigenJson, '$.publicDataSource'),
            JSON_VALUE(@datosOrigenJson, '$.isin'),
            JSON_VALUE(@datosOrigenJson, '$.tickerBBG'),
            JSON_VALUE(@datosOrigenJson, '$.sedol'),
            JSON_VALUE(@datosOrigenJson, '$.cusip'),
            JSON_VALUE(@datosOrigenJson, '$.issueCountry'),
            JSON_VALUE(@datosOrigenJson, '$.riskCountry'),
            CAST(JSON_VALUE(@datosOrigenJson, '$.issueCurrency') AS INT),
            CAST(JSON_VALUE(@datosOrigenJson, '$.riskCurrency') AS INT),
            CASE WHEN JSON_VALUE(@datosOrigenJson, '$.emisionNacional') = 'true' THEN 'S'
                 WHEN JSON_VALUE(@datosOrigenJson, '$.emisionNacional') = 'S' THEN 'S'
                 ELSE NULL END,
            CAST(JSON_VALUE(@datosOrigenJson, '$.couponTypeCode') AS INT),
            JSON_VALUE(@datosOrigenJson, '$.yieldType'),
            JSON_VALUE(@datosOrigenJson, '$.yieldSource'),
            CASE WHEN JSON_VALUE(@datosOrigenJson, '$.perpetuidad') = 'true' THEN 'S'
                 WHEN JSON_VALUE(@datosOrigenJson, '$.perpetuidad') = 'S' THEN 'S'
                 ELSE NULL END,
            CASE WHEN JSON_VALUE(@datosOrigenJson, '$.rendimiento') = 'true' THEN 'S'
                 WHEN JSON_VALUE(@datosOrigenJson, '$.rendimiento') = 'S' THEN 'S'
                 ELSE NULL END,
            CAST(JSON_VALUE(@datosOrigenJson, '$.couponFrequency') AS INT),
            -- BBG fields: use parameters (from BBG) or fall back to datosOrigen
            COALESCE(@coco,
                CASE WHEN JSON_VALUE(@datosOrigenJson, '$.coco') = 'true' THEN 'S'
                     WHEN JSON_VALUE(@datosOrigenJson, '$.coco') = 'S' THEN 'S'
                     WHEN JSON_VALUE(@datosOrigenJson, '$.coco') = 'N' THEN 'N'
                     ELSE NULL END),
            COALESCE(@callable,
                CASE WHEN JSON_VALUE(@datosOrigenJson, '$.callable') = 'true' THEN 'S'
                     WHEN JSON_VALUE(@datosOrigenJson, '$.callable') = 'S' THEN 'S'
                     WHEN JSON_VALUE(@datosOrigenJson, '$.callable') = 'N' THEN 'N'
                     ELSE NULL END),
            COALESCE(@sinkable,
                CASE WHEN JSON_VALUE(@datosOrigenJson, '$.sinkable') = 'true' THEN 'S'
                     WHEN JSON_VALUE(@datosOrigenJson, '$.sinkable') = 'S' THEN 'S'
                     WHEN JSON_VALUE(@datosOrigenJson, '$.sinkable') = 'N' THEN 'N'
                     ELSE NULL END),
            COALESCE(@yasYldFlag, JSON_VALUE(@datosOrigenJson, '$.yasYldFlag')),
            CAST(JSON_VALUE(@datosOrigenJson, '$.rankCode') AS INT),
            CAST(JSON_VALUE(@datosOrigenJson, '$.cashTypeCode') AS INT),
            CAST(JSON_VALUE(@datosOrigenJson, '$.bankDebtTypeCode') AS INT),
            CAST(JSON_VALUE(@datosOrigenJson, '$.fundTypeCode') AS INT),
            CASE WHEN JSON_VALUE(@datosOrigenJson, '$.esReestructuracion') = 'true' THEN 'S'
                 WHEN JSON_VALUE(@datosOrigenJson, '$.esReestructuracion') = 'S' THEN 'S'
                 ELSE NULL END,
            CAST(JSON_VALUE(@datosOrigenJson, '$.idPredecesor') AS INT),
            CAST(JSON_VALUE(@datosOrigenJson, '$.monedaPredecesor') AS INT),
            CAST(JSON_VALUE(@datosOrigenJson, '$.tipoContinuador') AS INT),
            CAST(JSON_VALUE(@datosOrigenJson, '$.diaValidez') AS DATE),
            JSON_VALUE(@datosOrigenJson, '$.comentarios'),
            GETDATE(),  -- fechaCreacion for new version
            NULL,       -- fechaModificacion
            JSON_VALUE(@datosOrigenJson, '$.usuarioCreacion'),
            NULL,       -- usuarioModificacion
            @today,     -- Valid_From = today
            @endDate    -- Valid_To = 2050-12-31
        ;

        COMMIT TRANSACTION;

        SELECT 1 AS success, 'New version created' AS message;

    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;

        DECLARE @ErrorMessage NVARCHAR(4000) = ERROR_MESSAGE();
        DECLARE @ErrorSeverity INT = ERROR_SEVERITY();
        DECLARE @ErrorState INT = ERROR_STATE();

        RAISERROR (@ErrorMessage, @ErrorSeverity, @ErrorState);
    END CATCH
END
GO
