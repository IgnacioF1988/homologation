-- ============================================
-- Migration 007: CLEAN Staging, Sandbox y dimensionales.Suciedades_IPA
-- ============================================
-- Descripción: Vacía todas las tablas staging, sandbox y dimensionales.Suciedades_IPA
--              para empezar con datos limpios
--
-- IMPORTANTE: Este script elimina TODOS los datos de estas tablas
--
-- Fecha: 2025-12-23
-- ============================================

USE [Inteligencia_Producto_Dev];
GO

PRINT '============================================';
PRINT 'MIGRATION 007: LIMPIEZA DE DATOS';
PRINT '============================================';
PRINT '';
PRINT '⚠️  ADVERTENCIA: Este script eliminará TODOS los datos de:';
PRINT '   - Tablas staging.*';
PRINT '   - Tablas sandbox.*';
PRINT '   - dimensionales.Suciedades_IPA';
PRINT '';

GO

-- ============================================
-- 1. Vaciar tablas STAGING
-- ============================================
PRINT 'Vaciando tablas staging...';

TRUNCATE TABLE staging.IPA_WorkTable;
PRINT '  ✓ staging.IPA_WorkTable';

TRUNCATE TABLE staging.IPA_Cash;
PRINT '  ✓ staging.IPA_Cash';

TRUNCATE TABLE staging.PNL_WorkTable;
PRINT '  ✓ staging.PNL_WorkTable';

IF OBJECT_ID('staging.CAPM_WorkTable', 'U') IS NOT NULL
BEGIN
    TRUNCATE TABLE staging.CAPM_WorkTable;
    PRINT '  ✓ staging.CAPM_WorkTable';
END

IF OBJECT_ID('staging.Derivados_WorkTable', 'U') IS NOT NULL
BEGIN
    TRUNCATE TABLE staging.Derivados_WorkTable;
    PRINT '  ✓ staging.Derivados_WorkTable';
END

IF OBJECT_ID('staging.Derivados_Final', 'U') IS NOT NULL
BEGIN
    TRUNCATE TABLE staging.Derivados_Final;
    PRINT '  ✓ staging.Derivados_Final';
END

GO

-- ============================================
-- 2. Vaciar tablas SANDBOX
-- ============================================
PRINT '';
PRINT 'Vaciando tablas sandbox...';

DELETE FROM sandbox.Alertas_Suciedades_IPA;
PRINT '  ✓ sandbox.Alertas_Suciedades_IPA (' + CAST(@@ROWCOUNT AS NVARCHAR(10)) + ' registros eliminados)';

DELETE FROM sandbox.Alertas_Descuadre_Derivados;
PRINT '  ✓ sandbox.Alertas_Descuadre_Derivados (' + CAST(@@ROWCOUNT AS NVARCHAR(10)) + ' registros eliminados)';

DELETE FROM sandbox.Alertas_Fixed_Income_UBS;
PRINT '  ✓ sandbox.Alertas_Fixed_Income_UBS (' + CAST(@@ROWCOUNT AS NVARCHAR(10)) + ' registros eliminados)';

DELETE FROM sandbox.Homologacion_Instrumentos;
PRINT '  ✓ sandbox.Homologacion_Instrumentos (' + CAST(@@ROWCOUNT AS NVARCHAR(10)) + ' registros eliminados)';

DELETE FROM sandbox.Homologacion_Fondos;
PRINT '  ✓ sandbox.Homologacion_Fondos (' + CAST(@@ROWCOUNT AS NVARCHAR(10)) + ' registros eliminados)';

DELETE FROM sandbox.Homologacion_Monedas;
PRINT '  ✓ sandbox.Homologacion_Monedas (' + CAST(@@ROWCOUNT AS NVARCHAR(10)) + ' registros eliminados)';

DELETE FROM sandbox.Homologacion_Benchmarks;
PRINT '  ✓ sandbox.Homologacion_Benchmarks (' + CAST(@@ROWCOUNT AS NVARCHAR(10)) + ' registros eliminados)';

DELETE FROM sandbox.Fondos_Problema;
PRINT '  ✓ sandbox.Fondos_Problema (' + CAST(@@ROWCOUNT AS NVARCHAR(10)) + ' registros eliminados)';

GO

-- ============================================
-- 3. Vaciar dimensionales.Suciedades_IPA (tabla legacy stock)
-- ============================================
PRINT '';
PRINT 'Vaciando dimensionales.Suciedades_IPA (tabla legacy stock)...';

DELETE FROM dimensionales.Suciedades_IPA;
PRINT '  ✓ dimensionales.Suciedades_IPA (' + CAST(@@ROWCOUNT AS NVARCHAR(10)) + ' registros eliminados)';

GO

PRINT '';
PRINT '✓ Migration 007 COMPLETADA - Todas las tablas vaciadas';
PRINT '';
PRINT 'Estado actual:';
PRINT '  - staging.*: VACÍAS (listas para nueva ejecución)';
PRINT '  - sandbox.*: VACÍAS (sin alertas pendientes)';
PRINT '  - dimensionales.Suciedades_IPA: VACÍA (reemplazada por stock.Suciedades)';
PRINT '  - stock.*: INTACTA (se mantienen clasificaciones permanentes)';
PRINT '';

GO
