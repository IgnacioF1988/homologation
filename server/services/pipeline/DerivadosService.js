/**
 * DerivadosService - Servicio de Procesamiento Derivados
 *
 * Ejecuta el pipeline de procesamiento de derivados para fondos específicos:
 * 1. DERIV_01_Tratamiento_Posiciones_Larga_Corta - Extrae posiciones de derivados
 * 2. DERIV_02_Homologar_Dimensiones - Homologa dimensiones
 * 3. DERIV_03_Ajuste_Derivados - Ajustes específicos de derivados
 * 4. DERIV_04_Parity_Adjust - Ajuste de paridad
 *
 * Características:
 * - Solo ejecuta para fondos con Requiere_Derivados = true
 * - Procesa un fondo individual a la vez
 * - Depende de IPA (necesita staging.IPA_WorkTable)
 * - Usa tablas temporales: #temp_Derivados_*
 * - Tracking granular por sub-paso
 * - onError: CONTINUE (no detiene pipeline si falla)
 * - Logging detallado de cada paso
 *
 * Uso:
 * ```javascript
 * const derivadosService = new DerivadosService(serviceConfig, pool, tracker, logger);
 * const result = await derivadosService.execute({
 *   idEjecucion: 12345n,
 *   fechaReporte: '2025-12-19',
 *   fund: {
 *     ID_Fund: 789,
 *     FundShortName: 'MLAT',
 *     Portfolio_Derivados: 'MLAT_DERIV',
 *     Requiere_Derivados: true
 *   }
 * });
 * ```
 */

const BasePipelineService = require('./BasePipelineService');
const sql = require('mssql');

class DerivadosService extends BasePipelineService {
  /**
   * Constructor
   * @param {Object} serviceConfig - Configuración del servicio desde pipeline.config.yaml
   * @param {Object} pool - Connection pool de SQL Server
   * @param {Object} tracker - ExecutionTracker para actualizar estados
   * @param {Object} logger - LoggingService para registrar eventos
   */
  constructor(serviceConfig, pool, tracker, logger) {
    super(serviceConfig, pool, tracker, logger);

    // Validar que la configuración tenga los 4 SPs del grupo Derivados
    if (!this.config.spList || this.config.spList.length !== 4) {
      throw new Error('DerivadosService requiere exactamente 4 SPs en la configuración');
    }

    // Validar que los SPs estén en orden correcto
    const expectedSPs = [
      'staging.DERIV_01_Tratamiento_Posiciones_Larga_Corta_v2',
      'staging.DERIV_02_Homologar_Dimensiones_v2',
      'staging.DERIV_03_Ajuste_Derivados_v2',
      'staging.DERIV_04_Parity_Adjust_v2',
    ];

    const actualSPs = this.config.spList.map(sp => sp.name);
    const missingOrWrong = expectedSPs.filter((sp, idx) => actualSPs[idx] !== sp);

    if (missingOrWrong.length > 0) {
      console.warn(
        `[DerivadosService] Configuración de SPs no coincide con esperado. ` +
        `Esperado: ${expectedSPs.join(', ')}. ` +
        `Actual: ${actualSPs.join(', ')}`
      );
    }
  }

  /**
   * Ejecutar pipeline Derivados para un fondo específico
   *
   * Este método sobrescribe el de BasePipelineService para agregar
   * lógica específica de Derivados (ej: validaciones especiales, cleanup)
   *
   * @param {Object} context - Contexto de ejecución
   * @returns {Promise<Object>} - { success, duration, metrics, skipped }
   */
  async execute(context) {
    const { idEjecucion, fechaReporte, fund } = context;
    const startTime = Date.now();

    try {
      // 1. Validaciones previas específicas de Derivados
      await this.validateDerivadosPrerequisites(context);

      // 2. Log inicio del procesamiento Derivados
      await this.logInfo(
        idEjecucion,
        fund.ID_Fund,
        `Iniciando procesamiento Derivados - Fondo: ${fund.FundShortName} (${fund.Portfolio_Derivados})`
      );

      // 3. Ejecutar pipeline usando lógica base (ejecuta los 4 SPs en orden)
      const result = await super.execute(context);

      // 4. Log resumen final
      const duration = Date.now() - startTime;
      await this.logInfo(
        idEjecucion,
        fund.ID_Fund,
        `Derivados completado exitosamente en ${(duration / 1000).toFixed(2)}s - ` +
        `Fondo: ${fund.FundShortName}`
      );

      return { ...result, duration };

    } catch (error) {
      const duration = Date.now() - startTime;
      await this.logError(
        idEjecucion,
        fund.ID_Fund,
        `Error en procesamiento Derivados: ${error.message}`
      );

      // Re-lanzar error para que BasePipelineService lo maneje
      throw error;
    }
  }

  /**
   * Validar pre-requisitos específicos de Derivados
   *
   * @param {Object} context - Contexto de ejecución
   * @returns {Promise<void>}
   * @private
   */
  async validateDerivadosPrerequisites(context) {
    const { idEjecucion, fechaReporte, fund } = context;

    // Validar que el fondo tenga Portfolio_Derivados definido
    if (!fund.Portfolio_Derivados) {
      throw new Error(
        `Fondo ${fund.ID_Fund} (${fund.FundShortName}) no tiene Portfolio_Derivados definido. ` +
        `Derivados requiere este campo.`
      );
    }

    // Validar que existan datos extraídos de Derivados para esta fecha
    const request = this.pool.request();
    const result = await request
      .input('FechaReporte', sql.NVarChar(10), fechaReporte)
      .input('Portfolio', sql.NVarChar(50), fund.Portfolio_Derivados)
      .query(`
        SELECT COUNT(*) AS Count
        FROM extract.Derivados
        WHERE FechaReporte = @FechaReporte
          AND Portfolio = @Portfolio
      `);

    const derivCount = result.recordset[0].Count;
    if (derivCount === 0) {
      throw new Error(
        `No hay datos extraídos de Derivados para fecha ${fechaReporte} y portfolio ${fund.Portfolio_Derivados}. ` +
        `Ejecutar EXTRACCION primero.`
      );
    }

    await this.logDebug(
      idEjecucion,
      fund.ID_Fund,
      `Validaciones Derivados OK - Datos: ${derivCount} registros para ${fechaReporte}`
    );
  }

  /**
   * Obtener métricas específicas del procesamiento Derivados
   *
   * @param {Object} context - Contexto de ejecución
   * @returns {Promise<Object>} - Métricas del procesamiento
   */
  async getDerivadosMetrics(context) {
    const { idEjecucion, fund } = context;

    try {
      const tempTableName = `#temp_Derivados_Final_${idEjecucion}_${fund.ID_Fund}`;

      const request = this.pool.request();
      const result = await request.query(`
        IF OBJECT_ID('tempdb..${tempTableName}') IS NOT NULL
        BEGIN
          SELECT
            COUNT(*) AS TotalRegistros,
            COUNT(DISTINCT ID_Instrumento) AS TotalInstrumentos,
            SUM(ISNULL(MVBook, 0)) AS TotalMVal,
            SUM(CASE WHEN PosicionTipo = 'Long' THEN 1 ELSE 0 END) AS PosicionesLargas,
            SUM(CASE WHEN PosicionTipo = 'Short' THEN 1 ELSE 0 END) AS PosicionesCortas
          FROM ${tempTableName};
        END
        ELSE
        BEGIN
          SELECT 0 AS TotalRegistros, 0 AS TotalInstrumentos, 0 AS TotalMVal,
                 0 AS PosicionesLargas, 0 AS PosicionesCortas;
        END
      `);

      return result.recordset[0];
    } catch (error) {
      await this.logWarning(
        idEjecucion,
        fund.ID_Fund,
        `No se pudieron obtener métricas Derivados: ${error.message}`
      );

      return {
        TotalRegistros: 0,
        TotalInstrumentos: 0,
        TotalMVal: 0,
        PosicionesLargas: 0,
        PosicionesCortas: 0,
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
      `#temp_Derivados_WorkTable_${idEjecucion}_${fund.ID_Fund}`,
      `#temp_Derivados_Posiciones_${idEjecucion}_${fund.ID_Fund}`,
      `#temp_Derivados_Final_${idEjecucion}_${fund.ID_Fund}`,
    ];

    for (const tableName of tempTables) {
      try {
        const request = this.pool.request();
        await request.query(`DROP TABLE IF EXISTS ${tableName};`);
      } catch (error) {
        // Ignorar errores de cleanup (tabla no existe, etc.)
        console.warn(
          `[DerivadosService] Error limpiando ${tableName} para fondo ${fund.ID_Fund}: ${error.message}`
        );
      }
    }

    await this.logDebug(
      idEjecucion,
      fund.ID_Fund,
      'Tablas temporales Derivados limpiadas'
    );
  }

  /**
   * Obtener nombre descriptivo del servicio
   *
   * @returns {String}
   */
  getServiceName() {
    return 'Derivados Processing Service';
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

module.exports = DerivadosService;
