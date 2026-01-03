/*
================================================================================
EXTRACT SCHEMA - FUNCIONES COMUNES
================================================================================
Descripcion: Funciones auxiliares para los SPs de extraccion.
             Centralizan logica comun para evitar redundancia.

Funciones:
  - extract.fn_NormalizePortfolio : Normaliza nombres de portfolio
  - extract.fn_IsExcludedPortfolio: Verifica si portfolio esta excluido
  - extract.fn_ValidateParams     : Valida parametros de entrada

Autor: Refactorizacion Pipeline IPA
Fecha: 2026-01-02
================================================================================
*/

-- ============================================================================
-- FUNCION: fn_NormalizePortfolio
-- Normaliza el nombre del portfolio segun reglas de negocio
-- ============================================================================
IF OBJECT_ID('extract.fn_NormalizePortfolio', 'FN') IS NOT NULL
    DROP FUNCTION extract.fn_NormalizePortfolio;
GO

CREATE FUNCTION [extract].[fn_NormalizePortfolio]
(
    @Portfolio NVARCHAR(100)
)
RETURNS NVARCHAR(100)
AS
BEGIN
    RETURN CASE
        WHEN @Portfolio = 'MLCC' THEN 'MLCC_Geneva'
        WHEN @Portfolio = 'MUCC II' THEN 'MLCC_Geneva'
        ELSE @Portfolio
    END;
END
GO

-- ============================================================================
-- FUNCION: fn_IsExcludedPortfolio
-- Verifica si un portfolio debe ser excluido del procesamiento
-- ============================================================================
IF OBJECT_ID('extract.fn_IsExcludedPortfolio', 'FN') IS NOT NULL
    DROP FUNCTION extract.fn_IsExcludedPortfolio;
GO

CREATE FUNCTION [extract].[fn_IsExcludedPortfolio]
(
    @Portfolio NVARCHAR(100)
)
RETURNS BIT
AS
BEGIN
    RETURN CASE
        WHEN @Portfolio IN ('MCCDF', 'Moneda GSI RER') THEN 1
        ELSE 0
    END;
END
GO

-- ============================================================================
-- FUNCION: fn_GetDerivadosPortfolio
-- Obtiene el portfolio equivalente para Derivados (Inteligencia_Producto)
-- ============================================================================
IF OBJECT_ID('extract.fn_GetDerivadosPortfolio', 'FN') IS NOT NULL
    DROP FUNCTION extract.fn_GetDerivadosPortfolio;
GO

CREATE FUNCTION [extract].[fn_GetDerivadosPortfolio]
(
    @Portfolio NVARCHAR(100)
)
RETURNS NVARCHAR(100)
AS
BEGIN
    RETURN CASE
        WHEN @Portfolio = 'MLCC_Geneva' THEN 'MUCC II'
        ELSE @Portfolio
    END;
END
GO

-- ============================================================================
-- PROCEDURE: sp_LogExtract
-- Registra eventos de extraccion (centralizando PRINT statements)
-- ============================================================================
IF OBJECT_ID('extract.sp_LogExtract', 'P') IS NOT NULL
    DROP PROCEDURE extract.sp_LogExtract;
GO

CREATE PROCEDURE [extract].[sp_LogExtract]
    @SPName NVARCHAR(100),
    @Message NVARCHAR(500),
    @MessageType NVARCHAR(20) = 'INFO'  -- INFO, WARNING, ERROR, START, END
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @FullMessage NVARCHAR(600);

    IF @MessageType = 'START'
    BEGIN
        PRINT '========================================';
        PRINT @SPName + ' - INICIO';
        PRINT @Message;
        PRINT '========================================';
    END
    ELSE IF @MessageType = 'END'
    BEGIN
        PRINT '========================================';
        PRINT @SPName + ' - COMPLETADO';
        PRINT @Message;
        PRINT '========================================';
    END
    ELSE IF @MessageType = 'ERROR'
    BEGIN
        PRINT @SPName + ' ERROR: ' + @Message;
    END
    ELSE IF @MessageType = 'WARNING'
    BEGIN
        PRINT 'ADVERTENCIA: ' + @Message;
    END
    ELSE
    BEGIN
        PRINT @Message;
    END
END
GO

-- ============================================================================
-- PROCEDURE: sp_ValidateExtractParams
-- Valida parametros comunes de extraccion
-- Retorna: 0 = OK, -1 = Error
-- ============================================================================
IF OBJECT_ID('extract.sp_ValidateExtractParams', 'P') IS NOT NULL
    DROP PROCEDURE extract.sp_ValidateExtractParams;
GO

CREATE PROCEDURE [extract].[sp_ValidateExtractParams]
    @SPName NVARCHAR(100),
    @FechaReporte NVARCHAR(10),
    @Portfolio NVARCHAR(100) = NULL,
    @RequirePortfolio BIT = 1
AS
BEGIN
    SET NOCOUNT ON;

    -- Validar FechaReporte
    IF @FechaReporte IS NULL OR LEN(@FechaReporte) = 0
    BEGIN
        EXEC extract.sp_LogExtract @SPName, 'Fecha de reporte no puede ser NULL', 'ERROR';
        RETURN 3;  -- ERROR_CRITICO
    END

    IF ISDATE(@FechaReporte) = 0
    BEGIN
        EXEC extract.sp_LogExtract @SPName, 'Formato de fecha invalido. Use YYYY-MM-DD', 'ERROR';
        RETURN 3;  -- ERROR_CRITICO
    END

    -- Validar Portfolio si es requerido
    IF @RequirePortfolio = 1 AND (@Portfolio IS NULL OR LEN(@Portfolio) = 0)
    BEGIN
        EXEC extract.sp_LogExtract @SPName, 'Portfolio no puede ser NULL', 'ERROR';
        RETURN 3;  -- ERROR_CRITICO
    END

    RETURN 0;
END
GO

PRINT 'Funciones comunes de extract creadas';
GO
