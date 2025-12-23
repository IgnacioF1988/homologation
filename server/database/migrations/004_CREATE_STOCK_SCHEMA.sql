-- ============================================
-- Migration 004: CREATE STOCK SCHEMA
-- ============================================
-- Descripción: Crea el schema 'stock' para almacenar registros resueltos
--              de sandbox (suciedades, instrumentos, benchmarks, descuadres)
--
-- Problema: Al migrar legacy → V2, no se creó el schema 'stock'
--           Los registros resueltos en sandbox no tienen destino permanente
--           Resultado: Se vuelven a alertar en cada ejecución
--
-- Solución: Crear schema 'stock' siguiendo patrón de MonedaHomologacion
--           Flujo: sandbox (temporal) → operador resuelve → stock (permanente)
--
-- Fecha: 2025-12-23
-- ============================================

USE [Inteligencia_Producto_Dev];
GO

PRINT '============================================';
PRINT 'MIGRATION 004: CREATE STOCK SCHEMA';
PRINT '============================================';

GO

-- Crear schema stock si no existe
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'stock')
BEGIN
    EXEC('CREATE SCHEMA stock');
    PRINT '✓ Schema stock creado';
END
ELSE
BEGIN
    PRINT '⚠ Schema stock ya existe';
END

GO

-- ============================================
-- Tabla: stock.Suciedades
-- ============================================
-- Almacena combinaciones Portfolio+InvestID+Qty ya clasificadas como CXC/CXP
-- IPA_04 consulta esta tabla PRIMERO para no volver a alertar

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE schema_id = SCHEMA_ID('stock') AND name = 'Suciedades')
BEGIN
    CREATE TABLE stock.Suciedades (
        id INT IDENTITY(1,1) PRIMARY KEY,
        investId NVARCHAR(200) NOT NULL,
        portfolio NVARCHAR(200) NOT NULL,
        qty FLOAT NULL,
        estado NVARCHAR(50) DEFAULT 'Suciedad',
        clasificacion NVARCHAR(10) NULL,  -- 'CXC' o 'CXP'
        fechaConfirmacion DATETIME DEFAULT GETDATE(),
        observaciones NVARCHAR(500) NULL,

        -- Índices para búsqueda rápida
        INDEX IX_Stock_Suciedades_Lookup (portfolio, investId, qty)
    );

    PRINT '✓ Tabla stock.Suciedades creada';
END
ELSE
BEGIN
    PRINT '⚠ Tabla stock.Suciedades ya existe';
END

GO

-- ============================================
-- Tabla: stock.instrumentos
-- ============================================
-- Almacena homologaciones de instrumentos (nombreFuente → idInstrumento)

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE schema_id = SCHEMA_ID('stock') AND name = 'instrumentos')
BEGIN
    CREATE TABLE stock.instrumentos (
        id INT IDENTITY(1,1) PRIMARY KEY,
        idInstrumento INT NOT NULL,
        moneda INT NOT NULL,
        nombreFuente NVARCHAR(200) NULL,
        fuente NVARCHAR(20) NOT NULL,  -- 'IPA', 'SONA', 'CAPM', 'DERIVADOS', 'UBS'
        investmentTypeCode INT NULL,
        nameInstrumento NVARCHAR(200) NULL,
        companyName NVARCHAR(200) NULL,
        issuerTypeCode INT NULL,
        sectorGICS NVARCHAR(20) NULL,
        issueTypeCode INT NULL,
        sectorChileTypeCode INT NULL,
        publicDataSource NVARCHAR(50) NULL,
        isin NVARCHAR(20) NULL,
        tickerBBG NVARCHAR(50) NULL,
        sedol NVARCHAR(20) NULL,
        cusip NVARCHAR(20) NULL,
        issueCountry NVARCHAR(15) NULL,
        riskCountry NVARCHAR(15) NULL,
        issueCurrency INT NULL,
        riskCurrency INT NULL,
        emisionNacional NCHAR(1) NULL,
        couponTypeCode INT NULL,
        yieldType NVARCHAR(10) NULL,
        yieldSource NVARCHAR(20) NULL,
        perpetuidad NCHAR(1) NULL,
        rendimiento NCHAR(1) NULL,
        couponFrequency INT NULL,
        coco NCHAR(1) NULL,
        callable NCHAR(1) NULL,
        sinkable NCHAR(1) NULL,
        yasYldFlag NVARCHAR(10) NULL,
        rankCode INT NULL,
        cashTypeCode INT NULL,
        bankDebtTypeCode INT NULL,
        fundTypeCode INT NULL,
        esReestructuracion NCHAR(1) NULL,
        idPredecesor INT NULL,
        monedaPredecesor INT NULL,
        tipoContinuador INT NULL,
        diaValidez DATE NULL,
        comentarios NVARCHAR(500) NULL,
        fechaCreacion DATETIME DEFAULT GETDATE(),
        fechaModificacion DATETIME NULL,
        usuarioCreacion NVARCHAR(50) NULL,
        usuarioModificacion NVARCHAR(50) NULL,
        Valid_From DATE NOT NULL DEFAULT CAST(GETDATE() AS DATE),
        Valid_To DATE NOT NULL DEFAULT '9999-12-31',
        subId INT NULL,

        -- Índices para búsqueda rápida
        INDEX IX_Stock_Instrumentos_Lookup (nombreFuente, fuente, moneda)
    );

    PRINT '✓ Tabla stock.instrumentos creada';
END
ELSE
BEGIN
    PRINT '⚠ Tabla stock.instrumentos ya existe';
END

GO

-- ============================================
-- Tabla: stock.benchmarks
-- ============================================
-- Almacena homologaciones de benchmarks

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE schema_id = SCHEMA_ID('stock') AND name = 'benchmarks')
BEGIN
    CREATE TABLE stock.benchmarks (
        id INT IDENTITY(1,1) PRIMARY KEY,
        ID_BM NVARCHAR(200) NULL,
        FundShortName NVARCHAR(200) NULL,
        BMName NVARCHAR(200) NULL,
        FundBaseCurrency NVARCHAR(50) NULL,
        NombreTupungato NVARCHAR(200) NULL,
        Estrategia_Comparador NVARCHAR(200) NULL,
        fechaCreacion DATETIME DEFAULT GETDATE(),

        INDEX IX_Stock_Benchmarks_Fund (FundShortName)
    );

    PRINT '✓ Tabla stock.benchmarks creada';
END
ELSE
BEGIN
    PRINT '⚠ Tabla stock.benchmarks ya existe';
END

GO

-- ============================================
-- Tabla: stock.descuadresHistorial
-- ============================================
-- Almacena descuadres aprobados históricamente

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE schema_id = SCHEMA_ID('stock') AND name = 'descuadresHistorial')
BEGIN
    CREATE TABLE stock.descuadresHistorial (
        id INT IDENTITY(1,1) PRIMARY KEY,
        tipoDescuadre NVARCHAR(50) NOT NULL,  -- 'IPA-SONA', 'IPA-CAPM', 'CAPM-CONSOLIDACION', etc.
        portfolio NVARCHAR(200) NOT NULL,
        fechaReporte DATE NOT NULL,
        montoA DECIMAL(18,2) NULL,
        montoB DECIMAL(18,2) NULL,
        diferencia DECIMAL(18,2) NULL,
        estado NVARCHAR(20) DEFAULT 'APROBADO',
        fechaAprobacion DATETIME DEFAULT GETDATE(),
        usuarioAprobacion NVARCHAR(100) NULL,
        observaciones NVARCHAR(500) NULL,

        INDEX IX_Stock_Descuadres_Lookup (portfolio, fechaReporte, tipoDescuadre)
    );

    PRINT '✓ Tabla stock.descuadresHistorial creada';
END
ELSE
BEGIN
    PRINT '⚠ Tabla stock.descuadresHistorial ya existe';
END

GO

-- ============================================
-- Tabla: stock.companias
-- ============================================
-- Almacena información de compañías homologadas

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE schema_id = SCHEMA_ID('stock') AND name = 'companias')
BEGIN
    CREATE TABLE stock.companias (
        id INT IDENTITY(1,1) PRIMARY KEY,
        companyName NVARCHAR(200) NOT NULL,
        companyCode NVARCHAR(50) NULL,
        sector NVARCHAR(100) NULL,
        pais NVARCHAR(50) NULL,
        fechaCreacion DATETIME DEFAULT GETDATE(),
        fechaModificacion DATETIME NULL,

        INDEX IX_Stock_Companias_Name (companyName)
    );

    PRINT '✓ Tabla stock.companias creada';
END
ELSE
BEGIN
    PRINT '⚠ Tabla stock.companias ya existe';
END

GO

PRINT '';
PRINT '✓ Migration 004 COMPLETADA - Schema stock creado con 5 tablas';
PRINT '';
PRINT 'Tablas creadas:';
PRINT '  - stock.Suciedades (Portfolio+InvestID+Qty clasificados)';
PRINT '  - stock.instrumentos (Homologaciones permanentes)';
PRINT '  - stock.benchmarks (Benchmarks homologados)';
PRINT '  - stock.descuadresHistorial (Descuadres aprobados)';
PRINT '  - stock.companias (Compañías homologadas)';
PRINT '';

GO
