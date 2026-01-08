/*
================================================================================
FIX: Collation Sandbox Tables v2
================================================================================
Descripción:
  Cambia collation a Latin1_General_CS_AS en tablas sandbox
  CORREGIDO: Usa DROP/ADD CONSTRAINT en lugar de DROP INDEX

NOTA: Este script es para migrar BD existentes.
      Para nuevos deploys, las tablas se crean con collation CS_AS directamente
      en SANDBOX/00_Tables_Sandbox_Global.sql

Fecha: 2026-01-07
================================================================================
*/

USE INTELIGENCIA_PRODUCTO_FULLSTACK;
GO

SET NOCOUNT ON;
GO

PRINT '════════════════════════════════════════════════════════════════════════════════';
PRINT ' FIX: Collation Sandbox Tables v2';
PRINT ' Inicio: ' + CONVERT(VARCHAR(30), GETDATE(), 120);
PRINT '════════════════════════════════════════════════════════════════════════════════';
GO

-- ═══════════════════════════════════════════════════════════════════════════════════
-- 1. sandbox.Homologacion_Instrumentos
-- ═══════════════════════════════════════════════════════════════════════════════════
PRINT '';
PRINT '  [1/3] Procesando sandbox.Homologacion_Instrumentos...';

-- 1a. Eliminar UNIQUE CONSTRAINT
ALTER TABLE sandbox.Homologacion_Instrumentos DROP CONSTRAINT UQ_Homol_Instrumentos;
PRINT '        - Constraint UQ_Homol_Instrumentos eliminado';

-- 1b. Cambiar collation de columnas
ALTER TABLE sandbox.Homologacion_Instrumentos
ALTER COLUMN Instrumento NVARCHAR(100) COLLATE Latin1_General_CS_AS NOT NULL;

ALTER TABLE sandbox.Homologacion_Instrumentos
ALTER COLUMN Source NVARCHAR(50) COLLATE Latin1_General_CS_AS NOT NULL;

PRINT '        - Collation cambiado a CS_AS';

-- 1c. Recrear UNIQUE CONSTRAINT
ALTER TABLE sandbox.Homologacion_Instrumentos
ADD CONSTRAINT UQ_Homol_Instrumentos UNIQUE (Instrumento, Source);

PRINT '        - Constraint UQ_Homol_Instrumentos recreado';
PRINT '  [OK] sandbox.Homologacion_Instrumentos';
GO

-- ═══════════════════════════════════════════════════════════════════════════════════
-- 2. sandbox.Homologacion_Monedas
-- ═══════════════════════════════════════════════════════════════════════════════════
PRINT '';
PRINT '  [2/3] Procesando sandbox.Homologacion_Monedas...';

-- 2a. Eliminar UNIQUE CONSTRAINT
ALTER TABLE sandbox.Homologacion_Monedas DROP CONSTRAINT UQ_Homol_Monedas;
PRINT '        - Constraint UQ_Homol_Monedas eliminado';

-- 2b. Cambiar collation de columnas
ALTER TABLE sandbox.Homologacion_Monedas
ALTER COLUMN Moneda NVARCHAR(50) COLLATE Latin1_General_CS_AS NOT NULL;

ALTER TABLE sandbox.Homologacion_Monedas
ALTER COLUMN Source NVARCHAR(50) COLLATE Latin1_General_CS_AS NOT NULL;

PRINT '        - Collation cambiado a CS_AS';

-- 2c. Recrear UNIQUE CONSTRAINT
ALTER TABLE sandbox.Homologacion_Monedas
ADD CONSTRAINT UQ_Homol_Monedas UNIQUE (Moneda, Source);

PRINT '        - Constraint UQ_Homol_Monedas recreado';
PRINT '  [OK] sandbox.Homologacion_Monedas';
GO

-- ═══════════════════════════════════════════════════════════════════════════════════
-- 3. sandbox.Homologacion_Fondos
-- ═══════════════════════════════════════════════════════════════════════════════════
PRINT '';
PRINT '  [3/3] Procesando sandbox.Homologacion_Fondos...';

-- 3a. Eliminar UNIQUE CONSTRAINT
ALTER TABLE sandbox.Homologacion_Fondos DROP CONSTRAINT UQ_Homol_Fondos;
PRINT '        - Constraint UQ_Homol_Fondos eliminado';

-- 3b. Cambiar collation de columnas
ALTER TABLE sandbox.Homologacion_Fondos
ALTER COLUMN NombreFondo NVARCHAR(100) COLLATE Latin1_General_CS_AS NOT NULL;

ALTER TABLE sandbox.Homologacion_Fondos
ALTER COLUMN Source NVARCHAR(50) COLLATE Latin1_General_CS_AS NOT NULL;

PRINT '        - Collation cambiado a CS_AS';

-- 3c. Recrear UNIQUE CONSTRAINT
ALTER TABLE sandbox.Homologacion_Fondos
ADD CONSTRAINT UQ_Homol_Fondos UNIQUE (NombreFondo, Source);

PRINT '        - Constraint UQ_Homol_Fondos recreado';
PRINT '  [OK] sandbox.Homologacion_Fondos';
GO

-- ═══════════════════════════════════════════════════════════════════════════════════
-- NOTA: Las siguientes tablas ya están procesadas o no requieren cambios
-- ═══════════════════════════════════════════════════════════════════════════════════
-- sandbox.Alertas_Suciedades_IPA: Ya procesado en v1 (InvestID ahora es CS_AS)
-- sandbox.Homologacion_Benchmarks: Source ya está en CS_AS

-- ═══════════════════════════════════════════════════════════════════════════════════
-- VALIDACIÓN
-- ═══════════════════════════════════════════════════════════════════════════════════
PRINT '';
PRINT '┌──────────────────────────────────────────────────────────────────────────────┐';
PRINT '│ VALIDACIÓN                                                                   │';
PRINT '└──────────────────────────────────────────────────────────────────────────────┘';

SELECT
    OBJECT_NAME(c.object_id) AS [Tabla],
    c.name AS [Columna],
    c.collation_name AS [Collation]
FROM sys.columns c
WHERE OBJECT_SCHEMA_NAME(c.object_id) = 'sandbox'
  AND OBJECT_NAME(c.object_id) IN ('Homologacion_Instrumentos', 'Homologacion_Monedas', 'Homologacion_Fondos')
  AND c.collation_name IS NOT NULL
ORDER BY [Tabla], c.column_id;

PRINT '';
PRINT '════════════════════════════════════════════════════════════════════════════════';
PRINT ' FIX COMPLETADO';
PRINT ' Fin: ' + CONVERT(VARCHAR(30), GETDATE(), 120);
PRINT '════════════════════════════════════════════════════════════════════════════════';
GO
