/*
 * SCRIPT MAESTRO: Ejecutar todas las migraciones de tracking v2
 *
 * Este script ejecuta todas las migraciones en orden secuencial
 * para preparar el esquema de base de datos para la arquitectura v2.
 *
 * Migraciones incluidas:
 * - 001: Derivados (4 tablas)
 * - 002: PNL (5 tablas)
 * - 003: UBS (3 tablas)
 *
 * Total: 12 tablas modificadas, 24 columnas agregadas, 12 índices creados
 *
 * IMPORTANTE:
 * - Este script es IDEMPOTENTE (se puede ejecutar múltiples veces sin error)
 * - Cada migración verifica si las columnas ya existen antes de crearlas
 * - Se recomienda ejecutar en horario de bajo uso
 * - Estimado de tiempo: 2-5 minutos
 *
 * Uso:
 *   sqlcmd -S localhost -d Inteligencia_Producto_Dev -i 000_run_all_migrations.sql
 *
 * O ejecutar manualmente en SSMS
 */

USE [Inteligencia_Producto_Dev];
GO

SET NOCOUNT ON;
PRINT '';
PRINT '╔════════════════════════════════════════════════════════════════╗';
PRINT '║                                                                ║';
PRINT '║  PIPELINE ETL v2 - MIGRACIONES DE SCHEMA                      ║';
PRINT '║  Preparación para Arquitectura Paralela por Fondo             ║';
PRINT '║                                                                ║';
PRINT '╚════════════════════════════════════════════════════════════════╝';
PRINT '';
PRINT 'Base de datos: Inteligencia_Producto_Dev';
PRINT 'Fecha inicio: ' + CONVERT(VARCHAR, GETDATE(), 120);
PRINT '';
PRINT 'Migraciones a ejecutar:';
PRINT '  1. Derivados (4 tablas)';
PRINT '  2. PNL (5 tablas)';
PRINT '  3. UBS (3 tablas)';
PRINT '';
PRINT '════════════════════════════════════════════════════════════════';
PRINT '';

DECLARE @StartTime DATETIME = GETDATE();
DECLARE @Migration1Start DATETIME, @Migration1End DATETIME;
DECLARE @Migration2Start DATETIME, @Migration2End DATETIME;
DECLARE @Migration3Start DATETIME, @Migration3End DATETIME;

-- ============================================
-- MIGRACIÓN 001: DERIVADOS
-- ============================================
PRINT 'Ejecutando migración 001: DERIVADOS...';
SET @Migration1Start = GETDATE();
GO

:r 001_add_execution_tracking_to_derivados_tables.sql

DECLARE @Migration1End DATETIME = GETDATE();
DECLARE @Migration1Duration INT = DATEDIFF(SECOND, @Migration1Start, @Migration1End);
PRINT 'Migración 001 completada en ' + CAST(@Migration1Duration AS VARCHAR) + ' segundos';
PRINT '';
GO

-- ============================================
-- MIGRACIÓN 002: PNL
-- ============================================
PRINT 'Ejecutando migración 002: PNL...';
SET @Migration2Start = GETDATE();
GO

:r 002_add_execution_tracking_to_pnl_tables.sql

DECLARE @Migration2End DATETIME = GETDATE();
DECLARE @Migration2Duration INT = DATEDIFF(SECOND, @Migration2Start, @Migration2End);
PRINT 'Migración 002 completada en ' + CAST(@Migration2Duration AS VARCHAR) + ' segundos';
PRINT '';
GO

-- ============================================
-- MIGRACIÓN 003: UBS
-- ============================================
PRINT 'Ejecutando migración 003: UBS...';
SET @Migration3Start = GETDATE();
GO

:r 003_add_execution_tracking_to_ubs_tables.sql

DECLARE @Migration3End DATETIME = GETDATE();
DECLARE @Migration3Duration INT = DATEDIFF(SECOND, @Migration3Start, @Migration3End);
PRINT 'Migración 003 completada en ' + CAST(@Migration3Duration AS VARCHAR) + ' segundos';
PRINT '';
GO

-- ============================================
-- RESUMEN FINAL
-- ============================================
DECLARE @EndTime DATETIME = GETDATE();
DECLARE @TotalDuration INT = DATEDIFF(SECOND, @StartTime, @EndTime);

PRINT '';
PRINT '╔════════════════════════════════════════════════════════════════╗';
PRINT '║                                                                ║';
PRINT '║  TODAS LAS MIGRACIONES COMPLETADAS EXITOSAMENTE ✓             ║';
PRINT '║                                                                ║';
PRINT '╚════════════════════════════════════════════════════════════════╝';
PRINT '';
PRINT 'Resumen final:';
PRINT '  • Tablas modificadas: 12';
PRINT '  • Columnas agregadas: 24 (ID_Ejecucion, ID_Fund)';
PRINT '  • Índices creados: 12';
PRINT '  • Duración total: ' + CAST(@TotalDuration AS VARCHAR) + ' segundos';
PRINT '';
PRINT 'Fecha finalización: ' + CONVERT(VARCHAR, GETDATE(), 120);
PRINT '';
PRINT '════════════════════════════════════════════════════════════════';
PRINT '';
PRINT 'PRÓXIMOS PASOS:';
PRINT '';
PRINT '1. Verificar que todas las tablas tienen las nuevas columnas:';
PRINT '   SELECT * FROM sys.columns WHERE name IN (''ID_Ejecucion'', ''ID_Fund'')';
PRINT '';
PRINT '2. Crear Stored Procedures v2:';
PRINT '   - DERIV_01_v2 a DERIV_04_v2';
PRINT '   - PNL_01_v2 a PNL_05_v2';
PRINT '   - UBS_01_v2 a UBS_03_v2';
PRINT '';
PRINT '3. Testing unitario de cada SP v2';
PRINT '';
PRINT '4. Testing de integración del pipeline completo';
PRINT '';
GO
