/**
 * Test de Extracción BATCH únicamente
 *
 * Verifica que la fase de extracción batch funcione correctamente:
 * 1. Crea proceso con 40 fondos
 * 2. Ejecuta SOLO los SPs de extracción batch
 * 3. Verifica que los datos se insertaron con ID_Ejecucion correcto
 * 4. NO ejecuta las fases siguientes (IPA, CAPM, etc.)
 */

const sql = require('./server/node_modules/mssql');
require('dotenv').config({ path: './server/.env' });

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

// Configuración de base de datos
const dbConfig = {
  server: process.env.DB_SERVER || 'localhost',
  database: 'Inteligencia_Producto_Dev',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT) || 1433,
  options: {
    encrypt: process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true',
    enableArithAbort: true,
  },
  requestTimeout: 300000, // 5 minutos para batch
};

const FECHA_REPORTE = '2025-10-24';

/**
 * Paso 1: Crear proceso e inicializar ejecuciones
 */
async function inicializarProceso(pool) {
  log(colors.cyan, '\n📊 PASO 1: Inicializando proceso...');

  try {
    const result = await pool.request()
      .input('FechaReporte', sql.NVarChar(10), FECHA_REPORTE)
      .output('ID_Proceso', sql.BigInt)
      .execute('logs.sp_Inicializar_Proceso');

    const idProceso = result.output.ID_Proceso;
    log(colors.green, `✅ Proceso inicializado - ID_Proceso: ${idProceso}`);

    // Verificar cuántos fondos se crearon
    const fondosResult = await pool.request()
      .input('ID_Proceso', sql.BigInt, idProceso)
      .query(`
        SELECT COUNT(*) as total
        FROM logs.Ejecuciones
        WHERE ID_Proceso = @ID_Proceso
      `);

    const totalFondos = fondosResult.recordset[0].total;
    log(colors.gray, `   Ejecuciones creadas: ${totalFondos} fondos`);

    return { idProceso, totalFondos };

  } catch (error) {
    log(colors.red, '❌ Error inicializando proceso:', error.message);
    throw error;
  }
}

/**
 * Paso 2: Ejecutar SPs de extracción batch
 */
async function ejecutarExtraccionBatch(pool, idProceso) {
  log(colors.cyan, '\n🚀 PASO 2: Ejecutando extracción BATCH...');

  const extractionSPs = [
    'extract.Extract_IPA_Batch',
    'extract.Extract_PosModRF_Batch',
    'extract.Extract_SONA_Batch',
    'extract.Extract_CAPM_Batch',
    'extract.Extract_Derivados_Batch',
    'extract.Extract_UBS_Batch',
    'extract.Extract_UBS_MonedaDerivados_Batch',
  ];

  const startTime = Date.now();
  const resultados = [];

  for (const spName of extractionSPs) {
    const spStart = Date.now();
    log(colors.blue, `\n   Ejecutando ${spName}...`);

    try {
      const result = await pool.request()
        .input('ID_Proceso', sql.BigInt, idProceso)
        .input('FechaReporte', sql.NVarChar(10), FECHA_REPORTE)
        .execute(spName);

      const returnValue = result.returnValue;
      const duration = ((Date.now() - spStart) / 1000).toFixed(2);

      if (returnValue === 0) {
        log(colors.green, `   ✅ ${spName} completado en ${duration}s (datos insertados)`);
        resultados.push({ sp: spName, success: true, returnValue, duration });
      } else if (returnValue === 1) {
        log(colors.yellow, `   ⚠️  ${spName} completado en ${duration}s (sin datos)`);
        resultados.push({ sp: spName, success: true, returnValue, duration });
      } else {
        log(colors.red, `   ❌ ${spName} falló - ReturnValue: ${returnValue}`);
        resultados.push({ sp: spName, success: false, returnValue, duration });
      }

    } catch (error) {
      log(colors.red, `   ❌ ${spName} error: ${error.message}`);
      resultados.push({ sp: spName, success: false, error: error.message });
    }
  }

  const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);
  const exitosos = resultados.filter(r => r.success).length;

  log(colors.cyan, `\n📊 Resumen de extracción:`);
  log(colors.gray, `   Total SPs: ${extractionSPs.length}`);
  log(colors.gray, `   Exitosos: ${exitosos}`);
  log(colors.gray, `   Fallidos: ${extractionSPs.length - exitosos}`);
  log(colors.gray, `   Tiempo total: ${totalDuration}s`);

  return resultados;
}

/**
 * Paso 3: Verificar datos extraídos
 */
async function verificarDatosExtraidos(pool, idProceso, totalFondos) {
  log(colors.cyan, '\n🔬 PASO 3: Verificando datos extraídos...');

  const tablas = [
    { nombre: 'extract.IPA', esperado: 'múltiples' },
    { nombre: 'extract.PosModRF', esperado: 'múltiples' },
    { nombre: 'extract.SONA', esperado: 'múltiples' },
    { nombre: 'extract.CAPM', esperado: 'múltiples' },
    { nombre: 'extract.Derivados', esperado: 'algunos fondos' },
    { nombre: 'extract.UBS', esperado: 'fondos UBS' },
  ];

  const verificaciones = [];

  for (const tabla of tablas) {
    try {
      // Contar registros por ID_Ejecucion
      const result = await pool.request()
        .input('ID_Proceso', sql.BigInt, idProceso)
        .query(`
          SELECT
            COUNT(DISTINCT e.ID_Ejecucion) as fondos_con_datos,
            COUNT(*) as total_registros
          FROM ${tabla.nombre} t
          INNER JOIN logs.Ejecuciones e ON t.ID_Ejecucion = e.ID_Ejecucion
          WHERE e.ID_Proceso = @ID_Proceso
        `);

      const stats = result.recordset[0];

      if (stats.total_registros > 0) {
        log(colors.green, `   ✅ ${tabla.nombre}:`);
        log(colors.gray, `      ${stats.fondos_con_datos} fondos con datos`);
        log(colors.gray, `      ${stats.total_registros} registros totales`);

        verificaciones.push({
          tabla: tabla.nombre,
          fondosConDatos: stats.fondos_con_datos,
          totalRegistros: stats.total_registros,
          success: true
        });
      } else {
        log(colors.yellow, `   ⚠️  ${tabla.nombre}: Sin datos (esperado para ${tabla.esperado})`);
        verificaciones.push({
          tabla: tabla.nombre,
          fondosConDatos: 0,
          totalRegistros: 0,
          success: true // OK si no hay datos
        });
      }

    } catch (error) {
      log(colors.red, `   ❌ ${tabla.nombre}: Error - ${error.message}`);
      verificaciones.push({
        tabla: tabla.nombre,
        success: false,
        error: error.message
      });
    }
  }

  return verificaciones;
}

/**
 * Paso 4: Verificar que cada fondo tenga su ID_Ejecucion único
 */
async function verificarAislamiento(pool, idProceso) {
  log(colors.cyan, '\n🔒 PASO 4: Verificando aislamiento por ID_Ejecucion...');

  try {
    // Verificar que cada fondo tenga datos con su ID_Ejecucion único
    const result = await pool.request()
      .input('ID_Proceso', sql.BigInt, idProceso)
      .query(`
        SELECT
          e.ID_Ejecucion,
          ef.ID_Fund,
          ef.FundShortName,
          (SELECT COUNT(*) FROM extract.IPA WHERE ID_Ejecucion = e.ID_Ejecucion) as IPA_count,
          (SELECT COUNT(*) FROM extract.CAPM WHERE ID_Ejecucion = e.ID_Ejecucion) as CAPM_count,
          (SELECT COUNT(*) FROM extract.PosModRF WHERE ID_Ejecucion = e.ID_Ejecucion) as PosModRF_count
        FROM logs.Ejecuciones e
        INNER JOIN logs.Ejecucion_Fondos ef ON e.ID_Ejecucion = ef.ID_Ejecucion
        WHERE e.ID_Proceso = @ID_Proceso
        ORDER BY ef.FundShortName
      `);

    const fondos = result.recordset;
    const fondosConDatos = fondos.filter(f => f.IPA_count > 0 || f.CAPM_count > 0 || f.PosModRF_count > 0);

    log(colors.blue, `   Fondos totales: ${fondos.length}`);
    log(colors.blue, `   Fondos con datos: ${fondosConDatos.length}`);

    // Mostrar primeros 5 fondos como muestra
    log(colors.gray, '\n   Muestra de fondos (primeros 5):');
    fondos.slice(0, 5).forEach(f => {
      if (f.IPA_count > 0 || f.CAPM_count > 0) {
        log(colors.gray, `      ${f.FundShortName}: IPA=${f.IPA_count}, CAPM=${f.CAPM_count}, PosModRF=${f.PosModRF_count}`);
      }
    });

    // Verificar que no haya mezcla de datos entre fondos
    const mixCheckResult = await pool.request()
      .input('ID_Proceso', sql.BigInt, idProceso)
      .query(`
        -- Verificar que no haya Portfolio de un fondo en ID_Ejecucion de otro
        SELECT COUNT(*) as mezclas
        FROM extract.IPA ipa
        INNER JOIN logs.Ejecucion_Fondos ef ON ipa.ID_Ejecucion = ef.ID_Ejecucion
        WHERE ipa.Portfolio != ef.Portfolio_Geneva
          AND ef.ID_Ejecucion IN (
            SELECT ID_Ejecucion FROM logs.Ejecuciones WHERE ID_Proceso = @ID_Proceso
          )
      `);

    const mezclas = mixCheckResult.recordset[0].mezclas;

    if (mezclas === 0) {
      log(colors.green, '\n   ✅ Aislamiento correcto: Sin mezcla de datos entre fondos');
    } else {
      log(colors.red, `\n   ❌ Error de aislamiento: ${mezclas} registros mezclados entre fondos`);
    }

    return {
      fondosTotales: fondos.length,
      fondosConDatos: fondosConDatos.length,
      mezclas,
      aislamientoCorrecto: mezclas === 0
    };

  } catch (error) {
    log(colors.red, '   ❌ Error verificando aislamiento:', error.message);
    return { error: error.message, aislamientoCorrecto: false };
  }
}

/**
 * MAIN
 */
async function main() {
  const testStartTime = Date.now();

  log(colors.cyan, '\n' + '='.repeat(70));
  log(colors.cyan, '🧪 TEST: EXTRACCION BATCH HYBRID - SOLO EXTRACCION');
  log(colors.cyan, '='.repeat(70));

  let pool;

  try {
    // Conectar a BD
    log(colors.blue, '\n🔌 Conectando a SQL Server...');
    pool = await sql.connect(dbConfig);
    log(colors.green, '✅ Conectado');

    // Paso 1: Inicializar proceso
    const { idProceso, totalFondos } = await inicializarProceso(pool);

    // Paso 2: Ejecutar extracción batch
    const resultadosExtraccion = await ejecutarExtraccionBatch(pool, idProceso);

    // Paso 3: Verificar datos extraídos
    const verificaciones = await verificarDatosExtraidos(pool, idProceso, totalFondos);

    // Paso 4: Verificar aislamiento
    const aislamiento = await verificarAislamiento(pool, idProceso);

    // Resumen final
    const totalTestTime = ((Date.now() - testStartTime) / 1000).toFixed(2);

    log(colors.cyan, '\n' + '='.repeat(70));
    log(colors.cyan, '📊 RESULTADOS FINALES');
    log(colors.cyan, '='.repeat(70));

    log(colors.blue, `\n⏱️  Tiempo total: ${totalTestTime}s`);
    log(colors.blue, `📦 ID_Proceso: ${idProceso}`);
    log(colors.blue, `📁 Fondos procesados: ${totalFondos}`);

    const extraccionExitosa = resultadosExtraccion.filter(r => r.success).length;
    log(colors.blue, `✅ SPs exitosos: ${extraccionExitosa}/${resultadosExtraccion.length}`);

    const tablasConDatos = verificaciones.filter(v => v.totalRegistros > 0).length;
    log(colors.blue, `📊 Tablas con datos: ${tablasConDatos}/${verificaciones.length}`);

    log(colors.blue, `🔒 Aislamiento: ${aislamiento.aislamientoCorrecto ? '✅ CORRECTO' : '❌ FALLIDO'}`);
    log(colors.blue, `📈 Fondos con datos: ${aislamiento.fondosConDatos}/${aislamiento.fondosTotales}`);

    // Evaluación final
    const testPassed =
      extraccionExitosa >= 5 && // Al menos 5 SPs exitosos
      aislamiento.aislamientoCorrecto &&
      tablasConDatos >= 3 && // Al menos 3 tablas con datos
      totalTestTime < 120; // Menos de 2 minutos

    if (testPassed) {
      log(colors.green, '\n🎉 TEST PASSED - Extracción BATCH funcionando correctamente');
    } else {
      log(colors.yellow, '\n⚠️  TEST PARCIAL - Revisar detalles arriba');
    }

    log(colors.cyan, '\n' + '='.repeat(70) + '\n');

    process.exit(testPassed ? 0 : 1);

  } catch (error) {
    log(colors.red, '\n❌ TEST FAILED:', error.message);
    console.error(error);
    log(colors.cyan, '\n' + '='.repeat(70) + '\n');
    process.exit(1);

  } finally {
    if (pool) {
      await pool.close();
      log(colors.gray, '🔌 Conexión cerrada');
    }
  }
}

// Ejecutar test
main();
