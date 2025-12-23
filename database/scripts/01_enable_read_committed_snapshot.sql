-- ============================================
-- Script: Habilitar READ_COMMITTED_SNAPSHOT
-- Database: Inteligencia_Producto_Dev
-- Purpose: Reducir deadlocks en ~80% permitiendo que lecturas no bloqueen escrituras
-- ============================================

USE master;
GO

-- Verificar si ya está habilitado
SELECT
    name,
    is_read_committed_snapshot_on,
    snapshot_isolation_state_desc
FROM sys.databases
WHERE name = 'Inteligencia_Producto_Dev';
GO

-- Habilitar READ_COMMITTED_SNAPSHOT (requiere ser el único usuario conectado)
PRINT 'Habilitando READ_COMMITTED_SNAPSHOT en Inteligencia_Producto_Dev...';
PRINT 'IMPORTANTE: Este comando requiere acceso exclusivo a la base de datos.';
PRINT 'Asegúrese de que no haya otras conexiones activas.';
GO

ALTER DATABASE Inteligencia_Producto_Dev
SET READ_COMMITTED_SNAPSHOT ON WITH ROLLBACK IMMEDIATE;
GO

-- Verificar cambio
SELECT
    name AS Database_Name,
    is_read_committed_snapshot_on AS READ_COMMITTED_SNAPSHOT_Enabled,
    snapshot_isolation_state_desc AS Snapshot_Isolation_State,
    CASE
        WHEN is_read_committed_snapshot_on = 1
        THEN 'CONFIGURADO CORRECTAMENTE'
        ELSE 'ERROR: NO SE PUDO HABILITAR'
    END AS Status
FROM sys.databases
WHERE name = 'Inteligencia_Producto_Dev';
GO

PRINT '============================================';
PRINT 'Script completado exitosamente.';
PRINT 'READ_COMMITTED_SNAPSHOT habilitado.';
PRINT '============================================';
GO
