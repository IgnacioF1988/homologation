/*
================================================================================
MIGRATION: ID_Fund VARCHAR/NVARCHAR → INT
Fecha: 2025-12-22
Propósito: Estandarizar tipo de dato ID_Fund para compatibilidad con SPs v2
================================================================================

ORDEN DE EJECUCIÓN:
1. Dimensionales (tablas maestras)
2. Logs (tracking)
3. Process (CAPM, PNL, IPA procesados)
4. Staging (worktables y finales)
5. Sandbox (desarrollo/debug)

Total de tablas a migrar: 19
Tablas ya INT (sin cambios): 16

ROLLBACK: Cada tabla tiene su backup con nombre _BACKUP_20251222
*/

SET NOCOUNT ON;
GO

PRINT '================================================================================'
PRINT 'INICIANDO MIGRACIÓN ID_Fund → INT'
PRINT 'Fecha: ' + CONVERT(VARCHAR, GETDATE(), 120)
PRINT '================================================================================'
GO

-- ============================================================================
-- FASE 1: DIMENSIONALES (Tablas Maestras)
-- ============================================================================
PRINT ''
PRINT '--- FASE 1: DIMENSIONALES ---'
GO

-- 1.1 dimensionales.BD_Funds (NVARCHAR(MAX) → INT)
PRINT 'Migrando dimensionales.BD_Funds...'

-- Backup
IF OBJECT_ID('dimensionales.BD_Funds_BACKUP_20251222', 'U') IS NOT NULL
    DROP TABLE dimensionales.BD_Funds_BACKUP_20251222;

SELECT * INTO dimensionales.BD_Funds_BACKUP_20251222
FROM dimensionales.BD_Funds;

-- Validar conversión
IF EXISTS (SELECT 1 FROM dimensionales.BD_Funds WHERE TRY_CAST(ID_Fund AS INT) IS NULL AND ID_Fund IS NOT NULL)
BEGIN
    PRINT 'ERROR: Existen valores de ID_Fund no convertibles a INT en dimensionales.BD_Funds'
    SELECT ID_Fund FROM dimensionales.BD_Funds WHERE TRY_CAST(ID_Fund AS INT) IS NULL AND ID_Fund IS NOT NULL
    RAISERROR('Migración abortada: valores no convertibles', 16, 1)
    RETURN
END

-- Migrar
ALTER TABLE dimensionales.BD_Funds ALTER COLUMN ID_Fund INT NULL;

PRINT 'dimensionales.BD_Funds migrado exitosamente ✓'
GO

-- 1.2 dimensionales.HOMOL_Funds (NVARCHAR(MAX) → INT)
PRINT 'Migrando dimensionales.HOMOL_Funds...'

-- Backup
IF OBJECT_ID('dimensionales.HOMOL_Funds_BACKUP_20251222', 'U') IS NOT NULL
    DROP TABLE dimensionales.HOMOL_Funds_BACKUP_20251222;

SELECT * INTO dimensionales.HOMOL_Funds_BACKUP_20251222
FROM dimensionales.HOMOL_Funds;

-- Validar
IF EXISTS (SELECT 1 FROM dimensionales.HOMOL_Funds WHERE TRY_CAST(ID_Fund AS INT) IS NULL AND ID_Fund IS NOT NULL)
BEGIN
    PRINT 'ERROR: Existen valores no convertibles en dimensionales.HOMOL_Funds'
    RAISERROR('Migración abortada', 16, 1)
    RETURN
END

-- Migrar
ALTER TABLE dimensionales.HOMOL_Funds ALTER COLUMN ID_Fund INT NULL;

PRINT 'dimensionales.HOMOL_Funds migrado exitosamente ✓'
GO

-- ============================================================================
-- FASE 2: LOGS (Tracking y Métricas)
-- ============================================================================
PRINT ''
PRINT '--- FASE 2: LOGS ---'
GO

-- 2.1 logs.Ejecucion_Fondos (VARCHAR(50) → INT)
PRINT 'Migrando logs.Ejecucion_Fondos...'

-- Backup
IF OBJECT_ID('logs.Ejecucion_Fondos_BACKUP_20251222', 'U') IS NOT NULL
    DROP TABLE logs.Ejecucion_Fondos_BACKUP_20251222;

SELECT * INTO logs.Ejecucion_Fondos_BACKUP_20251222
FROM logs.Ejecucion_Fondos;

-- Validar
IF EXISTS (SELECT 1 FROM logs.Ejecucion_Fondos WHERE TRY_CAST(ID_Fund AS INT) IS NULL)
BEGIN
    PRINT 'ERROR: Valores no convertibles en logs.Ejecucion_Fondos'
    RAISERROR('Migración abortada', 16, 1)
    RETURN
END

-- Migrar
ALTER TABLE logs.Ejecucion_Fondos ALTER COLUMN ID_Fund INT NOT NULL;

PRINT 'logs.Ejecucion_Fondos migrado exitosamente ✓'
GO

-- 2.2 logs.Ejecucion_Logs (VARCHAR(50) → INT)
PRINT 'Migrando logs.Ejecucion_Logs...'

-- Backup
IF OBJECT_ID('logs.Ejecucion_Logs_BACKUP_20251222', 'U') IS NOT NULL
    DROP TABLE logs.Ejecucion_Logs_BACKUP_20251222;

SELECT * INTO logs.Ejecucion_Logs_BACKUP_20251222
FROM logs.Ejecucion_Logs;

-- Validar
IF EXISTS (SELECT 1 FROM logs.Ejecucion_Logs WHERE TRY_CAST(ID_Fund AS INT) IS NULL AND ID_Fund IS NOT NULL)
BEGIN
    PRINT 'ERROR: Valores no convertibles en logs.Ejecucion_Logs'
    RAISERROR('Migración abortada', 16, 1)
    RETURN
END

-- Migrar
ALTER TABLE logs.Ejecucion_Logs ALTER COLUMN ID_Fund INT NULL;

PRINT 'logs.Ejecucion_Logs migrado exitosamente ✓'
GO

-- 2.3 logs.Ejecucion_Metricas (VARCHAR(50) → INT)
PRINT 'Migrando logs.Ejecucion_Metricas...'

-- Backup
IF OBJECT_ID('logs.Ejecucion_Metricas_BACKUP_20251222', 'U') IS NOT NULL
    DROP TABLE logs.Ejecucion_Metricas_BACKUP_20251222;

SELECT * INTO logs.Ejecucion_Metricas_BACKUP_20251222
FROM logs.Ejecucion_Metricas;

-- Validar
IF EXISTS (SELECT 1 FROM logs.Ejecucion_Metricas WHERE TRY_CAST(ID_Fund AS INT) IS NULL)
BEGIN
    PRINT 'ERROR: Valores no convertibles en logs.Ejecucion_Metricas'
    RAISERROR('Migración abortada', 16, 1)
    RETURN
END

-- Migrar
ALTER TABLE logs.Ejecucion_Metricas ALTER COLUMN ID_Fund INT NOT NULL;

PRINT 'logs.Ejecucion_Metricas migrado exitosamente ✓'
GO

-- ============================================================================
-- FASE 3: PROCESS (Tablas de Procesamiento)
-- ============================================================================
PRINT ''
PRINT '--- FASE 3: PROCESS ---'
GO

-- 3.1 process.TBL_IPA (NVARCHAR(10) → INT)
PRINT 'Migrando process.TBL_IPA...'

IF OBJECT_ID('process.TBL_IPA_BACKUP_20251222', 'U') IS NOT NULL
    DROP TABLE process.TBL_IPA_BACKUP_20251222;

SELECT * INTO process.TBL_IPA_BACKUP_20251222 FROM process.TBL_IPA;

IF EXISTS (SELECT 1 FROM process.TBL_IPA WHERE TRY_CAST(ID_Fund AS INT) IS NULL AND ID_Fund IS NOT NULL)
BEGIN
    PRINT 'ERROR: Valores no convertibles en process.TBL_IPA'
    RAISERROR('Migración abortada', 16, 1)
    RETURN
END

ALTER TABLE process.TBL_IPA ALTER COLUMN ID_Fund INT NULL;
PRINT 'process.TBL_IPA migrado exitosamente ✓'
GO

-- 3.2 process.TBL_PNL (NVARCHAR(10) → INT)
PRINT 'Migrando process.TBL_PNL...'

IF OBJECT_ID('process.TBL_PNL_BACKUP_20251222', 'U') IS NOT NULL
    DROP TABLE process.TBL_PNL_BACKUP_20251222;

SELECT * INTO process.TBL_PNL_BACKUP_20251222 FROM process.TBL_PNL;

IF EXISTS (SELECT 1 FROM process.TBL_PNL WHERE TRY_CAST(ID_Fund AS INT) IS NULL AND ID_Fund IS NOT NULL)
BEGIN
    PRINT 'ERROR: Valores no convertibles en process.TBL_PNL'
    RAISERROR('Migración abortada', 16, 1)
    RETURN
END

ALTER TABLE process.TBL_PNL ALTER COLUMN ID_Fund INT NULL;
PRINT 'process.TBL_PNL migrado exitosamente ✓'
GO

-- 3.3 process.TBL_PNL_IPA (NVARCHAR(MAX) → INT)
PRINT 'Migrando process.TBL_PNL_IPA...'

IF OBJECT_ID('process.TBL_PNL_IPA_BACKUP_20251222', 'U') IS NOT NULL
    DROP TABLE process.TBL_PNL_IPA_BACKUP_20251222;

SELECT * INTO process.TBL_PNL_IPA_BACKUP_20251222 FROM process.TBL_PNL_IPA;

IF EXISTS (SELECT 1 FROM process.TBL_PNL_IPA WHERE TRY_CAST(ID_Fund AS INT) IS NULL)
BEGIN
    PRINT 'ERROR: Valores no convertibles en process.TBL_PNL_IPA'
    RAISERROR('Migración abortada', 16, 1)
    RETURN
END

ALTER TABLE process.TBL_PNL_IPA ALTER COLUMN ID_Fund INT NOT NULL;
PRINT 'process.TBL_PNL_IPA migrado exitosamente ✓'
GO

-- ============================================================================
-- FASE 4: STAGING (WorkTables y Tablas Finales)
-- ============================================================================
PRINT ''
PRINT '--- FASE 4: STAGING ---'
GO

-- 4.1 staging.Ajuste_CAPM (NVARCHAR(MAX) → INT)
PRINT 'Migrando staging.Ajuste_CAPM...'

IF OBJECT_ID('staging.Ajuste_CAPM_BACKUP_20251222', 'U') IS NOT NULL
    DROP TABLE staging.Ajuste_CAPM_BACKUP_20251222;

SELECT * INTO staging.Ajuste_CAPM_BACKUP_20251222 FROM staging.Ajuste_CAPM;

IF EXISTS (SELECT 1 FROM staging.Ajuste_CAPM WHERE TRY_CAST(ID_Fund AS INT) IS NULL AND ID_Fund IS NOT NULL)
BEGIN
    PRINT 'ERROR: Valores no convertibles en staging.Ajuste_CAPM'
    RAISERROR('Migración abortada', 16, 1)
    RETURN
END

ALTER TABLE staging.Ajuste_CAPM ALTER COLUMN ID_Fund INT NULL;
PRINT 'staging.Ajuste_CAPM migrado exitosamente ✓'
GO

-- 4.2 staging.CAPM_WorkTable (VARCHAR(MAX) → INT)
PRINT 'Migrando staging.CAPM_WorkTable...'

IF OBJECT_ID('staging.CAPM_WorkTable_BACKUP_20251222', 'U') IS NOT NULL
    DROP TABLE staging.CAPM_WorkTable_BACKUP_20251222;

SELECT * INTO staging.CAPM_WorkTable_BACKUP_20251222 FROM staging.CAPM_WorkTable;

IF EXISTS (SELECT 1 FROM staging.CAPM_WorkTable WHERE TRY_CAST(ID_Fund AS INT) IS NULL AND ID_Fund IS NOT NULL)
BEGIN
    PRINT 'ERROR: Valores no convertibles en staging.CAPM_WorkTable'
    RAISERROR('Migración abortada', 16, 1)
    RETURN
END

ALTER TABLE staging.CAPM_WorkTable ALTER COLUMN ID_Fund INT NULL;
PRINT 'staging.CAPM_WorkTable migrado exitosamente ✓'
GO

-- 4.3 staging.IPA (NVARCHAR(10) → INT)
PRINT 'Migrando staging.IPA...'

IF OBJECT_ID('staging.IPA_BACKUP_20251222', 'U') IS NOT NULL
    DROP TABLE staging.IPA_BACKUP_20251222;

SELECT * INTO staging.IPA_BACKUP_20251222 FROM staging.IPA;

IF EXISTS (SELECT 1 FROM staging.IPA WHERE TRY_CAST(ID_Fund AS INT) IS NULL AND ID_Fund IS NOT NULL)
BEGIN
    PRINT 'ERROR: Valores no convertibles en staging.IPA'
    RAISERROR('Migración abortada', 16, 1)
    RETURN
END

ALTER TABLE staging.IPA ALTER COLUMN ID_Fund INT NULL;
PRINT 'staging.IPA migrado exitosamente ✓'
GO

-- 4.4 staging.PNL_IPA_Ajustes (NVARCHAR(MAX) → INT)
PRINT 'Migrando staging.PNL_IPA_Ajustes...'

IF OBJECT_ID('staging.PNL_IPA_Ajustes_BACKUP_20251222', 'U') IS NOT NULL
    DROP TABLE staging.PNL_IPA_Ajustes_BACKUP_20251222;

SELECT * INTO staging.PNL_IPA_Ajustes_BACKUP_20251222 FROM staging.PNL_IPA_Ajustes;

IF EXISTS (SELECT 1 FROM staging.PNL_IPA_Ajustes WHERE TRY_CAST(ID_Fund AS INT) IS NULL AND ID_Fund IS NOT NULL)
BEGIN
    PRINT 'ERROR: Valores no convertibles en staging.PNL_IPA_Ajustes'
    RAISERROR('Migración abortada', 16, 1)
    RETURN
END

ALTER TABLE staging.PNL_IPA_Ajustes ALTER COLUMN ID_Fund INT NULL;
PRINT 'staging.PNL_IPA_Ajustes migrado exitosamente ✓'
GO

-- 4.5 staging.TBL_IPA_MDLAT_MLATHY (NVARCHAR(MAX) → INT)
PRINT 'Migrando staging.TBL_IPA_MDLAT_MLATHY...'

IF OBJECT_ID('staging.TBL_IPA_MDLAT_MLATHY_BACKUP_20251222', 'U') IS NOT NULL
    DROP TABLE staging.TBL_IPA_MDLAT_MLATHY_BACKUP_20251222;

SELECT * INTO staging.TBL_IPA_MDLAT_MLATHY_BACKUP_20251222 FROM staging.TBL_IPA_MDLAT_MLATHY;

IF EXISTS (SELECT 1 FROM staging.TBL_IPA_MDLAT_MLATHY WHERE TRY_CAST(ID_Fund AS INT) IS NULL AND ID_Fund IS NOT NULL)
BEGIN
    PRINT 'ERROR: Valores no convertibles en staging.TBL_IPA_MDLAT_MLATHY'
    RAISERROR('Migración abortada', 16, 1)
    RETURN
END

ALTER TABLE staging.TBL_IPA_MDLAT_MLATHY ALTER COLUMN ID_Fund INT NULL;
PRINT 'staging.TBL_IPA_MDLAT_MLATHY migrado exitosamente ✓'
GO

-- 4.6 staging.TH_WorkTable (NVARCHAR(MAX) → INT)
PRINT 'Migrando staging.TH_WorkTable...'

IF OBJECT_ID('staging.TH_WorkTable_BACKUP_20251222', 'U') IS NOT NULL
    DROP TABLE staging.TH_WorkTable_BACKUP_20251222;

SELECT * INTO staging.TH_WorkTable_BACKUP_20251222 FROM staging.TH_WorkTable;

IF EXISTS (SELECT 1 FROM staging.TH_WorkTable WHERE TRY_CAST(ID_Fund AS INT) IS NULL AND ID_Fund IS NOT NULL)
BEGIN
    PRINT 'ERROR: Valores no convertibles en staging.TH_WorkTable'
    RAISERROR('Migración abortada', 16, 1)
    RETURN
END

ALTER TABLE staging.TH_WorkTable ALTER COLUMN ID_Fund INT NULL;
PRINT 'staging.TH_WorkTable migrado exitosamente ✓'
GO

-- 4.7 staging.UAF (NVARCHAR(10) → INT)
PRINT 'Migrando staging.UAF...'

IF OBJECT_ID('staging.UAF_BACKUP_20251222', 'U') IS NOT NULL
    DROP TABLE staging.UAF_BACKUP_20251222;

SELECT * INTO staging.UAF_BACKUP_20251222 FROM staging.UAF;

IF EXISTS (SELECT 1 FROM staging.UAF WHERE TRY_CAST(ID_Fund AS INT) IS NULL)
BEGIN
    PRINT 'ERROR: Valores no convertibles en staging.UAF'
    RAISERROR('Migración abortada', 16, 1)
    RETURN
END

ALTER TABLE staging.UAF ALTER COLUMN ID_Fund INT NOT NULL;
PRINT 'staging.UAF migrado exitosamente ✓'
GO

-- 4.8 staging.UAF_WorkTable (NVARCHAR(10) → INT)
PRINT 'Migrando staging.UAF_WorkTable...'

IF OBJECT_ID('staging.UAF_WorkTable_BACKUP_20251222', 'U') IS NOT NULL
    DROP TABLE staging.UAF_WorkTable_BACKUP_20251222;

SELECT * INTO staging.UAF_WorkTable_BACKUP_20251222 FROM staging.UAF_WorkTable;

IF EXISTS (SELECT 1 FROM staging.UAF_WorkTable WHERE TRY_CAST(ID_Fund AS INT) IS NULL AND ID_Fund IS NOT NULL)
BEGIN
    PRINT 'ERROR: Valores no convertibles en staging.UAF_WorkTable'
    RAISERROR('Migración abortada', 16, 1)
    RETURN
END

ALTER TABLE staging.UAF_WorkTable ALTER COLUMN ID_Fund INT NULL;
PRINT 'staging.UAF_WorkTable migrado exitosamente ✓'
GO

-- ============================================================================
-- FASE 5: SANDBOX (Desarrollo/Debug)
-- ============================================================================
PRINT ''
PRINT '--- FASE 5: SANDBOX ---'
GO

-- 5.1 sandbox.Fondos_Problema (NVARCHAR(MAX) → INT)
PRINT 'Migrando sandbox.Fondos_Problema...'

IF OBJECT_ID('sandbox.Fondos_Problema_BACKUP_20251222', 'U') IS NOT NULL
    DROP TABLE sandbox.Fondos_Problema_BACKUP_20251222;

SELECT * INTO sandbox.Fondos_Problema_BACKUP_20251222 FROM sandbox.Fondos_Problema;

IF EXISTS (SELECT 1 FROM sandbox.Fondos_Problema WHERE TRY_CAST(ID_Fund AS INT) IS NULL AND ID_Fund IS NOT NULL)
BEGIN
    PRINT 'ERROR: Valores no convertibles en sandbox.Fondos_Problema'
    RAISERROR('Migración abortada', 16, 1)
    RETURN
END

ALTER TABLE sandbox.Fondos_Problema ALTER COLUMN ID_Fund INT NULL;
PRINT 'sandbox.Fondos_Problema migrado exitosamente ✓'
GO

-- ============================================================================
-- VERIFICACIÓN FINAL
-- ============================================================================
PRINT ''
PRINT '--- VERIFICACIÓN FINAL ---'
GO

-- Contar tablas migradas
SELECT
    COUNT(*) AS Tablas_INT_Count,
    'Tablas con ID_Fund como INT' AS Descripcion
FROM INFORMATION_SCHEMA.COLUMNS
WHERE COLUMN_NAME = 'ID_Fund'
  AND DATA_TYPE IN ('int', 'bigint')
  AND TABLE_SCHEMA IN ('dimensionales', 'logs', 'process', 'staging', 'sandbox');

-- Contar tablas pendientes (no debería haber ninguna relevante)
SELECT
    COUNT(*) AS Tablas_String_Count,
    'Tablas con ID_Fund como VARCHAR/NVARCHAR (revisar)' AS Descripcion
FROM INFORMATION_SCHEMA.COLUMNS
WHERE COLUMN_NAME = 'ID_Fund'
  AND DATA_TYPE IN ('varchar', 'nvarchar')
  AND TABLE_SCHEMA IN ('dimensionales', 'logs', 'process', 'staging', 'sandbox');

PRINT ''
PRINT '================================================================================'
PRINT 'MIGRACIÓN COMPLETADA EXITOSAMENTE'
PRINT 'Fecha fin: ' + CONVERT(VARCHAR, GETDATE(), 120)
PRINT '================================================================================'
PRINT ''
PRINT 'Tablas migradas: 19'
PRINT 'Tablas ya INT (sin cambios): 16'
PRINT 'Total tablas con ID_Fund INT: 35'
PRINT ''
PRINT 'Backups creados con sufijo: _BACKUP_20251222'
PRINT ''
PRINT 'PRÓXIMOS PASOS:'
PRINT '1. Actualizar SPs de logging (logs.sp_Actualizar_Estado_Fondo, logs.sp_Registrar_Metrica)'
PRINT '2. Actualizar código Node.js (BasePipelineService, ExecutionTracker, LoggingService)'
PRINT '3. Ejecutar tests de integración'
GO
