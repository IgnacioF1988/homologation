-- =====================================================
-- MIGRATION 012: Create process.CUBO_Final
-- Date: 2025-12-29
-- Description: Crear tabla unificada CUBO_Final que
--              consolida IPA, CAPM, PNL, Derivados, UBS
--              en una sola estructura
-- =====================================================

SET NOCOUNT ON;

PRINT '=== Migration 012: Create process.CUBO_Final ==='
PRINT 'Fecha: ' + CONVERT(VARCHAR, GETDATE(), 120);
PRINT '';

-- =====================================================
-- 1. Crear process.CUBO_Final
-- =====================================================
PRINT '>>> Creando process.CUBO_Final...';

IF OBJECT_ID('process.CUBO_Final', 'U') IS NULL
BEGIN
    CREATE TABLE process.CUBO_Final (
        -- Identificadores
        ID BIGINT IDENTITY(1,1),
        ID_Ejecucion BIGINT NOT NULL,
        ID_Fund INT NOT NULL,
        TipoRegistro VARCHAR(20) NOT NULL,  -- 'IPA', 'CAPM', 'PNL', 'DERIVADOS', 'MLCCII', 'MLCCII_DERIV'

        -- Columnas comunes (todas las tablas)
        PK2 NVARCHAR(MAX) NULL,
        ID_Instrumento NVARCHAR(MAX) NULL,
        id_CURR NVARCHAR(MAX) NULL,
        FechaReporte NVARCHAR(20) NULL,
        FechaCartera NVARCHAR(20) NULL,
        BalanceSheet NVARCHAR(100) NULL,
        Source NVARCHAR(50) NULL,
        LocalPrice FLOAT NULL,
        Qty FLOAT NULL,
        OriginalFace FLOAT NULL,
        Factor FLOAT NULL,
        AI FLOAT NULL,
        MVBook FLOAT NULL,
        TotalMVal FLOAT NULL,
        TotalMVal_Balance FLOAT NULL,
        FechaProceso NVARCHAR(50) NULL,
        ID_Proceso NVARCHAR(50) NULL,

        -- Columnas específicas PNL
        PRgain FLOAT NULL,
        PUgain FLOAT NULL,
        FxRgain FLOAT NULL,
        FxUgain FLOAT NULL,
        Income FLOAT NULL,
        TotGL FLOAT NULL,
        PctGL FLOAT NULL,
        BasisPoint FLOAT NULL,
        FuenteOrigen VARCHAR(20) NULL,
        EsAjuste NVARCHAR(10) NULL,
        NotaConsolidacion VARCHAR(200) NULL,

        -- Constraints
        CONSTRAINT PK_CUBO_Final PRIMARY KEY CLUSTERED (ID)
    );

    -- Índice para consultas por ejecución y fondo
    CREATE NONCLUSTERED INDEX IX_CUBO_Final_Ejecucion
        ON process.CUBO_Final (ID_Ejecucion, ID_Fund, TipoRegistro);

    -- Índice para consultas por tipo de registro
    CREATE NONCLUSTERED INDEX IX_CUBO_Final_TipoRegistro
        ON process.CUBO_Final (TipoRegistro, ID_Ejecucion);

    -- Índice para cleanup por fecha
    CREATE NONCLUSTERED INDEX IX_CUBO_Final_FechaProceso
        ON process.CUBO_Final (FechaProceso);

    PRINT '    CREATED process.CUBO_Final';
    PRINT '    CREATED IX_CUBO_Final_Ejecucion';
    PRINT '    CREATED IX_CUBO_Final_TipoRegistro';
    PRINT '    CREATED IX_CUBO_Final_FechaProceso';
END
ELSE
BEGIN
    PRINT '    process.CUBO_Final already exists - SKIPPED';
END

PRINT '';
PRINT '=== Migration 012 completada ===';
PRINT '';

-- =====================================================
-- Verificación
-- =====================================================
PRINT '>>> Verificación:';

SELECT
    t.TABLE_SCHEMA,
    t.TABLE_NAME,
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS c
     WHERE c.TABLE_SCHEMA = t.TABLE_SCHEMA AND c.TABLE_NAME = t.TABLE_NAME) as ColumnCount
FROM INFORMATION_SCHEMA.TABLES t
WHERE t.TABLE_SCHEMA = 'process' AND t.TABLE_NAME = 'CUBO_Final';

SELECT i.name as IndexName, i.type_desc as IndexType
FROM sys.indexes i
WHERE i.object_id = OBJECT_ID('process.CUBO_Final')
AND i.name IS NOT NULL;
