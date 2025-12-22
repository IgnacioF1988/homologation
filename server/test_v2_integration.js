/**
 * Pipeline V2 Integration Test
 *
 * Prueba completa del flujo de ejecución del FundOrchestrator con:
 * - Inicialización de ejecución
 * - Carga de fondos desde logs.Ejecucion_Fondos
 * - Ejecución del orquestador con 5 fondos de prueba
 * - Validación de estados finales
 * - Verificación de logs generados
 *
 * Uso: node server/test_v2_integration.js
 */

// Cargar variables de entorno
require('dotenv').config();

const sql = require('mssql');
const { FundOrchestrator } = require('./services/orchestration');
const { ExecutionTracker, LoggingService } = require('./services/tracking');

// Configuración de base de datos (misma que procesos.v2.routes.js)
const dbConfig = {
  server: process.env.DB_SERVER,
  database: 'Inteligencia_Producto_Dev',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT) || 1433,
  options: {
    encrypt: process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true',
    enableArithAbort: true
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000
  },
  requestTimeout: 600000 // 10 minutos
};

async function testV2Integration() {
  console.log('========================================');
  console.log('Pipeline V2 Integration Test');
  console.log('========================================\n');

  let pool;
  let idEjecucion;

  try {
    // ====================================
    // PASO 1: Conectar a base de datos
    // ====================================
    console.log('📡 [PASO 1] Conectando a base de datos...');
    pool = new sql.ConnectionPool(dbConfig);
    await pool.connect();
    console.log('✓ Conectado a:', dbConfig.server, '/', dbConfig.database);
    console.log();

    // ====================================
    // PASO 2: Inicializar ejecución
    // ====================================
    console.log('🚀 [PASO 2] Inicializando ejecución...');

    const fechaReporte = '2024-12-01'; // Fecha de prueba

    const initResult = await pool.request()
      .input('FechaReporte', sql.NVarChar(10), fechaReporte)
      .output('ID_Ejecucion', sql.BigInt)
      .execute('logs.sp_Inicializar_Ejecucion');

    idEjecucion = initResult.output.ID_Ejecucion;
    console.log('✓ Ejecución inicializada:', idEjecucion.toString());
    console.log();

    // ====================================
    // PASO 3: Cargar fondos (TOP 5)
    // ====================================
    console.log('📊 [PASO 3] Cargando fondos de prueba (TOP 5)...');

    const fondosResult = await pool.request()
      .input('ID_Ejecucion', sql.BigInt, idEjecucion)
      .query(`
        SELECT TOP 5
          ID_Fund,
          FundShortName,
          Portfolio_Geneva,
          Portfolio_CAPM,
          Portfolio_Derivados,
          Portfolio_UBS,
          Flag_UBS,
          Flag_Derivados,
          Incluir_En_Cubo
        FROM logs.Ejecucion_Fondos
        WHERE ID_Ejecucion = @ID_Ejecucion
          AND Incluir_En_Cubo = 1
        ORDER BY ID_Fund
      `);

    const fondos = fondosResult.recordset;
    console.log(`✓ Fondos cargados: ${fondos.length}`);

    if (fondos.length === 0) {
      throw new Error('No se encontraron fondos para procesar. Verificar logs.Ejecucion_Fondos');
    }

    // Mostrar fondos cargados
    console.log('\n  Fondos a procesar:');
    fondos.forEach((fondo, idx) => {
      console.log(`  ${idx + 1}. [${fondo.ID_Fund}] ${fondo.FundShortName} - Geneva: ${fondo.Portfolio_Geneva}`);
    });
    console.log();

    // ====================================
    // PASO 4: Instanciar servicios
    // ====================================
    console.log('⚙️  [PASO 4] Instanciando servicios de tracking...');

    const tracker = new ExecutionTracker(pool);
    const logger = new LoggingService(pool, 'INFO', {
      logToConsole: true,
      bulkBatchSize: 50,
      flushIntervalMs: 5000
    });

    console.log('✓ ExecutionTracker inicializado');
    console.log('✓ LoggingService inicializado (Nivel: INFO, Batch: 50)');
    console.log();

    // ====================================
    // PASO 5: Crear y ejecutar orquestador
    // ====================================
    console.log('🎯 [PASO 5] Creando FundOrchestrator...');

    const orchestrator = new FundOrchestrator(
      idEjecucion,
      fechaReporte,
      fondos,
      pool,
      tracker,
      logger
    );

    console.log('✓ FundOrchestrator creado');
    console.log();

    console.log('📋 [PASO 5.1] Inicializando orquestador...');
    await orchestrator.initialize();
    console.log('✓ Orquestador inicializado (pipeline.config.yaml cargado)');
    console.log();

    console.log('▶️  [PASO 5.2] Ejecutando pipeline...');
    console.log('─────────────────────────────────────────');

    const startTime = Date.now();
    const result = await orchestrator.execute();
    const endTime = Date.now();
    const durationMs = endTime - startTime;

    console.log('─────────────────────────────────────────');
    console.log(`✓ Pipeline completado en ${(durationMs / 1000).toFixed(2)}s`);
    console.log('  Resultado:', result);
    console.log();

    // Flush final de logs
    await logger.flush();
    console.log('✓ Logs flusheados a base de datos');
    console.log();

    // ====================================
    // PASO 6: Verificar resultados
    // ====================================
    console.log('🔍 [PASO 6] Verificando resultados...');
    console.log();

    // 6.1 Estado de ejecución
    console.log('  [6.1] Estado de ejecución:');
    const estadoResult = await pool.request()
      .input('ID_Ejecucion', sql.BigInt, idEjecucion)
      .query(`
        SELECT
          ID_Ejecucion,
          Estado,
          Etapa_Actual,
          FechaInicio,
          FechaFin,
          DATEDIFF(SECOND, FechaInicio, FechaFin) AS DuracionSegundos,
          TotalFondos,
          FondosCompletados,
          FondosConError
        FROM logs.Ejecuciones
        WHERE ID_Ejecucion = @ID_Ejecucion
      `);

    if (estadoResult.recordset.length > 0) {
      const estado = estadoResult.recordset[0];
      console.log('  ─────────────────────────────────────');
      console.log('  ID_Ejecucion:', estado.ID_Ejecucion.toString());
      console.log('  Estado:', estado.Estado);
      console.log('  Etapa Actual:', estado.Etapa_Actual);
      console.log('  Duración:', estado.DuracionSegundos, 'segundos');
      console.log('  Total Fondos:', estado.TotalFondos);
      console.log('  Completados:', estado.FondosCompletados);
      console.log('  Con Error:', estado.FondosConError);
      console.log('  ─────────────────────────────────────');
    }
    console.log();

    // 6.2 Estado de fondos
    console.log('  [6.2] Estado de fondos procesados:');
    const fondosEstadoResult = await pool.request()
      .input('ID_Ejecucion', sql.BigInt, idEjecucion)
      .query(`
        SELECT
          ID_Fund,
          FundShortName,
          Estado_Actual,
          Etapa_Actual,
          DATEDIFF(SECOND, Fecha_Inicio, Fecha_Fin) AS DuracionSegundos
        FROM logs.Ejecucion_Fondos
        WHERE ID_Ejecucion = @ID_Ejecucion
        ORDER BY ID_Fund
      `);

    fondosEstadoResult.recordset.forEach(fondo => {
      const statusIcon = fondo.Estado_Actual === 'COMPLETADO' ? '✓' :
                         fondo.Estado_Actual === 'ERROR' ? '✗' : '⚠';
      console.log(`  ${statusIcon} [${fondo.ID_Fund}] ${fondo.FundShortName}: ${fondo.Estado_Actual} (${fondo.DuracionSegundos || 0}s)`);
    });
    console.log();

    // 6.3 Logs por nivel
    console.log('  [6.3] Logs generados por nivel:');
    const logsResult = await pool.request()
      .input('ID_Ejecucion', sql.BigInt, idEjecucion)
      .query(`
        SELECT
          Nivel,
          COUNT(*) AS Count
        FROM logs.Ejecucion_Logs
        WHERE ID_Ejecucion = @ID_Ejecucion
        GROUP BY Nivel
        ORDER BY
          CASE Nivel
            WHEN 'ERROR' THEN 1
            WHEN 'WARNING' THEN 2
            WHEN 'INFO' THEN 3
            WHEN 'DEBUG' THEN 4
          END
      `);

    logsResult.recordset.forEach(log => {
      const icon = log.Nivel === 'ERROR' ? '❌' :
                   log.Nivel === 'WARNING' ? '⚠️' :
                   log.Nivel === 'INFO' ? 'ℹ️' : '🔍';
      console.log(`  ${icon} ${log.Nivel}: ${log.Count} logs`);
    });
    console.log();

    // 6.4 Errores (si existen)
    console.log('  [6.4] Errores detectados:');
    const errorsResult = await pool.request()
      .input('ID_Ejecucion', sql.BigInt, idEjecucion)
      .query(`
        SELECT TOP 10
          ID_Fund,
          Etapa,
          Mensaje,
          Timestamp
        FROM logs.Ejecucion_Logs
        WHERE ID_Ejecucion = @ID_Ejecucion
          AND Nivel = 'ERROR'
        ORDER BY Timestamp DESC
      `);

    if (errorsResult.recordset.length > 0) {
      console.log(`  ❌ Se encontraron ${errorsResult.recordset.length} errores:`);
      errorsResult.recordset.forEach((err, idx) => {
        console.log(`  ${idx + 1}. [${err.ID_Fund || 'N/A'}] ${err.Etapa}: ${err.Mensaje.substring(0, 80)}...`);
      });
    } else {
      console.log('  ✓ No se encontraron errores');
    }
    console.log();

    // ====================================
    // PASO 7: Resumen final
    // ====================================
    console.log('========================================');
    console.log('📊 RESUMEN DEL TEST');
    console.log('========================================');

    const finalEstado = estadoResult.recordset[0];
    const allCompleted = finalEstado.FondosCompletados === finalEstado.TotalFondos;
    const hasErrors = finalEstado.FondosConError > 0;

    console.log(`Ejecución ID: ${idEjecucion.toString()}`);
    console.log(`Fecha Reporte: ${fechaReporte}`);
    console.log(`Fondos Procesados: ${finalEstado.FondosCompletados}/${finalEstado.TotalFondos}`);
    console.log(`Duración: ${finalEstado.DuracionSegundos}s (${(durationMs / 1000).toFixed(2)}s medido)`);
    console.log(`Estado Final: ${finalEstado.Estado}`);

    if (allCompleted && !hasErrors) {
      console.log('\n✅ TEST EXITOSO - Todos los fondos completados sin errores');
    } else if (hasErrors) {
      console.log(`\n⚠️  TEST PARCIAL - ${finalEstado.FondosConError} fondos con error`);
    } else {
      console.log('\n❌ TEST FALLIDO - No se completaron todos los fondos');
    }

    console.log('========================================\n');

    // Cleanup: destruir logger
    await logger.destroy();

  } catch (error) {
    console.error('\n❌ ERROR EN TEST:');
    console.error('─────────────────────────────────────');
    console.error('Mensaje:', error.message);
    console.error('Stack:', error.stack);
    console.error('─────────────────────────────────────\n');

    // Si tenemos idEjecucion, marcar como error en BD
    if (pool && idEjecucion) {
      try {
        await pool.request()
          .input('ID_Ejecucion', sql.BigInt, idEjecucion)
          .input('Error', sql.NVarChar, error.message)
          .query(`
            UPDATE logs.Ejecuciones
            SET Estado = 'ERROR',
                Etapa_Actual = 'TEST_ERROR',
                FechaFin = GETDATE()
            WHERE ID_Ejecucion = @ID_Ejecucion
          `);
        console.log('✓ Estado de ejecución actualizado a ERROR en base de datos');
      } catch (updateError) {
        console.error('Error al actualizar estado en BD:', updateError.message);
      }
    }

    process.exit(1);

  } finally {
    // Cerrar conexión
    if (pool) {
      await pool.close();
      console.log('✓ Conexión a base de datos cerrada\n');
    }
  }
}

// Ejecutar test
console.log('\n');
testV2Integration().catch(error => {
  console.error('Error fatal:', error);
  process.exit(1);
});
