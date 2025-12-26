/**
 * Test Phase 2 - Extracción per-fund con 5 fondos (sin dependencias)
 */

const http = require('http');

const API_HOST = 'localhost';
const API_PORT = 3001;

const TEST_FUNDS = [
  { ID_Fund: 2, FundShortName: 'ALTURAS II', Portfolio_Geneva: 'ALTURAS II', Portfolio_UBS: null },
  { ID_Fund: 8, FundShortName: 'GLORY', Portfolio_Geneva: 'GLORY', Portfolio_UBS: null },
  { ID_Fund: 11, FundShortName: 'MDCH', Portfolio_Geneva: 'MDCHILE', Portfolio_UBS: null },
  { ID_Fund: 12, FundShortName: 'MDELA', Portfolio_Geneva: 'MDELA', Portfolio_UBS: null },
  { ID_Fund: 13, FundShortName: 'MDLAT', Portfolio_Geneva: 'MDLAT', Portfolio_UBS: null }
];

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

async function testPhase2() {
  console.log('='.repeat(80));
  console.log('PHASE 2 TEST - Per-Fund Extraction with 5 Funds');
  console.log('='.repeat(80));
  console.log('');

  const fechaReporte = '2025-12-19';

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
    const response = await httpRequest('POST', '/api/procesos/v2/ejecutar', {
      fechaReporte,
      fondos: TEST_FUNDS.map(f => f.ID_Fund),
      descripcion: 'TEST Phase 2 - 5 fondos con extracción per-fund'
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

    while (isRunning && pollCount < 60) { // Max 3 minutos
      await sleep(3000); // Poll cada 3s
      pollCount++;

      try {
        const status = await httpRequest('GET', `/api/procesos/v2/${idProceso}/estado`);

        if (status.estado !== lastStatus?.estado) {
          console.log(`  Estado: ${status.estado} (${status.fondosCompletados}/${status.totalFondos} fondos)`);
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
    console.log('RESULTADOS DEL TEST');
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
    AND ID_Fund IN (${TEST_FUNDS.map(f => f.ID_Fund).join(', ')})
GROUP BY ID_Fund, Portfolio
ORDER BY ID_Fund
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
testPhase2();
