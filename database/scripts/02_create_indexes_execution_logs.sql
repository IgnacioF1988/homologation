-- ============================================
-- Script: Crear Índices Optimizados para logs.Ejecucion_Logs
-- Database: Inteligencia_Producto_Dev
-- Purpose: Optimizar INSERT masivos y queries de consulta
-- ============================================

USE Inteligencia_Producto_Dev;
GO

PRINT 'Creando índices optimizados en logs.Ejecucion_Logs...';
GO

-- ============================================
-- Verificar estructura actual de la tabla
-- ============================================
PRINT 'Estructura actual de logs.Ejecucion_Logs:';
EXEC sp_help 'logs.Ejecucion_Logs';
GO

-- ============================================
-- 1. CLUSTERED INDEX para append eficiente
-- ============================================
-- Este índice evita hotspot en la última página durante inserts masivos
-- Usa ID_Ejecucion + Timestamp para distribución

PRINT 'Verificando índice clustered existente...';
IF EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID('logs.Ejecucion_Logs')
    AND type_desc = 'CLUSTERED'
)
BEGIN
    PRINT 'Ya existe un índice clustered. Verificando si necesita recreación...';

    -- Obtener nombre del índice clustered actual
    DECLARE @ClusteredIndexName NVARCHAR(128);
    SELECT @ClusteredIndexName = name
    FROM sys.indexes
    WHERE object_id = OBJECT_ID('logs.Ejecucion_Logs')
    AND type_desc = 'CLUSTERED';

    PRINT 'Índice clustered actual: ' + @ClusteredIndexName;

    -- Solo recrear si NO es el óptimo
    IF @ClusteredIndexName <> 'IX_EjecucionLogs_Ejecucion_Timestamp'
    BEGIN
        PRINT 'Eliminando índice clustered subóptimo...';
        EXEC('DROP INDEX ' + @ClusteredIndexName + ' ON logs.Ejecucion_Logs');

        PRINT 'Creando índice clustered optimizado...';
        CREATE CLUSTERED INDEX IX_EjecucionLogs_Ejecucion_Timestamp
        ON logs.Ejecucion_Logs (ID_Ejecucion, Timestamp);

        PRINT 'Índice clustered optimizado creado exitosamente.';
    END
    ELSE
    BEGIN
        PRINT 'Índice clustered ya es óptimo. No se requiere acción.';
    END
END
ELSE
BEGIN
    PRINT 'Creando índice clustered optimizado...';
    CREATE CLUSTERED INDEX IX_EjecucionLogs_Ejecucion_Timestamp
    ON logs.Ejecucion_Logs (ID_Ejecucion, Timestamp);

    PRINT 'Índice clustered creado exitosamente.';
END
GO

-- ============================================
-- 2. NON-CLUSTERED INDEX para queries por fondo
-- ============================================
PRINT 'Creando índice non-clustered para consultas por fondo...';

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID('logs.Ejecucion_Logs')
    AND name = 'IX_EjecucionLogs_Fund_Nivel'
)
BEGIN
    CREATE NONCLUSTERED INDEX IX_EjecucionLogs_Fund_Nivel
    ON logs.Ejecucion_Logs (ID_Fund, Nivel)
    INCLUDE (Timestamp, Etapa, Mensaje);

    PRINT 'Índice IX_EjecucionLogs_Fund_Nivel creado exitosamente.';
END
ELSE
BEGIN
    PRINT 'Índice IX_EjecucionLogs_Fund_Nivel ya existe.';
END
GO

-- ============================================
-- 3. NON-CLUSTERED INDEX para filtros por nivel
-- ============================================
PRINT 'Creando índice non-clustered para filtros por nivel (ERROR, WARNING)...';

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID('logs.Ejecucion_Logs')
    AND name = 'IX_EjecucionLogs_Nivel_Timestamp'
)
BEGIN
    CREATE NONCLUSTERED INDEX IX_EjecucionLogs_Nivel_Timestamp
    ON logs.Ejecucion_Logs (Nivel, Timestamp DESC)
    WHERE Nivel IN ('ERROR', 'WARNING');  -- Filtered index para eficiencia

    PRINT 'Índice filtrado IX_EjecucionLogs_Nivel_Timestamp creado exitosamente.';
END
ELSE
BEGIN
    PRINT 'Índice IX_EjecucionLogs_Nivel_Timestamp ya existe.';
END
GO

-- ============================================
-- 4. Verificar índices creados
-- ============================================
PRINT '';
PRINT '============================================';
PRINT 'Índices actuales en logs.Ejecucion_Logs:';
PRINT '============================================';

SELECT
    i.name AS Index_Name,
    i.type_desc AS Index_Type,
    STUFF((
        SELECT ', ' + c.name
        FROM sys.index_columns ic
        INNER JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
        WHERE ic.object_id = i.object_id AND ic.index_id = i.index_id
        ORDER BY ic.key_ordinal
        FOR XML PATH('')
    ), 1, 2, '') AS Key_Columns,
    i.has_filter AS Is_Filtered,
    i.filter_definition AS Filter_Definition
FROM sys.indexes i
WHERE i.object_id = OBJECT_ID('logs.Ejecucion_Logs')
ORDER BY i.type_desc, i.name;
GO

-- ============================================
-- 5. Estadísticas de la tabla
-- ============================================
PRINT '';
PRINT '============================================';
PRINT 'Estadísticas de logs.Ejecucion_Logs:';
PRINT '============================================';

SELECT
    OBJECT_NAME(object_id) AS Table_Name,
    SUM(row_count) AS Total_Rows,
    SUM(reserved_page_count) * 8 / 1024.0 AS Reserved_MB,
    SUM(used_page_count) * 8 / 1024.0 AS Used_MB
FROM sys.dm_db_partition_stats
WHERE object_id = OBJECT_ID('logs.Ejecucion_Logs')
GROUP BY object_id;
GO

PRINT '';
PRINT '============================================';
PRINT 'Script completado exitosamente.';
PRINT 'Índices optimizados creados/verificados.';
PRINT '============================================';
GO
