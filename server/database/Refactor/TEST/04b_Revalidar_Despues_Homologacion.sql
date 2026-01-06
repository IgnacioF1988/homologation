/*
================================================================================
SCRIPT: Re-validar Fondos Despues de Homologacion
================================================================================
Descripcion: Este script muestra que pasa cuando se re-ejecuta el pipeline
             DESPUES de haber homologado un instrumento.

Escenarios:
  A) Si se marco como Ok en sandbox → No aparece en validacion
  B) Si solo se agrego a HOMOL_* → Tampoco aparece (ya esta homologado)

En ambos casos, el conteo de pendientes baja para todos los fondos
que compartian ese instrumento.

IMPORTANTE: Ejecutar DESPUES de 04a_Homologar_Instrumento.sql

Autor: Refactorizacion Pipeline IPA
Fecha: 2026-01-05
================================================================================
*/

USE INTELIGENCIA_PRODUCTO_FULLSTACK;
GO

SET NOCOUNT ON;

PRINT '========================================================================'
PRINT '       RE-VALIDAR FONDOS DESPUES DE HOMOLOGACION'
PRINT '========================================================================'
PRINT ''

-- ============================================================================
-- VARIABLES
-- ============================================================================
DECLARE @FechaReporte NVARCHAR(10) = '2024-12-25';

-- IDs de ejecucion NUEVOS (simula nueva ejecucion del pipeline)
DECLARE @ID_Proceso_1 BIGINT = 301;
DECLARE @ID_Ejecucion_1 BIGINT = 301;
DECLARE @ID_Proceso_2 BIGINT = 302;
DECLARE @ID_Ejecucion_2 BIGINT = 302;

-- Fondos
DECLARE @ID_Fund_MLATHY INT;
DECLARE @ID_Fund_AlturasII INT = 2;
DECLARE @Portfolio_MLATHY NVARCHAR(100) = 'MLATHY';
DECLARE @Portfolio_AlturasII NVARCHAR(100) = 'ALTURAS II';

SELECT @ID_Fund_MLATHY = ID_Fund
FROM dimensionales.BD_Funds
WHERE Fund_Code LIKE '%MLATHY%' OR Fund_Code LIKE '%MLathy%';

-- Variables de salida
DECLARE @ReturnCode INT, @ErrorMessage NVARCHAR(500);
DECLARE @RegistrosIPA INT, @RegistrosCAPM INT, @RegistrosSONA INT;
DECLARE @RegistrosPNL INT, @RegistrosDerivados INT;
DECLARE @SuciedadesCount INT, @HomolFondosCount INT;
DECLARE @HomolInstrumentosCount INT, @HomolMonedasCount INT;

-- ============================================================================
-- PASO 1: ESTADO ACTUAL DEL SANDBOX (ANTES DE RE-VALIDAR)
-- ============================================================================
PRINT '------------------------------------------------------------------------'
PRINT ' PASO 1: Estado actual del sandbox'
PRINT '------------------------------------------------------------------------'

PRINT ''
PRINT '  Pendientes actuales por fondo:'
SELECT
    ID_Fund,
    Fund_Code AS Fondo,
    TipoHomologacion AS Tipo,
    CantidadPendiente AS Pendientes
FROM sandbox.vw_Pendientes_Por_Fondo
WHERE ID_Fund IN (@ID_Fund_MLATHY, @ID_Fund_AlturasII)
ORDER BY ID_Fund, TipoHomologacion;

PRINT ''
PRINT '  Instrumentos marcados como Ok (historial):'
SELECT TOP 10
    Instrumento, Source, Estado, Usuario,
    FORMAT(FechaOk, 'yyyy-MM-dd HH:mm') AS FechaOk
FROM sandbox.Homologacion_Instrumentos
WHERE Estado = 'Ok'
ORDER BY FechaOk DESC;

-- ============================================================================
-- PASO 2: LIMPIAR EXTRACTS Y LOGS (nueva ejecucion)
-- ============================================================================
PRINT ''
PRINT '------------------------------------------------------------------------'
PRINT ' PASO 2: Preparar nueva ejecucion'
PRINT '------------------------------------------------------------------------'

DELETE FROM extract.IPA WHERE ID_Ejecucion IN (@ID_Ejecucion_1, @ID_Ejecucion_2);
DELETE FROM extract.CAPM WHERE ID_Ejecucion IN (@ID_Ejecucion_1, @ID_Ejecucion_2);
DELETE FROM extract.SONA WHERE ID_Ejecucion IN (@ID_Ejecucion_1, @ID_Ejecucion_2);
DELETE FROM extract.PNL WHERE ID_Ejecucion IN (@ID_Ejecucion_1, @ID_Ejecucion_2);
DELETE FROM extract.Derivados WHERE ID_Ejecucion IN (@ID_Ejecucion_1, @ID_Ejecucion_2);
DELETE FROM extract.PosModRF WHERE ID_Ejecucion IN (@ID_Ejecucion_1, @ID_Ejecucion_2);
DELETE FROM logs.Validaciones_Ejecucion WHERE ID_Ejecucion IN (@ID_Ejecucion_1, @ID_Ejecucion_2);
DELETE FROM sandbox.Alertas_Extract_Faltante WHERE ID_Ejecucion IN (@ID_Ejecucion_1, @ID_Ejecucion_2);

PRINT '  [OK] Limpiado para nueva ejecucion'

-- ============================================================================
-- PASO 3: EJECUTAR EXTRACTS NUEVAMENTE
-- ============================================================================
PRINT ''
PRINT '------------------------------------------------------------------------'
PRINT ' PASO 3: Ejecutar extracts (nueva ejecucion)'
PRINT '------------------------------------------------------------------------'

-- MLATHY
EXEC extract.Extract_IPA @FechaReporte, @ID_Proceso_1, @ID_Ejecucion_1, @ID_Fund_MLATHY, @Portfolio_MLATHY;
EXEC extract.Extract_CAPM @FechaReporte, @ID_Proceso_1, @ID_Ejecucion_1, @ID_Fund_MLATHY, @Portfolio_MLATHY;
EXEC extract.Extract_SONA @FechaReporte, @ID_Proceso_1, @ID_Ejecucion_1, @ID_Fund_MLATHY, @Portfolio_MLATHY;
EXEC extract.Extract_PNL @FechaReporte, @ID_Proceso_1, @ID_Ejecucion_1, @ID_Fund_MLATHY, @Portfolio_MLATHY;

-- ALTURAS II
EXEC extract.Extract_IPA @FechaReporte, @ID_Proceso_2, @ID_Ejecucion_2, @ID_Fund_AlturasII, @Portfolio_AlturasII;
EXEC extract.Extract_CAPM @FechaReporte, @ID_Proceso_2, @ID_Ejecucion_2, @ID_Fund_AlturasII, @Portfolio_AlturasII;
EXEC extract.Extract_SONA @FechaReporte, @ID_Proceso_2, @ID_Ejecucion_2, @ID_Fund_AlturasII, @Portfolio_AlturasII;
EXEC extract.Extract_PNL @FechaReporte, @ID_Proceso_2, @ID_Ejecucion_2, @ID_Fund_AlturasII, @Portfolio_AlturasII;

PRINT '  [OK] Extracts ejecutados'

-- ============================================================================
-- PASO 4: RE-VALIDAR AMBOS FONDOS
-- ============================================================================
PRINT ''
PRINT '------------------------------------------------------------------------'
PRINT ' PASO 4: Re-validar ambos fondos'
PRINT '------------------------------------------------------------------------'

-- MLATHY
PRINT ''
PRINT '  >> Validando MLATHY (nueva ejecucion)...'

EXEC @ReturnCode = staging.sp_ValidateFund
    @ID_Ejecucion = @ID_Ejecucion_1,
    @ID_Proceso = @ID_Proceso_1,
    @ID_Fund = @ID_Fund_MLATHY,
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

PRINT '  MLATHY - Codigo: ' + CAST(@ReturnCode AS NVARCHAR(10)) +
      ' | Instrumentos pendientes: ' + CAST(@HomolInstrumentosCount AS NVARCHAR(10)) +
      ' | Monedas pendientes: ' + CAST(@HomolMonedasCount AS NVARCHAR(10));

-- ALTURAS II
PRINT ''
PRINT '  >> Validando ALTURAS II (nueva ejecucion)...'

EXEC @ReturnCode = staging.sp_ValidateFund
    @ID_Ejecucion = @ID_Ejecucion_2,
    @ID_Proceso = @ID_Proceso_2,
    @ID_Fund = @ID_Fund_AlturasII,
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

PRINT '  ALTURAS II - Codigo: ' + CAST(@ReturnCode AS NVARCHAR(10)) +
      ' | Instrumentos pendientes: ' + CAST(@HomolInstrumentosCount AS NVARCHAR(10)) +
      ' | Monedas pendientes: ' + CAST(@HomolMonedasCount AS NVARCHAR(10));

-- ============================================================================
-- PASO 5: ESTADO FINAL
-- ============================================================================
PRINT ''
PRINT '------------------------------------------------------------------------'
PRINT ' PASO 5: Estado final del sandbox'
PRINT '------------------------------------------------------------------------'

PRINT ''
PRINT '  Pendientes por fondo (DESPUES de re-validar):'
SELECT
    ID_Fund,
    Fund_Code AS Fondo,
    TipoHomologacion AS Tipo,
    CantidadPendiente AS Pendientes
FROM sandbox.vw_Pendientes_Por_Fondo
WHERE ID_Fund IN (@ID_Fund_MLATHY, @ID_Fund_AlturasII)
ORDER BY ID_Fund, TipoHomologacion;

-- ============================================================================
-- PASO 6: ANALISIS COMPARATIVO
-- ============================================================================
PRINT ''
PRINT '========================================================================'
PRINT '       ANALISIS COMPARATIVO'
PRINT '========================================================================'

PRINT ''
PRINT '  Estado de instrumentos en sandbox:'
SELECT
    h.Estado,
    COUNT(*) AS Cantidad
FROM sandbox.Homologacion_Instrumentos h
INNER JOIN sandbox.Homologacion_Instrumentos_Fondos hf ON h.ID = hf.ID_Homologacion
WHERE hf.ID_Fund IN (@ID_Fund_MLATHY, @ID_Fund_AlturasII)
GROUP BY h.Estado;

PRINT ''
PRINT '  Instrumentos que NO requieren homologacion (ya estan en HOMOL_*):'
PRINT '  -----------------------------------------------------------------'
PRINT '  Estos instrumentos de los extracts YA tienen mapeo en HOMOL_Instrumentos,'
PRINT '  por lo tanto NO aparecen como pendientes en el sandbox.'
PRINT ''

-- Mostrar cuantos instrumentos del extract YA estan homologados
SELECT
    'MLATHY' AS Fondo,
    COUNT(DISTINCT ipa.InvestID) AS InstrumentosEnExtract,
    COUNT(DISTINCT hi.ID_Instrumento) AS YaHomologados
FROM extract.IPA ipa
LEFT JOIN dimensionales.HOMOL_Instrumentos hi
    ON ipa.InvestID = hi.SourceInvestment AND hi.Source = 'GENEVA'
WHERE ipa.ID_Ejecucion = @ID_Ejecucion_1

UNION ALL

SELECT
    'ALTURAS II',
    COUNT(DISTINCT ipa.InvestID),
    COUNT(DISTINCT hi.ID_Instrumento)
FROM extract.IPA ipa
LEFT JOIN dimensionales.HOMOL_Instrumentos hi
    ON ipa.InvestID = hi.SourceInvestment AND hi.Source = 'GENEVA'
WHERE ipa.ID_Ejecucion = @ID_Ejecucion_2;

PRINT ''
PRINT '========================================================================'
PRINT '       CONCLUSION'
PRINT '========================================================================'
PRINT ''
PRINT '  El instrumento homologado en el paso anterior:'
PRINT '    1. Ya existe en dimensionales.HOMOL_Instrumentos'
PRINT '    2. Tiene Estado="Ok" en sandbox (si se marco)'
PRINT '    3. NO genera error en la nueva validacion'
PRINT '    4. El conteo de pendientes refleja solo lo NO homologado'
PRINT ''
PRINT '  La arquitectura N:M funciona correctamente:'
PRINT '    - Un instrumento homologado afecta a TODOS los fondos'
PRINT '    - El historial se preserva en sandbox'
PRINT '    - Las vistas muestran solo pendientes reales'
PRINT ''
PRINT '========================================================================'
GO
