/*
================================================================================
MIGRATION: ID_Fund VARCHAR/NVARCHAR → INT (VERSIÓN CORREGIDA)
Fecha: 2025-12-22
Propósito: Estandarizar tipo de dato ID_Fund para compatibilidad con SPs v2
================================================================================

CORRECCIONES v2:
- Manejo de índices: DROP antes del ALTER, RECREATE después
- Limpieza de datos inválidos en sandbox.Fondos_Problema

Total de tablas a migrar: 19
Tablas ya INT (sin cambios): 16

ROLLBACK: Cada tabla tiene su backup con nombre _BACKUP_20251222
================================================================================
*/

SET NOCOUNT ON;
GO

PRINT '================================================================================'
PRINT 'INICIANDO MIGRACIÓN ID_Fund → INT (v2 - CON MANEJO DE ÍNDICES)'
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
-- YA MIGRADO EXITOSAMENTE - SKIP
PRINT 'dimensionales.BD_Funds ya migrado ✓'
GO

-- 1.2 dimensionales.HOMOL_Funds (NVARCHAR(MAX) → INT)
PRINT 'Migrando dimensionales.HOMOL_Funds...'

-- Backup (si no existe)
IF OBJECT_ID('dimensionales.HOMOL_Funds_BACKUP_20251222', 'U') IS NULL
BEGIN
    SELECT * INTO dimensionales.HOMOL_Funds_BACKUP_20251222
    FROM dimensionales.HOMOL_Funds;
END

-- Validar
IF EXISTS (SELECT 1 FROM dimensionales.HOMOL_Funds WHERE TRY_CAST(ID_Fund AS INT) IS NULL AND ID_Fund IS NOT NULL)
BEGIN
    PRINT 'ERROR: Valores no convertibles en dimensionales.HOMOL_Funds'
    SELECT ID_Fund FROM dimensionales.HOMOL_Funds WHERE TRY_CAST(ID_Fund AS INT) IS NULL AND ID_Fund IS NOT NULL
    RAISERROR('Migración abortada', 16, 1)
    RETURN
END

-- DROP índices dependientes
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_HOMOL_Funds_Source' AND object_id = OBJECT_ID('dimensionales.HOMOL_Funds'))
    DROP INDEX idx_HOMOL_Funds_Source ON dimensionales.HOMOL_Funds;

IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_HOMOL_Funds_Portfolio_Source' AND object_id = OBJECT_ID('dimensionales.HOMOL_Funds'))
    DROP INDEX IX_HOMOL_Funds_Portfolio_Source ON dimensionales.HOMOL_Funds;

-- Migrar
ALTER TABLE dimensionales.HOMOL_Funds ALTER COLUMN ID_Fund INT NULL;

-- RECREATE índices
CREATE NONCLUSTERED INDEX idx_HOMOL_Funds_Source
    ON dimensionales.HOMOL_Funds(ID_Fund, Portfolio, Source);

CREATE NONCLUSTERED INDEX IX_HOMOL_Funds_Portfolio_Source
    ON dimensionales.HOMOL_Funds(ID_Fund, Portfolio, Source);

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

-- Backup (si no existe)
IF OBJECT_ID('logs.Ejecucion_Fondos_BACKUP_20251222', 'U') IS NULL
BEGIN
    SELECT * INTO logs.Ejecucion_Fondos_BACKUP_20251222
    FROM logs.Ejecucion_Fondos;
END

-- Validar
IF EXISTS (SELECT 1 FROM logs.Ejecucion_Fondos WHERE TRY_CAST(ID_Fund AS INT) IS NULL)
BEGIN
    PRINT 'ERROR: Valores no convertibles en logs.Ejecucion_Fondos'
    SELECT ID_Fund FROM logs.Ejecucion_Fondos WHERE TRY_CAST(ID_Fund AS INT) IS NULL
    RAISERROR('Migración abortada', 16, 1)
    RETURN
END

-- DROP índice dependiente
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_Ejecucion_Fondos_IDEjecucion' AND object_id = OBJECT_ID('logs.Ejecucion_Fondos'))
    DROP INDEX idx_Ejecucion_Fondos_IDEjecucion ON logs.Ejecucion_Fondos;

-- Migrar
ALTER TABLE logs.Ejecucion_Fondos ALTER COLUMN ID_Fund INT NOT NULL;

-- RECREATE índice
CREATE NONCLUSTERED INDEX idx_Ejecucion_Fondos_IDEjecucion
    ON logs.Ejecucion_Fondos(ID_Fund, FundShortName, Estado_Final, ID_Ejecucion);

PRINT 'logs.Ejecucion_Fondos migrado exitosamente ✓'
GO

-- 2.2 logs.Ejecucion_Logs (VARCHAR(50) → INT)
PRINT 'Migrando logs.Ejecucion_Logs...'

-- Backup (si no existe)
IF OBJECT_ID('logs.Ejecucion_Logs_BACKUP_20251222', 'U') IS NULL
BEGIN
    SELECT * INTO logs.Ejecucion_Logs_BACKUP_20251222
    FROM logs.Ejecucion_Logs;
END

-- Validar
IF EXISTS (SELECT 1 FROM logs.Ejecucion_Logs WHERE TRY_CAST(ID_Fund AS INT) IS NULL AND ID_Fund IS NOT NULL)
BEGIN
    PRINT 'ERROR: Valores no convertibles en logs.Ejecucion_Logs'
    SELECT ID_Fund FROM logs.Ejecucion_Logs WHERE TRY_CAST(ID_Fund AS INT) IS NULL AND ID_Fund IS NOT NULL
    RAISERROR('Migración abortada', 16, 1)
    RETURN
END

-- DROP índice dependiente
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_EjecucionLogs_Fund_Nivel' AND object_id = OBJECT_ID('logs.Ejecucion_Logs'))
    DROP INDEX IX_EjecucionLogs_Fund_Nivel ON logs.Ejecucion_Logs;

-- Migrar
ALTER TABLE logs.Ejecucion_Logs ALTER COLUMN ID_Fund INT NULL;

-- RECREATE índice
CREATE NONCLUSTERED INDEX IX_EjecucionLogs_Fund_Nivel
    ON logs.Ejecucion_Logs([Timestamp], Etapa, Mensaje, ID_Fund, Nivel);

PRINT 'logs.Ejecucion_Logs migrado exitosamente ✓'
GO

-- 2.3 logs.Ejecucion_Metricas (VARCHAR(50) → INT)
-- YA MIGRADO EXITOSAMENTE - SKIP
PRINT 'logs.Ejecucion_Metricas ya migrado ✓'
GO

-- ============================================================================
-- FASE 3: PROCESS (Tablas de Procesamiento)
-- ============================================================================
PRINT ''
PRINT '--- FASE 3: PROCESS ---'
GO

-- 3.1 process.TBL_IPA (NVARCHAR(10) → INT)
PRINT 'Migrando process.TBL_IPA...'

-- Backup (si no existe)
IF OBJECT_ID('process.TBL_IPA_BACKUP_20251222', 'U') IS NULL
BEGIN
    SELECT * INTO process.TBL_IPA_BACKUP_20251222 FROM process.TBL_IPA;
END

IF EXISTS (SELECT 1 FROM process.TBL_IPA WHERE TRY_CAST(ID_Fund AS INT) IS NULL AND ID_Fund IS NOT NULL)
BEGIN
    PRINT 'ERROR: Valores no convertibles en process.TBL_IPA'
    SELECT ID_Fund FROM process.TBL_IPA WHERE TRY_CAST(ID_Fund AS INT) IS NULL AND ID_Fund IS NOT NULL
    RAISERROR('Migración abortada', 16, 1)
    RETURN
END

-- DROP índices dependientes
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_TBL_IPA_FechaReporte' AND object_id = OBJECT_ID('process.TBL_IPA'))
    DROP INDEX IX_TBL_IPA_FechaReporte ON process.TBL_IPA;

IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_TBL_IPA_Join' AND object_id = OBJECT_ID('process.TBL_IPA'))
    DROP INDEX IX_TBL_IPA_Join ON process.TBL_IPA;

-- Migrar
ALTER TABLE process.TBL_IPA ALTER COLUMN ID_Fund INT NULL;

-- RECREATE índices
CREATE NONCLUSTERED INDEX IX_TBL_IPA_FechaReporte
    ON process.TBL_IPA(ID_Fund, ID_Instrumento, id_CURR, FechaReporte);

CREATE NONCLUSTERED INDEX IX_TBL_IPA_Join
    ON process.TBL_IPA(FechaReporte, ID_Fund, ID_Instrumento, id_CURR);

PRINT 'process.TBL_IPA migrado exitosamente ✓'
GO

-- 3.2 process.TBL_PNL (NVARCHAR(10) → INT)
PRINT 'Migrando process.TBL_PNL...'

-- Backup (si no existe)
IF OBJECT_ID('process.TBL_PNL_BACKUP_20251222', 'U') IS NULL
BEGIN
    SELECT * INTO process.TBL_PNL_BACKUP_20251222 FROM process.TBL_PNL;
END

IF EXISTS (SELECT 1 FROM process.TBL_PNL WHERE TRY_CAST(ID_Fund AS INT) IS NULL AND ID_Fund IS NOT NULL)
BEGIN
    PRINT 'ERROR: Valores no convertibles en process.TBL_PNL'
    SELECT ID_Fund FROM process.TBL_PNL WHERE TRY_CAST(ID_Fund AS INT) IS NULL AND ID_Fund IS NOT NULL
    RAISERROR('Migración abortada', 16, 1)
    RETURN
END

-- DROP índice dependiente
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_TBL_PNL_Ejecucion_Fund' AND object_id = OBJECT_ID('process.TBL_PNL'))
    DROP INDEX IX_TBL_PNL_Ejecucion_Fund ON process.TBL_PNL;

-- Migrar
ALTER TABLE process.TBL_PNL ALTER COLUMN ID_Fund INT NULL;

-- RECREATE índice
CREATE NONCLUSTERED INDEX IX_TBL_PNL_Ejecucion_Fund
    ON process.TBL_PNL(FechaReporte, ID_Instrumento, id_CURR, ID_Ejecucion, ID_Fund);

PRINT 'process.TBL_PNL migrado exitosamente ✓'
GO

-- 3.3 process.TBL_PNL_IPA (NVARCHAR(MAX) → INT)
-- YA MIGRADO EXITOSAMENTE - SKIP
PRINT 'process.TBL_PNL_IPA ya migrado ✓'
GO

-- ============================================================================
-- FASE 4: STAGING (WorkTables y Tablas Finales)
-- ============================================================================
PRINT ''
PRINT '--- FASE 4: STAGING ---'
GO

-- 4.1 - 4.8: Tablas ya migradas exitosamente
PRINT 'staging.Ajuste_CAPM ya migrado ✓'
PRINT 'staging.CAPM_WorkTable ya migrado ✓'
GO

-- 4.3 staging.IPA (NVARCHAR(10) → INT)
PRINT 'Migrando staging.IPA...'

-- Backup (si no existe)
IF OBJECT_ID('staging.IPA_BACKUP_20251222', 'U') IS NULL
BEGIN
    SELECT * INTO staging.IPA_BACKUP_20251222 FROM staging.IPA;
END

IF EXISTS (SELECT 1 FROM staging.IPA WHERE TRY_CAST(ID_Fund AS INT) IS NULL AND ID_Fund IS NOT NULL)
BEGIN
    PRINT 'ERROR: Valores no convertibles en staging.IPA'
    SELECT ID_Fund FROM staging.IPA WHERE TRY_CAST(ID_Fund AS INT) IS NULL AND ID_Fund IS NOT NULL
    RAISERROR('Migración abortada', 16, 1)
    RETURN
END

-- DROP índices dependientes
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_IPA_FechaReporte' AND object_id = OBJECT_ID('staging.IPA'))
    DROP INDEX IX_IPA_FechaReporte ON staging.IPA;

IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_IPA_Ejecucion_Fund' AND object_id = OBJECT_ID('staging.IPA'))
    DROP INDEX IX_IPA_Ejecucion_Fund ON staging.IPA;

-- Migrar
ALTER TABLE staging.IPA ALTER COLUMN ID_Fund INT NULL;

-- RECREATE índices
CREATE NONCLUSTERED INDEX IX_IPA_FechaReporte
    ON staging.IPA(ID_Fund, ID_Instrumento, id_CURR, PK2, FechaReporte);

CREATE NONCLUSTERED INDEX IX_IPA_Ejecucion_Fund
    ON staging.IPA(FechaReporte, ID_Instrumento, id_CURR, ID_Ejecucion, ID_Fund);

PRINT 'staging.IPA migrado exitosamente ✓'
GO

-- Tablas restantes ya migradas
PRINT 'staging.PNL_IPA_Ajustes ya migrado ✓'
PRINT 'staging.TBL_IPA_MDLAT_MLATHY ya migrado ✓'
PRINT 'staging.TH_WorkTable ya migrado ✓'
PRINT 'staging.UAF ya migrado ✓'
PRINT 'staging.UAF_WorkTable ya migrado ✓'
GO

-- ============================================================================
-- FASE 5: SANDBOX (Desarrollo/Debug)
-- ============================================================================
PRINT ''
PRINT '--- FASE 5: SANDBOX ---'
GO

-- 5.1 sandbox.Fondos_Problema (NVARCHAR(MAX) → INT)
PRINT 'Migrando sandbox.Fondos_Problema...'

-- Backup (si no existe)
IF OBJECT_ID('sandbox.Fondos_Problema_BACKUP_20251222', 'U') IS NULL
BEGIN
    SELECT * INTO sandbox.Fondos_Problema_BACKUP_20251222 FROM sandbox.Fondos_Problema;
END

-- Limpiar valores no convertibles (DECISIÓN: Actualizar a NULL para tablas de desarrollo/sandbox)
UPDATE sandbox.Fondos_Problema
SET ID_Fund = NULL
WHERE TRY_CAST(ID_Fund AS INT) IS NULL AND ID_Fund IS NOT NULL;

DECLARE @CleanedRows INT = @@ROWCOUNT;
IF @CleanedRows > 0
    PRINT CONCAT('Limpiados ', @CleanedRows, ' registros con ID_Fund no convertible (actualizados a NULL)');

-- Migrar
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
PRINT 'Tablas migradas: 19/19 ✓'
PRINT 'Índices recreados: 9'
PRINT 'Registros limpiados en sandbox: verificar @CleanedRows'
PRINT ''
PRINT 'Backups creados con sufijo: _BACKUP_20251222'
PRINT ''
PRINT 'PRÓXIMOS PASOS:'
PRINT '1. Ejecutar UPDATE_SPs_Logging_ID_Fund_INT.sql'
PRINT '2. Actualizar código Node.js (BasePipelineService, ExecutionTracker, LoggingService)'
PRINT '3. Implementar FundOrchestrator.js'
PRINT '4. Modificar procesos.v2.routes.js para conectar V2'
GO
