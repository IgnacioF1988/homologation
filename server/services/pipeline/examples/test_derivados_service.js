/**
 * Ejemplo de Testing Unitario - DerivadosService
 *
 * Este test ejecuta IPA primero (prerequisito) y luego Derivados.
 * Usa tablas staging físicas (no temporales) por lo que los datos persisten
 * entre servicios incluso si usan conexiones diferentes.
 *
 * Uso:
 * ```bash
 * node server/services/pipeline/examples/test_derivados_service.js
 * ```
 */

const { getPool } = require('../../../config/database');
const { ExecutionTracker, LoggingService } = require('../../tracking');
const { IPAService, DerivadosService } = require('../index');
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
async function testDerivadosService() {
  let pool = null;

  try {
    console.log('='.repeat(60));
    console.log('TEST: DerivadosService - Procesamiento de 1 Fondo');
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
    const derivadosConfig = config.services.find(s => s.id === 'PROCESS_DERIVADOS');

    if (!ipaConfig) {
      throw new Error('No se encontró configuración de PROCESS_IPA en pipeline.config.yaml');
    }
    if (!derivadosConfig) {
      throw new Error('No se encontró configuración de PROCESS_DERIVADOS en pipeline.config.yaml');
    }
    console.log('   ✅ Configuración cargada');
    console.log(`   - IPA: ${ipaConfig.spList.length} SPs`);
    console.log(`   - Derivados: ${derivadosConfig.spList.length} SPs`);
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
    const derivadosService = new DerivadosService(derivadosConfig, pool, tracker, logger);
    console.log('   ✅ Servicios creados');
    console.log(`   - IPAService: ${ipaService.getServiceName()} v${ipaService.getVersion()}`);
    console.log(`   - DerivadosService: ${derivadosService.getServiceName()} v${derivadosService.getVersion()}`);
    console.log('');

    // 5. Preparar datos de prueba
    console.log('5. Preparando datos de prueba...');
    const idEjecucion = BigInt(Date.now()); // ID único para esta ejecución de test
    const fechaReporte = '2025-12-15'; // Fecha con datos disponibles

    // Usar un fondo que tenga derivados
    const testFund = {
      ID_Fund: 1, // MLAT (tiene derivados)
      FundShortName: 'MLAT',
      Portfolio_Geneva: 'MLAT',
      Portfolio_Derivados: 'MLAT', // Portfolio con datos Derivados
      Requiere_Derivados: true,
    };

    console.log('   - ID Ejecución:', idEjecucion.toString());
    console.log('   - Fecha Reporte:', fechaReporte);
    console.log('   - Fondo:', testFund.FundShortName);
    console.log('   - Portfolio Geneva:', testFund.Portfolio_Geneva);
    console.log('   - Portfolio Derivados:', testFund.Portfolio_Derivados);
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

    // 7. Ejecutar procesamiento IPA (pre-requisito de Derivados)
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
      throw new Error('IPA falló - no se puede continuar con Derivados');
    }

    // 8. Ejecutar procesamiento Derivados
    console.log('8. Ejecutando procesamiento Derivados...');
    console.log('   (Este paso puede tardar varios segundos)');
    console.log('');

    const derivadosStartTime = Date.now();
    const derivadosResult = await derivadosService.execute(context);
    const derivadosDuration = Date.now() - derivadosStartTime;

    console.log('');
    console.log('   ✅ Derivados completado');
    console.log(`   - Éxito: ${derivadosResult.success}`);
    console.log(`   - Duración: ${(derivadosDuration / 1000).toFixed(2)}s`);
    if (derivadosResult.skipped) {
      console.log('   - Estado: OMITIDO (condicional no cumplido)');
    }
    console.log('');

    // 9. Obtener métricas Derivados
    console.log('9. Obteniendo métricas Derivados...');
    const metrics = await derivadosService.getDerivadosMetrics(context);
    console.log('   - Total Registros:', metrics.TotalRegistros);
    console.log('   - Total Instrumentos:', metrics.TotalInstrumentos);
    console.log('   - Total MVal:', metrics.TotalMVal?.toFixed(2) || '0.00');
    console.log('   - Posiciones Largas:', metrics.PosicionesLargas);
    console.log('   - Posiciones Cortas:', metrics.PosicionesCortas);
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
    await derivadosService.cleanup(context);
    console.log('    ✅ Cleanup completado');
    console.log('');

    // 12. Finalizar ejecución
    console.log('12. Finalizando ejecución...');
    const totalDuration = ipaDuration + derivadosDuration;
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
    console.log(`  - IPA:        ${(ipaDuration / 1000).toFixed(2)}s`);
    console.log(`  - Derivados:  ${(derivadosDuration / 1000).toFixed(2)}s`);
    console.log(`  - TOTAL:      ${(totalDuration / 1000).toFixed(2)}s`);
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
  testDerivadosService().catch(error => {
    console.error('Error fatal:', error);
    process.exit(1);
  });
}

module.exports = { testDerivadosService };
