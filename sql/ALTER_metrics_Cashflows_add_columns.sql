USE [MonedaHomologacion]
GO

-- ============================================================================
-- ALTER metrics.Cashflows - Add yas_yld_flag and override columns
-- For tracking which yield flag was used when calculating cashflows
-- ============================================================================

-- Add yas_yld_flag column if it doesn't exist
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('metrics.Cashflows')
    AND name = 'yas_yld_flag'
)
BEGIN
    ALTER TABLE metrics.Cashflows
    ADD yas_yld_flag NVARCHAR(10) NULL;
    PRINT 'Added column yas_yld_flag to metrics.Cashflows';
END
ELSE
BEGIN
    PRINT 'Column yas_yld_flag already exists in metrics.Cashflows';
END
GO

-- Add override column if it doesn't exist
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('metrics.Cashflows')
    AND name = 'override'
)
BEGIN
    ALTER TABLE metrics.Cashflows
    ADD override NVARCHAR(5) NULL;  -- 'True' or 'False'
    PRINT 'Added column override to metrics.Cashflows';
END
ELSE
BEGIN
    PRINT 'Column override already exists in metrics.Cashflows';
END
GO
