const express = require('express');
const router = express.Router();
const { getPool, sql } = require('../config/database');

// Mapeo de campos frontend → columnas BD
// El frontend usa los mismos nombres que la BD, pero algunos campos legacy pueden venir diferentes
const fieldMapping = {
  // Campos que podrían venir con nombres legacy
  'investmentType': 'investmentTypeCode',
  'issuerType': 'issuerTypeCode',
  'issueType': 'issueTypeCode',
  'couponType': 'couponTypeCode',
  'compania': 'companyName',
  'bbgTicker': 'tickerBBG',
  'dataSource': 'publicDataSource',
  'cashType': 'cashTypeCode',
  'bankDebtType': 'bankDebtTypeCode',
  'fundType': 'fundTypeCode',
};

// Función para normalizar nombres de campos (frontend → BD)
function normalizeFieldName(field) {
  return fieldMapping[field] || field;
}

// Función para normalizar objeto de datos
function normalizeData(data) {
  const normalized = {};
  for (const [key, value] of Object.entries(data)) {
    const normalizedKey = normalizeFieldName(key);
    normalized[normalizedKey] = value;
  }
  return normalized;
}

// GET /api/instrumentos - Instrumentos con paginación
// Query params: page (default 1), limit (default 100, max 500), orderBy (default 'idInstrumento'), order (default 'ASC')
router.get('/', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit) || 100));
    const offset = (page - 1) * limit;
    const orderBy = req.query.orderBy || 'idInstrumento';
    const order = (req.query.order || 'ASC').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    // Validar columna de ordenamiento para evitar SQL injection
    const validColumns = ['idInstrumento', 'moneda', 'nameInstrumento', 'fechaCreacion', 'companyName'];
    const safeOrderBy = validColumns.includes(orderBy) ? orderBy : 'idInstrumento';

    const pool = await getPool();

    // Obtener total de registros (solo una vez, cacheable en frontend)
    const countResult = await pool.request().query(
      'SELECT COUNT(*) as total FROM stock.instrumentos'
    );
    const total = countResult.recordset[0].total;

    // Obtener página de datos ordenados por ID ascendente por defecto
    const result = await pool.request()
      .input('limit', sql.Int, limit)
      .input('offset', sql.Int, offset)
      .query(`
        SELECT * FROM stock.instrumentos
        ORDER BY ${safeOrderBy} ${order}
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
    console.error('Error obteniendo instrumentos:', err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// GET /api/instrumentos/search - Búsqueda de instrumentos con paginación
router.get('/search', async (req, res) => {
  const { q = '', limit = 50, page = 1 } = req.query;

  try {
    const pool = await getPool();
    const searchTerm = `%${q}%`;
    const parsedLimit = Math.min(100, Math.max(1, parseInt(limit)));
    const parsedPage = Math.max(1, parseInt(page));
    const offset = (parsedPage - 1) * parsedLimit;

    const result = await pool.request()
      .input('search', sql.NVarChar, searchTerm)
      .input('limit', sql.Int, parsedLimit)
      .input('offset', sql.Int, offset)
      .query(`
        SELECT *
        FROM stock.instrumentos
        WHERE CAST(idInstrumento AS NVARCHAR) LIKE @search
           OR nameInstrumento LIKE @search
           OR companyName LIKE @search
           OR isin LIKE @search
           OR cusip LIKE @search
           OR sedol LIKE @search
           OR tickerBBG LIKE @search
        ORDER BY idInstrumento ASC
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
      `);

    res.json({
      success: true,
      data: result.recordset,
      count: result.recordset.length,
      pagination: {
        page: parsedPage,
        limit: parsedLimit,
      },
    });
  } catch (err) {
    console.error('Error buscando instrumentos:', err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// GET /api/instrumentos/check-duplicate - Validar duplicados
router.get('/check-duplicate', async (req, res) => {
  const { field, value, excludeId, excludeMoneda } = req.query;

  if (!field || !value) {
    return res.status(400).json({
      success: false,
      error: 'Se requieren los parámetros field y value',
    });
  }

  // Campos válidos para verificar duplicados (nombres reales de columnas en BD)
  const validFields = ['isin', 'cusip', 'sedol', 'tickerBBG', 'idInstrumento', 'nameInstrumento'];
  if (!validFields.includes(field)) {
    return res.status(400).json({
      success: false,
      error: `Campo '${field}' no válido. Campos permitidos: ${validFields.join(', ')}`,
    });
  }

  try {
    const pool = await getPool();
    let query = `SELECT idInstrumento, moneda, nameInstrumento, ${field} FROM stock.instrumentos WHERE ${field} = @value`;

    const request = pool.request().input('value', sql.NVarChar, value);

    if (excludeId) {
      query += ' AND (idInstrumento != @excludeId';
      request.input('excludeId', sql.NVarChar, excludeId);

      if (excludeMoneda) {
        query += ' OR moneda != @excludeMoneda';
        request.input('excludeMoneda', sql.Int, parseInt(excludeMoneda));
      }
      query += ')';
    }

    const result = await request.query(query);

    res.json({
      success: true,
      isDuplicate: result.recordset.length > 0,
      data: result.recordset,
    });
  } catch (err) {
    console.error('Error verificando duplicado:', err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// GET /api/instrumentos/stats/by-investment-type - Estadísticas por tipo de inversión
router.get('/stats/by-investment-type', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT 
        investmentTypeCode,
        COUNT(*) as cantidad,
        COUNT(DISTINCT companyName) as companias_unicas
      FROM stock.instrumentos
      GROUP BY investmentTypeCode
      ORDER BY cantidad DESC
    `);

    res.json({
      success: true,
      data: result.recordset,
    });
  } catch (err) {
    console.error('Error obteniendo estadísticas por investment type:', err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// GET /api/instrumentos/stats/by-country - Estadísticas por país
router.get('/stats/by-country', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT 
        riskCountry,
        COUNT(*) as cantidad
      FROM stock.instrumentos
      GROUP BY riskCountry
      ORDER BY cantidad DESC
    `);

    res.json({
      success: true,
      data: result.recordset,
    });
  } catch (err) {
    console.error('Error obteniendo estadísticas por país:', err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// GET /api/instrumentos/stats/by-sector - Estadísticas por sector
router.get('/stats/by-sector', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT 
        sectorGICS,
        COUNT(*) as cantidad
      FROM stock.instrumentos
      WHERE sectorGICS IS NOT NULL AND sectorGICS != ''
      GROUP BY sectorGICS
      ORDER BY cantidad DESC
    `);

    res.json({
      success: true,
      data: result.recordset,
    });
  } catch (err) {
    console.error('Error obteniendo estadísticas por sector:', err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// GET /api/instrumentos/stats/summary - Resumen general
router.get('/stats/summary', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT 
        COUNT(*) as total_instrumentos,
        COUNT(DISTINCT idInstrumento) as ids_unicos,
        COUNT(DISTINCT companyName) as companias_unicas,
        COUNT(DISTINCT moneda) as monedas_diferentes,
        MIN(fechaCreacion) as fecha_primer_registro,
        MAX(fechaCreacion) as fecha_ultimo_registro
      FROM stock.instrumentos
    `);

    res.json({
      success: true,
      data: result.recordset[0],
    });
  } catch (err) {
    console.error('Error obteniendo resumen general:', err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// GET /api/instrumentos/next-id - Obtener el siguiente ID disponible
router.get('/next-id', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT ISNULL(MAX(idInstrumento), 0) + 1 as nextId
      FROM stock.instrumentos
    `);

    res.json({
      success: true,
      data: { nextId: result.recordset[0].nextId },
    });
  } catch (err) {
    console.error('Error obteniendo siguiente ID:', err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// GET /api/instrumentos/:id - Instrumento por ID (todos los registros con ese ID)
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.NVarChar, id)
      .query('SELECT * FROM stock.instrumentos WHERE idInstrumento = @id');

    if (result.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        error: `Instrumento con id '${id}' no encontrado`,
      });
    }

    res.json({
      success: true,
      data: result.recordset.length === 1 ? result.recordset[0] : result.recordset,
    });
  } catch (err) {
    console.error('Error obteniendo instrumento:', err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// GET /api/instrumentos/:id/moneda/:moneda - Instrumento por PK compuesta
router.get('/:id/moneda/:moneda', async (req, res) => {
  const { id, moneda } = req.params;

  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.NVarChar, id)
      .input('moneda', sql.Int, parseInt(moneda))
      .query('SELECT * FROM stock.instrumentos WHERE idInstrumento = @id AND moneda = @moneda');

    if (result.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        error: `Instrumento con id '${id}' y moneda '${moneda}' no encontrado`,
      });
    }

    res.json({
      success: true,
      data: result.recordset[0],
    });
  } catch (err) {
    console.error('Error obteniendo instrumento:', err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// POST /api/instrumentos - Crear instrumento
router.post('/', async (req, res) => {
  // Normalizar nombres de campos (por si vienen con nombres legacy)
  const data = normalizeData(req.body);

  // Limpiar campos problemáticos ANTES de procesar
  // Todos los campos nchar(1) deben limpiarse si son false/vacío
  const nchar1Fields = ['esReestructuracion', 'emisionNacional', 'perpetuidad', 'rendimiento', 'coco', 'callable', 'sinkable'];
  nchar1Fields.forEach(field => {
    if (data[field] === false || data[field] === 'false' || data[field] === '') {
      delete data[field];
    }
  });
  // esInstrumentoNuevo es solo frontend, no existe en BD
  delete data.esInstrumentoNuevo;

  console.log('[POST /instrumentos] Datos recibidos (normalizados):', JSON.stringify(data, null, 2));

  if (!data.idInstrumento || !data.moneda) {
    return res.status(400).json({
      success: false,
      error: 'Se requieren idInstrumento y moneda',
    });
  }

  // =========================================================================
  // GATE: Reject BBG fixed income - must go through colaPendientes queue
  // Fixed income (investmentTypeCode=1) with yield_Source='BBG' requires
  // Bloomberg characteristics (coco, callable, sinkable, yas_yld_flag) that
  // are only available after the BBG worker processes the instrument.
  // =========================================================================
  const isBBGFixedIncome =
    parseInt(data.investmentTypeCode) === 1 &&
    (data.yieldSource === 'BBG' || data.yieldSource === 'Bloomberg');

  if (isBBGFixedIncome) {
    console.log('[POST /instrumentos] GATE: Rejecting BBG fixed income - must use colaPendientes queue');
    return res.status(400).json({
      success: false,
      error: 'Los instrumentos de renta fija con fuente BBG deben crearse a través de la cola de homologación',
      errorEn: 'BBG fixed income instruments must be created through the homologation queue (colaPendientes)',
      code: 'BBG_REQUIRES_QUEUE',
      suggestion: 'Use the instrument form with source="colaPendientes" to create this instrument',
    });
  }

  try {
    const pool = await getPool();

    // Verificar si ya existe
    const exists = await pool.request()
      .input('id', sql.Int, parseInt(data.idInstrumento))
      .input('moneda', sql.Int, parseInt(data.moneda))
      .query('SELECT 1 FROM stock.instrumentos WHERE idInstrumento = @id AND moneda = @moneda');

    if (exists.recordset.length > 0) {
      return res.status(409).json({
        success: false,
        error: `Ya existe un instrumento con id '${data.idInstrumento}' y moneda '${data.moneda}'`,
      });
    }

    const request = pool.request();

    // Campos válidos según el esquema de la BD (stock.instrumentos)
    const validFields = [
      'idInstrumento', 'moneda', 'subId', 'nombreFuente', 'fuente',
      'investmentTypeCode', 'nameInstrumento', 'companyName', 'issuerTypeCode',
      'sectorGICS', 'issueTypeCode', 'sectorChileTypeCode', 'publicDataSource',
      'isin', 'tickerBBG', 'sedol', 'cusip',
      'issueCountry', 'riskCountry', 'issueCurrency', 'riskCurrency', 'emisionNacional',
      'couponTypeCode', 'yieldType', 'yieldSource', 'perpetuidad', 'rendimiento',
      'couponFrequency', 'coco', 'callable', 'sinkable', 'yasYldFlag',
      'rankCode', 'cashTypeCode', 'bankDebtTypeCode', 'fundTypeCode',
      'esReestructuracion', 'idPredecesor', 'monedaPredecesor', 'tipoContinuador', 'diaValidez',
      'comentarios', 'fechaCreacion', 'fechaModificacion', 'usuarioCreacion', 'usuarioModificacion',
      'Valid_From', 'Valid_To'
    ];

    // Campos que son FK a catálogos o INT (deben ser INT o NULL, no strings vacíos)
    const fkFields = [
      'investmentTypeCode', 'issuerTypeCode', 'issueTypeCode', 'couponTypeCode',
      'couponFrequency', 'rankCode', 'cashTypeCode', 'bankDebtTypeCode', 'fundTypeCode',
      'sectorChileTypeCode', 'tipoContinuador', 'issueCurrency', 'riskCurrency',
      'idPredecesor', 'monedaPredecesor', 'subId'
    ];

    // Campos que son NVARCHAR (no INT ni NCHAR(1))
    const nvarcharFields = [
      'nombreFuente', 'fuente', 'nameInstrumento', 'companyName',
      'sectorGICS', 'publicDataSource', 'isin', 'tickerBBG', 'sedol', 'cusip',
      'issueCountry', 'riskCountry', 'yieldType', 'yieldSource', 'yasYldFlag',
      'comentarios', 'usuarioCreacion', 'usuarioModificacion'
    ];

    // Campos que son NCHAR(1) - booleanos como 'S'/'N'
    const nchar1Fields = ['esReestructuracion', 'emisionNacional', 'perpetuidad', 'rendimiento', 'coco', 'callable', 'sinkable'];

    let insertFields = [];
    let insertValues = [];

    validFields.forEach(field => {
      if (data[field] === undefined) return;

      let value = data[field];

      // Para campos FK, omitir strings vacíos o null
      if (fkFields.includes(field) && (value === '' || value === null)) {
        return; // No incluir campos FK vacíos en INSERT
      }

      // Para campos NVARCHAR, omitir strings vacíos (convertir a null si es necesario)
      if (nvarcharFields.includes(field) && (value === '' || value === null)) {
        return; // No incluir campos NVARCHAR vacíos en INSERT
      }

      // Campos NCHAR(1): convertir booleano a 'S'/'N'
      if (nchar1Fields.includes(field)) {
        if (value === '' || value === null || value === false || value === 'false') {
          return; // No incluir si es falso/vacío
        }
        // Convertir true/1/'S' a 'S'
        value = (value === true || value === 'true' || value === 1 || value === '1' || value === 'S') ? 'S' : 'N';
      }

      insertFields.push(field);
      insertValues.push(`@${field}`);

      // Determinar tipo SQL según el campo
      if (field === 'idInstrumento' || field === 'moneda' || fkFields.includes(field)) {
        // Campos INT
        request.input(field, sql.Int, value === '' ? null : parseInt(value));
      } else if (field === 'diaValidez') {
        // Campo DATE
        request.input(field, sql.Date, value ? new Date(value) : null);
      } else if (field.includes('fecha')) {
        // Campos DATETIME
        request.input(field, sql.DateTime, value ? new Date(value) : null);
      } else if (nchar1Fields.includes(field)) {
        // Campos NCHAR(1) - booleanos
        request.input(field, sql.NChar(1), value);
      } else {
        // Campos NVARCHAR
        request.input(field, sql.NVarChar, value);
      }
    });

    // Agregar fechas automáticas si no vienen
    if (!data.fechaCreacion) {
      insertFields.push('fechaCreacion');
      insertValues.push('GETDATE()');
    }

    // Agregar Valid_From y Valid_To con valores por defecto si no vienen
    if (!data.Valid_From) {
      insertFields.push('Valid_From');
      insertValues.push('@defaultValidFrom');
      request.input('defaultValidFrom', sql.Date, new Date('1990-01-01'));
    }
    if (!data.Valid_To) {
      insertFields.push('Valid_To');
      insertValues.push('@defaultValidTo');
      request.input('defaultValidTo', sql.Date, new Date('2050-12-31'));
    }

    const query = `INSERT INTO stock.instrumentos (${insertFields.join(', ')}) VALUES (${insertValues.join(', ')})`;
    console.log('[POST /instrumentos] Query:', query);

    await request.query(query);

    // Obtener el registro insertado
    const inserted = await pool.request()
      .input('id', sql.Int, parseInt(data.idInstrumento))
      .input('moneda', sql.Int, parseInt(data.moneda))
      .query('SELECT * FROM stock.instrumentos WHERE idInstrumento = @id AND moneda = @moneda');

    console.log('[POST /instrumentos] Registro insertado:', inserted.recordset[0]);

    res.status(201).json({
      success: true,
      data: inserted.recordset[0],
    });
  } catch (err) {
    console.error('Error creando instrumento:', err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// PUT /api/instrumentos/:id/:moneda - Actualizar instrumento
router.put('/:id/:moneda', async (req, res) => {
  const { id, moneda } = req.params;
  // Normalizar nombres de campos
  const data = normalizeData(req.body);

  console.log('[PUT /instrumentos] Datos recibidos (normalizados):', JSON.stringify(data, null, 2));

  try {
    const pool = await getPool();

    // Verificar que existe
    const exists = await pool.request()
      .input('id', sql.Int, parseInt(id))
      .input('moneda', sql.Int, parseInt(moneda))
      .query('SELECT 1 FROM stock.instrumentos WHERE idInstrumento = @id AND moneda = @moneda');

    if (exists.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        error: `Instrumento con id '${id}' y moneda '${moneda}' no encontrado`,
      });
    }

    const request = pool.request();
    request.input('id', sql.Int, parseInt(id));
    request.input('moneda', sql.Int, parseInt(moneda));

    let setClauses = [];

    // Campos actualizables (excluir PK)
    const updateableFields = [
      'nombreFuente', 'fuente', 'subId',
      'investmentTypeCode', 'nameInstrumento', 'companyName', 'issuerTypeCode',
      'sectorGICS', 'issueTypeCode', 'sectorChileTypeCode', 'publicDataSource',
      'isin', 'tickerBBG', 'sedol', 'cusip',
      'issueCountry', 'riskCountry', 'issueCurrency', 'riskCurrency', 'emisionNacional',
      'couponTypeCode', 'yieldType', 'yieldSource', 'perpetuidad', 'rendimiento',
      'couponFrequency', 'coco', 'callable', 'sinkable', 'yasYldFlag',
      'rankCode', 'cashTypeCode', 'bankDebtTypeCode', 'fundTypeCode',
      'esReestructuracion', 'idPredecesor', 'monedaPredecesor', 'tipoContinuador', 'diaValidez',
      'comentarios', 'usuarioModificacion'
    ];

    // Campos que son FK a catálogos o INT (deben ser INT o NULL, no strings vacíos)
    const fkFields = [
      'investmentTypeCode', 'issuerTypeCode', 'issueTypeCode', 'couponTypeCode',
      'couponFrequency', 'rankCode', 'cashTypeCode', 'bankDebtTypeCode', 'fundTypeCode',
      'sectorChileTypeCode', 'tipoContinuador', 'issueCurrency', 'riskCurrency',
      'idPredecesor', 'monedaPredecesor', 'subId'
    ];

    // Campos que son NCHAR(1) - booleanos como 'S'/'N'
    const nchar1Fields = ['esReestructuracion', 'emisionNacional', 'perpetuidad', 'rendimiento', 'coco', 'callable', 'sinkable'];

    updateableFields.forEach(field => {
      // Ignorar valores undefined
      if (data[field] === undefined) return;

      let value = data[field];

      // Para campos FK, convertir strings vacíos a null
      if (fkFields.includes(field) && (value === '' || value === null)) {
        value = null;
      }

      // Campos NCHAR(1): convertir valores numéricos/booleanos a 'S'/'N'
      if (nchar1Fields.includes(field)) {
        if (value === '' || value === null || value === false || value === 'false') {
          value = null; // NULL en lugar de omitir para UPDATE
        } else {
          // Convertir true/1/2/'S' a 'S' o 'N'
          // ID 1 = 'S' (Sí), ID 2 = 'N' (No) en cat.booleanValues
          value = (value === true || value === 'true' || value === 1 || value === '1' || value === 'S') ? 'S' : 'N';
        }
      }

      setClauses.push(`${field} = @${field}`);

      // Determinar tipo SQL según el campo
      if (fkFields.includes(field)) {
        // Campos INT (FK)
        request.input(field, sql.Int, value === '' ? null : (value !== null ? parseInt(value) : null));
      } else if (field === 'diaValidez') {
        // Campo DATE
        request.input(field, sql.Date, value ? new Date(value) : null);
      } else if (field.includes('fecha')) {
        // Campos DATETIME
        request.input(field, sql.DateTime, value ? new Date(value) : null);
      } else if (nchar1Fields.includes(field)) {
        // Campos NCHAR(1) - booleanos
        request.input(field, sql.NChar(1), value);
      } else {
        // Campos NVARCHAR
        request.input(field, sql.NVarChar, value);
      }
    });

    // Siempre actualizar fechaModificacion
    setClauses.push('fechaModificacion = GETDATE()');

    if (setClauses.length === 1) {
      return res.status(400).json({
        success: false,
        error: 'No hay campos para actualizar',
      });
    }

    const query = `UPDATE stock.instrumentos SET ${setClauses.join(', ')} WHERE idInstrumento = @id AND moneda = @moneda`;
    console.log('[PUT /instrumentos] Query:', query);

    await request.query(query);

    // Obtener el registro actualizado
    const updated = await pool.request()
      .input('id', sql.Int, parseInt(id))
      .input('moneda', sql.Int, parseInt(moneda))
      .query('SELECT * FROM stock.instrumentos WHERE idInstrumento = @id AND moneda = @moneda');

    res.json({
      success: true,
      data: updated.recordset[0],
    });
  } catch (err) {
    console.error('Error actualizando instrumento:', err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// POST /api/instrumentos/:id/:moneda/version - Versionar instrumento (para cambios de atributos)
// Cierra la versión actual y crea una nueva con los datos actualizados
router.post('/:id/:moneda/version', async (req, res) => {
  const { id, moneda } = req.params;
  const data = normalizeData(req.body);

  console.log('[POST /instrumentos/version] Versionando instrumento:', id, moneda);
  console.log('[POST /instrumentos/version] Datos recibidos:', JSON.stringify(data, null, 2));

  // Campos que son NCHAR(1) - booleanos como 'S'/'N'
  const nchar1Fields = ['esReestructuracion', 'emisionNacional', 'perpetuidad', 'rendimiento', 'coco', 'callable', 'sinkable'];

  // IMPORTANTE: Convertir NCHAR(1) fields en data ANTES de usarlos
  // Los dropdowns envían IDs numéricos (1=Sí, 2=No) que deben ser 'S'/'N'
  nchar1Fields.forEach(field => {
    if (data[field] !== undefined) {
      const value = data[field];
      if (value === '' || value === null || value === false || value === 'false') {
        data[field] = null;
      } else {
        // ID 1 = 'S' (Sí), ID 2 = 'N' (No) en cat.booleanValues
        data[field] = (value === true || value === 'true' || value === 1 || value === '1' || value === 'S') ? 'S' : 'N';
      }
    }
  });

  console.log('[POST /instrumentos/version] Datos después de conversión NCHAR(1):', JSON.stringify(data, null, 2));

  let transaction;

  try {
    const pool = await getPool();

    // 1. Obtener el registro actual (ANTES de iniciar transacción)
    console.log('[POST /instrumentos/version] Buscando en stock.instrumentos:', { id, moneda });
    const currentResult = await pool.request()
      .input('id', sql.Int, parseInt(id))
      .input('moneda', sql.Int, parseInt(moneda))
      .query(`
        SELECT * FROM stock.instrumentos
        WHERE idInstrumento = @id AND moneda = @moneda
        AND Valid_To = '2050-12-31'
      `);

    console.log('[POST /instrumentos/version] Registros encontrados:', currentResult.recordset.length);

    if (currentResult.recordset.length === 0) {
      // Debug: check if exists with any Valid_To
      const debugResult = await pool.request()
        .input('id', sql.Int, parseInt(id))
        .input('moneda', sql.Int, parseInt(moneda))
        .query(`
          SELECT idInstrumento, moneda, Valid_From, Valid_To
          FROM stock.instrumentos
          WHERE idInstrumento = @id AND moneda = @moneda
        `);
      console.log('[POST /instrumentos/version] Debug - registros con cualquier Valid_To:', debugResult.recordset);

      return res.status(404).json({
        success: false,
        error: `Instrumento con id '${id}' y moneda '${moneda}' no encontrado o ya versionado`,
      });
    }

    const currentRecord = currentResult.recordset[0];
    console.log('[POST /instrumentos/version] Registro actual encontrado');

    // Calcular yesterday antes de la transacción
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    // Preparar los datos para la nueva versión
    const newRecord = { ...currentRecord };

    // Aplicar los cambios del formulario (data ya tiene NCHAR(1) convertidos)
    const updateableFields = [
      'nombreFuente', 'fuente', 'subId',
      'investmentTypeCode', 'nameInstrumento', 'companyName', 'issuerTypeCode',
      'sectorGICS', 'issueTypeCode', 'sectorChileTypeCode', 'publicDataSource',
      'isin', 'tickerBBG', 'sedol', 'cusip',
      'issueCountry', 'riskCountry', 'issueCurrency', 'riskCurrency', 'emisionNacional',
      'couponTypeCode', 'yieldType', 'yieldSource', 'perpetuidad', 'rendimiento',
      'couponFrequency', 'coco', 'callable', 'sinkable', 'yasYldFlag', 'override',
      'rankCode', 'cashTypeCode', 'bankDebtTypeCode', 'fundTypeCode',
      'esReestructuracion', 'idPredecesor', 'monedaPredecesor', 'tipoContinuador', 'diaValidez',
      'comentarios'
    ];

    updateableFields.forEach(field => {
      if (data[field] !== undefined) {
        newRecord[field] = data[field];
      }
    });

    // =========================================================================
    // INICIAR TRANSACCIÓN - UPDATE y INSERT deben ser atómicos
    // Si INSERT falla, UPDATE se revierte automáticamente
    // =========================================================================
    transaction = new sql.Transaction(pool);
    await transaction.begin();
    console.log('[POST /instrumentos/version] Transacción iniciada');

    // 2. Cerrar la versión actual (Valid_To = ayer) - DENTRO DE TRANSACCIÓN
    const updateRequest = new sql.Request(transaction);
    await updateRequest
      .input('id', sql.Int, parseInt(id))
      .input('moneda', sql.Int, parseInt(moneda))
      .input('yesterday', sql.Date, yesterday)
      .query(`
        UPDATE stock.instrumentos
        SET Valid_To = @yesterday
        WHERE idInstrumento = @id AND moneda = @moneda
        AND Valid_To = '2050-12-31'
      `);

    console.log('[POST /instrumentos/version] Versión anterior cerrada (pendiente commit)');

    // 3. Insertar la nueva versión - DENTRO DE TRANSACCIÓN
    const insertRequest = new sql.Request(transaction);
    insertRequest.input('idInstrumento', sql.Int, parseInt(id));
    insertRequest.input('moneda', sql.Int, parseInt(moneda));

    // Campos para la nueva versión
    const fkFields = [
      'investmentTypeCode', 'issuerTypeCode', 'issueTypeCode', 'couponTypeCode',
      'couponFrequency', 'rankCode', 'cashTypeCode', 'bankDebtTypeCode', 'fundTypeCode',
      'sectorChileTypeCode', 'tipoContinuador', 'issueCurrency', 'riskCurrency',
      'idPredecesor', 'monedaPredecesor', 'subId'
    ];

    // nchar1Fields ya está definido arriba (línea 713)

    const insertFields = ['idInstrumento', 'moneda'];
    const insertValues = ['@idInstrumento', '@moneda'];

    updateableFields.forEach(field => {
      if (newRecord[field] !== undefined && newRecord[field] !== null) {
        let value = newRecord[field];

        // Para campos FK, convertir strings vacíos a null
        if (fkFields.includes(field) && value === '') {
          return; // Skip empty FK fields
        }

        // Campos NCHAR(1): convertir valores numéricos/booleanos a 'S'/'N'
        if (nchar1Fields.includes(field)) {
          if (value === '' || value === null || value === false || value === 'false') {
            return; // Skip empty NCHAR(1) fields
          }
          // Convertir true/1/2/'S' a 'S' o 'N'
          // ID 1 = 'S' (Sí), ID 2 = 'N' (No) en cat.booleanValues
          value = (value === true || value === 'true' || value === 1 || value === '1' || value === 'S') ? 'S' : 'N';
        }

        insertFields.push(field);
        insertValues.push(`@${field}`);

        if (fkFields.includes(field)) {
          insertRequest.input(field, sql.Int, value === '' ? null : (value !== null ? parseInt(value) : null));
        } else if (field === 'diaValidez') {
          insertRequest.input(field, sql.Date, value ? new Date(value) : null);
        } else if (nchar1Fields.includes(field)) {
          // Campos NCHAR(1) - booleanos
          insertRequest.input(field, sql.NChar(1), value);
        } else {
          insertRequest.input(field, sql.NVarChar, value);
        }
      }
    });

    // Agregar campos de versión y auditoría
    insertFields.push('fechaCreacion', 'Valid_From', 'Valid_To');
    insertValues.push('GETDATE()', 'CAST(GETDATE() AS DATE)', "'2050-12-31'");

    const insertQuery = `
      INSERT INTO stock.instrumentos (${insertFields.join(', ')})
      VALUES (${insertValues.join(', ')})
    `;

    console.log('[POST /instrumentos/version] Insert query:', insertQuery);
    await insertRequest.query(insertQuery);

    console.log('[POST /instrumentos/version] Nueva versión creada (pendiente commit)');

    // =========================================================================
    // COMMIT TRANSACCIÓN - Si llegamos aquí, UPDATE e INSERT fueron exitosos
    // =========================================================================
    await transaction.commit();
    console.log('[POST /instrumentos/version] Transacción confirmada (commit)');

    // 5. Obtener el registro actualizado (DESPUÉS del commit)
    const newVersionResult = await pool.request()
      .input('id', sql.Int, parseInt(id))
      .input('moneda', sql.Int, parseInt(moneda))
      .query(`
        SELECT * FROM stock.instrumentos
        WHERE idInstrumento = @id AND moneda = @moneda
        AND Valid_To = '2050-12-31'
      `);

    res.json({
      success: true,
      data: newVersionResult.recordset[0],
      message: 'Instrumento versionado exitosamente',
      previousVersionClosedAt: yesterday.toISOString().split('T')[0],
    });
  } catch (err) {
    console.error('Error versionando instrumento:', err);

    // =========================================================================
    // ROLLBACK TRANSACCIÓN - Si hubo error, revertir el UPDATE
    // =========================================================================
    if (transaction) {
      try {
        await transaction.rollback();
        console.log('[POST /instrumentos/version] Transacción revertida (rollback)');
      } catch (rollbackErr) {
        console.error('[POST /instrumentos/version] Error en rollback:', rollbackErr);
      }
    }

    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// POST /api/instrumentos/bulk-create - Crear múltiples instrumentos
router.post('/bulk-create', async (req, res) => {
  const { instruments } = req.body;

  if (!Array.isArray(instruments) || instruments.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Se requiere un array de instrumentos no vacío',
    });
  }

  try {
    const pool = await getPool();
    const results = {
      success: [],
      failed: [],
      total: instruments.length,
    };

    // Procesar cada instrumento
    for (const [index, data] of instruments.entries()) {
      try {
        // Normalizar campos
        const normalizedData = normalizeData(data);

        if (!normalizedData.idInstrumento || !normalizedData.moneda) {
          results.failed.push({
            index,
            data: normalizedData,
            error: 'Se requieren idInstrumento y moneda',
          });
          continue;
        }

        // Verificar si ya existe
        const exists = await pool.request()
          .input('id', sql.Int, parseInt(normalizedData.idInstrumento))
          .input('moneda', sql.Int, parseInt(normalizedData.moneda))
          .query('SELECT 1 FROM stock.instrumentos WHERE idInstrumento = @id AND moneda = @moneda');

        if (exists.recordset.length > 0) {
          results.failed.push({
            index,
            data: normalizedData,
            error: `Ya existe instrumento con id '${normalizedData.idInstrumento}' y moneda '${normalizedData.moneda}'`,
          });
          continue;
        }

        // Insertar (reutilizar lógica del POST individual simplificada)
        const request = pool.request();
        const insertFields = [];
        const insertValues = [];

        // Campos básicos requeridos
        request.input('idInstrumento', sql.Int, parseInt(normalizedData.idInstrumento));
        insertFields.push('idInstrumento');
        insertValues.push('@idInstrumento');

        request.input('moneda', sql.Int, parseInt(normalizedData.moneda));
        insertFields.push('moneda');
        insertValues.push('@moneda');

        // Agregar otros campos si existen
        Object.keys(normalizedData).forEach(key => {
          if (key !== 'idInstrumento' && key !== 'moneda' && normalizedData[key]) {
            insertFields.push(key);
            insertValues.push(`@${key}`);
            request.input(key, sql.NVarChar, normalizedData[key]);
          }
        });

        // Fechas y Valid por defecto
        insertFields.push('fechaCreacion', 'Valid_From', 'Valid_To');
        insertValues.push('GETDATE()', '@validFrom', '@validTo');
        request.input('validFrom', sql.Date, new Date('1990-01-01'));
        request.input('validTo', sql.Date, new Date('2050-12-31'));

        await request.query(
          `INSERT INTO stock.instrumentos (${insertFields.join(', ')}) VALUES (${insertValues.join(', ')})`
        );

        results.success.push({
          index,
          idInstrumento: normalizedData.idInstrumento,
          moneda: normalizedData.moneda,
        });
      } catch (err) {
        results.failed.push({
          index,
          data: data,
          error: err.message,
        });
      }
    }

    res.status(results.failed.length === 0 ? 201 : 207).json({
      success: results.failed.length === 0,
      message: `Procesados ${results.total} instrumentos. Éxitos: ${results.success.length}, Fallos: ${results.failed.length}`,
      results,
    });
  } catch (err) {
    console.error('Error en bulk-create:', err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// DELETE /api/instrumentos/:id/:moneda - Eliminar instrumento
router.delete('/:id/:moneda', async (req, res) => {
  const { id, moneda } = req.params;

  try {
    const pool = await getPool();

    // Verificar que existe
    const exists = await pool.request()
      .input('id', sql.Int, parseInt(id))
      .input('moneda', sql.Int, parseInt(moneda))
      .query('SELECT * FROM stock.instrumentos WHERE idInstrumento = @id AND moneda = @moneda');

    if (exists.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        error: `Instrumento con id '${id}' y moneda '${moneda}' no encontrado`,
      });
    }

    await pool.request()
      .input('id', sql.Int, parseInt(id))
      .input('moneda', sql.Int, parseInt(moneda))
      .query('DELETE FROM stock.instrumentos WHERE idInstrumento = @id AND moneda = @moneda');

    res.json({
      success: true,
      data: exists.recordset[0],
      message: 'Instrumento eliminado correctamente',
    });
  } catch (err) {
    console.error('Error eliminando instrumento:', err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

module.exports = router;
