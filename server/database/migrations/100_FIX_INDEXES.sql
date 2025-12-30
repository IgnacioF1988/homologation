-- =============================================
-- Fix: 100_FIX_INDEXES.sql
-- Fecha: 2025-12-30
-- Descripcion: Crear índices faltantes en logs.Ejecuciones_v2
-- =============================================

-- Índice para fondos con suciedades
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Ejecuciones_v2_Suciedades')
BEGIN
    CREATE NONCLUSTERED INDEX IX_Ejecuciones_v2_Suciedades
        ON logs.Ejecuciones_v2 (TieneSuciedades)
        INCLUDE (ID_Proceso, ID_Fund)
        WHERE TieneSuciedades = 1;
    PRINT 'OK - IX_Ejecuciones_v2_Suciedades creado'
END
ELSE
    PRINT 'SKIP - IX_Ejecuciones_v2_Suciedades ya existe'

-- Índice para fondos con problemas de homologación
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Ejecuciones_v2_Homologacion')
BEGIN
    CREATE NONCLUSTERED INDEX IX_Ejecuciones_v2_Homologacion
        ON logs.Ejecuciones_v2 (TieneProblemasHomologacion)
        INCLUDE (ID_Proceso, ID_Fund)
        WHERE TieneProblemasHomologacion = 1;
    PRINT 'OK - IX_Ejecuciones_v2_Homologacion creado'
END
ELSE
    PRINT 'SKIP - IX_Ejecuciones_v2_Homologacion ya existe'

-- Índice para fondos con descuadres
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Ejecuciones_v2_Descuadres')
BEGIN
    CREATE NONCLUSTERED INDEX IX_Ejecuciones_v2_Descuadres
        ON logs.Ejecuciones_v2 (TieneDescuadres)
        INCLUDE (ID_Proceso, ID_Fund)
        WHERE TieneDescuadres = 1;
    PRINT 'OK - IX_Ejecuciones_v2_Descuadres creado'
END
ELSE
    PRINT 'SKIP - IX_Ejecuciones_v2_Descuadres ya existe'

PRINT ''
PRINT 'Fix completado.'
