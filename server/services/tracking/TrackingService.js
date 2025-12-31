/**
 * TrackingService - Servicio unificado de tracking del pipeline ETL
 *
 * REEMPLAZA:
 * - ExecutionTracker.js (598 lineas)
 * - LoggingService.js (618 lineas)
 * - TraceService.js (272 lineas)
 *
 * ARQUITECTURA:
 * - Escucha eventos de PipelineEventEmitter
 * - Persiste estados en logs.Ejecuciones
 * - Registra eventos ERROR/WARNING/STAND_BY en logs.EventosDetallados
 * - Registra stand-by en logs.StandBy
 * - Notifica via WebSocket
 *
 * NO HACE:
 * - console.log (ELIMINADO)
 * - Logs de DEBUG/INFO (ELIMINADO - granularidad hibrida)
 * - Trace records de performance (ELIMINADO)
 *
 * @module TrackingService
 */

const sql = require('mssql');
const pipelineEvents = require('../events/PipelineEventEmitter');
const { getInstance: getSandboxWriter } = require('../sandbox/SandboxWriterService');
const { getInstance: getLogsWriter } = require('../logs/LogsWriterService');
const { getFlagColumn } = require('../../constants/standby');

class TrackingService {
  /**
   * Constructor del TrackingService
   * @param {object} pool - Pool de conexiones SQL Server
   */
  constructor(pool) {
    if (!pool) {
      throw new Error('TrackingService requiere un pool de conexiones valido');
    }

    this.pool = pool;
    this.wsManager = null;
    this.sandboxWriter = null;
    this.logsWriter = null;
    this._initialized = false;
  }

  /**
   * Inicializa el servicio y configura los listeners de eventos
   */
  initialize() {
    if (this._initialized) {
      return;
    }

    // Inicializar servicios de escritura (singletons)
    this.sandboxWriter = getSandboxWriter(this.pool);
    this.logsWriter = getLogsWriter(this.pool);

    this._setupListeners();
    this._loadWebSocketManager();
    this._initialized = true;
  }

  /**
   * Carga el WebSocketManager dinamicamente para evitar dependencias circulares
   * @private
   */
  _loadWebSocketManager() {
    try {
      const WebSocketManager = require('../../websocket/WebSocketManager');
      this.wsManager = WebSocketManager.getInstance ? WebSocketManager.getInstance() : WebSocketManager;
    } catch (err) {
      // WebSocket opcional - si no esta disponible, continuamos sin el
      this.wsManager = null;
    }
  }

  /**
   * Configura los listeners para eventos del pipeline
   * @private
   */
  _setupListeners() {
    // =============================================
    // EVENTOS DE SERVICIO
    // =============================================

    // Servicio iniciado -> actualizar estado a EN_PROGRESO
    pipelineEvents.on('servicio:inicio', async (data) => {
      try {
        await this.logsWriter.actualizarEstadoServicio(data.idEjecucion, data.servicio, 'EN_PROGRESO');
        this._notifyWebSocket('SERVICIO_INICIO', data);
      } catch (_err) {
        // Error silencioso
      }
    });

    // Servicio terminado OK -> actualizar estado a OK
    pipelineEvents.on('servicio:fin', async (data) => {
      try {
        await this.logsWriter.actualizarEstadoServicio(data.idEjecucion, data.servicio, 'OK');
        this._notifyWebSocket('SERVICIO_FIN', data);
      } catch (_err) {
        // Error silencioso
      }
    });

    // Servicio con error -> actualizar estado + registrar evento + registrar fondo problema
    // TRANSACCION: Todas las operaciones son atómicas
    pipelineEvents.on('servicio:error', async (data) => {
      const transaction = new sql.Transaction(this.pool);
      try {
        await transaction.begin();

        // 1. Actualizar estado del servicio (usa SP)
        await this.logsWriter.actualizarEstadoServicio(data.idEjecucion, data.servicio, 'ERROR');

        // 2. Registrar evento detallado
        await this.logsWriter.registrarEvento(
          data.idEjecucion,
          data.idFund,
          'ERROR',
          data.servicio,
          data.subEtapa,
          data.error.message,
          data.error.stack,
          { code: data.error.code, name: data.error.name },
          transaction
        );

        // 3. Actualizar info de error
        await this.logsWriter.actualizarErrorInfo(data.idEjecucion, data.servicio, data.error.message, transaction);

        // 4. Delegar a SandboxWriterService (con transacción)
        await this.sandboxWriter.escribirFondoProblema(data.idEjecucion, data.idFund, data.servicio, 'ERROR_PROCESO', transaction);

        await transaction.commit();
        this._notifyWebSocket('SERVICIO_ERROR', data);
      } catch (err) {
        try {
          await transaction.rollback();
        } catch (_rollbackErr) {
          // Ignorar error de rollback
        }
        console.error('[TrackingService] Error en servicio:error handler:', err.message);
      }
    });

    // Código 4: Retry exhausted -> registrar como error especial
    // TRANSACCION: Todas las operaciones son atómicas
    pipelineEvents.on('retry:exhausted', async (data) => {
      const transaction = new sql.Transaction(this.pool);
      try {
        await transaction.begin();

        // 1. Actualizar estado del servicio (usa SP)
        await this.logsWriter.actualizarEstadoServicio(data.idEjecucion, data.servicio, 'ERROR');

        // 2. Registrar evento detallado
        await this.logsWriter.registrarEvento(
          data.idEjecucion,
          data.idFund,
          'RETRY_EXHAUSTED',
          data.servicio,
          data.spName,
          `Reintentos agotados (${data.attempts} intentos): ${data.error.message}`,
          null,
          {
            attempts: data.attempts,
            isDeadlock: data.error.isDeadlock,
            isTimeout: data.error.isTimeout,
            isConnection: data.error.isConnection,
            originalCode: data.error.code
          },
          transaction
        );

        // 3. Actualizar info de error
        await this.logsWriter.actualizarErrorInfo(data.idEjecucion, data.servicio, `RETRY_EXHAUSTED: ${data.error.message}`, transaction);

        // 4. Delegar a SandboxWriterService (con transacción)
        await this.sandboxWriter.escribirFondoProblema(data.idEjecucion, data.idFund, data.servicio, 'RETRY_EXHAUSTED', transaction);

        await transaction.commit();
        this._notifyWebSocket('RETRY_EXHAUSTED', data);
      } catch (err) {
        try {
          await transaction.rollback();
        } catch (_rollbackErr) {
          // Ignorar error de rollback
        }
        console.error('[TrackingService] Error en retry:exhausted handler:', err.message);
      }
    });

    // Warning -> registrar evento (no cambia estado)
    pipelineEvents.on('servicio:warning', async (data) => {
      try {
        await this.logsWriter.registrarEvento(
          data.idEjecucion,
          data.idFund,
          'WARNING',
          data.servicio,
          null,
          data.mensaje,
          null,
          data.datos
        );
        this._notifyWebSocket('SERVICIO_WARNING', data);
      } catch (_err) {
        // Error silencioso
      }
    });

    // Servicio omitido -> actualizar estado a N/A u OMITIDO
    pipelineEvents.on('servicio:omitido', async (data) => {
      try {
        await this.logsWriter.actualizarEstadoServicio(data.idEjecucion, data.servicio, 'N/A');
        this._notifyWebSocket('SERVICIO_OMITIDO', data);
      } catch (_err) {
        // Error silencioso
      }
    });

    // =============================================
    // EVENTOS DE STAND-BY
    // =============================================

    // Stand-by activado -> actualizar estado + registrar stand-by + evento + sandbox
    // TRANSACCION: Todas las operaciones son atómicas
    pipelineEvents.on('standby:activado', async (data) => {
      const transaction = new sql.Transaction(this.pool);
      try {
        await transaction.begin();

        // 1. Actualizar estado del servicio (usa SP)
        await this.logsWriter.actualizarEstadoServicio(data.idEjecucion, data.servicio, 'STAND_BY');

        // 2. Registrar stand-by en logs.StandBy
        await this.logsWriter.registrarStandBy(data, transaction);

        // 3. Registrar evento detallado
        await this.logsWriter.registrarEvento(
          data.idEjecucion,
          data.idFund,
          'STAND_BY',
          data.servicio,
          data.detalles.puntoBloqueo,
          `Stand-by codigo ${data.codigoStandBy}: ${data.detalles.tipoProblema}`,
          null,
          data.detalles,
          transaction
        );

        // 4. Actualizar flags de problema
        await this.logsWriter.actualizarFlagsProblema(data.idEjecucion, data.detalles.tipoProblema, transaction);

        // 5. Delegar escritura sandbox (con transacción)
        await this.sandboxWriter.escribirPorCodigo(data.codigoStandBy, data.idEjecucion, data, transaction);

        await transaction.commit();
        this._notifyWebSocket('STANDBY_ACTIVADO', data);
      } catch (err) {
        // Rollback si algo falla
        try {
          await transaction.rollback();
        } catch (_rollbackErr) {
          // Ignorar error de rollback
        }
        // Log error real en lugar de silencioso
        console.error('[TrackingService] Error en standby:activado handler:', err.message);
      }
    });

    // =============================================
    // EVENTOS DE SP (tracking granular)
    // =============================================

    // SP completado -> notificar WebSocket para UI en tiempo real
    // NOTA: El tracking granular (Estado_IPA_01_*, etc.) requiere columnas
    // adicionales en logs.Ejecuciones que no están implementadas aún.
    // Por ahora solo notificamos via WebSocket para feedback en tiempo real.
    pipelineEvents.on('sp:completado', (data) => {
      this._notifyWebSocket('SP_COMPLETADO', {
        idEjecucion: data.idEjecucion,
        idFund: data.idFund,
        servicio: data.servicio,
        spName: data.spName,
        subStateField: data.subStateField,
        duracionMs: data.duracionMs,
        rowsProcessed: data.rowsProcessed,
        timestamp: data.timestamp
      });
    });

    // =============================================
    // EVENTOS DE PROCESO
    // =============================================

    // Proceso iniciado
    pipelineEvents.on('proceso:inicio', (data) => {
      this._notifyWebSocket('PROCESO_INICIO', data);
    });

    // Proceso terminado -> actualizar stats
    pipelineEvents.on('proceso:fin', async (data) => {
      try {
        await this.logsWriter.finalizarProceso(data.idProceso, data.resumen);
        this._notifyWebSocket('PROCESO_FIN', data);
      } catch (_err) {
        // Error silencioso
      }
    });

    // =============================================
    // EVENTOS DE EJECUCION
    // =============================================

    pipelineEvents.on('ejecucion:inicio', (data) => {
      this._notifyWebSocket('EJECUCION_INICIO', data);
    });

    pipelineEvents.on('ejecucion:fin', async (data) => {
      try {
        await this.logsWriter.finalizarEjecucion(data.idEjecucion, data.estadoFinal);
        this._notifyWebSocket('EJECUCION_FIN', data);
      } catch (_err) {
        // Error silencioso
      }
    });
  }

  // =============================================
  // METODOS PUBLICOS - INICIALIZACION
  // =============================================

  /**
   * Inicializa un nuevo proceso en la BD
   * @param {string} fechaReporte - Fecha a procesar
   * @param {number} totalFondos - Total de fondos (opcional, se actualiza despues)
   * @param {string} usuario - Usuario que ejecuta
   * @returns {Promise<number>} ID del proceso creado
   */
  async initializeProceso(fechaReporte, totalFondos = 0, usuario = null) {
    const idProceso = await this.logsWriter.inicializarProceso(fechaReporte, usuario);

    // Emitir evento de inicio
    pipelineEvents.emitProcesoInicio(idProceso, fechaReporte, totalFondos, usuario);

    return idProceso;
  }

  /**
   * Inicializa una ejecucion para un fondo
   * @param {number} idProceso - ID del proceso padre
   * @param {number} idFund - ID del fondo
   * @param {string} fundShortName - Nombre corto
   * @param {object} portfolios - Portfolios por sistema
   * @returns {Promise<number>} ID de la ejecucion creada
   */
  async initializeEjecucion(idProceso, idFund, fundShortName, portfolios = {}) {
    const idEjecucion = await this.logsWriter.inicializarEjecucion(idProceso, idFund, fundShortName, portfolios);

    // Emitir evento
    pipelineEvents.emitEjecucionInicio(idEjecucion, idFund, fundShortName);

    return idEjecucion;
  }

  /**
   * Finaliza una ejecucion con estado final
   * @param {number} idEjecucion - ID de la ejecucion
   * @param {string} estadoFinal - Estado final (OK, ERROR, STAND_BY, OMITIDO)
   * @param {number} duracionMs - Duracion total opcional
   */
  async finalizarEjecucion(idEjecucion, estadoFinal, duracionMs = null) {
    await this.logsWriter.finalizarEjecucion(idEjecucion, estadoFinal);

    // Obtener ID_Fund para el evento
    const idFund = await this.logsWriter.getIdFundFromEjecucion(idEjecucion);

    if (idFund) {
      pipelineEvents.emitEjecucionFin(idEjecucion, idFund, estadoFinal, duracionMs);
    }
  }

  /**
   * Finaliza un proceso con resumen de resultados
   * @param {number} idProceso - ID del proceso
   * @param {object} resumen - Resumen de fondos
   */
  async finalizarProceso(idProceso, resumen = {}) {
    await this.logsWriter.finalizarProceso(idProceso, resumen);
    pipelineEvents.emitProcesoFin(idProceso, resumen);
  }

  // =============================================
  // METODOS PUBLICOS - LECTURA
  // =============================================

  /**
   * Obtiene el estado de un proceso
   * @param {number} idProceso - ID del proceso
   * @returns {Promise<object>} Estado del proceso
   */
  async getEstadoProceso(idProceso) {
    const result = await this.pool.request()
      .input('idProceso', sql.BigInt, idProceso)
      .query(`
        SELECT
          ID_Proceso, FechaReporte, Estado, FechaInicio, FechaFin,
          TotalFondos, FondosOK, FondosError, FondosStandBy, FondosOmitidos,
          Duracion_Ms, Usuario
        FROM logs.Procesos
        WHERE ID_Proceso = @idProceso
      `);

    return result.recordset[0] || null;
  }

  /**
   * Obtiene el estado de una ejecucion
   * @param {number} idEjecucion - ID de la ejecucion
   * @returns {Promise<object>} Estado de la ejecucion
   */
  async getEstadoEjecucion(idEjecucion) {
    const result = await this.pool.request()
      .input('idEjecucion', sql.BigInt, idEjecucion)
      .query(`
        SELECT *
        FROM logs.Ejecuciones
        WHERE ID_Ejecucion = @idEjecucion
      `);

    return result.recordset[0] || null;
  }

  /**
   * Obtiene ejecuciones de un proceso
   * @param {number} idProceso - ID del proceso
   * @param {object} filtros - Filtros opcionales
   * @returns {Promise<array>} Lista de ejecuciones
   */
  async getEjecucionesProceso(idProceso, filtros = {}) {
    let query = `
      SELECT
        e.ID_Ejecucion, e.ID_Fund, e.FundShortName,
        e.Estado_Extraccion, e.Estado_Validacion, e.Estado_IPA,
        e.Estado_CAPM, e.Estado_Derivados, e.Estado_PNL,
        e.Estado_UBS, e.Estado_Concatenar, e.Estado_Final,
        e.Inicio_Procesamiento, e.Fin_Procesamiento, e.Duracion_Ms,
        e.TieneSuciedades, e.TieneProblemasHomologacion, e.TieneDescuadres,
        e.Paso_Con_Error, e.Mensaje_Error
      FROM logs.Ejecuciones e
      WHERE e.ID_Proceso = @idProceso
    `;

    if (filtros.estadoFinal) {
      query += ` AND e.Estado_Final = @estadoFinal`;
    }

    query += ` ORDER BY e.ID_Ejecucion`;

    const request = this.pool.request()
      .input('idProceso', sql.BigInt, idProceso);

    if (filtros.estadoFinal) {
      request.input('estadoFinal', sql.NVarChar(20), filtros.estadoFinal);
    }

    const result = await request.query(query);
    return result.recordset;
  }

  /**
   * Obtiene eventos detallados de una ejecucion
   * @param {number} idEjecucion - ID de la ejecucion
   * @param {object} filtros - Filtros opcionales (nivel, servicio)
   * @returns {Promise<array>} Lista de eventos
   */
  async getEventosDetallados(idEjecucion, filtros = {}) {
    let query = `
      SELECT
        ID_Evento, ID_Fund, Timestamp, Nivel, Servicio, SubEtapa,
        Mensaje, Stack_Trace, Datos_JSON
      FROM logs.EventosDetallados
      WHERE ID_Ejecucion = @idEjecucion
    `;

    if (filtros.nivel) {
      query += ` AND Nivel = @nivel`;
    }
    if (filtros.servicio) {
      query += ` AND Servicio = @servicio`;
    }

    query += ` ORDER BY Timestamp DESC`;

    const request = this.pool.request()
      .input('idEjecucion', sql.BigInt, idEjecucion);

    if (filtros.nivel) {
      request.input('nivel', sql.NVarChar(10), filtros.nivel);
    }
    if (filtros.servicio) {
      request.input('servicio', sql.NVarChar(50), filtros.servicio);
    }

    const result = await request.query(query);
    return result.recordset;
  }

  /**
   * Obtiene fondos en stand-by pendientes
   * @param {object} filtros - Filtros opcionales
   * @returns {Promise<array>} Lista de stand-by
   */
  async getStandByPendientes(filtros = {}) {
    let query = `
      SELECT
        s.ID_StandBy, s.ID_Ejecucion, s.ID_Fund,
        s.TipoProblema, s.CodigoStandBy, s.ServicioBloqueante,
        s.CantidadProblemas, s.ProblemasResueltos,
        s.MotivoDetallado, s.Estado, s.FechaDeteccion,
        e.FundShortName,
        p.FechaReporte
      FROM logs.StandBy s
      INNER JOIN logs.Ejecuciones e ON s.ID_Ejecucion = e.ID_Ejecucion
      INNER JOIN logs.Procesos p ON e.ID_Proceso = p.ID_Proceso
      WHERE s.Estado = 'PENDIENTE'
    `;

    if (filtros.tipoProblema) {
      query += ` AND s.TipoProblema = @tipoProblema`;
    }

    query += ` ORDER BY s.FechaDeteccion DESC`;

    const request = this.pool.request();

    if (filtros.tipoProblema) {
      request.input('tipoProblema', sql.NVarChar(50), filtros.tipoProblema);
    }

    const result = await request.query(query);
    return result.recordset;
  }

  // =============================================
  // METODOS PRIVADOS
  // =============================================
  // Los métodos de escritura logs fueron movidos a:
  // server/services/logs/LogsWriterService.js
  // - inicializarProceso
  // - inicializarEjecucion
  // - actualizarEstadoServicio
  // - actualizarErrorInfo
  // - actualizarFlagsProblema
  // - registrarEvento
  // - registrarStandBy
  // - finalizarEjecucion
  // - finalizarProceso
  //
  // Los métodos de escritura sandbox fueron movidos a:
  // server/services/sandbox/SandboxWriterService.js
  // - escribirHomologacionInstrumentos (código 6)
  // - escribirHomologacionFondos (código 10)
  // - escribirHomologacionMonedas (código 11)
  // - escribirHomologacionBenchmarks (código 12)
  // - escribirDescuadreCash (código 7)
  // - escribirDescuadreDerivados (código 8)
  // - escribirDescuadreNAV (código 9)
  // - escribirSuciedades (código 5)
  // - escribirFondoProblema
  // =============================================

  /**
   * Notifica via WebSocket
   * @private
   */
  _notifyWebSocket(tipo, data) {
    if (this.wsManager && this.wsManager.broadcast) {
      try {
        this.wsManager.broadcast({
          type: tipo,
          payload: data,
          timestamp: new Date().toISOString()
        });
      } catch (err) {
        // WebSocket error silencioso
      }
    }
  }
}

// =============================================
// SINGLETON
// =============================================
let instance = null;

module.exports = {
  TrackingService,

  /**
   * Obtiene la instancia singleton del TrackingService
   * @param {object} pool - Pool de conexiones (requerido en primera llamada)
   * @returns {TrackingService}
   */
  getInstance: (pool) => {
    if (!instance) {
      if (!pool) {
        throw new Error('TrackingService.getInstance() requiere pool en primera llamada');
      }
      instance = new TrackingService(pool);
      instance.initialize();
    }
    return instance;
  },

  /**
   * Resetea la instancia singleton (para testing)
   */
  resetInstance: () => {
    instance = null;
  }
};
