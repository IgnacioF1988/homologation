/*
 * Migration: 004_add_execution_tracking_to_ipa_tables.sql
 *
 * Fecha: 2025-12-19
 *
 * Descripción:
 * Agrega columnas de tracking (ID_Ejecucion, ID_Fund) a las tablas de IPA/CASH
 * para soportar procesamiento paralelo por fondo.
 *
 * Tablas afectadas:
 * - staging.IPA_WorkTable
 * - staging.IPA
 * - staging.IPA_Cash
 * - staging.IPA_Final
 *
 * Cambios:
 * - Agrega ID_Ejecucion (BIGINT NOT NULL DEFAULT 0)
 * - Agrega ID_Fund (INT NOT NULL DEFAULT 0)
 * - Crea índices no agrupados para optimizar consultas por ejecución/fondo
 */

USE [Inteligencia_Producto_Dev];
GO

PRINT 'Iniciando migración 004: IPA Tables Execution Tracking...';
GO

-- =====================================================
-- TABLA 1: staging.IPA_WorkTable
-- =====================================================
PRINT 'Procesando staging.IPA_WorkTable...';

-- Agregar ID_Ejecucion
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'staging'
      AND TABLE_NAME = 'IPA_WorkTable'
      AND COLUMN_NAME = 'ID_Ejecucion'
)
BEGIN
    ALTER TABLE staging.IPA_WorkTable ADD ID_Ejecucion BIGINT NOT NULL DEFAULT 0;
    PRINT '  - Columna ID_Ejecucion agregada';
END
ELSE
    PRINT '  - Columna ID_Ejecucion ya existe';

-- Agregar ID_Fund
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'staging'
      AND TABLE_NAME = 'IPA_WorkTable'
      AND COLUMN_NAME = 'ID_Fund'
)
BEGIN
    ALTER TABLE staging.IPA_WorkTable ADD ID_Fund INT NOT NULL DEFAULT 0;
    PRINT '  - Columna ID_Fund agregada';
END
ELSE
    PRINT '  - Columna ID_Fund ya existe';

-- Crear índice
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_IPA_WorkTable_Ejecucion_Fund'
      AND object_id = OBJECT_ID('staging.IPA_WorkTable')
)
BEGIN
    CREATE NONCLUSTERED INDEX IX_IPA_WorkTable_Ejecucion_Fund
    ON staging.IPA_WorkTable (ID_Ejecucion, ID_Fund)
    INCLUDE (FechaReporte, Portfolio, Source);
    PRINT '  - Índice IX_IPA_WorkTable_Ejecucion_Fund creado';
END
ELSE
    PRINT '  - Índice IX_IPA_WorkTable_Ejecucion_Fund ya existe';

-- =====================================================
-- TABLA 2: staging.IPA
-- =====================================================
PRINT 'Procesando staging.IPA...';

-- Agregar ID_Ejecucion
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'staging'
      AND TABLE_NAME = 'IPA'
      AND COLUMN_NAME = 'ID_Ejecucion'
)
BEGIN
    ALTER TABLE staging.IPA ADD ID_Ejecucion BIGINT NOT NULL DEFAULT 0;
    PRINT '  - Columna ID_Ejecucion agregada';
END
ELSE
    PRINT '  - Columna ID_Ejecucion ya existe';

-- Agregar ID_Fund
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'staging'
      AND TABLE_NAME = 'IPA'
      AND COLUMN_NAME = 'ID_Fund'
)
BEGIN
    ALTER TABLE staging.IPA ADD ID_Fund INT NOT NULL DEFAULT 0;
    PRINT '  - Columna ID_Fund agregada';
END
ELSE
    PRINT '  - Columna ID_Fund ya existe';

-- Crear índice
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_IPA_Ejecucion_Fund'
      AND object_id = OBJECT_ID('staging.IPA')
)
BEGIN
    CREATE NONCLUSTERED INDEX IX_IPA_Ejecucion_Fund
    ON staging.IPA (ID_Ejecucion, ID_Fund)
    INCLUDE (FechaReporte, ID_Instrumento, id_CURR);
    PRINT '  - Índice IX_IPA_Ejecucion_Fund creado';
END
ELSE
    PRINT '  - Índice IX_IPA_Ejecucion_Fund ya existe';

-- =====================================================
-- TABLA 3: staging.IPA_Cash
-- =====================================================
PRINT 'Procesando staging.IPA_Cash...';

-- Agregar ID_Ejecucion
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'staging'
      AND TABLE_NAME = 'IPA_Cash'
      AND COLUMN_NAME = 'ID_Ejecucion'
)
BEGIN
    ALTER TABLE staging.IPA_Cash ADD ID_Ejecucion BIGINT NOT NULL DEFAULT 0;
    PRINT '  - Columna ID_Ejecucion agregada';
END
ELSE
    PRINT '  - Columna ID_Ejecucion ya existe';

-- Agregar ID_Fund
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'staging'
      AND TABLE_NAME = 'IPA_Cash'
      AND COLUMN_NAME = 'ID_Fund'
)
BEGIN
    ALTER TABLE staging.IPA_Cash ADD ID_Fund INT NOT NULL DEFAULT 0;
    PRINT '  - Columna ID_Fund agregada';
END
ELSE
    PRINT '  - Columna ID_Fund ya existe';

-- Crear índice
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_IPA_Cash_Ejecucion_Fund'
      AND object_id = OBJECT_ID('staging.IPA_Cash')
)
BEGIN
    CREATE NONCLUSTERED INDEX IX_IPA_Cash_Ejecucion_Fund
    ON staging.IPA_Cash (ID_Ejecucion, ID_Fund)
    INCLUDE (FechaReporte);
    PRINT '  - Índice IX_IPA_Cash_Ejecucion_Fund creado';
END
ELSE
    PRINT '  - Índice IX_IPA_Cash_Ejecucion_Fund ya existe';

-- =====================================================
-- TABLA 4: staging.IPA_Final
-- =====================================================
PRINT 'Procesando staging.IPA_Final...';

-- Agregar ID_Ejecucion
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'staging'
      AND TABLE_NAME = 'IPA_Final'
      AND COLUMN_NAME = 'ID_Ejecucion'
)
BEGIN
    ALTER TABLE staging.IPA_Final ADD ID_Ejecucion BIGINT NOT NULL DEFAULT 0;
    PRINT '  - Columna ID_Ejecucion agregada';
END
ELSE
    PRINT '  - Columna ID_Ejecucion ya existe';

-- Agregar ID_Fund
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'staging'
      AND TABLE_NAME = 'IPA_Final'
      AND COLUMN_NAME = 'ID_Fund'
)
BEGIN
    ALTER TABLE staging.IPA_Final ADD ID_Fund INT NOT NULL DEFAULT 0;
    PRINT '  - Columna ID_Fund agregada';
END
ELSE
    PRINT '  - Columna ID_Fund ya existe';

-- Crear índice
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_IPA_Final_Ejecucion_Fund'
      AND object_id = OBJECT_ID('staging.IPA_Final')
)
BEGIN
    CREATE NONCLUSTERED INDEX IX_IPA_Final_Ejecucion_Fund
    ON staging.IPA_Final (ID_Ejecucion, ID_Fund)
    INCLUDE (FechaReporte);
    PRINT '  - Índice IX_IPA_Final_Ejecucion_Fund creado';
END
ELSE
    PRINT '  - Índice IX_IPA_Final_Ejecucion_Fund ya existe';

PRINT '';
PRINT 'Migración 004 completada exitosamente.';
PRINT 'Total: 4 tablas IPA actualizadas con tracking de ejecución/fondo.';
GO
