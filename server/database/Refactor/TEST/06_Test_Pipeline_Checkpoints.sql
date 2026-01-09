/*
================================================================================
TEST: Pipeline con CHECKPOINT Events
================================================================================
Descripcion: Ejecuta el pipeline completo para un fondo que pasa validacion
             y muestra los eventos CHECKPOINT emitidos.

Prerequisito:
  - Service Broker configurado y activo
  - Datos extraidos para el fondo de prueba

Uso:
  1. Asegurarse de que el fondo tiene datos y pasa validacion
  2. Ejecutar el script completo
  3. Revisar la tabla de eventos al final

Autor: Refactorizacion Pipeline IPA
Fecha: 2026-01-09
================================================================================
*/

USE INTELIGENCIA_PRODUCTO_FULLSTACK;
GO

SET NOCOUNT ON;

-- ============================================================================
-- CONFIGURACION
-- ============================================================================
DECLARE @FechaReporte NVARCHAR(10) = '2025-12-25';
DECLARE @ID_Fund INT = 20;  -- Usar un fondo que pase validacion

-- IDs unicos para esta prueba
DECLARE @ID_Ejecucion BIGINT = 9901;
DECLARE @ID_Proceso BIGINT = 9901;

-- Variables de salida
DECLARE @ReturnCode INT;
DECLARE @ErrorMessage NVARCHAR(500);
DECLARE @Portfolio NVARCHAR(100);

-- Obtener Portfolio
SELECT @Portfolio = Fund_Code FROM dimensionales.BD_Funds WHERE ID_Fund = @ID_Fund;

PRINT '================================================================================'
PRINT '  TEST: PIPELINE CON CHECKPOINT EVENTS'
PRINT '================================================================================'
PRINT ''
PRINT '  Configuracion:'
PRINT '    Fecha Reporte: ' + @FechaReporte
PRINT '    ID_Fund: ' + CAST(@ID_Fund AS NVARCHAR(10)) + ' (' + ISNULL(@Portfolio, 'N/A') + ')'
PRINT '    ID_Ejecucion: ' + CAST(@ID_Ejecucion AS NVARCHAR(20))
PRINT ''

-- ============================================================================
-- PASO 1: Limpiar ejecucion anterior si existe
-- ============================================================================
PRINT '------------------------------------------------------------------------'
PRINT ' PASO 1: Limpieza de datos previos'
PRINT '------------------------------------------------------------------------'

DELETE FROM extract.IPA WHERE ID_Ejecucion = @ID_Ejecucion;
DELETE FROM extract.CAPM WHERE ID_Ejecucion = @ID_Ejecucion;
DELETE FROM extract.SONA WHERE ID_Ejecucion = @ID_Ejecucion;
DELETE FROM extract.PNL WHERE ID_Ejecucion = @ID_Ejecucion;
DELETE FROM extract.Derivados WHERE ID_Ejecucion = @ID_Ejecucion;
DELETE FROM logs.Validaciones_Ejecucion WHERE ID_Ejecucion = @ID_Ejecucion;

-- Limpiar tablas temporales si existen
DECLARE @Suffix NVARCHAR(100) = CAST(@ID_Ejecucion AS NVARCHAR(20)) + '_' +
                                CAST(@ID_Proceso AS NVARCHAR(10)) + '_' +
                                CAST(@ID_Fund AS NVARCHAR(10));
DECLARE @SQL NVARCHAR(MAX);

SET @SQL = 'IF OBJECT_ID(''tempdb..##IPA_Work_' + @Suffix + ''') IS NOT NULL DROP TABLE ##IPA_Work_' + @Suffix;
EXEC sp_executesql @SQL;
SET @SQL = 'IF OBJECT_ID(''tempdb..##IPA_Cash_' + @Suffix + ''') IS NOT NULL DROP TABLE ##IPA_Cash_' + @Suffix;
EXEC sp_executesql @SQL;
SET @SQL = 'IF OBJECT_ID(''tempdb..##IPA_MTM_' + @Suffix + ''') IS NOT NULL DROP TABLE ##IPA_MTM_' + @Suffix;
EXEC sp_executesql @SQL;
SET @SQL = 'IF OBJECT_ID(''tempdb..##Ajustes_' + @Suffix + ''') IS NOT NULL DROP TABLE ##Ajustes_' + @Suffix;
EXEC sp_executesql @SQL;
SET @SQL = 'IF OBJECT_ID(''tempdb..##CAPM_Work_' + @Suffix + ''') IS NOT NULL DROP TABLE ##CAPM_Work_' + @Suffix;
EXEC sp_executesql @SQL;
SET @SQL = 'IF OBJECT_ID(''tempdb..##Derivados_Work_' + @Suffix + ''') IS NOT NULL DROP TABLE ##Derivados_Work_' + @Suffix;
EXEC sp_executesql @SQL;
SET @SQL = 'IF OBJECT_ID(''tempdb..##PNL_Work_' + @Suffix + ''') IS NOT NULL DROP TABLE ##PNL_Work_' + @Suffix;
EXEC sp_executesql @SQL;

PRINT '  [OK] Limpieza completada'
PRINT ''

-- ============================================================================
-- PASO 2: Ejecutar Extracts
-- ============================================================================
PRINT '------------------------------------------------------------------------'
PRINT ' PASO 2: Ejecutar Extracts'
PRINT '------------------------------------------------------------------------'

BEGIN TRY
    EXEC extract.Extract_IPA @FechaReporte, @ID_Proceso, @ID_Ejecucion, @ID_Fund, @Portfolio;
    PRINT '  [OK] Extract_IPA'
END TRY BEGIN CATCH PRINT '  [ERROR] Extract_IPA: ' + ERROR_MESSAGE() END CATCH

BEGIN TRY
    EXEC extract.Extract_CAPM @FechaReporte, @ID_Proceso, @ID_Ejecucion, @ID_Fund, @Portfolio;
    PRINT '  [OK] Extract_CAPM'
END TRY BEGIN CATCH PRINT '  [SKIP] Extract_CAPM: ' + ERROR_MESSAGE() END CATCH

BEGIN TRY
    EXEC extract.Extract_SONA @FechaReporte, @ID_Proceso, @ID_Ejecucion, @ID_Fund, @Portfolio;
    PRINT '  [OK] Extract_SONA'
END TRY BEGIN CATCH PRINT '  [SKIP] Extract_SONA: ' + ERROR_MESSAGE() END CATCH

BEGIN TRY
    EXEC extract.Extract_PNL @FechaReporte, @ID_Proceso, @ID_Ejecucion, @ID_Fund, @Portfolio;
    PRINT '  [OK] Extract_PNL'
END TRY BEGIN CATCH PRINT '  [SKIP] Extract_PNL: ' + ERROR_MESSAGE() END CATCH

PRINT ''

-- ============================================================================
-- PASO 3: Ejecutar Pipeline Completo
-- ============================================================================
PRINT '------------------------------------------------------------------------'
PRINT ' PASO 3: Ejecutar Pipeline Completo (sp_Process_Fund_Complete)'
PRINT '------------------------------------------------------------------------'
PRINT ''
PRINT '  Los siguientes eventos CHECKPOINT seran emitidos:'
PRINT '  -----------------------------------------------'
PRINT '  sp_Process_IPA:'
PRINT '    - CHECKPOINT: CREATED ##IPA_Work'
PRINT '    - CHECKPOINT: CREATED ##IPA_Cash'
PRINT '    - CHECKPOINT: CREATED ##IPA_MTM'
PRINT '    - CHECKPOINT: CREATED ##Ajustes'
PRINT ''
PRINT '  sp_Process_CAPM (si Req_CAPM=1):'
PRINT '    - CHECKPOINT: VERIFIED ##IPA_Cash'
PRINT '    - CHECKPOINT: CREATED ##CAPM_Work'
PRINT ''
PRINT '  sp_Process_Derivados (si Req_Derivados=1):'
PRINT '    - CHECKPOINT: VERIFIED ##IPA_MTM'
PRINT '    - CHECKPOINT: CREATED ##Derivados_Work'
PRINT ''
PRINT '  sp_Process_SONA (si Req_SONA=1):'
PRINT '    - CHECKPOINT: VERIFIED ##IPA_Work'
PRINT ''
PRINT '  sp_Process_PNL (si Req_PNL=1):'
PRINT '    - CHECKPOINT: CREATED ##PNL_Work'
PRINT ''
PRINT '  -----------------------------------------------'
PRINT ''

-- Ejecutar el pipeline
EXEC @ReturnCode = staging.sp_Process_Fund_Complete
    @ID_Ejecucion = @ID_Ejecucion,
    @ID_Proceso = @ID_Proceso,
    @ID_Fund = @ID_Fund,
    @FechaReporte = @FechaReporte,
    @LimpiarTemporales = 0,  -- NO limpiar para poder verificar tablas
    @ReturnCode = @ReturnCode OUTPUT,
    @ErrorMessage = @ErrorMessage OUTPUT;

PRINT ''
PRINT '------------------------------------------------------------------------'
PRINT ' RESULTADO'
PRINT '------------------------------------------------------------------------'
PRINT '  Codigo de retorno: ' + CAST(@ReturnCode AS NVARCHAR(10))
PRINT '  Mensaje: ' + ISNULL(@ErrorMessage, '(ninguno)')
PRINT ''

-- ============================================================================
-- PASO 4: Verificar eventos emitidos (si hay tabla de log)
-- ============================================================================
PRINT '------------------------------------------------------------------------'
PRINT ' PASO 4: Verificar eventos en Service Broker'
PRINT '------------------------------------------------------------------------'
PRINT ''
PRINT '  NOTA: Los eventos CHECKPOINT fueron emitidos via Service Broker.'
PRINT '  Para ver los eventos en tiempo real, asegurate de que:'
PRINT '    1. El backend Node.js este corriendo'
PRINT '    2. ServiceBrokerListener este conectado'
PRINT '    3. Un cliente WebSocket este suscrito a la ejecucion ' + CAST(@ID_Ejecucion AS NVARCHAR(20))
PRINT ''

-- Verificar tablas temporales creadas
PRINT '------------------------------------------------------------------------'
PRINT ' PASO 5: Verificar tablas temporales creadas'
PRINT '------------------------------------------------------------------------'

DECLARE @TableExists BIT;
DECLARE @RowCount INT;

-- ##IPA_Work
SET @SQL = N'IF OBJECT_ID(''tempdb..##IPA_Work_' + @Suffix + ''') IS NOT NULL SELECT @Exists = 1, @Rows = (SELECT COUNT(*) FROM ##IPA_Work_' + @Suffix + ') ELSE SELECT @Exists = 0, @Rows = 0';
EXEC sp_executesql @SQL, N'@Exists BIT OUTPUT, @Rows INT OUTPUT', @TableExists OUTPUT, @RowCount OUTPUT;
PRINT '  ##IPA_Work: ' + CASE WHEN @TableExists = 1 THEN 'EXISTE (' + CAST(@RowCount AS NVARCHAR(10)) + ' rows)' ELSE 'NO EXISTE' END;

-- ##IPA_Cash
SET @SQL = N'IF OBJECT_ID(''tempdb..##IPA_Cash_' + @Suffix + ''') IS NOT NULL SELECT @Exists = 1, @Rows = (SELECT COUNT(*) FROM ##IPA_Cash_' + @Suffix + ') ELSE SELECT @Exists = 0, @Rows = 0';
EXEC sp_executesql @SQL, N'@Exists BIT OUTPUT, @Rows INT OUTPUT', @TableExists OUTPUT, @RowCount OUTPUT;
PRINT '  ##IPA_Cash: ' + CASE WHEN @TableExists = 1 THEN 'EXISTE (' + CAST(@RowCount AS NVARCHAR(10)) + ' rows)' ELSE 'NO EXISTE' END;

-- ##IPA_MTM
SET @SQL = N'IF OBJECT_ID(''tempdb..##IPA_MTM_' + @Suffix + ''') IS NOT NULL SELECT @Exists = 1, @Rows = (SELECT COUNT(*) FROM ##IPA_MTM_' + @Suffix + ') ELSE SELECT @Exists = 0, @Rows = 0';
EXEC sp_executesql @SQL, N'@Exists BIT OUTPUT, @Rows INT OUTPUT', @TableExists OUTPUT, @RowCount OUTPUT;
PRINT '  ##IPA_MTM: ' + CASE WHEN @TableExists = 1 THEN 'EXISTE (' + CAST(@RowCount AS NVARCHAR(10)) + ' rows)' ELSE 'NO EXISTE' END;

-- ##Ajustes
SET @SQL = N'IF OBJECT_ID(''tempdb..##Ajustes_' + @Suffix + ''') IS NOT NULL SELECT @Exists = 1, @Rows = (SELECT COUNT(*) FROM ##Ajustes_' + @Suffix + ') ELSE SELECT @Exists = 0, @Rows = 0';
EXEC sp_executesql @SQL, N'@Exists BIT OUTPUT, @Rows INT OUTPUT', @TableExists OUTPUT, @RowCount OUTPUT;
PRINT '  ##Ajustes: ' + CASE WHEN @TableExists = 1 THEN 'EXISTE (' + CAST(@RowCount AS NVARCHAR(10)) + ' rows)' ELSE 'NO EXISTE' END;

-- ##CAPM_Work
SET @SQL = N'IF OBJECT_ID(''tempdb..##CAPM_Work_' + @Suffix + ''') IS NOT NULL SELECT @Exists = 1, @Rows = (SELECT COUNT(*) FROM ##CAPM_Work_' + @Suffix + ') ELSE SELECT @Exists = 0, @Rows = 0';
EXEC sp_executesql @SQL, N'@Exists BIT OUTPUT, @Rows INT OUTPUT', @TableExists OUTPUT, @RowCount OUTPUT;
PRINT '  ##CAPM_Work: ' + CASE WHEN @TableExists = 1 THEN 'EXISTE (' + CAST(@RowCount AS NVARCHAR(10)) + ' rows)' ELSE 'NO EXISTE' END;

-- ##Derivados_Work
SET @SQL = N'IF OBJECT_ID(''tempdb..##Derivados_Work_' + @Suffix + ''') IS NOT NULL SELECT @Exists = 1, @Rows = (SELECT COUNT(*) FROM ##Derivados_Work_' + @Suffix + ') ELSE SELECT @Exists = 0, @Rows = 0';
EXEC sp_executesql @SQL, N'@Exists BIT OUTPUT, @Rows INT OUTPUT', @TableExists OUTPUT, @RowCount OUTPUT;
PRINT '  ##Derivados_Work: ' + CASE WHEN @TableExists = 1 THEN 'EXISTE (' + CAST(@RowCount AS NVARCHAR(10)) + ' rows)' ELSE 'NO EXISTE' END;

-- ##PNL_Work
SET @SQL = N'IF OBJECT_ID(''tempdb..##PNL_Work_' + @Suffix + ''') IS NOT NULL SELECT @Exists = 1, @Rows = (SELECT COUNT(*) FROM ##PNL_Work_' + @Suffix + ') ELSE SELECT @Exists = 0, @Rows = 0';
EXEC sp_executesql @SQL, N'@Exists BIT OUTPUT, @Rows INT OUTPUT', @TableExists OUTPUT, @RowCount OUTPUT;
PRINT '  ##PNL_Work: ' + CASE WHEN @TableExists = 1 THEN 'EXISTE (' + CAST(@RowCount AS NVARCHAR(10)) + ' rows)' ELSE 'NO EXISTE' END;

PRINT ''
PRINT '================================================================================'
PRINT '  TEST COMPLETADO'
PRINT '================================================================================'
GO
