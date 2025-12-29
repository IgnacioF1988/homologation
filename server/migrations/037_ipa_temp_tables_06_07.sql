-- =============================================
-- Migration 037: IPA_06 e IPA_07 - Usar tabla temporal global
-- IPA_06: JOINs con dimensionales (el que causa timeout)
-- IPA_07: Insertar en staging.IPA_Final y limpiar temporal
-- =============================================

USE [Inteligencia_Producto_Dev];
GO

-- =============================================
-- IPA_06: Crear Dimensiones (JOIN con homologaciones)
-- =============================================
DROP PROCEDURE IF EXISTS [staging].[IPA_06_CrearDimensiones_v2];
GO

CREATE PROCEDURE [staging].[IPA_06_CrearDimensiones_v2]
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
    DECLARE @RegistrosTotal INT = 0;
    SET @RowsProcessed = 0;
    SET @ErrorCount = 0;

    IF @ID_Ejecucion IS NULL OR @ID_Ejecucion <= 0 OR @ID_Fund IS NULL OR @ID_Fund <= 0
    BEGIN
        PRINT 'IPA_06_v2 ERROR: Parámetros inválidos';
        SET @ErrorCount = 1;
        RETURN 3;
    END

    BEGIN TRY
        SET @TempTableName = 'tempdb..##IPA_Work_' + CAST(@ID_Ejecucion AS NVARCHAR(20)) + '_' + CAST(@ID_Fund AS NVARCHAR(10));

        -- Verificar tabla temporal existe
        IF OBJECT_ID(@TempTableName, 'U') IS NULL
        BEGIN
            PRINT 'IPA_06_v2 ERROR: Tabla temporal no existe';
            SET @ErrorCount = 1;
            RETURN 3;
        END

        -- Contar registros
        SET @SQL = N'SELECT @Count = COUNT(*) FROM ' + @TempTableName + ';';
        EXEC sp_executesql @SQL, N'@Count INT OUTPUT', @RegistrosTotal OUTPUT;

        IF @RegistrosTotal = 0
        BEGIN
            PRINT 'IPA_06_v2 ERROR: Sin datos en tabla temporal';
            SET @ErrorCount = 1;
            RETURN 3;
        END

        PRINT 'IPA_06_v2 INFO: Procesando ' + CAST(@RegistrosTotal AS VARCHAR(10)) + ' registros';

        -- UPDATE con JOINs a dimensionales (ahora sobre tabla pequeña!)
        SET @SQL = N'
        UPDATE ipa
        SET
            ipa.Source = ''GENEVA'',
            ipa.BalanceSheet = CASE
                WHEN ISNULL(ipa.MVBook, 0) + ISNULL(ipa.AI, 0) >= 0 THEN ''Asset''
                ELSE ''Liability''
            END,
            ipa.ID_Fund = @ID_Fund,
            ipa.ID_Instrumento = hi.ID_Instrumento,
            ipa.id_CURR = hm.id_CURR,
            ipa.PK2 = CONCAT(
                CAST(ISNULL(hi.ID_Instrumento, 0) AS NVARCHAR(10)), ''-'',
                CAST(ISNULL(hm.id_CURR, 0) AS NVARCHAR(10))
            )
        FROM ' + @TempTableName + ' ipa
        INNER JOIN dimensionales.HOMOL_Instrumentos hi
            ON ipa.InvestID = hi.SourceInvestment
            AND hi.Source = ''GENEVA''
        INNER JOIN dimensionales.HOMOL_Monedas hm
            ON ipa.LocalCurrency = hm.Name
            AND hm.Source = ''GENEVA''
        WHERE ipa.ID_Ejecucion = @ID_Ejecucion
          AND ipa.ID_Fund = @ID_Fund;';

        EXEC sp_executesql @SQL,
            N'@ID_Ejecucion BIGINT, @ID_Fund INT',
            @ID_Ejecucion, @ID_Fund;

        SET @RowsProcessed = @@ROWCOUNT;

        IF @RowsProcessed < @RegistrosTotal
            PRINT 'IPA_06_v2 WARNING: Solo ' + CAST(@RowsProcessed AS VARCHAR(10)) + ' de ' + CAST(@RegistrosTotal AS VARCHAR(10)) + ' registros homologados';
        ELSE
            PRINT 'IPA_06_v2 OK: ' + CAST(@RowsProcessed AS VARCHAR(10)) + ' registros homologados';

        RETURN 0;

    END TRY
    BEGIN CATCH
        SET @ErrorCount = 1;
        PRINT 'IPA_06_v2 ERROR: ' + ERROR_MESSAGE();
        IF ERROR_NUMBER() = 1205 RETURN 2;
        RETURN 3;
    END CATCH
END;
GO

-- =============================================
-- IPA_07: Agrupar Registros e Insertar en staging.IPA_Final
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

PRINT '✅ Migration 037 completada - IPA_06 e IPA_07 usando tablas temporales';
GO
