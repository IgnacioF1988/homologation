-- =============================================
-- Migration 047: Agregar columnas de tagging a extract.PNL
-- =============================================
-- PROBLEMA: extract.PNL no tiene ID_Proceso, ID_Ejecucion, ID_Fund
-- CAUSA: Tabla nunca fue migrada al patrón batch con tagging
-- SOLUCIÓN: Agregar las 3 columnas como todas las demás tablas extract.*
-- =============================================

USE [Inteligencia_Producto_Dev];
GO

PRINT '🔧 Migration 047: Agregando columnas de tagging a extract.PNL';
GO

-- Verificar si las columnas ya existen
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'extract' AND TABLE_NAME = 'PNL' AND COLUMN_NAME = 'ID_Proceso')
BEGIN
    ALTER TABLE [extract].[PNL]
    ADD ID_Proceso BIGINT NULL;

    PRINT '✅ Columna ID_Proceso agregada a extract.PNL';
END
ELSE
BEGIN
    PRINT '⚠️ Columna ID_Proceso ya existe en extract.PNL';
END
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'extract' AND TABLE_NAME = 'PNL' AND COLUMN_NAME = 'ID_Ejecucion')
BEGIN
    ALTER TABLE [extract].[PNL]
    ADD ID_Ejecucion BIGINT NULL;

    PRINT '✅ Columna ID_Ejecucion agregada a extract.PNL';
END
ELSE
BEGIN
    PRINT '⚠️ Columna ID_Ejecucion ya existe en extract.PNL';
END
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'extract' AND TABLE_NAME = 'PNL' AND COLUMN_NAME = 'ID_Fund')
BEGIN
    ALTER TABLE [extract].[PNL]
    ADD ID_Fund INT NULL;

    PRINT '✅ Columna ID_Fund agregada a extract.PNL';
END
ELSE
BEGIN
    PRINT '⚠️ Columna ID_Fund ya existe en extract.PNL';
END
GO

-- Crear índice para optimizar JOINs con logs.Ejecucion_Fondos
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_PNL_Tagging' AND object_id = OBJECT_ID('extract.PNL'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_PNL_Tagging
    ON [extract].[PNL] (ID_Proceso, ID_Ejecucion, ID_Fund, FechaReporte)
    INCLUDE (Portfolio);

    PRINT '✅ Índice IX_PNL_Tagging creado en extract.PNL';
END
ELSE
BEGIN
    PRINT '⚠️ Índice IX_PNL_Tagging ya existe en extract.PNL';
END
GO

PRINT '✅ Migration 047 completada - extract.PNL ahora tiene columnas de tagging';
GO
