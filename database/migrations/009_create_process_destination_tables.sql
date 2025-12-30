-- =====================================================
-- MIGRATION 009: Create Process Destination Tables
-- Date: 2025-12-29
-- Description: Crear tablas destino en process.* para
--              reemplazar staging.* en FASE 2
-- =====================================================

SET NOCOUNT ON;

PRINT '=== Migration 009: Create Process Destination Tables ===';
PRINT 'Fecha: ' + CONVERT(VARCHAR, GETDATE(), 120);
PRINT '';

-- =====================================================
-- Tablas que ya existen en process.*:
--   - process.TBL_IPA (ya existe)
--   - process.TBL_PNL (ya existe)
--   - process.TBL_PNL_IPA (ya existe)
--   - process.TBL_BMS_Exp (ya existe)
-- =====================================================

-- =====================================================
-- 1. Crear process.TBL_CAPM
-- =====================================================
PRINT '>>> Creando process.TBL_CAPM...';

IF OBJECT_ID('process.TBL_CAPM', 'U') IS NULL
BEGIN
    CREATE TABLE process.TBL_CAPM (
        ID BIGINT IDENTITY(1,1) PRIMARY KEY,
        ID_Ejecucion BIGINT NOT NULL,
        ID_Fund BIGINT NOT NULL,
        PK2 VARCHAR(MAX) NOT NULL,
        ID_Instrumento BIGINT NOT NULL,
        id_CURR BIGINT NOT NULL,
        FechaReporte VARCHAR(MAX) NOT NULL,
        FechaCartera VARCHAR(MAX) NOT NULL,
        BalanceSheet VARCHAR(MAX) NOT NULL,
        Source VARCHAR(MAX) NOT NULL,
        LocalPrice FLOAT NULL,
        Qty FLOAT NULL,
        OriginalFace FLOAT NULL,
        Factor FLOAT NULL,
        AI FLOAT NULL,
        MVBook FLOAT NULL,
        TotalMVal FLOAT NULL,
        TotalMVal_Balance FLOAT NULL,
        FechaProceso VARCHAR(MAX) NOT NULL,
        ID_Proceso NVARCHAR(50) NULL
    );

    CREATE NONCLUSTERED INDEX IX_TBL_CAPM_Ejecucion
        ON process.TBL_CAPM (ID_Ejecucion, ID_Fund);

    PRINT '    CREATED process.TBL_CAPM';
END
ELSE
BEGIN
    PRINT '    process.TBL_CAPM already exists - SKIPPED';
END

-- =====================================================
-- 2. Crear process.TBL_Derivados
-- =====================================================
PRINT '>>> Creando process.TBL_Derivados...';

IF OBJECT_ID('process.TBL_Derivados', 'U') IS NULL
BEGIN
    CREATE TABLE process.TBL_Derivados (
        ID BIGINT IDENTITY(1,1) PRIMARY KEY,
        ID_Ejecucion BIGINT NOT NULL,
        ID_Fund INT NOT NULL,
        PK2 VARCHAR(MAX) NULL,
        ID_Instrumento NVARCHAR(MAX) NULL,
        id_CURR NVARCHAR(MAX) NULL,
        FechaReporte VARCHAR(MAX) NULL,
        FechaCartera VARCHAR(MAX) NULL,
        BalanceSheet VARCHAR(MAX) NULL,
        Source VARCHAR(MAX) NULL,
        LocalPrice FLOAT NULL,
        Qty FLOAT NULL,
        OriginalFace FLOAT NULL,
        Factor FLOAT NULL,
        AI FLOAT NULL,
        MVBook FLOAT NULL,
        TotalMVal FLOAT NULL,
        TotalMVal_Balance FLOAT NULL,
        FechaProceso VARCHAR(MAX) NULL,
        ID_Proceso NVARCHAR(50) NULL
    );

    CREATE NONCLUSTERED INDEX IX_TBL_Derivados_Ejecucion
        ON process.TBL_Derivados (ID_Ejecucion, ID_Fund);

    PRINT '    CREATED process.TBL_Derivados';
END
ELSE
BEGIN
    PRINT '    process.TBL_Derivados already exists - SKIPPED';
END

-- =====================================================
-- 3. Crear process.TBL_MLCCII
-- =====================================================
PRINT '>>> Creando process.TBL_MLCCII...';

IF OBJECT_ID('process.TBL_MLCCII', 'U') IS NULL
BEGIN
    CREATE TABLE process.TBL_MLCCII (
        ID BIGINT IDENTITY(1,1) PRIMARY KEY,
        ID_Ejecucion BIGINT NOT NULL,
        ID_Fund INT NOT NULL,
        PK2 NVARCHAR(MAX) NULL,
        ID_Instrumento NVARCHAR(MAX) NULL,
        id_CURR NVARCHAR(MAX) NULL,
        FechaReporte NVARCHAR(MAX) NULL,
        FechaCartera NVARCHAR(MAX) NULL,
        BalanceSheet NVARCHAR(MAX) NULL,
        Source NVARCHAR(MAX) NULL,
        LocalPrice FLOAT NULL,
        Qty FLOAT NULL,
        OriginalFace FLOAT NULL,
        Factor FLOAT NULL,
        AI FLOAT NULL,
        MVBook FLOAT NULL,
        TotalMVal FLOAT NULL,
        TotalMVal_Balance FLOAT NULL,
        FechaProceso NVARCHAR(MAX) NULL,
        ID_Proceso NVARCHAR(50) NULL
    );

    CREATE NONCLUSTERED INDEX IX_TBL_MLCCII_Ejecucion
        ON process.TBL_MLCCII (ID_Ejecucion, ID_Fund);

    PRINT '    CREATED process.TBL_MLCCII';
END
ELSE
BEGIN
    PRINT '    process.TBL_MLCCII already exists - SKIPPED';
END

-- =====================================================
-- 4. Crear process.TBL_MLCCII_Derivados
-- =====================================================
PRINT '>>> Creando process.TBL_MLCCII_Derivados...';

IF OBJECT_ID('process.TBL_MLCCII_Derivados', 'U') IS NULL
BEGIN
    CREATE TABLE process.TBL_MLCCII_Derivados (
        ID BIGINT IDENTITY(1,1) PRIMARY KEY,
        ID_Ejecucion BIGINT NOT NULL,
        ID_Fund INT NOT NULL,
        PK2 NVARCHAR(MAX) NULL,
        ID_Instrumento NVARCHAR(MAX) NULL,
        id_CURR NVARCHAR(MAX) NULL,
        FechaReporte NVARCHAR(MAX) NULL,
        FechaCartera NVARCHAR(MAX) NULL,
        BalanceSheet NVARCHAR(MAX) NULL,
        Source NVARCHAR(MAX) NULL,
        LocalPrice FLOAT NULL,
        Qty FLOAT NULL,
        OriginalFace FLOAT NULL,
        Factor FLOAT NULL,
        AI FLOAT NULL,
        MVBook FLOAT NULL,
        TotalMVal FLOAT NULL,
        TotalMVal_Balance FLOAT NULL,
        FechaProceso NVARCHAR(MAX) NULL,
        ID_Proceso NVARCHAR(50) NULL
    );

    CREATE NONCLUSTERED INDEX IX_TBL_MLCCII_Derivados_Ejecucion
        ON process.TBL_MLCCII_Derivados (ID_Ejecucion, ID_Fund);

    PRINT '    CREATED process.TBL_MLCCII_Derivados';
END
ELSE
BEGIN
    PRINT '    process.TBL_MLCCII_Derivados already exists - SKIPPED';
END

PRINT '';
PRINT '=== Migration 009 completada ===';
PRINT '';

-- =====================================================
-- Resumen de tablas process.TBL_*
-- =====================================================
PRINT '>>> Resumen de tablas process.TBL_*:';

SELECT
    t.TABLE_NAME,
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS c
     WHERE c.TABLE_SCHEMA = t.TABLE_SCHEMA AND c.TABLE_NAME = t.TABLE_NAME) as Columns
FROM INFORMATION_SCHEMA.TABLES t
WHERE t.TABLE_SCHEMA = 'process'
AND t.TABLE_NAME LIKE 'TBL_%'
ORDER BY t.TABLE_NAME;
