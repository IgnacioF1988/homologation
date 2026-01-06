/*
================================================================================
VISTAS SANDBOX - PENDIENTES POR FONDO
================================================================================
Descripcion: Vistas para consultar items pendientes de homologacion/resolucion.
             Diseñadas para consumo del frontend y reportes operativos.

Vistas:
  - vw_Homologacion_Instrumentos_Pendientes: Instrumentos pendientes con fondos
  - vw_Homologacion_Monedas_Pendientes: Monedas pendientes con fondos
  - vw_Homologacion_Fondos_Pendientes: Fondos sin homologar
  - vw_Suciedades_Pendientes: Suciedades pendientes con fondos
  - vw_Pendientes_Por_Fondo: Resumen de conteos por fondo
  - vw_Detalle_Pendientes_Por_Fondo: Detalle completo para operador

Autor: Refactorizacion Pipeline IPA
Fecha: 2026-01-05
Optimizado: 2026-01-06 - Uso de STRING_AGG en lugar de STUFF/FOR XML PATH
================================================================================
*/

-- ============================================================================
-- VISTA: vw_Homologacion_Instrumentos_Pendientes
-- Instrumentos pendientes con lista de fondos que los necesitan
-- ============================================================================
CREATE OR ALTER VIEW sandbox.vw_Homologacion_Instrumentos_Pendientes
AS
SELECT
    h.ID,
    h.Instrumento,
    h.Source,
    h.Currency,
    h.FechaDeteccion,
    STRING_AGG(f.Fund_Code, ', ') AS FondosAfectados,
    COUNT(hf.ID_Fund) AS CantidadFondos
FROM sandbox.Homologacion_Instrumentos h
LEFT JOIN sandbox.Homologacion_Instrumentos_Fondos hf ON h.ID = hf.ID_Homologacion
LEFT JOIN dimensionales.BD_Funds f ON hf.ID_Fund = f.ID_Fund
WHERE h.Estado = 'Pendiente'
GROUP BY h.ID, h.Instrumento, h.Source, h.Currency, h.FechaDeteccion;
GO

PRINT 'Vista [sandbox].[vw_Homologacion_Instrumentos_Pendientes] creada';
GO

-- ============================================================================
-- VISTA: vw_Homologacion_Monedas_Pendientes
-- Monedas pendientes con lista de fondos que las necesitan
-- ============================================================================
CREATE OR ALTER VIEW sandbox.vw_Homologacion_Monedas_Pendientes
AS
SELECT
    h.ID,
    h.Moneda,
    h.Source,
    h.FechaDeteccion,
    STRING_AGG(f.Fund_Code, ', ') AS FondosAfectados,
    COUNT(hf.ID_Fund) AS CantidadFondos
FROM sandbox.Homologacion_Monedas h
LEFT JOIN sandbox.Homologacion_Monedas_Fondos hf ON h.ID = hf.ID_Homologacion
LEFT JOIN dimensionales.BD_Funds f ON hf.ID_Fund = f.ID_Fund
WHERE h.Estado = 'Pendiente'
GROUP BY h.ID, h.Moneda, h.Source, h.FechaDeteccion;
GO

PRINT 'Vista [sandbox].[vw_Homologacion_Monedas_Pendientes] creada';
GO

-- ============================================================================
-- VISTA: vw_Homologacion_Fondos_Pendientes
-- Fondos (portfolios) sin homologar
-- ============================================================================
CREATE OR ALTER VIEW sandbox.vw_Homologacion_Fondos_Pendientes
AS
SELECT
    h.ID,
    h.NombreFondo,
    h.Source,
    h.FechaDeteccion,
    STRING_AGG(f.Fund_Code, ', ') AS FondosAfectados,
    COUNT(hf.ID_Fund) AS CantidadFondos
FROM sandbox.Homologacion_Fondos h
LEFT JOIN sandbox.Homologacion_Fondos_Fondos hf ON h.ID = hf.ID_Homologacion
LEFT JOIN dimensionales.BD_Funds f ON hf.ID_Fund = f.ID_Fund
WHERE h.Estado = 'Pendiente'
GROUP BY h.ID, h.NombreFondo, h.Source, h.FechaDeteccion;
GO

PRINT 'Vista [sandbox].[vw_Homologacion_Fondos_Pendientes] creada';
GO

-- ============================================================================
-- VISTA: vw_Suciedades_Pendientes
-- Suciedades pendientes con lista de fondos
-- ============================================================================
CREATE OR ALTER VIEW sandbox.vw_Suciedades_Pendientes
AS
SELECT
    s.ID,
    s.InvestID,
    s.InvestDescription,
    s.Qty,
    s.MVBook,
    s.AI,
    s.FechaDeteccion,
    STRING_AGG(f.Fund_Code, ', ') AS FondosAfectados,
    COUNT(sf.ID_Fund) AS CantidadFondos
FROM sandbox.Alertas_Suciedades_IPA s
LEFT JOIN sandbox.Alertas_Suciedades_IPA_Fondos sf ON s.ID = sf.ID_Suciedad
LEFT JOIN dimensionales.BD_Funds f ON sf.ID_Fund = f.ID_Fund
WHERE s.Estado = 'Pendiente'
GROUP BY s.ID, s.InvestID, s.InvestDescription, s.Qty, s.MVBook, s.AI, s.FechaDeteccion;
GO

PRINT 'Vista [sandbox].[vw_Suciedades_Pendientes] creada';
GO

-- ============================================================================
-- VISTA: vw_Pendientes_Por_Fondo
-- RESUMEN: Conteo de pendientes por fondo y tipo
-- Esta es la vista principal para el dashboard del operador
-- ============================================================================
CREATE OR ALTER VIEW sandbox.vw_Pendientes_Por_Fondo
AS
-- Instrumentos pendientes por fondo
SELECT
    hf.ID_Fund,
    f.Fund_Code,
    'INSTRUMENTOS' AS TipoHomologacion,
    COUNT(*) AS CantidadPendiente
FROM sandbox.Homologacion_Instrumentos h
INNER JOIN sandbox.Homologacion_Instrumentos_Fondos hf ON h.ID = hf.ID_Homologacion
LEFT JOIN dimensionales.BD_Funds f ON hf.ID_Fund = f.ID_Fund
WHERE h.Estado = 'Pendiente'
GROUP BY hf.ID_Fund, f.Fund_Code

UNION ALL

-- Monedas pendientes por fondo
SELECT
    hf.ID_Fund,
    f.Fund_Code,
    'MONEDAS' AS TipoHomologacion,
    COUNT(*) AS CantidadPendiente
FROM sandbox.Homologacion_Monedas h
INNER JOIN sandbox.Homologacion_Monedas_Fondos hf ON h.ID = hf.ID_Homologacion
LEFT JOIN dimensionales.BD_Funds f ON hf.ID_Fund = f.ID_Fund
WHERE h.Estado = 'Pendiente'
GROUP BY hf.ID_Fund, f.Fund_Code

UNION ALL

-- Fondos sin homologar
SELECT
    hf.ID_Fund,
    f.Fund_Code,
    'FONDOS' AS TipoHomologacion,
    COUNT(*) AS CantidadPendiente
FROM sandbox.Homologacion_Fondos h
INNER JOIN sandbox.Homologacion_Fondos_Fondos hf ON h.ID = hf.ID_Homologacion
LEFT JOIN dimensionales.BD_Funds f ON hf.ID_Fund = f.ID_Fund
WHERE h.Estado = 'Pendiente'
GROUP BY hf.ID_Fund, f.Fund_Code

UNION ALL

-- Suciedades pendientes por fondo
SELECT
    sf.ID_Fund,
    f.Fund_Code,
    'SUCIEDADES' AS TipoHomologacion,
    COUNT(*) AS CantidadPendiente
FROM sandbox.Alertas_Suciedades_IPA s
INNER JOIN sandbox.Alertas_Suciedades_IPA_Fondos sf ON s.ID = sf.ID_Suciedad
LEFT JOIN dimensionales.BD_Funds f ON sf.ID_Fund = f.ID_Fund
WHERE s.Estado = 'Pendiente'
GROUP BY sf.ID_Fund, f.Fund_Code;
GO

PRINT 'Vista [sandbox].[vw_Pendientes_Por_Fondo] creada';
GO

-- ============================================================================
-- VISTA: vw_Detalle_Pendientes_Por_Fondo
-- DETALLE: Lista completa de items pendientes por fondo
-- Para cuando el operador quiere ver el detalle de un fondo especifico
-- ============================================================================
CREATE OR ALTER VIEW sandbox.vw_Detalle_Pendientes_Por_Fondo
AS
-- Instrumentos
SELECT
    hf.ID_Fund,
    f.Fund_Code,
    'INSTRUMENTO' AS Tipo,
    h.Instrumento AS Item,
    h.Source,
    h.Currency AS Contexto,
    h.FechaDeteccion,
    h.ID AS ID_Item
FROM sandbox.Homologacion_Instrumentos h
INNER JOIN sandbox.Homologacion_Instrumentos_Fondos hf ON h.ID = hf.ID_Homologacion
LEFT JOIN dimensionales.BD_Funds f ON hf.ID_Fund = f.ID_Fund
WHERE h.Estado = 'Pendiente'

UNION ALL

-- Monedas
SELECT
    hf.ID_Fund,
    f.Fund_Code,
    'MONEDA' AS Tipo,
    h.Moneda AS Item,
    h.Source,
    NULL AS Contexto,
    h.FechaDeteccion,
    h.ID AS ID_Item
FROM sandbox.Homologacion_Monedas h
INNER JOIN sandbox.Homologacion_Monedas_Fondos hf ON h.ID = hf.ID_Homologacion
LEFT JOIN dimensionales.BD_Funds f ON hf.ID_Fund = f.ID_Fund
WHERE h.Estado = 'Pendiente'

UNION ALL

-- Fondos sin homologar
SELECT
    hf.ID_Fund,
    f.Fund_Code,
    'FONDO' AS Tipo,
    h.NombreFondo AS Item,
    h.Source,
    NULL AS Contexto,
    h.FechaDeteccion,
    h.ID AS ID_Item
FROM sandbox.Homologacion_Fondos h
INNER JOIN sandbox.Homologacion_Fondos_Fondos hf ON h.ID = hf.ID_Homologacion
LEFT JOIN dimensionales.BD_Funds f ON hf.ID_Fund = f.ID_Fund
WHERE h.Estado = 'Pendiente'

UNION ALL

-- Suciedades
SELECT
    sf.ID_Fund,
    f.Fund_Code,
    'SUCIEDAD' AS Tipo,
    s.InvestID AS Item,
    'IPA' AS Source,
    'Qty=' + CAST(s.Qty AS NVARCHAR(30)) + ', MV=' + CAST(s.MVBook AS NVARCHAR(30)) AS Contexto,
    s.FechaDeteccion,
    s.ID AS ID_Item
FROM sandbox.Alertas_Suciedades_IPA s
INNER JOIN sandbox.Alertas_Suciedades_IPA_Fondos sf ON s.ID = sf.ID_Suciedad
LEFT JOIN dimensionales.BD_Funds f ON sf.ID_Fund = f.ID_Fund
WHERE s.Estado = 'Pendiente';
GO

PRINT 'Vista [sandbox].[vw_Detalle_Pendientes_Por_Fondo] creada';
GO

-- ============================================================================
-- VISTA: vw_Resumen_Pendientes_Total
-- Resumen ejecutivo: totales por tipo (sin desglose por fondo)
-- ============================================================================
CREATE OR ALTER VIEW sandbox.vw_Resumen_Pendientes_Total
AS
SELECT
    'INSTRUMENTOS' AS Tipo,
    COUNT(*) AS TotalPendientes,
    (SELECT COUNT(DISTINCT hf.ID_Fund)
     FROM sandbox.Homologacion_Instrumentos_Fondos hf
     INNER JOIN sandbox.Homologacion_Instrumentos h ON hf.ID_Homologacion = h.ID
     WHERE h.Estado = 'Pendiente') AS FondosAfectados
FROM sandbox.Homologacion_Instrumentos WHERE Estado = 'Pendiente'

UNION ALL

SELECT
    'MONEDAS',
    COUNT(*),
    (SELECT COUNT(DISTINCT hf.ID_Fund)
     FROM sandbox.Homologacion_Monedas_Fondos hf
     INNER JOIN sandbox.Homologacion_Monedas h ON hf.ID_Homologacion = h.ID
     WHERE h.Estado = 'Pendiente')
FROM sandbox.Homologacion_Monedas WHERE Estado = 'Pendiente'

UNION ALL

SELECT
    'FONDOS',
    COUNT(*),
    (SELECT COUNT(DISTINCT hf.ID_Fund)
     FROM sandbox.Homologacion_Fondos_Fondos hf
     INNER JOIN sandbox.Homologacion_Fondos h ON hf.ID_Homologacion = h.ID
     WHERE h.Estado = 'Pendiente')
FROM sandbox.Homologacion_Fondos WHERE Estado = 'Pendiente'

UNION ALL

SELECT
    'SUCIEDADES',
    COUNT(*),
    (SELECT COUNT(DISTINCT sf.ID_Fund)
     FROM sandbox.Alertas_Suciedades_IPA_Fondos sf
     INNER JOIN sandbox.Alertas_Suciedades_IPA s ON sf.ID_Suciedad = s.ID
     WHERE s.Estado = 'Pendiente')
FROM sandbox.Alertas_Suciedades_IPA WHERE Estado = 'Pendiente';
GO

PRINT 'Vista [sandbox].[vw_Resumen_Pendientes_Total] creada';
GO

-- ============================================================================
-- VERIFICACION
-- ============================================================================
PRINT '';
PRINT '========================================'
PRINT 'VISTAS SANDBOX CREADAS'
PRINT '========================================'

SELECT
    s.name + '.' + v.name AS Vista,
    'SELECT * FROM ' + s.name + '.' + v.name AS Query
FROM sys.views v
INNER JOIN sys.schemas s ON v.schema_id = s.schema_id
WHERE s.name = 'sandbox'
ORDER BY v.name;
GO
