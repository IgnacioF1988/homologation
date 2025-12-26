-- =============================================
-- Migration 013: Modificar logs.Ejecuciones
-- Descripción: Agregar columnas ID_Proceso e ID_Fund para arquitectura jerárquica
-- Fecha: 2025-12-26
-- Autor: Claude Code
-- =============================================

USE Inteligencia_Producto_Dev;
GO

PRINT '================================================';
PRINT 'MIGRACIÓN 013: Modificar logs.Ejecuciones';
PRINT '================================================';
PRINT '';

-- Verificar que logs.Procesos exista antes de continuar
IF NOT EXISTS (SELECT * FROM sys.tables WHERE schema_id = SCHEMA_ID('logs') AND name = 'Procesos')
BEGIN
    RAISERROR('❌ ERROR: La tabla logs.Procesos no existe. Ejecute la migración 012 primero.', 16, 1);
    RETURN;
END

-- =============================================
-- PASO 1: Agregar columnas ID_Proceso e ID_Fund
-- =============================================
IF NOT EXISTS (
    SELECT * FROM sys.columns
    WHERE object_id = OBJECT_ID('logs.Ejecuciones')
    AND name = 'ID_Proceso'
)
BEGIN
    PRINT '✓ Agregando columna ID_Proceso a logs.Ejecuciones...';

    ALTER TABLE logs.Ejecuciones
    ADD ID_Proceso BIGINT NULL;

    PRINT '✓ Columna ID_Proceso agregada';
END
ELSE
BEGIN
    PRINT '⚠ La columna ID_Proceso ya existe en logs.Ejecuciones';
END
GO

IF NOT EXISTS (
    SELECT * FROM sys.columns
    WHERE object_id = OBJECT_ID('logs.Ejecuciones')
    AND name = 'ID_Fund'
)
BEGIN
    PRINT '✓ Agregando columna ID_Fund a logs.Ejecuciones...';

    ALTER TABLE logs.Ejecuciones
    ADD ID_Fund INT NULL;

    PRINT '✓ Columna ID_Fund agregada';
END
ELSE
BEGIN
    PRINT '⚠ La columna ID_Fund ya existe en logs.Ejecuciones';
END
GO

-- =============================================
-- PASO 2: Backfill de datos históricos
-- =============================================
PRINT '';
PRINT '✓ Ejecutando backfill de datos históricos...';

-- Actualizar ejecuciones existentes con ID_Proceso sintético
-- ID_Proceso = ID_Ejecucion (las ejecuciones antiguas se convierten en su propio proceso)
UPDATE logs.Ejecuciones
SET ID_Proceso = ID_Ejecucion
WHERE ID_Proceso IS NULL;

DECLARE @rowsUpdated INT = @@ROWCOUNT;
PRINT '✓ ' + CAST(@rowsUpdated AS NVARCHAR(10)) + ' ejecuciones actualizadas con ID_Proceso sintético';

-- Crear registros en logs.Procesos para ejecuciones históricas
INSERT INTO logs.Procesos (
    ID_Proceso,
    FechaReporte,
    Estado,
    FechaInicio,
    FechaFin,
    TotalFondos,
    FondosExitosos,
    FondosFallidos,
    Observaciones
)
SELECT DISTINCT
    e.ID_Ejecucion AS ID_Proceso, -- Usar ID_Ejecucion como ID_Proceso
    e.FechaReporte,
    CASE
        WHEN e.Estado = 'COMPLETADO' THEN 'COMPLETADO'
        WHEN e.Estado = 'ERROR' THEN 'ERROR'
        ELSE 'EN_PROGRESO'
    END AS Estado,
    e.FechaInicio,
    e.FechaFin,
    1 AS TotalFondos, -- Ejecuciones viejas = 1 fondo por ejecución
    CASE WHEN e.Estado = 'COMPLETADO' THEN 1 ELSE 0 END AS FondosExitosos,
    CASE WHEN e.Estado = 'ERROR' THEN 1 ELSE 0 END AS FondosFallidos,
    'Backfilled from legacy execution - Migration 013' AS Observaciones
FROM logs.Ejecuciones e
WHERE NOT EXISTS (
    SELECT 1 FROM logs.Procesos p
    WHERE p.ID_Proceso = e.ID_Ejecucion
);

DECLARE @processesCreated INT = @@ROWCOUNT;
PRINT '✓ ' + CAST(@processesCreated AS NVARCHAR(10)) + ' procesos históricos creados';

GO

-- =============================================
-- PASO 3: Crear foreign key constraint
-- =============================================
IF NOT EXISTS (
    SELECT * FROM sys.foreign_keys
    WHERE name = 'FK_Ejecuciones_Procesos'
)
BEGIN
    PRINT '';
    PRINT '✓ Creando foreign key FK_Ejecuciones_Procesos...';

    ALTER TABLE logs.Ejecuciones
    ADD CONSTRAINT FK_Ejecuciones_Procesos
    FOREIGN KEY (ID_Proceso)
    REFERENCES logs.Procesos(ID_Proceso);

    PRINT '✓ Foreign key creada exitosamente';
END
ELSE
BEGIN
    PRINT '⚠ Foreign key FK_Ejecuciones_Procesos ya existe';
END
GO

-- =============================================
-- PASO 4: Crear índices
-- =============================================
IF NOT EXISTS (
    SELECT * FROM sys.indexes
    WHERE object_id = OBJECT_ID('logs.Ejecuciones')
    AND name = 'IX_Ejecuciones_Proceso'
)
BEGIN
    PRINT '✓ Creando índice IX_Ejecuciones_Proceso...';

    CREATE NONCLUSTERED INDEX IX_Ejecuciones_Proceso
    ON logs.Ejecuciones(ID_Proceso)
    INCLUDE (ID_Ejecucion, ID_Fund, FechaReporte, Estado);

    PRINT '✓ Índice IX_Ejecuciones_Proceso creado';
END
ELSE
BEGIN
    PRINT '⚠ Índice IX_Ejecuciones_Proceso ya existe';
END
GO

IF NOT EXISTS (
    SELECT * FROM sys.indexes
    WHERE object_id = OBJECT_ID('logs.Ejecuciones')
    AND name = 'IX_Ejecuciones_Fund'
)
BEGIN
    PRINT '✓ Creando índice IX_Ejecuciones_Fund...';

    CREATE NONCLUSTERED INDEX IX_Ejecuciones_Fund
    ON logs.Ejecuciones(ID_Fund)
    INCLUDE (ID_Ejecucion, ID_Proceso, FechaReporte, Estado)
    WHERE ID_Fund IS NOT NULL;

    PRINT '✓ Índice IX_Ejecuciones_Fund creado';
END
ELSE
BEGIN
    PRINT '⚠ Índice IX_Ejecuciones_Fund ya existe';
END
GO

-- =============================================
-- PASO 5: Agregar check constraints
-- =============================================
IF NOT EXISTS (
    SELECT * FROM sys.check_constraints
    WHERE name = 'CHK_Ejecuciones_ID_Fund_Positive'
)
BEGIN
    PRINT '✓ Creando constraint CHK_Ejecuciones_ID_Fund_Positive...';

    ALTER TABLE logs.Ejecuciones
    ADD CONSTRAINT CHK_Ejecuciones_ID_Fund_Positive
    CHECK (ID_Fund IS NULL OR ID_Fund > 0);

    PRINT '✓ Constraint creado';
END
ELSE
BEGIN
    PRINT '⚠ Constraint CHK_Ejecuciones_ID_Fund_Positive ya existe';
END
GO

-- =============================================
-- PASO 6: Agregar descripciones extendidas
-- =============================================
IF NOT EXISTS (
    SELECT * FROM sys.extended_properties
    WHERE major_id = OBJECT_ID('logs.Ejecuciones')
    AND minor_id = (SELECT column_id FROM sys.columns WHERE object_id = OBJECT_ID('logs.Ejecuciones') AND name = 'ID_Proceso')
    AND name = 'MS_Description'
)
BEGIN
    EXEC sys.sp_addextendedproperty
        @name = N'MS_Description',
        @value = N'FK a logs.Procesos. Agrupa múltiples ejecuciones de fondos bajo un mismo proceso padre.',
        @level0type = N'SCHEMA', @level0name = N'logs',
        @level1type = N'TABLE', @level1name = N'Ejecuciones',
        @level2type = N'COLUMN', @level2name = N'ID_Proceso';
END
GO

IF NOT EXISTS (
    SELECT * FROM sys.extended_properties
    WHERE major_id = OBJECT_ID('logs.Ejecuciones')
    AND minor_id = (SELECT column_id FROM sys.columns WHERE object_id = OBJECT_ID('logs.Ejecuciones') AND name = 'ID_Fund')
    AND name = 'MS_Description'
)
BEGIN
    EXEC sys.sp_addextendedproperty
        @name = N'MS_Description',
        @value = N'ID del fondo específico para esta ejecución. Permite identificar qué fondo se está procesando.',
        @level0type = N'SCHEMA', @level0name = N'logs',
        @level1type = N'TABLE', @level1name = N'Ejecuciones',
        @level2type = N'COLUMN', @level2name = N'ID_Fund';
END
GO

-- =============================================
-- PASO 7: Verificación final
-- =============================================
PRINT '';
PRINT '================================================';
PRINT 'VERIFICACIÓN DE MIGRACIÓN 013';
PRINT '================================================';

-- Verificar columnas
IF EXISTS (
    SELECT * FROM sys.columns
    WHERE object_id = OBJECT_ID('logs.Ejecuciones')
    AND name IN ('ID_Proceso', 'ID_Fund')
)
BEGIN
    PRINT '✓ Columnas ID_Proceso e ID_Fund creadas correctamente';

    SELECT
        COLUMN_NAME,
        DATA_TYPE,
        IS_NULLABLE,
        COLUMN_DEFAULT
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'logs'
    AND TABLE_NAME = 'Ejecuciones'
    AND COLUMN_NAME IN ('ID_Proceso', 'ID_Fund')
    ORDER BY COLUMN_NAME;
END

-- Verificar foreign key
IF EXISTS (
    SELECT * FROM sys.foreign_keys
    WHERE name = 'FK_Ejecuciones_Procesos'
)
BEGIN
    PRINT '✓ Foreign key FK_Ejecuciones_Procesos creada correctamente';
END

-- Verificar índices
IF EXISTS (
    SELECT * FROM sys.indexes
    WHERE object_id = OBJECT_ID('logs.Ejecuciones')
    AND name IN ('IX_Ejecuciones_Proceso', 'IX_Ejecuciones_Fund')
)
BEGIN
    PRINT '✓ Índices creados correctamente';

    SELECT
        name AS IndexName,
        type_desc AS IndexType,
        is_unique AS IsUnique
    FROM sys.indexes
    WHERE object_id = OBJECT_ID('logs.Ejecuciones')
    AND name IN ('IX_Ejecuciones_Proceso', 'IX_Ejecuciones_Fund')
    ORDER BY name;
END

-- Verificar datos
DECLARE @totalEjecuciones INT;
DECLARE @ejecucionesConProceso INT;

SELECT @totalEjecuciones = COUNT(*) FROM logs.Ejecuciones;
SELECT @ejecucionesConProceso = COUNT(*) FROM logs.Ejecuciones WHERE ID_Proceso IS NOT NULL;

PRINT '';
PRINT 'Estadísticas de datos:';
PRINT '  Total ejecuciones: ' + CAST(@totalEjecuciones AS NVARCHAR(10));
PRINT '  Con ID_Proceso: ' + CAST(@ejecucionesConProceso AS NVARCHAR(10));

IF @totalEjecuciones = @ejecucionesConProceso
BEGIN
    PRINT '';
    PRINT '================================================';
    PRINT '✅ MIGRACIÓN 013 COMPLETADA EXITOSAMENTE';
    PRINT '================================================';
    PRINT '';
END
ELSE
BEGIN
    PRINT '';
    PRINT '================================================';
    PRINT '⚠ ADVERTENCIA: No todas las ejecuciones tienen ID_Proceso';
    PRINT '================================================';
    PRINT '';
END
GO
