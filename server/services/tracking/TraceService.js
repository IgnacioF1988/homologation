const sql = require('mssql');

/**
 * TraceService - Servicio de Trazabilidad de Ejecución (Phase 3)
 *
 * Registra eventos detallados de ejecución del pipeline para análisis de flujo,
 * detección de contención de recursos, y optimización de performance.
 *
 * RECIBE:
 * - pool: Pool de conexiones SQL Server (compartido entre todos los orquestadores)
 * - bufferSize: Tamaño del buffer para bulk insert (default: 100 eventos)
 * - idProceso: ID del proceso padre (BigInt)
 * - idEjecucion: ID único de la ejecución del fondo (BigInt)
 * - idFund: ID del fondo (Int)
 * - etapa: Nombre del servicio (IPA, CAPM, PNL, etc.)
 * - subEtapa: Sub-paso del servicio (IPA_01, IPA_02, etc., opcional)
 * - recurso: Nombre del recurso (tabla, SP, etc.)
 * - duracionMs: Duración del evento en milisegundos
 * - metadata: Metadata adicional (portfolio, registros procesados, etc.)
 *
 * PROCESA:
 * 1. Registra eventos de ejecución: START, END, LOCK, WAIT, ERROR
 * 2. Agrega eventos al buffer en memoria (batch de 100 por defecto)
 * 3. Flush automático: cuando buffer alcanza bufferSize
 * 4. Bulk insert: inserta todos los eventos del buffer en una sola operación
 * 5. Calcula duración: END - START para cada servicio
 * 6. Captura Thread_ID: process.pid para análisis de concurrencia
 * 7. Cleanup: al finalizar orquestador, ejecuta flush final
 *
 * ENVIA:
 * - Trace records a: logs.Trace_Records (tabla de trazabilidad)
 * - Confirmación a: Caller (Promise resuelto) → FundOrchestrator, BasePipelineService
 *
 * DEPENDENCIAS:
 * - Requiere: SQL Server pool (compartido)
 * - Requerido por: FundOrchestrator (opcional, Phase 3)
 *
 * CONTEXTO PARALELO:
 * - Servicio COMPARTIDO: una sola instancia usada por todos los FundOrchestrators
 * - Thread-safe: buffer en memoria se serializa al escribir a BD
 * - Bulk insert: optimización para alta concurrencia (100 eventos por batch)
 * - Uso: análisis post-ejecución de flujo, contención, y performance
 * - Eventos: START (inicio servicio), END (fin servicio), LOCK (bloqueo recurso),
 *            WAIT (espera), ERROR (fallo)
 */
class TraceService {
  constructor(pool, bufferSize = 100) {
    this.pool = pool;
    this.buffer = [];
    this.bufferSize = bufferSize;
    this.flushInProgress = false;
  }

  /**
   * Registrar evento de inicio de servicio
   * @param {number} idProceso - ID del proceso
   * @param {number} idEjecucion - ID de la ejecución
   * @param {number} idFund - ID del fondo
   * @param {string} etapa - Nombre del servicio (ej: 'IPA', 'CAPM')
   * @param {string} recurso - Nombre del recurso (ej: 'staging.IPA_WorkTable')
   * @param {object} metadata - Contexto adicional (portfolio, etc.)
   * @param {string} subEtapa - Sub-paso del servicio (ej: 'IPA_01', 'CAPM_01', opcional)
   */
  async recordStart(idProceso, idEjecucion, idFund, etapa, recurso, metadata = {}, subEtapa = null) {
    return this._record({
      ID_Proceso: idProceso,
      ID_Ejecucion: idEjecucion,
      ID_Fund: idFund,
      Etapa: etapa,
      SubEtapa: subEtapa,
      Tipo_Evento: 'START',
      Recurso: recurso,
      Duracion_Ms: 0,
      Metadata: JSON.stringify(metadata),
      Thread_ID: process.pid
    });
  }

  /**
   * Registrar evento de fin de servicio
   * @param {number} idProceso - ID del proceso
   * @param {number} idEjecucion - ID de la ejecución
   * @param {number} idFund - ID del fondo
   * @param {string} etapa - Nombre del servicio
   * @param {string} recurso - Nombre del recurso
   * @param {number} duracionMs - Duración de ejecución en milisegundos
   * @param {object} metadata - Contexto adicional (registros afectados, etc.)
   * @param {string} subEtapa - Sub-paso del servicio (ej: 'IPA_01', 'CAPM_01', opcional)
   */
  async recordEnd(idProceso, idEjecucion, idFund, etapa, recurso, duracionMs, metadata = {}, subEtapa = null) {
    return this._record({
      ID_Proceso: idProceso,
      ID_Ejecucion: idEjecucion,
      ID_Fund: idFund,
      Etapa: etapa,
      SubEtapa: subEtapa,
      Tipo_Evento: 'END',
      Recurso: recurso,
      Duracion_Ms: duracionMs,
      Metadata: JSON.stringify(metadata),
      Thread_ID: process.pid
    });
  }

  /**
   * Registrar evento de bloqueo/espera
   * @param {number} idProceso - ID del proceso
   * @param {number} idEjecucion - ID de la ejecución
   * @param {number} idFund - ID del fondo
   * @param {string} recurso - Recurso que causó el bloqueo
   * @param {object} metadata - Detalles del bloqueo
   */
  async recordLock(idProceso, idEjecucion, idFund, recurso, metadata = {}) {
    return this._record({
      ID_Proceso: idProceso,
      ID_Ejecucion: idEjecucion,
      ID_Fund: idFund,
      Etapa: 'LOCK',
      SubEtapa: null,
      Tipo_Evento: 'LOCK',
      Recurso: recurso,
      Duracion_Ms: 0,
      Metadata: JSON.stringify(metadata),
      Thread_ID: process.pid
    });
  }

  /**
   * Registrar evento de error
   * @param {number} idProceso - ID del proceso
   * @param {number} idEjecucion - ID de la ejecución
   * @param {number} idFund - ID del fondo
   * @param {string} etapa - Nombre del servicio donde ocurrió el error
   * @param {string} errorMessage - Mensaje de error
   * @param {object} metadata - Contexto adicional del error
   * @param {string} subEtapa - Sub-paso del servicio donde ocurrió el error (opcional)
   */
  async recordError(idProceso, idEjecucion, idFund, etapa, errorMessage, metadata = {}, subEtapa = null) {
    return this._record({
      ID_Proceso: idProceso,
      ID_Ejecucion: idEjecucion,
      ID_Fund: idFund,
      Etapa: etapa,
      SubEtapa: subEtapa,
      Tipo_Evento: 'ERROR',
      Recurso: null,
      Duracion_Ms: 0,
      Metadata: JSON.stringify({ error: errorMessage, ...metadata }),
      Thread_ID: process.pid
    });
  }

  /**
   * Registrar evento de espera (ej: esperando por pool de conexiones)
   * @param {number} idProceso - ID del proceso
   * @param {number} idEjecucion - ID de la ejecución
   * @param {number} idFund - ID del fondo
   * @param {string} recurso - Recurso por el que se está esperando
   * @param {number} waitMs - Duración de la espera
   * @param {object} metadata - Contexto adicional
   */
  async recordWait(idProceso, idEjecucion, idFund, recurso, waitMs, metadata = {}) {
    return this._record({
      ID_Proceso: idProceso,
      ID_Ejecucion: idEjecucion,
      ID_Fund: idFund,
      Etapa: 'WAIT',
      SubEtapa: null,
      Tipo_Evento: 'WAIT',
      Recurso: recurso,
      Duracion_Ms: waitMs,
      Metadata: JSON.stringify(metadata),
      Thread_ID: process.pid
    });
  }

  /**
   * Método interno para agregar registro al buffer
   * @private
   */
  async _record(traceRecord) {
    // Agregar timestamp en el momento preciso que ocurre el evento
    // No depender del DEFAULT GETDATE() de SQL Server para tener precisión
    traceRecord.Timestamp = new Date();

    this.buffer.push(traceRecord);

    // Auto-flush cuando el buffer alcanza el umbral
    if (this.buffer.length >= this.bufferSize) {
      await this.flush();
    }
  }

  /**
   * Escribir todos los registros del buffer a la base de datos
   * Usa bulk insert para mejor performance
   */
  async flush() {
    if (this.buffer.length === 0 || this.flushInProgress) {
      return;
    }

    this.flushInProgress = true;
    const recordsToFlush = [...this.buffer];
    this.buffer = [];

    try {
      const table = new sql.Table('logs.Trace_Records');
      table.columns.add('ID_Proceso', sql.BigInt, { nullable: false });
      table.columns.add('ID_Ejecucion', sql.BigInt, { nullable: false });
      table.columns.add('ID_Fund', sql.Int, { nullable: true });
      table.columns.add('Timestamp', sql.DateTime, { nullable: false }); // Agregado: timestamp preciso
      table.columns.add('Etapa', sql.NVarChar(50), { nullable: true });
      table.columns.add('SubEtapa', sql.NVarChar(50), { nullable: true });
      table.columns.add('Tipo_Evento', sql.NVarChar(20), { nullable: false });
      table.columns.add('Recurso', sql.NVarChar(100), { nullable: true });
      table.columns.add('Duracion_Ms', sql.Int, { nullable: true });
      table.columns.add('Metadata', sql.NVarChar(sql.MAX), { nullable: true });
      table.columns.add('Thread_ID', sql.Int, { nullable: true });

      recordsToFlush.forEach(record => {
        table.rows.add(
          record.ID_Proceso,
          record.ID_Ejecucion,
          record.ID_Fund,
          record.Timestamp, // Agregado: timestamp preciso del evento
          record.Etapa,
          record.SubEtapa,
          record.Tipo_Evento,
          record.Recurso,
          record.Duracion_Ms,
          record.Metadata,
          record.Thread_ID
        );
      });

      await this.pool.request().bulk(table);
      console.log(`[TraceService] Se escribieron ${recordsToFlush.length} registros de trace a la base de datos`);
    } catch (error) {
      console.error('[TraceService] Error escribiendo registros de trace:', error);
      // Re-agregar registros fallidos al buffer para reintentar
      this.buffer.unshift(...recordsToFlush);
    } finally {
      this.flushInProgress = false;
    }
  }

  /**
   * Obtener tamaño del buffer para monitoreo
   */
  getBufferSize() {
    return this.buffer.length;
  }

  /**
   * Limpiar buffer sin escribir a BD (usar con precaución)
   */
  clearBuffer() {
    this.buffer = [];
  }
}

module.exports = TraceService;
