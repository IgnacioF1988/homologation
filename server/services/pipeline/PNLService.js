/**
 * PNLService - Servicio de Procesamiento PNL
 *
 * Ejecuta el pipeline de procesamiento PNL (Profit & Loss) para fondos:
 * 1. PNL_01_Dimensiones - Homologación dimensional de PNL
 * 2. PNL_02_Ajuste - Ajustes específicos de PNL
 * 3. PNL_03_Agrupacion - Agrupación de registros PNL
 * 4. PNL_04_CrearRegistrosAjusteIPA - Crea ajustes contra IPA
 * 5. PNL_05_Consolidar_IPA_PNL - Consolidación final IPA + PNL
 *
 * Características:
 * - Procesa un fondo individual a la vez
 * - Depende de IPA (requiere staging.IPA_WorkTable)
 * - Usa tablas temporales: #temp_PNL_*
 * - Tracking granular por sub-paso (Estado_PNL_01, Estado_PNL_02, etc.)
 * - Retry automático en errores recuperables
 * - Logging detallado de cada paso
 * - Consolidación con IPA en el paso 05
 *
 * Uso:
 * ```javascript
 * const pnlService = new PNLService(serviceConfig, pool, tracker, logger);
 * const result = await pnlService.execute({
 *   idEjecucion: 12345n,
 *   fechaReporte: '2025-12-19',
 *   fund: { ID_Fund: 789, FundShortName: 'MLAT', Portfolio_Geneva: 'MLAT' }
 * });
 * ```
 */

const BasePipelineService = require('./BasePipelineService');
const sql = require('mssql');

class PNLService extends BasePipelineService {
  /**
   * Constructor
   * @param {Object} serviceConfig - Configuración del servicio desde pipeline.config.yaml
   * @param {Object} pool - Connection pool de SQL Server
   * @param {Object} tracker - ExecutionTracker para actualizar estados
   * @param {Object} logger - LoggingService para registrar eventos
   */
  constructor(serviceConfig, pool, tracker, logger) {
    super(serviceConfig, pool, tracker, logger);

    // Validar que la configuración tenga los 5 SPs del grupo PNL
    if (!this.config.spList || this.config.spList.length !== 5) {
      throw new Error('PNLService requiere exactamente 5 SPs en la configuración');
    }

    // Validar que los SPs estén en orden correcto
    const expectedSPs = [
      'staging.PNL_01_Dimensiones_v2',
      'staging.PNL_02_Ajuste_v2',
      'staging.PNL_03_Agrupacion_v2',
      'staging.PNL_04_CrearRegistrosAjusteIPA_v2',
      'staging.PNL_05_Consolidar_IPA_PNL_v2',
    ];

    const actualSPs = this.config.spList.map(sp => sp.name);
    const missingOrWrong = expectedSPs.filter((sp, idx) => actualSPs[idx] !== sp);

    if (missingOrWrong.length > 0) {
      console.warn(
        `[PNLService] Configuración de SPs no coincide con esperado. ` +
        `Esperado: ${expectedSPs.join(', ')}. ` +
        `Actual: ${actualSPs.join(', ')}`
      );
    }
  }

  /**
   * Ejecutar pipeline PNL para un fondo específico
   *
   * Este método sobrescribe el de BasePipelineService para agregar
   * lógica específica de PNL (ej: validaciones especiales, cleanup)
   *
   * @param {Object} context - Contexto de ejecución
   * @returns {Promise<Object>} - { success, duration, metrics, skipped }
   */
  async execute(context) {
    const { idEjecucion, fechaReporte, fund } = context;
    const startTime = Date.now();

    try {
      // 1. Validaciones previas específicas de PNL
      await this.validatePNLPrerequisites(context);

      // 2. Log inicio del procesamiento PNL
      await this.logInfo(
        idEjecucion,
        fund.ID_Fund,
        `Iniciando procesamiento PNL - Fondo: ${fund.FundShortName} (${fund.Portfolio_Geneva})`
      );

      // 3. Ejecutar pipeline usando lógica base (ejecuta los 5 SPs en orden)
      const result = await super.execute(context);

      // 4. Log resumen final
      const duration = Date.now() - startTime;
      await this.logInfo(
        idEjecucion,
        fund.ID_Fund,
        `PNL completado exitosamente en ${(duration / 1000).toFixed(2)}s - ` +
        `Fondo: ${fund.FundShortName}`
      );

      return { ...result, duration };

    } catch (error) {
      const duration = Date.now() - startTime;
      await this.logError(
        idEjecucion,
        fund.ID_Fund,
        `Error en procesamiento PNL: ${error.message}`
      );

      // Re-lanzar error para que BasePipelineService lo maneje
      throw error;
    }
  }

  /**
   * Validar pre-requisitos específicos de PNL
   *
   * @param {Object} context - Contexto de ejecución
   * @returns {Promise<void>}
   * @private
   */
  async validatePNLPrerequisites(context) {
    const { idEjecucion, fechaReporte, fund } = context;

    // Validar que el fondo tenga Portfolio_Geneva definido
    if (!fund.Portfolio_Geneva) {
      throw new Error(
        `Fondo ${fund.ID_Fund} (${fund.FundShortName}) no tiene Portfolio_Geneva definido. ` +
        `PNL requiere este campo.`
      );
    }

    // Validar que IPA haya completado exitosamente
    // (PNL_05 consolidará IPA + PNL, por lo que necesita IPA procesado)
    const request = this.pool.request();
    const result = await request
      .input('ID_Ejecucion', sql.BigInt, idEjecucion)
      .input('ID_Fund', sql.VarChar(50), String(fund.ID_Fund))
      .query(`
        SELECT Estado_Process_IPA
        FROM logs.Ejecucion_Fondos
        WHERE ID_Ejecucion = @ID_Ejecucion AND ID_Fund = @ID_Fund
      `);

    if (!result.recordset[0] || result.recordset[0].Estado_Process_IPA !== 'OK') {
      throw new Error(
        `PNL requiere que IPA haya completado exitosamente para el fondo ${fund.FundShortName}. ` +
        `Estado IPA actual: ${result.recordset[0]?.Estado_Process_IPA || 'DESCONOCIDO'}`
      );
    }

    await this.logDebug(
      idEjecucion,
      fund.ID_Fund,
      `Validaciones PNL OK - IPA completado exitosamente`
    );
  }

  /**
   * Obtener métricas específicas del procesamiento PNL
   *
   * @param {Object} context - Contexto de ejecución
   * @returns {Promise<Object>} - Métricas del procesamiento
   */
  async getPNLMetrics(context) {
    const { idEjecucion, fund } = context;

    try {
      const tempTableName = `#temp_PNL_Final_${idEjecucion}_${fund.ID_Fund}`;

      const request = this.pool.request();
      const result = await request.query(`
        IF OBJECT_ID('tempdb..${tempTableName}') IS NOT NULL
        BEGIN
          SELECT
            COUNT(*) AS TotalRegistros,
            COUNT(DISTINCT ID_Instrumento) AS TotalInstrumentos,
            SUM(ISNULL(MVBook, 0)) AS TotalMVal,
            SUM(CASE WHEN Tipo = 'PNL' THEN 1 ELSE 0 END) AS RegistrosPNL,
            SUM(CASE WHEN Tipo = 'AJUSTE_IPA' THEN 1 ELSE 0 END) AS RegistrosAjusteIPA
          FROM ${tempTableName};
        END
        ELSE
        BEGIN
          SELECT 0 AS TotalRegistros, 0 AS TotalInstrumentos, 0 AS TotalMVal,
                 0 AS RegistrosPNL, 0 AS RegistrosAjusteIPA;
        END
      `);

      return result.recordset[0];
    } catch (error) {
      await this.logWarning(
        idEjecucion,
        fund.ID_Fund,
        `No se pudieron obtener métricas PNL: ${error.message}`
      );

      return {
        TotalRegistros: 0,
        TotalInstrumentos: 0,
        TotalMVal: 0,
        RegistrosPNL: 0,
        RegistrosAjusteIPA: 0,
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
      `#temp_PNL_WorkTable_${idEjecucion}_${fund.ID_Fund}`,
      `#temp_PNL_Dimensiones_${idEjecucion}_${fund.ID_Fund}`,
      `#temp_PNL_Ajuste_${idEjecucion}_${fund.ID_Fund}`,
      `#temp_PNL_Agrupado_${idEjecucion}_${fund.ID_Fund}`,
      `#temp_PNL_AjusteIPA_${idEjecucion}_${fund.ID_Fund}`,
      `#temp_PNL_Final_${idEjecucion}_${fund.ID_Fund}`,
    ];

    for (const tableName of tempTables) {
      try {
        const request = this.pool.request();
        await request.query(`DROP TABLE IF EXISTS ${tableName};`);
      } catch (error) {
        // Ignorar errores de cleanup (tabla no existe, etc.)
        console.warn(
          `[PNLService] Error limpiando ${tableName} para fondo ${fund.ID_Fund}: ${error.message}`
        );
      }
    }

    await this.logDebug(
      idEjecucion,
      fund.ID_Fund,
      'Tablas temporales PNL limpiadas'
    );
  }

  /**
   * Obtener nombre descriptivo del servicio
   *
   * @returns {String}
   */
  getServiceName() {
    return 'PNL Processing Service';
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

module.exports = PNLService;
