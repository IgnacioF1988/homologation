/**
 * LogsWriterService - Servicio dedicado para escritura en schema logs
 *
 * Extraido de TrackingService para separar responsabilidades.
 * Maneja todas las operaciones de escritura al schema logs.
 *
 * TABLAS/SPS MANEJADOS:
 * - logs.sp_Inicializar_Proceso
 * - logs.sp_Inicializar_Ejecucion
 * - logs.sp_Actualizar_Estado
 * - logs.sp_Finalizar_Ejecucion
 * - logs.sp_Finalizar_Proceso
 * - logs.EventosDetallados (INSERT)
 * - logs.StandBy (INSERT)
 * - logs.Ejecuciones (UPDATE)
 * - logs.Procesos (UPDATE)
 *
 * @module services/logs/LogsWriterService
 */

const sql = require('mssql');
const { getFlagColumn } = require('../../constants/standby');

class LogsWriterService {
  /**
   * Constructor
   * @param {object} pool - Pool de conexiones SQL Server
   */
  constructor(pool) {
    if (!pool) {
      throw new Error('LogsWriterService requiere un pool de conexiones valido');
    }
    this.pool = pool;
  }

  // =============================================
  // INICIALIZACION DE PROCESO/EJECUCION
  // =============================================

  /**
   * Inicializa un nuevo proceso en la BD
   * @param {string} fechaReporte - Fecha a procesar
   * @param {string} usuario - Usuario que ejecuta
   * @returns {Promise<number>} ID del proceso creado
   */
  async inicializarProceso(fechaReporte, usuario = null) {
    const request = this.pool.request();
    request.input('FechaReporte', sql.NVarChar(10), fechaReporte);
    request.input('Usuario', sql.NVarChar(100), usuario);
    request.output('ID_Proceso', sql.BigInt);

    const result = await request.execute('logs.sp_Inicializar_Proceso');
    return result.output.ID_Proceso;
  }

  /**
   * Inicializa una ejecucion para un fondo
   * @param {number} idProceso - ID del proceso padre
   * @param {number} idFund - ID del fondo
   * @param {string} fundShortName - Nombre corto
   * @param {object} portfolios - Portfolios por sistema
   * @returns {Promise<number>} ID de la ejecucion creada
   */
  async inicializarEjecucion(idProceso, idFund, fundShortName, portfolios = {}) {
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
    return result.output.ID_Ejecucion;
  }

  // =============================================
  // ACTUALIZACION DE ESTADO
  // =============================================

  /**
   * Actualiza el estado de un servicio en la BD
   * @param {number} idEjecucion - ID de la ejecucion
   * @param {string} servicio - Nombre del servicio
   * @param {string} estado - Estado (EN_PROGRESO, OK, ERROR, STAND_BY, N/A)
   */
  async actualizarEstadoServicio(idEjecucion, servicio, estado) {
    const request = this.pool.request();
    request.input('ID_Ejecucion', sql.BigInt, idEjecucion);
    request.input('Servicio', sql.NVarChar(50), servicio);
    request.input('Estado', sql.NVarChar(20), estado);

    await request.execute('logs.sp_Actualizar_Estado');
  }

  /**
   * Actualiza info de error en la ejecucion
   * @param {number} idEjecucion - ID de la ejecucion
   * @param {string} pasoConError - Paso donde ocurrio el error
   * @param {string} mensajeError - Mensaje del error
   * @param {object} transaction - Transaccion SQL opcional
   */
  async actualizarErrorInfo(idEjecucion, pasoConError, mensajeError, transaction = null) {
    const conn = transaction || this.pool;
    const request = conn.request();
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
   * @param {number} idEjecucion - ID de la ejecucion
   * @param {string} tipoProblema - Tipo de problema
   * @param {object} transaction - Transaccion SQL opcional
   */
  async actualizarFlagsProblema(idEjecucion, tipoProblema, transaction = null) {
    // Usar constante centralizada desde constants/standby.js
    const columna = getFlagColumn(tipoProblema);

    if (columna) {
      const conn = transaction || this.pool;
      const request = conn.request();
      request.input('idEjecucion', sql.BigInt, idEjecucion);

      await request.query(`
        UPDATE logs.Ejecuciones
        SET ${columna} = 1
        WHERE ID_Ejecucion = @idEjecucion
      `);
    }
  }

  // =============================================
  // REGISTRO DE EVENTOS
  // =============================================

  /**
   * Registra un evento detallado en la BD
   * @param {number} idEjecucion - ID de la ejecucion
   * @param {number} idFund - ID del fondo
   * @param {string} nivel - Nivel (ERROR, WARNING, STAND_BY, RETRY_EXHAUSTED)
   * @param {string} servicio - Nombre del servicio
   * @param {string} subEtapa - Sub-etapa o SP
   * @param {string} mensaje - Mensaje del evento
   * @param {string} stackTrace - Stack trace opcional
   * @param {object} datos - Datos adicionales JSON
   * @param {object} transaction - Transaccion SQL opcional
   */
  async registrarEvento(idEjecucion, idFund, nivel, servicio, subEtapa, mensaje, stackTrace, datos, transaction = null) {
    const conn = transaction || this.pool;
    const request = conn.request();
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

  // =============================================
  // REGISTRO DE STAND-BY
  // =============================================

  /**
   * Registra un stand-by en la BD
   * @param {object} data - Datos del stand-by
   * @param {object} transaction - Transaccion SQL opcional
   */
  async registrarStandBy(data, transaction = null) {
    const conn = transaction || this.pool;

    // 1. Insertar en logs.StandBy
    const request = conn.request();
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

    // 2. Actualizar columnas EstadoStandBy y PuntoBloqueoActual en logs.Ejecuciones
    // Estas columnas se usan para que FundOrchestrator sepa si debe pausar servicios
    const request2 = conn.request();
    request2.input('idEjecucion', sql.BigInt, data.idEjecucion);
    request2.input('estadoStandBy', sql.VarChar(20), 'PAUSADO');
    request2.input('puntoBloqueo', sql.VarChar(50), data.detalles.puntoBloqueo);

    await request2.query(`
      UPDATE logs.Ejecuciones
      SET EstadoStandBy = @estadoStandBy,
          PuntoBloqueoActual = @puntoBloqueo
      WHERE ID_Ejecucion = @idEjecucion
    `);
  }

  // =============================================
  // FINALIZACION
  // =============================================

  /**
   * Finaliza una ejecucion
   * @param {number} idEjecucion - ID de la ejecucion
   * @param {string} estadoFinal - Estado final (OK, ERROR, STAND_BY, OMITIDO)
   */
  async finalizarEjecucion(idEjecucion, estadoFinal) {
    const request = this.pool.request();
    request.input('ID_Ejecucion', sql.BigInt, idEjecucion);
    request.input('Estado_Final', sql.NVarChar(20), estadoFinal);

    await request.execute('logs.sp_Finalizar_Ejecucion');
  }

  /**
   * Finaliza un proceso
   * @param {number} idProceso - ID del proceso
   * @param {object} resumen - Resumen con fondosOK, fondosError, fondosStandBy, fondosOmitidos
   */
  async finalizarProceso(idProceso, resumen) {
    // 1. Actualizar contadores en logs.Procesos antes de llamar al SP
    // El SP lee estos valores para determinar el estado final
    if (resumen && (resumen.fondosOK !== undefined || resumen.fondosError !== undefined)) {
      const updateRequest = this.pool.request();
      updateRequest.input('idProceso', sql.BigInt, idProceso);
      updateRequest.input('fondosOK', sql.Int, resumen.fondosOK || 0);
      updateRequest.input('fondosError', sql.Int, resumen.fondosError || 0);
      updateRequest.input('fondosStandBy', sql.Int, resumen.fondosStandBy || 0);
      updateRequest.input('fondosOmitidos', sql.Int, resumen.fondosOmitidos || 0);

      await updateRequest.query(`
        UPDATE logs.Procesos
        SET FondosOK = @fondosOK,
            FondosError = @fondosError,
            FondosStandBy = @fondosStandBy,
            FondosOmitidos = @fondosOmitidos
        WHERE ID_Proceso = @idProceso
      `);
    }

    // 2. Llamar SP que calcula estado final basado en los contadores
    const request = this.pool.request();
    request.input('ID_Proceso', sql.BigInt, idProceso);
    await request.execute('logs.sp_Finalizar_Proceso');
  }

  // =============================================
  // LECTURA (para uso interno)
  // =============================================

  /**
   * Obtiene ID_Fund de una ejecucion
   * @param {number} idEjecucion - ID de la ejecucion
   * @returns {Promise<number|null>} ID_Fund o null
   */
  async getIdFundFromEjecucion(idEjecucion) {
    const result = await this.pool.request()
      .input('idEjecucion', sql.BigInt, idEjecucion)
      .query('SELECT ID_Fund FROM logs.Ejecuciones WHERE ID_Ejecucion = @idEjecucion');

    return result.recordset[0]?.ID_Fund || null;
  }
}

// =============================================
// SINGLETON
// =============================================
let instance = null;

module.exports = {
  LogsWriterService,

  /**
   * Obtiene la instancia singleton
   * @param {object} pool - Pool de conexiones (requerido en primera llamada)
   * @returns {LogsWriterService}
   */
  getInstance: (pool) => {
    if (!instance) {
      if (!pool) {
        throw new Error('LogsWriterService.getInstance() requiere pool en primera llamada');
      }
      instance = new LogsWriterService(pool);
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
