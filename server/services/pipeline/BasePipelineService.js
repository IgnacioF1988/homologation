/**
 * BasePipelineService - Clase base para todos los servicios del pipeline
 *
 * Proporciona funcionalidad común para ejecutar stored procedures con
 * manejo de errores, retry automático, validación defensiva y tracking de estado.
 * Servicios específicos (IPAService, CAPMService, etc.) heredan de esta clase.
 *
 * RECIBE:
 * - serviceConfig: Configuración del servicio desde pipeline.config.yaml (id, nombre, SPs, dependencias)
 * - pool: Pool de conexiones a SQL Server (compartido entre todos los orquestadores)
 * - tracker: ExecutionTracker para actualizar estados en logs.Ejecucion_Fondos
 * - logger: LoggingService para registrar eventos en logs.Ejecucion_Logs
 * - trace: TraceService para trazabilidad detallada (opcional, Phase 3)
 *
 * PROCESA:
 * 1. Valida parámetros de entrada (ID_Ejecucion > 0, ID_Fund > 0) para prevenir race conditions
 * 2. Ejecuta stored procedures en transacción (mantiene tablas temporales entre SPs)
 * 3. Maneja errores con retry exponencial (deadlock/timeout: 5s, 10s, 15s)
 * 4. Valida XACT_STATE después de cada SP para detectar transacciones uncommittable
 * 5. Actualiza estados en BD (PENDIENTE → EN_PROGRESO → OK/ERROR/STAND_BY)
 * 6. Registra problemas críticos en sandbox.Fondos_Problema
 * 7. Maneja códigos de stand-by (5-8: SUCIEDADES, HOMOLOGACION, DESCUADRES)
 *
 * ENVIA:
 * - Estados a: ExecutionTracker → logs.Ejecucion_Fondos → WebSocket (tiempo real)
 * - Logs a: LoggingService → logs.Ejecucion_Logs (bulk insert)
 * - Trace records a: TraceService → logs.Trace_Records (análisis de performance)
 * - Problemas a: sandbox.Fondos_Problema (exclusión automática)
 *
 * DEPENDENCIAS:
 * - No tiene dependencias de otros servicios (es la base)
 * - Requerido por: todos los servicios del pipeline (IPA, CAPM, Derivados, PNL, UBS)
 *
 * CONTEXTO PARALELO:
 * - Cada instancia procesa 1 fondo de forma aislada
 * - Usa transacciones SQL para mantener temp tables entre SPs del mismo fondo
 * - Validación defensiva previene race conditions (ID_Ejecucion/ID_Fund > 0)
 * - Sin contención: cada fondo tiene su propia conexión y temp tables nombradas con ID_Ejecucion_ID_Fund
 */

const sql = require('mssql');

/**
 * StandByRequiredError - Error especial para stand-by
 *
 * Stand-by NO es un error - es un estado válido que requiere aprobación de usuario.
 * Este error permite distinguir pausas válidas de errores críticos.
 *
 * @property {Number} standByCode - Código de stand-by (5, 6, 7, 8)
 * @property {String} spName - Nombre del SP que activó el stand-by
 * @property {Boolean} pausable - Siempre true (indica que puede resumir)
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
   * @param {Object} pool - Pool de conexiones de SQL Server (compartido entre orquestadores)
   * @param {Object} tracker - ExecutionTracker para actualizar estados en logs.Ejecucion_Fondos
   * @param {Object} logger - LoggingService para registrar eventos en logs.Ejecucion_Logs
   * @param {Object} trace - TraceService para trazabilidad detallada (opcional)
   *
   * Flujo:
   * 1. Valida que serviceConfig tenga un ID
   * 2. Almacena referencias a pool, tracker, logger, trace (compartidos)
   * 3. Extrae configuración (id, nombre)
   */
  constructor(serviceConfig, pool, tracker, logger, trace = null) {
    if (!serviceConfig || !serviceConfig.id) {
      throw new Error('serviceConfig debe incluir un ID');
    }

    this.config = serviceConfig;
    this.pool = pool;
    this.tracker = tracker;
    this.logger = logger;
    this.trace = trace;
    this.id = serviceConfig.id;
    this.name = serviceConfig.name || serviceConfig.id;
  }

  /**
   * Ejecutar el servicio para un fondo específico
   *
   * Template method pattern: coordina el flujo general de ejecución.
   * Servicios específicos (IPA, CAPM, etc.) pueden sobrescribir para lógica personalizada.
   *
   * @param {Object} context - Contexto de ejecución (viene de: FundOrchestrator)
   * @param {BigInt} context.idEjecucion - ID único de la ejecución del fondo
   * @param {BigInt} context.idProceso - ID del proceso padre que agrupa fondos
   * @param {String} context.fechaReporte - Fecha a procesar (YYYY-MM-DD)
   * @param {Object} context.fund - Información del fondo desde logs.Ejecucion_Fondos
   * @param {Number} context.fund.ID_Fund - ID numérico del fondo
   * @param {String} context.fund.FundShortName - Nombre corto del fondo
   * @param {String} context.fund.Portfolio_Geneva - Código de portfolio
   * @returns {Promise<Object>} - { success: true/false, duration: ms, skipped?: boolean, error?: Error }
   *
   * Flujo:
   * 1. Registra inicio en TraceService (si está habilitado)
   * 2. Verifica condición de ejecución (ej: Flag_UBS, Flag_Derivados)
   * 3. Actualiza estado a EN_PROGRESO en logs.Ejecucion_Fondos
   * 4. Crea transacción SQL (mantiene temp tables entre SPs)
   * 5. Ejecuta lista de SPs en orden secuencial (config.spList)
   * 6. Valida XACT_STATE después de cada SP
   * 7. Hace commit de transacción si todo OK
   * 8. Actualiza estado final (OK/ERROR) y emite por WebSocket
   * 9. Registra fin en TraceService
   *
   * Nota: Stand-by (códigos 5-8) lanza StandByRequiredError (NO es error real)
   */
  async execute(context) {
    const { idEjecucion, idProceso, fechaReporte, fund } = context;
    const startTime = Date.now();

    // Registrar inicio del servicio en trace (si está habilitado)
    if (this.trace) {
      await this.trace.recordStart(
        idProceso,
        idEjecucion,
        fund.ID_Fund,
        this.id,
        `staging.${this.id}_WorkTable`,
        { portfolio: fund.Portfolio_Geneva, fundName: fund.FundShortName }
      );
    }

    // IMPORTANTE: Usar una Transaction para mantener temp tables entre SPs
    // (las transacciones mantienen el mismo contexto de sesión para temp tables)
    let transaction = null;

    try {
      // 1. Verificar condicional (si aplica)
      if (this.config.conditional && !this.shouldExecute(fund)) {
        await this.logInfo(idEjecucion, fund.ID_Fund, `Servicio omitido (condicional: ${this.config.conditional})`);
        await this.updateState(idEjecucion, fund.ID_Fund, 'N/A');

        // Registrar fin de servicio omitido en trace
        if (this.trace) {
          await this.trace.recordEnd(
            idProceso,
            idEjecucion,
            fund.ID_Fund,
            this.id,
            `staging.${this.id}_WorkTable`,
            Date.now() - startTime,
            { skipped: true, reason: this.config.conditional }
          );
        }

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

        // Registrar problema en sandbox.Fondos_Problema
        await this.registerFundProblem(
          idEjecucion,
          fund.ID_Fund,
          this.id,
          'Transacción uncommittable detectada (XACT_STATE=-1) - posible violación de constraint o error en trigger'
        );

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

      // Registrar fin exitoso del servicio en trace
      if (this.trace) {
        await this.trace.recordEnd(
          idProceso,
          idEjecucion,
          fund.ID_Fund,
          this.id,
          `staging.${this.id}_WorkTable`,
          duration,
          { success: true }
        );
      }

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

      // Registrar error en trace para análisis
      if (this.trace) {
        await this.trace.recordError(
          idProceso,
          idEjecucion,
          fund.ID_Fund,
          this.id,
          error.message,
          { duration, errorType: error.name, stack: error.stack?.substring(0, 500) }
        );
      }

      await this.handleError(error, context);
      return { success: false, duration, error };
    }
  }

  /**
   * Ejecutar un stored procedure específico dentro de una transacción
   *
   * @param {Object} spConfig - Configuración del SP desde pipeline.config.yaml
   * @param {Object} context - Contexto de ejecución
   * @param {Object} transaction - Transacción SQL activa (mantiene temp tables entre SPs)
   * @returns {Promise<Object>} - Resultado del SP (returnValue, output, recordset)
   *
   * Flujo:
   * 1. Valida ID_Ejecucion > 0 e ID_Fund > 0 (previene race conditions)
   * 2. Normaliza fechaReporte a string YYYY-MM-DD (evita errores de validación)
   * 3. Construye request con parámetros: ID_Ejecucion, FechaReporte, ID_Fund, Portfolio_*
   * 4. Ejecuta SP con retry automático (deadlock/timeout: 3 intentos, 5s-10s-15s)
   * 5. Valida XACT_STATE inmediatamente después (detecta SP que causó uncommittable)
   * 6. Procesa returnValue (0=OK, 2=retry, 3=error, 5-8=stand-by)
   * 7. Actualiza sub-estado si aplica (ej: Estado_IPA_01)
   *
   * Nota: Lanza StandByRequiredError si returnValue 5-8 (pausa válida, no error)
   * @private
   */
  async executeSP(spConfig, context, transaction) {
    const { idEjecucion, fechaReporte, fund } = context;
    const spName = spConfig.name;

    // ============================================
    // VALIDACIÓN DEFENSIVA
    // ============================================
    // Validar que ID_Ejecucion e ID_Fund sean valores válidos (> 0)
    // CRÍTICO: Previene race conditions y deadlocks en ejecuciones paralelas
    // Si estos valores son 0, múltiples ejecuciones podrían intentar DELETE
    // de los mismos registros históricos causando lock escalation en SQL Server
    if (!idEjecucion || idEjecucion <= 0) {
      const error = new Error(
        `ID_Ejecucion inválido (${idEjecucion}). Debe ser > 0 para garantizar aislamiento en ejecuciones paralelas.`
      );
      await this.logError(
        idEjecucion || 0,
        fund.ID_Fund || 0,
        `CRITICAL: ${error.message} - SP: ${spName}`
      );
      throw error;
    }

    if (!fund.ID_Fund || fund.ID_Fund <= 0) {
      const error = new Error(
        `ID_Fund inválido (${fund.ID_Fund}). Debe ser > 0 para garantizar aislamiento en ejecuciones paralelas.`
      );
      await this.logError(
        idEjecucion,
        fund.ID_Fund || 0,
        `CRITICAL: ${error.message} - SP: ${spName}, Fund: ${fund.FundShortName || 'UNKNOWN'}`
      );
      throw error;
    }
    // ============================================
    // FIN VALIDACIÓN DEFENSIVA
    // ============================================

    // Log inicio
    await this.logDebug(idEjecucion, fund.ID_Fund, `Ejecutando ${spName}...`);

    // ============================================
    // FIX: Normalizar fechaReporte antes de pasar a SP
    // ============================================
    // SQL Server retorna columnas DATE como Date objects.
    // Los SPs esperan NVARCHAR(10) en formato 'YYYY-MM-DD'.
    // Si pasamos Date object, mssql driver lanza:
    // "Validation failed for parameter 'FechaReporte'. Invalid string"
    // Este error tiene severity 16 → crea uncommittable transaction
    let fechaReporteParam = fechaReporte;

    if (fechaReporteParam instanceof Date) {
      const year = fechaReporteParam.getFullYear();
      const month = String(fechaReporteParam.getMonth() + 1).padStart(2, '0');
      const day = String(fechaReporteParam.getDate()).padStart(2, '0');
      fechaReporteParam = `${year}-${month}-${day}`;
    }

    // Validar que sea string válido
    if (typeof fechaReporteParam !== 'string' || fechaReporteParam.trim() === '') {
      const error = new Error(
        `FechaReporte inválido después de conversión: ${typeof fechaReporteParam} = "${fechaReporteParam}"`
      );
      await this.logError(
        idEjecucion,
        fund.ID_Fund,
        `CRITICAL: ${error.message} - SP: ${spName}`
      );
      throw error;
    }
    // ============================================
    // FIN FIX fechaReporte
    // ============================================

    // Construir request usando la transacción (mantiene temp tables)
    const request = transaction.request();

    // Configurar timeout
    if (spConfig.timeout) {
      request.timeout = spConfig.timeout;
    }

    // Agregar parámetros de entrada
    request.input('ID_Ejecucion', sql.BigInt, idEjecucion);
    request.input('FechaReporte', sql.NVarChar(10), fechaReporteParam);
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

    // *** CRITICAL: Validar estado de transacción inmediatamente después de cada SP ***
    // Esto identifica qué SP específico causa uncommittable transactions en concurrencia
    const postXactState = await transaction.request()
      .query('SELECT XACT_STATE() as XactState');

    const xactState = postXactState.recordset[0].XactState;

    if (xactState === -1) {
      // Transacción uncommittable detectada - este SP la causó
      await this.logError(
        idEjecucion,
        fund.ID_Fund,
        `CRITICAL: ${spName} caused transaction to become uncommittable (XACT_STATE=-1). ` +
        `This SP likely has constraint violations, trigger errors, or severity 16+ exceptions. ` +
        `Fund: ${fund.Nombre_Fondo || fund.ID_Fund}`
      );

      // Registrar problema causado por este SP específico
      await this.registerFundProblem(
        idEjecucion,
        fund.ID_Fund,
        spName,
        `Transacción uncommittable (XACT_STATE=-1) - SP causó violación de constraint o error en trigger`
      );

      // Rollback inmediato
      await transaction.rollback();

      throw new Error(
        `${spName} caused uncommittable transaction (XACT_STATE=-1). ` +
        `Check for constraint violations, trigger errors, or severe exceptions in SP code.`
      );
    } else if (xactState === 0) {
      // Transacción no activa - unexpected pero no crítico
      await this.logWarning(
        idEjecucion,
        fund.ID_Fund,
        `${spName} completed but transaction is no longer active (XACT_STATE=0)`
      );
    }
    // xactState === 1 (committable) es el estado esperado - continuar normalmente

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

    // ============================================
    // Validar resultado según returnValue
    // ============================================
    // Códigos redefinidos (Migration 002):
    //   0 = Éxito / Skip válido
    //   2 = Retry (deadlock/timeout) - manejado en executeWithRetry
    //   3 = Error crítico (detiene fondo, registra en Fondos_Problema)
    //   5 = Stand-by SUCIEDADES (pausa antes CAPM)
    //   6 = Stand-by HOMOLOGACION (pausa inmediato)
    //   7 = Stand-by DESCUADRES-CAPM (pausa antes PNL)
    //   8 = Stand-by DESCUADRES-GENERAL (pausa post-proceso)

    // Manejo de códigos stand-by (5-8: SUCIEDADES, HOMOLOGACION, DESCUADRES)
    if (returnValue >= 5 && returnValue <= 8) {
      await this._handleStandByCode(returnValue, spName, context);

      // Lanzar excepción especial (NO es error, es pausa válida que requiere aprobación)
      const error = new StandByRequiredError(
        `Stand-by requerido por ${spName}`,
        returnValue,
        spName
      );
      throw error;
    }

    // Manejo de error crítico (código 3)
    if (returnValue === 3) {
      // Registrar en Fondos_Problema (si el SP no lo hizo ya)
      await this.registerFundProblem(
        idEjecucion,
        fund.ID_Fund,
        this.id,
        `Error crítico en ${spName}`
      );

      throw new Error(`${spName} falló críticamente (returnValue: 3)`);
    }

    // Manejo de retry (código 2)
    if (returnValue === 2) {
      throw new Error(`${spName} requiere retry (deadlock/timeout)`);
    }

    // Validación de código legacy (eliminado pero puede aparecer en SPs antiguos)
    if (returnValue === 1) {
      await this.logWarning(idEjecucion, fund.ID_Fund,
        `${spName} retornó código 1 (warning deprecado). ` +
        `Este código fue eliminado. ` +
        `El SP debe retornar 0 (éxito), 3 (error), o 5-8 (stand-by).`
      );
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
   * Ejecutar función con retry automático (exponential backoff)
   *
   * Reintenta automáticamente en errores retriables:
   * - Deadlock (SQL error 1205)
   * - Timeout (ETIMEOUT)
   * - Errores de conexión (ECONNRESET, ESOCKET)
   *
   * @param {Function} fn - Función async a ejecutar (debe retornar Promise)
   * @param {Object} spConfig - Configuración del SP (para contexto de logs)
   * @returns {Promise} - Resultado de la función si tiene éxito
   *
   * Flujo:
   * 1. Intenta ejecutar fn()
   * 2. Si falla, captura detalles del error SQL (number, severity, state, etc.)
   * 3. Verifica si es error retriable (deadlock, timeout, conexión)
   * 4. Si es retriable y quedan intentos, espera delay exponencial (5s, 10s, 15s)
   * 5. Reintenta hasta 3 veces máximo
   * 6. Si no es retriable o se agotan intentos, lanza el error
   *
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

        // Capturar detalles completos del error de SQL Server para diagnóstico
        const errorDetails = {
          number: error.number || 'N/A',
          severity: error.class || 'N/A',
          state: error.state || 'N/A',
          message: error.message || 'N/A',
          procName: error.procName || 'N/A',
          lineNumber: error.lineNumber || 'N/A',
          code: error.code || 'N/A'
        };

        console.error(
          `[${this.id}] SQL Server Error Details: ` +
          `Number=${errorDetails.number}, Severity=${errorDetails.severity}, State=${errorDetails.state}, ` +
          `Proc=${errorDetails.procName}, Line=${errorDetails.lineNumber}, Code=${errorDetails.code}, ` +
          `Message="${errorDetails.message}"`
        );

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

    // Emitir actualización por WebSocket
    const updates = {};
    updates[this.config.tracking.stateField] = estado;
    await this.emitFundUpdate(idEjecucion, idFund, updates);
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
    } catch (error) {
      // No fallar pipeline si falla WebSocket
      console.warn('[BasePipelineService] Error emitiendo WebSocket:', error.message);
    }
  }

  /**
   * Actualizar sub-estado (para pasos internos como IPA_01, IPA_02, etc.)
   * @private
   */
  async updateSubState(idEjecucion, idFund, subStateField, estado) {
    await this.tracker.updateFundState(idEjecucion, idFund, subStateField, estado);

    // Emitir actualización por WebSocket
    const updates = {};
    updates[subStateField] = estado;
    await this.emitFundUpdate(idEjecucion, idFund, updates);
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

  /**
   * Manejar código de stand-by (5-8)
   *
   * Registra el tipo de stand-by detectado sin bloquear aún la ejecución.
   * El bloqueo efectivo lo maneja FundOrchestrator consultando logs.Ejecucion_Fondos.
   *
   * Tipos de stand-by:
   * - 5: SUCIEDADES (valores pequeños que requieren aprobación)
   * - 6: HOMOLOGACION (instrumento sin homologar)
   * - 7: DESCUADRES-CAPM (diferencia entre IPA y CAPM)
   * - 8: DESCUADRES-GENERAL (otros descuadres)
   *
   * @param {Number} returnValue - Código de stand-by (5, 6, 7, 8)
   * @param {String} spName - Nombre del SP que activó stand-by
   * @param {Object} context - Contexto de ejecución
   *
   * Flujo:
   * 1. Mapea código a tipo de stand-by
   * 2. Registra en logs con nivel INFO (stand-by NO es error)
   * 3. El estado se actualiza en logs.Ejecucion_Fondos automáticamente
   * 4. FundOrchestrator verificará estado antes de continuar con próximo servicio
   *
   * @private
   */
  async _handleStandByCode(returnValue, spName, context) {
    const { idEjecucion, fund } = context;

    const standByTypes = {
      5: 'SUCIEDADES',
      6: 'HOMOLOGACION',
      7: 'DESCUADRES-CAPM',
      8: 'DESCUADRES-GENERAL'
    };

    const tipoStandBy = standByTypes[returnValue] || 'UNKNOWN';

    await this.logger.log(
      idEjecucion,
      fund.ID_Fund,
      'INFO',  // INFO porque stand-by es estado válido (no WARNING, no ERROR)
      this.id,
      `⏸️ Stand-by activado por ${spName}: ${tipoStandBy} (código ${returnValue})`
    );
  }

  /**
   * Registrar problema crítico de fondo en sandbox.Fondos_Problema
   *
   * Método reutilizable para todos los servicios del pipeline.
   * Registra problemas críticos que impiden continuar el procesamiento del fondo.
   * Los fondos registrados aquí son excluidos automáticamente en próximas ejecuciones.
   *
   * @param {BigInt} idEjecucion - ID de ejecución (para obtener FechaReporte)
   * @param {Number} idFund - ID del fondo con problema
   * @param {String} proceso - Proceso que detectó el problema (ej: 'PROCESS_IPA', 'IPA_02_AjusteSONA')
   * @param {String} tipoProblema - Descripción del problema (ej: 'Sin datos en extract.IPA')
   *
   * Flujo:
   * 1. Obtiene FechaReporte desde logs.Ejecuciones usando ID_Ejecucion
   * 2. Normaliza fechaReporte a string YYYY-MM-DD si es Date object
   * 3. Verifica si ya existe registro para este fondo/fecha/proceso
   * 4. Si existe, agrega tipo de problema al registro actual
   * 5. Si no existe, crea nuevo registro en sandbox.Fondos_Problema
   * 6. Registra en logs con nivel ERROR
   *
   * Nota: Usa conexión independiente para evitar conflictos con transacciones activas
   */
  async registerFundProblem(idEjecucion, idFund, proceso, tipoProblema) {
    // FIX: Usar nueva conexión independiente para evitar conflictos con transacciones activas
    // Bug: En concurrencia alta, registerFundProblem() puede ejecutarse mientras otros fondos
    // tienen transacciones activas en this.pool, causando uncommittable transactions
    let independentRequest = null;

    try {
      // Crear request independiente (NO usa transacciones activas de otros fondos)
      independentRequest = this.pool.request();

      // Obtener fechaReporte de la ejecución
      const ejecResult = await independentRequest
        .input('ID_Ejecucion', sql.BigInt, idEjecucion)
        .query('SELECT FechaReporte FROM logs.Ejecuciones WHERE ID_Ejecucion = @ID_Ejecucion');

      let fechaReporte = ejecResult.recordset[0]?.FechaReporte;

      // FIX: Validar y normalizar fechaReporte exhaustivamente antes de usar .input()
      // Bug original: fechaReporte undefined/inválido causa uncommittable transaction
      if (!fechaReporte) {
        console.warn(`[BasePipelineService] No se pudo obtener FechaReporte para ID_Ejecucion=${idEjecucion}`);
        return;
      }

      // FIX: Si es un Date object, convertir a string YYYY-MM-DD
      // SQL Server puede retornar DATE/DATETIME como Date object
      if (fechaReporte instanceof Date) {
        const year = fechaReporte.getFullYear();
        const month = String(fechaReporte.getMonth() + 1).padStart(2, '0');
        const day = String(fechaReporte.getDate()).padStart(2, '0');
        fechaReporte = `${year}-${month}-${day}`;
      }

      // Validar que sea un string válido
      if (typeof fechaReporte !== 'string') {
        console.warn(`[BasePipelineService] FechaReporte no es string después de conversión (tipo: ${typeof fechaReporte}, valor: ${fechaReporte})`);
        return;
      }

      // Validar que no sea string vacío
      if (fechaReporte.trim() === '') {
        console.warn(`[BasePipelineService] FechaReporte es string vacío`);
        return;
      }

      // Crear NUEVA request independiente para el INSERT
      // (No reutilizar la anterior porque ya se usó para SELECT)
      const insertRequest = this.pool.request();

      // Registrar problema (evitar duplicados)
      await insertRequest
        .input('FechaReporte', sql.NVarChar(10), fechaReporte)
        .input('ID_Fund', sql.Int, idFund)
        .input('Proceso', sql.NVarChar(50), proceso)
        .input('Tipo_Problema', sql.NVarChar(500), tipoProblema)
        .query(`
          IF NOT EXISTS (
            SELECT 1 FROM sandbox.Fondos_Problema
            WHERE FechaReporte = @FechaReporte
              AND ID_Fund = @ID_Fund
              AND Proceso = @Proceso
              AND Tipo_Problema LIKE '%' + @Tipo_Problema + '%'
          )
          BEGIN
            IF EXISTS (SELECT 1 FROM sandbox.Fondos_Problema
                       WHERE FechaReporte = @FechaReporte
                         AND ID_Fund = @ID_Fund
                         AND Proceso = @Proceso)
            BEGIN
              -- Actualizar problema existente (agregar tipo)
              UPDATE sandbox.Fondos_Problema
              SET Tipo_Problema = Tipo_Problema + '; ' + @Tipo_Problema,
                  FechaProceso = CONVERT(NVARCHAR, GETDATE(), 120)
              WHERE FechaReporte = @FechaReporte
                AND ID_Fund = @ID_Fund
                AND Proceso = @Proceso;
            END
            ELSE
            BEGIN
              -- Insertar nuevo problema
              INSERT INTO sandbox.Fondos_Problema (FechaReporte, ID_Fund, Proceso, Tipo_Problema, FechaProceso)
              VALUES (@FechaReporte, @ID_Fund, @Proceso, @Tipo_Problema,
                      CONVERT(NVARCHAR, GETDATE(), 120));
            END
          END
        `);

      await this.logger.log(
        idEjecucion,
        idFund,
        'ERROR',  // Problemas críticos son ERROR
        this.id,
        `Problema registrado en sandbox.Fondos_Problema: ${tipoProblema}`
      );

    } catch (error) {
      // No fallar el pipeline si falla el logging
      console.warn(`[BasePipelineService] Error registrando problema: ${error.message}`);
    }
  }

  // ============================================
  // Logging helpers
  // ============================================

  async logInfo(idEjecucion, idFund, mensaje, metadata = null) {
    await this.logger.log(idEjecucion, idFund, 'INFO', this.id, mensaje, metadata);
  }

  async logWarning(idEjecucion, idFund, mensaje, metadata = null) {
    await this.logger.log(idEjecucion, idFund, 'WARNING', this.id, mensaje, metadata);
  }

  async logError(idEjecucion, idFund, mensaje, metadata = null) {
    await this.logger.log(idEjecucion, idFund, 'ERROR', this.id, mensaje, metadata);
  }

  async logDebug(idEjecucion, idFund, mensaje, metadata = null) {
    // Solo logear si nivel es DEBUG
    if (this.logger.level === 'DEBUG') {
      await this.logger.log(idEjecucion, idFund, 'DEBUG', this.id, mensaje, metadata);
    }
  }
}

module.exports = BasePipelineService;
module.exports.StandByRequiredError = StandByRequiredError;
