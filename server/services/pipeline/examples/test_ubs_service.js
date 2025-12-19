/**
 * Ejemplo de Testing Unitario - UBSService
 *
 * Este test ejecuta el procesamiento UBS (independiente de IPA).
 * Solo requiere que existan datos extraídos de UBS para la fecha.
 * Si el fondo es MLCCII, ejecutará también UBS_02 y UBS_03.
 *
 * Uso:
 * ```bash
 * node server/services/pipeline/examples/test_ubs_service.js
 * ```
 */

const { getPool } = require('../../../config/database');
const { ExecutionTracker, LoggingService } = require('../../tracking');
const { UBSService } = require('../index');
const yaml = require('js-yaml');
const fs = require('fs');
const path = require('path');

/**
 * Cargar configuración del pipeline
 */
function loadPipelineConfig() {
  const configPath = path.join(__dirname, '../../../config/pipeline.config.yaml');
  const fileContents = fs.readFileSync(configPath, 'utf8');
  return yaml.load(fileContents);
}

/**
 * Test principal
 */
async function testUBSService() {
  let pool = null;

  try {
    console.log('='.repeat(60));
    console.log('TEST: UBSService - Procesamiento de Fondos Luxemburgo');
    console.log('='.repeat(60));
    console.log('');

    // 1. Conectar a la base de datos
    console.log('1. Conectando a SQL Server...');
    pool = await getPool();
    console.log('   ✅ Conectado');
    console.log('');

    // 2. Cargar configuración
    console.log('2. Cargando configuración del pipeline...');
    const config = loadPipelineConfig();
    const ubsConfig = config.services.find(s => s.id === 'PROCESS_UBS');

    if (!ubsConfig) {
      throw new Error('No se encontró configuración de PROCESS_UBS en pipeline.config.yaml');
    }
    console.log('   ✅ Configuración cargada');
    console.log(`   - UBS: ${ubsConfig.spList.length} SPs`);
    console.log('');

    // 3. Inicializar servicios de tracking
    console.log('3. Inicializando servicios de tracking...');
    const tracker = new ExecutionTracker(pool);
    const logger = new LoggingService(pool, 'INFO', {
      logToConsole: true,
      bulkBatchSize: 10, // Batch pequeño para testing
      flushIntervalMs: 2000,
    });
    console.log('   ✅ Tracker y Logger inicializados');
    console.log('');

    // 4. Crear instancia del servicio
    console.log('4. Creando servicio UBS...');
    const ubsService = new UBSService(ubsConfig, pool, tracker, logger);
    console.log('   ✅ Servicio creado');
    console.log(`   - ${ubsService.getServiceName()} v${ubsService.getVersion()}`);
    console.log('');

    // 5. Preparar datos de prueba
    console.log('5. Preparando datos de prueba...');
    const idEjecucion = BigInt(Date.now()); // ID único para esta ejecución de test
    const fechaReporte = '2025-12-15'; // Fecha con datos disponibles

    // Usar un fondo con datos UBS (MLCCII tiene Es_MLCCII = true)
    const testFund = {
      ID_Fund: 3, // MLCCII - fondo Luxemburgo
      FundShortName: 'MLCCII',
      Portfolio_UBS: 'MLCCII_LUX', // Portfolio con datos UBS
      Es_MLCCII: true, // Ejecutará también UBS_02 y UBS_03
    };

    console.log('   - ID Ejecución:', idEjecucion.toString());
    console.log('   - Fecha Reporte:', fechaReporte);
    console.log('   - Fondo:', testFund.FundShortName);
    console.log('   - Portfolio UBS:', testFund.Portfolio_UBS);
    console.log('   - Es MLCCII:', testFund.Es_MLCCII);
    console.log('');

    // 6. Inicializar ejecución en BD
    console.log('6. Inicializando ejecución en BD...');
    await tracker.initializeExecution(idEjecucion, fechaReporte, [testFund], {
      usuario: 'test_user',
      test: true,
    });
    console.log('   ✅ Ejecución inicializada');
    console.log('');

    const context = {
      idEjecucion,
      fechaReporte,
      fund: testFund,
    };

    // 7. Ejecutar procesamiento UBS
    console.log('7. Ejecutando procesamiento UBS...');
    console.log('   (Este paso puede tardar varios segundos)');
    console.log('');

    const ubsStartTime = Date.now();
    const ubsResult = await ubsService.execute(context);
    const ubsDuration = Date.now() - ubsStartTime;

    console.log('');
    console.log('   ✅ UBS completado');
    console.log(`   - Éxito: ${ubsResult.success}`);
    console.log(`   - Duración: ${(ubsDuration / 1000).toFixed(2)}s`);
    if (ubsResult.skipped) {
      console.log('   - Estado: OMITIDO (condicional no cumplido)');
    }
    console.log('');

    // 8. Obtener métricas UBS
    console.log('8. Obteniendo métricas UBS...');
    const metrics = await ubsService.getUBSMetrics(context);
    console.log('   - Total Registros:', metrics.TotalRegistros);
    console.log('   - Total Instrumentos:', metrics.TotalInstrumentos);
    console.log('   - Total MVal:', metrics.TotalMVal?.toFixed(2) || '0.00');
    console.log('   - Total Portfolios:', metrics.TotalPortfolios);
    console.log('');

    // 9. Verificar logs
    console.log('9. Verificando logs generados...');
    await logger.flush(); // Forzar escritura de logs pendientes

    const logs = await logger.getExecutionLogs(idEjecucion, {}, 30);
    console.log(`    - Total logs: ${logs.length}`);
    console.log('    - Últimos 10 logs:');
    logs.slice(0, 10).forEach(log => {
      console.log(`      [${log.Nivel}] ${log.Etapa}: ${log.Mensaje}`);
    });
    console.log('');

    // 10. Cleanup
    console.log('10. Limpiando tablas temporales...');
    await ubsService.cleanup(context);
    console.log('    ✅ Cleanup completado');
    console.log('');

    // 11. Finalizar ejecución
    console.log('11. Finalizando ejecución...');
    await tracker.markFundCompleted(idEjecucion, testFund.ID_Fund, ubsDuration);
    await tracker.updateExecutionState(idEjecucion, 'COMPLETADO', {
      fondosOK: 1,
      fondosError: 0,
      duracionTotal: ubsDuration,
    });
    console.log('    ✅ Ejecución finalizada');
    console.log('');

    // Resumen final
    console.log('='.repeat(60));
    console.log('RESULTADO: TEST EXITOSO ✅');
    console.log('='.repeat(60));
    console.log('');
    console.log('Resumen de tiempos:');
    console.log(`  - UBS:   ${(ubsDuration / 1000).toFixed(2)}s`);
    console.log('');
    console.log('Próximos pasos:');
    console.log('1. Revisar logs en: logs.Ejecucion_Logs (ID_Ejecucion=' + idEjecucion + ')');
    console.log('2. Revisar estados en: logs.Ejecucion_Fondos (ID_Ejecucion=' + idEjecucion + ')');
    console.log('3. Si hay errores, usar @DebugMode=1 en los SPs para inspeccionar tablas temp');
    console.log('4. Nota: UBS es INDEPENDIENTE de IPA (solo requiere extracción)');
    console.log('');

    // Destruir logger para flush final
    await logger.destroy();

  } catch (error) {
    console.error('');
    console.error('='.repeat(60));
    console.error('ERROR EN TEST ❌');
    console.error('='.repeat(60));
    console.error('');
    console.error('Mensaje:', error.message);
    console.error('Stack:', error.stack);
    console.error('');

    process.exit(1);
  } finally {
    // Cerrar conexión
    if (pool) {
      console.log('Cerrando conexión a SQL Server...');
      await pool.close();
      console.log('✅ Conexión cerrada');
    }
  }
}

// Ejecutar test
if (require.main === module) {
  testUBSService().catch(error => {
    console.error('Error fatal:', error);
    process.exit(1);
  });
}

module.exports = { testUBSService };
