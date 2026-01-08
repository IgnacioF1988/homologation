/*
================================================================================
ESQUEMA: sandbox (TABLAS GLOBALES)
================================================================================
Descripcion: Tablas sandbox globales con estructura N:M para soportar
             ejecuciones paralelas de multiples fondos.

Arquitectura:
  - Tablas principales: Un registro unico por (Item + Source)
  - Tablas de relacion: Vinculo con fondos que detectaron el item
  - Estado: 'Pendiente' (default) o 'Ok' (resuelto)
  - Auditoria: Usuario y FechaOk cuando se marca como resuelto

Tablas Globales (sin ID_Ejecucion):
  - Homologacion_Instrumentos + _Fondos
  - Homologacion_Monedas + _Fondos
  - Homologacion_Fondos + _Fondos (fondos sin homologar)
  - Alertas_Suciedades_IPA + _Fondos

Tablas Por Ejecucion (mantienen ID_Ejecucion):
  - Alertas_Descuadre_Cash
  - Alertas_Descuadre_Derivados
  - Alertas_Descuadre_NAV
  - Alertas_Extract_Faltante

Autor: Refactorizacion Pipeline IPA
Fecha: 2026-01-05
================================================================================
*/

-- ============================================================================
-- CREAR ESQUEMA (si no existe)
-- ============================================================================
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'sandbox')
BEGIN
    EXEC('CREATE SCHEMA sandbox');
    PRINT 'Esquema [sandbox] creado';
END
GO

-- ============================================================================
-- LIMPIAR TABLAS EXISTENTES (para recrear con nueva estructura)
-- ============================================================================
PRINT '========================================'
PRINT 'RECREANDO TABLAS SANDBOX GLOBALES'
PRINT '========================================'

-- Eliminar vistas primero (dependen de las tablas)
IF OBJECT_ID('sandbox.vw_Homologacion_Instrumentos_Pendientes', 'V') IS NOT NULL
    DROP VIEW sandbox.vw_Homologacion_Instrumentos_Pendientes;
IF OBJECT_ID('sandbox.vw_Homologacion_Monedas_Pendientes', 'V') IS NOT NULL
    DROP VIEW sandbox.vw_Homologacion_Monedas_Pendientes;
IF OBJECT_ID('sandbox.vw_Homologacion_Fondos_Pendientes', 'V') IS NOT NULL
    DROP VIEW sandbox.vw_Homologacion_Fondos_Pendientes;
IF OBJECT_ID('sandbox.vw_Suciedades_Pendientes', 'V') IS NOT NULL
    DROP VIEW sandbox.vw_Suciedades_Pendientes;
IF OBJECT_ID('sandbox.vw_Pendientes_Por_Fondo', 'V') IS NOT NULL
    DROP VIEW sandbox.vw_Pendientes_Por_Fondo;
IF OBJECT_ID('sandbox.vw_Detalle_Pendientes_Por_Fondo', 'V') IS NOT NULL
    DROP VIEW sandbox.vw_Detalle_Pendientes_Por_Fondo;
GO

-- Eliminar tablas de relacion primero (FK)
IF OBJECT_ID('sandbox.Homologacion_Instrumentos_Fondos', 'U') IS NOT NULL
    DROP TABLE sandbox.Homologacion_Instrumentos_Fondos;
IF OBJECT_ID('sandbox.Homologacion_Monedas_Fondos', 'U') IS NOT NULL
    DROP TABLE sandbox.Homologacion_Monedas_Fondos;
IF OBJECT_ID('sandbox.Homologacion_Fondos_Fondos', 'U') IS NOT NULL
    DROP TABLE sandbox.Homologacion_Fondos_Fondos;
IF OBJECT_ID('sandbox.Alertas_Suciedades_IPA_Fondos', 'U') IS NOT NULL
    DROP TABLE sandbox.Alertas_Suciedades_IPA_Fondos;
GO

-- Eliminar tablas principales
IF OBJECT_ID('sandbox.Homologacion_Instrumentos', 'U') IS NOT NULL
    DROP TABLE sandbox.Homologacion_Instrumentos;
IF OBJECT_ID('sandbox.Homologacion_Monedas', 'U') IS NOT NULL
    DROP TABLE sandbox.Homologacion_Monedas;
IF OBJECT_ID('sandbox.Homologacion_Fondos', 'U') IS NOT NULL
    DROP TABLE sandbox.Homologacion_Fondos;
IF OBJECT_ID('sandbox.Alertas_Suciedades_IPA', 'U') IS NOT NULL
    DROP TABLE sandbox.Alertas_Suciedades_IPA;
GO

-- ============================================================================
-- TABLA: sandbox.Homologacion_Instrumentos
-- Un registro unico por (Instrumento + Source)
-- ============================================================================
CREATE TABLE sandbox.Homologacion_Instrumentos (
    ID BIGINT IDENTITY(1,1) PRIMARY KEY,
    Instrumento NVARCHAR(100) COLLATE Latin1_General_CS_AS NOT NULL,
    Source NVARCHAR(50) COLLATE Latin1_General_CS_AS NOT NULL,  -- GENEVA, DERIVADOS
    Currency NVARCHAR(50) NULL,             -- Contexto adicional
    FechaDeteccion DATETIME NOT NULL DEFAULT GETDATE(),
    Estado NVARCHAR(20) NOT NULL DEFAULT 'Pendiente',  -- Pendiente, Ok
    Usuario NVARCHAR(100) NULL,             -- Quien marco Ok
    FechaOk DATETIME NULL,                  -- Cuando se marco Ok

    CONSTRAINT UQ_Homol_Instrumentos UNIQUE (Instrumento, Source),
    CONSTRAINT CK_Homol_Instr_Estado CHECK (Estado IN ('Pendiente', 'Ok'))
);

CREATE NONCLUSTERED INDEX IX_Homol_Instr_Estado
ON sandbox.Homologacion_Instrumentos (Estado)
INCLUDE (Instrumento, Source);

PRINT 'Tabla [sandbox].[Homologacion_Instrumentos] creada';
GO

-- ============================================================================
-- TABLA: sandbox.Homologacion_Instrumentos_Fondos
-- Relacion N:M - que fondos necesitan cada instrumento
-- ============================================================================
CREATE TABLE sandbox.Homologacion_Instrumentos_Fondos (
    ID BIGINT IDENTITY(1,1) PRIMARY KEY,
    ID_Homologacion BIGINT NOT NULL,
    ID_Fund INT NOT NULL,
    FechaPrimeraDeteccion DATETIME NOT NULL DEFAULT GETDATE(),

    CONSTRAINT FK_Homol_Instr_Fondos FOREIGN KEY (ID_Homologacion)
        REFERENCES sandbox.Homologacion_Instrumentos(ID) ON DELETE CASCADE,
    CONSTRAINT UQ_Homol_Instr_Fondos UNIQUE (ID_Homologacion, ID_Fund)
);

CREATE NONCLUSTERED INDEX IX_Homol_Instr_Fondos_Fund
ON sandbox.Homologacion_Instrumentos_Fondos (ID_Fund);

PRINT 'Tabla [sandbox].[Homologacion_Instrumentos_Fondos] creada';
GO

-- ============================================================================
-- TABLA: sandbox.Homologacion_Monedas
-- Un registro unico por (Moneda + Source)
-- ============================================================================
CREATE TABLE sandbox.Homologacion_Monedas (
    ID BIGINT IDENTITY(1,1) PRIMARY KEY,
    Moneda NVARCHAR(50) COLLATE Latin1_General_CS_AS NOT NULL,
    Source NVARCHAR(50) COLLATE Latin1_General_CS_AS NOT NULL,
    FechaDeteccion DATETIME NOT NULL DEFAULT GETDATE(),
    Estado NVARCHAR(20) NOT NULL DEFAULT 'Pendiente',
    Usuario NVARCHAR(100) NULL,
    FechaOk DATETIME NULL,

    CONSTRAINT UQ_Homol_Monedas UNIQUE (Moneda, Source),
    CONSTRAINT CK_Homol_Monedas_Estado CHECK (Estado IN ('Pendiente', 'Ok'))
);

CREATE NONCLUSTERED INDEX IX_Homol_Monedas_Estado
ON sandbox.Homologacion_Monedas (Estado)
INCLUDE (Moneda, Source);

PRINT 'Tabla [sandbox].[Homologacion_Monedas] creada';
GO

-- ============================================================================
-- TABLA: sandbox.Homologacion_Monedas_Fondos
-- Relacion N:M - que fondos necesitan cada moneda
-- ============================================================================
CREATE TABLE sandbox.Homologacion_Monedas_Fondos (
    ID BIGINT IDENTITY(1,1) PRIMARY KEY,
    ID_Homologacion BIGINT NOT NULL,
    ID_Fund INT NOT NULL,
    FechaPrimeraDeteccion DATETIME NOT NULL DEFAULT GETDATE(),

    CONSTRAINT FK_Homol_Monedas_Fondos FOREIGN KEY (ID_Homologacion)
        REFERENCES sandbox.Homologacion_Monedas(ID) ON DELETE CASCADE,
    CONSTRAINT UQ_Homol_Monedas_Fondos UNIQUE (ID_Homologacion, ID_Fund)
);

CREATE NONCLUSTERED INDEX IX_Homol_Monedas_Fondos_Fund
ON sandbox.Homologacion_Monedas_Fondos (ID_Fund);

PRINT 'Tabla [sandbox].[Homologacion_Monedas_Fondos] creada';
GO

-- ============================================================================
-- TABLA: sandbox.Homologacion_Fondos
-- Un registro unico por (NombreFondo + Source)
-- Nota: "Fondos" aqui son portfolios Geneva sin homologar en BD_Funds
-- ============================================================================
CREATE TABLE sandbox.Homologacion_Fondos (
    ID BIGINT IDENTITY(1,1) PRIMARY KEY,
    NombreFondo NVARCHAR(100) COLLATE Latin1_General_CS_AS NOT NULL,  -- Portfolio Geneva sin homologar
    Source NVARCHAR(50) COLLATE Latin1_General_CS_AS NOT NULL,
    FechaDeteccion DATETIME NOT NULL DEFAULT GETDATE(),
    Estado NVARCHAR(20) NOT NULL DEFAULT 'Pendiente',
    Usuario NVARCHAR(100) NULL,
    FechaOk DATETIME NULL,

    CONSTRAINT UQ_Homol_Fondos UNIQUE (NombreFondo, Source),
    CONSTRAINT CK_Homol_Fondos_Estado CHECK (Estado IN ('Pendiente', 'Ok'))
);

CREATE NONCLUSTERED INDEX IX_Homol_Fondos_Estado
ON sandbox.Homologacion_Fondos (Estado)
INCLUDE (NombreFondo, Source);

PRINT 'Tabla [sandbox].[Homologacion_Fondos] creada';
GO

-- ============================================================================
-- TABLA: sandbox.Homologacion_Fondos_Fondos
-- Relacion N:M - desde que ID_Fund se detecto el fondo sin homologar
-- (En este caso, el ID_Fund es el fondo que estaba procesando cuando se detecto)
-- ============================================================================
CREATE TABLE sandbox.Homologacion_Fondos_Fondos (
    ID BIGINT IDENTITY(1,1) PRIMARY KEY,
    ID_Homologacion BIGINT NOT NULL,
    ID_Fund INT NOT NULL,                   -- Fondo que estaba en ejecucion
    FechaPrimeraDeteccion DATETIME NOT NULL DEFAULT GETDATE(),

    CONSTRAINT FK_Homol_Fondos_Fondos FOREIGN KEY (ID_Homologacion)
        REFERENCES sandbox.Homologacion_Fondos(ID) ON DELETE CASCADE,
    CONSTRAINT UQ_Homol_Fondos_Fondos UNIQUE (ID_Homologacion, ID_Fund)
);

CREATE NONCLUSTERED INDEX IX_Homol_Fondos_Fondos_Fund
ON sandbox.Homologacion_Fondos_Fondos (ID_Fund);

PRINT 'Tabla [sandbox].[Homologacion_Fondos_Fondos] creada';
GO

-- ============================================================================
-- TABLA: sandbox.Alertas_Suciedades_IPA
-- Un registro unico por (InvestID + Qty + MVBook)
-- Suciedades: posiciones con Qty casi cero pero con valor residual
-- ============================================================================
CREATE TABLE sandbox.Alertas_Suciedades_IPA (
    ID BIGINT IDENTITY(1,1) PRIMARY KEY,
    InvestID NVARCHAR(100) COLLATE Latin1_General_CS_AS NOT NULL,
    InvestDescription NVARCHAR(500) NULL,
    Qty DECIMAL(28,10) NULL,
    MVBook DECIMAL(28,10) NULL,
    AI DECIMAL(28,10) NULL,
    FechaDeteccion DATETIME NOT NULL DEFAULT GETDATE(),
    Estado NVARCHAR(20) NOT NULL DEFAULT 'Pendiente',
    Usuario NVARCHAR(100) NULL,
    FechaOk DATETIME NULL,

    -- Unique por la combinacion que identifica la suciedad especifica
    CONSTRAINT UQ_Suciedades UNIQUE (InvestID, Qty, MVBook),
    CONSTRAINT CK_Suciedades_Estado CHECK (Estado IN ('Pendiente', 'Ok'))
);

CREATE NONCLUSTERED INDEX IX_Suciedades_Estado
ON sandbox.Alertas_Suciedades_IPA (Estado)
INCLUDE (InvestID);

PRINT 'Tabla [sandbox].[Alertas_Suciedades_IPA] creada';
GO

-- ============================================================================
-- TABLA: sandbox.Alertas_Suciedades_IPA_Fondos
-- Relacion N:M - que fondos tienen esta suciedad
-- ============================================================================
CREATE TABLE sandbox.Alertas_Suciedades_IPA_Fondos (
    ID BIGINT IDENTITY(1,1) PRIMARY KEY,
    ID_Suciedad BIGINT NOT NULL,
    ID_Fund INT NOT NULL,
    FechaPrimeraDeteccion DATETIME NOT NULL DEFAULT GETDATE(),

    CONSTRAINT FK_Suciedades_Fondos FOREIGN KEY (ID_Suciedad)
        REFERENCES sandbox.Alertas_Suciedades_IPA(ID) ON DELETE CASCADE,
    CONSTRAINT UQ_Suciedades_Fondos UNIQUE (ID_Suciedad, ID_Fund)
);

CREATE NONCLUSTERED INDEX IX_Suciedades_Fondos_Fund
ON sandbox.Alertas_Suciedades_IPA_Fondos (ID_Fund);

PRINT 'Tabla [sandbox].[Alertas_Suciedades_IPA_Fondos] creada';
GO

-- ============================================================================
-- VERIFICACION
-- ============================================================================
PRINT '';
PRINT '========================================'
PRINT 'TABLAS SANDBOX GLOBALES CREADAS'
PRINT '========================================'

SELECT
    t.name AS Tabla,
    (SELECT COUNT(*) FROM sys.columns c WHERE c.object_id = t.object_id) AS Columnas,
    (SELECT COUNT(*) FROM sys.indexes i WHERE i.object_id = t.object_id AND i.is_primary_key = 0) AS Indices
FROM sys.tables t
INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
WHERE s.name = 'sandbox'
  AND t.name IN (
    'Homologacion_Instrumentos', 'Homologacion_Instrumentos_Fondos',
    'Homologacion_Monedas', 'Homologacion_Monedas_Fondos',
    'Homologacion_Fondos', 'Homologacion_Fondos_Fondos',
    'Alertas_Suciedades_IPA', 'Alertas_Suciedades_IPA_Fondos'
  )
ORDER BY t.name;
GO
