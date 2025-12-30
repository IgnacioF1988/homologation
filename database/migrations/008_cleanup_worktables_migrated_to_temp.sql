-- =====================================================
-- MIGRATION 008: Cleanup WorkTables Migrated to Temp Tables
-- Date: 2025-12-29
-- Description: Elimina las WorkTables permanentes que fueron
--              migradas a tablas temporales globales (##)
-- =====================================================

SET NOCOUNT ON;

PRINT '=== Migration 008: Cleanup WorkTables ===';
PRINT 'Fecha: ' + CONVERT(VARCHAR, GETDATE(), 120);
PRINT '';

-- =====================================================
-- SCHEMA STAGING: WorkTables de pipelines migrados
-- Estas tablas ya no se usan porque ahora se crean
-- tablas temporales ##Pipeline_Work_{ID}_{Fund}
-- =====================================================
PRINT '>>> Eliminando WorkTables migradas a temporales...';

IF OBJECT_ID('staging.PNL_WorkTable', 'U') IS NOT NULL
BEGIN
    DROP TABLE staging.PNL_WorkTable;
    PRINT '    DROP staging.PNL_WorkTable';
END

IF OBJECT_ID('staging.CAPM_WorkTable', 'U') IS NOT NULL
BEGIN
    DROP TABLE staging.CAPM_WorkTable;
    PRINT '    DROP staging.CAPM_WorkTable';
END

IF OBJECT_ID('staging.Derivados_WorkTable', 'U') IS NOT NULL
BEGIN
    DROP TABLE staging.Derivados_WorkTable;
    PRINT '    DROP staging.Derivados_WorkTable';
END

IF OBJECT_ID('staging.UBS_WorkTable', 'U') IS NOT NULL
BEGIN
    DROP TABLE staging.UBS_WorkTable;
    PRINT '    DROP staging.UBS_WorkTable';
END

PRINT '';

-- =====================================================
-- SCHEMA STAGING: Backups antiguos
-- =====================================================
PRINT '>>> Eliminando backups de staging...';

IF OBJECT_ID('staging.BACKUP_20251223_IPA_Cash', 'U') IS NOT NULL
BEGIN
    DROP TABLE staging.BACKUP_20251223_IPA_Cash;
    PRINT '    DROP staging.BACKUP_20251223_IPA_Cash';
END

IF OBJECT_ID('staging.BACKUP_20251223_IPA_Final', 'U') IS NOT NULL
BEGIN
    DROP TABLE staging.BACKUP_20251223_IPA_Final;
    PRINT '    DROP staging.BACKUP_20251223_IPA_Final';
END

IF OBJECT_ID('staging.BACKUP_20251223_IPA_WorkTable', 'U') IS NOT NULL
BEGIN
    DROP TABLE staging.BACKUP_20251223_IPA_WorkTable;
    PRINT '    DROP staging.BACKUP_20251223_IPA_WorkTable';
END

IF OBJECT_ID('staging.BACKUP_20251223_PNL_WorkTable', 'U') IS NOT NULL
BEGIN
    DROP TABLE staging.BACKUP_20251223_PNL_WorkTable;
    PRINT '    DROP staging.BACKUP_20251223_PNL_WorkTable';
END

IF OBJECT_ID('staging.BACKUP_20251223_UBS_WorkTable', 'U') IS NOT NULL
BEGIN
    DROP TABLE staging.BACKUP_20251223_UBS_WorkTable;
    PRINT '    DROP staging.BACKUP_20251223_UBS_WorkTable';
END

IF OBJECT_ID('staging.IPA_BACKUP_20251222', 'U') IS NOT NULL
BEGIN
    DROP TABLE staging.IPA_BACKUP_20251222;
    PRINT '    DROP staging.IPA_BACKUP_20251222';
END

IF OBJECT_ID('staging.CAPM_WorkTable_BACKUP_20251222', 'U') IS NOT NULL
BEGIN
    DROP TABLE staging.CAPM_WorkTable_BACKUP_20251222;
    PRINT '    DROP staging.CAPM_WorkTable_BACKUP_20251222';
END

IF OBJECT_ID('staging.TH_WorkTable_BACKUP_20251222', 'U') IS NOT NULL
BEGIN
    DROP TABLE staging.TH_WorkTable_BACKUP_20251222;
    PRINT '    DROP staging.TH_WorkTable_BACKUP_20251222';
END

IF OBJECT_ID('staging.UAF_WorkTable_BACKUP_20251222', 'U') IS NOT NULL
BEGIN
    DROP TABLE staging.UAF_WorkTable_BACKUP_20251222;
    PRINT '    DROP staging.UAF_WorkTable_BACKUP_20251222';
END

IF OBJECT_ID('staging.Ajuste_CAPM_BACKUP_20251222', 'U') IS NOT NULL
BEGIN
    DROP TABLE staging.Ajuste_CAPM_BACKUP_20251222;
    PRINT '    DROP staging.Ajuste_CAPM_BACKUP_20251222';
END

IF OBJECT_ID('staging.PNL_IPA_Ajustes_BACKUP_20251222', 'U') IS NOT NULL
BEGIN
    DROP TABLE staging.PNL_IPA_Ajustes_BACKUP_20251222;
    PRINT '    DROP staging.PNL_IPA_Ajustes_BACKUP_20251222';
END

IF OBJECT_ID('staging.TBL_IPA_MDLAT_MLATHY_BACKUP_20251222', 'U') IS NOT NULL
BEGIN
    DROP TABLE staging.TBL_IPA_MDLAT_MLATHY_BACKUP_20251222;
    PRINT '    DROP staging.TBL_IPA_MDLAT_MLATHY_BACKUP_20251222';
END

IF OBJECT_ID('staging.UAF_BACKUP_20251222', 'U') IS NOT NULL
BEGIN
    DROP TABLE staging.UAF_BACKUP_20251222;
    PRINT '    DROP staging.UAF_BACKUP_20251222';
END

PRINT '';

-- =====================================================
-- SCHEMA LOGS: Tablas redundantes
-- NOTA: logs.BBG_Log se PRESERVA para Bloomberg
-- =====================================================
PRINT '>>> Eliminando tablas redundantes de logs...';

IF OBJECT_ID('logs.SP_Errors', 'U') IS NOT NULL
BEGIN
    DROP TABLE logs.SP_Errors;
    PRINT '    DROP logs.SP_Errors';
END

IF OBJECT_ID('logs.Ejecucion_Metricas', 'U') IS NOT NULL
BEGIN
    DROP TABLE logs.Ejecucion_Metricas;
    PRINT '    DROP logs.Ejecucion_Metricas';
END

-- logs.BBG_Log -> PRESERVAR (Bloomberg) - NO ELIMINAR

PRINT '';

-- =====================================================
-- SCHEMA LOGS: Backups
-- =====================================================
PRINT '>>> Eliminando backups de logs...';

IF OBJECT_ID('logs.Ejecucion_Fondos_BACKUP_20251222', 'U') IS NOT NULL
BEGIN
    DROP TABLE logs.Ejecucion_Fondos_BACKUP_20251222;
    PRINT '    DROP logs.Ejecucion_Fondos_BACKUP_20251222';
END

IF OBJECT_ID('logs.Ejecucion_Logs_BACKUP_20251222', 'U') IS NOT NULL
BEGIN
    DROP TABLE logs.Ejecucion_Logs_BACKUP_20251222;
    PRINT '    DROP logs.Ejecucion_Logs_BACKUP_20251222';
END

IF OBJECT_ID('logs.Ejecucion_Metricas_BACKUP_20251222', 'U') IS NOT NULL
BEGIN
    DROP TABLE logs.Ejecucion_Metricas_BACKUP_20251222;
    PRINT '    DROP logs.Ejecucion_Metricas_BACKUP_20251222';
END

PRINT '';

-- =====================================================
-- SCHEMA DIMENSIONALES: Backups
-- =====================================================
PRINT '>>> Eliminando backups de dimensionales...';

IF OBJECT_ID('dimensionales.BD_Funds_BACKUP_20251222', 'U') IS NOT NULL
BEGIN
    DROP TABLE dimensionales.BD_Funds_BACKUP_20251222;
    PRINT '    DROP dimensionales.BD_Funds_BACKUP_20251222';
END

IF OBJECT_ID('dimensionales.HOMOL_Funds_BACKUP_20251222', 'U') IS NOT NULL
BEGIN
    DROP TABLE dimensionales.HOMOL_Funds_BACKUP_20251222;
    PRINT '    DROP dimensionales.HOMOL_Funds_BACKUP_20251222';
END

PRINT '';

-- =====================================================
-- SCHEMA SANDBOX: Backups
-- =====================================================
PRINT '>>> Eliminando backups de sandbox...';

IF OBJECT_ID('sandbox.Fondos_Problema_BACKUP_20251222', 'U') IS NOT NULL
BEGIN
    DROP TABLE sandbox.Fondos_Problema_BACKUP_20251222;
    PRINT '    DROP sandbox.Fondos_Problema_BACKUP_20251222';
END

PRINT '';

-- =====================================================
-- SCHEMA PROCESS: Backups
-- =====================================================
PRINT '>>> Eliminando backups de process...';

IF OBJECT_ID('process.TBL_IPA_BACKUP_20251222', 'U') IS NOT NULL
BEGIN
    DROP TABLE process.TBL_IPA_BACKUP_20251222;
    PRINT '    DROP process.TBL_IPA_BACKUP_20251222';
END

IF OBJECT_ID('process.TBL_PNL_BACKUP_20251222', 'U') IS NOT NULL
BEGIN
    DROP TABLE process.TBL_PNL_BACKUP_20251222;
    PRINT '    DROP process.TBL_PNL_BACKUP_20251222';
END

IF OBJECT_ID('process.TBL_PNL_IPA_BACKUP_20251222', 'U') IS NOT NULL
BEGIN
    DROP TABLE process.TBL_PNL_IPA_BACKUP_20251222;
    PRINT '    DROP process.TBL_PNL_IPA_BACKUP_20251222';
END

PRINT '';
PRINT '=== Migration 008 completada ===';
PRINT '';
