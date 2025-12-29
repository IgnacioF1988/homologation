const express = require('express');
const router = express.Router();
const { getPoolHomologacion, sql } = require('../config/database');

// GET /api/cola-pendientes - Pendientes con paginación
// Query params: estado, resetEnProceso, page (default 1), limit (default 100, max 500)
router.get('/', async (req, res) => {
  const { estado, resetEnProceso } = req.query;
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(500, Math.max(1, parseInt(req.query.limit) || 100));
  const offset = (page - 1) * limit;

  try {
    const pool = await getPoolHomologacion();

    // Si se pide reset, primero resetear los en_proceso a pendiente
    // EXCEPT: BBG instruments waiting for Bloomberg data (yield_Source = 'BBG')
    if (resetEnProceso === 'true') {
      await pool.request().query(`
        UPDATE sandbox.colaPendientes
        SET estado = 'pendiente'
        WHERE estado = 'en_proceso'
          AND (JSON_VALUE(datosOrigen, '$.yield_Source') != 'BBG'
               OR JSON_VALUE(datosOrigen, '$.yield_Source') IS NULL)
      `);
    }

    // Construir WHERE clause
    let whereClause = '';
    const countRequest = pool.request();
    const dataRequest = pool.request();

    if (estado) {
      whereClause = ' WHERE estado = @estado';
      countRequest.input('estado', sql.NVarChar, estado);
      dataRequest.input('estado', sql.NVarChar, estado);
    }

    // Obtener total
    const countResult = await countRequest.query(
      `SELECT COUNT(*) as total FROM sandbox.colaPendientes${whereClause}`
    );
    const total = countResult.recordset[0].total;

    // Obtener página de datos
    dataRequest.input('limit', sql.Int, limit);
    dataRequest.input('offset', sql.Int, offset);

    const result = await dataRequest.query(`
      SELECT * FROM sandbox.colaPendientes${whereClause}
      ORDER BY id ASC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

    res.json({
      success: true,
      data: result.recordset,
      count: result.recordset.length,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: offset + result.recordset.length < total,
      },
    });
  } catch (err) {
    console.error('Error obteniendo cola pendientes:', err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// POST /api/cola-pendientes/reset-en-proceso - Resetear todos los en_proceso a pendiente
// EXCEPT: BBG instruments waiting for Bloomberg data (yield_Source = 'BBG')
router.post('/reset-en-proceso', async (req, res) => {
  try {
    const pool = await getPoolHomologacion();

    // Contar cuántos hay en_proceso antes del reset (excluding BBG)
    const countBefore = await pool.request().query(`
      SELECT COUNT(*) as count FROM sandbox.colaPendientes
      WHERE estado = 'en_proceso'
        AND (JSON_VALUE(datosOrigen, '$.yield_Source') != 'BBG'
             OR JSON_VALUE(datosOrigen, '$.yield_Source') IS NULL)
    `);

    // Resetear todos los en_proceso a pendiente (excluding BBG)
    await pool.request().query(`
      UPDATE sandbox.colaPendientes
      SET estado = 'pendiente'
      WHERE estado = 'en_proceso'
        AND (JSON_VALUE(datosOrigen, '$.yield_Source') != 'BBG'
             OR JSON_VALUE(datosOrigen, '$.yield_Source') IS NULL)
    `);

    res.json({
      success: true,
      message: `${countBefore.recordset[0].count} registros reseteados de en_proceso a pendiente`,
      reseteados: countBefore.recordset[0].count,
    });
  } catch (err) {
    console.error('Error reseteando estados en_proceso:', err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// GET /api/cola-pendientes/stats - Estadísticas por estado
router.get('/stats', async (req, res) => {
  try {
    const pool = await getPoolHomologacion();

    // Obtener conteo por estado
    const result = await pool.request().query(`
      SELECT
        estado,
        COUNT(*) as cantidad
      FROM sandbox.colaPendientes
      GROUP BY estado
    `);

    // Obtener procesados hoy (completados en el día actual)
    const procesadosHoyResult = await pool.request().query(`
      SELECT COUNT(*) as cantidad
      FROM sandbox.colaPendientes
      WHERE estado = 'completado'
      AND CAST(fechaProcesado AS DATE) = CAST(GETDATE() AS DATE)
    `);

    const stats = {
      pendiente: 0,
      en_proceso: 0,
      completado: 0,
      error: 0,
      total: 0,
      procesadosHoy: procesadosHoyResult.recordset[0]?.cantidad || 0,
    };

    result.recordset.forEach(row => {
      stats[row.estado] = row.cantidad;
      stats.total += row.cantidad;
    });

    res.json({
      success: true,
      data: stats,
    });
  } catch (err) {
    console.error('Error obteniendo estadísticas:', err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// GET /api/cola-pendientes/:id - Pendiente por ID
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const pool = await getPoolHomologacion();
    const result = await pool.request()
      .input('id', sql.Int, parseInt(id))
      .query('SELECT * FROM sandbox.colaPendientes WHERE id = @id');

    if (result.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        error: `Pendiente con id '${id}' no encontrado`,
      });
    }

    res.json({
      success: true,
      data: result.recordset[0],
    });
  } catch (err) {
    console.error('Error obteniendo pendiente:', err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// POST /api/cola-pendientes - Crear nuevo pendiente
router.post('/', async (req, res) => {
  const {
    idInstrumentoOrigen,
    nombreInstrumentoOrigen,
    fuente,
    moneda,
    estado = 'pendiente',
    prioridad = 'normal',
    datosOrigen,
  } = req.body;

  if (!nombreInstrumentoOrigen) {
    return res.status(400).json({
      success: false,
      error: 'Se requiere nombreInstrumentoOrigen',
    });
  }

  try {
    const pool = await getPoolHomologacion();

    const result = await pool.request()
      .input('idInstrumentoOrigen', sql.NVarChar, idInstrumentoOrigen || null)
      .input('nombreInstrumentoOrigen', sql.NVarChar, nombreInstrumentoOrigen)
      .input('nombreFuente', sql.NVarChar, nombreInstrumentoOrigen) // Mantener sincronizado
      .input('fuente', sql.NVarChar, fuente || null)
      .input('moneda', sql.Int, moneda || null)
      .input('estado', sql.NVarChar, estado)
      .input('prioridad', sql.NVarChar, prioridad)
      .input('datosOrigen', sql.NVarChar, datosOrigen ? JSON.stringify(datosOrigen) : null)
      .query(`
        INSERT INTO sandbox.colaPendientes
        (idInstrumentoOrigen, nombreInstrumentoOrigen, nombreFuente, fuente, moneda, estado, prioridad, datosOrigen, fechaIngreso)
        OUTPUT INSERTED.*
        VALUES (@idInstrumentoOrigen, @nombreInstrumentoOrigen, @nombreFuente, @fuente, @moneda, @estado, @prioridad, @datosOrigen, GETDATE())
      `);

    res.status(201).json({
      success: true,
      data: result.recordset[0],
    });
  } catch (err) {
    console.error('Error creando pendiente:', err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// PATCH /api/cola-pendientes/:id/estado - Actualizar estado
router.patch('/:id/estado', async (req, res) => {
  const { id } = req.params;
  const { estado, observaciones } = req.body;

  const estadosValidos = ['pendiente', 'en_proceso', 'completado', 'error'];
  if (!estado || !estadosValidos.includes(estado)) {
    return res.status(400).json({
      success: false,
      error: `Estado inválido. Estados válidos: ${estadosValidos.join(', ')}`,
    });
  }

  try {
    const pool = await getPoolHomologacion();

    // Verificar que existe
    const exists = await pool.request()
      .input('id', sql.Int, parseInt(id))
      .query('SELECT 1 FROM sandbox.colaPendientes WHERE id = @id');

    if (exists.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        error: `Pendiente con id '${id}' no encontrado`,
      });
    }

    const request = pool.request()
      .input('id', sql.Int, parseInt(id))
      .input('estado', sql.NVarChar, estado);

    let query = 'UPDATE sandbox.colaPendientes SET estado = @estado';

    if (observaciones !== undefined) {
      query += ', observaciones = @observaciones';
      request.input('observaciones', sql.NVarChar, observaciones);
    }

    // Si se completa, agregar fecha
    if (estado === 'completado') {
      query += ', fechaProcesado = GETDATE()';
    }

    query += ' WHERE id = @id';

    await request.query(query);

    const updated = await pool.request()
      .input('id', sql.Int, parseInt(id))
      .query('SELECT * FROM sandbox.colaPendientes WHERE id = @id');

    res.json({
      success: true,
      data: updated.recordset[0],
    });
  } catch (err) {
    console.error('Error actualizando estado:', err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// PUT /api/cola-pendientes/:id - Actualizar pendiente completo
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const {
    idInstrumentoOrigen,
    nombreInstrumentoOrigen,
    fuente,
    moneda,
    estado,
    prioridad,
    observaciones,
    instrumentoAsignado,
    datosOrigen,
  } = req.body;

  try {
    const pool = await getPoolHomologacion();

    // Verificar que existe
    const exists = await pool.request()
      .input('id', sql.Int, parseInt(id))
      .query('SELECT 1 FROM sandbox.colaPendientes WHERE id = @id');

    if (exists.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        error: `Pendiente con id '${id}' no encontrado`,
      });
    }

    const request = pool.request();
    request.input('id', sql.Int, parseInt(id));

    let setClauses = [];

    if (idInstrumentoOrigen !== undefined) {
      setClauses.push('idInstrumentoOrigen = @idInstrumentoOrigen');
      request.input('idInstrumentoOrigen', sql.NVarChar, idInstrumentoOrigen);
    }
    if (nombreInstrumentoOrigen !== undefined) {
      setClauses.push('nombreInstrumentoOrigen = @nombreInstrumentoOrigen');
      setClauses.push('nombreFuente = @nombreFuente'); // Mantener sincronizado
      request.input('nombreInstrumentoOrigen', sql.NVarChar, nombreInstrumentoOrigen);
      request.input('nombreFuente', sql.NVarChar, nombreInstrumentoOrigen);
    }
    if (fuente !== undefined) {
      setClauses.push('fuente = @fuente');
      request.input('fuente', sql.NVarChar, fuente);
    }
    if (moneda !== undefined) {
      setClauses.push('moneda = @moneda');
      request.input('moneda', sql.Int, moneda);
    }
    if (estado !== undefined) {
      setClauses.push('estado = @estado');
      request.input('estado', sql.NVarChar, estado);
    }
    if (prioridad !== undefined) {
      setClauses.push('prioridad = @prioridad');
      request.input('prioridad', sql.NVarChar, prioridad);
    }
    if (observaciones !== undefined) {
      setClauses.push('observaciones = @observaciones');
      request.input('observaciones', sql.NVarChar, observaciones);
    }
    if (instrumentoAsignado !== undefined) {
      setClauses.push('instrumentoAsignado = @instrumentoAsignado');
      request.input('instrumentoAsignado', sql.NVarChar, instrumentoAsignado);
    }
    if (datosOrigen !== undefined) {
      setClauses.push('datosOrigen = @datosOrigen');
      request.input('datosOrigen', sql.NVarChar, JSON.stringify(datosOrigen));
    }

    if (setClauses.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No hay campos para actualizar',
      });
    }

    await request.query(`UPDATE sandbox.colaPendientes SET ${setClauses.join(', ')} WHERE id = @id`);

    const updated = await pool.request()
      .input('id', sql.Int, parseInt(id))
      .query('SELECT * FROM sandbox.colaPendientes WHERE id = @id');

    res.json({
      success: true,
      data: updated.recordset[0],
    });
  } catch (err) {
    console.error('Error actualizando pendiente:', err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// DELETE /api/cola-pendientes/:id - Eliminar pendiente (o marcar como completado)
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const { hardDelete = false } = req.query;

  try {
    const pool = await getPoolHomologacion();

    // Verificar que existe
    const exists = await pool.request()
      .input('id', sql.Int, parseInt(id))
      .query('SELECT * FROM sandbox.colaPendientes WHERE id = @id');

    if (exists.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        error: `Pendiente con id '${id}' no encontrado`,
      });
    }

    if (hardDelete === 'true') {
      // Eliminación física
      await pool.request()
        .input('id', sql.Int, parseInt(id))
        .query('DELETE FROM sandbox.colaPendientes WHERE id = @id');

      res.json({
        success: true,
        data: exists.recordset[0],
        message: 'Pendiente eliminado permanentemente',
      });
    } else {
      // Soft delete - marcar como completado
      await pool.request()
        .input('id', sql.Int, parseInt(id))
        .query(`
          UPDATE sandbox.colaPendientes
          SET estado = 'completado', fechaProcesado = GETDATE()
          WHERE id = @id
        `);

      const updated = await pool.request()
        .input('id', sql.Int, parseInt(id))
        .query('SELECT * FROM sandbox.colaPendientes WHERE id = @id');

      res.json({
        success: true,
        data: updated.recordset[0],
        message: 'Pendiente marcado como completado',
      });
    }
  } catch (err) {
    console.error('Error eliminando pendiente:', err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

module.exports = router;
