-- =====================================================
-- MIGRATION 010: Create Concatenar_Cubo_v2 and Cleanup_Ejecucion
-- Date: 2025-12-29
-- Description: Crear SPs de consolidación y limpieza
--              que trabajan con process.* en lugar de staging.*
-- =====================================================

SET NOCOUNT ON;

PRINT '=== Migration 010: Create Concatenar_Cubo_v2 and Cleanup_Ejecucion ===';
PRINT 'Fecha: ' + CONVERT(VARCHAR, GETDATE(), 120);
PRINT '';

-- =====================================================
-- 1. Actualizar config.StagingSourcesCubo
-- =====================================================
PRINT '>>> Actualizando config.StagingSourcesCubo...';

-- Actualizar las fuentes de staging.* a process.*
UPDATE config.StagingSourcesCubo
SET SchemaName = 'process', TableName = 'TBL_IPA'
WHERE SchemaName = 'staging' AND TableName = 'IPA';

UPDATE config.StagingSourcesCubo
SET SchemaName = 'process', TableName = 'TBL_CAPM'
WHERE SchemaName = 'staging' AND TableName = 'CAPM';

UPDATE config.StagingSourcesCubo
SET SchemaName = 'process', TableName = 'TBL_Derivados'
WHERE SchemaName = 'staging' AND TableName = 'Derivados';

UPDATE config.StagingSourcesCubo
SET SchemaName = 'process', TableName = 'TBL_MLCCII'
WHERE SchemaName = 'staging' AND TableName = 'MLCCII';

UPDATE config.StagingSourcesCubo
SET SchemaName = 'process', TableName = 'TBL_MLCCII_Derivados'
WHERE SchemaName = 'staging' AND TableName = 'MLCCII_Derivados';

-- Desactivar las tablas Ajuste_* (ahora son ## temporales)
UPDATE config.StagingSourcesCubo
SET IsActive = 0
WHERE TableName LIKE 'Ajuste_%';

PRINT '    Config actualizada';
PRINT '';

-- =====================================================
-- 2. Crear staging.Concatenar_Cubo_v2
-- =====================================================
PRINT '>>> Creando staging.Concatenar_Cubo_v2...';

IF OBJECT_ID('staging.Concatenar_Cubo_v2', 'P') IS NOT NULL
    DROP PROCEDURE staging.Concatenar_Cubo_v2;
GO

CREATE PROCEDURE staging.Concatenar_Cubo_v2
    @ID_Ejecucion BIGINT,
    @FechaReporte VARCHAR(10) = NULL,
    @Debug BIT = 0
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @StartTime DATETIME = GETDATE();
    DECLARE @RowCount_IPA INT = 0;
    DECLARE @RowCount_CAPM INT = 0;
    DECLARE @RowCount_PNL_IPA INT = 0;
    DECLARE @RowCount_Derivados INT = 0;
    DECLARE @RowCount_MLCCII INT = 0;
    DECLARE @RowCount_MLCCII_Derivados INT = 0;
    DECLARE @TotalRows INT = 0;
    DECLARE @FundsProcessed INT = 0;
    DECLARE @ErrorMsg NVARCHAR(MAX);

    BEGIN TRY
        -- PASO 1: Validar datos
        IF @Debug = 1 PRINT 'Paso 1: Validando datos para ID_Ejecucion = ' + CAST(@ID_Ejecucion AS VARCHAR);

        SELECT @RowCount_IPA = COUNT(*) FROM process.TBL_IPA WHERE ID_Ejecucion = @ID_Ejecucion;
        SELECT @RowCount_CAPM = COUNT(*) FROM process.TBL_CAPM WHERE ID_Ejecucion = @ID_Ejecucion;
        SELECT @RowCount_PNL_IPA = COUNT(*) FROM process.TBL_PNL_IPA WHERE ID_Ejecucion = @ID_Ejecucion;
        SELECT @RowCount_Derivados = COUNT(*) FROM process.TBL_Derivados WHERE ID_Ejecucion = @ID_Ejecucion;
        SELECT @RowCount_MLCCII = COUNT(*) FROM process.TBL_MLCCII WHERE ID_Ejecucion = @ID_Ejecucion;
        SELECT @RowCount_MLCCII_Derivados = COUNT(*) FROM process.TBL_MLCCII_Derivados WHERE ID_Ejecucion = @ID_Ejecucion;

        SET @TotalRows = @RowCount_IPA + @RowCount_CAPM + @RowCount_PNL_IPA
                       + @RowCount_Derivados + @RowCount_MLCCII + @RowCount_MLCCII_Derivados;

        -- Contar fondos
        SELECT @FundsProcessed = COUNT(DISTINCT ID_Fund)
        FROM (
            SELECT ID_Fund FROM process.TBL_IPA WHERE ID_Ejecucion = @ID_Ejecucion
            UNION SELECT ID_Fund FROM process.TBL_CAPM WHERE ID_Ejecucion = @ID_Ejecucion
            UNION SELECT ID_Fund FROM process.TBL_PNL_IPA WHERE ID_Ejecucion = @ID_Ejecucion
            UNION SELECT ID_Fund FROM process.TBL_Derivados WHERE ID_Ejecucion = @ID_Ejecucion
            UNION SELECT ID_Fund FROM process.TBL_MLCCII WHERE ID_Ejecucion = @ID_Ejecucion
            UNION SELECT ID_Fund FROM process.TBL_MLCCII_Derivados WHERE ID_Ejecucion = @ID_Ejecucion
        ) AS AllFunds;

        IF @Debug = 1
        BEGIN
            PRINT '  - process.TBL_IPA: ' + CAST(@RowCount_IPA AS VARCHAR);
            PRINT '  - process.TBL_CAPM: ' + CAST(@RowCount_CAPM AS VARCHAR);
            PRINT '  - process.TBL_PNL_IPA: ' + CAST(@RowCount_PNL_IPA AS VARCHAR);
            PRINT '  - process.TBL_Derivados: ' + CAST(@RowCount_Derivados AS VARCHAR);
            PRINT '  - process.TBL_MLCCII: ' + CAST(@RowCount_MLCCII AS VARCHAR);
            PRINT '  - process.TBL_MLCCII_Derivados: ' + CAST(@RowCount_MLCCII_Derivados AS VARCHAR);
            PRINT '  - Total: ' + CAST(@TotalRows AS VARCHAR);
            PRINT '  - Fondos: ' + CAST(@FundsProcessed AS VARCHAR);
        END

        -- PASO 2: Validar mínimos
        IF @TotalRows = 0
        BEGIN
            SET @ErrorMsg = 'No se encontraron datos para ID_Ejecucion = ' + CAST(@ID_Ejecucion AS VARCHAR);
            RAISERROR(@ErrorMsg, 16, 1);
            RETURN 3;
        END

        -- PASO 3: Log de consolidación
        INSERT INTO logs.Ejecucion_Logs (ID_Ejecucion, ID_Fund, Timestamp, Nivel, Categoria, Etapa, Mensaje)
        VALUES (@ID_Ejecucion, 0, GETDATE(), 'INFO', 'PIPELINE', 'CONCATENAR',
            'Consolidacion: ' + CAST(@TotalRows AS VARCHAR) + ' registros, ' + CAST(@FundsProcessed AS VARCHAR) + ' fondos');

        -- Retornar resultado
        SELECT @ID_Ejecucion AS ID_Ejecucion, @TotalRows AS TotalRows, @FundsProcessed AS FundsProcessed,
            @RowCount_IPA AS Rows_IPA, @RowCount_CAPM AS Rows_CAPM, @RowCount_PNL_IPA AS Rows_PNL_IPA,
            @RowCount_Derivados AS Rows_Derivados, @RowCount_MLCCII AS Rows_MLCCII,
            @RowCount_MLCCII_Derivados AS Rows_MLCCII_Derivados,
            DATEDIFF(MILLISECOND, @StartTime, GETDATE()) AS DurationMs, 0 AS ReturnCode, 'OK' AS Status;

        RETURN 0;

    END TRY
    BEGIN CATCH
        SET @ErrorMsg = ERROR_MESSAGE();
        INSERT INTO logs.Ejecucion_Logs (ID_Ejecucion, ID_Fund, Timestamp, Nivel, Categoria, Etapa, Mensaje)
        VALUES (@ID_Ejecucion, 0, GETDATE(), 'ERROR', 'PIPELINE', 'CONCATENAR', 'ERROR: ' + @ErrorMsg);

        SELECT @ID_Ejecucion AS ID_Ejecucion, 0 AS TotalRows, 0 AS FundsProcessed,
            0 AS Rows_IPA, 0 AS Rows_CAPM, 0 AS Rows_PNL_IPA, 0 AS Rows_Derivados,
            0 AS Rows_MLCCII, 0 AS Rows_MLCCII_Derivados,
            DATEDIFF(MILLISECOND, @StartTime, GETDATE()) AS DurationMs, 3 AS ReturnCode, @ErrorMsg AS Status;

        RETURN 3;
    END CATCH
END;
GO

PRINT '    CREATED staging.Concatenar_Cubo_v2';
PRINT '';

-- =====================================================
-- 3. Crear process.Cleanup_Ejecucion
-- =====================================================
PRINT '>>> Creando process.Cleanup_Ejecucion...';

IF OBJECT_ID('process.Cleanup_Ejecucion', 'P') IS NOT NULL
    DROP PROCEDURE process.Cleanup_Ejecucion;
GO

CREATE PROCEDURE process.Cleanup_Ejecucion
    @ID_Ejecucion BIGINT = NULL,
    @RetentionDays INT = 7,
    @Debug BIT = 0
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @StartTime DATETIME = GETDATE();
    DECLARE @TotalDeleted INT = 0;
    DECLARE @Deleted INT;
    DECLARE @CutoffDate DATETIME = DATEADD(DAY, -@RetentionDays, GETDATE());
    DECLARE @ErrorMsg NVARCHAR(MAX);

    BEGIN TRY
        IF @Debug = 1
        BEGIN
            PRINT 'Cleanup_Ejecucion iniciado';
            IF @ID_Ejecucion IS NOT NULL
                PRINT '  - Modo: Eliminar ID_Ejecucion = ' + CAST(@ID_Ejecucion AS VARCHAR);
            ELSE
                PRINT '  - Modo: Eliminar datos anteriores a ' + CONVERT(VARCHAR, @CutoffDate, 120);
        END

        -- Cleanup process.TBL_IPA
        IF @ID_Ejecucion IS NOT NULL
            DELETE FROM process.TBL_IPA WHERE ID_Ejecucion = @ID_Ejecucion;
        ELSE
            DELETE FROM process.TBL_IPA WHERE FechaProceso < CONVERT(VARCHAR, @CutoffDate, 120);
        SET @Deleted = @@ROWCOUNT;
        SET @TotalDeleted = @TotalDeleted + @Deleted;
        IF @Debug = 1 PRINT '  - TBL_IPA: ' + CAST(@Deleted AS VARCHAR) + ' registros eliminados';

        -- Cleanup process.TBL_CAPM
        IF @ID_Ejecucion IS NOT NULL
            DELETE FROM process.TBL_CAPM WHERE ID_Ejecucion = @ID_Ejecucion;
        ELSE
            DELETE FROM process.TBL_CAPM WHERE FechaProceso < CONVERT(VARCHAR, @CutoffDate, 120);
        SET @Deleted = @@ROWCOUNT;
        SET @TotalDeleted = @TotalDeleted + @Deleted;
        IF @Debug = 1 PRINT '  - TBL_CAPM: ' + CAST(@Deleted AS VARCHAR) + ' registros eliminados';

        -- Cleanup process.TBL_PNL_IPA
        IF @ID_Ejecucion IS NOT NULL
            DELETE FROM process.TBL_PNL_IPA WHERE ID_Ejecucion = @ID_Ejecucion;
        ELSE
            DELETE FROM process.TBL_PNL_IPA WHERE FechaProceso < CONVERT(VARCHAR, @CutoffDate, 120);
        SET @Deleted = @@ROWCOUNT;
        SET @TotalDeleted = @TotalDeleted + @Deleted;
        IF @Debug = 1 PRINT '  - TBL_PNL_IPA: ' + CAST(@Deleted AS VARCHAR) + ' registros eliminados';

        -- Cleanup process.TBL_Derivados
        IF @ID_Ejecucion IS NOT NULL
            DELETE FROM process.TBL_Derivados WHERE ID_Ejecucion = @ID_Ejecucion;
        ELSE
            DELETE FROM process.TBL_Derivados WHERE FechaProceso < CONVERT(VARCHAR, @CutoffDate, 120);
        SET @Deleted = @@ROWCOUNT;
        SET @TotalDeleted = @TotalDeleted + @Deleted;
        IF @Debug = 1 PRINT '  - TBL_Derivados: ' + CAST(@Deleted AS VARCHAR) + ' registros eliminados';

        -- Cleanup process.TBL_MLCCII
        IF @ID_Ejecucion IS NOT NULL
            DELETE FROM process.TBL_MLCCII WHERE ID_Ejecucion = @ID_Ejecucion;
        ELSE
            DELETE FROM process.TBL_MLCCII WHERE FechaProceso < CONVERT(VARCHAR, @CutoffDate, 120);
        SET @Deleted = @@ROWCOUNT;
        SET @TotalDeleted = @TotalDeleted + @Deleted;
        IF @Debug = 1 PRINT '  - TBL_MLCCII: ' + CAST(@Deleted AS VARCHAR) + ' registros eliminados';

        -- Cleanup process.TBL_MLCCII_Derivados
        IF @ID_Ejecucion IS NOT NULL
            DELETE FROM process.TBL_MLCCII_Derivados WHERE ID_Ejecucion = @ID_Ejecucion;
        ELSE
            DELETE FROM process.TBL_MLCCII_Derivados WHERE FechaProceso < CONVERT(VARCHAR, @CutoffDate, 120);
        SET @Deleted = @@ROWCOUNT;
        SET @TotalDeleted = @TotalDeleted + @Deleted;
        IF @Debug = 1 PRINT '  - TBL_MLCCII_Derivados: ' + CAST(@Deleted AS VARCHAR) + ' registros eliminados';

        IF @Debug = 1
        BEGIN
            PRINT 'Cleanup completado';
            PRINT '  - Total eliminados: ' + CAST(@TotalDeleted AS VARCHAR);
            PRINT '  - Duracion: ' + CAST(DATEDIFF(MILLISECOND, @StartTime, GETDATE()) AS VARCHAR) + ' ms';
        END

        SELECT @TotalDeleted AS TotalDeleted,
               DATEDIFF(MILLISECOND, @StartTime, GETDATE()) AS DurationMs,
               0 AS ReturnCode, 'OK' AS Status;

        RETURN 0;

    END TRY
    BEGIN CATCH
        SET @ErrorMsg = ERROR_MESSAGE();
        SELECT 0 AS TotalDeleted,
               DATEDIFF(MILLISECOND, @StartTime, GETDATE()) AS DurationMs,
               3 AS ReturnCode, @ErrorMsg AS Status;
        RETURN 3;
    END CATCH
END;
GO

PRINT '    CREATED process.Cleanup_Ejecucion';
PRINT '';
PRINT '=== Migration 010 completada ===';
PRINT '';

-- =====================================================
-- Verificación
-- =====================================================
PRINT '>>> Verificación:';

SELECT SCHEMA_NAME(schema_id) as SchemaName, name AS SP_Name, create_date
FROM sys.procedures
WHERE name IN ('Concatenar_Cubo_v2', 'Cleanup_Ejecucion')
ORDER BY name;

SELECT * FROM config.StagingSourcesCubo ORDER BY IsActive DESC, SchemaName, TableName;
