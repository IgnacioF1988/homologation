USE [MonedaHomologacion]
GO

-- ============================================================================
-- CREATE stock.homol_instrumentos
-- Tracking table for homologated instruments
-- Records when an instrument was processed through the homologation flow
-- ============================================================================

-- Create schema if it doesn't exist
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'stock')
BEGIN
    EXEC('CREATE SCHEMA stock');
    PRINT 'Created schema stock';
END
GO

-- Create table if it doesn't exist
IF NOT EXISTS (
    SELECT 1 FROM sys.objects
    WHERE object_id = OBJECT_ID('stock.homol_instrumentos')
    AND type = 'U'
)
BEGIN
    CREATE TABLE [stock].[homol_instrumentos] (
        ID INT IDENTITY(1,1) PRIMARY KEY,
        idInstrumento INT NOT NULL,
        moneda INT NOT NULL,
        nombreFuente NVARCHAR(255) NULL,
        fuente NVARCHAR(50) NULL,
        dateProcessed DATE NOT NULL DEFAULT CAST(GETDATE() AS DATE),

        CONSTRAINT UQ_homol_combo UNIQUE (idInstrumento, moneda, fuente, dateProcessed)
    );

    PRINT 'Created table stock.homol_instrumentos';

    -- Create index for faster lookups
    CREATE NONCLUSTERED INDEX IX_homol_instrumentos_lookup
    ON [stock].[homol_instrumentos] (idInstrumento, moneda);

    PRINT 'Created index IX_homol_instrumentos_lookup';
END
ELSE
BEGIN
    PRINT 'Table stock.homol_instrumentos already exists';
END
GO
