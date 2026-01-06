/*
================================================================================
SCRIPT: Homologar SIN Marcar Ok en Sandbox (Escenario Alternativo)
================================================================================
Descripcion: Muestra que pasa si el operador agrega el mapeo a HOMOL_Instrumentos
             pero NO marca como Ok en el sandbox.

Resultado esperado:
  - El instrumento YA ESTA homologado (existe en HOMOL_*)
  - El sandbox aun tiene Estado='Pendiente'
  - PERO en la proxima validacion NO aparece como problema
  - Porque la validacion busca en HOMOL_* primero

Conclusion: El sandbox es para TRACKING del operador, no bloquea el pipeline
            si el instrumento ya esta en las tablas dimensionales.

IMPORTANTE: Este script es SOLO DEMOSTRATIVO

Autor: Refactorizacion Pipeline IPA
Fecha: 2026-01-05
================================================================================
*/

USE INTELIGENCIA_PRODUCTO_FULLSTACK;
GO

SET NOCOUNT ON;

PRINT '========================================================================'
PRINT '       ESCENARIO: Homologar SIN Marcar Ok en Sandbox'
PRINT '========================================================================'
PRINT ''

-- ============================================================================
-- VARIABLES
-- ============================================================================
DECLARE @InstrumentoDemo NVARCHAR(100);
DECLARE @SourceDemo NVARCHAR(50) = 'GENEVA';
DECLARE @FechaReporte NVARCHAR(10) = '2024-12-25';

DECLARE @ID_Fund_MLATHY INT;
DECLARE @ID_Fund_AlturasII INT = 2;

SELECT @ID_Fund_MLATHY = ID_Fund
FROM dimensionales.BD_Funds
WHERE Fund_Name LIKE '%MLATHY%';

-- Buscar un instrumento pendiente que NO este en HOMOL_Instrumentos
SELECT TOP 1 @InstrumentoDemo = h.Instrumento
FROM sandbox.Homologacion_Instrumentos h
LEFT JOIN dimensionales.HOMOL_Instrumentos hi
    ON h.Instrumento = hi.SourceInvestment AND h.Source = hi.Source
WHERE h.Estado = 'Pendiente'
  AND h.Source = @SourceDemo
  AND hi.ID_Instrumento IS NULL;  -- NO existe en HOMOL

IF @InstrumentoDemo IS NULL
BEGIN
    PRINT 'No hay instrumentos pendientes que no esten en HOMOL_Instrumentos.'
    PRINT 'Todos los pendientes ya fueron homologados.'
    RETURN;
END

PRINT '  Instrumento seleccionado: ' + @InstrumentoDemo
PRINT ''

-- ============================================================================
-- PASO 1: VERIFICAR ESTADO INICIAL
-- ============================================================================
PRINT '------------------------------------------------------------------------'
PRINT ' PASO 1: Estado inicial'
PRINT '------------------------------------------------------------------------'

PRINT ''
PRINT '  [SANDBOX] Estado del instrumento:'
SELECT
    Instrumento, Source, Estado, Usuario, FechaOk
FROM sandbox.Homologacion_Instrumentos
WHERE Instrumento = @InstrumentoDemo AND Source = @SourceDemo;

PRINT ''
PRINT '  [HOMOL] Existe en HOMOL_Instrumentos?'
IF EXISTS (SELECT 1 FROM dimensionales.HOMOL_Instrumentos
           WHERE SourceInvestment = @InstrumentoDemo AND Source = @SourceDemo)
    PRINT '    SI - Ya existe'
ELSE
    PRINT '    NO - No existe (pendiente de agregar)'

PRINT ''
PRINT '  [VISTA] Aparece en pendientes?'
SELECT Instrumento, Source, FondosAfectados
FROM sandbox.vw_Homologacion_Instrumentos_Pendientes
WHERE Instrumento = @InstrumentoDemo;

-- ============================================================================
-- PASO 2: AGREGAR A HOMOL_Instrumentos (SIN marcar Ok)
-- ============================================================================
PRINT ''
PRINT '------------------------------------------------------------------------'
PRINT ' PASO 2: Agregar a HOMOL_Instrumentos (SIN marcar Ok en sandbox)'
PRINT '------------------------------------------------------------------------'

IF NOT EXISTS (SELECT 1 FROM dimensionales.HOMOL_Instrumentos
               WHERE SourceInvestment = @InstrumentoDemo AND Source = @SourceDemo)
BEGIN
    DECLARE @NuevoID INT;
    SELECT @NuevoID = ISNULL(MAX(ID_Instrumento), 0) + 90001 FROM dimensionales.HOMOL_Instrumentos;

    INSERT INTO dimensionales.HOMOL_Instrumentos (ID_Instrumento, SourceInvestment, Source, FechaCreacion)
    VALUES (@NuevoID, @InstrumentoDemo, @SourceDemo, GETDATE());

    PRINT ''
    PRINT '  [OK] Agregado a HOMOL_Instrumentos'
    PRINT '       ID_Instrumento: ' + CAST(@NuevoID AS NVARCHAR(10))
    PRINT ''
    PRINT '  NOTA: NO se ejecuto sp_MarcarInstrumentoOk'
    PRINT '        El sandbox sigue en Estado="Pendiente"'
END
ELSE
BEGIN
    PRINT '  [INFO] Ya existe en HOMOL_Instrumentos'
END

-- ============================================================================
-- PASO 3: VERIFICAR ESTADO DESPUES
-- ============================================================================
PRINT ''
PRINT '------------------------------------------------------------------------'
PRINT ' PASO 3: Estado despues (sandbox NO actualizado)'
PRINT '------------------------------------------------------------------------'

PRINT ''
PRINT '  [SANDBOX] Estado del instrumento (SIN CAMBIOS):'
SELECT
    Instrumento, Source, Estado, Usuario, FechaOk
FROM sandbox.Homologacion_Instrumentos
WHERE Instrumento = @InstrumentoDemo AND Source = @SourceDemo;

PRINT ''
PRINT '  [HOMOL] Existe en HOMOL_Instrumentos?'
IF EXISTS (SELECT 1 FROM dimensionales.HOMOL_Instrumentos
           WHERE SourceInvestment = @InstrumentoDemo AND Source = @SourceDemo)
    PRINT '    SI - Ahora existe'
ELSE
    PRINT '    NO'

PRINT ''
PRINT '  [VISTA] Aparece en pendientes?'
SELECT Instrumento, Source, FondosAfectados
FROM sandbox.vw_Homologacion_Instrumentos_Pendientes
WHERE Instrumento = @InstrumentoDemo;

PRINT ''
PRINT '  OBSERVACION:'
PRINT '    El instrumento SIGUE apareciendo en la vista de pendientes'
PRINT '    porque el sandbox tiene Estado="Pendiente".'
PRINT ''
PRINT '    PERO si se ejecuta el pipeline nuevamente, el instrumento'
PRINT '    NO generara error porque YA ESTA en HOMOL_Instrumentos.'

-- ============================================================================
-- PASO 4: SIMULAR RE-VALIDACION
-- ============================================================================
PRINT ''
PRINT '------------------------------------------------------------------------'
PRINT ' PASO 4: Simular re-validacion (ver que pasa)'
PRINT '------------------------------------------------------------------------'

-- El SP busca instrumentos SIN homologar, este ya tiene mapeo
-- Por lo tanto NO deberia aparecer en la nueva validacion

DECLARE @ID_Ejecucion_Test BIGINT = 999;

-- Limpiar test
DELETE FROM extract.IPA WHERE ID_Ejecucion = @ID_Ejecucion_Test;
DELETE FROM logs.Validaciones_Ejecucion WHERE ID_Ejecucion = @ID_Ejecucion_Test;

-- Crear un registro IPA con el instrumento
INSERT INTO extract.IPA (ID_Ejecucion, ID_Proceso, ID_Fund, Portfolio, FechaReporte, InvestID, LocalCurrency)
VALUES (@ID_Ejecucion_Test, 999, @ID_Fund_MLATHY, 'MLATHY', @FechaReporte, @InstrumentoDemo, 'U.S. Dollars');

PRINT ''
PRINT '  Ejecutando validacion con el instrumento...'

DECLARE @ReturnCode INT, @ErrorMessage NVARCHAR(500);
DECLARE @RegistrosIPA INT, @HomolInstrumentosCount INT, @HomolMonedasCount INT;
DECLARE @Dummy1 INT, @Dummy2 INT, @Dummy3 INT, @Dummy4 INT, @Dummy5 INT, @Dummy6 INT;

EXEC @ReturnCode = staging.sp_ValidateFund
    @ID_Ejecucion = @ID_Ejecucion_Test,
    @ID_Proceso = 999,
    @ID_Fund = @ID_Fund_MLATHY,
    @FechaReporte = @FechaReporte,
    @ErrorMessage = @ErrorMessage OUTPUT,
    @RegistrosIPA = @RegistrosIPA OUTPUT,
    @RegistrosCAPM = @Dummy1 OUTPUT,
    @RegistrosSONA = @Dummy2 OUTPUT,
    @RegistrosPNL = @Dummy3 OUTPUT,
    @RegistrosDerivados = @Dummy4 OUTPUT,
    @SuciedadesCount = @Dummy5 OUTPUT,
    @HomolFondosCount = @Dummy6 OUTPUT,
    @HomolInstrumentosCount = @HomolInstrumentosCount OUTPUT,
    @HomolMonedasCount = @HomolMonedasCount OUTPUT;

PRINT ''
PRINT '  Resultado de validacion:'
PRINT '    Codigo retorno: ' + CAST(@ReturnCode AS NVARCHAR(10))
PRINT '    Instrumentos sin homologar: ' + CAST(@HomolInstrumentosCount AS NVARCHAR(10))

IF @HomolInstrumentosCount = 0
BEGIN
    PRINT ''
    PRINT '  EXITO: El instrumento NO genera error porque ya esta en HOMOL_*'
    PRINT '         (aunque el sandbox siga en Estado="Pendiente")'
END

-- Limpiar test
DELETE FROM extract.IPA WHERE ID_Ejecucion = @ID_Ejecucion_Test;
DELETE FROM logs.Validaciones_Ejecucion WHERE ID_Ejecucion = @ID_Ejecucion_Test;

-- ============================================================================
-- CONCLUSION
-- ============================================================================
PRINT ''
PRINT '========================================================================'
PRINT '       CONCLUSION'
PRINT '========================================================================'
PRINT ''
PRINT '  1. El sandbox es para TRACKING del operador, no bloquea el pipeline'
PRINT ''
PRINT '  2. Si un instrumento esta en HOMOL_Instrumentos:'
PRINT '     - NO genera error en sp_ValidateFund'
PRINT '     - Aunque el sandbox tenga Estado="Pendiente"'
PRINT ''
PRINT '  3. Marcar como Ok en sandbox es OPCIONAL pero RECOMENDADO:'
PRINT '     - Limpia la vista de pendientes para el operador'
PRINT '     - Mantiene el historial de quien/cuando resolvio'
PRINT '     - Evita confusion en el frontend'
PRINT ''
PRINT '  4. Flujo recomendado:'
PRINT '     a) Agregar mapeo en dimensionales.HOMOL_*'
PRINT '     b) EXEC sandbox.sp_MarcarInstrumentoOk @Instrumento, @Source'
PRINT ''
PRINT '========================================================================'
GO
