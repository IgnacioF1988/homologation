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
    const fund = this.fondos[0]; // Usar primer fondo como contexto para batch
    for (const phase of this.executionPlan) {
      if (phase.type === 'batch') {
        await this._executeBatchPhase(phase, fund);
      }
    }
  }

  /**
   * Ejecutar el pipeline completo (batch/parallel/sequential)
   */
  async execute() {
    const fund = this.fondos[0];
    this._executionHadStandBy = false; // Track si hubo stand-by

    try {
      pipelineEvents.emitEjecucionInicio(this.idEjecucion, fund.ID_Fund, fund.FundShortName);

      for (const phase of this.executionPlan) {
        if (phase.type === 'batch') {
          continue; // SKIP: Las fases batch ya fueron ejecutadas por _executeBatchPhasesOnce()
        } else if (phase.type === 'parallel') {
          await this._executeParallelPhase(phase);
        } else if (phase.type === 'sequential') {
          await this._executeSequentialPhase(phase);
        }
      }

      // Determinar estado final basado en si hubo stand-by
      const estadoFinal = this._executionHadStandBy ? 'STAND_BY' : 'OK';
      pipelineEvents.emitEjecucionFin(this.idEjecucion, fund.ID_Fund, estadoFinal, 0);
      return { success: !this._executionHadStandBy, idEjecucion: this.idEjecucion };

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
   * NOTA: Deshabilitado temporalmente - con arquitectura TEMP tables,
   * la validación de tablas físicas extract.* no aplica
   */
  async _shouldExecuteFund(_fund, _fechaReporte) {
    // TODO: Reimplementar validación compatible con TEMP tables
    return true;
  }

  /**
   * Verificar stand-by
   * @private
   */
  async _checkFundStandByStatus(fund, serviceId) {
    try {
      // NOTA: Ahora leemos de logs.Ejecuciones en lugar de logs.Ejecucion_Fondos
      // Las columnas EstadoStandBy y PuntoBloqueoActual se actualizan desde TrackingService
      const result = await this.pool.request()
        .input('ID_Ejecucion', sql.BigInt, this.idEjecucion)
        .query(`
          SELECT EstadoStandBy, PuntoBloqueoActual
          FROM logs.Ejecuciones
          WHERE ID_Ejecucion = @ID_Ejecucion
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
    let isStandBy = false;
    let failedServiceId = null;

    try {
      const shouldExecute = await this._shouldExecuteFund(fund, this.fechaReporte);
      if (!shouldExecute) {
        return;
      }

      for (const serviceId of serviceIds) {
        const service = this.serviceInstances.get(serviceId);
        if (!service) {
          continue;
        }

        // Verificar stand-by previo
        const standByStatus = await this._checkFundStandByStatus(fund, serviceId);
        if (standByStatus.isPaused) {
          pipelineEvents.emitServicioOmitido(this.idEjecucion, fund.ID_Fund, serviceId, 'Stand-by activo');
          fundProcessedOK = false;
          isStandBy = true;
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
            failedServiceId = serviceId;

            // Detectar si fue stand-by (error con nombre StandByRequiredError)
            if (result.error?.name === 'StandByRequiredError') {
              isStandBy = true;
            }
            break; // No continuar con más servicios si hubo error
          }
        } catch (error) {
          await this._handleServiceError(service, fund, error);
          fundProcessedOK = false;
          failedServiceId = serviceId;

          // Detectar si fue stand-by
          if (error?.name === 'StandByRequiredError') {
            isStandBy = true;
          }
          break; // No continuar con más servicios si hubo error
        }
      }

      // Consolidar a CUBO solo si todos los servicios fueron OK
      if (fundProcessedOK) {
        await this._consolidateFundToCubo(fund);
      } else {
        // ROLLBACK: Limpiar temp tables cuando hay error o stand-by
        await this._cleanupTempTables(fund);

        // Marcar que hubo stand-by para el estado final
        if (isStandBy) {
          this._executionHadStandBy = true;
        }
      }

    } catch (_error) {
      // Error ya manejado, pero asegurar cleanup
      await this._cleanupTempTables(fund);
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

  /**
   * Limpiar todas las temp tables de un fondo (rollback)
   * Se ejecuta cuando hay error o stand-by para liberar recursos
   * @private
   */
  async _cleanupTempTables(fund) {
    const tempTablePatterns = [
      '##IPA_Work',
      '##IPA_Final',
      '##CAPM_Work',
      '##Derivados_Work',
      '##Derivados_Final',
      '##PNL_Work',
      '##PNL_Final',
      '##UBS_Work'
    ];

    const suffix = `_${this.idEjecucion}_${fund.ID_Fund}`;
    let droppedCount = 0;

    for (const pattern of tempTablePatterns) {
      const tableName = pattern + suffix;
      try {
        // Verificar si existe antes de intentar DROP
        const checkResult = await this.dedicatedConnection.request().query(`
          IF OBJECT_ID('tempdb..${tableName}', 'U') IS NOT NULL
            SELECT 1 AS Exists
          ELSE
            SELECT 0 AS Exists
        `);

        if (checkResult.recordset[0]?.Exists === 1) {
          await this.dedicatedConnection.request().query(`DROP TABLE ${tableName}`);
          droppedCount++;
        }
      } catch (_err) {
        // Ignorar errores de DROP - la tabla puede no existir o ya fue eliminada
      }
    }
  }
}

module.exports = FundOrchestrator;
