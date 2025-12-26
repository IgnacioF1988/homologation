-- =============================================
-- Migration 015: Add ID_Ejecucion to extract.* tables
-- Purpose: Isolate extraction data by individual fund execution
-- Phase: 2 - Parametrización de Tablas Extract
-- =============================================

SET NOCOUNT ON;
GO

PRINT 'Starting Migration 015: Adding ID_Ejecucion to extract.* tables';
GO

-- =============================================
-- Step 1: Add ID_Ejecucion column to 6 critical tables
-- =============================================

PRINT 'Step 1: Adding ID_Ejecucion column to extract.IPA';
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'extract' AND TABLE_NAME = 'IPA' AND COLUMN_NAME = 'ID_Ejecucion'
)
BEGIN
    ALTER TABLE extract.IPA ADD ID_Ejecucion BIGINT NULL;
    PRINT '  ✓ Column ID_Ejecucion added to extract.IPA';
END
ELSE
    PRINT '  - Column ID_Ejecucion already exists in extract.IPA';
GO

PRINT 'Step 2: Adding ID_Ejecucion column to extract.CAPM';
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'extract' AND TABLE_NAME = 'CAPM' AND COLUMN_NAME = 'ID_Ejecucion'
)
BEGIN
    ALTER TABLE extract.CAPM ADD ID_Ejecucion BIGINT NULL;
    PRINT '  ✓ Column ID_Ejecucion added to extract.CAPM';
END
ELSE
    PRINT '  - Column ID_Ejecucion already exists in extract.CAPM';
GO

PRINT 'Step 3: Adding ID_Ejecucion column to extract.PosModRF';
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'extract' AND TABLE_NAME = 'PosModRF' AND COLUMN_NAME = 'ID_Ejecucion'
)
BEGIN
    ALTER TABLE extract.PosModRF ADD ID_Ejecucion BIGINT NULL;
    PRINT '  ✓ Column ID_Ejecucion added to extract.PosModRF';
END
ELSE
    PRINT '  - Column ID_Ejecucion already exists in extract.PosModRF';
GO

PRINT 'Step 4: Adding ID_Ejecucion column to extract.SONA';
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'extract' AND TABLE_NAME = 'SONA' AND COLUMN_NAME = 'ID_Ejecucion'
)
BEGIN
    ALTER TABLE extract.SONA ADD ID_Ejecucion BIGINT NULL;
    PRINT '  ✓ Column ID_Ejecucion added to extract.SONA';
END
ELSE
    PRINT '  - Column ID_Ejecucion already exists in extract.SONA';
GO

PRINT 'Step 5: Adding ID_Ejecucion column to extract.Derivados';
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'extract' AND TABLE_NAME = 'Derivados' AND COLUMN_NAME = 'ID_Ejecucion'
)
BEGIN
    ALTER TABLE extract.Derivados ADD ID_Ejecucion BIGINT NULL;
    PRINT '  ✓ Column ID_Ejecucion added to extract.Derivados';
END
ELSE
    PRINT '  - Column ID_Ejecucion already exists in extract.Derivados';
GO

PRINT 'Step 6: Adding ID_Ejecucion column to extract.UBS';
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'extract' AND TABLE_NAME = 'UBS' AND COLUMN_NAME = 'ID_Ejecucion'
)
BEGIN
    ALTER TABLE extract.UBS ADD ID_Ejecucion BIGINT NULL;
    PRINT '  ✓ Column ID_Ejecucion added to extract.UBS';
END
ELSE
    PRINT '  - Column ID_Ejecucion already exists in extract.UBS';
GO

-- =============================================
-- Step 2: Create indexes for performance
-- =============================================

PRINT 'Step 7: Creating indexes on ID_Ejecucion columns';

-- Index for extract.IPA
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('extract.IPA') AND name = 'IX_IPA_Ejecucion'
)
BEGIN
    CREATE NONCLUSTERED INDEX IX_IPA_Ejecucion
    ON extract.IPA(ID_Ejecucion, Portfolio, FechaReporte)
    INCLUDE (InvestID, Qty, MVBook);
    PRINT '  ✓ Index IX_IPA_Ejecucion created';
END
ELSE
    PRINT '  - Index IX_IPA_Ejecucion already exists';
GO

-- Index for extract.CAPM (Portfolio is NVARCHAR(MAX), use INCLUDE)
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('extract.CAPM') AND name = 'IX_CAPM_Ejecucion'
)
BEGIN
    CREATE NONCLUSTERED INDEX IX_CAPM_Ejecucion
    ON extract.CAPM(ID_Ejecucion, FechaReporte)
    INCLUDE (Portfolio);
    PRINT '  ✓ Index IX_CAPM_Ejecucion created';
END
ELSE
    PRINT '  - Index IX_CAPM_Ejecucion already exists';
GO

-- Index for extract.PosModRF
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('extract.PosModRF') AND name = 'IX_PosModRF_Ejecucion'
)
BEGIN
    CREATE NONCLUSTERED INDEX IX_PosModRF_Ejecucion
    ON extract.PosModRF(ID_Ejecucion, Portfolio, FechaReporte, InvestID);
    PRINT '  ✓ Index IX_PosModRF_Ejecucion created';
END
ELSE
    PRINT '  - Index IX_PosModRF_Ejecucion already exists';
GO

-- Index for extract.SONA (Portfolio is NVARCHAR(MAX), use INCLUDE)
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('extract.SONA') AND name = 'IX_SONA_Ejecucion'
)
BEGIN
    CREATE NONCLUSTERED INDEX IX_SONA_Ejecucion
    ON extract.SONA(ID_Ejecucion, FechaReporte)
    INCLUDE (Portfolio);
    PRINT '  ✓ Index IX_SONA_Ejecucion created';
END
ELSE
    PRINT '  - Index IX_SONA_Ejecucion already exists';
GO

-- Index for extract.Derivados (Portfolio is NVARCHAR(MAX), use INCLUDE)
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('extract.Derivados') AND name = 'IX_Derivados_Ejecucion'
)
BEGIN
    CREATE NONCLUSTERED INDEX IX_Derivados_Ejecucion
    ON extract.Derivados(ID_Ejecucion, FechaReporte)
    INCLUDE (Portfolio);
    PRINT '  ✓ Index IX_Derivados_Ejecucion created';
END
ELSE
    PRINT '  - Index IX_Derivados_Ejecucion already exists';
GO

-- Index for extract.UBS (Portfolio is NVARCHAR(MAX), use INCLUDE)
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('extract.UBS') AND name = 'IX_UBS_Ejecucion'
)
BEGIN
    CREATE NONCLUSTERED INDEX IX_UBS_Ejecucion
    ON extract.UBS(ID_Ejecucion, FechaReporte)
    INCLUDE (Portfolio);
    PRINT '  ✓ Index IX_UBS_Ejecucion created';
END
ELSE
    PRINT '  - Index IX_UBS_Ejecucion already exists';
GO

PRINT '';
PRINT '✅ Migration 015 completed successfully';
PRINT '';
PRINT 'Summary:';
PRINT '  - Added ID_Ejecucion column to 6 extract.* tables';
PRINT '  - Created 6 nonclustered indexes for performance';
PRINT '';
PRINT 'Next steps:';
PRINT '  1. Modify extraction SPs to accept @ID_Ejecucion parameter';
PRINT '  2. Update FundOrchestrator to pass ID_Ejecucion to extraction services';
PRINT '  3. Change extraction from BATCH to per-fund execution';
GO
