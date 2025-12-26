/*
 * MIGRACIÓN 007: Eliminar Stored Procedures V1 legacy (sin sufijo _v2)
 *
 * Objetivo: Limpiar SPs V1 que fueron reemplazados por versiones _v2 en arquitectura v2
 * Fecha: 2025-12-26
 * Versión: 1.0
 *
 * SPs eliminados (23 total):
 *
 * GRUPO IPA (7 SPs):
 * - staging.IPA_01_RescatarLocalPrice
 * - staging.IPA_02_AjusteSONA
 * - staging.IPA_03_RenombrarCxCCxP
 * - staging.IPA_04_TratamientoSuciedades
 * - staging.IPA_05_EliminarCajasMTM
 * - staging.IPA_06_CrearDimensiones
 * - staging.IPA_07_AgruparRegistros
 *
 * GRUPO CAPM (3 SPs):
 * - staging.CAPM_01_Ajuste_CAPM
 * - staging.CAPM_02_Extract_Transform
 * - staging.CAPM_03_Carga_Final
 *
 * GRUPO PNL (5 SPs):
 * - staging.PNL_01_Dimensiones
 * - staging.PNL_02_Ajuste
 * - staging.PNL_03_Agrupacion
 * - staging.PNL_04_CrearRegistrosAjusteIPA
 * - staging.PNL_05_Consolidar_IPA_PNL
 *
 * GRUPO DERIVADOS (4 SPs):
 * - staging.DERIV_01_Tratamiento_Posiciones_Larga_Corta
 * - staging.DERIV_02_Homologar_Dimensiones
 * - staging.DERIV_03_Ajuste_Derivados
 * - staging.DERIV_04_Parity_Adjust
 *
 * GRUPO UBS (3 SPs):
 * - staging.UBS_01_Tratamiento_Fondos_Luxemburgo
 * - staging.UBS_02_Tratamiento_Derivados_MLCCII
 * - staging.UBS_03_Creacion_Cartera_MLCCII
 *
 * OTROS (1 SP):
 * - staging.Concatenar_Cubo
 *
 * JUSTIFICACIÓN:
 * Todos estos SPs tienen versiones _v2 que son las únicas utilizadas en el código.
 * La arquitectura v2 con ID_Ejecucion y ID_Fund reemplazó completamente la V1.
 *
 * VERIFICACIÓN PREVIA:
 * - Confirmado que NO hay referencias a estos SPs en el código (grep en server/)
 * - Todos los servicios (IPAService, CAPMService, etc.) usan exclusivamente SPs con sufijo _v2
 * - pipeline.config.yaml solo contiene referencias a SPs _v2
 */

USE [Inteligencia_Producto_Dev];
GO

SET NOCOUNT ON;
PRINT '========================================';
PRINT 'MIGRACIÓN 007: Eliminar SPs V1 Legacy (sin sufijo _v2)';
PRINT 'Fecha: ' + CONVERT(VARCHAR, GETDATE(), 120);
PRINT '========================================';
PRINT '';

DECLARE @SPsDropped INT = 0;
DECLARE @SPsNotFound INT = 0;

-- ============================================
-- 1. GRUPO IPA (7 SPs)
-- ============================================
PRINT '1. Eliminando SPs IPA V1...';
PRINT '';

-- IPA_01_RescatarLocalPrice
IF OBJECT_ID('staging.IPA_01_RescatarLocalPrice', 'P') IS NOT NULL
BEGIN
    DROP PROCEDURE staging.IPA_01_RescatarLocalPrice;
    SET @SPsDropped = @SPsDropped + 1;
    PRINT '   ✓ staging.IPA_01_RescatarLocalPrice eliminado';
END
ELSE
BEGIN
    SET @SPsNotFound = @SPsNotFound + 1;
    PRINT '   ⚠ staging.IPA_01_RescatarLocalPrice no existe (skip)';
END

-- IPA_02_AjusteSONA
IF OBJECT_ID('staging.IPA_02_AjusteSONA', 'P') IS NOT NULL
BEGIN
    DROP PROCEDURE staging.IPA_02_AjusteSONA;
    SET @SPsDropped = @SPsDropped + 1;
    PRINT '   ✓ staging.IPA_02_AjusteSONA eliminado';
END
ELSE
BEGIN
    SET @SPsNotFound = @SPsNotFound + 1;
    PRINT '   ⚠ staging.IPA_02_AjusteSONA no existe (skip)';
END

-- IPA_03_RenombrarCxCCxP
IF OBJECT_ID('staging.IPA_03_RenombrarCxCCxP', 'P') IS NOT NULL
BEGIN
    DROP PROCEDURE staging.IPA_03_RenombrarCxCCxP;
    SET @SPsDropped = @SPsDropped + 1;
    PRINT '   ✓ staging.IPA_03_RenombrarCxCCxP eliminado';
END
ELSE
BEGIN
    SET @SPsNotFound = @SPsNotFound + 1;
    PRINT '   ⚠ staging.IPA_03_RenombrarCxCCxP no existe (skip)';
END

-- IPA_04_TratamientoSuciedades
IF OBJECT_ID('staging.IPA_04_TratamientoSuciedades', 'P') IS NOT NULL
BEGIN
    DROP PROCEDURE staging.IPA_04_TratamientoSuciedades;
    SET @SPsDropped = @SPsDropped + 1;
    PRINT '   ✓ staging.IPA_04_TratamientoSuciedades eliminado';
END
ELSE
BEGIN
    SET @SPsNotFound = @SPsNotFound + 1;
    PRINT '   ⚠ staging.IPA_04_TratamientoSuciedades no existe (skip)';
END

-- IPA_05_EliminarCajasMTM
IF OBJECT_ID('staging.IPA_05_EliminarCajasMTM', 'P') IS NOT NULL
BEGIN
    DROP PROCEDURE staging.IPA_05_EliminarCajasMTM;
    SET @SPsDropped = @SPsDropped + 1;
    PRINT '   ✓ staging.IPA_05_EliminarCajasMTM eliminado';
END
ELSE
BEGIN
    SET @SPsNotFound = @SPsNotFound + 1;
    PRINT '   ⚠ staging.IPA_05_EliminarCajasMTM no existe (skip)';
END

-- IPA_06_CrearDimensiones
IF OBJECT_ID('staging.IPA_06_CrearDimensiones', 'P') IS NOT NULL
BEGIN
    DROP PROCEDURE staging.IPA_06_CrearDimensiones;
    SET @SPsDropped = @SPsDropped + 1;
    PRINT '   ✓ staging.IPA_06_CrearDimensiones eliminado';
END
ELSE
BEGIN
    SET @SPsNotFound = @SPsNotFound + 1;
    PRINT '   ⚠ staging.IPA_06_CrearDimensiones no existe (skip)';
END

-- IPA_07_AgruparRegistros
IF OBJECT_ID('staging.IPA_07_AgruparRegistros', 'P') IS NOT NULL
BEGIN
    DROP PROCEDURE staging.IPA_07_AgruparRegistros;
    SET @SPsDropped = @SPsDropped + 1;
    PRINT '   ✓ staging.IPA_07_AgruparRegistros eliminado';
END
ELSE
BEGIN
    SET @SPsNotFound = @SPsNotFound + 1;
    PRINT '   ⚠ staging.IPA_07_AgruparRegistros no existe (skip)';
END

PRINT '';

-- ============================================
-- 2. GRUPO CAPM (3 SPs)
-- ============================================
PRINT '2. Eliminando SPs CAPM V1...';
PRINT '';

-- CAPM_01_Ajuste_CAPM
IF OBJECT_ID('staging.CAPM_01_Ajuste_CAPM', 'P') IS NOT NULL
BEGIN
    DROP PROCEDURE staging.CAPM_01_Ajuste_CAPM;
    SET @SPsDropped = @SPsDropped + 1;
    PRINT '   ✓ staging.CAPM_01_Ajuste_CAPM eliminado';
END
ELSE
BEGIN
    SET @SPsNotFound = @SPsNotFound + 1;
    PRINT '   ⚠ staging.CAPM_01_Ajuste_CAPM no existe (skip)';
END

-- CAPM_02_Extract_Transform
IF OBJECT_ID('staging.CAPM_02_Extract_Transform', 'P') IS NOT NULL
BEGIN
    DROP PROCEDURE staging.CAPM_02_Extract_Transform;
    SET @SPsDropped = @SPsDropped + 1;
    PRINT '   ✓ staging.CAPM_02_Extract_Transform eliminado';
END
ELSE
BEGIN
    SET @SPsNotFound = @SPsNotFound + 1;
    PRINT '   ⚠ staging.CAPM_02_Extract_Transform no existe (skip)';
END

-- CAPM_03_Carga_Final
IF OBJECT_ID('staging.CAPM_03_Carga_Final', 'P') IS NOT NULL
BEGIN
    DROP PROCEDURE staging.CAPM_03_Carga_Final;
    SET @SPsDropped = @SPsDropped + 1;
    PRINT '   ✓ staging.CAPM_03_Carga_Final eliminado';
END
ELSE
BEGIN
    SET @SPsNotFound = @SPsNotFound + 1;
    PRINT '   ⚠ staging.CAPM_03_Carga_Final no existe (skip)';
END

PRINT '';

-- ============================================
-- 3. GRUPO PNL (5 SPs)
-- ============================================
PRINT '3. Eliminando SPs PNL V1...';
PRINT '';

-- PNL_01_Dimensiones
IF OBJECT_ID('staging.PNL_01_Dimensiones', 'P') IS NOT NULL
BEGIN
    DROP PROCEDURE staging.PNL_01_Dimensiones;
    SET @SPsDropped = @SPsDropped + 1;
    PRINT '   ✓ staging.PNL_01_Dimensiones eliminado';
END
ELSE
BEGIN
    SET @SPsNotFound = @SPsNotFound + 1;
    PRINT '   ⚠ staging.PNL_01_Dimensiones no existe (skip)';
END

-- PNL_02_Ajuste
IF OBJECT_ID('staging.PNL_02_Ajuste', 'P') IS NOT NULL
BEGIN
    DROP PROCEDURE staging.PNL_02_Ajuste;
    SET @SPsDropped = @SPsDropped + 1;
    PRINT '   ✓ staging.PNL_02_Ajuste eliminado';
END
ELSE
BEGIN
    SET @SPsNotFound = @SPsNotFound + 1;
    PRINT '   ⚠ staging.PNL_02_Ajuste no existe (skip)';
END

-- PNL_03_Agrupacion
IF OBJECT_ID('staging.PNL_03_Agrupacion', 'P') IS NOT NULL
BEGIN
    DROP PROCEDURE staging.PNL_03_Agrupacion;
    SET @SPsDropped = @SPsDropped + 1;
    PRINT '   ✓ staging.PNL_03_Agrupacion eliminado';
END
ELSE
BEGIN
    SET @SPsNotFound = @SPsNotFound + 1;
    PRINT '   ⚠ staging.PNL_03_Agrupacion no existe (skip)';
END

-- PNL_04_CrearRegistrosAjusteIPA
IF OBJECT_ID('staging.PNL_04_CrearRegistrosAjusteIPA', 'P') IS NOT NULL
BEGIN
    DROP PROCEDURE staging.PNL_04_CrearRegistrosAjusteIPA;
    SET @SPsDropped = @SPsDropped + 1;
    PRINT '   ✓ staging.PNL_04_CrearRegistrosAjusteIPA eliminado';
END
ELSE
BEGIN
    SET @SPsNotFound = @SPsNotFound + 1;
    PRINT '   ⚠ staging.PNL_04_CrearRegistrosAjusteIPA no existe (skip)';
END

-- PNL_05_Consolidar_IPA_PNL
IF OBJECT_ID('staging.PNL_05_Consolidar_IPA_PNL', 'P') IS NOT NULL
BEGIN
    DROP PROCEDURE staging.PNL_05_Consolidar_IPA_PNL;
    SET @SPsDropped = @SPsDropped + 1;
    PRINT '   ✓ staging.PNL_05_Consolidar_IPA_PNL eliminado';
END
ELSE
BEGIN
    SET @SPsNotFound = @SPsNotFound + 1;
    PRINT '   ⚠ staging.PNL_05_Consolidar_IPA_PNL no existe (skip)';
END

PRINT '';

-- ============================================
-- 4. GRUPO DERIVADOS (4 SPs)
-- ============================================
PRINT '4. Eliminando SPs DERIVADOS V1...';
PRINT '';

-- DERIV_01_Tratamiento_Posiciones_Larga_Corta
IF OBJECT_ID('staging.DERIV_01_Tratamiento_Posiciones_Larga_Corta', 'P') IS NOT NULL
BEGIN
    DROP PROCEDURE staging.DERIV_01_Tratamiento_Posiciones_Larga_Corta;
    SET @SPsDropped = @SPsDropped + 1;
    PRINT '   ✓ staging.DERIV_01_Tratamiento_Posiciones_Larga_Corta eliminado';
END
ELSE
BEGIN
    SET @SPsNotFound = @SPsNotFound + 1;
    PRINT '   ⚠ staging.DERIV_01_Tratamiento_Posiciones_Larga_Corta no existe (skip)';
END

-- DERIV_02_Homologar_Dimensiones
IF OBJECT_ID('staging.DERIV_02_Homologar_Dimensiones', 'P') IS NOT NULL
BEGIN
    DROP PROCEDURE staging.DERIV_02_Homologar_Dimensiones;
    SET @SPsDropped = @SPsDropped + 1;
    PRINT '   ✓ staging.DERIV_02_Homologar_Dimensiones eliminado';
END
ELSE
BEGIN
    SET @SPsNotFound = @SPsNotFound + 1;
    PRINT '   ⚠ staging.DERIV_02_Homologar_Dimensiones no existe (skip)';
END

-- DERIV_03_Ajuste_Derivados
IF OBJECT_ID('staging.DERIV_03_Ajuste_Derivados', 'P') IS NOT NULL
BEGIN
    DROP PROCEDURE staging.DERIV_03_Ajuste_Derivados;
    SET @SPsDropped = @SPsDropped + 1;
    PRINT '   ✓ staging.DERIV_03_Ajuste_Derivados eliminado';
END
ELSE
BEGIN
    SET @SPsNotFound = @SPsNotFound + 1;
    PRINT '   ⚠ staging.DERIV_03_Ajuste_Derivados no existe (skip)';
END

-- DERIV_04_Parity_Adjust
IF OBJECT_ID('staging.DERIV_04_Parity_Adjust', 'P') IS NOT NULL
BEGIN
    DROP PROCEDURE staging.DERIV_04_Parity_Adjust;
    SET @SPsDropped = @SPsDropped + 1;
    PRINT '   ✓ staging.DERIV_04_Parity_Adjust eliminado';
END
ELSE
BEGIN
    SET @SPsNotFound = @SPsNotFound + 1;
    PRINT '   ⚠ staging.DERIV_04_Parity_Adjust no existe (skip)';
END

PRINT '';

-- ============================================
-- 5. GRUPO UBS (3 SPs)
-- ============================================
PRINT '5. Eliminando SPs UBS V1...';
PRINT '';

-- UBS_01_Tratamiento_Fondos_Luxemburgo
IF OBJECT_ID('staging.UBS_01_Tratamiento_Fondos_Luxemburgo', 'P') IS NOT NULL
BEGIN
    DROP PROCEDURE staging.UBS_01_Tratamiento_Fondos_Luxemburgo;
    SET @SPsDropped = @SPsDropped + 1;
    PRINT '   ✓ staging.UBS_01_Tratamiento_Fondos_Luxemburgo eliminado';
END
ELSE
BEGIN
    SET @SPsNotFound = @SPsNotFound + 1;
    PRINT '   ⚠ staging.UBS_01_Tratamiento_Fondos_Luxemburgo no existe (skip)';
END

-- UBS_02_Tratamiento_Derivados_MLCCII
IF OBJECT_ID('staging.UBS_02_Tratamiento_Derivados_MLCCII', 'P') IS NOT NULL
BEGIN
    DROP PROCEDURE staging.UBS_02_Tratamiento_Derivados_MLCCII;
    SET @SPsDropped = @SPsDropped + 1;
    PRINT '   ✓ staging.UBS_02_Tratamiento_Derivados_MLCCII eliminado';
END
ELSE
BEGIN
    SET @SPsNotFound = @SPsNotFound + 1;
    PRINT '   ⚠ staging.UBS_02_Tratamiento_Derivados_MLCCII no existe (skip)';
END

-- UBS_03_Creacion_Cartera_MLCCII
IF OBJECT_ID('staging.UBS_03_Creacion_Cartera_MLCCII', 'P') IS NOT NULL
BEGIN
    DROP PROCEDURE staging.UBS_03_Creacion_Cartera_MLCCII;
    SET @SPsDropped = @SPsDropped + 1;
    PRINT '   ✓ staging.UBS_03_Creacion_Cartera_MLCCII eliminado';
END
ELSE
BEGIN
    SET @SPsNotFound = @SPsNotFound + 1;
    PRINT '   ⚠ staging.UBS_03_Creacion_Cartera_MLCCII no existe (skip)';
END

PRINT '';

-- ============================================
-- 6. OTROS (1 SP)
-- ============================================
PRINT '6. Eliminando otros SPs V1...';
PRINT '';

-- Concatenar_Cubo
IF OBJECT_ID('staging.Concatenar_Cubo', 'P') IS NOT NULL
BEGIN
    DROP PROCEDURE staging.Concatenar_Cubo;
    SET @SPsDropped = @SPsDropped + 1;
    PRINT '   ✓ staging.Concatenar_Cubo eliminado';
END
ELSE
BEGIN
    SET @SPsNotFound = @SPsNotFound + 1;
    PRINT '   ⚠ staging.Concatenar_Cubo no existe (skip)';
END

PRINT '';
PRINT '========================================';
PRINT 'MIGRACIÓN 007 COMPLETADA ✓';
PRINT '========================================';
PRINT '';
PRINT 'Resumen:';
PRINT '- SPs eliminados: ' + CAST(@SPsDropped AS VARCHAR);
PRINT '- SPs no encontrados: ' + CAST(@SPsNotFound AS VARCHAR);
PRINT '- Total procesados: 23';
PRINT '';
PRINT 'Grupos procesados:';
PRINT '- IPA: 7 SPs';
PRINT '- CAPM: 3 SPs';
PRINT '- PNL: 5 SPs';
PRINT '- DERIVADOS: 4 SPs';
PRINT '- UBS: 3 SPs';
PRINT '- Otros: 1 SP';
PRINT '';
PRINT 'IMPORTANTE: Todos estos SPs tienen versiones _v2 que son las activas.';
PRINT 'La arquitectura v2 con ID_Ejecucion reemplazó completamente la V1.';
PRINT '';

GO
