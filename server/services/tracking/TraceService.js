const sql = require('mssql');

/**
 * TraceService - Buffered trace recording for execution flow analysis
 *
 * Purpose: Record detailed execution events for:
 * - Resource contention detection
 * - Performance bottleneck identification
 * - Execution flow visualization
 * - Debugging concurrent fund processing
 *
 * Features:
 * - Buffered writes for performance (bulk insert when buffer reaches threshold)
 * - Automatic flush on orchestrator completion
 * - Thread-safe recording
 * - Multiple event types: START, END, LOCK, WAIT, ERROR
 */
class TraceService {
  constructor(pool, bufferSize = 100) {
    this.pool = pool;
    this.buffer = [];
    this.bufferSize = bufferSize;
    this.flushInProgress = false;
  }

  /**
   * Record service start event
   * @param {number} idProceso - Process ID
   * @param {number} idEjecucion - Execution ID
   * @param {number} idFund - Fund ID
   * @param {string} etapa - Service name (e.g., 'IPA', 'CAPM')
   * @param {string} recurso - Resource name (e.g., 'staging.IPA_WorkTable')
   * @param {object} metadata - Additional context (portfolio, etc.)
   */
  async recordStart(idProceso, idEjecucion, idFund, etapa, recurso, metadata = {}) {
    return this._record({
      ID_Proceso: idProceso,
      ID_Ejecucion: idEjecucion,
      ID_Fund: idFund,
      Etapa: etapa,
      SubEtapa: null,
      Tipo_Evento: 'START',
      Recurso: recurso,
      Duracion_Ms: 0,
      Metadata: JSON.stringify(metadata),
      Thread_ID: process.pid
    });
  }

  /**
   * Record service end event
   * @param {number} idProceso - Process ID
   * @param {number} idEjecucion - Execution ID
   * @param {number} idFund - Fund ID
   * @param {string} etapa - Service name
   * @param {string} recurso - Resource name
   * @param {number} duracionMs - Execution duration in milliseconds
   * @param {object} metadata - Additional context (rows affected, etc.)
   */
  async recordEnd(idProceso, idEjecucion, idFund, etapa, recurso, duracionMs, metadata = {}) {
    return this._record({
      ID_Proceso: idProceso,
      ID_Ejecucion: idEjecucion,
      ID_Fund: idFund,
      Etapa: etapa,
      SubEtapa: null,
      Tipo_Evento: 'END',
      Recurso: recurso,
      Duracion_Ms: duracionMs,
      Metadata: JSON.stringify(metadata),
      Thread_ID: process.pid
    });
  }

  /**
   * Record lock/wait event
   * @param {number} idProceso - Process ID
   * @param {number} idEjecucion - Execution ID
   * @param {number} idFund - Fund ID
   * @param {string} recurso - Resource that caused lock
   * @param {object} metadata - Lock details
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
   * Record error event
   * @param {number} idProceso - Process ID
   * @param {number} idEjecucion - Execution ID
   * @param {number} idFund - Fund ID
   * @param {string} etapa - Service name where error occurred
   * @param {string} errorMessage - Error message
   * @param {object} metadata - Additional error context
   */
  async recordError(idProceso, idEjecucion, idFund, etapa, errorMessage, metadata = {}) {
    return this._record({
      ID_Proceso: idProceso,
      ID_Ejecucion: idEjecucion,
      ID_Fund: idFund,
      Etapa: etapa,
      SubEtapa: null,
      Tipo_Evento: 'ERROR',
      Recurso: null,
      Duracion_Ms: 0,
      Metadata: JSON.stringify({ error: errorMessage, ...metadata }),
      Thread_ID: process.pid
    });
  }

  /**
   * Record wait event (e.g., waiting for connection pool)
   * @param {number} idProceso - Process ID
   * @param {number} idEjecucion - Execution ID
   * @param {number} idFund - Fund ID
   * @param {string} recurso - Resource being waited on
   * @param {number} waitMs - Wait duration
   * @param {object} metadata - Additional context
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
   * Internal method to add record to buffer
   * @private
   */
  async _record(traceRecord) {
    this.buffer.push(traceRecord);

    // Auto-flush when buffer reaches threshold
    if (this.buffer.length >= this.bufferSize) {
      await this.flush();
    }
  }

  /**
   * Flush all buffered records to database
   * Uses bulk insert for performance
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
      console.log(`[TraceService] Flushed ${recordsToFlush.length} trace records to database`);
    } catch (error) {
      console.error('[TraceService] Error flushing trace records:', error);
      // Re-add failed records to buffer for retry
      this.buffer.unshift(...recordsToFlush);
    } finally {
      this.flushInProgress = false;
    }
  }

  /**
   * Get buffer size for monitoring
   */
  getBufferSize() {
    return this.buffer.length;
  }

  /**
   * Clear buffer without flushing (use with caution)
   */
  clearBuffer() {
    this.buffer = [];
  }
}

module.exports = TraceService;
