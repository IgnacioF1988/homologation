-- ============================================
-- Migration 001: ADD STAND-BY SCHEMA
-- ============================================
-- Descripción: Crea infraestructura para sistema de stand-by
--              (pausas del pipeline que requieren aprobación de usuario)
--
-- Tablas modificadas:
--   - logs.FondosEnStandBy (NUEVA)
--   - logs.Ejecucion_Fondos (campos adicionales)
--
-- Fecha: 2025-01-XX
-- Autor: Migration System
-- ============================================

USE [Inteligencia_Producto_Dev];
GO

-- ============================================
-- PARTE 1: Crear tabla logs.FondosEnStandBy
-- ============================================

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'FondosEnStandBy' AND SCHEMA_NAME(schema_id) = 'logs')
BEGIN
    PRINT 'Creando tabla logs.FondosEnStandBy...';

    CREATE TABLE logs.FondosEnStandBy (
        -- Identificadores
        ID_StandBy BIGINT IDENTITY(1,1) PRIMARY KEY,
        ID_Ejecucion BIGINT NOT NULL,
        ID_Fund INT NOT NULL,

        -- Tipo y motivo del stand-by
        TipoProblema NVARCHAR(50) NOT NULL,     -- 'SUCIEDADES', 'HOMOLOGACION', 'DESCUADRES', 'CAPM'
        MotivoDetallado NVARCHAR(500) NULL,     -- Descripción específica del problema

        -- Estado del stand-by
        Estado NVARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',  -- 'PENDIENTE', 'APROBADO', 'RECHAZADO'

        -- Punto de pausa en el pipeline
        PuntoBloqueo NVARCHAR(50) NULL,         -- 'ANTES_CAPM', 'MID_IPA', 'ANTES_PNL', 'POST_DERIVADOS'
        ServicioSiguiente NVARCHAR(50) NULL,    -- 'PROCESS_CAPM', 'PROCESS_PNL', NULL si no aplica

        -- Tracking de resolución
        CantidadProblemas INT NOT NULL DEFAULT 1,
        ProblemasResueltos INT NOT NULL DEFAULT 0,
        TablaColaReferencia NVARCHAR(100) NULL, -- 'sandbox.colaAlertasSuciedades', 'sandbox.Homologacion_Instrumentos', etc.

        -- Auditoría
        FechaDeteccion DATETIME2 NOT NULL DEFAULT GETDATE(),
        FechaResolucion DATETIME2 NULL,         -- Cuando todos los problemas están resueltos
        UsuarioRevision NVARCHAR(100) NULL,     -- Usuario que revisó en Mission Control
        FechaResume DATETIME2 NULL,             -- Cuando se ejecutó resume del pipeline

        -- Constraints
        CONSTRAINT FK_StandBy_Ejecucion FOREIGN KEY (ID_Ejecucion)
            REFERENCES logs.Ejecuciones(ID_Ejecucion),
        CONSTRAINT CK_StandBy_Estado CHECK (Estado IN ('PENDIENTE', 'APROBADO', 'RECHAZADO')),
        CONSTRAINT CK_StandBy_TipoProblema CHECK (TipoProblema IN (
            'SUCIEDADES', 'HOMOLOGACION', 'DESCUADRES', 'CAPM'
        )),
        CONSTRAINT CK_StandBy_PuntoBloqueo CHECK (PuntoBloqueo IN (
            'ANTES_CAPM', 'MID_IPA', 'ANTES_PNL', 'POST_DERIVADOS', NULL
        ))
    );

    -- Índices para performance
    CREATE NONCLUSTERED INDEX IX_StandBy_Ejecucion_Fund
        ON logs.FondosEnStandBy (ID_Ejecucion, ID_Fund)
        INCLUDE (Estado, TipoProblema, PuntoBloqueo);

    CREATE NONCLUSTERED INDEX IX_StandBy_Estado
        ON logs.FondosEnStandBy (Estado, FechaDeteccion)
        INCLUDE (ID_Ejecucion, ID_Fund, TipoProblema);

    CREATE NONCLUSTERED INDEX IX_StandBy_Tipo
        ON logs.FondosEnStandBy (TipoProblema, Estado)
        INCLUDE (ID_Ejecucion, ID_Fund, CantidadProblemas, ProblemasResueltos);

    PRINT 'Tabla logs.FondosEnStandBy creada exitosamente.';
END
ELSE
BEGIN
    PRINT 'Tabla logs.FondosEnStandBy ya existe. Saltando creación.';
END
GO

-- ============================================
-- PARTE 2: Agregar campos a logs.Ejecucion_Fondos
-- ============================================

PRINT 'Agregando campos de stand-by a logs.Ejecucion_Fondos...';

-- Campo: EstadoStandBy
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('logs.Ejecucion_Fondos') AND name = 'EstadoStandBy')
BEGIN
    ALTER TABLE logs.Ejecucion_Fondos
    ADD EstadoStandBy NVARCHAR(20) NULL;  -- NULL, 'PAUSADO', 'APROBADO', 'EN_RESUMEN'

    PRINT '  - Campo EstadoStandBy agregado.';
END
ELSE
BEGIN
    PRINT '  - Campo EstadoStandBy ya existe.';
END

-- Campo: TieneSuciedades
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('logs.Ejecucion_Fondos') AND name = 'TieneSuciedades')
BEGIN
    ALTER TABLE logs.Ejecucion_Fondos
    ADD TieneSuciedades BIT NOT NULL DEFAULT 0;

    PRINT '  - Campo TieneSuciedades agregado.';
END
ELSE
BEGIN
    PRINT '  - Campo TieneSuciedades ya existe.';
END

-- Campo: TieneProblemasHomologacion
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('logs.Ejecucion_Fondos') AND name = 'TieneProblemasHomologacion')
BEGIN
    ALTER TABLE logs.Ejecucion_Fondos
    ADD TieneProblemasHomologacion BIT NOT NULL DEFAULT 0;

    PRINT '  - Campo TieneProblemasHomologacion agregado.';
END
ELSE
BEGIN
    PRINT '  - Campo TieneProblemasHomologacion ya existe.';
END

-- Campo: TieneDescuadres
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('logs.Ejecucion_Fondos') AND name = 'TieneDescuadres')
BEGIN
    ALTER TABLE logs.Ejecucion_Fondos
    ADD TieneDescuadres BIT NOT NULL DEFAULT 0;

    PRINT '  - Campo TieneDescuadres agregado.';
END
ELSE
BEGIN
    PRINT '  - Campo TieneDescuadres ya existe.';
END

-- Campo: TieneProblemasCAPM
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('logs.Ejecucion_Fondos') AND name = 'TieneProblemasCAPM')
BEGIN
    ALTER TABLE logs.Ejecucion_Fondos
    ADD TieneProblemasCAPM BIT NOT NULL DEFAULT 0;

    PRINT '  - Campo TieneProblemasCAPM agregado.';
END
ELSE
BEGIN
    PRINT '  - Campo TieneProblemasCAPM ya existe.';
END

-- Campo: PuntoBloqueoActual
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('logs.Ejecucion_Fondos') AND name = 'PuntoBloqueoActual')
BEGIN
    ALTER TABLE logs.Ejecucion_Fondos
    ADD PuntoBloqueoActual NVARCHAR(50) NULL;  -- 'ANTES_CAPM', 'MID_IPA', 'ANTES_PNL', 'POST_DERIVADOS'

    PRINT '  - Campo PuntoBloqueoActual agregado.';
END
ELSE
BEGIN
    PRINT '  - Campo PuntoBloqueoActual ya existe.';
END

-- Campo: FechaUltimoPause
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('logs.Ejecucion_Fondos') AND name = 'FechaUltimoPause')
BEGIN
    ALTER TABLE logs.Ejecucion_Fondos
    ADD FechaUltimoPause DATETIME2 NULL;

    PRINT '  - Campo FechaUltimoPause agregado.';
END
ELSE
BEGIN
    PRINT '  - Campo FechaUltimoPause ya existe.';
END

-- Campo: FechaUltimoResume
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('logs.Ejecucion_Fondos') AND name = 'FechaUltimoResume')
BEGIN
    ALTER TABLE logs.Ejecucion_Fondos
    ADD FechaUltimoResume DATETIME2 NULL;

    PRINT '  - Campo FechaUltimoResume agregado.';
END
ELSE
BEGIN
    PRINT '  - Campo FechaUltimoResume ya existe.';
END

-- Campo: ContadorPauses
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('logs.Ejecucion_Fondos') AND name = 'ContadorPauses')
BEGIN
    ALTER TABLE logs.Ejecucion_Fondos
    ADD ContadorPauses INT NOT NULL DEFAULT 0;

    PRINT '  - Campo ContadorPauses agregado.';
END
ELSE
BEGIN
    PRINT '  - Campo ContadorPauses ya existe.';
END
GO

-- ============================================
-- PARTE 3: Agregar constraint en EstadoStandBy
-- ============================================

IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_EjecucionFondos_EstadoStandBy'
      AND parent_object_id = OBJECT_ID('logs.Ejecucion_Fondos')
)
BEGIN
    ALTER TABLE logs.Ejecucion_Fondos
    ADD CONSTRAINT CK_EjecucionFondos_EstadoStandBy
        CHECK (EstadoStandBy IN ('PAUSADO', 'APROBADO', 'EN_RESUMEN', NULL));

    PRINT 'Constraint CK_EjecucionFondos_EstadoStandBy agregado.';
END
ELSE
BEGIN
    PRINT 'Constraint CK_EjecucionFondos_EstadoStandBy ya existe.';
END
GO

-- ============================================
-- PARTE 4: Crear índice en logs.Ejecucion_Fondos
-- ============================================

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_EjecucionFondos_EstadoStandBy'
      AND object_id = OBJECT_ID('logs.Ejecucion_Fondos')
)
BEGIN
    CREATE NONCLUSTERED INDEX IX_EjecucionFondos_EstadoStandBy
        ON logs.Ejecucion_Fondos (EstadoStandBy, ID_Ejecucion)
        INCLUDE (ID_Fund, PuntoBloqueoActual, TieneSuciedades, TieneProblemasHomologacion, TieneDescuadres);

    PRINT 'Índice IX_EjecucionFondos_EstadoStandBy creado.';
END
ELSE
BEGIN
    PRINT 'Índice IX_EjecucionFondos_EstadoStandBy ya existe.';
END
GO

-- ============================================
-- VERIFICACIÓN FINAL
-- ============================================

PRINT '';
PRINT '============================================';
PRINT 'VERIFICACIÓN DE MIGRACIÓN 001';
PRINT '============================================';

-- Verificar tabla logs.FondosEnStandBy
IF EXISTS (SELECT 1 FROM sys.tables WHERE name = 'FondosEnStandBy' AND SCHEMA_NAME(schema_id) = 'logs')
BEGIN
    DECLARE @ColumnCount INT;
    SELECT @ColumnCount = COUNT(*)
    FROM sys.columns
    WHERE object_id = OBJECT_ID('logs.FondosEnStandBy');

    PRINT CONCAT('✓ Tabla logs.FondosEnStandBy existe con ', @ColumnCount, ' columnas.');
END
ELSE
BEGIN
    PRINT '✗ ERROR: Tabla logs.FondosEnStandBy NO existe.';
END

-- Verificar campos en logs.Ejecucion_Fondos
DECLARE @CamposStandBy INT;
SELECT @CamposStandBy = COUNT(*)
FROM sys.columns
WHERE object_id = OBJECT_ID('logs.Ejecucion_Fondos')
  AND name IN (
      'EstadoStandBy', 'TieneSuciedades', 'TieneProblemasHomologacion',
      'TieneDescuadres', 'TieneProblemasCAPM', 'PuntoBloqueoActual',
      'FechaUltimoPause', 'FechaUltimoResume', 'ContadorPauses'
  );

PRINT CONCAT('✓ logs.Ejecucion_Fondos tiene ', @CamposStandBy, '/9 campos de stand-by.');

IF @CamposStandBy = 9
BEGIN
    PRINT '';
    PRINT '============================================';
    PRINT '✓ MIGRACIÓN 001 COMPLETADA EXITOSAMENTE';
    PRINT '============================================';
END
ELSE
BEGIN
    PRINT '';
    PRINT '============================================';
    PRINT '⚠ MIGRACIÓN 001 INCOMPLETA - Faltan campos';
    PRINT '============================================';
END
GO
