-- =============================================
-- Migration 019: Add ID_Fund to extract.* tables
-- Purpose: Enable per-fund isolation in extraction phase
-- Phase: 2 - Parametrización de Tablas Extract.*
-- =============================================
SET NOCOUNT ON;
GO

PRINT 'Starting Migration 019: Adding ID_Fund to extract.* tables';
GO

-- =============================================
-- 1. Add ID_Fund to 6 main extract tables
-- =============================================

PRINT 'Adding ID_Fund to extract.IPA...';
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'extract'
      AND TABLE_NAME = 'IPA'
      AND COLUMN_NAME = 'ID_Fund'
)
BEGIN
    ALTER TABLE extract.IPA ADD ID_Fund INT NULL;
    PRINT '  ✓ ID_Fund added to extract.IPA';
END
ELSE
    PRINT '  - ID_Fund already exists in extract.IPA (skipped)';
GO

PRINT 'Adding ID_Fund to extract.CAPM...';
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'extract'
      AND TABLE_NAME = 'CAPM'
      AND COLUMN_NAME = 'ID_Fund'
)
BEGIN
    ALTER TABLE extract.CAPM ADD ID_Fund INT NULL;
    PRINT '  ✓ ID_Fund added to extract.CAPM';
END
ELSE
    PRINT '  - ID_Fund already exists in extract.CAPM (skipped)';
GO

PRINT 'Adding ID_Fund to extract.Derivados...';
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'extract'
      AND TABLE_NAME = 'Derivados'
      AND COLUMN_NAME = 'ID_Fund'
)
BEGIN
    ALTER TABLE extract.Derivados ADD ID_Fund INT NULL;
    PRINT '  ✓ ID_Fund added to extract.Derivados';
END
ELSE
    PRINT '  - ID_Fund already exists in extract.Derivados (skipped)';
GO

PRINT 'Adding ID_Fund to extract.PosModRF...';
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'extract'
      AND TABLE_NAME = 'PosModRF'
      AND COLUMN_NAME = 'ID_Fund'
)
BEGIN
    ALTER TABLE extract.PosModRF ADD ID_Fund INT NULL;
    PRINT '  ✓ ID_Fund added to extract.PosModRF';
END
ELSE
    PRINT '  - ID_Fund already exists in extract.PosModRF (skipped)';
GO

PRINT 'Adding ID_Fund to extract.SONA...';
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'extract'
      AND TABLE_NAME = 'SONA'
      AND COLUMN_NAME = 'ID_Fund'
)
BEGIN
    ALTER TABLE extract.SONA ADD ID_Fund INT NULL;
    PRINT '  ✓ ID_Fund added to extract.SONA';
END
ELSE
    PRINT '  - ID_Fund already exists in extract.SONA (skipped)';
GO

PRINT 'Adding ID_Fund to extract.UBS...';
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'extract'
      AND TABLE_NAME = 'UBS'
      AND COLUMN_NAME = 'ID_Fund'
)
BEGIN
    ALTER TABLE extract.UBS ADD ID_Fund INT NULL;
    PRINT '  ✓ ID_Fund added to extract.UBS';
END
ELSE
    PRINT '  - ID_Fund already exists in extract.UBS (skipped)';
GO

-- =============================================
-- 2. Add ID_Ejecucion + ID_Fund to UBS auxiliary tables
-- =============================================

PRINT 'Adding ID_Ejecucion and ID_Fund to extract.UBS_MonedaDerivados...';
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'extract'
      AND TABLE_NAME = 'UBS_MonedaDerivados'
      AND COLUMN_NAME = 'ID_Ejecucion'
)
BEGIN
    ALTER TABLE extract.UBS_MonedaDerivados ADD ID_Ejecucion BIGINT NULL;
    PRINT '  ✓ ID_Ejecucion added to extract.UBS_MonedaDerivados';
END
ELSE
    PRINT '  - ID_Ejecucion already exists in extract.UBS_MonedaDerivados (skipped)';

IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'extract'
      AND TABLE_NAME = 'UBS_MonedaDerivados'
      AND COLUMN_NAME = 'ID_Fund'
)
BEGIN
    ALTER TABLE extract.UBS_MonedaDerivados ADD ID_Fund INT NULL;
    PRINT '  ✓ ID_Fund added to extract.UBS_MonedaDerivados';
END
ELSE
    PRINT '  - ID_Fund already exists in extract.UBS_MonedaDerivados (skipped)';
GO

PRINT 'Adding ID_Ejecucion and ID_Fund to extract.UBS_Patrimonio...';
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'extract'
      AND TABLE_NAME = 'UBS_Patrimonio'
      AND COLUMN_NAME = 'ID_Ejecucion'
)
BEGIN
    ALTER TABLE extract.UBS_Patrimonio ADD ID_Ejecucion BIGINT NULL;
    PRINT '  ✓ ID_Ejecucion added to extract.UBS_Patrimonio';
END
ELSE
    PRINT '  - ID_Ejecucion already exists in extract.UBS_Patrimonio (skipped)';

IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'extract'
      AND TABLE_NAME = 'UBS_Patrimonio'
      AND COLUMN_NAME = 'ID_Fund'
)
BEGIN
    ALTER TABLE extract.UBS_Patrimonio ADD ID_Fund INT NULL;
    PRINT '  ✓ ID_Fund added to extract.UBS_Patrimonio';
END
ELSE
    PRINT '  - ID_Fund already exists in extract.UBS_Patrimonio (skipped)';
GO

-- =============================================
-- 3. Create indexes for new columns
-- =============================================

PRINT 'Creating indexes on ID_Fund columns...';

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_IPA_Fund' AND object_id = OBJECT_ID('extract.IPA'))
BEGIN
    CREATE INDEX IX_IPA_Fund ON extract.IPA(ID_Fund, FechaReporte);
    PRINT '  ✓ Index IX_IPA_Fund created';
END
ELSE
    PRINT '  - Index IX_IPA_Fund already exists (skipped)';

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CAPM_Fund' AND object_id = OBJECT_ID('extract.CAPM'))
BEGIN
    CREATE INDEX IX_CAPM_Fund ON extract.CAPM(ID_Fund, FechaReporte);
    PRINT '  ✓ Index IX_CAPM_Fund created';
END
ELSE
    PRINT '  - Index IX_CAPM_Fund already exists (skipped)';

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Derivados_Fund' AND object_id = OBJECT_ID('extract.Derivados'))
BEGIN
    CREATE INDEX IX_Derivados_Fund ON extract.Derivados(ID_Fund, FechaReporte);
    PRINT '  ✓ Index IX_Derivados_Fund created';
END
ELSE
    PRINT '  - Index IX_Derivados_Fund already exists (skipped)';

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_PosModRF_Fund' AND object_id = OBJECT_ID('extract.PosModRF'))
BEGIN
    CREATE INDEX IX_PosModRF_Fund ON extract.PosModRF(ID_Fund, FechaReporte);
    PRINT '  ✓ Index IX_PosModRF_Fund created';
END
ELSE
    PRINT '  - Index IX_PosModRF_Fund already exists (skipped)';

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_SONA_Fund' AND object_id = OBJECT_ID('extract.SONA'))
BEGIN
    CREATE INDEX IX_SONA_Fund ON extract.SONA(ID_Fund, FechaReporte);
    PRINT '  ✓ Index IX_SONA_Fund created';
END
ELSE
    PRINT '  - Index IX_SONA_Fund already exists (skipped)';

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_UBS_Fund' AND object_id = OBJECT_ID('extract.UBS'))
BEGIN
    CREATE INDEX IX_UBS_Fund ON extract.UBS(ID_Fund, FechaReporte);
    PRINT '  ✓ Index IX_UBS_Fund created';
END
ELSE
    PRINT '  - Index IX_UBS_Fund already exists (skipped)';

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_UBS_MonedaDerivados_Fund' AND object_id = OBJECT_ID('extract.UBS_MonedaDerivados'))
BEGIN
    -- NAVdate is nvarchar(max), cannot be key column - use INCLUDE instead
    CREATE INDEX IX_UBS_MonedaDerivados_Fund ON extract.UBS_MonedaDerivados(ID_Fund, ID_Ejecucion) INCLUDE (NAVdate);
    PRINT '  ✓ Index IX_UBS_MonedaDerivados_Fund created';
END
ELSE
    PRINT '  - Index IX_UBS_MonedaDerivados_Fund already exists (skipped)';

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_UBS_Patrimonio_Fund' AND object_id = OBJECT_ID('extract.UBS_Patrimonio'))
BEGIN
    -- NAVdate is nvarchar(max), cannot be key column - use INCLUDE instead
    CREATE INDEX IX_UBS_Patrimonio_Fund ON extract.UBS_Patrimonio(ID_Fund, ID_Ejecucion) INCLUDE (NAVdate);
    PRINT '  ✓ Index IX_UBS_Patrimonio_Fund created';
END
ELSE
    PRINT '  - Index IX_UBS_Patrimonio_Fund already exists (skipped)';
GO

PRINT '';
PRINT '✓ Migration 019 completed successfully';
PRINT 'Summary:';
PRINT '  - 8 tables modified with ID_Fund column';
PRINT '  - 8 indexes created for efficient querying';
PRINT '  - Ready for per-fund extraction isolation';
GO
