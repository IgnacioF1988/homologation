/*
================================================================================
TEST MANUAL - ALTURAS II (ID_Fund = 2)
================================================================================
Descripcion: Script para ejecutar manualmente el pipeline completo.
             Ejecucion TRANSPARENTE - solo llama SPs del pipeline.
             No hace limpiezas ni manipulaciones extra.

Novedades v2:
  - Limpieza de logs.Validaciones_Ejecucion
  - Consulta de validaciones via logs.vw_Validaciones_Detalle
  - sp_ValidateFund ahora ejecuta TODAS las validaciones (no fail-fast)

Instrucciones:
  1. Ejecutar en SSMS conectado a INTELIGENCIA_PRODUCTO_FULLSTACK
  2. Puede ejecutar secciones individuales para debug
  3. Los errores se muestran directamente

Fecha: 2026-01-05
================================================================================
*/

USE INTELIGENCIA_PRODUCTO_FULLSTACK;
GO

SET NOCOUNT ON;

-- ============================================================================
-- VARIABLES DE EJECUCION (modificar segun necesidad)
-- ============================================================================
DECLARE @FechaReporte NVARCHAR(10) = '2024-12-30';
DECLARE @ID_Proceso BIGINT = 100;        -- Cambiar para cada ejecucion
DECLARE @ID_Ejecucion BIGINT = 100;      -- Cambiar para cada ejecucion
DECLARE @ID_Fund INT = 2;                -- Alturas II
DECLARE @Portfolio NVARCHAR(100) = 'ALTURAS II';

-- Variables de salida
DECLARE @ReturnCode INT;
DECLARE @ErrorMessage NVARCHAR(500);

PRINT '========================================================================';
PRINT '         TEST MANUAL - ALTURAS II (Ejecucion Transparente v2)';
PRINT '========================================================================';
PRINT '';
PRINT 'Parametros:';
PRINT '  FechaReporte:  ' + @FechaReporte;
PRINT '  ID_Proceso:    ' + CAST(@ID_Proceso AS NVARCHAR(20));
PRINT '  ID_Ejecucion:  ' + CAST(@ID_Ejecucion AS NVARCHAR(20));
PRINT '  ID_Fund:       ' + CAST(@ID_Fund AS NVARCHAR(10));
PRINT '  Portfolio:     ' + @Portfolio;
PRINT '';

-- ============================================================================
-- PASO 1: VERIFICAR CONFIGURACION DEL FONDO
-- ============================================================================
PRINT '------------------------------------------------------------------------';
PRINT ' PASO 1: VERIFICAR CONFIGURACION';
PRINT '------------------------------------------------------------------------';

SELECT
    ID_Fund, Fund_Name,
    Req_IPA, Req_CAPM, Req_SONA, Req_PNL, Req_Derivados, Req_PosModRF,
    ConfigType
FROM config.vw_Requisitos_Extract_Completo
WHERE ID_Fund = @ID_Fund;

-- ============================================================================
-- PASO 2: LIMPIAR DATOS DE EJECUCION ANTERIOR (mismo ID_Ejecucion)
-- ============================================================================
PRINT '';
PRINT '------------------------------------------------------------------------';
PRINT ' PASO 2: LIMPIAR DATOS DE EJECUCION ANTERIOR';
PRINT '------------------------------------------------------------------------';

-- Limpiar extracts de esta ejecucion
DELETE FROM extract.IPA WHERE ID_Ejecucion = @ID_Ejecucion;
DELETE FROM extract.CAPM WHERE ID_Ejecucion = @ID_Ejecucion;
DELETE FROM extract.SONA WHERE ID_Ejecucion = @ID_Ejecucion;
DELETE FROM extract.PNL WHERE ID_Ejecucion = @ID_Ejecucion;
DELETE FROM extract.Derivados WHERE ID_Ejecucion = @ID_Ejecucion;
DELETE FROM extract.PosModRF WHERE ID_Ejecucion = @ID_Ejecucion;

-- Limpiar sandbox de esta ejecucion
DELETE FROM sandbox.Homologacion_Fondos WHERE ID_Ejecucion = @ID_Ejecucion;
DELETE FROM sandbox.Homologacion_Instrumentos WHERE ID_Ejecucion = @ID_Ejecucion;
DELETE FROM sandbox.Homologacion_Monedas WHERE ID_Ejecucion = @ID_Ejecucion;
DELETE FROM sandbox.Alertas_Descuadre_Cash WHERE ID_Ejecucion = @ID_Ejecucion;
DELETE FROM sandbox.Alertas_Descuadre_Derivados WHERE ID_Ejecucion = @ID_Ejecucion;
DELETE FROM sandbox.Alertas_Descuadre_NAV WHERE ID_Ejecucion = @ID_Ejecucion;
DELETE FROM sandbox.Alertas_Suciedades_IPA WHERE ID_Ejecucion = @ID_Ejecucion;
DELETE FROM sandbox.Alertas_Extract_Faltante WHERE ID_Ejecucion = @ID_Ejecucion;

-- Limpiar logs de validaciones de esta ejecucion
DELETE FROM logs.Validaciones_Ejecucion WHERE ID_Ejecucion = @ID_Ejecucion;

-- Limpiar process de esta ejecucion
DELETE FROM process.CUBO_Final WHERE ID_Ejecucion = @ID_Ejecucion;

PRINT '  [OK] Datos de ejecucion anterior eliminados (extract, sandbox, logs, process)';

-- ============================================================================
-- PASO 3: EJECUTAR EXTRACTS
-- ============================================================================
PRINT '';
PRINT '------------------------------------------------------------------------';
PRINT ' PASO 3: EJECUTAR EXTRACTS';
PRINT '------------------------------------------------------------------------';

-- Extract IPA
PRINT '  Ejecutando Extract_IPA...';
EXEC extract.Extract_IPA @FechaReporte, @ID_Proceso, @ID_Ejecucion, @ID_Fund, @Portfolio;

-- Extract CAPM
PRINT '  Ejecutando Extract_CAPM...';
EXEC extract.Extract_CAPM @FechaReporte, @ID_Proceso, @ID_Ejecucion, @ID_Fund, @Portfolio;

-- Extract SONA
PRINT '  Ejecutando Extract_SONA...';
EXEC extract.Extract_SONA @FechaReporte, @ID_Proceso, @ID_Ejecucion, @ID_Fund, @Portfolio;

-- Extract PNL
PRINT '  Ejecutando Extract_PNL...';
EXEC extract.Extract_PNL @FechaReporte, @ID_Proceso, @ID_Ejecucion, @ID_Fund, @Portfolio;

-- Extract PosModRF
PRINT '  Ejecutando Extract_PosModRF...';
EXEC extract.Extract_PosModRF @FechaReporte, @ID_Proceso, @ID_Ejecucion, @ID_Fund, @Portfolio;

-- Extract Derivados (se ejecuta aunque Req_Derivados = 0, el SP valida si hay datos)
PRINT '  Ejecutando Extract_Derivados...';
EXEC extract.Extract_Derivados @FechaReporte, @ID_Proceso, @ID_Ejecucion, @ID_Fund, @Portfolio;

PRINT '';
PRINT '  Resumen extracts cargados:';
SELECT 'IPA' AS Extract, COUNT(*) AS Registros FROM extract.IPA WHERE ID_Ejecucion = @ID_Ejecucion
UNION ALL SELECT 'CAPM', COUNT(*) FROM extract.CAPM WHERE ID_Ejecucion = @ID_Ejecucion
UNION ALL SELECT 'SONA', COUNT(*) FROM extract.SONA WHERE ID_Ejecucion = @ID_Ejecucion
UNION ALL SELECT 'PNL', COUNT(*) FROM extract.PNL WHERE ID_Ejecucion = @ID_Ejecucion
UNION ALL SELECT 'PosModRF', COUNT(*) FROM extract.PosModRF WHERE ID_Ejecucion = @ID_Ejecucion
UNION ALL SELECT 'Derivados', COUNT(*) FROM extract.Derivados WHERE ID_Ejecucion = @ID_Ejecucion;

-- ============================================================================
-- PASO 4: EJECUTAR PIPELINE (sin manipulaciones)
-- ============================================================================
PRINT '';
PRINT '------------------------------------------------------------------------';
PRINT ' PASO 4: EJECUTAR PIPELINE';
PRINT '------------------------------------------------------------------------';

-- El orquestador lee la config de config.Requisitos_Extract
-- para determinar que reportes procesar. No hay flags de skip.
EXEC staging.sp_Process_Fund_Complete
    @ID_Ejecucion = @ID_Ejecucion,
    @ID_Proceso = @ID_Proceso,
    @ID_Fund = @ID_Fund,
    @FechaReporte = @FechaReporte,
    @LimpiarTemporales = 1,
    @ReturnCode = @ReturnCode OUTPUT,
    @ErrorMessage = @ErrorMessage OUTPUT;

-- ============================================================================
-- PASO 5: MOSTRAR RESULTADO
-- ============================================================================
PRINT '';
PRINT '========================================================================';
PRINT '                         RESULTADO';
PRINT '========================================================================';

SELECT
    @ReturnCode AS ReturnCode,
    @ErrorMessage AS ErrorMessage,
    CASE @ReturnCode
        WHEN 0  THEN 'OK - Ejecucion exitosa'
        WHEN 1  THEN 'WARNING - Completado con advertencias'
        WHEN 2  THEN 'RETRY - Error recuperable'
        WHEN 3  THEN 'ERROR_CRITICO - Error fatal'
        WHEN 5  THEN 'SUCIEDADES - Posiciones con Qty casi cero'
        WHEN 6  THEN 'HOMOLOGACION_INSTRUMENTOS - Instrumentos sin homologar'
        WHEN 7  THEN 'DESCUADRES_CAPM - Descuadre en Cash'
        WHEN 8  THEN 'DESCUADRES_DERIVADOS - Descuadre en Derivados'
        WHEN 9  THEN 'DESCUADRES_NAV - Descuadre en NAV'
        WHEN 10 THEN 'HOMOLOGACION_FONDOS - Fondo sin homologar'
        WHEN 11 THEN 'HOMOLOGACION_MONEDAS - Monedas sin homologar'
        WHEN 13 THEN 'EXTRACT_IPA_FALTANTE'
        WHEN 14 THEN 'EXTRACT_CAPM_FALTANTE'
        WHEN 15 THEN 'EXTRACT_SONA_FALTANTE'
        WHEN 16 THEN 'EXTRACT_PNL_FALTANTE'
        WHEN 17 THEN 'EXTRACT_DERIVADOS_FALTANTE'
        WHEN 18 THEN 'EXTRACT_POSMODRF_FALTANTE'
        ELSE 'Codigo desconocido: ' + CAST(@ReturnCode AS NVARCHAR(10))
    END AS Interpretacion;

-- ============================================================================
-- PASO 6: LOG DE VALIDACIONES (NUEVO - v2)
-- ============================================================================
PRINT '';
PRINT '------------------------------------------------------------------------';
PRINT ' PASO 6: LOG DE VALIDACIONES (logs.vw_Validaciones_Detalle)';
PRINT '------------------------------------------------------------------------';

SELECT
    CodigoValidacion,
    CodigoDescripcion,
    TipoValidacion,
    Categoria,
    Mensaje,
    Cantidad,
    CASE WHEN EsCritico = 1 THEN 'SI' ELSE 'NO' END AS EsCritico,
    TablaSandbox,
    AccionRecomendada
FROM logs.vw_Validaciones_Detalle
WHERE ID_Ejecucion = @ID_Ejecucion
ORDER BY FechaProceso;

-- Resumen por categoria
PRINT '';
PRINT '  Resumen por categoria:';
SELECT
    Categoria,
    COUNT(*) AS TotalValidaciones,
    SUM(CASE WHEN EsCritico = 1 THEN 1 ELSE 0 END) AS Criticas,
    SUM(CASE WHEN CodigoValidacion = 0 THEN 1 ELSE 0 END) AS OK
FROM logs.Validaciones_Ejecucion
WHERE ID_Ejecucion = @ID_Ejecucion
GROUP BY Categoria;

-- ============================================================================
-- PASO 7: VERIFICAR RESULTADOS CUBO
-- ============================================================================
PRINT '';
PRINT '------------------------------------------------------------------------';
PRINT ' PASO 7: VERIFICAR RESULTADOS CUBO';
PRINT '------------------------------------------------------------------------';

-- Resumen CUBO_Final
PRINT '  CUBO_Final:';
SELECT
    COUNT(*) AS TotalRegistros,
    FORMAT(SUM(TotalMVal), 'N2') AS TotalMVal,
    COUNT(DISTINCT ID_Instrumento) AS Instrumentos,
    COUNT(DISTINCT id_CURR) AS Monedas
FROM process.CUBO_Final
WHERE ID_Ejecucion = @ID_Ejecucion;

-- Por tipo
PRINT '';
PRINT '  Por TipoRegistro:';
SELECT
    TipoRegistro,
    COUNT(*) AS Registros,
    FORMAT(SUM(TotalMVal), 'N2') AS TotalMVal
FROM process.CUBO_Final
WHERE ID_Ejecucion = @ID_Ejecucion
GROUP BY TipoRegistro;

-- ============================================================================
-- PASO 8: ALERTAS EN SANDBOX
-- ============================================================================
PRINT '';
PRINT '------------------------------------------------------------------------';
PRINT ' PASO 8: ALERTAS EN SANDBOX';
PRINT '------------------------------------------------------------------------';

-- Conteo de alertas
SELECT 'Homologacion_Fondos' AS Tabla, COUNT(*) AS Registros FROM sandbox.Homologacion_Fondos WHERE ID_Ejecucion = @ID_Ejecucion
UNION ALL SELECT 'Homologacion_Instrumentos', COUNT(*) FROM sandbox.Homologacion_Instrumentos WHERE ID_Ejecucion = @ID_Ejecucion
UNION ALL SELECT 'Homologacion_Monedas', COUNT(*) FROM sandbox.Homologacion_Monedas WHERE ID_Ejecucion = @ID_Ejecucion
UNION ALL SELECT 'Alertas_Suciedades_IPA', COUNT(*) FROM sandbox.Alertas_Suciedades_IPA WHERE ID_Ejecucion = @ID_Ejecucion
UNION ALL SELECT 'Alertas_Descuadre_Cash', COUNT(*) FROM sandbox.Alertas_Descuadre_Cash WHERE ID_Ejecucion = @ID_Ejecucion
UNION ALL SELECT 'Alertas_Descuadre_Derivados', COUNT(*) FROM sandbox.Alertas_Descuadre_Derivados WHERE ID_Ejecucion = @ID_Ejecucion
UNION ALL SELECT 'Alertas_Descuadre_NAV', COUNT(*) FROM sandbox.Alertas_Descuadre_NAV WHERE ID_Ejecucion = @ID_Ejecucion
UNION ALL SELECT 'Alertas_Extract_Faltante', COUNT(*) FROM sandbox.Alertas_Extract_Faltante WHERE ID_Ejecucion = @ID_Ejecucion;

-- ============================================================================
-- PASO 9: DETALLE DE ALERTAS (si existen)
-- ============================================================================
PRINT '';
PRINT '------------------------------------------------------------------------';
PRINT ' PASO 9: DETALLE DE ALERTAS';
PRINT '------------------------------------------------------------------------';

-- Suciedades
IF EXISTS (SELECT 1 FROM sandbox.Alertas_Suciedades_IPA WHERE ID_Ejecucion = @ID_Ejecucion)
BEGIN
    PRINT '  >> Suciedades detectadas:';
    SELECT InvestID, InvestDescription, Qty, MVBook, AI
    FROM sandbox.Alertas_Suciedades_IPA WHERE ID_Ejecucion = @ID_Ejecucion;
END

-- Instrumentos sin homologar
IF EXISTS (SELECT 1 FROM sandbox.Homologacion_Instrumentos WHERE ID_Ejecucion = @ID_Ejecucion)
BEGIN
    PRINT '  >> Instrumentos sin homologar (TOP 20):';
    SELECT TOP 20 Instrumento, Currency, Source
    FROM sandbox.Homologacion_Instrumentos WHERE ID_Ejecucion = @ID_Ejecucion;
END

-- Monedas sin homologar
IF EXISTS (SELECT 1 FROM sandbox.Homologacion_Monedas WHERE ID_Ejecucion = @ID_Ejecucion)
BEGIN
    PRINT '  >> Monedas sin homologar:';
    SELECT Moneda, Source
    FROM sandbox.Homologacion_Monedas WHERE ID_Ejecucion = @ID_Ejecucion;
END

-- Extracts faltantes
IF EXISTS (SELECT 1 FROM sandbox.Alertas_Extract_Faltante WHERE ID_Ejecucion = @ID_Ejecucion)
BEGIN
    PRINT '  >> Extracts faltantes:';
    SELECT TipoReporte, Obligatorio
    FROM sandbox.Alertas_Extract_Faltante WHERE ID_Ejecucion = @ID_Ejecucion;
END

-- Descuadre Cash
IF EXISTS (SELECT 1 FROM sandbox.Alertas_Descuadre_Cash WHERE ID_Ejecucion = @ID_Ejecucion)
BEGIN
    PRINT '  >> Descuadre Cash:';
    SELECT Portfolio, Total_IPA_Cash, Total_CAPM, Diferencia, UmbralAplicado
    FROM sandbox.Alertas_Descuadre_Cash WHERE ID_Ejecucion = @ID_Ejecucion;
END

-- Descuadre Derivados
IF EXISTS (SELECT 1 FROM sandbox.Alertas_Descuadre_Derivados WHERE ID_Ejecucion = @ID_Ejecucion)
BEGIN
    PRINT '  >> Descuadre Derivados:';
    SELECT Portfolio, MVBook_IPA, MTM_Derivados, Diferencia, UmbralAplicado
    FROM sandbox.Alertas_Descuadre_Derivados WHERE ID_Ejecucion = @ID_Ejecucion;
END

-- Descuadre NAV
IF EXISTS (SELECT 1 FROM sandbox.Alertas_Descuadre_NAV WHERE ID_Ejecucion = @ID_Ejecucion)
BEGIN
    PRINT '  >> Descuadre NAV:';
    SELECT Portfolio, Total_IPA, Total_SONA, Diferencia, UmbralAplicado
    FROM sandbox.Alertas_Descuadre_NAV WHERE ID_Ejecucion = @ID_Ejecucion;
END

PRINT '';
PRINT '========================================================================';
PRINT '                    TEST COMPLETADO';
PRINT '========================================================================';
GO
