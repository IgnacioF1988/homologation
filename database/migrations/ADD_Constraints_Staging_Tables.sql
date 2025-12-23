-- ============================================
-- Script: Agregar CHECK Constraints a Tablas Staging
-- Fecha: 2025-12-23
-- Propósito: Prevenir inserts con ID_Fund=0 o ID_Ejecucion=0
--            Garantizar aislamiento de datos en ejecuciones paralelas
-- ============================================
-- IMPORTANTE: Ejecutar DESPUÉS de limpiar las tablas staging.
--             Este script fallará si existen registros con ID_Fund=0 o ID_Ejecucion=0
-- ============================================

USE Inteligencia_Producto_Dev;
GO

PRINT '============================================';
PRINT 'INICIO - AGREGAR CHECK CONSTRAINTS';
PRINT 'Fecha: ' + CONVERT(VARCHAR, GETDATE(), 120);
PRINT '============================================';
PRINT '';

-- ============================================
-- PASO 1: ELIMINAR DEFAULT CONSTRAINTS EXISTENTES
-- ============================================
PRINT 'PASO 1: Eliminando DEFAULT constraints existentes...';
PRINT '';

-- IPA_WorkTable
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'DF_IPA_WorkTable_ID_Fund')
BEGIN
    ALTER TABLE staging.IPA_WorkTable DROP CONSTRAINT DF_IPA_WorkTable_ID_Fund;
    PRINT '✓ Eliminado DEFAULT de IPA_WorkTable.ID_Fund';
END

IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'DF_IPA_WorkTable_ID_Ejecucion')
BEGIN
    ALTER TABLE staging.IPA_WorkTable DROP CONSTRAINT DF_IPA_WorkTable_ID_Ejecucion;
    PRINT '✓ Eliminado DEFAULT de IPA_WorkTable.ID_Ejecucion';
END

-- CAPM_WorkTable
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'DF_CAPM_WorkTable_ID_Fund')
BEGIN
    ALTER TABLE staging.CAPM_WorkTable DROP CONSTRAINT DF_CAPM_WorkTable_ID_Fund;
    PRINT '✓ Eliminado DEFAULT de CAPM_WorkTable.ID_Fund';
END

IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'DF_CAPM_WorkTable_ID_Ejecucion')
BEGIN
    ALTER TABLE staging.CAPM_WorkTable DROP CONSTRAINT DF_CAPM_WorkTable_ID_Ejecucion;
    PRINT '✓ Eliminado DEFAULT de CAPM_WorkTable.ID_Ejecucion';
END

-- PNL_WorkTable
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'DF_PNL_WorkTable_ID_Fund')
BEGIN
    ALTER TABLE staging.PNL_WorkTable DROP CONSTRAINT DF_PNL_WorkTable_ID_Fund;
    PRINT '✓ Eliminado DEFAULT de PNL_WorkTable.ID_Fund';
END

IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'DF_PNL_WorkTable_ID_Ejecucion')
BEGIN
    ALTER TABLE staging.PNL_WorkTable DROP CONSTRAINT DF_PNL_WorkTable_ID_Ejecucion;
    PRINT '✓ Eliminado DEFAULT de PNL_WorkTable.ID_Ejecucion';
END

-- UBS_WorkTable
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'DF_UBS_WorkTable_ID_Fund')
BEGIN
    ALTER TABLE staging.UBS_WorkTable DROP CONSTRAINT DF_UBS_WorkTable_ID_Fund;
    PRINT '✓ Eliminado DEFAULT de UBS_WorkTable.ID_Fund';
END

IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'DF_UBS_WorkTable_ID_Ejecucion')
BEGIN
    ALTER TABLE staging.UBS_WorkTable DROP CONSTRAINT DF_UBS_WorkTable_ID_Ejecucion;
    PRINT '✓ Eliminado DEFAULT de UBS_WorkTable.ID_Ejecucion';
END

-- Derivados_WorkTable
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'DF_Derivados_WorkTable_ID_Fund')
BEGIN
    ALTER TABLE staging.Derivados_WorkTable DROP CONSTRAINT DF_Derivados_WorkTable_ID_Fund;
    PRINT '✓ Eliminado DEFAULT de Derivados_WorkTable.ID_Fund';
END

IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'DF_Derivados_WorkTable_ID_Ejecucion')
BEGIN
    ALTER TABLE staging.Derivados_WorkTable DROP CONSTRAINT DF_Derivados_WorkTable_ID_Ejecucion;
    PRINT '✓ Eliminado DEFAULT de Derivados_WorkTable.ID_Ejecucion';
END

-- UAF_WorkTable
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'DF_UAF_WorkTable_ID_Fund')
BEGIN
    ALTER TABLE staging.UAF_WorkTable DROP CONSTRAINT DF_UAF_WorkTable_ID_Fund;
    PRINT '✓ Eliminado DEFAULT de UAF_WorkTable.ID_Fund';
END

IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'DF_UAF_WorkTable_ID_Ejecucion')
BEGIN
    ALTER TABLE staging.UAF_WorkTable DROP CONSTRAINT DF_UAF_WorkTable_ID_Ejecucion;
    PRINT '✓ Eliminado DEFAULT de UAF_WorkTable.ID_Ejecucion';
END

-- IPA_Cash
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'DF_IPA_Cash_ID_Fund')
BEGIN
    ALTER TABLE staging.IPA_Cash DROP CONSTRAINT DF_IPA_Cash_ID_Fund;
    PRINT '✓ Eliminado DEFAULT de IPA_Cash.ID_Fund';
END

IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'DF_IPA_Cash_ID_Ejecucion')
BEGIN
    ALTER TABLE staging.IPA_Cash DROP CONSTRAINT DF_IPA_Cash_ID_Ejecucion;
    PRINT '✓ Eliminado DEFAULT de IPA_Cash.ID_Ejecucion';
END

-- IPA_Final
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'DF_IPA_Final_ID_Fund')
BEGIN
    ALTER TABLE staging.IPA_Final DROP CONSTRAINT DF_IPA_Final_ID_Fund;
    PRINT '✓ Eliminado DEFAULT de IPA_Final.ID_Fund';
END

IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'DF_IPA_Final_ID_Ejecucion')
BEGIN
    ALTER TABLE staging.IPA_Final DROP CONSTRAINT DF_IPA_Final_ID_Ejecucion;
    PRINT '✓ Eliminado DEFAULT de IPA_Final.ID_Ejecucion';
END

PRINT '';
PRINT 'DEFAULT constraints eliminados.';
PRINT '';

-- ============================================
-- PASO 2: AGREGAR CHECK CONSTRAINTS
-- ============================================
PRINT 'PASO 2: Agregando CHECK constraints (ID_Fund > 0 AND ID_Ejecucion > 0)...';
PRINT '';

-- IPA_WorkTable
ALTER TABLE staging.IPA_WorkTable
ADD CONSTRAINT CK_IPA_WorkTable_ID_Fund_Positive CHECK (ID_Fund > 0);
PRINT '✓ CHECK constraint agregado: IPA_WorkTable.ID_Fund > 0';

ALTER TABLE staging.IPA_WorkTable
ADD CONSTRAINT CK_IPA_WorkTable_ID_Ejecucion_Positive CHECK (ID_Ejecucion > 0);
PRINT '✓ CHECK constraint agregado: IPA_WorkTable.ID_Ejecucion > 0';

-- CAPM_WorkTable
ALTER TABLE staging.CAPM_WorkTable
ADD CONSTRAINT CK_CAPM_WorkTable_ID_Fund_Positive CHECK (ID_Fund > 0);
PRINT '✓ CHECK constraint agregado: CAPM_WorkTable.ID_Fund > 0';

ALTER TABLE staging.CAPM_WorkTable
ADD CONSTRAINT CK_CAPM_WorkTable_ID_Ejecucion_Positive CHECK (ID_Ejecucion > 0);
PRINT '✓ CHECK constraint agregado: CAPM_WorkTable.ID_Ejecucion > 0';

-- PNL_WorkTable
ALTER TABLE staging.PNL_WorkTable
ADD CONSTRAINT CK_PNL_WorkTable_ID_Fund_Positive CHECK (ID_Fund > 0);
PRINT '✓ CHECK constraint agregado: PNL_WorkTable.ID_Fund > 0';

ALTER TABLE staging.PNL_WorkTable
ADD CONSTRAINT CK_PNL_WorkTable_ID_Ejecucion_Positive CHECK (ID_Ejecucion > 0);
PRINT '✓ CHECK constraint agregado: PNL_WorkTable.ID_Ejecucion > 0';

-- UBS_WorkTable
ALTER TABLE staging.UBS_WorkTable
ADD CONSTRAINT CK_UBS_WorkTable_ID_Fund_Positive CHECK (ID_Fund > 0);
PRINT '✓ CHECK constraint agregado: UBS_WorkTable.ID_Fund > 0';

ALTER TABLE staging.UBS_WorkTable
ADD CONSTRAINT CK_UBS_WorkTable_ID_Ejecucion_Positive CHECK (ID_Ejecucion > 0);
PRINT '✓ CHECK constraint agregado: UBS_WorkTable.ID_Ejecucion > 0';

-- Derivados_WorkTable
ALTER TABLE staging.Derivados_WorkTable
ADD CONSTRAINT CK_Derivados_WorkTable_ID_Fund_Positive CHECK (ID_Fund > 0);
PRINT '✓ CHECK constraint agregado: Derivados_WorkTable.ID_Fund > 0';

ALTER TABLE staging.Derivados_WorkTable
ADD CONSTRAINT CK_Derivados_WorkTable_ID_Ejecucion_Positive CHECK (ID_Ejecucion > 0);
PRINT '✓ CHECK constraint agregado: Derivados_WorkTable.ID_Ejecucion > 0';

-- UAF_WorkTable
ALTER TABLE staging.UAF_WorkTable
ADD CONSTRAINT CK_UAF_WorkTable_ID_Fund_Positive CHECK (ID_Fund > 0);
PRINT '✓ CHECK constraint agregado: UAF_WorkTable.ID_Fund > 0';

ALTER TABLE staging.UAF_WorkTable
ADD CONSTRAINT CK_UAF_WorkTable_ID_Ejecucion_Positive CHECK (ID_Ejecucion > 0);
PRINT '✓ CHECK constraint agregado: UAF_WorkTable.ID_Ejecucion > 0';

-- IPA_Cash
ALTER TABLE staging.IPA_Cash
ADD CONSTRAINT CK_IPA_Cash_ID_Fund_Positive CHECK (ID_Fund > 0);
PRINT '✓ CHECK constraint agregado: IPA_Cash.ID_Fund > 0';

ALTER TABLE staging.IPA_Cash
ADD CONSTRAINT CK_IPA_Cash_ID_Ejecucion_Positive CHECK (ID_Ejecucion > 0);
PRINT '✓ CHECK constraint agregado: IPA_Cash.ID_Ejecucion > 0';

-- IPA_Final
ALTER TABLE staging.IPA_Final
ADD CONSTRAINT CK_IPA_Final_ID_Fund_Positive CHECK (ID_Fund > 0);
PRINT '✓ CHECK constraint agregado: IPA_Final.ID_Fund > 0';

ALTER TABLE staging.IPA_Final
ADD CONSTRAINT CK_IPA_Final_ID_Ejecucion_Positive CHECK (ID_Ejecucion > 0);
PRINT '✓ CHECK constraint agregado: IPA_Final.ID_Ejecucion > 0';

-- Ajuste_CAPM
ALTER TABLE staging.Ajuste_CAPM
ADD CONSTRAINT CK_Ajuste_CAPM_ID_Fund_Positive CHECK (ID_Fund > 0);
PRINT '✓ CHECK constraint agregado: Ajuste_CAPM.ID_Fund > 0';

ALTER TABLE staging.Ajuste_CAPM
ADD CONSTRAINT CK_Ajuste_CAPM_ID_Ejecucion_Positive CHECK (ID_Ejecucion > 0);
PRINT '✓ CHECK constraint agregado: Ajuste_CAPM.ID_Ejecucion > 0';

PRINT '';
PRINT 'CHECK constraints agregados exitosamente.';
PRINT '';

-- ============================================
-- PASO 3: VERIFICACIÓN DE CONSTRAINTS
-- ============================================
PRINT 'PASO 3: Verificando constraints agregados...';
PRINT '';

SELECT
    t.name AS Tabla,
    cc.name AS Constraint,
    cc.definition AS Definicion
FROM sys.check_constraints cc
INNER JOIN sys.tables t ON cc.parent_object_id = t.object_id
INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
WHERE s.name = 'staging'
  AND cc.name LIKE 'CK_%_ID_Fund_Positive'
   OR cc.name LIKE 'CK_%_ID_Ejecucion_Positive'
ORDER BY t.name, cc.name;

PRINT '';
PRINT '============================================';
PRINT 'CHECK CONSTRAINTS AGREGADOS EXITOSAMENTE';
PRINT 'Fecha: ' + CONVERT(VARCHAR, GETDATE(), 120);
PRINT '============================================';
PRINT '';
PRINT 'PROTECCIONES ACTIVAS:';
PRINT '✓ Todas las tablas staging ahora rechazan INSERT/UPDATE con ID_Fund=0';
PRINT '✓ Todas las tablas staging ahora rechazan INSERT/UPDATE con ID_Ejecucion=0';
PRINT '✓ Garantiza aislamiento de datos en ejecuciones paralelas';
PRINT '';
PRINT 'SIGUIENTES PASOS:';
PRINT '1. Agregar validación defensiva en SPs IPA_01 y CAPM_01';
PRINT '2. Agregar validación en BasePipelineService.js (Node.js)';
PRINT '3. Aumentar concurrencia a 3 en FundOrchestrator.js';
PRINT '4. Ejecutar battery testing para validar estabilidad';
PRINT '';

GO
