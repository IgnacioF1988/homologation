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
    const executionOrder = resolver.getExecutionOrder(); // Array de IDs en orden topológico

    console.log(`[FundOrchestrator ${this.idEjecucion}] Orden de ejecución: ${executionOrder.join(' -> ')}`);

    // 3. Agrupar servicios por tipo de ejecución (batch, parallel, sequential)
    this.executionPlan = this._buildExecutionPlan(executionOrder);

    console.log(`[FundOrchestrator ${this.idEjecucion}] Plan de ejecución: ${this.executionPlan.length} fases`);

    // 4. Instanciar servicios (IPAService, CAPMService, etc.)
    this._instantiateServices();

    console.log(`[FundOrchestrator ${this.idEjecucion}] Inicializado con ${this.fondos.length} fondos`);
  }

  /**
   * Construir plan de ejecución agrupando servicios por tipo
   * - batch: servicios que se ejecutan 1 vez por fecha
   * - parallel: servicios que se ejecutan por cada fondo en paralelo
   * - sequential: servicios que se ejecutan 1 vez por fecha en orden
   *
   * @param {Array<String>} executionOrder - IDs de servicios en orden topológico
   * @returns {Array<Object>} - Plan de ejecución [{type, services, name}]
   * @private
   */
  _buildExecutionPlan(executionOrder) {
    const phases = [];
    const serviceMap = new Map();

    // Crear mapa de ID -> configuración
    this.config.services.forEach(svc => {
      serviceMap.set(svc.id, svc);
    });

    // Agrupar servicios consecutivos del mismo tipo
    let currentPhase = null;

    executionOrder.forEach(serviceId => {
      const serviceConfig = serviceMap.get(serviceId);
      if (!serviceConfig) {
        console.warn(`[FundOrchestrator] Servicio ${serviceId} no encontrado en config`);
        return;
      }

      // Leer 'type' del config (usado en pipeline.config.yaml)
      const execType = serviceConfig.type || serviceConfig.executionType || 'parallel';

      // Si cambia el tipo de ejecución, crear nueva fase
      if (!currentPhase || currentPhase.type !== execType) {
        currentPhase = {
          type: execType,
          services: [],
          name: `${execType.toUpperCase()}_Phase_${phases.length + 1}`
        };
        phases.push(currentPhase);
      }

      // Agregar servicio a la fase actual
      currentPhase.services.push(serviceId);
    });

    return phases;
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
    const ExtractionService = require('../pipeline/ExtractionService');
    const IPAService = require('../pipeline/IPAService');
    const CAPMService = require('../pipeline/CAPMService');
    const DerivadosService = require('../pipeline/DerivadosService');
    const PNLService = require('../pipeline/PNLService');
    const UBSService = require('../pipeline/UBSService');

    // Mapear service IDs del config a clases Node.js
    // Los IDs del config son como "PROCESS_IPA", pero las clases son IPAService
    const serviceClasses = {
      'EXTRACCION': ExtractionService,
      'PROCESS_IPA': IPAService,
      'PROCESS_CAPM': CAPMService,
      'PROCESS_DERIVADOS': DerivadosService,
      'PROCESS_PNL': PNLService,
      'PROCESS_UBS': UBSService,
      // VALIDACION, CONSOLIDAR_CAPM, CONCATENAR, GRAPH_SYNC usan SPs directamente (sin clase Node.js aún)
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
        // Para servicios sin clase específica, usar un placeholder
        console.log(`[FundOrchestrator ${this.idEjecucion}] Servicio ${svcConfig.id} sin implementación Node.js (usa SPs directamente)`);
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

      // Actualizar stats finales
      await this._updateExecutionStats('COMPLETADO');
      console.log(`[FundOrchestrator ${this.idEjecucion}] Ejecución completada exitosamente`);
      return { success: true, idEjecucion: this.idEjecucion };

    } catch (error) {
      console.error(`[FundOrchestrator ${this.idEjecucion}] Error en ejecución:`, error);

      // Actualizar stats finales con error
      try {
        await this._updateExecutionStats('ERROR');
      } catch (statsError) {
        console.error(`[FundOrchestrator ${this.idEjecucion}] Error actualizando stats:`, statsError);
      }

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
   * - Concurrencia adaptativa: Max 3 fondos en paralelo
   * - RCSI habilitado: Elimina bloqueos de lectura usando versionado de filas
   *
   * @param {Object} phase - Fase con servicios parallel
   * @private
   */
  async _executeParallelPhase(phase) {
    // Concurrencia reducida para evitar sobrecarga
    // RCSI (Read Committed Snapshot Isolation) habilitado en BD elimina bloqueos de lectura
    // CONSERVATIVE: Set to 1 pending further testing (2 successful runs with concurrency=3, need more evidence)
    const concurrencyLimit = Math.min(this.fondos.length, 1);
    const limit = pLimit(concurrencyLimit);

    console.log(`[FundOrchestrator ${this.idEjecucion}] Concurrencia: ${concurrencyLimit} fondos en paralelo (RCSI habilitado)`);

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
    try {
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
    } finally {
      // Actualizar stats después de procesar cada fondo (tiempo real)
      await this._updateExecutionStats();
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
    // Mapear onError del config a política interna
    // onError puede ser: STOP_ALL, STOP_FUND, CONTINUE, LOG_WARNING
    const onError = service.config.onError || 'STOP_ALL';
    const policy = onError === 'LOG_WARNING' ? 'CONTINUE' : onError;

    console.error(
      `[FundOrchestrator ${this.idEjecucion}] Error en servicio ${service.name} (Fondo ${fund.ID_Fund}):`,
      error.message
    );

    // Registrar error en logs
    await this.logger.error(
      this.idEjecucion,
      fund.ID_Fund,
      service.name,
      error.message || error.toString(),
      error
    );

    if (policy === 'STOP_ALL') {
      // Detener toda la ejecución
      throw error;
    } else if (policy === 'STOP_FUND') {
      // Marcar fondo como error, continuar con otros fondos
      await this.tracker.markFundFailed(
        this.idEjecucion,
        fund.ID_Fund,
        service.name,
        error.message
      );
      // No lanzar error - permite continuar con otros fondos
      return;
    } else if (policy === 'CONTINUE') {
      // Log y continuar (ya se logueó arriba con logger.error)
      // CONTINUE policy: simplemente continuar sin marcar fondo como ERROR
      // El error ya fue logueado en logs.Ejecucion_Logs para auditoría
      console.log(
        `[FundOrchestrator ${this.idEjecucion}] Política CONTINUE: ` +
        `continuando ejecución para fondo ${fund.ID_Fund} después de error en ${service.name}`
      );
      // No lanzar error - continuar con siguiente servicio
      return;
    }
  }

  /**
   * Actualizar estadísticas de ejecución en tiempo real
   * - Consulta logs.Ejecucion_Fondos para obtener contadores actuales
   * - Actualiza logs.Ejecuciones con FondosExitosos, FondosFallidos, etc.
   * - Se llama después de procesar cada fondo y al finalizar
   *
   * @param {String} estadoFinal - Estado final de la ejecución (opcional)
   * @private
   */
  async _updateExecutionStats(estadoFinal = null) {
    try {
      // Obtener estados actuales de todos los fondos
      const fondosStates = await this.tracker.getFundStates(this.idEjecucion);

      // Calcular contadores
      const stats = {
        fondosOK: fondosStates.filter(f => f.Estado_Final === 'COMPLETADO').length,
        fondosError: fondosStates.filter(f => f.Estado_Final === 'ERROR').length,
        fondosWarning: fondosStates.filter(f => f.Estado_Final === 'WARNING').length,
        fondosOmitidos: fondosStates.filter(f => f.Estado_Final === 'OMITIDO').length,
      };

      // Determinar estado de la ejecución
      let estado = estadoFinal || 'EN_PROGRESO';

      // Si no se especificó estado final, calcularlo
      if (!estadoFinal) {
        const totalProcesados = stats.fondosOK + stats.fondosError + stats.fondosWarning + stats.fondosOmitidos;
        const totalFondos = this.fondos.length;

        // Si todos procesados, determinar estado final
        if (totalProcesados === totalFondos) {
          if (stats.fondosError > 0) {
            estado = stats.fondosOK > 0 ? 'PARCIAL' : 'ERROR';
          } else if (stats.fondosWarning > 0) {
            estado = 'COMPLETADO'; // Con warnings pero completado
          } else {
            estado = 'COMPLETADO';
          }
        }
      }

      // Actualizar tabla logs.Ejecuciones
      await this.tracker.actualizarEstadoEjecucion(this.idEjecucion, estado, stats);

      console.log(
        `[FundOrchestrator ${this.idEjecucion}] Stats actualizados - ` +
        `OK: ${stats.fondosOK}, Error: ${stats.fondosError}, Warning: ${stats.fondosWarning}, Omitidos: ${stats.fondosOmitidos}`
      );

    } catch (error) {
      console.error(
        `[FundOrchestrator ${this.idEjecucion}] Error actualizando stats:`,
        error
      );
      // No lanzar error - esto es un update auxiliar
    }
  }
}

module.exports = FundOrchestrator;
