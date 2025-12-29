-- =============================================
-- Migration 026: Drop and Create Derivados_Batch
-- DROP + CREATE explícito para evitar cache de metadata
-- =============================================

IF OBJECT_ID('extract.Extract_Derivados_Batch', 'P') IS NOT NULL
    DROP PROCEDURE [extract].[Extract_Derivados_Batch];
GO

CREATE PROCEDURE [extract].[Extract_Derivados_Batch]
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

        -- Paso 1: Crear temp con datos básicos
        CREATE TABLE #TempDerivados (
            ID_Proceso BIGINT,
            ID_Ejecucion BIGINT,
            ID_Fund INT,
            FechaReporte NVARCHAR(10),
            Portfolio NVARCHAR(255),
            InvestID NVARCHAR(255),
            Tipo_Derivado NVARCHAR(255),
            Moneda_PLarga NVARCHAR(10),
            Moneda_PCorta NVARCHAR(10),
            Notional_Vig_PLarga_Local FLOAT,
            Notional_Vig_PCorta_Local FLOAT,
            VP_PLarga_Base FLOAT,
            VP_PCorta_Base FLOAT,
            MTM_Sistema FLOAT
        );

        -- Paso 2: Insertar datos
        INSERT INTO #TempDerivados
        SELECT
            @ID_Proceso,
            e.ID_Ejecucion,
            ef.ID_Fund,
            d.FechaReporte,
            CASE WHEN d.Portfolio = 'MUCC II' THEN 'MLCC_Geneva' ELSE d.Portfolio END,
            d.ID_Derivado,
            d.Tipo_Derivado,
            d.Moneda_PLarga, d.Moneda_PCorta,
            d.Notional_Vig_PLarga_Local, d.Notional_Vig_PCorta_Local,
            d.VP_PLarga_Base, d.VP_PCorta_Base, d.MTM_Sistema
        FROM [Inteligencia_Producto].[dbo].[TBL_DERIVADOS_INTELIGENCIA] d WITH (NOLOCK)
        INNER JOIN logs.Ejecuciones e WITH (NOLOCK) ON e.ID_Proceso = @ID_Proceso
        INNER JOIN logs.Ejecucion_Fondos ef WITH (NOLOCK)
            ON ef.ID_Ejecucion = e.ID_Ejecucion
            AND (d.Portfolio COLLATE DATABASE_DEFAULT = ef.Portfolio_Derivados COLLATE DATABASE_DEFAULT
                 OR (d.Portfolio COLLATE DATABASE_DEFAULT = 'MUCC II' COLLATE DATABASE_DEFAULT
                     AND ef.Portfolio_Derivados COLLATE DATABASE_DEFAULT = 'MLCC_Geneva' COLLATE DATABASE_DEFAULT))
        WHERE d.FechaReporte = @FechaReporte;

        -- Paso 3: Insertar en tabla final
        INSERT INTO [extract].[Derivados] WITH (TABLOCK)
        (
            ID_Proceso, ID_Ejecucion, ID_Fund,
            FechaReporte, Portfolio, InvestID, Tipo_Derivado,
            Moneda_PLarga, Moneda_PCorta, Notional_Vig_PLarga_Local,
            Notional_Vig_PCorta_Local, VP_PLarga_Base, VP_PCorta_Base, MTM_Sistema
        )
        SELECT DISTINCT
            t.ID_Proceso, t.ID_Ejecucion, t.ID_Fund,
            t.FechaReporte, t.Portfolio, t.InvestID, t.Tipo_Derivado,
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

PRINT '✅ Migration 026 completada - Extract_Derivados_Batch con temp table explícita';
