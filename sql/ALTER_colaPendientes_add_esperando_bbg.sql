USE [MonedaHomologacion]
GO

-- ============================================================================
-- ALTER sandbox.colaPendientes - Add 'esperando_bbg' to estado CHECK constraint
-- This estado is used for BBG Fixed Income instruments waiting for Bloomberg data
-- ============================================================================

-- Drop existing constraint
IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CHK_colaPendientes_estado'
    AND parent_object_id = OBJECT_ID('sandbox.colaPendientes')
)
BEGIN
    ALTER TABLE sandbox.colaPendientes
    DROP CONSTRAINT CHK_colaPendientes_estado;
    PRINT 'Dropped constraint CHK_colaPendientes_estado';
END
GO

-- Add new constraint with esperando_bbg
ALTER TABLE sandbox.colaPendientes
ADD CONSTRAINT CHK_colaPendientes_estado
CHECK (estado IN ('pendiente', 'en_proceso', 'completado', 'error', 'esperando_bbg'));

PRINT 'Added constraint CHK_colaPendientes_estado with esperando_bbg';
GO
