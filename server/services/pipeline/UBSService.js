/**
 * UBSService - Servicio de Procesamiento UBS
 *
 * Ejecuta el pipeline de procesamiento UBS (Fondos Luxemburgo):
 * 1. UBS_01_Tratamiento_Fondos_Luxemburgo - Extrae y trata datos UBS
 * 2. UBS_02_Tratamiento_Derivados_MLCCII - Derivados MLCCII (condicional)
 * 3. UBS_03_Creacion_Cartera_MLCCII - Crea cartera MLCCII (condicional)
 *
 * Características:
 * - INDEPENDIENTE de IPA (solo requiere extracción)
 * - Procesa un fondo individual a la vez
 * - UBS_02 y UBS_03 solo ejecutan si Es_MLCCII = true
 * - Usa tablas temporales: #temp_UBS_*
 * - Tracking granular por sub-paso
 * - onError: CONTINUE (no detiene pipeline si falla)
 * - Logging detallado de cada paso
 *
 * Uso:
 * ```javascript
 * const ubsService = new UBSService(serviceConfig, pool, tracker, logger);
 * const result = await ubsService.execute({
 *   idEjecucion: 12345n,
 *   fechaReporte: '2025-12-19',
 *   fund: {
 *     ID_Fund: 789,
 *     FundShortName: 'MLCCII',
 *     Portfolio_UBS: 'MLCCII_LUX',
 *     Es_MLCCII: true
 *   }
 * });
 * ```
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
