-- =============================================
-- Migration 021: Fix dimensionales.Fondos → dimensionales.BD_Funds
-- Corrige los SPs batch que usan la tabla incorrecta
-- =============================================

-- =============================================
-- Extract_Derivados_Batch (FIX)
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
            ef.ID_Fund,
            d.FechaReporte,
            CASE WHEN d.Portfolio = 'MUCC II' THEN 'MLCC_Geneva' ELSE d.Portfolio END AS Portfolio,
            d.ID_Derivado AS InvestID,
            d.Tipo_Derivado,
            d.Moneda_PLarga, d.Moneda_PCorta,
            d.Notional_Vig_PLarga_Local, d.Notional_Vig_PCorta_Local,
            d.VP_PLarga_Base, d.VP_PCorta_Base, d.MTM_Sistema
        INTO #TempDerivados
        FROM [Inteligencia_Producto].[dbo].[TBL_DERIVADOS_INTELIGENCIA] d WITH (NOLOCK)
        INNER JOIN logs.Ejecuciones e WITH (NOLOCK)
            ON e.ID_Proceso = @ID_Proceso
        INNER JOIN logs.Ejecucion_Fondos ef WITH (NOLOCK)
            ON ef.ID_Ejecucion = e.ID_Ejecucion
            AND (d.Portfolio COLLATE DATABASE_DEFAULT = ef.Portfolio_Derivados OR (d.Portfolio = 'MUCC II' AND ef.Portfolio_Derivados = 'MLCC_Geneva'))
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
-- Extract_UBS_Batch (FIX)
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
            @ID_Proceso, e.ID_Ejecucion, ef.ID_Fund,
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
        INNER JOIN logs.Ejecuciones e WITH (NOLOCK) ON e.ID_Proceso = @ID_Proceso
        INNER JOIN logs.Ejecucion_Fondos ef WITH (NOLOCK) ON ef.ID_Ejecucion = e.ID_Ejecucion AND u.Portfolio COLLATE DATABASE_DEFAULT = ef.Portfolio_UBS
        WHERE u.Tipo_Dato = 'Definitivo'
            AND CAST(u.NAVdate AS DATE) = @FechaReporte
            AND ef.Portfolio_UBS IS NOT NULL;

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
-- Extract_UBS_MonedaDerivados_Batch (FIX)
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
            @ID_Proceso, e.ID_Ejecucion, ef.ID_Fund,
            CAST(u.NAVdate AS DATE),
            u.Portfolio,
            u.Telekurs,
            SUBSTRING(u.SecurityName, 1, 3),
            SUBSTRING(u.SecurityName, 4, 3),
            u.Telekurs + SUBSTRING(u.SecurityName, 1, 6)
        FROM [DW_MONEDA].[dbo].[PORTFOLIO_UBS_DW] u WITH (NOLOCK)
        INNER JOIN logs.Ejecuciones e WITH (NOLOCK) ON e.ID_Proceso = @ID_Proceso
        INNER JOIN logs.Ejecucion_Fondos ef WITH (NOLOCK) ON ef.ID_Ejecucion = e.ID_Ejecucion AND u.Portfolio COLLATE DATABASE_DEFAULT = ef.Portfolio_UBS
        WHERE u.Asset = 'Forward Exchange Trades (FET)'
            AND CAST(u.NAVdate AS DATE) = @FechaReporte
            AND LEN(ISNULL(u.SecurityName, '')) >= 6
            AND ef.Portfolio_UBS IS NOT NULL;

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

-- =============================================
-- Extract_IPA_Batch (FIX)
-- =============================================
CREATE OR ALTER PROCEDURE [extract].[Extract_IPA_Batch]
    @ID_Proceso BIGINT,
    @FechaReporte NVARCHAR(10)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @RowsInserted INT = 0;
    DECLARE @StartTime DATETIME = GETDATE();

    PRINT 'EXTRACT_IPA_BATCH - INICIO - Fecha: ' + @FechaReporte;

    BEGIN TRY
        IF @FechaReporte IS NULL OR ISDATE(@FechaReporte) = 0
        BEGIN
            PRINT 'Extract_IPA_Batch ERROR: Fecha inválida';
            RETURN -1;
        END

        BEGIN TRANSACTION;

        -- Insertar TODOS los fondos de una vez con tagging correcto
        INSERT INTO [extract].[IPA] WITH (TABLOCK)
        (
            ID_Proceso, ID_Ejecucion, ID_Fund,
            Portfolio, FechaReporte, FechaCartera, TotalText, ReportMode, LSDesc,
            SortKey, LocalCurrency, BasketInvestDesc, InvestDescription, InvestID,
            Qty, LocalPrice, CostLocal, CostBook, UnRealGL, AI, MVBook,
            PercentInvest, PercentSign, IsSwap, BasketInvID
        )
        SELECT
            @ID_Proceso,
            e.ID_Ejecucion,
            ef.ID_Fund,
            CASE WHEN ipa.Portfolio = 'MLCC' THEN 'MLCC_Geneva' ELSE ipa.Portfolio END AS Portfolio,
            CAST(ipa.Fecha AS DATE) AS FechaReporte,
            CAST(ipa.Fecha AS DATE) AS FechaCartera,
            ipa.TotalText, ipa.ReportMode, ipa.LSDesc, ipa.SortKey, ipa.LocalCurrency,
            ipa.BasketInvestDesc, ipa.InvestDescription, ipa.InvestID, ipa.Qty, ipa.LocalPrice,
            ipa.CostLocal, ipa.CostBook, ipa.UnRealGL, ipa.AI, ipa.MVBook, ipa.PercentInvest,
            ipa.PercentSign, ipa.IsSwap, ipa.BasketInvID
        FROM [GD_EG_001].[dbo].[GD_R_InvestmentPosition] ipa WITH (NOLOCK)
        INNER JOIN logs.Ejecuciones e WITH (NOLOCK) ON e.ID_Proceso = @ID_Proceso
        INNER JOIN logs.Ejecucion_Fondos ef WITH (NOLOCK) ON ef.ID_Ejecucion = e.ID_Ejecucion AND ipa.Portfolio COLLATE DATABASE_DEFAULT = ef.Portfolio_Geneva
        WHERE CAST(ipa.Fecha AS DATE) = @FechaReporte
            AND ipa.Portfolio NOT IN ('MCCDF', 'Moneda GSI RER');

        SET @RowsInserted = @@ROWCOUNT;
        COMMIT TRANSACTION;

        PRINT 'COMPLETADO: Insertados=' + CAST(@RowsInserted AS NVARCHAR(10)) +
              ', Tiempo=' + CAST(DATEDIFF(SECOND, @StartTime, GETDATE()) AS NVARCHAR(10)) + 's';

        RETURN 0;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        PRINT 'Extract_IPA_Batch ERROR: ' + ERROR_MESSAGE();
        RETURN -1;
    END CATCH
END
GO

PRINT '✅ Migration 021 completada - Todos los SPs batch corregidos (logs.Ejecucion_Fondos)';
