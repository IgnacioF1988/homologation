-- ============================================
-- Configuración de SQL Server para Alta Concurrencia
-- ============================================
-- Este script configura SQL Server para soportar 200+ conexiones simultáneas
-- con procesamiento paralelo masivo del pipeline ETL.
--
-- IMPORTANTE: Ejecutar este script como sysadmin en SQL Server
-- ============================================

USE master;
GO

-- ============================================
-- 1. VERIFICAR CONFIGURACIÓN ACTUAL
-- ============================================
PRINT '=== Configuración Actual de SQL Server ===';

-- Ver máximo de conexiones de usuario
SELECT
    name AS 'Configuración',
    value AS 'Valor Actual',
    value_in_use AS 'Valor en Uso',
    description
FROM sys.configurations
WHERE name IN (
    'user connections',
    'max worker threads',
    'max degree of parallelism',
    'cost threshold for parallelism'
);
GO

-- Ver conexiones actuales
SELECT
    DB_NAME(database_id) AS DatabaseName,
    COUNT(session_id) AS Connections
FROM sys.dm_exec_sessions
WHERE database_id > 0
GROUP BY database_id
ORDER BY Connections DESC;
GO

-- ============================================
-- 2. AUMENTAR MÁXIMO DE CONEXIONES (si es necesario)
-- ============================================
-- Por defecto, SQL Server permite 32,767 conexiones de usuario
-- Generalmente NO es necesario cambiar esto, pero validamos
-- que esté configurado correctamente para alta concurrencia

-- Mostrar configuración actual de user connections (0 = ilimitado hasta 32767)
EXEC sp_configure 'user connections';
GO

-- Si necesitas un límite específico (NO recomendado, dejar en 0):
-- EXEC sp_configure 'show advanced options', 1;
-- RECONFIGURE;
-- EXEC sp_configure 'user connections', 500;  -- Ejemplo: límite de 500 conexiones
-- RECONFIGURE WITH OVERRIDE;
-- GO

PRINT 'NOTA: user connections = 0 significa que SQL Server ajustará dinámicamente (máx: 32,767)';
PRINT 'Con connection pool de 200, esto es más que suficiente.';
GO

-- ============================================
-- 3. CONFIGURAR MAX DEGREE OF PARALLELISM (MAXDOP)
-- ============================================
-- Recomendación: MAXDOP = número de cores físicos (no lógicos)
-- Ejemplo: Si tienes 8 cores físicos, MAXDOP = 8
-- Esto evita que queries individuales consuman todos los recursos

PRINT '=== Configurando MAXDOP ===';

-- Ver configuración actual
EXEC sp_configure 'max degree of parallelism';
GO

-- Configurar MAXDOP (ajustar según tu servidor)
-- RECOMENDACIÓN: Consultar con DBA para valor óptimo
EXEC sp_configure 'show advanced options', 1;
RECONFIGURE;
GO

-- Ejemplo: MAXDOP = 8 para servidor con 8 cores físicos
-- Ajustar este valor según la arquitectura de tu servidor
-- EXEC sp_configure 'max degree of parallelism', 8;
-- RECONFIGURE WITH OVERRIDE;
-- GO

PRINT 'NOTA: Revisar y ajustar MAXDOP según cores físicos del servidor.';
PRINT 'Consultar con DBA para valor óptimo.';
GO

-- ============================================
-- 4. COST THRESHOLD FOR PARALLELISM
-- ============================================
-- Queries con costo < threshold se ejecutarán en serie
-- Default = 5 (muy bajo), recomendado = 50 para entornos OLTP

PRINT '=== Configurando Cost Threshold for Parallelism ===';

EXEC sp_configure 'cost threshold for parallelism';
GO

-- Aumentar a 50 (recomendado para OLTP)
EXEC sp_configure 'cost threshold for parallelism', 50;
RECONFIGURE WITH OVERRIDE;
GO

PRINT 'Cost Threshold for Parallelism configurado a 50';
GO

-- ============================================
-- 5. MAX WORKER THREADS
-- ============================================
-- SQL Server ajusta automáticamente el número de worker threads
-- Generalmente NO es necesario cambiar esto

PRINT '=== Worker Threads ===';

EXEC sp_configure 'max worker threads';
GO

PRINT 'NOTA: max worker threads = 0 significa configuración automática (recomendado)';
GO

-- ============================================
-- 6. VERIFICAR MEMORIA DISPONIBLE
-- ============================================
-- Con 200 conexiones simultáneas, asegurar que SQL Server
-- tenga suficiente memoria asignada

PRINT '=== Configuración de Memoria ===';

SELECT
    total_physical_memory_kb / 1024 / 1024 AS 'Total RAM (GB)',
    available_physical_memory_kb / 1024 / 1024 AS 'RAM Disponible (GB)',
    system_memory_state_desc AS 'Estado Memoria'
FROM sys.dm_os_sys_memory;
GO

-- Ver memoria asignada a SQL Server
EXEC sp_configure 'max server memory (MB)';
EXEC sp_configure 'min server memory (MB)';
GO

-- Recomendación: Dejar ~4GB para el SO, resto para SQL Server
-- Ejemplo para servidor con 64GB RAM: max = 60GB (61440 MB)
-- EXEC sp_configure 'max server memory (MB)', 61440;
-- RECONFIGURE WITH OVERRIDE;
-- GO

PRINT 'NOTA: Revisar y ajustar max server memory según RAM total del servidor.';
PRINT 'Recomendación: Total RAM - 4GB para el SO.';
GO

-- ============================================
-- 7. HABILITAR OPTIMIZACIONES PARA OLTP
-- ============================================
-- Habilitar optimize for ad hoc workloads para reducir uso de plan cache

PRINT '=== Optimize for Ad Hoc Workloads ===';

EXEC sp_configure 'optimize for ad hoc workloads';
GO

-- Habilitar optimización (recomendado para alto volumen de queries)
EXEC sp_configure 'optimize for ad hoc workloads', 1;
RECONFIGURE WITH OVERRIDE;
GO

PRINT 'Optimize for ad hoc workloads habilitado';
GO

-- ============================================
-- 8. VERIFICAR ISOLATION LEVEL
-- ============================================
-- Confirmar que READ_COMMITTED_SNAPSHOT está habilitado
-- (ya configurado en script 01_enable_read_committed_snapshot.sql)

USE master;
GO

SELECT
    name AS 'Base de Datos',
    is_read_committed_snapshot_on AS 'READ_COMMITTED_SNAPSHOT',
    snapshot_isolation_state_desc AS 'Estado Snapshot Isolation'
FROM sys.databases
WHERE name = 'Inteligencia_Producto_Dev';
GO

-- ============================================
-- 9. MONITOREO DE CONEXIONES ACTIVAS
-- ============================================
-- Query útil para monitorear conexiones en tiempo real

PRINT '=== Query de Monitoreo ===';
PRINT 'Usar esta query para monitorear conexiones activas en producción:';
PRINT '';
PRINT 'SELECT';
PRINT '    DB_NAME(database_id) AS DatabaseName,';
PRINT '    program_name AS Application,';
PRINT '    host_name AS Host,';
PRINT '    login_name AS Login,';
PRINT '    COUNT(session_id) AS Connections,';
PRINT '    MAX(last_request_start_time) AS LastActivity';
PRINT 'FROM sys.dm_exec_sessions';
PRINT 'WHERE database_id = DB_ID(''Inteligencia_Producto_Dev'')';
PRINT 'GROUP BY database_id, program_name, host_name, login_name';
PRINT 'ORDER BY Connections DESC;';
GO

-- ============================================
-- 10. RESUMEN DE CONFIGURACIÓN
-- ============================================
PRINT '';
PRINT '=== RESUMEN DE CONFIGURACIÓN PARA ALTA CONCURRENCIA ===';
PRINT '';
PRINT '✅ Verificar configuraciones:';
PRINT '  - user connections: 0 (auto, máx 32,767)';
PRINT '  - max degree of parallelism: revisar según cores físicos';
PRINT '  - cost threshold for parallelism: 50';
PRINT '  - max worker threads: 0 (auto)';
PRINT '  - max server memory: revisar según RAM total';
PRINT '  - optimize for ad hoc workloads: 1 (habilitado)';
PRINT '  - READ_COMMITTED_SNAPSHOT: ON (Inteligencia_Producto_Dev)';
PRINT '';
PRINT '✅ Connection Pool del Backend:';
PRINT '  - Max: 200 conexiones';
PRINT '  - Min: 20 conexiones';
PRINT '';
PRINT '✅ Pipeline ETL:';
PRINT '  - maxConcurrentFunds: 999 (sin límite práctico)';
PRINT '  - maxConcurrentTasks: 2000';
PRINT '  - Servicios individuales: sin límite (999)';
PRINT '';
PRINT '📊 Capacidad estimada:';
PRINT '  - Múltiples ejecuciones simultáneas con 100+ fondos cada una';
PRINT '  - 2000 tareas (SPs) en paralelo máximo';
PRINT '';
PRINT 'Configuración optimizada para paralelización masiva ✅';
GO
