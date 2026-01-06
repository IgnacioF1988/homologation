/*
================================================================================
CONFIGURACION DE REQUISITOS DE EXTRACT POR FONDO
================================================================================
Descripcion: Define que reportes son OBLIGATORIOS para cada fondo.
             Si un reporte es obligatorio y no existe en extract.*,
             el pipeline retorna codigo especifico (13-18) segun el tipo de reporte.

Logica:
  - Flag = 1: Reporte OBLIGATORIO. Si falta → codigo 13-18 segun tipo (Stand-by)
  - Flag = 0: Reporte OPCIONAL. Si falta → continua con warning
  - NULL/No existe: Usa valores por defecto de la tabla

Codigos de retorno completos (alineados con backend standby.js):
  -- Codigos base:
  0  = OK                          -- Exito
  1  = WARNING                     -- Continua con advertencia
  2  = RETRY                       -- Deadlock, el backend reintenta
  3  = ERROR_CRITICO               -- Error fatal, aborta
  4  = RETRY_EXHAUSTED             -- [SOLO BACKEND] Reintentos agotados

  -- Codigos de validacion/problemas de datos:
  5  = SUCIEDADES                  -- Datos sucios detectados
  6  = HOMOLOGACION_INSTRUMENTOS   -- Instrumentos sin homologar
  7  = DESCUADRES_CAPM             -- Descuadre en CAPM
  8  = DESCUADRES_DERIVADOS        -- Descuadre en Derivados
  9  = DESCUADRES_NAV              -- Descuadre en NAV
  10 = HOMOLOGACION_FONDOS         -- Fondos sin homologar
  11 = HOMOLOGACION_MONEDAS        -- Monedas sin homologar
  12 = HOMOLOGACION_BENCHMARKS     -- Benchmarks sin homologar

  -- Codigos de extraccion faltante (cuando reporte es OBLIGATORIO):
  13 = EXTRACT_IPA_FALTANTE        -- IPA obligatorio no encontrado
  14 = EXTRACT_CAPM_FALTANTE       -- CAPM obligatorio no encontrado
  15 = EXTRACT_SONA_FALTANTE       -- SONA obligatorio no encontrado
  16 = EXTRACT_PNL_FALTANTE        -- PNL obligatorio no encontrado
  17 = EXTRACT_DERIVADOS_FALTANTE  -- Derivados obligatorios no encontrados
  18 = EXTRACT_POSMODRF_FALTANTE   -- PosModRF obligatorio no encontrado

  NOTA: El codigo 4 (RETRY_EXHAUSTED) NUNCA se retorna desde un SP.
        Es asignado por el backend cuando se agotan los reintentos de codigo 2.

Autor: Refactorizacion Pipeline IPA
Fecha: 2026-01-02
================================================================================
*/

-- ============================================================================
-- TABLA: config.Requisitos_Extract
-- Define que reportes son obligatorios por fondo
-- ============================================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables t
               INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
               WHERE s.name = 'config' AND t.name = 'Requisitos_Extract')
BEGIN
    CREATE TABLE [config].[Requisitos_Extract] (
        ID_Fund INT PRIMARY KEY,

        -- Flags de requisitos (1 = obligatorio, 0 = opcional)
        Req_IPA BIT NOT NULL DEFAULT 1,           -- Siempre obligatorio por defecto
        Req_CAPM BIT NOT NULL DEFAULT 1,          -- Obligatorio si tiene Cash
        Req_SONA BIT NOT NULL DEFAULT 1,          -- Obligatorio para validacion NAV
        Req_PNL BIT NOT NULL DEFAULT 0,           -- Opcional por defecto
        Req_Derivados BIT NOT NULL DEFAULT 0,     -- Opcional por defecto (solo fondos con derivados)
        Req_PosModRF BIT NOT NULL DEFAULT 0,      -- Opcional por defecto

        -- Metadata
        Descripcion NVARCHAR(500) NULL,
        FechaModificacion DATETIME DEFAULT GETDATE(),
        ModificadoPor NVARCHAR(100) DEFAULT SYSTEM_USER
    );

    PRINT 'Tabla [config].[Requisitos_Extract] creada';
END
GO

-- ============================================================================
-- TABLA: config.Requisitos_Extract_Default
-- Valores por defecto cuando un fondo no tiene configuracion especifica
-- ============================================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables t
               INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
               WHERE s.name = 'config' AND t.name = 'Requisitos_Extract_Default')
BEGIN
    CREATE TABLE [config].[Requisitos_Extract_Default] (
        ID INT PRIMARY KEY DEFAULT 1 CHECK (ID = 1),  -- Solo una fila

        Req_IPA BIT NOT NULL DEFAULT 1,
        Req_CAPM BIT NOT NULL DEFAULT 1,
        Req_SONA BIT NOT NULL DEFAULT 1,
        Req_PNL BIT NOT NULL DEFAULT 0,
        Req_Derivados BIT NOT NULL DEFAULT 0,
        Req_PosModRF BIT NOT NULL DEFAULT 0,

        FechaModificacion DATETIME DEFAULT GETDATE()
    );

    -- Insertar valores por defecto
    INSERT INTO [config].[Requisitos_Extract_Default] (ID)
    VALUES (1);

    PRINT 'Tabla [config].[Requisitos_Extract_Default] creada con valores por defecto';
END
GO

-- ============================================================================
-- TABLA: config.Extract_Source
-- Define el Source de cada tabla extract para validacion de homologacion
-- ============================================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables t
               INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
               WHERE s.name = 'config' AND t.name = 'Extract_Source')
BEGIN
    CREATE TABLE [config].[Extract_Source] (
        ID INT IDENTITY(1,1) PRIMARY KEY,
        ExtractTable NVARCHAR(50) NOT NULL UNIQUE,  -- Nombre de tabla extract (IPA, CAPM, etc.)
        SourceName NVARCHAR(50) NOT NULL,           -- Source para HOMOL_Funds
        Descripcion NVARCHAR(200) NULL,
        IsActive BIT NOT NULL DEFAULT 1
    );

    -- Datos iniciales
    INSERT INTO [config].[Extract_Source] (ExtractTable, SourceName, Descripcion) VALUES
    ('IPA', 'GENEVA', 'Investment Position Appraisal - Geneva'),
    ('CAPM', 'GENEVA', 'Cash Appraisal por Moneda - Geneva'),
    ('SONA', 'GENEVA', 'State of Net Assets - Geneva'),
    ('PNL', 'GENEVA', 'Profit and Loss - Geneva'),
    ('PosModRF', 'GENEVA', 'Posiciones Mod Renta Fija - Geneva'),
    ('Derivados', 'DERIVADOS', 'Derivados - Sistema externo');

    PRINT 'Tabla [config].[Extract_Source] creada con datos iniciales';
END
GO

-- ============================================================================
-- FUNCION: fn_GetRequisitosExtract
-- Obtiene los requisitos de un fondo (o defaults si no tiene config especifica)
-- ============================================================================
IF OBJECT_ID('config.fn_GetRequisitosExtract', 'TF') IS NOT NULL
    DROP FUNCTION config.fn_GetRequisitosExtract;
GO

CREATE FUNCTION [config].[fn_GetRequisitosExtract]
(
    @ID_Fund INT
)
RETURNS @Requisitos TABLE (
    Req_IPA BIT,
    Req_CAPM BIT,
    Req_SONA BIT,
    Req_PNL BIT,
    Req_Derivados BIT,
    Req_PosModRF BIT,
    UsaDefault BIT  -- 1 si usa valores por defecto
)
AS
BEGIN
    -- Intentar obtener configuracion especifica del fondo
    IF EXISTS (SELECT 1 FROM config.Requisitos_Extract WHERE ID_Fund = @ID_Fund)
    BEGIN
        INSERT INTO @Requisitos
        SELECT Req_IPA, Req_CAPM, Req_SONA, Req_PNL, Req_Derivados, Req_PosModRF, 0
        FROM config.Requisitos_Extract
        WHERE ID_Fund = @ID_Fund;
    END
    ELSE
    BEGIN
        -- Usar valores por defecto
        INSERT INTO @Requisitos
        SELECT Req_IPA, Req_CAPM, Req_SONA, Req_PNL, Req_Derivados, Req_PosModRF, 1
        FROM config.Requisitos_Extract_Default
        WHERE ID = 1;
    END

    RETURN;
END
GO

-- ============================================================================
-- VISTA: vw_Requisitos_Extract_Completo
-- Vista que muestra todos los fondos con sus requisitos (especificos o default)
-- ============================================================================
IF OBJECT_ID('config.vw_Requisitos_Extract_Completo', 'V') IS NOT NULL
    DROP VIEW config.vw_Requisitos_Extract_Completo;
GO

CREATE VIEW [config].[vw_Requisitos_Extract_Completo]
AS
SELECT
    f.ID_Fund,
    f.Fund_Name,
    COALESCE(r.Req_IPA, d.Req_IPA) AS Req_IPA,
    COALESCE(r.Req_CAPM, d.Req_CAPM) AS Req_CAPM,
    COALESCE(r.Req_SONA, d.Req_SONA) AS Req_SONA,
    COALESCE(r.Req_PNL, d.Req_PNL) AS Req_PNL,
    COALESCE(r.Req_Derivados, d.Req_Derivados) AS Req_Derivados,
    COALESCE(r.Req_PosModRF, d.Req_PosModRF) AS Req_PosModRF,
    CASE WHEN r.ID_Fund IS NULL THEN 1 ELSE 0 END AS UsaDefault,
    r.Descripcion
FROM dimensionales.BD_Funds f
CROSS JOIN config.Requisitos_Extract_Default d
LEFT JOIN config.Requisitos_Extract r ON f.ID_Fund = r.ID_Fund;
GO

-- ============================================================================
-- PROCEDURE: sp_SetRequisitosExtract
-- Configura los requisitos de un fondo de forma facil
-- ============================================================================
IF OBJECT_ID('config.sp_SetRequisitosExtract', 'P') IS NOT NULL
    DROP PROCEDURE config.sp_SetRequisitosExtract;
GO

CREATE PROCEDURE [config].[sp_SetRequisitosExtract]
    @ID_Fund INT,
    @Req_IPA BIT = NULL,
    @Req_CAPM BIT = NULL,
    @Req_SONA BIT = NULL,
    @Req_PNL BIT = NULL,
    @Req_Derivados BIT = NULL,
    @Req_PosModRF BIT = NULL,
    @Descripcion NVARCHAR(500) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    -- Obtener defaults
    DECLARE @Def_IPA BIT, @Def_CAPM BIT, @Def_SONA BIT, @Def_PNL BIT, @Def_Derivados BIT, @Def_PosModRF BIT;

    SELECT
        @Def_IPA = Req_IPA, @Def_CAPM = Req_CAPM, @Def_SONA = Req_SONA,
        @Def_PNL = Req_PNL, @Def_Derivados = Req_Derivados, @Def_PosModRF = Req_PosModRF
    FROM config.Requisitos_Extract_Default WHERE ID = 1;

    -- MERGE para insertar o actualizar
    MERGE config.Requisitos_Extract AS target
    USING (SELECT @ID_Fund AS ID_Fund) AS source
    ON target.ID_Fund = source.ID_Fund
    WHEN MATCHED THEN
        UPDATE SET
            Req_IPA = COALESCE(@Req_IPA, target.Req_IPA),
            Req_CAPM = COALESCE(@Req_CAPM, target.Req_CAPM),
            Req_SONA = COALESCE(@Req_SONA, target.Req_SONA),
            Req_PNL = COALESCE(@Req_PNL, target.Req_PNL),
            Req_Derivados = COALESCE(@Req_Derivados, target.Req_Derivados),
            Req_PosModRF = COALESCE(@Req_PosModRF, target.Req_PosModRF),
            Descripcion = COALESCE(@Descripcion, target.Descripcion),
            FechaModificacion = GETDATE(),
            ModificadoPor = SYSTEM_USER
    WHEN NOT MATCHED THEN
        INSERT (ID_Fund, Req_IPA, Req_CAPM, Req_SONA, Req_PNL, Req_Derivados, Req_PosModRF, Descripcion)
        VALUES (
            @ID_Fund,
            COALESCE(@Req_IPA, @Def_IPA),
            COALESCE(@Req_CAPM, @Def_CAPM),
            COALESCE(@Req_SONA, @Def_SONA),
            COALESCE(@Req_PNL, @Def_PNL),
            COALESCE(@Req_Derivados, @Def_Derivados),
            COALESCE(@Req_PosModRF, @Def_PosModRF),
            @Descripcion
        );

    PRINT 'Requisitos actualizados para fondo ' + CAST(@ID_Fund AS NVARCHAR(10));
END
GO

-- ============================================================================
-- EJEMPLOS DE USO
-- ============================================================================
/*
-- Marcar fondo 123 como que requiere derivados:
EXEC config.sp_SetRequisitosExtract @ID_Fund = 123, @Req_Derivados = 1,
     @Descripcion = 'Fondo con estrategia de derivados';

-- Marcar fondo 456 como que NO requiere CAPM (fondo sin cash):
EXEC config.sp_SetRequisitosExtract @ID_Fund = 456, @Req_CAPM = 0,
     @Descripcion = 'Fondo sin posiciones cash';

-- Marcar fondo 789 como que requiere todo:
EXEC config.sp_SetRequisitosExtract @ID_Fund = 789,
     @Req_IPA = 1, @Req_CAPM = 1, @Req_SONA = 1, @Req_PNL = 1, @Req_Derivados = 1,
     @Descripcion = 'Fondo completo - requiere todos los reportes';

-- Ver configuracion de todos los fondos:
SELECT * FROM config.vw_Requisitos_Extract_Completo ORDER BY ID_Fund;

-- Ver solo fondos que requieren derivados:
SELECT * FROM config.vw_Requisitos_Extract_Completo WHERE Req_Derivados = 1;
*/

PRINT '========================================';
PRINT 'CONFIGURACION DE REQUISITOS - COMPLETADO';
PRINT '========================================';
GO
