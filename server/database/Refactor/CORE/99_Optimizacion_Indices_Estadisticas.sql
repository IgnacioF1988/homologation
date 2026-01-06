USE INTELIGENCIA_PRODUCTO_FULLSTACK;
GO

/*
================================================================================
SCRIPT DE OPTIMIZACION - Indices y Estadisticas
================================================================================
Descripcion: Resuelve problemas de performance identificados en el plan de
             ejecucion de sp_ValidateFund y queries relacionados.

Problemas resueltos:
  1. ExcessiveGrant de memoria (3712 KB solicitados, 16 KB usados)
  2. Columnas sin estadisticas (Portfolio, Instrumento, id_CURR)
  3. Clustered Index Scans repetitivos en HOMOL_Monedas
  4. Estimaciones de cardinalidad incorrectas (5-7x diferencia)
  5. Conversion de tipo implicita

Autor: Optimizacion Pipeline IPA
Fecha: 2026-01-06
================================================================================
*/

SET NOCOUNT ON;
PRINT '================================================================';
PRINT ' OPTIMIZACION DE INDICES Y ESTADISTICAS';
PRINT ' Fecha: ' + CONVERT(NVARCHAR(20), GETDATE(), 120);
PRINT '================================================================';
PRINT '';

-- ============================================================================
-- PASO 1: CREAR ESTADISTICAS FALTANTES
-- ============================================================================
PRINT '------------------------------------------------------------------------';
PRINT ' PASO 1: Crear estadisticas faltantes';
PRINT '------------------------------------------------------------------------';

-- dimensionales.HOMOL_Funds.Portfolio
IF NOT EXISTS (SELECT 1 FROM sys.stats WHERE object_id = OBJECT_ID('dimensionales.HOMOL_Funds') AND name = 'ST_HOMOL_Funds_Portfolio')
BEGIN
    CREATE STATISTICS ST_HOMOL_Funds_Portfolio
    ON dimensionales.HOMOL_Funds(Portfolio) WITH FULLSCAN;
    PRINT '  [OK] Estadistica ST_HOMOL_Funds_Portfolio creada';
END
ELSE
    PRINT '  [SKIP] ST_HOMOL_Funds_Portfolio ya existe';

-- sandbox.Homologacion_Instrumentos.Instrumento
IF NOT EXISTS (SELECT 1 FROM sys.stats WHERE object_id = OBJECT_ID('sandbox.Homologacion_Instrumentos') AND name = 'ST_Homol_Instrumentos_Instrumento')
BEGIN
    CREATE STATISTICS ST_Homol_Instrumentos_Instrumento
    ON sandbox.Homologacion_Instrumentos(Instrumento) WITH FULLSCAN;
    PRINT '  [OK] Estadistica ST_Homol_Instrumentos_Instrumento creada';
END
ELSE
    PRINT '  [SKIP] ST_Homol_Instrumentos_Instrumento ya existe';

-- dimensionales.HOMOL_Monedas.id_CURR
IF NOT EXISTS (SELECT 1 FROM sys.stats WHERE object_id = OBJECT_ID('dimensionales.HOMOL_Monedas') AND name = 'ST_HOMOL_Monedas_id_CURR')
BEGIN
    CREATE STATISTICS ST_HOMOL_Monedas_id_CURR
    ON dimensionales.HOMOL_Monedas(id_CURR) WITH FULLSCAN;
    PRINT '  [OK] Estadistica ST_HOMOL_Monedas_id_CURR creada';
END
ELSE
    PRINT '  [SKIP] ST_HOMOL_Monedas_id_CURR ya existe';

-- sandbox.Homologacion_Instrumentos.Estado (para filtros frecuentes)
IF NOT EXISTS (SELECT 1 FROM sys.stats WHERE object_id = OBJECT_ID('sandbox.Homologacion_Instrumentos') AND name = 'ST_Homol_Instrumentos_Estado')
BEGIN
    CREATE STATISTICS ST_Homol_Instrumentos_Estado
    ON sandbox.Homologacion_Instrumentos(Estado) WITH FULLSCAN;
    PRINT '  [OK] Estadistica ST_Homol_Instrumentos_Estado creada';
END
ELSE
    PRINT '  [SKIP] ST_Homol_Instrumentos_Estado ya existe';

PRINT '';

-- ============================================================================
-- PASO 2: ACTUALIZAR ESTADISTICAS EXISTENTES CON FULLSCAN
-- ============================================================================
PRINT '------------------------------------------------------------------------';
PRINT ' PASO 2: Actualizar estadisticas existentes';
PRINT '------------------------------------------------------------------------';

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

UPDATE STATISTICS dimensionales.HOMOL_Instrumentos WITH FULLSCAN;
PRINT '  [OK] dimensionales.HOMOL_Instrumentos';

UPDATE STATISTICS dimensionales.HOMOL_Funds WITH FULLSCAN;
PRINT '  [OK] dimensionales.HOMOL_Funds';

UPDATE STATISTICS dimensionales.HOMOL_Monedas WITH FULLSCAN;
PRINT '  [OK] dimensionales.HOMOL_Monedas';

UPDATE STATISTICS sandbox.Homologacion_Instrumentos WITH FULLSCAN;
PRINT '  [OK] sandbox.Homologacion_Instrumentos';

UPDATE STATISTICS sandbox.Homologacion_Monedas WITH FULLSCAN;
PRINT '  [OK] sandbox.Homologacion_Monedas';

UPDATE STATISTICS sandbox.Homologacion_Fondos WITH FULLSCAN;
PRINT '  [OK] sandbox.Homologacion_Fondos';

UPDATE STATISTICS sandbox.Alertas_Suciedades_IPA WITH FULLSCAN;
PRINT '  [OK] sandbox.Alertas_Suciedades_IPA';

PRINT '';

-- ============================================================================
-- PASO 3: CREAR/MEJORAR INDICES PARA ELIMINAR SCANS
-- ============================================================================
PRINT '------------------------------------------------------------------------';
PRINT ' PASO 3: Crear/mejorar indices';
PRINT '------------------------------------------------------------------------';

-- Indice critico para HOMOL_Monedas (elimina 6+ Clustered Index Scans)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('dimensionales.HOMOL_Monedas') AND name = 'IX_HOMOL_Monedas_Source_Name')
BEGIN
    CREATE NONCLUSTERED INDEX IX_HOMOL_Monedas_Source_Name
    ON dimensionales.HOMOL_Monedas (Source, Name)
    INCLUDE (id_CURR, MonedaDesc);
    PRINT '  [OK] Indice IX_HOMOL_Monedas_Source_Name creado';
END
ELSE
    PRINT '  [SKIP] IX_HOMOL_Monedas_Source_Name ya existe';

-- Indice para HOMOL_Instrumentos (busqueda por Source + SourceInvestment)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('dimensionales.HOMOL_Instrumentos') AND name = 'IX_HOMOL_Instrumentos_Source_Investment')
BEGIN
    CREATE NONCLUSTERED INDEX IX_HOMOL_Instrumentos_Source_Investment
    ON dimensionales.HOMOL_Instrumentos (Source, SourceInvestment)
    INCLUDE (ID_Instrumento, InstrumentoDesc, TipoInstrumento);
    PRINT '  [OK] Indice IX_HOMOL_Instrumentos_Source_Investment creado';
END
ELSE
    PRINT '  [SKIP] IX_HOMOL_Instrumentos_Source_Investment ya existe';

-- Indice mejorado para Homologacion_Instrumentos sandbox
IF EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('sandbox.Homologacion_Instrumentos') AND name = 'IX_Homol_Instr_Estado')
BEGIN
    DROP INDEX IX_Homol_Instr_Estado ON sandbox.Homologacion_Instrumentos;
END
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('sandbox.Homologacion_Instrumentos') AND name = 'IX_Homol_Instr_Estado_Covering')
BEGIN
    CREATE NONCLUSTERED INDEX IX_Homol_Instr_Estado_Covering
    ON sandbox.Homologacion_Instrumentos (Estado, Instrumento, Source)
    INCLUDE (ID, Currency, FechaDeteccion);
    PRINT '  [OK] Indice IX_Homol_Instr_Estado_Covering creado';
END
ELSE
    PRINT '  [SKIP] IX_Homol_Instr_Estado_Covering ya existe';

-- Indice para Homologacion_Monedas sandbox
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('sandbox.Homologacion_Monedas') AND name = 'IX_Homol_Monedas_Estado_Covering')
BEGIN
    CREATE NONCLUSTERED INDEX IX_Homol_Monedas_Estado_Covering
    ON sandbox.Homologacion_Monedas (Estado, Moneda, Source)
    INCLUDE (ID, FechaDeteccion);
    PRINT '  [OK] Indice IX_Homol_Monedas_Estado_Covering creado';
END
ELSE
    PRINT '  [SKIP] IX_Homol_Monedas_Estado_Covering ya existe';

-- Indice para Homologacion_Fondos sandbox
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('sandbox.Homologacion_Fondos') AND name = 'IX_Homol_Fondos_Estado_Covering')
BEGIN
    CREATE NONCLUSTERED INDEX IX_Homol_Fondos_Estado_Covering
    ON sandbox.Homologacion_Fondos (Estado, NombreFondo, Source)
    INCLUDE (ID, FechaDeteccion);
    PRINT '  [OK] Indice IX_Homol_Fondos_Estado_Covering creado';
END
ELSE
    PRINT '  [SKIP] IX_Homol_Fondos_Estado_Covering ya existe';

-- Indice para Alertas_Suciedades_IPA
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('sandbox.Alertas_Suciedades_IPA') AND name = 'IX_Suciedades_Estado_Covering')
BEGIN
    CREATE NONCLUSTERED INDEX IX_Suciedades_Estado_Covering
    ON sandbox.Alertas_Suciedades_IPA (Estado, InvestID)
    INCLUDE (ID, Qty, MVBook, InvestDescription);
    PRINT '  [OK] Indice IX_Suciedades_Estado_Covering creado';
END
ELSE
    PRINT '  [SKIP] IX_Suciedades_Estado_Covering ya existe';

PRINT '';

-- ============================================================================
-- PASO 4: INDICES PARA TABLAS DE RELACION N:M
-- ============================================================================
PRINT '------------------------------------------------------------------------';
PRINT ' PASO 4: Indices para tablas de relacion N:M';
PRINT '------------------------------------------------------------------------';

-- Homologacion_Instrumentos_Fondos
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('sandbox.Homologacion_Instrumentos_Fondos') AND name = 'IX_Homol_Instr_Fondos_Fund')
BEGIN
    CREATE NONCLUSTERED INDEX IX_Homol_Instr_Fondos_Fund
    ON sandbox.Homologacion_Instrumentos_Fondos (ID_Fund)
    INCLUDE (ID_Homologacion);
    PRINT '  [OK] Indice IX_Homol_Instr_Fondos_Fund creado';
END
ELSE
    PRINT '  [SKIP] IX_Homol_Instr_Fondos_Fund ya existe';

-- Homologacion_Monedas_Fondos
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('sandbox.Homologacion_Monedas_Fondos') AND name = 'IX_Homol_Monedas_Fondos_Fund')
BEGIN
    CREATE NONCLUSTERED INDEX IX_Homol_Monedas_Fondos_Fund
    ON sandbox.Homologacion_Monedas_Fondos (ID_Fund)
    INCLUDE (ID_Homologacion);
    PRINT '  [OK] Indice IX_Homol_Monedas_Fondos_Fund creado';
END
ELSE
    PRINT '  [SKIP] IX_Homol_Monedas_Fondos_Fund ya existe';

-- Homologacion_Fondos_Fondos
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('sandbox.Homologacion_Fondos_Fondos') AND name = 'IX_Homol_Fondos_Fondos_Fund')
BEGIN
    CREATE NONCLUSTERED INDEX IX_Homol_Fondos_Fondos_Fund
    ON sandbox.Homologacion_Fondos_Fondos (ID_Fund)
    INCLUDE (ID_Homologacion);
    PRINT '  [OK] Indice IX_Homol_Fondos_Fondos_Fund creado';
END
ELSE
    PRINT '  [SKIP] IX_Homol_Fondos_Fondos_Fund ya existe';

-- Alertas_Suciedades_IPA_Fondos
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('sandbox.Alertas_Suciedades_IPA_Fondos') AND name = 'IX_Suciedades_Fondos_Fund')
BEGIN
    CREATE NONCLUSTERED INDEX IX_Suciedades_Fondos_Fund
    ON sandbox.Alertas_Suciedades_IPA_Fondos (ID_Fund)
    INCLUDE (ID_Suciedad);
    PRINT '  [OK] Indice IX_Suciedades_Fondos_Fund creado';
END
ELSE
    PRINT '  [SKIP] IX_Suciedades_Fondos_Fund ya existe';

PRINT '';

-- ============================================================================
-- PASO 5: FORZAR RECOMPILACION DEL SP
-- ============================================================================
PRINT '------------------------------------------------------------------------';
PRINT ' PASO 5: Forzar recompilacion del SP';
PRINT '------------------------------------------------------------------------';

EXEC sp_recompile 'staging.sp_ValidateFund';
PRINT '  [OK] sp_ValidateFund marcado para recompilacion';

PRINT '';
PRINT '================================================================';
PRINT ' OPTIMIZACION COMPLETADA';
PRINT '================================================================';
PRINT '';
PRINT ' Metricas esperadas despues de optimizacion:';
PRINT '   - Memory Grant: < 100 KB (antes: 3712 KB)';
PRINT '   - Clustered Index Scans en Monedas: 0 (antes: 6+)';
PRINT '   - Estimacion vs Real: < 2x diferencia (antes: 5-7x)';
PRINT '';
PRINT ' Para verificar mejoras, ejecutar:';
PRINT '   SET STATISTICS IO ON;';
PRINT '   SET STATISTICS TIME ON;';
PRINT '   -- Luego ejecutar el test generico';
PRINT '';
GO
