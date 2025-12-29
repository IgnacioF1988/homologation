/**
 * Test Phase 2 - Extracción per-fund con 40 fondos (todos los fondos activos)
 * Prueba la extracción paralela con aislamiento por fondo a escala completa
 */

const http = require('http');

const API_HOST = 'localhost';
const API_PORT = 3001;

// 40 fondos activos
const TEST_FUNDS = [2, 8, 11, 12, 13, 14, 15, 16, 17, 19, 20, 23, 25, 26, 28, 31, 33, 34, 35, 36, 37, 38, 39, 40, 42, 43, 44, 45, 47, 48, 50, 51, 52, 53, 57, 58, 59, 62, 64, 65];

function httpRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: API_HOST,
      port: API_PORT,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          resolve(body);
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testPhase2_50Fondos() {
  console.log('='.repeat(80));
  console.log('PHASE 2 TEST - Per-Fund Extraction with 40 Funds (Full Scale)');
  console.log('='.repeat(80));
  console.log('');

  const fechaReporte = '2025-12-19';

  console.log(`Fecha de prueba: ${fechaReporte}`);
  console.log(`Fondos a procesar: ${TEST_FUNDS.length}`);
  console.log('');
  console.log('-'.repeat(80));
  console.log('Iniciando proceso...');
  console.log('-'.repeat(80));
  console.log('');

  try {
    const startTime = Date.now();

    // Crear proceso
    const response = await httpRequest('POST', '/api/procesos/v2/ejecutar', {
      fechaReporte,
      fondos: TEST_FUNDS,
      descripcion: 'TEST Phase 2 - 40 fondos con extracción per-fund (full scale)'
    });

    const { idProceso, ejecuciones } = response;

    console.log(`✓ Proceso creado: ID_Proceso = ${idProceso}`);
    console.log(`✓ Ejecuciones creadas: ${ejecuciones.length}`);
    console.log('');

    // Esperar a que termine
    console.log('Esperando finalización del proceso...');
    let isRunning = true;
    let lastStatus = null;
    let pollCount = 0;

    while (isRunning && pollCount < 120) { // Max 6 minutos
      await sleep(3000); // Poll cada 3s
      pollCount++;

      try {
        const status = await httpRequest('GET', `/api/procesos/v2/${idProceso}/estado`);

        if (status.estado !== lastStatus?.estado || pollCount % 10 === 0) {
          console.log(`  [${pollCount * 3}s] Estado: ${status.estado} (${status.fondosCompletados}/${status.totalFondos} fondos completados, ${status.fondosConErrores} errores)`);
          lastStatus = status;
        }

        if (status.estado === 'COMPLETADO' || status.estado === 'COMPLETADO_CON_ERRORES' || status.estado === 'ERROR') {
          isRunning = false;
        }
      } catch (err) {
        console.error(`  Error polling status: ${err.message}`);
      }
    }

    const duration = Date.now() - startTime;
    console.log('');
    console.log('='.repeat(80));
    console.log('RESULTADOS DEL TEST - 40 FONDOS');
    console.log('='.repeat(80));
    console.log('');
    console.log(`Estado final: ${lastStatus.estado}`);
    console.log(`Tiempo total: ${(duration / 1000).toFixed(2)}s`);
    console.log(`Fondos completados: ${lastStatus.fondosCompletados}/${lastStatus.totalFondos}`);
    console.log(`Fondos con errores: ${lastStatus.fondosConErrores}`);
    console.log('');

    console.log('='.repeat(80));
    console.log('TEST COMPLETADO');
    console.log('='.repeat(80));
    console.log('');
    console.log('Para verificar datos en extract.IPA:');
    console.log(`
SELECT
    ID_Fund,
    Portfolio,
    COUNT(*) AS Registros
FROM extract.IPA
WHERE FechaReporte = '${fechaReporte}'
    AND ID_Fund IN (${TEST_FUNDS.join(', ')})
GROUP BY ID_Fund, Portfolio
ORDER BY ID_Fund
    `);
    console.log('');
    console.log('Para verificar que no hubo lock contention:');
    console.log(`
SELECT
    ID_Ejecucion,
    ID_Fund,
    Nivel,
    Servicio,
    Mensaje
FROM logs.Ejecucion_Logs
WHERE ID_Ejecucion IN (
    SELECT ID_Ejecucion FROM logs.Ejecuciones WHERE ID_Proceso = ${idProceso}
)
AND (Mensaje LIKE '%timeout%' OR Mensaje LIKE '%deadlock%' OR Mensaje LIKE '%lock%')
ORDER BY Timestamp
    `);

    process.exit(lastStatus.fondosConErrores > 0 ? 1 : 0);

  } catch (error) {
    console.error('');
    console.error('='.repeat(80));
    console.error('ERROR EN TEST');
    console.error('='.repeat(80));
    console.error('');
    console.error('Mensaje:', error.message);
    console.error('Stack:', error.stack);
    console.error('');
    process.exit(1);
  }
}

// Ejecutar test
testPhase2_50Fondos();
