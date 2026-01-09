/**
 * MessageProcessor - Procesador de Mensajes del Service Broker
 *
 * ARQUITECTURA DB-CENTRIC:
 * Recibe mensajes parseados del ServiceBrokerListener y los transforma
 * en eventos WebSocket para el frontend.
 *
 * RECIBE:
 * - Mensajes JSON parseados del Service Broker
 *   {
 *     MessageId, MessageType, Timestamp, Version,
 *     Payload: { ID_Ejecucion, ID_Proceso, ID_Fund, NombreSP, CodigoRetorno, ... }
 *   }
 *
 * PROCESA:
 * - Valida estructura del mensaje
 * - Transforma a evento WebSocket
 * - Enriquece con metadata
 *
 * ENVIA:
 * - Eventos al WebSocketManager para broadcast a clientes suscritos
 */

const config = require('../../config/serviceBroker.config');

class MessageProcessor {
  constructor(wsManager) {
    this.wsManager = wsManager;
    this.stats = {
      processed: 0,
      errors: 0,
      byType: {},
    };
  }

  /**
   * Procesar un mensaje del Service Broker
   * @param {Object} message - Mensaje parseado del Service Broker
   */
  async process(message) {
    try {
      // Validar estructura basica
      if (!message || !message.MessageType || !message.Payload) {
        console.warn('[MessageProcessor] Mensaje invalido - falta MessageType o Payload');
        this.stats.errors++;
        return;
      }

      const { MessageType, Timestamp, MessageId } = message;

      // El Payload puede venir como string JSON (por anidacion de FOR JSON en SQL)
      let Payload = message.Payload;
      if (typeof Payload === 'string') {
        try {
          Payload = JSON.parse(Payload);
        } catch (e) {
          console.warn('[MessageProcessor] Error parseando Payload:', e.message);
          Payload = {};
        }
      }

      // Log del mensaje
      console.log(`[MessageProcessor] ${MessageType} | Ejecucion: ${Payload.ID_Ejecucion} | Fund: ${Payload.ID_Fund || 'N/A'} | SP: ${Payload.NombreSP || 'N/A'}`);

      // Actualizar stats
      this.stats.processed++;
      this.stats.byType[MessageType] = (this.stats.byType[MessageType] || 0) + 1;

      // Mapear a evento WebSocket
      const wsEventType = config.wsEventMapping[MessageType] || MessageType;

      // Construir evento WebSocket
      const wsEvent = this.buildWebSocketEvent(wsEventType, Payload, Timestamp, MessageId);

      // Emitir a clientes suscritos a esta ejecucion
      // CHECKPOINT se maneja en processSpecificType para evitar duplicados
      if (Payload.ID_Ejecucion && MessageType !== 'CHECKPOINT') {
        this.wsManager.emitToExecution(Payload.ID_Ejecucion, wsEvent);
      }

      // Procesar logica especifica por tipo
      await this.processSpecificType(MessageType, Payload);

    } catch (error) {
      console.error('[MessageProcessor] Error procesando mensaje:', error.message);
      this.stats.errors++;
    }
  }

  /**
   * Construir evento WebSocket normalizado
   */
  buildWebSocketEvent(type, payload, timestamp, messageId) {
    return {
      type,
      data: {
        ...payload,
        // Normalizar campos comunes
        ID_Ejecucion: payload.ID_Ejecucion,
        ID_Fund: payload.ID_Fund,
        NombreSP: payload.NombreSP,
        CodigoRetorno: payload.CodigoRetorno,
        Estado: this.mapCodigoToEstado(payload.CodigoRetorno),
        DuracionMs: payload.DuracionMs,
        RowsProcessed: payload.RowsProcessed,
        Detalles: payload.Detalles,
      },
      meta: {
        messageId,
        timestamp: timestamp || new Date().toISOString(),
        serverTime: new Date().toISOString(),
      },
    };
  }

  /**
   * Mapear codigo de retorno a estado legible
   *
   * Códigos del pipeline (v2.0 - Redesign DB-Centric):
   *   0 = OK
   *   1 = WARNING
   *   2 = RETRY
   *   3 = ERROR_CRITICO
   *   4 = ASSERTION_FAILED (bug del sistema)
   *   5 = STANDBY_SUCIEDADES
   *   6 = STANDBY_HOMOL_INSTRUMENTOS
   *   7 = STANDBY_DESCUADRE_CASH (pre-flight en ValidateFund)
   *   8 = STANDBY_DESCUADRE_DERIVADOS (pre-flight en ValidateFund)
   *   9 = STANDBY_DESCUADRE_NAV (pre-flight en ValidateFund)
   *   10 = STANDBY_HOMOL_FONDOS
   *   11 = STANDBY_HOMOL_MONEDAS
   *   13-18 = STANDBY_EXTRACT_*_FALTANTE
   */
  mapCodigoToEstado(codigo) {
    if (codigo === undefined || codigo === null) return 'UNKNOWN';

    switch (codigo) {
      case 0: return 'OK';
      case 1: return 'WARNING';
      case 2: return 'RETRY';
      case 3: return 'ERROR';
      case 4: return 'ASSERTION_FAILED';
      case 5: return 'STANDBY_SUCIEDADES';
      case 6: return 'STANDBY_HOMOL_INSTRUMENTOS';
      case 7: return 'STANDBY_DESCUADRE_CASH';
      case 8: return 'STANDBY_DESCUADRE_DERIVADOS';
      case 9: return 'STANDBY_DESCUADRE_NAV';
      case 10: return 'STANDBY_HOMOL_FONDOS';
      case 11: return 'STANDBY_HOMOL_MONEDAS';
      case 13: return 'STANDBY_EXTRACT_IPA';
      case 14: return 'STANDBY_EXTRACT_CAPM';
      case 15: return 'STANDBY_EXTRACT_SONA';
      case 16: return 'STANDBY_EXTRACT_PNL';
      case 17: return 'STANDBY_EXTRACT_DERIVADOS';
      case 18: return 'STANDBY_EXTRACT_POSMODRF';
      default:
        if (codigo >= 5 && codigo <= 18) return 'STANDBY';
        return 'UNKNOWN';
    }
  }

  /**
   * Procesar logica especifica por tipo de mensaje
   */
  async processSpecificType(messageType, payload) {
    switch (messageType) {
      case 'SP_INICIO':
        // SP iniciando - actualizar estado del fondo a PROCESSING
        this.emitFundUpdate(payload, 'PROCESSING');
        break;

      case 'SP_FIN':
        // SP terminado - actualizar estado segun codigo
        if (payload.CodigoRetorno === 0 || payload.CodigoRetorno === 1) {
          this.emitFundUpdate(payload, 'STAGE_COMPLETE');
        }
        break;

      case 'ERROR':
        // Error - marcar fondo como ERROR
        this.emitFundUpdate(payload, 'ERROR');
        break;

      case 'STANDBY':
        // Fondo en espera de homologacion
        this.emitFundUpdate(payload, 'STANDBY');
        break;

      case 'PIPELINE_INICIO':
        // Pipeline iniciando para un fondo
        this.emitFundUpdate(payload, 'PIPELINE_STARTED');
        this.emitExecutionUpdate(payload, 'RUNNING');
        break;

      case 'PIPELINE_PASO':
        // Pipeline avanzando a siguiente paso
        this.emitPipelineStep(payload);
        break;

      case 'PIPELINE_FIN':
        // Pipeline terminado para un fondo
        if (payload.CodigoRetorno === 0) {
          this.emitFundUpdate(payload, 'COMPLETED');
        } else {
          this.emitFundUpdate(payload, 'STOPPED');
        }
        break;

      case 'CHECKPOINT':
        // Checkpoint operacional (creación/consumo de temp tables, etc)
        this.emitCheckpoint(payload);
        break;

      case 'PROCESO_INICIO':
        // Ejecucion completa iniciando
        this.emitExecutionUpdate(payload, 'RUNNING');
        break;

      case 'PROCESO_FIN':
        // Ejecucion completa terminada
        this.emitExecutionUpdate(payload, payload.CodigoRetorno === 0 ? 'COMPLETED' : 'COMPLETED_WITH_ERRORS');
        break;

      case 'TEST':
        console.log('[MessageProcessor] Mensaje de prueba recibido');
        break;

      default:
        console.log(`[MessageProcessor] Tipo de mensaje no manejado: ${messageType}`);
    }
  }

  /**
   * Emitir actualizacion de estado de fondo
   */
  emitFundUpdate(payload, status) {
    if (!payload.ID_Ejecucion || !payload.ID_Fund) return;

    const event = {
      type: 'FUND_UPDATE',
      data: {
        ID_Ejecucion: payload.ID_Ejecucion,
        ID_Fund: payload.ID_Fund,
        Status: status,
        CurrentSP: payload.NombreSP,
        CodigoRetorno: payload.CodigoRetorno,
        DuracionMs: payload.DuracionMs,
        Detalles: payload.Detalles,
        Timestamp: new Date().toISOString(),
      },
    };

    this.wsManager.emitToExecution(payload.ID_Ejecucion, event);
  }

  /**
   * Emitir actualizacion de estado de ejecucion
   */
  emitExecutionUpdate(payload, status) {
    if (!payload.ID_Ejecucion) return;

    const event = {
      type: 'EXECUTION_UPDATE',
      data: {
        ID_Ejecucion: payload.ID_Ejecucion,
        Status: status,
        Timestamp: new Date().toISOString(),
      },
    };

    this.wsManager.emitToExecution(payload.ID_Ejecucion, event);
  }

  /**
   * Emitir actualizacion de paso del pipeline
   */
  emitPipelineStep(payload) {
    if (!payload.ID_Ejecucion || !payload.ID_Fund) return;

    // Parsear detalles si vienen como string
    let detalles = payload.Detalles;
    if (typeof detalles === 'string') {
      try {
        detalles = JSON.parse(detalles);
      } catch (e) {
        detalles = { raw: detalles };
      }
    }

    const event = {
      type: 'PIPELINE_STEP',
      data: {
        ID_Ejecucion: payload.ID_Ejecucion,
        ID_Fund: payload.ID_Fund,
        Paso: detalles?.paso || null,
        SP: detalles?.sp || payload.NombreSP,
        Estado: detalles?.estado || 'iniciando',
        Timestamp: new Date().toISOString(),
      },
    };

    this.wsManager.emitToExecution(payload.ID_Ejecucion, event);
  }

  /**
   * Emitir checkpoint operacional (creación/consumo de temp tables)
   */
  emitCheckpoint(payload) {
    if (!payload.ID_Ejecucion) return;

    // Parsear detalles si vienen como string
    let detalles = payload.Detalles;
    if (typeof detalles === 'string') {
      try {
        detalles = JSON.parse(detalles);
      } catch (e) {
        detalles = { raw: detalles };
      }
    }

    const event = {
      type: 'CHECKPOINT',
      data: {
        ID_Ejecucion: payload.ID_Ejecucion,
        ID_Fund: payload.ID_Fund,
        NombreSP: payload.NombreSP,
        Operacion: detalles?.operacion || 'unknown',  // 'CREATED', 'CONSUMED', 'VERIFIED'
        Objeto: detalles?.objeto || null,              // Nombre de tabla temporal
        Registros: detalles?.registros || null,        // Cantidad de registros
        Mensaje: detalles?.mensaje || null,
        Timestamp: new Date().toISOString(),
      },
    };

    this.wsManager.emitToExecution(payload.ID_Ejecucion, event);
  }

  /**
   * Obtener estadisticas del procesador
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * Reset estadisticas
   */
  resetStats() {
    this.stats = {
      processed: 0,
      errors: 0,
      byType: {},
    };
  }
}

module.exports = MessageProcessor;
