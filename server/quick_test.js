/**
 * Quick Test - Verificación Rápida de SPs v2
 *
 * Script simple para verificar que todos los SPs v2 estén creados
 *
 * Uso: node quick_test.js
 */

const sql = require('mssql');

const dbConfig = {
  server: 'localhost',
  database: 'Inteligencia_Producto_Dev',
  options: {
    encrypt: false,
    trustServerCertificate: true,
    enableArithAbort: true,
  },
  authentication: {
    type: 'default',
  },
};

const SPS_V2 = [
  // DERIVADOS
  'staging.DERIV_01_Tratamiento_Posiciones_Larga_Corta_v2',
  'staging.DERIV_02_Homologar_Dimensiones_v2',
  'staging.DERIV_03_Ajuste_Derivados_v2',
  'staging.DERIV_04_Parity_Adjust_v2',
  // PNL
  'staging.PNL_01_Dimensiones_v2',
  'staging.PNL_02_Ajuste_v2',
  'staging.PNL_03_Agrupacion_v2',
  'staging.PNL_04_CrearRegistrosAjusteIPA_v2',
  'staging.PNL_05_Consolidar_IPA_PNL_v2',
  // UBS
  'staging.UBS_01_Tratamiento_Fondos_Luxemburgo_v2',
  'staging.UBS_02_Tratamiento_Derivados_MLCCII_v2',
  'staging.UBS_03_Creacion_Cartera_MLCCII_v2',
];

async function quickTest() {
  let pool;
  let ok = 0;
  let fail = 0;

  try {
    console.log('\n🔍 Verificando SPs v2...\n');
    pool = await sql.connect(dbConfig);

    for (const spName of SPS_V2) {
      const [schema, procedure] = spName.split('.');
      const result = await pool.request().query(`
        SELECT 1
        FROM INFORMATION_SCHEMA.ROUTINES
        WHERE ROUTINE_SCHEMA = '${schema}'
          AND ROUTINE_NAME = '${procedure}'
          AND ROUTINE_TYPE = 'PROCEDURE'
      `);

      if (result.recordset.length > 0) {
        console.log(`✓ ${spName}`);
        ok++;
      } else {
        console.log(`✗ ${spName} - NO EXISTE`);
        fail++;
      }
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`Total: ${ok} OK, ${fail} FAIL`);
    console.log(`${'='.repeat(60)}\n`);

    if (fail === 0) {
      console.log('✅ Todos los SPs v2 están creados!\n');
    } else {
      console.log(`⚠️  Faltan ${fail} SPs por crear.\n`);
    }
  } catch (error) {
    console.error(`\n❌ Error: ${error.message}\n`);
  } finally {
    if (pool) await pool.close();
  }
}

quickTest();
