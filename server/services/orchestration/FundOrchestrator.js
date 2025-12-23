/**
 * FundOrchestrator - Orquestador de Ejecución por Fondo
 *
 * ESTADO: IMPLEMENTACIÓN PARCIAL (FASE 1 Semana 2)
 *
 * Este módulo proporciona funcionalidad de stand-by blocking para el pipeline V2.
 * La implementación completa de orquestación paralela vendrá en fases posteriores.
 *
 * Funcionalidad implementada:
 * - Verificación de estado stand-by antes de ejecutar servicios
 * - Exclusión automática de fondos con problemas
 * - Manejo de StandByRequiredError
 *
 * Funcionalidad pendiente (migración futura):
 * - Reemplazo completo de process.Process_Funds
 * - Orquestación paralela de múltiples fondos
 * - Gestión de dependencias entre servicios
 * - Pipeline completo IPA → CAPM → DERIVADOS → PNL → UBS → CONCATENAR
 *
 * @version 1.0.0-partial
 * @date 2025-01
 */

const sql = require('mssql');
const { StandByRequiredError } = require('../pipeline/BasePipelineService');

class FundOrchestrator {
  /**
   * Constructor
   *
   * @param {Object} pool - Connection pool de SQL Server
   * @param {BigInt} idEjecucion - ID de la ejecución actual
   * @param {String} fechaReporte - Fecha a procesar (YYYY-MM-DD)
   * @param {Object} logger - LoggingService para registrar eventos
   * @param {Object} tracker - ExecutionTracker para actualizar estados
   */
  constructor(pool, idEjecucion, fechaReporte, logger, tracker) {
    this.pool = pool;
    this.idEjecucion = idEjecucion;
    this.fechaReporte = fechaReporte;
    this.logger = logger;
    this.tracker = tracker;
  }

  /**
   * Verificar estado stand-by de un fondo antes de ejecutar servicio
   *
   * Consulta logs.Ejecucion_Fondos para determinar si el fondo está en PAUSADO
   * y si el servicio que se va a ejecutar está bloqueado por el punto de pausa.
   *
   * @param {Object} fund - Información del fondo
   * @param {Number} fund.ID_Fund - ID del fondo
   * @param {String} serviceId - ID del servicio a ejecutar (ej: 'PROCESS_CAPM')
   * @returns {Promise<Object>} - { isPaused: boolean, puntoBloqueo?: string, motivo?: string }
   */
  async _checkFundStandByStatus(fund, serviceId) {
    try {
      const result = await this.pool.request()
        .input('ID_Ejecucion', sql.BigInt, this.idEjecucion)
        .input('ID_Fund', sql.Int, fund.ID_Fund)
        .query(`
          SELECT EstadoStandBy, PuntoBloqueoActual,
                 TieneSuciedades, TieneProblemasHomologacion,
                 TieneDescuadres, TieneProblemasCAPM
          FROM logs.Ejecucion_Fondos
          WHERE ID_Ejecucion = @ID_Ejecucion AND ID_Fund = @ID_Fund
        `);

      // Si no hay registro o no está pausado, permitir ejecución
      if (!result.recordset[0] || result.recordset[0].EstadoStandBy !== 'PAUSADO') {
        return { isPaused: false };
      }

      const estado = result.recordset[0];

      // Mapear puntos de bloqueo a servicios bloqueados
      const puntosBloqueo = {
        'ANTES_CAPM': ['PROCESS_CAPM', 'PROCESS_PNL', 'PROCESS_UBS'],
        'MID_IPA': ['PROCESS_CAPM', 'PROCESS_PNL', 'PROCESS_UBS', 'PROCESS_DERIVADOS'],
        'ANTES_PNL': ['PROCESS_PNL'],
        'POST_DERIVADOS': [] // Warning, no bloquea servicios
      };

      const serviciosBloqueados = puntosBloqueo[estado.PuntoBloqueoActual] || [];

      // Si el servicio está bloqueado, retornar isPaused=true
      if (serviciosBloqueados.includes(serviceId)) {
        const motivos = [];
        if (estado.TieneSuciedades) motivos.push('Suciedades');
        if (estado.TieneProblemasHomologacion) motivos.push('Homologación');
        if (estado.TieneDescuadres) motivos.push('Descuadres');
        if (estado.TieneProblemasCAPM) motivos.push('CAPM');

        return {
          isPaused: true,
          puntoBloqueo: estado.PuntoBloqueoActual,
          motivo: motivos.join(', ')
        };
      }

      return { isPaused: false };

    } catch (error) {
      console.error('[FundOrchestrator] Error checking stand-by status:', error);
      // En caso de error, permitir ejecución (fail-open para no bloquear pipeline)
      return { isPaused: false };
    }
  }

  /**
   * Verificar si fondo debe ser excluido por problemas registrados
   *
   * Consulta sandbox.Fondos_Problema para determinar si el fondo tiene
   * problemas críticos que impiden su procesamiento.
   *
   * @param {Object} fund - Información del fondo
   * @param {Number} fund.ID_Fund - ID del fondo
   * @param {String} fechaReporte - Fecha a procesar (YYYY-MM-DD)
   * @returns {Promise<Boolean>} - true si debe ejecutarse, false si debe omitirse
   */
  async _shouldExecuteFund(fund, fechaReporte) {
    try {
      const result = await this.pool.request()
        .input('FechaReporte', sql.NVarChar(10), fechaReporte)
        .input('ID_Fund', sql.Int, fund.ID_Fund)
        .query(`
          SELECT Proceso, Tipo_Problema
          FROM sandbox.Fondos_Problema
          WHERE FechaReporte = @FechaReporte AND ID_Fund = @ID_Fund
        `);

      if (result.recordset.length > 0) {
        // Fondo tiene problemas - OMITIR
        const problemas = result.recordset.map(r => `${r.Proceso}: ${r.Tipo_Problema}`).join('; ');

        await this.logger.log(
          this.idEjecucion,
          fund.ID_Fund,
          'WARNING',
          'FundOrchestrator',
          `⚠️ Fondo OMITIDO por problemas: ${problemas}`
        );

        await this.tracker.updateFundState(
          this.idEjecucion,
          fund.ID_Fund,
          'Estado_Final',
          'OMITIDO'
        );

        return false; // NO ejecutar
      }

      return true; // OK para ejecutar

    } catch (error) {
      console.error('[FundOrchestrator] Error checking fund problems:', error);
      // En caso de error, permitir ejecución (fail-open)
      return true;
    }
  }

  /**
   * Ejecutar servicios para un fondo específico
   *
   * NOTA: Este es un método PARCIAL para demostración.
   * La implementación completa incluirá:
   * - Carga de configuración desde pipeline.config.yaml
   * - Instanciación de servicios (IPAService, CAPMService, etc.)
   * - Orquestación de dependencias entre servicios
   * - Manejo de errores y rollbacks
   *
   * @param {Object} fund - Información del fondo
   * @param {Array<String>} serviceIds - Lista de servicios a ejecutar
   * @returns {Promise<Object>} - Resultado de la ejecución
   */
  async _executeFundServices(fund, serviceIds) {
    try {
      // 1. Verificar exclusión por problemas registrados
      const shouldExecute = await this._shouldExecuteFund(fund, this.fechaReporte);
      if (!shouldExecute) {
        return { success: true, skipped: true, reason: 'OMITIDO_POR_PROBLEMAS' };
      }

      // 2. Iterar sobre servicios
      for (const serviceId of serviceIds) {
        // 2a. Verificar stand-by ANTES de ejecutar servicio
        const standByStatus = await this._checkFundStandByStatus(fund, serviceId);

        if (standByStatus.isPaused) {
          await this.logger.log(
            this.idEjecucion,
            fund.ID_Fund,
            'INFO',
            'FundOrchestrator',
            `⏸️ Fondo en stand-by - Bloqueando ${serviceId}. Motivo: ${standByStatus.motivo}`
          );

          await this.tracker.updateFundState(
            this.idEjecucion,
            fund.ID_Fund,
            `Estado_Process_${serviceId}`,
            'BLOQUEADO_STANDBY'
          );

          // DETENER ejecución de servicios siguientes
          break;
        }

        // 2b. Ejecutar servicio
        // NOTA: Implementación completa instanciaría y ejecutaría el servicio real
        // await service.execute(context);
        console.log(`[FundOrchestrator] ${serviceId} ejecutado para fondo ${fund.ID_Fund} (simulado)`);
      }

      return { success: true };

    } catch (error) {
      // Distinguir stand-by de errores reales
      if (error.name === 'StandByRequiredError') {
        // Stand-by activado - NO es error, es pausa válida
        await this.logger.log(
          this.idEjecucion,
          fund.ID_Fund,
          'INFO',  // INFO porque stand-by es estado válido
          'FundOrchestrator',
          `⏸️ Pipeline pausado para revisión: ${error.message}`
        );

        // Marcar fondo como PAUSADO (no ERROR)
        await this.tracker.updateFundState(
          this.idEjecucion,
          fund.ID_Fund,
          'Estado_Final',
          'PAUSADO'
        );

        return { success: true, paused: true, standByCode: error.standByCode };

      } else {
        // Error real - propagar
        throw error;
      }
    }
  }

  /**
   * Procesar todos los fondos para la fecha
   *
   * NOTA: Método placeholder para migración futura.
   * Actualmente el sistema usa process.Process_Funds (SP legacy).
   *
   * @returns {Promise<Object>} - Resultado de la ejecución
   */
  async executeAll() {
    throw new Error(
      'FundOrchestrator.executeAll() no está implementado aún. ' +
      'El sistema actual usa process.Process_Funds (SP legacy). ' +
      'La migración completa a orquestación Node.js será implementada en fases posteriores.'
    );
  }
}

module.exports = FundOrchestrator;
