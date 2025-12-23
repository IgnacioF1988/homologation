/**
 * Script: Remove ROLLBACK from SP CATCH Blocks
 *
 * Problema: SPs v2 hacen ROLLBACK en CATCH, invalidando transacciones externas
 * Solución: Remover "IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;" de CATCH blocks
 *
 * Razón: BasePipelineService maneja transacciones externamente. Los SPs solo deben
 *        retornar códigos de error (RETURN 1/2/3) sin hacer ROLLBACK.
 *
 * SPs afectados: 10 SPs v2 (IPA y CAPM)
 *
 * Patrón ANTES:
 *   BEGIN CATCH
 *     IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;  -- ❌ QUITAR
 *     SET @ErrorCount = 1;
 *     INSERT INTO logs.SP_Errors ...
 *     RETURN 3;
 *   END CATCH
 *
 * Patrón DESPUÉS:
 *   BEGIN CATCH
 *     SET @ErrorCount = 1;
 *     INSERT INTO logs.SP_Errors ...
 *     RETURN 3;
 *   END CATCH
 *
 * Fecha: 2025-12-22
 * Autor: Claude Code - Pipeline V2 Integration
 */

PRINT 'Removiendo ROLLBACK de SPs v2...';
PRINT '';

-- Los SPs ya fueron modificados en sesiones anteriores para:
-- 1. Remover THROW (primera modificación)
-- 2. Remover BEGIN TRANSACTION / COMMIT TRANSACTION de CAPM_02 y CAPM_03 (segunda modificación)
-- 3. Ahora: Remover IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION de todos (tercera modificación)

PRINT 'IMPORTANTE: Este script genera comandos ALTER PROCEDURE.';
PRINT 'Los SPs deben modificarse uno por uno usando MCP execute tool.';
PRINT '';
PRINT 'Lista de SPs a modificar:';
PRINT '1. staging.IPA_01_RescatarLocalPrice_v2';
PRINT '2. staging.IPA_02_AjusteSONA_v2';
PRINT '3. staging.IPA_03_RenombrarCxCCxP_v2';
PRINT '4. staging.IPA_04_TratamientoSuciedades_v2';
PRINT '5. staging.IPA_05_EliminarCajasMTM_v2';
PRINT '6. staging.IPA_06_CrearDimensiones_v2';
PRINT '7. staging.IPA_07_AgruparRegistros_v2';
PRINT '8. staging.CAPM_01_Ajuste_CAPM_v2';
PRINT '9. staging.CAPM_02_Extract_Transform_v2';
PRINT '10. staging.CAPM_03_Carga_Final_v2';
PRINT '';
PRINT 'Cambio a aplicar en CADA CATCH block:';
PRINT 'QUITAR: IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;';
PRINT 'MANTENER: SET @ErrorCount = 1; ... RETURN 3;';
PRINT '';

-- Verificación previa
SELECT
    p.name AS SP_Name,
    CASE
        WHEN OBJECT_DEFINITION(p.object_id) LIKE '%IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;%' THEN 'Tiene ROLLBACK ❌'
        ELSE 'Sin ROLLBACK ✓'
    END AS Estado_ROLLBACK
FROM sys.procedures p
WHERE p.name IN (
    'IPA_01_RescatarLocalPrice_v2',
    'IPA_02_AjusteSONA_v2',
    'IPA_03_RenombrarCxCCxP_v2',
    'IPA_04_TratamientoSuciedades_v2',
    'IPA_05_EliminarCajasMTM_v2',
    'IPA_06_CrearDimensiones_v2',
    'IPA_07_AgruparRegistros_v2',
    'CAPM_01_Ajuste_CAPM_v2',
    'CAPM_02_Extract_Transform_v2',
    'CAPM_03_Carga_Final_v2'
)
ORDER BY p.name;

PRINT '';
PRINT 'Ejecutar ALTER PROCEDURE para cada SP, removiendo la línea:';
PRINT 'IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;';
PRINT '';
PRINT 'NOTA: El CATCH block quedará así:';
PRINT 'BEGIN CATCH';
PRINT '  SET @ErrorCount = 1;';
PRINT '  -- Log error sin invalidar transacción externa';
PRINT '  BEGIN TRY';
PRINT '    INSERT INTO logs.SP_Errors (...)';
PRINT '    VALUES (...);';
PRINT '  END TRY';
PRINT '  BEGIN CATCH END CATCH';
PRINT '  IF ERROR_NUMBER() = 1205 RETURN 2; -- Deadlock';
PRINT '  RETURN 3;';
PRINT 'END CATCH';
