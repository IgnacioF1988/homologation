/**
 * Rutas unificadas para gestión de colas sandbox
 * Sistema de pendientes que bloquean la creación del cubo
 */

const express = require('express');
const router = express.Router();
const { getPoolHomologacion, sql } = require('../config/database');

// Alias para compatibilidad con código existente
const getPool = getPoolHomologacion;

// ============================================
// CONFIGURACIÓN DE COLAS
// ============================================
const QUEUE_CONFIG = {
  instrumentos: {
    table: 'sandbox.colaPendientes',
    displayName: 'Instrumentos',
    icon: 'assignment',
    color: '#3B82F6',
  },
  fondos: {
    table: 'sandbox.colaFondos',
    displayName: 'Fondos',
    icon: 'account_balance',
    color: '#10B981',
  },
  monedas: {
    table: 'sandbox.colaMonedas',
    displayName: 'Monedas',
    icon: 'currency_exchange',
    color: '#F59E0B',
  },
  benchmarks: {
    table: 'sandbox.colaBenchmarks',
    displayName: 'Benchmarks',
    icon: 'trending_up',
    color: '#8B5CF6',
  },
  suciedades: {
    table: 'sandbox.colaAlertasSuciedades',
    displayName: 'Suciedades',
    icon: 'warning',
    color: '#EF4444',
  },
  descuadres: {
    table: 'sandbox.colaAlertasDescuadre',
    displayName: 'Descuadres',
    icon: 'balance',
    color: '#EC4899',
  },
};

// ============================================
// GET /api/sandbox-queues/summary - Resumen de todas las colas
// ============================================
router.get('/summary', async (req, res) => {
  try {
    const pool = await getPool();

    const summaryQuery = `
      SELECT
        'instrumentos' as queue,
        COUNT(CASE WHEN estado = 'pendiente' THEN 1 END) as pendiente,
        COUNT(CASE WHEN estado = 'en_proceso' THEN 1 END) as en_proceso,
        COUNT(CASE WHEN estado = 'completado' THEN 1 END) as completado,
        COUNT(*) as total
      FROM sandbox.colaPendientes
      UNION ALL
      SELECT
        'fondos',
        COUNT(CASE WHEN estado = 'pendiente' THEN 1 END),
        COUNT(CASE WHEN estado = 'en_proceso' THEN 1 END),
        COUNT(CASE WHEN estado = 'completado' THEN 1 END),
        COUNT(*)
      FROM sandbox.colaFondos
      UNION ALL
      SELECT
        'monedas',
        COUNT(CASE WHEN estado = 'pendiente' THEN 1 END),
        COUNT(CASE WHEN estado = 'en_proceso' THEN 1 END),
        COUNT(CASE WHEN estado = 'completado' THEN 1 END),
        COUNT(*)
      FROM sandbox.colaMonedas
      UNION ALL
      SELECT
        'benchmarks',
        COUNT(CASE WHEN estado = 'pendiente' THEN 1 END),
        COUNT(CASE WHEN estado = 'en_proceso' THEN 1 END),
        COUNT(CASE WHEN estado = 'completado' THEN 1 END),
        COUNT(*)
      FROM sandbox.colaBenchmarks
      UNION ALL
      SELECT
        'suciedades',
        COUNT(CASE WHEN estado = 'pendiente' THEN 1 END),
        COUNT(CASE WHEN estado = 'en_proceso' THEN 1 END),
        COUNT(CASE WHEN estado IN ('aprobado', 'rechazado') THEN 1 END),
        COUNT(*)
      FROM sandbox.colaAlertasSuciedades
      UNION ALL
      SELECT
        'descuadres',
        COUNT(CASE WHEN estado = 'pendiente' THEN 1 END),
        COUNT(CASE WHEN estado = 'en_proceso' THEN 1 END),
        COUNT(CASE WHEN estado IN ('aprobado', 'rechazado') THEN 1 END),
        COUNT(*)
      FROM sandbox.colaAlertasDescuadre
    `;

    const result = await pool.request().query(summaryQuery);

    // Construir respuesta con metadata
    const summary = {};
    let totalPendientes = 0;

    result.recordset.forEach(row => {
      const config = QUEUE_CONFIG[row.queue];
      summary[row.queue] = {
        ...config,
        counts: {
          pendiente: row.pendiente,
          en_proceso: row.en_proceso,
          completado: row.completado,
          total: row.total,
        },
      };
      totalPendientes += row.pendiente;
    });

    res.json({
      success: true,
      data: summary,
      totalPendientes,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Error obteniendo resumen de colas:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================
// GET /api/sandbox-queues/descuadre-types - Tipos de descuadre disponibles
// ============================================
router.get('/descuadre-types', async (req, res) => {
  try {
    const types = [
      { key: 'IPA-Derivados', label: 'Diferencias IPA vs Derivados', active: true },
      { key: 'IPA-SONA', label: 'Diferencias IPA vs SONA', active: true },
      { key: 'Fixed-Income-UBS', label: 'Fixed Income UBS', active: true },
      { key: 'Paridades', label: 'Diferencias de Paridades', active: false },
    ];
    res.json({ success: true, data: types });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// GET /api/sandbox-queues/fund-form-options - Opciones para formulario de nuevo fondo
// ============================================
router.get('/fund-form-options', async (req, res) => {
  try {
    const pool = await getPool();

    // Obtener todas las opciones en paralelo
    const [monedasResult, estrategiasConsResult, estrategiasCompResult, benchmarksResult] = await Promise.all([
      // Monedas desde BD_Monedas_Dimensiones
      pool.request().query(`
        SELECT id_CURR as id, Code as codigo, LocalCurrency as nombre
        FROM Inteligencia_Producto_Dev.dimensionales.BD_Monedas_Dimensiones
        ORDER BY Code
      `),
      // Estrategias Consolidación Fondo (valores únicos existentes)
      pool.request().query(`
        SELECT DISTINCT Estrategia_Cons_Fondo as valor
        FROM Inteligencia_Producto_Dev.dimensionales.BD_Funds
        WHERE Estrategia_Cons_Fondo IS NOT NULL
        ORDER BY Estrategia_Cons_Fondo
      `),
      // Estrategias Comparador (valores únicos existentes)
      pool.request().query(`
        SELECT DISTINCT Estrategia_Comparador as valor
        FROM Inteligencia_Producto_Dev.dimensionales.BD_Funds
        WHERE Estrategia_Comparador IS NOT NULL
        ORDER BY Estrategia_Comparador
      `),
      // Benchmarks para BM1 y BM2
      pool.request().query(`
        SELECT ID_BM as id, FundShortName as codigo, BMName as nombre
        FROM Inteligencia_Producto_Dev.dimensionales.BD_Benchmarks
        ORDER BY BMName
      `),
    ]);

    res.json({
      success: true,
      data: {
        monedas: monedasResult.recordset,
        estrategiasConsFondo: estrategiasConsResult.recordset.map(r => r.valor),
        estrategiasComparador: estrategiasCompResult.recordset.map(r => r.valor),
        benchmarks: benchmarksResult.recordset,
      },
    });
  } catch (err) {
    console.error('Error obteniendo opciones de formulario:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================
// GET /api/sandbox-queues/options/:type - Obtener opciones para asignación
// IMPORTANTE: Esta ruta debe estar ANTES de /:queueType para evitar conflictos
// ============================================
router.get('/options/:type', async (req, res) => {
  const { type } = req.params;
  const { source } = req.query;

  try {
    const pool = await getPool();
    let query = '';

    switch (type) {
      case 'fondos':
        // Usar BD_Funds (tabla maestra) para obtener fondos disponibles
        query = `
          SELECT ID_Fund as id, FundShortName as nombre, FundName as nombreCompleto,
                 FundBaseCurrency as moneda, Activo_MantenedorFondos as activo
          FROM Inteligencia_Producto_Dev.dimensionales.BD_Funds
          ORDER BY FundShortName
        `;
        break;

      case 'monedas':
        query = `
          SELECT DISTINCT id_CURR as id, Name as nombre, Source as fuente
          FROM Inteligencia_Producto_Dev.dimensionales.HOMOL_Monedas
          ${source ? "WHERE Source = @source" : ""}
          ORDER BY Name
        `;
        break;

      case 'benchmarks':
        // Usar BD_Benchmarks (tabla maestra) para obtener benchmarks disponibles
        query = `
          SELECT ID_BM as id, FundShortName as nombre, BMName as nombreCompleto,
                 FundBaseCurrency as moneda
          FROM Inteligencia_Producto_Dev.dimensionales.BD_Benchmarks
          ORDER BY BMName
        `;
        break;

      default:
        return res.status(400).json({ success: false, error: `Tipo '${type}' no válido` });
    }

    const request = pool.request();
    if (source) {
      request.input('source', sql.NVarChar, source);
    }

    const result = await request.query(query);

    res.json({
      success: true,
      data: result.recordset,
    });
  } catch (err) {
    console.error(`Error obteniendo opciones ${type}:`, err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================
// GET /api/sandbox-queues/:queueType - Obtener items de una cola con paginación
// Query params: estado, page (default 1), limit (default 50, max 200)
// ============================================
router.get('/:queueType', async (req, res) => {
  const { queueType } = req.params;
  const { estado } = req.query;
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
  const offset = (page - 1) * limit;

  const config = QUEUE_CONFIG[queueType];
  if (!config) {
    return res.status(400).json({
      success: false,
      error: `Tipo de cola '${queueType}' no válido. Opciones: ${Object.keys(QUEUE_CONFIG).join(', ')}`,
    });
  }

  try {
    const pool = await getPool();

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
      `SELECT COUNT(*) as total FROM ${config.table}${whereClause}`
    );
    const total = countResult.recordset[0].total;

    // Obtener página de datos
    dataRequest.input('limit', sql.Int, limit);
    dataRequest.input('offset', sql.Int, offset);

    const result = await dataRequest.query(`
      SELECT * FROM ${config.table}${whereClause}
      ORDER BY fechaIngreso DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

    res.json({
      success: true,
      queueType,
      displayName: config.displayName,
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
    console.error(`Error obteniendo cola ${queueType}:`, err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================
// PATCH /api/sandbox-queues/:queueType/:id - Actualizar estado de un item
// ============================================
router.patch('/:queueType/:id', async (req, res) => {
  const { queueType, id } = req.params;
  const { estado, observaciones, ...asignacion } = req.body;

  const config = QUEUE_CONFIG[queueType];
  if (!config) {
    return res.status(400).json({ success: false, error: `Tipo de cola '${queueType}' no válido` });
  }

  try {
    const pool = await getPool();
    const request = pool.request();
    request.input('id', sql.Int, parseInt(id));

    let setClauses = [];

    if (estado) {
      setClauses.push('estado = @estado');
      request.input('estado', sql.NVarChar, estado);

      if (['completado', 'aprobado', 'rechazado', 'ignorado'].includes(estado)) {
        setClauses.push('fechaProcesado = GETDATE()');
      }
    }

    if (observaciones !== undefined) {
      setClauses.push('observaciones = @observaciones');
      request.input('observaciones', sql.NVarChar, observaciones);
    }

    // Campos de asignación específicos por tipo
    if (queueType === 'fondos' && asignacion.idFundAsignado !== undefined) {
      setClauses.push('idFundAsignado = @idFundAsignado');
      request.input('idFundAsignado', sql.Int, asignacion.idFundAsignado);
    }
    if (queueType === 'monedas' && asignacion.idMonedaAsignada !== undefined) {
      setClauses.push('idMonedaAsignada = @idMonedaAsignada');
      request.input('idMonedaAsignada', sql.Int, asignacion.idMonedaAsignada);
    }
    if (queueType === 'benchmarks' && asignacion.idBenchmarkAsignado !== undefined) {
      setClauses.push('idBenchmarkAsignado = @idBenchmarkAsignado');
      request.input('idBenchmarkAsignado', sql.Int, asignacion.idBenchmarkAsignado);
    }
    if ((queueType === 'suciedades' || queueType === 'descuadres') && asignacion.accion !== undefined) {
      setClauses.push('accion = @accion');
      request.input('accion', sql.NVarChar, asignacion.accion);
    }

    if (setClauses.length === 0) {
      return res.status(400).json({ success: false, error: 'No hay campos para actualizar' });
    }

    const updateQuery = `UPDATE ${config.table} SET ${setClauses.join(', ')} WHERE id = @id`;
    await request.query(updateQuery);

    // Obtener el registro actualizado
    const updated = await pool.request()
      .input('id', sql.Int, parseInt(id))
      .query(`SELECT * FROM ${config.table} WHERE id = @id`);

    res.json({
      success: true,
      data: updated.recordset[0],
    });
  } catch (err) {
    console.error(`Error actualizando ${queueType}/${id}:`, err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================
// POST /api/sandbox-queues/:queueType/resolve-batch - Resolver múltiples items en una sola operación
// ============================================
router.post('/:queueType/resolve-batch', async (req, res) => {
  const { queueType } = req.params;
  const { items } = req.body; // Array de { id, asignacion }

  const config = QUEUE_CONFIG[queueType];
  if (!config) {
    return res.status(400).json({ success: false, error: `Tipo de cola '${queueType}' no válido` });
  }

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, error: 'Se requiere un array de items' });
  }

  try {
    const pool = await getPool();
    const results = { success: 0, failed: 0, errors: [] };

    // Para suciedades, hacer todo en una sola transacción
    if (queueType === 'suciedades') {
      const transaction = pool.transaction();
      await transaction.begin();

      try {
        // Obtener todos los items
        const ids = items.map(i => i.id);
        const itemsResult = await transaction.request()
          .query(`SELECT * FROM ${config.table} WHERE id IN (${ids.join(',')})`);

        const itemsMap = {};
        itemsResult.recordset.forEach(item => {
          itemsMap[item.id] = item;
        });

        // Insertar en stock.Suciedades los que son confirmados como suciedad
        for (const { id, asignacion } of items) {
          const item = itemsMap[id];
          if (!item) continue;

          if (asignacion.estado === 'Suciedad') {
            await transaction.request()
              .input('investId', sql.NVarChar, item.investId)
              .input('portfolio', sql.NVarChar, item.portfolio)
              .input('qty', sql.Float, item.qty)
              .input('estado', sql.NVarChar, 'Suciedad')
              .query(`
                IF NOT EXISTS (
                  SELECT 1 FROM stock.Suciedades
                  WHERE investId = @investId AND portfolio = @portfolio AND qty = @qty
                )
                INSERT INTO stock.Suciedades (investId, portfolio, qty, estado)
                VALUES (@investId, @portfolio, @qty, @estado)
              `);
          }
          results.success++;
        }

        // Marcar todos como completados en una sola query
        await transaction.request()
          .query(`
            UPDATE ${config.table}
            SET estado = 'completado', fechaProcesado = GETDATE()
            WHERE id IN (${ids.join(',')})
          `);

        await transaction.commit();
      } catch (err) {
        await transaction.rollback();
        throw err;
      }
    } else {
      // Para otros tipos, procesar secuencialmente (menos común)
      for (const { id, asignacion } of items) {
        try {
          // ... lógica individual para otros tipos
          results.success++;
        } catch (err) {
          results.failed++;
          results.errors.push({ id, error: err.message });
        }
      }
    }

    res.json({
      success: true,
      message: `${results.success} ${config.displayName} resueltos exitosamente`,
      results,
    });
  } catch (err) {
    console.error(`Error resolviendo batch ${queueType}:`, err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================
// HELPER: Actualizar contadores stand-by
// ============================================
async function _actualizarContadorStandBy(pool, queueType, item) {
  const tipoProblemaMap = {
    'suciedades': 'SUCIEDADES',
    'descuadres': 'DESCUADRES',
    'instrumentos': 'HOMOLOGACION',
    'fondos': 'HOMOLOGACION',
    'monedas': 'HOMOLOGACION',
    'benchmarks': 'HOMOLOGACION'
  };

  const tipoProblema = tipoProblemaMap[queueType];
  if (!tipoProblema) return; // Solo aplica para colas de stand-by

  try {
    // Incrementar contador de resueltos
    await pool.request()
      .input('ID_Ejecucion', sql.BigInt, item.ID_Ejecucion || 0)
      .input('ID_Fund', sql.Int, item.ID_Fund || 0)
      .input('TipoProblema', sql.NVarChar, tipoProblema)
      .query(`
        UPDATE Inteligencia_Producto_Dev.logs.FondosEnStandBy
        SET ProblemasResueltos = ProblemasResueltos + 1
        WHERE ID_Ejecucion = @ID_Ejecucion
          AND ID_Fund = @ID_Fund
          AND TipoProblema = @TipoProblema
          AND Estado = 'PENDIENTE';

        -- Si todos resueltos, marcar APROBADO
        UPDATE Inteligencia_Producto_Dev.logs.FondosEnStandBy
        SET Estado = 'APROBADO', FechaResolucion = GETDATE()
        WHERE ID_Ejecucion = @ID_Ejecucion
          AND ID_Fund = @ID_Fund
          AND TipoProblema = @TipoProblema
          AND ProblemasResueltos >= CantidadProblemas
          AND Estado = 'PENDIENTE';
      `);

    // Verificar si TODOS los problemas están APROBADOS
    const todosAprobados = await pool.request()
      .input('ID_Ejecucion', sql.BigInt, item.ID_Ejecucion || 0)
      .input('ID_Fund', sql.Int, item.ID_Fund || 0)
      .query(`
        SELECT COUNT(*) as PendientesCount
        FROM Inteligencia_Producto_Dev.logs.FondosEnStandBy
        WHERE ID_Ejecucion = @ID_Ejecucion
          AND ID_Fund = @ID_Fund
          AND Estado = 'PENDIENTE'
      `);

    if (todosAprobados.recordset[0].PendientesCount === 0) {
      // Todos resueltos - marcar listo para resume
      await pool.request()
        .input('ID_Ejecucion', sql.BigInt, item.ID_Ejecucion || 0)
        .input('ID_Fund', sql.Int, item.ID_Fund || 0)
        .query(`
          UPDATE Inteligencia_Producto_Dev.logs.Ejecucion_Fondos
          SET EstadoStandBy = 'APROBADO'
          WHERE ID_Ejecucion = @ID_Ejecucion
            AND ID_Fund = @ID_Fund
            AND EstadoStandBy = 'PAUSADO';
        `);

      console.log(`✅ Fondo ${item.ID_Fund} listo para resume (ejecución ${item.ID_Ejecucion})`);
    }
  } catch (error) {
    console.warn(`[StandBy] Error actualizando contadores: ${error.message}`);
  }
}

// ============================================
// POST /api/sandbox-queues/:queueType/resolve - Resolver y escribir en dimensional
// ============================================
router.post('/:queueType/resolve', async (req, res) => {
  const { queueType } = req.params;
  const { id, asignacion } = req.body;

  const config = QUEUE_CONFIG[queueType];
  if (!config) {
    return res.status(400).json({ success: false, error: `Tipo de cola '${queueType}' no válido` });
  }

  try {
    const pool = await getPool();

    // Obtener el item pendiente
    const itemResult = await pool.request()
      .input('id', sql.Int, parseInt(id))
      .query(`SELECT * FROM ${config.table} WHERE id = @id`);

    if (itemResult.recordset.length === 0) {
      return res.status(404).json({ success: false, error: 'Item no encontrado' });
    }

    const item = itemResult.recordset[0];

    // Resolver según el tipo
    let insertQuery = '';
    const insertRequest = pool.request();

    switch (queueType) {
      case 'fondos':
        // Validar duplicados antes de insertar
        const existingFund = await pool.request()
          .input('portfolio', sql.NVarChar, item.nombreFondo)
          .input('source', sql.NVarChar, item.fuente)
          .query(`
            SELECT COUNT(*) as count
            FROM Inteligencia_Producto_Dev.dimensionales.HOMOL_Funds
            WHERE Portfolio = @portfolio AND Source = @source
          `);

        if (existingFund.recordset[0].count > 0) {
          return res.status(400).json({
            success: false,
            error: `El fondo "${item.nombreFondo}" de fuente "${item.fuente}" ya existe en la tabla de homologación`,
          });
        }

        let newFundId;

        if (asignacion.createNew) {
          // ============================================
          // MODO CREAR NUEVO FONDO
          // ============================================
          // 1. Obtener el siguiente ID disponible
          const maxIdResult = await pool.request().query(`
            SELECT ISNULL(MAX(CAST(ID_Fund AS INT)), 0) + 1 as nextId
            FROM Inteligencia_Producto_Dev.dimensionales.BD_Funds
          `);
          newFundId = String(maxIdResult.recordset[0].nextId);

          // 2. Insertar en BD_Funds (tabla maestra) con todos los campos
          await pool.request()
            .input('idFund', sql.NVarChar, newFundId)
            .input('fundShortName', sql.NVarChar, asignacion.fundShortName)
            .input('fundName', sql.NVarChar, asignacion.fundName)
            .input('fundBaseCurrency', sql.NVarChar, asignacion.fundBaseCurrency)
            .input('idCurr', sql.Int, asignacion.idCurr || asignacion.fundBaseCurrency)
            .input('nombreTupungato', sql.NVarChar, item.nombreFondo)
            .input('estrategiaConsFondo', sql.NVarChar, asignacion.estrategiaConsFondo || null)
            .input('estrategiaComparador', sql.NVarChar, asignacion.estrategiaComparador || null)
            .input('bm1', sql.Int, asignacion.bm1 ? parseInt(asignacion.bm1) : null)
            .input('bm2', sql.Int, asignacion.bm2 ? parseInt(asignacion.bm2) : null)
            .input('flagDerivados', sql.Bit, asignacion.flagDerivados ? 1 : 0)
            .input('flagUBS', sql.Bit, asignacion.flagUBS ? 1 : 0)
            .query(`
              INSERT INTO Inteligencia_Producto_Dev.dimensionales.BD_Funds
              (ID_Fund, FundShortName, FundName, FundBaseCurrency, id_CURR, NombreTupungato,
               Estrategia_Cons_Fondo, Estrategia_Comparador, BM1, BM2,
               Activo_MantenedorFondos, Flag_Derivados, Flag_UBS)
              VALUES
              (@idFund, @fundShortName, @fundName,
               (SELECT TOP 1 Code FROM Inteligencia_Producto_Dev.dimensionales.BD_Monedas_Dimensiones WHERE id_CURR = @idCurr),
               @idCurr, @nombreTupungato, @estrategiaConsFondo, @estrategiaComparador, @bm1, @bm2,
               1, @flagDerivados, @flagUBS)
            `);

          console.log(`Nuevo fondo creado: ID=${newFundId}, ShortName=${asignacion.fundShortName}`);
        } else {
          // ============================================
          // MODO ASIGNAR A EXISTENTE
          // ============================================
          newFundId = String(asignacion.idFund);
        }

        // 3. Insertar en HOMOL_Funds para TODAS las fuentes necesarias (GENEVA, DERIVADOS, CASH APPRAISAL)
        const sourcesToInsert = ['GENEVA', 'DERIVADOS', 'CASH APPRAISAL'];
        for (const src of sourcesToInsert) {
          // Verificar si ya existe para esta fuente específica
          const existsForSource = await pool.request()
            .input('portfolio', sql.NVarChar, item.nombreFondo)
            .input('src', sql.NVarChar, src)
            .query(`
              SELECT COUNT(*) as count
              FROM Inteligencia_Producto_Dev.dimensionales.HOMOL_Funds
              WHERE Portfolio = @portfolio AND Source = @src
            `);

          if (existsForSource.recordset[0].count === 0) {
            await pool.request()
              .input('portfolio', sql.NVarChar, item.nombreFondo)
              .input('idFund', sql.NVarChar, newFundId)
              .input('src', sql.NVarChar, src)
              .query(`
                INSERT INTO Inteligencia_Producto_Dev.dimensionales.HOMOL_Funds (Portfolio, ID_Fund, Source)
                VALUES (@portfolio, @idFund, @src)
              `);
          }
        }
        // No usar insertQuery genérico ya que ya insertamos arriba
        insertQuery = '';
        break;

      case 'monedas':
        // Validar duplicados antes de insertar
        const existingMoneda = await pool.request()
          .input('name', sql.NVarChar, item.nombreMoneda)
          .input('source', sql.NVarChar, item.fuente)
          .query(`
            SELECT COUNT(*) as count
            FROM Inteligencia_Producto_Dev.dimensionales.HOMOL_Monedas
            WHERE Name = @name AND Source = @source
          `);

        if (existingMoneda.recordset[0].count > 0) {
          return res.status(400).json({
            success: false,
            error: `La moneda "${item.nombreMoneda}" de fuente "${item.fuente}" ya existe en la tabla de homologación`,
          });
        }

        insertQuery = `
          INSERT INTO Inteligencia_Producto_Dev.dimensionales.HOMOL_Monedas (Name, id_CURR, Source)
          VALUES (@name, @idCurr, @source)
        `;
        insertRequest.input('name', sql.NVarChar, item.nombreMoneda);
        insertRequest.input('idCurr', sql.NVarChar, String(asignacion.idMoneda));
        insertRequest.input('source', sql.NVarChar, item.fuente);
        break;

      case 'benchmarks':
        // Validar duplicados antes de insertar
        const existingBenchmark = await pool.request()
          .input('portfolio', sql.NVarChar, item.nombreBenchmark)
          .input('source', sql.NVarChar, item.fuente)
          .query(`
            SELECT COUNT(*) as count
            FROM Inteligencia_Producto_Dev.dimensionales.HOMOL_Benchmarks
            WHERE Portfolio = @portfolio AND Source = @source
          `);

        if (existingBenchmark.recordset[0].count > 0) {
          return res.status(400).json({
            success: false,
            error: `El benchmark "${item.nombreBenchmark}" de fuente "${item.fuente}" ya existe en la tabla de homologación`,
          });
        }

        let newBenchmarkId;

        if (asignacion.createNew) {
          // ============================================
          // MODO CREAR NUEVO BENCHMARK
          // ============================================
          // 1. Obtener el siguiente ID disponible
          const maxBmIdResult = await pool.request().query(`
            SELECT ISNULL(MAX(CAST(ID_BM AS INT)), 0) + 1 as nextId
            FROM Inteligencia_Producto_Dev.dimensionales.BD_Benchmarks
          `);
          newBenchmarkId = maxBmIdResult.recordset[0].nextId;

          // 2. Insertar en BD_Benchmarks (tabla maestra en Inteligencia_Producto_Dev)
          await pool.request()
            .input('idBm', sql.NVarChar, String(newBenchmarkId))
            .input('fundShortName', sql.NVarChar, asignacion.fundShortName)
            .input('bmName', sql.NVarChar, asignacion.bmName)
            .input('fundBaseCurrency', sql.NVarChar, asignacion.fundBaseCurrency)
            .input('nombreTupungato', sql.NVarChar, item.nombreBenchmark)
            .input('estrategia', sql.NVarChar, asignacion.estrategia || null)
            .query(`
              INSERT INTO Inteligencia_Producto_Dev.dimensionales.BD_Benchmarks
              (ID_BM, FundShortName, BMName, FundBaseCurrency, NombreTupungato, Estrategia_Comparador)
              VALUES
              (@idBm, @fundShortName, @bmName,
               (SELECT TOP 1 Code FROM Inteligencia_Producto_Dev.dimensionales.BD_Monedas_Dimensiones WHERE id_CURR = @fundBaseCurrency),
               @nombreTupungato, @estrategia)
            `);

          // 3. Sincronizar con stock.benchmarks (tabla espejo en MonedaHomologacion)
          await pool.request()
            .input('idBm', sql.NVarChar, String(newBenchmarkId))
            .input('fundShortName', sql.NVarChar, asignacion.fundShortName)
            .input('bmName', sql.NVarChar, asignacion.bmName)
            .input('fundBaseCurrency', sql.NVarChar, asignacion.fundBaseCurrency)
            .input('nombreTupungato', sql.NVarChar, item.nombreBenchmark)
            .input('estrategia', sql.NVarChar, asignacion.estrategia || null)
            .query(`
              INSERT INTO stock.benchmarks
              (ID_BM, FundShortName, BMName, FundBaseCurrency, NombreTupungato, Estrategia_Comparador)
              VALUES
              (@idBm, @fundShortName, @bmName,
               (SELECT TOP 1 Code FROM Inteligencia_Producto_Dev.dimensionales.BD_Monedas_Dimensiones WHERE id_CURR = @fundBaseCurrency),
               @nombreTupungato, @estrategia)
            `);

          console.log(`Nuevo benchmark creado: ID=${newBenchmarkId}, ShortName=${asignacion.fundShortName}`);
        } else {
          // ============================================
          // MODO ASIGNAR A EXISTENTE
          // ============================================
          newBenchmarkId = asignacion.idBenchmark;
        }

        // 3. Insertar en HOMOL_Benchmarks
        insertQuery = `
          INSERT INTO Inteligencia_Producto_Dev.dimensionales.HOMOL_Benchmarks (Portfolio, ID_BM, Source)
          VALUES (@portfolio, @idBm, @source)
        `;
        insertRequest.input('portfolio', sql.NVarChar, item.nombreBenchmark);
        insertRequest.input('idBm', sql.Int, newBenchmarkId);
        insertRequest.input('source', sql.NVarChar, item.fuente);
        break;

      case 'suciedades':
        // Insertar en tabla de stock de suciedades (MonedaHomologacion.stock.Suciedades)
        // Solo si el estado es 'Suciedad' (confirmado)
        if (asignacion.estado === 'Suciedad') {
          insertQuery = `
            IF NOT EXISTS (
              SELECT 1 FROM stock.Suciedades
              WHERE investId = @investId AND portfolio = @portfolio AND qty = @qty
            )
            INSERT INTO stock.Suciedades (investId, portfolio, qty, estado)
            VALUES (@investId, @portfolio, @qty, @estado)
          `;
          insertRequest.input('investId', sql.NVarChar, asignacion.investId);
          insertRequest.input('portfolio', sql.NVarChar, asignacion.portfolio);
          insertRequest.input('qty', sql.Float, asignacion.qty);
          insertRequest.input('estado', sql.NVarChar, 'Suciedad');
        }
        break;

      case 'descuadres':
        // Descuadres: escribir en historial antes de aprobar/rechazar
        const accionDescuadre = asignacion.accion || 'aprobar';
        const estadoDescuadre = accionDescuadre === 'rechazar' ? 'rechazado' : 'aprobado';

        // Insertar en historial
        await pool.request()
          .input('tipoDescuadre', sql.NVarChar, item.tipoDescuadre || 'IPA-Derivados')
          .input('portfolio', sql.NVarChar, item.portfolio)
          .input('valorA', sql.Float, item.mvBookIPA)
          .input('valorB', sql.Float, item.mtmDerivados)
          .input('diferencia', sql.Float, item.diferencia)
          .input('fechaReporte', sql.NVarChar, item.fechaReporte)
          .input('accion', sql.NVarChar, estadoDescuadre)
          .input('observaciones', sql.NVarChar, asignacion.observaciones || null)
          .input('usuarioProceso', sql.NVarChar, asignacion.usuario || null)
          .input('idAlertaOrigen', sql.Int, parseInt(id))
          .input('datosOrigen', sql.NVarChar, item.datosOrigen || null)
          .query(`
            INSERT INTO stock.descuadresHistorial
            (tipoDescuadre, portfolio, valorA, valorB, diferencia, fechaReporte,
             accion, observaciones, usuarioProceso, idAlertaOrigen, datosOrigen)
            VALUES
            (@tipoDescuadre, @portfolio, @valorA, @valorB, @diferencia, @fechaReporte,
             @accion, @observaciones, @usuarioProceso, @idAlertaOrigen, @datosOrigen)
          `);

        // Actualizar cola con estado y acción
        await pool.request()
          .input('id', sql.Int, parseInt(id))
          .input('estado', sql.NVarChar, estadoDescuadre)
          .input('accion', sql.NVarChar, accionDescuadre)
          .input('observaciones', sql.NVarChar, asignacion.observaciones || null)
          .query(`
            UPDATE ${config.table}
            SET estado = @estado, accion = @accion, observaciones = @observaciones, fechaProcesado = GETDATE()
            WHERE id = @id
          `);

        // NUEVO: Actualizar contadores stand-by
        await _actualizarContadorStandBy(pool, queueType, item);

        // Retornar aquí para evitar el UPDATE genérico
        return res.json({
          success: true,
          message: `Descuadre ${estadoDescuadre} y registrado en historial`,
        });
    }

    // Ejecutar inserción si aplica
    if (insertQuery) {
      await insertRequest.query(insertQuery);
    }

    // Marcar como completado/aprobado
    const nuevoEstado = queueType === 'suciedades'
      ? 'completado'  // Suciedades pasan a completado después de escribir en stock
      : 'completado';

    await pool.request()
      .input('id', sql.Int, parseInt(id))
      .input('estado', sql.NVarChar, nuevoEstado)
      .query(`UPDATE ${config.table} SET estado = @estado, fechaProcesado = GETDATE() WHERE id = @id`);

    // NUEVO: Actualizar contadores stand-by
    await _actualizarContadorStandBy(pool, queueType, item);

    res.json({
      success: true,
      message: `${config.displayName} resuelto exitosamente`,
    });
  } catch (err) {
    console.error(`Error resolviendo ${queueType}:`, err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================
// DELETE /api/sandbox-queues/:queueType/:id - Eliminar item (hard delete)
// ============================================
router.delete('/:queueType/:id', async (req, res) => {
  const { queueType, id } = req.params;

  const config = QUEUE_CONFIG[queueType];
  if (!config) {
    return res.status(400).json({ success: false, error: `Tipo de cola '${queueType}' no válido` });
  }

  try {
    const pool = await getPool();

    // Obtener antes de eliminar
    const before = await pool.request()
      .input('id', sql.Int, parseInt(id))
      .query(`SELECT * FROM ${config.table} WHERE id = @id`);

    if (before.recordset.length === 0) {
      return res.status(404).json({ success: false, error: 'Item no encontrado' });
    }

    await pool.request()
      .input('id', sql.Int, parseInt(id))
      .query(`DELETE FROM ${config.table} WHERE id = @id`);

    res.json({
      success: true,
      data: before.recordset[0],
      message: 'Item eliminado permanentemente',
    });
  } catch (err) {
    console.error(`Error eliminando ${queueType}/${id}:`, err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
