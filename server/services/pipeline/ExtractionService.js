/**
 * ExtractionService - Servicio de extracción de datos del pipeline
 *
 * Ejecuta stored procedures de extracción en modo batch o parallel.
 * NO extiende BasePipelineService (patrón diferente para extracción).
 *
 * MODO BATCH: Procesa TODOS los fondos en una sola ejecución
 * MODO PARALLEL: Procesa UN fondo a la vez
 *
 * @module ExtractionService
 */

const sql = require('mssql');
const pLimit = require('p-limit');
const pipelineEvents = require('../events/PipelineEventEmitter');

class ExtractionService {
  // Tracker estático para evitar ejecución duplicada de servicios batch
  static batchExecutionTracker = new Map();

  /**
   * Constructor
   * @param {Object} serviceConfig - Configuración desde pipeline.config.yaml
   * @param {Object} pool - Pool de conexiones SQL Server
   */
  constructor(serviceConfig, pool) {
    this.config = serviceConfig;
    this.pool = pool;
    this.id = serviceConfig.id;
    this.name = serviceConfig.name || serviceConfig.id;
  }

  /**
   * Ejecutar servicio de extracción
   */
  async execute(context) {
    const { idEjecucion, idProceso, fechaReporte, fund } = context;

    // MODO BATCH: Procesa todos los fondos a la vez, pero emite eventos por fondo
    if (this.config.type === 'batch') {
      const batchKey = `${idProceso}_${this.id}`;
      const startTime = Date.now();

      // Emitir inicio para ESTE fondo
      pipelineEvents.emitServicioInicio(idEjecucion, fund.ID_Fund, this.id, {
        portfolio: fund.Portfolio_Geneva,
        fundName: fund.FundShortName,
        mode: 'batch'
      });

      // Ejecutar batch solo una vez (el primero ejecuta, los demás esperan)
      if (!ExtractionService.batchExecutionTracker.has(batchKey)) {
        const executionPromise = this._executeBatchMode(idProceso, fechaReporte);
        ExtractionService.batchExecutionTracker.set(batchKey, executionPromise);

        // Limpiar tracker después de 5 minutos
        setTimeout(() => {
          ExtractionService.batchExecutionTracker.delete(batchKey);
        }, 300000);
      }

      const result = await ExtractionService.batchExecutionTracker.get(batchKey);
      const duration = Date.now() - startTime;

      // Emitir fin para ESTE fondo
      if (result.success) {
        pipelineEvents.emitServicioFin(idEjecucion, fund.ID_Fund, this.id, duration, {
          mode: 'batch',
          extractedSources: result.extractedSources?.length || 0
        });
      } else {
        pipelineEvents.emitServicioError(idEjecucion, fund.ID_Fund, this.id, result.error || new Error('Batch extraction failed'));
      }

      return result;
    }

    // MODO PARALLEL: Procesa un fondo a la vez
    const startTime = Date.now();

    try {
      pipelineEvents.emitServicioInicio(idEjecucion, fund.ID_Fund, this.id, {
        portfolio: fund.Portfolio_Geneva,
        fundName: fund.FundShortName
      });

      const spsByOrder = this._groupSPsByOrder();
      const extractedSources = [];

      for (const [_order, sps] of spsByOrder.entries()) {
        const results = await this._executeParallelSPs(sps, idProceso, idEjecucion, fechaReporte, fund);
        extractedSources.push(...results);
      }

      const duration = Date.now() - startTime;
      pipelineEvents.emitServicioFin(idEjecucion, fund.ID_Fund, this.id, duration, {
        extractedSources: extractedSources.length
      });

      return { success: true, duration, extractedSources };

    } catch (error) {
      const duration = Date.now() - startTime;
      pipelineEvents.emitServicioError(idEjecucion, fund.ID_Fund, this.id, error);
      return { success: false, duration, error };
    }
  }

  /**
   * Agrupar extractores por orden de ejecución
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

    return new Map([...spsByOrder.entries()].sort((a, b) => a[0] - b[0]));
  }

  /**
   * Ejecutar múltiples extractores en paralelo
   * @private
   */
  async _executeParallelSPs(sps, idProceso, idEjecucion, fechaReporte, fund) {
    const limit = pLimit(2);

    const promises = sps.map(spConfig =>
      limit(() => this._executeSP(spConfig, idProceso, idEjecucion, fechaReporte, fund))
    );

    return await Promise.all(promises);
  }

  /**
   * Ejecutar un stored procedure de extracción
   * @private
   */
  async _executeSP(spConfig, idProceso, idEjecucion, fechaReporte, fund) {
    const spName = spConfig.name;

    try {
      const isUBSExtractor = spName.includes('UBS');
      const portfolio = isUBSExtractor ? fund.Portfolio_UBS : fund.Portfolio_Geneva;

      const request = this.pool.request();

      if (spConfig.timeout) {
        request.timeout = spConfig.timeout;
      }

      request.input('FechaReporte', sql.NVarChar(10), fechaReporte);
      request.input('ID_Proceso', sql.BigInt, idProceso);
      request.input('ID_Ejecucion', sql.BigInt, idEjecucion);
      request.input('ID_Fund', sql.Int, fund.ID_Fund);
      request.input('Portfolio', sql.NVarChar(100), portfolio);

      const result = await this._executeWithRetry(async () => {
        return await request.execute(spName);
      }, spConfig);

      const returnValue = result.returnValue;

      if (returnValue === 3) {
        throw new Error(`${spName} falló críticamente (returnValue: 3)`);
      }

      if (returnValue === 2) {
        throw new Error(`${spName} error recuperable (returnValue: 2)`);
      }

      return {
        source: spName,
        returnValue,
        success: returnValue === 0 || returnValue === 1
      };

    } catch (error) {
      throw error;
    }
  }

  /**
   * Ejecutar función con retry automático
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

        const isDeadlock = error.number === 1205;
        const isTimeout = error.code === 'ETIMEOUT';
        const isConnectionError = error.code === 'ECONNRESET' || error.code === 'ESOCKET';
        const shouldRetry = isDeadlock || isTimeout || isConnectionError;

        if (shouldRetry && attempt < maxRetries) {
          const delay = 5000 * attempt;
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        throw error;
      }
    }

    throw lastError;
  }

  /**
   * Ejecutar servicio en modo BATCH
   * @private
   */
  async _executeBatchMode(idProceso, fechaReporte) {
    const startTime = Date.now();

    try {
      pipelineEvents.emitProcesoInicio(idProceso, fechaReporte, 0, 'batch');

      const spsByOrder = this._groupSPsByOrder();
      const extractedSources = [];

      for (const [_order, sps] of spsByOrder.entries()) {
        for (const spConfig of sps) {
          const result = await this._executeBatchSP(spConfig, idProceso, fechaReporte);
          extractedSources.push(result);
        }
      }

      const duration = Date.now() - startTime;

      return {
        success: true,
        duration,
        mode: 'batch',
        extractedSources
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      return {
        success: false,
        duration,
        mode: 'batch',
        error
      };
    }
  }

  /**
   * Ejecutar un stored procedure en modo BATCH
   * @private
   */
  async _executeBatchSP(spConfig, idProceso, fechaReporte) {
    const spName = spConfig.name;

    try {
      const request = this.pool.request();

      if (spConfig.timeout) {
        request.timeout = spConfig.timeout;
      }

      request.input('ID_Proceso', sql.BigInt, idProceso);
      request.input('FechaReporte', sql.NVarChar(10), fechaReporte);

      const result = await this._executeWithRetry(async () => {
        return await request.execute(spName);
      }, spConfig);

      const returnValue = result.returnValue;

      if (returnValue === 3) {
        throw new Error(`${spName} falló críticamente (returnValue: 3)`);
      }

      if (returnValue === 2) {
        throw new Error(`${spName} error recuperable (returnValue: 2)`);
      }

      return {
        source: spName,
        returnValue,
        success: returnValue === 0 || returnValue === 1
      };

    } catch (error) {
      throw error;
    }
  }
}

module.exports = ExtractionService;
