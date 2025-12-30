-- =============================================
-- Migration: 101_SWAP_LOGS_TABLES.sql
-- Fecha: 2025-12-30
-- Descripcion: Renombrar tablas antiguas a _OLD y activar nuevas tablas _v2
--
-- PRERREQUISITO: Ejecutar 100_CREATE_NEW_LOGS_SCHEMA.sql primero
--
-- ROLLBACK: Ejecutar 101_ROLLBACK_LOGS_TABLES.sql si algo falla
-- =============================================

USE [Moneda_Homologacion]
GO

PRINT '=========================================='
PRINT 'Iniciando migracion 101: Swap de tablas logs'
PRINT '=========================================='

-- =============================================
-- PASO 1: Renombrar tablas antiguas a _OLD
-- =============================================

PRINT 'Paso 1: Renombrando tablas antiguas...'

-- Procesos
IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'logs.Procesos') AND type in (N'U'))
AND NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'logs.Procesos_OLD') AND type in (N'U'))
BEGIN
    EXEC sp_rename 'logs.Procesos', 'Procesos_OLD';
    PRINT '  OK - logs.Procesos -> logs.Procesos_OLD'
END
ELSE
BEGIN
    PRINT '  SKIP - logs.Procesos (no existe o ya renombrada)'
END

-- Ejecuciones
IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'logs.Ejecuciones') AND type in (N'U'))
AND NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'logs.Ejecuciones_OLD') AND type in (N'U'))
BEGIN
    EXEC sp_rename 'logs.Ejecuciones', 'Ejecuciones_OLD';
    PRINT '  OK - logs.Ejecuciones -> logs.Ejecuciones_OLD'
END
ELSE
BEGIN
    PRINT '  SKIP - logs.Ejecuciones (no existe o ya renombrada)'
END

-- Ejecucion_Fondos
IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'logs.Ejecucion_Fondos') AND type in (N'U'))
AND NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'logs.Ejecucion_Fondos_OLD') AND type in (N'U'))
BEGIN
    EXEC sp_rename 'logs.Ejecucion_Fondos', 'Ejecucion_Fondos_OLD';
    PRINT '  OK - logs.Ejecucion_Fondos -> logs.Ejecucion_Fondos_OLD'
END
ELSE
BEGIN
    PRINT '  SKIP - logs.Ejecucion_Fondos (no existe o ya renombrada)'
END

-- Ejecucion_Logs
IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'logs.Ejecucion_Logs') AND type in (N'U'))
AND NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'logs.Ejecucion_Logs_OLD') AND type in (N'U'))
BEGIN
    EXEC sp_rename 'logs.Ejecucion_Logs', 'Ejecucion_Logs_OLD';
    PRINT '  OK - logs.Ejecucion_Logs -> logs.Ejecucion_Logs_OLD'
END
ELSE
BEGIN
    PRINT '  SKIP - logs.Ejecucion_Logs (no existe o ya renombrada)'
END

-- Trace_Records
IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'logs.Trace_Records') AND type in (N'U'))
AND NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'logs.Trace_Records_OLD') AND type in (N'U'))
BEGIN
    EXEC sp_rename 'logs.Trace_Records', 'Trace_Records_OLD';
    PRINT '  OK - logs.Trace_Records -> logs.Trace_Records_OLD'
END
ELSE
BEGIN
    PRINT '  SKIP - logs.Trace_Records (no existe o ya renombrada)'
END

-- FondosEnStandBy
IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'logs.FondosEnStandBy') AND type in (N'U'))
AND NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'logs.FondosEnStandBy_OLD') AND type in (N'U'))
BEGIN
    EXEC sp_rename 'logs.FondosEnStandBy', 'FondosEnStandBy_OLD';
    PRINT '  OK - logs.FondosEnStandBy -> logs.FondosEnStandBy_OLD'
END
ELSE
BEGIN
    PRINT '  SKIP - logs.FondosEnStandBy (no existe o ya renombrada)'
END
GO

-- =============================================
-- PASO 2: Renombrar tablas nuevas _v2 a produccion
-- =============================================

PRINT ''
PRINT 'Paso 2: Activando nuevas tablas...'

-- Procesos_v2 -> Procesos
IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'logs.Procesos_v2') AND type in (N'U'))
AND NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'logs.Procesos') AND type in (N'U'))
BEGIN
    EXEC sp_rename 'logs.Procesos_v2', 'Procesos';
    PRINT '  OK - logs.Procesos_v2 -> logs.Procesos'
END
ELSE
BEGIN
    PRINT '  SKIP - logs.Procesos_v2 (no existe o destino ya existe)'
END

-- Ejecuciones_v2 -> Ejecuciones
IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'logs.Ejecuciones_v2') AND type in (N'U'))
AND NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'logs.Ejecuciones') AND type in (N'U'))
BEGIN
    EXEC sp_rename 'logs.Ejecuciones_v2', 'Ejecuciones';
    PRINT '  OK - logs.Ejecuciones_v2 -> logs.Ejecuciones'
END
ELSE
BEGIN
    PRINT '  SKIP - logs.Ejecuciones_v2 (no existe o destino ya existe)'
END

-- StandBy_v2 -> StandBy
IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'logs.StandBy_v2') AND type in (N'U'))
AND NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'logs.StandBy') AND type in (N'U'))
BEGIN
    EXEC sp_rename 'logs.StandBy_v2', 'StandBy';
    PRINT '  OK - logs.StandBy_v2 -> logs.StandBy'
END
ELSE
BEGIN
    PRINT '  SKIP - logs.StandBy_v2 (no existe o destino ya existe)'
END
GO

-- =============================================
-- PASO 3: Eliminar vistas obsoletas de trace
-- =============================================

PRINT ''
PRINT 'Paso 3: Eliminando vistas obsoletas...'

IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'logs.v_Trace_Fund_Timeline') AND type = 'V')
BEGIN
    DROP VIEW logs.v_Trace_Fund_Timeline;
    PRINT '  OK - Eliminada logs.v_Trace_Fund_Timeline'
END

IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'logs.v_Trace_Proceso_Summary') AND type = 'V')
BEGIN
    DROP VIEW logs.v_Trace_Proceso_Summary;
    PRINT '  OK - Eliminada logs.v_Trace_Proceso_Summary'
END

IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'logs.v_Trace_Resource_Bottlenecks') AND type = 'V')
BEGIN
    DROP VIEW logs.v_Trace_Resource_Bottlenecks;
    PRINT '  OK - Eliminada logs.v_Trace_Resource_Bottlenecks'
END

IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'logs.v_Trace_Resource_Contention') AND type = 'V')
BEGIN
    DROP VIEW logs.v_Trace_Resource_Contention;
    PRINT '  OK - Eliminada logs.v_Trace_Resource_Contention'
END

IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'logs.v_Trace_Slowest_Services') AND type = 'V')
BEGIN
    DROP VIEW logs.v_Trace_Slowest_Services;
    PRINT '  OK - Eliminada logs.v_Trace_Slowest_Services'
END

IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'logs.v_Trace_Parallel_Efficiency') AND type = 'V')
BEGIN
    DROP VIEW logs.v_Trace_Parallel_Efficiency;
    PRINT '  OK - Eliminada logs.v_Trace_Parallel_Efficiency'
END
GO

-- =============================================
-- PASO 4: Renombrar stored procedures _v2 a produccion
-- =============================================

PRINT ''
PRINT 'Paso 4: Renombrando stored procedures...'

-- sp_Inicializar_Proceso
IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'logs.sp_Inicializar_Proceso_v2') AND type = 'P')
BEGIN
    -- Eliminar el viejo si existe
    IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'logs.sp_Inicializar_Proceso') AND type = 'P')
    BEGIN
        EXEC sp_rename 'logs.sp_Inicializar_Proceso', 'sp_Inicializar_Proceso_OLD';
    END
    EXEC sp_rename 'logs.sp_Inicializar_Proceso_v2', 'sp_Inicializar_Proceso';
    PRINT '  OK - logs.sp_Inicializar_Proceso_v2 -> logs.sp_Inicializar_Proceso'
END

-- sp_Inicializar_Ejecucion
IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'logs.sp_Inicializar_Ejecucion_v2') AND type = 'P')
BEGIN
    IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'logs.sp_Inicializar_Ejecucion') AND type = 'P')
    BEGIN
        EXEC sp_rename 'logs.sp_Inicializar_Ejecucion', 'sp_Inicializar_Ejecucion_OLD';
    END
    EXEC sp_rename 'logs.sp_Inicializar_Ejecucion_v2', 'sp_Inicializar_Ejecucion';
    PRINT '  OK - logs.sp_Inicializar_Ejecucion_v2 -> logs.sp_Inicializar_Ejecucion'
END

-- sp_Actualizar_Estado
IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'logs.sp_Actualizar_Estado_v2') AND type = 'P')
BEGIN
    IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'logs.sp_Actualizar_Estado') AND type = 'P')
    BEGIN
        EXEC sp_rename 'logs.sp_Actualizar_Estado', 'sp_Actualizar_Estado_OLD';
    END
    EXEC sp_rename 'logs.sp_Actualizar_Estado_v2', 'sp_Actualizar_Estado';
    PRINT '  OK - logs.sp_Actualizar_Estado_v2 -> logs.sp_Actualizar_Estado'
END

-- sp_Finalizar_Ejecucion
IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'logs.sp_Finalizar_Ejecucion_v2') AND type = 'P')
BEGIN
    IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'logs.sp_Finalizar_Ejecucion') AND type = 'P')
    BEGIN
        EXEC sp_rename 'logs.sp_Finalizar_Ejecucion', 'sp_Finalizar_Ejecucion_OLD';
    END
    EXEC sp_rename 'logs.sp_Finalizar_Ejecucion_v2', 'sp_Finalizar_Ejecucion';
    PRINT '  OK - logs.sp_Finalizar_Ejecucion_v2 -> logs.sp_Finalizar_Ejecucion'
END

-- sp_Finalizar_Proceso
IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'logs.sp_Finalizar_Proceso_v2') AND type = 'P')
BEGIN
    IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'logs.sp_Finalizar_Proceso') AND type = 'P')
    BEGIN
        EXEC sp_rename 'logs.sp_Finalizar_Proceso', 'sp_Finalizar_Proceso_OLD';
    END
    EXEC sp_rename 'logs.sp_Finalizar_Proceso_v2', 'sp_Finalizar_Proceso';
    PRINT '  OK - logs.sp_Finalizar_Proceso_v2 -> logs.sp_Finalizar_Proceso'
END
GO

-- =============================================
-- RESUMEN
-- =============================================

PRINT ''
PRINT '=========================================='
PRINT 'Migracion 101 completada exitosamente'
PRINT '=========================================='
PRINT ''
PRINT 'Tablas activas:'
PRINT '  - logs.Procesos (nueva)'
PRINT '  - logs.Ejecuciones (nueva)'
PRINT '  - logs.EventosDetallados (nueva)'
PRINT '  - logs.StandBy (nueva)'
PRINT ''
PRINT 'Tablas archivadas (_OLD):'
PRINT '  - logs.Procesos_OLD'
PRINT '  - logs.Ejecuciones_OLD'
PRINT '  - logs.Ejecucion_Fondos_OLD'
PRINT '  - logs.Ejecucion_Logs_OLD'
PRINT '  - logs.Trace_Records_OLD'
PRINT '  - logs.FondosEnStandBy_OLD'
PRINT ''
PRINT 'NOTA: Las tablas _OLD se pueden eliminar despues de verificar que todo funciona correctamente.'
PRINT '=========================================='
GO
