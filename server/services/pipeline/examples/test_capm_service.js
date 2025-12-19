/**
 * Ejemplo de Testing Unitario - CAPMService
 *
 * Este test ejecuta IPA primero (prerequisito) y luego CAPM.
 * Usa tablas staging físicas (no temporales) por lo que los datos persisten
 * entre servicios incluso si usan conexiones diferentes.
 *
 * Uso:
 * ```bash
 * node server/services/pipeline/examples/test_capm_service.js
 * ```
 */

const { getPool } = require('../../../config/database');
const { ExecutionTracker, LoggingService } = require('../../tracking');
const { IPAService, CAPMService } = require('../index');
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
async function testCAPMService() {
  let pool = null;

  try {
    console.log('='.repeat(60));
    console.log('TEST: CAPMService - Procesamiento de 1 Fondo');
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
    const capmConfig = config.services.find(s => s.id === 'PROCESS_CAPM');

    if (!ipaConfig) {
      throw new Error('No se encontró configuración de PROCESS_IPA en pipeline.config.yaml');
    }
    if (!capmConfig) {
      throw new Error('No se encontró configuración de PROCESS_CAPM en pipeline.config.yaml');
    }
    console.log('   ✅ Configuración cargada');
    console.log(`   - IPA: ${ipaConfig.spList.length} SPs`);
    console.log(`   - CAPM: ${capmConfig.spList.length} SPs`);
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

    // 4. Crear instancias de servicios
    console.log('4. Creando servicios...');
    const ipaService = new IPAService(ipaConfig, pool, tracker, logger);
    const capmService = new CAPMService(capmConfig, pool, tracker, logger);
    console.log('   ✅ Servicios creados');
    console.log(`   - IPAService: ${ipaService.getServiceName()} v${ipaService.getVersion()}`);
    console.log(`   - CAPMService: ${capmService.getServiceName()} v${capmService.getVersion()}`);
    console.log('');

    // 5. Preparar datos de prueba
    console.log('5. Preparando datos de prueba...');
    const idEjecucion = BigInt(Date.now()); // ID único para esta ejecución de test
    const fechaReporte = '2025-12-15'; // Fecha con datos disponibles
    const testFund = {
      ID_Fund: 2, // ALTURAS II
      FundShortName: 'ALTURAS II',
      Portfolio_Geneva: 'ALTURAS II', // Portfolio con datos IPA y CAPM
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

    const context = {
      idEjecucion,
      fechaReporte,
      fund: testFund,
    };

    // 7. Ejecutar procesamiento IPA (pre-requisito de CAPM)
    console.log('7. Ejecutando procesamiento IPA (pre-requisito)...');
    console.log('   (Este paso puede tardar varios segundos)');
    console.log('');

    let ipaStartTime = Date.now();
    const ipaResult = await ipaService.execute(context);
    const ipaDuration = Date.now() - ipaStartTime;

    console.log('');
    console.log('   ✅ IPA completado');
    console.log(`   - Éxito: ${ipaResult.success}`);
    console.log(`   - Duración: ${(ipaDuration / 1000).toFixed(2)}s`);
    console.log('');

    if (!ipaResult.success) {
      throw new Error('IPA falló - no se puede continuar con CAPM');
    }

    // 8. Ejecutar procesamiento CAPM
    console.log('8. Ejecutando procesamiento CAPM...');
    console.log('   (Este paso puede tardar varios segundos)');
    console.log('');

    const capmStartTime = Date.now();
    const capmResult = await capmService.execute(context);
    const capmDuration = Date.now() - capmStartTime;

    console.log('');
    console.log('   ✅ CAPM completado');
    console.log(`   - Éxito: ${capmResult.success}`);
    console.log(`   - Duración: ${(capmDuration / 1000).toFixed(2)}s`);
    if (capmResult.skipped) {
      console.log('   - Estado: OMITIDO (condicional no cumplido)');
    }
    console.log('');

    // 9. Obtener métricas CAPM
    console.log('9. Obteniendo métricas CAPM...');
    const metrics = await capmService.getCAPMMetrics(context);
    console.log('   - Total Registros WorkTable:', metrics.TotalRegistrosWorkTable);
    console.log('   - Total Registros Ajuste:', metrics.TotalRegistrosAjuste);
    console.log('   - Total MVal:', metrics.TotalMVal?.toFixed(2) || '0.00');
    console.log('');

    // 10. Verificar logs
    console.log('10. Verificando logs generados...');
    await logger.flush(); // Forzar escritura de logs pendientes

    const logs = await logger.getExecutionLogs(idEjecucion, {}, 30);
    console.log(`    - Total logs: ${logs.length}`);
    console.log('    - Últimos 10 logs:');
    logs.slice(0, 10).forEach(log => {
      console.log(`      [${log.Nivel}] ${log.Etapa}: ${log.Mensaje}`);
    });
    console.log('');

    // 11. Cleanup
    console.log('11. Limpiando tablas temporales...');
    await ipaService.cleanup(context);
    await capmService.cleanup(context);
    console.log('    ✅ Cleanup completado');
    console.log('');

    // 12. Finalizar ejecución
    console.log('12. Finalizando ejecución...');
    const totalDuration = ipaDuration + capmDuration;
    await tracker.markFundCompleted(idEjecucion, testFund.ID_Fund, totalDuration);
    await tracker.updateExecutionState(idEjecucion, 'COMPLETADO', {
      fondosOK: 1,
      fondosError: 0,
      duracionTotal: totalDuration,
    });
    console.log('    ✅ Ejecución finalizada');
    console.log('');

    // Resumen final
    console.log('='.repeat(60));
    console.log('RESULTADO: TEST EXITOSO ✅');
    console.log('='.repeat(60));
    console.log('');
    console.log('Resumen de tiempos:');
    console.log(`  - IPA:   ${(ipaDuration / 1000).toFixed(2)}s`);
    console.log(`  - CAPM:  ${(capmDuration / 1000).toFixed(2)}s`);
    console.log(`  - TOTAL: ${(totalDuration / 1000).toFixed(2)}s`);
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
  testCAPMService().catch(error => {
    console.error('Error fatal:', error);
    process.exit(1);
  });
}

module.exports = { testCAPMService };
