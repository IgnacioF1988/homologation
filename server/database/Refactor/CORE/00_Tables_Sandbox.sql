/*
================================================================================
SANDBOX SCHEMA - DDL DE TABLAS
================================================================================
Descripcion: Tablas para alertas, homologaciones pendientes y problemas
             detectados durante el pipeline.

Tablas:
  - sandbox.Homologacion_Fondos        : Fondos sin homologar
  - sandbox.Homologacion_Instrumentos  : Instrumentos sin homologar
  - sandbox.Homologacion_Monedas       : Monedas sin homologar
  - sandbox.Homologacion_Benchmarks    : Benchmarks sin homologar
  - sandbox.Fondos_Problema            : Fondos con problemas de procesamiento
  - sandbox.Alertas_Descuadre_Cash     : Descuadres IPA vs CAPM
  - sandbox.Alertas_Descuadre_Derivados: Descuadres IPA vs Derivados
  - sandbox.Alertas_Descuadre_NAV      : Descuadres IPA vs SONA
  - sandbox.Alertas_Extract_Faltante   : Extracts requeridos no cargados
  - sandbox.Alertas_Suciedades_IPA     : Posiciones con Qty casi cero

Autor: Refactorizacion Pipeline IPA
Fecha: 2026-01-02
================================================================================
*/

-- ============================================================================
-- CREAR SCHEMA SI NO EXISTE
-- ============================================================================
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'sandbox')
BEGIN
    EXEC('CREATE SCHEMA sandbox');
    PRINT 'Schema [sandbox] creado';
END
GO

-- ============================================================================
-- TABLA: sandbox.Homologacion_Fondos
-- ============================================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables t
               INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
               WHERE s.name = 'sandbox' AND t.name = 'Homologacion_Fondos')
BEGIN
    CREATE TABLE [sandbox].[Homologacion_Fondos] (
        ID BIGINT IDENTITY(1,1) PRIMARY KEY,
        ID_Ejecucion BIGINT NULL,
        FechaReporte NVARCHAR(10) NOT NULL,
        Fondo NVARCHAR(100) NOT NULL,
        Source NVARCHAR(50) NOT NULL,
        FechaProceso DATETIME NOT NULL DEFAULT GETDATE(),
        -- Indices
        INDEX IX_Homologacion_Fondos_Ejecucion (ID_Ejecucion, FechaReporte, Fondo, Source),
        INDEX IX_Homologacion_Fondos_Fecha (FechaReporte, Source),
        -- Constraint UNIQUE para evitar duplicados en re-ejecuciones
        CONSTRAINT UQ_Homologacion_Fondos UNIQUE (ID_Ejecucion, FechaReporte, Fondo, Source)
    );
    PRINT 'Tabla [sandbox].[Homologacion_Fondos] creada';
END
GO

-- ============================================================================
-- TABLA: sandbox.Homologacion_Instrumentos
-- ============================================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables t
               INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
               WHERE s.name = 'sandbox' AND t.name = 'Homologacion_Instrumentos')
BEGIN
    CREATE TABLE [sandbox].[Homologacion_Instrumentos] (
        ID BIGINT IDENTITY(1,1) PRIMARY KEY,
        ID_Ejecucion BIGINT NULL,
        FechaReporte NVARCHAR(10) NOT NULL,
        Instrumento NVARCHAR(255) NOT NULL,
        Currency NVARCHAR(50) NULL,
        Source NVARCHAR(50) NOT NULL,
        FechaProceso DATETIME NOT NULL DEFAULT GETDATE(),
        -- Indices
        INDEX IX_Homologacion_Instrumentos_Ejecucion (ID_Ejecucion, FechaReporte, Instrumento, Source),
        INDEX IX_Homologacion_Instrumentos_Fecha (FechaReporte, Source),
        -- Constraint UNIQUE para evitar duplicados en re-ejecuciones
        CONSTRAINT UQ_Homologacion_Instrumentos UNIQUE (ID_Ejecucion, FechaReporte, Instrumento, Source)
    );
    PRINT 'Tabla [sandbox].[Homologacion_Instrumentos] creada';
END
GO

-- ============================================================================
-- TABLA: sandbox.Homologacion_Monedas
-- ============================================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables t
               INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
               WHERE s.name = 'sandbox' AND t.name = 'Homologacion_Monedas')
BEGIN
    CREATE TABLE [sandbox].[Homologacion_Monedas] (
        ID BIGINT IDENTITY(1,1) PRIMARY KEY,
        ID_Ejecucion BIGINT NULL,
        FechaReporte NVARCHAR(10) NOT NULL,
        Moneda NVARCHAR(50) NOT NULL,
        Source NVARCHAR(50) NOT NULL,
        FechaProceso DATETIME NOT NULL DEFAULT GETDATE(),
        -- Indices
        INDEX IX_Homologacion_Monedas_Ejecucion (ID_Ejecucion, FechaReporte, Moneda, Source),
        INDEX IX_Homologacion_Monedas_Fecha (FechaReporte, Source),
        -- Constraint UNIQUE para evitar duplicados en re-ejecuciones
        CONSTRAINT UQ_Homologacion_Monedas UNIQUE (ID_Ejecucion, FechaReporte, Moneda, Source)
    );
    PRINT 'Tabla [sandbox].[Homologacion_Monedas] creada';
END
GO

-- ============================================================================
-- TABLA: sandbox.Homologacion_Benchmarks
-- ============================================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables t
               INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
               WHERE s.name = 'sandbox' AND t.name = 'Homologacion_Benchmarks')
BEGIN
    CREATE TABLE [sandbox].[Homologacion_Benchmarks] (
        ID BIGINT IDENTITY(1,1) PRIMARY KEY,
        ID_Ejecucion BIGINT NULL,
        FechaReporte NVARCHAR(10) NOT NULL,
        Benchmark NVARCHAR(100) NOT NULL,
        Source NVARCHAR(50) NOT NULL,
        FechaProceso DATETIME NOT NULL DEFAULT GETDATE(),
        -- Indices
        INDEX IX_Homologacion_Benchmarks_Fecha (FechaReporte, Source)
    );
    PRINT 'Tabla [sandbox].[Homologacion_Benchmarks] creada';
END
GO

-- ============================================================================
-- TABLA: sandbox.Fondos_Problema
-- ============================================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables t
               INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
               WHERE s.name = 'sandbox' AND t.name = 'Fondos_Problema')
BEGIN
    CREATE TABLE [sandbox].[Fondos_Problema] (
        ID BIGINT IDENTITY(1,1) PRIMARY KEY,
        FechaReporte NVARCHAR(10) NOT NULL,
        ID_Fund NVARCHAR(50) NOT NULL,
        Proceso NVARCHAR(50) NOT NULL,
        Tipo_Problema NVARCHAR(100) NOT NULL,
        Detalle NVARCHAR(MAX) NULL,
        FechaProceso DATETIME NOT NULL DEFAULT GETDATE(),
        -- Indices
        INDEX IX_Fondos_Problema_Fecha (FechaReporte, Proceso)
    );
    PRINT 'Tabla [sandbox].[Fondos_Problema] creada';
END
GO

-- ============================================================================
-- TABLA: sandbox.Alertas_Descuadre_Cash
-- Detecta diferencias entre Total Cash en IPA vs CAPM
-- ============================================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables t
               INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
               WHERE s.name = 'sandbox' AND t.name = 'Alertas_Descuadre_Cash')
BEGIN
    CREATE TABLE [sandbox].[Alertas_Descuadre_Cash] (
        ID BIGINT IDENTITY(1,1) PRIMARY KEY,
        ID_Ejecucion BIGINT NOT NULL,
        ID_Fund INT NOT NULL,
        FechaReporte NVARCHAR(10) NOT NULL,
        Portfolio NVARCHAR(100) NOT NULL,
        Total_IPA_Cash DECIMAL(18,4) NOT NULL,
        Total_CAPM DECIMAL(18,4) NOT NULL,
        Diferencia DECIMAL(18,4) NOT NULL,
        UmbralAplicado DECIMAL(18,4) NOT NULL,
        FechaProceso DATETIME NOT NULL DEFAULT GETDATE(),
        -- Indices
        INDEX IX_Alertas_Descuadre_Cash_Fecha (FechaReporte, ID_Fund),
        -- Constraint UNIQUE para evitar duplicados en re-ejecuciones
        CONSTRAINT UQ_Alertas_Descuadre_Cash UNIQUE (ID_Ejecucion, ID_Fund, FechaReporte)
    );
    PRINT 'Tabla [sandbox].[Alertas_Descuadre_Cash] creada';
END
GO

-- ============================================================================
-- TABLA: sandbox.Alertas_Descuadre_Derivados
-- Detecta diferencias entre MVBook de swaps en IPA vs MTM en Derivados
-- ============================================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables t
               INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
               WHERE s.name = 'sandbox' AND t.name = 'Alertas_Descuadre_Derivados')
BEGIN
    CREATE TABLE [sandbox].[Alertas_Descuadre_Derivados] (
        ID BIGINT IDENTITY(1,1) PRIMARY KEY,
        ID_Ejecucion BIGINT NOT NULL,
        ID_Fund INT NOT NULL,
        FechaReporte NVARCHAR(10) NOT NULL,
        Portfolio NVARCHAR(100) NOT NULL,
        MVBook_IPA DECIMAL(18,4) NOT NULL,
        MTM_Derivados DECIMAL(18,4) NOT NULL,
        Diferencia DECIMAL(18,4) NOT NULL,
        UmbralAplicado DECIMAL(18,4) NOT NULL,
        FechaProceso DATETIME NOT NULL DEFAULT GETDATE(),
        -- Indices
        INDEX IX_Alertas_Descuadre_Derivados_Fecha (FechaReporte, ID_Fund),
        -- Constraint UNIQUE para evitar duplicados en re-ejecuciones
        CONSTRAINT UQ_Alertas_Descuadre_Derivados UNIQUE (ID_Ejecucion, ID_Fund, FechaReporte)
    );
    PRINT 'Tabla [sandbox].[Alertas_Descuadre_Derivados] creada';
END
GO

-- ============================================================================
-- TABLA: sandbox.Alertas_Descuadre_NAV
-- Detecta diferencias entre Total IPA vs NAV en SONA
-- ============================================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables t
               INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
               WHERE s.name = 'sandbox' AND t.name = 'Alertas_Descuadre_NAV')
BEGIN
    CREATE TABLE [sandbox].[Alertas_Descuadre_NAV] (
        ID BIGINT IDENTITY(1,1) PRIMARY KEY,
        ID_Ejecucion BIGINT NOT NULL,
        ID_Fund INT NOT NULL,
        FechaReporte NVARCHAR(10) NOT NULL,
        Portfolio NVARCHAR(100) NOT NULL,
        Total_IPA DECIMAL(18,4) NOT NULL,
        Total_SONA DECIMAL(18,4) NOT NULL,
        Diferencia DECIMAL(18,4) NOT NULL,
        UmbralAplicado DECIMAL(18,4) NOT NULL,
        FechaProceso DATETIME NOT NULL DEFAULT GETDATE(),
        -- Indices
        INDEX IX_Alertas_Descuadre_NAV_Fecha (FechaReporte, ID_Fund),
        -- Constraint UNIQUE para evitar duplicados en re-ejecuciones
        CONSTRAINT UQ_Alertas_Descuadre_NAV UNIQUE (ID_Ejecucion, ID_Fund, FechaReporte)
    );
    PRINT 'Tabla [sandbox].[Alertas_Descuadre_NAV] creada';
END
GO

-- ============================================================================
-- TABLA: sandbox.Alertas_Extract_Faltante
-- Registra cuando un extract requerido no tiene datos
-- ============================================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables t
               INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
               WHERE s.name = 'sandbox' AND t.name = 'Alertas_Extract_Faltante')
BEGIN
    CREATE TABLE [sandbox].[Alertas_Extract_Faltante] (
        ID BIGINT IDENTITY(1,1) PRIMARY KEY,
        ID_Ejecucion BIGINT NOT NULL,
        ID_Fund INT NOT NULL,
        FechaReporte NVARCHAR(10) NOT NULL,
        TipoReporte NVARCHAR(50) NOT NULL,  -- 'IPA', 'CAPM', 'SONA', 'PNL', 'Derivados', 'PosModRF'
        Obligatorio BIT NOT NULL DEFAULT 1,
        FechaProceso DATETIME NOT NULL DEFAULT GETDATE(),
        -- Indices
        INDEX IX_Alertas_Extract_Faltante_Fecha (FechaReporte, ID_Fund),
        INDEX IX_Alertas_Extract_Faltante_Tipo (TipoReporte, FechaReporte),
        -- Constraint UNIQUE para evitar duplicados en re-ejecuciones
        CONSTRAINT UQ_Alertas_Extract_Faltante UNIQUE (ID_Ejecucion, ID_Fund, FechaReporte, TipoReporte)
    );
    PRINT 'Tabla [sandbox].[Alertas_Extract_Faltante] creada';
END
GO

-- ============================================================================
-- TABLA: sandbox.Alertas_Suciedades_IPA
-- Posiciones con Qty casi cero que se excluyen del procesamiento
-- ============================================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables t
               INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
               WHERE s.name = 'sandbox' AND t.name = 'Alertas_Suciedades_IPA')
BEGIN
    CREATE TABLE [sandbox].[Alertas_Suciedades_IPA] (
        ID BIGINT IDENTITY(1,1) PRIMARY KEY,
        ID_Ejecucion BIGINT NOT NULL,
        ID_Fund INT NOT NULL,
        FechaReporte NVARCHAR(10) NOT NULL,
        InvestID NVARCHAR(255) NOT NULL,
        InvestDescription NVARCHAR(500) NULL,
        Qty DECIMAL(18,6) NULL,
        MVBook DECIMAL(18,4) NULL,
        AI DECIMAL(18,4) NULL,
        FechaProceso DATETIME NOT NULL DEFAULT GETDATE(),
        -- Indices
        INDEX IX_Alertas_Suciedades_IPA_Fecha (FechaReporte, ID_Fund),
        -- Constraint UNIQUE para evitar duplicados en re-ejecuciones
        CONSTRAINT UQ_Alertas_Suciedades_IPA UNIQUE (ID_Ejecucion, ID_Fund, FechaReporte, InvestID)
    );
    PRINT 'Tabla [sandbox].[Alertas_Suciedades_IPA] creada';
END
GO

PRINT '========================================';
PRINT 'SANDBOX TABLES - CREACION COMPLETADA';
PRINT '========================================';
GO
