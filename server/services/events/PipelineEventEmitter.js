/**
 * PipelineEventEmitter - Singleton para eventos del pipeline ETL
 *
 * ARQUITECTURA EVENT-DRIVEN:
 * - BasePipelineService y otros servicios EMITEN eventos
 * - TrackingService ESCUCHA y persiste
 * - WebSocket notifica al frontend
 *
 * EVENTOS DISPONIBLES:
 * - servicio:inicio   -> Servicio comienza ejecucion
 * - servicio:fin      -> Servicio termina OK
 * - servicio:error    -> Servicio termina con error
 * - servicio:warning  -> Warning no bloqueante
 * - servicio:omitido  -> Servicio omitido (condicional o exclusion)
 * - standby:activado  -> Fondo entra en stand-by
 * - proceso:inicio    -> Proceso (batch) comienza
 * - proceso:fin       -> Proceso (batch) termina
 *
 * @module PipelineEventEmitter
 */

const EventEmitter = require('events');

class PipelineEventEmitter extends EventEmitter {
  constructor() {
    super();
    // Permitir muchos listeners para fondos en paralelo
    this.setMaxListeners(200);
  }

  // =============================================
  // EVENTOS DE SERVICIO
  // =============================================

  /**
   * Emite evento de inicio de servicio
   * @param {number} idEjecucion - ID de la ejecucion
   * @param {number} idFund - ID del fondo
   * @param {string} servicio - Nombre del servicio (IPA, CAPM, etc.)
   * @param {object} metadata - Datos adicionales opcionales
   */
  emitServicioInicio(idEjecucion, idFund, servicio, metadata = {}) {
    this.emit('servicio:inicio', {
      idEjecucion,
      idFund,
      servicio,
      metadata,
      timestamp: new Date()
    });
  }

  /**
   * Emite evento de fin exitoso de servicio
   * @param {number} idEjecucion - ID de la ejecucion
   * @param {number} idFund - ID del fondo
   * @param {string} servicio - Nombre del servicio
   * @param {number} duracionMs - Duracion en millisegundos
   * @param {object} metadata - Datos adicionales opcionales
   */
  emitServicioFin(idEjecucion, idFund, servicio, duracionMs, metadata = {}) {
    this.emit('servicio:fin', {
      idEjecucion,
      idFund,
      servicio,
      duracionMs,
      metadata,
      timestamp: new Date()
    });
  }

  /**
   * Emite evento de error en servicio
   * @param {number} idEjecucion - ID de la ejecucion
   * @param {number} idFund - ID del fondo
   * @param {string} servicio - Nombre del servicio
   * @param {Error} error - Objeto de error
   * @param {string} subEtapa - SP o paso especifico donde ocurrio
   */
  emitServicioError(idEjecucion, idFund, servicio, error, subEtapa = null) {
    this.emit('servicio:error', {
      idEjecucion,
      idFund,
      servicio,
      subEtapa,
      error: {
        message: error.message || String(error),
        stack: error.stack || null,
        code: error.code || null,
        name: error.name || 'Error'
      },
      timestamp: new Date()
    });
  }

  /**
   * Emite evento de warning (no cambia estado, solo registra)
   * @param {number} idEjecucion - ID de la ejecucion
   * @param {number} idFund - ID del fondo
   * @param {string} servicio - Nombre del servicio
   * @param {string} mensaje - Mensaje del warning
   * @param {object} datos - Datos adicionales
   */
  emitServicioWarning(idEjecucion, idFund, servicio, mensaje, datos = null) {
    this.emit('servicio:warning', {
      idEjecucion,
      idFund,
      servicio,
      mensaje,
      datos,
      timestamp: new Date()
    });
  }

  /**
   * Emite evento de servicio omitido
   * @param {number} idEjecucion - ID de la ejecucion
   * @param {number} idFund - ID del fondo
   * @param {string} servicio - Nombre del servicio
   * @param {string} razon - Razon de la omision
   */
  emitServicioOmitido(idEjecucion, idFund, servicio, razon) {
    this.emit('servicio:omitido', {
      idEjecucion,
      idFund,
      servicio,
      razon,
      timestamp: new Date()
    });
  }

  // =============================================
  // EVENTOS DE STAND-BY
  // =============================================

  /**
   * Emite evento de stand-by activado
   * @param {number} idEjecucion - ID de la ejecucion
   * @param {number} idFund - ID del fondo
   * @param {number} codigoStandBy - Codigo del SP (5, 6, 7, 8)
   * @param {string} servicio - Servicio donde se activo
   * @param {object} detalles - Detalles del problema
   */
  emitStandByActivado(idEjecucion, idFund, codigoStandBy, servicio, detalles) {
    const tipoProblema = this._getTipoProblema(codigoStandBy);

    this.emit('standby:activado', {
      idEjecucion,
      idFund,
      codigoStandBy,
      servicio,
      detalles: {
        tipoProblema,
        cantidad: detalles.cantidad || 1,
        tablaReferencia: detalles.tablaReferencia || null,
        motivo: detalles.motivo || null,
        puntoBloqueo: detalles.puntoBloqueo || null
      },
      timestamp: new Date()
    });
  }

  /**
   * Mapea codigo de stand-by a tipo de problema
   * @private
   */
  _getTipoProblema(codigoStandBy) {
    const tipos = {
      5: 'SUCIEDADES',
      6: 'HOMOLOGACION',
      7: 'DESCUADRES_CAPM',
      8: 'DESCUADRES_GENERAL'
    };
    return tipos[codigoStandBy] || 'DESCONOCIDO';
  }

  // =============================================
  // EVENTOS DE PROCESO
  // =============================================

  /**
   * Emite evento de inicio de proceso
   * @param {number} idProceso - ID del proceso
   * @param {string} fechaReporte - Fecha que se procesa
   * @param {number} totalFondos - Total de fondos a procesar
   * @param {string} usuario - Usuario que inicio
   */
  emitProcesoInicio(idProceso, fechaReporte, totalFondos, usuario) {
    this.emit('proceso:inicio', {
      idProceso,
      fechaReporte,
      totalFondos,
      usuario,
      timestamp: new Date()
    });
  }

  /**
   * Emite evento de fin de proceso
   * @param {number} idProceso - ID del proceso
   * @param {object} resumen - Resumen de resultados
   */
  emitProcesoFin(idProceso, resumen) {
    this.emit('proceso:fin', {
      idProceso,
      resumen: {
        fondosOK: resumen.fondosOK || 0,
        fondosError: resumen.fondosError || 0,
        fondosStandBy: resumen.fondosStandBy || 0,
        fondosOmitidos: resumen.fondosOmitidos || 0,
        duracionMs: resumen.duracionMs || 0
      },
      timestamp: new Date()
    });
  }

  // =============================================
  // EVENTOS DE EJECUCION (por fondo)
  // =============================================

  /**
   * Emite evento de inicio de ejecucion de fondo
   * @param {number} idEjecucion - ID de la ejecucion
   * @param {number} idFund - ID del fondo
   * @param {string} fundShortName - Nombre corto del fondo
   */
  emitEjecucionInicio(idEjecucion, idFund, fundShortName) {
    this.emit('ejecucion:inicio', {
      idEjecucion,
      idFund,
      fundShortName,
      timestamp: new Date()
    });
  }

  /**
   * Emite evento de fin de ejecucion de fondo
   * @param {number} idEjecucion - ID de la ejecucion
   * @param {number} idFund - ID del fondo
   * @param {string} estadoFinal - Estado final (OK, ERROR, STAND_BY, OMITIDO)
   * @param {number} duracionMs - Duracion total
   */
  emitEjecucionFin(idEjecucion, idFund, estadoFinal, duracionMs) {
    this.emit('ejecucion:fin', {
      idEjecucion,
      idFund,
      estadoFinal,
      duracionMs,
      timestamp: new Date()
    });
  }
}

// =============================================
// SINGLETON
// =============================================
const instance = new PipelineEventEmitter();

module.exports = instance;
