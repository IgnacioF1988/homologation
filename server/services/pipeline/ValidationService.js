/**
 * ValidationService - Validación global de datos extraídos
 *
 * Valida que fondos activos tengan datos en tablas extract.* según sus flags.
 * Servicio GLOBAL: valida toda la fecha en una sola ejecución.
 *
 * NO extiende BasePipelineService (patrón diferente para validación global).
 *
 * @module ValidationService
 */

const sql = require('mssql');
const pipelineEvents = require('../events/PipelineEventEmitter');

class ValidationService {
  /**
   * Constructor
   * @param {Object} serviceConfig - Configuración desde pipeline.config.yaml
   * @param {Object} pool - Pool de conexiones SQL Server
   */
  constructor(serviceConfig, pool) {
    this.config = serviceConfig;
    this.pool = pool;
    this.id = serviceConfig.id;
    this.name = serviceConfig.name || serviceConfig.id;
  }

  /**
   * Ejecutar validaciones globales
   */
  async execute(context) {
    const { idEjecucion, fechaReporte } = context;
    const startTime = Date.now();

    try {
      pipelineEvents.emitServicioInicio(idEjecucion, 0, this.id, { fechaReporte });

      const problemas = {
        fondosSinIPA: [],
        fondosSinPosModRF: [],
        fondosSinSONA: [],
        fondosSinCAPM: [],
        fondosSinDerivados: [],
        fondosSinUBS: [],
        total: 0
      };

      // Ejecutar validaciones
      problemas.fondosSinIPA = await this._validateIPA(idEjecucion, fechaReporte);
      problemas.total += problemas.fondosSinIPA.length;

      problemas.fondosSinPosModRF = await this._validatePosModRF(idEjecucion, fechaReporte);
      problemas.total += problemas.fondosSinPosModRF.length;

      problemas.fondosSinSONA = await this._validateSONA(idEjecucion, fechaReporte);
      problemas.total += problemas.fondosSinSONA.length;

      problemas.fondosSinCAPM = await this._validateCAPM(idEjecucion, fechaReporte);
      problemas.total += problemas.fondosSinCAPM.length;

      problemas.fondosSinDerivados = await this._validateDerivados(idEjecucion, fechaReporte);
      problemas.total += problemas.fondosSinDerivados.length;

      problemas.fondosSinUBS = await this._validateUBS(idEjecucion, fechaReporte);
      problemas.total += problemas.fondosSinUBS.length;

      const duration = Date.now() - startTime;

      if (problemas.total === 0) {
        pipelineEvents.emitServicioFin(idEjecucion, 0, this.id, duration, { problemasDetectados: 0 });
        return { success: true, problemasDetectados: 0 };
      } else {
        // Emitir warning por cada tipo de problema
        for (const fondo of problemas.fondosSinIPA) {
          pipelineEvents.emitServicioWarning(idEjecucion, fondo.ID_Fund, this.id, `Sin datos IPA para ${fondo.Portfolio_Geneva}`);
        }

        pipelineEvents.emitServicioFin(idEjecucion, 0, this.id, duration, { problemasDetectados: problemas.total });
        return { success: true, problemasDetectados: problemas.total, detalle: problemas };
      }

    } catch (error) {
      pipelineEvents.emitServicioError(idEjecucion, 0, this.id, error);
      throw error;
    }
  }

  /**
   * Validar fondos activos sin datos IPA
   * @private
   */
  async _validateIPA(idEjecucion, fechaReporte) {
    const result = await this.pool.request()
      .input('ID_Ejecucion', sql.BigInt, idEjecucion)
      .input('FechaReporte', sql.NVarChar(10), fechaReporte)
      .query(`
        SELECT ef.ID_Fund, ef.FundShortName, ef.Portfolio_Geneva
        FROM logs.Ejecucion_Fondos ef
        WHERE ef.ID_Ejecucion = @ID_Ejecucion
          AND ef.Incluir_En_Cubo = 1
          AND NOT EXISTS (
            SELECT 1 FROM extract.IPA ipa
            WHERE ipa.FechaReporte = @FechaReporte AND ipa.Portfolio = ef.Portfolio_Geneva
          )
      `);

    // Registrar problemas
    for (const fondo of result.recordset) {
      await this._registerProblem(idEjecucion, fondo.ID_Fund, fechaReporte, 'VALIDACION',
        `Fondo activo sin datos en extract.IPA para Portfolio ${fondo.Portfolio_Geneva}`);
    }

    return result.recordset;
  }

  /**
   * Validar fondos activos sin PosModRF
   * @private
   */
  async _validatePosModRF(idEjecucion, fechaReporte) {
    const result = await this.pool.request()
      .input('ID_Ejecucion', sql.BigInt, idEjecucion)
      .input('FechaReporte', sql.NVarChar(10), fechaReporte)
      .query(`
        SELECT ef.ID_Fund, ef.FundShortName, ef.Portfolio_Geneva
        FROM logs.Ejecucion_Fondos ef
        WHERE ef.ID_Ejecucion = @ID_Ejecucion
          AND ef.Incluir_En_Cubo = 1
          AND NOT EXISTS (
            SELECT 1 FROM extract.PosModRF pm
            WHERE pm.FechaReporte = @FechaReporte AND pm.Portfolio = ef.Portfolio_Geneva
          )
      `);

    for (const fondo of result.recordset) {
      await this._registerProblem(idEjecucion, fondo.ID_Fund, fechaReporte, 'VALIDACION',
        `Fondo activo sin datos en extract.PosModRF`);
    }

    return result.recordset;
  }

  /**
   * Validar fondos activos sin SONA
   * @private
   */
  async _validateSONA(idEjecucion, fechaReporte) {
    const result = await this.pool.request()
      .input('ID_Ejecucion', sql.BigInt, idEjecucion)
      .input('FechaReporte', sql.NVarChar(10), fechaReporte)
      .query(`
        SELECT ef.ID_Fund, ef.FundShortName, ef.Portfolio_Geneva
        FROM logs.Ejecucion_Fondos ef
        WHERE ef.ID_Ejecucion = @ID_Ejecucion
          AND ef.Incluir_En_Cubo = 1
          AND NOT EXISTS (
            SELECT 1 FROM extract.SONA s
            WHERE s.FechaReporte = @FechaReporte AND s.Portfolio = ef.Portfolio_Geneva
          )
      `);

    for (const fondo of result.recordset) {
      await this._registerProblem(idEjecucion, fondo.ID_Fund, fechaReporte, 'VALIDACION',
        `Fondo activo sin datos en extract.SONA`);
    }

    return result.recordset;
  }

  /**
   * Validar fondos activos sin CAPM
   * @private
   */
  async _validateCAPM(idEjecucion, fechaReporte) {
    const result = await this.pool.request()
      .input('ID_Ejecucion', sql.BigInt, idEjecucion)
      .input('FechaReporte', sql.NVarChar(10), fechaReporte)
      .query(`
        SELECT ef.ID_Fund, ef.FundShortName, ef.Portfolio_Geneva
        FROM logs.Ejecucion_Fondos ef
        WHERE ef.ID_Ejecucion = @ID_Ejecucion
          AND ef.Incluir_En_Cubo = 1
          AND NOT EXISTS (
            SELECT 1 FROM extract.CAPM c
            WHERE c.FechaReporte = @FechaReporte AND c.Portfolio = ef.Portfolio_Geneva
          )
      `);

    for (const fondo of result.recordset) {
      await this._registerProblem(idEjecucion, fondo.ID_Fund, fechaReporte, 'VALIDACION',
        `Fondo activo sin datos en extract.CAPM`);
    }

    return result.recordset;
  }

  /**
   * Validar fondos con Flag_Derivados=1 sin datos
   * @private
   */
  async _validateDerivados(idEjecucion, fechaReporte) {
    const result = await this.pool.request()
      .input('ID_Ejecucion', sql.BigInt, idEjecucion)
      .input('FechaReporte', sql.NVarChar(10), fechaReporte)
      .query(`
        SELECT ef.ID_Fund, ef.FundShortName, ef.Portfolio_Derivados
        FROM logs.Ejecucion_Fondos ef
        WHERE ef.ID_Ejecucion = @ID_Ejecucion
          AND ef.Incluir_En_Cubo = 1
          AND ef.Flag_Derivados = 1
          AND NOT EXISTS (
            SELECT 1 FROM extract.Derivados d
            WHERE d.FechaReporte = @FechaReporte AND d.Portfolio = ef.Portfolio_Derivados
          )
      `);

    for (const fondo of result.recordset) {
      await this._registerProblem(idEjecucion, fondo.ID_Fund, fechaReporte, 'VALIDACION',
        `Fondo requiere derivados sin datos en extract.Derivados`);
    }

    return result.recordset;
  }

  /**
   * Validar fondos con Flag_UBS=1 sin datos
   * @private
   */
  async _validateUBS(idEjecucion, fechaReporte) {
    const result = await this.pool.request()
      .input('ID_Ejecucion', sql.BigInt, idEjecucion)
      .input('FechaReporte', sql.NVarChar(10), fechaReporte)
      .query(`
        SELECT ef.ID_Fund, ef.FundShortName, ef.Portfolio_UBS
        FROM logs.Ejecucion_Fondos ef
        WHERE ef.ID_Ejecucion = @ID_Ejecucion
          AND ef.Incluir_En_Cubo = 1
          AND ef.Flag_UBS = 1
          AND NOT EXISTS (
            SELECT 1 FROM extract.UBS u
            WHERE u.FechaReporte = @FechaReporte AND u.Portfolio = ef.Portfolio_UBS
          )
      `);

    for (const fondo of result.recordset) {
      await this._registerProblem(idEjecucion, fondo.ID_Fund, fechaReporte, 'VALIDACION',
        `Fondo requiere UBS sin datos en extract.UBS`);
    }

    return result.recordset;
  }

  /**
   * Registrar problema en sandbox.Fondos_Problema
   * @private
   */
  async _registerProblem(idEjecucion, idFund, fechaReporte, proceso, tipoProblema) {
    try {
      await this.pool.request()
        .input('FechaReporte', sql.NVarChar(10), fechaReporte)
        .input('ID_Fund', sql.Int, idFund)
        .input('Proceso', sql.NVarChar(50), proceso)
        .input('Tipo_Problema', sql.NVarChar(500), tipoProblema)
        .query(`
          IF NOT EXISTS (
            SELECT 1 FROM sandbox.Fondos_Problema
            WHERE FechaReporte = @FechaReporte AND ID_Fund = @ID_Fund AND Proceso = @Proceso
          )
          BEGIN
            INSERT INTO sandbox.Fondos_Problema (FechaReporte, ID_Fund, Proceso, Tipo_Problema, FechaProceso)
            VALUES (@FechaReporte, @ID_Fund, @Proceso, @Tipo_Problema, CONVERT(NVARCHAR, GETDATE(), 120));
          END
        `);
    } catch (_error) {
      // No fallar el pipeline si falla registro de problema
    }
  }
}

module.exports = ValidationService;
