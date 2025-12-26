/**
 * UBSService - Servicio de procesamiento UBS/Fondos Luxemburgo
 *
 * Ejecuta el pipeline de hasta 3 pasos para procesar fondos UBS de Luxemburgo.
 * INDEPENDIENTE: No requiere IPA, solo extracción UBS. Solo se ejecuta si Flag_UBS = 1.
 *
 * RECIBE:
 * - serviceConfig: Configuración desde pipeline.config.yaml (3 SPs, 2 condicionales)
 * - pool: Pool de conexiones SQL Server (compartido)
 * - tracker: ExecutionTracker para actualizar estados
 * - logger: LoggingService para registrar eventos
 * - trace: TraceService (opcional)
 * - context: { idEjecucion, fechaReporte, fund } desde FundOrchestrator
 *
 * PROCESA (hasta 3 pasos, solo si Flag_UBS=1):
 * 1. UBS_01_Tratamiento_Fondos_Luxemburgo_v2: Procesa fondos UBS Luxemburgo (siempre)
 * 2. UBS_02_Tratamiento_Derivados_MLCCII_v2: Derivados MLCCII (solo si Es_MLCCII=true)
 * 3. UBS_03_Creacion_Cartera_MLCCII_v2: Cartera MLCCII (solo si Es_MLCCII=true)
 *
 * ENVIA:
 * - Datos a: staging.UBS_Final (tabla temporal)
 * - Estados a: ExecutionTracker → logs.Ejecucion_Fondos (Estado_UBS_01 hasta Estado_UBS_03)
 * - Logs a: LoggingService → logs.Ejecucion_Logs
 *
 * DEPENDENCIAS:
 * - Requiere: EXTRACCION completada (extract.UBS con datos)
 * - NO requiere: IPA (procesamiento independiente)
 * - Requerido por: CONCATENAR (concatena UBS si Flag_UBS=1)
 *
 * CONTEXTO PARALELO:
 * - CONDICIONAL: Solo ejecuta si fund.Flag_UBS = 1
 * - INDEPENDIENTE: NO depende de IPA, puede ejecutarse en paralelo con IPA/CAPM/PNL
 * - Política de error: CONTINUE (errores NO detienen pipeline completo)
 * - Pasos 2 y 3: Solo ejecutan si fund.Es_MLCCII = true (sub-condicional)
 * - Usa tablas temporales: #temp_UBS_WorkTable_[ID_Ejecucion]_[ID_Fund]
 */

const BasePipelineService = require('./BasePipelineService');
const sql = require('mssql');

class UBSService extends BasePipelineService {
  /**
   * Constructor
   * @param {Object} serviceConfig - Configuración del servicio desde pipeline.config.yaml
   * @param {Object} pool - Connection pool de SQL Server
   * @param {Object} tracker - ExecutionTracker para actualizar estados
   * @param {Object} logger - LoggingService para registrar eventos
   * @param {Object} trace - TraceService para trazabilidad (opcional)
   */
  constructor(serviceConfig, pool, tracker, logger, trace = null) {
    super(serviceConfig, pool, tracker, logger, trace);

    // Validar que la configuración tenga los 3 SPs del grupo UBS
    if (!this.config.spList || this.config.spList.length !== 3) {
      throw new Error('UBSService requiere exactamente 3 SPs en la configuración');
    }

    // Validar que los SPs estén en orden correcto
    const expectedSPs = [
      'staging.UBS_01_Tratamiento_Fondos_Luxemburgo_v2',
      'staging.UBS_02_Tratamiento_Derivados_MLCCII_v2',
      'staging.UBS_03_Creacion_Cartera_MLCCII_v2',
    ];

    const actualSPs = this.config.spList.map(sp => sp.name);
    const missingOrWrong = expectedSPs.filter((sp, idx) => actualSPs[idx] !== sp);

    if (missingOrWrong.length > 0) {
      console.warn(
        `[UBSService] Configuración de SPs no coincide con esperado. ` +
        `Esperado: ${expectedSPs.join(', ')}. ` +
        `Actual: ${actualSPs.join(', ')}`
      );
    }
  }

  /**
   * Ejecutar pipeline UBS para un fondo específico
   *
   * Este método sobrescribe el de BasePipelineService para agregar
   * lógica específica de UBS (ej: validaciones especiales, cleanup)
   *
   * @param {Object} context - Contexto de ejecución
   * @returns {Promise<Object>} - { success, duration, metrics, skipped }
   */
  async execute(context) {
    const { idEjecucion, fechaReporte, fund } = context;
    const startTime = Date.now();

    try {
      // 1. Validaciones previas específicas de UBS
      await this.validateUBSPrerequisites(context);

      // 2. Log inicio del procesamiento UBS
      const isMlccii = fund.Es_MLCCII ? ' (MLCCII)' : '';
      await this.logInfo(
        idEjecucion,
        fund.ID_Fund,
        `Iniciando procesamiento UBS - Fondo: ${fund.FundShortName}${isMlccii} (${fund.Portfolio_UBS})`
      );

      // 3. Ejecutar pipeline usando lógica base (ejecuta los SPs en orden)
      // Los SPs 02 y 03 se omitirán si Es_MLCCII = false (conditional)
      const result = await super.execute(context);

      // 4. Log resumen final
      const duration = Date.now() - startTime;
      await this.logInfo(
        idEjecucion,
        fund.ID_Fund,
        `UBS completado exitosamente en ${(duration / 1000).toFixed(2)}s - ` +
        `Fondo: ${fund.FundShortName}`
      );

      return { ...result, duration };

    } catch (error) {
      const duration = Date.now() - startTime;
      await this.logError(
        idEjecucion,
        fund.ID_Fund,
        `Error en procesamiento UBS: ${error.message}`
      );

      // Re-lanzar error para que BasePipelineService lo maneje
      throw error;
    }
  }

  /**
   * Validar pre-requisitos específicos de UBS
   *
   * @param {Object} context - Contexto de ejecución
   * @returns {Promise<void>}
   * @private
   */
  async validateUBSPrerequisites(context) {
    const { idEjecucion, fechaReporte, fund } = context;

    // Validar que el fondo tenga Portfolio_UBS definido
    if (!fund.Portfolio_UBS) {
      throw new Error(
        `Fondo ${fund.ID_Fund} (${fund.FundShortName}) no tiene Portfolio_UBS definido. ` +
        `UBS requiere este campo.`
      );
    }

    // Validar que existan datos extraídos de UBS para esta fecha
    const request = this.pool.request();
    const result = await request
      .input('FechaReporte', sql.NVarChar(10), fechaReporte)
      .input('Portfolio', sql.NVarChar(50), fund.Portfolio_UBS)
      .query(`
        SELECT COUNT(*) AS Count
        FROM extract.UBS
        WHERE FechaReporte = @FechaReporte
          AND Portfolio = @Portfolio
      `);

    const ubsCount = result.recordset[0].Count;
    if (ubsCount === 0) {
      throw new Error(
        `No hay datos extraídos de UBS para fecha ${fechaReporte} y portfolio ${fund.Portfolio_UBS}. ` +
        `Ejecutar EXTRACCION primero.`
      );
    }

    await this.logDebug(
      idEjecucion,
      fund.ID_Fund,
      `Validaciones UBS OK - Datos: ${ubsCount} registros para ${fechaReporte}`
    );
  }

  /**
   * Obtener métricas específicas del procesamiento UBS
   *
   * @param {Object} context - Contexto de ejecución
   * @returns {Promise<Object>} - Métricas del procesamiento
   */
  async getUBSMetrics(context) {
    const { idEjecucion, fund } = context;

    try {
      const tempTableName = `#temp_UBS_Final_${idEjecucion}_${fund.ID_Fund}`;

      const request = this.pool.request();
      const result = await request.query(`
        IF OBJECT_ID('tempdb..${tempTableName}') IS NOT NULL
        BEGIN
          SELECT
            COUNT(*) AS TotalRegistros,
            COUNT(DISTINCT ID_Instrumento) AS TotalInstrumentos,
            SUM(ISNULL(MVBook, 0)) AS TotalMVal,
            COUNT(DISTINCT Portfolio) AS TotalPortfolios
          FROM ${tempTableName};
        END
        ELSE
        BEGIN
          SELECT 0 AS TotalRegistros, 0 AS TotalInstrumentos, 0 AS TotalMVal,
                 0 AS TotalPortfolios;
        END
      `);

      return result.recordset[0];
    } catch (error) {
      await this.logWarning(
        idEjecucion,
        fund.ID_Fund,
        `No se pudieron obtener métricas UBS: ${error.message}`
      );

      return {
        TotalRegistros: 0,
        TotalInstrumentos: 0,
        TotalMVal: 0,
        TotalPortfolios: 0,
      };
    }
  }

  /**
   * Cleanup de tablas temporales del fondo
   *
   * Llamar al finalizar el procesamiento (exitoso o con error)
   * para liberar recursos de SQL Server
   *
   * @param {Object} context - Contexto de ejecución
   * @returns {Promise<void>}
   */
  async cleanup(context) {
    const { idEjecucion, fund } = context;

    const tempTables = [
      `#temp_UBS_WorkTable_${idEjecucion}_${fund.ID_Fund}`,
      `#temp_UBS_Derivados_MLCCII_${idEjecucion}_${fund.ID_Fund}`,
      `#temp_UBS_Cartera_MLCCII_${idEjecucion}_${fund.ID_Fund}`,
      `#temp_UBS_Final_${idEjecucion}_${fund.ID_Fund}`,
    ];

    for (const tableName of tempTables) {
      try {
        const request = this.pool.request();
        await request.query(`DROP TABLE IF EXISTS ${tableName};`);
      } catch (error) {
        // Ignorar errores de cleanup (tabla no existe, etc.)
        console.warn(
          `[UBSService] Error limpiando ${tableName} para fondo ${fund.ID_Fund}: ${error.message}`
        );
      }
    }

    await this.logDebug(
      idEjecucion,
      fund.ID_Fund,
      'Tablas temporales UBS limpiadas'
    );
  }

  /**
   * Obtener nombre descriptivo del servicio
   *
   * @returns {String}
   */
  getServiceName() {
    return 'UBS Processing Service (Fondos Luxemburgo)';
  }

  /**
   * Obtener versión del servicio
   *
   * @returns {String}
   */
  getVersion() {
    return '2.0.0';
  }
}

module.exports = UBSService;
