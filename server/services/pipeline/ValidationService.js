/**
 * ValidationService - Validación de Datos Extraídos (POST-EXTRACCIÓN)
 *
 * Responsable de validar datos extraídos GLOBALMENTE (toda la fecha).
 * Identifica fondos activos sin datos y registra problemas críticos.
 *
 * Características:
 * - Validación global de IPA, PosModRF, SONA, CAPM, Derivados, UBS
 * - Identificación de fondos activos sin datos (usando flags BD_Funds)
 * - Registro automático en sandbox.Fondos_Problema
 * - Exclusión automática de fondos problemáticos
 *
 * IMPORTANTE: Este servicio se ejecuta POST-EXTRACCIÓN (después de Extract_*)
 * y ANTES de Process_IPA para evitar desperdiciar procesamiento en fondos sin datos.
 *
 * @author Claude Code - Stand-by System Implementation
 * @date 2025-12-23
 */

const sql = require('mssql');
const BasePipelineService = require('./BasePipelineService');

class ValidationService extends BasePipelineService {
  /**
   * Ejecutar validaciones globales de datos extraídos
   *
   * Este servicio es BATCH (no por fondo) - valida toda la fecha.
   * Verifica que fondos activos tengan datos en extract.* según flags.
   *
   * @param {Object} context - Contexto de ejecución
   * @param {BigInt} context.idEjecucion - ID de la ejecución
   * @param {String} context.fechaReporte - Fecha a procesar (YYYY-MM-DD)
   * @param {Object} context.fund - null (batch service)
   * @returns {Promise<Object>} - { success, problemasDetectados }
   */
  async execute(context) {
    const { idEjecucion, fechaReporte } = context;
    const startTime = Date.now();

    try {
      await this.logInfo(idEjecucion, null, `Iniciando validación global de datos extraídos para ${fechaReporte}`);
      await this.updateState(idEjecucion, null, 'EN_PROGRESO');

      // Objeto para acumular problemas
      const problemas = {
        fondosSinIPA: [],
        fondosSinPosModRF: [],
        fondosSinSONA: [],
        fondosSinCAPM: [],
        fondosSinDerivados: [],
        fondosSinUBS: [],
        total: 0
      };

      // ============================================
      // VALIDACIÓN 1: Fondos activos sin datos IPA
      // ============================================
      const ipaProblems = await this._validateIPA(idEjecucion, fechaReporte);
      problemas.fondosSinIPA = ipaProblems;
      problemas.total += ipaProblems.length;

      // ============================================
      // VALIDACIÓN 2: Fondos activos sin PosModRF
      // ============================================
      const posModProblems = await this._validatePosModRF(idEjecucion, fechaReporte);
      problemas.fondosSinPosModRF = posModProblems;
      problemas.total += posModProblems.length;

      // ============================================
      // VALIDACIÓN 3: Fondos activos sin SONA
      // ============================================
      const sonaProblems = await this._validateSONA(idEjecucion, fechaReporte);
      problemas.fondosSinSONA = sonaProblems;
      problemas.total += sonaProblems.length;

      // ============================================
      // VALIDACIÓN 4: Fondos activos sin CAPM
      // ============================================
      const capmProblems = await this._validateCAPM(idEjecucion, fechaReporte);
      problemas.fondosSinCAPM = capmProblems;
      problemas.total += capmProblems.length;

      // ============================================
      // VALIDACIÓN 5: Fondos con Flag_Derivados sin datos
      // ============================================
      const derivadosProblems = await this._validateDerivados(idEjecucion, fechaReporte);
      problemas.fondosSinDerivados = derivadosProblems;
      problemas.total += derivadosProblems.length;

      // ============================================
      // VALIDACIÓN 6: Fondos con Flag_UBS sin datos
      // ============================================
      const ubsProblems = await this._validateUBS(idEjecucion, fechaReporte);
      problemas.fondosSinUBS = ubsProblems;
      problemas.total += ubsProblems.length;

      // ============================================
      // Resumen de validación
      // ============================================
      const duration = Date.now() - startTime;

      if (problemas.total === 0) {
        await this.logInfo(idEjecucion, null,
          `✅ Validación global completada en ${duration}ms - Sin problemas detectados`);
        await this.updateState(idEjecucion, null, 'OK');
        return { success: true, problemasDetectados: 0 };
      } else {
        await this.logWarning(idEjecucion, null,
          `⚠️ Validación global completada en ${duration}ms - ${problemas.total} fondos con problemas detectados`);

        // Generar reporte detallado
        const reporte = this._generarReporte(problemas);
        await this.logWarning(idEjecucion, null, reporte);

        await this.updateState(idEjecucion, null, 'WARNING');
        return { success: true, problemasDetectados: problemas.total, detalle: problemas };
      }

    } catch (error) {
      await this.logError(idEjecucion, null, `Error en validación global: ${error.message}`);
      await this.updateState(idEjecucion, null, 'ERROR');
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
          AND ef.Incluir_En_Cubo = 1  -- Solo fondos que se procesarán
          AND NOT EXISTS (
            SELECT 1 FROM extract.IPA ipa
            WHERE ipa.FechaReporte = @FechaReporte
              AND ipa.Portfolio = ef.Portfolio_Geneva
          )
      `);

    // Registrar problemas en sandbox.Fondos_Problema
    for (const fondo of result.recordset) {
      await this.registerFundProblem(
        idEjecucion,
        fondo.ID_Fund,
        'VALIDACION',
        `Fondo activo sin datos en extract.IPA para Portfolio ${fondo.Portfolio_Geneva}`
      );
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
            WHERE pm.FechaReporte = @FechaReporte
              AND pm.Portfolio = ef.Portfolio_Geneva
          )
      `);

    for (const fondo of result.recordset) {
      await this.registerFundProblem(
        idEjecucion,
        fondo.ID_Fund,
        'VALIDACION',
        `Fondo activo sin datos en extract.PosModRF para Portfolio ${fondo.Portfolio_Geneva}`
      );
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
            WHERE s.FechaReporte = @FechaReporte
              AND s.Portfolio = ef.Portfolio_Geneva
          )
      `);

    for (const fondo of result.recordset) {
      await this.registerFundProblem(
        idEjecucion,
        fondo.ID_Fund,
        'VALIDACION',
        `Fondo activo sin datos en extract.SONA para Portfolio ${fondo.Portfolio_Geneva}`
      );
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
            WHERE c.FechaReporte = @FechaReporte
              AND c.Portfolio = ef.Portfolio_Geneva
          )
      `);

    for (const fondo of result.recordset) {
      await this.registerFundProblem(
        idEjecucion,
        fondo.ID_Fund,
        'VALIDACION',
        `Fondo activo sin datos en extract.CAPM (CASH APPRAISAL) para Portfolio ${fondo.Portfolio_Geneva}`
      );
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
          AND ef.Flag_Derivados = 1  -- Solo fondos que REQUIEREN derivados
          AND NOT EXISTS (
            SELECT 1 FROM extract.Derivados d
            WHERE d.FechaReporte = @FechaReporte
              AND d.Portfolio = ef.Portfolio_Derivados
          )
      `);

    for (const fondo of result.recordset) {
      await this.registerFundProblem(
        idEjecucion,
        fondo.ID_Fund,
        'VALIDACION',
        `Fondo requiere derivados (Flag_Derivados=1) sin datos en extract.Derivados para Portfolio ${fondo.Portfolio_Derivados}`
      );
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
          AND ef.Flag_UBS = 1  -- Solo fondos que REQUIEREN UBS
          AND NOT EXISTS (
            SELECT 1 FROM extract.UBS u
            WHERE u.FechaReporte = @FechaReporte
              AND u.Portfolio = ef.Portfolio_UBS
          )
      `);

    for (const fondo of result.recordset) {
      await this.registerFundProblem(
        idEjecucion,
        fondo.ID_Fund,
        'VALIDACION',
        `Fondo requiere UBS (Flag_UBS=1) sin datos en extract.UBS para Portfolio ${fondo.Portfolio_UBS}`
      );
    }

    return result.recordset;
  }

  /**
   * Generar reporte detallado de problemas
   * @private
   */
  _generarReporte(problemas) {
    const lineas = [
      '📋 REPORTE DE VALIDACIÓN POST-EXTRACCIÓN:',
      '================================================'
    ];

    if (problemas.fondosSinIPA.length > 0) {
      lineas.push(`❌ Fondos activos sin IPA: ${problemas.fondosSinIPA.length}`);
      problemas.fondosSinIPA.forEach(f => {
        lineas.push(`   - ${f.FundShortName} (ID=${f.ID_Fund}, Portfolio=${f.Portfolio_Geneva})`);
      });
    }

    if (problemas.fondosSinPosModRF.length > 0) {
      lineas.push(`❌ Fondos activos sin PosModRF: ${problemas.fondosSinPosModRF.length}`);
      problemas.fondosSinPosModRF.forEach(f => {
        lineas.push(`   - ${f.FundShortName} (ID=${f.ID_Fund}, Portfolio=${f.Portfolio_Geneva})`);
      });
    }

    if (problemas.fondosSinSONA.length > 0) {
      lineas.push(`❌ Fondos activos sin SONA: ${problemas.fondosSinSONA.length}`);
      problemas.fondosSinSONA.forEach(f => {
        lineas.push(`   - ${f.FundShortName} (ID=${f.ID_Fund}, Portfolio=${f.Portfolio_Geneva})`);
      });
    }

    if (problemas.fondosSinCAPM.length > 0) {
      lineas.push(`❌ Fondos activos sin CAPM: ${problemas.fondosSinCAPM.length}`);
      problemas.fondosSinCAPM.forEach(f => {
        lineas.push(`   - ${f.FundShortName} (ID=${f.ID_Fund}, Portfolio=${f.Portfolio_Geneva})`);
      });
    }

    if (problemas.fondosSinDerivados.length > 0) {
      lineas.push(`❌ Fondos con Flag_Derivados sin datos: ${problemas.fondosSinDerivados.length}`);
      problemas.fondosSinDerivados.forEach(f => {
        lineas.push(`   - ${f.FundShortName} (ID=${f.ID_Fund}, Portfolio=${f.Portfolio_Derivados})`);
      });
    }

    if (problemas.fondosSinUBS.length > 0) {
      lineas.push(`❌ Fondos con Flag_UBS sin datos: ${problemas.fondosSinUBS.length}`);
      problemas.fondosSinUBS.forEach(f => {
        lineas.push(`   - ${f.FundShortName} (ID=${f.ID_Fund}, Portfolio=${f.Portfolio_UBS})`);
      });
    }

    lineas.push('================================================');
    lineas.push(`TOTAL FONDOS CON PROBLEMAS: ${problemas.total}`);
    lineas.push('ACCIÓN: Fondos registrados en sandbox.Fondos_Problema y serán OMITIDOS del pipeline');

    return lineas.join('\n');
  }
}

module.exports = ValidationService;
