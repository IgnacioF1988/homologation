/**
 * IPAService - Servicio de procesamiento IPA (Inteligencia de Precios de Activos)
 *
 * Ejecuta pipeline de 8 SPs secuenciales para homologar posiciones de activos.
 * Hereda de BasePipelineService - solo agrega validaciones específicas.
 *
 * @module IPAService
 */

const BasePipelineService = require('./BasePipelineService');
const sql = require('mssql');

class IPAService extends BasePipelineService {
  /**
   * Constructor
   * @param {Object} serviceConfig - Configuración desde pipeline.config.yaml
   * @param {Object} pool - Connection pool de SQL Server
   */
  constructor(serviceConfig, pool) {
    super(serviceConfig, pool);

    // Validar cantidad de SPs
    if (!this.config.spList || this.config.spList.length !== 8) {
      throw new Error('IPAService requiere exactamente 8 SPs en la configuración');
    }
  }

  /**
   * Ejecutar pipeline IPA
   * Delega completamente a BasePipelineService (que emite eventos automáticamente)
   */
  async execute(context) {
    // Validar pre-requisitos antes de ejecutar
    await this.validateIPAPrerequisites(context);

    // Delegar a clase base (emite eventos, maneja transacciones, etc.)
    return await super.execute(context);
  }

  /**
   * Validar pre-requisitos específicos de IPA
   * @private
   */
  async validateIPAPrerequisites(context) {
    const { fechaReporte, fund } = context;

    // Validar Portfolio_Geneva
    if (!fund.Portfolio_Geneva) {
      throw new Error(`Fondo ${fund.ID_Fund} (${fund.FundShortName}) no tiene Portfolio_Geneva definido.`);
    }

    // Validar que existan datos extraídos
    const request = this.pool.request();
    const result = await request
      .input('FechaReporte', sql.NVarChar(10), fechaReporte)
      .query(`SELECT COUNT(*) AS Count FROM extract.IPA WHERE FechaReporte = @FechaReporte`);

    if (result.recordset[0].Count === 0) {
      throw new Error(`No hay datos extraídos de IPA para fecha ${fechaReporte}.`);
    }
  }

  getServiceName() {
    return 'IPA Processing Service';
  }

  getVersion() {
    return '3.0.0';
  }
}

module.exports = IPAService;
