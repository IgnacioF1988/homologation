/*
================================================================================
SCRIPT: Homologar un Instrumento Compartido
================================================================================
Descripcion: Este script simula lo que haria el operador cuando homologa
             un instrumento que es compartido por multiples fondos.

Pasos:
  1. Ver estado ANTES de homologar
  2. Agregar mapeo en dimensionales.HOMOL_Instrumentos
  3. Marcar como Ok en sandbox
  4. Ver estado DESPUES de homologar
  5. Verificar efecto en ambos fondos

IMPORTANTE: Ejecutar DESPUES de 03_Test_Paralelo_2Fondos.sql

Autor: Refactorizacion Pipeline IPA
Fecha: 2026-01-05
================================================================================
*/

USE INTELIGENCIA_PRODUCTO_FULLSTACK;
GO

SET NOCOUNT ON;

-- ============================================================================
-- VARIABLES (ajustar segun los resultados del test)
-- ============================================================================
DECLARE @InstrumentoAHomologar NVARCHAR(100);
DECLARE @SourceInstrumento NVARCHAR(50) = 'GENEVA';
DECLARE @Usuario NVARCHAR(100) = 'operador_test';

-- IDs de los fondos del test
DECLARE @ID_Fund_MLATHY INT;
DECLARE @ID_Fund_AlturasII INT = 2;

SELECT @ID_Fund_MLATHY = ID_Fund
FROM dimensionales.BD_Funds
WHERE Fund_Name LIKE '%MLATHY%' OR Fund_Name LIKE '%MLathy%';

PRINT '========================================================================'
PRINT '       HOMOLOGAR UN INSTRUMENTO COMPARTIDO'
PRINT '========================================================================'
PRINT ''

-- ============================================================================
-- PASO 1: SELECCIONAR UN INSTRUMENTO COMPARTIDO (afecta a ambos fondos)
-- ============================================================================
PRINT '------------------------------------------------------------------------'
PRINT ' PASO 1: Seleccionar instrumento compartido'
PRINT '------------------------------------------------------------------------'

-- Buscar un instrumento que afecte a ambos fondos
SELECT TOP 1 @InstrumentoAHomologar = h.Instrumento
FROM sandbox.Homologacion_Instrumentos h
WHERE h.Estado = 'Pendiente'
  AND h.Source = @SourceInstrumento
  AND EXISTS (
      SELECT 1 FROM sandbox.Homologacion_Instrumentos_Fondos hf
      WHERE hf.ID_Homologacion = h.ID AND hf.ID_Fund = @ID_Fund_MLATHY
  )
  AND EXISTS (
      SELECT 1 FROM sandbox.Homologacion_Instrumentos_Fondos hf
      WHERE hf.ID_Homologacion = h.ID AND hf.ID_Fund = @ID_Fund_AlturasII
  );

-- Si no hay compartidos, tomar cualquiera pendiente
IF @InstrumentoAHomologar IS NULL
BEGIN
    SELECT TOP 1 @InstrumentoAHomologar = Instrumento
    FROM sandbox.Homologacion_Instrumentos
    WHERE Estado = 'Pendiente' AND Source = @SourceInstrumento;
END

IF @InstrumentoAHomologar IS NULL
BEGIN
    PRINT 'No hay instrumentos pendientes para homologar.'
    PRINT 'Ejecute primero 03_Test_Paralelo_2Fondos.sql'
    RETURN;
END

PRINT ''
PRINT '  Instrumento seleccionado: ' + @InstrumentoAHomologar
PRINT '  Source: ' + @SourceInstrumento
PRINT ''

-- ============================================================================
-- PASO 2: ESTADO ANTES DE HOMOLOGAR
-- ============================================================================
PRINT '------------------------------------------------------------------------'
PRINT ' PASO 2: Estado ANTES de homologar'
PRINT '------------------------------------------------------------------------'

-- Ver el instrumento en sandbox
PRINT ''
PRINT '  [SANDBOX] Detalle del instrumento:'
SELECT
    h.ID,
    h.Instrumento,
    h.Source,
    h.Currency,
    h.Estado,
    h.Usuario,
    h.FechaOk
FROM sandbox.Homologacion_Instrumentos h
WHERE h.Instrumento = @InstrumentoAHomologar AND h.Source = @SourceInstrumento;

-- Ver que fondos lo necesitan
PRINT ''
PRINT '  [SANDBOX] Fondos que lo necesitan:'
SELECT
    hf.ID_Fund,
    f.Fund_Name,
    FORMAT(hf.FechaPrimeraDeteccion, 'yyyy-MM-dd HH:mm') AS PrimeraDeteccion
FROM sandbox.Homologacion_Instrumentos_Fondos hf
INNER JOIN sandbox.Homologacion_Instrumentos h ON hf.ID_Homologacion = h.ID
LEFT JOIN dimensionales.BD_Funds f ON hf.ID_Fund = f.ID_Fund
WHERE h.Instrumento = @InstrumentoAHomologar AND h.Source = @SourceInstrumento;

-- Conteo actual por fondo
PRINT ''
PRINT '  [VISTA] Pendientes por fondo ANTES:'
SELECT
    ID_Fund,
    Fund_Name AS Fondo,
    TipoHomologacion AS Tipo,
    CantidadPendiente AS Pendientes
FROM sandbox.vw_Pendientes_Por_Fondo
WHERE ID_Fund IN (@ID_Fund_MLATHY, @ID_Fund_AlturasII)
  AND TipoHomologacion = 'INSTRUMENTOS';

-- ============================================================================
-- PASO 3: HOMOLOGAR EN DIMENSIONALES
-- ============================================================================
PRINT ''
PRINT '------------------------------------------------------------------------'
PRINT ' PASO 3: Agregar mapeo en dimensionales.HOMOL_Instrumentos'
PRINT '------------------------------------------------------------------------'

-- Verificar si ya existe
IF EXISTS (SELECT 1 FROM dimensionales.HOMOL_Instrumentos
           WHERE SourceInvestment = @InstrumentoAHomologar AND Source = @SourceInstrumento)
BEGIN
    PRINT '  [INFO] El instrumento ya existe en HOMOL_Instrumentos'
END
ELSE
BEGIN
    -- Crear un ID_Instrumento ficticio para el test (en produccion seria real)
    DECLARE @NuevoID_Instrumento INT;
    SELECT @NuevoID_Instrumento = ISNULL(MAX(ID_Instrumento), 0) + 90000 FROM dimensionales.HOMOL_Instrumentos;

    INSERT INTO dimensionales.HOMOL_Instrumentos (ID_Instrumento, SourceInvestment, Source, FechaCreacion)
    VALUES (@NuevoID_Instrumento, @InstrumentoAHomologar, @SourceInstrumento, GETDATE());

    PRINT '  [OK] Instrumento agregado a HOMOL_Instrumentos'
    PRINT '       ID_Instrumento: ' + CAST(@NuevoID_Instrumento AS NVARCHAR(10))
    PRINT '       SourceInvestment: ' + @InstrumentoAHomologar
    PRINT '       Source: ' + @SourceInstrumento
END

-- ============================================================================
-- PASO 4: MARCAR COMO OK EN SANDBOX
-- ============================================================================
PRINT ''
PRINT '------------------------------------------------------------------------'
PRINT ' PASO 4: Marcar como Ok en sandbox'
PRINT '------------------------------------------------------------------------'

-- Usar el SP para marcar como Ok
EXEC sandbox.sp_MarcarInstrumentoOk
    @Instrumento = @InstrumentoAHomologar,
    @Source = @SourceInstrumento,
    @Usuario = @Usuario;

-- ============================================================================
-- PASO 5: ESTADO DESPUES DE HOMOLOGAR
-- ============================================================================
PRINT ''
PRINT '------------------------------------------------------------------------'
PRINT ' PASO 5: Estado DESPUES de homologar'
PRINT '------------------------------------------------------------------------'

-- Ver el instrumento actualizado
PRINT ''
PRINT '  [SANDBOX] Detalle del instrumento (actualizado):'
SELECT
    h.ID,
    h.Instrumento,
    h.Source,
    h.Estado,
    h.Usuario,
    FORMAT(h.FechaOk, 'yyyy-MM-dd HH:mm:ss') AS FechaOk
FROM sandbox.Homologacion_Instrumentos h
WHERE h.Instrumento = @InstrumentoAHomologar AND h.Source = @SourceInstrumento;

-- Las relaciones siguen existiendo (para historial)
PRINT ''
PRINT '  [SANDBOX] Relaciones con fondos (historial preservado):'
SELECT
    hf.ID_Fund,
    f.Fund_Name,
    h.Estado AS EstadoInstrumento
FROM sandbox.Homologacion_Instrumentos_Fondos hf
INNER JOIN sandbox.Homologacion_Instrumentos h ON hf.ID_Homologacion = h.ID
LEFT JOIN dimensionales.BD_Funds f ON hf.ID_Fund = f.ID_Fund
WHERE h.Instrumento = @InstrumentoAHomologar AND h.Source = @SourceInstrumento;

-- Conteo DESPUES (deberia haber bajado para ambos fondos)
PRINT ''
PRINT '  [VISTA] Pendientes por fondo DESPUES:'
SELECT
    ID_Fund,
    Fund_Name AS Fondo,
    TipoHomologacion AS Tipo,
    CantidadPendiente AS Pendientes
FROM sandbox.vw_Pendientes_Por_Fondo
WHERE ID_Fund IN (@ID_Fund_MLATHY, @ID_Fund_AlturasII)
  AND TipoHomologacion = 'INSTRUMENTOS';

-- El instrumento ya NO aparece en la vista de pendientes
PRINT ''
PRINT '  [VISTA] Instrumento en vw_Homologacion_Instrumentos_Pendientes:'
SELECT
    Instrumento,
    Source,
    FondosAfectados
FROM sandbox.vw_Homologacion_Instrumentos_Pendientes
WHERE Instrumento = @InstrumentoAHomologar;

IF @@ROWCOUNT = 0
    PRINT '  >> El instrumento YA NO aparece en pendientes (correcto!)'

-- ============================================================================
-- PASO 6: RESUMEN DEL IMPACTO
-- ============================================================================
PRINT ''
PRINT '========================================================================'
PRINT '       RESUMEN DEL IMPACTO'
PRINT '========================================================================'
PRINT ''
PRINT '  Instrumento homologado: ' + @InstrumentoAHomologar
PRINT '  Accion: Marcado como Ok en sandbox'
PRINT ''
PRINT '  Efecto:'
PRINT '    - El instrumento tiene Estado = "Ok" en la tabla principal'
PRINT '    - Las relaciones con fondos se mantienen (historial)'
PRINT '    - El instrumento NO aparece en vistas de pendientes'
PRINT '    - El conteo de pendientes BAJO para AMBOS fondos'
PRINT ''
PRINT '  Si se re-ejecuta el pipeline:'
PRINT '    - El instrumento NO generara error (ya esta en HOMOL_Instrumentos)'
PRINT '    - Aunque el sandbox tenga la relacion, Estado=Ok lo ignora'
PRINT ''
PRINT '========================================================================'
GO
