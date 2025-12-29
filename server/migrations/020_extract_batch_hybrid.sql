-- =============================================
-- Migration 020: Convert Extract_* SPs to Batch Hybrid Mode
-- Ejecutar después de reiniciar el backend
-- =============================================

-- =============================================
-- Extract_Derivados_Batch
-- =============================================
CREATE OR ALTER PROCEDURE [extract].[Extract_Derivados_Batch]
    @ID_Proceso BIGINT,
    @FechaReporte NVARCHAR(10)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @RowsInserted INT = 0;
    DECLARE @StartTime DATETIME = GETDATE();

    PRINT 'EXTRACT_DERIVADOS_BATCH - INICIO - Fecha: ' + @FechaReporte;

    BEGIN TRY
        IF @FechaReporte IS NULL OR ISDATE(@FechaReporte) = 0
        BEGIN
            PRINT 'Extract_Derivados_Batch ERROR: Fecha inválida';
            RETURN -1;
        END

        BEGIN TRANSACTION;

        -- Tabla temporal para transformaciones
        DROP TABLE IF EXISTS #TempDerivados;

        SELECT
            @ID_Proceso AS ID_Proceso,
            e.ID_Ejecucion,
            f.ID_Fund,
            d.FechaReporte,
            CASE WHEN d.Portfolio = 'MUCC II' THEN 'MLCC_Geneva' ELSE d.Portfolio END AS Portfolio,
            d.ID_Derivado AS InvestID,
            d.Tipo_Derivado,
            d.Moneda_PLarga, d.Moneda_PCorta,
            d.Notional_Vig_PLarga_Local, d.Notional_Vig_PCorta_Local,
            d.VP_PLarga_Base, d.VP_PCorta_Base, d.MTM_Sistema
        INTO #TempDerivados
        FROM [Inteligencia_Producto].[dbo].[TBL_DERIVADOS_INTELIGENCIA] d WITH (NOLOCK)
        INNER JOIN dimensionales.Fondos f WITH (NOLOCK)
            ON (d.Portfolio = f.Portfolio_Geneva OR (d.Portfolio = 'MUCC II' AND f.Portfolio_Geneva = 'MLCC_Geneva'))
        INNER JOIN logs.Ejecuciones e WITH (NOLOCK)
            ON e.ID_Proceso = @ID_Proceso AND e.ID_Fund = f.ID_Fund
        WHERE d.FechaReporte = @FechaReporte;

        -- Insertar con JOIN a IPA para validar que el portfolio existe
        INSERT INTO [extract].[Derivados] WITH (TABLOCK)
        (ID_Proceso, ID_Ejecucion, ID_Fund, FechaReporte, Portfolio, InvestID, Tipo_Derivado,
         Moneda_PLarga, Moneda_PCorta, Notional_Vig_PLarga_Local, Notional_Vig_PCorta_Local,
         VP_PLarga_Base, VP_PCorta_Base, MTM_Sistema)
        SELECT DISTINCT
            t.ID_Proceso, t.ID_Ejecucion, t.ID_Fund, t.FechaReporte, t.Portfolio, t.InvestID, t.Tipo_Derivado,
            t.Moneda_PLarga, t.Moneda_PCorta, t.Notional_Vig_PLarga_Local, t.Notional_Vig_PCorta_Local,
            t.VP_PLarga_Base, t.VP_PCorta_Base, t.MTM_Sistema
        FROM #TempDerivados t
        WHERE EXISTS (
            SELECT 1 FROM [extract].[IPA] ipa WITH (NOLOCK)
            WHERE ipa.Portfolio = t.Portfolio
                AND ipa.FechaReporte = t.FechaReporte
                AND ipa.ID_Ejecucion = t.ID_Ejecucion
                AND ipa.ID_Fund = t.ID_Fund
        );

        SET @RowsInserted = @@ROWCOUNT;

        DROP TABLE IF EXISTS #TempDerivados;
        COMMIT TRANSACTION;

        PRINT 'COMPLETADO: Insertados=' + CAST(@RowsInserted AS NVARCHAR(10)) +
              ', Tiempo=' + CAST(DATEDIFF(SECOND, @StartTime, GETDATE()) AS NVARCHAR(10)) + 's';

        RETURN 0;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        DROP TABLE IF EXISTS #TempDerivados;
        PRINT 'Extract_Derivados_Batch ERROR: ' + ERROR_MESSAGE();
        RETURN -1;
    END CATCH
END
GO

-- =============================================
-- Extract_UBS_Batch
-- =============================================
CREATE OR ALTER PROCEDURE [extract].[Extract_UBS_Batch]
    @ID_Proceso BIGINT,
    @FechaReporte NVARCHAR(10)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @RowsInserted INT = 0;
    DECLARE @StartTime DATETIME = GETDATE();

    PRINT 'EXTRACT_UBS_BATCH - INICIO - Fecha: ' + @FechaReporte;

    BEGIN TRY
        IF @FechaReporte IS NULL OR ISDATE(@FechaReporte) = 0
        BEGIN
            PRINT 'Extract_UBS_Batch ERROR: Fecha inválida';
            RETURN -1;
        END

        BEGIN TRANSACTION;

        INSERT INTO [extract].[UBS] WITH (TABLOCK)
        (ID_Proceso, ID_Ejecucion, ID_Fund, Portfolio, FechaReporte, FechaCartera, LocalCurrency, [Source],
         OriginalFace, ID, LocalPrice, AI, MVBook, TotalMVal, Asset, FX)
        SELECT
            @ID_Proceso, e.ID_Ejecucion, f.ID_Fund,
            u.Portfolio,
            CAST(u.NAVdate AS DATE), CAST(u.Fecha_Cartera AS DATE),
            u.InvCurrency, 'UBS',
            u.Nominal,
            CASE
                WHEN u.AL = 'Securities' AND u.Nominal <> 0 THEN u.ISIN
                WHEN u.AL = 'Securities' AND u.Nominal = 0 THEN 'Payable/Receivable'
                WHEN u.AL = 'Forward exchange' THEN u.Telekurs + SUBSTRING(u.SecurityName, 1, 6)
                ELSE u.Asset
            END,
            u.MarketPriceInvCry,
            u.AccrualInterestFundCry,
            u.MarketValueFundCry - u.AccrualInterestFundCry,
            u.MarketValueFundCry,
            u.Asset,
            u.SpotRates
        FROM [DW_MONEDA].[dbo].[PORTFOLIO_UBS_DW] u WITH (NOLOCK)
        INNER JOIN dimensionales.Fondos f WITH (NOLOCK) ON u.Portfolio = f.Portfolio_UBS
        INNER JOIN logs.Ejecuciones e WITH (NOLOCK) ON e.ID_Proceso = @ID_Proceso AND e.ID_Fund = f.ID_Fund
        WHERE u.Tipo_Dato = 'Definitivo'
            AND CAST(u.NAVdate AS DATE) = @FechaReporte
            AND f.Portfolio_UBS IS NOT NULL;

        SET @RowsInserted = @@ROWCOUNT;
        COMMIT TRANSACTION;

        PRINT 'COMPLETADO: Insertados=' + CAST(@RowsInserted AS NVARCHAR(10)) +
              ', Tiempo=' + CAST(DATEDIFF(SECOND, @StartTime, GETDATE()) AS NVARCHAR(10)) + 's';

        RETURN 0;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        PRINT 'Extract_UBS_Batch ERROR: ' + ERROR_MESSAGE();
        RETURN -1;
    END CATCH
END
GO

-- =============================================
-- Extract_UBS_MonedaDerivados_Batch
-- =============================================
CREATE OR ALTER PROCEDURE [extract].[Extract_UBS_MonedaDerivados_Batch]
    @ID_Proceso BIGINT,
    @FechaReporte NVARCHAR(10)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @RowsInserted INT = 0;
    DECLARE @StartTime DATETIME = GETDATE();

    PRINT 'EXTRACT_UBS_MONEDADERIVADOS_BATCH - INICIO - Fecha: ' + @FechaReporte;

    BEGIN TRY
        IF @FechaReporte IS NULL OR ISDATE(@FechaReporte) = 0
        BEGIN
            PRINT 'Extract_UBS_MonedaDerivados_Batch ERROR: Fecha inválida';
            RETURN -1;
        END

        BEGIN TRANSACTION;

        INSERT INTO [extract].[UBS_MonedaDerivados] WITH (TABLOCK)
        (ID_Proceso, ID_Ejecucion, ID_Fund, NAVdate, Portfolio, Telekurs, Cry_PL, Cry_PC, InvestID)
        SELECT DISTINCT
            @ID_Proceso, e.ID_Ejecucion, f.ID_Fund,
            CAST(u.NAVdate AS DATE),
            u.Portfolio,
            u.Telekurs,
            SUBSTRING(u.SecurityName, 1, 3),
            SUBSTRING(u.SecurityName, 4, 3),
            u.Telekurs + SUBSTRING(u.SecurityName, 1, 6)
        FROM [DW_MONEDA].[dbo].[PORTFOLIO_UBS_DW] u WITH (NOLOCK)
        INNER JOIN dimensionales.Fondos f WITH (NOLOCK) ON u.Portfolio = f.Portfolio_UBS
        INNER JOIN logs.Ejecuciones e WITH (NOLOCK) ON e.ID_Proceso = @ID_Proceso AND e.ID_Fund = f.ID_Fund
        WHERE u.Asset = 'Forward Exchange Trades (FET)'
            AND CAST(u.NAVdate AS DATE) = @FechaReporte
            AND LEN(ISNULL(u.SecurityName, '')) >= 6
            AND f.Portfolio_UBS IS NOT NULL;

        SET @RowsInserted = @@ROWCOUNT;
        COMMIT TRANSACTION;

        PRINT 'COMPLETADO: Insertados=' + CAST(@RowsInserted AS NVARCHAR(10)) +
              ', Tiempo=' + CAST(DATEDIFF(SECOND, @StartTime, GETDATE()) AS NVARCHAR(10)) + 's';

        RETURN 0;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        PRINT 'Extract_UBS_MonedaDerivados_Batch ERROR: ' + ERROR_MESSAGE();
        RETURN -1;
    END CATCH
END
GO

PRINT '✅ Migration 020 completada - Todos los SPs Extract_*_Batch creados';
