-- =====================================================
-- MIGRATION 013: Remove Writes to process.TBL_* Tables
-- Date: 2025-12-29
-- Description: Quitar escrituras a process.TBL_* de los SPs
--              Ya que ahora se usa CUBO_Final
--
-- IMPORTANTE: Ejecutar SOLO después de validar que CUBO_Final
--             funciona correctamente con la nueva arquitectura
-- =====================================================

-- =====================================================
-- FASE ACTUAL: Los SPs siguen escribiendo a process.TBL_*
-- para mantener compatibilidad durante la transición.
--
-- CUBO_Final se llena en paralelo via Consolidar_Fondo_A_Cubo_v3
--
-- DESPUÉS DE VALIDAR: Ejecutar los cambios abajo para
-- eliminar las escrituras duplicadas a process.TBL_*
-- =====================================================

SET NOCOUNT ON;

PRINT '=== Migration 013: Remove Writes to process.TBL_* ==='
PRINT 'NOTA: Esta migración es OPCIONAL y solo debe ejecutarse'
PRINT '      DESPUÉS de validar que CUBO_Final funciona correctamente'
PRINT ''

/*
-- =====================================================
-- CAMBIOS A APLICAR (comentados para referencia)
-- =====================================================

-- 1. IPA_07_AgruparRegistros_v2: Quitar INSERT a process.TBL_IPA
--    Líneas a eliminar:
--    DELETE FROM process.TBL_IPA WHERE ID_Ejecucion = @ID_Ejecucion AND ID_Fund = @ID_Fund;
--    INSERT INTO process.TBL_IPA (...)

-- 2. CAPM_03_Carga_Final_v2: Quitar INSERT a process.TBL_CAPM
--    Líneas a eliminar:
--    DELETE FROM process.TBL_CAPM WHERE ID_Ejecucion = @ID_Ejecucion;
--    INSERT INTO process.TBL_CAPM (...)

-- 3. PNL_05_Consolidar_IPA_PNL_v2: Quitar INSERT a process.TBL_PNL_IPA
--    Líneas a eliminar:
--    DELETE FROM [process].[TBL_PNL_IPA] WHERE ID_Ejecucion = @ID_Ejecucion AND ID_Fund = @ID_Fund;
--    INSERT INTO [process].[TBL_PNL_IPA] (...)
--    UPDATE ipa SET ... FROM [process].[TBL_PNL_IPA] ipa

-- 4. DERIV_02_Homologar_Dimensiones_v2: Quitar INSERT a process.TBL_Derivados
--    (verificar si existe)

-- 5. UBS_02_Tratamiento_Derivados_MLCCII_v2: Quitar INSERT a process.TBL_MLCCII_Derivados
--    (verificar si existe)

-- 6. UBS_03_Creacion_Cartera_MLCCII_v2: Quitar INSERT a process.TBL_MLCCII
--    (verificar si existe)

*/

PRINT '>>> Migración 013 preparada (no ejecutada)'
PRINT ''
PRINT 'Para aplicar los cambios, descomente las secciones relevantes'
PRINT 'y modifique los SPs correspondientes.'
PRINT ''
PRINT '=== Fin de migración 013 ==='
