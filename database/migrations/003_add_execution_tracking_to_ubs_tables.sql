/*
 * MIGRACIÓN 003: Agregar columnas de tracking a tablas UBS
 *
 * Objetivo: Preparar tablas staging de UBS para arquitectura v2
 * Fecha: 2025-12-19
 * Versión: 1.0
 *
 * Tablas modificadas:
 * - staging.UBS_WorkTable
 * - staging.MLCCII_Derivados
 * - staging.MLCCII
 *
 * Columnas agregadas:
 * - ID_Ejecucion BIGINT NOT NULL DEFAULT 0
 * - ID_Fund INT NOT NULL DEFAULT 0
 *
 * Índices creados:
 * - IX_[Tabla]_Ejecucion_Fund (ID_Ejecucion, ID_Fund)
 *
 * Nota: UBS procesa fondos de Luxemburgo (MLCCII)
 *       UBS_02 y UBS_03 solo se ejecutan si Es_MLCCII = true
 */

USE [Inteligencia_Producto_Dev];
GO

SET NOCOUNT ON;
PRINT '========================================';
PRINT 'MIGRACIÓN 003: UBS - Agregar Tracking';
PRINT 'Fecha: ' + CONVERT(VARCHAR, GETDATE(), 120);
PRINT '========================================';
PRINT '';

-- ============================================
-- 1. staging.UBS_WorkTable
-- ============================================
PRINT '1. Modificando staging.UBS_WorkTable...';

IF NOT EXISTS (SELECT 1 FROM sys.columns
               WHERE object_id = OBJECT_ID('staging.UBS_WorkTable')
               AND name = 'ID_Ejecucion')
BEGIN
    ALTER TABLE staging.UBS_WorkTable
    ADD ID_Ejecucion BIGINT NOT NULL DEFAULT 0;

    PRINT '   ✓ Columna ID_Ejecucion agregada';
END
ELSE
BEGIN
    PRINT '   ⚠ Columna ID_Ejecucion ya existe (skip)';
END

IF NOT EXISTS (SELECT 1 FROM sys.columns
               WHERE object_id = OBJECT_ID('staging.UBS_WorkTable')
               AND name = 'ID_Fund')
BEGIN
    ALTER TABLE staging.UBS_WorkTable
    ADD ID_Fund INT NOT NULL DEFAULT 0;

    PRINT '   ✓ Columna ID_Fund agregada';
END
ELSE
BEGIN
    PRINT '   ⚠ Columna ID_Fund ya existe (skip)';
END

-- Crear índice compuesto
IF NOT EXISTS (SELECT 1 FROM sys.indexes
               WHERE object_id = OBJECT_ID('staging.UBS_WorkTable')
               AND name = 'IX_UBS_WorkTable_Ejecucion_Fund')
BEGIN
    CREATE NONCLUSTERED INDEX IX_UBS_WorkTable_Ejecucion_Fund
    ON staging.UBS_WorkTable (ID_Ejecucion, ID_Fund)
    INCLUDE (FechaReporte, Portfolio, MVBook, TotalMVal);

    PRINT '   ✓ Índice IX_UBS_WorkTable_Ejecucion_Fund creado';
END
ELSE
BEGIN
    PRINT '   ⚠ Índice ya existe (skip)';
END

PRINT '';

-- ============================================
-- 2. staging.MLCCII_Derivados
-- ============================================
PRINT '2. Modificando staging.MLCCII_Derivados...';

IF NOT EXISTS (SELECT 1 FROM sys.columns
               WHERE object_id = OBJECT_ID('staging.MLCCII_Derivados')
               AND name = 'ID_Ejecucion')
BEGIN
    ALTER TABLE staging.MLCCII_Derivados
    ADD ID_Ejecucion BIGINT NOT NULL DEFAULT 0;

    PRINT '   ✓ Columna ID_Ejecucion agregada';
END
ELSE
BEGIN
    PRINT '   ⚠ Columna ID_Ejecucion ya existe (skip)';
END

IF NOT EXISTS (SELECT 1 FROM sys.columns
               WHERE object_id = OBJECT_ID('staging.MLCCII_Derivados')
               AND name = 'ID_Fund')
BEGIN
    ALTER TABLE staging.MLCCII_Derivados
    ADD ID_Fund INT NOT NULL DEFAULT 0;

    PRINT '   ✓ Columna ID_Fund agregada';
END
ELSE
BEGIN
    PRINT '   ⚠ Columna ID_Fund ya existe (skip)';
END

-- Crear índice compuesto
IF NOT EXISTS (SELECT 1 FROM sys.indexes
               WHERE object_id = OBJECT_ID('staging.MLCCII_Derivados')
               AND name = 'IX_MLCCII_Derivados_Ejecucion_Fund')
BEGIN
    CREATE NONCLUSTERED INDEX IX_MLCCII_Derivados_Ejecucion_Fund
    ON staging.MLCCII_Derivados (ID_Ejecucion, ID_Fund)
    INCLUDE (FechaReporte, Portfolio);

    PRINT '   ✓ Índice IX_MLCCII_Derivados_Ejecucion_Fund creado';
END
ELSE
BEGIN
    PRINT '   ⚠ Índice ya existe (skip)';
END

PRINT '';

-- ============================================
-- 3. staging.MLCCII
-- ============================================
PRINT '3. Modificando staging.MLCCII...';

IF NOT EXISTS (SELECT 1 FROM sys.columns
               WHERE object_id = OBJECT_ID('staging.MLCCII')
               AND name = 'ID_Ejecucion')
BEGIN
    ALTER TABLE staging.MLCCII
    ADD ID_Ejecucion BIGINT NOT NULL DEFAULT 0;

    PRINT '   ✓ Columna ID_Ejecucion agregada';
END
ELSE
BEGIN
    PRINT '   ⚠ Columna ID_Ejecucion ya existe (skip)';
END

IF NOT EXISTS (SELECT 1 FROM sys.columns
               WHERE object_id = OBJECT_ID('staging.MLCCII')
               AND name = 'ID_Fund')
BEGIN
    ALTER TABLE staging.MLCCII
    ADD ID_Fund INT NOT NULL DEFAULT 0;

    PRINT '   ✓ Columna ID_Fund agregada';
END
ELSE
BEGIN
    PRINT '   ⚠ Columna ID_Fund ya existe (skip)';
END

-- Crear índice compuesto
IF NOT EXISTS (SELECT 1 FROM sys.indexes
               WHERE object_id = OBJECT_ID('staging.MLCCII')
               AND name = 'IX_MLCCII_Ejecucion_Fund')
BEGIN
    CREATE NONCLUSTERED INDEX IX_MLCCII_Ejecucion_Fund
    ON staging.MLCCII (ID_Ejecucion, ID_Fund)
    INCLUDE (FechaReporte, Portfolio);

    PRINT '   ✓ Índice IX_MLCCII_Ejecucion_Fund creado';
END
ELSE
BEGIN
    PRINT '   ⚠ Índice ya existe (skip)';
END

PRINT '';
PRINT '========================================';
PRINT 'MIGRACIÓN 003 COMPLETADA ✓';
PRINT '========================================';
PRINT '';
PRINT 'Resumen:';
PRINT '- 3 tablas modificadas';
PRINT '- 6 columnas agregadas (2 por tabla)';
PRINT '- 3 índices creados';
PRINT '';
PRINT 'Todas las migraciones de schemas completadas.';
PRINT '';
PRINT 'Próximo paso: Crear SPs v2 para:';
PRINT '  1. Derivados (4 SPs)';
PRINT '  2. PNL (5 SPs)';
PRINT '  3. UBS (3 SPs)';
PRINT '';

GO
