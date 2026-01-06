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
    f.Fund_Code,
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

-- ============================================================================
-- TABLA: config.Umbrales_Suciedades
-- Define umbrales para deteccion de suciedades por fondo
-- Analogo a config.Umbrales_Ajuste
-- ============================================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables t
               INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
               WHERE s.name = 'config' AND t.name = 'Umbrales_Suciedades')
BEGIN
    CREATE TABLE [config].[Umbrales_Suciedades] (
        ID INT IDENTITY(1,1) PRIMARY KEY,
        ID_Fund INT NULL,                    -- NULL = aplica a todos los fondos (global)
        Umbral DECIMAL(18,6) NOT NULL DEFAULT 0.01,  -- Valor por defecto: 0.01
        Descripcion NVARCHAR(200) NULL,
        FechaVigencia DATE NOT NULL DEFAULT GETDATE(),
        Activo BIT NOT NULL DEFAULT 1,
        FechaCreacion DATETIME NOT NULL DEFAULT GETDATE(),
        ModificadoPor NVARCHAR(100) DEFAULT SYSTEM_USER,

        -- Constraint: solo un umbral activo por fondo por fecha
        CONSTRAINT UQ_Umbral_Suciedades_Fund UNIQUE (ID_Fund, FechaVigencia)
    );

    -- Insertar umbral global por defecto
    INSERT INTO [config].[Umbrales_Suciedades] (ID_Fund, Umbral, Descripcion)
    VALUES (NULL, 0.01, 'Umbral global por defecto - Posiciones con |Qty| < 0.01 se consideran sucias');

    PRINT 'Tabla [config].[Umbrales_Suciedades] creada con umbral global 0.01';
END
GO

-- ============================================================================
-- FUNCION: fn_GetUmbralSuciedad
-- Obtiene el umbral de suciedad para un fondo (o global si no tiene especifico)
-- ============================================================================
IF OBJECT_ID('config.fn_GetUmbralSuciedad', 'FN') IS NOT NULL
    DROP FUNCTION config.fn_GetUmbralSuciedad;
GO

CREATE FUNCTION [config].[fn_GetUmbralSuciedad]
(
    @ID_Fund INT
)
RETURNS DECIMAL(18,6)
AS
BEGIN
    DECLARE @Umbral DECIMAL(18,6);

    -- Buscar umbral especifico para el fondo (activo y vigente)
    SELECT TOP 1 @Umbral = Umbral
    FROM config.Umbrales_Suciedades
    WHERE ID_Fund = @ID_Fund
      AND Activo = 1
      AND FechaVigencia <= GETDATE()
    ORDER BY FechaVigencia DESC;

    -- Si no hay especifico, buscar global (ID_Fund = NULL)
    IF @Umbral IS NULL
    BEGIN
        SELECT TOP 1 @Umbral = Umbral
        FROM config.Umbrales_Suciedades
        WHERE ID_Fund IS NULL
          AND Activo = 1
          AND FechaVigencia <= GETDATE()
        ORDER BY FechaVigencia DESC;
    END

    -- Default hardcodeado si no hay nada configurado
    IF @Umbral IS NULL
        SET @Umbral = 0.01;

    RETURN @Umbral;
END
GO

-- ============================================================================
-- PROCEDURE: sp_SetUmbralSuciedad
-- Configura el umbral de suciedad para un fondo
-- ============================================================================
IF OBJECT_ID('config.sp_SetUmbralSuciedad', 'P') IS NOT NULL
    DROP PROCEDURE config.sp_SetUmbralSuciedad;
GO

CREATE PROCEDURE [config].[sp_SetUmbralSuciedad]
    @ID_Fund INT = NULL,          -- NULL para umbral global
    @Umbral DECIMAL(18,6),
    @Descripcion NVARCHAR(200) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    -- Usar MERGE para evitar conflictos con UNIQUE constraint (ID_Fund, FechaVigencia)
    MERGE config.Umbrales_Suciedades AS target
    USING (SELECT @ID_Fund AS ID_Fund, CAST(GETDATE() AS DATE) AS FechaVigencia) AS source
    ON (target.ID_Fund = source.ID_Fund OR (target.ID_Fund IS NULL AND source.ID_Fund IS NULL))
       AND target.FechaVigencia = source.FechaVigencia
    WHEN MATCHED THEN
        UPDATE SET
            Umbral = @Umbral,
            Descripcion = COALESCE(@Descripcion, target.Descripcion),
            Activo = 1,
            ModificadoPor = SYSTEM_USER
    WHEN NOT MATCHED THEN
        INSERT (ID_Fund, Umbral, Descripcion, FechaVigencia, Activo)
        VALUES (@ID_Fund, @Umbral, @Descripcion, CAST(GETDATE() AS DATE), 1);

    -- Desactivar umbrales anteriores (otras fechas) para este fondo
    UPDATE config.Umbrales_Suciedades
    SET Activo = 0
    WHERE (ID_Fund = @ID_Fund OR (ID_Fund IS NULL AND @ID_Fund IS NULL))
      AND FechaVigencia < CAST(GETDATE() AS DATE)
      AND Activo = 1;

    IF @ID_Fund IS NULL
        PRINT 'Umbral GLOBAL de suciedades actualizado a ' + CAST(@Umbral AS NVARCHAR(20));
    ELSE
        PRINT 'Umbral de suciedades para fondo ' + CAST(@ID_Fund AS NVARCHAR(10)) + ' actualizado a ' + CAST(@Umbral AS NVARCHAR(20));
END
GO

-- ============================================================================
-- VISTA: vw_Umbrales_Suciedades_Activos
-- Muestra los umbrales activos por fondo
-- ============================================================================
IF OBJECT_ID('config.vw_Umbrales_Suciedades_Activos', 'V') IS NOT NULL
    DROP VIEW config.vw_Umbrales_Suciedades_Activos;
GO

CREATE VIEW [config].[vw_Umbrales_Suciedades_Activos]
AS
SELECT
    u.ID,
    u.ID_Fund,
    COALESCE(f.Fund_Code, '** GLOBAL **') AS Fund_Code,
    u.Umbral,
    u.Descripcion,
    u.FechaVigencia,
    u.FechaCreacion,
    u.ModificadoPor
FROM config.Umbrales_Suciedades u
LEFT JOIN dimensionales.BD_Funds f ON u.ID_Fund = f.ID_Fund
WHERE u.Activo = 1;
GO

/*
-- ============================================================================
-- EJEMPLOS DE USO
-- ============================================================================

-- Ver umbral actual para un fondo:
SELECT config.fn_GetUmbralSuciedad(20) AS UmbralFondo20;

-- Ver todos los umbrales activos:
SELECT * FROM config.vw_Umbrales_Suciedades_Activos;

-- Cambiar umbral global a 0.005:
EXEC config.sp_SetUmbralSuciedad @Umbral = 0.005,
     @Descripcion = 'Umbral mas estricto';

-- Configurar umbral especifico para fondo 60 (mas permisivo):
EXEC config.sp_SetUmbralSuciedad @ID_Fund = 60, @Umbral = 0.1,
     @Descripcion = 'Fondo con posiciones pequenas permitidas';

-- Configurar umbral especifico para fondo 2 (mas estricto):
EXEC config.sp_SetUmbralSuciedad @ID_Fund = 2, @Umbral = 0.001,
     @Descripcion = 'Fondo con alta precision requerida';
*/

-- ============================================================================
-- VISTA: vw_Umbrales_Ajuste_Activos
-- ============================================================================
-- Muestra los umbrales de ajuste activos por fuente y fondo
-- ============================================================================
IF OBJECT_ID('config.vw_Umbrales_Ajuste_Activos', 'V') IS NOT NULL
    DROP VIEW config.vw_Umbrales_Ajuste_Activos;
GO

CREATE VIEW [config].[vw_Umbrales_Ajuste_Activos]
AS
SELECT
    u.ID,
    u.Fuente,
    u.ID_Fund,
    COALESCE(f.Fund_Code, '** GLOBAL **') AS Fund_Code,
    u.Umbral,
    u.FechaVigencia,
    u.FechaCreacion
FROM config.Umbrales_Ajuste u
LEFT JOIN dimensionales.BD_Funds f ON u.ID_Fund = f.ID_Fund
WHERE u.Activo = 1;
GO

/*
-- ============================================================================
-- EJEMPLOS DE USO - Umbrales_Ajuste
-- ============================================================================

-- Ver todos los umbrales de ajuste activos:
SELECT * FROM config.vw_Umbrales_Ajuste_Activos ORDER BY Fuente, ID_Fund;

-- Ver umbral para CAPM del fondo 20:
SELECT config.fn_GetUmbralAjuste('CAPM', 20) AS UmbralCAPM_Fondo20;
*/

PRINT '========================================';
PRINT 'CONFIGURACION DE REQUISITOS - COMPLETADO';
PRINT '========================================';
GO
