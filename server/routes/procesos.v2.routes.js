/**
 * Rutas de Procesos v2 - Ejecución paralela por fondo
 * Nuevas rutas para el sistema de logging estructurado
 * 
 * v2.1 - Corregido: el SP crea la ejecución internamente
 */

const express = require('express');
const router = express.Router();
const { getPool, sql } = require('../config/database');
const { FundOrchestrator } = require('../services/orchestration');
const { ExecutionTracker, LoggingService } = require('../services/tracking');

// Usa el pool centralizado de Inteligencia_Producto_Dev
const getInteligenciaPool = getPool;

// ============================================
// ALMACENAMIENTO EN MEMORIA PARA POLLING
// ============================================
const activeExecutions = new Map();
const EXECUTION_TTL_MS = 3600000; // 1 hora de TTL para ejecuciones en memoria
const MAX_EXECUTIONS_IN_MEMORY = 50; // Máximo de ejecuciones a mantener

// Limpieza periódica de ejecuciones antiguas (cada 10 minutos)
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;

  for (const [id, execution] of activeExecutions.entries()) {
    const executionAge = now - new Date(execution.iniciadoEn).getTime();
    // Eliminar si tiene más de 1 hora Y está completada/error
    if (executionAge > EXECUTION_TTL_MS &&
        ['COMPLETADO', 'ERROR', 'PARCIAL'].includes(execution.estado)) {
      activeExecutions.delete(id);
      cleaned++;
    }
  }

  // Si aún hay demasiadas, eliminar las más antiguas completadas
  if (activeExecutions.size > MAX_EXECUTIONS_IN_MEMORY) {
    const sortedEntries = [...activeExecutions.entries()]
      .filter(([_, e]) => ['COMPLETADO', 'ERROR', 'PARCIAL'].includes(e.estado))
      .sort((a, b) => new Date(a[1].iniciadoEn) - new Date(b[1].iniciadoEn));

    const toRemove = sortedEntries.slice(0, activeExecutions.size - MAX_EXECUTIONS_IN_MEMORY);
    toRemove.forEach(([id]) => activeExecutions.delete(id));
    cleaned += toRemove.length;
  }

  if (cleaned > 0) {
    console.log(`[Cleanup] ${cleaned} ejecuciones antiguas eliminadas de memoria`);
  }
}, 600000); // Cada 10 minutos

// ============================================
// POST /api/procesos/v2/ejecutar
// Inicia una nueva ejecución (todos los fondos o uno específico)
// Body: { fechaReporte: 'YYYY-MM-DD', idFund?: string }
// ============================================
router.post('/v2/ejecutar', async (req, res) => {
  const { fechaReporte, idFund } = req.body;

  // Validar fecha
  if (!fechaReporte || !/^\d{4}-\d{2}-\d{2}$/.test(fechaReporte)) {
    return res.status(400).json({
      success: false,
      error: 'Formato de fecha inválido. Use YYYY-MM-DD',
    });
  }

  try {
    const pool = await getInteligenciaPool();

    if (idFund) {
      return res.status(400).json({
        success: false,
        error: 'El SP actual no soporta procesamiento por fondo individual. Use fechaReporte para procesar todos los fondos.',
      });
    }

    // Llamar a sp_Inicializar_Ejecucion para crear ejecución CON fondos
    const initResult = await pool.request()
      .input('FechaReporte', sql.NVarChar(10), fechaReporte)
      .output('ID_Ejecucion', sql.BigInt)
      .execute('logs.sp_Inicializar_Ejecucion');

    const idEjecucion = initResult.output.ID_Ejecucion;
    console.log(`[Ejecución ${idEjecucion}] Inicializada correctamente con fondos para fecha ${fechaReporte}`);

    // Guardar en memoria para tracking
    activeExecutions.set(idEjecucion, {
      estado: 'EN_PROGRESO',
      fechaReporte,
      idFund: null,
      iniciadoEn: new Date(),
    });

    // Responder inmediatamente con el ID
    res.json({
      success: true,
      data: {
        ID_Ejecucion: idEjecucion,
        FechaReporte: fechaReporte,
        ID_Fund: null,
        Estado: 'EN_PROGRESO',
        IniciadoEn: new Date().toISOString(),
      },
    });

    // Ejecutar el proceso en background
    executeProcessV2(pool, idEjecucion, fechaReporte, null);

  } catch (err) {
    console.error('Error iniciando ejecución:', err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// Función para ejecutar el proceso en background usando Pipeline V2
// NUEVO: Usa FundOrchestrator con servicios individuales en vez de SP batch V1
async function executeProcessV2(pool, idEjecucion, fechaReporte, idFund = null) {
  try {
    // La ejecución ya fue inicializada por sp_Inicializar_Ejecucion
    // con todos los fondos activos registrados en logs.Ejecucion_Fondos

    console.log(`[Ejecución ${idEjecucion}] Iniciando Pipeline V2 para fecha ${fechaReporte}...`);

    // 1. Obtener fondos desde logs.Ejecucion_Fondos
    const fondosResult = await pool.request()
      .input('ID_Ejecucion', sql.BigInt, idEjecucion)
      .query(`
        SELECT
          ID_Fund, FundShortName,
          Portfolio_Geneva, Portfolio_CAPM, Portfolio_Derivados, Portfolio_UBS,
          Flag_UBS, Flag_Derivados, Requiere_Derivados
        FROM logs.Ejecucion_Fondos
        WHERE ID_Ejecucion = @ID_Ejecucion
          AND Incluir_En_Cubo = 1
        ORDER BY ID_Fund
      `);

    const fondos = fondosResult.recordset;
    console.log(`[Ejecución ${idEjecucion}] Fondos cargados: ${fondos.length}`);

    if (fondos.length === 0) {
      throw new Error('No hay fondos activos para procesar');
    }

    // 2. Instanciar servicios de tracking
    const tracker = new ExecutionTracker(pool);
    const logger = new LoggingService(pool);

    // 3. Crear y ejecutar orquestador V2
    const orchestrator = new FundOrchestrator(
      idEjecucion,
      fechaReporte,
      fondos,
      pool,
      tracker,
      logger
    );

    await orchestrator.initialize();
    console.log(`[Ejecución ${idEjecucion}] FundOrchestrator V2 inicializado`);

    const result = await orchestrator.execute();
    console.log(`[Ejecución ${idEjecucion}] FundOrchestrator V2 completado exitosamente`);

    // 4. Actualizar estado final en BD
    await pool.request()
      .input('ID_Ejecucion', sql.BigInt, idEjecucion)
      .query(`
        UPDATE logs.Ejecuciones
        SET Estado = 'COMPLETADO',
            Etapa_Actual = 'COMPLETADO',
            FechaFin = GETDATE()
        WHERE ID_Ejecucion = @ID_Ejecucion
      `);

    // 5. Actualizar estado en memoria
    activeExecutions.set(idEjecucion, {
      ...activeExecutions.get(idEjecucion),
      estado: 'COMPLETADO',
      finalizadoEn: new Date(),
    });

  } catch (err) {
    console.error(`[Ejecución ${idEjecucion}] Error en Pipeline V2:`, err);

    // Marcar ejecución como error en BD
    try {
      await pool.request()
        .input('ID_Ejecucion', sql.BigInt, idEjecucion)
        .input('Error', sql.NVarChar, err.message)
        .query(`
          UPDATE logs.Ejecuciones
          SET Estado = 'ERROR',
              Etapa_Actual = 'ERROR',
              FechaFin = GETDATE()
          WHERE ID_Ejecucion = @ID_Ejecucion
        `);
    } catch (updateErr) {
      console.error('Error actualizando estado:', updateErr);
    }

    // Actualizar estado en memoria
    activeExecutions.set(idEjecucion, {
      ...activeExecutions.get(idEjecucion),
      estado: 'ERROR',
      error: err.message,
      finalizadoEn: new Date(),
    });
  }
}

// ============================================
// GET /api/procesos/v2/ejecucion/:id
// Obtiene estado completo de una ejecución
// ============================================
router.get('/v2/ejecucion/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const pool = await getInteligenciaPool();

    // Obtener ejecución
    const ejecucionResult = await pool.request()
      .input('ID_Ejecucion', sql.BigInt, id)
      .query(`
        SELECT * FROM logs.Ejecuciones
        WHERE ID_Ejecucion = @ID_Ejecucion
      `);

    if (ejecucionResult.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Ejecución no encontrada',
      });
    }

    // Obtener fondos con estado (solo columnas esenciales para reducir payload)
    const fondosResult = await pool.request()
      .input('ID_Ejecucion', sql.BigInt, id)
      .query(`
        SELECT
          ef.ID,
          ef.ID_Ejecucion,
          ef.ID_Fund,
          ef.FundShortName,
          ef.Portfolio_Geneva,
          ef.Portfolio_CAPM,
          ef.Portfolio_Derivados,
          ef.Portfolio_UBS,
          -- Estados por etapa del pipeline (para visualización de barras)
          ef.Estado_Extraccion,
          ef.Estado_Process_IPA,
          ef.Estado_Process_CAPM,
          ef.Estado_Process_Derivados,
          ef.Estado_Process_PNL,
          ef.Estado_Process_UBS,
          ef.Estado_Concatenar,
          -- Estado final
          ef.Estado_Final,
          ef.Paso_Con_Error,
          ef.Mensaje_Error,
          ef.Inicio_Procesamiento,
          ef.Fin_Procesamiento,
          ef.Duracion_Ms,
          -- Flags
          ef.Requiere_Derivados,
          ef.Incluir_En_Cubo,
          ef.Elegible_Reproceso,
          -- Join FundName
          bf.FundName
        FROM logs.Ejecucion_Fondos ef
        LEFT JOIN dimensionales.BD_Funds bf ON CAST(ef.ID_Fund AS INT) = bf.ID_Fund
        WHERE ef.ID_Ejecucion = @ID_Ejecucion
        ORDER BY
          CASE ef.Estado_Final
            WHEN 'ERROR' THEN 1
            WHEN 'PARCIAL' THEN 2
            WHEN 'WARNING' THEN 3
            WHEN 'COMPLETADO' THEN 4
            ELSE 5
          END,
          ef.FundShortName
      `);

    // Obtener logs recientes
    const logsResult = await pool.request()
      .input('ID_Ejecucion', sql.BigInt, id)
      .query(`
        SELECT TOP 100 *
        FROM logs.Ejecucion_Logs
        WHERE ID_Ejecucion = @ID_Ejecucion
        ORDER BY Timestamp DESC
      `);

    // Obtener métricas por fondo con error
    const metricasResult = await pool.request()
      .input('ID_Ejecucion', sql.BigInt, id)
      .query(`
        SELECT m.*, ef.FundShortName
        FROM logs.Ejecucion_Metricas m
        INNER JOIN logs.Ejecucion_Fondos ef
          ON m.ID_Ejecucion = ef.ID_Ejecucion
          AND m.ID_Fund = ef.ID_Fund
        WHERE m.ID_Ejecucion = @ID_Ejecucion
          AND m.Validacion_OK = 0
      `);

    res.json({
      success: true,
      data: {
        ejecucion: ejecucionResult.recordset[0],
        fondos: fondosResult.recordset,
        logs: logsResult.recordset.reverse(),
        metricas: metricasResult.recordset,
      },
    });

  } catch (err) {
    console.error('Error obteniendo ejecución:', err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// ============================================
// GET /api/procesos/v2/historial
// Historial de ejecuciones
// ============================================
router.get('/v2/historial', async (req, res) => {
  const { fechaDesde, fechaHasta, limit = 20 } = req.query;

  try {
    const pool = await getInteligenciaPool();

    let query = `
      SELECT TOP (@limit)
        ID_Ejecucion,
        FechaReporte,
        FechaInicio,
        FechaFin,
        Estado,
        Etapa_Actual,
        TotalFondos,
        FondosExitosos,
        FondosFallidos,
        FondosWarning,
        TiempoTotal_Segundos
      FROM logs.Ejecuciones
      WHERE 1=1
    `;

    const request = pool.request();
    request.input('limit', parseInt(limit));

    if (fechaDesde) {
      query += ' AND FechaReporte >= @fechaDesde';
      request.input('fechaDesde', fechaDesde);
    }

    if (fechaHasta) {
      query += ' AND FechaReporte <= @fechaHasta';
      request.input('fechaHasta', fechaHasta);
    }

    query += ' ORDER BY FechaInicio DESC';

    const result = await request.query(query);

    res.json({
      success: true,
      data: result.recordset,
    });

  } catch (err) {
    console.error('Error obteniendo historial:', err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// ============================================
// GET /api/procesos/v2/ejecucion/:id/fondos
// Fondos de una ejecución con filtros
// ============================================
router.get('/v2/ejecucion/:id/fondos', async (req, res) => {
  const { id } = req.params;
  const { estado, etapa } = req.query;

  try {
    const pool = await getInteligenciaPool();

    let query = `
      SELECT 
        ef.*,
        bf.FundName,
        bf.FundBaseCurrency
      FROM logs.Ejecucion_Fondos ef
      LEFT JOIN dimensionales.BD_Funds bf ON CAST(ef.ID_Fund AS INT) = bf.ID_Fund
      WHERE ef.ID_Ejecucion = @ID_Ejecucion
    `;

    const request = pool.request();
    request.input('ID_Ejecucion', sql.BigInt, id);

    if (estado) {
      query += ' AND ef.Estado_Final = @estado';
      request.input('estado', sql.NVarChar, estado);
    }

    if (etapa) {
      // Filtrar por estado de una etapa específica
      const estadoColumn = `Estado_${etapa}`;
      query += ` AND ef.${estadoColumn} IN ('ERROR', 'WARNING')`;
    }

    query += ' ORDER BY ef.FundShortName';

    const result = await request.query(query);

    res.json({
      success: true,
      data: result.recordset,
    });

  } catch (err) {
    console.error('Error obteniendo fondos:', err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// ============================================
// GET /api/procesos/v2/ejecucion/:id/logs
// Logs de una ejecución con filtros
// ============================================
router.get('/v2/ejecucion/:id/logs', async (req, res) => {
  const { id } = req.params;
  const { idFund, nivel, etapa, offset = 0, limit = 100 } = req.query;

  try {
    const pool = await getInteligenciaPool();

    let query = `
      SELECT *
      FROM logs.Ejecucion_Logs
      WHERE ID_Ejecucion = @ID_Ejecucion
    `;

    const request = pool.request();
    request.input('ID_Ejecucion', sql.BigInt, id);
    request.input('offset', sql.Int, parseInt(offset));
    request.input('limit', sql.Int, parseInt(limit));

    if (idFund) {
      query += ' AND ID_Fund = @idFund';
      request.input('idFund', sql.NVarChar, idFund);
    }

    if (nivel) {
      query += ' AND Nivel = @nivel';
      request.input('nivel', sql.NVarChar, nivel);
    }

    if (etapa) {
      query += ' AND Etapa = @etapa';
      request.input('etapa', sql.NVarChar, etapa);
    }

    query += `
      ORDER BY Timestamp DESC
      OFFSET @offset ROWS
      FETCH NEXT @limit ROWS ONLY
    `;

    const result = await request.query(query);

    // Contar total
    const countResult = await pool.request()
      .input('ID_Ejecucion', sql.BigInt, id)
      .query(`
        SELECT COUNT(*) as total
        FROM logs.Ejecucion_Logs
        WHERE ID_Ejecucion = @ID_Ejecucion
      `);

    res.json({
      success: true,
      data: {
        logs: result.recordset.reverse(),
        total: countResult.recordset[0].total,
        offset: parseInt(offset),
      },
    });

  } catch (err) {
    console.error('Error obteniendo logs:', err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// ============================================
// GET /api/procesos/v2/ejecucion/:id/metricas
// Métricas de una ejecución
// ============================================
router.get('/v2/ejecucion/:id/metricas', async (req, res) => {
  const { id } = req.params;
  const { idFund } = req.query;

  try {
    const pool = await getInteligenciaPool();

    let query = `
      SELECT 
        m.*,
        ef.FundShortName
      FROM logs.Ejecucion_Metricas m
      INNER JOIN logs.Ejecucion_Fondos ef 
        ON m.ID_Ejecucion = ef.ID_Ejecucion 
        AND m.ID_Fund = ef.ID_Fund
      WHERE m.ID_Ejecucion = @ID_Ejecucion
    `;

    const request = pool.request();
    request.input('ID_Ejecucion', sql.BigInt, id);

    if (idFund) {
      query += ' AND m.ID_Fund = @idFund';
      request.input('idFund', sql.NVarChar, idFund);
    }

    query += ' ORDER BY m.Etapa, ef.FundShortName';

    const result = await request.query(query);

    res.json({
      success: true,
      data: result.recordset,
    });

  } catch (err) {
    console.error('Error obteniendo métricas:', err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// ============================================
// POST /api/procesos/v2/ejecucion/:id/reprocesar
// Reprocesa un fondo específico
// ============================================
router.post('/v2/ejecucion/:id/reprocesar', async (req, res) => {
  const { id } = req.params;
  const { idFund } = req.body;

  if (!idFund) {
    return res.status(400).json({
      success: false,
      error: 'Se requiere idFund',
    });
  }

  try {
    const pool = await getInteligenciaPool();

    // Verificar que el fondo sea elegible para reproceso
    const checkResult = await pool.request()
      .input('ID_Ejecucion', sql.BigInt, id)
      .input('ID_Fund', sql.NVarChar, idFund)
      .query(`
        SELECT ef.Elegible_Reproceso, e.FechaReporte
        FROM logs.Ejecucion_Fondos ef
        INNER JOIN logs.Ejecuciones e ON ef.ID_Ejecucion = e.ID_Ejecucion
        WHERE ef.ID_Ejecucion = @ID_Ejecucion
          AND ef.ID_Fund = @ID_Fund
      `);

    if (checkResult.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Fondo no encontrado en la ejecución',
      });
    }

    if (!checkResult.recordset[0].Elegible_Reproceso) {
      return res.status(400).json({
        success: false,
        error: 'El fondo no es elegible para reproceso',
      });
    }

    // Resetear estado del fondo
    await pool.request()
      .input('ID_Ejecucion', sql.BigInt, id)
      .input('ID_Fund', sql.NVarChar, idFund)
      .query(`
        UPDATE logs.Ejecucion_Fondos
        SET
          Estado_Process_IPA = NULL,
          Estado_IPA_01_RescatarLocalPrice = NULL,
          Estado_IPA_02_AjusteSONA = NULL,
          Estado_IPA_03_RenombrarCxCCxP = NULL,
          Estado_IPA_04_TratamientoSuciedades = NULL,
          Estado_IPA_05_EliminarCajasMTM = NULL,
          Estado_IPA_06_CrearDimensiones = NULL,
          Estado_IPA_07_AgruparRegistros = NULL,
          Estado_Process_CAPM = NULL,
          Estado_Process_Derivados = NULL,
          Estado_Process_PNL = NULL,
          Estado_Process_UBS = NULL,
          Estado_Concatenar = NULL,
          Estado_Final = NULL,
          Paso_Con_Error = NULL,
          Mensaje_Error = NULL,
          Elegible_Reproceso = 0
        WHERE ID_Ejecucion = @ID_Ejecucion
          AND ID_Fund = @ID_Fund
      `);

    // Registrar log
    await pool.request()
      .input('ID_Ejecucion', sql.BigInt, id)
      .input('ID_Fund', sql.NVarChar, idFund)
      .query(`
        INSERT INTO logs.Ejecucion_Logs (ID_Ejecucion, ID_Fund, Nivel, Categoria, Etapa, Mensaje)
        VALUES (@ID_Ejecucion, @ID_Fund, 'INFO', 'SISTEMA', 'REPROCESO', 'Iniciando reproceso del fondo')
      `);

    const fechaReporte = checkResult.recordset[0].FechaReporte;

    // Responder inmediatamente
    res.json({
      success: true,
      message: 'Reproceso iniciado',
      data: {
        ID_Ejecucion: parseInt(id),
        ID_Fund: idFund,
        FechaReporte: fechaReporte,
      },
    });

    // Ejecutar reproceso en background (usando el mismo ID_Ejecucion)
    executeProcessV2(pool, parseInt(id), fechaReporte, idFund);

  } catch (err) {
    console.error('Error reprocesando fondo:', err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// ============================================
// GET /api/procesos/v2/ejecucion/:id/estadisticas-etapas
// Estadísticas agregadas por etapa
// ============================================
router.get('/v2/ejecucion/:id/estadisticas-etapas', async (req, res) => {
  const { id } = req.params;

  try {
    const pool = await getInteligenciaPool();

    const result = await pool.request()
      .input('ID_Ejecucion', sql.BigInt, id)
      .query(`
        SELECT
          'EXTRACCION' as Etapa,
          SUM(CASE WHEN Estado_Extraccion = 'OK' THEN 1 ELSE 0 END) as OK,
          SUM(CASE WHEN Estado_Extraccion = 'ERROR' THEN 1 ELSE 0 END) as Error,
          SUM(CASE WHEN Estado_Extraccion = 'WARNING' THEN 1 ELSE 0 END) as Warning,
          SUM(CASE WHEN Estado_Extraccion IS NULL OR Estado_Extraccion = 'EN_PROGRESO' THEN 1 ELSE 0 END) as Pendiente
        FROM logs.Ejecucion_Fondos WHERE ID_Ejecucion = @ID_Ejecucion

        UNION ALL

        SELECT
          'VALIDACION',
          SUM(CASE WHEN Estado_Validacion = 'OK' THEN 1 ELSE 0 END),
          SUM(CASE WHEN Estado_Validacion = 'ERROR' THEN 1 ELSE 0 END),
          SUM(CASE WHEN Estado_Validacion = 'WARNING' THEN 1 ELSE 0 END),
          SUM(CASE WHEN Estado_Validacion IS NULL OR Estado_Validacion = 'EN_PROGRESO' THEN 1 ELSE 0 END)
        FROM logs.Ejecucion_Fondos WHERE ID_Ejecucion = @ID_Ejecucion

        UNION ALL

        SELECT
          'PROCESS_IPA',
          SUM(CASE WHEN Estado_Process_IPA = 'OK' THEN 1 ELSE 0 END),
          SUM(CASE WHEN Estado_Process_IPA = 'ERROR' THEN 1 ELSE 0 END),
          SUM(CASE WHEN Estado_Process_IPA = 'WARNING' THEN 1 ELSE 0 END),
          SUM(CASE WHEN Estado_Process_IPA IS NULL OR Estado_Process_IPA = 'EN_PROGRESO' THEN 1 ELSE 0 END)
        FROM logs.Ejecucion_Fondos WHERE ID_Ejecucion = @ID_Ejecucion

        UNION ALL

        SELECT
          'PROCESS_CAPM',
          SUM(CASE WHEN Estado_Process_CAPM = 'OK' THEN 1 ELSE 0 END),
          SUM(CASE WHEN Estado_Process_CAPM = 'ERROR' THEN 1 ELSE 0 END),
          SUM(CASE WHEN Estado_Process_CAPM = 'WARNING' THEN 1 ELSE 0 END),
          SUM(CASE WHEN Estado_Process_CAPM IS NULL OR Estado_Process_CAPM = 'EN_PROGRESO' THEN 1 ELSE 0 END)
        FROM logs.Ejecucion_Fondos WHERE ID_Ejecucion = @ID_Ejecucion

        UNION ALL

        SELECT
          'PROCESS_DERIVADOS',
          SUM(CASE WHEN Estado_Process_Derivados IN ('OK', 'N/A') THEN 1 ELSE 0 END),
          SUM(CASE WHEN Estado_Process_Derivados = 'ERROR' THEN 1 ELSE 0 END),
          SUM(CASE WHEN Estado_Process_Derivados = 'WARNING' THEN 1 ELSE 0 END),
          SUM(CASE WHEN Estado_Process_Derivados IS NULL OR Estado_Process_Derivados = 'EN_PROGRESO' THEN 1 ELSE 0 END)
        FROM logs.Ejecucion_Fondos WHERE ID_Ejecucion = @ID_Ejecucion

        UNION ALL

        SELECT
          'PROCESS_PNL',
          SUM(CASE WHEN Estado_Process_PNL IN ('OK', 'N/A') THEN 1 ELSE 0 END),
          SUM(CASE WHEN Estado_Process_PNL = 'ERROR' THEN 1 ELSE 0 END),
          SUM(CASE WHEN Estado_Process_PNL = 'WARNING' THEN 1 ELSE 0 END),
          SUM(CASE WHEN Estado_Process_PNL IS NULL OR Estado_Process_PNL = 'EN_PROGRESO' THEN 1 ELSE 0 END)
        FROM logs.Ejecucion_Fondos WHERE ID_Ejecucion = @ID_Ejecucion

        UNION ALL

        SELECT
          'PROCESS_UBS',
          SUM(CASE WHEN Estado_Process_UBS IN ('OK', 'N/A') THEN 1 ELSE 0 END),
          SUM(CASE WHEN Estado_Process_UBS = 'ERROR' THEN 1 ELSE 0 END),
          SUM(CASE WHEN Estado_Process_UBS = 'WARNING' THEN 1 ELSE 0 END),
          SUM(CASE WHEN Estado_Process_UBS IS NULL OR Estado_Process_UBS = 'EN_PROGRESO' THEN 1 ELSE 0 END)
        FROM logs.Ejecucion_Fondos WHERE ID_Ejecucion = @ID_Ejecucion

        UNION ALL

        SELECT
          'CONCATENAR',
          SUM(CASE WHEN Estado_Concatenar = 'OK' THEN 1 ELSE 0 END),
          SUM(CASE WHEN Estado_Concatenar = 'ERROR' THEN 1 ELSE 0 END),
          SUM(CASE WHEN Estado_Concatenar = 'WARNING' THEN 1 ELSE 0 END),
          SUM(CASE WHEN Estado_Concatenar IS NULL OR Estado_Concatenar = 'EN_PROGRESO' THEN 1 ELSE 0 END)
        FROM logs.Ejecucion_Fondos WHERE ID_Ejecucion = @ID_Ejecucion
      `);

    res.json({
      success: true,
      data: result.recordset,
    });

  } catch (err) {
    console.error('Error obteniendo estadísticas:', err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// ============================================
// GET /api/procesos/v2/pipeline/config
// Configuración del pipeline
// ============================================
router.get('/v2/pipeline/config', async (req, res) => {
  // Devolver configuración estática por ahora
  res.json({
    success: true,
    data: [
      { id: 'EXTRACCION', nombre: 'Extracción', orden: 1 },
      { id: 'VALIDACION', nombre: 'Validación', orden: 2 },
      { id: 'PROCESS_IPA', nombre: 'IPA', orden: 3 },
      { id: 'PROCESS_CAPM', nombre: 'CAPM', orden: 4 },
      { id: 'PROCESS_DERIVADOS', nombre: 'Derivados', orden: 5 },
      { id: 'PROCESS_PNL', nombre: 'PNL', orden: 6 },
      { id: 'PROCESS_UBS', nombre: 'UBS', orden: 7 },
      { id: 'CONCATENAR', nombre: 'Cubo', orden: 8 },
    ],
  });
});

// ============================================
// GET /api/procesos/v2/ejecucion/:id/diagnostico
// Diagnóstico completo de una ejecución
// ============================================
router.get('/v2/ejecucion/:id/diagnostico', async (req, res) => {
  const { id } = req.params;

  try {
    const pool = await getInteligenciaPool();

    // Fondos con error
    const fondosError = await pool.request()
      .input('ID_Ejecucion', sql.BigInt, id)
      .query(`
        SELECT
          ef.ID_Fund,
          ef.FundShortName,
          ef.Paso_Con_Error,
          ef.Mensaje_Error,
          m.Valor_Esperado,
          m.Valor_Obtenido,
          m.Diferencia,
          m.Diferencia_Porcentual
        FROM logs.Ejecucion_Fondos ef
        LEFT JOIN logs.Ejecucion_Metricas m
          ON ef.ID_Ejecucion = m.ID_Ejecucion
          AND ef.ID_Fund = m.ID_Fund
          AND ef.Paso_Con_Error = m.Etapa
        WHERE ef.ID_Ejecucion = @ID_Ejecucion
          AND ef.Estado_Final IN ('ERROR', 'PARCIAL', 'WARNING')
      `);

    // Logs de error
    const logsError = await pool.request()
      .input('ID_Ejecucion', sql.BigInt, id)
      .query(`
        SELECT *
        FROM logs.Ejecucion_Logs
        WHERE ID_Ejecucion = @ID_Ejecucion
          AND Nivel = 'ERROR'
        ORDER BY Timestamp DESC
      `);

    // Resumen por tipo de error
    const resumenErrores = await pool.request()
      .input('ID_Ejecucion', sql.BigInt, id)
      .query(`
        SELECT
          Paso_Con_Error,
          COUNT(*) as CantidadFondos,
          STRING_AGG(FundShortName, ', ') as Fondos
        FROM logs.Ejecucion_Fondos
        WHERE ID_Ejecucion = @ID_Ejecucion
          AND Paso_Con_Error IS NOT NULL
        GROUP BY Paso_Con_Error
      `);

    res.json({
      success: true,
      data: {
        fondosConError: fondosError.recordset,
        logsError: logsError.recordset,
        resumenErrores: resumenErrores.recordset,
      },
    });

  } catch (err) {
    console.error('Error obteniendo diagnóstico:', err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// ============================================
// GET /api/procesos/v2/fondos-en-standby
// Lista fondos pausados esperando aprobación
// ============================================
router.get('/v2/fondos-en-standby', async (req, res) => {
  try {
    const pool = await getInteligenciaPool();

    const result = await pool.request().query(`
      SELECT
        fsb.ID_Ejecucion, fsb.ID_Fund, f.FundShortName, f.FundName,
        fsb.TipoProblema, fsb.MotivoDetallado, fsb.Estado,
        fsb.PuntoBloqueo, fsb.CantidadProblemas, fsb.ProblemasResueltos,
        fsb.FechaDeteccion, e.FechaReporte, e.Estado as EstadoEjecucion,
        ef.EstadoStandBy, ef.PuntoBloqueoActual
      FROM logs.FondosEnStandBy fsb
      INNER JOIN dimensionales.BD_Funds f ON fsb.ID_Fund = f.ID_Fund
      INNER JOIN logs.Ejecuciones e ON fsb.ID_Ejecucion = e.ID_Ejecucion
      LEFT JOIN logs.Ejecucion_Fondos ef
        ON fsb.ID_Ejecucion = ef.ID_Ejecucion AND fsb.ID_Fund = ef.ID_Fund
      WHERE fsb.Estado IN ('PENDIENTE', 'APROBADO')
      ORDER BY fsb.FechaDeteccion DESC
    `);

    res.json({ success: true, data: result.recordset });

  } catch (error) {
    console.error('Error obteniendo fondos en stand-by:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// POST /api/procesos/v2/:idEjecucion/resume/:idFund
// Resumir fondo pausado después de aprobación
// ============================================
router.post('/v2/:idEjecucion/resume/:idFund', async (req, res) => {
  const { idEjecucion, idFund } = req.params;

  try {
    const pool = await getInteligenciaPool();

    // 1. Verificar estado
    const estadoResult = await pool.request()
      .input('ID_Ejecucion', sql.BigInt, idEjecucion)
      .input('ID_Fund', sql.Int, idFund)
      .query(`
        SELECT EstadoStandBy, PuntoBloqueoActual
        FROM logs.Ejecucion_Fondos
        WHERE ID_Ejecucion = @ID_Ejecucion AND ID_Fund = @ID_Fund
      `);

    if (estadoResult.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Fondo no encontrado en esta ejecución'
      });
    }

    const estado = estadoResult.recordset[0];

    if (estado.EstadoStandBy !== 'APROBADO') {
      return res.status(400).json({
        success: false,
        error: `Estado actual: ${estado.EstadoStandBy}. Debe estar APROBADO para poder resumir.`
      });
    }

    // 2. Determinar servicios a ejecutar según punto de bloqueo
    const puntosResume = {
      'ANTES_CAPM': ['PROCESS_CAPM', 'PROCESS_PNL'],
      'ANTES_PNL': ['PROCESS_PNL'],
      'MID_IPA': null, // Requiere re-ejecución manual completa
      'MID_CAPM': null, // Requiere re-ejecución manual completa
      'MID_PNL': null, // Requiere re-ejecución manual completa
      'MID_DERIVADOS': null, // Requiere re-ejecución manual completa
      'POST_DERIVADOS': [], // Ya completó, solo limpiar estado
      'POST_PNL': [] // Ya completó, solo limpiar estado
    };

    const servicios = puntosResume[estado.PuntoBloqueoActual];

    if (servicios === null) {
      return res.status(400).json({
        success: false,
        error: `Pausa en ${estado.PuntoBloqueoActual} requiere re-ejecución manual completa del fondo desde Mission Control`
      });
    }

    // 3. Actualizar estado a EN_RESUMEN
    await pool.request()
      .input('ID_Ejecucion', sql.BigInt, idEjecucion)
      .input('ID_Fund', sql.Int, idFund)
      .query(`
        UPDATE logs.Ejecucion_Fondos
        SET EstadoStandBy = 'EN_RESUMEN',
            FechaUltimoResume = GETDATE()
        WHERE ID_Ejecucion = @ID_Ejecucion AND ID_Fund = @ID_Fund;
      `);

    // 4. Re-ejecutar servicios pendientes si hay alguno
    if (servicios.length > 0) {
      // Obtener fecha reporte de la ejecución
      const ejecResult = await pool.request()
        .input('ID_Ejecucion', sql.BigInt, idEjecucion)
        .query('SELECT FechaReporte FROM logs.Ejecuciones WHERE ID_Ejecucion = @ID_Ejecucion');

      const fechaReporte = ejecResult.recordset[0]?.FechaReporte;

      if (fechaReporte) {
        // Ejecutar servicios en background
        console.log(`[Resume] Iniciando re-ejecución de servicios para fondo ${idFund}: ${servicios.join(', ')}`);
        // TODO: Implementar lógica de orquestación para ejecutar solo servicios específicos
        // Por ahora retornamos la lista de servicios que deberían ejecutarse
      }
    }

    // 5. Limpiar estado stand-by
    await pool.request()
      .input('ID_Ejecucion', sql.BigInt, idEjecucion)
      .input('ID_Fund', sql.Int, idFund)
      .query(`
        UPDATE logs.Ejecucion_Fondos
        SET EstadoStandBy = NULL,
            PuntoBloqueoActual = NULL,
            ContadorPauses = ISNULL(ContadorPauses, 0)
        WHERE ID_Ejecucion = @ID_Ejecucion AND ID_Fund = @ID_Fund;

        UPDATE logs.FondosEnStandBy
        SET FechaResume = GETDATE()
        WHERE ID_Ejecucion = @ID_Ejecucion
          AND ID_Fund = @ID_Fund
          AND Estado = 'APROBADO';
      `);

    // Registrar log
    await pool.request()
      .input('ID_Ejecucion', sql.BigInt, idEjecucion)
      .input('ID_Fund', sql.Int, idFund)
      .query(`
        INSERT INTO logs.Ejecucion_Logs (ID_Ejecucion, ID_Fund, Nivel, Categoria, Etapa, Mensaje)
        VALUES (@ID_Ejecucion, @ID_Fund, 'INFO', 'SISTEMA', 'RESUME',
                'Fondo resumido después de aprobación stand-by')
      `);

    res.json({
      success: true,
      message: `Fondo ${idFund} resumido exitosamente desde ${estado.PuntoBloqueoActual}`,
      data: {
        ID_Ejecucion: parseInt(idEjecucion),
        ID_Fund: parseInt(idFund),
        PuntoBloqueoAnterior: estado.PuntoBloqueoActual,
        ServiciosPendientes: servicios,
      }
    });

  } catch (err) {
    console.error('Error resumiendo fondo:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
