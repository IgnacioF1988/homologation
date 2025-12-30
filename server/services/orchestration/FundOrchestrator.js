/**
 * FundOrchestrator - Orquestador de Ejecución del Pipeline para un Fondo
 *
 * ARQUITECTURA EVENT-DRIVEN:
 * - Coordina ejecución de servicios para UN SOLO FONDO
 * - Emite eventos via PipelineEventEmitter
 * - TrackingService escucha y persiste automáticamente
 *
 * @module FundOrchestrator
 */

const yaml = require('js-yaml');
const fs = require('fs');
const path = require('path');
const sql = require('mssql');
const pLimit = require('p-limit');
const DependencyResolver = require('./DependencyResolver');
const pipelineEvents = require('../events/PipelineEventEmitter');

class FundOrchestrator {
  /**
   * Constructor del Orquestador
   * @param {BigInt} idEjecucion - ID de la ejecución
   * @param {BigInt} idProceso - ID del proceso padre
   * @param {String} fechaReporte - Fecha a procesar (YYYY-MM-DD)
   * @param {Array} fondos - Array con 1 fondo
   * @param {Object} pool - Connection pool de SQL Server
   */
  constructor(idEjecucion, idProceso, fechaReporte, fondos, pool) {
    if (!Array.isArray(fondos) || fondos.length !== 1) {
      throw new Error('FundOrchestrator debe recibir exactamente 1 fondo.');
    }

    this.idEjecucion = idEjecucion;
    this.idProceso = idProceso;
    this.fechaReporte = fechaReporte;
    this.fondos = fondos;
    this.pool = pool;

    this.config = null;
    this.serviceInstances = new Map();
    this.executionPlan = null;
    this.dedicatedConnection = null;
  }

  /**
   * Inicializar el orquestador
   */
  async initialize() {
    // 1. Crear conexión dedicada para temp tables
    this.dedicatedConnection = await this.pool.connect();

    // 2. Cargar pipeline.config.yaml
    const configPath = path.join(__dirname, '../../config/pipeline.config.yaml');
    const configFile = fs.readFileSync(configPath, 'utf8');
    this.config = yaml.load(configFile);

    // 3. Resolver dependencias
    const resolver = new DependencyResolver(this.config.services);
    const executionOrder = resolver.getExecutionOrder();

    // 4. Construir plan de ejecución
    this.executionPlan = this._buildExecutionPlan(executionOrder);

    // 5. Instanciar servicios
    this._instantiateServices();
  }

  /**
   * Construir plan de ejecución agrupando servicios por tipo
   * @private
   */
  _buildExecutionPlan(executionOrder) {
    const phases = [];
    const serviceMap = new Map();

    this.config.services.forEach(svc => {
      serviceMap.set(svc.id, svc);
    });

    let currentPhase = null;

    executionOrder.forEach(serviceId => {
      const serviceConfig = serviceMap.get(serviceId);
      if (!serviceConfig) return;

      const execType = serviceConfig.type || serviceConfig.executionType || 'parallel';

      if (!currentPhase || currentPhase.type !== execType) {
        currentPhase = {
          type: execType,
          services: [],
          name: `${execType.toUpperCase()}_Phase_${phases.length + 1}`
        };
        phases.push(currentPhase);
      }

      currentPhase.services.push(serviceId);
    });

    return phases;
  }

  /**
   * Instanciar servicios del pipeline
   * @private
   */
  _instantiateServices() {
    const ExtractionService = require('../pipeline/ExtractionService');
    const ValidationService = require('../pipeline/ValidationService');
    const IPAService = require('../pipeline/IPAService');
    const CAPMService = require('../pipeline/CAPMService');
    const DerivadosService = require('../pipeline/DerivadosService');
    const PNLService = require('../pipeline/PNLService');
    const UBSService = require('../pipeline/UBSService');

    const serviceClasses = {
      'EXTRACCION': ExtractionService,
      'VALIDACION': ValidationService,
      'PROCESS_IPA': IPAService,
      'PROCESS_CAPM': CAPMService,
      'PROCESS_DERIVADOS': DerivadosService,
      'PROCESS_PNL': PNLService,
      'PROCESS_UBS': UBSService,
    };

    // Instanciar servicios con nuevo constructor simplificado (serviceConfig, pool)
    this.config.services.forEach(svcConfig => {
      const ServiceClass = serviceClasses[svcConfig.id];
      if (ServiceClass) {
        this.serviceInstances.set(
          svcConfig.id,
          new ServiceClass(svcConfig, this.dedicatedConnection)
        );
      }
    });
  }

  /**
   * Ejecutar fases BATCH una vez
   */
  async _executeBatchPhasesOnce() {
    for (const phase of this.executionPlan) {
      if (phase.type === 'batch') {
        await this._executeBatchPhase(phase);
      }
    }
  }

  /**
   * Ejecutar el pipeline completo (batch/parallel/sequential)
   */
  async execute() {
    const fund = this.fondos[0];

    try {
      pipelineEvents.emitEjecucionInicio(this.idEjecucion, fund.ID_Fund, fund.FundShortName);

      for (const phase of this.executionPlan) {
        if (phase.type === 'batch') {
          await this._executeBatchPhase(phase, fund);
        } else if (phase.type === 'parallel') {
          await this._executeParallelPhase(phase);
        } else if (phase.type === 'sequential') {
          await this._executeSequentialPhase(phase);
        }
      }

      pipelineEvents.emitEjecucionFin(this.idEjecucion, fund.ID_Fund, 'OK', 0);
      return { success: true, idEjecucion: this.idEjecucion };

    } catch (error) {
      pipelineEvents.emitEjecucionFin(this.idEjecucion, fund.ID_Fund, 'ERROR', 0);
      throw error;
    }
  }

  /**
   * Cerrar conexión dedicada
   */
  async close() {
    if (this.dedicatedConnection) {
      try {
        await this.dedicatedConnection.close();
      } catch (_e) {}
      this.dedicatedConnection = null;
    }
  }

  /**
   * Ejecutar fase BATCH
   * @private
   */
  async _executeBatchPhase(phase, fund) {
    for (const serviceId of phase.services) {
      const service = this.serviceInstances.get(serviceId);
      if (!service) continue;

      const context = {
        idEjecucion: this.idEjecucion,
        idProceso: this.idProceso,
        fechaReporte: this.fechaReporte,
        fund: fund
      };

      await service.execute(context);
    }
  }

  /**
   * Etiquetar datos extraídos con ID_Ejecucion
   */
  async _tagExtractionData() {
    await this.pool.request()
      .input('ID_Proceso', sql.BigInt, this.idProceso)
      .input('FechaReporte', sql.NVarChar(10), this.fechaReporte)
      .execute('extract.Tag_Extraction_Data');
  }

  /**
   * Ejecutar fase PARALLEL
   * @private
   */
  async _executeParallelPhase(phase) {
    const concurrencyLimit = Math.min(this.fondos.length, 50);
    const limit = pLimit(concurrencyLimit);

    const promises = this.fondos.map(fund =>
      limit(() => this._executeFundServices(fund, phase.services))
    );

    await Promise.all(promises);
  }

  /**
   * Verificar si fondo debe ser excluido
   * @private
   */
  async _shouldExecuteFund(fund, fechaReporte) {
    try {
      const result = await this.pool.request()
        .input('FechaReporte', sql.NVarChar(10), fechaReporte)
        .input('ID_Fund', sql.Int, fund.ID_Fund)
        .query(`
          SELECT Proceso, Tipo_Problema
          FROM sandbox.Fondos_Problema
          WHERE FechaReporte = @FechaReporte AND ID_Fund = @ID_Fund
        `);

      if (result.recordset.length > 0) {
        pipelineEvents.emitServicioOmitido(this.idEjecucion, fund.ID_Fund, 'PIPELINE', 'Fondo en Fondos_Problema');
        return false;
      }

      return true;
    } catch (_error) {
      return true; // Fail-safe
    }
  }

  /**
   * Verificar stand-by
   * @private
   */
  async _checkFundStandByStatus(fund, serviceId) {
    try {
      const result = await this.pool.request()
        .input('ID_Ejecucion', sql.BigInt, this.idEjecucion)
        .input('ID_Fund', sql.Int, fund.ID_Fund)
        .query(`
          SELECT EstadoStandBy, PuntoBloqueoActual
          FROM logs.Ejecucion_Fondos
          WHERE ID_Ejecucion = @ID_Ejecucion AND ID_Fund = @ID_Fund
        `);

      if (!result.recordset[0] || result.recordset[0].EstadoStandBy !== 'PAUSADO') {
        return { isPaused: false };
      }

      const estado = result.recordset[0];
      const puntosBloqueo = {
        'ANTES_CAPM': ['PROCESS_CAPM', 'PROCESS_PNL', 'PROCESS_UBS'],
        'MID_IPA': ['PROCESS_CAPM', 'PROCESS_PNL', 'PROCESS_UBS', 'PROCESS_DERIVADOS'],
        'ANTES_PNL': ['PROCESS_PNL'],
        'MID_CAPM': ['PROCESS_PNL'],
      };

      const serviciosBloqueados = puntosBloqueo[estado.PuntoBloqueoActual] || [];

      if (serviciosBloqueados.includes(serviceId)) {
        return { isPaused: true, puntoBloqueo: estado.PuntoBloqueoActual };
      }

      return { isPaused: false };
    } catch (_error) {
      return { isPaused: false };
    }
  }

  /**
   * Ejecutar servicios para un fondo
   * @private
   */
  async _executeFundServices(fund, serviceIds) {
    let fundProcessedOK = true;

    try {
      const shouldExecute = await this._shouldExecuteFund(fund, this.fechaReporte);
      if (!shouldExecute) return;

      for (const serviceId of serviceIds) {
        const service = this.serviceInstances.get(serviceId);
        if (!service) continue;

        // Verificar stand-by
        const standByStatus = await this._checkFundStandByStatus(fund, serviceId);
        if (standByStatus.isPaused) {
          pipelineEvents.emitServicioOmitido(this.idEjecucion, fund.ID_Fund, serviceId, 'Stand-by activo');
          fundProcessedOK = false;
          break;
        }

        // Verificar condicional
        if (service.config.conditional && !this._shouldExecute(fund, service.config.conditional)) {
          continue;
        }

        const context = {
          idEjecucion: this.idEjecucion,
          idProceso: this.idProceso,
          fechaReporte: this.fechaReporte,
          fund
        };

        try {
          const result = await service.execute(context);
          if (!result.success) {
            await this._handleServiceError(service, fund, result.error);
            fundProcessedOK = false;
          }
        } catch (error) {
          await this._handleServiceError(service, fund, error);
          fundProcessedOK = false;
        }
      }

      // Consolidar a CUBO si OK
      if (fundProcessedOK) {
        await this._consolidateFundToCubo(fund);
      }

    } catch (_error) {
      // Error ya manejado
    }
  }

  /**
   * Consolidar fondo a CUBO_Final
   * @private
   */
  async _consolidateFundToCubo(fund) {
    try {
      const request = this.dedicatedConnection.request();
      request.input('ID_Ejecucion', sql.BigInt, this.idEjecucion);
      request.input('ID_Fund', sql.Int, fund.ID_Fund);
      request.input('ID_Proceso', sql.BigInt, this.idProceso);
      request.input('FechaReporte', sql.NVarChar(10), this.fechaReporte);
      request.input('Debug', sql.Bit, 0);

      await request.execute('staging.Consolidar_Fondo_A_Cubo_v3');
    } catch (error) {
      pipelineEvents.emitServicioError(this.idEjecucion, fund.ID_Fund, 'CONSOLIDAR_CUBO', error);
    }
  }

  /**
   * Ejecutar fase SEQUENTIAL
   * @private
   */
  async _executeSequentialPhase(phase) {
    for (const serviceId of phase.services) {
      const service = this.serviceInstances.get(serviceId);
      if (!service) continue;

      const context = {
        idEjecucion: this.idEjecucion,
        fechaReporte: this.fechaReporte,
        fund: null
      };

      await service.execute(context);
    }
  }

  /**
   * Evaluar condicional
   * @private
   */
  _shouldExecute(fund, conditional) {
    if (conditional === 'Flag_UBS') return fund.Flag_UBS === 1;
    if (conditional === 'Flag_Derivados') return fund.Flag_Derivados === 1;
    if (conditional === 'Requiere_Derivados') return fund.Requiere_Derivados === 1;
    return true;
  }

  /**
   * Manejar error de servicio
   * @private
   */
  async _handleServiceError(service, fund, error) {
    const onError = service.config.onError || 'STOP_ALL';
    const policy = onError === 'LOG_WARNING' ? 'CONTINUE' : onError;

    // NOTA: No emitir error aquí - ya fue emitido por BasePipelineService.handleError()

    if (policy === 'STOP_ALL') {
      throw error;
    }
    // STOP_FUND y CONTINUE: no lanzar error
  }
}

module.exports = FundOrchestrator;
