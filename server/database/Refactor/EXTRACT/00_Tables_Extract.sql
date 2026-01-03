/*
================================================================================
EXTRACT SCHEMA - DDL DE TABLAS
================================================================================
Descripcion: Definicion de tablas fisicas para el schema extract.
             Estas tablas almacenan datos extraidos de fuentes externas
             (GD_EG_001, Inteligencia_Producto) para procesamiento del pipeline.

Tablas principales:
  - extract.IPA        : Investment Position Appraisal (Geneva)
  - extract.CAPM       : Cash Appraisal por Moneda (Geneva)
  - extract.Derivados  : Derivados (Inteligencia Producto)
  - extract.PNL        : Profit and Loss (Geneva)
  - extract.SONA       : State of Net Assets (Geneva)
  - extract.PosModRF   : Positions Mod RF (Geneva)

Tablas de override (_1):
  - extract.IPA_1, CAPM_1, etc. : Tablas para correcciones manuales

Autor: Refactorizacion Pipeline IPA
Fecha: 2026-01-02
================================================================================
*/

-- ============================================================================
-- CREAR SCHEMA SI NO EXISTE
-- ============================================================================
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'extract')
BEGIN
    EXEC('CREATE SCHEMA extract');
    PRINT 'Schema [extract] creado';
END
GO

-- ============================================================================
-- TABLA: extract.IPA (Investment Position Appraisal)
-- ============================================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables t
               INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
               WHERE s.name = 'extract' AND t.name = 'IPA')
BEGIN
    CREATE TABLE [extract].[IPA] (
        -- Claves de proceso
        ID_Proceso BIGINT NOT NULL,
        ID_Ejecucion BIGINT NOT NULL,
        ID_Fund INT NOT NULL,

        -- Datos del reporte
        Portfolio NVARCHAR(100) NULL,
        FechaReporte DATE NOT NULL,
        FechaCartera DATE NULL,

        -- Campos de clasificacion
        TotalText NVARCHAR(500) NULL,
        ReportMode NVARCHAR(255) NULL,
        LSDesc NVARCHAR(255) NULL,
        SortKey NVARCHAR(255) NULL,
        LocalCurrency NVARCHAR(255) NULL,

        -- Datos del instrumento
        BasketInvestDesc NVARCHAR(500) NULL,
        InvestDescription NVARCHAR(500) NULL,
        InvestID NVARCHAR(255) NULL,

        -- Valores numericos
        Qty FLOAT NULL,
        LocalPrice FLOAT NULL,
        CostLocal FLOAT NULL,
        CostBook FLOAT NULL,
        UnRealGL FLOAT NULL,
        AI FLOAT NULL,
        MVBook FLOAT NULL,
        PercentInvest FLOAT NULL,
        PercentSign NVARCHAR(255) NULL,

        -- Campos adicionales
        IsSwap BIT NULL,
        BasketInvID NVARCHAR(255) NULL,

        -- Indice para busquedas
        CONSTRAINT PK_Extract_IPA PRIMARY KEY CLUSTERED (ID_Ejecucion, ID_Fund, ID_Proceso, FechaReporte, Portfolio, InvestID)
            WITH (IGNORE_DUP_KEY = ON)
    );

    -- Indices para performance
    CREATE NONCLUSTERED INDEX IX_Extract_IPA_Fecha ON [extract].[IPA] (FechaReporte, Portfolio);
    CREATE NONCLUSTERED INDEX IX_Extract_IPA_Ejecucion ON [extract].[IPA] (ID_Ejecucion, ID_Fund);
    -- Indice optimizado para concurrencia con columnas de cobertura
    CREATE NONCLUSTERED INDEX IX_IPA_Concurrency ON [extract].[IPA] (ID_Ejecucion, ID_Fund, FechaReporte)
        INCLUDE (Portfolio, InvestID, LocalCurrency, MVBook, AI);

    PRINT 'Tabla [extract].[IPA] creada';
END
GO

-- ============================================================================
-- TABLA: extract.IPA_1 (Override para IPA)
-- ============================================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables t
               INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
               WHERE s.name = 'extract' AND t.name = 'IPA_1')
BEGIN
    CREATE TABLE [extract].[IPA_1] (
        IP_IDREG BIGINT PRIMARY KEY IDENTITY(1,1),
        Portfolio NVARCHAR(100) NULL,
        FechaReporte DATE NOT NULL,
        InvestID NVARCHAR(255) NULL,
        LocalCurrency NVARCHAR(255) NULL,
        Qty FLOAT NULL,
        LocalPrice FLOAT NULL,
        CostLocal FLOAT NULL,
        CostBook FLOAT NULL,
        UnRealGL FLOAT NULL,
        AI FLOAT NULL,
        MVBook FLOAT NULL,
        FechaModificacion DATETIME DEFAULT GETDATE()
    );

    CREATE NONCLUSTERED INDEX IX_IPA_1_Fecha ON [extract].[IPA_1] (FechaReporte, Portfolio);
    PRINT 'Tabla [extract].[IPA_1] creada';
END
GO

-- ============================================================================
-- TABLA: extract.CAPM (Cash Appraisal por Moneda)
-- ============================================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables t
               INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
               WHERE s.name = 'extract' AND t.name = 'CAPM')
BEGIN
    CREATE TABLE [extract].[CAPM] (
        -- Claves de proceso
        ID_Proceso BIGINT NOT NULL,
        ID_Ejecucion BIGINT NOT NULL,
        ID_Fund INT NOT NULL,

        -- Datos del reporte
        Portfolio NVARCHAR(100) NULL,
        FechaReporte DATE NOT NULL,
        FechaCartera DATE NULL,

        -- Campos de clasificacion
        TotalText NVARCHAR(500) NULL,
        LSDesc NVARCHAR(500) NULL,

        -- Datos del instrumento
        InvestID NVARCHAR(500) NULL,
        LocalCurrency NVARCHAR(500) NULL,

        -- Valores numericos
        Qty FLOAT NULL,
        FXRate FLOAT NULL,
        CostBook FLOAT NULL,
        MVBook FLOAT NULL,
        UnRealGL FLOAT NULL,
        percentInvest FLOAT NULL,
        percentSign NVARCHAR(10) NULL,
        sumStatement FLOAT NULL,

        -- ID registro origen
        CA_IDREG BIGINT NULL
    );

    CREATE NONCLUSTERED INDEX IX_Extract_CAPM_Fecha ON [extract].[CAPM] (FechaReporte, Portfolio);
    CREATE NONCLUSTERED INDEX IX_Extract_CAPM_Ejecucion ON [extract].[CAPM] (ID_Ejecucion, ID_Fund);
    -- Indice optimizado para concurrencia con columnas de cobertura
    CREATE NONCLUSTERED INDEX IX_CAPM_Concurrency ON [extract].[CAPM] (ID_Ejecucion, ID_Fund, FechaReporte)
        INCLUDE (Portfolio, InvestID, LocalCurrency, MVBook);

    PRINT 'Tabla [extract].[CAPM] creada';
END
GO

-- ============================================================================
-- TABLA: extract.CAPM_1 (Override para CAPM)
-- ============================================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables t
               INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
               WHERE s.name = 'extract' AND t.name = 'CAPM_1')
BEGIN
    CREATE TABLE [extract].[CAPM_1] (
        CA_IDREG BIGINT PRIMARY KEY IDENTITY(1,1),
        Portfolio NVARCHAR(100) NULL,
        FechaReporte DATE NOT NULL,
        InvestID NVARCHAR(500) NULL,
        LocalCurrency NVARCHAR(500) NULL,
        Qty FLOAT NULL,
        FXRate FLOAT NULL,
        CostBook FLOAT NULL,
        MVBook FLOAT NULL,
        UnRealGL FLOAT NULL,
        percentInvest FLOAT NULL,
        FechaModificacion DATETIME DEFAULT GETDATE()
    );

    CREATE NONCLUSTERED INDEX IX_CAPM_1_Fecha ON [extract].[CAPM_1] (FechaReporte, Portfolio);
    PRINT 'Tabla [extract].[CAPM_1] creada';
END
GO

-- ============================================================================
-- TABLA: extract.Derivados
-- ============================================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables t
               INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
               WHERE s.name = 'extract' AND t.name = 'Derivados')
BEGIN
    CREATE TABLE [extract].[Derivados] (
        -- Claves de proceso
        ID_Proceso BIGINT NOT NULL,
        ID_Ejecucion BIGINT NOT NULL,
        ID_Fund INT NOT NULL,

        -- Datos del reporte
        FechaReporte DATE NOT NULL,
        Portfolio NVARCHAR(200) NULL,
        InvestID NVARCHAR(500) NULL,
        Tipo_Derivado NVARCHAR(200) NULL,

        -- Monedas
        Moneda_PLarga NVARCHAR(20) NULL,
        Moneda_PCorta NVARCHAR(20) NULL,

        -- Valores
        Notional_Vig_PLarga_Local FLOAT NULL,
        Notional_Vig_PCorta_Local FLOAT NULL,
        VP_PLarga_Base FLOAT NULL,
        VP_PCorta_Base FLOAT NULL,
        MTM_Sistema FLOAT NULL
    );

    CREATE NONCLUSTERED INDEX IX_Extract_Derivados_Fecha ON [extract].[Derivados] (FechaReporte, Portfolio);
    CREATE NONCLUSTERED INDEX IX_Extract_Derivados_Ejecucion ON [extract].[Derivados] (ID_Ejecucion, ID_Fund);
    -- Indice optimizado para concurrencia con columnas de cobertura
    CREATE NONCLUSTERED INDEX IX_Derivados_Concurrency ON [extract].[Derivados] (ID_Ejecucion, ID_Fund, FechaReporte)
        INCLUDE (Portfolio, InvestID);

    PRINT 'Tabla [extract].[Derivados] creada';
END
GO

-- ============================================================================
-- TABLA: extract.Derivados_1 (Override para Derivados)
-- ============================================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables t
               INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
               WHERE s.name = 'extract' AND t.name = 'Derivados_1')
BEGIN
    CREATE TABLE [extract].[Derivados_1] (
        DV_IDREG BIGINT PRIMARY KEY IDENTITY(1,1),
        FechaReporte DATE NOT NULL,
        Portfolio NVARCHAR(200) NULL,
        InvestID NVARCHAR(500) NULL,
        Tipo_Derivado NVARCHAR(200) NULL,
        Moneda_PLarga NVARCHAR(20) NULL,
        Moneda_PCorta NVARCHAR(20) NULL,
        Notional_Vig_PLarga_Local FLOAT NULL,
        Notional_Vig_PCorta_Local FLOAT NULL,
        VP_PLarga_Base FLOAT NULL,
        VP_PCorta_Base FLOAT NULL,
        MTM_Sistema FLOAT NULL,
        FechaModificacion DATETIME DEFAULT GETDATE()
    );

    CREATE NONCLUSTERED INDEX IX_Derivados_1_Fecha ON [extract].[Derivados_1] (FechaReporte, Portfolio);
    PRINT 'Tabla [extract].[Derivados_1] creada';
END
GO

-- ============================================================================
-- TABLA: extract.PNL (Profit and Loss)
-- ============================================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables t
               INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
               WHERE s.name = 'extract' AND t.name = 'PNL')
BEGIN
    CREATE TABLE [extract].[PNL] (
        -- Claves de proceso
        ID_Proceso BIGINT NOT NULL,
        ID_Ejecucion BIGINT NOT NULL,
        ID_Fund INT NOT NULL,

        -- ID registro
        PL_IDREG BIGINT IDENTITY(1,1) NOT NULL,

        -- Datos del reporte
        Portfolio NVARCHAR(100) NULL,
        FechaReporte DATE NOT NULL,
        FechaCartera DATE NULL,

        -- Clasificacion
        Group1 NVARCHAR(255) NULL,
        Group2 NVARCHAR(255) NULL,
        Symb NVARCHAR(255) NULL,
        Invest NVARCHAR(255) NULL,
        Currency NVARCHAR(50) NULL,

        -- Valores PNL
        PRgain FLOAT NULL,
        PUgain FLOAT NULL,
        FxRgain FLOAT NULL,
        FxUgain FLOAT NULL,
        Income FLOAT NULL,
        TotGL FLOAT NULL,
        PctGL FLOAT NULL,
        BasisPoint FLOAT NULL
    );

    CREATE NONCLUSTERED INDEX IX_Extract_PNL_Fecha ON [extract].[PNL] (FechaReporte, Portfolio);
    CREATE NONCLUSTERED INDEX IX_Extract_PNL_Ejecucion ON [extract].[PNL] (ID_Ejecucion, ID_Fund);
    CREATE NONCLUSTERED INDEX IX_Extract_PNL_Symb ON [extract].[PNL] (Symb, FechaReporte);
    -- Indice optimizado para concurrencia con columnas de cobertura
    CREATE NONCLUSTERED INDEX IX_PNL_Concurrency ON [extract].[PNL] (ID_Ejecucion, ID_Fund, FechaReporte)
        INCLUDE (Portfolio, Symb, Currency);

    PRINT 'Tabla [extract].[PNL] creada';
END
GO

-- ============================================================================
-- TABLA: extract.PNL_1 (Override para PNL)
-- ============================================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables t
               INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
               WHERE s.name = 'extract' AND t.name = 'PNL_1')
BEGIN
    CREATE TABLE [extract].[PNL_1] (
        PL_IDREG BIGINT PRIMARY KEY IDENTITY(1,1),
        Portfolio NVARCHAR(100) NULL,
        FechaReporte DATE NOT NULL,
        FechaCartera DATE NULL,
        Group1 NVARCHAR(255) NULL,
        Symb NVARCHAR(255) NULL,
        PRgain FLOAT NULL,
        PUgain FLOAT NULL,
        FxRgain FLOAT NULL,
        FxUgain FLOAT NULL,
        Income FLOAT NULL,
        TotGL FLOAT NULL,
        PctGL FLOAT NULL,
        BasisPoint FLOAT NULL,
        FechaModificacion DATETIME DEFAULT GETDATE()
    );

    CREATE NONCLUSTERED INDEX IX_PNL_1_Fecha ON [extract].[PNL_1] (FechaReporte, Portfolio);
    PRINT 'Tabla [extract].[PNL_1] creada';
END
GO

-- ============================================================================
-- TABLA: extract.SONA (State of Net Assets)
-- ============================================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables t
               INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
               WHERE s.name = 'extract' AND t.name = 'SONA')
BEGIN
    CREATE TABLE [extract].[SONA] (
        -- Claves de proceso
        ID_Proceso BIGINT NOT NULL,
        ID_Ejecucion BIGINT NOT NULL,
        ID_Fund INT NOT NULL,

        -- Datos del reporte
        Portfolio NVARCHAR(200) NULL,
        FechaReporte DATE NOT NULL,
        FechaCartera DATE NULL,

        -- Clasificacion
        TotalText NVARCHAR(500) NULL,
        Sect NVARCHAR(500) NULL,
        Cat NVARCHAR(500) NULL,
        SubCat NVARCHAR(500) NULL,

        -- Valor
        Bal FLOAT NULL,

        -- Fuente
        Source NVARCHAR(200) NULL,

        -- ID registro origen
        SN_IDREG BIGINT NULL
    );

    CREATE NONCLUSTERED INDEX IX_Extract_SONA_Fecha ON [extract].[SONA] (FechaReporte, Portfolio);
    CREATE NONCLUSTERED INDEX IX_Extract_SONA_Ejecucion ON [extract].[SONA] (ID_Ejecucion, ID_Fund);
    -- Indice optimizado para concurrencia con columnas de cobertura
    CREATE NONCLUSTERED INDEX IX_SONA_Concurrency ON [extract].[SONA] (ID_Ejecucion, ID_Fund, FechaReporte)
        INCLUDE (Portfolio, Bal);

    PRINT 'Tabla [extract].[SONA] creada';
END
GO

-- ============================================================================
-- TABLA: extract.SONA_1 (Override para SONA)
-- ============================================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables t
               INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
               WHERE s.name = 'extract' AND t.name = 'SONA_1')
BEGIN
    CREATE TABLE [extract].[SONA_1] (
        SN_IDREG BIGINT PRIMARY KEY IDENTITY(1,1),
        Portfolio NVARCHAR(200) NULL,
        FechaReporte DATE NOT NULL,
        TotalText NVARCHAR(500) NULL,
        Sect NVARCHAR(500) NULL,
        Cat NVARCHAR(500) NULL,
        SubCat NVARCHAR(500) NULL,
        Bal FLOAT NULL,
        Source NVARCHAR(200) NULL,
        FechaModificacion DATETIME DEFAULT GETDATE()
    );

    CREATE NONCLUSTERED INDEX IX_SONA_1_Fecha ON [extract].[SONA_1] (FechaReporte, Portfolio);
    PRINT 'Tabla [extract].[SONA_1] creada';
END
GO

-- ============================================================================
-- TABLA: extract.PosModRF (Positions Mod RF)
-- ============================================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables t
               INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
               WHERE s.name = 'extract' AND t.name = 'PosModRF')
BEGIN
    CREATE TABLE [extract].[PosModRF] (
        -- Claves de proceso
        ID_Proceso BIGINT NOT NULL,
        ID_Ejecucion BIGINT NOT NULL,
        ID_Fund INT NOT NULL,

        -- Datos del reporte
        Portfolio NVARCHAR(200) NULL,
        FechaReporte DATE NOT NULL,
        FechaCartera DATE NULL,

        -- Datos instrumento
        InvestID NVARCHAR(500) NULL,
        OriginalFace FLOAT NULL,
        Factor FLOAT NULL,
        TotalMkt FLOAT NULL,
        Code NVARCHAR(200) NULL,

        -- ID registro origen
        PM_IDREG BIGINT NULL
    );

    CREATE NONCLUSTERED INDEX IX_Extract_PosModRF_Fecha ON [extract].[PosModRF] (FechaReporte, Portfolio);
    CREATE NONCLUSTERED INDEX IX_Extract_PosModRF_Ejecucion ON [extract].[PosModRF] (ID_Ejecucion, ID_Fund);
    -- Indice optimizado para concurrencia con columnas de cobertura
    CREATE NONCLUSTERED INDEX IX_PosModRF_Concurrency ON [extract].[PosModRF] (ID_Ejecucion, ID_Fund, FechaReporte)
        INCLUDE (InvestID, OriginalFace, Factor);

    PRINT 'Tabla [extract].[PosModRF] creada';
END
GO

-- ============================================================================
-- TABLA: extract.PosModRF_1 (Override para PosModRF)
-- ============================================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables t
               INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
               WHERE s.name = 'extract' AND t.name = 'PosModRF_1')
BEGIN
    CREATE TABLE [extract].[PosModRF_1] (
        PM_IDREG BIGINT PRIMARY KEY IDENTITY(1,1),
        Portfolio NVARCHAR(200) NULL,
        FechaReporte DATE NOT NULL,
        InvestID NVARCHAR(500) NULL,
        OriginalFace FLOAT NULL,
        Factor FLOAT NULL,
        TotalMkt FLOAT NULL,
        Code NVARCHAR(200) NULL,
        FechaModificacion DATETIME DEFAULT GETDATE()
    );

    CREATE NONCLUSTERED INDEX IX_PosModRF_1_Fecha ON [extract].[PosModRF_1] (FechaReporte, Portfolio);
    PRINT 'Tabla [extract].[PosModRF_1] creada';
END
GO

PRINT '========================================';
PRINT 'EXTRACT TABLES - CREACION COMPLETADA';
PRINT '========================================';
GO
