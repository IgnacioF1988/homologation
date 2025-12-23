const express = require('express');
const router = express.Router();
const { getPoolHomologacion } = require('../config/database');

// Alias para compatibilidad con código existente
const getPool = getPoolHomologacion;

// Mapeo de nombres de catálogos a tablas SQL (esquema cat)
const catalogoTableMap = {
  paises: 'cat.paises',
  monedas: 'cat.monedas',
  sectoresGICS: 'cat.sectoresGICS',
  sectorChile: 'cat.sectorChile',
  investmentTypes: 'cat.investmentTypes',
  issuerTypes: 'cat.issuerTypes',
  issueTypes: 'cat.issueTypes',
  couponTypes: 'cat.couponTypes',
  couponFrequencies: 'cat.couponFrequencies',
  yieldTypes: 'cat.yieldTypes',
  yieldSources: 'cat.yieldSources',
  rankCodes: 'cat.rankCodes',
  dataSources: 'cat.dataSources',
  fuentes: 'cat.fuentes',
  booleanValues: 'cat.booleanValues',
  cashTypes: 'cat.cashTypes',
  bankDebtTypes: 'cat.bankDebtTypes',
  fundTypes: 'cat.fundTypes',
  tiposContinuador: 'cat.tiposContinuador',
};

// GET /api/catalogos - Lista todos los catálogos disponibles
router.get('/', async (req, res) => {
  res.json({
    success: true,
    data: Object.keys(catalogoTableMap),
    count: Object.keys(catalogoTableMap).length,
  });
});

// GET /api/catalogos/:catalogo/options - Lista formateada para dropdowns (id, label)
// IMPORTANTE: Esta ruta debe estar ANTES de /:catalogo/:id para que Express la capture correctamente
router.get('/:catalogo/options', async (req, res) => {
  const { catalogo } = req.params;

  if (!catalogoTableMap[catalogo]) {
    return res.status(400).json({
      success: false,
      error: `Catálogo '${catalogo}' no existe`,
    });
  }

  try {
    const pool = await getPool();
    const tableName = catalogoTableMap[catalogo];
    const result = await pool.request().query(`SELECT * FROM ${tableName} ORDER BY id`);

    // Transformar a formato de options para dropdowns
    const options = result.recordset.map(item => ({
      value: item.id,
      label: item.nombre || item.name || item.descripcion || item.id,
    }));

    res.json({
      success: true,
      data: options,
      count: options.length,
    });
  } catch (err) {
    console.error(`Error obteniendo options de ${catalogo}:`, err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// GET /api/catalogos/:catalogo - Lista completa de un catálogo
router.get('/:catalogo', async (req, res) => {
  const { catalogo } = req.params;

  if (!catalogoTableMap[catalogo]) {
    return res.status(400).json({
      success: false,
      error: `Catálogo '${catalogo}' no existe. Catálogos disponibles: ${Object.keys(catalogoTableMap).join(', ')}`,
    });
  }

  try {
    const pool = await getPool();
    const tableName = catalogoTableMap[catalogo];
    const result = await pool.request().query(`SELECT * FROM ${tableName} ORDER BY id`);

    res.json({
      success: true,
      data: result.recordset,
      count: result.recordset.length,
    });
  } catch (err) {
    console.error(`Error obteniendo catálogo ${catalogo}:`, err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// GET /api/catalogos/:catalogo/:id - Obtener item por ID
router.get('/:catalogo/:id', async (req, res) => {
  const { catalogo, id } = req.params;

  if (!catalogoTableMap[catalogo]) {
    return res.status(400).json({
      success: false,
      error: `Catálogo '${catalogo}' no existe`,
    });
  }

  try {
    const pool = await getPool();
    const tableName = catalogoTableMap[catalogo];
    const result = await pool.request()
      .input('id', id)
      .query(`SELECT * FROM ${tableName} WHERE id = @id`);

    if (result.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        error: `Item con id '${id}' no encontrado en ${catalogo}`,
      });
    }

    res.json({
      success: true,
      data: result.recordset[0],
    });
  } catch (err) {
    console.error(`Error obteniendo item ${id} de ${catalogo}:`, err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

module.exports = router;
