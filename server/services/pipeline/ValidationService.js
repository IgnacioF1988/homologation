/**
 * ValidationService - Validación global de datos extraídos
 *
 * Valida que fondos activos tengan datos en tablas extract.* según sus flags.
 * Identifica fondos sin datos y los registra en sandbox.Fondos_Problema para
 * exclusión automática del procesamiento.
 *
 * RECIBE:
 * - serviceConfig: Configuración desde pipeline.config.yaml
 * - pool: Pool de conexiones SQL Server (compartido)
 * - tracker: ExecutionTracker para actualizar estados
 * - logger: LoggingService para registrar eventos
 * - context: { idEjecucion, fechaReporte } (NO recibe fund, es servicio global)
 *
 * PROCESA:
 * 1. Valida fondos activos sin IPA (Incluir_En_Cubo=1)
 * 2. Valida fondos activos sin PosModRF
 * 3. Valida fondos activos sin SONA
 * 4. Valida fondos activos sin CAPM
 * 5. Valida fondos con Flag_Derivados=1 sin datos Derivados
 * 6. Valida fondos con Flag_UBS=1 sin datos UBS
 * 7. Registra cada problema en sandbox.Fondos_Problema
 * 8. Genera reporte detallado de todos los problemas
 *
 * ENVIA:
 * - Problemas a: sandbox.Fondos_Problema (exclusión automática)
 * - Logs a: LoggingService → logs.Ejecucion_Logs
 * - Estado a: logs.Ejecucion_Fondos (WARNING si hay problemas, OK si no)
 *
 * DEPENDENCIAS:
 * - Requiere: EXTRACCION completada (extract.* con datos)
 * - Requerido por: PROCESS_IPA (no procesa fondos sin datos)
 *
 * CONTEXTO PARALELO:
 * - Servicio GLOBAL (no por fondo): valida toda la fecha en una sola ejecución
 * - Se ejecuta UNA VEZ por proceso, después de que todos los fondos extrajeron
 * - Consulta extract.* filtrando por FechaReporte (sin ID_Ejecucion en WHERE)
 * - Fondos detectados NO se procesarán en fases posteriores (IPA, CAPM, etc.)
 */

const sql = require('mssql');
const BasePipelineService = require('./BasePipelineService');

class ValidationService extends BasePipelineService {
  /**
   * Ejecutar validaciones globales de datos extraídos
   *
   * Servicio GLOBAL (no por fondo): valida toda la fecha en una sola ejecución.
   * Verifica que fondos activos tengan datos en extract.* según sus flags.
   *
   * @param {Object} context - Contexto de ejecución (viene de: FundOrchestrator)
   * @param {BigInt} context.idEjecucion - ID de ejecución (para logging, no para filtrar datos)
   * @param {String} context.fechaReporte - Fecha a validar (YYYY-MM-DD)
   * @param {Object} context.fund - null (servicio global, no recibe fondo específico)
   * @returns {Promise<Object>} - { success: true, problemasDetectados: número, detalle?: objeto }
   *
   * Flujo:
   * 1. Ejecuta 6 validaciones en paralelo (IPA, PosModRF, SONA, CAPM, Derivados, UBS)
   * 2. Cada validación:
   *    - Consulta logs.Ejecucion_Fondos para fondos activos (Incluir_En_Cubo=1)
   *    - Verifica existencia de datos en extract.* por Portfolio
   *    - Registra fondos sin datos en sandbox.Fondos_Problema
   * 3. Acumula problemas de todas las validaciones
   * 4. Genera reporte detallado si hay problemas
   * 5. Retorna WARNING si hay problemas, OK si no
   *
   * Nota: Fondos registrados en Fondos_Problema serán omitidos en procesamiento posterior
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

        // Generar reporte detallado en el campo 'detalle' para evitar truncamiento
        const reporte = this._generarReporte(problemas);
        await this.logWarning(idEjecucion, null,
          '📋 REPORTE DE VALIDACIÓN POST-EXTRACCIÓN',
          { detalle: reporte });

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
   *
   * Identifica fondos con Incluir_En_Cubo=1 que no tienen datos en extract.IPA
   * para su Portfolio_Geneva en la fecha especificada.
   *
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
   * Generar reporte detallado de problemas detectados
   *
   * Formatea los problemas en un reporte legible con estructura:
   * - Tipo de problema (IPA, CAPM, etc.)
   * - Lista de fondos afectados con ID y Portfolio
   * - Total de fondos con problemas
   * - Acción tomada (registro en Fondos_Problema)
   *
   * @private
   */
  _generarReporte(problemas) {
    const lineas = [
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
