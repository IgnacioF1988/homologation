/**
 * Test E2E del Pipeline - Ejecuta pipeline completo para un fondo
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
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000
  }
};

async function runE2ETest() {
  const fechaReporte = process.argv[2] || '2025-12-26';
  const fundName = process.argv[3] || 'MRCLP';

  console.log('='.repeat(60));
  console.log('TEST E2E - PIPELINE ETL REFACTORIZADO');
  console.log('='.repeat(60));
  console.log(`Fecha: ${fechaReporte}`);
  console.log(`Fondo: ${fundName}`);
  console.log('='.repeat(60));

  let pool;
  let orchestrator;

  try {
    // 1. Conectar
    console.log('\n[1] Conectando a SQL Server...');
    pool = await sql.connect(config);
    console.log('    ✓ Conexión establecida');

    // 2. Buscar fondo
    console.log('\n[2] Buscando fondo...');
    const fondoResult = await pool.request()
      .input('fundName', sql.VarChar(50), fundName)
      .query(`
        SELECT DISTINCT
               f.ID_Fund, f.FundShortName, f.FundName, f.Flag_Derivados, f.Flag_UBS,
               h.Portfolio AS Portfolio_Geneva
        FROM dimensionales.BD_Funds f
        LEFT JOIN dimensionales.HOMOL_Funds h ON f.ID_Fund = h.ID_Fund AND h.Source = 'GENEVA'
        WHERE f.FundShortName = @fundName OR f.NombreTupungato = @fundName
      `);

    if (fondoResult.recordset.length === 0) {
      throw new Error(`Fondo "${fundName}" no encontrado`);
    }

    const fondo = fondoResult.recordset[0];
    console.log(`    ✓ Fondo: ${fondo.FundShortName} (ID=${fondo.ID_Fund})`);
    console.log(`    ✓ Portfolio: ${fondo.Portfolio_Geneva}`);
    console.log(`    ✓ Flag_Derivados: ${fondo.Flag_Derivados}, Flag_UBS: ${fondo.Flag_UBS}`);

    // 3. Inicializar TrackingService
    console.log('\n[3] Inicializando servicios...');
    const { getInstance: getTrackingService } = require('./services/tracking');
    const trackingService = getTrackingService(pool);
    console.log('    ✓ TrackingService inicializado');

    const pipelineEvents = require('./services/events/PipelineEventEmitter');
    console.log('    ✓ PipelineEventEmitter cargado');

    // 4. Crear proceso
    console.log('\n[4] Creando proceso...');
    const idProceso = await trackingService.initializeProceso(fechaReporte, 1, 'TEST_E2E');
    console.log(`    ✓ Proceso creado: ID_Proceso = ${idProceso}`);

    // 5. Crear ejecución
    console.log('\n[5] Creando ejecución para fondo...');
    const portfolio = fondo.Portfolio_Geneva;
    const idEjecucion = await trackingService.initializeEjecucion(
      idProceso,
      fondo.ID_Fund,
      fondo.FundShortName,
      {
        geneva: portfolio,
        capm: portfolio,
        derivados: portfolio,
        ubs: portfolio
      }
    );
    console.log(`    ✓ Ejecución creada: ID_Ejecucion = ${idEjecucion}`);

    // 6. Cargar FundOrchestrator
    console.log('\n[6] Inicializando FundOrchestrator...');
    const FundOrchestrator = require('./services/orchestration/FundOrchestrator');

    const fondoCompleto = {
      ID_Fund: fondo.ID_Fund,
      FundShortName: fondo.FundShortName,
      Portfolio_Geneva: portfolio,
      Portfolio_CAPM: portfolio,  // Usa el mismo portfolio
      Portfolio_Derivados: portfolio,
      Portfolio_UBS: portfolio,
      Flag_Derivados: fondo.Flag_Derivados ? 1 : 0,
      Flag_UBS: fondo.Flag_UBS ? 1 : 0
    };

    orchestrator = new FundOrchestrator(
      idEjecucion,
      idProceso,
      fechaReporte,
      [fondoCompleto],
      pool
    );
    console.log('    ✓ FundOrchestrator creado');

    // 7. Inicializar orchestrator
    console.log('\n[7] Inicializando pipeline...');
    await orchestrator.initialize();
    console.log('    ✓ Pipeline inicializado');
    console.log(`    ✓ Plan de ejecución: ${orchestrator.executionPlan.length} fases`);

    // 8. Ejecutar pipeline
    console.log('\n[8] Ejecutando pipeline...');
    console.log('    (esto puede tomar varios minutos)');
    const startTime = Date.now();

    const result = await orchestrator.execute();

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n    ✓ Pipeline completado en ${duration}s`);
    console.log(`    ✓ Resultado: ${result.success ? 'OK' : 'ERROR'}`);

    // 9. Finalizar ejecución (ANTES de cerrar orchestrator)
    console.log('\n[9] Finalizando ejecución...');
    await trackingService.finalizarEjecucion(idEjecucion, result.success ? 'OK' : 'ERROR');
    console.log('    ✓ Ejecución finalizada');

    // 10. Finalizar proceso
    console.log('\n[10] Finalizando proceso...');
    await trackingService.finalizarProceso(idProceso);
    console.log('    ✓ Proceso finalizado');

    // 11. Verificar estado final
    console.log('\n[11] Verificando estado final...');
    const estadoProceso = await trackingService.getEstadoProceso(idProceso);
    const estadoEjecucion = await trackingService.getEstadoEjecucion(idEjecucion);

    console.log(`    Proceso: ${estadoProceso.Estado}`);
    console.log(`    Ejecución: ${estadoEjecucion.Estado_Final}`);
    console.log(`    Estado_IPA: ${estadoEjecucion.Estado_IPA}`);
    console.log(`    Estado_CAPM: ${estadoEjecucion.Estado_CAPM}`);
    console.log(`    Estado_Derivados: ${estadoEjecucion.Estado_Derivados}`);
    console.log(`    Estado_PNL: ${estadoEjecucion.Estado_PNL}`);

    // 13. Verificar eventos registrados
    const eventos = await trackingService.getEventosDetallados(idEjecucion);
    console.log(`\n[12] Eventos registrados: ${eventos.length}`);
    if (eventos.length > 0) {
      eventos.forEach(e => {
        console.log(`    [${e.Nivel}] ${e.Servicio}: ${e.Mensaje.substring(0, 50)}...`);
      });
    }

    // Resumen
    console.log('\n' + '='.repeat(60));
    if (result.success) {
      console.log('RESULTADO: ✓ TEST E2E EXITOSO');
    } else {
      console.log('RESULTADO: ✗ TEST E2E CON ERRORES');
    }
    console.log('='.repeat(60));
    console.log(`ID_Proceso: ${idProceso}`);
    console.log(`ID_Ejecucion: ${idEjecucion}`);
    console.log(`Duración total: ${duration}s`);

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    // Cerrar orchestrator primero (si existe)
    if (typeof orchestrator !== 'undefined' && orchestrator) {
      try { await orchestrator.close(); } catch (_e) {}
    }
    if (pool) {
      await pool.close();
    }
  }
}

runE2ETest();
