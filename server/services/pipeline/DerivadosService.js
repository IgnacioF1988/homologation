/**
 * DerivadosService - Servicio de procesamiento de Derivados
 *
 * Ejecuta pipeline de 4 SPs para procesar derivados financieros.
 * Solo ejecuta si Flag_Derivados = 1 (condicional en config).
 * Hereda de BasePipelineService.
 *
 * @module DerivadosService
 */

const BasePipelineService = require('./BasePipelineService');
const sql = require('mssql');

class DerivadosService extends BasePipelineService {
  /**
   * Constructor
   * @param {Object} serviceConfig - Configuración desde pipeline.config.yaml
   * @param {Object} pool - Connection pool de SQL Server
   */
  constructor(serviceConfig, pool) {
    super(serviceConfig, pool);

    if (!this.config.spList || this.config.spList.length !== 4) {
      throw new Error('DerivadosService requiere exactamente 4 SPs en la configuración');
    }
  }

  /**
   * Ejecutar pipeline Derivados
   * Delega completamente a BasePipelineService
   */
  async execute(context) {
    await this.validateDerivadosPrerequisites(context);
    return await super.execute(context);
  }

  /**
   * Validar pre-requisitos específicos de Derivados
   * @private
   */
  async validateDerivadosPrerequisites(context) {
    const { fechaReporte, fund } = context;

    if (!fund.Portfolio_Derivados) {
      throw new Error(`Fondo ${fund.ID_Fund} (${fund.FundShortName}) no tiene Portfolio_Derivados definido.`);
    }

    // Validar que existan datos extraídos
    const request = this.pool.request();
    const result = await request
      .input('FechaReporte', sql.NVarChar(10), fechaReporte)
      .input('Portfolio', sql.NVarChar(50), fund.Portfolio_Derivados)
      .query(`
        SELECT COUNT(*) AS Count FROM extract.Derivados
        WHERE FechaReporte = @FechaReporte AND Portfolio = @Portfolio
      `);

    if (result.recordset[0].Count === 0) {
      throw new Error(`No hay datos extraídos de Derivados para ${fechaReporte} y portfolio ${fund.Portfolio_Derivados}.`);
    }
  }

  getServiceName() {
    return 'Derivados Processing Service';
  }

  getVersion() {
    return '3.0.0';
  }
}

module.exports = DerivadosService;
