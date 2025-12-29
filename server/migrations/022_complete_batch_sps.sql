-- =============================================
-- Migration 022: Complete remaining batch SPs
-- PosModRF, SONA, CAPM + fix Derivados collation
-- =============================================

-- =============================================
-- Extract_PosModRF_Batch
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
        (ID_Proceso, ID_Ejecucion, ID_Fund, Portfolio, FechaReporte, FechaCartera,
         InvestID, InvestDescription, Qty, LocalPrice, AI, MVBook)
        SELECT
            @ID_Proceso,
            e.ID_Ejecucion,
            ef.ID_Fund,
            prf.Portfolio,
            CAST(prf.Fecha AS DATE),
            CAST(prf.Fecha AS DATE),
            prf.InvestID,
            prf.InvestDescription,
            prf.Qty,
            prf.LocalPrice,
            prf.AI,
            prf.MVBook
        FROM [GD_EG_001].[dbo].[GD_R_PortfolioModRF] prf WITH (NOLOCK)
        INNER JOIN logs.Ejecuciones e WITH (NOLOCK) ON e.ID_Proceso = @ID_Proceso
        INNER JOIN logs.Ejecucion_Fondos ef WITH (NOLOCK) ON ef.ID_Ejecucion = e.ID_Ejecucion AND prf.Portfolio COLLATE DATABASE_DEFAULT = ef.Portfolio_Geneva
        WHERE CAST(prf.Fecha AS DATE) = @FechaReporte;

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
-- Extract_SONA_Batch
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
        (ID_Proceso, ID_Ejecucion, ID_Fund, Portfolio, FechaReporte, FechaCartera,
         InvestID, InvestDescription, Qty, LocalPrice, AI, MVBook)
        SELECT
            @ID_Proceso,
            e.ID_Ejecucion,
            ef.ID_Fund,
            sona.Portfolio,
            CAST(sona.Fecha AS DATE),
            CAST(sona.Fecha AS DATE),
            sona.InvestID,
            sona.InvestDescription,
            sona.Qty,
            sona.LocalPrice,
            sona.AI,
            sona.MVBook
        FROM [GD_EG_001].[dbo].[GD_R_SONA] sona WITH (NOLOCK)
        INNER JOIN logs.Ejecuciones e WITH (NOLOCK) ON e.ID_Proceso = @ID_Proceso
        INNER JOIN logs.Ejecucion_Fondos ef WITH (NOLOCK) ON ef.ID_Ejecucion = e.ID_Ejecucion AND sona.Portfolio COLLATE DATABASE_DEFAULT = ef.Portfolio_Geneva
        WHERE CAST(sona.Fecha AS DATE) = @FechaReporte;

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
-- Extract_CAPM_Batch
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
        (ID_Proceso, ID_Ejecucion, ID_Fund, Portfolio, FechaReporte,
         Instrument, [Description], Position, Monto_ML, Moneda_Local)
        SELECT
            @ID_Proceso,
            e.ID_Ejecucion,
            ef.ID_Fund,
            capm.Portfolio,
            CAST(capm.Fecha AS DATE),
            capm.Instrument,
            capm.[Description],
            capm.Position,
            capm.Monto_ML,
            capm.Moneda_Local
        FROM [Inteligencia_Producto].[dbo].[TBL_CAPM] capm WITH (NOLOCK)
        INNER JOIN logs.Ejecuciones e WITH (NOLOCK) ON e.ID_Proceso = @ID_Proceso
        INNER JOIN logs.Ejecucion_Fondos ef WITH (NOLOCK) ON ef.ID_Ejecucion = e.ID_Ejecucion AND capm.Portfolio COLLATE DATABASE_DEFAULT = ef.Portfolio_CAPM
        WHERE CAST(capm.Fecha AS DATE) = @FechaReporte;

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
-- Extract_Derivados_Batch (FIX COLLATION)
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
            AND (d.Portfolio COLLATE DATABASE_DEFAULT = ef.Portfolio_Derivados COLLATE DATABASE_DEFAULT
                 OR (d.Portfolio = 'MUCC II' AND ef.Portfolio_Derivados = 'MLCC_Geneva'))
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
            WHERE ipa.Portfolio COLLATE DATABASE_DEFAULT = t.Portfolio COLLATE DATABASE_DEFAULT
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

PRINT '✅ Migration 022 completada - Todos los SPs batch completados';
