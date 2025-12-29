-- =============================================
-- Migration 045: Crear Extract_PNL_Batch
-- =============================================
-- PROBLEMA: Extract_PNL no se ejecuta en pipeline v2, causando que PNL_01 falle
-- SOLUCIÓN: Crear versión Batch que extrae una vez para todos los fondos
-- =============================================

USE [Inteligencia_Producto_Dev];
GO

DROP PROCEDURE IF EXISTS [extract].[Extract_PNL_Batch];
GO

CREATE PROCEDURE [extract].[Extract_PNL_Batch]
    @FechaReporte NVARCHAR(10)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @RowsDeleted INT = 0;
    DECLARE @RowsInserted INT = 0;
    DECLARE @SourceRows INT = 0;
    DECLARE @StartTime DATETIME = GETDATE();

    PRINT '========================================';
    PRINT 'EXTRACT_PNL_BATCH - INICIO DE PROCESO';
    PRINT 'Fecha Reporte: ' + ISNULL(@FechaReporte, 'NULL');
    PRINT 'Hora Inicio: ' + CONVERT(VARCHAR(23), @StartTime, 121);
    PRINT '========================================';

    BEGIN TRY
        -- Validación de parámetro
        IF @FechaReporte IS NULL OR LEN(@FechaReporte) = 0
        BEGIN
            PRINT 'Extract_PNL_Batch ERROR: Fecha de reporte no puede ser NULL';
            RETURN -1;
        END

        -- Verificar formato de fecha válido
        IF ISDATE(@FechaReporte) = 0
        BEGIN
            PRINT 'Extract_PNL_Batch ERROR: Formato de fecha inválido';
            RETURN -1;
        END

        -- Verificar si existen datos en origen
        SELECT @SourceRows = COUNT(*)
        FROM [GD_EG_001].[dbo].[GD_R_Profit_And_Lost_Investment]
        WHERE CAST(Fecha AS DATE) = @FechaReporte
            AND Portfolio NOT IN ('MCCDF', 'Moneda GSI RER');

        PRINT 'VALIDACION: Registros encontrados en origen = ' + CAST(@SourceRows AS NVARCHAR(10));

        -- Si no hay datos en origen, informar y salir exitosamente
        IF @SourceRows = 0
        BEGIN
            PRINT 'INFORMACION: No hay datos PNL para procesar en la fecha especificada';
            PRINT 'EXTRACT_PNL_BATCH - PROCESO FINALIZADO (Sin datos)';
            PRINT 'Tiempo Total: ' + CAST(DATEDIFF(SECOND, @StartTime, GETDATE()) AS NVARCHAR(10)) + ' segundos';
            RETURN 1; -- Código especial: éxito sin datos
        END

        BEGIN TRANSACTION;

        -- Limpiar datos existentes
        IF EXISTS (SELECT 1 FROM [extract].[PNL] WHERE FechaReporte = @FechaReporte)
        BEGIN
            DELETE FROM [extract].[PNL]
            WHERE FechaReporte = @FechaReporte;

            SET @RowsDeleted = @@ROWCOUNT;
            PRINT 'LIMPIEZA: Registros eliminados = ' + CAST(@RowsDeleted AS NVARCHAR(10));
        END

        -- Insertar datos
        INSERT INTO [extract].[PNL]
        (
            Portfolio, FechaReporte, FechaCartera, Group1, Symb,
            PRgain, PUgain, FxRgain, FxUgain, Income,
            TotGL, PctGL, BasisPoint, Currency
        )
        SELECT
            CASE
                WHEN Portfolio = 'MLCC' THEN 'MLCC_Geneva'
                ELSE Portfolio
            END AS Portfolio,
            CAST(Fecha AS DATE) AS FechaReporte,
            CAST(Fecha AS DATE) AS FechaCartera,
            Group1,
            Symb,
            PRgain,
            PUgain,
            FxRgain,
            FxUgain,
            Income,
            TotGL,
            PctGL,
            BasisPoint,
            Currency
        FROM [GD_EG_001].[dbo].[GD_R_Profit_And_Lost_Investment]
        WHERE CAST(Fecha AS DATE) = @FechaReporte
            AND Portfolio NOT IN ('MCCDF', 'Moneda GSI RER');

        SET @RowsInserted = @@ROWCOUNT;

        -- Validar que se insertaron los registros esperados
        IF @RowsInserted <> @SourceRows
        BEGIN
            PRINT 'ADVERTENCIA: Discrepancia en registros - Esperados: ' + CAST(@SourceRows AS NVARCHAR(10)) +
                  ', Insertados: ' + CAST(@RowsInserted AS NVARCHAR(10));
        END

        COMMIT TRANSACTION;

        -- Actualización desde PNL_1 (tabla espejo con prioridad)
        DECLARE @PNL1Rows INT = 0;
        DECLARE @RowsUpdated INT = 0;

        SELECT @PNL1Rows = COUNT(*)
        FROM [extract].[PNL_1]
        WHERE FechaReporte = @FechaReporte;

        PRINT 'VALIDACION: Registros encontrados en PNL_1 = ' + CAST(@PNL1Rows AS NVARCHAR(10));

        -- Si hay datos en PNL_1, actualizar PNL
        IF @PNL1Rows > 0
        BEGIN
            UPDATE pnl
            SET
                pnl.Portfolio = pnl1.Portfolio,
                pnl.Symb = pnl1.Symb,
                pnl.FechaReporte = pnl1.FechaReporte,
                pnl.FechaCartera = pnl1.FechaCartera,
                pnl.Group1 = pnl1.Group1,
                pnl.PRgain = pnl1.PRgain,
                pnl.PUgain = pnl1.PUgain,
                pnl.FxRgain = pnl1.FxRgain,
                pnl.FxUgain = pnl1.FxUgain,
                pnl.Income = pnl1.Income,
                pnl.TotGL = pnl1.TotGL,
                pnl.PctGL = pnl1.PctGL,
                pnl.BasisPoint = pnl1.BasisPoint
            FROM [extract].[PNL] pnl
            INNER JOIN [extract].[PNL_1] pnl1
                ON pnl.[PL_IDREG] = pnl1.[PL_IDREG]
            WHERE pnl.FechaReporte = @FechaReporte;

            SET @RowsUpdated = @@ROWCOUNT;
            PRINT 'ACTUALIZACION: Registros actualizados desde PNL_1 = ' + CAST(@RowsUpdated AS NVARCHAR(10));
        END

        -- Resumen del proceso
        PRINT '========================================';
        PRINT 'EXTRACT_PNL_BATCH - PROCESO COMPLETADO';
        PRINT 'Registros eliminados: ' + CAST(@RowsDeleted AS NVARCHAR(10));
        PRINT 'Registros insertados: ' + CAST(@RowsInserted AS NVARCHAR(10));
        PRINT 'Registros actualizados: ' + CAST(@RowsUpdated AS NVARCHAR(10));
        PRINT 'Tiempo ejecución: ' + CAST(DATEDIFF(SECOND, @StartTime, GETDATE()) AS NVARCHAR(10)) + ' segundos';
        PRINT '========================================';

        RETURN 0; -- Éxito con datos

    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
            ROLLBACK TRANSACTION;

        DECLARE @ErrorMessage NVARCHAR(4000) = ERROR_MESSAGE();
        DECLARE @ErrorSeverity INT = ERROR_SEVERITY();
        DECLARE @ErrorState INT = ERROR_STATE();

        PRINT '========================================';
        PRINT 'EXTRACT_PNL_BATCH - ERROR EN PROCESO';
        PRINT 'Mensaje: ' + @ErrorMessage;
        PRINT 'Severidad: ' + CAST(@ErrorSeverity AS NVARCHAR(10));
        PRINT 'Estado: ' + CAST(@ErrorState AS NVARCHAR(10));
        PRINT 'Línea: ' + CAST(ERROR_LINE() AS NVARCHAR(10));
        PRINT '========================================';

        IF @ErrorSeverity >= 16
            PRINT 'Extract_PNL_Batch ERROR: ' + @ErrorMessage;

        RETURN -1; -- Error
    END CATCH
END;
GO

PRINT '✅ Migration 045 completada - Extract_PNL_Batch creado';
GO
