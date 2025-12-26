-- =============================================
-- Migration 012: Crear Tabla logs.Procesos
-- Descripción: Tabla padre para agrupar ejecuciones por fecha
-- Fecha: 2025-12-26
-- Autor: Claude Code
-- =============================================

USE Inteligencia_Producto_Dev;
GO

-- Verificar si la tabla ya existe
IF NOT EXISTS (SELECT * FROM sys.tables WHERE schema_id = SCHEMA_ID('logs') AND name = 'Procesos')
BEGIN
    PRINT '✓ Creando tabla logs.Procesos...';

    CREATE TABLE logs.Procesos (
        ID_Proceso BIGINT NOT NULL,
        FechaReporte NVARCHAR(10) NOT NULL,
        Estado NVARCHAR(20) NOT NULL DEFAULT 'EN_PROGRESO',
        Etapa_Actual NVARCHAR(50) NULL,
        FechaInicio DATETIME2 NOT NULL DEFAULT GETDATE(),
        FechaFin DATETIME2 NULL,
        TotalFondos INT NOT NULL DEFAULT 0,
        FondosExitosos INT NOT NULL DEFAULT 0,
        FondosFallidos INT NOT NULL DEFAULT 0,
        FondosOmitidos INT NOT NULL DEFAULT 0,
        Duracion_Total_Ms INT NULL,
        Usuario NVARCHAR(100) NULL,
        Observaciones NVARCHAR(MAX) NULL,

        CONSTRAINT PK_Procesos PRIMARY KEY CLUSTERED (ID_Proceso),
        CONSTRAINT CHK_Procesos_Estado CHECK (Estado IN ('EN_PROGRESO', 'COMPLETADO', 'ERROR', 'COMPLETADO_CON_ERRORES', 'CANCELADO')),
        CONSTRAINT CHK_Procesos_FechaReporte CHECK (FechaReporte LIKE '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')
    );

    -- Índice por fecha de reporte (queries frecuentes)
    CREATE NONCLUSTERED INDEX IX_Procesos_FechaReporte
    ON logs.Procesos(FechaReporte)
    INCLUDE (Estado, FechaInicio, TotalFondos, FondosExitosos, FondosFallidos);

    -- Índice por estado (para monitoreo de procesos activos)
    CREATE NONCLUSTERED INDEX IX_Procesos_Estado
    ON logs.Procesos(Estado)
    INCLUDE (ID_Proceso, FechaReporte, FechaInicio);

    -- Índice por fecha de inicio (para auditoría temporal)
    CREATE NONCLUSTERED INDEX IX_Procesos_FechaInicio
    ON logs.Procesos(FechaInicio DESC)
    INCLUDE (ID_Proceso, FechaReporte, Estado);

    PRINT '✓ Tabla logs.Procesos creada exitosamente';
    PRINT '✓ Índices creados: IX_Procesos_FechaReporte, IX_Procesos_Estado, IX_Procesos_FechaInicio';
END
ELSE
BEGIN
    PRINT '⚠ La tabla logs.Procesos ya existe. Saltando creación.';
END
GO

-- Agregar descripción extendida a la tabla
IF NOT EXISTS (
    SELECT * FROM sys.extended_properties
    WHERE major_id = OBJECT_ID('logs.Procesos')
    AND minor_id = 0
    AND name = 'MS_Description'
)
BEGIN
    EXEC sys.sp_addextendedproperty
        @name = N'MS_Description',
        @value = N'Tabla padre que agrupa múltiples ejecuciones de fondos para una fecha específica. Cada proceso puede tener N ejecuciones hijas (una por fondo).',
        @level0type = N'SCHEMA', @level0name = N'logs',
        @level1type = N'TABLE', @level1name = N'Procesos';
END
GO

-- Verificación final
IF EXISTS (SELECT * FROM sys.tables WHERE schema_id = SCHEMA_ID('logs') AND name = 'Procesos')
BEGIN
    PRINT '';
    PRINT '================================================';
    PRINT '✅ MIGRACIÓN 012 COMPLETADA EXITOSAMENTE';
    PRINT '================================================';
    PRINT 'Tabla: logs.Procesos';
    PRINT 'Índices: 3 creados';
    PRINT '';

    -- Mostrar estructura de la tabla
    SELECT
        COLUMN_NAME,
        DATA_TYPE,
        CHARACTER_MAXIMUM_LENGTH,
        IS_NULLABLE,
        COLUMN_DEFAULT
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'logs' AND TABLE_NAME = 'Procesos'
    ORDER BY ORDINAL_POSITION;
END
ELSE
BEGIN
    PRINT '';
    PRINT '================================================';
    PRINT '❌ ERROR EN MIGRACIÓN 012';
    PRINT '================================================';
    RAISERROR('La tabla logs.Procesos no se creó correctamente', 16, 1);
END
GO
