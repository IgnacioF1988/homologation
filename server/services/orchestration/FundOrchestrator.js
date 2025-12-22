/**
 * FundOrchestrator - Orquestador de Ejecución del Pipeline V2
 *
 * Responsable de coordinar la ejecución de todos los servicios del pipeline
 * para múltiples fondos en paralelo, respetando dependencias y políticas de error.
 *
 * Características:
 * - Resolución de dependencias usando Kahn's algorithm
 * - Concurrencia adaptativa (100 fondos si >100, full parallel si <100)
 * - Manejo de políticas de error (STOP_ALL, STOP_FUND, CONTINUE)
 * - Integración con ExecutionTracker y LoggingService
 *
 * @author Claude Code - Pipeline V2 Migration
 * @date 2025-12-22
 */

const yaml = require('js-yaml');
const fs = require('fs');
const path = require('path');
const pLimit = require('p-limit');
const DependencyResolver = require('./DependencyResolver');

class FundOrchestrator {
  /**
   * Constructor del Orquestador
   *
   * @param {BigInt} idEjecucion - ID de la ejecución en logs.Ejecuciones
   * @param {String} fechaReporte - Fecha a procesar (YYYY-MM-DD)
   * @param {Array} fondos - Array de fondos [{ID_Fund: INT, Portfolio_Geneva, ...}]
   * @param {Object} pool - Connection pool de SQL Server
   * @param {Object} tracker - ExecutionTracker para actualizar estados
   * @param {Object} logger - LoggingService para registrar eventos
   */
  constructor(idEjecucion, fechaReporte, fondos, pool, tracker, logger) {
    this.idEjecucion = idEjecucion;
    this.fechaReporte = fechaReporte;
    this.fondos = fondos; // Array de {ID_Fund: INT, Portfolio_Geneva: string, ...}
    this.pool = pool;
    this.tracker = tracker;
    this.logger = logger;

    this.config = null; // pipeline.config.yaml
    this.serviceInstances = new Map();
    this.executionPlan = null; // Array de phases [{services, type, name}]
  }

  /**
   * Inicializar el orquestador
   * - Cargar pipeline.config.yaml
   * - Resolver dependencias entre servicios
   * - Instanciar servicios (IPAService, CAPMService, etc.)
   */
  async initialize() {
    console.log(`[FundOrchestrator ${this.idEjecucion}] Inicializando...`);

    // 1. Cargar pipeline.config.yaml
    const configPath = path.join(__dirname, '../../config/pipeline.config.yaml');
    const configFile = fs.readFileSync(configPath, 'utf8');
    this.config = yaml.load(configFile);

    console.log(`[FundOrchestrator ${this.idEjecucion}] Config cargado: ${this.config.services.length} servicios`);

    // 2. Resolver dependencias usando DependencyResolver
    const resolver = new DependencyResolver(this.config.services);
    this.executionPlan = resolver.resolve(); // [{phase, services, type, name}]

    console.log(`[FundOrchestrator ${this.idEjecucion}] Plan de ejecución: ${this.executionPlan.length} fases`);

    // 3. Instanciar servicios (IPAService, CAPMService, etc.)
    this._instantiateServices();

    console.log(`[FundOrchestrator ${this.idEjecucion}] Inicializado con ${this.fondos.length} fondos`);
  }

  /**
   * Instanciar servicios del pipeline
   * - Importa clases de servicios (IPAService, CAPMService, etc.)
   * - Crea instancias con configuración específica
   * - Almacena en serviceInstances Map
   *
   * @private
   */
  _instantiateServices() {
    // Importar servicios dinámicamente
    const IPAService = require('../pipeline/IPAService');
    const CAPMService = require('../pipeline/CAPMService');
    const DerivadosService = require('../pipeline/DerivadosService');
    const PNLService = require('../pipeline/PNLService');
    const UBSService = require('../pipeline/UBSService');

    // Mapear service IDs a clases
    const serviceClasses = {
      'IPA': IPAService,
      'CAPM': CAPMService,
      'Derivados': DerivadosService,
      'PNL': PNLService,
      'UBS': UBSService,
      // Agregar otros servicios según necesidad
    };

    // Instanciar cada servicio con su config
    this.config.services.forEach(svcConfig => {
      const ServiceClass = serviceClasses[svcConfig.id];
      if (ServiceClass) {
        this.serviceInstances.set(
          svcConfig.id,
          new ServiceClass(svcConfig, this.pool, this.tracker, this.logger)
        );
        console.log(`[FundOrchestrator ${this.idEjecucion}] Servicio instanciado: ${svcConfig.id}`);
      } else {
        console.warn(`[FundOrchestrator ${this.idEjecucion}] Servicio no encontrado: ${svcConfig.id}`);
      }
    });
  }

  /**
   * Ejecutar el pipeline completo
   * - Itera por cada fase del execution plan
   * - Ejecuta servicios según tipo (batch, parallel, sequential)
   * - Maneja errores según políticas configuradas
   *
   * @returns {Promise<Object>} - { success, idEjecucion }
   */
  async execute() {
    console.log(`[FundOrchestrator ${this.idEjecucion}] Iniciando ejecución del pipeline...`);

    try {
      for (const phase of this.executionPlan) {
        console.log(`[FundOrchestrator ${this.idEjecucion}] Fase: ${phase.name}, Tipo: ${phase.type}`);

        if (phase.type === 'batch') {
          await this._executeBatchPhase(phase);
        } else if (phase.type === 'parallel') {
          await this._executeParallelPhase(phase);
        } else if (phase.type === 'sequential') {
          await this._executeSequentialPhase(phase);
        }
      }

      console.log(`[FundOrchestrator ${this.idEjecucion}] Ejecución completada exitosamente`);
      return { success: true, idEjecucion: this.idEjecucion };

    } catch (error) {
      console.error(`[FundOrchestrator ${this.idEjecucion}] Error en ejecución:`, error);
      throw error;
    }
  }

  /**
   * Ejecutar fase BATCH
   * - Se ejecuta 1 vez por fecha (no por fondo)
   * - Ejemplo: Extracción de datos (Extract_IPA, Extract_CAPM, etc.)
   *
   * @param {Object} phase - Fase con servicios batch
   * @private
   */
  async _executeBatchPhase(phase) {
    for (const serviceId of phase.services) {
      const service = this.serviceInstances.get(serviceId);
      if (!service) {
        console.warn(`[FundOrchestrator ${this.idEjecucion}] Servicio batch no encontrado: ${serviceId}`);
        continue;
      }

      const context = {
        idEjecucion: this.idEjecucion,
        fechaReporte: this.fechaReporte,
        fund: null // batch no tiene fondo específico
      };

      console.log(`[FundOrchestrator ${this.idEjecucion}] Ejecutando batch: ${service.name}`);
      await service.execute(context);
    }
  }

  /**
   * Ejecutar fase PARALLEL
   * - Se ejecuta por cada fondo en paralelo
   * - Concurrencia adaptativa:
   *   - Si fondos > 100: batches de 100
   *   - Si fondos <= 100: full parallel
   * - Ejemplo: Process_IPA, Process_CAPM, Process_Derivados
   *
   * @param {Object} phase - Fase con servicios parallel
   * @private
   */
  async _executeParallelPhase(phase) {
    // Concurrencia adaptativa
    const concurrencyLimit = this.fondos.length > 100 ? 100 : this.fondos.length;
    const limit = pLimit(concurrencyLimit);

    console.log(`[FundOrchestrator ${this.idEjecucion}] Concurrencia: ${concurrencyLimit} fondos en paralelo`);

    const promises = this.fondos.map(fund =>
      limit(() => this._executeFundServices(fund, phase.services))
    );

    await Promise.all(promises);
  }

  /**
   * Ejecutar servicios para un fondo específico
   * - Verifica condicionales (Flag_UBS, Flag_Derivados)
   * - Ejecuta servicios en orden
   * - Maneja errores según política (STOP_ALL, STOP_FUND, CONTINUE)
   *
   * @param {Object} fund - Fondo a procesar
   * @param {Array} serviceIds - IDs de servicios a ejecutar
   * @private
   */
  async _executeFundServices(fund, serviceIds) {
    for (const serviceId of serviceIds) {
      const service = this.serviceInstances.get(serviceId);
      if (!service) {
        console.warn(`[FundOrchestrator ${this.idEjecucion}] Servicio no encontrado: ${serviceId} (Fondo ${fund.ID_Fund})`);
        continue;
      }

      // Verificar condicional (ej: Flag_UBS, Flag_Derivados)
      if (service.config.conditional && !this._shouldExecute(fund, service.config.conditional)) {
        console.log(`[FundOrchestrator ${this.idEjecucion}] Servicio omitido (condicional): ${service.name} (Fondo ${fund.ID_Fund})`);
        continue; // Skip este servicio para este fondo
      }

      const context = {
        idEjecucion: this.idEjecucion,
        fechaReporte: this.fechaReporte,
        fund
      };

      try {
        const result = await service.execute(context);

        if (!result.success) {
          // Manejar error según política
          await this._handleServiceError(service, fund, result.error);
        }
      } catch (error) {
        await this._handleServiceError(service, fund, error);
      }
    }
  }

  /**
   * Ejecutar fase SEQUENTIAL
   * - Se ejecuta en orden secuencial (no paralelo)
   * - Se ejecuta 1 vez por fecha (consolidación)
   * - Ejemplo: Concatenar, Graph_Sync
   *
   * @param {Object} phase - Fase con servicios sequential
   * @private
   */
  async _executeSequentialPhase(phase) {
    for (const serviceId of phase.services) {
      const service = this.serviceInstances.get(serviceId);
      if (!service) {
        console.warn(`[FundOrchestrator ${this.idEjecucion}] Servicio sequential no encontrado: ${serviceId}`);
        continue;
      }

      const context = {
        idEjecucion: this.idEjecucion,
        fechaReporte: this.fechaReporte,
        fund: null // sequential no tiene fondo específico
      };

      console.log(`[FundOrchestrator ${this.idEjecucion}] Ejecutando sequential: ${service.name}`);
      await service.execute(context);
    }
  }

  /**
   * Evaluar si un servicio debe ejecutarse para un fondo
   * - Evalúa condicionales (Flag_UBS, Flag_Derivados, etc.)
   *
   * @param {Object} fund - Fondo a evaluar
   * @param {String} conditional - Condicional a evaluar
   * @returns {Boolean} - true si debe ejecutarse
   * @private
   */
  _shouldExecute(fund, conditional) {
    if (conditional === 'Flag_UBS') return fund.Flag_UBS === 1;
    if (conditional === 'Flag_Derivados') return fund.Flag_Derivados === 1;
    if (conditional === 'Requiere_Derivados') return fund.Requiere_Derivados === 1;

    // Default: ejecutar
    return true;
  }

  /**
   * Manejar error de servicio según política configurada
   * - STOP_ALL: Detener toda la ejecución (lanzar error)
   * - STOP_FUND: Marcar fondo como error, continuar con otros fondos
   * - CONTINUE: Log error y continuar
   *
   * @param {Object} service - Servicio que falló
   * @param {Object} fund - Fondo que falló
   * @param {Error} error - Error ocurrido
   * @private
   */
  async _handleServiceError(service, fund, error) {
    const policy = service.config.errorPolicy || 'STOP_ALL';

    console.error(
      `[FundOrchestrator ${this.idEjecucion}] Error en servicio ${service.name} (Fondo ${fund.ID_Fund}):`,
      error.message
    );

    // Registrar error en logs
    await this.logger.logError(
      this.idEjecucion,
      fund.ID_Fund,
      service.name,
      error.message
    );

    if (policy === 'STOP_ALL') {
      // Detener toda la ejecución
      throw error;
    } else if (policy === 'STOP_FUND') {
      // Marcar fondo como error, continuar con otros fondos
      await this.tracker.updateFundErrorStep(
        this.idEjecucion,
        fund.ID_Fund,
        service.name,
        error.message
      );
      // No lanzar error - permite continuar con otros fondos
      return;
    } else if (policy === 'CONTINUE') {
      // Log y continuar (ya se logueó arriba)
      await this.tracker.updateFondoState(
        this.idEjecucion,
        fund.ID_Fund,
        service.name,
        'WARNING'
      );
    }
  }
}

module.exports = FundOrchestrator;
