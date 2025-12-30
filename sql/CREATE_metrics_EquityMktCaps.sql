USE [MonedaHomologacion]
GO

-- ============================================================================
-- metrics.EquityMktCaps
-- Stores historical market cap data fetched from Bloomberg via BDH
-- ============================================================================

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'metrics')
BEGIN
    EXEC('CREATE SCHEMA metrics');
END
GO

IF OBJECT_ID('metrics.EquityMktCaps', 'U') IS NOT NULL
BEGIN
    PRINT 'Table metrics.EquityMktCaps already exists. Skipping creation.';
END
ELSE
BEGIN
    CREATE TABLE metrics.EquityMktCaps (
        id BIGINT IDENTITY(1,1) PRIMARY KEY,
        pk2 NVARCHAR(50) NOT NULL,              -- idInstrumento-subId format
        ticker_bbg NVARCHAR(100),               -- Bloomberg ticker (e.g., 'AAPL US Equity')
        trade_date DATE NOT NULL,               -- Date of market cap observation
        market_cap_usd DECIMAL(20,2),           -- Market cap value in USD
        fetched_at DATETIME DEFAULT GETDATE(), -- When this data was fetched
        job_id BIGINT,                          -- Reference to the BBG job
        CONSTRAINT FK_EquityMktCaps_Job FOREIGN KEY (job_id)
            REFERENCES sandbox.rescatar_flujos_bbg(id)
    );

    CREATE NONCLUSTERED INDEX IX_EquityMktCaps_pk2
    ON metrics.EquityMktCaps(pk2, trade_date DESC)
    INCLUDE (market_cap_usd);

    CREATE NONCLUSTERED INDEX IX_EquityMktCaps_job
    ON metrics.EquityMktCaps(job_id);

    PRINT 'Created table metrics.EquityMktCaps with indexes';
END
GO
