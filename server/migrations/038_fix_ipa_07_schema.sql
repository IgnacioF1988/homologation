-- =============================================
-- Migration 038: Fix IPA_07 to match actual staging.IPA_Final schema
-- =============================================

USE [Inteligencia_Producto_Dev];
GO

-- =============================================
-- IPA_07: Agrupar Registros e Insertar en staging.IPA_Final
-- FIXED: Match actual staging.IPA_Final table schema
-- =============================================
DROP PROCEDURE IF EXISTS [staging].[IPA_07_AgruparRegistros_v2];
GO

CREATE PROCEDURE [staging].[IPA_07_AgruparRegistros_v2]
    @ID_Ejecucion BIGINT,
    @FechaReporte NVARCHAR(10),
    @ID_Fund INT,
    @Portfolio_Geneva NVARCHAR(50) = NULL,
    @DebugMode BIT = 0,
    @RowsProcessed INT OUTPUT,
    @ErrorCount INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @TempTableName NVARCHAR(200);
    DECLARE @SQL NVARCHAR(MAX);
    SET @RowsProcessed = 0;
    SET @ErrorCount = 0;

    IF @ID_Ejecucion IS NULL OR @ID_Ejecucion <= 0 OR @ID_Fund IS NULL OR @ID_Fund <= 0
    BEGIN
        PRINT 'IPA_07_v2 ERROR: Parámetros inválidos';
        SET @ErrorCount = 1;
        RETURN 3;
    END

    BEGIN TRY
        SET @TempTableName = 'tempdb..##IPA_Work_' + CAST(@ID_Ejecucion AS NVARCHAR(20)) + '_' + CAST(@ID_Fund AS NVARCHAR(10));

        -- Verificar tabla temporal existe
        IF OBJECT_ID(@TempTableName, 'U') IS NULL
        BEGIN
            PRINT 'IPA_07_v2 ERROR: Tabla temporal no existe';
            SET @ErrorCount = 1;
            RETURN 3;
        END

        -- Eliminar datos previos del mismo fondo en staging.IPA_Final
        DELETE FROM staging.IPA_Final
        WHERE ID_Ejecucion = @ID_Ejecucion
          AND ID_Fund = @ID_Fund;

        -- Insertar datos agrupados desde tabla temporal a staging.IPA_Final
        -- IMPORTANTE: Coincidir con schema real de staging.IPA_Final
        -- Columnas: ID (identity), ID_Ejecucion, ID_Fund, FechaReporte, ID_Instrumento,
        --           id_CURR, BalanceSheet, AI, MVBook, TotalMVal, PK2, Source, FechaCreacion (default)
        SET @SQL = N'
        INSERT INTO staging.IPA_Final (
            ID_Ejecucion,
            ID_Fund,
            FechaReporte,
            ID_Instrumento,
            id_CURR,
            BalanceSheet,
            AI,
            MVBook,
            TotalMVal,
            PK2,
            Source
        )
        SELECT
            ID_Ejecucion,
            ID_Fund,
            FechaReporte,
            ID_Instrumento,
            id_CURR,
            BalanceSheet,
            SUM(ISNULL(AI, 0)) AS AI,
            SUM(ISNULL(MVBook, 0)) AS MVBook,
            SUM(ISNULL(AI, 0) + ISNULL(MVBook, 0)) AS TotalMVal,
            PK2,
            MAX(Source) AS Source
        FROM ' + @TempTableName + '
        WHERE ID_Instrumento IS NOT NULL
          AND id_CURR IS NOT NULL
          AND PK2 IS NOT NULL
        GROUP BY
            ID_Ejecucion,
            ID_Fund,
            FechaReporte,
            ID_Instrumento,
            id_CURR,
            BalanceSheet,
            PK2
        HAVING ABS(SUM(ISNULL(MVBook, 0))) > 0.01;';

        EXEC sp_executesql @SQL;

        SET @RowsProcessed = @@ROWCOUNT;

        IF @RowsProcessed = 0
        BEGIN
            PRINT 'IPA_07_v2 WARNING: No se insertaron registros en staging.IPA_Final';
        END
        ELSE
        BEGIN
            PRINT 'IPA_07_v2 OK: ' + CAST(@RowsProcessed AS VARCHAR(10)) + ' registros insertados en staging.IPA_Final';
        END

        -- LIMPIAR tabla temporal global (muy importante!)
        SET @SQL = N'DROP TABLE IF EXISTS ' + @TempTableName + ';';
        EXEC sp_executesql @SQL;

        PRINT 'IPA_07_v2 INFO: Tabla temporal limpiada';

        RETURN 0;

    END TRY
    BEGIN CATCH
        SET @ErrorCount = 1;
        PRINT 'IPA_07_v2 ERROR: ' + ERROR_MESSAGE();

        -- Intentar limpiar tabla temporal incluso si hay error
        BEGIN TRY
            SET @SQL = N'DROP TABLE IF EXISTS ' + @TempTableName + ';';
            EXEC sp_executesql @SQL;
        END TRY
        BEGIN CATCH END CATCH

        IF ERROR_NUMBER() = 1205 RETURN 2;
        RETURN 3;
    END CATCH
END;
GO

PRINT '✅ Migration 038 completada - IPA_07 corregido para schema real de staging.IPA_Final';
GO
