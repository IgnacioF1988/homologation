/*
 * MIGRACIÓN 001: Agregar columnas de tracking a tablas DERIVADOS
 *
 * Objetivo: Preparar tablas staging de Derivados para arquitectura v2
 * Fecha: 2025-12-19
 * Versión: 1.0
 *
 * Tablas modificadas:
 * - staging.Derivados_WorkTable
 * - staging.Derivados
 * - staging.Ajuste_Derivados
 * - staging.Ajuste_Paridades
 *
 * Columnas agregadas:
 * - ID_Ejecucion BIGINT NOT NULL DEFAULT 0
 * - ID_Fund INT NOT NULL DEFAULT 0
 *
 * Índices creados:
 * - IX_[Tabla]_Ejecucion_Fund (ID_Ejecucion, ID_Fund)
 */

USE [Inteligencia_Producto_Dev];
GO

SET NOCOUNT ON;
PRINT '========================================';
PRINT 'MIGRACIÓN 001: DERIVADOS - Agregar Tracking';
PRINT 'Fecha: ' + CONVERT(VARCHAR, GETDATE(), 120);
PRINT '========================================';
PRINT '';

-- ============================================
-- 1. staging.Derivados_WorkTable
-- ============================================
PRINT '1. Modificando staging.Derivados_WorkTable...';

-- Verificar si las columnas ya existen
IF NOT EXISTS (SELECT 1 FROM sys.columns
               WHERE object_id = OBJECT_ID('staging.Derivados_WorkTable')
               AND name = 'ID_Ejecucion')
BEGIN
    ALTER TABLE staging.Derivados_WorkTable
    ADD ID_Ejecucion BIGINT NOT NULL DEFAULT 0;

    PRINT '   ✓ Columna ID_Ejecucion agregada';
END
ELSE
BEGIN
    PRINT '   ⚠ Columna ID_Ejecucion ya existe (skip)';
END

IF NOT EXISTS (SELECT 1 FROM sys.columns
               WHERE object_id = OBJECT_ID('staging.Derivados_WorkTable')
               AND name = 'ID_Fund')
BEGIN
    ALTER TABLE staging.Derivados_WorkTable
    ADD ID_Fund INT NOT NULL DEFAULT 0;

    PRINT '   ✓ Columna ID_Fund agregada';
END
ELSE
BEGIN
    PRINT '   ⚠ Columna ID_Fund ya existe (skip)';
END

-- Crear índice compuesto
IF NOT EXISTS (SELECT 1 FROM sys.indexes
               WHERE object_id = OBJECT_ID('staging.Derivados_WorkTable')
               AND name = 'IX_Derivados_WorkTable_Ejecucion_Fund')
BEGIN
    CREATE NONCLUSTERED INDEX IX_Derivados_WorkTable_Ejecucion_Fund
    ON staging.Derivados_WorkTable (ID_Ejecucion, ID_Fund)
    INCLUDE (FechaReporte, Portfolio, MTM);

    PRINT '   ✓ Índice IX_Derivados_WorkTable_Ejecucion_Fund creado';
END
ELSE
BEGIN
    PRINT '   ⚠ Índice ya existe (skip)';
END

PRINT '';

-- ============================================
-- 2. staging.Derivados
-- ============================================
PRINT '2. Modificando staging.Derivados...';

IF NOT EXISTS (SELECT 1 FROM sys.columns
               WHERE object_id = OBJECT_ID('staging.Derivados')
               AND name = 'ID_Ejecucion')
BEGIN
    ALTER TABLE staging.Derivados
    ADD ID_Ejecucion BIGINT NOT NULL DEFAULT 0;

    PRINT '   ✓ Columna ID_Ejecucion agregada';
END
ELSE
BEGIN
    PRINT '   ⚠ Columna ID_Ejecucion ya existe (skip)';
END

IF NOT EXISTS (SELECT 1 FROM sys.columns
               WHERE object_id = OBJECT_ID('staging.Derivados')
               AND name = 'ID_Fund')
BEGIN
    ALTER TABLE staging.Derivados
    ADD ID_Fund INT NOT NULL DEFAULT 0;

    PRINT '   ✓ Columna ID_Fund agregada';
END
ELSE
BEGIN
    PRINT '   ⚠ Columna ID_Fund ya existe (skip)';
END

-- Crear índice compuesto
IF NOT EXISTS (SELECT 1 FROM sys.indexes
               WHERE object_id = OBJECT_ID('staging.Derivados')
               AND name = 'IX_Derivados_Ejecucion_Fund')
BEGIN
    CREATE NONCLUSTERED INDEX IX_Derivados_Ejecucion_Fund
    ON staging.Derivados (ID_Ejecucion, ID_Fund)
    INCLUDE (FechaReporte, PK2, ID_Instrumento, id_CURR);

    PRINT '   ✓ Índice IX_Derivados_Ejecucion_Fund creado';
END
ELSE
BEGIN
    PRINT '   ⚠ Índice ya existe (skip)';
END

PRINT '';

-- ============================================
-- 3. staging.Ajuste_Derivados
-- ============================================
PRINT '3. Modificando staging.Ajuste_Derivados...';

IF NOT EXISTS (SELECT 1 FROM sys.columns
               WHERE object_id = OBJECT_ID('staging.Ajuste_Derivados')
               AND name = 'ID_Ejecucion')
BEGIN
    ALTER TABLE staging.Ajuste_Derivados
    ADD ID_Ejecucion BIGINT NOT NULL DEFAULT 0;

    PRINT '   ✓ Columna ID_Ejecucion agregada';
END
ELSE
BEGIN
    PRINT '   ⚠ Columna ID_Ejecucion ya existe (skip)';
END

IF NOT EXISTS (SELECT 1 FROM sys.columns
               WHERE object_id = OBJECT_ID('staging.Ajuste_Derivados')
               AND name = 'ID_Fund')
BEGIN
    ALTER TABLE staging.Ajuste_Derivados
    ADD ID_Fund INT NOT NULL DEFAULT 0;

    PRINT '   ✓ Columna ID_Fund agregada';
END
ELSE
BEGIN
    PRINT '   ⚠ Columna ID_Fund ya existe (skip)';
END

-- Crear índice compuesto
IF NOT EXISTS (SELECT 1 FROM sys.indexes
               WHERE object_id = OBJECT_ID('staging.Ajuste_Derivados')
               AND name = 'IX_Ajuste_Derivados_Ejecucion_Fund')
BEGIN
    CREATE NONCLUSTERED INDEX IX_Ajuste_Derivados_Ejecucion_Fund
    ON staging.Ajuste_Derivados (ID_Ejecucion, ID_Fund)
    INCLUDE (FechaReporte, MTM);

    PRINT '   ✓ Índice IX_Ajuste_Derivados_Ejecucion_Fund creado';
END
ELSE
BEGIN
    PRINT '   ⚠ Índice ya existe (skip)';
END

PRINT '';

-- ============================================
-- 4. staging.Ajuste_Paridades
-- ============================================
PRINT '4. Modificando staging.Ajuste_Paridades...';

IF NOT EXISTS (SELECT 1 FROM sys.columns
               WHERE object_id = OBJECT_ID('staging.Ajuste_Paridades')
               AND name = 'ID_Ejecucion')
BEGIN
    ALTER TABLE staging.Ajuste_Paridades
    ADD ID_Ejecucion BIGINT NOT NULL DEFAULT 0;

    PRINT '   ✓ Columna ID_Ejecucion agregada';
END
ELSE
BEGIN
    PRINT '   ⚠ Columna ID_Ejecucion ya existe (skip)';
END

IF NOT EXISTS (SELECT 1 FROM sys.columns
               WHERE object_id = OBJECT_ID('staging.Ajuste_Paridades')
               AND name = 'ID_Fund')
BEGIN
    ALTER TABLE staging.Ajuste_Paridades
    ADD ID_Fund INT NOT NULL DEFAULT 0;

    PRINT '   ✓ Columna ID_Fund agregada';
END
ELSE
BEGIN
    PRINT '   ⚠ Columna ID_Fund ya existe (skip)';
END

-- Crear índice compuesto
IF NOT EXISTS (SELECT 1 FROM sys.indexes
               WHERE object_id = OBJECT_ID('staging.Ajuste_Paridades')
               AND name = 'IX_Ajuste_Paridades_Ejecucion_Fund')
BEGIN
    CREATE NONCLUSTERED INDEX IX_Ajuste_Paridades_Ejecucion_Fund
    ON staging.Ajuste_Paridades (ID_Ejecucion, ID_Fund)
    INCLUDE (FechaReporte, Diferencia);

    PRINT '   ✓ Índice IX_Ajuste_Paridades_Ejecucion_Fund creado';
END
ELSE
BEGIN
    PRINT '   ⚠ Índice ya existe (skip)';
END

PRINT '';
PRINT '========================================';
PRINT 'MIGRACIÓN 001 COMPLETADA ✓';
PRINT '========================================';
PRINT '';
PRINT 'Resumen:';
PRINT '- 4 tablas modificadas';
PRINT '- 8 columnas agregadas (2 por tabla)';
PRINT '- 4 índices creados';
PRINT '';
PRINT 'Próximo paso: Ejecutar migración 002 (PNL)';
PRINT '';

GO
