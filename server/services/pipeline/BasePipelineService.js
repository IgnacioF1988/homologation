/**
 * BasePipelineService - Clase Base para Servicios del Pipeline
 *
 * Proporciona funcionalidad común para todos los servicios del pipeline:
 * - Ejecución de SPs con manejo de errores
 * - Logging estructurado
 * - Validaciones
 * - Tracking de estado
 * - Retry logic con exponential backoff
 *
 * Servicios específicos (IPAService, CAPMService, etc.) heredan de esta clase
 * y pueden sobrescribir métodos según necesidad.
 *
 * Uso:
 * ```javascript
 * class IPAService extends BasePipelineService {
 *   async execute(context) {
 *     // Lógica específica de IPA
 *   }
 * }
 * ```
 */

const sql = require('mssql');

class BasePipelineService {
  /**
   * Constructor
   * @param {Object} serviceConfig - Configuración del servicio desde pipeline.config.yaml
   * @param {Object} pool - Connection pool de SQL Server
   * @param {Object} tracker - ExecutionTracker para actualizar estados
   * @param {Object} logger - LoggingService para registrar eventos
   */
  constructor(serviceConfig, pool, tracker, logger) {
    if (!serviceConfig || !serviceConfig.id) {
      throw new Error('serviceConfig debe incluir un ID');
    }

    this.config = serviceConfig;
    this.pool = pool;
    this.tracker = tracker;
    this.logger = logger;
    this.id = serviceConfig.id;
    this.name = serviceConfig.name || serviceConfig.id;
  }

  /**
   * Ejecutar el servicio para un fondo específico
   *
   * Template method pattern: Este método coordina el flujo general.
   * Servicios específicos pueden sobrescribir para custom logic.
   *
   * @param {Object} context - Contexto de ejecución
   * @param {BigInt} context.idEjecucion - ID de la ejecución
   * @param {String} context.fechaReporte - Fecha a procesar (YYYY-MM-DD)
   * @param {Object} context.fund - Información del fondo
   * @param {Number} context.fund.ID_Fund - ID numérico del fondo
   * @param {String} context.fund.FundShortName - Nombre corto del fondo
   * @param {String} context.fund.Portfolio_Geneva - Portfolio code (puede variar por fuente)
   * @returns {Promise<Object>} - { success, duration, metrics, skipped }
   */
  async execute(context) {
    const { idEjecucion, fechaReporte, fund } = context;
    const startTime = Date.now();

    // IMPORTANTE: Usar una Transaction para mantener temp tables entre SPs
    // (las transacciones mantienen el mismo contexto de sesión para temp tables)
    let transaction = null;

    try {
      // 1. Verificar condicional (si aplica)
      if (this.config.conditional && !this.shouldExecute(fund)) {
        await this.logInfo(idEjecucion, fund.ID_Fund, `Servicio omitido (condicional: ${this.config.conditional})`);
        await this.updateState(idEjecucion, fund.ID_Fund, 'N/A');
        return { success: true, skipped: true, duration: 0 };
      }

      // 2. Marcar inicio
      await this.updateState(idEjecucion, fund.ID_Fund, 'EN_PROGRESO');
      await this.logInfo(idEjecucion, fund.ID_Fund, `Iniciando ${this.name}`);

      // 3. Crear e iniciar una transacción (mantiene temp tables entre SPs)
      transaction = new sql.Transaction(this.pool);
      await transaction.begin();

      // 4. Ejecutar SPs en orden usando la misma transacción
      for (const spConfig of this.config.spList) {
        await this.executeSP(spConfig, context, transaction);
      }

      // 5. Validar estado de transacción antes de commit
      // XACT_STATE() retorna:
      //   1  = Transacción activa y committable (proceder con commit)
      //   0  = No hay transacción activa
      //  -1  = Transacción uncommittable (DEBE hacer rollback, commit fallará)
      const xactStateResult = await transaction.request()
        .query('SELECT XACT_STATE() as XactState');

      const xactState = xactStateResult.recordset[0].XactState;

      if (xactState === -1) {
        // Transacción uncommittable - forzar rollback
        await this.logError(idEjecucion, fund.ID_Fund,
          `Transacción uncommittable detectada (XACT_STATE = -1). Ejecutando rollback...`);
        await transaction.rollback();
        throw new Error('Uncommittable transaction detected - transaction rolled back');
      } else if (xactState === 1) {
        // Transacción activa y committable - proceder con commit
        await transaction.commit();
      } else if (xactState === 0) {
        // No hay transacción activa
        await this.logWarning(idEjecucion, fund.ID_Fund,
          'No hay transacción activa al intentar commit');
      }

      // 6. Actualizar estado exitoso
      const duration = Date.now() - startTime;
      await this.updateState(idEjecucion, fund.ID_Fund, 'OK');
      await this.logInfo(idEjecucion, fund.ID_Fund, `${this.name} completado en ${duration}ms`);

      return { success: true, duration };

    } catch (error) {
      const duration = Date.now() - startTime;

      // Rollback de la transacción si hay error
      if (transaction) {
        try {
          await transaction.rollback();
        } catch (rollbackErr) {
          console.warn('[BasePipelineService] Error en rollback:', rollbackErr.message);
        }
      }

      await this.handleError(error, context);
      return { success: false, duration, error };
    }
  }

  /**
   * Ejecutar un stored procedure específico
   *
   * @param {Object} spConfig - Configuración del SP desde pipeline.config.yaml
   * @param {Object} context - Contexto de ejecución
   * @param {Object} transaction - Transacción de SQL Server (para mantener temp tables)
   * @returns {Promise<Object>} - Resultado del SP
   * @private
   */
  async executeSP(spConfig, context, transaction) {
    const { idEjecucion, fechaReporte, fund } = context;
    const spName = spConfig.name;

    // Log inicio
    await this.logDebug(idEjecucion, fund.ID_Fund, `Ejecutando ${spName}...`);

    // Construir request usando la transacción (mantiene temp tables)
    const request = transaction.request();

    // Configurar timeout
    if (spConfig.timeout) {
      request.timeout = spConfig.timeout;
    }

    // Agregar parámetros de entrada
    request.input('ID_Ejecucion', sql.BigInt, idEjecucion);
    request.input('FechaReporte', sql.NVarChar(10), fechaReporte);
    // ID_Fund viene como INT desde logs.Ejecucion_Fondos (después de migración SQL)
    request.input('ID_Fund', sql.Int, fund.ID_Fund);

    // Agregar parámetros específicos según inputFields
    if (spConfig.inputFields) {
      spConfig.inputFields.forEach(field => {
        // Saltar parámetros que ya se agregaron arriba
        if (field === 'ID_Ejecucion' || field === 'FechaReporte' || field === 'ID_Fund') {
          return; // Skip - ya agregado
        }

        if (field === 'Portfolio_Geneva') {
          request.input('Portfolio_Geneva', sql.NVarChar(50), fund.Portfolio_Geneva);
        } else if (field === 'Portfolio_CAPM') {
          request.input('Portfolio_CAPM', sql.NVarChar(50), fund.Portfolio_CAPM);
        } else if (field === 'Portfolio_Derivados') {
          request.input('Portfolio_Derivados', sql.NVarChar(50), fund.Portfolio_Derivados);
        } else if (field === 'Portfolio_UBS') {
          request.input('Portfolio_UBS', sql.NVarChar(50), fund.Portfolio_UBS);
        } else if (field === 'Portfolio_PNL') {
          // PNL usa Portfolio_Geneva (no hay campo Portfolio_PNL en BD)
          request.input('Portfolio_PNL', sql.NVarChar(50), fund.Portfolio_Geneva);
        } else if (fund[field] !== undefined) {
          // Campo dinámico del fondo
          request.input(field, sql.NVarChar, fund[field]);
        }
      });
    }

    // Parámetros de salida (OUTPUT)
    request.output('RowsProcessed', sql.Int);
    request.output('ErrorCount', sql.Int);

    // Ejecutar SP con retry logic
    const result = await this.executeWithRetry(async () => {
      return await request.execute(spName);
    }, spConfig);

    // Procesar resultado
    const returnValue = result.returnValue;
    const rowsProcessed = result.output.RowsProcessed || 0;
    const errorCount = result.output.ErrorCount || 0;

    // Log resultado
    await this.logInfo(
      idEjecucion,
      fund.ID_Fund,
      `${spName} completado - ReturnValue: ${returnValue}, Filas: ${rowsProcessed}, Errores: ${errorCount}`
    );

    // Validar resultado según returnValue
    // 0 = éxito, 1 = warning, 2 = retry, 3 = crítico
    if (returnValue === 3) {
      throw new Error(`${spName} falló críticamente (returnValue: 3)`);
    }

    if (returnValue === 2) {
      throw new Error(`${spName} error recuperable (returnValue: 2)`);
    }

    if (returnValue === 1) {
      await this.logWarning(idEjecucion, fund.ID_Fund, `${spName} completó con warnings`);
    }

    // Validaciones adicionales
    if (spConfig.validation) {
      await this.validateSPResult(spConfig, result, idEjecucion, fund.ID_Fund);
    }

    // Actualizar sub-estado si aplica
    if (spConfig.tracking?.subStateField) {
      await this.updateSubState(idEjecucion, fund.ID_Fund, spConfig.tracking.subStateField, 'OK');
    }

    return result;
  }

  /**
   * Ejecutar función con retry logic (exponential backoff)
   *
   * @param {Function} fn - Función async a ejecutar
   * @param {Object} spConfig - Configuración del SP (para retry settings)
   * @returns {Promise} - Resultado de la función
   * @private
   */
  async executeWithRetry(fn, spConfig) {
    const maxRetries = 3; // De pipeline.config.yaml global.retryAttempts
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
            `[${this.id}] Error retriable en intento ${attempt}/${maxRetries}. ` +
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

  /**
   * Validar resultado de SP según configuración
   * @private
   */
  async validateSPResult(spConfig, result, idEjecucion, idFund) {
    const validation = spConfig.validation;

    // Validar row count
    if (validation.checkRowCount) {
      // Intentar obtener row count de OUTPUT param primero, luego de recordset
      const rowCount = result.output?.RowsProcessed ?? result.recordset?.length ?? 0;
      const minRows = validation.minRows || 0;

      if (rowCount < minRows) {
        await this.logError(
          idEjecucion,
          idFund,
          `Validación falló: ${spConfig.name} retornó ${rowCount} filas, mínimo esperado: ${minRows}`
        );
        throw new Error(`Validación de row count falló para ${spConfig.name}`);
      }
    }
  }

  /**
   * Evaluar si debe ejecutarse según condicional
   * @private
   */
  shouldExecute(fund) {
    if (!this.config.conditional) return true;

    const conditionalField = this.config.conditional;
    const value = fund[conditionalField];

    // Evaluar como boolean
    return value === 1 || value === true || value === 'true';
  }

  /**
   * Actualizar estado del servicio para un fondo
   * @private
   */
  async updateState(idEjecucion, idFund, estado) {
    if (!this.config.tracking?.stateField) return;

    await this.tracker.updateFundState(
      idEjecucion,
      idFund,
      this.config.tracking.stateField,
      estado
    );
  }

  /**
   * Actualizar sub-estado (para pasos internos como IPA_01, IPA_02, etc.)
   * @private
   */
  async updateSubState(idEjecucion, idFund, subStateField, estado) {
    await this.tracker.updateFundState(idEjecucion, idFund, subStateField, estado);
  }

  /**
   * Manejo de errores centralizado
   * @private
   */
  async handleError(error, context) {
    const { idEjecucion, fund } = context;

    await this.logError(idEjecucion, fund.ID_Fund, `Error en ${this.name}: ${error.message}`);
    await this.updateState(idEjecucion, fund.ID_Fund, 'ERROR', error.message);

    // Actualizar campo de error si está configurado
    if (this.config.tracking?.errorField) {
      await this.tracker.updateFundErrorStep(idEjecucion, fund.ID_Fund, this.id, error.message);
    }

    // Decidir si re-lanzar según onError config
    if (this.config.onError === 'STOP_FUND' || this.config.onError === 'STOP_ALL') {
      throw error; // Re-lanzar para detener procesamiento
    }

    // Si es CONTINUE o LOG_WARNING, no re-lanzar (error manejado)
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

  async logDebug(idEjecucion, idFund, mensaje) {
    // Solo logear si nivel es DEBUG
    if (this.logger.level === 'DEBUG') {
      await this.logger.log(idEjecucion, idFund, 'DEBUG', this.id, mensaje);
    }
  }
}

module.exports = BasePipelineService;
