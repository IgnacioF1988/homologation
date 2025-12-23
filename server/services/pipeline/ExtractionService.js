/**
 * ExtractionService - Servicio de Extracción de Datos (Batch)
 *
 * Ejecuta los stored procedures de extracción de todas las fuentes:
 * - Extract_IPA
 * - Extract_CAPM
 * - Extract_PosModRF
 * - Extract_SONA
 * - Extract_Derivados
 * - Extract_UBS
 * - Extract_UBS_MonedaDerivados
 * - Extract_UBS_Patrimonio
 *
 * Este servicio se ejecuta UNA vez por fecha (no por fondo individual).
 * Los extractores se ejecutan en paralelo cuando es posible (order: 1).
 */

const sql = require('mssql');
const pLimit = require('p-limit');

class ExtractionService {
  /**
   * Constructor
   * @param {Object} serviceConfig - Configuración del servicio desde pipeline.config.yaml
   * @param {Object} pool - Connection pool de SQL Server
   * @param {Object} tracker - ExecutionTracker (no se usa en batch, pero se mantiene consistencia)
   * @param {Object} logger - LoggingService para registrar eventos
   */
  constructor(serviceConfig, pool, tracker, logger) {
    this.config = serviceConfig;
    this.pool = pool;
    this.tracker = tracker;
    this.logger = logger;
    this.id = serviceConfig.id;
    this.name = serviceConfig.name || serviceConfig.id;
  }

  /**
   * Ejecutar el servicio de extracción
   *
   * @param {Object} context - Contexto de ejecución
   * @param {BigInt} context.idEjecucion - ID de la ejecución
   * @param {String} context.fechaReporte - Fecha a procesar (YYYY-MM-DD)
   * @param {Object} context.fund - null (batch no tiene fondo específico)
   * @returns {Promise<Object>} - { success, duration, extractedSources }
   */
  async execute(context) {
    const { idEjecucion, fechaReporte, fund } = context;
    const startTime = Date.now();

    try {
      // Log inicio
      console.log(`[ExtractionService ${idEjecucion}] Iniciando extracción para fecha ${fechaReporte}`);
      await this.logInfo(idEjecucion, null, `Iniciando ${this.name} para fecha ${fechaReporte}`);

      // Agrupar SPs por orden
      const spsByOrder = this._groupSPsByOrder();

      // Ejecutar cada grupo en orden (los de mismo order se ejecutan en paralelo)
      const extractedSources = [];
      for (const [order, sps] of spsByOrder.entries()) {
        console.log(`[ExtractionService ${idEjecucion}] Ejecutando grupo orden ${order} (${sps.length} SPs)`);

        // Ejecutar SPs del mismo order en paralelo
        const results = await this._executeParallelSPs(sps, idEjecucion, fechaReporte);
        extractedSources.push(...results);
      }

      const duration = Date.now() - startTime;
      console.log(`[ExtractionService ${idEjecucion}] Extracción completada en ${duration}ms`);
      await this.logInfo(idEjecucion, null, `${this.name} completado en ${duration}ms - ${extractedSources.length} fuentes extraídas`);

      return {
        success: true,
        duration,
        extractedSources
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[ExtractionService ${idEjecucion}] Error en extracción:`, error);
      await this.logError(idEjecucion, null, `Error en ${this.name}: ${error.message}`);

      return {
        success: false,
        duration,
        error
      };
    }
  }

  /**
   * Agrupar SPs por orden de ejecución
   * @returns {Map<Number, Array>} - Map de order -> array de SPs
   * @private
   */
  _groupSPsByOrder() {
    const spsByOrder = new Map();

    this.config.spList.forEach(sp => {
      const order = sp.order || 1;
      if (!spsByOrder.has(order)) {
        spsByOrder.set(order, []);
      }
      spsByOrder.get(order).push(sp);
    });

    // Convertir a array ordenado por keys
    return new Map([...spsByOrder.entries()].sort((a, b) => a[0] - b[0]));
  }

  /**
   * Ejecutar múltiples SPs en paralelo
   * @param {Array} sps - Array de configuraciones de SPs
   * @param {BigInt} idEjecucion - ID de ejecución
   * @param {String} fechaReporte - Fecha a procesar
   * @returns {Promise<Array>} - Array de resultados
   * @private
   */
  async _executeParallelSPs(sps, idEjecucion, fechaReporte) {
    // Límite de concurrencia: ejecutar hasta 4 extractores en paralelo
    const limit = pLimit(4);

    const promises = sps.map(spConfig =>
      limit(() => this._executeSP(spConfig, idEjecucion, fechaReporte))
    );

    return await Promise.all(promises);
  }

  /**
   * Ejecutar un stored procedure de extracción
   * @param {Object} spConfig - Configuración del SP
   * @param {BigInt} idEjecucion - ID de ejecución
   * @param {String} fechaReporte - Fecha a procesar
   * @returns {Promise<Object>} - Resultado de la extracción
   * @private
   */
  async _executeSP(spConfig, idEjecucion, fechaReporte) {
    const spName = spConfig.name;

    try {
      console.log(`[ExtractionService ${idEjecucion}] Ejecutando ${spName} para fecha ${fechaReporte}...`);
      await this.logInfo(idEjecucion, null, `Ejecutando ${spName}...`);

      // Crear request
      const request = this.pool.request();

      // Configurar timeout
      if (spConfig.timeout) {
        request.timeout = spConfig.timeout;
      }

      // Parámetros de entrada
      request.input('FechaReporte', sql.NVarChar(10), fechaReporte);

      // NOTA: Los SPs de extracción (extract.*) NO tienen parámetros OUTPUT
      // Usan RETURN para indicar resultado: 0=éxito, 1=sin datos, -1=error
      // Los OUTPUT se usan en staging.* y process.*, no en extract.*

      // Ejecutar SP con retry logic
      const result = await this._executeWithRetry(async () => {
        return await request.execute(spName);
      }, spConfig);

      // Procesar resultado
      // Los SPs de extracción NO tienen OUTPUT params, solo returnValue:
      // 0 = Éxito con datos
      // 1 = Éxito sin datos (no hay registros para la fecha)
      // -1 = Error
      const returnValue = result.returnValue;

      console.log(
        `[ExtractionService ${idEjecucion}] ${spName} completado - ` +
        `ReturnValue: ${returnValue}`
      );

      await this.logInfo(
        idEjecucion,
        null,
        `${spName} completado - ReturnValue: ${returnValue}`
      );

      // Validar resultado
      if (returnValue === 3) {
        throw new Error(`${spName} falló críticamente (returnValue: 3)`);
      }

      if (returnValue === 2) {
        throw new Error(`${spName} error recuperable (returnValue: 2)`);
      }

      if (returnValue === 1) {
        await this.logInfo(idEjecucion, null, `${spName} completó sin datos para la fecha`);
      }

      return {
        source: spName,
        returnValue,
        success: returnValue === 0 || returnValue === 1, // 0=datos, 1=sin datos (ambos OK)
      };

    } catch (error) {
      console.error(`[ExtractionService ${idEjecucion}] Error en ${spName}:`, error);
      await this.logError(idEjecucion, null, `Error en ${spName}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Ejecutar función con retry logic (exponential backoff)
   * @param {Function} fn - Función async a ejecutar
   * @param {Object} spConfig - Configuración del SP
   * @returns {Promise} - Resultado de la función
   * @private
   */
  async _executeWithRetry(fn, spConfig) {
    const maxRetries = 3;
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;

        // Verificar si es error retriable
        const isDeadlock = error.number === 1205; // SQL deadlock
        const isTimeout = error.code === 'ETIMEOUT';
        const isConnectionError = error.code === 'ECONNRESET' || error.code === 'ESOCKET';

        const shouldRetry = isDeadlock || isTimeout || isConnectionError;

        if (shouldRetry && attempt < maxRetries) {
          const delay = 5000 * attempt; // Exponential backoff: 5s, 10s, 15s
          console.warn(
            `[ExtractionService] Error retriable en ${spConfig.name} - intento ${attempt}/${maxRetries}. ` +
            `Reintentando en ${delay}ms... Error: ${error.message}`
          );
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        // No retriable o se agotaron intentos
        throw error;
      }
    }

    throw lastError;
  }

  // ============================================
  // Logging helpers
  // ============================================

  async logInfo(idEjecucion, idFund, mensaje) {
    await this.logger.log(idEjecucion, idFund, 'INFO', this.id, mensaje);
  }

  async logWarning(idEjecucion, idFund, mensaje) {
    await this.logger.log(idEjecucion, idFund, 'WARNING', this.id, mensaje);
  }

  async logError(idEjecucion, idFund, mensaje) {
    await this.logger.log(idEjecucion, idFund, 'ERROR', this.id, mensaje);
  }
}

module.exports = ExtractionService;
