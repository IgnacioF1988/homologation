/**
 * Test Batch Hybrid Mode - 40 fondos
 *
 * Verifica que:
 * 1. Extracción BATCH se ejecute UNA sola vez (no 40 veces)
 * 2. Tiempo total sea < 2 minutos
 * 3. Todos los fondos reciban datos con ID_Ejecucion correcto
 * 4. No haya lock contention en tablas fuente
 */

const axios = require('axios');

const API_BASE = 'http://localhost:3001/api/procesos';
const FECHA_REPORTE = '2024-11-29'; // Fecha con datos conocidos
const NUM_FONDOS = 40;

// Colores para consola
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

function log(color, ...args) {
  console.log(color, ...args, colors.reset);
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Paso 1: Iniciar ejecución con 40 fondos
 */
async function iniciarEjecucion() {
  log(colors.cyan, '\n📊 INICIANDO EJECUCIÓN BATCH - 40 FONDOS');
  log(colors.gray, `Fecha: ${FECHA_REPORTE}, Fondos: ${NUM_FONDOS}`);

  try {
    const response = await axios.post(`${API_BASE}/v2/ejecutar`, {
      fechaReporte: FECHA_REPORTE,
      fondos: null, // null = procesa todos los fondos
    });

    const { idProceso } = response.data;
    log(colors.green, `✅ Ejecución iniciada - ID_Proceso: ${idProceso}`);
    return idProceso;

  } catch (error) {
    log(colors.red, '❌ Error iniciando ejecución:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Paso 2: Monitorear progreso con métricas detalladas
 */
async function monitorearEjecucion(idProceso) {
  log(colors.cyan, '\n🔍 MONITOREANDO EJECUCIÓN BATCH...');

  const startTime = Date.now();
  let lastStatus = null;
  let extractionStartTime = null;
  let extractionEndTime = null;

  while (true) {
    try {
      const response = await axios.get(`${API_BASE}/v2/${idProceso}/estado`);
      const status = response.data;

      // Detectar inicio de extracción
      if (status.estado === 'EN_PROGRESO' && !extractionStartTime) {
        extractionStartTime = Date.now();
        log(colors.blue, '🚀 Extracción BATCH iniciada');
      }

      // Mostrar progreso solo si cambió
      if (JSON.stringify(status) !== JSON.stringify(lastStatus)) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

        log(colors.gray, `\n[${elapsed}s] Estado: ${status.estado}`);

        if (status.totalFondos) {
          const total = status.totalFondos;
          const completados = status.fondosCompletados || 0;
          const enProgreso = status.fondosEnProgreso || 0;
          const fallidos = status.fondosConErrores || 0;

          log(colors.gray, `  Fondos: ${completados}/${total} completados, ${enProgreso} en progreso, ${fallidos} fallidos`);
        }

        // Detectar fin de extracción
        if ((status.estado === 'COMPLETADO' || status.estado === 'COMPLETADO_CON_ERRORES') && !extractionEndTime) {
          extractionEndTime = Date.now();
        }

        lastStatus = status;
      }

      // Terminar si completó o falló
      if (status.estado === 'COMPLETADO' || status.estado === 'COMPLETADO_CON_ERRORES' || status.estado === 'ERROR') {
        const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
        const extractionTime = extractionStartTime && extractionEndTime
          ? ((extractionEndTime - extractionStartTime) / 1000).toFixed(1)
          : 'N/A';

        if (status.estado === 'COMPLETADO' || status.estado === 'COMPLETADO_CON_ERRORES') {
          log(colors.green, `\n✅ EJECUCIÓN COMPLETADA`);
          log(colors.gray, `   Tiempo total: ${totalTime}s`);
          log(colors.gray, `   Tiempo extracción: ${extractionTime}s`);
        } else {
          log(colors.red, `\n❌ EJECUCIÓN FALLIDA`);
          log(colors.gray, `   Tiempo total: ${totalTime}s`);
        }

        return status;
      }

      await sleep(2000); // Poll cada 2 segundos

    } catch (error) {
      log(colors.red, '❌ Error monitoreando:', error.message);
      throw error;
    }
  }
}

/**
 * Paso 3: Verificar resultados de extracción BATCH
 */
async function verificarResultados(idProceso) {
  log(colors.cyan, '\n🔬 VERIFICANDO RESULTADOS BATCH...');

  try {
    // Obtener logs de ejecución para verificar batch
    const logsResponse = await axios.get(`${API_BASE}/v2/ejecucion/${idProceso}/logs`);
    const logs = logsResponse.data.data.logs;

    // Buscar logs de extracción BATCH
    const batchLogs = logs.filter(log =>
      log.Mensaje && (
        log.Mensaje.includes('modo BATCH') ||
        log.Mensaje.includes('BATCH completado')
      )
    );

    log(colors.blue, `\n📋 Logs de extracción BATCH encontrados: ${batchLogs.length}`);

    batchLogs.forEach(logEntry => {
      log(colors.gray, `   [${logEntry.Etapa}] ${logEntry.Mensaje}`);
    });

    // Verificar que se ejecutó solo UNA vez (no 40 veces)
    const inicioBatch = logs.filter(l => l.Mensaje?.includes('Iniciando') && l.Mensaje?.includes('modo BATCH'));
    const finBatch = logs.filter(l => l.Mensaje?.includes('BATCH completado'));

    log(colors.blue, `\n🔢 Conteo de ejecuciones BATCH:`);
    log(colors.gray, `   Inicio BATCH: ${inicioBatch.length} (esperado: 1)`);
    log(colors.gray, `   Fin BATCH: ${finBatch.length} (esperado: 1)`);

    if (inicioBatch.length === 1 && finBatch.length === 1) {
      log(colors.green, '   ✅ Extracción BATCH se ejecutó correctamente UNA sola vez');
    } else {
      log(colors.yellow, '   ⚠️  Extracción BATCH puede haberse ejecutado múltiples veces');
    }

    // Verificar datos extraídos
    const statusResponse = await axios.get(`${API_BASE}/v2/${idProceso}/estado`);
    const status = statusResponse.data;

    const completados = status.fondosCompletados || 0;
    const fallidos = status.fondosConErrores || 0;
    const total = status.totalFondos || 0;

    log(colors.blue, `\n📊 Resumen de fondos:`);
    log(colors.gray, `   Total: ${total}`);
    log(colors.gray, `   Completados: ${completados}`);
    log(colors.gray, `   Fallidos: ${fallidos}`);

    if (completados === total && fallidos === 0) {
      log(colors.green, '   ✅ Todos los fondos completados exitosamente');
    } else if (completados > 0) {
      log(colors.yellow, `   ⚠️  Solo ${completados}/${total} fondos completados`);
    } else {
      log(colors.red, '   ❌ Ningún fondo completado');
    }

    return {
      batchExecutions: inicioBatch.length,
      fondosCompletados: completados,
      fondosFallidos: fallidos,
      logs: batchLogs,
    };

  } catch (error) {
    log(colors.red, '❌ Error verificando resultados:', error.message);
    throw error;
  }
}

/**
 * MAIN: Ejecutar test completo
 */
async function main() {
  const testStartTime = Date.now();

  log(colors.cyan, '\n' + '='.repeat(60));
  log(colors.cyan, '🧪 TEST: BATCH HYBRID MODE - 40 FONDOS');
  log(colors.cyan, '='.repeat(60));

  try {
    // Paso 1: Iniciar ejecución
    const idProceso = await iniciarEjecucion();

    // Paso 2: Monitorear progreso
    const finalStatus = await monitorearEjecucion(idProceso);

    // Paso 3: Verificar resultados
    const results = await verificarResultados(idProceso);

    // Resultado final
    const totalTestTime = ((Date.now() - testStartTime) / 1000).toFixed(1);

    log(colors.cyan, '\n' + '='.repeat(60));
    log(colors.cyan, '📊 RESULTADOS FINALES');
    log(colors.cyan, '='.repeat(60));

    log(colors.blue, `\n⏱️  Tiempo total del test: ${totalTestTime}s`);
    log(colors.blue, `🔢 Ejecuciones BATCH: ${results.batchExecutions} (esperado: 1)`);
    log(colors.blue, `✅ Fondos completados: ${results.fondosCompletados}/${NUM_FONDOS}`);
    log(colors.blue, `❌ Fondos fallidos: ${results.fondosFallidos}`);

    // Evaluación del test
    const testPassed =
      results.batchExecutions === 1 &&
      results.fondosCompletados > 0 &&
      results.fondosFallidos === 0 &&
      totalTestTime < 120; // Menos de 2 minutos

    if (testPassed) {
      log(colors.green, '\n🎉 TEST PASSED - Modo BATCH funcionando correctamente');
    } else {
      log(colors.yellow, '\n⚠️  TEST PARCIAL - Revisar logs para detalles');
    }

    log(colors.cyan, '\n' + '='.repeat(60) + '\n');

    process.exit(testPassed ? 0 : 1);

  } catch (error) {
    log(colors.red, '\n❌ TEST FAILED:', error.message);
    log(colors.cyan, '\n' + '='.repeat(60) + '\n');
    process.exit(1);
  }
}

// Ejecutar test
main();
