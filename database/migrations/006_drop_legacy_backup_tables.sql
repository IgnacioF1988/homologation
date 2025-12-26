/*
 * MIGRACIÓN 006: Eliminar tablas legacy de backup obsoletas
 *
 * Objetivo: Limpiar tablas de backup heredadas que ya no se utilizan
 * Fecha: 2025-12-26
 * Versión: 1.0
 *
 * Tablas eliminadas (14 total):
 *
 * EXTRACT SCHEMA (8 tablas):
 * - extract.Cuentas_1
 * - extract.Fondos_1
 * - extract.InstrumentoPosicion_1
 * - extract.IPA_Final_1
 * - extract.MonedaCross_1
 * - extract.PNL_1
 * - extract.PortfolioInversionIndividual_1
 * - extract.Rendimiento_1
 *
 * PROCESS SCHEMA (3 tablas):
 * - process.tabla_bkp1
 * - process.tabla_bkp2
 * - process.tabla_bkp3
 *
 * LOGS SCHEMA (3 tablas):
 * - logs.tabla_log_bkp1
 * - logs.tabla_log_bkp2
 * - logs.tabla_log_bkp3
 *
 * JUSTIFICACIÓN:
 * Estas tablas son copias de backup creadas manualmente que ya no se utilizan.
 * La nueva arquitectura v2 con ID_Ejecucion elimina la necesidad de estas copias.
 */

USE [Inteligencia_Producto_Dev];
GO

SET NOCOUNT ON;
PRINT '========================================';
PRINT 'MIGRACIÓN 006: Eliminar Tablas Legacy de Backup';
PRINT 'Fecha: ' + CONVERT(VARCHAR, GETDATE(), 120);
PRINT '========================================';
PRINT '';

DECLARE @TablesDropped INT = 0;
DECLARE @TablesNotFound INT = 0;

-- ============================================
-- 1. EXTRACT SCHEMA: Eliminar tablas *_1
-- ============================================
PRINT '1. Limpiando schema EXTRACT...';
PRINT '';

-- extract.Cuentas_1
IF OBJECT_ID('extract.Cuentas_1', 'U') IS NOT NULL
BEGIN
    DROP TABLE extract.Cuentas_1;
    SET @TablesDropped = @TablesDropped + 1;
    PRINT '   ✓ extract.Cuentas_1 eliminada';
END
ELSE
BEGIN
    SET @TablesNotFound = @TablesNotFound + 1;
    PRINT '   ⚠ extract.Cuentas_1 no existe (skip)';
END

-- extract.Fondos_1
IF OBJECT_ID('extract.Fondos_1', 'U') IS NOT NULL
BEGIN
    DROP TABLE extract.Fondos_1;
    SET @TablesDropped = @TablesDropped + 1;
    PRINT '   ✓ extract.Fondos_1 eliminada';
END
ELSE
BEGIN
    SET @TablesNotFound = @TablesNotFound + 1;
    PRINT '   ⚠ extract.Fondos_1 no existe (skip)';
END

-- extract.InstrumentoPosicion_1
IF OBJECT_ID('extract.InstrumentoPosicion_1', 'U') IS NOT NULL
BEGIN
    DROP TABLE extract.InstrumentoPosicion_1;
    SET @TablesDropped = @TablesDropped + 1;
    PRINT '   ✓ extract.InstrumentoPosicion_1 eliminada';
END
ELSE
BEGIN
    SET @TablesNotFound = @TablesNotFound + 1;
    PRINT '   ⚠ extract.InstrumentoPosicion_1 no existe (skip)';
END

-- extract.IPA_Final_1
IF OBJECT_ID('extract.IPA_Final_1', 'U') IS NOT NULL
BEGIN
    DROP TABLE extract.IPA_Final_1;
    SET @TablesDropped = @TablesDropped + 1;
    PRINT '   ✓ extract.IPA_Final_1 eliminada';
END
ELSE
BEGIN
    SET @TablesNotFound = @TablesNotFound + 1;
    PRINT '   ⚠ extract.IPA_Final_1 no existe (skip)';
END

-- extract.MonedaCross_1
IF OBJECT_ID('extract.MonedaCross_1', 'U') IS NOT NULL
BEGIN
    DROP TABLE extract.MonedaCross_1;
    SET @TablesDropped = @TablesDropped + 1;
    PRINT '   ✓ extract.MonedaCross_1 eliminada';
END
ELSE
BEGIN
    SET @TablesNotFound = @TablesNotFound + 1;
    PRINT '   ⚠ extract.MonedaCross_1 no existe (skip)';
END

-- extract.PNL_1
IF OBJECT_ID('extract.PNL_1', 'U') IS NOT NULL
BEGIN
    DROP TABLE extract.PNL_1;
    SET @TablesDropped = @TablesDropped + 1;
    PRINT '   ✓ extract.PNL_1 eliminada';
END
ELSE
BEGIN
    SET @TablesNotFound = @TablesNotFound + 1;
    PRINT '   ⚠ extract.PNL_1 no existe (skip)';
END

-- extract.PortfolioInversionIndividual_1
IF OBJECT_ID('extract.PortfolioInversionIndividual_1', 'U') IS NOT NULL
BEGIN
    DROP TABLE extract.PortfolioInversionIndividual_1;
    SET @TablesDropped = @TablesDropped + 1;
    PRINT '   ✓ extract.PortfolioInversionIndividual_1 eliminada';
END
ELSE
BEGIN
    SET @TablesNotFound = @TablesNotFound + 1;
    PRINT '   ⚠ extract.PortfolioInversionIndividual_1 no existe (skip)';
END

-- extract.Rendimiento_1
IF OBJECT_ID('extract.Rendimiento_1', 'U') IS NOT NULL
BEGIN
    DROP TABLE extract.Rendimiento_1;
    SET @TablesDropped = @TablesDropped + 1;
    PRINT '   ✓ extract.Rendimiento_1 eliminada';
END
ELSE
BEGIN
    SET @TablesNotFound = @TablesNotFound + 1;
    PRINT '   ⚠ extract.Rendimiento_1 no existe (skip)';
END

PRINT '';

-- ============================================
-- 2. PROCESS SCHEMA: Eliminar tablas backup
-- ============================================
PRINT '2. Limpiando schema PROCESS...';
PRINT '';

-- process.tabla_bkp1
IF OBJECT_ID('process.tabla_bkp1', 'U') IS NOT NULL
BEGIN
    DROP TABLE process.tabla_bkp1;
    SET @TablesDropped = @TablesDropped + 1;
    PRINT '   ✓ process.tabla_bkp1 eliminada';
END
ELSE
BEGIN
    SET @TablesNotFound = @TablesNotFound + 1;
    PRINT '   ⚠ process.tabla_bkp1 no existe (skip)';
END

-- process.tabla_bkp2
IF OBJECT_ID('process.tabla_bkp2', 'U') IS NOT NULL
BEGIN
    DROP TABLE process.tabla_bkp2;
    SET @TablesDropped = @TablesDropped + 1;
    PRINT '   ✓ process.tabla_bkp2 eliminada';
END
ELSE
BEGIN
    SET @TablesNotFound = @TablesNotFound + 1;
    PRINT '   ⚠ process.tabla_bkp2 no existe (skip)';
END

-- process.tabla_bkp3
IF OBJECT_ID('process.tabla_bkp3', 'U') IS NOT NULL
BEGIN
    DROP TABLE process.tabla_bkp3;
    SET @TablesDropped = @TablesDropped + 1;
    PRINT '   ✓ process.tabla_bkp3 eliminada';
END
ELSE
BEGIN
    SET @TablesNotFound = @TablesNotFound + 1;
    PRINT '   ⚠ process.tabla_bkp3 no existe (skip)';
END

PRINT '';

-- ============================================
-- 3. LOGS SCHEMA: Eliminar tablas backup
-- ============================================
PRINT '3. Limpiando schema LOGS...';
PRINT '';

-- logs.tabla_log_bkp1
IF OBJECT_ID('logs.tabla_log_bkp1', 'U') IS NOT NULL
BEGIN
    DROP TABLE logs.tabla_log_bkp1;
    SET @TablesDropped = @TablesDropped + 1;
    PRINT '   ✓ logs.tabla_log_bkp1 eliminada';
END
ELSE
BEGIN
    SET @TablesNotFound = @TablesNotFound + 1;
    PRINT '   ⚠ logs.tabla_log_bkp1 no existe (skip)';
END

-- logs.tabla_log_bkp2
IF OBJECT_ID('logs.tabla_log_bkp2', 'U') IS NOT NULL
BEGIN
    DROP TABLE logs.tabla_log_bkp2;
    SET @TablesDropped = @TablesDropped + 1;
    PRINT '   ✓ logs.tabla_log_bkp2 eliminada';
END
ELSE
BEGIN
    SET @TablesNotFound = @TablesNotFound + 1;
    PRINT '   ⚠ logs.tabla_log_bkp2 no existe (skip)';
END

-- logs.tabla_log_bkp3
IF OBJECT_ID('logs.tabla_log_bkp3', 'U') IS NOT NULL
BEGIN
    DROP TABLE logs.tabla_log_bkp3;
    SET @TablesDropped = @TablesDropped + 1;
    PRINT '   ✓ logs.tabla_log_bkp3 eliminada';
END
ELSE
BEGIN
    SET @TablesNotFound = @TablesNotFound + 1;
    PRINT '   ⚠ logs.tabla_log_bkp3 no existe (skip)';
END

PRINT '';
PRINT '========================================';
PRINT 'MIGRACIÓN 006 COMPLETADA ✓';
PRINT '========================================';
PRINT '';
PRINT 'Resumen:';
PRINT '- Tablas eliminadas: ' + CAST(@TablesDropped AS VARCHAR);
PRINT '- Tablas no encontradas: ' + CAST(@TablesNotFound AS VARCHAR);
PRINT '- Total procesadas: 14';
PRINT '';
PRINT 'Espacio liberado: Se recomienda ejecutar DBCC SHRINKDATABASE';
PRINT '';
PRINT 'Próxima fase: Eliminar componente frontend PipelineExecution.OLD.jsx';
PRINT '';

GO
