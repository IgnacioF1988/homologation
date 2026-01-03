/*
================================================================================
DEPLOY COMPLETO - EJECUTAR EN SSMS CON MODO SQLCMD ACTIVADO
================================================================================
Instrucciones:
  1. Abrir SSMS
  2. Menu: Query -> SQLCMD Mode (activar - debe estar con check)
  3. Conectar a: INTELIGENCIA_PRODUCTO_FULLSTACK
  4. Abrir este archivo
  5. F5 para ejecutar

Si SQLCMD mode NO esta disponible, usar Deploy_FULLSTACK.bat desde CMD.
================================================================================
*/

:setvar DatabaseName "INTELIGENCIA_PRODUCTO_FULLSTACK"
:on error exit

USE $(DatabaseName);
GO

PRINT '======================================================================';
PRINT '         DEPLOY - PIPELINE IPA REFACTORIZADO                         ';
PRINT '         Base de datos: $(DatabaseName)                              ';
PRINT '======================================================================';
PRINT '';
GO

-- ============================================================================
-- FASE 1: INFRAESTRUCTURA BASE
-- ============================================================================
PRINT '----------------------------------------------------------------------';
PRINT ' FASE 1: INFRAESTRUCTURA BASE                                         ';
PRINT '----------------------------------------------------------------------';
GO
:r "C:\Users\ifuentes\homologation\server\database\Refactor\00_MASTER_MIGRATION.sql"
GO
:r "C:\Users\ifuentes\homologation\server\database\Refactor\CORE\00_Tables_Dimensionales.sql"
GO

-- ============================================================================
-- FASE 2: EXTRACT - TABLAS Y FUNCIONES
-- ============================================================================
PRINT '';
PRINT '----------------------------------------------------------------------';
PRINT ' FASE 2: EXTRACT - TABLAS Y FUNCIONES                                 ';
PRINT '----------------------------------------------------------------------';
GO
:r "C:\Users\ifuentes\homologation\server\database\Refactor\EXTRACT\00_Tables_Extract.sql"
GO
:r "C:\Users\ifuentes\homologation\server\database\Refactor\EXTRACT\01_Common_Functions.sql"
GO

-- ============================================================================
-- FASE 3: CORE SPs
-- ============================================================================
PRINT '';
PRINT '----------------------------------------------------------------------';
PRINT ' FASE 3: CORE SPs                                                     ';
PRINT '----------------------------------------------------------------------';
GO
:r "C:\Users\ifuentes\homologation\server\database\Refactor\CORE\00_Config_Requisitos.sql"
GO
:r "C:\Users\ifuentes\homologation\server\database\Refactor\CORE\01_sp_EnsureSchema.sql"
GO
:r "C:\Users\ifuentes\homologation\server\database\Refactor\CORE\02_sp_ValidateFund.sql"
GO
:r "C:\Users\ifuentes\homologation\server\database\Refactor\CORE\03_sp_Homologate.sql"
GO
:r "C:\Users\ifuentes\homologation\server\database\Refactor\CORE\04_sp_CreateAdjustment.sql"
GO
:r "C:\Users\ifuentes\homologation\server\database\Refactor\CORE\05_sp_HandleError.sql"
GO

-- ============================================================================
-- FASE 4: EXTRACT SPs
-- ============================================================================
PRINT '';
PRINT '----------------------------------------------------------------------';
PRINT ' FASE 4: EXTRACT SPs                                                  ';
PRINT '----------------------------------------------------------------------';
GO
:r "C:\Users\ifuentes\homologation\server\database\Refactor\EXTRACT\02_sp_Extract_IPA.sql"
GO
:r "C:\Users\ifuentes\homologation\server\database\Refactor\EXTRACT\03_sp_Extract_CAPM.sql"
GO
:r "C:\Users\ifuentes\homologation\server\database\Refactor\EXTRACT\04_sp_Extract_Derivados.sql"
GO
:r "C:\Users\ifuentes\homologation\server\database\Refactor\EXTRACT\05_sp_Extract_SONA.sql"
GO
:r "C:\Users\ifuentes\homologation\server\database\Refactor\EXTRACT\06_sp_Extract_PNL.sql"
GO
:r "C:\Users\ifuentes\homologation\server\database\Refactor\EXTRACT\07_sp_Extract_PosModRF.sql"
GO

-- ============================================================================
-- FASE 5: PIPELINE SPs
-- ============================================================================
PRINT '';
PRINT '----------------------------------------------------------------------';
PRINT ' FASE 5: PIPELINE SPs                                                 ';
PRINT '----------------------------------------------------------------------';
GO
:r "C:\Users\ifuentes\homologation\server\database\Refactor\PIPELINE\10_sp_Process_IPA.sql"
GO
:r "C:\Users\ifuentes\homologation\server\database\Refactor\PIPELINE\11_sp_Process_CAPM.sql"
GO
:r "C:\Users\ifuentes\homologation\server\database\Refactor\PIPELINE\12_sp_Process_Derivados.sql"
GO
:r "C:\Users\ifuentes\homologation\server\database\Refactor\PIPELINE\13_sp_Process_SONA.sql"
GO
:r "C:\Users\ifuentes\homologation\server\database\Refactor\PIPELINE\14_sp_Process_PNL.sql"
GO

-- ============================================================================
-- FASE 6: CONSOLIDATION
-- ============================================================================
PRINT '';
PRINT '----------------------------------------------------------------------';
PRINT ' FASE 6: CONSOLIDATION                                                ';
PRINT '----------------------------------------------------------------------';
GO
:r "C:\Users\ifuentes\homologation\server\database\Refactor\CONSOLIDATION\20_sp_Consolidar_Cubo.sql"
GO

-- ============================================================================
-- VALIDACION FINAL
-- ============================================================================
PRINT '';
PRINT '======================================================================';
PRINT '                    DEPLOY COMPLETADO                                 ';
PRINT '======================================================================';

SELECT 'Schemas' AS Tipo, COUNT(*) AS Cantidad
FROM sys.schemas WHERE name IN ('extract', 'pipeline', 'staging', 'sandbox', 'config', 'logs', 'dimensionales')
UNION ALL
SELECT 'Tablas extract.*', COUNT(*)
FROM sys.tables t INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
WHERE s.name = 'extract'
UNION ALL
SELECT 'Tablas config.*', COUNT(*)
FROM sys.tables t INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
WHERE s.name = 'config'
UNION ALL
SELECT 'Tablas dimensionales.*', COUNT(*)
FROM sys.tables t INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
WHERE s.name = 'dimensionales'
UNION ALL
SELECT 'SPs extract.*', COUNT(*)
FROM sys.procedures p INNER JOIN sys.schemas s ON p.schema_id = s.schema_id
WHERE s.name = 'extract'
UNION ALL
SELECT 'SPs staging.*', COUNT(*)
FROM sys.procedures p INNER JOIN sys.schemas s ON p.schema_id = s.schema_id
WHERE s.name = 'staging'
UNION ALL
SELECT 'Funciones', COUNT(*)
FROM sys.objects o INNER JOIN sys.schemas s ON o.schema_id = s.schema_id
WHERE o.type IN ('FN', 'IF', 'TF') AND s.name IN ('extract', 'config', 'staging');
GO
