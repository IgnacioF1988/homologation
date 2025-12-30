/**
 * BasePipelineService - Clase base para servicios del pipeline ETL
 *
 * ARQUITECTURA EVENT-DRIVEN:
 * - Esta clase SOLO coordina ejecución de SPs
 * - EMITE eventos via PipelineEventEmitter
 * - TrackingService ESCUCHA y persiste automáticamente
 * - NO hace logging directo (eliminado 100%)
 *
 * RESPONSABILIDADES:
 * 1. Ejecutar stored procedures en transacción
 * 2. Manejar retry automático (deadlock/timeout)
 * 3. Validar XACT_STATE después de cada SP
 * 4. Emitir eventos de inicio/fin/error/stand-by
 *
 * NO RESPONSABILIDADES (delegadas a TrackingService):
 * - Persistir estados en BD
 * - Registrar logs detallados
 * - Manejar WebSocket
 * - Registrar stand-by en BD
 *
 * @module BasePipelineService
 */

const sql = require('mssql');
const pipelineEvents = require('../events/PipelineEventEmitter');

/**
 * StandByRequiredError - Error especial para stand-by
 *
 * Stand-by NO es un error - es un estado válido que requiere aprobación.
 * Este error permite distinguir pausas válidas de errores críticos.
 */
class StandByRequiredError extends Error {
  constructor(message, standByCode, spName) {
    super(message);
    this.name = 'StandByRequiredError';
    this.standByCode = standByCode;
    this.spName = spName;
    this.pausable = true;
  }
}

class BasePipelineService {
  /**
   * Constructor del servicio base
   *
   * @param {Object} serviceConfig - Configuración del servicio desde pipeline.config.yaml
   * @param {Object} pool - Pool de conexiones de SQL Server
   */
  constructor(serviceConfig, pool) {
    if (!serviceConfig || !serviceConfig.id) {
      throw new Error('serviceConfig debe incluir un ID');
    }

    this.config = serviceConfig;
    this.pool = pool;
    this.id = serviceConfig.id;
    this.name = serviceConfig.name || serviceConfig.id;
  }

  /**
   * Ejecutar el servicio para un fondo específico
   *
   * Template method: coordina flujo de ejecución y emite eventos.
   * Servicios específicos pueden sobrescribir para lógica personalizada.
   *
   * @param {Object} context - Contexto de ejecución
   * @returns {Promise<Object>} - { success: true/false, duration: ms, skipped?: boolean, error?: Error }
   */
  async execute(context) {
    const { idEjecucion, idProceso, fechaReporte, fund } = context;
    const startTime = Date.now();
    let transaction = null;

    try {
      // 1. Verificar condicional (si aplica)
      if (this.config.conditional && !this.shouldExecute(fund)) {
        pipelineEvents.emitServicioOmitido(
          idEjecucion,
          fund.ID_Fund,
          this.id,
          `Condicional: ${this.config.conditional}`
        );
        return { success: true, skipped: true, duration: 0 };
      }

      // 2. Emitir inicio
      pipelineEvents.emitServicioInicio(idEjecucion, fund.ID_Fund, this.id, {
        portfolio: fund.Portfolio_Geneva,
        fundName: fund.FundShortName,
        spCount: this.config.spList?.length || 0
      });

      // 3. Crear transacción (mantiene temp tables entre SPs)
      transaction = new sql.Transaction(this.pool);
      await transaction.begin();

      // 4. Ejecutar SPs en orden
      for (const spConfig of this.config.spList) {
        await this.executeSP(spConfig, context, transaction);
      }

      // 5. Validar estado de transacción antes de commit
      const xactStateResult = await transaction.request()
        .query('SELECT XACT_STATE() as XactState');
      const xactState = xactStateResult.recordset[0].XactState;

      if (xactState === -1) {
        // Transacción uncommittable - forzar rollback
        pipelineEvents.emitServicioError(
          idEjecucion,
          fund.ID_Fund,
          this.id,
          new Error('Transacción uncommittable (XACT_STATE=-1)'),
          'commit'
        );
        await transaction.rollback();
        throw new Error('Uncommittable transaction detected - rolled back');
      } else if (xactState === 1) {
        await transaction.commit();
      }
      // xactState === 0: no hay transacción activa (ya commiteada/rollbackeada)

      // 6. Emitir fin exitoso
      const duration = Date.now() - startTime;
      pipelineEvents.emitServicioFin(idEjecucion, fund.ID_Fund, this.id, duration, {
        spExecuted: this.config.spList?.length || 0
      });

      return { success: true, duration };

    } catch (error) {
      const duration = Date.now() - startTime;

      // Rollback si hay transacción activa
      if (transaction) {
        try {
          await transaction.rollback();
        } catch (_rollbackErr) {
          // Ignorar error de rollback
        }
      }

      // Manejar error (emite eventos apropiados)
      await this.handleError(error, context);
      return { success: false, duration, error };
    }
  }

  /**
   * Ejecutar un stored procedure dentro de una transacción
   *
   * @param {Object} spConfig - Configuración del SP
   * @param {Object} context - Contexto de ejecución
   * @param {Object} transaction - Transacción SQL activa
   * @returns {Promise<Object>} - Resultado del SP
   * @private
   */
  async executeSP(spConfig, context, transaction) {
    const { idEjecucion, fund } = context;
    const spName = spConfig.name;

    // ============================================
    // VALIDACIÓN DEFENSIVA
    // ============================================
    if (!idEjecucion || idEjecucion <= 0) {
      throw new Error(`ID_Ejecucion inválido (${idEjecucion}). Debe ser > 0.`);
    }
    if (!fund.ID_Fund || fund.ID_Fund <= 0) {
      throw new Error(`ID_Fund inválido (${fund.ID_Fund}). Debe ser > 0.`);
    }

    // ============================================
    // Normalizar fechaReporte
    // ============================================
    let fechaReporteParam = context.fechaReporte;
    if (fechaReporteParam instanceof Date) {
      const year = fechaReporteParam.getUTCFullYear();
      const month = String(fechaReporteParam.getUTCMonth() + 1).padStart(2, '0');
      const day = String(fechaReporteParam.getUTCDate()).padStart(2, '0');
      fechaReporteParam = `${year}-${month}-${day}`;
    }
    if (typeof fechaReporteParam !== 'string' || fechaReporteParam.trim() === '') {
      throw new Error(`FechaReporte inválido: ${fechaReporteParam}`);
    }

    // ============================================
    // Construir request
    // ============================================
    const request = transaction.request();

    if (spConfig.timeout) {
      request.timeout = spConfig.timeout;
    }

    // Parámetros de entrada
    request.input('ID_Ejecucion', sql.BigInt, idEjecucion);
    request.input('FechaReporte', sql.NVarChar(10), fechaReporteParam);
    request.input('ID_Fund', sql.Int, fund.ID_Fund);

    // Parámetros específicos según inputFields
    if (spConfig.inputFields) {
      spConfig.inputFields.forEach(field => {
        if (['ID_Ejecucion', 'FechaReporte', 'ID_Fund'].includes(field)) return;

        if (field === 'Portfolio_Geneva') {
          request.input('Portfolio_Geneva', sql.NVarChar(50), fund.Portfolio_Geneva);
        } else if (field === 'Portfolio_CAPM') {
          request.input('Portfolio_CAPM', sql.NVarChar(50), fund.Portfolio_CAPM);
        } else if (field === 'Portfolio_Derivados') {
          request.input('Portfolio_Derivados', sql.NVarChar(50), fund.Portfolio_Derivados);
        } else if (field === 'Portfolio_UBS') {
          request.input('Portfolio_UBS', sql.NVarChar(50), fund.Portfolio_UBS);
        } else if (field === 'Portfolio_PNL') {
          request.input('Portfolio_PNL', sql.NVarChar(50), fund.Portfolio_Geneva);
        } else if (fund[field] !== undefined) {
          request.input(field, sql.NVarChar, fund[field]);
        }
      });
    }

    // Parámetros de salida
    request.output('RowsProcessed', sql.Int);
    request.output('ErrorCount', sql.Int);

    // ============================================
    // Ejecutar con retry
    // ============================================
    const result = await this.executeWithRetry(async () => {
      return await request.execute(spName);
    }, spConfig);

    // ============================================
    // Validar XACT_STATE post-SP
    // ============================================
    const postXactState = await transaction.request()
      .query('SELECT XACT_STATE() as XactState');
    const xactState = postXactState.recordset[0].XactState;

    if (xactState === -1) {
      pipelineEvents.emitServicioError(
        idEjecucion,
        fund.ID_Fund,
        this.id,
        new Error(`${spName} caused uncommittable transaction (XACT_STATE=-1)`),
        spName
      );
      await transaction.rollback();
      throw new Error(`${spName} caused uncommittable transaction`);
    }

    // ============================================
    // Procesar returnValue
    // ============================================
    const returnValue = result.returnValue;
    const rowsProcessed = result.output.RowsProcessed || 0;
    const errorCount = result.output.ErrorCount || 0;

    // Códigos stand-by (5-8)
    if (returnValue >= 5 && returnValue <= 8) {
      const standByTypes = {
        5: 'SUCIEDADES',
        6: 'HOMOLOGACION',
        7: 'DESCUADRES_CAPM',
        8: 'DESCUADRES_GENERAL'
      };

      // Capturar recordset con datos de homologación (si existe)
      // El SP retorna: TipoHomologacion, Item, Currency, Source, Detalle
      const homologacionData = result.recordset && result.recordset.length > 0
        ? result.recordset
        : [];

      pipelineEvents.emitStandByActivado(
        idEjecucion,
        fund.ID_Fund,
        returnValue,
        this.id,
        {
          tipoProblema: standByTypes[returnValue],
          cantidad: errorCount || homologacionData.length || 1,
          puntoBloqueo: spName,
          motivo: `Stand-by activado por ${spName}`,
          homologacionData: homologacionData
        }
      );

      throw new StandByRequiredError(
        `Stand-by requerido por ${spName}`,
        returnValue,
        spName
      );
    }

    // Error crítico (código 3)
    if (returnValue === 3) {
      throw new Error(`${spName} falló críticamente (returnValue: 3)`);
    }

    // Retry (código 2)
    if (returnValue === 2) {
      throw new Error(`${spName} requiere retry (deadlock/timeout)`);
    }

    // Validaciones adicionales
    if (spConfig.validation) {
      await this.validateSPResult(spConfig, result, idEjecucion, fund.ID_Fund);
    }

    return result;
  }

  /**
   * Ejecutar función con retry automático (exponential backoff)
   * @private
   */
  async executeWithRetry(fn, spConfig) {
    const maxRetries = 3;
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;

        // Verificar si es error retriable
        const isDeadlock = error.number === 1205;
        const isTimeout = error.code === 'ETIMEOUT';
        const isConnectionError = error.code === 'ECONNRESET' || error.code === 'ESOCKET';
        const shouldRetry = isDeadlock || isTimeout || isConnectionError;

        if (shouldRetry && attempt < maxRetries) {
          const delay = 5000 * attempt; // 5s, 10s, 15s
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

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

    if (validation.checkRowCount) {
      const rowCount = result.output?.RowsProcessed ?? result.recordset?.length ?? 0;
      const minRows = validation.minRows || 0;

      if (rowCount < minRows) {
        throw new Error(`Validación falló: ${spConfig.name} retornó ${rowCount} filas, mínimo: ${minRows}`);
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

    return value === 1 || value === true || value === 'true';
  }

  /**
   * Manejo de errores centralizado
   * @private
   */
  async handleError(error, context) {
    const { idEjecucion, fund } = context;

    // Stand-by NO es error real
    if (error instanceof StandByRequiredError) {
      // Ya se emitió evento en executeSP
      return;
    }

    // Emitir evento de error
    pipelineEvents.emitServicioError(
      idEjecucion,
      fund.ID_Fund,
      this.id,
      error,
      error.spName || null
    );

    // Re-lanzar si config lo indica
    if (this.config.onError === 'STOP_FUND' || this.config.onError === 'STOP_ALL') {
      throw error;
    }
  }

  /**
   * Emitir actualización de fondo por WebSocket
   * @private
   */
  async emitFundUpdate(idEjecucion, idFund, updates) {
    try {
      const wsManager = require('../websocket/WebSocketManager');
      wsManager.emitToExecution(idEjecucion, {
        type: 'FUND_UPDATE',
        data: {
          ID_Ejecucion: idEjecucion,
          ID_Fund: idFund,
          ...updates,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (_error) {
      // No fallar pipeline si falla WebSocket
    }
  }
}

module.exports = BasePipelineService;
module.exports.StandByRequiredError = StandByRequiredError;
