/*
================================================================================
TABLAS DIMENSIONALES - HOMOLOGACION
================================================================================
Descripcion: Tablas maestras para homologacion de fondos, instrumentos y monedas.

IMPORTANTE: NO usar constraints UNIQUE en SourceInvestment/Name porque los datos
            de origen pueden tener variaciones de case (ej: "EMTN" vs "eMtN")
            que son tratados como duplicados por SQL Server.

Autor: Refactorizacion Pipeline IPA
Fecha: 2026-01-02
================================================================================
*/

-- ============================================================================
-- SCHEMA
-- ============================================================================
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'dimensionales')
    EXEC('CREATE SCHEMA [dimensionales]');
GO

-- ============================================================================
-- dimensionales.BD_Funds - Catalogo maestro de fondos
-- ============================================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables t
               INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
               WHERE s.name = 'dimensionales' AND t.name = 'BD_Funds')
BEGIN
    CREATE TABLE [dimensionales].[BD_Funds] (
        ID_Fund INT PRIMARY KEY,
        Fund_Name NVARCHAR(200) NOT NULL,
        Fund_Code NVARCHAR(50) NULL,
        id_CURR INT NULL,
        FundType NVARCHAR(50) NULL,
        IsActive BIT NOT NULL DEFAULT 1,
        FechaCreacion DATETIME DEFAULT GETDATE(),
        FechaModificacion DATETIME DEFAULT GETDATE()
    );
    PRINT 'Tabla [dimensionales].[BD_Funds] creada';
END
GO

-- ============================================================================
-- dimensionales.BD_Instrumentos - Catalogo maestro de instrumentos
-- PK compuesta: (ID_Instrumento, SubID_Instrumento)
-- ============================================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables t
               INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
               WHERE s.name = 'dimensionales' AND t.name = 'BD_Instrumentos')
BEGIN
    CREATE TABLE [dimensionales].[BD_Instrumentos] (
        ID_Instrumento INT NOT NULL,
        SubID_Instrumento NVARCHAR(100) NOT NULL,
        Name_Instrumento NVARCHAR(500) NULL,
        ISIN NVARCHAR(50) NULL,
        TickerBBG NVARCHAR(200) NULL,
        Sedol NVARCHAR(50) NULL,
        Cusip NVARCHAR(50) NULL,
        CompanyName NVARCHAR(500) NULL,
        Investment_Type_Code INT NULL,
        Issuer_Type_Code INT NULL,
        Issue_Type_Code INT NULL,
        Coupon_Type_Code INT NULL,
        Sector_GICS BIGINT NULL,
        Sector_Chile_Type_Code INT NULL,
        Issue_Country NVARCHAR(100) NULL,
        Risk_Country NVARCHAR(100) NULL,
        Issue_Currency NVARCHAR(50) NULL,
        Risk_Currency NVARCHAR(50) NULL,
        Rank_Code INT NULL,
        Cash_Type_Code INT NULL,
        Bank_Debt_Type_Code INT NULL,
        Fund_Type_Code INT NULL,
        Yield_Type NVARCHAR(100) NULL,
        Yield_Source NVARCHAR(100) NULL,
        Emision_nacional BIT NULL,
        Comentarios NVARCHAR(1000) NULL,
        PRIMARY KEY (ID_Instrumento, SubID_Instrumento),
        INDEX IX_BD_Instrumentos_ISIN (ISIN),
        INDEX IX_BD_Instrumentos_Ticker (TickerBBG)
    );
    PRINT 'Tabla [dimensionales].[BD_Instrumentos] creada';
END
GO

-- ============================================================================
-- dimensionales.HOMOL_Funds - Homologacion de fondos por fuente
-- ============================================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables t
               INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
               WHERE s.name = 'dimensionales' AND t.name = 'HOMOL_Funds')
BEGIN
    CREATE TABLE [dimensionales].[HOMOL_Funds] (
        HOMOL_Fund_ID INT IDENTITY(1,1) PRIMARY KEY,
        ID_Fund INT NOT NULL,
        Portfolio NVARCHAR(100) NOT NULL,
        Source NVARCHAR(50) NOT NULL,
        IsActive BIT NOT NULL DEFAULT 1,
        FechaCreacion DATETIME DEFAULT GETDATE(),
        -- NO UNIQUE CONSTRAINT - puede haber variaciones de case
        INDEX IX_HOMOL_Funds_Source (Source, Portfolio),
        INDEX IX_HOMOL_Funds_Fund (ID_Fund)
    );
    PRINT 'Tabla [dimensionales].[HOMOL_Funds] creada';
END
GO

-- ============================================================================
-- dimensionales.HOMOL_Instrumentos - Homologacion de instrumentos
-- NOTA: Sin constraint UNIQUE porque origen tiene duplicados con diferente case
-- ============================================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables t
               INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
               WHERE s.name = 'dimensionales' AND t.name = 'HOMOL_Instrumentos')
BEGIN
    CREATE TABLE [dimensionales].[HOMOL_Instrumentos] (
        HOMOL_Instrumento_ID INT IDENTITY(1,1) PRIMARY KEY,
        ID_Instrumento INT NOT NULL,
        SourceInvestment NVARCHAR(255) NOT NULL,
        Source NVARCHAR(50) NOT NULL,
        InstrumentoDesc NVARCHAR(500) NULL,
        TipoInstrumento NVARCHAR(50) NULL,
        IsActive BIT NOT NULL DEFAULT 1,
        FechaCreacion DATETIME DEFAULT GETDATE(),
        -- NO UNIQUE CONSTRAINT aqui - los datos origen tienen duplicados con case diferente
        -- Ejemplo: "ACIAIR 6.875 11/29/32 REGS" vs "ACIAIR 6.875 11/29/32 REGs"
        INDEX IX_HOMOL_Instrumentos_Source (Source, SourceInvestment),
        INDEX IX_HOMOL_Instrumentos_ID (ID_Instrumento)
    );
    PRINT 'Tabla [dimensionales].[HOMOL_Instrumentos] creada';
END
GO

-- ============================================================================
-- dimensionales.HOMOL_Monedas - Homologacion de monedas
-- ============================================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables t
               INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
               WHERE s.name = 'dimensionales' AND t.name = 'HOMOL_Monedas')
BEGIN
    CREATE TABLE [dimensionales].[HOMOL_Monedas] (
        HOMOL_Moneda_ID INT IDENTITY(1,1) PRIMARY KEY,
        id_CURR INT NOT NULL,
        Name NVARCHAR(50) NOT NULL,
        Source NVARCHAR(50) NOT NULL,
        MonedaDesc NVARCHAR(100) NULL,
        IsActive BIT NOT NULL DEFAULT 1,
        FechaCreacion DATETIME DEFAULT GETDATE(),
        -- NO UNIQUE CONSTRAINT - por consistencia con otras tablas
        INDEX IX_HOMOL_Monedas_Source (Source, Name),
        INDEX IX_HOMOL_Monedas_CURR (id_CURR)
    );
    PRINT 'Tabla [dimensionales].[HOMOL_Monedas] creada';
END
GO

-- ============================================================================
-- SCRIPT DE POBLADO DESDE INTELIGENCIA_PRODUCTO_DEV
-- Descomentar y ejecutar para poblar desde origen
-- ============================================================================
/*
-- Poblar BD_Funds
DELETE FROM dimensionales.BD_Funds;
INSERT INTO dimensionales.BD_Funds (ID_Fund, Fund_Name, Fund_Code, id_CURR, FundType, IsActive)
SELECT
    ID_Fund,
    ISNULL(FundName, FundShortName) AS Fund_Name,
    FundShortName AS Fund_Code,
    TRY_CAST(id_CURR AS INT) AS id_CURR,
    Estrategia_Cons_Fondo AS FundType,
    ISNULL(Activo_MantenedorFondos, 1) AS IsActive
FROM INTELIGENCIA_PRODUCTO_DEV.dimensionales.BD_Funds
WHERE ID_Fund IS NOT NULL;

-- Poblar BD_Instrumentos
DELETE FROM dimensionales.BD_Instrumentos;
INSERT INTO dimensionales.BD_Instrumentos (
    ID_Instrumento, SubID_Instrumento, Name_Instrumento, ISIN, TickerBBG,
    Sedol, Cusip, CompanyName, Investment_Type_Code, Issuer_Type_Code,
    Issue_Type_Code, Coupon_Type_Code, Sector_GICS, Sector_Chile_Type_Code,
    Issue_Country, Risk_Country, Issue_Currency, Risk_Currency,
    Rank_Code, Cash_Type_Code, Bank_Debt_Type_Code, Fund_Type_Code,
    Yield_Type, Yield_Source, Emision_nacional, Comentarios
)
SELECT
    TRY_CAST(ID_Instrumento AS INT),
    SubID_Instrumento, Name_Instrumento, ISIN, TickerBBG,
    Sedol, Cusip, CompanyName, Investment_Type_Code, Issuer_Type_Code,
    Issue_Type_Code, Coupon_Type_Code, Sector_GICS, Sector_Chile_Type_Code,
    Issue_Country, Risk_Country, Issue_Currency, Risk_Currency,
    Rank_Code, Cash_Type_Code, Bank_Debt_Type_Code, Fund_Type_Code,
    Yield_Type, Yield_Source, Emision_nacional, Comentarios
FROM INTELIGENCIA_PRODUCTO_DEV.dimensionales.BD_Instrumentos
WHERE TRY_CAST(ID_Instrumento AS INT) IS NOT NULL
  AND SubID_Instrumento IS NOT NULL;

-- Poblar HOMOL_Funds
DELETE FROM dimensionales.HOMOL_Funds;
INSERT INTO dimensionales.HOMOL_Funds (ID_Fund, Portfolio, Source, IsActive)
SELECT ID_Fund, Portfolio, Source, 1
FROM INTELIGENCIA_PRODUCTO_DEV.dimensionales.HOMOL_Funds
WHERE ID_Fund IS NOT NULL AND Portfolio IS NOT NULL;

-- Poblar HOMOL_Instrumentos
DELETE FROM dimensionales.HOMOL_Instrumentos;
INSERT INTO dimensionales.HOMOL_Instrumentos (ID_Instrumento, SourceInvestment, Source, IsActive)
SELECT TRY_CAST(ID_Instrumento AS INT), SourceInvestment, Source, 1
FROM INTELIGENCIA_PRODUCTO_DEV.dimensionales.HOMOL_Instrumentos
WHERE ID_Instrumento IS NOT NULL AND SourceInvestment IS NOT NULL;

-- Poblar HOMOL_Monedas
DELETE FROM dimensionales.HOMOL_Monedas;
INSERT INTO dimensionales.HOMOL_Monedas (id_CURR, Name, Source, IsActive)
SELECT TRY_CAST(id_CURR AS INT), Name, Source, 1
FROM INTELIGENCIA_PRODUCTO_DEV.dimensionales.HOMOL_Monedas
WHERE id_CURR IS NOT NULL AND Name IS NOT NULL;

-- Verificar
SELECT 'BD_Funds' AS Tabla, COUNT(*) AS Registros FROM dimensionales.BD_Funds
UNION ALL SELECT 'BD_Instrumentos', COUNT(*) FROM dimensionales.BD_Instrumentos
UNION ALL SELECT 'HOMOL_Funds', COUNT(*) FROM dimensionales.HOMOL_Funds
UNION ALL SELECT 'HOMOL_Instrumentos', COUNT(*) FROM dimensionales.HOMOL_Instrumentos
UNION ALL SELECT 'HOMOL_Monedas', COUNT(*) FROM dimensionales.HOMOL_Monedas;
*/
GO

PRINT 'Tablas dimensionales creadas correctamente';
GO
