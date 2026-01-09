/*
================================================================================
TEST GENERICO: Validacion Paralela de 2 Fondos
================================================================================
Descripcion: Script configurable para probar el pipeline con cualquier par de
             fondos. Solo modifica las variables en la seccion CONFIGURACION.

Uso:
  1. Actualiza las variables en CONFIGURACION (fondos, fechas, IDs)
  2. Configura @LimpiezaCompleta segun el escenario de prueba:
     - 0 = Re-ejecucion: solo limpia datos de los IDs especificados
     - 1 = Ejecucion virgen: limpia TODAS las tablas de destino
  3. Ejecuta el script completo (F5)
  4. Revisa los resultados al final

Tablas limpiadas en modo completo:
  - sandbox.Homologacion_* (instrumentos, monedas, fondos + _Fondos)
  - sandbox.Alertas_* (suciedades, extract, descuadres)
  - logs.Validaciones_Ejecucion
  - extract.* (IPA, CAPM, SONA, PNL, Derivados, PosModRF)

Autor: Refactorizacion Pipeline IPA
Fecha: 2026-01-06
================================================================================
*/

USE INTELIGENCIA_PRODUCTO_FULLSTACK;
GO

SET NOCOUNT ON;

SET STATISTICS IO ON;
SET STATISTICS TIME ON;

-- ============================================================================
-- CONFIGURACION (MODIFICAR AQUI)
-- ============================================================================
DECLARE @FechaReporte DATE = '2025-12-25';  -- Fecha a procesar (tipo DATE para evitar CONVERT)
DECLARE @ID_Fund_1 INT = 20;                        -- ID del fondo 1
DECLARE @ID_Fund_2 INT = 2;                         -- ID del fondo 2

-- IDs de ejecucion (cambiar si hay conflicto)
DECLARE @ID_Ejecucion_1 BIGINT = 501;
DECLARE @ID_Ejecucion_2 BIGINT = 502;

-- ============================================================================
-- SWITCH DE LIMPIEZA
-- ============================================================================
-- 0 = Limpieza parcial: solo borra datos de @ID_Ejecucion_1 y @ID_Ejecucion_2
-- 1 = Limpieza TOTAL: borra TODAS las tablas sandbox/logs/extract (escenario virgen)
DECLARE @LimpiezaCompleta BIT = 0;

-- ============================================================================
-- NO MODIFICAR DEBAJO DE ESTA LINEA
-- ============================================================================

-- Obtener Portfolio (Fund_Code) desde BD_Funds
DECLARE @Portfolio_1 NVARCHAR(100);
DECLARE @Portfolio_2 NVARCHAR(100);
DECLARE @ID_Proceso_1 BIGINT = @ID_Ejecucion_1;
DECLARE @ID_Proceso_2 BIGINT = @ID_Ejecucion_2;

SELECT @Portfolio_1 = Fund_Code FROM dimensionales.BD_Funds WHERE ID_Fund = @ID_Fund_1;
SELECT @Portfolio_2 = Fund_Code FROM dimensionales.BD_Funds WHERE ID_Fund = @ID_Fund_2;

IF @Portfolio_1 IS NULL
BEGIN
    RAISERROR('ID_Fund_1 no existe en BD_Funds', 16, 1);
    RETURN;
END
IF @Portfolio_2 IS NULL
BEGIN
    RAISERROR('ID_Fund_2 no existe en BD_Funds', 16, 1);
    RETURN;
END

-- Variables de salida
DECLARE @ReturnCode INT, @ErrorMessage NVARCHAR(500);
DECLARE @RegistrosIPA INT, @RegistrosCAPM INT, @RegistrosSONA INT;
DECLARE @RegistrosPNL INT, @RegistrosDerivados INT;
DECLARE @SuciedadesCount INT, @HomolFondosCount INT;
DECLARE @HomolInstrumentosCount INT, @HomolMonedasCount INT;

-- Tabla temporal para resultados
CREATE TABLE #Resultados (
    Orden INT,
    Fondo NVARCHAR(100),
    ID_Fund INT,
    CodigoRetorno INT,
    IPA INT,
    CAPM INT,
    SONA INT,
    PNL INT,
    Derivados INT,
    Suciedades INT,
    InstrumentosPend INT,
    MonedasPend INT,
    FondosPend INT,
    Mensaje NVARCHAR(500)
);

PRINT '================================================================================'
PRINT '  TEST GENERICO: VALIDACION PARALELA DE 2 FONDOS'
PRINT '================================================================================'
PRINT ''
PRINT '  Fecha Reporte: ' + CONVERT(NVARCHAR(10), @FechaReporte, 120)
PRINT '  Fondo 1: ' + @Portfolio_1 + ' (ID: ' + CAST(@ID_Fund_1 AS NVARCHAR(10)) + ')'
PRINT '  Fondo 2: ' + @Portfolio_2 + ' (ID: ' + CAST(@ID_Fund_2 AS NVARCHAR(10)) + ')'
PRINT ''

-- ============================================================================
-- PASO 1: LIMPIEZA
-- ============================================================================
PRINT '------------------------------------------------------------------------'
PRINT ' PASO 1: Limpieza de datos previos'
PRINT '------------------------------------------------------------------------'

IF @LimpiezaCompleta = 1
BEGIN
    PRINT '  [!] MODO LIMPIEZA COMPLETA - Escenario virgen'
    PRINT ''

    -- ══════════════════════════════════════════════════════════════════════
    -- SANDBOX: Tablas N:M (primero las FK, luego las principales)
    -- ══════════════════════════════════════════════════════════════════════
    DELETE FROM sandbox.Homologacion_Instrumentos_Fondos;
    PRINT '    - sandbox.Homologacion_Instrumentos_Fondos: ' + CAST(@@ROWCOUNT AS NVARCHAR(10)) + ' filas';

    DELETE FROM sandbox.Homologacion_Instrumentos;
    PRINT '    - sandbox.Homologacion_Instrumentos: ' + CAST(@@ROWCOUNT AS NVARCHAR(10)) + ' filas';

    DELETE FROM sandbox.Homologacion_Monedas_Fondos;
    PRINT '    - sandbox.Homologacion_Monedas_Fondos: ' + CAST(@@ROWCOUNT AS NVARCHAR(10)) + ' filas';

    DELETE FROM sandbox.Homologacion_Monedas;
    PRINT '    - sandbox.Homologacion_Monedas: ' + CAST(@@ROWCOUNT AS NVARCHAR(10)) + ' filas';

    DELETE FROM sandbox.Homologacion_Fondos_Fondos;
    PRINT '    - sandbox.Homologacion_Fondos_Fondos: ' + CAST(@@ROWCOUNT AS NVARCHAR(10)) + ' filas';

    DELETE FROM sandbox.Homologacion_Fondos;
    PRINT '    - sandbox.Homologacion_Fondos: ' + CAST(@@ROWCOUNT AS NVARCHAR(10)) + ' filas';

    DELETE FROM sandbox.Alertas_Suciedades_IPA_Fondos;
    PRINT '    - sandbox.Alertas_Suciedades_IPA_Fondos: ' + CAST(@@ROWCOUNT AS NVARCHAR(10)) + ' filas';

    DELETE FROM sandbox.Alertas_Suciedades_IPA;
    PRINT '    - sandbox.Alertas_Suciedades_IPA: ' + CAST(@@ROWCOUNT AS NVARCHAR(10)) + ' filas';

    -- ══════════════════════════════════════════════════════════════════════
    -- SANDBOX: Tablas de alertas simples
    -- ══════════════════════════════════════════════════════════════════════
    DELETE FROM sandbox.Alertas_Extract_Faltante;
    PRINT '    - sandbox.Alertas_Extract_Faltante: ' + CAST(@@ROWCOUNT AS NVARCHAR(10)) + ' filas';

    DELETE FROM sandbox.Alertas_Descuadre_Cash;
    PRINT '    - sandbox.Alertas_Descuadre_Cash: ' + CAST(@@ROWCOUNT AS NVARCHAR(10)) + ' filas';

    DELETE FROM sandbox.Alertas_Descuadre_Derivados;
    PRINT '    - sandbox.Alertas_Descuadre_Derivados: ' + CAST(@@ROWCOUNT AS NVARCHAR(10)) + ' filas';

    DELETE FROM sandbox.Alertas_Descuadre_NAV;
    PRINT '    - sandbox.Alertas_Descuadre_NAV: ' + CAST(@@ROWCOUNT AS NVARCHAR(10)) + ' filas';

    -- ══════════════════════════════════════════════════════════════════════
    -- LOGS
    -- ══════════════════════════════════════════════════════════════════════
    DELETE FROM logs.Validaciones_Ejecucion;
    PRINT '    - logs.Validaciones_Ejecucion: ' + CAST(@@ROWCOUNT AS NVARCHAR(10)) + ' filas';

    -- ══════════════════════════════════════════════════════════════════════
    -- EXTRACT
    -- ══════════════════════════════════════════════════════════════════════
    DELETE FROM extract.IPA;
    PRINT '    - extract.IPA: ' + CAST(@@ROWCOUNT AS NVARCHAR(10)) + ' filas';

    DELETE FROM extract.CAPM;
    PRINT '    - extract.CAPM: ' + CAST(@@ROWCOUNT AS NVARCHAR(10)) + ' filas';

    DELETE FROM extract.SONA;
    PRINT '    - extract.SONA: ' + CAST(@@ROWCOUNT AS NVARCHAR(10)) + ' filas';

    DELETE FROM extract.PNL;
    PRINT '    - extract.PNL: ' + CAST(@@ROWCOUNT AS NVARCHAR(10)) + ' filas';

    DELETE FROM extract.Derivados;
    PRINT '    - extract.Derivados: ' + CAST(@@ROWCOUNT AS NVARCHAR(10)) + ' filas';

    DELETE FROM extract.PosModRF;
    PRINT '    - extract.PosModRF: ' + CAST(@@ROWCOUNT AS NVARCHAR(10)) + ' filas';

    PRINT ''
    PRINT '  [OK] Limpieza COMPLETA terminada'
END
ELSE
BEGIN
    PRINT '  [i] MODO LIMPIEZA PARCIAL - Solo IDs de ejecucion ' +
          CAST(@ID_Ejecucion_1 AS NVARCHAR(20)) + ', ' + CAST(@ID_Ejecucion_2 AS NVARCHAR(20))
    PRINT ''

    -- Extract tables
    DELETE FROM extract.IPA WHERE ID_Ejecucion IN (@ID_Ejecucion_1, @ID_Ejecucion_2);
    DELETE FROM extract.CAPM WHERE ID_Ejecucion IN (@ID_Ejecucion_1, @ID_Ejecucion_2);
    DELETE FROM extract.SONA WHERE ID_Ejecucion IN (@ID_Ejecucion_1, @ID_Ejecucion_2);
    DELETE FROM extract.PNL WHERE ID_Ejecucion IN (@ID_Ejecucion_1, @ID_Ejecucion_2);
    DELETE FROM extract.Derivados WHERE ID_Ejecucion IN (@ID_Ejecucion_1, @ID_Ejecucion_2);
    DELETE FROM extract.PosModRF WHERE ID_Ejecucion IN (@ID_Ejecucion_1, @ID_Ejecucion_2);

    -- Logs
    DELETE FROM logs.Validaciones_Ejecucion WHERE ID_Ejecucion IN (@ID_Ejecucion_1, @ID_Ejecucion_2);

    -- Sandbox alerts (by execution)
    DELETE FROM sandbox.Alertas_Extract_Faltante WHERE ID_Ejecucion IN (@ID_Ejecucion_1, @ID_Ejecucion_2);
    DELETE FROM sandbox.Alertas_Descuadre_Cash WHERE ID_Ejecucion IN (@ID_Ejecucion_1, @ID_Ejecucion_2);
    DELETE FROM sandbox.Alertas_Descuadre_Derivados WHERE ID_Ejecucion IN (@ID_Ejecucion_1, @ID_Ejecucion_2);
    DELETE FROM sandbox.Alertas_Descuadre_NAV WHERE ID_Ejecucion IN (@ID_Ejecucion_1, @ID_Ejecucion_2);

    -- Nota: Las tablas N:M (Homologacion_*, Suciedades_*) son globales,
    -- no se filtran por ID_Ejecucion. Use @LimpiezaCompleta = 1 para limpiarlas.

    PRINT '  [OK] Limpieza parcial completada'
END
PRINT ''

-- ============================================================================
-- PASO 2: EJECUTAR EXTRACTS - FONDO 1
-- ============================================================================
PRINT '------------------------------------------------------------------------'
PRINT ' PASO 2: Extracts - ' + @Portfolio_1
PRINT '------------------------------------------------------------------------'

BEGIN TRY
    EXEC extract.Extract_IPA @FechaReporte, @ID_Proceso_1, @ID_Ejecucion_1, @ID_Fund_1, @Portfolio_1;
    PRINT '  [OK] Extract_IPA'
END TRY BEGIN CATCH PRINT '  [SKIP] Extract_IPA: ' + ERROR_MESSAGE() END CATCH

BEGIN TRY
    EXEC extract.Extract_CAPM @FechaReporte, @ID_Proceso_1, @ID_Ejecucion_1, @ID_Fund_1, @Portfolio_1;
    PRINT '  [OK] Extract_CAPM'
END TRY BEGIN CATCH PRINT '  [SKIP] Extract_CAPM: ' + ERROR_MESSAGE() END CATCH

BEGIN TRY
    EXEC extract.Extract_SONA @FechaReporte, @ID_Proceso_1, @ID_Ejecucion_1, @ID_Fund_1, @Portfolio_1;
    PRINT '  [OK] Extract_SONA'
END TRY BEGIN CATCH PRINT '  [SKIP] Extract_SONA: ' + ERROR_MESSAGE() END CATCH

BEGIN TRY
    EXEC extract.Extract_PNL @FechaReporte, @ID_Proceso_1, @ID_Ejecucion_1, @ID_Fund_1, @Portfolio_1;
    PRINT '  [OK] Extract_PNL'
END TRY BEGIN CATCH PRINT '  [SKIP] Extract_PNL: ' + ERROR_MESSAGE() END CATCH

PRINT ''

-- ============================================================================
-- PASO 3: EJECUTAR EXTRACTS - FONDO 2
-- ============================================================================
PRINT '------------------------------------------------------------------------'
PRINT ' PASO 3: Extracts - ' + @Portfolio_2
PRINT '------------------------------------------------------------------------'

BEGIN TRY
    EXEC extract.Extract_IPA @FechaReporte, @ID_Proceso_2, @ID_Ejecucion_2, @ID_Fund_2, @Portfolio_2;
    PRINT '  [OK] Extract_IPA'
END TRY BEGIN CATCH PRINT '  [SKIP] Extract_IPA: ' + ERROR_MESSAGE() END CATCH

BEGIN TRY
    EXEC extract.Extract_CAPM @FechaReporte, @ID_Proceso_2, @ID_Ejecucion_2, @ID_Fund_2, @Portfolio_2;
    PRINT '  [OK] Extract_CAPM'
END TRY BEGIN CATCH PRINT '  [SKIP] Extract_CAPM: ' + ERROR_MESSAGE() END CATCH

BEGIN TRY
    EXEC extract.Extract_SONA @FechaReporte, @ID_Proceso_2, @ID_Ejecucion_2, @ID_Fund_2, @Portfolio_2;
    PRINT '  [OK] Extract_SONA'
END TRY BEGIN CATCH PRINT '  [SKIP] Extract_SONA: ' + ERROR_MESSAGE() END CATCH

BEGIN TRY
    EXEC extract.Extract_PNL @FechaReporte, @ID_Proceso_2, @ID_Ejecucion_2, @ID_Fund_2, @Portfolio_2;
    PRINT '  [OK] Extract_PNL'
END TRY BEGIN CATCH PRINT '  [SKIP] Extract_PNL: ' + ERROR_MESSAGE() END CATCH

PRINT ''

-- ============================================================================
-- PASO 4: VALIDAR FONDO 1
-- ============================================================================
PRINT '------------------------------------------------------------------------'
PRINT ' PASO 4: Validacion - ' + @Portfolio_1
PRINT '------------------------------------------------------------------------'

EXEC @ReturnCode = staging.sp_ValidateFund
    @ID_Ejecucion = @ID_Ejecucion_1,
    @ID_Proceso = @ID_Proceso_1,
    @ID_Fund = @ID_Fund_1,
    @FechaReporte = @FechaReporte,
    @ErrorMessage = @ErrorMessage OUTPUT,
    @RegistrosIPA = @RegistrosIPA OUTPUT,
    @RegistrosCAPM = @RegistrosCAPM OUTPUT,
    @RegistrosSONA = @RegistrosSONA OUTPUT,
    @RegistrosPNL = @RegistrosPNL OUTPUT,
    @RegistrosDerivados = @RegistrosDerivados OUTPUT,
    @SuciedadesCount = @SuciedadesCount OUTPUT,
    @HomolFondosCount = @HomolFondosCount OUTPUT,
    @HomolInstrumentosCount = @HomolInstrumentosCount OUTPUT,
    @HomolMonedasCount = @HomolMonedasCount OUTPUT;

INSERT INTO #Resultados VALUES (1, @Portfolio_1, @ID_Fund_1, @ReturnCode,
    @RegistrosIPA, @RegistrosCAPM, @RegistrosSONA, @RegistrosPNL, @RegistrosDerivados,
    @SuciedadesCount, @HomolInstrumentosCount, @HomolMonedasCount, @HomolFondosCount, @ErrorMessage);

PRINT ''

-- ============================================================================
-- PASO 5: VALIDAR FONDO 2
-- ============================================================================
PRINT '------------------------------------------------------------------------'
PRINT ' PASO 5: Validacion - ' + @Portfolio_2
PRINT '------------------------------------------------------------------------'

EXEC @ReturnCode = staging.sp_ValidateFund
    @ID_Ejecucion = @ID_Ejecucion_2,
    @ID_Proceso = @ID_Proceso_2,
    @ID_Fund = @ID_Fund_2,
    @FechaReporte = @FechaReporte,
    @ErrorMessage = @ErrorMessage OUTPUT,
    @RegistrosIPA = @RegistrosIPA OUTPUT,
    @RegistrosCAPM = @RegistrosCAPM OUTPUT,
    @RegistrosSONA = @RegistrosSONA OUTPUT,
    @RegistrosPNL = @RegistrosPNL OUTPUT,
    @RegistrosDerivados = @RegistrosDerivados OUTPUT,
    @SuciedadesCount = @SuciedadesCount OUTPUT,
    @HomolFondosCount = @HomolFondosCount OUTPUT,
    @HomolInstrumentosCount = @HomolInstrumentosCount OUTPUT,
    @HomolMonedasCount = @HomolMonedasCount OUTPUT;

INSERT INTO #Resultados VALUES (2, @Portfolio_2, @ID_Fund_2, @ReturnCode,
    @RegistrosIPA, @RegistrosCAPM, @RegistrosSONA, @RegistrosPNL, @RegistrosDerivados,
    @SuciedadesCount, @HomolInstrumentosCount, @HomolMonedasCount, @HomolFondosCount, @ErrorMessage);

PRINT ''

-- ============================================================================
-- RESULTADOS
-- ============================================================================
PRINT '================================================================================'
PRINT '  RESULTADOS'
PRINT '================================================================================'
PRINT ''

-- Tabla resumen
PRINT '  RESUMEN POR FONDO:'
SELECT
    Fondo,
    CASE
        WHEN CodigoRetorno = 0 THEN N'OK'
        WHEN CodigoRetorno = 5 THEN N'SUCIEDADES'
        WHEN CodigoRetorno = 6 THEN N'INSTRUMENTOS'
        WHEN CodigoRetorno = 10 THEN N'FONDOS'
        WHEN CodigoRetorno = 11 THEN N'MONEDAS'
        ELSE N'ERROR(' + CAST(CodigoRetorno AS NVARCHAR(5)) + N')'
    END AS Estado,
    IPA, CAPM, SONA, PNL,
    Suciedades AS Suc,
    InstrumentosPend AS Inst,
    MonedasPend AS Mon
FROM #Resultados
ORDER BY Orden;

-- Pendientes en sandbox
PRINT ''
PRINT '  PENDIENTES EN SANDBOX (ambos fondos):'
SELECT
    ID_Fund,
    Fund_Code AS Fondo,
    TipoHomologacion AS Tipo,
    CantidadPendiente AS Cantidad
FROM sandbox.vw_Pendientes_Por_Fondo
WHERE ID_Fund IN (@ID_Fund_1, @ID_Fund_2)
ORDER BY ID_Fund, TipoHomologacion;

-- Detalle de instrumentos pendientes
PRINT ''
PRINT '  INSTRUMENTOS PENDIENTES (detalle):'
SELECT
    h.Instrumento,
    h.Source,
    h.Currency,
    STRING_AGG(f.Fund_Code, ', ') AS Fondos
FROM sandbox.Homologacion_Instrumentos h
INNER JOIN sandbox.Homologacion_Instrumentos_Fondos hf ON h.ID = hf.ID_Homologacion
INNER JOIN dimensionales.BD_Funds f ON hf.ID_Fund = f.ID_Fund
WHERE h.Estado = 'Pendiente'
  AND hf.ID_Fund IN (@ID_Fund_1, @ID_Fund_2)
GROUP BY h.Instrumento, h.Source, h.Currency
ORDER BY h.Instrumento;

-- Suciedades
PRINT ''
PRINT '  SUCIEDADES DETECTADAS:'
SELECT
    s.InvestID,
    s.Qty,
    s.MVBook,
    STRING_AGG(f.Fund_Code, ', ') AS Fondos
FROM sandbox.Alertas_Suciedades_IPA s
INNER JOIN sandbox.Alertas_Suciedades_IPA_Fondos sf ON s.ID = sf.ID_Suciedad
INNER JOIN dimensionales.BD_Funds f ON sf.ID_Fund = f.ID_Fund
WHERE s.Estado = 'Pendiente'
  AND sf.ID_Fund IN (@ID_Fund_1, @ID_Fund_2)
GROUP BY s.InvestID, s.Qty, s.MVBook;

-- Cleanup
DROP TABLE #Resultados;

PRINT ''
PRINT '================================================================================'
PRINT '  TEST COMPLETADO'
PRINT '================================================================================'
GO

-- ============================================================================
-- DIAGNOSTICO DE PLAN DE EJECUCION (VERSION PRINT)
-- ============================================================================
-- Esta version imprime todas las recomendaciones como mensajes en lugar de
-- retornar grids, facilitando la revision en el tab Messages de SSMS.
-- ============================================================================

PRINT ''
PRINT '================================================================================'
PRINT '  DIAGNOSTICO DE PLAN DE EJECUCION'
PRINT '================================================================================'
PRINT ''

-- ============================================================================
-- [1] INDICES FALTANTES SUGERIDOS
-- ============================================================================
PRINT '┌──────────────────────────────────────────────────────────────────────────────┐'
PRINT '│ [1] INDICES FALTANTES SUGERIDOS POR EL OPTIMIZADOR                           │'
PRINT '└──────────────────────────────────────────────────────────────────────────────┘'

DECLARE @MissingCount INT = 0;
DECLARE @MissingLine NVARCHAR(MAX);

DECLARE missing_cursor CURSOR LOCAL FAST_FORWARD FOR
SELECT
    '  → ' + ISNULL(OBJECT_NAME(d.object_id, d.database_id), 'N/A') +
    ' | Impacto: ' + CAST(CAST(gs.avg_user_impact AS INT) AS NVARCHAR(10)) + '%' +
    ' | Usos: ' + CAST(gs.user_seeks + gs.user_scans AS NVARCHAR(10)) +
    CHAR(13) + CHAR(10) +
    '    EQ: ' + ISNULL(d.equality_columns, '(ninguno)') +
    CHAR(13) + CHAR(10) +
    '    NEQ: ' + ISNULL(d.inequality_columns, '(ninguno)') +
    CHAR(13) + CHAR(10) +
    '    INCLUDE: ' + ISNULL(d.included_columns, '(ninguno)')
FROM sys.dm_db_missing_index_details d
JOIN sys.dm_db_missing_index_groups g ON d.index_handle = g.index_handle
JOIN sys.dm_db_missing_index_group_stats gs ON g.index_group_handle = gs.group_handle
WHERE d.database_id = DB_ID()
ORDER BY gs.avg_user_impact DESC;

OPEN missing_cursor;
FETCH NEXT FROM missing_cursor INTO @MissingLine;

WHILE @@FETCH_STATUS = 0
BEGIN
    PRINT @MissingLine;
    PRINT '';
    SET @MissingCount = @MissingCount + 1;
    FETCH NEXT FROM missing_cursor INTO @MissingLine;
END

CLOSE missing_cursor;
DEALLOCATE missing_cursor;

IF @MissingCount = 0
    PRINT '  ✓ No hay indices faltantes sugeridos.';
ELSE
    PRINT '  Total: ' + CAST(@MissingCount AS NVARCHAR(10)) + ' indice(s) sugerido(s)';

PRINT ''

-- ============================================================================
-- [2] PLANES CON WARNINGS
-- ============================================================================
PRINT '┌──────────────────────────────────────────────────────────────────────────────┐'
PRINT '│ [2] PLANES CON WARNINGS (conversiones, spills, estadisticas)                 │'
PRINT '└──────────────────────────────────────────────────────────────────────────────┘'

DECLARE @WarningCount INT = 0;
DECLARE @WarningLine NVARCHAR(MAX);
DECLARE @QueryFragment NVARCHAR(200);
DECLARE @Ejecuciones INT;
DECLARE @AvgReads BIGINT;
DECLARE @TieneWarnings BIT;
DECLARE @SinStats BIT;
DECLARE @ConvImplicita BIT;

DECLARE warning_cursor CURSOR LOCAL FAST_FORWARD FOR
SELECT TOP 15
    LEFT(SUBSTRING(t.text, (qs.statement_start_offset/2)+1,
        ((CASE qs.statement_end_offset
            WHEN -1 THEN DATALENGTH(t.text)
            ELSE qs.statement_end_offset
        END - qs.statement_start_offset)/2)+1), 80) AS Query_Fragment,
    qs.execution_count,
    qs.total_logical_reads / NULLIF(qs.execution_count, 0),
    qp.query_plan.exist('//Warnings'),
    qp.query_plan.exist('//ColumnsWithNoStatistics'),
    qp.query_plan.exist('//PlanAffectingConvert')
FROM sys.dm_exec_query_stats qs
CROSS APPLY sys.dm_exec_sql_text(qs.sql_handle) t
CROSS APPLY sys.dm_exec_query_plan(qs.plan_handle) qp
WHERE (t.text LIKE '%sp_ValidateFund%'
   OR t.text LIKE '%sp_Homologate%'
   OR t.text LIKE '%Extract_%'
   OR t.text LIKE '%staging.%'
   OR t.text LIKE '%dimensionales.%')
   AND t.text NOT LIKE '%sys.dm_exec%'
   AND (qp.query_plan.exist('//Warnings') = 1
        OR qp.query_plan.exist('//PlanAffectingConvert') = 1
        OR qp.query_plan.exist('//ColumnsWithNoStatistics') = 1)
ORDER BY qs.total_logical_reads DESC;

OPEN warning_cursor;
FETCH NEXT FROM warning_cursor INTO @QueryFragment, @Ejecuciones, @AvgReads, @TieneWarnings, @SinStats, @ConvImplicita;

WHILE @@FETCH_STATUS = 0
BEGIN
    SET @WarningLine = '  → Query: ' + REPLACE(REPLACE(@QueryFragment, CHAR(13), ' '), CHAR(10), ' ');
    PRINT @WarningLine;
    PRINT '    Ejecuciones: ' + CAST(@Ejecuciones AS NVARCHAR(20)) + ' | Avg Reads: ' + ISNULL(CAST(@AvgReads AS NVARCHAR(20)), 'N/A');
    PRINT '    Warnings: ' + CASE @TieneWarnings WHEN 1 THEN 'SI' ELSE 'NO' END +
          ' | Sin Stats: ' + CASE @SinStats WHEN 1 THEN 'SI' ELSE 'NO' END +
          ' | Conv.Implicita: ' + CASE @ConvImplicita WHEN 1 THEN 'SI' ELSE 'NO' END;
    PRINT '';
    SET @WarningCount = @WarningCount + 1;
    FETCH NEXT FROM warning_cursor INTO @QueryFragment, @Ejecuciones, @AvgReads, @TieneWarnings, @SinStats, @ConvImplicita;
END

CLOSE warning_cursor;
DEALLOCATE warning_cursor;

IF @WarningCount = 0
    PRINT '  ✓ No se detectaron warnings en planes cacheados.';
ELSE
    PRINT '  Total: ' + CAST(@WarningCount AS NVARCHAR(10)) + ' plan(es) con warnings';

PRINT ''

-- ============================================================================
-- [3] ESTADISTICAS DESACTUALIZADAS
-- ============================================================================
PRINT '┌──────────────────────────────────────────────────────────────────────────────┐'
PRINT '│ [3] ESTADISTICAS DESACTUALIZADAS (>1000 modificaciones)                      │'
PRINT '└──────────────────────────────────────────────────────────────────────────────┘'

DECLARE @StatsCount INT = 0;
DECLARE @StatsLine NVARCHAR(MAX);

DECLARE stats_cursor CURSOR LOCAL FAST_FORWARD FOR
SELECT
    '  → ' + OBJECT_SCHEMA_NAME(s.object_id) + '.' + OBJECT_NAME(s.object_id) +
    '.' + s.name +
    CHAR(13) + CHAR(10) +
    '    Ultima actualizacion: ' + ISNULL(CONVERT(NVARCHAR(20), STATS_DATE(s.object_id, s.stats_id), 120), 'NUNCA') +
    ' | Filas: ' + ISNULL(CAST(sp.rows AS NVARCHAR(20)), '?') +
    ' | Modificaciones: ' + CAST(sp.modification_counter AS NVARCHAR(20))
FROM sys.stats s
CROSS APPLY sys.dm_db_stats_properties(s.object_id, s.stats_id) sp
WHERE OBJECT_SCHEMA_NAME(s.object_id) IN ('extract', 'dimensionales', 'sandbox', 'staging')
  AND sp.modification_counter > 1000
ORDER BY sp.modification_counter DESC;

OPEN stats_cursor;
FETCH NEXT FROM stats_cursor INTO @StatsLine;

WHILE @@FETCH_STATUS = 0
BEGIN
    PRINT @StatsLine;
    PRINT '';
    SET @StatsCount = @StatsCount + 1;
    FETCH NEXT FROM stats_cursor INTO @StatsLine;
END

CLOSE stats_cursor;
DEALLOCATE stats_cursor;

IF @StatsCount = 0
    PRINT '  ✓ Todas las estadisticas estan actualizadas.';
ELSE
BEGIN
    PRINT '  Total: ' + CAST(@StatsCount AS NVARCHAR(10)) + ' estadistica(s) desactualizada(s)';
    PRINT '  RECOMENDACION: Ejecutar UPDATE STATISTICS en las tablas afectadas';
END

PRINT ''

-- ============================================================================
-- [4] DETALLE DE CONVERSIONES IMPLICITAS
-- ============================================================================
PRINT '┌──────────────────────────────────────────────────────────────────────────────┐'
PRINT '│ [4] CONVERSIONES IMPLICITAS EN PLANES (afectan rendimiento)                  │'
PRINT '└──────────────────────────────────────────────────────────────────────────────┘'

DECLARE @ConvCount INT = 0;
DECLARE @ConvLine NVARCHAR(MAX);

;WITH XMLNAMESPACES (DEFAULT 'http://schemas.microsoft.com/sqlserver/2004/07/showplan')
SELECT
    @ConvCount = COUNT(*)
FROM sys.dm_exec_query_stats qs
CROSS APPLY sys.dm_exec_query_plan(qs.plan_handle) qp
CROSS APPLY qp.query_plan.nodes('//PlanAffectingConvert') AS q(n)
WHERE qp.dbid = DB_ID();

IF @ConvCount = 0
    PRINT '  ✓ No se detectaron conversiones implicitas que afecten el plan.';
ELSE
BEGIN
    DECLARE conv_cursor CURSOR LOCAL FAST_FORWARD FOR
    WITH XMLNAMESPACES (DEFAULT 'http://schemas.microsoft.com/sqlserver/2004/07/showplan')
    SELECT TOP 15
        '  → Objeto: ' + ISNULL(OBJECT_NAME(qp.objectid, qp.dbid), '(ad-hoc)') +
        CHAR(13) + CHAR(10) +
        '    Expresion: ' + LEFT(ISNULL(n.value('(@Expression)[1]', 'varchar(500)'), 'N/A'), 100) +
        CHAR(13) + CHAR(10) +
        '    Problema: ' + ISNULL(n.value('(@ConvertIssue)[1]', 'varchar(100)'), 'Conversion implicita') +
        ' | Ejecuciones: ' + CAST(qs.execution_count AS NVARCHAR(20))
    FROM sys.dm_exec_query_stats qs
    CROSS APPLY sys.dm_exec_query_plan(qs.plan_handle) qp
    CROSS APPLY qp.query_plan.nodes('//PlanAffectingConvert') AS q(n)
    WHERE qp.dbid = DB_ID()
    ORDER BY qs.execution_count DESC;

    OPEN conv_cursor;
    FETCH NEXT FROM conv_cursor INTO @ConvLine;

    DECLARE @ConvPrinted INT = 0;
    WHILE @@FETCH_STATUS = 0
    BEGIN
        PRINT @ConvLine;
        PRINT '';
        SET @ConvPrinted = @ConvPrinted + 1;
        FETCH NEXT FROM conv_cursor INTO @ConvLine;
    END

    CLOSE conv_cursor;
    DEALLOCATE conv_cursor;

    PRINT '  Total: ' + CAST(@ConvCount AS NVARCHAR(10)) + ' conversion(es) detectada(s)';
    PRINT '  RECOMENDACION: Revisar collation/tipos de datos en JOINs y WHERE';
END

PRINT ''

-- ============================================================================
-- [5] INDEX SCANS EN TABLAS CLAVE
-- ============================================================================
PRINT '┌──────────────────────────────────────────────────────────────────────────────┐'
PRINT '│ [5] INDEX SCANS EN TABLAS CLAVE (considerar optimizacion si %Scans > 50)     │'
PRINT '└──────────────────────────────────────────────────────────────────────────────┘'

DECLARE @ScanCount INT = 0;
DECLARE @ScanLine NVARCHAR(MAX);

DECLARE scan_cursor CURSOR LOCAL FAST_FORWARD FOR
SELECT TOP 20
    '  → ' + OBJECT_SCHEMA_NAME(i.object_id) + '.' + OBJECT_NAME(i.object_id) +
    ' [' + i.name + ']' +
    CHAR(13) + CHAR(10) +
    '    Scans: ' + CAST(ius.user_scans AS NVARCHAR(20)) +
    ' | Seeks: ' + CAST(ius.user_seeks AS NVARCHAR(20)) +
    ' | %Scans: ' + CAST(
        CASE WHEN ius.user_seeks > 0
             THEN CAST(ius.user_scans * 100.0 / (ius.user_scans + ius.user_seeks) AS DECIMAL(5,2))
             ELSE 100
        END AS NVARCHAR(10)) + '%' +
    CASE
        WHEN ius.user_scans * 100.0 / NULLIF(ius.user_scans + ius.user_seeks, 0) > 80 THEN ' ⚠ ALTO'
        WHEN ius.user_scans * 100.0 / NULLIF(ius.user_scans + ius.user_seeks, 0) > 50 THEN ' ⚡ MEDIO'
        ELSE ''
    END
FROM sys.dm_db_index_usage_stats ius
JOIN sys.indexes i ON ius.object_id = i.object_id AND ius.index_id = i.index_id
WHERE ius.database_id = DB_ID()
  AND OBJECT_SCHEMA_NAME(i.object_id) IN ('extract', 'dimensionales', 'sandbox', 'staging')
  AND ius.user_scans > 0
  AND i.name IS NOT NULL
ORDER BY ius.user_scans DESC;

OPEN scan_cursor;
FETCH NEXT FROM scan_cursor INTO @ScanLine;

WHILE @@FETCH_STATUS = 0
BEGIN
    PRINT @ScanLine;
    SET @ScanCount = @ScanCount + 1;
    FETCH NEXT FROM scan_cursor INTO @ScanLine;
END

CLOSE scan_cursor;
DEALLOCATE scan_cursor;

IF @ScanCount = 0
    PRINT '  ✓ No hay index scans significativos.';
ELSE
    PRINT '  Total: ' + CAST(@ScanCount AS NVARCHAR(10)) + ' indice(s) con scans';

PRINT ''

-- ============================================================================
-- [6] RESUMEN DE RECOMENDACIONES
-- ============================================================================
PRINT '┌──────────────────────────────────────────────────────────────────────────────┐'
PRINT '│ [6] RESUMEN DE RECOMENDACIONES                                               │'
PRINT '└──────────────────────────────────────────────────────────────────────────────┘'

DECLARE @TotalIssues INT = 0;

-- Contar issues
SELECT @TotalIssues = @TotalIssues + COUNT(*)
FROM sys.dm_db_missing_index_details d
WHERE d.database_id = DB_ID();

SELECT @TotalIssues = @TotalIssues + COUNT(*)
FROM sys.stats s
CROSS APPLY sys.dm_db_stats_properties(s.object_id, s.stats_id) sp
WHERE OBJECT_SCHEMA_NAME(s.object_id) IN ('extract', 'dimensionales', 'sandbox', 'staging')
  AND sp.modification_counter > 1000;

IF @TotalIssues = 0
BEGIN
    PRINT ''
    PRINT '  ╔══════════════════════════════════════════════════════════════════════╗'
    PRINT '  ║  ✓ ¡EXCELENTE! No se encontraron problemas de optimizacion.          ║'
    PRINT '  ╚══════════════════════════════════════════════════════════════════════╝'
END
ELSE
BEGIN
    PRINT ''
    PRINT '  Acciones sugeridas:'
    PRINT ''

    -- Indices faltantes
    IF EXISTS (SELECT 1 FROM sys.dm_db_missing_index_details WHERE database_id = DB_ID())
    BEGIN
        PRINT '  1. CREAR INDICES FALTANTES:'
        PRINT '     Revisar seccion [1] y crear los indices con mayor impacto';
        PRINT ''
    END

    -- Estadisticas
    IF EXISTS (
        SELECT 1 FROM sys.stats s
        CROSS APPLY sys.dm_db_stats_properties(s.object_id, s.stats_id) sp
        WHERE OBJECT_SCHEMA_NAME(s.object_id) IN ('extract', 'dimensionales', 'sandbox', 'staging')
          AND sp.modification_counter > 1000
    )
    BEGIN
        PRINT '  2. ACTUALIZAR ESTADISTICAS:'
        PRINT '     EXEC sp_updatestats;'
        PRINT '     -- O para tablas especificas:'
        PRINT '     -- UPDATE STATISTICS schema.tabla;'
        PRINT ''
    END

    -- Conversiones implicitas
    IF @ConvCount > 0
    BEGIN
        PRINT '  3. CORREGIR CONVERSIONES IMPLICITAS:'
        PRINT '     - Verificar tipos de datos en JOINs coincidan';
        PRINT '     - Verificar collation en comparaciones de strings';
        PRINT '     - Usar CAST/CONVERT explicito donde sea necesario';
        PRINT ''
    END
END

PRINT ''
PRINT '================================================================================'
PRINT '  FIN DIAGNOSTICO - ' + CONVERT(NVARCHAR(30), GETDATE(), 120)
PRINT '================================================================================'
GO
