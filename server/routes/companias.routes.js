const express = require('express');
const router = express.Router();
const { getPool, sql } = require('../config/database');

// GET /api/companias - Todas las compañías
router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query('SELECT * FROM stock.companias ORDER BY companyName');

    res.json({
      success: true,
      data: result.recordset,
      count: result.recordset.length,
    });
  } catch (err) {
    console.error('Error obteniendo compañías:', err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// GET /api/companias/search - Búsqueda de compañías
router.get('/search', async (req, res) => {
  const { q = '', limit = 20 } = req.query;

  if (!q || q.length < 2) {
    return res.json({
      success: true,
      data: [],
      count: 0,
    });
  }

  try {
    const pool = await getPool();
    const searchTerm = `%${q}%`;

    const result = await pool.request()
      .input('search', sql.NVarChar, searchTerm)
      .input('limit', sql.Int, parseInt(limit))
      .query(`
        SELECT TOP (@limit) * FROM stock.companias
        WHERE companyName LIKE @search
        ORDER BY
          CASE WHEN companyName LIKE @search + '%' THEN 0 ELSE 1 END,
          companyName
      `);

    res.json({
      success: true,
      data: result.recordset,
      count: result.recordset.length,
    });
  } catch (err) {
    console.error('Error buscando compañías:', err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// GET /api/companias/exacta/:nombre - Búsqueda exacta por nombre (case-insensitive)
router.get('/exacta/:nombre', async (req, res) => {
  const { nombre } = req.params;

  try {
    const pool = await getPool();
    // Usar LOWER() para búsqueda case-insensitive
    const result = await pool.request()
      .input('nombre', sql.NVarChar, nombre.toLowerCase())
      .query('SELECT * FROM stock.companias WHERE LOWER(companyName) = @nombre');

    if (result.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        error: `Compañía '${nombre}' no encontrada`,
      });
    }

    res.json({
      success: true,
      data: result.recordset[0],
    });
  } catch (err) {
    console.error('Error buscando compañía exacta:', err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// GET /api/companias/:id - Compañía por ID
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, parseInt(id))
      .query('SELECT * FROM stock.companias WHERE id = @id');

    if (result.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        error: `Compañía con id '${id}' no encontrada`,
      });
    }

    res.json({
      success: true,
      data: result.recordset[0],
    });
  } catch (err) {
    console.error('Error obteniendo compañía:', err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// POST /api/companias - Crear compañía
router.post('/', async (req, res) => {
  const { companyName, issuerTypeCode, sectorGICS, activo = true, Comentarios } = req.body;

  if (!companyName) {
    return res.status(400).json({
      success: false,
      error: 'El nombre (companyName) es requerido',
    });
  }

  try {
    const pool = await getPool();

    // Verificar si ya existe (case-insensitive)
    const exists = await pool.request()
      .input('companyName', sql.NVarChar, companyName.toLowerCase())
      .query('SELECT 1 FROM stock.companias WHERE LOWER(companyName) = @companyName');

    if (exists.recordset.length > 0) {
      return res.status(409).json({
        success: false,
        error: `Ya existe una compañía con nombre '${companyName}'`,
      });
    }

    const request = pool.request()
      .input('companyName', sql.NVarChar, companyName)
      .input('issuerTypeCode', sql.Int, issuerTypeCode || null)
      .input('sectorGICS', sql.NVarChar, sectorGICS || null)
      .input('activo', sql.Bit, activo ? 1 : 0)
      .input('Comentarios', sql.NVarChar, Comentarios || null)
      .input('Valid_From', sql.Date, new Date('1990-01-01'))
      .input('Valid_To', sql.Date, new Date('2050-12-31'));

    const result = await request.query(`
      INSERT INTO stock.companias (companyName, issuerTypeCode, sectorGICS, activo, Comentarios, fechaCreacion, Valid_From, Valid_To)
      OUTPUT INSERTED.*
      VALUES (@companyName, @issuerTypeCode, @sectorGICS, @activo, @Comentarios, GETDATE(), @Valid_From, @Valid_To)
    `);

    res.status(201).json({
      success: true,
      data: result.recordset[0],
    });
  } catch (err) {
    console.error('Error creando compañía:', err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// PUT /api/companias/:id - Actualizar compañía
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { companyName, issuerTypeCode, sectorGICS, activo, Comentarios } = req.body;

  try {
    const pool = await getPool();

    // Verificar que existe
    const exists = await pool.request()
      .input('id', sql.Int, parseInt(id))
      .query('SELECT 1 FROM stock.companias WHERE id = @id');

    if (exists.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        error: `Compañía con id '${id}' no encontrada`,
      });
    }

    const request = pool.request();
    request.input('id', sql.Int, parseInt(id));

    let setClauses = [];
    if (companyName !== undefined) {
      setClauses.push('companyName = @companyName');
      request.input('companyName', sql.NVarChar, companyName);
    }
    if (issuerTypeCode !== undefined) {
      setClauses.push('issuerTypeCode = @issuerTypeCode');
      request.input('issuerTypeCode', sql.Int, issuerTypeCode);
    }
    if (sectorGICS !== undefined) {
      setClauses.push('sectorGICS = @sectorGICS');
      request.input('sectorGICS', sql.NVarChar, sectorGICS);
    }
    if (activo !== undefined) {
      setClauses.push('activo = @activo');
      request.input('activo', sql.Bit, activo ? 1 : 0);
    }
    if (Comentarios !== undefined) {
      setClauses.push('Comentarios = @Comentarios');
      request.input('Comentarios', sql.NVarChar, Comentarios);
    }

    // Siempre actualizar fechaModificacion
    setClauses.push('fechaModificacion = GETDATE()');

    if (setClauses.length === 1) {
      return res.status(400).json({
        success: false,
        error: 'No hay campos para actualizar',
      });
    }

    await request.query(`UPDATE stock.companias SET ${setClauses.join(', ')} WHERE id = @id`);

    const updated = await pool.request()
      .input('id', sql.Int, parseInt(id))
      .query('SELECT * FROM stock.companias WHERE id = @id');

    res.json({
      success: true,
      data: updated.recordset[0],
    });
  } catch (err) {
    console.error('Error actualizando compañía:', err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// DELETE /api/companias/:id - Eliminar compañía
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const pool = await getPool();

    // Verificar que existe
    const exists = await pool.request()
      .input('id', sql.Int, parseInt(id))
      .query('SELECT * FROM stock.companias WHERE id = @id');

    if (exists.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        error: `Compañía con id '${id}' no encontrada`,
      });
    }

    // Verificar si está siendo usada por instrumentos (campo companyName)
    const inUse = await pool.request()
      .input('companyName', sql.NVarChar, exists.recordset[0].companyName)
      .query('SELECT TOP 1 1 FROM stock.instrumentos WHERE companyName = @companyName');

    if (inUse.recordset.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'No se puede eliminar la compañía porque está siendo usada por instrumentos',
      });
    }

    await pool.request()
      .input('id', sql.Int, parseInt(id))
      .query('DELETE FROM stock.companias WHERE id = @id');

    res.json({
      success: true,
      data: exists.recordset[0],
      message: 'Compañía eliminada correctamente',
    });
  } catch (err) {
    console.error('Error eliminando compañía:', err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

module.exports = router;
