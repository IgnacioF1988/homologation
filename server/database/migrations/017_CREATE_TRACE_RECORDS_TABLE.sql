-- =============================================
-- Migration 017: Create Trace Records Table
-- Purpose: Enable detailed traceability of execution flow and resource usage
-- Phase: 3 - Estrategia de Trace Records
-- =============================================

SET NOCOUNT ON;
GO

PRINT 'Starting Migration 017: Creating logs.Trace_Records table';
GO

-- =============================================
-- Step 1: Create Trace_Records table
-- =============================================

IF OBJECT_ID('logs.Trace_Records', 'U') IS NOT NULL
BEGIN
    PRINT '  - Table logs.Trace_Records already exists, dropping...';
    DROP TABLE logs.Trace_Records;
END

CREATE TABLE logs.Trace_Records (
    ID_Trace BIGINT IDENTITY(1,1) PRIMARY KEY,
    ID_Proceso BIGINT NOT NULL,
    ID_Ejecucion BIGINT NOT NULL,
    ID_Fund INT NULL,
    Timestamp DATETIME2 NOT NULL DEFAULT GETDATE(),
    Etapa NVARCHAR(50) NULL,
    SubEtapa NVARCHAR(50) NULL,
    Tipo_Evento NVARCHAR(20) NOT NULL, -- START, END, LOCK, WAIT, ERROR
    Recurso NVARCHAR(100) NULL,        -- Table, connection, service
    Duracion_Ms INT NULL,
    Metadata NVARCHAR(MAX) NULL,       -- JSON with details
    Thread_ID INT NULL,

    CONSTRAINT FK_Trace_Proceso
        FOREIGN KEY (ID_Proceso) REFERENCES logs.Procesos(ID_Proceso),
    CONSTRAINT FK_Trace_Ejecucion
        FOREIGN KEY (ID_Ejecucion) REFERENCES logs.Ejecuciones(ID_Ejecucion)
);

PRINT '  ✓ Table logs.Trace_Records created';
GO

-- =============================================
-- Step 2: Create indexes for performance
-- =============================================

PRINT 'Creating indexes on logs.Trace_Records...';

-- Index for proceso-level queries
CREATE NONCLUSTERED INDEX IX_Trace_Proceso
ON logs.Trace_Records(ID_Proceso, Timestamp)
INCLUDE (ID_Ejecucion, ID_Fund, Etapa, Tipo_Evento);

PRINT '  ✓ Index IX_Trace_Proceso created';

-- Index for ejecucion-level queries
CREATE NONCLUSTERED INDEX IX_Trace_Ejecucion
ON logs.Trace_Records(ID_Ejecucion, Etapa, Timestamp)
INCLUDE (SubEtapa, Tipo_Evento, Recurso, Duracion_Ms);

PRINT '  ✓ Index IX_Trace_Ejecucion created';

-- Index for resource contention detection
CREATE NONCLUSTERED INDEX IX_Trace_Recurso
ON logs.Trace_Records(Recurso, Tipo_Evento, Timestamp)
INCLUDE (ID_Proceso, ID_Ejecucion, ID_Fund, Duracion_Ms);

PRINT '  ✓ Index IX_Trace_Recurso created';

-- Index for fund-level analysis
CREATE NONCLUSTERED INDEX IX_Trace_Fund
ON logs.Trace_Records(ID_Fund, Timestamp)
INCLUDE (Etapa, SubEtapa, Tipo_Evento, Duracion_Ms);

PRINT '  ✓ Index IX_Trace_Fund created';
GO

PRINT '';
PRINT '✅ Migration 017 completed successfully';
PRINT '';
PRINT 'Created:';
PRINT '  - Table: logs.Trace_Records';
PRINT '  - 4 nonclustered indexes for performance';
PRINT '';
PRINT 'Next steps:';
PRINT '  1. Create TraceService.js for buffered trace recording';
PRINT '  2. Instrument BasePipelineService with tracing';
PRINT '  3. Create analysis views for contention detection';
GO
