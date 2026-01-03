/*
================================================================================
PROCESS SCHEMA - DDL DE TABLAS
================================================================================
Descripcion: Tablas de resultados finales del pipeline.

Tablas:
  - process.CUBO_Final : Destino final consolidado de todas las posiciones

Autor: Refactorizacion Pipeline IPA
Fecha: 2026-01-02
================================================================================
*/

-- ============================================================================
-- CREAR SCHEMA SI NO EXISTE
-- ============================================================================
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'process')
BEGIN
    EXEC('CREATE SCHEMA process');
    PRINT 'Schema [process] creado';
END
GO

-- ============================================================================
-- TABLA: process.CUBO_Final
-- Destino final del pipeline - todas las posiciones consolidadas
-- ============================================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables t
               INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
               WHERE s.name = 'process' AND t.name = 'CUBO_Final')
BEGIN
    CREATE TABLE [process].[CUBO_Final] (
        ID BIGINT IDENTITY(1,1) PRIMARY KEY,
        -- Claves de proceso
        ID_Ejecucion BIGINT NOT NULL,
        ID_Proceso BIGINT NOT NULL,
        ID_Fund INT NOT NULL,
        -- Claves de negocio
        PK2 NVARCHAR(50) NOT NULL,
        ID_Instrumento INT NOT NULL,
        id_CURR INT NOT NULL,
        -- Fechas
        FechaReporte NVARCHAR(10) NOT NULL,
        FechaCartera NVARCHAR(10) NOT NULL,
        -- Clasificacion
        BalanceSheet NVARCHAR(20) NOT NULL,
        Source NVARCHAR(50) NOT NULL,
        TipoRegistro NVARCHAR(50) NOT NULL,  -- 'IPA', 'CAPM', 'DERIVADOS', 'AJUSTE_*', 'PNL'
        -- Campos numericos de posicion
        LocalPrice DECIMAL(18,6) NULL,
        Qty DECIMAL(18,6) NULL,
        OriginalFace DECIMAL(18,4) NULL,
        Factor DECIMAL(18,6) NULL,
        AI DECIMAL(18,4) NULL,
        MVBook DECIMAL(18,4) NULL,
        TotalMVal DECIMAL(18,4) NULL,
        TotalMVal_Balance DECIMAL(18,4) NULL,
        -- Campos PNL
        PRgain DECIMAL(18,4) NULL,
        PUgain DECIMAL(18,4) NULL,
        FxRgain DECIMAL(18,4) NULL,
        FxUgain DECIMAL(18,4) NULL,
        Income DECIMAL(18,4) NULL,
        TotGL DECIMAL(18,4) NULL,
        PctGL DECIMAL(18,6) NULL,
        BasisPoint DECIMAL(18,6) NULL,
        -- Metadata
        FechaProceso DATETIME NOT NULL DEFAULT GETDATE(),
        -- Indices para queries frecuentes
        INDEX IX_CUBO_Final_Ejecucion (ID_Ejecucion),
        INDEX IX_CUBO_Final_Fund (ID_Fund, FechaReporte),
        INDEX IX_CUBO_Final_PK2 (PK2),
        INDEX IX_CUBO_Final_Fecha (FechaReporte, ID_Fund),
        -- Indice para concurrencia (DELETE/INSERT por fondo en paralelo)
        INDEX IX_CUBO_Final_Concurrency (ID_Ejecucion, ID_Proceso, ID_Fund, FechaReporte)
    );
    PRINT 'Tabla [process].[CUBO_Final] creada';
END
GO

PRINT '========================================';
PRINT 'PROCESS TABLES - CREACION COMPLETADA';
PRINT '========================================';
GO
