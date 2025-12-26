/**
 * ExtractionService - Servicio de extracción de datos del pipeline
 *
 * Ejecuta los stored procedures de extracción para un fondo específico.
 * Extrae datos desde fuentes externas (Geneva, CAPM, UBS, etc.) y los carga
 * en tablas extract.* con aislamiento por ID_Ejecucion.
 *
 * RECIBE:
 * - serviceConfig: Configuración desde pipeline.config.yaml (8 extractores)
 * - pool: Pool de conexiones SQL Server (compartido)
 * - tracker: ExecutionTracker (no se usa en extracción, pero se mantiene consistencia)
 * - logger: LoggingService para registrar eventos
 * - trace: TraceService (opcional)
 * - context: { idEjecucion, idProceso, fechaReporte, fund } desde FundOrchestrator
 *
 * PROCESA:
 * 1. Agrupa extractores por orden de ejecución (order 1, order 2, etc.)
 * 2. Ejecuta extractores del mismo orden en paralelo (hasta 4 simultáneos por fondo)
 * 3. Para cada extractor:
 *    - Determina Portfolio según tipo (UBS usa Portfolio_UBS, otros usan Portfolio_Geneva)
 *    - Ejecuta SP con parámetros: FechaReporte, ID_Proceso, ID_Ejecucion, ID_Fund, Portfolio
 *    - Valida returnValue (0=datos, 1=sin datos, 2=retry, 3=error crítico)
 * 4. Maneja retry automático en deadlocks y timeouts (3 intentos, 5s-10s-15s)
 *
 * ENVIA:
 * - Datos a: extract.IPA, extract.CAPM, extract.PosModRF, extract.SONA,
 *            extract.Derivados, extract.UBS (con ID_Ejecucion asignado)
 * - Logs a: LoggingService → logs.Ejecucion_Logs
 *
 * DEPENDENCIAS:
 * - No depende de otros servicios (es el primero en ejecutarse)
 * - Requerido por: ValidationService (valida datos extraídos)
 *
 * CONTEXTO PARALELO:
 * - Se ejecuta POR CADA FONDO de forma aislada
 * - Cada fondo procesa sus 8 extractores en 2 grupos:
 *   * Grupo 1 (order 1): Extract_IPA, Extract_CAPM, Extract_PosModRF, Extract_SONA (paralelo)
 *   * Grupo 2 (order 2): Extract_Derivados, Extract_UBS_* (paralelo)
 * - Límite: 4 extractores simultáneos por fondo
 * - Aislamiento: cada fondo tiene su Portfolio único, escribe con su ID_Ejecucion
 */

const sql = require('mssql');
const pLimit = require('p-limit');

class ExtractionService {
  /**
   * Constructor del servicio de extracción
   *
   * @param {Object} serviceConfig - Configuración del servicio desde pipeline.config.yaml
   * @param {Object} pool - Pool de conexiones de SQL Server (compartido entre orquestadores)
   * @param {Object} tracker - ExecutionTracker (mantenido para consistencia, no se usa en extracción)
   * @param {Object} logger - LoggingService para registrar eventos
   * @param {Object} trace - TraceService para trazabilidad detallada (opcional)
   */
  constructor(serviceConfig, pool, tracker, logger, trace = null) {
    this.config = serviceConfig;
    this.pool = pool;
    this.tracker = tracker;
    this.logger = logger;
    this.trace = trace;
    this.id = serviceConfig.id;
    this.name = serviceConfig.name || serviceConfig.id;
  }

  /**
   * Ejecutar el servicio de extracción para un fondo específico
   *
   * @param {Object} context - Contexto de ejecución (viene de: FundOrchestrator)
   * @param {BigInt} context.idEjecucion - ID único de la ejecución del fondo
   * @param {BigInt} context.idProceso - ID del proceso padre que agrupa fondos
   * @param {String} context.fechaReporte - Fecha a procesar (YYYY-MM-DD)
   * @param {Object} context.fund - Información del fondo desde logs.Ejecucion_Fondos
   * @returns {Promise<Object>} - { success: true/false, duration: ms, extractedSources: Array }
   *
   * Flujo:
   * 1. Agrupa extractores por orden (order 1, order 2, etc.)
   * 2. Para cada grupo en orden secuencial:
   *    - Ejecuta extractores del grupo en paralelo (hasta 4 simultáneos)
   *    - Espera a que todos terminen antes de pasar al siguiente grupo
   * 3. Recopila resultados de todos los extractores
   * 4. Retorna lista de fuentes extraídas con éxito
   *
   * Nota: ReturnValue 1 (sin datos) NO es error, es válido para fechas sin operaciones
   */
  async execute(context) {
    const { idEjecucion, idProceso, fechaReporte, fund } = context;
    const startTime = Date.now();

    try {
      // Log inicio
      console.log(`[ExtractionService ${idEjecucion}] Iniciando extracción para fondo ${fund.ID_Fund} (${fund.FundShortName}) - fecha ${fechaReporte}`);
      await this.logInfo(idEjecucion, fund.ID_Fund, `Iniciando ${this.name} para fondo ${fund.FundShortName}`);

      // Agrupar SPs por orden
      const spsByOrder = this._groupSPsByOrder();

      // Ejecutar cada grupo en orden (los de mismo order se ejecutan en paralelo)
      const extractedSources = [];
      for (const [order, sps] of spsByOrder.entries()) {
        console.log(`[ExtractionService ${idEjecucion}] Ejecutando grupo orden ${order} (${sps.length} SPs) para fondo ${fund.FundShortName}`);

        // Ejecutar SPs del mismo order en paralelo
        const results = await this._executeParallelSPs(sps, idProceso, idEjecucion, fechaReporte, fund);
        extractedSources.push(...results);
      }

      const duration = Date.now() - startTime;
      console.log(`[ExtractionService ${idEjecucion}] Extracción fondo ${fund.FundShortName} completada en ${duration}ms`);
      await this.logInfo(idEjecucion, fund.ID_Fund, `${this.name} completado en ${duration}ms - ${extractedSources.length} fuentes extraídas`);

      return {
        success: true,
        duration,
        extractedSources
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[ExtractionService ${idEjecucion}] Error en extracción fondo ${fund.FundShortName}:`, error);
      await this.logError(idEjecucion, fund.ID_Fund, `Error en ${this.name}: ${error.message}`);

      return {
        success: false,
        duration,
        error
      };
    }
  }

  /**
   * Agrupar extractores por orden de ejecución
   *
   * Organiza los extractores en grupos según su campo 'order' en la configuración.
   * Extractores del mismo orden se ejecutan en paralelo, grupos diferentes se ejecutan secuencialmente.
   *
   * @returns {Map<Number, Array>} - Map ordenado: order → array de configuraciones de SPs
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
   * Ejecutar múltiples extractores en paralelo con límite de concurrencia
   *
   * @param {Array} sps - Array de configuraciones de extractores
   * @param {BigInt} idProceso - ID del proceso padre
   * @param {BigInt} idEjecucion - ID de ejecución del fondo
   * @param {String} fechaReporte - Fecha a procesar (YYYY-MM-DD)
   * @param {Object} fund - Fondo con Portfolio_Geneva, Portfolio_UBS, etc.
   * @returns {Promise<Array>} - Array de resultados: [{ source, returnValue, success }, ...]
   *
   * Flujo:
   * 1. Crea límite de concurrencia (4 extractores simultáneos por fondo)
   * 2. Encola todos los extractores del grupo
   * 3. Ejecuta en paralelo respetando el límite
   * 4. Espera a que todos completen (Promise.all)
   *
   * @private
   */
  async _executeParallelSPs(sps, idProceso, idEjecucion, fechaReporte, fund) {
    // Límite de concurrencia: ejecutar hasta 4 extractores en paralelo por fondo
    const limit = pLimit(4);

    const promises = sps.map(spConfig =>
      limit(() => this._executeSP(spConfig, idProceso, idEjecucion, fechaReporte, fund))
    );

    return await Promise.all(promises);
  }

  /**
   * Ejecutar un stored procedure de extracción individual
   *
   * @param {Object} spConfig - Configuración del extractor desde pipeline.config.yaml
   * @param {BigInt} idProceso - ID del proceso padre
   * @param {BigInt} idEjecucion - ID de ejecución del fondo
   * @param {String} fechaReporte - Fecha a procesar (YYYY-MM-DD)
   * @param {Object} fund - Fondo con todos los portfolios (Geneva, UBS, CAPM, etc.)
   * @returns {Promise<Object>} - { source: nombre SP, returnValue: 0/1/2/3, success: boolean }
   *
   * Flujo:
   * 1. Determina qué Portfolio usar según tipo de extractor:
   *    - Extractores UBS → fund.Portfolio_UBS
   *    - Otros extractores → fund.Portfolio_Geneva
   * 2. Construye request con 5 parámetros: FechaReporte, ID_Proceso, ID_Ejecucion, ID_Fund, Portfolio
   * 3. Ejecuta SP con retry automático (3 intentos en deadlock/timeout)
   * 4. Valida returnValue:
   *    - 0: Éxito con datos extraídos
   *    - 1: Éxito sin datos (fecha sin operaciones, válido)
   *    - 2: Error recuperable (trigger retry)
   *    - 3: Error crítico (lanzar excepción)
   *
   * Nota: Los SPs extract.* NO tienen parámetros OUTPUT, solo returnValue
   * @private
   */
  async _executeSP(spConfig, idProceso, idEjecucion, fechaReporte, fund) {
    const spName = spConfig.name;

    try {
      // Determinar qué portfolio usar según el extractor
      const isUBSExtractor = spName.includes('UBS');
      const portfolio = isUBSExtractor ? fund.Portfolio_UBS : fund.Portfolio_Geneva;

      console.log(`[ExtractionService ${idEjecucion}] Ejecutando ${spName} para fondo ${fund.FundShortName} (${portfolio})...`);
      await this.logInfo(idEjecucion, fund.ID_Fund, `Ejecutando ${spName} para ${portfolio}...`);

      // Crear request
      const request = this.pool.request();

      // Configurar timeout
      if (spConfig.timeout) {
        request.timeout = spConfig.timeout;
      }

      // Parámetros de entrada (5 parámetros para per-fund isolation)
      request.input('FechaReporte', sql.NVarChar(10), fechaReporte);
      request.input('ID_Proceso', sql.BigInt, idProceso);
      request.input('ID_Ejecucion', sql.BigInt, idEjecucion);
      request.input('ID_Fund', sql.Int, fund.ID_Fund);
      request.input('Portfolio', sql.NVarChar(100), portfolio);

      // NOTA: Los SPs de extracción (extract.*) NO tienen parámetros OUTPUT
      // Usan RETURN para indicar resultado: 0=éxito, 1=sin datos, -1=error

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
        `[ExtractionService ${idEjecucion}] ${spName} completado para ${fund.FundShortName} - ` +
        `ReturnValue: ${returnValue}`
      );

      await this.logInfo(
        idEjecucion,
        fund.ID_Fund,
        `${spName} completado para ${portfolio} - ReturnValue: ${returnValue}`
      );

      // Validar resultado
      if (returnValue === 3) {
        throw new Error(`${spName} falló críticamente (returnValue: 3)`);
      }

      if (returnValue === 2) {
        throw new Error(`${spName} error recuperable (returnValue: 2)`);
      }

      if (returnValue === 1) {
        await this.logInfo(idEjecucion, fund.ID_Fund, `${spName} completó sin datos para ${portfolio}`);
      }

      return {
        source: spName,
        returnValue,
        success: returnValue === 0 || returnValue === 1, // 0=datos, 1=sin datos (ambos OK)
      };

    } catch (error) {
      console.error(`[ExtractionService ${idEjecucion}] Error en ${spName} para fondo ${fund.FundShortName}:`, error);
      await this.logError(idEjecucion, fund.ID_Fund, `Error en ${spName}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Ejecutar función con retry automático (exponential backoff)
   *
   * Reintenta automáticamente en errores retriables de SQL Server.
   *
   * @param {Function} fn - Función async a ejecutar (debe retornar Promise)
   * @param {Object} spConfig - Configuración del SP (para logging de contexto)
   * @returns {Promise} - Resultado de la función si tiene éxito
   *
   * Flujo:
   * 1. Intenta ejecutar fn()
   * 2. Si falla, verifica si es error retriable:
   *    - Deadlock (SQL error 1205)
   *    - Timeout (ETIMEOUT)
   *    - Error de conexión (ECONNRESET, ESOCKET)
   * 3. Si es retriable y quedan intentos, espera delay exponencial (5s, 10s, 15s)
   * 4. Reintenta hasta 3 veces máximo
   * 5. Si no es retriable o se agotan intentos, lanza el error
   *
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
