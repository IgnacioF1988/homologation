/*
 * Migration: 005_add_execution_tracking_to_process_tables.sql
 *
 * Fecha: 2025-12-19
 *
 * Descripción:
 * Agrega columna ID_Ejecucion a process.TBL_PNL y ajusta ID_Fund a tipo INT
 * para soportar procesamiento paralelo por fondo.
 *
 * Tablas afectadas:
 * - process.TBL_PNL
 *
 * Cambios:
 * - Agrega ID_Ejecucion (BIGINT NOT NULL DEFAULT 0)
 * - ID_Fund ya existe como NVARCHAR (se mantiene así por compatibilidad)
 * - Crea índice no agrupado para optimizar consultas por ejecución/fondo
 */

USE [Inteligencia_Producto_Dev];
GO

PRINT 'Iniciando migración 005: Process Tables Execution Tracking...';
GO

-- =====================================================
-- TABLA: process.TBL_PNL
-- =====================================================
PRINT 'Procesando process.TBL_PNL...';

-- Agregar ID_Ejecucion
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'process'
      AND TABLE_NAME = 'TBL_PNL'
      AND COLUMN_NAME = 'ID_Ejecucion'
)
BEGIN
    ALTER TABLE [process].[TBL_PNL] ADD ID_Ejecucion BIGINT NOT NULL DEFAULT 0;
    PRINT '  - Columna ID_Ejecucion agregada';
END
ELSE
    PRINT '  - Columna ID_Ejecucion ya existe';

-- Crear índice
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_TBL_PNL_Ejecucion_Fund'
      AND object_id = OBJECT_ID('process.TBL_PNL')
)
BEGIN
    CREATE NONCLUSTERED INDEX IX_TBL_PNL_Ejecucion_Fund
    ON [process].[TBL_PNL] (ID_Ejecucion, ID_Fund)
    INCLUDE (FechaReporte, ID_Instrumento, id_CURR);
    PRINT '  - Índice IX_TBL_PNL_Ejecucion_Fund creado';
END
ELSE
    PRINT '  - Índice IX_TBL_PNL_Ejecucion_Fund ya existe';

PRINT '';
PRINT 'Migración 005 completada exitosamente.';
PRINT 'NOTA: ID_Fund se mantiene como NVARCHAR para compatibilidad con datos existentes.';
GO
