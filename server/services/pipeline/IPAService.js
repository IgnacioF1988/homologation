/**
 * IPAService - Servicio de procesamiento IPA (Inteligencia de Precios de Activos)
 *
 * Ejecuta el pipeline completo de 7 pasos secuenciales de procesamiento IPA
 * para un fondo específico. IPA es el proceso central que homologa y consolida
 * posiciones de activos financieros.
 *
 * RECIBE:
 * - serviceConfig: Configuración desde pipeline.config.yaml (7 SPs secuenciales)
 * - pool: Pool de conexiones SQL Server (compartido)
 * - tracker: ExecutionTracker para actualizar estados granulares
 * - logger: LoggingService para registrar eventos
 * - trace: TraceService (opcional)
 * - context: { idEjecucion, fechaReporte, fund } desde FundOrchestrator
 *
 * PROCESA (7 pasos secuenciales):
 * 1. IPA_01_RescatarLocalPrice_v2: Extrae datos de extract.IPA y extract.PosModRF
 * 2. IPA_02_AjusteSONA_v2: Calcula ajustes SONA vs IPA
 * 3. IPA_03_RenombrarCxCCxP_v2: Renombra cuentas por cobrar/pagar
 * 4. IPA_04_TratamientoSuciedades_v2: Trata suciedades (valores pequeños, puede activar stand-by)
 * 5. IPA_05_EliminarCajasMTM_v2: Elimina cajas MTM duplicadas
 * 6. IPA_06_CrearDimensiones_v2: Homologa dimensiones (fondos, instrumentos, monedas)
 * 7. IPA_07_AgruparRegistros_v2: Agrupa registros finales por dimensión
 *
 * ENVIA:
 * - Datos a: staging.IPA_Final (tabla temporal para el fondo)
 * - Estados a: ExecutionTracker → logs.Ejecucion_Fondos (Estado_IPA_01 hasta Estado_IPA_07)
 * - Logs a: LoggingService → logs.Ejecucion_Logs
 *
 * DEPENDENCIAS:
 * - Requiere: EXTRACCION completada (extract.IPA, extract.PosModRF con datos)
 * - Requerido por: PROCESS_CAPM (usa #temp_IPA_Cash), PROCESS_PNL (usa staging.IPA_Final)
 *
 * CONTEXTO PARALELO:
 * - Procesa 1 fondo a la vez de forma aislada
 * - Usa tablas temporales nombradas: #temp_IPA_WorkTable_[ID_Ejecucion]_[ID_Fund]
 * - Los 7 pasos se ejecutan secuencialmente en una transacción (mantiene temp tables)
 * - Tracking granular: cada paso actualiza su sub-estado (Estado_IPA_01, Estado_IPA_02, etc.)
 * - Sin contención: cada fondo tiene sus propias temp tables
 */

const BasePipelineService = require('./BasePipelineService');
const sql = require('mssql');

class IPAService extends BasePipelineService {
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

    // Validar que la configuración tenga los 7 SPs del grupo IPA
    if (!this.config.spList || this.config.spList.length !== 7) {
      throw new Error('IPAService requiere exactamente 7 SPs en la configuración');
    }

    // Validar que los SPs estén en orden correcto
    const expectedSPs = [
      'staging.IPA_01_RescatarLocalPrice_v2',
      'staging.IPA_02_AjusteSONA_v2',
      'staging.IPA_03_RenombrarCxCCxP_v2',
      'staging.IPA_04_TratamientoSuciedades_v2',
      'staging.IPA_05_EliminarCajasMTM_v2',
      'staging.IPA_06_CrearDimensiones_v2',
      'staging.IPA_07_AgruparRegistros_v2',
    ];

    const actualSPs = this.config.spList.map(sp => sp.name);
    const missingOrWrong = expectedSPs.filter((sp, idx) => actualSPs[idx] !== sp);

    if (missingOrWrong.length > 0) {
      console.warn(
        `[IPAService] Configuración de SPs no coincide con esperado. ` +
        `Esperado: ${expectedSPs.join(', ')}. ` +
        `Actual: ${actualSPs.join(', ')}`
      );
    }
  }

  /**
   * Ejecutar pipeline IPA para un fondo específico
   *
   * Este método sobrescribe el de BasePipelineService para agregar
   * lógica específica de IPA (ej: validaciones especiales, cleanup)
   *
   * @param {Object} context - Contexto de ejecución
   * @returns {Promise<Object>} - { success, duration, metrics, skipped }
   */
  async execute(context) {
    const { idEjecucion, fechaReporte, fund } = context;
    const startTime = Date.now();

    try {
      // 1. Validaciones previas específicas de IPA
      await this.validateIPAPrerequisites(context);

      // 2. Log inicio del procesamiento IPA
      await this.logInfo(
        idEjecucion,
        fund.ID_Fund,
        `Iniciando procesamiento IPA - Fondo: ${fund.FundShortName} (${fund.Portfolio_Geneva})`
      );

      // 3. Ejecutar pipeline usando lógica base (ejecuta los 7 SPs en orden)
      const result = await super.execute(context);

      // 4. Validaciones post-procesamiento IPA
      // NOTA: Comentado porque la conexión dedicada se cierra en super.execute()
      // y las temp tables ya no están disponibles
      // if (result.success) {
      //   await this.validateIPAResults(context);
      // }

      // 5. Log resumen final
      const duration = Date.now() - startTime;
      await this.logInfo(
        idEjecucion,
        fund.ID_Fund,
        `IPA completado exitosamente en ${(duration / 1000).toFixed(2)}s - ` +
        `Fondo: ${fund.FundShortName}`
      );

      return { ...result, duration };

    } catch (error) {
      const duration = Date.now() - startTime;
      await this.logError(
        idEjecucion,
        fund.ID_Fund,
        `Error en procesamiento IPA: ${error.message}`
      );

      // Re-lanzar error para que BasePipelineService lo maneje
      throw error;
    }
  }

  /**
   * Validar pre-requisitos específicos de IPA
   *
   * @param {Object} context - Contexto de ejecución
   * @returns {Promise<void>}
   * @private
   */
  async validateIPAPrerequisites(context) {
    const { idEjecucion, fechaReporte, fund } = context;

    // Validar que el fondo tenga Portfolio_Geneva definido
    if (!fund.Portfolio_Geneva) {
      throw new Error(
        `Fondo ${fund.ID_Fund} (${fund.FundShortName}) no tiene Portfolio_Geneva definido. ` +
        `IPA requiere este campo.`
      );
    }

    // Validar que existan datos extraídos de IPA para esta fecha
    const request = this.pool.request();
    const result = await request
      .input('FechaReporte', sql.NVarChar(10), fechaReporte)
      .query(`
        SELECT COUNT(*) AS Count
        FROM extract.IPA
        WHERE FechaReporte = @FechaReporte
      `);

    const ipaCount = result.recordset[0].Count;
    if (ipaCount === 0) {
      throw new Error(
        `No hay datos extraídos de IPA para fecha ${fechaReporte}. ` +
        `Ejecutar EXTRACCION primero.`
      );
    }

    await this.logDebug(
      idEjecucion,
      fund.ID_Fund,
      `Validaciones IPA OK - Datos IPA: ${ipaCount} registros para ${fechaReporte}`
    );
  }

  /**
   * Validar resultados post-procesamiento IPA
   *
   * @param {Object} context - Contexto de ejecución
   * @returns {Promise<void>}
   * @private
   */
  async validateIPAResults(context) {
    const { idEjecucion, fechaReporte, fund } = context;

    // Verificar que se hayan generado registros finales
    // Los datos finales están en la tabla temporal que creó IPA_07
    const tempTableName = `#temp_IPA_Final_${idEjecucion}_${fund.ID_Fund}`;

    try {
      const request = this.pool.request();
      const result = await request.query(`
        IF OBJECT_ID('tempdb..${tempTableName}') IS NOT NULL
        BEGIN
          SELECT COUNT(*) AS Count FROM ${tempTableName};
        END
        ELSE
        BEGIN
          SELECT 0 AS Count;
        END
      `);

      const finalCount = result.recordset[0].Count;

      if (finalCount === 0) {
        await this.logWarning(
          idEjecucion,
          fund.ID_Fund,
          `WARNING: IPA completó pero no generó registros finales para ${fund.FundShortName}`
        );
      } else {
        await this.logInfo(
          idEjecucion,
          fund.ID_Fund,
          `Registros finales generados: ${finalCount}`
        );
      }
    } catch (error) {
      // No fallar si no se puede validar, solo loguear
      await this.logWarning(
        idEjecucion,
        fund.ID_Fund,
        `No se pudo validar resultados finales de IPA: ${error.message}`
      );
    }
  }

  /**
   * Obtener métricas específicas del procesamiento IPA
   *
   * @param {Object} context - Contexto de ejecución
   * @returns {Promise<Object>} - Métricas del procesamiento
   */
  async getIPAMetrics(context) {
    const { idEjecucion, fund } = context;

    try {
      // Leer métricas de la tabla temporal final
      const tempTableName = `#temp_IPA_Final_${idEjecucion}_${fund.ID_Fund}`;

      const request = this.pool.request();
      const result = await request.query(`
        IF OBJECT_ID('tempdb..${tempTableName}') IS NOT NULL
        BEGIN
          SELECT
            COUNT(*) AS TotalRegistros,
            COUNT(DISTINCT ID_Instrumento) AS TotalInstrumentos,
            SUM(ISNULL(MVBook, 0) + ISNULL(AI, 0)) AS TotalMVal,
            SUM(CASE WHEN BalanceSheet = 'Asset' THEN 1 ELSE 0 END) AS TotalAssets,
            SUM(CASE WHEN BalanceSheet = 'Liability' THEN 1 ELSE 0 END) AS TotalLiabilities
          FROM ${tempTableName};
        END
        ELSE
        BEGIN
          SELECT 0 AS TotalRegistros, 0 AS TotalInstrumentos, 0 AS TotalMVal,
                 0 AS TotalAssets, 0 AS TotalLiabilities;
        END
      `);

      return result.recordset[0];
    } catch (error) {
      await this.logWarning(
        idEjecucion,
        fund.ID_Fund,
        `No se pudieron obtener métricas IPA: ${error.message}`
      );

      return {
        TotalRegistros: 0,
        TotalInstrumentos: 0,
        TotalMVal: 0,
        TotalAssets: 0,
        TotalLiabilities: 0,
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
      `#temp_IPA_WorkTable_${idEjecucion}_${fund.ID_Fund}`,
      `#temp_Ajuste_SONA_${idEjecucion}_${fund.ID_Fund}`,
      `#temp_IPA_Cash_${idEjecucion}_${fund.ID_Fund}`,
      `#temp_IPA_MTM_${idEjecucion}_${fund.ID_Fund}`,
      `#temp_IPA_Final_${idEjecucion}_${fund.ID_Fund}`,
    ];

    for (const tableName of tempTables) {
      try {
        const request = this.pool.request();
        await request.query(`DROP TABLE IF EXISTS ${tableName};`);
      } catch (error) {
        // Ignorar errores de cleanup (tabla no existe, etc.)
        console.warn(
          `[IPAService] Error limpiando ${tableName} para fondo ${fund.ID_Fund}: ${error.message}`
        );
      }
    }

    await this.logDebug(
      idEjecucion,
      fund.ID_Fund,
      'Tablas temporales IPA limpiadas'
    );
  }

  /**
   * Verificar si el fondo requiere procesamiento especial
   *
   * Algunos fondos tienen lógica especial (ej: MDLAT + MLATHY se consolidan)
   *
   * @param {Object} fund - Información del fondo
   * @returns {Boolean}
   * @private
   */
  requiresSpecialProcessing(fund) {
    // Fondos que requieren consolidación MDLAT + MLATHY
    const consolidationFunds = ['MDLAT', 'MLATHY'];

    return consolidationFunds.includes(fund.FundShortName);
  }

  /**
   * Obtener nombre descriptivo del servicio
   *
   * @returns {String}
   */
  getServiceName() {
    return 'IPA Processing Service';
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

module.exports = IPAService;
