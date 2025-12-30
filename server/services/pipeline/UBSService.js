/**
 * UBSService - Servicio de procesamiento UBS/Fondos Luxemburgo
 *
 * Ejecuta pipeline de 3 SPs para procesar fondos UBS.
 * INDEPENDIENTE: No requiere IPA, solo extracción UBS.
 * Solo ejecuta si Flag_UBS = 1.
 * Hereda de BasePipelineService.
 *
 * @module UBSService
 */

const BasePipelineService = require('./BasePipelineService');
const sql = require('mssql');

class UBSService extends BasePipelineService {
  /**
   * Constructor
   * @param {Object} serviceConfig - Configuración desde pipeline.config.yaml
   * @param {Object} pool - Connection pool de SQL Server
   */
  constructor(serviceConfig, pool) {
    super(serviceConfig, pool);

    if (!this.config.spList || this.config.spList.length !== 3) {
      throw new Error('UBSService requiere exactamente 3 SPs en la configuración');
    }
  }

  /**
   * Ejecutar pipeline UBS
   * Delega completamente a BasePipelineService
   */
  async execute(context) {
    await this.validateUBSPrerequisites(context);
    return await super.execute(context);
  }

  /**
   * Validar pre-requisitos específicos de UBS
   * @private
   */
  async validateUBSPrerequisites(context) {
    const { fechaReporte, fund } = context;

    if (!fund.Portfolio_UBS) {
      throw new Error(`Fondo ${fund.ID_Fund} (${fund.FundShortName}) no tiene Portfolio_UBS definido.`);
    }

    // Validar que existan datos extraídos
    const request = this.pool.request();
    const result = await request
      .input('FechaReporte', sql.NVarChar(10), fechaReporte)
      .input('Portfolio', sql.NVarChar(50), fund.Portfolio_UBS)
      .query(`
        SELECT COUNT(*) AS Count FROM extract.UBS
        WHERE FechaReporte = @FechaReporte AND Portfolio = @Portfolio
      `);

    if (result.recordset[0].Count === 0) {
      throw new Error(`No hay datos extraídos de UBS para ${fechaReporte} y portfolio ${fund.Portfolio_UBS}.`);
    }
  }

  getServiceName() {
    return 'UBS Processing Service (Fondos Luxemburgo)';
  }

  getVersion() {
    return '3.0.0';
  }
}

module.exports = UBSService;
