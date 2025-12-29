/**
 * LoggingService - Servicio de Logging Estructurado para Pipeline
 *
 * Gestiona el registro de eventos del pipeline en la tabla logs.Ejecucion_Logs
 * con soporte para bulk insert automático y niveles de logging configurables.
 *
 * RECIBE:
 * - pool: Pool de conexiones SQL Server (compartido entre todos los orquestadores)
 * - level: Nivel mínimo de logging ('DEBUG', 'INFO', 'WARNING', 'ERROR')
 * - idEjecucion: ID único de la ejecución del fondo (BigInt)
 * - idFund: ID del fondo (Int, null si es log general)
 * - nivel: Nivel del log individual ('DEBUG', 'INFO', 'WARNING', 'ERROR')
 * - etapa: Etapa del pipeline (PROCESS_IPA, EXTRACCION, etc.)
 * - mensaje: Mensaje descriptivo del evento
 * - metadata: Metadata adicional opcional (stacktrace, métricas, etc.)
 *
 * PROCESA:
 * 1. Valida nivel: descarta logs de nivel inferior al configurado
 * 2. Trunca mensajes: máximo 1000 caracteres para evitar overflow en BD
 * 3. Agrega a buffer: acumula logs en memoria (batch de 100 por defecto)
 * 4. Flush automático: cada 5 segundos o al alcanzar 100 logs
 * 5. Bulk insert: inserta todos los logs del batch en una sola operación SQL
 * 6. Log a consola: opcionalmente imprime logs en stdout (default: true)
 * 7. Cleanup: al finalizar, detiene auto-flush y escribe logs pendientes
 *
 * ENVIA:
 * - Logs a: logs.Ejecucion_Logs (tabla de logging del pipeline)
 * - Console output a: stdout (si logToConsole = true)
 * - Confirmación a: Caller (Promise resuelto) → FundOrchestrator, BasePipelineService
 *
 * DEPENDENCIAS:
 * - Requiere: SQL Server pool (compartido)
 * - Requerido por: FundOrchestrator, BasePipelineService, todos los servicios del pipeline
 *
 * CONTEXTO PARALELO:
 * - Servicio COMPARTIDO: una sola instancia usada por todos los FundOrchestrators
 * - Thread-safe: buffer en memoria se serializa al escribir a BD
 * - Bulk insert: optimización para alta concurrencia (100 logs por batch)
 * - Auto-flush: previene pérdida de logs si el proceso termina inesperadamente
 * - Sin contención: logs de diferentes fondos se insertan en la misma tabla sin conflicto
 */

const sql = require('mssql');

class LoggingService {
  /**
   * Constructor
   * @param {Object} pool - Connection pool de SQL Server
   * @param {String} level - Nivel mínimo de logging ('DEBUG', 'INFO', 'WARNING', 'ERROR')
   * @param {Object} options - Opciones adicionales
   */
  constructor(pool, level = 'INFO', options = {}) {
    if (!pool) {
      throw new Error('LoggingService requiere un connection pool válido');
    }

    this.pool = pool;
    this.level = level;
    this.logToConsole = options.logToConsole !== false; // Default: true
    this.bulkBatchSize = options.bulkBatchSize || 100;
    this.flushIntervalMs = options.flushIntervalMs || 5000; // 5 segundos

    // Buffer para bulk insert
    this.buffer = [];

    // Niveles de logging (mayor número = mayor severidad)
    this.levels = {
      DEBUG: 0,
      INFO: 1,
      WARNING: 2,
      ERROR: 3,
    };

    // Auto-flush periódico
    this.flushInterval = setInterval(() => {
      if (this.buffer.length > 0) {
        this.flush().catch(err => {
          // Si es un error de conexión cerrada, detener auto-flush para evitar spam
          if (err.code === 'ECONNCLOSED' || (err.message && err.message.includes('Connection is closed'))) {
            console.warn('[LoggingService] Conexión cerrada - deteniendo auto-flush');
            if (this.flushInterval) {
              clearInterval(this.flushInterval);
              this.flushInterval = null;
            }
          } else {
            console.error('[LoggingService] Error en auto-flush:', err);
          }
        });
      }
    }, this.flushIntervalMs);

    console.log(
      `[LoggingService] Inicializado - Nivel: ${level}, ` +
      `Batch: ${this.bulkBatchSize}, Auto-flush: ${this.flushIntervalMs}ms`
    );
  }

  /**
   * Registrar un evento del pipeline
   *
   * @param {BigInt} idEjecucion - ID de la ejecución
   * @param {Number} idFund - ID del fondo (null si es log general)
   * @param {String} nivel - Nivel del log ('DEBUG', 'INFO', 'WARNING', 'ERROR')
   * @param {String} etapa - Etapa del pipeline (ej: 'PROCESS_IPA', 'EXTRACCION')
   * @param {String} mensaje - Mensaje descriptivo
   * @param {Object} metadata - Metadata adicional opcional
   * @returns {Promise<void>}
   */
  async log(idEjecucion, idFund, nivel, etapa, mensaje, metadata = {}) {
    // Verificar si este nivel debe loguearse
    if (!this.shouldLog(nivel)) {
      return;
    }

    // Asegurar que metadata sea un objeto (manejar null/undefined)
    const meta = metadata || {};

    // Crear entrada de log
    const logEntry = {
      idEjecucion,
      idFund: idFund ? String(idFund) : null, // Convertir a string (tabla espera VARCHAR(50))
      timestamp: new Date(),
      nivel,
      categoria: meta.categoria || 'PIPELINE', // Valor por defecto (NOT NULL)
      etapa,
      subEtapa: meta.subEtapa || null,
      mensaje,
      detalle: meta.detalle || null,
      datosJSON: meta.metadata ? JSON.stringify(meta.metadata) : null,
      stackTrace: meta.stackTrace || null,
    };

    // Agregar a buffer
    this.buffer.push(logEntry);

    // Logging a consola (si está habilitado)
    if (this.logToConsole) {
      this.logToConsoleOutput(logEntry);
    }

    // Flush automático si alcanzamos el tamaño de batch
    if (this.buffer.length >= this.bulkBatchSize) {
      await this.flush();
    }
  }

  /**
   * Verificar si un nivel debe loguearse según configuración
   * @private
   */
  shouldLog(nivel) {
    const configuredLevel = this.levels[this.level];
    const messageLevel = this.levels[nivel];

    if (configuredLevel === undefined || messageLevel === undefined) {
      console.warn(`[LoggingService] Nivel desconocido: ${nivel} (config: ${this.level})`);
      return true; // Por defecto, loguear si nivel es desconocido
    }

    return messageLevel >= configuredLevel;
  }

  /**
   * Escribir log a consola
   * @private
   */
  logToConsoleOutput(logEntry) {
    const timestamp = logEntry.timestamp.toISOString();
    const prefix = `[${timestamp}][${logEntry.nivel}][Ejecución:${logEntry.idEjecucion}]`;
    const fundInfo = logEntry.idFund ? `[Fondo:${logEntry.idFund}]` : '';
    const etapaInfo = `[${logEntry.etapa}]`;
    const message = `${prefix}${fundInfo}${etapaInfo} ${logEntry.mensaje}`;

    switch (logEntry.nivel) {
      case 'ERROR':
        console.error(message);
        if (logEntry.detalle) {
          console.error('Detalle:', logEntry.detalle);
        }
        if (logEntry.stackTrace) {
          console.error('Stack trace:', logEntry.stackTrace);
        }
        break;
      case 'WARNING':
        console.warn(message);
        break;
      case 'DEBUG':
        console.debug(message);
        break;
      default:
        console.log(message);
    }
  }

  /**
   * Forzar escritura de todos los logs en buffer a la base de datos
   *
   * @returns {Promise<void>}
   */
  async flush() {
    if (this.buffer.length === 0) {
      return;
    }

    const logsToInsert = [...this.buffer];
    this.buffer = []; // Limpiar buffer inmediatamente

    try {
      // Usar Table-Valued Parameter para bulk insert
      const table = new sql.Table('logs.Ejecucion_Logs');
      table.create = false; // No crear tabla, ya existe

      // Definir columnas (deben coincidir EXACTAMENTE con logs.Ejecucion_Logs)
      table.columns.add('ID_Ejecucion', sql.BigInt, { nullable: false });
      table.columns.add('ID_Fund', sql.Int, { nullable: true });
      table.columns.add('Timestamp', sql.DateTime, { nullable: true });
      table.columns.add('Nivel', sql.VarChar(10), { nullable: false });
      table.columns.add('Categoria', sql.VarChar(30), { nullable: false });
      table.columns.add('Etapa', sql.VarChar(50), { nullable: false });
      table.columns.add('SubEtapa', sql.VarChar(50), { nullable: true });
      table.columns.add('Mensaje', sql.NVarChar(1000), { nullable: false });
      table.columns.add('Detalle', sql.NVarChar(sql.MAX), { nullable: true });
      table.columns.add('Datos_JSON', sql.NVarChar(sql.MAX), { nullable: true });
      table.columns.add('Stack_Trace', sql.NVarChar(sql.MAX), { nullable: true });

      // Agregar filas (orden debe coincidir con las columnas)
      logsToInsert.forEach(log => {
        // Truncar mensaje a 1000 caracteres para coincidir con la tabla
        // Si el mensaje original era más largo y no hay detalle, preservar el mensaje completo en detalle
        const maxMensajeLength = 1000;
        let mensaje = log.mensaje || '';
        let detalle = log.detalle;

        if (mensaje.length > maxMensajeLength) {
          // Si hay overflow y no hay detalle, mover el mensaje completo al detalle
          if (!detalle) {
            detalle = mensaje;
          }
          // Truncar mensaje con indicador
          mensaje = mensaje.substring(0, maxMensajeLength - 3) + '...';
        }

        table.rows.add(
          log.idEjecucion,
          log.idFund,
          log.timestamp,
          log.nivel,
          log.categoria,
          log.etapa,
          log.subEtapa,
          mensaje,
          detalle,
          log.datosJSON,
          log.stackTrace
        );
      });

      // Ejecutar bulk insert
      const request = this.pool.request();
      await request.bulk(table);

      console.log(`[LoggingService] Flush completado: ${logsToInsert.length} logs escritos`);
    } catch (error) {
      console.error(
        `[LoggingService] Error en flush (${logsToInsert.length} logs):`,
        error
      );

      // Re-agregar logs al buffer para reintentar
      this.buffer.unshift(...logsToInsert);

      throw error;
    }
  }

  /**
   * Métodos de conveniencia para logging por nivel
   */

  async debug(idEjecucion, idFund, etapa, mensaje, metadata) {
    return this.log(idEjecucion, idFund, 'DEBUG', etapa, mensaje, metadata);
  }

  async info(idEjecucion, idFund, etapa, mensaje, metadata) {
    return this.log(idEjecucion, idFund, 'INFO', etapa, mensaje, metadata);
  }

  async warning(idEjecucion, idFund, etapa, mensaje, metadata) {
    return this.log(idEjecucion, idFund, 'WARNING', etapa, mensaje, metadata);
  }

  async error(idEjecucion, idFund, etapa, mensaje, error) {
    const metadata = {
      stackTrace: error?.stack || null,
      metadata: error ? { name: error.name, message: error.message } : null,
    };
    return this.log(idEjecucion, idFund, 'ERROR', etapa, mensaje, metadata);
  }

  /**
   * Obtener logs de una ejecución específica
   *
   * @param {BigInt} idEjecucion - ID de la ejecución
   * @param {Object} filters - Filtros opcionales (nivel, etapa, idFund)
   * @param {Number} limit - Límite de resultados (default: 1000)
   * @returns {Promise<Array<Object>>} - Array de logs
   */
  async getExecutionLogs(idEjecucion, filters = {}, limit = 1000) {
    try {
      // Asegurar flush antes de leer
      await this.flush();

      const request = this.pool.request();
      request.input('ID_Ejecucion', sql.BigInt, idEjecucion);
      request.input('Limit', sql.Int, limit);

      let query = `
        SELECT TOP (@Limit)
          ID,
          ID_Ejecucion,
          ID_Fund,
          Nivel,
          Categoria,
          Etapa,
          SubEtapa,
          Mensaje,
          Detalle,
          Timestamp,
          Datos_JSON,
          Stack_Trace
        FROM logs.Ejecucion_Logs
        WHERE ID_Ejecucion = @ID_Ejecucion
      `;

      // Filtros opcionales
      if (filters.nivel) {
        request.input('Nivel', sql.NVarChar(20), filters.nivel);
        query += ' AND Nivel = @Nivel';
      }

      if (filters.etapa) {
        request.input('Etapa', sql.NVarChar(100), filters.etapa);
        query += ' AND Etapa = @Etapa';
      }

      if (filters.idFund !== undefined) {
        request.input('ID_Fund', sql.Int, filters.idFund);
        query += ' AND ID_Fund = @ID_Fund';
      }

      query += ' ORDER BY Timestamp DESC';

      const result = await request.query(query);
      return result.recordset;
    } catch (error) {
      console.error(
        `[LoggingService] Error obteniendo logs para ejecución ${idEjecucion}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Obtener estadísticas de logs por nivel
   *
   * @param {BigInt} idEjecucion - ID de la ejecución
   * @returns {Promise<Object>} - Objeto con contadores por nivel
   */
  async getLogStats(idEjecucion) {
    try {
      // Asegurar flush antes de leer
      await this.flush();

      const request = this.pool.request();
      const result = await request
        .input('ID_Ejecucion', sql.BigInt, idEjecucion)
        .query(`
          SELECT
            Nivel,
            COUNT(*) AS Count
          FROM logs.Ejecucion_Logs
          WHERE ID_Ejecucion = @ID_Ejecucion
          GROUP BY Nivel
        `);

      // Convertir a objeto
      const stats = {
        DEBUG: 0,
        INFO: 0,
        WARNING: 0,
        ERROR: 0,
      };

      result.recordset.forEach(row => {
        stats[row.Nivel] = row.Count;
      });

      return stats;
    } catch (error) {
      console.error(
        `[LoggingService] Error obteniendo estadísticas de logs para ejecución ${idEjecucion}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Limpiar logs antiguos (política de retención)
   *
   * @param {Number} daysToKeep - Días de retención (default: 90)
   * @returns {Promise<Number>} - Número de logs eliminados
   */
  async cleanupOldLogs(daysToKeep = 90) {
    try {
      const request = this.pool.request();
      const result = await request
        .input('DaysToKeep', sql.Int, daysToKeep)
        .query(`
          DELETE FROM logs.Ejecucion_Logs
          WHERE Timestamp < DATEADD(DAY, -@DaysToKeep, GETDATE())
        `);

      const deletedCount = result.rowsAffected[0];
      console.log(
        `[LoggingService] Limpieza completada: ${deletedCount} logs eliminados (>${daysToKeep} días)`
      );

      return deletedCount;
    } catch (error) {
      console.error('[LoggingService] Error en limpieza de logs antiguos:', error);
      throw error;
    }
  }

  /**
   * Destruir el servicio de logging (limpiar recursos)
   *
   * @returns {Promise<void>}
   */
  async destroy() {
    // Detener auto-flush
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }

    // Flush final de logs pendientes
    if (this.buffer.length > 0) {
      console.log(`[LoggingService] Flush final: ${this.buffer.length} logs pendientes`);
      await this.flush();
    }

    console.log('[LoggingService] Destruido');
  }

  /**
   * Cambiar nivel de logging dinámicamente
   *
   * @param {String} newLevel - Nuevo nivel ('DEBUG', 'INFO', 'WARNING', 'ERROR')
   */
  setLevel(newLevel) {
    if (!this.levels.hasOwnProperty(newLevel)) {
      throw new Error(`Nivel de logging inválido: ${newLevel}`);
    }

    const oldLevel = this.level;
    this.level = newLevel;

    console.log(`[LoggingService] Nivel de logging cambiado: ${oldLevel} → ${newLevel}`);
  }

  /**
   * Obtener estado actual del buffer
   *
   * @returns {Object} - Estado del buffer y configuración
   */
  getStatus() {
    return {
      bufferSize: this.buffer.length,
      bulkBatchSize: this.bulkBatchSize,
      level: this.level,
      logToConsole: this.logToConsole,
      flushIntervalMs: this.flushIntervalMs,
    };
  }
}

module.exports = LoggingService;
