/**
 * PNLService - Servicio de procesamiento PNL (Profit & Loss)
 *
 * Ejecuta pipeline de 5 SPs para procesar Profit & Loss.
 * Consolida IPA + PNL en tabla unificada.
 * Hereda de BasePipelineService.
 *
 * @module PNLService
 */

const BasePipelineService = require('./BasePipelineService');
const sql = require('mssql');

class PNLService extends BasePipelineService {
  /**
   * Constructor
   * @param {Object} serviceConfig - Configuración desde pipeline.config.yaml
   * @param {Object} pool - Connection pool de SQL Server
   */
  constructor(serviceConfig, pool) {
    super(serviceConfig, pool);

    if (!this.config.spList || this.config.spList.length !== 5) {
      throw new Error('PNLService requiere exactamente 5 SPs en la configuración');
    }
  }

  /**
   * Ejecutar pipeline PNL
   * Delega completamente a BasePipelineService
   */
  async execute(context) {
    await this.validatePNLPrerequisites(context);
    return await super.execute(context);
  }

  /**
   * Validar pre-requisitos específicos de PNL
   * @private
   */
  async validatePNLPrerequisites(context) {
    const { idEjecucion, fund } = context;

    if (!fund.Portfolio_Geneva) {
      throw new Error(`Fondo ${fund.ID_Fund} (${fund.FundShortName}) no tiene Portfolio_Geneva definido.`);
    }

    // Validar que IPA haya completado exitosamente
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
      throw new Error(`PNL requiere que IPA haya completado exitosamente. Estado actual: ${result.recordset[0]?.Estado_Process_IPA || 'DESCONOCIDO'}`);
    }
  }

  getServiceName() {
    return 'PNL Processing Service';
  }

  getVersion() {
    return '3.0.0';
  }
}

module.exports = PNLService;
