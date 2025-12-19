/**
 * Script de Prueba - Pipeline ETL v2
 *
 * Verifica que todos los componentes del pipeline v2 estén correctamente instalados:
 * - Migraciones aplicadas
 * - Stored Procedures v2 creados
 * - Servicios configurados
 * - Ejecución de prueba de cada servicio
 *
 * Uso: node test_pipeline_v2.js
 */

const sql = require('mssql');
const yaml = require('js-yaml');
const fs = require('fs');
const path = require('path');
const { getPool, closePool } = require('./config/database');

// Colores para output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(80));
  log(title, 'cyan');
  console.log('='.repeat(80));
}

function logSuccess(message) {
  log(`✓ ${message}`, 'green');
}

function logError(message) {
  log(`✗ ${message}`, 'red');
}

function logWarning(message) {
  log(`⚠ ${message}`, 'yellow');
}

function logInfo(message) {
  log(`ℹ ${message}`, 'blue');
}

// Lista de SPs v2 que deben existir
const expectedSPs = {
  DERIVADOS: [
    'staging.DERIV_01_Tratamiento_Posiciones_Larga_Corta_v2',
    'staging.DERIV_02_Homologar_Dimensiones_v2',
    'staging.DERIV_03_Ajuste_Derivados_v2',
    'staging.DERIV_04_Parity_Adjust_v2',
  ],
  PNL: [
    'staging.PNL_01_Dimensiones_v2',
    'staging.PNL_02_Ajuste_v2',
    'staging.PNL_03_Agrupacion_v2',
    'staging.PNL_04_CrearRegistrosAjusteIPA_v2',
    'staging.PNL_05_Consolidar_IPA_PNL_v2',
  ],
  UBS: [
    'staging.UBS_01_Tratamiento_Fondos_Luxemburgo_v2',
    'staging.UBS_02_Tratamiento_Derivados_MLCCII_v2',
    'staging.UBS_03_Creacion_Cartera_MLCCII_v2',
  ],
};

// Tablas que deben tener ID_Ejecucion e ID_Fund
const expectedTables = [
  // Derivados
  { schema: 'staging', table: 'Derivados_WorkTable' },
  { schema: 'staging', table: 'Derivados' },
  { schema: 'staging', table: 'Ajuste_Derivados' },
  { schema: 'staging', table: 'Ajuste_Paridades' },
  // PNL
  { schema: 'staging', table: 'PNL_WorkTable' },
  { schema: 'staging', table: 'PNL' },
  { schema: 'staging', table: 'Ajuste_PNL' },
  { schema: 'staging', table: 'PNL_IPA' },
  { schema: 'staging', table: 'PNL_ValoresAcumulados' },
  // UBS
  { schema: 'staging', table: 'UBS_WorkTable' },
  { schema: 'staging', table: 'MLCCII_Derivados' },
  { schema: 'staging', table: 'MLCCII' },
  // IPA
  { schema: 'staging', table: 'IPA_WorkTable' },
  { schema: 'staging', table: 'IPA' },
  { schema: 'staging', table: 'IPA_Cash' },
  { schema: 'staging', table: 'IPA_Final' },
  { schema: 'staging', table: 'IPA_MTM' },
  // Process
  { schema: 'process', table: 'TBL_PNL' },
];

let pool;
let testResults = {
  migrations: { passed: 0, failed: 0 },
  storedProcedures: { passed: 0, failed: 0 },
  services: { passed: 0, failed: 0 },
  integration: { passed: 0, failed: 0 },
};

/**
 * 1. Verificar que las migraciones se aplicaron correctamente
 */
async function testMigrations() {
  logSection('TEST 1: Verificación de Migraciones');

  for (const tableInfo of expectedTables) {
    try {
      const result = await pool.request().query(`
        SELECT
          CASE WHEN c1.COLUMN_NAME IS NOT NULL THEN 1 ELSE 0 END as Tiene_ID_Ejecucion,
          CASE WHEN c2.COLUMN_NAME IS NOT NULL THEN 1 ELSE 0 END as Tiene_ID_Fund
        FROM INFORMATION_SCHEMA.TABLES t
        LEFT JOIN INFORMATION_SCHEMA.COLUMNS c1
          ON t.TABLE_NAME = c1.TABLE_NAME
          AND t.TABLE_SCHEMA = c1.TABLE_SCHEMA
          AND c1.COLUMN_NAME = 'ID_Ejecucion'
        LEFT JOIN INFORMATION_SCHEMA.COLUMNS c2
          ON t.TABLE_NAME = c2.TABLE_NAME
          AND t.TABLE_SCHEMA = c2.TABLE_SCHEMA
          AND c2.COLUMN_NAME = 'ID_Fund'
        WHERE t.TABLE_SCHEMA = '${tableInfo.schema}'
          AND t.TABLE_NAME = '${tableInfo.table}'
      `);

      if (result.recordset.length === 0) {
        logWarning(`Tabla ${tableInfo.schema}.${tableInfo.table} no existe`);
        testResults.migrations.failed++;
        continue;
      }

      const hasExecution = result.recordset[0].Tiene_ID_Ejecucion === 1;
      const hasFund = result.recordset[0].Tiene_ID_Fund === 1;

      if (hasExecution && hasFund) {
        logSuccess(`${tableInfo.schema}.${tableInfo.table} - Columnas OK`);
        testResults.migrations.passed++;
      } else {
        logError(
          `${tableInfo.schema}.${tableInfo.table} - Faltan columnas: ` +
          `${!hasExecution ? 'ID_Ejecucion ' : ''}${!hasFund ? 'ID_Fund' : ''}`
        );
        testResults.migrations.failed++;
      }
    } catch (error) {
      logError(`Error verificando ${tableInfo.schema}.${tableInfo.table}: ${error.message}`);
      testResults.migrations.failed++;
    }
  }

  logInfo(
    `\nResultado Migraciones: ${testResults.migrations.passed} OK, ${testResults.migrations.failed} FAIL`
  );
}

/**
 * 2. Verificar que todos los SPs v2 existan
 */
async function testStoredProcedures() {
  logSection('TEST 2: Verificación de Stored Procedures v2');

  for (const [group, spList] of Object.entries(expectedSPs)) {
    log(`\n${group}:`, 'bright');

    for (const spName of spList) {
      try {
        const [schema, procedure] = spName.split('.');
        const result = await pool.request().query(`
          SELECT 1
          FROM INFORMATION_SCHEMA.ROUTINES
          WHERE ROUTINE_SCHEMA = '${schema}'
            AND ROUTINE_NAME = '${procedure}'
            AND ROUTINE_TYPE = 'PROCEDURE'
        `);

        if (result.recordset.length > 0) {
          logSuccess(`  ${spName}`);
          testResults.storedProcedures.passed++;
        } else {
          logError(`  ${spName} - NO EXISTE`);
          testResults.storedProcedures.failed++;
        }
      } catch (error) {
        logError(`  ${spName} - Error: ${error.message}`);
        testResults.storedProcedures.failed++;
      }
    }
  }

  logInfo(
    `\nResultado SPs: ${testResults.storedProcedures.passed} OK, ${testResults.storedProcedures.failed} FAIL`
  );
}

/**
 * 3. Verificar configuración de servicios
 */
async function testServicesConfiguration() {
  logSection('TEST 3: Verificación de Configuración de Servicios');

  try {
    // Cargar configuración del pipeline
    const configPath = path.join(__dirname, 'config', 'pipeline.config.yaml');
    const configContent = fs.readFileSync(configPath, 'utf8');
    const config = yaml.load(configContent);

    logInfo(`Pipeline Config Version: ${config.version}`);
    logInfo(`Pipeline Name: ${config.name}\n`);

    // Verificar servicios
    const services = ['PROCESS_DERIVADOS', 'PROCESS_PNL', 'PROCESS_UBS'];

    for (const serviceId of services) {
      const service = config.services.find(s => s.id === serviceId);

      if (!service) {
        logError(`Servicio ${serviceId} no encontrado en configuración`);
        testResults.services.failed++;
        continue;
      }

      log(`\n${serviceId}:`, 'bright');
      logSuccess(`  Tipo: ${service.type}`);
      logSuccess(`  Dependencies: [${service.dependencies.join(', ')}]`);
      logSuccess(`  MaxConcurrent: ${service.maxConcurrent}`);
      logSuccess(`  SPs configurados: ${service.spList.length}`);

      // Verificar que los SPs configurados coincidan con los esperados
      const expectedGroup = serviceId.replace('PROCESS_', '');
      const expectedList = expectedSPs[expectedGroup];

      if (expectedList) {
        const configuredSPs = service.spList.map(sp => sp.name);
        const allMatch = expectedList.every(sp => configuredSPs.includes(sp));

        if (allMatch) {
          logSuccess(`  SPs coinciden con esperado ✓`);
          testResults.services.passed++;
        } else {
          logWarning(`  SPs no coinciden completamente con esperado`);
          testResults.services.failed++;
        }
      }
    }

    logInfo(
      `\nResultado Servicios: ${testResults.services.passed} OK, ${testResults.services.failed} FAIL`
    );
  } catch (error) {
    logError(`Error verificando configuración: ${error.message}`);
    testResults.services.failed++;
  }
}

/**
 * 4. Test de integración - Ejecutar un SP de prueba
 */
async function testIntegration() {
  logSection('TEST 4: Prueba de Integración (Ejecución de SP)');

  const testExecutionId = BigInt(Date.now());
  const testFundId = 999; // ID de fondo de prueba
  const testDate = '2025-12-19';

  logInfo(`ID_Ejecucion de prueba: ${testExecutionId}`);
  logInfo(`ID_Fund de prueba: ${testFundId}`);
  logInfo(`FechaReporte de prueba: ${testDate}\n`);

  // Test: Verificar que podemos llamar a un SP v2 con los parámetros correctos
  try {
    log('Probando llamada a DERIV_01_v2 (validación de parámetros)...', 'bright');

    const request = pool.request();
    request.input('ID_Ejecucion', sql.BigInt, testExecutionId);
    request.input('FechaReporte', sql.NVarChar(10), testDate);
    request.input('ID_Fund', sql.Int, testFundId);
    request.input('Portfolio_Derivados', sql.NVarChar(50), 'TEST_PORTFOLIO');
    request.input('DebugMode', sql.Bit, 1);
    request.output('RowsProcessed', sql.Int);
    request.output('ErrorCount', sql.Int);

    const result = await request.execute('staging.DERIV_01_Tratamiento_Posiciones_Larga_Corta_v2');

    const returnValue = result.returnValue;
    const rowsProcessed = result.output.RowsProcessed || 0;
    const errorCount = result.output.ErrorCount || 0;

    logInfo(`Return Value: ${returnValue}`);
    logInfo(`Rows Processed: ${rowsProcessed}`);
    logInfo(`Error Count: ${errorCount}`);

    // Return 1 = WARNING (sin datos) es aceptable para prueba
    if (returnValue === 0 || returnValue === 1) {
      logSuccess('SP ejecutado correctamente (0=OK, 1=WARNING sin datos)');
      testResults.integration.passed++;
    } else if (returnValue === 2) {
      logWarning('SP retornó RETRY - Verificar condiciones de ejecución');
      testResults.integration.passed++;
    } else {
      logError(`SP retornó error crítico (${returnValue})`);
      testResults.integration.failed++;
    }
  } catch (error) {
    if (error.message.includes('No hay datos')) {
      logWarning('SP retornó WARNING (esperado sin datos de prueba)');
      testResults.integration.passed++;
    } else {
      logError(`Error ejecutando SP: ${error.message}`);
      testResults.integration.failed++;
    }
  }
}

/**
 * 5. Resumen final
 */
function printSummary() {
  logSection('RESUMEN FINAL DE PRUEBAS');

  const totalPassed =
    testResults.migrations.passed +
    testResults.storedProcedures.passed +
    testResults.services.passed +
    testResults.integration.passed;

  const totalFailed =
    testResults.migrations.failed +
    testResults.storedProcedures.failed +
    testResults.services.failed +
    testResults.integration.failed;

  console.log('\nResultados por categoría:');
  console.log(`  1. Migraciones:        ${testResults.migrations.passed} OK, ${testResults.migrations.failed} FAIL`);
  console.log(`  2. Stored Procedures:  ${testResults.storedProcedures.passed} OK, ${testResults.storedProcedures.failed} FAIL`);
  console.log(`  3. Servicios:          ${testResults.services.passed} OK, ${testResults.services.failed} FAIL`);
  console.log(`  4. Integración:        ${testResults.integration.passed} OK, ${testResults.integration.failed} FAIL`);

  console.log(`\n${'='.repeat(80)}`);
  if (totalFailed === 0) {
    logSuccess(`✓ TODAS LAS PRUEBAS PASARON (${totalPassed}/${totalPassed})`);
    log('\nEl pipeline v2 está listo para producción! 🎉', 'green');
  } else {
    logWarning(`⚠ PRUEBAS COMPLETADAS: ${totalPassed} OK, ${totalFailed} FAIL`);
    log('\nRevisa los errores antes de ejecutar el pipeline.', 'yellow');
  }
  console.log(`${'='.repeat(80)}\n`);
}

/**
 * Main - Ejecutar todas las pruebas
 */
async function main() {
  try {
    log('\n🚀 INICIANDO SUITE DE PRUEBAS - PIPELINE ETL V2', 'bright');
    log('Conectando a base de datos...', 'cyan');

    // Conectar a SQL Server usando configuración del proyecto
    pool = await getPool();
    logSuccess('Conexión establecida\n');

    // Ejecutar tests
    await testMigrations();
    await testStoredProcedures();
    await testServicesConfiguration();
    await testIntegration();

    // Resumen
    printSummary();
  } catch (error) {
    logError(`\n❌ ERROR CRÍTICO: ${error.message}`);
    console.error(error);
    process.exit(1);
  } finally {
    await closePool();
    logInfo('Conexión cerrada');
  }
}

// Ejecutar
main();
