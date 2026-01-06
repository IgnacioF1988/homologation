/*
================================================================================
ESQUEMA: logs
Descripcion: Tablas y vistas para logging de validaciones del pipeline.
             Permite al backend consultar todos los errores/warnings de una ejecucion.

Tablas:
  - logs.Validaciones_Ejecucion: Registro de cada validacion ejecutada

Vistas:
  - logs.vw_Validaciones_Detalle: Interpretacion de codigos para el backend

Autor: Refactorizacion Pipeline IPA
Fecha: 2026-01-05
================================================================================
*/

-- ============================================================================
-- CREAR ESQUEMA (si no existe)
-- ============================================================================
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'logs')
BEGIN
    EXEC('CREATE SCHEMA logs');
    PRINT 'Esquema [logs] creado';
END
GO

-- ============================================================================
-- TABLA: logs.Validaciones_Ejecucion
-- Almacena cada codigo de validacion generado por sp_ValidateFund
-- ============================================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE schema_id = SCHEMA_ID('logs') AND name = 'Validaciones_Ejecucion')
BEGIN
    CREATE TABLE logs.Validaciones_Ejecucion (
        ID BIGINT IDENTITY(1,1) PRIMARY KEY,
        ID_Ejecucion BIGINT NOT NULL,
        ID_Proceso BIGINT NULL,
        ID_Fund INT NOT NULL,
        FechaReporte NVARCHAR(10) NOT NULL,
        CodigoValidacion INT NOT NULL,
        TipoValidacion NVARCHAR(50) NOT NULL,
        Categoria NVARCHAR(50) NOT NULL,  -- EXTRACT, HOMOLOGACION, CALIDAD, DESCUADRE, SISTEMA
        Mensaje NVARCHAR(500) NULL,
        Cantidad INT NULL,                 -- Cantidad de items afectados (ej: 5 instrumentos sin homologar)
        EsCritico BIT NOT NULL DEFAULT 1,
        FechaProceso DATETIME NOT NULL DEFAULT GETDATE()
    );

    PRINT 'Tabla [logs].[Validaciones_Ejecucion] creada';
END
GO

-- ============================================================================
-- INDICES para logs.Validaciones_Ejecucion
-- ============================================================================
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Validaciones_Ejecucion_Lookup' AND object_id = OBJECT_ID('logs.Validaciones_Ejecucion'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_Validaciones_Ejecucion_Lookup
    ON logs.Validaciones_Ejecucion (ID_Ejecucion, ID_Fund, FechaReporte)
    INCLUDE (CodigoValidacion, TipoValidacion, Categoria, EsCritico);

    PRINT 'Indice IX_Validaciones_Ejecucion_Lookup creado';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Validaciones_Ejecucion_Fecha' AND object_id = OBJECT_ID('logs.Validaciones_Ejecucion'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_Validaciones_Ejecucion_Fecha
    ON logs.Validaciones_Ejecucion (FechaProceso DESC)
    INCLUDE (ID_Ejecucion, ID_Fund, CodigoValidacion);

    PRINT 'Indice IX_Validaciones_Ejecucion_Fecha creado';
END
GO

-- ============================================================================
-- VISTA: logs.vw_Validaciones_Detalle
-- Interpreta codigos de validacion para consumo del backend
-- ============================================================================
CREATE OR ALTER VIEW logs.vw_Validaciones_Detalle
AS
SELECT
    v.ID,
    v.ID_Ejecucion,
    v.ID_Proceso,
    v.ID_Fund,
    f.Fund_Code,
    v.FechaReporte,
    v.CodigoValidacion,
    v.TipoValidacion,
    v.Categoria,
    v.Mensaje,
    v.Cantidad,
    v.EsCritico,
    v.FechaProceso,
    -- Interpretacion del codigo
    CASE v.CodigoValidacion
        WHEN 0  THEN 'OK'
        WHEN 1  THEN 'WARNING'
        WHEN 2  THEN 'RETRY'
        WHEN 3  THEN 'ERROR_CRITICO'
        WHEN 5  THEN 'SUCIEDADES_IPA'
        WHEN 6  THEN 'HOMOLOGACION_INSTRUMENTOS'
        WHEN 7  THEN 'DESCUADRE_CAPM'
        WHEN 8  THEN 'DESCUADRE_DERIVADOS'
        WHEN 9  THEN 'DESCUADRE_NAV'
        WHEN 10 THEN 'HOMOLOGACION_FONDOS'
        WHEN 11 THEN 'HOMOLOGACION_MONEDAS'
        WHEN 13 THEN 'EXTRACT_IPA_FALTANTE'
        WHEN 14 THEN 'EXTRACT_CAPM_FALTANTE'
        WHEN 15 THEN 'EXTRACT_SONA_FALTANTE'
        WHEN 16 THEN 'EXTRACT_PNL_FALTANTE'
        WHEN 17 THEN 'EXTRACT_DERIVADOS_FALTANTE'
        WHEN 18 THEN 'EXTRACT_POSMODRF_FALTANTE'
        ELSE 'CODIGO_DESCONOCIDO_' + CAST(v.CodigoValidacion AS NVARCHAR(10))
    END AS CodigoDescripcion,
    -- Accion recomendada
    CASE v.Categoria
        WHEN 'EXTRACT' THEN 'Verificar que la extraccion se ejecuto correctamente o que existen datos en la fuente'
        WHEN 'HOMOLOGACION' THEN 'Agregar el mapeo correspondiente en las tablas dimensionales.HOMOL_*'
        WHEN 'CALIDAD' THEN 'Revisar y limpiar los datos en la fuente o agregar excepcion'
        WHEN 'DESCUADRE' THEN 'Verificar totales entre fuentes o crear ajuste manual'
        ELSE 'Revisar el log de ejecucion'
    END AS AccionRecomendada,
    -- Tabla sandbox relacionada
    CASE v.TipoValidacion
        WHEN 'EXTRACT_IPA_FALTANTE' THEN 'sandbox.Alertas_Extract_Faltante'
        WHEN 'EXTRACT_CAPM_FALTANTE' THEN 'sandbox.Alertas_Extract_Faltante'
        WHEN 'EXTRACT_SONA_FALTANTE' THEN 'sandbox.Alertas_Extract_Faltante'
        WHEN 'EXTRACT_PNL_FALTANTE' THEN 'sandbox.Alertas_Extract_Faltante'
        WHEN 'EXTRACT_DERIVADOS_FALTANTE' THEN 'sandbox.Alertas_Extract_Faltante'
        WHEN 'EXTRACT_POSMODRF_FALTANTE' THEN 'sandbox.Alertas_Extract_Faltante'
        WHEN 'HOMOLOGACION_FONDOS' THEN 'sandbox.Homologacion_Fondos'
        WHEN 'HOMOLOGACION_INSTRUMENTOS' THEN 'sandbox.Homologacion_Instrumentos'
        WHEN 'HOMOLOGACION_MONEDAS' THEN 'sandbox.Homologacion_Monedas'
        WHEN 'SUCIEDADES_IPA' THEN 'sandbox.Alertas_Suciedades_IPA'
        WHEN 'DESCUADRE_CAPM' THEN 'sandbox.Alertas_Descuadre_Cash'
        WHEN 'DESCUADRE_DERIVADOS' THEN 'sandbox.Alertas_Descuadre_Derivados'
        WHEN 'DESCUADRE_NAV' THEN 'sandbox.Alertas_Descuadre_NAV'
        ELSE NULL
    END AS TablaSandbox
FROM logs.Validaciones_Ejecucion v
LEFT JOIN dimensionales.BD_Funds f ON v.ID_Fund = f.ID_Fund;
GO

PRINT 'Vista [logs].[vw_Validaciones_Detalle] creada/actualizada';
GO

-- ============================================================================
-- VERIFICACION
-- ============================================================================
PRINT '';
PRINT '========================================';
PRINT 'OBJETOS DEL ESQUEMA LOGS';
PRINT '========================================';

SELECT
    CASE WHEN o.type = 'U' THEN 'TABLA' WHEN o.type = 'V' THEN 'VISTA' ELSE o.type END AS Tipo,
    s.name + '.' + o.name AS Objeto
FROM sys.objects o
INNER JOIN sys.schemas s ON o.schema_id = s.schema_id
WHERE s.name = 'logs'
  AND o.type IN ('U', 'V')
ORDER BY o.type, o.name;
GO
