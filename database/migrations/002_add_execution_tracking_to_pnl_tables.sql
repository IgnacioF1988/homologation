/*
 * MIGRACIÓN 002: Agregar columnas de tracking a tablas PNL
 *
 * Objetivo: Preparar tablas staging de PNL para arquitectura v2
 * Fecha: 2025-12-19
 * Versión: 1.0
 *
 * Tablas modificadas:
 * - staging.PNL_WorkTable
 * - staging.PNL
 * - staging.Ajuste_PNL
 * - staging.PNL_IPA
 * - staging.PNL_ValoresAcumulados
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
PRINT 'MIGRACIÓN 002: PNL - Agregar Tracking';
PRINT 'Fecha: ' + CONVERT(VARCHAR, GETDATE(), 120);
PRINT '========================================';
PRINT '';

-- ============================================
-- 1. staging.PNL_WorkTable
-- ============================================
PRINT '1. Modificando staging.PNL_WorkTable...';

IF NOT EXISTS (SELECT 1 FROM sys.columns
               WHERE object_id = OBJECT_ID('staging.PNL_WorkTable')
               AND name = 'ID_Ejecucion')
BEGIN
    ALTER TABLE staging.PNL_WorkTable
    ADD ID_Ejecucion BIGINT NOT NULL DEFAULT 0;

    PRINT '   ✓ Columna ID_Ejecucion agregada';
END
ELSE
BEGIN
    PRINT '   ⚠ Columna ID_Ejecucion ya existe (skip)';
END

IF NOT EXISTS (SELECT 1 FROM sys.columns
               WHERE object_id = OBJECT_ID('staging.PNL_WorkTable')
               AND name = 'ID_Fund')
BEGIN
    ALTER TABLE staging.PNL_WorkTable
    ADD ID_Fund INT NOT NULL DEFAULT 0;

    PRINT '   ✓ Columna ID_Fund agregada';
END
ELSE
BEGIN
    PRINT '   ⚠ Columna ID_Fund ya existe (skip)';
END

-- Crear índice compuesto
IF NOT EXISTS (SELECT 1 FROM sys.indexes
               WHERE object_id = OBJECT_ID('staging.PNL_WorkTable')
               AND name = 'IX_PNL_WorkTable_Ejecucion_Fund')
BEGIN
    CREATE NONCLUSTERED INDEX IX_PNL_WorkTable_Ejecucion_Fund
    ON staging.PNL_WorkTable (ID_Ejecucion, ID_Fund)
    INCLUDE (FechaReporte, Portfolio, TotGL);

    PRINT '   ✓ Índice IX_PNL_WorkTable_Ejecucion_Fund creado';
END
ELSE
BEGIN
    PRINT '   ⚠ Índice ya existe (skip)';
END

PRINT '';

-- ============================================
-- 2. staging.PNL
-- ============================================
PRINT '2. Modificando staging.PNL...';

IF NOT EXISTS (SELECT 1 FROM sys.columns
               WHERE object_id = OBJECT_ID('staging.PNL')
               AND name = 'ID_Ejecucion')
BEGIN
    ALTER TABLE staging.PNL
    ADD ID_Ejecucion BIGINT NOT NULL DEFAULT 0;

    PRINT '   ✓ Columna ID_Ejecucion agregada';
END
ELSE
BEGIN
    PRINT '   ⚠ Columna ID_Ejecucion ya existe (skip)';
END

IF NOT EXISTS (SELECT 1 FROM sys.columns
               WHERE object_id = OBJECT_ID('staging.PNL')
               AND name = 'ID_Fund')
BEGIN
    ALTER TABLE staging.PNL
    ADD ID_Fund INT NOT NULL DEFAULT 0;

    PRINT '   ✓ Columna ID_Fund agregada';
END
ELSE
BEGIN
    PRINT '   ⚠ Columna ID_Fund ya existe (skip)';
END

-- Crear índice compuesto
IF NOT EXISTS (SELECT 1 FROM sys.indexes
               WHERE object_id = OBJECT_ID('staging.PNL')
               AND name = 'IX_PNL_Ejecucion_Fund')
BEGIN
    CREATE NONCLUSTERED INDEX IX_PNL_Ejecucion_Fund
    ON staging.PNL (ID_Ejecucion, ID_Fund)
    INCLUDE (FechaReporte, ID_Instrumento, id_CURR, TotGL);

    PRINT '   ✓ Índice IX_PNL_Ejecucion_Fund creado';
END
ELSE
BEGIN
    PRINT '   ⚠ Índice ya existe (skip)';
END

PRINT '';

-- ============================================
-- 3. staging.Ajuste_PNL
-- ============================================
PRINT '3. Modificando staging.Ajuste_PNL...';

IF NOT EXISTS (SELECT 1 FROM sys.columns
               WHERE object_id = OBJECT_ID('staging.Ajuste_PNL')
               AND name = 'ID_Ejecucion')
BEGIN
    ALTER TABLE staging.Ajuste_PNL
    ADD ID_Ejecucion BIGINT NOT NULL DEFAULT 0;

    PRINT '   ✓ Columna ID_Ejecucion agregada';
END
ELSE
BEGIN
    PRINT '   ⚠ Columna ID_Ejecucion ya existe (skip)';
END

IF NOT EXISTS (SELECT 1 FROM sys.columns
               WHERE object_id = OBJECT_ID('staging.Ajuste_PNL')
               AND name = 'ID_Fund')
BEGIN
    ALTER TABLE staging.Ajuste_PNL
    ADD ID_Fund INT NOT NULL DEFAULT 0;

    PRINT '   ✓ Columna ID_Fund agregada';
END
ELSE
BEGIN
    PRINT '   ⚠ Columna ID_Fund ya existe (skip)';
END

-- Crear índice compuesto
IF NOT EXISTS (SELECT 1 FROM sys.indexes
               WHERE object_id = OBJECT_ID('staging.Ajuste_PNL')
               AND name = 'IX_Ajuste_PNL_Ejecucion_Fund')
BEGIN
    CREATE NONCLUSTERED INDEX IX_Ajuste_PNL_Ejecucion_Fund
    ON staging.Ajuste_PNL (ID_Ejecucion, ID_Fund)
    INCLUDE (FechaReporte, PK2, TotalMVal);

    PRINT '   ✓ Índice IX_Ajuste_PNL_Ejecucion_Fund creado';
END
ELSE
BEGIN
    PRINT '   ⚠ Índice ya existe (skip)';
END

PRINT '';

-- ============================================
-- 4. staging.PNL_IPA
-- ============================================
PRINT '4. Modificando staging.PNL_IPA...';

IF NOT EXISTS (SELECT 1 FROM sys.columns
               WHERE object_id = OBJECT_ID('staging.PNL_IPA')
               AND name = 'ID_Ejecucion')
BEGIN
    ALTER TABLE staging.PNL_IPA
    ADD ID_Ejecucion BIGINT NOT NULL DEFAULT 0;

    PRINT '   ✓ Columna ID_Ejecucion agregada';
END
ELSE
BEGIN
    PRINT '   ⚠ Columna ID_Ejecucion ya existe (skip)';
END

IF NOT EXISTS (SELECT 1 FROM sys.columns
               WHERE object_id = OBJECT_ID('staging.PNL_IPA')
               AND name = 'ID_Fund')
BEGIN
    ALTER TABLE staging.PNL_IPA
    ADD ID_Fund INT NOT NULL DEFAULT 0;

    PRINT '   ✓ Columna ID_Fund agregada';
END
ELSE
BEGIN
    PRINT '   ⚠ Columna ID_Fund ya existe (skip)';
END

-- Crear índice compuesto
IF NOT EXISTS (SELECT 1 FROM sys.indexes
               WHERE object_id = OBJECT_ID('staging.PNL_IPA')
               AND name = 'IX_PNL_IPA_Ejecucion_Fund')
BEGIN
    CREATE NONCLUSTERED INDEX IX_PNL_IPA_Ejecucion_Fund
    ON staging.PNL_IPA (ID_Ejecucion, ID_Fund)
    INCLUDE (FechaReporte, PK2, TotalMVal, TotGL);

    PRINT '   ✓ Índice IX_PNL_IPA_Ejecucion_Fund creado';
END
ELSE
BEGIN
    PRINT '   ⚠ Índice ya existe (skip)';
END

PRINT '';

-- ============================================
-- 5. staging.PNL_ValoresAcumulados
-- ============================================
PRINT '5. Modificando staging.PNL_ValoresAcumulados...';

IF NOT EXISTS (SELECT 1 FROM sys.columns
               WHERE object_id = OBJECT_ID('staging.PNL_ValoresAcumulados')
               AND name = 'ID_Ejecucion')
BEGIN
    ALTER TABLE staging.PNL_ValoresAcumulados
    ADD ID_Ejecucion BIGINT NOT NULL DEFAULT 0;

    PRINT '   ✓ Columna ID_Ejecucion agregada';
END
ELSE
BEGIN
    PRINT '   ⚠ Columna ID_Ejecucion ya existe (skip)';
END

IF NOT EXISTS (SELECT 1 FROM sys.columns
               WHERE object_id = OBJECT_ID('staging.PNL_ValoresAcumulados')
               AND name = 'ID_Fund')
BEGIN
    ALTER TABLE staging.PNL_ValoresAcumulados
    ADD ID_Fund INT NOT NULL DEFAULT 0;

    PRINT '   ✓ Columna ID_Fund agregada';
END
ELSE
BEGIN
    PRINT '   ⚠ Columna ID_Fund ya existe (skip)';
END

-- Crear índice compuesto
IF NOT EXISTS (SELECT 1 FROM sys.indexes
               WHERE object_id = OBJECT_ID('staging.PNL_ValoresAcumulados')
               AND name = 'IX_PNL_ValoresAcumulados_Ejecucion_Fund')
BEGIN
    CREATE NONCLUSTERED INDEX IX_PNL_ValoresAcumulados_Ejecucion_Fund
    ON staging.PNL_ValoresAcumulados (ID_Ejecucion, ID_Fund)
    INCLUDE (FechaReporte, Estado);

    PRINT '   ✓ Índice IX_PNL_ValoresAcumulados_Ejecucion_Fund creado';
END
ELSE
BEGIN
    PRINT '   ⚠ Índice ya existe (skip)';
END

PRINT '';
PRINT '========================================';
PRINT 'MIGRACIÓN 002 COMPLETADA ✓';
PRINT '========================================';
PRINT '';
PRINT 'Resumen:';
PRINT '- 5 tablas modificadas';
PRINT '- 10 columnas agregadas (2 por tabla)';
PRINT '- 5 índices creados';
PRINT '';
PRINT 'Próximo paso: Ejecutar migración 003 (UBS)';
PRINT '';

GO
