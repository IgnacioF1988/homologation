/**
 * Rutas de Procesos v2 - Ejecución paralela por fondo
 * Nuevas rutas para el sistema de logging estructurado
 * 
 * v2.1 - Corregido: el SP crea la ejecución internamente
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
    requestTimeout: 600000, // 10 minutos para procesos largos
  };

  inteligenciaPool = new sql.ConnectionPool(config);
  await inteligenciaPool.connect();
  console.log('Conectado a Inteligencia_Producto_Dev (v2)');
  return inteligenciaPool;
};

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

    // Primero crear la ejecución usando sp_Inicializar_Ejecucion
    const initRequest = pool.request();
    initRequest.input('FechaReporte', fechaReporte);
    initRequest.output('ID_Ejecucion', sql.Int);

    const initResult = await initRequest.execute('logs.sp_Inicializar_Ejecucion');
    const idEjecucion = initResult.output.ID_Ejecucion;

    const modoEjecucion = idFund ? `Fondo ${idFund}` : 'Todos los fondos';
    console.log(`[Ejecución ${idEjecucion}] Iniciada para fecha ${fechaReporte} - Modo: ${modoEjecucion}`);

    // Guardar en memoria para tracking
    activeExecutions.set(idEjecucion, {
      estado: 'EN_PROGRESO',
      fechaReporte,
      idFund: idFund || null,
      iniciadoEn: new Date(),
    });

    // Responder inmediatamente con el ID
    res.json({
      success: true,
      data: {
        ID_Ejecucion: idEjecucion,
        FechaReporte: fechaReporte,
        ID_Fund: idFund || null,
        Estado: 'EN_PROGRESO',
        IniciadoEn: new Date().toISOString(),
      },
    });

    // Ejecutar el proceso en background
    executeProcessV2(pool, idEjecucion, fechaReporte, idFund);

  } catch (err) {
    console.error('Error iniciando ejecución:', err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// Función para ejecutar el proceso en background
// idFund: null = todos los fondos, string = solo ese fondo
async function executeProcessV2(pool, idEjecucion, fechaReporte, idFund = null) {
  try {
    const request = pool.request();
    request.input('FechaReporte', fechaReporte);
    request.input('ID_Ejecucion', idEjecucion);

    // Pasar ID_Fund si se especificó (ejecución por fondo individual)
    if (idFund) {
      request.input('ID_Fund', idFund);
    }

    // Timeout largo para el proceso
    request.timeout = 600000; // 10 minutos

    // Capturar mensajes PRINT
    request.on('info', (info) => {
      if (info.message) {
        console.log(`[Ejecución ${idEjecucion}] ${info.message}`);
      }
    });

    // Ejecutar el orquestador v2
    const modoLog = idFund ? `(Fondo: ${idFund})` : '(Todos los fondos)';
    console.log(`[Ejecución ${idEjecucion}] Iniciando Process_Funds_v2 ${modoLog}...`);
    const result = await request.execute('process.Process_Funds_v2');
    console.log(`[Ejecución ${idEjecucion}] Process_Funds_v2 completado con código: ${result.returnValue}`);

    // Actualizar estado en memoria
    activeExecutions.set(idEjecucion, {
      ...activeExecutions.get(idEjecucion),
      estado: result.returnValue === 0 ? 'COMPLETADO' :
              result.returnValue === 1 ? 'PARCIAL' : 'ERROR',
      finalizadoEn: new Date(),
    });

  } catch (err) {
    console.error(`[Ejecución ${idEjecucion}] Error:`, err);

    // Marcar ejecución como error en BD
    try {
      await pool.request()
        .input('ID_Ejecucion', idEjecucion)
        .input('Error', err.message)
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
      .input('ID_Ejecucion', id)
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

    // Obtener fondos con estado
    const fondosResult = await pool.request()
      .input('ID_Ejecucion', id)
      .query(`
        SELECT 
          ef.*,
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
      .input('ID_Ejecucion', id)
      .query(`
        SELECT TOP 100 *
        FROM logs.Ejecucion_Logs
        WHERE ID_Ejecucion = @ID_Ejecucion
        ORDER BY Timestamp DESC
      `);

    // Obtener métricas por fondo con error
    const metricasResult = await pool.request()
      .input('ID_Ejecucion', id)
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
    request.input('ID_Ejecucion', id);

    if (estado) {
      query += ' AND ef.Estado_Final = @estado';
      request.input('estado', estado);
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
    request.input('ID_Ejecucion', id);
    request.input('offset', parseInt(offset));
    request.input('limit', parseInt(limit));

    if (idFund) {
      query += ' AND ID_Fund = @idFund';
      request.input('idFund', idFund);
    }

    if (nivel) {
      query += ' AND Nivel = @nivel';
      request.input('nivel', nivel);
    }

    if (etapa) {
      query += ' AND Etapa = @etapa';
      request.input('etapa', etapa);
    }

    query += `
      ORDER BY Timestamp DESC
      OFFSET @offset ROWS
      FETCH NEXT @limit ROWS ONLY
    `;

    const result = await request.query(query);

    // Contar total
    const countResult = await pool.request()
      .input('ID_Ejecucion', id)
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
    request.input('ID_Ejecucion', id);

    if (idFund) {
      query += ' AND m.ID_Fund = @idFund';
      request.input('idFund', idFund);
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
      .input('ID_Ejecucion', id)
      .input('ID_Fund', idFund)
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
      .input('ID_Ejecucion', id)
      .input('ID_Fund', idFund)
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
      .input('ID_Ejecucion', id)
      .input('ID_Fund', idFund)
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
      .input('ID_Ejecucion', id)
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
      .input('ID_Ejecucion', id)
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
      .input('ID_Ejecucion', id)
      .query(`
        SELECT *
        FROM logs.Ejecucion_Logs
        WHERE ID_Ejecucion = @ID_Ejecucion
          AND Nivel = 'ERROR'
        ORDER BY Timestamp DESC
      `);

    // Resumen por tipo de error
    const resumenErrores = await pool.request()
      .input('ID_Ejecucion', id)
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

module.exports = router;
