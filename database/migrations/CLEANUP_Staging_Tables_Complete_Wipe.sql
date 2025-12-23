-- ============================================
-- Script: Limpieza Completa de Tablas Staging
-- Fecha: 2025-12-23
-- Propósito: Borrar TODO el contenido de tablas staging
--            para eliminar datos históricos con ID_Fund=0 e ID_Ejecucion=0
-- ============================================
-- IMPORTANTE: Este script BORRA TODO el contenido de las tablas staging.
--             Solo los datos temporales/intermedios se almacenan aquí.
--             Los datos finales están en otras tablas (cubo, dimensionales, etc.)
-- ============================================

USE Inteligencia_Producto_Dev;
GO

PRINT '============================================';
PRINT 'INICIO DE LIMPIEZA COMPLETA - STAGING SCHEMA';
PRINT 'Fecha: ' + CONVERT(VARCHAR, GETDATE(), 120);
PRINT '============================================';
PRINT '';

-- ============================================
-- PASO 1: CREAR BACKUPS (Solo si hay datos)
-- ============================================
PRINT 'PASO 1: Creando backups de tablas con datos...';
PRINT '';

-- Backup de PNL_WorkTable (1.37M registros)
IF EXISTS (SELECT 1 FROM staging.PNL_WorkTable)
BEGIN
    SELECT * INTO staging.BACKUP_20251223_PNL_WorkTable
    FROM staging.PNL_WorkTable;
    PRINT '✓ Backup creado: staging.BACKUP_20251223_PNL_WorkTable (' +
          CAST((SELECT COUNT(*) FROM staging.BACKUP_20251223_PNL_WorkTable) AS VARCHAR) + ' registros)';
END
ELSE
    PRINT '- PNL_WorkTable ya está vacía, skip backup';

-- Backup de UBS_WorkTable
IF EXISTS (SELECT 1 FROM staging.UBS_WorkTable)
BEGIN
    SELECT * INTO staging.BACKUP_20251223_UBS_WorkTable
    FROM staging.UBS_WorkTable;
    PRINT '✓ Backup creado: staging.BACKUP_20251223_UBS_WorkTable (' +
          CAST((SELECT COUNT(*) FROM staging.BACKUP_20251223_UBS_WorkTable) AS VARCHAR) + ' registros)';
END
ELSE
    PRINT '- UBS_WorkTable ya está vacía, skip backup';

-- Backup de IPA_WorkTable
IF EXISTS (SELECT 1 FROM staging.IPA_WorkTable)
BEGIN
    SELECT * INTO staging.BACKUP_20251223_IPA_WorkTable
    FROM staging.IPA_WorkTable;
    PRINT '✓ Backup creado: staging.BACKUP_20251223_IPA_WorkTable (' +
          CAST((SELECT COUNT(*) FROM staging.BACKUP_20251223_IPA_WorkTable) AS VARCHAR) + ' registros)';
END
ELSE
    PRINT '- IPA_WorkTable ya está vacía, skip backup';

-- Backup de CAPM_WorkTable
IF EXISTS (SELECT 1 FROM staging.CAPM_WorkTable)
BEGIN
    SELECT * INTO staging.BACKUP_20251223_CAPM_WorkTable
    FROM staging.CAPM_WorkTable;
    PRINT '✓ Backup creado: staging.BACKUP_20251223_CAPM_WorkTable (' +
          CAST((SELECT COUNT(*) FROM staging.BACKUP_20251223_CAPM_WorkTable) AS VARCHAR) + ' registros)';
END
ELSE
    PRINT '- CAPM_WorkTable ya está vacía, skip backup';

-- Backup de Derivados_WorkTable
IF EXISTS (SELECT 1 FROM staging.Derivados_WorkTable)
BEGIN
    SELECT * INTO staging.BACKUP_20251223_Derivados_WorkTable
    FROM staging.Derivados_WorkTable;
    PRINT '✓ Backup creado: staging.BACKUP_20251223_Derivados_WorkTable (' +
          CAST((SELECT COUNT(*) FROM staging.BACKUP_20251223_Derivados_WorkTable) AS VARCHAR) + ' registros)';
END
ELSE
    PRINT '- Derivados_WorkTable ya está vacía, skip backup';

PRINT '';
PRINT 'Backups completados.';
PRINT '';

-- ============================================
-- PASO 2: TRUNCATE TODAS LAS TABLAS STAGING
-- ============================================
PRINT 'PASO 2: Limpiando todas las tablas staging...';
PRINT '';

-- WorkTables (Tablas de trabajo temporales)
PRINT '--- WorkTables ---';
TRUNCATE TABLE staging.IPA_WorkTable;
PRINT '✓ staging.IPA_WorkTable limpiada';

TRUNCATE TABLE staging.CAPM_WorkTable;
PRINT '✓ staging.CAPM_WorkTable limpiada';

TRUNCATE TABLE staging.Derivados_WorkTable;
PRINT '✓ staging.Derivados_WorkTable limpiada';

TRUNCATE TABLE staging.PNL_WorkTable;
PRINT '✓ staging.PNL_WorkTable limpiada';

TRUNCATE TABLE staging.UBS_WorkTable;
PRINT '✓ staging.UBS_WorkTable limpiada';

TRUNCATE TABLE staging.UAF_WorkTable;
PRINT '✓ staging.UAF_WorkTable limpiada';

PRINT '';

-- Tablas de Cash/Final
PRINT '--- Tablas Cash/Final ---';
TRUNCATE TABLE staging.IPA_Cash;
PRINT '✓ staging.IPA_Cash limpiada';

TRUNCATE TABLE staging.IPA_Final;
PRINT '✓ staging.IPA_Final limpiada';

TRUNCATE TABLE staging.IPA_MTM;
PRINT '✓ staging.IPA_MTM limpiada';

PRINT '';

-- Tablas de Ajuste
PRINT '--- Tablas de Ajuste ---';
TRUNCATE TABLE staging.Ajuste_CAPM;
PRINT '✓ staging.Ajuste_CAPM limpiada';

TRUNCATE TABLE staging.Ajuste_Derivados;
PRINT '✓ staging.Ajuste_Derivados limpiada';

TRUNCATE TABLE staging.Ajuste_Paridades;
PRINT '✓ staging.Ajuste_Paridades limpiada';

TRUNCATE TABLE staging.Ajuste_PNL;
PRINT '✓ staging.Ajuste_PNL limpiada';

TRUNCATE TABLE staging.Ajuste_SONA;
PRINT '✓ staging.Ajuste_SONA limpiada';

PRINT '';

-- Tablas finales de proceso
PRINT '--- Tablas Finales de Proceso ---';
TRUNCATE TABLE staging.IPA;
PRINT '✓ staging.IPA limpiada';

TRUNCATE TABLE staging.CAPM;
PRINT '✓ staging.CAPM limpiada';

TRUNCATE TABLE staging.Derivados;
PRINT '✓ staging.Derivados limpiada';

TRUNCATE TABLE staging.PNL;
PRINT '✓ staging.PNL limpiada';

TRUNCATE TABLE staging.UAF;
PRINT '✓ staging.UAF limpiada';

PRINT '';

-- Tablas PNL específicas
PRINT '--- Tablas PNL Específicas ---';
TRUNCATE TABLE staging.PNL_IPA;
PRINT '✓ staging.PNL_IPA limpiada';

TRUNCATE TABLE staging.PNL_IPA_Ajustes;
PRINT '✓ staging.PNL_IPA_Ajustes limpiada';

TRUNCATE TABLE staging.PNL_ValoresAcumulados;
PRINT '✓ staging.PNL_ValoresAcumulados limpiada';

PRINT '';

-- Tablas UBS/MLCCII (Fondos Luxemburgo)
PRINT '--- Tablas UBS/MLCCII ---';
TRUNCATE TABLE staging.MLCCII;
PRINT '✓ staging.MLCCII limpiada';

TRUNCATE TABLE staging.MLCCII_Derivados;
PRINT '✓ staging.MLCCII_Derivados limpiada';

PRINT '';

-- Tablas especiales
PRINT '--- Tablas Especiales ---';
TRUNCATE TABLE staging.TBL_IPA_MDLAT_MLATHY;
PRINT '✓ staging.TBL_IPA_MDLAT_MLATHY limpiada';

PRINT '';

-- ============================================
-- PASO 3: VERIFICACIÓN DE LIMPIEZA
-- ============================================
PRINT 'PASO 3: Verificando limpieza...';
PRINT '';

DECLARE @TotalRegistros INT = 0;

-- Verificar cada tabla
SELECT @TotalRegistros =
    (SELECT COUNT(*) FROM staging.IPA_WorkTable) +
    (SELECT COUNT(*) FROM staging.CAPM_WorkTable) +
    (SELECT COUNT(*) FROM staging.Derivados_WorkTable) +
    (SELECT COUNT(*) FROM staging.PNL_WorkTable) +
    (SELECT COUNT(*) FROM staging.UBS_WorkTable) +
    (SELECT COUNT(*) FROM staging.UAF_WorkTable) +
    (SELECT COUNT(*) FROM staging.IPA_Cash) +
    (SELECT COUNT(*) FROM staging.IPA_Final) +
    (SELECT COUNT(*) FROM staging.IPA_MTM) +
    (SELECT COUNT(*) FROM staging.Ajuste_CAPM) +
    (SELECT COUNT(*) FROM staging.Ajuste_Derivados) +
    (SELECT COUNT(*) FROM staging.Ajuste_Paridades) +
    (SELECT COUNT(*) FROM staging.Ajuste_PNL) +
    (SELECT COUNT(*) FROM staging.Ajuste_SONA) +
    (SELECT COUNT(*) FROM staging.IPA) +
    (SELECT COUNT(*) FROM staging.CAPM) +
    (SELECT COUNT(*) FROM staging.Derivados) +
    (SELECT COUNT(*) FROM staging.PNL) +
    (SELECT COUNT(*) FROM staging.UAF) +
    (SELECT COUNT(*) FROM staging.PNL_IPA) +
    (SELECT COUNT(*) FROM staging.PNL_IPA_Ajustes) +
    (SELECT COUNT(*) FROM staging.PNL_ValoresAcumulados) +
    (SELECT COUNT(*) FROM staging.MLCCII) +
    (SELECT COUNT(*) FROM staging.MLCCII_Derivados) +
    (SELECT COUNT(*) FROM staging.TBL_IPA_MDLAT_MLATHY);

IF @TotalRegistros = 0
BEGIN
    PRINT '✓✓✓ VERIFICACIÓN EXITOSA ✓✓✓';
    PRINT 'Todas las tablas staging están vacías (0 registros totales)';
END
ELSE
BEGIN
    PRINT '❌ ERROR: Aún quedan ' + CAST(@TotalRegistros AS VARCHAR) + ' registros en tablas staging';
    PRINT 'Revisar manualmente qué tablas tienen datos';

    -- Mostrar detalle de tablas con datos
    PRINT '';
    PRINT 'Detalle de tablas con datos:';

    SELECT
        'IPA_WorkTable' AS Tabla, COUNT(*) AS Registros FROM staging.IPA_WorkTable HAVING COUNT(*) > 0
    UNION ALL SELECT 'CAPM_WorkTable', COUNT(*) FROM staging.CAPM_WorkTable HAVING COUNT(*) > 0
    UNION ALL SELECT 'Derivados_WorkTable', COUNT(*) FROM staging.Derivados_WorkTable HAVING COUNT(*) > 0
    UNION ALL SELECT 'PNL_WorkTable', COUNT(*) FROM staging.PNL_WorkTable HAVING COUNT(*) > 0
    UNION ALL SELECT 'UBS_WorkTable', COUNT(*) FROM staging.UBS_WorkTable HAVING COUNT(*) > 0
    UNION ALL SELECT 'UAF_WorkTable', COUNT(*) FROM staging.UAF_WorkTable HAVING COUNT(*) > 0
    UNION ALL SELECT 'IPA_Cash', COUNT(*) FROM staging.IPA_Cash HAVING COUNT(*) > 0
    UNION ALL SELECT 'IPA_Final', COUNT(*) FROM staging.IPA_Final HAVING COUNT(*) > 0
    UNION ALL SELECT 'IPA_MTM', COUNT(*) FROM staging.IPA_MTM HAVING COUNT(*) > 0
    UNION ALL SELECT 'Ajuste_CAPM', COUNT(*) FROM staging.Ajuste_CAPM HAVING COUNT(*) > 0
    UNION ALL SELECT 'Ajuste_Derivados', COUNT(*) FROM staging.Ajuste_Derivados HAVING COUNT(*) > 0
    UNION ALL SELECT 'Ajuste_Paridades', COUNT(*) FROM staging.Ajuste_Paridades HAVING COUNT(*) > 0
    UNION ALL SELECT 'Ajuste_PNL', COUNT(*) FROM staging.Ajuste_PNL HAVING COUNT(*) > 0
    UNION ALL SELECT 'Ajuste_SONA', COUNT(*) FROM staging.Ajuste_SONA HAVING COUNT(*) > 0
    UNION ALL SELECT 'IPA', COUNT(*) FROM staging.IPA HAVING COUNT(*) > 0
    UNION ALL SELECT 'CAPM', COUNT(*) FROM staging.CAPM HAVING COUNT(*) > 0
    UNION ALL SELECT 'Derivados', COUNT(*) FROM staging.Derivados HAVING COUNT(*) > 0
    UNION ALL SELECT 'PNL', COUNT(*) FROM staging.PNL HAVING COUNT(*) > 0
    UNION ALL SELECT 'UAF', COUNT(*) FROM staging.UAF HAVING COUNT(*) > 0
    UNION ALL SELECT 'PNL_IPA', COUNT(*) FROM staging.PNL_IPA HAVING COUNT(*) > 0
    UNION ALL SELECT 'PNL_IPA_Ajustes', COUNT(*) FROM staging.PNL_IPA_Ajustes HAVING COUNT(*) > 0
    UNION ALL SELECT 'PNL_ValoresAcumulados', COUNT(*) FROM staging.PNL_ValoresAcumulados HAVING COUNT(*) > 0
    UNION ALL SELECT 'MLCCII', COUNT(*) FROM staging.MLCCII HAVING COUNT(*) > 0
    UNION ALL SELECT 'MLCCII_Derivados', COUNT(*) FROM staging.MLCCII_Derivados HAVING COUNT(*) > 0
    UNION ALL SELECT 'TBL_IPA_MDLAT_MLATHY', COUNT(*) FROM staging.TBL_IPA_MDLAT_MLATHY HAVING COUNT(*) > 0;
END

PRINT '';

-- ============================================
-- PASO 4: ESTADÍSTICAS DE BACKUPS
-- ============================================
PRINT 'PASO 4: Resumen de backups creados...';
PRINT '';

-- Listar todas las tablas de backup creadas
SELECT
    name AS TablaBackup,
    create_date AS FechaCreacion
FROM sys.tables
WHERE name LIKE 'BACKUP_20251223_%'
  AND SCHEMA_NAME(schema_id) = 'staging'
ORDER BY name;

PRINT '';
PRINT '============================================';
PRINT 'LIMPIEZA COMPLETA FINALIZADA';
PRINT 'Fecha: ' + CONVERT(VARCHAR, GETDATE(), 120);
PRINT '============================================';
PRINT '';
PRINT 'SIGUIENTES PASOS:';
PRINT '1. Revisar que todas las tablas staging tengan 0 registros';
PRINT '2. Ejecutar script de CHECK constraints (ADD_Constraints_Staging_Tables.sql)';
PRINT '3. Agregar validación defensiva en SPs (IPA_01, CAPM_01)';
PRINT '4. Aumentar concurrencia a 3 en FundOrchestrator.js';
PRINT '';
PRINT 'BACKUPS:';
PRINT 'Los backups están disponibles en staging.BACKUP_20251223_* por si necesitas recuperar datos.';
PRINT 'Considera eliminarlos después de validar que todo funciona correctamente.';
PRINT '';

GO
