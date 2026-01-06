/*
================================================================================
TEST GENERICO: Validacion Paralela de 2 Fondos
================================================================================
Descripcion: Script configurable para probar el pipeline con cualquier par de
             fondos. Solo modifica las variables en la seccion CONFIGURACION.

Uso:
  1. Actualiza las variables en CONFIGURACION
  2. Ejecuta el script completo (F5)
  3. Revisa los resultados al final

Autor: Refactorizacion Pipeline IPA
Fecha: 2026-01-06
================================================================================
*/

USE INTELIGENCIA_PRODUCTO_FULLSTACK;
GO

SET NOCOUNT ON;

SET STATISTICS IO ON;
SET STATISTICS TIME ON;

-- ============================================================================
-- CONFIGURACION (MODIFICAR AQUI)
-- ============================================================================
DECLARE @FechaReporte DATE = '2025-12-25';  -- Fecha a procesar (tipo DATE para evitar CONVERT)
DECLARE @ID_Fund_1 INT = 20;                        -- ID del fondo 1
DECLARE @ID_Fund_2 INT = 2;                         -- ID del fondo 2

-- IDs de ejecucion (cambiar si hay conflicto)
DECLARE @ID_Ejecucion_1 BIGINT = 501;
DECLARE @ID_Ejecucion_2 BIGINT = 502;

-- ============================================================================
-- NO MODIFICAR DEBAJO DE ESTA LINEA
-- ============================================================================

-- Obtener Portfolio (Fund_Code) desde BD_Funds
DECLARE @Portfolio_1 NVARCHAR(100);
DECLARE @Portfolio_2 NVARCHAR(100);
DECLARE @ID_Proceso_1 BIGINT = @ID_Ejecucion_1;
DECLARE @ID_Proceso_2 BIGINT = @ID_Ejecucion_2;

SELECT @Portfolio_1 = Fund_Code FROM dimensionales.BD_Funds WHERE ID_Fund = @ID_Fund_1;
SELECT @Portfolio_2 = Fund_Code FROM dimensionales.BD_Funds WHERE ID_Fund = @ID_Fund_2;

IF @Portfolio_1 IS NULL
BEGIN
    RAISERROR('ID_Fund_1 no existe en BD_Funds', 16, 1);
    RETURN;
END
IF @Portfolio_2 IS NULL
BEGIN
    RAISERROR('ID_Fund_2 no existe en BD_Funds', 16, 1);
    RETURN;
END

-- Variables de salida
DECLARE @ReturnCode INT, @ErrorMessage NVARCHAR(500);
DECLARE @RegistrosIPA INT, @RegistrosCAPM INT, @RegistrosSONA INT;
DECLARE @RegistrosPNL INT, @RegistrosDerivados INT;
DECLARE @SuciedadesCount INT, @HomolFondosCount INT;
DECLARE @HomolInstrumentosCount INT, @HomolMonedasCount INT;

-- Tabla temporal para resultados
CREATE TABLE #Resultados (
    Orden INT,
    Fondo NVARCHAR(100),
    ID_Fund INT,
    CodigoRetorno INT,
    IPA INT,
    CAPM INT,
    SONA INT,
    PNL INT,
    Derivados INT,
    Suciedades INT,
    InstrumentosPend INT,
    MonedasPend INT,
    FondosPend INT,
    Mensaje NVARCHAR(500)
);

PRINT '================================================================================'
PRINT '  TEST GENERICO: VALIDACION PARALELA DE 2 FONDOS'
PRINT '================================================================================'
PRINT ''
PRINT '  Fecha Reporte: ' + CONVERT(NVARCHAR(10), @FechaReporte, 120)
PRINT '  Fondo 1: ' + @Portfolio_1 + ' (ID: ' + CAST(@ID_Fund_1 AS NVARCHAR(10)) + ')'
PRINT '  Fondo 2: ' + @Portfolio_2 + ' (ID: ' + CAST(@ID_Fund_2 AS NVARCHAR(10)) + ')'
PRINT ''

-- ============================================================================
-- PASO 1: LIMPIEZA
-- ============================================================================
PRINT '------------------------------------------------------------------------'
PRINT ' PASO 1: Limpieza de datos previos'
PRINT '------------------------------------------------------------------------'

DELETE FROM extract.IPA WHERE ID_Ejecucion IN (@ID_Ejecucion_1, @ID_Ejecucion_2);
DELETE FROM extract.CAPM WHERE ID_Ejecucion IN (@ID_Ejecucion_1, @ID_Ejecucion_2);
DELETE FROM extract.SONA WHERE ID_Ejecucion IN (@ID_Ejecucion_1, @ID_Ejecucion_2);
DELETE FROM extract.PNL WHERE ID_Ejecucion IN (@ID_Ejecucion_1, @ID_Ejecucion_2);
DELETE FROM extract.Derivados WHERE ID_Ejecucion IN (@ID_Ejecucion_1, @ID_Ejecucion_2);
DELETE FROM extract.PosModRF WHERE ID_Ejecucion IN (@ID_Ejecucion_1, @ID_Ejecucion_2);
DELETE FROM logs.Validaciones_Ejecucion WHERE ID_Ejecucion IN (@ID_Ejecucion_1, @ID_Ejecucion_2);
DELETE FROM sandbox.Alertas_Extract_Faltante WHERE ID_Ejecucion IN (@ID_Ejecucion_1, @ID_Ejecucion_2);

PRINT '  [OK] Limpieza completada'
PRINT ''

-- ============================================================================
-- PASO 2: EJECUTAR EXTRACTS - FONDO 1
-- ============================================================================
PRINT '------------------------------------------------------------------------'
PRINT ' PASO 2: Extracts - ' + @Portfolio_1
PRINT '------------------------------------------------------------------------'

BEGIN TRY
    EXEC extract.Extract_IPA @FechaReporte, @ID_Proceso_1, @ID_Ejecucion_1, @ID_Fund_1, @Portfolio_1;
    PRINT '  [OK] Extract_IPA'
END TRY BEGIN CATCH PRINT '  [SKIP] Extract_IPA: ' + ERROR_MESSAGE() END CATCH

BEGIN TRY
    EXEC extract.Extract_CAPM @FechaReporte, @ID_Proceso_1, @ID_Ejecucion_1, @ID_Fund_1, @Portfolio_1;
    PRINT '  [OK] Extract_CAPM'
END TRY BEGIN CATCH PRINT '  [SKIP] Extract_CAPM: ' + ERROR_MESSAGE() END CATCH

BEGIN TRY
    EXEC extract.Extract_SONA @FechaReporte, @ID_Proceso_1, @ID_Ejecucion_1, @ID_Fund_1, @Portfolio_1;
    PRINT '  [OK] Extract_SONA'
END TRY BEGIN CATCH PRINT '  [SKIP] Extract_SONA: ' + ERROR_MESSAGE() END CATCH

BEGIN TRY
    EXEC extract.Extract_PNL @FechaReporte, @ID_Proceso_1, @ID_Ejecucion_1, @ID_Fund_1, @Portfolio_1;
    PRINT '  [OK] Extract_PNL'
END TRY BEGIN CATCH PRINT '  [SKIP] Extract_PNL: ' + ERROR_MESSAGE() END CATCH

PRINT ''

-- ============================================================================
-- PASO 3: EJECUTAR EXTRACTS - FONDO 2
-- ============================================================================
PRINT '------------------------------------------------------------------------'
PRINT ' PASO 3: Extracts - ' + @Portfolio_2
PRINT '------------------------------------------------------------------------'

BEGIN TRY
    EXEC extract.Extract_IPA @FechaReporte, @ID_Proceso_2, @ID_Ejecucion_2, @ID_Fund_2, @Portfolio_2;
    PRINT '  [OK] Extract_IPA'
END TRY BEGIN CATCH PRINT '  [SKIP] Extract_IPA: ' + ERROR_MESSAGE() END CATCH

BEGIN TRY
    EXEC extract.Extract_CAPM @FechaReporte, @ID_Proceso_2, @ID_Ejecucion_2, @ID_Fund_2, @Portfolio_2;
    PRINT '  [OK] Extract_CAPM'
END TRY BEGIN CATCH PRINT '  [SKIP] Extract_CAPM: ' + ERROR_MESSAGE() END CATCH

BEGIN TRY
    EXEC extract.Extract_SONA @FechaReporte, @ID_Proceso_2, @ID_Ejecucion_2, @ID_Fund_2, @Portfolio_2;
    PRINT '  [OK] Extract_SONA'
END TRY BEGIN CATCH PRINT '  [SKIP] Extract_SONA: ' + ERROR_MESSAGE() END CATCH

BEGIN TRY
    EXEC extract.Extract_PNL @FechaReporte, @ID_Proceso_2, @ID_Ejecucion_2, @ID_Fund_2, @Portfolio_2;
    PRINT '  [OK] Extract_PNL'
END TRY BEGIN CATCH PRINT '  [SKIP] Extract_PNL: ' + ERROR_MESSAGE() END CATCH

PRINT ''

-- ============================================================================
-- PASO 4: VALIDAR FONDO 1
-- ============================================================================
PRINT '------------------------------------------------------------------------'
PRINT ' PASO 4: Validacion - ' + @Portfolio_1
PRINT '------------------------------------------------------------------------'

EXEC @ReturnCode = staging.sp_ValidateFund
    @ID_Ejecucion = @ID_Ejecucion_1,
    @ID_Proceso = @ID_Proceso_1,
    @ID_Fund = @ID_Fund_1,
    @FechaReporte = @FechaReporte,
    @ErrorMessage = @ErrorMessage OUTPUT,
    @RegistrosIPA = @RegistrosIPA OUTPUT,
    @RegistrosCAPM = @RegistrosCAPM OUTPUT,
    @RegistrosSONA = @RegistrosSONA OUTPUT,
    @RegistrosPNL = @RegistrosPNL OUTPUT,
    @RegistrosDerivados = @RegistrosDerivados OUTPUT,
    @SuciedadesCount = @SuciedadesCount OUTPUT,
    @HomolFondosCount = @HomolFondosCount OUTPUT,
    @HomolInstrumentosCount = @HomolInstrumentosCount OUTPUT,
    @HomolMonedasCount = @HomolMonedasCount OUTPUT;

INSERT INTO #Resultados VALUES (1, @Portfolio_1, @ID_Fund_1, @ReturnCode,
    @RegistrosIPA, @RegistrosCAPM, @RegistrosSONA, @RegistrosPNL, @RegistrosDerivados,
    @SuciedadesCount, @HomolInstrumentosCount, @HomolMonedasCount, @HomolFondosCount, @ErrorMessage);

PRINT ''

-- ============================================================================
-- PASO 5: VALIDAR FONDO 2
-- ============================================================================
PRINT '------------------------------------------------------------------------'
PRINT ' PASO 5: Validacion - ' + @Portfolio_2
PRINT '------------------------------------------------------------------------'

EXEC @ReturnCode = staging.sp_ValidateFund
    @ID_Ejecucion = @ID_Ejecucion_2,
    @ID_Proceso = @ID_Proceso_2,
    @ID_Fund = @ID_Fund_2,
    @FechaReporte = @FechaReporte,
    @ErrorMessage = @ErrorMessage OUTPUT,
    @RegistrosIPA = @RegistrosIPA OUTPUT,
    @RegistrosCAPM = @RegistrosCAPM OUTPUT,
    @RegistrosSONA = @RegistrosSONA OUTPUT,
    @RegistrosPNL = @RegistrosPNL OUTPUT,
    @RegistrosDerivados = @RegistrosDerivados OUTPUT,
    @SuciedadesCount = @SuciedadesCount OUTPUT,
    @HomolFondosCount = @HomolFondosCount OUTPUT,
    @HomolInstrumentosCount = @HomolInstrumentosCount OUTPUT,
    @HomolMonedasCount = @HomolMonedasCount OUTPUT;

INSERT INTO #Resultados VALUES (2, @Portfolio_2, @ID_Fund_2, @ReturnCode,
    @RegistrosIPA, @RegistrosCAPM, @RegistrosSONA, @RegistrosPNL, @RegistrosDerivados,
    @SuciedadesCount, @HomolInstrumentosCount, @HomolMonedasCount, @HomolFondosCount, @ErrorMessage);

PRINT ''

-- ============================================================================
-- RESULTADOS
-- ============================================================================
PRINT '================================================================================'
PRINT '  RESULTADOS'
PRINT '================================================================================'
PRINT ''

-- Tabla resumen
PRINT '  RESUMEN POR FONDO:'
SELECT
    Fondo,
    CASE
        WHEN CodigoRetorno = 0 THEN N'OK'
        WHEN CodigoRetorno = 5 THEN N'SUCIEDADES'
        WHEN CodigoRetorno = 6 THEN N'INSTRUMENTOS'
        WHEN CodigoRetorno = 10 THEN N'FONDOS'
        WHEN CodigoRetorno = 11 THEN N'MONEDAS'
        ELSE N'ERROR(' + CAST(CodigoRetorno AS NVARCHAR(5)) + N')'
    END AS Estado,
    IPA, CAPM, SONA, PNL,
    Suciedades AS Suc,
    InstrumentosPend AS Inst,
    MonedasPend AS Mon
FROM #Resultados
ORDER BY Orden;

-- Pendientes en sandbox
PRINT ''
PRINT '  PENDIENTES EN SANDBOX (ambos fondos):'
SELECT
    ID_Fund,
    Fund_Code AS Fondo,
    TipoHomologacion AS Tipo,
    CantidadPendiente AS Cantidad
FROM sandbox.vw_Pendientes_Por_Fondo
WHERE ID_Fund IN (@ID_Fund_1, @ID_Fund_2)
ORDER BY ID_Fund, TipoHomologacion;

-- Detalle de instrumentos pendientes
PRINT ''
PRINT '  INSTRUMENTOS PENDIENTES (detalle):'
SELECT
    h.Instrumento,
    h.Source,
    h.Currency,
    STRING_AGG(f.Fund_Code, ', ') AS Fondos
FROM sandbox.Homologacion_Instrumentos h
INNER JOIN sandbox.Homologacion_Instrumentos_Fondos hf ON h.ID = hf.ID_Homologacion
INNER JOIN dimensionales.BD_Funds f ON hf.ID_Fund = f.ID_Fund
WHERE h.Estado = 'Pendiente'
  AND hf.ID_Fund IN (@ID_Fund_1, @ID_Fund_2)
GROUP BY h.Instrumento, h.Source, h.Currency
ORDER BY h.Instrumento;

-- Suciedades
PRINT ''
PRINT '  SUCIEDADES DETECTADAS:'
SELECT
    s.InvestID,
    s.Qty,
    s.MVBook,
    STRING_AGG(f.Fund_Code, ', ') AS Fondos
FROM sandbox.Alertas_Suciedades_IPA s
INNER JOIN sandbox.Alertas_Suciedades_IPA_Fondos sf ON s.ID = sf.ID_Suciedad
INNER JOIN dimensionales.BD_Funds f ON sf.ID_Fund = f.ID_Fund
WHERE s.Estado = 'Pendiente'
  AND sf.ID_Fund IN (@ID_Fund_1, @ID_Fund_2)
GROUP BY s.InvestID, s.Qty, s.MVBook;

-- Cleanup
DROP TABLE #Resultados;

PRINT ''
PRINT '================================================================================'
PRINT '  TEST COMPLETADO'
PRINT '================================================================================'
GO
