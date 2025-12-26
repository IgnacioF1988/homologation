-- ============================================
-- Test Script: Insert a new BBG job
-- Run this in SSMS against MonedaHomologacion
-- ============================================

-- Option 1: Insert with a specific instrument (update pk2/isin as needed)
INSERT INTO sandbox.rescatar_flujos_bbg (
    instruments_json,
    report_date,
    status,
    created_at,
    instruments_total,
    created_by
)
VALUES (
    '[{"pk2":"30425-1","isin":"USP40070AB35"}]',  -- Update with your instrument
    CAST(GETDATE() AS DATE),                       -- Today's date
    'PENDING',
    GETDATE(),
    1,
    'manual_test'
);

-- Check the inserted job
SELECT TOP 5 *
FROM sandbox.rescatar_flujos_bbg
ORDER BY created_at DESC;


-- ============================================
-- Option 2: Pick a random BBG instrument from Instrumentos table
-- ============================================
/*
DECLARE @pk2 NVARCHAR(50), @isin NVARCHAR(20);

SELECT TOP 1 @pk2 = pk2, @isin = isin
FROM dbo.Instrumentos
WHERE yield_source = 'BBG'
  AND isin IS NOT NULL
  AND LEN(isin) > 0
ORDER BY NEWID();  -- Random selection

PRINT 'Selected instrument: pk2=' + @pk2 + ', isin=' + @isin;

INSERT INTO sandbox.rescatar_flujos_bbg (
    instruments_json,
    report_date,
    status,
    created_at,
    instruments_total,
    created_by
)
VALUES (
    '[{"pk2":"' + @pk2 + '","isin":"' + @isin + '"}]',
    CAST(GETDATE() AS DATE),
    'PENDING',
    GETDATE(),
    1,
    'manual_test'
);

SELECT TOP 5 * FROM sandbox.rescatar_flujos_bbg ORDER BY created_at DESC;
*/
