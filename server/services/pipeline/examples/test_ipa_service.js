/**
 * Ejemplo de Testing Unitario - IPAService
 *
 * Este script muestra cómo usar IPAService para procesar un fondo individual.
 *
 * IMPORTANTE: Este es un ejemplo de testing manual. En producción, el
 * PipelineOrchestrator se encargará de crear y ejecutar los servicios.
 *
 * Uso:
 * ```bash
 * node server/services/pipeline/examples/test_ipa_service.js
 * ```
 */

const { getPool } = require('../../../config/database');
const { ExecutionTracker, LoggingService } = require('../../tracking');
const { IPAService } = require('../index');
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
async function testIPAService() {
  let pool = null;

  try {
    console.log('='.repeat(60));
    console.log('TEST: IPAService - Procesamiento de 1 Fondo');
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
    const ipaConfig = config.services.find(s => s.id === 'PROCESS_IPA');

    if (!ipaConfig) {
      throw new Error('No se encontró configuración de PROCESS_IPA en pipeline.config.yaml');
    }
    console.log('   ✅ Configuración cargada');
    console.log(`   - Servicios: ${ipaConfig.spList.length} SPs`);
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

    // 4. Crear instancia de IPAService
    console.log('4. Creando IPAService...');
    const ipaService = new IPAService(ipaConfig, pool, tracker, logger);
    console.log('   ✅ IPAService creado');
    console.log(`   - Nombre: ${ipaService.getServiceName()}`);
    console.log(`   - Versión: ${ipaService.getVersion()}`);
    console.log('');

    // 5. Preparar datos de prueba
    console.log('5. Preparando datos de prueba...');
    const idEjecucion = BigInt(Date.now()); // ID único para esta ejecución de test
    const fechaReporte = '2025-12-15'; // Fecha con datos disponibles
    const testFund = {
      ID_Fund: 2, // ALTURAS II
      FundShortName: 'ALTURAS II',
      Portfolio_Geneva: 'ALTURAS II', // Portfolio real con 46 registros IPA
    };

    console.log('   - ID Ejecución:', idEjecucion.toString());
    console.log('   - Fecha Reporte:', fechaReporte);
    console.log('   - Fondo:', testFund.FundShortName);
    console.log('   - Portfolio:', testFund.Portfolio_Geneva);
    console.log('');

    // 6. Inicializar ejecución en BD
    console.log('6. Inicializando ejecución en BD...');
    await tracker.initializeExecution(idEjecucion, fechaReporte, [testFund], {
      usuario: 'test_user',
      test: true,
    });
    console.log('   ✅ Ejecución inicializada');
    console.log('');

    // 7. Ejecutar procesamiento IPA
    console.log('7. Ejecutando procesamiento IPA...');
    console.log('   (Este paso puede tardar varios segundos)');
    console.log('');

    const context = {
      idEjecucion,
      fechaReporte,
      fund: testFund,
    };

    const startTime = Date.now();
    const result = await ipaService.execute(context);
    const duration = Date.now() - startTime;

    console.log('');
    console.log('   ✅ Procesamiento completado');
    console.log(`   - Éxito: ${result.success}`);
    console.log(`   - Duración: ${(duration / 1000).toFixed(2)}s`);
    if (result.skipped) {
      console.log('   - Estado: OMITIDO (condicional no cumplido)');
    }
    console.log('');

    // 8. Obtener métricas
    console.log('8. Obteniendo métricas IPA...');
    const metrics = await ipaService.getIPAMetrics(context);
    console.log('   - Total Registros:', metrics.TotalRegistros);
    console.log('   - Total Instrumentos:', metrics.TotalInstrumentos);
    console.log('   - Total MVal:', metrics.TotalMVal?.toFixed(2) || '0.00');
    console.log('   - Assets:', metrics.TotalAssets);
    console.log('   - Liabilities:', metrics.TotalLiabilities);
    console.log('');

    // 9. Verificar logs
    console.log('9. Verificando logs generados...');
    await logger.flush(); // Forzar escritura de logs pendientes

    const logs = await logger.getExecutionLogs(idEjecucion, {}, 20);
    console.log(`   - Total logs: ${logs.length}`);
    console.log('   - Últimos 5 logs:');
    logs.slice(0, 5).forEach(log => {
      console.log(`     [${log.Nivel}] ${log.Etapa}: ${log.Mensaje}`);
    });
    console.log('');

    // 10. Cleanup
    console.log('10. Limpiando tablas temporales...');
    await ipaService.cleanup(context);
    console.log('    ✅ Cleanup completado');
    console.log('');

    // 11. Finalizar ejecución
    console.log('11. Finalizando ejecución...');
    await tracker.markFundCompleted(idEjecucion, testFund.ID_Fund, duration);
    await tracker.updateExecutionState(idEjecucion, 'COMPLETADO', {
      fondosOK: 1,
      fondosError: 0,
      duracionTotal: duration,
    });
    console.log('    ✅ Ejecución finalizada');
    console.log('');

    // Resumen final
    console.log('='.repeat(60));
    console.log('RESULTADO: TEST EXITOSO ✅');
    console.log('='.repeat(60));
    console.log('');
    console.log('Próximos pasos:');
    console.log('1. Revisar logs en: logs.Ejecucion_Logs (ID_Ejecucion=' + idEjecucion + ')');
    console.log('2. Revisar estados en: logs.Ejecucion_Fondos (ID_Ejecucion=' + idEjecucion + ')');
    console.log('3. Si hay errores, usar @DebugMode=1 en los SPs para inspeccionar tablas temp');
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
  testIPAService().catch(error => {
    console.error('Error fatal:', error);
    process.exit(1);
  });
}

module.exports = { testIPAService };
