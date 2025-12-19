-- ============================================
-- Monitoreo de Conexiones del Pipeline ETL
-- ============================================
-- Scripts para monitorear el rendimiento del pipeline en tiempo real
-- con paralelización masiva (100+ fondos simultáneos)
-- ============================================

USE Inteligencia_Producto_Dev;
GO

-- ============================================
-- 1. CONEXIONES ACTIVAS POR APLICACIÓN
-- ============================================
PRINT '=== Conexiones Activas por Aplicación ===';

SELECT
    DB_NAME(database_id) AS DatabaseName,
    program_name AS Application,
    host_name AS Host,
    login_name AS Login,
    COUNT(session_id) AS ConnectionCount,
    MAX(last_request_start_time) AS LastActivity,
    SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) AS RunningQueries,
    SUM(CASE WHEN status = 'sleeping' THEN 1 ELSE 0 END) AS IdleConnections
FROM sys.dm_exec_sessions
WHERE database_id = DB_ID('Inteligencia_Producto_Dev')
  AND is_user_process = 1
GROUP BY database_id, program_name, host_name, login_name
ORDER BY ConnectionCount DESC;
GO

-- ============================================
-- 2. QUERIES ACTIVOS EN ESTE MOMENTO
-- ============================================
PRINT '=== Queries Activos (Running) ===';

SELECT
    s.session_id AS SessionID,
    s.login_name AS Login,
    s.host_name AS Host,
    s.program_name AS Application,
    DB_NAME(r.database_id) AS DatabaseName,
    r.status AS Status,
    r.command AS Command,
    r.cpu_time AS CPU_Time_ms,
    r.total_elapsed_time AS ElapsedTime_ms,
    r.reads AS Reads,
    r.writes AS Writes,
    r.blocking_session_id AS BlockedBy,
    SUBSTRING(
        qt.text,
        (r.statement_start_offset / 2) + 1,
        (
            CASE r.statement_end_offset
                WHEN -1 THEN DATALENGTH(qt.text)
                ELSE r.statement_end_offset
            END - r.statement_start_offset
        ) / 2 + 1
    ) AS QueryText,
    qp.query_plan AS QueryPlan
FROM sys.dm_exec_requests r
INNER JOIN sys.dm_exec_sessions s ON r.session_id = s.session_id
CROSS APPLY sys.dm_exec_sql_text(r.sql_handle) qt
OUTER APPLY sys.dm_exec_query_plan(r.plan_handle) qp
WHERE r.database_id = DB_ID('Inteligencia_Producto_Dev')
  AND s.is_user_process = 1
ORDER BY r.total_elapsed_time DESC;
GO

-- ============================================
-- 3. BLOQUEOS ACTIVOS (DEADLOCKS EN PROGRESO)
-- ============================================
PRINT '=== Bloqueos Activos ===';

SELECT
    blocking.session_id AS BlockingSessionID,
    blocked.session_id AS BlockedSessionID,
    blocking_text.text AS BlockingQuery,
    blocked_text.text AS BlockedQuery,
    blocking.wait_type AS BlockingWaitType,
    blocked.wait_type AS BlockedWaitType,
    blocked.wait_time AS WaitTime_ms,
    DB_NAME(blocking.database_id) AS DatabaseName
FROM sys.dm_exec_requests blocked
INNER JOIN sys.dm_exec_requests blocking ON blocked.blocking_session_id = blocking.session_id
CROSS APPLY sys.dm_exec_sql_text(blocking.sql_handle) blocking_text
CROSS APPLY sys.dm_exec_sql_text(blocked.sql_handle) blocked_text
WHERE blocked.blocking_session_id <> 0
  AND blocking.database_id = DB_ID('Inteligencia_Producto_Dev');
GO

-- ============================================
-- 4. ESTADÍSTICAS DE WAIT STATS
-- ============================================
-- Mostrar los tipos de espera más comunes en el servidor
-- Útil para identificar cuellos de botella

PRINT '=== Top 20 Wait Stats ===';

WITH WaitStats AS (
    SELECT
        wait_type,
        wait_time_ms,
        waiting_tasks_count,
        wait_time_ms / NULLIF(waiting_tasks_count, 0) AS avg_wait_ms
    FROM sys.dm_os_wait_stats
    WHERE wait_type NOT IN (
        -- Excluir waits irrelevantes
        'CLR_SEMAPHORE', 'LAZYWRITER_SLEEP', 'RESOURCE_QUEUE',
        'SLEEP_TASK', 'SLEEP_SYSTEMTASK', 'SQLTRACE_BUFFER_FLUSH',
        'WAITFOR', 'LOGMGR_QUEUE', 'CHECKPOINT_QUEUE',
        'REQUEST_FOR_DEADLOCK_SEARCH', 'XE_TIMER_EVENT', 'BROKER_TO_FLUSH',
        'BROKER_TASK_STOP', 'CLR_MANUAL_EVENT', 'CLR_AUTO_EVENT',
        'DISPATCHER_QUEUE_SEMAPHORE', 'FT_IFTS_SCHEDULER_IDLE_WAIT',
        'XE_DISPATCHER_WAIT', 'XE_DISPATCHER_JOIN', 'SQLTRACE_INCREMENTAL_FLUSH_SLEEP'
    )
)
SELECT TOP 20
    wait_type AS WaitType,
    wait_time_ms / 1000.0 AS WaitTime_sec,
    waiting_tasks_count AS WaitingTasksCount,
    avg_wait_ms AS AvgWait_ms,
    CAST(100.0 * wait_time_ms / SUM(wait_time_ms) OVER() AS DECIMAL(5,2)) AS PercentOfTotal
FROM WaitStats
ORDER BY wait_time_ms DESC;
GO

-- ============================================
-- 5. EJECUCIONES DEL PIPELINE EN PROGRESO
-- ============================================
PRINT '=== Ejecuciones del Pipeline en Progreso ===';

SELECT
    e.ID_Ejecucion,
    e.FechaReporte,
    e.Usuario,
    e.Estado,
    e.TotalFondos,
    e.FondosExitosos,
    e.FondosFallidos,
    e.FechaInicio,
    DATEDIFF(MINUTE, e.FechaInicio, GETDATE()) AS Duracion_Minutos,
    COUNT(ef.ID_Fund) AS Fondos_Total,
    SUM(CASE WHEN ef.Estado_Final = 'OK' THEN 1 ELSE 0 END) AS Fondos_Completados,
    SUM(CASE WHEN ef.Estado_Final = 'ERROR' THEN 1 ELSE 0 END) AS Fondos_Fallidos,
    SUM(CASE WHEN ef.Estado_Final = 'PENDIENTE' THEN 1 ELSE 0 END) AS Fondos_Pendientes
FROM logs.Ejecuciones e
LEFT JOIN logs.Ejecucion_Fondos ef ON e.ID_Ejecucion = ef.ID_Ejecucion
WHERE e.Estado = 'EN_PROGRESO'
  AND e.FechaInicio >= DATEADD(HOUR, -2, GETDATE()) -- Últimas 2 horas
GROUP BY
    e.ID_Ejecucion,
    e.FechaReporte,
    e.Usuario,
    e.Estado,
    e.TotalFondos,
    e.FondosExitosos,
    e.FondosFallidos,
    e.FechaInicio
ORDER BY e.FechaInicio DESC;
GO

-- ============================================
-- 6. FONDOS EN PROCESO POR EJECUCIÓN
-- ============================================
-- Mostrar qué fondos están procesándose en cada ejecución activa

PRINT '=== Fondos en Proceso (por ejecución) ===';

SELECT
    ef.ID_Ejecucion,
    ef.ID_Fund,
    ef.FundShortName,
    ef.Estado_Extraccion,
    ef.Estado_Process_IPA,
    ef.Estado_Process_CAPM,
    ef.Estado_Process_PNL,
    ef.Estado_Final,
    ef.Paso_Con_Error,
    DATEDIFF(SECOND, ef.Inicio_Procesamiento, GETDATE()) AS Duracion_Segundos
FROM logs.Ejecucion_Fondos ef
INNER JOIN logs.Ejecuciones e ON ef.ID_Ejecucion = e.ID_Ejecucion
WHERE e.Estado = 'EN_PROGRESO'
  AND ef.Estado_Final IN ('PENDIENTE', 'EN_PROGRESO')
ORDER BY ef.ID_Ejecucion, ef.ID_Fund;
GO

-- ============================================
-- 7. LOGS RECIENTES (ÚLTIMOS 100 EVENTOS)
-- ============================================
PRINT '=== Logs Recientes (últimos 100) ===';

SELECT TOP 100
    el.ID,
    el.ID_Ejecucion,
    el.ID_Fund,
    el.Nivel,
    el.Etapa,
    el.Mensaje,
    el.Timestamp
FROM logs.Ejecucion_Logs el
INNER JOIN logs.Ejecuciones e ON el.ID_Ejecucion = e.ID_Ejecucion
WHERE e.Estado = 'EN_PROGRESO'
ORDER BY el.Timestamp DESC;
GO

-- ============================================
-- 8. ERRORES RECIENTES
-- ============================================
PRINT '=== Errores Recientes (últimas 24 horas) ===';

SELECT
    el.ID_Ejecucion,
    el.ID_Fund,
    el.Etapa,
    el.Mensaje,
    el.Detalle,
    el.Timestamp
FROM logs.Ejecucion_Logs el
WHERE el.Nivel = 'ERROR'
  AND el.Timestamp >= DATEADD(HOUR, -24, GETDATE())
ORDER BY el.Timestamp DESC;
GO

-- ============================================
-- 9. PERFORMANCE POR SERVICIO
-- ============================================
-- Analizar duración promedio de cada servicio del pipeline

PRINT '=== Performance Promedio por Servicio ===';

-- Extraer duraciones desde los logs
WITH ServiceDurations AS (
    SELECT
        el.ID_Ejecucion,
        el.ID_Fund,
        el.Etapa,
        MIN(el.Timestamp) AS StartTime,
        MAX(el.Timestamp) AS EndTime,
        DATEDIFF(SECOND, MIN(el.Timestamp), MAX(el.Timestamp)) AS Duration_Seconds
    FROM logs.Ejecucion_Logs el
    WHERE el.Etapa IN (
        'EXTRACCION', 'VALIDACION', 'PROCESS_IPA', 'PROCESS_CAPM',
        'PROCESS_DERIVADOS', 'PROCESS_PNL', 'PROCESS_UBS', 'CONCATENAR'
    )
    GROUP BY el.ID_Ejecucion, el.ID_Fund, el.Etapa
)
SELECT
    Etapa AS Servicio,
    COUNT(*) AS Ejecuciones,
    AVG(Duration_Seconds) AS Avg_Duracion_Seg,
    MIN(Duration_Seconds) AS Min_Duracion_Seg,
    MAX(Duration_Seconds) AS Max_Duracion_Seg,
    STDEV(Duration_Seconds) AS StdDev_Duracion_Seg
FROM ServiceDurations
GROUP BY Etapa
ORDER BY AVG(Duration_Seconds) DESC;
GO

-- ============================================
-- 10. UTILIZACIÓN DEL CONNECTION POOL
-- ============================================
PRINT '=== Utilización del Connection Pool ===';

DECLARE @TotalConnections INT;
DECLARE @MaxConnections INT = 200; -- Pool configurado

SELECT @TotalConnections = COUNT(*)
FROM sys.dm_exec_sessions
WHERE database_id = DB_ID('Inteligencia_Producto_Dev')
  AND is_user_process = 1;

SELECT
    @TotalConnections AS ConexionesActuales,
    @MaxConnections AS ConexionesMaximas,
    CAST(100.0 * @TotalConnections / @MaxConnections AS DECIMAL(5,2)) AS Utilizacion_Porcentaje,
    @MaxConnections - @TotalConnections AS ConexionesDisponibles;
GO

-- ============================================
-- RESUMEN
-- ============================================
PRINT '';
PRINT '=== RESUMEN DE MONITOREO ===';
PRINT 'Scripts ejecutados:';
PRINT '  1. Conexiones activas por aplicación';
PRINT '  2. Queries activos (running)';
PRINT '  3. Bloqueos activos (deadlocks)';
PRINT '  4. Wait stats (top 20)';
PRINT '  5. Ejecuciones del pipeline en progreso';
PRINT '  6. Fondos en proceso por ejecución';
PRINT '  7. Logs recientes (últimos 100)';
PRINT '  8. Errores recientes (últimas 24h)';
PRINT '  9. Performance promedio por servicio';
PRINT ' 10. Utilización del connection pool';
PRINT '';
PRINT 'Usar estos scripts regularmente para monitorear la salud del pipeline.';
GO
