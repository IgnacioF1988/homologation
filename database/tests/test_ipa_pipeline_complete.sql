-- ============================================
-- Test Script: Complete IPA Pipeline (7 SPs)
-- ============================================
-- Tests all 7 IPA stored procedures in sequence for a single fund
--
-- Test Parameters:
-- - ID_Ejecucion: 1734656789000 (unique test execution ID)
-- - FechaReporte: 2025-12-15 (date with extracted data)
-- - ID_Fund: 2 (ALTURAS II)
-- - Portfolio_Geneva: 'ALTURAS II'
-- ============================================

SET NOCOUNT ON;

DECLARE @ID_Ejecucion BIGINT = 1734656789000;
DECLARE @FechaReporte NVARCHAR(10) = '2025-12-15';
DECLARE @ID_Fund INT = 2;
DECLARE @Portfolio_Geneva NVARCHAR(50) = 'ALTURAS II';
DECLARE @DebugMode BIT = 1; -- Keep temp tables for inspection
DECLARE @RowsProcessed INT;
DECLARE @ErrorCount INT;
DECLARE @ReturnCode INT;

PRINT '============================================================';
PRINT 'TEST: IPA Pipeline Complete - 7 SPs';
PRINT '============================================================';
PRINT '';
PRINT 'Parámetros de Test:';
PRINT '  ID_Ejecucion: ' + CAST(@ID_Ejecucion AS NVARCHAR(50));
PRINT '  FechaReporte: ' + @FechaReporte;
PRINT '  ID_Fund: ' + CAST(@ID_Fund AS NVARCHAR(50));
PRINT '  Portfolio_Geneva: ' + @Portfolio_Geneva;
PRINT '  DebugMode: ON (temp tables persisten)';
PRINT '';
PRINT '============================================================';
PRINT '';

-- ============================================
-- IPA_01: RescatarLocalPrice
-- ============================================
PRINT '1/7: Ejecutando IPA_01_RescatarLocalPrice_v2...';

EXEC @ReturnCode = staging.IPA_01_RescatarLocalPrice_v2
    @ID_Ejecucion = @ID_Ejecucion,
    @FechaReporte = @FechaReporte,
    @ID_Fund = @ID_Fund,
    @Portfolio_Geneva = @Portfolio_Geneva,
    @DebugMode = @DebugMode,
    @RowsProcessed = @RowsProcessed OUTPUT,
    @ErrorCount = @ErrorCount OUTPUT;

PRINT '     ✓ Completado';
PRINT '       - Return Code: ' + CAST(@ReturnCode AS NVARCHAR(10)) + ' (' +
      CASE @ReturnCode
          WHEN 0 THEN 'OK'
          WHEN 1 THEN 'WARNING'
          WHEN 2 THEN 'RETRY'
          WHEN 3 THEN 'CRITICAL'
          ELSE 'UNKNOWN'
      END + ')';
PRINT '       - Rows Processed: ' + CAST(@RowsProcessed AS NVARCHAR(10));
PRINT '       - Errors: ' + CAST(@ErrorCount AS NVARCHAR(10));
PRINT '';

IF @ReturnCode >= 3
BEGIN
    PRINT 'ERROR CRÍTICO en IPA_01 - Deteniendo test.';
    RETURN;
END

-- ============================================
-- IPA_02: AjusteSONA
-- ============================================
PRINT '2/7: Ejecutando IPA_02_AjusteSONA_v2...';

EXEC @ReturnCode = staging.IPA_02_AjusteSONA_v2
    @ID_Ejecucion = @ID_Ejecucion,
    @FechaReporte = @FechaReporte,
    @ID_Fund = @ID_Fund,
    @Portfolio_Geneva = @Portfolio_Geneva,
    @DebugMode = @DebugMode,
    @RowsProcessed = @RowsProcessed OUTPUT,
    @ErrorCount = @ErrorCount OUTPUT;

PRINT '     ✓ Completado';
PRINT '       - Return Code: ' + CAST(@ReturnCode AS NVARCHAR(10)) + ' (' +
      CASE @ReturnCode
          WHEN 0 THEN 'OK'
          WHEN 1 THEN 'WARNING'
          WHEN 2 THEN 'RETRY'
          WHEN 3 THEN 'CRITICAL'
          ELSE 'UNKNOWN'
      END + ')';
PRINT '       - Rows Processed: ' + CAST(@RowsProcessed AS NVARCHAR(10));
PRINT '       - Errors: ' + CAST(@ErrorCount AS NVARCHAR(10));
PRINT '';

IF @ReturnCode >= 3
BEGIN
    PRINT 'ERROR CRÍTICO en IPA_02 - Deteniendo test.';
    RETURN;
END

-- ============================================
-- IPA_03: RenombrarCxCCxP
-- ============================================
PRINT '3/7: Ejecutando IPA_03_RenombrarCxCCxP_v2...';

EXEC @ReturnCode = staging.IPA_03_RenombrarCxCCxP_v2
    @ID_Ejecucion = @ID_Ejecucion,
    @FechaReporte = @FechaReporte,
    @ID_Fund = @ID_Fund,
    @Portfolio_Geneva = @Portfolio_Geneva,
    @DebugMode = @DebugMode,
    @RowsProcessed = @RowsProcessed OUTPUT,
    @ErrorCount = @ErrorCount OUTPUT;

PRINT '     ✓ Completado';
PRINT '       - Return Code: ' + CAST(@ReturnCode AS NVARCHAR(10)) + ' (' +
      CASE @ReturnCode
          WHEN 0 THEN 'OK'
          WHEN 1 THEN 'WARNING'
          WHEN 2 THEN 'RETRY'
          WHEN 3 THEN 'CRITICAL'
          ELSE 'UNKNOWN'
      END + ')';
PRINT '       - Rows Processed: ' + CAST(@RowsProcessed AS NVARCHAR(10));
PRINT '       - Errors: ' + CAST(@ErrorCount AS NVARCHAR(10));
PRINT '';

IF @ReturnCode >= 3
BEGIN
    PRINT 'ERROR CRÍTICO en IPA_03 - Deteniendo test.';
    RETURN;
END

-- ============================================
-- IPA_04: TratamientoSuciedades
-- ============================================
PRINT '4/7: Ejecutando IPA_04_TratamientoSuciedades_v2...';

EXEC @ReturnCode = staging.IPA_04_TratamientoSuciedades_v2
    @ID_Ejecucion = @ID_Ejecucion,
    @FechaReporte = @FechaReporte,
    @ID_Fund = @ID_Fund,
    @Portfolio_Geneva = @Portfolio_Geneva,
    @DebugMode = @DebugMode,
    @RowsProcessed = @RowsProcessed OUTPUT,
    @ErrorCount = @ErrorCount OUTPUT;

PRINT '     ✓ Completado';
PRINT '       - Return Code: ' + CAST(@ReturnCode AS NVARCHAR(10)) + ' (' +
      CASE @ReturnCode
          WHEN 0 THEN 'OK'
          WHEN 1 THEN 'WARNING'
          WHEN 2 THEN 'RETRY'
          WHEN 3 THEN 'CRITICAL'
          ELSE 'UNKNOWN'
      END + ')';
PRINT '       - Rows Processed: ' + CAST(@RowsProcessed AS NVARCHAR(10));
PRINT '       - Errors: ' + CAST(@ErrorCount AS NVARCHAR(10));
PRINT '';

IF @ReturnCode >= 3
BEGIN
    PRINT 'ERROR CRÍTICO en IPA_04 - Deteniendo test.';
    RETURN;
END

-- ============================================
-- IPA_05: EliminarCajasMTM
-- ============================================
PRINT '5/7: Ejecutando IPA_05_EliminarCajasMTM_v2...';

EXEC @ReturnCode = staging.IPA_05_EliminarCajasMTM_v2
    @ID_Ejecucion = @ID_Ejecucion,
    @FechaReporte = @FechaReporte,
    @ID_Fund = @ID_Fund,
    @Portfolio_Geneva = @Portfolio_Geneva,
    @DebugMode = @DebugMode,
    @RowsProcessed = @RowsProcessed OUTPUT,
    @ErrorCount = @ErrorCount OUTPUT;

PRINT '     ✓ Completado';
PRINT '       - Return Code: ' + CAST(@ReturnCode AS NVARCHAR(10)) + ' (' +
      CASE @ReturnCode
          WHEN 0 THEN 'OK'
          WHEN 1 THEN 'WARNING'
          WHEN 2 THEN 'RETRY'
          WHEN 3 THEN 'CRITICAL'
          ELSE 'UNKNOWN'
      END + ')';
PRINT '       - Rows Processed: ' + CAST(@RowsProcessed AS NVARCHAR(10));
PRINT '       - Errors: ' + CAST(@ErrorCount AS NVARCHAR(10));
PRINT '';

IF @ReturnCode >= 3
BEGIN
    PRINT 'ERROR CRÍTICO en IPA_05 - Deteniendo test.';
    RETURN;
END

-- ============================================
-- IPA_06: CrearDimensiones
-- ============================================
PRINT '6/7: Ejecutando IPA_06_CrearDimensiones_v2...';

EXEC @ReturnCode = staging.IPA_06_CrearDimensiones_v2
    @ID_Ejecucion = @ID_Ejecucion,
    @FechaReporte = @FechaReporte,
    @ID_Fund = @ID_Fund,
    @Portfolio_Geneva = @Portfolio_Geneva,
    @DebugMode = @DebugMode,
    @RowsProcessed = @RowsProcessed OUTPUT,
    @ErrorCount = @ErrorCount OUTPUT;

PRINT '     ✓ Completado';
PRINT '       - Return Code: ' + CAST(@ReturnCode AS NVARCHAR(10)) + ' (' +
      CASE @ReturnCode
          WHEN 0 THEN 'OK'
          WHEN 1 THEN 'WARNING'
          WHEN 2 THEN 'RETRY'
          WHEN 3 THEN 'CRITICAL'
          ELSE 'UNKNOWN'
      END + ')';
PRINT '       - Rows Processed: ' + CAST(@RowsProcessed AS NVARCHAR(10));
PRINT '       - Errors: ' + CAST(@ErrorCount AS NVARCHAR(10));
PRINT '';

IF @ReturnCode >= 3
BEGIN
    PRINT 'ERROR CRÍTICO en IPA_06 - Deteniendo test.';
    RETURN;
END

-- ============================================
-- IPA_07: AgruparRegistros
-- ============================================
PRINT '7/7: Ejecutando IPA_07_AgruparRegistros_v2...';

EXEC @ReturnCode = staging.IPA_07_AgruparRegistros_v2
    @ID_Ejecucion = @ID_Ejecucion,
    @FechaReporte = @FechaReporte,
    @ID_Fund = @ID_Fund,
    @Portfolio_Geneva = @Portfolio_Geneva,
    @DebugMode = @DebugMode,
    @RowsProcessed = @RowsProcessed OUTPUT,
    @ErrorCount = @ErrorCount OUTPUT;

PRINT '     ✓ Completado';
PRINT '       - Return Code: ' + CAST(@ReturnCode AS NVARCHAR(10)) + ' (' +
      CASE @ReturnCode
          WHEN 0 THEN 'OK'
          WHEN 1 THEN 'WARNING'
          WHEN 2 THEN 'RETRY'
          WHEN 3 THEN 'CRITICAL'
          ELSE 'UNKNOWN'
      END + ')';
PRINT '       - Rows Processed: ' + CAST(@RowsProcessed AS NVARCHAR(10));
PRINT '       - Errors: ' + CAST(@ErrorCount AS NVARCHAR(10));
PRINT '';

IF @ReturnCode >= 3
BEGIN
    PRINT 'ERROR CRÍTICO en IPA_07 - Deteniendo test.';
    RETURN;
END

-- ============================================
-- RESUMEN FINAL
-- ============================================
PRINT '';
PRINT '============================================================';
PRINT 'TEST COMPLETADO EXITOSAMENTE ✓';
PRINT '============================================================';
PRINT '';
PRINT 'Resultados:';
PRINT '  - Todos los 7 SPs ejecutados sin errores críticos';
PRINT '  - Fondo procesado: ' + @Portfolio_Geneva + ' (ID: ' + CAST(@ID_Fund AS NVARCHAR(10)) + ')';
PRINT '  - Fecha: ' + @FechaReporte;
PRINT '';
PRINT 'Tablas temporales creadas (DebugMode=ON):';
PRINT '  - #temp_IPA_WorkTable_' + CAST(@ID_Ejecucion AS NVARCHAR(50)) + '_' + CAST(@ID_Fund AS NVARCHAR(50));
PRINT '  - #temp_Ajuste_SONA_' + CAST(@ID_Ejecucion AS NVARCHAR(50)) + '_' + CAST(@ID_Fund AS NVARCHAR(50));
PRINT '  - #temp_IPA_Cash_' + CAST(@ID_Ejecucion AS NVARCHAR(50)) + '_' + CAST(@ID_Fund AS NVARCHAR(50));
PRINT '  - #temp_IPA_MTM_' + CAST(@ID_Ejecucion AS NVARCHAR(50)) + '_' + CAST(@ID_Fund AS NVARCHAR(50));
PRINT '  - #temp_IPA_Final_' + CAST(@ID_Ejecucion AS NVARCHAR(50)) + '_' + CAST(@ID_Fund AS NVARCHAR(50));
PRINT '';
PRINT 'Verificar resultados:';

-- Métricas del resultado final
DECLARE @TempFinalTable NVARCHAR(200) = '#temp_IPA_Final_' + CAST(@ID_Ejecucion AS NVARCHAR(50)) + '_' + CAST(@ID_Fund AS NVARCHAR(50));
DECLARE @SQL NVARCHAR(MAX);

SET @SQL = N'
IF OBJECT_ID(''tempdb..' + @TempFinalTable + ''') IS NOT NULL
BEGIN
    SELECT
        COUNT(*) AS TotalRegistros,
        COUNT(DISTINCT ID_Instrumento) AS TotalInstrumentos,
        SUM(ISNULL(MVBook, 0) + ISNULL(AI, 0)) AS TotalMVal,
        SUM(CASE WHEN BalanceSheet = ''Asset'' THEN 1 ELSE 0 END) AS TotalAssets,
        SUM(CASE WHEN BalanceSheet = ''Liability'' THEN 1 ELSE 0 END) AS TotalLiabilities
    FROM ' + @TempFinalTable + ';
END
ELSE
BEGIN
    PRINT ''ERROR: Tabla final no encontrada'';
END';

EXEC sp_executesql @SQL;

PRINT '';
PRINT 'Para limpiar las tablas temporales, ejecutar:';
PRINT '  DROP TABLE IF EXISTS #temp_IPA_WorkTable_' + CAST(@ID_Ejecucion AS NVARCHAR(50)) + '_' + CAST(@ID_Fund AS NVARCHAR(50)) + ';';
PRINT '  DROP TABLE IF EXISTS #temp_Ajuste_SONA_' + CAST(@ID_Ejecucion AS NVARCHAR(50)) + '_' + CAST(@ID_Fund AS NVARCHAR(50)) + ';';
PRINT '  DROP TABLE IF EXISTS #temp_IPA_Cash_' + CAST(@ID_Ejecucion AS NVARCHAR(50)) + '_' + CAST(@ID_Fund AS NVARCHAR(50)) + ';';
PRINT '  DROP TABLE IF EXISTS #temp_IPA_MTM_' + CAST(@ID_Ejecucion AS NVARCHAR(50)) + '_' + CAST(@ID_Fund AS NVARCHAR(50)) + ';';
PRINT '  DROP TABLE IF EXISTS #temp_IPA_Final_' + CAST(@ID_Ejecucion AS NVARCHAR(50)) + '_' + CAST(@ID_Fund AS NVARCHAR(50)) + ';';
PRINT '';
