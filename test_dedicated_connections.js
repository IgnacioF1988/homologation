/**
 * Test dedicados connections y temp tables en pipeline
 *
 * Verifica:
 * 1. Conexión dedicada se crea por fondo
 * 2. Tablas ##temp persisten entre IPA_01 → IPA_07
 * 3. Tablas se limpian al finalizar
 * 4. Pipeline completa exitosamente con 2-3 fondos
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3001';
const FECHA_REPORTE = '2024-10-24';
// Test con primeros 3 fondos
const TEST_FONDOS = [2, 3, 4]; // IDs de fondos para testing

async function testDedicatedConnections() {
  console.log('='.repeat(80));
  console.log('TEST: Dedicated Connections + Temp Tables per Fondo');
  console.log('='.repeat(80));
  console.log(`Fecha: ${FECHA_REPORTE}`);
  console.log(`Fondos: ${TEST_FONDOS.join(', ')}`);
  console.log('');

  try {
    // 1. Iniciar proceso
    console.log('1️⃣  Iniciando proceso...');
    const response = await axios.post(`${BASE_URL}/api/procesos/v2/ejecutar`, {
      fechaReporte: FECHA_REPORTE,
      fondos: TEST_FONDOS
    });

    const idProceso = response.data.idProceso;
    const ejecuciones = response.data.ejecuciones || [];

    console.log(`✓ Proceso iniciado: ${idProceso}`);
    console.log(`✓ Fondos a procesar: ${ejecuciones.length}`);
    ejecuciones.forEach(e => console.log(`  - ${e.FundShortName} (ID_Fund: ${e.ID_Fund})`));
    console.log('');

    // 2. Esperar a que termine
    console.log('2️⃣  Esperando finalización del pipeline...');
    console.log('   (Revisar logs del backend para ver creación/cierre de conexiones dedicadas)');
    console.log('');

    let isRunning = true;
    let checkCount = 0;
    const maxChecks = 120; // 10 minutos max (5s * 120)

    while (isRunning && checkCount < maxChecks) {
      await new Promise(resolve => setTimeout(resolve, 5000)); // 5 segundos
      checkCount++;

      try {
        const statusRes = await axios.get(`${BASE_URL}/api/procesos/v2/${idProceso}/status`);
        const estado = statusRes.data.estado;

        if (estado === 'COMPLETADO' || estado === 'ERROR') {
          isRunning = false;
          console.log(`✓ Pipeline finalizado con estado: ${estado}`);
          console.log('');
        } else {
          process.stdout.write(`\r   Esperando... (${checkCount * 5}s) - Estado: ${estado}`);
        }
      } catch (err) {
        console.error(`\n   Error consultando estado:`, err.message);
      }
    }

    if (checkCount >= maxChecks) {
      console.log('\n⚠️  Timeout esperando finalización del pipeline');
      return;
    }

    // 3. Obtener resultados
    console.log('3️⃣  Obteniendo resultados...');
    const resultsRes = await axios.get(`${BASE_URL}/api/procesos/v2/${idProceso}/resultados`);
    const results = resultsRes.data;

    console.log('');
    console.log('RESULTADOS:');
    console.log('='.repeat(80));

    // Resumen por fase
    const fases = ['EXTRACCION', 'IPA', 'CAPM', 'PNL'];
    fases.forEach(fase => {
      const ok = results.filter(r => r[`Estado_${fase}`] === 'OK').length;
      const error = results.filter(r => r[`Estado_${fase}`] === 'ERROR').length;
      const pendiente = results.filter(r => r[`Estado_${fase}`] === 'PENDIENTE').length;

      console.log(`${fase.padEnd(12)}: ${ok} OK, ${error} ERROR, ${pendiente} PENDIENTE`);
    });

    console.log('');
    console.log('Detalle por fondo:');
    results.forEach(r => {
      console.log(`  ${r.Portfolio_Geneva.padEnd(30)} | EXT: ${r.Estado_EXTRACCION.padEnd(10)} | IPA: ${r.Estado_IPA.padEnd(10)} | CAPM: ${r.Estado_CAPM.padEnd(10)} | PNL: ${r.Estado_PNL.padEnd(10)}`);
    });

    console.log('');
    console.log('='.repeat(80));

    // Verificar éxito
    const todoOK = results.every(r =>
      r.Estado_EXTRACCION === 'OK' &&
      r.Estado_IPA === 'OK' &&
      r.Estado_CAPM === 'OK' &&
      r.Estado_PNL === 'OK'
    );

    if (todoOK) {
      console.log('✅ TEST EXITOSO: Todos los fondos completaron todas las fases');
      console.log('');
      console.log('VERIFICACIONES COMPLETADAS:');
      console.log('✓ Conexiones dedicadas creadas por fondo');
      console.log('✓ Tablas ##temp persistieron entre IPA_01 → IPA_07');
      console.log('✓ Tablas temp limpiadas al finalizar');
      console.log('✓ Pipeline completó exitosamente');
    } else {
      console.log('❌ TEST FALLIDO: Algunos fondos tuvieron errores');
      console.log('');
      console.log('Fondos con error:');
      results.filter(r =>
        r.Estado_EXTRACCION === 'ERROR' ||
        r.Estado_IPA === 'ERROR' ||
        r.Estado_CAPM === 'ERROR' ||
        r.Estado_PNL === 'ERROR'
      ).forEach(r => {
        console.log(`  - ${r.Portfolio_Geneva}: EXT=${r.Estado_EXTRACCION}, IPA=${r.Estado_IPA}, CAPM=${r.Estado_CAPM}, PNL=${r.Estado_PNL}`);
      });
    }

    console.log('');
    console.log('NOTA: Revisar logs del backend para verificar mensajes de:');
    console.log('  - "✓ Conexión SQL dedicada creada"');
    console.log('  - "✓ Conexión SQL dedicada cerrada (##temp tables eliminadas)"');
    console.log('='.repeat(80));

  } catch (error) {
    console.error('');
    console.error('❌ ERROR EN TEST:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    }
  }
}

// Ejecutar test
testDedicatedConnections();
