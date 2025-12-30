/**
 * CAPMService - Servicio de procesamiento CAPM (Cash Appraisal Model)
 *
 * Ejecuta pipeline de 2 SPs para validar efectivo del fondo.
 * Hereda de BasePipelineService - solo agrega validaciones específicas.
 *
 * @module CAPMService
 */

const BasePipelineService = require('./BasePipelineService');

class CAPMService extends BasePipelineService {
  /**
   * Constructor
   * @param {Object} serviceConfig - Configuración desde pipeline.config.yaml
   * @param {Object} pool - Connection pool de SQL Server
   */
  constructor(serviceConfig, pool) {
    super(serviceConfig, pool);

    // Validar cantidad de SPs
    if (!this.config.spList || this.config.spList.length !== 2) {
      throw new Error('CAPMService requiere exactamente 2 SPs en la configuración');
    }
  }

  /**
   * Ejecutar pipeline CAPM
   * Delega completamente a BasePipelineService
   */
  async execute(context) {
    await this.validateCAPMPrerequisites(context);
    return await super.execute(context);
  }

  /**
   * Validar pre-requisitos específicos de CAPM
   * @private
   */
  async validateCAPMPrerequisites(context) {
    const { fund } = context;

    if (!fund.Portfolio_Geneva) {
      throw new Error(`Fondo ${fund.ID_Fund} (${fund.FundShortName}) no tiene Portfolio_Geneva definido.`);
    }
  }

  getServiceName() {
    return 'CAPM Processing Service';
  }

  getVersion() {
    return '3.0.0';
  }
}

module.exports = CAPMService;
