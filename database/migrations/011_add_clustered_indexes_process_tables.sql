-- =====================================================
-- MIGRATION 011: Add Clustered Indexes to Process Tables
-- Date: 2025-12-29
-- Description: Agregar clustered indexes a tablas process.*
--              que son HEAP para evitar lock escalation
--              durante operaciones concurrentes
--
-- PROBLEMA: Sin clustered index, DELETE/INSERT concurrentes
--           causan lock escalation a nivel de tabla,
--           generando "uncommittable transaction" errors
-- =====================================================

SET NOCOUNT ON;

PRINT '=== Migration 011: Add Clustered Indexes to Process Tables ===';
PRINT 'Fecha: ' + CONVERT(VARCHAR, GETDATE(), 120);
PRINT '';

-- =====================================================
-- 1. process.TBL_PNL_IPA - Principal causante del error
-- =====================================================
PRINT '>>> Agregando clustered index a process.TBL_PNL_IPA...';

-- Primero agregar columna ID si no existe
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'process'
    AND TABLE_NAME = 'TBL_PNL_IPA'
    AND COLUMN_NAME = 'ID'
)
BEGIN
    ALTER TABLE process.TBL_PNL_IPA ADD ID BIGINT IDENTITY(1,1);
    PRINT '    Columna ID agregada';
END

-- Crear clustered index en ID
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('process.TBL_PNL_IPA')
    AND type_desc = 'CLUSTERED'
)
BEGIN
    CREATE CLUSTERED INDEX IX_TBL_PNL_IPA_ID ON process.TBL_PNL_IPA (ID);
    PRINT '    Clustered index IX_TBL_PNL_IPA_ID creado';
END
ELSE
BEGIN
    PRINT '    Clustered index ya existe - SKIPPED';
END

-- Verificar que el nonclustered index existe
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('process.TBL_PNL_IPA')
    AND name = 'IX_TBL_PNL_IPA_Ejecucion'
)
BEGIN
    CREATE NONCLUSTERED INDEX IX_TBL_PNL_IPA_Ejecucion
    ON process.TBL_PNL_IPA (ID_Ejecucion, ID_Fund);
    PRINT '    Nonclustered index IX_TBL_PNL_IPA_Ejecucion creado';
END

PRINT '';

-- =====================================================
-- 2. process.TBL_IPA
-- =====================================================
PRINT '>>> Agregando clustered index a process.TBL_IPA...';

IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'process'
    AND TABLE_NAME = 'TBL_IPA'
    AND COLUMN_NAME = 'ID'
)
BEGIN
    ALTER TABLE process.TBL_IPA ADD ID BIGINT IDENTITY(1,1);
    PRINT '    Columna ID agregada';
END

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('process.TBL_IPA')
    AND type_desc = 'CLUSTERED'
)
BEGIN
    CREATE CLUSTERED INDEX IX_TBL_IPA_ID ON process.TBL_IPA (ID);
    PRINT '    Clustered index IX_TBL_IPA_ID creado';
END
ELSE
BEGIN
    PRINT '    Clustered index ya existe - SKIPPED';
END

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('process.TBL_IPA')
    AND name = 'IX_TBL_IPA_Ejecucion'
)
BEGIN
    CREATE NONCLUSTERED INDEX IX_TBL_IPA_Ejecucion
    ON process.TBL_IPA (ID_Ejecucion, ID_Fund);
    PRINT '    Nonclustered index IX_TBL_IPA_Ejecucion creado';
END

PRINT '';

-- =====================================================
-- 3. process.TBL_PNL
-- =====================================================
PRINT '>>> Agregando clustered index a process.TBL_PNL...';

IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'process'
    AND TABLE_NAME = 'TBL_PNL'
    AND COLUMN_NAME = 'ID'
)
BEGIN
    ALTER TABLE process.TBL_PNL ADD ID BIGINT IDENTITY(1,1);
    PRINT '    Columna ID agregada';
END

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('process.TBL_PNL')
    AND type_desc = 'CLUSTERED'
)
BEGIN
    CREATE CLUSTERED INDEX IX_TBL_PNL_ID ON process.TBL_PNL (ID);
    PRINT '    Clustered index IX_TBL_PNL_ID creado';
END
ELSE
BEGIN
    PRINT '    Clustered index ya existe - SKIPPED';
END

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('process.TBL_PNL')
    AND name = 'IX_TBL_PNL_Ejecucion'
)
BEGIN
    CREATE NONCLUSTERED INDEX IX_TBL_PNL_Ejecucion
    ON process.TBL_PNL (ID_Ejecucion, ID_Fund);
    PRINT '    Nonclustered index IX_TBL_PNL_Ejecucion creado';
END

PRINT '';
PRINT '=== Migration 011 completada ===';
PRINT '';

-- =====================================================
-- Verificacion
-- =====================================================
PRINT '>>> Verificacion de indices:';

SELECT
    OBJECT_SCHEMA_NAME(i.object_id) as SchemaName,
    OBJECT_NAME(i.object_id) as TableName,
    i.name as IndexName,
    i.type_desc as IndexType
FROM sys.indexes i
WHERE OBJECT_SCHEMA_NAME(i.object_id) = 'process'
AND OBJECT_NAME(i.object_id) IN ('TBL_IPA', 'TBL_PNL', 'TBL_PNL_IPA')
AND i.name IS NOT NULL
ORDER BY TableName, IndexType;
