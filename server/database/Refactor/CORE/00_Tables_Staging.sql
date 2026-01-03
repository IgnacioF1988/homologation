/*
================================================================================
STAGING/CONFIG SCHEMA - DDL DE TABLAS
================================================================================
Descripcion: Tablas de configuracion y logs del pipeline.

Tablas:
  - config.Umbrales_Ajuste : Umbrales por fondo/fuente para ajustes
  - staging.Log_Ajustes    : Auditoria de ajustes generados

Autor: Refactorizacion Pipeline IPA
Fecha: 2026-01-02
================================================================================
*/

-- ============================================================================
-- CREAR SCHEMAS SI NO EXISTEN
-- ============================================================================
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'config')
BEGIN
    EXEC('CREATE SCHEMA config');
    PRINT 'Schema [config] creado';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'staging')
BEGIN
    EXEC('CREATE SCHEMA staging');
    PRINT 'Schema [staging] creado';
END
GO

-- ============================================================================
-- TABLA: config.Umbrales_Ajuste
-- Configuracion de umbrales por fondo y fuente para determinar ajustes
-- ============================================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables t
               INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
               WHERE s.name = 'config' AND t.name = 'Umbrales_Ajuste')
BEGIN
    CREATE TABLE [config].[Umbrales_Ajuste] (
        ID INT IDENTITY(1,1) PRIMARY KEY,
        ID_Fund INT NULL,                    -- NULL = aplica a todos los fondos
        Fuente NVARCHAR(50) NOT NULL,        -- 'CAPM', 'DERIVADOS', 'PARIDADES', 'SONA'
        Umbral DECIMAL(18,4) NOT NULL DEFAULT 1.0,
        FechaVigencia DATE NOT NULL DEFAULT GETDATE(),
        Activo BIT NOT NULL DEFAULT 1,
        FechaCreacion DATETIME NOT NULL DEFAULT GETDATE(),
        -- Constraint para evitar duplicados
        CONSTRAINT UQ_Umbral_Fund_Fuente UNIQUE (ID_Fund, Fuente, FechaVigencia)
    );

    -- Insertar umbrales por defecto
    INSERT INTO [config].[Umbrales_Ajuste] (ID_Fund, Fuente, Umbral)
    VALUES
        (NULL, 'CAPM', 1.0),
        (NULL, 'DERIVADOS', 1.0),
        (NULL, 'PARIDADES', 0.01),
        (NULL, 'SONA', 1.0);

    PRINT 'Tabla [config].[Umbrales_Ajuste] creada con valores por defecto';
END
GO

-- ============================================================================
-- TABLA: staging.Log_Ajustes
-- Auditoria de todos los ajustes creados durante el pipeline
-- ============================================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables t
               INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
               WHERE s.name = 'staging' AND t.name = 'Log_Ajustes')
BEGIN
    CREATE TABLE [staging].[Log_Ajustes] (
        ID BIGINT IDENTITY(1,1) PRIMARY KEY,
        -- Claves de proceso
        ID_Ejecucion BIGINT NOT NULL,
        ID_Proceso BIGINT NOT NULL,
        ID_Fund INT NOT NULL,
        FechaReporte NVARCHAR(10) NOT NULL,
        -- Datos del ajuste
        TipoAjuste NVARCHAR(50) NOT NULL,     -- 'CAPM', 'DERIVADOS', 'PARIDADES', 'SONA'
        PK2 NVARCHAR(50) NOT NULL,
        ID_Instrumento INT NOT NULL,
        id_CURR INT NOT NULL,
        BalanceSheet NVARCHAR(20) NOT NULL,
        Source NVARCHAR(50) NOT NULL,
        -- Valores
        MVBook DECIMAL(18,4) NOT NULL,
        TotalMVal DECIMAL(18,4) NOT NULL,
        TotalMVal_Balance DECIMAL(18,4) NOT NULL,
        -- Auditoria
        ValorOriginal DECIMAL(18,4) NULL,     -- Valor antes del ajuste
        ValorComparado DECIMAL(18,4) NULL,    -- Valor contra el que se comparo
        Diferencia DECIMAL(18,4) NULL,        -- Diferencia calculada
        UmbralAplicado DECIMAL(18,4) NULL,    -- Umbral usado
        FechaProceso DATETIME NOT NULL DEFAULT GETDATE(),
        -- Indices
        INDEX IX_Log_Ajustes_Ejecucion (ID_Ejecucion, ID_Fund),
        INDEX IX_Log_Ajustes_Fecha (FechaReporte, TipoAjuste)
    );
    PRINT 'Tabla [staging].[Log_Ajustes] creada';
END
GO

PRINT '========================================';
PRINT 'STAGING/CONFIG TABLES - CREACION COMPLETADA';
PRINT '========================================';
GO
