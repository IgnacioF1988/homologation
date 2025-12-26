-- =============================================
-- Migration 018: Create Trace Analysis Views
-- Purpose: Provide analytical views for detecting resource contention and bottlenecks
-- Phase: 3 - Estrategia de Trace Records (Analysis Layer)
-- =============================================

SET NOCOUNT ON;
GO

PRINT 'Starting Migration 018: Creating trace analysis views';
GO

-- =============================================
-- View 1: Resource Contention Detection
-- Purpose: Identify funds that accessed the same resource simultaneously
-- =============================================

IF OBJECT_ID('logs.v_Trace_Resource_Contention', 'V') IS NOT NULL
    DROP VIEW logs.v_Trace_Resource_Contention;
GO

CREATE VIEW logs.v_Trace_Resource_Contention
AS
SELECT
    t1.ID_Proceso,
    t1.ID_Fund AS Fund1,
    t2.ID_Fund AS Fund2,
    t1.Recurso,
    t1.Etapa,
    t1.Timestamp AS Inicio_Fund1,
    t2.Timestamp AS Inicio_Fund2,
    DATEDIFF(MILLISECOND, t1.Timestamp, t2.Timestamp) AS Overlap_Ms,
    t1.Duracion_Ms AS Duracion_Fund1_Ms,
    t2.Duracion_Ms AS Duracion_Fund2_Ms
FROM logs.Trace_Records t1
INNER JOIN logs.Trace_Records t2
    ON t1.Recurso = t2.Recurso
    AND t1.ID_Proceso = t2.ID_Proceso
    AND t1.ID_Fund < t2.ID_Fund  -- Avoid duplicates (Fund1, Fund2) vs (Fund2, Fund1)
    AND t1.Tipo_Evento = 'START'
    AND t2.Tipo_Evento = 'START'
    AND ABS(DATEDIFF(MILLISECOND, t1.Timestamp, t2.Timestamp)) < 5000  -- Within 5 seconds
WHERE t1.Recurso IS NOT NULL;
GO

PRINT '  ✓ View logs.v_Trace_Resource_Contention created';
GO

-- =============================================
-- View 2: Resource Bottleneck Analysis
-- Purpose: Identify resources with high usage, locks, and waits
-- =============================================

IF OBJECT_ID('logs.v_Trace_Resource_Bottlenecks', 'V') IS NOT NULL
    DROP VIEW logs.v_Trace_Resource_Bottlenecks;
GO

CREATE VIEW logs.v_Trace_Resource_Bottlenecks
AS
SELECT
    ID_Proceso,
    Recurso,
    COUNT(*) AS Total_Accesos,
    COUNT(DISTINCT ID_Fund) AS Fondos_Distintos,
    AVG(Duracion_Ms) AS Duracion_Promedio_Ms,
    MAX(Duracion_Ms) AS Duracion_Maxima_Ms,
    MIN(Duracion_Ms) AS Duracion_Minima_Ms,
    SUM(CASE WHEN Tipo_Evento = 'LOCK' THEN 1 ELSE 0 END) AS Total_Locks,
    SUM(CASE WHEN Tipo_Evento = 'WAIT' THEN 1 ELSE 0 END) AS Total_Waits,
    SUM(CASE WHEN Tipo_Evento = 'ERROR' THEN 1 ELSE 0 END) AS Total_Errors
FROM logs.Trace_Records
WHERE Recurso IS NOT NULL
GROUP BY ID_Proceso, Recurso;
GO

PRINT '  ✓ View logs.v_Trace_Resource_Bottlenecks created';
GO

-- =============================================
-- View 3: Fund Execution Timeline
-- Purpose: Show execution timeline for each fund by stage
-- =============================================

IF OBJECT_ID('logs.v_Trace_Fund_Timeline', 'V') IS NOT NULL
    DROP VIEW logs.v_Trace_Fund_Timeline;
GO

CREATE VIEW logs.v_Trace_Fund_Timeline
AS
SELECT
    ID_Proceso,
    ID_Ejecucion,
    ID_Fund,
    Etapa,
    MIN(Timestamp) AS Inicio,
    MAX(Timestamp) AS Fin,
    DATEDIFF(MILLISECOND, MIN(Timestamp), MAX(Timestamp)) AS Duracion_Ms,
    COUNT(CASE WHEN Tipo_Evento = 'ERROR' THEN 1 END) AS Errores,
    COUNT(CASE WHEN Tipo_Evento = 'LOCK' THEN 1 END) AS Locks,
    COUNT(CASE WHEN Tipo_Evento = 'WAIT' THEN 1 END) AS Waits
FROM logs.Trace_Records
WHERE Tipo_Evento IN ('START', 'END', 'ERROR', 'LOCK', 'WAIT')
  AND Etapa IS NOT NULL
GROUP BY ID_Proceso, ID_Ejecucion, ID_Fund, Etapa;
GO

PRINT '  ✓ View logs.v_Trace_Fund_Timeline created';
GO

-- =============================================
-- View 4: Proceso Summary Statistics
-- Purpose: High-level statistics for entire proceso execution
-- =============================================

IF OBJECT_ID('logs.v_Trace_Proceso_Summary', 'V') IS NOT NULL
    DROP VIEW logs.v_Trace_Proceso_Summary;
GO

CREATE VIEW logs.v_Trace_Proceso_Summary
AS
SELECT
    ID_Proceso,
    MIN(Timestamp) AS Inicio_Proceso,
    MAX(Timestamp) AS Fin_Proceso,
    DATEDIFF(MILLISECOND, MIN(Timestamp), MAX(Timestamp)) AS Duracion_Total_Ms,
    COUNT(DISTINCT ID_Ejecucion) AS Total_Ejecuciones,
    COUNT(DISTINCT ID_Fund) AS Total_Fondos,
    COUNT(DISTINCT Etapa) AS Total_Etapas,
    COUNT(DISTINCT Recurso) AS Total_Recursos,
    COUNT(CASE WHEN Tipo_Evento = 'ERROR' THEN 1 END) AS Total_Errores,
    COUNT(CASE WHEN Tipo_Evento = 'LOCK' THEN 1 END) AS Total_Locks,
    COUNT(CASE WHEN Tipo_Evento = 'WAIT' THEN 1 END) AS Total_Waits,
    COUNT(*) AS Total_Eventos
FROM logs.Trace_Records
GROUP BY ID_Proceso;
GO

PRINT '  ✓ View logs.v_Trace_Proceso_Summary created';
GO

-- =============================================
-- View 5: Slowest Services by Fund
-- Purpose: Identify which services take longest for each fund
-- =============================================

IF OBJECT_ID('logs.v_Trace_Slowest_Services', 'V') IS NOT NULL
    DROP VIEW logs.v_Trace_Slowest_Services;
GO

CREATE VIEW logs.v_Trace_Slowest_Services
AS
WITH ServiceDurations AS (
    SELECT
        ID_Proceso,
        ID_Ejecucion,
        ID_Fund,
        Etapa,
        Duracion_Ms,
        ROW_NUMBER() OVER (PARTITION BY ID_Proceso, ID_Fund ORDER BY Duracion_Ms DESC) AS Rn
    FROM logs.Trace_Records
    WHERE Tipo_Evento = 'END'
      AND Duracion_Ms IS NOT NULL
      AND Etapa IS NOT NULL
)
SELECT
    ID_Proceso,
    ID_Ejecucion,
    ID_Fund,
    Etapa,
    Duracion_Ms
FROM ServiceDurations
WHERE Rn <= 5;  -- Top 5 slowest services per fund
GO

PRINT '  ✓ View logs.v_Trace_Slowest_Services created';
GO

-- =============================================
-- View 6: Parallel Execution Efficiency
-- Purpose: Measure parallel execution efficiency (how many funds run simultaneously)
-- =============================================

IF OBJECT_ID('logs.v_Trace_Parallel_Efficiency', 'V') IS NOT NULL
    DROP VIEW logs.v_Trace_Parallel_Efficiency;
GO

CREATE VIEW logs.v_Trace_Parallel_Efficiency
AS
WITH TimestampEvents AS (
    SELECT
        ID_Proceso,
        Timestamp,
        Tipo_Evento,
        SUM(CASE WHEN Tipo_Evento = 'START' THEN 1 WHEN Tipo_Evento = 'END' THEN -1 ELSE 0 END)
            OVER (PARTITION BY ID_Proceso ORDER BY Timestamp ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
            AS Fondos_En_Paralelo
    FROM logs.Trace_Records
    WHERE Tipo_Evento IN ('START', 'END')
      AND Etapa IS NOT NULL
)
SELECT
    ID_Proceso,
    MAX(Fondos_En_Paralelo) AS Max_Paralelismo,
    AVG(CAST(Fondos_En_Paralelo AS FLOAT)) AS Paralelismo_Promedio,
    MIN(Fondos_En_Paralelo) AS Min_Paralelismo
FROM TimestampEvents
GROUP BY ID_Proceso;
GO

PRINT '  ✓ View logs.v_Trace_Parallel_Efficiency created';
GO

PRINT '';
PRINT '✅ Migration 018 completed successfully';
PRINT '';
PRINT 'Created 6 analysis views:';
PRINT '  1. logs.v_Trace_Resource_Contention - Detect simultaneous resource access';
PRINT '  2. logs.v_Trace_Resource_Bottlenecks - Identify resource bottlenecks';
PRINT '  3. logs.v_Trace_Fund_Timeline - Fund execution timeline by stage';
PRINT '  4. logs.v_Trace_Proceso_Summary - High-level proceso statistics';
PRINT '  5. logs.v_Trace_Slowest_Services - Top 5 slowest services per fund';
PRINT '  6. logs.v_Trace_Parallel_Efficiency - Measure parallelism efficiency';
PRINT '';
PRINT 'Example queries:';
PRINT '  -- Find resource contention for specific proceso:';
PRINT '  SELECT * FROM logs.v_Trace_Resource_Contention WHERE ID_Proceso = @ID_Proceso ORDER BY Overlap_Ms DESC;';
PRINT '';
PRINT '  -- Find bottleneck resources:';
PRINT '  SELECT * FROM logs.v_Trace_Resource_Bottlenecks WHERE ID_Proceso = @ID_Proceso ORDER BY Total_Locks DESC, Duracion_Promedio_Ms DESC;';
PRINT '';
PRINT '  -- View fund timeline:';
PRINT '  SELECT * FROM logs.v_Trace_Fund_Timeline WHERE ID_Proceso = @ID_Proceso AND ID_Fund = @ID_Fund ORDER BY Inicio;';
GO
