USE [MonedaHomologacion]
GO

SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO

-- ============================================================================
-- sandbox.sp_Insert_Homol_Instrumento
-- Inserts a record to stock.homol_instrumentos if the combo doesn't exist
-- for the current date
-- ============================================================================
CREATE OR ALTER PROCEDURE [sandbox].[sp_Insert_Homol_Instrumento]
    @idInstrumento INT,
    @moneda INT,
    @nombreFuente NVARCHAR(255) = NULL,
    @fuente NVARCHAR(50) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @today DATE = CAST(GETDATE() AS DATE);

    -- Check if record already exists for today
    IF NOT EXISTS (
        SELECT 1 FROM stock.homol_instrumentos
        WHERE idInstrumento = @idInstrumento
          AND moneda = @moneda
          AND fuente = @fuente
          AND dateProcessed = @today
    )
    BEGIN
        INSERT INTO stock.homol_instrumentos (
            idInstrumento,
            moneda,
            nombreFuente,
            fuente,
            dateProcessed
        )
        VALUES (
            @idInstrumento,
            @moneda,
            @nombreFuente,
            @fuente,
            @today
        );

        SELECT 1 AS inserted;
    END
    ELSE
    BEGIN
        SELECT 0 AS inserted;
    END
END
GO
