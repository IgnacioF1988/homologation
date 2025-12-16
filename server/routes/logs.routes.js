/**
 * Rutas para consultar logs de ejecuciones
 */

const express = require('express');
const router = express.Router();
const sql = require('mssql');

// Pool para Inteligencia_Producto_Dev
let inteligenciaPool = null;

const getInteligenciaPool = async () => {
  if (inteligenciaPool && inteligenciaPool.connected) {
    return inteligenciaPool;
  }

  const config = {
    server: process.env.DB_SERVER,
    database: 'Inteligencia_Producto_Dev',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT) || 1433,
    options: {
      encrypt: process.env.DB_ENCRYPT === 'true',
      trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true',
      enableArithAbort: true,
    },
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000,
    },
  };

  inteligenciaPool = new sql.ConnectionPool(config);
  await inteligenciaPool.connect();
  console.log('Conectado a Inteligencia_Producto_Dev (logs)');
  return inteligenciaPool;
};

// GET /api/logs/ejecucion/:id - Obtener estado de una ejecución
router.get('/ejecucion/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const pool = await getInteligenciaPool();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT
          Id_Ejecucion,
          Estado,
          Etapa_Actual,
          Fecha_Inicio,
          Fecha_Fin,
          Total_Fondos,
          Fondos_Completados,
          Fondos_Fallidos,
          Fondos_En_Progreso
        FROM logs.Ejecuciones
        WHERE Id_Ejecucion = @id
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        error: `Ejecución ${id} no encontrada`,
      });
    }

    res.json({
      success: true,
      data: result.recordset[0],
    });
  } catch (err) {
    console.error('Error consultando ejecución:', err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// GET /api/logs/ejecucion/:id/fondos - Obtener fondos de una ejecución
router.get('/ejecucion/:id/fondos', async (req, res) => {
  const { id } = req.params;

  try {
    const pool = await getInteligenciaPool();

    // Resumen por estado
    const resumenResult = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT
          Estado,
          COUNT(*) as Cantidad
        FROM logs.Ejecucion_Fondos
        WHERE Id_Ejecucion = @id
        GROUP BY Estado
        ORDER BY Estado
      `);

    // Fondos en progreso
    const enProgresoResult = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT
          Id_Fondo,
          Nombre_Fondo,
          Estado,
          Etapa_Actual,
          Ultima_Actualizacion
        FROM logs.Ejecucion_Fondos
        WHERE Id_Ejecucion = @id
          AND Estado = 'EN_PROGRESO'
        ORDER BY Ultima_Actualizacion DESC
      `);

    // Distribución de etapas
    const etapasResult = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT
          Etapa_Actual,
          COUNT(*) as Cantidad
        FROM logs.Ejecucion_Fondos
        WHERE Id_Ejecucion = @id
        GROUP BY Etapa_Actual
        ORDER BY Cantidad DESC
      `);

    res.json({
      success: true,
      data: {
        resumenPorEstado: resumenResult.recordset,
        fondosEnProgreso: enProgresoResult.recordset,
        distribucionEtapas: etapasResult.recordset,
      },
    });
  } catch (err) {
    console.error('Error consultando fondos:', err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// GET /api/logs/ejecucion/:id/mensajes - Obtener mensajes de log
router.get('/ejecucion/:id/mensajes', async (req, res) => {
  const { id } = req.params;
  const { nivel, etapa, limit = 100 } = req.query;

  try {
    const pool = await getInteligenciaPool();
    let query = `
      SELECT TOP ${parseInt(limit)}
        Fecha,
        Nivel,
        Mensaje,
        Id_Fondo,
        Etapa,
        Detalles
      FROM logs.Ejecucion_Logs
      WHERE Id_Ejecucion = @id
    `;

    if (nivel) {
      query += ` AND Nivel = @nivel`;
    }

    if (etapa) {
      query += ` AND Etapa = @etapa`;
    }

    query += ` ORDER BY Fecha DESC`;

    const request = pool.request().input('id', sql.Int, id);

    if (nivel) {
      request.input('nivel', sql.VarChar, nivel);
    }

    if (etapa) {
      request.input('etapa', sql.VarChar, etapa);
    }

    const result = await request.query(query);

    res.json({
      success: true,
      data: result.recordset,
    });
  } catch (err) {
    console.error('Error consultando mensajes:', err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// GET /api/logs/ejecucion/:id/analisis - Análisis completo de una ejecución
router.get('/ejecucion/:id/analisis', async (req, res) => {
  const { id } = req.params;

  try {
    const pool = await getInteligenciaPool();

    // 1. Estado de la ejecución
    const ejecucionResult = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT
          Id_Ejecucion,
          Estado,
          Etapa_Actual,
          Fecha_Inicio,
          Fecha_Fin,
          Total_Fondos,
          Fondos_Completados,
          Fondos_Fallidos,
          Fondos_En_Progreso
        FROM logs.Ejecuciones
        WHERE Id_Ejecucion = @id
      `);

    if (ejecucionResult.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        error: `Ejecución ${id} no encontrada`,
      });
    }

    // 2. Resumen de estados de fondos
    const resumenEstadosResult = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT
          Estado,
          COUNT(*) as Cantidad
        FROM logs.Ejecucion_Fondos
        WHERE Id_Ejecucion = @id
        GROUP BY Estado
        ORDER BY Estado
      `);

    // 3. Fondos en progreso
    const fondosEnProgresoResult = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT
          Id_Fondo,
          Nombre_Fondo,
          Estado,
          Etapa_Actual,
          Ultima_Actualizacion
        FROM logs.Ejecucion_Fondos
        WHERE Id_Ejecucion = @id
          AND Estado = 'EN_PROGRESO'
        ORDER BY Ultima_Actualizacion DESC
      `);

    // 4. Mensajes de error
    const erroresResult = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT TOP 20
          Fecha,
          Nivel,
          Mensaje,
          Id_Fondo,
          Etapa,
          Detalles
        FROM logs.Ejecucion_Logs
        WHERE Id_Ejecucion = @id
          AND Nivel = 'ERROR'
        ORDER BY Fecha DESC
      `);

    // 5. Mensajes de warning
    const warningsResult = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT TOP 20
          Fecha,
          Nivel,
          Mensaje,
          Id_Fondo,
          Etapa,
          Detalles
        FROM logs.Ejecucion_Logs
        WHERE Id_Ejecucion = @id
          AND Nivel = 'WARNING'
        ORDER BY Fecha DESC
      `);

    // 6. Últimos mensajes después de PNL
    const afterPNLResult = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT TOP 30
          Fecha,
          Nivel,
          Mensaje,
          Id_Fondo,
          Etapa,
          Detalles
        FROM logs.Ejecucion_Logs
        WHERE Id_Ejecucion = @id
          AND Etapa IN ('PNL', 'FINALIZACION', 'COMPLETADO', 'ERROR')
        ORDER BY Fecha DESC
      `);

    // 7. Distribución de etapas
    const etapasResult = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT
          Etapa_Actual,
          COUNT(*) as Cantidad
        FROM logs.Ejecucion_Fondos
        WHERE Id_Ejecucion = @id
        GROUP BY Etapa_Actual
        ORDER BY Cantidad DESC
      `);

    res.json({
      success: true,
      data: {
        ejecucion: ejecucionResult.recordset[0],
        resumenEstados: resumenEstadosResult.recordset,
        fondosEnProgreso: fondosEnProgresoResult.recordset,
        errores: erroresResult.recordset,
        warnings: warningsResult.recordset,
        mensajesDespuesPNL: afterPNLResult.recordset,
        distribucionEtapas: etapasResult.recordset,
      },
    });
  } catch (err) {
    console.error('Error en análisis:', err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

module.exports = router;
