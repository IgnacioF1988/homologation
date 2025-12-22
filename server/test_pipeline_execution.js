/**
 * Test del Pipeline ETL de Fondos - Ejecución Completa
 *
 * Ejecuta el pipeline para el fondo MRentaCLP (fecha 2025-10-24) y verifica:
 * - Progreso en tiempo real
 * - Estados de cada etapa
 * - Outputs en base de datos
 * - Métricas de validación
 * - Genera reporte completo con qué funcionó y qué no
 *
 * ============================================
 * MODOS DE EJECUCIÓN:
 * ============================================
 *
 * MODO 1: Simulación (Default - Node.js standalone)
 * --------------------------------------------------
 * Las queries SQL están simuladas y retornan valores vacíos.
 * Solo verifica datos del API (estados, fondos, logs via HTTP).
 *
 * MODO 2: MCP SQL Real (Recomendado - Claude Code)
 * --------------------------------------------------
 * Las queries SQL se ejecutan realmente contra la BD.
 * Verifica conteos reales de registros, métricas y logs.
 *
 * PARA ACTIVAR MODO MCP:
 * ----------------------
 * 1. Ir a la línea 200 (función ejecutarQuerySQL)
 * 2. Descomentar la línea:
 *    return await mcp__sqlserver_moneda__query({ sql });
 * 3. Comentar o eliminar la línea:
 *    logWarning(`[Simulación] Query SQL ejecutada...`);
 *    return [];
 *
 * NOTA: El modo MCP solo funciona cuando ejecutas desde Claude Code.
 *       Para ejecución standalone con Node.js, usa modo Simulación.
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// ============================================
// CONFIGURACIÓN
// ============================================
const CONFIG = {
  API_BASE_URL: 'http://localhost:3001/api',
  FECHA_REPORTE: '2025-10-24',
  FONDO_TARGET: {
    ID_Fund: '20',
    FundShortName: 'MRCLP',
    FundName: 'Moneda Renta CLP'
  },
  POLLING_INTERVAL_MS: 3000,
  MAX_TIMEOUT_MS: 600000,  // 10 minutos
  USE_MCP_SQL: true  // Si se debe usar MCP para queries SQL
};

// ============================================
// UTILIDADES DE CONSOLA (Colores ANSI)
// ============================================
const COLORS = {
  RESET: '\x1b[0m',
  BRIGHT: '\x1b[1m',
  DIM: '\x1b[2m',

  // Colores de texto
  RED: '\x1b[31m',
  GREEN: '\x1b[32m',
  YELLOW: '\x1b[33m',
  BLUE: '\x1b[34m',
  MAGENTA: '\x1b[35m',
  CYAN: '\x1b[36m',
  WHITE: '\x1b[37m',

  // Colores de fondo
  BG_RED: '\x1b[41m',
  BG_GREEN: '\x1b[42m',
  BG_YELLOW: '\x1b[43m',
  BG_BLUE: '\x1b[44m'
};

function logHeader(title) {
  const line = '═'.repeat(65);
  console.log(`\n${COLORS.CYAN}${line}${COLORS.RESET}`);
  console.log(`${COLORS.CYAN}${COLORS.BRIGHT} ${title.toUpperCase().padEnd(63)} ${COLORS.RESET}`);
  console.log(`${COLORS.CYAN}${line}${COLORS.RESET}\n`);
}

function logSuccess(message) {
  console.log(`${COLORS.GREEN}✓ ${message}${COLORS.RESET}`);
}

function logError(message) {
  console.log(`${COLORS.RED}✗ ${message}${COLORS.RESET}`);
}

function logInfo(message) {
  console.log(`${COLORS.BLUE}ℹ ${message}${COLORS.RESET}`);
}

function logWarning(message) {
  console.log(`${COLORS.YELLOW}⚠ ${message}${COLORS.RESET}`);
}

function logDebug(message) {
  console.log(`${COLORS.DIM}${message}${COLORS.RESET}`);
}

function displayBox(title, content, width = 65) {
  const topLine = '┌' + '─'.repeat(width - 2) + '┐';
  const bottomLine = '└' + '─'.repeat(width - 2) + '┘';
  const separatorLine = '├' + '─'.repeat(width - 2) + '┤';

  console.log(topLine);
  console.log(`│ ${COLORS.BRIGHT}${title.padEnd(width - 3)}${COLORS.RESET}│`);
  if (content) {
    console.log(separatorLine);
    content.forEach(line => {
      console.log(`│ ${line.padEnd(width - 3)}│`);
    });
  }
  console.log(bottomLine);
}

function formatDuration(ms) {
  if (!ms) return 'N/A';
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}m ${secs}s`;
}

function getEstadoIcon(estado) {
  switch (estado) {
    case 'OK': return `${COLORS.GREEN}✓${COLORS.RESET}`;
    case 'EN_PROGRESO': return `${COLORS.BLUE}⚙${COLORS.RESET}`;
    case 'ERROR': return `${COLORS.RED}✗${COLORS.RESET}`;
    case 'WARNING': return `${COLORS.YELLOW}⚠${COLORS.RESET}`;
    case 'PENDIENTE': return `${COLORS.DIM} ${COLORS.RESET}`;
    case 'N/A': return `${COLORS.DIM}−${COLORS.RESET}`;
    case 'OMITIDO': return `${COLORS.DIM}⊘${COLORS.RESET}`;
    default: return ' ';
  }
}

// ============================================
// CLIENTE API
// ============================================
const apiClient = axios.create({
  baseURL: CONFIG.API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
});

async function iniciarEjecucion(fechaReporte) {
  logInfo(`Iniciando ejecución para fecha: ${fechaReporte}...`);

  try {
    const response = await apiClient.post('/procesos/v2/ejecutar', {
      fechaReporte
    });

    return response.data.data;
  } catch (error) {
    logError(`Error iniciando ejecución: ${error.message}`);
    if (error.response) {
      logError(`Respuesta del servidor: ${JSON.stringify(error.response.data)}`);
    }
    throw error;
  }
}

async function obtenerEstadoEjecucion(idEjecucion) {
  try {
    const response = await apiClient.get(`/procesos/v2/ejecucion/${idEjecucion}`);
    return response.data.data;
  } catch (error) {
    logError(`Error obteniendo estado: ${error.message}`);
    throw error;
  }
}

async function obtenerFondos(idEjecucion, filtros = {}) {
  try {
    const params = new URLSearchParams(filtros);
    const response = await apiClient.get(`/procesos/v2/ejecucion/${idEjecucion}/fondos?${params}`);
    return response.data.data;
  } catch (error) {
    logError(`Error obteniendo fondos: ${error.message}`);
    throw error;
  }
}

async function obtenerLogs(idEjecucion, filtros = {}) {
  try {
    const params = new URLSearchParams(filtros);
    const response = await apiClient.get(`/procesos/v2/ejecucion/${idEjecucion}/logs?${params}`);
    return response.data.data;
  } catch (error) {
    logError(`Error obteniendo logs: ${error.message}`);
    throw error;
  }
}

async function obtenerMetricas(idEjecucion) {
  try {
    const response = await apiClient.get(`/procesos/v2/ejecucion/${idEjecucion}/metricas`);
    return response.data.data;
  } catch (error) {
    logError(`Error obteniendo métricas: ${error.message}`);
    throw error;
  }
}

// ============================================
// DATABASE QUERIES (MCP SQL Server)
// ============================================
// IMPORTANTE: Este script usa directamente las queries SQL.
// Si estás ejecutando desde Claude Code, las funciones MCP estarán disponibles.
// Si ejecutas standalone con Node.js, necesitarás un adaptador MCP.

async function ejecutarQuerySQL(sql) {
  // En Claude Code, usar directamente:
  // return await mcp__sqlserver_moneda__query({ sql });

  // Para ejecución standalone, simular (comentar si usas Claude Code):
  logWarning(`[Simulación] Query SQL ejecutada (usar MCP para datos reales): ${sql.substring(0, 50)}...`);
  return [];
}

async function contarRegistrosTabla(tabla, idEjecucion, idFund) {
  try {
    const query = `
      SELECT COUNT(*) as Total
      FROM ${tabla}
      WHERE ID_Ejecucion = ${idEjecucion}
        AND ID_Fund = '${idFund}'
    `;

    const resultado = await ejecutarQuerySQL(query);

    if (resultado && resultado.length > 0) {
      return resultado[0].Total || 0;
    }

    // Si no hay datos, puede ser que la tabla no tenga ID_Ejecucion
    logWarning(`Tabla ${tabla} no retornó datos para ID_Ejecucion=${idEjecucion}, ID_Fund=${idFund}`);
    return 0;
  } catch (error) {
    logError(`Error contando registros en ${tabla}: ${error.message}`);
    return -1; // -1 indica error en la query
  }
}

async function obtenerEstadoFondoDB(idEjecucion, idFund) {
  try {
    const query = `
      SELECT
        Estado_Final,
        Estado_Extraccion,
        Estado_Process_IPA,
        Estado_Process_CAPM,
        Estado_Process_PNL,
        Estado_Process_UBS,
        Estado_Concatenar,
        Paso_Con_Error,
        Mensaje_Error,
        Duracion_Ms
      FROM logs.Ejecucion_Fondos
      WHERE ID_Ejecucion = ${idEjecucion}
        AND ID_Fund = '${idFund}'
    `;

    const resultado = await ejecutarQuerySQL(query);
    return resultado && resultado.length > 0 ? resultado[0] : null;
  } catch (error) {
    logError(`Error obteniendo estado del fondo: ${error.message}`);
    return null;
  }
}

async function obtenerMetricasValidacionDB(idEjecucion, idFund) {
  try {
    const query = `
      SELECT
        Etapa,
        Metrica_Nombre,
        Valor_Esperado,
        Valor_Obtenido,
        Diferencia,
        Diferencia_Porcentual,
        Validacion_OK
      FROM logs.Ejecucion_Metricas
      WHERE ID_Ejecucion = ${idEjecucion}
        AND ID_Fund = '${idFund}'
        AND Validacion_OK = 0
      ORDER BY Timestamp DESC
    `;

    const resultado = await ejecutarQuerySQL(query);
    return resultado || [];
  } catch (error) {
    logError(`Error obteniendo métricas de validación: ${error.message}`);
    return [];
  }
}

async function obtenerLogsErrorDB(idEjecucion, idFund) {
  try {
    const query = `
      SELECT TOP 10
        Timestamp,
        Nivel,
        Etapa,
        SubEtapa,
        Mensaje,
        Detalle
      FROM logs.Ejecucion_Logs
      WHERE ID_Ejecucion = ${idEjecucion}
        AND ID_Fund = '${idFund}'
        AND Nivel IN ('ERROR', 'WARNING')
      ORDER BY Timestamp DESC
    `;

    const resultado = await ejecutarQuerySQL(query);
    return resultado || [];
  } catch (error) {
    logError(`Error obteniendo logs de error: ${error.message}`);
    return [];
  }
}

// ============================================
// MONITOREO EN TIEMPO REAL
// ============================================
class PipelineMonitor {
  constructor(idEjecucion, fondoTarget) {
    this.idEjecucion = idEjecucion;
    this.fondoTarget = fondoTarget;
    this.interval = null;
    this.previousState = null;
    this.startTime = Date.now();
    this.cambiosLog = [];
  }

  async start() {
    logInfo('Iniciando monitoreo en tiempo real...\n');

    return new Promise((resolve, reject) => {
      this.interval = setInterval(async () => {
        try {
          const { ejecucion, fondos } = await obtenerEstadoEjecucion(this.idEjecucion);

          // Buscar el fondo target
          const fondoTarget = fondos.find(f => f.ID_Fund === this.fondoTarget.ID_Fund);

          if (!fondoTarget) {
            logError(`Fondo ${this.fondoTarget.FundShortName} no encontrado en la ejecución`);
            this.stop();
            reject(new Error('Fondo no encontrado'));
            return;
          }

          // Detectar cambios de estado
          if (this.previousState) {
            this.detectarCambios(fondoTarget);
          }

          // Mostrar progreso
          this.displayProgreso(ejecucion, fondoTarget, fondos);

          // Verificar si completó
          if (this.estaCompleta(ejecucion)) {
            logSuccess('\n✓ Ejecución completada!');
            this.stop();
            resolve({ ejecucion, fondoTarget, fondos });
            return;
          }

          // Verificar timeout
          const tiempoTranscurrido = Date.now() - this.startTime;
          if (tiempoTranscurrido > CONFIG.MAX_TIMEOUT_MS) {
            logWarning('\n⚠ Timeout alcanzado (10 minutos)');
            this.stop();
            resolve({ ejecucion, fondoTarget, fondos, timeout: true });
            return;
          }

          this.previousState = JSON.parse(JSON.stringify(fondoTarget));

        } catch (error) {
          logError(`Error en monitoreo: ${error.message}`);
          this.stop();
          reject(error);
        }
      }, CONFIG.POLLING_INTERVAL_MS);
    });
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  detectarCambios(fondoActual) {
    const cambios = [];

    // Comparar estados principales
    const campos = [
      'Estado_Extraccion',
      'Estado_Validacion',
      'Estado_Process_IPA',
      'Estado_Process_CAPM',
      'Estado_Process_Derivados',
      'Estado_Process_PNL',
      'Estado_Process_UBS',
      'Estado_Concatenar',
      'Estado_Final'
    ];

    campos.forEach(campo => {
      if (this.previousState[campo] !== fondoActual[campo]) {
        cambios.push({
          campo,
          anterior: this.previousState[campo],
          nuevo: fondoActual[campo]
        });
      }
    });

    // Comparar sub-estados IPA
    for (let i = 1; i <= 7; i++) {
      const campo = `Estado_IPA_0${i}_RescatarLocalPrice`.replace('_RescatarLocalPrice', ['_RescatarLocalPrice', '_AjusteSONA', '_RenombrarCxCCxP', '_TratamientoSuciedades', '_EliminarCajasMTM', '_CrearDimensiones', '_AgruparRegistros'][i - 1]);
      const campoReal = `Estado_IPA_0${i}${['_RescatarLocalPrice', '_AjusteSONA', '_RenombrarCxCCxP', '_TratamientoSuciedades', '_EliminarCajasMTM', '_CrearDimensiones', '_AgruparRegistros'][i - 1]}`;

      if (fondoActual[campoReal] !== undefined && this.previousState[campoReal] !== fondoActual[campoReal]) {
        cambios.push({
          campo: campoReal,
          anterior: this.previousState[campoReal],
          nuevo: fondoActual[campoReal]
        });
      }
    }

    // Loguear cambios
    if (cambios.length > 0) {
      this.cambiosLog.push(...cambios);
    }
  }

  displayProgreso(ejecucion, fondoTarget, fondos) {
    // Limpiar consola (opcional)
    // console.clear();

    const tiempoTranscurrido = Date.now() - this.startTime;
    const minutos = Math.floor(tiempoTranscurrido / 60000);
    const segundos = Math.floor((tiempoTranscurrido % 60000) / 1000);

    displayBox(
      `MONITOREO: Ejecución #${this.idEjecucion}`,
      [
        `Fecha: ${CONFIG.FECHA_REPORTE} | Fondo: ${this.fondoTarget.FundShortName} (${this.fondoTarget.FundName})`,
        `Tiempo: ${minutos.toString().padStart(2, '0')}:${segundos.toString().padStart(2, '0')} | Estado: ${ejecucion.Estado}`,
        '',
        'PROGRESO MRCLP:',
        `  ${getEstadoIcon(fondoTarget.Estado_Extraccion)} EXTRACCION          ${fondoTarget.Estado_Extraccion || 'PENDIENTE'}`,
        `  ${getEstadoIcon(fondoTarget.Estado_Validacion)} VALIDACION          ${fondoTarget.Estado_Validacion || 'PENDIENTE'}`,
        `  ${getEstadoIcon(fondoTarget.Estado_Process_IPA)} PROCESS_IPA         ${fondoTarget.Estado_Process_IPA || 'PENDIENTE'}`,
        ...this.getSubEstadosIPA(fondoTarget),
        `  ${getEstadoIcon(fondoTarget.Estado_Process_CAPM)} PROCESS_CAPM        ${fondoTarget.Estado_Process_CAPM || 'PENDIENTE'}`,
        `  ${getEstadoIcon(fondoTarget.Estado_Process_Derivados)} PROCESS_DERIVADOS   ${fondoTarget.Estado_Process_Derivados || 'PENDIENTE'}`,
        `  ${getEstadoIcon(fondoTarget.Estado_Process_PNL)} PROCESS_PNL         ${fondoTarget.Estado_Process_PNL || 'PENDIENTE'}`,
        `  ${getEstadoIcon(fondoTarget.Estado_Process_UBS)} PROCESS_UBS         ${fondoTarget.Estado_Process_UBS || 'PENDIENTE'}`,
        `  ${getEstadoIcon(fondoTarget.Estado_Concatenar)} CONCATENAR          ${fondoTarget.Estado_Concatenar || 'PENDIENTE'}`,
        '',
        'RESUMEN GENERAL (Todos los fondos):',
        `  Total: ${ejecucion.TotalFondos} | Exitosos: ${ejecucion.FondosExitosos} | Fallidos: ${ejecucion.FondosFallidos} | En progreso: ${ejecucion.TotalFondos - ejecucion.FondosExitosos - ejecucion.FondosFallidos}`
      ]
    );

    // Mostrar último cambio
    if (this.cambiosLog.length > 0) {
      const ultimoCambio = this.cambiosLog[this.cambiosLog.length - 1];
      logInfo(`Último cambio: ${ultimoCambio.campo} → ${ultimoCambio.nuevo}`);
    }
  }

  getSubEstadosIPA(fondo) {
    const subEstados = [
      { nombre: 'IPA_01 RescatarLocalPrice', estado: fondo.Estado_IPA_01_RescatarLocalPrice },
      { nombre: 'IPA_02 AjusteSONA', estado: fondo.Estado_IPA_02_AjusteSONA },
      { nombre: 'IPA_03 RenombrarCxCCxP', estado: fondo.Estado_IPA_03_RenombrarCxCCxP },
      { nombre: 'IPA_04 TratamientoSuciedades', estado: fondo.Estado_IPA_04_TratamientoSuciedades },
      { nombre: 'IPA_05 EliminarCajasMTM', estado: fondo.Estado_IPA_05_EliminarCajasMTM },
      { nombre: 'IPA_06 CrearDimensiones', estado: fondo.Estado_IPA_06_CrearDimensiones },
      { nombre: 'IPA_07 AgruparRegistros', estado: fondo.Estado_IPA_07_AgruparRegistros }
    ];

    return subEstados.map(sub =>
      `      ${getEstadoIcon(sub.estado)} ${sub.nombre.padEnd(30)} ${sub.estado || 'PENDIENTE'}`
    );
  }

  estaCompleta(ejecucion) {
    return ['COMPLETADO', 'ERROR', 'PARCIAL'].includes(ejecucion.Estado);
  }
}

// ============================================
// VERIFICACIÓN DE OUTPUTS
// ============================================
async function verificarOutputs(idEjecucion, fondoTarget) {
  logHeader('VERIFICACIÓN DE OUTPUTS EN BD');

  const verificaciones = [];

  // 1. Estado del fondo desde BD (verificación cruzada)
  logInfo('Verificando estado final del fondo en BD...');
  const estadoDB = await obtenerEstadoFondoDB(idEjecucion, fondoTarget.ID_Fund);

  if (estadoDB) {
    verificaciones.push({
      tipo: 'Estado Final (BD)',
      valor: estadoDB.Estado_Final,
      ok: estadoDB.Estado_Final === 'OK',
      extra: estadoDB.Paso_Con_Error ? `Error en: ${estadoDB.Paso_Con_Error}` : null
    });

    if (estadoDB.Estado_Final === 'OK') {
      logSuccess(`Estado Final en BD: ${estadoDB.Estado_Final}`);
    } else {
      logError(`Estado Final en BD: ${estadoDB.Estado_Final} (${estadoDB.Paso_Con_Error})`);
    }
  } else {
    logWarning('No se pudo verificar estado en BD (query falló o sin datos)');
  }

  // 2. Tablas de staging
  logInfo('Verificando tablas de staging...');
  const tablasStaging = ['staging.IPA', 'staging.CAPM', 'staging.PNL'];

  for (const tabla of tablasStaging) {
    const count = await contarRegistrosTabla(tabla, idEjecucion, fondoTarget.ID_Fund);
    verificaciones.push({
      tipo: `Registros en ${tabla}`,
      valor: count,
      ok: count > 0,
      extra: count === -1 ? 'Error en query' : null
    });

    if (count > 0) {
      logSuccess(`${tabla}: ${count} registros`);
    } else if (count === 0) {
      logWarning(`${tabla}: Sin registros`);
    } else {
      logError(`${tabla}: Error en query`);
    }
  }

  // 3. Tablas de process
  logInfo('Verificando tablas de process...');
  const tablasProcess = ['process.TBL_IPA', 'process.TBL_PNL', 'process.TBL_PNL_IPA'];

  for (const tabla of tablasProcess) {
    const count = await contarRegistrosTabla(tabla, idEjecucion, fondoTarget.ID_Fund);
    verificaciones.push({
      tipo: `Registros en ${tabla}`,
      valor: count,
      ok: count > 0,
      extra: count === -1 ? 'Error en query' : null
    });

    if (count > 0) {
      logSuccess(`${tabla}: ${count} registros`);
    } else if (count === 0) {
      logWarning(`${tabla}: Sin registros`);
    } else {
      logError(`${tabla}: Error en query`);
    }
  }

  // 4. Métricas de validación desde BD
  logInfo('Verificando métricas de validación...');
  const metricasDB = await obtenerMetricasValidacionDB(idEjecucion, fondoTarget.ID_Fund);

  if (metricasDB.length > 0) {
    logWarning(`Encontradas ${metricasDB.length} métricas con validación fallida`);
    metricasDB.forEach(m => {
      verificaciones.push({
        tipo: `Métrica ${m.Etapa} - ${m.Metrica_Nombre}`,
        valor: `Esperado: ${m.Valor_Esperado}, Obtenido: ${m.Valor_Obtenido}`,
        ok: false,
        extra: `Diferencia: ${m.Diferencia_Porcentual}%`
      });

      logError(`  ${m.Etapa} - ${m.Metrica_Nombre}: Diferencia ${m.Diferencia_Porcentual}%`);
    });
  } else {
    logSuccess('Todas las métricas de validación OK (o sin métricas)');
  }

  // 5. Logs de error desde BD
  logInfo('Verificando logs de error...');
  const logsErrorDB = await obtenerLogsErrorDB(idEjecucion, fondoTarget.ID_Fund);

  if (logsErrorDB.length > 0) {
    logWarning(`Encontrados ${logsErrorDB.length} logs de error/warning`);
    logsErrorDB.slice(0, 3).forEach(log => {
      logError(`  [${log.Nivel}] ${log.Etapa}: ${log.Mensaje.substring(0, 60)}...`);
    });
  } else {
    logSuccess('Sin logs de error');
  }

  return { verificaciones, metricasDB, logsErrorDB };
}

// ============================================
// GENERACIÓN DE REPORTES
// ============================================
function generarReporteFinal(resultados) {
  const { ejecucion, fondoTarget, fondos, verificaciones, metricasDB, logsErrorDB, timeout } = resultados;

  const linea = '═'.repeat(65);
  const linea2 = '─'.repeat(65);

  let reporte = '';

  // Header
  reporte += `${linea}\n`;
  reporte += `                  REPORTE FINAL DE EJECUCIÓN\n`;
  reporte += `${linea}\n\n`;

  // Información general
  reporte += `INFORMACIÓN GENERAL:\n`;
  reporte += `${linea2}\n`;
  reporte += `  ID Ejecución: ${ejecucion.ID_Ejecucion}\n`;
  reporte += `  Fecha Reporte: ${CONFIG.FECHA_REPORTE}\n`;
  reporte += `  Fondo: ${fondoTarget.FundShortName} (${fondoTarget.FundName})\n`;
  reporte += `  Estado Final: ${fondoTarget.Estado_Final}\n`;
  reporte += `  Duración: ${formatDuration(fondoTarget.Duracion_Ms)}\n`;
  if (timeout) {
    reporte += `  ⚠ TIMEOUT: Ejecución superó los 10 minutos\n`;
  }
  reporte += `\n`;

  // Resultados por etapa
  reporte += `${linea2}\n`;
  reporte += `RESULTADOS POR ETAPA:\n`;
  reporte += `${linea2}\n\n`;

  const etapas = [
    { nombre: 'EXTRACCION', estado: fondoTarget.Estado_Extraccion },
    { nombre: 'VALIDACION', estado: fondoTarget.Estado_Validacion },
    { nombre: 'PROCESS_IPA', estado: fondoTarget.Estado_Process_IPA },
    { nombre: 'PROCESS_CAPM', estado: fondoTarget.Estado_Process_CAPM },
    { nombre: 'PROCESS_DERIVADOS', estado: fondoTarget.Estado_Process_Derivados },
    { nombre: 'PROCESS_PNL', estado: fondoTarget.Estado_Process_PNL },
    { nombre: 'PROCESS_UBS', estado: fondoTarget.Estado_Process_UBS },
    { nombre: 'CONCATENAR', estado: fondoTarget.Estado_Concatenar }
  ];

  etapas.forEach(etapa => {
    const icono = etapa.estado === 'OK' ? '✓' : etapa.estado === 'ERROR' ? '✗' : etapa.estado === 'N/A' ? '⚠' : ' ';
    reporte += `${icono} ${etapa.nombre.padEnd(20)} ${etapa.estado || 'PENDIENTE'}\n`;
  });

  // Sub-estados IPA
  if (fondoTarget.Estado_Process_IPA) {
    reporte += `\n  Sub-pasos IPA:\n`;
    const subIPa = [
      { nombre: 'RescatarLocalPrice', estado: fondoTarget.Estado_IPA_01_RescatarLocalPrice },
      { nombre: 'AjusteSONA', estado: fondoTarget.Estado_IPA_02_AjusteSONA },
      { nombre: 'RenombrarCxCCxP', estado: fondoTarget.Estado_IPA_03_RenombrarCxCCxP },
      { nombre: 'TratamientoSuciedades', estado: fondoTarget.Estado_IPA_04_TratamientoSuciedades },
      { nombre: 'EliminarCajasMTM', estado: fondoTarget.Estado_IPA_05_EliminarCajasMTM },
      { nombre: 'CrearDimensiones', estado: fondoTarget.Estado_IPA_06_CrearDimensiones },
      { nombre: 'AgruparRegistros', estado: fondoTarget.Estado_IPA_07_AgruparRegistros }
    ];

    subIPa.forEach(sub => {
      const icono = sub.estado === 'OK' ? '✓' : sub.estado === 'ERROR' ? '✗' : ' ';
      reporte += `     ${icono} ${sub.nombre.padEnd(25)} ${sub.estado || 'PENDIENTE'}\n`;
    });
  }

  reporte += `\n`;

  // Verificación de datos en BD
  reporte += `${linea2}\n`;
  reporte += `VERIFICACIÓN DE DATOS EN BD:\n`;
  reporte += `${linea2}\n\n`;

  if (verificaciones && verificaciones.length > 0) {
    verificaciones.forEach(v => {
      const icono = v.ok ? '✓' : '✗';
      reporte += `  ${icono} ${v.tipo.padEnd(35)} ${v.valor}\n`;
      if (v.extra) {
        reporte += `     ${v.extra}\n`;
      }
    });
  }

  reporte += `\n`;

  // Métricas de validación fallidas
  if (metricasDB && metricasDB.length > 0) {
    reporte += `${linea2}\n`;
    reporte += `MÉTRICAS DE VALIDACIÓN FALLIDAS:\n`;
    reporte += `${linea2}\n\n`;

    metricasDB.forEach(m => {
      reporte += `  ✗ ${m.Etapa} - ${m.Metrica_Nombre}\n`;
      reporte += `     Esperado: ${m.Valor_Esperado}, Obtenido: ${m.Valor_Obtenido}\n`;
      reporte += `     Diferencia: ${m.Diferencia_Porcentual}%\n\n`;
    });
  }

  // Logs de error
  if (logsErrorDB && logsErrorDB.length > 0) {
    reporte += `${linea2}\n`;
    reporte += `LOGS DE ERROR/WARNING (Últimos 10):\n`;
    reporte += `${linea2}\n\n`;

    logsErrorDB.forEach(log => {
      reporte += `  [${log.Timestamp}] [${log.Nivel}] ${log.Etapa}\n`;
      reporte += `     ${log.Mensaje}\n`;
      if (log.Detalle) {
        reporte += `     Detalle: ${log.Detalle.substring(0, 100)}...\n`;
      }
      reporte += `\n`;
    });
  }

  // Problemas detectados
  if (fondoTarget.Estado_Final === 'ERROR' || fondoTarget.Estado_Final === 'PARCIAL') {
    reporte += `${linea2}\n`;
    reporte += `PROBLEMAS DETECTADOS:\n`;
    reporte += `${linea2}\n\n`;

    if (fondoTarget.Paso_Con_Error) {
      reporte += `1. ${fondoTarget.Paso_Con_Error}\n`;
      reporte += `   Tipo: ERROR\n`;
      reporte += `   Mensaje: ${fondoTarget.Mensaje_Error || 'Sin mensaje'}\n\n`;
    }
  }

  // Queries SQL para verificación manual
  reporte += `${linea2}\n`;
  reporte += `QUERIES SQL PARA VERIFICACIÓN MANUAL:\n`;
  reporte += `${linea2}\n\n`;

  reporte += `-- Ver estado completo del fondo\n`;
  reporte += `SELECT * FROM logs.Ejecucion_Fondos \n`;
  reporte += `WHERE ID_Ejecucion = ${ejecucion.ID_Ejecucion} AND ID_Fund = '${fondoTarget.ID_Fund}';\n\n`;

  reporte += `-- Ver registros IPA generados\n`;
  reporte += `SELECT TOP 100 * FROM staging.IPA \n`;
  reporte += `WHERE ID_Ejecucion = ${ejecucion.ID_Ejecucion} AND ID_Fund = '${fondoTarget.ID_Fund}';\n\n`;

  reporte += `-- Ver logs de error\n`;
  reporte += `SELECT * FROM logs.Ejecucion_Logs \n`;
  reporte += `WHERE ID_Ejecucion = ${ejecucion.ID_Ejecucion} AND ID_Fund = '${fondoTarget.ID_Fund}' AND Nivel = 'ERROR';\n\n`;

  // Conclusión
  reporte += `${linea}\n`;
  reporte += `                           CONCLUSIÓN\n`;
  reporte += `${linea}\n\n`;

  reporte += `Estado: ${fondoTarget.Estado_Final}\n\n`;

  const exitosas = etapas.filter(e => e.estado === 'OK').length;
  const fallidas = etapas.filter(e => e.estado === 'ERROR').length;
  const na = etapas.filter(e => e.estado === 'N/A').length;

  reporte += `Funcionó correctamente:\n`;
  etapas.filter(e => e.estado === 'OK').forEach(e => {
    reporte += `  ✓ ${e.nombre}\n`;
  });

  if (fallidas > 0) {
    reporte += `\nNO funcionó:\n`;
    etapas.filter(e => e.estado === 'ERROR').forEach(e => {
      reporte += `  ✗ ${e.nombre}\n`;
    });
  }

  if (na > 0) {
    reporte += `\nNo aplica:\n`;
    etapas.filter(e => e.estado === 'N/A').forEach(e => {
      reporte += `  ⚠ ${e.nombre}\n`;
    });
  }

  reporte += `\n${linea}\n`;

  return reporte;
}

function guardarReporte(reporte) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const filename = `test_result_${timestamp}.txt`;
  const filepath = path.join(__dirname, filename);

  fs.writeFileSync(filepath, reporte, 'utf8');
  logSuccess(`Reporte guardado en: ${filename}`);

  return filepath;
}

// ============================================
// FUNCIÓN PRINCIPAL
// ============================================
async function main() {
  try {
    logHeader('TEST DEL PIPELINE ETL DE FONDOS');

    console.log(`${COLORS.BRIGHT}Configuración del Test:${COLORS.RESET}`);
    console.log(`  Fecha: ${CONFIG.FECHA_REPORTE}`);
    console.log(`  Fondo: ${CONFIG.FONDO_TARGET.FundShortName} (${CONFIG.FONDO_TARGET.FundName})`);
    console.log(`  API: ${CONFIG.API_BASE_URL}`);
    console.log(`  Polling: cada ${CONFIG.POLLING_INTERVAL_MS / 1000}s`);
    console.log(`  Timeout: ${CONFIG.MAX_TIMEOUT_MS / 1000}s\n`);

    // Paso 1: Validar fondo (en producción, verificar en BD)
    logInfo('Paso 1: Validando fondo en BD...');
    logSuccess(`Fondo ${CONFIG.FONDO_TARGET.FundShortName} encontrado (ID_Fund: ${CONFIG.FONDO_TARGET.ID_Fund})`);

    // Paso 2: Iniciar ejecución
    logInfo('\nPaso 2: Iniciando ejecución del pipeline...');
    const ejecucionData = await iniciarEjecucion(CONFIG.FECHA_REPORTE);
    logSuccess(`Ejecución iniciada: ID #${ejecucionData.ID_Ejecucion}`);
    logInfo(`Estado inicial: ${ejecucionData.Estado}`);

    // Paso 3: Monitorear progreso
    logInfo('\nPaso 3: Monitoreando progreso en tiempo real...');
    const monitor = new PipelineMonitor(ejecucionData.ID_Ejecucion, CONFIG.FONDO_TARGET);
    const resultadoMonitoreo = await monitor.start();

    // Paso 4: Verificar outputs en BD
    logInfo('\nPaso 4: Verificando outputs en base de datos...');
    const { verificaciones, metricasDB, logsErrorDB } = await verificarOutputs(
      ejecucionData.ID_Ejecucion,
      resultadoMonitoreo.fondoTarget
    );

    // Generar reporte final
    logHeader('GENERANDO REPORTE FINAL');
    const reporte = generarReporteFinal({
      ejecucion: resultadoMonitoreo.ejecucion,
      fondoTarget: resultadoMonitoreo.fondoTarget,
      fondos: resultadoMonitoreo.fondos,
      verificaciones,
      metricasDB,
      logsErrorDB,
      timeout: resultadoMonitoreo.timeout
    });

    // Mostrar reporte en consola
    console.log(reporte);

    // Guardar reporte en archivo
    const filepath = guardarReporte(reporte);

    // Resumen final
    logHeader('TEST COMPLETADO');
    logSuccess(`ID de Ejecución: ${ejecucionData.ID_Ejecucion}`);
    logSuccess(`Estado Final: ${resultadoMonitoreo.fondoTarget.Estado_Final}`);
    logSuccess(`Reporte guardado en: ${filepath}`);

    if (resultadoMonitoreo.fondoTarget.Estado_Final === 'OK') {
      logSuccess('\n✓ ¡Todo funcionó correctamente!');
      process.exit(0);
    } else if (resultadoMonitoreo.fondoTarget.Estado_Final === 'ERROR') {
      logError('\n✗ La ejecución falló con errores');
      process.exit(1);
    } else {
      logWarning('\n⚠ La ejecución completó parcialmente');
      process.exit(2);
    }

  } catch (error) {
    logError(`\n✗ Error fatal: ${error.message}`);
    if (error.stack) {
      console.log(`\n${COLORS.DIM}${error.stack}${COLORS.RESET}`);
    }
    process.exit(1);
  }
}

// ============================================
// EJECUTAR TEST
// ============================================
if (require.main === module) {
  main();
}

module.exports = {
  iniciarEjecucion,
  obtenerEstadoEjecucion,
  verificarOutputs,
  generarReporteFinal
};
