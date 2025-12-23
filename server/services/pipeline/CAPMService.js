/**
 * CAPMService - Servicio de Procesamiento CAPM
 *
 * Ejecuta el pipeline CAPM para un fondo específico:
 * 1. CAPM_01_Ajuste_CAPM - Calcula ajuste entre IPA_Cash y CAPM
 * 2. CAPM_02_Extract_Transform - Extrae y homologa datos CAPM
 *
 * Características:
 * - Procesa un fondo individual a la vez
 * - Depende de IPA (necesita #temp_IPA_Cash_[ID_Ejecucion]_[ID_Fund])
 * - Usa tablas temporales: #temp_Ajuste_CAPM_* y #temp_CAPM_WorkTable_*
 * - Tracking granular por sub-paso (Estado_CAPM_01, Estado_CAPM_02)
 * - Retry automático en errores recuperables
 * - Logging detallado de cada paso
 *
 * Uso:
 * ```javascript
 * const capmService = new CAPMService(serviceConfig, pool, tracker, logger);
 * const result = await capmService.execute({
 *   idEjecucion: 12345n,
 *   fechaReporte: '2025-12-19',
 *   fund: { ID_Fund: 789, FundShortName: 'MLAT', Portfolio_Geneva: 'MLAT' }
 * });
 * ```
 */

const BasePipelineService = require('./BasePipelineService');
const sql = require('mssql');

class CAPMService extends BasePipelineService {
  /**
   * Constructor
   * @param {Object} serviceConfig - Configuración del servicio desde pipeline.config.yaml
   * @param {Object} pool - Connection pool de SQL Server
   * @param {Object} tracker - ExecutionTracker para actualizar estados
   * @param {Object} logger - LoggingService para registrar eventos
   */
  constructor(serviceConfig, pool, tracker, logger) {
    super(serviceConfig, pool, tracker, logger);

    // Validar que la configuración tenga los 2 SPs del grupo CAPM
    if (!this.config.spList || this.config.spList.length !== 2) {
      throw new Error('CAPMService requiere exactamente 2 SPs en la configuración');
    }

    // Validar que los SPs estén en orden correcto
    const expectedSPs = [
      'staging.CAPM_01_Ajuste_CAPM_v2',
      'staging.CAPM_02_Extract_Transform_v2',
    ];

    const actualSPs = this.config.spList.map(sp => sp.name);
    const missingOrWrong = expectedSPs.filter((sp, idx) => actualSPs[idx] !== sp);

    if (missingOrWrong.length > 0) {
      console.warn(
        `[CAPMService] Configuración de SPs no coincide con esperado. ` +
        `Esperado: ${expectedSPs.join(', ')}. ` +
        `Actual: ${actualSPs.join(', ')}`
      );
    }
  }

  /**
   * Ejecutar pipeline CAPM para un fondo específico
   *
   * Este método sobrescribe el de BasePipelineService para agregar
   * lógica específica de CAPM (ej: validaciones especiales, cleanup)
   *
   * @param {Object} context - Contexto de ejecución
   * @returns {Promise<Object>} - { success, duration, metrics, skipped }
   */
  async execute(context) {
    const { idEjecucion, fechaReporte, fund } = context;
    const startTime = Date.now();

    try {
      // 1. Validaciones previas específicas de CAPM
      await this.validateCAPMPrerequisites(context);

      // 2. Log inicio del procesamiento CAPM
      await this.logInfo(
        idEjecucion,
        fund.ID_Fund,
        `Iniciando procesamiento CAPM - Fondo: ${fund.FundShortName} (${fund.Portfolio_Geneva})`
      );

      // 3. Ejecutar pipeline usando lógica base (ejecuta los 2 SPs en orden)
      const result = await super.execute(context);

      // 4. Validaciones post-procesamiento CAPM
      // NOTA: Comentado porque la conexión dedicada se cierra en super.execute()
      // y las temp tables ya no están disponibles
      // if (result.success) {
      //   await this.validateCAPMResults(context);
      // }

      // 5. Log resumen final
      const duration = Date.now() - startTime;
      await this.logInfo(
        idEjecucion,
        fund.ID_Fund,
        `CAPM completado exitosamente en ${(duration / 1000).toFixed(2)}s - ` +
        `Fondo: ${fund.FundShortName}`
      );

      return { ...result, duration };

    } catch (error) {
      const duration = Date.now() - startTime;
      await this.logError(
        idEjecucion,
        fund.ID_Fund,
        `Error en procesamiento CAPM: ${error.message}`
      );

      // Re-lanzar error para que BasePipelineService lo maneje
      throw error;
    }
  }

  /**
   * Validar pre-requisitos específicos de CAPM
   *
   * @param {Object} context - Contexto de ejecución
   * @returns {Promise<void>}
   * @private
   */
  async validateCAPMPrerequisites(context) {
    const { idEjecucion, fechaReporte, fund } = context;

    // Validar que el fondo tenga Portfolio_Geneva definido
    if (!fund.Portfolio_Geneva) {
      throw new Error(
        `Fondo ${fund.ID_Fund} (${fund.FundShortName}) no tiene Portfolio_Geneva definido. ` +
        `CAPM requiere este campo.`
      );
    }

    // NOTA: Validaciones preliminares comentadas porque:
    // 1. staging.IPA_Cash se valida en CAPM_01 (no necesario validar aquí)
    // 2. extract.CAPM se valida en CAPM_02 (no necesario validar aquí)
    // 3. Estas queries pueden fallar si el pool está en proceso de cierre
    //
    // Las validaciones se dejan a los SPs que las manejan correctamente.
  }

  /**
   * Validar resultados post-procesamiento CAPM
   *
   * @param {Object} context - Contexto de ejecución
   * @returns {Promise<void>}
   * @private
   */
  async validateCAPMResults(context) {
    const { idEjecucion, fechaReporte, fund } = context;

    // Verificar que se hayan generado las tablas temporales esperadas
    const tempWorkTable = `#temp_CAPM_WorkTable_${idEjecucion}_${fund.ID_Fund}`;
    const tempAjusteTable = `#temp_Ajuste_CAPM_${idEjecucion}_${fund.ID_Fund}`;

    try {
      const request = this.pool.request();

      // Contar registros en WorkTable
      let workTableCount = 0;
      try {
        const result = await request.query(`
          IF OBJECT_ID('tempdb..${tempWorkTable}') IS NOT NULL
          BEGIN
            SELECT COUNT(*) AS Count FROM ${tempWorkTable};
          END
          ELSE
          BEGIN
            SELECT 0 AS Count;
          END
        `);
        workTableCount = result.recordset[0].Count;
      } catch (err) {
        // Tabla no existe, es válido si no hay datos CAPM
        workTableCount = 0;
      }

      // Contar registros en Ajuste
      let ajusteCount = 0;
      try {
        const request2 = this.pool.request();
        const result = await request2.query(`
          IF OBJECT_ID('tempdb..${tempAjusteTable}') IS NOT NULL
          BEGIN
            SELECT COUNT(*) AS Count FROM ${tempAjusteTable};
          END
          ELSE
          BEGIN
            SELECT 0 AS Count;
          END
        `);
        ajusteCount = result.recordset[0].Count;
      } catch (err) {
        // Tabla no existe, es válido si no hay ajuste necesario
        ajusteCount = 0;
      }

      await this.logInfo(
        idEjecucion,
        fund.ID_Fund,
        `Registros CAPM generados: WorkTable=${workTableCount}, Ajuste=${ajusteCount}`
      );

    } catch (error) {
      // No fallar si no se puede validar, solo loguear
      await this.logWarning(
        idEjecucion,
        fund.ID_Fund,
        `No se pudo validar resultados finales de CAPM: ${error.message}`
      );
    }
  }

  /**
   * Obtener métricas específicas del procesamiento CAPM
   *
   * @param {Object} context - Contexto de ejecución
   * @returns {Promise<Object>} - Métricas del procesamiento
   */
  async getCAPMMetrics(context) {
    const { idEjecucion, fund } = context;

    try {
      const tempWorkTable = `#temp_CAPM_WorkTable_${idEjecucion}_${fund.ID_Fund}`;
      const tempAjusteTable = `#temp_Ajuste_CAPM_${idEjecucion}_${fund.ID_Fund}`;

      const request = this.pool.request();
      const result = await request.query(`
        DECLARE @WorkTableCount INT = 0;
        DECLARE @AjusteCount INT = 0;
        DECLARE @TotalMVal DECIMAL(18,2) = 0;

        -- Contar WorkTable
        IF OBJECT_ID('tempdb..${tempWorkTable}') IS NOT NULL
        BEGIN
          SELECT @WorkTableCount = COUNT(*) FROM ${tempWorkTable};
        END

        -- Contar Ajuste
        IF OBJECT_ID('tempdb..${tempAjusteTable}') IS NOT NULL
        BEGIN
          SELECT @AjusteCount = COUNT(*) FROM ${tempAjusteTable};
        END

        -- Calcular suma total (combinando ambas tablas si existen)
        IF OBJECT_ID('tempdb..${tempWorkTable}') IS NOT NULL
        BEGIN
          SELECT @TotalMVal = @TotalMVal + SUM(ISNULL(AI, 0) + ISNULL(MVBook, 0))
          FROM ${tempWorkTable};
        END

        IF OBJECT_ID('tempdb..${tempAjusteTable}') IS NOT NULL
        BEGIN
          SELECT @TotalMVal = @TotalMVal + SUM(ISNULL(AI, 0) + ISNULL(MVBook, 0))
          FROM ${tempAjusteTable};
        END

        SELECT
          @WorkTableCount AS TotalRegistrosWorkTable,
          @AjusteCount AS TotalRegistrosAjuste,
          @TotalMVal AS TotalMVal;
      `);

      return result.recordset[0];
    } catch (error) {
      await this.logWarning(
        idEjecucion,
        fund.ID_Fund,
        `No se pudieron obtener métricas CAPM: ${error.message}`
      );

      return {
        TotalRegistrosWorkTable: 0,
        TotalRegistrosAjuste: 0,
        TotalMVal: 0,
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
      `#temp_CAPM_WorkTable_${idEjecucion}_${fund.ID_Fund}`,
      `#temp_Ajuste_CAPM_${idEjecucion}_${fund.ID_Fund}`,
    ];

    for (const tableName of tempTables) {
      try {
        const request = this.pool.request();
        await request.query(`DROP TABLE IF EXISTS ${tableName};`);
      } catch (error) {
        // Ignorar errores de cleanup (tabla no existe, etc.)
        console.warn(
          `[CAPMService] Error limpiando ${tableName} para fondo ${fund.ID_Fund}: ${error.message}`
        );
      }
    }

    await this.logDebug(
      idEjecucion,
      fund.ID_Fund,
      'Tablas temporales CAPM limpiadas'
    );
  }

  /**
   * Obtener nombre descriptivo del servicio
   *
   * @returns {String}
   */
  getServiceName() {
    return 'CAPM Processing Service';
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

module.exports = CAPMService;
