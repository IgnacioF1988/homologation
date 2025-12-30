-- =============================================
-- Migration: 100_CREATE_NEW_LOGS_SCHEMA.sql
-- Fecha: 2025-12-30
-- Descripcion: Crear nuevo schema simplificado de logs para tracking
--
-- CONTEXTO:
-- Esta migracion crea nuevas tablas con sufijo _v2 que reemplazan:
-- - logs.Ejecuciones (19 cols) + logs.Ejecucion_Fondos (71 cols) -> logs.Ejecuciones_v2 (25 cols)
-- - logs.Ejecucion_Logs (12 cols) -> logs.EventosDetallados (9 cols) - SOLO ERROR/WARNING/STAND_BY
-- - logs.FondosEnStandBy (14 cols) -> logs.StandBy_v2 (12 cols)
-- - logs.Trace_Records -> ELIMINADO (no se usa)
--
-- Las tablas antiguas se mantienen hasta que se complete la migracion
-- =============================================

USE [Moneda_Homologacion]
GO

PRINT '=========================================='
PRINT 'Iniciando migracion 100: Nuevo schema logs'
PRINT '=========================================='

-- =============================================
-- TABLA 1: logs.Procesos_v2 (sin cambios significativos)
-- Agrupa ejecuciones de multiples fondos en un proceso unico
-- =============================================

IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'logs.Procesos_v2') AND type in (N'U'))
BEGIN
    PRINT 'Creando tabla logs.Procesos_v2...'

    CREATE TABLE logs.Procesos_v2 (
        ID_Proceso BIGINT IDENTITY(1,1) PRIMARY KEY,
        FechaReporte DATE NOT NULL,
        Estado NVARCHAR(20) NOT NULL DEFAULT 'EN_PROGRESO',
        -- Estados: EN_PROGRESO, OK, ERROR, PARCIAL
        FechaInicio DATETIME2 NOT NULL DEFAULT GETDATE(),
        FechaFin DATETIME2 NULL,
        TotalFondos INT NOT NULL DEFAULT 0,
        FondosOK INT NOT NULL DEFAULT 0,
        FondosError INT NOT NULL DEFAULT 0,
        FondosStandBy INT NOT NULL DEFAULT 0,
        FondosOmitidos INT NOT NULL DEFAULT 0,
        Duracion_Ms INT NULL,
        Usuario NVARCHAR(100) NULL DEFAULT SUSER_SNAME(),
        Observaciones NVARCHAR(MAX) NULL
    );

    -- Indices
    CREATE NONCLUSTERED INDEX IX_Procesos_v2_Fecha
        ON logs.Procesos_v2 (FechaReporte DESC);

    CREATE NONCLUSTERED INDEX IX_Procesos_v2_Estado
        ON logs.Procesos_v2 (Estado);

    PRINT '  OK - logs.Procesos_v2 creada'
END
ELSE
BEGIN
    PRINT '  SKIP - logs.Procesos_v2 ya existe'
END
GO

-- =============================================
-- TABLA 2: logs.Ejecuciones_v2 (SIMPLIFICADA)
-- Una fila por fondo procesado
-- 8 estados de servicio en lugar de 30+ sub-estados
-- =============================================

IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'logs.Ejecuciones_v2') AND type in (N'U'))
BEGIN
    PRINT 'Creando tabla logs.Ejecuciones_v2...'

    CREATE TABLE logs.Ejecuciones_v2 (
        ID_Ejecucion BIGINT IDENTITY(1,1) PRIMARY KEY,
        ID_Proceso BIGINT NOT NULL,
        ID_Fund INT NOT NULL,
        FundShortName VARCHAR(50) NULL,

        -- =============================================
        -- ESTADOS DE SERVICIO (8 columnas, no 30+)
        -- Valores: PENDIENTE, EN_PROGRESO, OK, ERROR, STAND_BY, OMITIDO, N/A
        -- =============================================
        Estado_Extraccion NVARCHAR(20) NULL DEFAULT 'PENDIENTE',
        Estado_Validacion NVARCHAR(20) NULL DEFAULT 'PENDIENTE',
        Estado_IPA NVARCHAR(20) NULL DEFAULT 'PENDIENTE',
        Estado_CAPM NVARCHAR(20) NULL DEFAULT 'PENDIENTE',
        Estado_Derivados NVARCHAR(20) NULL DEFAULT 'PENDIENTE',
        Estado_PNL NVARCHAR(20) NULL DEFAULT 'PENDIENTE',
        Estado_UBS NVARCHAR(20) NULL DEFAULT 'PENDIENTE',
        Estado_Concatenar NVARCHAR(20) NULL DEFAULT 'PENDIENTE',

        -- Estado final consolidado
        Estado_Final NVARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
        -- Valores: PENDIENTE, EN_PROGRESO, OK, ERROR, STAND_BY, OMITIDO

        -- Timestamps
        Inicio_Procesamiento DATETIME2 NOT NULL DEFAULT GETDATE(),
        Fin_Procesamiento DATETIME2 NULL,
        Duracion_Ms INT NULL,

        -- =============================================
        -- FLAGS DE PROBLEMA (para filtros rapidos)
        -- =============================================
        TieneSuciedades BIT NOT NULL DEFAULT 0,
        TieneProblemasHomologacion BIT NOT NULL DEFAULT 0,
        TieneDescuadres BIT NOT NULL DEFAULT 0,

        -- =============================================
        -- ERROR INFO (solo si hay error)
        -- =============================================
        Paso_Con_Error NVARCHAR(100) NULL,
        Mensaje_Error NVARCHAR(MAX) NULL,

        -- Metadata adicional
        Portfolio_Geneva VARCHAR(50) NULL,
        Portfolio_CAPM VARCHAR(50) NULL,
        Portfolio_Derivados VARCHAR(50) NULL,
        Portfolio_UBS VARCHAR(50) NULL,

        -- Foreign key
        CONSTRAINT FK_Ejecuciones_v2_Proceso
            FOREIGN KEY (ID_Proceso) REFERENCES logs.Procesos_v2(ID_Proceso)
    );

    -- Indices optimizados
    CREATE NONCLUSTERED INDEX IX_Ejecuciones_v2_Proceso
        ON logs.Ejecuciones_v2 (ID_Proceso)
        INCLUDE (ID_Fund, Estado_Final);

    CREATE NONCLUSTERED INDEX IX_Ejecuciones_v2_Fund
        ON logs.Ejecuciones_v2 (ID_Fund, ID_Proceso);

    CREATE NONCLUSTERED INDEX IX_Ejecuciones_v2_Estado
        ON logs.Ejecuciones_v2 (Estado_Final)
        INCLUDE (ID_Proceso, ID_Fund);

    -- Indices separados para cada flag (filtered indexes no soportan OR)
    CREATE NONCLUSTERED INDEX IX_Ejecuciones_v2_Suciedades
        ON logs.Ejecuciones_v2 (TieneSuciedades)
        INCLUDE (ID_Proceso, ID_Fund)
        WHERE TieneSuciedades = 1;

    CREATE NONCLUSTERED INDEX IX_Ejecuciones_v2_Homologacion
        ON logs.Ejecuciones_v2 (TieneProblemasHomologacion)
        INCLUDE (ID_Proceso, ID_Fund)
        WHERE TieneProblemasHomologacion = 1;

    CREATE NONCLUSTERED INDEX IX_Ejecuciones_v2_Descuadres
        ON logs.Ejecuciones_v2 (TieneDescuadres)
        INCLUDE (ID_Proceso, ID_Fund)
        WHERE TieneDescuadres = 1;

    PRINT '  OK - logs.Ejecuciones_v2 creada'
END
ELSE
BEGIN
    PRINT '  SKIP - logs.Ejecuciones_v2 ya existe'
END
GO

-- =============================================
-- TABLA 3: logs.EventosDetallados (NUEVA)
-- SOLO registra ERROR, WARNING, STAND_BY
-- NO registra DEBUG ni INFO (eliminados)
-- =============================================

IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'logs.EventosDetallados') AND type in (N'U'))
BEGIN
    PRINT 'Creando tabla logs.EventosDetallados...'

    CREATE TABLE logs.EventosDetallados (
        ID_Evento BIGINT IDENTITY(1,1) PRIMARY KEY,
        ID_Ejecucion BIGINT NOT NULL,
        ID_Fund INT NOT NULL,
        Timestamp DATETIME2 NOT NULL DEFAULT GETDATE(),

        -- Nivel: SOLO ERROR, WARNING, STAND_BY (nunca DEBUG/INFO)
        Nivel NVARCHAR(10) NOT NULL,

        -- Servicio: EXTRACCION, VALIDACION, IPA, CAPM, DERIVADOS, PNL, UBS, CONCATENAR
        Servicio NVARCHAR(50) NOT NULL,

        -- SubEtapa: SP especifico o paso interno (opcional)
        SubEtapa NVARCHAR(100) NULL,

        -- Mensaje y detalles
        Mensaje NVARCHAR(1000) NOT NULL,
        Stack_Trace NVARCHAR(MAX) NULL,
        Datos_JSON NVARCHAR(MAX) NULL,

        -- Foreign key
        CONSTRAINT FK_Eventos_Ejecucion
            FOREIGN KEY (ID_Ejecucion) REFERENCES logs.Ejecuciones_v2(ID_Ejecucion),

        -- Constraint para validar niveles
        CONSTRAINT CK_EventosDetallados_Nivel
            CHECK (Nivel IN ('ERROR', 'WARNING', 'STAND_BY'))
    );

    -- Indice clustered en ID_Ejecucion + Timestamp para queries de timeline
    CREATE NONCLUSTERED INDEX IX_Eventos_Ejecucion
        ON logs.EventosDetallados (ID_Ejecucion, Timestamp DESC)
        INCLUDE (Nivel, Servicio, Mensaje);

    -- Indice para filtrar por nivel
    CREATE NONCLUSTERED INDEX IX_Eventos_Nivel
        ON logs.EventosDetallados (Nivel, Timestamp DESC)
        INCLUDE (ID_Ejecucion, Servicio);

    -- Indice para busqueda por servicio
    CREATE NONCLUSTERED INDEX IX_Eventos_Servicio
        ON logs.EventosDetallados (Servicio, Timestamp DESC)
        WHERE Nivel = 'ERROR';

    PRINT '  OK - logs.EventosDetallados creada'
END
ELSE
BEGIN
    PRINT '  SKIP - logs.EventosDetallados ya existe'
END
GO

-- =============================================
-- TABLA 4: logs.StandBy_v2 (SIMPLIFICADA)
-- Tracking de fondos en stand-by con detalles de problema
-- =============================================

IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'logs.StandBy_v2') AND type in (N'U'))
BEGIN
    PRINT 'Creando tabla logs.StandBy_v2...'

    CREATE TABLE logs.StandBy_v2 (
        ID_StandBy BIGINT IDENTITY(1,1) PRIMARY KEY,
        ID_Ejecucion BIGINT NOT NULL,
        ID_Fund INT NOT NULL,

        -- Tipo de problema
        TipoProblema NVARCHAR(50) NOT NULL,
        -- Valores: SUCIEDADES, HOMOLOGACION, DESCUADRES_CAPM, DESCUADRES_GENERAL

        -- Codigo de stand-by del SP (5, 6, 7, 8)
        CodigoStandBy INT NOT NULL,

        -- Servicio donde se bloqueo
        ServicioBloqueante NVARCHAR(50) NOT NULL,

        -- Punto especifico de bloqueo (SP name o paso)
        PuntoBloqueo NVARCHAR(100) NULL,

        -- Cantidades
        CantidadProblemas INT NOT NULL DEFAULT 1,
        ProblemasResueltos INT NOT NULL DEFAULT 0,

        -- Detalles
        MotivoDetallado NVARCHAR(MAX) NULL,
        TablaColaReferencia NVARCHAR(100) NULL,

        -- Estado del stand-by
        Estado NVARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
        -- Valores: PENDIENTE, EN_REVISION, RESUELTO

        -- Timestamps
        FechaDeteccion DATETIME2 NOT NULL DEFAULT GETDATE(),
        FechaResolucion DATETIME2 NULL,
        UsuarioRevision NVARCHAR(100) NULL,

        -- Foreign key
        CONSTRAINT FK_StandBy_v2_Ejecucion
            FOREIGN KEY (ID_Ejecucion) REFERENCES logs.Ejecuciones_v2(ID_Ejecucion),

        -- Constraint para validar tipos
        CONSTRAINT CK_StandBy_v2_Tipo
            CHECK (TipoProblema IN ('SUCIEDADES', 'HOMOLOGACION', 'DESCUADRES_CAPM', 'DESCUADRES_GENERAL')),

        -- Constraint para validar codigos
        CONSTRAINT CK_StandBy_v2_Codigo
            CHECK (CodigoStandBy IN (5, 6, 7, 8)),

        -- Constraint para validar estados
        CONSTRAINT CK_StandBy_v2_Estado
            CHECK (Estado IN ('PENDIENTE', 'EN_REVISION', 'RESUELTO'))
    );

    -- Indices
    CREATE NONCLUSTERED INDEX IX_StandBy_v2_Ejecucion
        ON logs.StandBy_v2 (ID_Ejecucion, ID_Fund);

    CREATE NONCLUSTERED INDEX IX_StandBy_v2_Estado
        ON logs.StandBy_v2 (Estado)
        WHERE Estado = 'PENDIENTE';

    CREATE NONCLUSTERED INDEX IX_StandBy_v2_Tipo
        ON logs.StandBy_v2 (TipoProblema, Estado)
        INCLUDE (ID_Ejecucion, ID_Fund, CantidadProblemas);

    PRINT '  OK - logs.StandBy_v2 creada'
END
ELSE
BEGIN
    PRINT '  SKIP - logs.StandBy_v2 ya existe'
END
GO

-- =============================================
-- STORED PROCEDURE: logs.sp_Inicializar_Proceso_v2
-- Crea proceso y prepara para ejecuciones
-- =============================================

IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'logs.sp_Inicializar_Proceso_v2') AND type in (N'P'))
    DROP PROCEDURE logs.sp_Inicializar_Proceso_v2
GO

CREATE PROCEDURE logs.sp_Inicializar_Proceso_v2
    @FechaReporte NVARCHAR(10),
    @Usuario NVARCHAR(100) = NULL,
    @ID_Proceso BIGINT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    -- Insertar proceso
    INSERT INTO logs.Procesos_v2 (FechaReporte, Usuario)
    VALUES (@FechaReporte, ISNULL(@Usuario, SUSER_SNAME()));

    SET @ID_Proceso = SCOPE_IDENTITY();

    SELECT @ID_Proceso AS ID_Proceso;
END
GO

PRINT 'OK - logs.sp_Inicializar_Proceso_v2 creado'
GO

-- =============================================
-- STORED PROCEDURE: logs.sp_Inicializar_Ejecucion_v2
-- Crea registro de ejecucion para un fondo
-- =============================================

IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'logs.sp_Inicializar_Ejecucion_v2') AND type in (N'P'))
    DROP PROCEDURE logs.sp_Inicializar_Ejecucion_v2
GO

CREATE PROCEDURE logs.sp_Inicializar_Ejecucion_v2
    @ID_Proceso BIGINT,
    @ID_Fund INT,
    @FundShortName VARCHAR(50) = NULL,
    @Portfolio_Geneva VARCHAR(50) = NULL,
    @Portfolio_CAPM VARCHAR(50) = NULL,
    @Portfolio_Derivados VARCHAR(50) = NULL,
    @Portfolio_UBS VARCHAR(50) = NULL,
    @ID_Ejecucion BIGINT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    INSERT INTO logs.Ejecuciones_v2 (
        ID_Proceso,
        ID_Fund,
        FundShortName,
        Portfolio_Geneva,
        Portfolio_CAPM,
        Portfolio_Derivados,
        Portfolio_UBS
    )
    VALUES (
        @ID_Proceso,
        @ID_Fund,
        @FundShortName,
        @Portfolio_Geneva,
        @Portfolio_CAPM,
        @Portfolio_Derivados,
        @Portfolio_UBS
    );

    SET @ID_Ejecucion = SCOPE_IDENTITY();

    -- Actualizar contador de fondos en proceso
    UPDATE logs.Procesos_v2
    SET TotalFondos = TotalFondos + 1
    WHERE ID_Proceso = @ID_Proceso;

    SELECT @ID_Ejecucion AS ID_Ejecucion;
END
GO

PRINT 'OK - logs.sp_Inicializar_Ejecucion_v2 creado'
GO

-- =============================================
-- STORED PROCEDURE: logs.sp_Actualizar_Estado_v2
-- Actualiza estado de un servicio para una ejecucion
-- =============================================

IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'logs.sp_Actualizar_Estado_v2') AND type in (N'P'))
    DROP PROCEDURE logs.sp_Actualizar_Estado_v2
GO

CREATE PROCEDURE logs.sp_Actualizar_Estado_v2
    @ID_Ejecucion BIGINT,
    @Servicio NVARCHAR(50),
    @Estado NVARCHAR(20)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @SQL NVARCHAR(500);
    DECLARE @Columna NVARCHAR(50);

    -- Mapear servicio a columna
    SET @Columna = CASE @Servicio
        WHEN 'EXTRACCION' THEN 'Estado_Extraccion'
        WHEN 'VALIDACION' THEN 'Estado_Validacion'
        WHEN 'IPA' THEN 'Estado_IPA'
        WHEN 'PROCESS_IPA' THEN 'Estado_IPA'
        WHEN 'CAPM' THEN 'Estado_CAPM'
        WHEN 'PROCESS_CAPM' THEN 'Estado_CAPM'
        WHEN 'DERIVADOS' THEN 'Estado_Derivados'
        WHEN 'PROCESS_DERIVADOS' THEN 'Estado_Derivados'
        WHEN 'PNL' THEN 'Estado_PNL'
        WHEN 'PROCESS_PNL' THEN 'Estado_PNL'
        WHEN 'UBS' THEN 'Estado_UBS'
        WHEN 'PROCESS_UBS' THEN 'Estado_UBS'
        WHEN 'CONCATENAR' THEN 'Estado_Concatenar'
        ELSE NULL
    END;

    IF @Columna IS NULL
    BEGIN
        RAISERROR('Servicio no reconocido: %s', 16, 1, @Servicio);
        RETURN;
    END

    SET @SQL = N'UPDATE logs.Ejecuciones_v2 SET ' + @Columna + N' = @Estado WHERE ID_Ejecucion = @ID_Ejecucion';

    EXEC sp_executesql @SQL,
        N'@Estado NVARCHAR(20), @ID_Ejecucion BIGINT',
        @Estado, @ID_Ejecucion;
END
GO

PRINT 'OK - logs.sp_Actualizar_Estado_v2 creado'
GO

-- =============================================
-- STORED PROCEDURE: logs.sp_Finalizar_Ejecucion_v2
-- Marca ejecucion como completada
-- =============================================

IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'logs.sp_Finalizar_Ejecucion_v2') AND type in (N'P'))
    DROP PROCEDURE logs.sp_Finalizar_Ejecucion_v2
GO

CREATE PROCEDURE logs.sp_Finalizar_Ejecucion_v2
    @ID_Ejecucion BIGINT,
    @Estado_Final NVARCHAR(20)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @ID_Proceso BIGINT;

    -- Actualizar ejecucion
    UPDATE logs.Ejecuciones_v2
    SET Estado_Final = @Estado_Final,
        Fin_Procesamiento = GETDATE(),
        Duracion_Ms = DATEDIFF(MILLISECOND, Inicio_Procesamiento, GETDATE())
    WHERE ID_Ejecucion = @ID_Ejecucion;

    -- Obtener ID_Proceso
    SELECT @ID_Proceso = ID_Proceso
    FROM logs.Ejecuciones_v2
    WHERE ID_Ejecucion = @ID_Ejecucion;

    -- Actualizar contadores en proceso
    IF @Estado_Final = 'OK'
        UPDATE logs.Procesos_v2 SET FondosOK = FondosOK + 1 WHERE ID_Proceso = @ID_Proceso;
    ELSE IF @Estado_Final = 'ERROR'
        UPDATE logs.Procesos_v2 SET FondosError = FondosError + 1 WHERE ID_Proceso = @ID_Proceso;
    ELSE IF @Estado_Final = 'STAND_BY'
        UPDATE logs.Procesos_v2 SET FondosStandBy = FondosStandBy + 1 WHERE ID_Proceso = @ID_Proceso;
    ELSE IF @Estado_Final = 'OMITIDO'
        UPDATE logs.Procesos_v2 SET FondosOmitidos = FondosOmitidos + 1 WHERE ID_Proceso = @ID_Proceso;
END
GO

PRINT 'OK - logs.sp_Finalizar_Ejecucion_v2 creado'
GO

-- =============================================
-- STORED PROCEDURE: logs.sp_Finalizar_Proceso_v2
-- Marca proceso como completado
-- =============================================

IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'logs.sp_Finalizar_Proceso_v2') AND type in (N'P'))
    DROP PROCEDURE logs.sp_Finalizar_Proceso_v2
GO

CREATE PROCEDURE logs.sp_Finalizar_Proceso_v2
    @ID_Proceso BIGINT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Estado NVARCHAR(20);
    DECLARE @FondosError INT;
    DECLARE @FondosStandBy INT;
    DECLARE @FondosOK INT;

    SELECT @FondosError = FondosError,
           @FondosStandBy = FondosStandBy,
           @FondosOK = FondosOK
    FROM logs.Procesos_v2
    WHERE ID_Proceso = @ID_Proceso;

    -- Determinar estado final
    SET @Estado = CASE
        WHEN @FondosError > 0 THEN 'ERROR'
        WHEN @FondosStandBy > 0 THEN 'PARCIAL'
        WHEN @FondosOK > 0 THEN 'OK'
        ELSE 'ERROR'
    END;

    UPDATE logs.Procesos_v2
    SET Estado = @Estado,
        FechaFin = GETDATE(),
        Duracion_Ms = DATEDIFF(MILLISECOND, FechaInicio, GETDATE())
    WHERE ID_Proceso = @ID_Proceso;
END
GO

PRINT 'OK - logs.sp_Finalizar_Proceso_v2 creado'
GO

-- =============================================
-- RESUMEN
-- =============================================

PRINT ''
PRINT '=========================================='
PRINT 'Migracion 100 completada exitosamente'
PRINT '=========================================='
PRINT ''
PRINT 'Tablas creadas:'
PRINT '  - logs.Procesos_v2'
PRINT '  - logs.Ejecuciones_v2'
PRINT '  - logs.EventosDetallados'
PRINT '  - logs.StandBy_v2'
PRINT ''
PRINT 'Stored procedures creados:'
PRINT '  - logs.sp_Inicializar_Proceso_v2'
PRINT '  - logs.sp_Inicializar_Ejecucion_v2'
PRINT '  - logs.sp_Actualizar_Estado_v2'
PRINT '  - logs.sp_Finalizar_Ejecucion_v2'
PRINT '  - logs.sp_Finalizar_Proceso_v2'
PRINT ''
PRINT 'SIGUIENTE PASO: Ejecutar migracion y verificar con:'
PRINT '  SELECT COUNT(*) FROM logs.Procesos_v2;'
PRINT '  SELECT COUNT(*) FROM logs.Ejecuciones_v2;'
PRINT '=========================================='
GO
