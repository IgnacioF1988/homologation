-- =============================================
-- Migration 023: Fix batch SPs source tables
-- Corrige las tablas origen incorrectas en migration 022
-- =============================================

-- =============================================
-- Extract_PosModRF_Batch (FIX: tabla y campos correctos)
-- =============================================
CREATE OR ALTER PROCEDURE [extract].[Extract_PosModRF_Batch]
    @ID_Proceso BIGINT,
    @FechaReporte NVARCHAR(10)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @RowsInserted INT = 0;
    DECLARE @StartTime DATETIME = GETDATE();

    PRINT 'EXTRACT_POSMODRF_BATCH - INICIO - Fecha: ' + @FechaReporte;

    BEGIN TRY
        IF @FechaReporte IS NULL OR ISDATE(@FechaReporte) = 0
        BEGIN
            PRINT 'Extract_PosModRF_Batch ERROR: Fecha inválida';
            RETURN -1;
        END

        BEGIN TRANSACTION;

        INSERT INTO [extract].[PosModRF] WITH (TABLOCK)
        (Portfolio, FechaReporte, FechaCartera, InvestID, OriginalFace, Factor,
         TotalMkt, Code, ID_Ejecucion, ID_Fund, ID_Proceso)
        SELECT
            pmrf.Portfolio,
            CAST(pmrf.Fecha AS DATE),
            CAST(pmrf.Fecha AS DATE),
            pmrf.Investment_Code,
            pmrf.OriginalFace,
            pmrf.Factor,
            pmrf.TotalMkt,
            pmrf.Investment_BifurcationCurrency_Code,
            e.ID_Ejecucion,
            ef.ID_Fund,
            @ID_Proceso
        FROM [GD_EG_001].[dbo].[GD_R_Positions_Mod_RF] pmrf WITH (NOLOCK)
        INNER JOIN logs.Ejecuciones e WITH (NOLOCK) ON e.ID_Proceso = @ID_Proceso
        INNER JOIN logs.Ejecucion_Fondos ef WITH (NOLOCK)
            ON ef.ID_Ejecucion = e.ID_Ejecucion
            AND pmrf.Portfolio COLLATE DATABASE_DEFAULT = ef.Portfolio_Geneva
        WHERE CAST(pmrf.Fecha AS DATE) = @FechaReporte
            AND pmrf.Portfolio NOT IN ('MCCDF', 'Moneda GSI RER');

        SET @RowsInserted = @@ROWCOUNT;
        COMMIT TRANSACTION;

        PRINT 'COMPLETADO: Insertados=' + CAST(@RowsInserted AS NVARCHAR(10)) +
              ', Tiempo=' + CAST(DATEDIFF(SECOND, @StartTime, GETDATE()) AS NVARCHAR(10)) + 's';

        RETURN 0;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        PRINT 'Extract_PosModRF_Batch ERROR: ' + ERROR_MESSAGE();
        RETURN -1;
    END CATCH
END
GO

-- =============================================
-- Extract_SONA_Batch (FIX: tabla correcta)
-- =============================================
CREATE OR ALTER PROCEDURE [extract].[Extract_SONA_Batch]
    @ID_Proceso BIGINT,
    @FechaReporte NVARCHAR(10)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @RowsInserted INT = 0;
    DECLARE @StartTime DATETIME = GETDATE();

    PRINT 'EXTRACT_SONA_BATCH - INICIO - Fecha: ' + @FechaReporte;

    BEGIN TRY
        IF @FechaReporte IS NULL OR ISDATE(@FechaReporte) = 0
        BEGIN
            PRINT 'Extract_SONA_Batch ERROR: Fecha inválida';
            RETURN -1;
        END

        BEGIN TRANSACTION;

        INSERT INTO [extract].[SONA] WITH (TABLOCK)
        (Portfolio, FechaReporte, FechaCartera, TotalText, Sect, Cat, SubCat,
         Bal, [Source], ID_Ejecucion, ID_Fund, ID_Proceso)
        SELECT
            sona.Portfolio,
            CAST(sona.Fecha AS DATE),
            CAST(sona.Fecha AS DATE),
            sona.TotalText,
            sona.Sect,
            sona.Cat,
            sona.SubCat,
            sona.Bal,
            'GENEVA',
            e.ID_Ejecucion,
            ef.ID_Fund,
            @ID_Proceso
        FROM [GD_EG_001].[dbo].[GD_R_StateOfNetAsset] sona WITH (NOLOCK)
        INNER JOIN logs.Ejecuciones e WITH (NOLOCK) ON e.ID_Proceso = @ID_Proceso
        INNER JOIN logs.Ejecucion_Fondos ef WITH (NOLOCK)
            ON ef.ID_Ejecucion = e.ID_Ejecucion
            AND sona.Portfolio COLLATE DATABASE_DEFAULT = ef.Portfolio_Geneva
        WHERE CAST(sona.Fecha AS DATE) = @FechaReporte
            AND sona.Portfolio NOT IN ('MCCDF', 'Moneda GSI RER');

        SET @RowsInserted = @@ROWCOUNT;
        COMMIT TRANSACTION;

        PRINT 'COMPLETADO: Insertados=' + CAST(@RowsInserted AS NVARCHAR(10)) +
              ', Tiempo=' + CAST(DATEDIFF(SECOND, @StartTime, GETDATE()) AS NVARCHAR(10)) + 's';

        RETURN 0;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        PRINT 'Extract_SONA_Batch ERROR: ' + ERROR_MESSAGE();
        RETURN -1;
    END CATCH
END
GO

-- =============================================
-- Extract_CAPM_Batch (FIX: tabla y campos correctos)
-- =============================================
CREATE OR ALTER PROCEDURE [extract].[Extract_CAPM_Batch]
    @ID_Proceso BIGINT,
    @FechaReporte NVARCHAR(10)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @RowsInserted INT = 0;
    DECLARE @StartTime DATETIME = GETDATE();

    PRINT 'EXTRACT_CAPM_BATCH - INICIO - Fecha: ' + @FechaReporte;

    BEGIN TRY
        IF @FechaReporte IS NULL OR ISDATE(@FechaReporte) = 0
        BEGIN
            PRINT 'Extract_CAPM_Batch ERROR: Fecha inválida';
            RETURN -1;
        END

        BEGIN TRANSACTION;

        INSERT INTO [extract].[CAPM] WITH (TABLOCK)
        (Portfolio, FechaReporte, FechaCartera, TotalText, LSDesc, Qty, InvestID,
         FXRate, CostBook, MVBook, UnRealGL, percentInvest, percentSign, sumStatement,
         LocalCurrency, ID_Ejecucion, ID_Fund, ID_Proceso)
        SELECT
            capm.Portfolio,
            CAST(capm.Fecha AS DATE),
            CAST(capm.Fecha AS DATE),
            capm.TotalText,
            capm.LSDesc,
            capm.Qty,
            capm.LocationAcct,
            capm.FXRate,
            capm.CostBook,
            capm.MVBook,
            capm.UnRealGL,
            capm.percentInvest,
            capm.percentSign,
            capm.sumStatement,
            capm.InvestDescription,
            e.ID_Ejecucion,
            ef.ID_Fund,
            @ID_Proceso
        FROM [GD_EG_001].[dbo].[GD_R_Cash_Appraisal_Moneda] capm WITH (NOLOCK)
        INNER JOIN logs.Ejecuciones e WITH (NOLOCK) ON e.ID_Proceso = @ID_Proceso
        INNER JOIN logs.Ejecucion_Fondos ef WITH (NOLOCK)
            ON ef.ID_Ejecucion = e.ID_Ejecucion
            AND capm.Portfolio COLLATE DATABASE_DEFAULT = ef.Portfolio_Geneva
        WHERE CAST(capm.Fecha AS DATE) = @FechaReporte
            AND capm.Portfolio NOT IN ('MCCDF', 'Moneda GSI RER');

        SET @RowsInserted = @@ROWCOUNT;
        COMMIT TRANSACTION;

        PRINT 'COMPLETADO: Insertados=' + CAST(@RowsInserted AS NVARCHAR(10)) +
              ', Tiempo=' + CAST(DATEDIFF(SECOND, @StartTime, GETDATE()) AS NVARCHAR(10)) + 's';

        RETURN 0;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        PRINT 'Extract_CAPM_Batch ERROR: ' + ERROR_MESSAGE();
        RETURN -1;
    END CATCH
END
GO

-- =============================================
-- Extract_Derivados_Batch (FIX: simplificar COLLATE)
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
        INNER JOIN logs.Ejecuciones e WITH (NOLOCK) ON e.ID_Proceso = @ID_Proceso
        INNER JOIN logs.Ejecucion_Fondos ef WITH (NOLOCK)
            ON ef.ID_Ejecucion = e.ID_Ejecucion
            AND (d.Portfolio COLLATE DATABASE_DEFAULT = ef.Portfolio_Derivados
                 OR (d.Portfolio = 'MUCC II' AND ef.Portfolio_Derivados = 'MLCC_Geneva'))
        WHERE d.FechaReporte = @FechaReporte;

        -- Insertar con JOIN a IPA para validar que el portfolio existe
        INSERT INTO [extract].[Derivados] WITH (TABLOCK)
        (FechaReporte, Portfolio, InvestID, Tipo_Derivado, Moneda_PLarga, Moneda_PCorta,
         Notional_Vig_PLarga_Local, Notional_Vig_PCorta_Local, VP_PLarga_Base, VP_PCorta_Base,
         MTM_Sistema, ID_Ejecucion, ID_Fund, ID_Proceso)
        SELECT DISTINCT
            t.FechaReporte, t.Portfolio, t.InvestID, t.Tipo_Derivado,
            t.Moneda_PLarga, t.Moneda_PCorta, t.Notional_Vig_PLarga_Local, t.Notional_Vig_PCorta_Local,
            t.VP_PLarga_Base, t.VP_PCorta_Base, t.MTM_Sistema,
            t.ID_Ejecucion, t.ID_Fund, t.ID_Proceso
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

PRINT '✅ Migration 023 completada - Tablas origen corregidas en SPs batch';
