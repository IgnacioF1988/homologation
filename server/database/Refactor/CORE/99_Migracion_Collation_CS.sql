/*
================================================================================
MIGRACIÓN: Case Sensitive Collation + PK Natural
================================================================================
Descripción:
  - Limpia duplicados en BD_Instrumentos y HOMOL_Instrumentos
  - Cambia collation a Latin1_General_CS_AS en tablas dimensionales y extract
  - Elimina PK surrogate de HOMOL_Instrumentos
  - Crea PK natural (Source, SourceInvestment) en HOMOL_Instrumentos
  - Optimiza índices

Fecha: 2026-01-07
Autor: Claude Code
================================================================================
*/

SET NOCOUNT ON;
GO

PRINT '════════════════════════════════════════════════════════════════════════════════';
PRINT ' MIGRACIÓN: Case Sensitive Collation + PK Natural';
PRINT ' Inicio: ' + CONVERT(VARCHAR(30), GETDATE(), 120);
PRINT '════════════════════════════════════════════════════════════════════════════════';
GO

-- ╔════════════════════════════════════════════════════════════════════════════════╗
-- ║ FASE 1: LIMPIEZA DE DUPLICADOS                                                  ║
-- ╚════════════════════════════════════════════════════════════════════════════════╝

PRINT '';
PRINT '┌──────────────────────────────────────────────────────────────────────────────┐';
PRINT '│ FASE 1: LIMPIEZA DE DUPLICADOS                                               │';
PRINT '└──────────────────────────────────────────────────────────────────────────────┘';

BEGIN TRANSACTION;
BEGIN TRY

    -- 1.1 Validar que los duplicados existen
    DECLARE @DuplicadosHOMOL INT, @DuplicadosBD INT;

    SELECT @DuplicadosHOMOL = COUNT(*)
    FROM dimensionales.HOMOL_Instrumentos
    WHERE ID_Instrumento IN (154173, 154211, 154184);

    SELECT @DuplicadosBD = COUNT(*)
    FROM dimensionales.BD_Instrumentos
    WHERE ID_Instrumento IN (154173, 154211, 154184);

    PRINT '  Duplicados encontrados en HOMOL_Instrumentos: ' + CAST(@DuplicadosHOMOL AS VARCHAR(10));
    PRINT '  Duplicados encontrados en BD_Instrumentos: ' + CAST(@DuplicadosBD AS VARCHAR(10));

    -- 1.2 Eliminar duplicados en HOMOL_Instrumentos (conservar IDs mayores: 178504, 178503, 178505)
    DELETE FROM dimensionales.HOMOL_Instrumentos
    WHERE ID_Instrumento IN (154173, 154211, 154184);

    PRINT '  [OK] Eliminados ' + CAST(@@ROWCOUNT AS VARCHAR(10)) + ' registros de HOMOL_Instrumentos';

    -- 1.3 Eliminar duplicados en BD_Instrumentos
    DELETE FROM dimensionales.BD_Instrumentos
    WHERE ID_Instrumento IN (154173, 154211, 154184);

    PRINT '  [OK] Eliminados ' + CAST(@@ROWCOUNT AS VARCHAR(10)) + ' registros de BD_Instrumentos';

    -- 1.4 Validar que no quedan duplicados en HOMOL con Case Sensitive
    DECLARE @DuplicadosRestantes INT;
    SELECT @DuplicadosRestantes = COUNT(*)
    FROM (
        SELECT Source COLLATE Latin1_General_CS_AS AS S,
               SourceInvestment COLLATE Latin1_General_CS_AS AS SI
        FROM dimensionales.HOMOL_Instrumentos
        GROUP BY Source COLLATE Latin1_General_CS_AS,
                 SourceInvestment COLLATE Latin1_General_CS_AS
        HAVING COUNT(*) > 1
    ) x;

    IF @DuplicadosRestantes > 0
    BEGIN
        RAISERROR('ERROR: Aún quedan %d duplicados en HOMOL_Instrumentos', 16, 1, @DuplicadosRestantes);
    END

    PRINT '  [OK] Validación: 0 duplicados restantes en HOMOL_Instrumentos';

    COMMIT TRANSACTION;
    PRINT '  [OK] FASE 1 completada exitosamente';

END TRY
BEGIN CATCH
    ROLLBACK TRANSACTION;
    PRINT '  [ERROR] ' + ERROR_MESSAGE();
    THROW;
END CATCH
GO

-- ╔════════════════════════════════════════════════════════════════════════════════╗
-- ║ FASE 2: CAMBIAR COLLATION EN TABLAS EXTRACT                                     ║
-- ╚════════════════════════════════════════════════════════════════════════════════╝

PRINT '';
PRINT '┌──────────────────────────────────────────────────────────────────────────────┐';
PRINT '│ FASE 2: CAMBIAR COLLATION EN TABLAS EXTRACT                                  │';
PRINT '└──────────────────────────────────────────────────────────────────────────────┘';

-- ═══════════════════════════════════════════════════════════════════════════════════
-- 2.1 extract.IPA
-- ═══════════════════════════════════════════════════════════════════════════════════
PRINT '  Procesando extract.IPA...';

DROP INDEX IF EXISTS IX_Extract_IPA_InvestID ON extract.IPA;
DROP INDEX IF EXISTS IX_IPA_Concurrency ON extract.IPA;
DROP INDEX IF EXISTS IX_IPA_Ejecucion_Fund_Fecha ON extract.IPA;
DROP INDEX IF EXISTS IX_Extract_IPA_Fecha ON extract.IPA;

ALTER TABLE extract.IPA ALTER COLUMN InvestID NVARCHAR(255) COLLATE Latin1_General_CS_AS NULL;
ALTER TABLE extract.IPA ALTER COLUMN LocalCurrency NVARCHAR(255) COLLATE Latin1_General_CS_AS NULL;
ALTER TABLE extract.IPA ALTER COLUMN Portfolio NVARCHAR(100) COLLATE Latin1_General_CS_AS NULL;

CREATE NONCLUSTERED INDEX IX_Extract_IPA_InvestID ON extract.IPA (InvestID);
CREATE NONCLUSTERED INDEX IX_IPA_Concurrency ON extract.IPA (InvestID, LocalCurrency, Portfolio);
CREATE NONCLUSTERED INDEX IX_IPA_Ejecucion_Fund_Fecha ON extract.IPA (ID_Ejecucion, ID_Fund, FechaReporte) INCLUDE (InvestID, LocalCurrency, Portfolio);
CREATE NONCLUSTERED INDEX IX_Extract_IPA_Fecha ON extract.IPA (FechaReporte, ID_Fund) INCLUDE (Portfolio);

PRINT '  [OK] extract.IPA';
GO

-- ═══════════════════════════════════════════════════════════════════════════════════
-- 2.2 extract.IPA_1
-- ═══════════════════════════════════════════════════════════════════════════════════
PRINT '  Procesando extract.IPA_1...';

DROP INDEX IF EXISTS IX_IPA_1_Fecha ON extract.IPA_1;

ALTER TABLE extract.IPA_1 ALTER COLUMN InvestID NVARCHAR(255) COLLATE Latin1_General_CS_AS NULL;
ALTER TABLE extract.IPA_1 ALTER COLUMN LocalCurrency NVARCHAR(255) COLLATE Latin1_General_CS_AS NULL;
ALTER TABLE extract.IPA_1 ALTER COLUMN Portfolio NVARCHAR(100) COLLATE Latin1_General_CS_AS NULL;

CREATE NONCLUSTERED INDEX IX_IPA_1_Fecha ON extract.IPA_1 (FechaReporte, ID_Fund) INCLUDE (Portfolio);

PRINT '  [OK] extract.IPA_1';
GO

-- ═══════════════════════════════════════════════════════════════════════════════════
-- 2.3 extract.CAPM
-- ═══════════════════════════════════════════════════════════════════════════════════
PRINT '  Procesando extract.CAPM...';

DROP INDEX IF EXISTS IX_CAPM_Concurrency ON extract.CAPM;
DROP INDEX IF EXISTS IX_CAPM_Ejecucion_Fund_Fecha ON extract.CAPM;
DROP INDEX IF EXISTS IX_Extract_CAPM_Fecha ON extract.CAPM;

ALTER TABLE extract.CAPM ALTER COLUMN InvestID NVARCHAR(500) COLLATE Latin1_General_CS_AS NULL;
ALTER TABLE extract.CAPM ALTER COLUMN LocalCurrency NVARCHAR(500) COLLATE Latin1_General_CS_AS NULL;
ALTER TABLE extract.CAPM ALTER COLUMN Portfolio NVARCHAR(100) COLLATE Latin1_General_CS_AS NULL;

CREATE NONCLUSTERED INDEX IX_CAPM_Concurrency ON extract.CAPM (InvestID, LocalCurrency, Portfolio);
CREATE NONCLUSTERED INDEX IX_CAPM_Ejecucion_Fund_Fecha ON extract.CAPM (ID_Ejecucion, ID_Fund, FechaReporte) INCLUDE (InvestID, LocalCurrency);
CREATE NONCLUSTERED INDEX IX_Extract_CAPM_Fecha ON extract.CAPM (FechaReporte, ID_Fund) INCLUDE (Portfolio);

PRINT '  [OK] extract.CAPM';
GO

-- ═══════════════════════════════════════════════════════════════════════════════════
-- 2.4 extract.CAPM_1
-- ═══════════════════════════════════════════════════════════════════════════════════
PRINT '  Procesando extract.CAPM_1...';

DROP INDEX IF EXISTS IX_CAPM_1_Fecha ON extract.CAPM_1;

ALTER TABLE extract.CAPM_1 ALTER COLUMN InvestID NVARCHAR(500) COLLATE Latin1_General_CS_AS NULL;
ALTER TABLE extract.CAPM_1 ALTER COLUMN LocalCurrency NVARCHAR(500) COLLATE Latin1_General_CS_AS NULL;
ALTER TABLE extract.CAPM_1 ALTER COLUMN Portfolio NVARCHAR(100) COLLATE Latin1_General_CS_AS NULL;

CREATE NONCLUSTERED INDEX IX_CAPM_1_Fecha ON extract.CAPM_1 (FechaReporte, ID_Fund) INCLUDE (Portfolio);

PRINT '  [OK] extract.CAPM_1';
GO

-- ═══════════════════════════════════════════════════════════════════════════════════
-- 2.5 extract.PNL
-- ═══════════════════════════════════════════════════════════════════════════════════
PRINT '  Procesando extract.PNL...';

DROP INDEX IF EXISTS IX_Extract_PNL_Symb ON extract.PNL;
DROP INDEX IF EXISTS IX_PNL_Concurrency ON extract.PNL;
DROP INDEX IF EXISTS IX_PNL_Ejecucion_Fund_Fecha ON extract.PNL;
DROP INDEX IF EXISTS IX_Extract_PNL_Fecha ON extract.PNL;

ALTER TABLE extract.PNL ALTER COLUMN Symb NVARCHAR(255) COLLATE Latin1_General_CS_AS NULL;
ALTER TABLE extract.PNL ALTER COLUMN Currency NVARCHAR(50) COLLATE Latin1_General_CS_AS NULL;
ALTER TABLE extract.PNL ALTER COLUMN Portfolio NVARCHAR(100) COLLATE Latin1_General_CS_AS NULL;

CREATE NONCLUSTERED INDEX IX_Extract_PNL_Symb ON extract.PNL (Symb);
CREATE NONCLUSTERED INDEX IX_PNL_Concurrency ON extract.PNL (Symb, Currency, Portfolio);
CREATE NONCLUSTERED INDEX IX_PNL_Ejecucion_Fund_Fecha ON extract.PNL (ID_Ejecucion, ID_Fund, FechaReporte) INCLUDE (Symb, Currency);
CREATE NONCLUSTERED INDEX IX_Extract_PNL_Fecha ON extract.PNL (FechaReporte, ID_Fund) INCLUDE (Portfolio);

PRINT '  [OK] extract.PNL';
GO

-- ═══════════════════════════════════════════════════════════════════════════════════
-- 2.6 extract.PNL_1
-- ═══════════════════════════════════════════════════════════════════════════════════
PRINT '  Procesando extract.PNL_1...';

DROP INDEX IF EXISTS IX_PNL_1_Fecha ON extract.PNL_1;

ALTER TABLE extract.PNL_1 ALTER COLUMN Symb NVARCHAR(255) COLLATE Latin1_General_CS_AS NULL;
ALTER TABLE extract.PNL_1 ALTER COLUMN Portfolio NVARCHAR(100) COLLATE Latin1_General_CS_AS NULL;

CREATE NONCLUSTERED INDEX IX_PNL_1_Fecha ON extract.PNL_1 (FechaReporte, ID_Fund) INCLUDE (Portfolio);

PRINT '  [OK] extract.PNL_1';
GO

-- ═══════════════════════════════════════════════════════════════════════════════════
-- 2.7 extract.Derivados
-- ═══════════════════════════════════════════════════════════════════════════════════
PRINT '  Procesando extract.Derivados...';

DROP INDEX IF EXISTS IX_Derivados_Concurrency ON extract.Derivados;
DROP INDEX IF EXISTS IX_Derivados_Ejecucion_Fund_Fecha ON extract.Derivados;
DROP INDEX IF EXISTS IX_Extract_Derivados_Fecha ON extract.Derivados;

ALTER TABLE extract.Derivados ALTER COLUMN InvestID NVARCHAR(500) COLLATE Latin1_General_CS_AS NULL;
ALTER TABLE extract.Derivados ALTER COLUMN Portfolio NVARCHAR(200) COLLATE Latin1_General_CS_AS NULL;
ALTER TABLE extract.Derivados ALTER COLUMN Moneda_PLarga NVARCHAR(20) COLLATE Latin1_General_CS_AS NULL;
ALTER TABLE extract.Derivados ALTER COLUMN Moneda_PCorta NVARCHAR(20) COLLATE Latin1_General_CS_AS NULL;

CREATE NONCLUSTERED INDEX IX_Derivados_Concurrency ON extract.Derivados (InvestID, Portfolio);
CREATE NONCLUSTERED INDEX IX_Derivados_Ejecucion_Fund_Fecha ON extract.Derivados (ID_Ejecucion, ID_Fund, FechaReporte) INCLUDE (InvestID, Moneda_PLarga, Moneda_PCorta, Portfolio);
CREATE NONCLUSTERED INDEX IX_Extract_Derivados_Fecha ON extract.Derivados (FechaReporte, ID_Fund) INCLUDE (Portfolio);

PRINT '  [OK] extract.Derivados';
GO

-- ═══════════════════════════════════════════════════════════════════════════════════
-- 2.8 extract.Derivados_1
-- ═══════════════════════════════════════════════════════════════════════════════════
PRINT '  Procesando extract.Derivados_1...';

DROP INDEX IF EXISTS IX_Derivados_1_Fecha ON extract.Derivados_1;

ALTER TABLE extract.Derivados_1 ALTER COLUMN InvestID NVARCHAR(500) COLLATE Latin1_General_CS_AS NULL;
ALTER TABLE extract.Derivados_1 ALTER COLUMN Portfolio NVARCHAR(200) COLLATE Latin1_General_CS_AS NULL;
ALTER TABLE extract.Derivados_1 ALTER COLUMN Moneda_PLarga NVARCHAR(20) COLLATE Latin1_General_CS_AS NULL;
ALTER TABLE extract.Derivados_1 ALTER COLUMN Moneda_PCorta NVARCHAR(20) COLLATE Latin1_General_CS_AS NULL;

CREATE NONCLUSTERED INDEX IX_Derivados_1_Fecha ON extract.Derivados_1 (FechaReporte, ID_Fund) INCLUDE (Portfolio);

PRINT '  [OK] extract.Derivados_1';
GO

-- ═══════════════════════════════════════════════════════════════════════════════════
-- 2.9 extract.PosModRF
-- ═══════════════════════════════════════════════════════════════════════════════════
PRINT '  Procesando extract.PosModRF...';

DROP INDEX IF EXISTS IX_PosModRF_Concurrency ON extract.PosModRF;
DROP INDEX IF EXISTS IX_Extract_PosModRF_Fecha ON extract.PosModRF;

ALTER TABLE extract.PosModRF ALTER COLUMN InvestID NVARCHAR(500) COLLATE Latin1_General_CS_AS NULL;
ALTER TABLE extract.PosModRF ALTER COLUMN Portfolio NVARCHAR(200) COLLATE Latin1_General_CS_AS NULL;

CREATE NONCLUSTERED INDEX IX_PosModRF_Concurrency ON extract.PosModRF (InvestID);
CREATE NONCLUSTERED INDEX IX_Extract_PosModRF_Fecha ON extract.PosModRF (FechaReporte, ID_Fund) INCLUDE (Portfolio);

PRINT '  [OK] extract.PosModRF';
GO

-- ═══════════════════════════════════════════════════════════════════════════════════
-- 2.10 extract.PosModRF_1
-- ═══════════════════════════════════════════════════════════════════════════════════
PRINT '  Procesando extract.PosModRF_1...';

DROP INDEX IF EXISTS IX_PosModRF_1_Fecha ON extract.PosModRF_1;

ALTER TABLE extract.PosModRF_1 ALTER COLUMN InvestID NVARCHAR(500) COLLATE Latin1_General_CS_AS NULL;
ALTER TABLE extract.PosModRF_1 ALTER COLUMN Portfolio NVARCHAR(200) COLLATE Latin1_General_CS_AS NULL;

CREATE NONCLUSTERED INDEX IX_PosModRF_1_Fecha ON extract.PosModRF_1 (FechaReporte, ID_Fund) INCLUDE (Portfolio);

PRINT '  [OK] extract.PosModRF_1';
GO

-- ═══════════════════════════════════════════════════════════════════════════════════
-- 2.11 extract.SONA
-- ═══════════════════════════════════════════════════════════════════════════════════
PRINT '  Procesando extract.SONA...';

DROP INDEX IF EXISTS IX_SONA_Concurrency ON extract.SONA;
DROP INDEX IF EXISTS IX_Extract_SONA_Fecha ON extract.SONA;

ALTER TABLE extract.SONA ALTER COLUMN Portfolio NVARCHAR(200) COLLATE Latin1_General_CS_AS NULL;

CREATE NONCLUSTERED INDEX IX_SONA_Concurrency ON extract.SONA (Portfolio);
CREATE NONCLUSTERED INDEX IX_Extract_SONA_Fecha ON extract.SONA (FechaReporte, ID_Fund) INCLUDE (Portfolio);

PRINT '  [OK] extract.SONA';
GO

-- ═══════════════════════════════════════════════════════════════════════════════════
-- 2.12 extract.SONA_1
-- ═══════════════════════════════════════════════════════════════════════════════════
PRINT '  Procesando extract.SONA_1...';

DROP INDEX IF EXISTS IX_SONA_1_Fecha ON extract.SONA_1;

ALTER TABLE extract.SONA_1 ALTER COLUMN Portfolio NVARCHAR(200) COLLATE Latin1_General_CS_AS NULL;

CREATE NONCLUSTERED INDEX IX_SONA_1_Fecha ON extract.SONA_1 (FechaReporte, ID_Fund) INCLUDE (Portfolio);

PRINT '  [OK] extract.SONA_1';
GO

PRINT '  [OK] FASE 2 completada exitosamente';
GO

-- ╔════════════════════════════════════════════════════════════════════════════════╗
-- ║ FASE 3: REESTRUCTURAR HOMOL_Instrumentos                                        ║
-- ╚════════════════════════════════════════════════════════════════════════════════╝

PRINT '';
PRINT '┌──────────────────────────────────────────────────────────────────────────────┐';
PRINT '│ FASE 3: REESTRUCTURAR HOMOL_Instrumentos                                     │';
PRINT '└──────────────────────────────────────────────────────────────────────────────┘';

BEGIN TRANSACTION;
BEGIN TRY

    -- 3.1 Eliminar índices existentes
    PRINT '  Eliminando índices existentes...';
    DROP INDEX IF EXISTS IX_HOMOL_Instrumentos_Source ON dimensionales.HOMOL_Instrumentos;
    DROP INDEX IF EXISTS IX_HOMOL_Instrumentos_Source_Investment ON dimensionales.HOMOL_Instrumentos;

    -- 3.2 Eliminar PK surrogate
    PRINT '  Eliminando PK surrogate...';

    DECLARE @PKName NVARCHAR(200);
    SELECT @PKName = name
    FROM sys.key_constraints
    WHERE parent_object_id = OBJECT_ID('dimensionales.HOMOL_Instrumentos')
      AND type = 'PK';

    IF @PKName IS NOT NULL
    BEGIN
        EXEC('ALTER TABLE dimensionales.HOMOL_Instrumentos DROP CONSTRAINT ' + @PKName);
        PRINT '  [OK] PK eliminada: ' + @PKName;
    END

    -- 3.3 Eliminar columna HOMOL_Instrumento_ID
    PRINT '  Eliminando columna HOMOL_Instrumento_ID...';
    ALTER TABLE dimensionales.HOMOL_Instrumentos DROP COLUMN HOMOL_Instrumento_ID;

    -- 3.4 Cambiar collation a Case Sensitive
    PRINT '  Cambiando collation a Case Sensitive...';
    ALTER TABLE dimensionales.HOMOL_Instrumentos
    ALTER COLUMN Source NVARCHAR(50) COLLATE Latin1_General_CS_AS NOT NULL;

    ALTER TABLE dimensionales.HOMOL_Instrumentos
    ALTER COLUMN SourceInvestment NVARCHAR(255) COLLATE Latin1_General_CS_AS NOT NULL;

    -- 3.5 Crear PK natural CLUSTERED
    PRINT '  Creando PK natural (Source, SourceInvestment)...';
    ALTER TABLE dimensionales.HOMOL_Instrumentos
    ADD CONSTRAINT PK_HOMOL_Instrumentos
    PRIMARY KEY CLUSTERED (Source, SourceInvestment);

    -- 3.6 Crear índice NC para búsqueda por ID_Instrumento
    PRINT '  Creando índice por ID_Instrumento...';
    CREATE NONCLUSTERED INDEX IX_HOMOL_Instrumentos_ByID
    ON dimensionales.HOMOL_Instrumentos (ID_Instrumento)
    INCLUDE (InstrumentoDesc, TipoInstrumento)
    WHERE IsActive = 1;

    COMMIT TRANSACTION;
    PRINT '  [OK] FASE 3 completada exitosamente';

END TRY
BEGIN CATCH
    ROLLBACK TRANSACTION;
    PRINT '  [ERROR] ' + ERROR_MESSAGE();
    THROW;
END CATCH
GO

-- ╔════════════════════════════════════════════════════════════════════════════════╗
-- ║ FASE 4: OPTIMIZAR BD_Instrumentos                                               ║
-- ╚════════════════════════════════════════════════════════════════════════════════╝

PRINT '';
PRINT '┌──────────────────────────────────────────────────────────────────────────────┐';
PRINT '│ FASE 4: OPTIMIZAR BD_Instrumentos                                            │';
PRINT '└──────────────────────────────────────────────────────────────────────────────┘';

-- 4.1 Índice covering para enriquecimiento de cubos
PRINT '  Creando índice covering para cubos...';

CREATE NONCLUSTERED INDEX IX_BD_Instrumentos_Cubo
ON dimensionales.BD_Instrumentos (ID_Instrumento)
INCLUDE (
    SubID_Instrumento,
    Name_Instrumento,
    ISIN,
    TickerBBG,
    CompanyName,
    Investment_Type_Code,
    Sector_GICS,
    Sector_Chile_Type_Code,
    Issue_Country,
    Issue_Currency
);

PRINT '  [OK] FASE 4 completada exitosamente';
GO

-- ╔════════════════════════════════════════════════════════════════════════════════╗
-- ║ FASE 5: ACTUALIZAR PROCEDIMIENTOS ALMACENADOS                                   ║
-- ╚════════════════════════════════════════════════════════════════════════════════╝

PRINT '';
PRINT '┌──────────────────────────────────────────────────────────────────────────────┐';
PRINT '│ FASE 5: ACTUALIZAR PROCEDIMIENTOS ALMACENADOS                                │';
PRINT '└──────────────────────────────────────────────────────────────────────────────┘';

PRINT '  NOTA: Los SPs ya no necesitan COLLATE en los JOINs porque todas las';
PRINT '        columnas ahora usan Latin1_General_CS_AS consistentemente.';
PRINT '';
PRINT '  Verificar y actualizar manualmente si es necesario:';
PRINT '    - staging.sp_Homologate';
PRINT '    - staging.sp_ValidateFund';
PRINT '';
PRINT '  Cambio sugerido (remover COLLATE DATABASE_DEFAULT):';
PRINT '    ANTES:  ON t.InvestID = hi.SourceInvestment COLLATE DATABASE_DEFAULT';
PRINT '    DESPUÉS: ON t.InvestID = hi.SourceInvestment';
GO

-- ╔════════════════════════════════════════════════════════════════════════════════╗
-- ║ VALIDACIÓN FINAL                                                                ║
-- ╚════════════════════════════════════════════════════════════════════════════════╝

PRINT '';
PRINT '┌──────────────────────────────────────────────────────────────────────────────┐';
PRINT '│ VALIDACIÓN FINAL                                                             │';
PRINT '└──────────────────────────────────────────────────────────────────────────────┘';

-- Verificar estructura de HOMOL_Instrumentos
SELECT
    c.name AS Columna,
    t.name AS Tipo,
    c.max_length,
    c.collation_name
FROM sys.columns c
JOIN sys.types t ON c.user_type_id = t.user_type_id
WHERE c.object_id = OBJECT_ID('dimensionales.HOMOL_Instrumentos')
ORDER BY c.column_id;

-- Verificar PK
SELECT
    i.name AS Index_Name,
    i.type_desc,
    i.is_primary_key,
    STRING_AGG(c.name, ', ') WITHIN GROUP (ORDER BY ic.key_ordinal) AS Columns
FROM sys.indexes i
JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
WHERE i.object_id = OBJECT_ID('dimensionales.HOMOL_Instrumentos')
GROUP BY i.name, i.type_desc, i.is_primary_key;

-- Verificar conteo
SELECT
    'HOMOL_Instrumentos' AS Tabla,
    COUNT(*) AS Total,
    COUNT(DISTINCT CONCAT(Source, '|', SourceInvestment)) AS Combinaciones_Unicas
FROM dimensionales.HOMOL_Instrumentos;

PRINT '';
PRINT '════════════════════════════════════════════════════════════════════════════════';
PRINT ' MIGRACIÓN COMPLETADA';
PRINT ' Fin: ' + CONVERT(VARCHAR(30), GETDATE(), 120);
PRINT '════════════════════════════════════════════════════════════════════════════════';
GO
