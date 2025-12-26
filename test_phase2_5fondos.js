/**
 * Test Phase 2 - Extracción per-fund con 5 fondos
 * Prueba que la extracción paralela con aislamiento por fondo funcione correctamente
 */

const axios = require('axios');

const API_URL = 'http://localhost:3001';

const TEST_FUNDS = [
  { ID_Fund: 2, FundShortName: 'ALTURAS II', Portfolio_Geneva: 'ALTURAS II', Portfolio_UBS: null },
  { ID_Fund: 8, FundShortName: 'GLORY', Portfolio_Geneva: 'GLORY', Portfolio_UBS: null },
  { ID_Fund: 11, FundShortName: 'MDCH', Portfolio_Geneva: 'MDCHILE', Portfolio_UBS: null },
  { ID_Fund: 12, FundShortName: 'MDELA', Portfolio_Geneva: 'MDELA', Portfolio_UBS: null },
  { ID_Fund: 13, FundShortName: 'MDLAT', Portfolio_Geneva: 'MDLAT', Portfolio_UBS: null }
];

async function testPhase2() {
  console.log('='.repeat(80));
  console.log('PHASE 2 TEST - Per-Fund Extraction with 5 Funds');
  console.log('='.repeat(80));
  console.log('');

  const fechaReporte = '2025-12-19'; // Usar fecha reciente con datos

  console.log(`Fecha de prueba: ${fechaReporte}`);
  console.log(`Fondos a procesar: ${TEST_FUNDS.length}`);
  console.log('');

  TEST_FUNDS.forEach((fund, idx) => {
    console.log(`  ${idx + 1}. ${fund.FundShortName} (ID: ${fund.ID_Fund}, Portfolio: ${fund.Portfolio_Geneva})`);
  });
  console.log('');
  console.log('-'.repeat(80));
  console.log('Iniciando proceso...');
  console.log('-'.repeat(80));
  console.log('');

  try {
    const startTime = Date.now();

    // Crear proceso
    const response = await axios.post(`${API_URL}/api/procesos/v2/ejecutar`, {
      fechaReporte,
      fondos: TEST_FUNDS.map(f => f.ID_Fund),
      descripcion: 'TEST Phase 2 - 5 fondos con extracción per-fund'
    });

    const { idProceso, ejecuciones } = response.data;

    console.log(`✓ Proceso creado: ID_Proceso = ${idProceso}`);
    console.log(`✓ Ejecuciones creadas: ${ejecuciones.length}`);
    console.log('');

    // Esperar a que termine
    console.log('Esperando finalización del proceso...');
    let isRunning = true;
    let lastStatus = null;

    while (isRunning) {
      await new Promise(resolve => setTimeout(resolve, 3000)); // Poll cada 3s

      const statusResponse = await axios.get(`${API_URL}/api/procesos/v2/${idProceso}/estado`);
      const status = statusResponse.data;

      if (status.estado !== lastStatus?.estado) {
        console.log(`  Estado: ${status.estado} (${status.fondosCompletados}/${status.totalFondos} fondos)`);
        lastStatus = status;
      }

      if (status.estado === 'COMPLETADO' || status.estado === 'COMPLETADO_CON_ERRORES' || status.estado === 'ERROR') {
        isRunning = false;
      }
    }

    const duration = Date.now() - startTime;
    console.log('');
    console.log('='.repeat(80));
    console.log('RESULTADOS DEL TEST');
    console.log('='.repeat(80));
    console.log('');
    console.log(`Estado final: ${lastStatus.estado}`);
    console.log(`Tiempo total: ${(duration / 1000).toFixed(2)}s`);
    console.log(`Fondos completados: ${lastStatus.fondosCompletados}/${lastStatus.totalFondos}`);
    console.log(`Fondos con errores: ${lastStatus.fondosConErrores}`);
    console.log('');

    // Obtener detalles de cada fondo
    console.log('-'.repeat(80));
    console.log('DETALLE POR FONDO:');
    console.log('-'.repeat(80));
    console.log('');

    for (const ejecucion of ejecuciones) {
      const detailResponse = await axios.get(`${API_URL}/api/procesos/v2/${idProceso}/fondos/${ejecucion.ID_Fund}`);
      const detail = detailResponse.data;

      console.log(`Fondo: ${detail.FundShortName} (ID: ${detail.ID_Fund})`);
      console.log(`  ID_Ejecucion: ${detail.ID_Ejecucion}`);
      console.log(`  Estado: ${detail.Estado_General || 'PENDIENTE'}`);
      console.log(`  Extracción: ${detail.Estado_Extraccion || 'PENDIENTE'}`);

      if (detail.Errores && detail.Errores.length > 0) {
        console.log(`  ⚠️  Errores: ${detail.Errores.length}`);
        detail.Errores.forEach((err, idx) => {
          console.log(`    ${idx + 1}. ${err.Mensaje}`);
        });
      }
      console.log('');
    }

    // Verificar que no haya errores de lock contention
    console.log('-'.repeat(80));
    console.log('VERIFICACIÓN DE LOCK CONTENTION:');
    console.log('-'.repeat(80));
    console.log('');

    const logs = await axios.get(`${API_URL}/api/procesos/v2/${idProceso}/logs`);
    const lockErrors = logs.data.filter(log =>
      log.Mensaje && (
        log.Mensaje.includes('timeout') ||
        log.Mensaje.includes('lock') ||
        log.Mensaje.includes('deadlock')
      )
    );

    if (lockErrors.length === 0) {
      console.log('✅ No se detectaron errores de lock contention');
      console.log('✅ Phase 2 funcionando correctamente - Aislamiento per-fund exitoso');
    } else {
      console.log(`⚠️  Se detectaron ${lockErrors.length} posibles errores de lock:`);
      lockErrors.forEach((err, idx) => {
        console.log(`  ${idx + 1}. ${err.Mensaje}`);
      });
    }
    console.log('');

    // Verificar datos en extract.IPA con ID_Fund
    console.log('-'.repeat(80));
    console.log('VERIFICACIÓN DE DATOS EN EXTRACT.IPA:');
    console.log('-'.repeat(80));
    console.log('');

    // Este query lo haré desde SQL para verificar
    console.log('Ejecutar manualmente desde SQL:');
    console.log(`
SELECT
    ID_Fund,
    Portfolio,
    COUNT(*) AS Registros
FROM extract.IPA
WHERE FechaReporte = '${fechaReporte}'
    AND ID_Fund IN (${TEST_FUNDS.map(f => f.ID_Fund).join(', ')})
GROUP BY ID_Fund, Portfolio
ORDER BY ID_Fund
    `);
    console.log('');

    console.log('='.repeat(80));
    console.log('TEST COMPLETADO');
    console.log('='.repeat(80));

    process.exit(lastStatus.fondosConErrores > 0 ? 1 : 0);

  } catch (error) {
    console.error('');
    console.error('='.repeat(80));
    console.error('ERROR EN TEST');
    console.error('='.repeat(80));
    console.error('');
    console.error('Mensaje:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
    }
    console.error('');
    process.exit(1);
  }
}

// Ejecutar test
testPhase2();
