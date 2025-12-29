-- =============================================
-- Migration 033: Derivados_Batch - Fix collation en EXISTS con IPA
-- Agrega COLLATE DATABASE_DEFAULT en comparación con extract.IPA
-- =============================================

USE [Inteligencia_Producto_Dev];
GO

DROP PROCEDURE IF EXISTS [extract].[Extract_Derivados_Batch];
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

        -- Tabla temporal
        DROP TABLE IF EXISTS #TempDerivados;

        -- Paso 1: Obtener datos sin transformación MUCC II
        SELECT
            d.FechaReporte,
            d.Portfolio,
            d.ID_Derivado AS InvestID,
            d.Tipo_Derivado,
            d.Moneda_PLarga,
            d.Moneda_PCorta,
            d.Notional_Vig_PLarga_Local,
            d.Notional_Vig_PCorta_Local,
            d.VP_PLarga_Base,
            d.VP_PCorta_Base,
            d.MTM_Sistema,
            e.ID_Ejecucion,
            ef.ID_Fund,
            @ID_Proceso AS ID_Proceso
        INTO #TempDerivados
        FROM Inteligencia_Producto.dbo.TBL_DERIVADOS_INTELIGENCIA d WITH (NOLOCK)
        INNER JOIN logs.Ejecuciones e WITH (NOLOCK) ON e.ID_Proceso = @ID_Proceso
        INNER JOIN logs.Ejecucion_Fondos ef WITH (NOLOCK)
            ON ef.ID_Ejecucion = e.ID_Ejecucion
            AND d.Portfolio COLLATE DATABASE_DEFAULT = ef.Portfolio_Derivados COLLATE DATABASE_DEFAULT
        WHERE d.FechaReporte = @FechaReporte;

        -- Paso 2: Agregar registros de MUCC II -> MLCC_Geneva separadamente
        INSERT INTO #TempDerivados
        SELECT
            d.FechaReporte,
            d.Portfolio,
            d.ID_Derivado,
            d.Tipo_Derivado,
            d.Moneda_PLarga,
            d.Moneda_PCorta,
            d.Notional_Vig_PLarga_Local,
            d.Notional_Vig_PCorta_Local,
            d.VP_PLarga_Base,
            d.VP_PCorta_Base,
            d.MTM_Sistema,
            e.ID_Ejecucion,
            ef.ID_Fund,
            @ID_Proceso
        FROM Inteligencia_Producto.dbo.TBL_DERIVADOS_INTELIGENCIA d WITH (NOLOCK)
        INNER JOIN logs.Ejecuciones e WITH (NOLOCK) ON e.ID_Proceso = @ID_Proceso
        INNER JOIN logs.Ejecucion_Fondos ef WITH (NOLOCK)
            ON ef.ID_Ejecucion = e.ID_Ejecucion
            AND ef.Portfolio_Derivados = 'MLCC_Geneva'
        WHERE d.FechaReporte = @FechaReporte
            AND d.Portfolio = 'MUCC II';

        -- Paso 3: Transformar MUCC II -> MLCC_Geneva
        UPDATE #TempDerivados
        SET Portfolio = 'MLCC_Geneva'
        WHERE Portfolio = 'MUCC II';

        -- Paso 4: Insertar en tabla final con validación IPA (CON COLLATE)
        INSERT INTO extract.Derivados WITH (TABLOCK)
        (
            FechaReporte, Portfolio, InvestID, Tipo_Derivado,
            Moneda_PLarga, Moneda_PCorta,
            Notional_Vig_PLarga_Local, Notional_Vig_PCorta_Local,
            VP_PLarga_Base, VP_PCorta_Base, MTM_Sistema,
            ID_Ejecucion, ID_Fund, ID_Proceso
        )
        SELECT DISTINCT
            t.FechaReporte, t.Portfolio, t.InvestID, t.Tipo_Derivado,
            t.Moneda_PLarga, t.Moneda_PCorta,
            t.Notional_Vig_PLarga_Local, t.Notional_Vig_PCorta_Local,
            t.VP_PLarga_Base, t.VP_PCorta_Base, t.MTM_Sistema,
            t.ID_Ejecucion, t.ID_Fund, t.ID_Proceso
        FROM #TempDerivados t
        WHERE EXISTS (
            SELECT 1 FROM extract.IPA ipa WITH (NOLOCK)
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

PRINT '✅ Migration 033 completada - Extract_Derivados_Batch con COLLATE en IPA EXISTS';
GO
