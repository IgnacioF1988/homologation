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
    this._initialized = false;
  }

  /**
   * Inicializa el servicio y configura los listeners de eventos
   */
  initialize() {
    if (this._initialized) {
      return;
    }

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
        console.log(`[TrackingService] servicio:inicio - ${data.servicio} (ejecucion=${data.idEjecucion})`);
        await this._updateEstadoServicio(data.idEjecucion, data.servicio, 'EN_PROGRESO');
        this._notifyWebSocket('SERVICIO_INICIO', data);
      } catch (err) {
        console.error(`[TrackingService] Error en servicio:inicio:`, err.message);
      }
    });

    // Servicio terminado OK -> actualizar estado a OK
    pipelineEvents.on('servicio:fin', async (data) => {
      try {
        console.log(`[TrackingService] servicio:fin - ${data.servicio} (ejecucion=${data.idEjecucion})`);
        await this._updateEstadoServicio(data.idEjecucion, data.servicio, 'OK');
        this._notifyWebSocket('SERVICIO_FIN', data);
      } catch (err) {
        console.error(`[TrackingService] Error en servicio:fin:`, err.message);
      }
    });

    // Servicio con error -> actualizar estado + registrar evento
    pipelineEvents.on('servicio:error', async (data) => {
      try {
        await this._updateEstadoServicio(data.idEjecucion, data.servicio, 'ERROR');
        await this._registrarEvento(
          data.idEjecucion,
          data.idFund,
          'ERROR',
          data.servicio,
          data.subEtapa,
          data.error.message,
          data.error.stack,
          { code: data.error.code, name: data.error.name }
        );
        await this._updateErrorInfo(data.idEjecucion, data.servicio, data.error.message);
        this._notifyWebSocket('SERVICIO_ERROR', data);
      } catch (err) {
        // Error silencioso
      }
    });

    // Warning -> registrar evento (no cambia estado)
    pipelineEvents.on('servicio:warning', async (data) => {
      try {
        await this._registrarEvento(
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
      } catch (err) {
        // Error silencioso
      }
    });

    // Servicio omitido -> actualizar estado a N/A u OMITIDO
    pipelineEvents.on('servicio:omitido', async (data) => {
      try {
        await this._updateEstadoServicio(data.idEjecucion, data.servicio, 'N/A');
        this._notifyWebSocket('SERVICIO_OMITIDO', data);
      } catch (err) {
        // Error silencioso
      }
    });

    // =============================================
    // EVENTOS DE STAND-BY
    // =============================================

    // Stand-by activado -> actualizar estado + registrar stand-by + evento + sandbox
    pipelineEvents.on('standby:activado', async (data) => {
      try {
        await this._updateEstadoServicio(data.idEjecucion, data.servicio, 'STAND_BY');
        await this._registrarStandBy(data);
        await this._registrarEvento(
          data.idEjecucion,
          data.idFund,
          'STAND_BY',
          data.servicio,
          data.detalles.puntoBloqueo,
          `Stand-by codigo ${data.codigoStandBy}: ${data.detalles.tipoProblema}`,
          null,
          data.detalles
        );
        await this._updateFlagsProblema(data.idEjecucion, data.detalles.tipoProblema);

        // Escribir datos de homologación a sandbox (si existen)
        const homologData = data.detalles.homologacionData;
        console.log(`[TrackingService] standby:activado - homologacionData length: ${homologData?.length || 0}`);
        if (homologData && homologData.length > 0) {
          console.log(`[TrackingService] Escribiendo ${homologData.length} items a sandbox...`);
          await this._escribirHomologacionSandbox(data.idEjecucion, homologData);
          console.log(`[TrackingService] Sandbox escrito OK`);
        }

        this._notifyWebSocket('STANDBY_ACTIVADO', data);
      } catch (err) {
        console.error(`[TrackingService] Error en standby:activado:`, err.message);
      }
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
        await this._finalizarProceso(data.idProceso, data.resumen);
        this._notifyWebSocket('PROCESO_FIN', data);
      } catch (err) {
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
        await this._finalizarEjecucion(data.idEjecucion, data.estadoFinal);
        this._notifyWebSocket('EJECUCION_FIN', data);
      } catch (err) {
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
    const request = this.pool.request();
    request.input('FechaReporte', sql.NVarChar(10), fechaReporte);
    request.input('Usuario', sql.NVarChar(100), usuario);
    request.output('ID_Proceso', sql.BigInt);

    const result = await request.execute('logs.sp_Inicializar_Proceso');
    const idProceso = result.output.ID_Proceso;

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
    const request = this.pool.request();
    request.input('ID_Proceso', sql.BigInt, idProceso);
    request.input('ID_Fund', sql.Int, idFund);
    request.input('FundShortName', sql.VarChar(50), fundShortName);
    request.input('Portfolio_Geneva', sql.VarChar(50), portfolios.geneva || null);
    request.input('Portfolio_CAPM', sql.VarChar(50), portfolios.capm || null);
    request.input('Portfolio_Derivados', sql.VarChar(50), portfolios.derivados || null);
    request.input('Portfolio_UBS', sql.VarChar(50), portfolios.ubs || null);
    request.output('ID_Ejecucion', sql.BigInt);

    const result = await request.execute('logs.sp_Inicializar_Ejecucion');
    const idEjecucion = result.output.ID_Ejecucion;

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
    await this._finalizarEjecucion(idEjecucion, estadoFinal);

    // Obtener ID_Fund para el evento
    const result = await this.pool.request()
      .input('idEjecucion', sql.BigInt, idEjecucion)
      .query('SELECT ID_Fund FROM logs.Ejecuciones WHERE ID_Ejecucion = @idEjecucion');

    if (result.recordset.length > 0) {
      pipelineEvents.emitEjecucionFin(idEjecucion, result.recordset[0].ID_Fund, estadoFinal, duracionMs);
    }
  }

  /**
   * Finaliza un proceso con resumen de resultados
   * @param {number} idProceso - ID del proceso
   * @param {object} resumen - Resumen de fondos
   */
  async finalizarProceso(idProceso, resumen = {}) {
    await this._finalizarProceso(idProceso, resumen);
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
  // METODOS PRIVADOS - PERSISTENCIA
  // =============================================

  /**
   * Actualiza el estado de un servicio en la BD
   * @private
   */
  async _updateEstadoServicio(idEjecucion, servicio, estado) {
    const request = this.pool.request();
    request.input('ID_Ejecucion', sql.BigInt, idEjecucion);
    request.input('Servicio', sql.NVarChar(50), servicio);
    request.input('Estado', sql.NVarChar(20), estado);

    await request.execute('logs.sp_Actualizar_Estado');
  }

  /**
   * Registra un evento detallado en la BD
   * @private
   */
  async _registrarEvento(idEjecucion, idFund, nivel, servicio, subEtapa, mensaje, stackTrace, datos) {
    const request = this.pool.request();
    request.input('idEjecucion', sql.BigInt, idEjecucion);
    request.input('idFund', sql.Int, idFund);
    request.input('nivel', sql.NVarChar(10), nivel);
    request.input('servicio', sql.NVarChar(50), servicio);
    request.input('subEtapa', sql.NVarChar(100), subEtapa);
    request.input('mensaje', sql.NVarChar(1000), (mensaje || '').substring(0, 1000));
    request.input('stackTrace', sql.NVarChar(sql.MAX), stackTrace);
    request.input('datos', sql.NVarChar(sql.MAX), datos ? JSON.stringify(datos) : null);

    await request.query(`
      INSERT INTO logs.EventosDetallados
        (ID_Ejecucion, ID_Fund, Nivel, Servicio, SubEtapa, Mensaje, Stack_Trace, Datos_JSON)
      VALUES
        (@idEjecucion, @idFund, @nivel, @servicio, @subEtapa, @mensaje, @stackTrace, @datos)
    `);
  }

  /**
   * Registra un stand-by en la BD
   * @private
   */
  async _registrarStandBy(data) {
    const request = this.pool.request();
    request.input('idEjecucion', sql.BigInt, data.idEjecucion);
    request.input('idFund', sql.Int, data.idFund);
    request.input('tipoProblema', sql.NVarChar(50), data.detalles.tipoProblema);
    request.input('codigoStandBy', sql.Int, data.codigoStandBy);
    request.input('servicio', sql.NVarChar(50), data.servicio);
    request.input('puntoBloqueo', sql.NVarChar(100), data.detalles.puntoBloqueo);
    request.input('cantidad', sql.Int, data.detalles.cantidad || 1);
    request.input('tablaReferencia', sql.NVarChar(100), data.detalles.tablaReferencia);
    request.input('motivo', sql.NVarChar(sql.MAX), data.detalles.motivo);

    await request.query(`
      INSERT INTO logs.StandBy
        (ID_Ejecucion, ID_Fund, TipoProblema, CodigoStandBy, ServicioBloqueante,
         PuntoBloqueo, CantidadProblemas, TablaColaReferencia, MotivoDetallado)
      VALUES
        (@idEjecucion, @idFund, @tipoProblema, @codigoStandBy, @servicio,
         @puntoBloqueo, @cantidad, @tablaReferencia, @motivo)
    `);
  }

  /**
   * Actualiza info de error en la ejecucion
   * @private
   */
  async _updateErrorInfo(idEjecucion, pasoConError, mensajeError) {
    const request = this.pool.request();
    request.input('idEjecucion', sql.BigInt, idEjecucion);
    request.input('pasoConError', sql.NVarChar(100), pasoConError);
    request.input('mensajeError', sql.NVarChar(sql.MAX), mensajeError);

    await request.query(`
      UPDATE logs.Ejecuciones
      SET Paso_Con_Error = @pasoConError,
          Mensaje_Error = @mensajeError
      WHERE ID_Ejecucion = @idEjecucion
    `);
  }

  /**
   * Actualiza flags de problema en la ejecucion
   * @private
   */
  async _updateFlagsProblema(idEjecucion, tipoProblema) {
    const columna = {
      'SUCIEDADES': 'TieneSuciedades',
      'HOMOLOGACION': 'TieneProblemasHomologacion',
      'DESCUADRES_CAPM': 'TieneDescuadres',
      'DESCUADRES_GENERAL': 'TieneDescuadres'
    }[tipoProblema];

    if (columna) {
      const request = this.pool.request();
      request.input('idEjecucion', sql.BigInt, idEjecucion);

      await request.query(`
        UPDATE logs.Ejecuciones
        SET ${columna} = 1
        WHERE ID_Ejecucion = @idEjecucion
      `);
    }
  }

  /**
   * Escribe datos de homologación al schema sandbox
   * @param {number} idEjecucion - ID de la ejecución
   * @param {Array} homologacionData - Datos de homologación del SP
   * @private
   */
  async _escribirHomologacionSandbox(idEjecucion, homologacionData) {
    // Obtener FechaReporte desde el proceso
    const fechaResult = await this.pool.request()
      .input('idEjecucion', sql.BigInt, idEjecucion)
      .query(`
        SELECT CONVERT(VARCHAR(10), p.FechaReporte, 120) AS FechaReporte
        FROM logs.Ejecuciones e
        INNER JOIN logs.Procesos p ON e.ID_Proceso = p.ID_Proceso
        WHERE e.ID_Ejecucion = @idEjecucion
      `);

    const fechaReporte = fechaResult.recordset[0]?.FechaReporte || new Date().toISOString().split('T')[0];
    const fechaProceso = new Date().toISOString();

    // Agrupar por tipo de homologación
    const fondos = homologacionData.filter(h => h.TipoHomologacion === 'FONDO');
    const instrumentos = homologacionData.filter(h => h.TipoHomologacion === 'INSTRUMENTO');
    const monedas = homologacionData.filter(h => h.TipoHomologacion === 'MONEDA');

    // Insertar fondos no homologados (bulk)
    if (fondos.length > 0) {
      const fondosValues = fondos.map(item =>
        `('${fechaReporte}', '${(item.Item || '').replace(/'/g, "''")}', '${item.Source || 'GENEVA'}', '${fechaProceso}')`
      ).join(',\n');
      await this.pool.request().query(`
        INSERT INTO sandbox.Homologacion_Fondos (FechaReporte, Fondo, Source, FechaProceso)
        VALUES ${fondosValues}
      `);
    }

    // Insertar instrumentos no homologados (bulk)
    if (instrumentos.length > 0) {
      const instValues = instrumentos.map(item =>
        `('${fechaReporte}', '${(item.Item || '').replace(/'/g, "''")}', '${item.Source || 'GENEVA'}', '${fechaProceso}', '${(item.Currency || '').replace(/'/g, "''")}')`
      ).join(',\n');
      await this.pool.request().query(`
        INSERT INTO sandbox.Homologacion_Instrumentos (FechaReporte, Instrumento, Source, FechaProceso, Currency)
        VALUES ${instValues}
      `);
    }

    // Insertar monedas no homologadas (bulk)
    if (monedas.length > 0) {
      const monedasValues = monedas.map(item =>
        `('${fechaReporte}', '${(item.Item || '').replace(/'/g, "''")}', '${item.Source || 'GENEVA'}', '${fechaProceso}')`
      ).join(',\n');
      await this.pool.request().query(`
        INSERT INTO sandbox.Homologacion_Monedas (FechaReporte, Moneda, Source, FechaProceso)
        VALUES ${monedasValues}
      `);
    }
  }

  /**
   * Finaliza una ejecucion
   * @private
   */
  async _finalizarEjecucion(idEjecucion, estadoFinal) {
    const request = this.pool.request();
    request.input('ID_Ejecucion', sql.BigInt, idEjecucion);
    request.input('Estado_Final', sql.NVarChar(20), estadoFinal);

    await request.execute('logs.sp_Finalizar_Ejecucion');
  }

  /**
   * Finaliza un proceso
   * @private
   */
  async _finalizarProceso(idProceso, resumen) {
    const request = this.pool.request();
    request.input('ID_Proceso', sql.BigInt, idProceso);

    await request.execute('logs.sp_Finalizar_Proceso');
  }

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
