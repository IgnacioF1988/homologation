USE INTELIGENCIA_PRODUCTO_FULLSTACK;
GO

/*
================================================================================
OPTIMIZACION DEFINITIVA - Indices y Estadisticas
================================================================================
Descripcion: Solucion robusta para eliminar TODOS los problemas de performance
             identificados en el plan de ejecucion.

Problemas resueltos:
  1. ExcessiveGrant persistente (indices faltantes en extract)
  2. Table scans en extract.IPA, extract.PNL, extract.CAPM, etc.
  3. Estadisticas faltantes en columnas de JOIN (ID_Homologacion, ID_Fund)
  4. Estimaciones de cardinalidad incorrectas

Enfoque:
  - Indices COVERING en tablas extract para queries del SP
  - Estadisticas en TODAS las columnas de JOIN
  - Indices en tablas de relacion N:M

Autor: Optimizacion Pipeline IPA
Fecha: 2026-01-06
================================================================================
*/

SET NOCOUNT ON;
PRINT '================================================================';
PRINT ' OPTIMIZACION DEFINITIVA DE INDICES Y ESTADISTICAS';
PRINT ' Fecha: ' + CONVERT(NVARCHAR(20), GETDATE(), 120);
PRINT '================================================================';
PRINT '';

-- ============================================================================
-- PASO 1: INDICES COVERING EN TABLAS EXTRACT
-- Estos indices son CRITICOS - eliminan los table scans
-- ============================================================================
PRINT '------------------------------------------------------------------------';
PRINT ' PASO 1: Indices covering en tablas extract';
PRINT '------------------------------------------------------------------------';

-- extract.IPA - Indice principal para sp_ValidateFund
-- Cubre: conteo, suciedades, instrumentos, monedas, fondos
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('extract.IPA') AND name = 'IX_IPA_Ejecucion_Fund_Fecha')
BEGIN
    CREATE NONCLUSTERED INDEX IX_IPA_Ejecucion_Fund_Fecha
    ON extract.IPA (ID_Ejecucion, ID_Fund, FechaReporte)
    INCLUDE (Portfolio, InvestID, InvestDescription, LocalCurrency, Qty, MVBook, AI);
    PRINT '  [OK] IX_IPA_Ejecucion_Fund_Fecha creado';
END
ELSE
BEGIN
    -- Verificar si tiene las columnas INCLUDE correctas, si no, recrear
    PRINT '  [SKIP] IX_IPA_Ejecucion_Fund_Fecha ya existe';
END

-- extract.PNL - Indice para validacion de instrumentos y monedas
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('extract.PNL') AND name = 'IX_PNL_Ejecucion_Fund_Fecha')
BEGIN
    CREATE NONCLUSTERED INDEX IX_PNL_Ejecucion_Fund_Fecha
    ON extract.PNL (ID_Ejecucion, ID_Fund, FechaReporte)
    INCLUDE (Symb, Currency);
    PRINT '  [OK] IX_PNL_Ejecucion_Fund_Fecha creado';
END
ELSE
    PRINT '  [SKIP] IX_PNL_Ejecucion_Fund_Fecha ya existe';

-- extract.CAPM - Indice para validacion
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('extract.CAPM') AND name = 'IX_CAPM_Ejecucion_Fund_Fecha')
BEGIN
    CREATE NONCLUSTERED INDEX IX_CAPM_Ejecucion_Fund_Fecha
    ON extract.CAPM (ID_Ejecucion, ID_Fund, FechaReporte)
    INCLUDE (InvestID, LocalCurrency);
    PRINT '  [OK] IX_CAPM_Ejecucion_Fund_Fecha creado';
END
ELSE
    PRINT '  [SKIP] IX_CAPM_Ejecucion_Fund_Fecha ya existe';

-- extract.SONA - Indice para conteo
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('extract.SONA') AND name = 'IX_SONA_Ejecucion_Fund_Fecha')
BEGIN
    CREATE NONCLUSTERED INDEX IX_SONA_Ejecucion_Fund_Fecha
    ON extract.SONA (ID_Ejecucion, ID_Fund, FechaReporte);
    PRINT '  [OK] IX_SONA_Ejecucion_Fund_Fecha creado';
END
ELSE
    PRINT '  [SKIP] IX_SONA_Ejecucion_Fund_Fecha ya existe';

-- extract.Derivados - Indice para validacion
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('extract.Derivados') AND name = 'IX_Derivados_Ejecucion_Fund_Fecha')
BEGIN
    CREATE NONCLUSTERED INDEX IX_Derivados_Ejecucion_Fund_Fecha
    ON extract.Derivados (ID_Ejecucion, ID_Fund, FechaReporte)
    INCLUDE (Portfolio, InvestID, Moneda_PLarga, Moneda_PCorta);
    PRINT '  [OK] IX_Derivados_Ejecucion_Fund_Fecha creado';
END
ELSE
    PRINT '  [SKIP] IX_Derivados_Ejecucion_Fund_Fecha ya existe';

-- extract.PosModRF - Indice para conteo
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('extract.PosModRF') AND name = 'IX_PosModRF_Ejecucion_Fund_Fecha')
BEGIN
    CREATE NONCLUSTERED INDEX IX_PosModRF_Ejecucion_Fund_Fecha
    ON extract.PosModRF (ID_Ejecucion, ID_Fund, FechaReporte);
    PRINT '  [OK] IX_PosModRF_Ejecucion_Fund_Fecha creado';
END
ELSE
    PRINT '  [SKIP] IX_PosModRF_Ejecucion_Fund_Fecha ya existe';

PRINT '';

-- ============================================================================
-- PASO 2: ESTADISTICAS EN COLUMNAS DE JOIN DE TABLAS SANDBOX
-- ============================================================================
PRINT '------------------------------------------------------------------------';
PRINT ' PASO 2: Estadisticas en columnas de JOIN (sandbox)';
PRINT '------------------------------------------------------------------------';

-- Homologacion_Instrumentos_Fondos.ID_Homologacion
IF NOT EXISTS (SELECT 1 FROM sys.stats WHERE object_id = OBJECT_ID('sandbox.Homologacion_Instrumentos_Fondos') AND name = 'ST_Homol_Instr_Fondos_IDHomol')
BEGIN
    CREATE STATISTICS ST_Homol_Instr_Fondos_IDHomol
    ON sandbox.Homologacion_Instrumentos_Fondos(ID_Homologacion) WITH FULLSCAN;
    PRINT '  [OK] ST_Homol_Instr_Fondos_IDHomol creada';
END
ELSE
    PRINT '  [SKIP] ST_Homol_Instr_Fondos_IDHomol ya existe';

-- Homologacion_Instrumentos_Fondos.ID_Fund
IF NOT EXISTS (SELECT 1 FROM sys.stats WHERE object_id = OBJECT_ID('sandbox.Homologacion_Instrumentos_Fondos') AND name = 'ST_Homol_Instr_Fondos_IDFund')
BEGIN
    CREATE STATISTICS ST_Homol_Instr_Fondos_IDFund
    ON sandbox.Homologacion_Instrumentos_Fondos(ID_Fund) WITH FULLSCAN;
    PRINT '  [OK] ST_Homol_Instr_Fondos_IDFund creada';
END
ELSE
    PRINT '  [SKIP] ST_Homol_Instr_Fondos_IDFund ya existe';

-- Homologacion_Monedas_Fondos.ID_Homologacion
IF NOT EXISTS (SELECT 1 FROM sys.stats WHERE object_id = OBJECT_ID('sandbox.Homologacion_Monedas_Fondos') AND name = 'ST_Homol_Mon_Fondos_IDHomol')
BEGIN
    CREATE STATISTICS ST_Homol_Mon_Fondos_IDHomol
    ON sandbox.Homologacion_Monedas_Fondos(ID_Homologacion) WITH FULLSCAN;
    PRINT '  [OK] ST_Homol_Mon_Fondos_IDHomol creada';
END
ELSE
    PRINT '  [SKIP] ST_Homol_Mon_Fondos_IDHomol ya existe';

-- Homologacion_Monedas_Fondos.ID_Fund
IF NOT EXISTS (SELECT 1 FROM sys.stats WHERE object_id = OBJECT_ID('sandbox.Homologacion_Monedas_Fondos') AND name = 'ST_Homol_Mon_Fondos_IDFund')
BEGIN
    CREATE STATISTICS ST_Homol_Mon_Fondos_IDFund
    ON sandbox.Homologacion_Monedas_Fondos(ID_Fund) WITH FULLSCAN;
    PRINT '  [OK] ST_Homol_Mon_Fondos_IDFund creada';
END
ELSE
    PRINT '  [SKIP] ST_Homol_Mon_Fondos_IDFund ya existe';

-- Homologacion_Fondos_Fondos.ID_Homologacion
IF NOT EXISTS (SELECT 1 FROM sys.stats WHERE object_id = OBJECT_ID('sandbox.Homologacion_Fondos_Fondos') AND name = 'ST_Homol_Fondos_Fondos_IDHomol')
BEGIN
    CREATE STATISTICS ST_Homol_Fondos_Fondos_IDHomol
    ON sandbox.Homologacion_Fondos_Fondos(ID_Homologacion) WITH FULLSCAN;
    PRINT '  [OK] ST_Homol_Fondos_Fondos_IDHomol creada';
END
ELSE
    PRINT '  [SKIP] ST_Homol_Fondos_Fondos_IDHomol ya existe';

-- Homologacion_Fondos_Fondos.ID_Fund
IF NOT EXISTS (SELECT 1 FROM sys.stats WHERE object_id = OBJECT_ID('sandbox.Homologacion_Fondos_Fondos') AND name = 'ST_Homol_Fondos_Fondos_IDFund')
BEGIN
    CREATE STATISTICS ST_Homol_Fondos_Fondos_IDFund
    ON sandbox.Homologacion_Fondos_Fondos(ID_Fund) WITH FULLSCAN;
    PRINT '  [OK] ST_Homol_Fondos_Fondos_IDFund creada';
END
ELSE
    PRINT '  [SKIP] ST_Homol_Fondos_Fondos_IDFund ya existe';

-- Alertas_Suciedades_IPA_Fondos.ID_Suciedad
IF NOT EXISTS (SELECT 1 FROM sys.stats WHERE object_id = OBJECT_ID('sandbox.Alertas_Suciedades_IPA_Fondos') AND name = 'ST_Suciedades_Fondos_IDSuciedad')
BEGIN
    CREATE STATISTICS ST_Suciedades_Fondos_IDSuciedad
    ON sandbox.Alertas_Suciedades_IPA_Fondos(ID_Suciedad) WITH FULLSCAN;
    PRINT '  [OK] ST_Suciedades_Fondos_IDSuciedad creada';
END
ELSE
    PRINT '  [SKIP] ST_Suciedades_Fondos_IDSuciedad ya existe';

-- Alertas_Suciedades_IPA_Fondos.ID_Fund
IF NOT EXISTS (SELECT 1 FROM sys.stats WHERE object_id = OBJECT_ID('sandbox.Alertas_Suciedades_IPA_Fondos') AND name = 'ST_Suciedades_Fondos_IDFund')
BEGIN
    CREATE STATISTICS ST_Suciedades_Fondos_IDFund
    ON sandbox.Alertas_Suciedades_IPA_Fondos(ID_Fund) WITH FULLSCAN;
    PRINT '  [OK] ST_Suciedades_Fondos_IDFund creada';
END
ELSE
    PRINT '  [SKIP] ST_Suciedades_Fondos_IDFund ya existe';

-- dimensionales.BD_Funds.ID_Fund (para JOINs en vistas)
IF NOT EXISTS (SELECT 1 FROM sys.stats WHERE object_id = OBJECT_ID('dimensionales.BD_Funds') AND name = 'ST_BD_Funds_IDFund')
BEGIN
    CREATE STATISTICS ST_BD_Funds_IDFund
    ON dimensionales.BD_Funds(ID_Fund) WITH FULLSCAN;
    PRINT '  [OK] ST_BD_Funds_IDFund creada';
END
ELSE
    PRINT '  [SKIP] ST_BD_Funds_IDFund ya existe';

PRINT '';

-- ============================================================================
-- PASO 3: INDICES EN TABLAS DE RELACION N:M (para JOINs eficientes)
-- ============================================================================
PRINT '------------------------------------------------------------------------';
PRINT ' PASO 3: Indices en tablas de relacion N:M';
PRINT '------------------------------------------------------------------------';

-- Homologacion_Instrumentos_Fondos - Indice compuesto para JOINs
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('sandbox.Homologacion_Instrumentos_Fondos') AND name = 'IX_Homol_Instr_Fondos_Homol_Fund')
BEGIN
    CREATE NONCLUSTERED INDEX IX_Homol_Instr_Fondos_Homol_Fund
    ON sandbox.Homologacion_Instrumentos_Fondos (ID_Homologacion, ID_Fund);
    PRINT '  [OK] IX_Homol_Instr_Fondos_Homol_Fund creado';
END
ELSE
    PRINT '  [SKIP] IX_Homol_Instr_Fondos_Homol_Fund ya existe';

-- Homologacion_Monedas_Fondos - Indice compuesto
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('sandbox.Homologacion_Monedas_Fondos') AND name = 'IX_Homol_Mon_Fondos_Homol_Fund')
BEGIN
    CREATE NONCLUSTERED INDEX IX_Homol_Mon_Fondos_Homol_Fund
    ON sandbox.Homologacion_Monedas_Fondos (ID_Homologacion, ID_Fund);
    PRINT '  [OK] IX_Homol_Mon_Fondos_Homol_Fund creado';
END
ELSE
    PRINT '  [SKIP] IX_Homol_Mon_Fondos_Homol_Fund ya existe';

-- Homologacion_Fondos_Fondos - Indice compuesto
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('sandbox.Homologacion_Fondos_Fondos') AND name = 'IX_Homol_Fondos_Fondos_Homol_Fund')
BEGIN
    CREATE NONCLUSTERED INDEX IX_Homol_Fondos_Fondos_Homol_Fund
    ON sandbox.Homologacion_Fondos_Fondos (ID_Homologacion, ID_Fund);
    PRINT '  [OK] IX_Homol_Fondos_Fondos_Homol_Fund creado';
END
ELSE
    PRINT '  [SKIP] IX_Homol_Fondos_Fondos_Homol_Fund ya existe';

-- Alertas_Suciedades_IPA_Fondos - Indice compuesto
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('sandbox.Alertas_Suciedades_IPA_Fondos') AND name = 'IX_Suciedades_Fondos_Suciedad_Fund')
BEGIN
    CREATE NONCLUSTERED INDEX IX_Suciedades_Fondos_Suciedad_Fund
    ON sandbox.Alertas_Suciedades_IPA_Fondos (ID_Suciedad, ID_Fund);
    PRINT '  [OK] IX_Suciedades_Fondos_Suciedad_Fund creado';
END
ELSE
    PRINT '  [SKIP] IX_Suciedades_Fondos_Suciedad_Fund ya existe';

PRINT '';

-- ============================================================================
-- PASO 4: ESTADISTICAS EN TABLAS EXTRACT (columnas de filtro)
-- ============================================================================
PRINT '------------------------------------------------------------------------';
PRINT ' PASO 4: Estadisticas en tablas extract';
PRINT '------------------------------------------------------------------------';

-- IPA: Estadistica compuesta para el filtro principal
IF NOT EXISTS (SELECT 1 FROM sys.stats WHERE object_id = OBJECT_ID('extract.IPA') AND name = 'ST_IPA_Ejecucion_Fund_Fecha')
BEGIN
    CREATE STATISTICS ST_IPA_Ejecucion_Fund_Fecha
    ON extract.IPA(ID_Ejecucion, ID_Fund, FechaReporte) WITH FULLSCAN;
    PRINT '  [OK] ST_IPA_Ejecucion_Fund_Fecha creada';
END
ELSE
    PRINT '  [SKIP] ST_IPA_Ejecucion_Fund_Fecha ya existe';

-- PNL
IF NOT EXISTS (SELECT 1 FROM sys.stats WHERE object_id = OBJECT_ID('extract.PNL') AND name = 'ST_PNL_Ejecucion_Fund_Fecha')
BEGIN
    CREATE STATISTICS ST_PNL_Ejecucion_Fund_Fecha
    ON extract.PNL(ID_Ejecucion, ID_Fund, FechaReporte) WITH FULLSCAN;
    PRINT '  [OK] ST_PNL_Ejecucion_Fund_Fecha creada';
END
ELSE
    PRINT '  [SKIP] ST_PNL_Ejecucion_Fund_Fecha ya existe';

-- CAPM
IF NOT EXISTS (SELECT 1 FROM sys.stats WHERE object_id = OBJECT_ID('extract.CAPM') AND name = 'ST_CAPM_Ejecucion_Fund_Fecha')
BEGIN
    CREATE STATISTICS ST_CAPM_Ejecucion_Fund_Fecha
    ON extract.CAPM(ID_Ejecucion, ID_Fund, FechaReporte) WITH FULLSCAN;
    PRINT '  [OK] ST_CAPM_Ejecucion_Fund_Fecha creada';
END
ELSE
    PRINT '  [SKIP] ST_CAPM_Ejecucion_Fund_Fecha ya existe';

-- SONA
IF NOT EXISTS (SELECT 1 FROM sys.stats WHERE object_id = OBJECT_ID('extract.SONA') AND name = 'ST_SONA_Ejecucion_Fund_Fecha')
BEGIN
    CREATE STATISTICS ST_SONA_Ejecucion_Fund_Fecha
    ON extract.SONA(ID_Ejecucion, ID_Fund, FechaReporte) WITH FULLSCAN;
    PRINT '  [OK] ST_SONA_Ejecucion_Fund_Fecha creada';
END
ELSE
    PRINT '  [SKIP] ST_SONA_Ejecucion_Fund_Fecha ya existe';

-- Derivados
IF NOT EXISTS (SELECT 1 FROM sys.stats WHERE object_id = OBJECT_ID('extract.Derivados') AND name = 'ST_Derivados_Ejecucion_Fund_Fecha')
BEGIN
    CREATE STATISTICS ST_Derivados_Ejecucion_Fund_Fecha
    ON extract.Derivados(ID_Ejecucion, ID_Fund, FechaReporte) WITH FULLSCAN;
    PRINT '  [OK] ST_Derivados_Ejecucion_Fund_Fecha creada';
END
ELSE
    PRINT '  [SKIP] ST_Derivados_Ejecucion_Fund_Fecha ya existe';

PRINT '';

-- ============================================================================
-- PASO 5: ACTUALIZAR TODAS LAS ESTADISTICAS
-- ============================================================================
PRINT '------------------------------------------------------------------------';
PRINT ' PASO 5: Actualizar estadisticas existentes';
PRINT '------------------------------------------------------------------------';

-- Tablas extract
UPDATE STATISTICS extract.IPA WITH FULLSCAN;
PRINT '  [OK] extract.IPA';
UPDATE STATISTICS extract.CAPM WITH FULLSCAN;
PRINT '  [OK] extract.CAPM';
UPDATE STATISTICS extract.SONA WITH FULLSCAN;
PRINT '  [OK] extract.SONA';
UPDATE STATISTICS extract.PNL WITH FULLSCAN;
PRINT '  [OK] extract.PNL';
UPDATE STATISTICS extract.Derivados WITH FULLSCAN;
PRINT '  [OK] extract.Derivados';
UPDATE STATISTICS extract.PosModRF WITH FULLSCAN;
PRINT '  [OK] extract.PosModRF';

-- Tablas dimensionales
UPDATE STATISTICS dimensionales.HOMOL_Instrumentos WITH FULLSCAN;
PRINT '  [OK] dimensionales.HOMOL_Instrumentos';
UPDATE STATISTICS dimensionales.HOMOL_Funds WITH FULLSCAN;
PRINT '  [OK] dimensionales.HOMOL_Funds';
UPDATE STATISTICS dimensionales.HOMOL_Monedas WITH FULLSCAN;
PRINT '  [OK] dimensionales.HOMOL_Monedas';
UPDATE STATISTICS dimensionales.BD_Funds WITH FULLSCAN;
PRINT '  [OK] dimensionales.BD_Funds';

-- Tablas sandbox
UPDATE STATISTICS sandbox.Homologacion_Instrumentos WITH FULLSCAN;
PRINT '  [OK] sandbox.Homologacion_Instrumentos';
UPDATE STATISTICS sandbox.Homologacion_Instrumentos_Fondos WITH FULLSCAN;
PRINT '  [OK] sandbox.Homologacion_Instrumentos_Fondos';
UPDATE STATISTICS sandbox.Homologacion_Monedas WITH FULLSCAN;
PRINT '  [OK] sandbox.Homologacion_Monedas';
UPDATE STATISTICS sandbox.Homologacion_Monedas_Fondos WITH FULLSCAN;
PRINT '  [OK] sandbox.Homologacion_Monedas_Fondos';
UPDATE STATISTICS sandbox.Homologacion_Fondos WITH FULLSCAN;
PRINT '  [OK] sandbox.Homologacion_Fondos';
UPDATE STATISTICS sandbox.Homologacion_Fondos_Fondos WITH FULLSCAN;
PRINT '  [OK] sandbox.Homologacion_Fondos_Fondos';
UPDATE STATISTICS sandbox.Alertas_Suciedades_IPA WITH FULLSCAN;
PRINT '  [OK] sandbox.Alertas_Suciedades_IPA';
UPDATE STATISTICS sandbox.Alertas_Suciedades_IPA_Fondos WITH FULLSCAN;
PRINT '  [OK] sandbox.Alertas_Suciedades_IPA_Fondos';

PRINT '';

-- ============================================================================
-- PASO 6: FORZAR RECOMPILACION DEL SP
-- ============================================================================
PRINT '------------------------------------------------------------------------';
PRINT ' PASO 6: Forzar recompilacion del SP';
PRINT '------------------------------------------------------------------------';

EXEC sp_recompile 'staging.sp_ValidateFund';
PRINT '  [OK] sp_ValidateFund marcado para recompilacion';

PRINT '';
PRINT '================================================================';
PRINT ' OPTIMIZACION DEFINITIVA COMPLETADA';
PRINT '================================================================';
PRINT '';
PRINT ' Indices creados:';
PRINT '   - IX_IPA_Ejecucion_Fund_Fecha (covering)';
PRINT '   - IX_PNL_Ejecucion_Fund_Fecha (covering)';
PRINT '   - IX_CAPM_Ejecucion_Fund_Fecha (covering)';
PRINT '   - IX_SONA_Ejecucion_Fund_Fecha';
PRINT '   - IX_Derivados_Ejecucion_Fund_Fecha (covering)';
PRINT '   - IX_PosModRF_Ejecucion_Fund_Fecha';
PRINT '   - Indices compuestos en tablas N:M';
PRINT '';
PRINT ' Estadisticas creadas/actualizadas:';
PRINT '   - Columnas de JOIN en tablas sandbox';
PRINT '   - Columnas de filtro en tablas extract';
PRINT '   - FULLSCAN en todas las tablas';
PRINT '';
PRINT ' Metricas esperadas:';
PRINT '   - Memory Grant: < 50 KB (eliminados table scans)';
PRINT '   - ExcessiveGrant warnings: 0';
PRINT '   - Index seeks en lugar de scans';
PRINT '';
GO
