/*
================================================================================
TEST: Ejecucion Paralela de 2 Fondos (MLATHY + Alturas II)
================================================================================
Descripcion: Simula ejecucion paralela de 2 fondos para validar:
  - Estructura N:M del sandbox
  - Conteos correctos por fondo
  - Items compartidos entre fondos
  - Vistas para el operador del frontend

Fondos:
  - MLATHY (ID_Fund a determinar)
  - Alturas II (ID_Fund = 2)

Fecha: 2024-12-25

Autor: Refactorizacion Pipeline IPA
Fecha: 2026-01-05
================================================================================
*/

USE INTELIGENCIA_PRODUCTO_FULLSTACK;
GO

SET NOCOUNT ON;

-- ============================================================================
-- PASO 0: DETERMINAR ID_Fund DE LOS FONDOS
-- ============================================================================
PRINT '========================================================================'
PRINT '         TEST PARALELO - MLATHY + ALTURAS II'
PRINT '========================================================================'
PRINT ''

DECLARE @FechaReporte NVARCHAR(10) = '2024-12-25';

-- IDs de ejecucion distintos para simular ejecucion paralela
DECLARE @ID_Proceso_1 BIGINT = 201;
DECLARE @ID_Ejecucion_1 BIGINT = 201;
DECLARE @ID_Proceso_2 BIGINT = 202;
DECLARE @ID_Ejecucion_2 BIGINT = 202;

-- Fondos
DECLARE @ID_Fund_MLATHY INT;
DECLARE @ID_Fund_AlturasII INT = 2;
DECLARE @Portfolio_MLATHY NVARCHAR(100) = 'MLATHY';
DECLARE @Portfolio_AlturasII NVARCHAR(100) = 'ALTURAS II';

-- Buscar ID_Fund de MLATHY
SELECT @ID_Fund_MLATHY = ID_Fund
FROM dimensionales.BD_Funds
WHERE Fund_Code LIKE '%MLATHY%' OR Fund_Code LIKE '%MLathy%';

IF @ID_Fund_MLATHY IS NULL
BEGIN
    PRINT 'ERROR: No se encontro fondo MLATHY en BD_Funds'
    PRINT 'Fondos disponibles:'
    SELECT TOP 20 ID_Fund, Fund_Code FROM dimensionales.BD_Funds ORDER BY ID_Fund;
    RETURN;
END

PRINT 'Fondos identificados:'
PRINT '  MLATHY:     ID_Fund = ' + CAST(@ID_Fund_MLATHY AS NVARCHAR(10))
PRINT '  Alturas II: ID_Fund = ' + CAST(@ID_Fund_AlturasII AS NVARCHAR(10))
PRINT ''
PRINT 'Fecha Reporte: ' + @FechaReporte
PRINT ''

-- Variables de salida
DECLARE @ReturnCode_1 INT, @ErrorMessage_1 NVARCHAR(500);
DECLARE @ReturnCode_2 INT, @ErrorMessage_2 NVARCHAR(500);
DECLARE @RegistrosIPA INT, @RegistrosCAPM INT, @RegistrosSONA INT;
DECLARE @RegistrosPNL INT, @RegistrosDerivados INT;
DECLARE @SuciedadesCount INT, @HomolFondosCount INT;
DECLARE @HomolInstrumentosCount INT, @HomolMonedasCount INT;

-- ============================================================================
-- PASO 1: LIMPIAR DATOS DE EJECUCIONES ANTERIORES
-- ============================================================================
PRINT '------------------------------------------------------------------------'
PRINT ' PASO 1: LIMPIAR DATOS PREVIOS'
PRINT '------------------------------------------------------------------------'

-- Limpiar extracts
DELETE FROM extract.IPA WHERE ID_Ejecucion IN (@ID_Ejecucion_1, @ID_Ejecucion_2);
DELETE FROM extract.CAPM WHERE ID_Ejecucion IN (@ID_Ejecucion_1, @ID_Ejecucion_2);
DELETE FROM extract.SONA WHERE ID_Ejecucion IN (@ID_Ejecucion_1, @ID_Ejecucion_2);
DELETE FROM extract.PNL WHERE ID_Ejecucion IN (@ID_Ejecucion_1, @ID_Ejecucion_2);
DELETE FROM extract.Derivados WHERE ID_Ejecucion IN (@ID_Ejecucion_1, @ID_Ejecucion_2);
DELETE FROM extract.PosModRF WHERE ID_Ejecucion IN (@ID_Ejecucion_1, @ID_Ejecucion_2);

-- Limpiar logs
DELETE FROM logs.Validaciones_Ejecucion WHERE ID_Ejecucion IN (@ID_Ejecucion_1, @ID_Ejecucion_2);

-- Limpiar sandbox por ejecucion (tablas que mantienen ID_Ejecucion)
DELETE FROM sandbox.Alertas_Extract_Faltante WHERE ID_Ejecucion IN (@ID_Ejecucion_1, @ID_Ejecucion_2);
DELETE FROM sandbox.Alertas_Descuadre_Cash WHERE ID_Ejecucion IN (@ID_Ejecucion_1, @ID_Ejecucion_2);
DELETE FROM sandbox.Alertas_Descuadre_NAV WHERE ID_Ejecucion IN (@ID_Ejecucion_1, @ID_Ejecucion_2);
DELETE FROM sandbox.Alertas_Descuadre_Derivados WHERE ID_Ejecucion IN (@ID_Ejecucion_1, @ID_Ejecucion_2);

-- Limpiar process
DELETE FROM process.CUBO_Final WHERE ID_Ejecucion IN (@ID_Ejecucion_1, @ID_Ejecucion_2);

-- OPCIONAL: Limpiar sandbox global para este test (resetear estado)
-- Comentar estas lineas si quieres mantener historial
DELETE FROM sandbox.Homologacion_Instrumentos_Fondos WHERE ID_Fund IN (@ID_Fund_MLATHY, @ID_Fund_AlturasII);
DELETE FROM sandbox.Homologacion_Monedas_Fondos WHERE ID_Fund IN (@ID_Fund_MLATHY, @ID_Fund_AlturasII);
DELETE FROM sandbox.Homologacion_Fondos_Fondos WHERE ID_Fund IN (@ID_Fund_MLATHY, @ID_Fund_AlturasII);
DELETE FROM sandbox.Alertas_Suciedades_IPA_Fondos WHERE ID_Fund IN (@ID_Fund_MLATHY, @ID_Fund_AlturasII);

-- Limpiar items huerfanos (sin relaciones)
DELETE FROM sandbox.Homologacion_Instrumentos WHERE ID NOT IN (SELECT ID_Homologacion FROM sandbox.Homologacion_Instrumentos_Fondos);
DELETE FROM sandbox.Homologacion_Monedas WHERE ID NOT IN (SELECT ID_Homologacion FROM sandbox.Homologacion_Monedas_Fondos);
DELETE FROM sandbox.Homologacion_Fondos WHERE ID NOT IN (SELECT ID_Homologacion FROM sandbox.Homologacion_Fondos_Fondos);
DELETE FROM sandbox.Alertas_Suciedades_IPA WHERE ID NOT IN (SELECT ID_Suciedad FROM sandbox.Alertas_Suciedades_IPA_Fondos);

PRINT '  [OK] Datos limpiados'
PRINT ''

-- ============================================================================
-- PASO 2: EJECUTAR EXTRACTS PARA AMBOS FONDOS
-- ============================================================================
PRINT '------------------------------------------------------------------------'
PRINT ' PASO 2: EJECUTAR EXTRACTS'
PRINT '------------------------------------------------------------------------'

-- === FONDO 1: MLATHY ===
PRINT ''
PRINT '  >> MLATHY (ID_Ejecucion = ' + CAST(@ID_Ejecucion_1 AS NVARCHAR(10)) + ')'

EXEC extract.Extract_IPA @FechaReporte, @ID_Proceso_1, @ID_Ejecucion_1, @ID_Fund_MLATHY, @Portfolio_MLATHY;
EXEC extract.Extract_CAPM @FechaReporte, @ID_Proceso_1, @ID_Ejecucion_1, @ID_Fund_MLATHY, @Portfolio_MLATHY;
EXEC extract.Extract_SONA @FechaReporte, @ID_Proceso_1, @ID_Ejecucion_1, @ID_Fund_MLATHY, @Portfolio_MLATHY;
EXEC extract.Extract_PNL @FechaReporte, @ID_Proceso_1, @ID_Ejecucion_1, @ID_Fund_MLATHY, @Portfolio_MLATHY;
EXEC extract.Extract_PosModRF @FechaReporte, @ID_Proceso_1, @ID_Ejecucion_1, @ID_Fund_MLATHY, @Portfolio_MLATHY;
EXEC extract.Extract_Derivados @FechaReporte, @ID_Proceso_1, @ID_Ejecucion_1, @ID_Fund_MLATHY, @Portfolio_MLATHY;

-- === FONDO 2: ALTURAS II ===
PRINT ''
PRINT '  >> ALTURAS II (ID_Ejecucion = ' + CAST(@ID_Ejecucion_2 AS NVARCHAR(10)) + ')'

EXEC extract.Extract_IPA @FechaReporte, @ID_Proceso_2, @ID_Ejecucion_2, @ID_Fund_AlturasII, @Portfolio_AlturasII;
EXEC extract.Extract_CAPM @FechaReporte, @ID_Proceso_2, @ID_Ejecucion_2, @ID_Fund_AlturasII, @Portfolio_AlturasII;
EXEC extract.Extract_SONA @FechaReporte, @ID_Proceso_2, @ID_Ejecucion_2, @ID_Fund_AlturasII, @Portfolio_AlturasII;
EXEC extract.Extract_PNL @FechaReporte, @ID_Proceso_2, @ID_Ejecucion_2, @ID_Fund_AlturasII, @Portfolio_AlturasII;
EXEC extract.Extract_PosModRF @FechaReporte, @ID_Proceso_2, @ID_Ejecucion_2, @ID_Fund_AlturasII, @Portfolio_AlturasII;
EXEC extract.Extract_Derivados @FechaReporte, @ID_Proceso_2, @ID_Ejecucion_2, @ID_Fund_AlturasII, @Portfolio_AlturasII;

PRINT ''
PRINT '  Resumen de extracts:'
SELECT
    CASE WHEN ID_Ejecucion = @ID_Ejecucion_1 THEN 'MLATHY' ELSE 'ALTURAS II' END AS Fondo,
    'IPA' AS Extract, COUNT(*) AS Registros
FROM extract.IPA WHERE ID_Ejecucion IN (@ID_Ejecucion_1, @ID_Ejecucion_2) GROUP BY ID_Ejecucion
UNION ALL
SELECT CASE WHEN ID_Ejecucion = @ID_Ejecucion_1 THEN 'MLATHY' ELSE 'ALTURAS II' END, 'CAPM', COUNT(*)
FROM extract.CAPM WHERE ID_Ejecucion IN (@ID_Ejecucion_1, @ID_Ejecucion_2) GROUP BY ID_Ejecucion
UNION ALL
SELECT CASE WHEN ID_Ejecucion = @ID_Ejecucion_1 THEN 'MLATHY' ELSE 'ALTURAS II' END, 'SONA', COUNT(*)
FROM extract.SONA WHERE ID_Ejecucion IN (@ID_Ejecucion_1, @ID_Ejecucion_2) GROUP BY ID_Ejecucion
UNION ALL
SELECT CASE WHEN ID_Ejecucion = @ID_Ejecucion_1 THEN 'MLATHY' ELSE 'ALTURAS II' END, 'PNL', COUNT(*)
FROM extract.PNL WHERE ID_Ejecucion IN (@ID_Ejecucion_1, @ID_Ejecucion_2) GROUP BY ID_Ejecucion
ORDER BY Fondo, Extract;

-- ============================================================================
-- PASO 3: EJECUTAR VALIDACIONES PARA AMBOS FONDOS
-- ============================================================================
PRINT ''
PRINT '------------------------------------------------------------------------'
PRINT ' PASO 3: EJECUTAR VALIDACIONES (sp_ValidateFund v6)'
PRINT '------------------------------------------------------------------------'

-- === VALIDAR FONDO 1: MLATHY ===
PRINT ''
PRINT '  >> Validando MLATHY...'

EXEC @ReturnCode_1 = staging.sp_ValidateFund
    @ID_Ejecucion = @ID_Ejecucion_1,
    @ID_Proceso = @ID_Proceso_1,
    @ID_Fund = @ID_Fund_MLATHY,
    @FechaReporte = @FechaReporte,
    @ErrorMessage = @ErrorMessage_1 OUTPUT,
    @RegistrosIPA = @RegistrosIPA OUTPUT,
    @RegistrosCAPM = @RegistrosCAPM OUTPUT,
    @RegistrosSONA = @RegistrosSONA OUTPUT,
    @RegistrosPNL = @RegistrosPNL OUTPUT,
    @RegistrosDerivados = @RegistrosDerivados OUTPUT,
    @SuciedadesCount = @SuciedadesCount OUTPUT,
    @HomolFondosCount = @HomolFondosCount OUTPUT,
    @HomolInstrumentosCount = @HomolInstrumentosCount OUTPUT,
    @HomolMonedasCount = @HomolMonedasCount OUTPUT;

PRINT '  MLATHY - Codigo: ' + CAST(@ReturnCode_1 AS NVARCHAR(10)) +
      ' | Instrumentos: ' + CAST(@HomolInstrumentosCount AS NVARCHAR(10)) +
      ' | Monedas: ' + CAST(@HomolMonedasCount AS NVARCHAR(10));

-- === VALIDAR FONDO 2: ALTURAS II ===
PRINT ''
PRINT '  >> Validando ALTURAS II...'

EXEC @ReturnCode_2 = staging.sp_ValidateFund
    @ID_Ejecucion = @ID_Ejecucion_2,
    @ID_Proceso = @ID_Proceso_2,
    @ID_Fund = @ID_Fund_AlturasII,
    @FechaReporte = @FechaReporte,
    @ErrorMessage = @ErrorMessage_2 OUTPUT,
    @RegistrosIPA = @RegistrosIPA OUTPUT,
    @RegistrosCAPM = @RegistrosCAPM OUTPUT,
    @RegistrosSONA = @RegistrosSONA OUTPUT,
    @RegistrosPNL = @RegistrosPNL OUTPUT,
    @RegistrosDerivados = @RegistrosDerivados OUTPUT,
    @SuciedadesCount = @SuciedadesCount OUTPUT,
    @HomolFondosCount = @HomolFondosCount OUTPUT,
    @HomolInstrumentosCount = @HomolInstrumentosCount OUTPUT,
    @HomolMonedasCount = @HomolMonedasCount OUTPUT;

PRINT '  ALTURAS II - Codigo: ' + CAST(@ReturnCode_2 AS NVARCHAR(10)) +
      ' | Instrumentos: ' + CAST(@HomolInstrumentosCount AS NVARCHAR(10)) +
      ' | Monedas: ' + CAST(@HomolMonedasCount AS NVARCHAR(10));

-- ============================================================================
-- PASO 4: LO QUE VERIA EL OPERADOR EN EL FRONTEND
-- ============================================================================
PRINT ''
PRINT '========================================================================'
PRINT '       VISTA DEL OPERADOR (FRONTEND)'
PRINT '========================================================================'

-- 4.1: Dashboard Principal - Resumen por Fondo
PRINT ''
PRINT '  [DASHBOARD] Pendientes por Fondo:'
PRINT '  ---------------------------------'

SELECT
    ID_Fund,
    Fund_Code AS Fondo,
    TipoHomologacion AS Tipo,
    CantidadPendiente AS Pendientes
FROM sandbox.vw_Pendientes_Por_Fondo
WHERE ID_Fund IN (@ID_Fund_MLATHY, @ID_Fund_AlturasII)
ORDER BY ID_Fund, TipoHomologacion;

-- 4.2: Resumen Total Global
PRINT ''
PRINT '  [RESUMEN GLOBAL] Totales del sistema:'
PRINT '  -------------------------------------'

SELECT * FROM sandbox.vw_Resumen_Pendientes_Total;

-- 4.3: Detalle de Instrumentos Pendientes (con fondos afectados)
PRINT ''
PRINT '  [DETALLE] Instrumentos pendientes (TOP 20):'
PRINT '  -------------------------------------------'

SELECT TOP 20
    Instrumento,
    Source,
    Currency,
    FondosAfectados,
    CantidadFondos
FROM sandbox.vw_Homologacion_Instrumentos_Pendientes
ORDER BY CantidadFondos DESC, Instrumento;

-- 4.4: Detalle de Monedas Pendientes
PRINT ''
PRINT '  [DETALLE] Monedas pendientes:'
PRINT '  -----------------------------'

SELECT
    Moneda,
    Source,
    FondosAfectados,
    CantidadFondos
FROM sandbox.vw_Homologacion_Monedas_Pendientes
ORDER BY CantidadFondos DESC;

-- 4.5: Items COMPARTIDOS entre fondos
PRINT ''
PRINT '  [COMPARTIDOS] Items que afectan a AMBOS fondos:'
PRINT '  ------------------------------------------------'

SELECT
    'INSTRUMENTO' AS Tipo,
    Instrumento AS Item,
    Source,
    FondosAfectados
FROM sandbox.vw_Homologacion_Instrumentos_Pendientes
WHERE CantidadFondos >= 2

UNION ALL

SELECT
    'MONEDA' AS Tipo,
    Moneda AS Item,
    Source,
    FondosAfectados
FROM sandbox.vw_Homologacion_Monedas_Pendientes
WHERE CantidadFondos >= 2;

-- ============================================================================
-- PASO 5: LO QUE HAY EN EL SANDBOX (TABLAS REALES)
-- ============================================================================
PRINT ''
PRINT '========================================================================'
PRINT '       CONTENIDO DEL SANDBOX (TABLAS REALES)'
PRINT '========================================================================'

-- 5.1: Tabla principal de instrumentos
PRINT ''
PRINT '  [TABLA] sandbox.Homologacion_Instrumentos (TOP 20):'
PRINT '  ----------------------------------------------------'

SELECT TOP 20
    ID, Instrumento, Source, Currency, Estado,
    FORMAT(FechaDeteccion, 'yyyy-MM-dd HH:mm') AS FechaDeteccion
FROM sandbox.Homologacion_Instrumentos
ORDER BY FechaDeteccion DESC;

-- 5.2: Relaciones Instrumentos-Fondos
PRINT ''
PRINT '  [TABLA] sandbox.Homologacion_Instrumentos_Fondos:'
PRINT '  --------------------------------------------------'

SELECT
    hf.ID_Homologacion,
    h.Instrumento,
    h.Source,
    hf.ID_Fund,
    f.Fund_Code
FROM sandbox.Homologacion_Instrumentos_Fondos hf
INNER JOIN sandbox.Homologacion_Instrumentos h ON hf.ID_Homologacion = h.ID
LEFT JOIN dimensionales.BD_Funds f ON hf.ID_Fund = f.ID_Fund
WHERE hf.ID_Fund IN (@ID_Fund_MLATHY, @ID_Fund_AlturasII)
ORDER BY h.Instrumento, hf.ID_Fund;

-- 5.3: Tabla principal de monedas
PRINT ''
PRINT '  [TABLA] sandbox.Homologacion_Monedas:'
PRINT '  -------------------------------------'

SELECT
    ID, Moneda, Source, Estado,
    FORMAT(FechaDeteccion, 'yyyy-MM-dd HH:mm') AS FechaDeteccion
FROM sandbox.Homologacion_Monedas
ORDER BY FechaDeteccion DESC;

-- 5.4: Relaciones Monedas-Fondos
PRINT ''
PRINT '  [TABLA] sandbox.Homologacion_Monedas_Fondos:'
PRINT '  --------------------------------------------'

SELECT
    hf.ID_Homologacion,
    h.Moneda,
    h.Source,
    hf.ID_Fund,
    f.Fund_Code
FROM sandbox.Homologacion_Monedas_Fondos hf
INNER JOIN sandbox.Homologacion_Monedas h ON hf.ID_Homologacion = h.ID
LEFT JOIN dimensionales.BD_Funds f ON hf.ID_Fund = f.ID_Fund
WHERE hf.ID_Fund IN (@ID_Fund_MLATHY, @ID_Fund_AlturasII)
ORDER BY h.Moneda, hf.ID_Fund;

-- ============================================================================
-- PASO 6: ESTADISTICAS FINALES
-- ============================================================================
PRINT ''
PRINT '========================================================================'
PRINT '       ESTADISTICAS FINALES'
PRINT '========================================================================'

-- Conteo de items unicos vs relaciones
SELECT
    'Instrumentos' AS Tipo,
    (SELECT COUNT(*) FROM sandbox.Homologacion_Instrumentos WHERE Estado = 'Pendiente') AS ItemsUnicos,
    (SELECT COUNT(*) FROM sandbox.Homologacion_Instrumentos_Fondos hf
     INNER JOIN sandbox.Homologacion_Instrumentos h ON hf.ID_Homologacion = h.ID
     WHERE h.Estado = 'Pendiente') AS TotalRelaciones,
    (SELECT COUNT(*) FROM sandbox.Homologacion_Instrumentos_Fondos hf
     INNER JOIN sandbox.Homologacion_Instrumentos h ON hf.ID_Homologacion = h.ID
     WHERE h.Estado = 'Pendiente' AND hf.ID_Fund = @ID_Fund_MLATHY) AS 'MLATHY',
    (SELECT COUNT(*) FROM sandbox.Homologacion_Instrumentos_Fondos hf
     INNER JOIN sandbox.Homologacion_Instrumentos h ON hf.ID_Homologacion = h.ID
     WHERE h.Estado = 'Pendiente' AND hf.ID_Fund = @ID_Fund_AlturasII) AS 'ALTURAS_II'

UNION ALL

SELECT
    'Monedas',
    (SELECT COUNT(*) FROM sandbox.Homologacion_Monedas WHERE Estado = 'Pendiente'),
    (SELECT COUNT(*) FROM sandbox.Homologacion_Monedas_Fondos hf
     INNER JOIN sandbox.Homologacion_Monedas h ON hf.ID_Homologacion = h.ID
     WHERE h.Estado = 'Pendiente'),
    (SELECT COUNT(*) FROM sandbox.Homologacion_Monedas_Fondos hf
     INNER JOIN sandbox.Homologacion_Monedas h ON hf.ID_Homologacion = h.ID
     WHERE h.Estado = 'Pendiente' AND hf.ID_Fund = @ID_Fund_MLATHY),
    (SELECT COUNT(*) FROM sandbox.Homologacion_Monedas_Fondos hf
     INNER JOIN sandbox.Homologacion_Monedas h ON hf.ID_Homologacion = h.ID
     WHERE h.Estado = 'Pendiente' AND hf.ID_Fund = @ID_Fund_AlturasII);

PRINT ''
PRINT '========================================================================'
PRINT '       TEST COMPLETADO'
PRINT '========================================================================'
PRINT ''
PRINT 'Proximos pasos:'
PRINT '  1. Ejecutar 04a_Homologar_Instrumento.sql para homologar un instrumento'
PRINT '  2. Re-ejecutar este test para ver el efecto'
PRINT ''
GO
