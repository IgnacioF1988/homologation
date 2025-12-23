/*
 * SCRIPT DE ROLLBACK: Revertir migraciones de tracking v2
 *
 * Este script ELIMINA las columnas e índices agregados por las migraciones.
 *
 * ⚠️  ADVERTENCIA: USE ESTE SCRIPT CON PRECAUCIÓN
 *
 * - Elimina columnas ID_Ejecucion e ID_Fund de 12 tablas
 * - Elimina 12 índices asociados
 * - Los datos en estas columnas se PERDERÁN
 * - Solo use si necesita revertir completamente a arquitectura v1
 *
 * ANTES DE EJECUTAR:
 * 1. Hacer backup de la base de datos
 * 2. Verificar que no hay ejecuciones v2 en progreso
 * 3. Coordinar con el equipo
 *
 * Uso:
 *   sqlcmd -S localhost -d Inteligencia_Producto_Dev -i 999_rollback_all_migrations.sql
 */

USE [Inteligencia_Producto_Dev];
GO

SET NOCOUNT ON;
PRINT '';
PRINT '╔════════════════════════════════════════════════════════════════╗';
PRINT '║                                                                ║';
PRINT '║  ⚠️  ROLLBACK DE MIGRACIONES v2  ⚠️                           ║';
PRINT '║                                                                ║';
PRINT '╚════════════════════════════════════════════════════════════════╝';
PRINT '';
PRINT '⚠️  ADVERTENCIA: Este script eliminará columnas e índices';
PRINT '';
PRINT 'Presione Ctrl+C para CANCELAR';
PRINT 'Esperando 10 segundos...';
WAITFOR DELAY '00:00:10';
PRINT '';
PRINT 'Continuando con rollback...';
PRINT '';

DECLARE @StartTime DATETIME = GETDATE();

-- ============================================
-- ROLLBACK: DERIVADOS (4 tablas)
-- ============================================
PRINT 'ROLLBACK: Derivados (4 tablas)...';
PRINT '';

-- 1. staging.Derivados_WorkTable
PRINT '  1. staging.Derivados_WorkTable';
IF EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('staging.Derivados_WorkTable') AND name = 'IX_Derivados_WorkTable_Ejecucion_Fund')
BEGIN
    DROP INDEX IX_Derivados_WorkTable_Ejecucion_Fund ON staging.Derivados_WorkTable;
    PRINT '     ✓ Índice eliminado';
END
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('staging.Derivados_WorkTable') AND name = 'ID_Ejecucion')
BEGIN
    ALTER TABLE staging.Derivados_WorkTable DROP COLUMN ID_Ejecucion;
    PRINT '     ✓ Columna ID_Ejecucion eliminada';
END
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('staging.Derivados_WorkTable') AND name = 'ID_Fund')
BEGIN
    ALTER TABLE staging.Derivados_WorkTable DROP COLUMN ID_Fund;
    PRINT '     ✓ Columna ID_Fund eliminada';
END

-- 2. staging.Derivados
PRINT '  2. staging.Derivados';
IF EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('staging.Derivados') AND name = 'IX_Derivados_Ejecucion_Fund')
BEGIN
    DROP INDEX IX_Derivados_Ejecucion_Fund ON staging.Derivados;
    PRINT '     ✓ Índice eliminado';
END
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('staging.Derivados') AND name = 'ID_Ejecucion')
BEGIN
    ALTER TABLE staging.Derivados DROP COLUMN ID_Ejecucion;
    PRINT '     ✓ Columna ID_Ejecucion eliminada';
END
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('staging.Derivados') AND name = 'ID_Fund')
BEGIN
    ALTER TABLE staging.Derivados DROP COLUMN ID_Fund;
    PRINT '     ✓ Columna ID_Fund eliminada';
END

-- 3. staging.Ajuste_Derivados
PRINT '  3. staging.Ajuste_Derivados';
IF EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('staging.Ajuste_Derivados') AND name = 'IX_Ajuste_Derivados_Ejecucion_Fund')
BEGIN
    DROP INDEX IX_Ajuste_Derivados_Ejecucion_Fund ON staging.Ajuste_Derivados;
    PRINT '     ✓ Índice eliminado';
END
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('staging.Ajuste_Derivados') AND name = 'ID_Ejecucion')
BEGIN
    ALTER TABLE staging.Ajuste_Derivados DROP COLUMN ID_Ejecucion;
    PRINT '     ✓ Columna ID_Ejecucion eliminada';
END
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('staging.Ajuste_Derivados') AND name = 'ID_Fund')
BEGIN
    ALTER TABLE staging.Ajuste_Derivados DROP COLUMN ID_Fund;
    PRINT '     ✓ Columna ID_Fund eliminada';
END

-- 4. staging.Ajuste_Paridades
PRINT '  4. staging.Ajuste_Paridades';
IF EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('staging.Ajuste_Paridades') AND name = 'IX_Ajuste_Paridades_Ejecucion_Fund')
BEGIN
    DROP INDEX IX_Ajuste_Paridades_Ejecucion_Fund ON staging.Ajuste_Paridades;
    PRINT '     ✓ Índice eliminado';
END
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('staging.Ajuste_Paridades') AND name = 'ID_Ejecucion')
BEGIN
    ALTER TABLE staging.Ajuste_Paridades DROP COLUMN ID_Ejecucion;
    PRINT '     ✓ Columna ID_Ejecucion eliminada';
END
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('staging.Ajuste_Paridades') AND name = 'ID_Fund')
BEGIN
    ALTER TABLE staging.Ajuste_Paridades DROP COLUMN ID_Fund;
    PRINT '     ✓ Columna ID_Fund eliminada';
END

PRINT '';

-- ============================================
-- ROLLBACK: PNL (5 tablas)
-- ============================================
PRINT 'ROLLBACK: PNL (5 tablas)...';
PRINT '';

-- 1. staging.PNL_WorkTable
PRINT '  1. staging.PNL_WorkTable';
IF EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('staging.PNL_WorkTable') AND name = 'IX_PNL_WorkTable_Ejecucion_Fund')
BEGIN
    DROP INDEX IX_PNL_WorkTable_Ejecucion_Fund ON staging.PNL_WorkTable;
    PRINT '     ✓ Índice eliminado';
END
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('staging.PNL_WorkTable') AND name = 'ID_Ejecucion')
BEGIN
    ALTER TABLE staging.PNL_WorkTable DROP COLUMN ID_Ejecucion;
    PRINT '     ✓ Columna ID_Ejecucion eliminada';
END
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('staging.PNL_WorkTable') AND name = 'ID_Fund')
BEGIN
    ALTER TABLE staging.PNL_WorkTable DROP COLUMN ID_Fund;
    PRINT '     ✓ Columna ID_Fund eliminada';
END

-- 2. staging.PNL
PRINT '  2. staging.PNL';
IF EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('staging.PNL') AND name = 'IX_PNL_Ejecucion_Fund')
BEGIN
    DROP INDEX IX_PNL_Ejecucion_Fund ON staging.PNL;
    PRINT '     ✓ Índice eliminado';
END
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('staging.PNL') AND name = 'ID_Ejecucion')
BEGIN
    ALTER TABLE staging.PNL DROP COLUMN ID_Ejecucion;
    PRINT '     ✓ Columna ID_Ejecucion eliminada';
END
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('staging.PNL') AND name = 'ID_Fund')
BEGIN
    ALTER TABLE staging.PNL DROP COLUMN ID_Fund;
    PRINT '     ✓ Columna ID_Fund eliminada';
END

-- 3. staging.Ajuste_PNL
PRINT '  3. staging.Ajuste_PNL';
IF EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('staging.Ajuste_PNL') AND name = 'IX_Ajuste_PNL_Ejecucion_Fund')
BEGIN
    DROP INDEX IX_Ajuste_PNL_Ejecucion_Fund ON staging.Ajuste_PNL;
    PRINT '     ✓ Índice eliminado';
END
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('staging.Ajuste_PNL') AND name = 'ID_Ejecucion')
BEGIN
    ALTER TABLE staging.Ajuste_PNL DROP COLUMN ID_Ejecucion;
    PRINT '     ✓ Columna ID_Ejecucion eliminada';
END
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('staging.Ajuste_PNL') AND name = 'ID_Fund')
BEGIN
    ALTER TABLE staging.Ajuste_PNL DROP COLUMN ID_Fund;
    PRINT '     ✓ Columna ID_Fund eliminada';
END

-- 4. staging.PNL_IPA
PRINT '  4. staging.PNL_IPA';
IF EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('staging.PNL_IPA') AND name = 'IX_PNL_IPA_Ejecucion_Fund')
BEGIN
    DROP INDEX IX_PNL_IPA_Ejecucion_Fund ON staging.PNL_IPA;
    PRINT '     ✓ Índice eliminado';
END
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('staging.PNL_IPA') AND name = 'ID_Ejecucion')
BEGIN
    ALTER TABLE staging.PNL_IPA DROP COLUMN ID_Ejecucion;
    PRINT '     ✓ Columna ID_Ejecucion eliminada';
END
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('staging.PNL_IPA') AND name = 'ID_Fund')
BEGIN
    ALTER TABLE staging.PNL_IPA DROP COLUMN ID_Fund;
    PRINT '     ✓ Columna ID_Fund eliminada';
END

-- 5. staging.PNL_ValoresAcumulados
PRINT '  5. staging.PNL_ValoresAcumulados';
IF EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('staging.PNL_ValoresAcumulados') AND name = 'IX_PNL_ValoresAcumulados_Ejecucion_Fund')
BEGIN
    DROP INDEX IX_PNL_ValoresAcumulados_Ejecucion_Fund ON staging.PNL_ValoresAcumulados;
    PRINT '     ✓ Índice eliminado';
END
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('staging.PNL_ValoresAcumulados') AND name = 'ID_Ejecucion')
BEGIN
    ALTER TABLE staging.PNL_ValoresAcumulados DROP COLUMN ID_Ejecucion;
    PRINT '     ✓ Columna ID_Ejecucion eliminada';
END
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('staging.PNL_ValoresAcumulados') AND name = 'ID_Fund')
BEGIN
    ALTER TABLE staging.PNL_ValoresAcumulados DROP COLUMN ID_Fund;
    PRINT '     ✓ Columna ID_Fund eliminada';
END

PRINT '';

-- ============================================
-- ROLLBACK: UBS (3 tablas)
-- ============================================
PRINT 'ROLLBACK: UBS (3 tablas)...';
PRINT '';

-- 1. staging.UBS_WorkTable
PRINT '  1. staging.UBS_WorkTable';
IF EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('staging.UBS_WorkTable') AND name = 'IX_UBS_WorkTable_Ejecucion_Fund')
BEGIN
    DROP INDEX IX_UBS_WorkTable_Ejecucion_Fund ON staging.UBS_WorkTable;
    PRINT '     ✓ Índice eliminado';
END
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('staging.UBS_WorkTable') AND name = 'ID_Ejecucion')
BEGIN
    ALTER TABLE staging.UBS_WorkTable DROP COLUMN ID_Ejecucion;
    PRINT '     ✓ Columna ID_Ejecucion eliminada';
END
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('staging.UBS_WorkTable') AND name = 'ID_Fund')
BEGIN
    ALTER TABLE staging.UBS_WorkTable DROP COLUMN ID_Fund;
    PRINT '     ✓ Columna ID_Fund eliminada';
END

-- 2. staging.MLCCII_Derivados
PRINT '  2. staging.MLCCII_Derivados';
IF EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('staging.MLCCII_Derivados') AND name = 'IX_MLCCII_Derivados_Ejecucion_Fund')
BEGIN
    DROP INDEX IX_MLCCII_Derivados_Ejecucion_Fund ON staging.MLCCII_Derivados;
    PRINT '     ✓ Índice eliminado';
END
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('staging.MLCCII_Derivados') AND name = 'ID_Ejecucion')
BEGIN
    ALTER TABLE staging.MLCCII_Derivados DROP COLUMN ID_Ejecucion;
    PRINT '     ✓ Columna ID_Ejecucion eliminada';
END
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('staging.MLCCII_Derivados') AND name = 'ID_Fund')
BEGIN
    ALTER TABLE staging.MLCCII_Derivados DROP COLUMN ID_Fund;
    PRINT '     ✓ Columna ID_Fund eliminada';
END

-- 3. staging.MLCCII
PRINT '  3. staging.MLCCII';
IF EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('staging.MLCCII') AND name = 'IX_MLCCII_Ejecucion_Fund')
BEGIN
    DROP INDEX IX_MLCCII_Ejecucion_Fund ON staging.MLCCII;
    PRINT '     ✓ Índice eliminado';
END
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('staging.MLCCII') AND name = 'ID_Ejecucion')
BEGIN
    ALTER TABLE staging.MLCCII DROP COLUMN ID_Ejecucion;
    PRINT '     ✓ Columna ID_Ejecucion eliminada';
END
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('staging.MLCCII') AND name = 'ID_Fund')
BEGIN
    ALTER TABLE staging.MLCCII DROP COLUMN ID_Fund;
    PRINT '     ✓ Columna ID_Fund eliminada';
END

PRINT '';

-- ============================================
-- RESUMEN FINAL
-- ============================================
DECLARE @EndTime DATETIME = GETDATE();
DECLARE @TotalDuration INT = DATEDIFF(SECOND, @StartTime, @EndTime);

PRINT '';
PRINT '╔════════════════════════════════════════════════════════════════╗';
PRINT '║                                                                ║';
PRINT '║  ROLLBACK COMPLETADO ✓                                        ║';
PRINT '║                                                                ║';
PRINT '╚════════════════════════════════════════════════════════════════╝';
PRINT '';
PRINT 'Resumen:';
PRINT '  • Tablas modificadas: 12';
PRINT '  • Columnas eliminadas: 24';
PRINT '  • Índices eliminados: 12';
PRINT '  • Duración total: ' + CAST(@TotalDuration AS VARCHAR) + ' segundos';
PRINT '';
PRINT 'La base de datos ha sido revertida a arquitectura v1.';
PRINT '';

GO
