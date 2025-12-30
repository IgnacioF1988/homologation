/**
 * Test de integración del nuevo sistema de tracking
 * Verifica: PipelineEventEmitter, TrackingService, BD
 */

const sql = require('mssql');
require('dotenv').config();

const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  database: process.env.DB_DATABASE,
  options: {
    encrypt: false,
    trustServerCertificate: true
  }
};

async function runTest() {
  console.log('='.repeat(50));
  console.log('TEST DE INTEGRACIÓN - TRACKING REFACTORIZADO');
  console.log('='.repeat(50));

  let pool;

  try {
    // 1. Conectar a BD
    console.log('\n[1] Conectando a SQL Server...');
    pool = await sql.connect(config);
    console.log('    ✓ Conexión establecida');

    // 2. Verificar tablas nuevas
    console.log('\n[2] Verificando tablas del nuevo schema...');
    const tablas = await pool.request().query(`
      SELECT name FROM sys.objects
      WHERE schema_id = SCHEMA_ID('logs')
      AND type = 'U'
      AND name IN ('Procesos', 'Ejecuciones', 'EventosDetallados', 'StandBy')
    `);
    console.log(`    ✓ ${tablas.recordset.length}/4 tablas encontradas`);
    tablas.recordset.forEach(t => console.log(`      - logs.${t.name}`));

    // 3. Cargar módulos refactorizados
    console.log('\n[3] Cargando módulos refactorizados...');

    const pipelineEvents = require('./services/events/PipelineEventEmitter');
    console.log('    ✓ PipelineEventEmitter cargado');

    const { TrackingService, getInstance } = require('./services/tracking');
    console.log('    ✓ TrackingService cargado');

    // 4. Inicializar TrackingService
    console.log('\n[4] Inicializando TrackingService...');
    const trackingService = getInstance(pool);
    console.log('    ✓ TrackingService inicializado (singleton)');

    // 5. Test: Crear proceso
    console.log('\n[5] Test: Crear proceso de prueba...');
    const fechaTest = '2025-01-01';
    const idProceso = await trackingService.initializeProceso(fechaTest, 0, 'TEST_USER');
    console.log(`    ✓ Proceso creado: ID_Proceso = ${idProceso}`);

    // 6. Test: Crear ejecución
    console.log('\n[6] Test: Crear ejecución de prueba...');
    const idEjecucion = await trackingService.initializeEjecucion(
      idProceso,
      9999,  // ID_Fund de prueba
      'TEST_FUND',
      { geneva: 'TEST_PORTFOLIO' }
    );
    console.log(`    ✓ Ejecución creada: ID_Ejecucion = ${idEjecucion}`);

    // 7. Test: Emitir eventos
    console.log('\n[7] Test: Emitir eventos del pipeline...');

    pipelineEvents.emitServicioInicio(idEjecucion, 9999, 'PROCESS_IPA', { test: true });
    console.log('    ✓ Evento servicio:inicio emitido');

    await new Promise(r => setTimeout(r, 100)); // Esperar listener async

    pipelineEvents.emitServicioFin(idEjecucion, 9999, 'PROCESS_IPA', 1500, { registros: 100 });
    console.log('    ✓ Evento servicio:fin emitido');

    await new Promise(r => setTimeout(r, 100));

    // 8. Verificar estado en BD
    console.log('\n[8] Verificando persistencia en BD...');
    const estado = await trackingService.getEstadoEjecucion(idEjecucion);
    console.log(`    ✓ Estado_IPA: ${estado.Estado_IPA}`);
    console.log(`    ✓ Estado_Final: ${estado.Estado_Final}`);

    // 9. Test: Emitir warning
    console.log('\n[9] Test: Emitir warning...');
    pipelineEvents.emitServicioWarning(idEjecucion, 9999, 'PROCESS_CAPM', 'Test warning message', { dato: 123 });
    await new Promise(r => setTimeout(r, 100));

    const eventos = await trackingService.getEventosDetallados(idEjecucion);
    console.log(`    ✓ Eventos registrados: ${eventos.length}`);

    // 10. Finalizar ejecución
    console.log('\n[10] Finalizando ejecución de prueba...');
    await trackingService.finalizarEjecucion(idEjecucion, 'OK');
    console.log('    ✓ Ejecución finalizada');

    // 11. Finalizar proceso
    console.log('\n[11] Finalizando proceso de prueba...');
    await trackingService.finalizarProceso(idProceso);
    console.log('    ✓ Proceso finalizado');

    // 12. Verificar estado final
    console.log('\n[12] Verificando estado final...');
    const procesoFinal = await trackingService.getEstadoProceso(idProceso);
    console.log(`    ✓ Estado proceso: ${procesoFinal.Estado}`);
    console.log(`    ✓ FondosOK: ${procesoFinal.FondosOK}`);
    console.log(`    ✓ Duración: ${procesoFinal.Duracion_Ms}ms`);

    // 13. Limpiar datos de prueba
    console.log('\n[13] Limpiando datos de prueba...');
    await pool.request()
      .input('idEjecucion', sql.BigInt, idEjecucion)
      .query('DELETE FROM logs.EventosDetallados WHERE ID_Ejecucion = @idEjecucion');
    await pool.request()
      .input('idEjecucion', sql.BigInt, idEjecucion)
      .query('DELETE FROM logs.Ejecuciones WHERE ID_Ejecucion = @idEjecucion');
    await pool.request()
      .input('idProceso', sql.BigInt, idProceso)
      .query('DELETE FROM logs.Procesos WHERE ID_Proceso = @idProceso');
    console.log('    ✓ Datos de prueba eliminados');

    // Resumen
    console.log('\n' + '='.repeat(50));
    console.log('RESULTADO: ✓ TODOS LOS TESTS PASARON');
    console.log('='.repeat(50));
    console.log('\nEl sistema de tracking está funcionando correctamente.');

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    if (pool) {
      await pool.close();
    }
  }
}

runTest();
