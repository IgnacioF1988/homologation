/**
 * ExecutionTracker - Servicio de Tracking de Ejecuciones
 *
 * Gestiona el estado de las ejecuciones del pipeline en las tablas:
 * - logs.Ejecuciones: Estado general de la ejecución
 * - logs.Ejecucion_Fondos: Estado por fondo individual
 *
 * Características:
 * - Actualización atómica de estados
 * - Tracking de métricas (duración, errores)
 * - Soporte para estados granulares por servicio
 * - Manejo de errores con reintentos
 *
 * Uso:
 * ```javascript
 * const tracker = new ExecutionTracker(pool);
 * await tracker.initializeExecution(idEjecucion, fechaReporte, fondos);
 * await tracker.updateFundState(idEjecucion, idFund, 'Estado_Process_IPA', 'EN_PROGRESO');
 * await tracker.markFundCompleted(idEjecucion, idFund);
 * ```
 */

const sql = require('mssql');

class ExecutionTracker {
  /**
   * Constructor
   * @param {Object} pool - Connection pool de SQL Server
   */
  constructor(pool) {
    if (!pool) {
      throw new Error('ExecutionTracker requiere un connection pool válido');
    }
    this.pool = pool;
  }

  /**
   * Inicializar una nueva ejecución en la base de datos
   *
   * Crea registro en logs.Ejecuciones y registros para cada fondo en logs.Ejecucion_Fondos
   *
   * @param {BigInt} idEjecucion - ID único de la ejecución
   * @param {String} fechaReporte - Fecha a procesar (YYYY-MM-DD)
   * @param {Array<Object>} fondos - Array de fondos a procesar
   * @param {Object} metadata - Metadata adicional (usuario, parámetros, etc.)
   * @returns {Promise<void>}
   */
  async initializeExecution(idEjecucion, fechaReporte, fondos, metadata = {}) {
    try {
      const request = this.pool.request();

      // 1. Crear registro principal en logs.Ejecuciones
      await request
        .input('ID_Ejecucion', sql.BigInt, idEjecucion)
        .input('FechaReporte', sql.NVarChar(10), fechaReporte)
        .input('Usuario', sql.NVarChar(100), metadata.usuario || 'system')
        .input('TotalFondos', sql.Int, fondos.length)
        .input('Estado', sql.NVarChar(50), 'EN_PROGRESO')
        .query(`
          SET IDENTITY_INSERT logs.Ejecuciones ON;

          INSERT INTO logs.Ejecuciones (
            ID_Ejecucion,
            FechaReporte,
            Usuario,
            FechaInicio,
            TotalFondos,
            Estado
          )
          VALUES (
            @ID_Ejecucion,
            @FechaReporte,
            @Usuario,
            GETDATE(),
            @TotalFondos,
            @Estado
          );

          SET IDENTITY_INSERT logs.Ejecuciones OFF;
        `);

      // 2. Crear registros para cada fondo en logs.Ejecucion_Fondos
      for (const fondo of fondos) {
        const fundRequest = this.pool.request();
        await fundRequest
          .input('ID_Ejecucion', sql.BigInt, idEjecucion)
          .input('ID_Fund', sql.VarChar(50), String(fondo.ID_Fund))
          .input('FundShortName', sql.NVarChar(100), fondo.FundShortName)
          .input('Portfolio_Geneva', sql.NVarChar(50), fondo.Portfolio_Geneva)
          .input('Portfolio_CAPM', sql.NVarChar(50), fondo.Portfolio_CAPM || null)
          .input('Portfolio_Derivados', sql.NVarChar(50), fondo.Portfolio_Derivados || null)
          .input('Portfolio_UBS', sql.NVarChar(50), fondo.Portfolio_UBS || null)
          .query(`
            INSERT INTO logs.Ejecucion_Fondos (
              ID_Ejecucion,
              ID_Fund,
              FundShortName,
              Portfolio_Geneva,
              Portfolio_CAPM,
              Portfolio_Derivados,
              Portfolio_UBS,
              Estado_Extraccion,
              Estado_Validacion,
              Estado_Process_IPA,
              Estado_Process_CAPM,
              Estado_Process_Derivados,
              Estado_Process_PNL,
              Estado_Process_UBS,
              Estado_Concatenar,
              Estado_Final,
              Inicio_Procesamiento
            )
            VALUES (
              @ID_Ejecucion,
              @ID_Fund,
              @FundShortName,
              @Portfolio_Geneva,
              @Portfolio_CAPM,
              @Portfolio_Derivados,
              @Portfolio_UBS,
              'PENDIENTE',
              'PENDIENTE',
              'PENDIENTE',
              'PENDIENTE',
              'PENDIENTE',
              'PENDIENTE',
              'PENDIENTE',
              'PENDIENTE',
              'PENDIENTE',
              GETDATE()
            )
          `);
      }

      console.log(
        `[ExecutionTracker] Ejecución ${idEjecucion} inicializada - ` +
        `Fecha: ${fechaReporte}, Fondos: ${fondos.length}`
      );
    } catch (error) {
      console.error(`[ExecutionTracker] Error inicializando ejecución ${idEjecucion}:`, error);
      throw error;
    }
  }

  /**
   * Actualizar estado de un servicio específico para un fondo
   *
   * @param {BigInt} idEjecucion - ID de la ejecución
   * @param {Number} idFund - ID del fondo
   * @param {String} stateField - Nombre del campo de estado (ej: 'Estado_Process_IPA')
   * @param {String} estado - Nuevo estado (ej: 'EN_PROGRESO', 'OK', 'ERROR', 'N/A')
   * @returns {Promise<void>}
   */
  async updateFundState(idEjecucion, idFund, stateField, estado) {
    try {
      // Validar campo de estado permitido
      const allowedFields = [
        'Estado_Extraccion',
        'Estado_Validacion',
        'Estado_Process_IPA',
        'Estado_Process_CAPM',
        'Estado_Process_Derivados',
        'Estado_Process_PNL',
        'Estado_Process_UBS',
        'Estado_Concatenar',
        'Estado_Graph_Sync',
        'Estado_Final',
        // Sub-estados IPA
        'Estado_IPA_01_RescatarLocalPrice',
        'Estado_IPA_02_AjusteSONA',
        'Estado_IPA_03_RenombrarCxCCxP',
        'Estado_IPA_04_TratamientoSuciedades',
        'Estado_IPA_05_EliminarCajasMTM',
        'Estado_IPA_06_CrearDimensiones',
        'Estado_IPA_07_AgruparRegistros',
        // Sub-estados CAPM
        'Estado_CAPM_01_Ajuste',
        'Estado_CAPM_02_ExtractTransform',
        'Estado_CAPM_03_CargaFinal',
        // Sub-estados Derivados
        'Estado_DERIV_01_Posiciones',
        'Estado_DERIV_02_Dimensiones',
        'Estado_DERIV_03_Ajuste',
        'Estado_DERIV_04_Paridad',
        // Sub-estados PNL
        'Estado_PNL_01_Dimensiones',
        'Estado_PNL_02_Ajuste',
        'Estado_PNL_03_Agrupacion',
        'Estado_PNL_04_AjusteIPA',
        'Estado_PNL_05_Consolidar',
        // Sub-estados UBS
        'Estado_UBS_01_Tratamiento',
        'Estado_UBS_02_Derivados',
        'Estado_UBS_03_Cartera',
      ];

      if (!allowedFields.includes(stateField)) {
        throw new Error(`Campo de estado '${stateField}' no permitido`);
      }

      const request = this.pool.request();
      await request
        .input('ID_Ejecucion', sql.BigInt, idEjecucion)
        .input('ID_Fund', sql.VarChar(50), String(idFund))
        .input('Estado', sql.NVarChar(50), estado)
        .query(`
          UPDATE logs.Ejecucion_Fondos
          SET ${stateField} = @Estado,
              FechaActualizacion = GETDATE()
          WHERE ID_Ejecucion = @ID_Ejecucion AND ID_Fund = @ID_Fund
        `);

      console.log(
        `[ExecutionTracker] Estado actualizado - Ejecución: ${idEjecucion}, ` +
        `Fondo: ${idFund}, Campo: ${stateField}, Estado: ${estado}`
      );
    } catch (error) {
      console.error(
        `[ExecutionTracker] Error actualizando estado (${stateField} → ${estado}) ` +
        `para ejecución ${idEjecucion}, fondo ${idFund}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Marcar un fondo como completado exitosamente
   *
   * @param {BigInt} idEjecucion - ID de la ejecución
   * @param {Number} idFund - ID del fondo
   * @param {Number} duration - Duración en milisegundos
   * @returns {Promise<void>}
   */
  async markFundCompleted(idEjecucion, idFund, duration = null) {
    try {
      const request = this.pool.request();
      await request
        .input('ID_Ejecucion', sql.BigInt, idEjecucion)
        .input('ID_Fund', sql.VarChar(50), String(idFund))
        .input('Duration', sql.Int, duration)
        .query(`
          UPDATE logs.Ejecucion_Fondos
          SET Estado_Final = 'OK',
              Fin_Procesamiento = GETDATE(),
              Duracion_Ms = @Duration,
              FechaActualizacion = GETDATE()
          WHERE ID_Ejecucion = @ID_Ejecucion AND ID_Fund = @ID_Fund
        `);

      console.log(
        `[ExecutionTracker] Fondo completado - Ejecución: ${idEjecucion}, ` +
        `Fondo: ${idFund}, Duración: ${duration}ms`
      );
    } catch (error) {
      console.error(
        `[ExecutionTracker] Error marcando fondo completado (${idEjecucion}, ${idFund}):`,
        error
      );
      throw error;
    }
  }

  /**
   * Marcar un fondo como fallido
   *
   * @param {BigInt} idEjecucion - ID de la ejecución
   * @param {Number} idFund - ID del fondo
   * @param {String} errorStep - Paso donde ocurrió el error (ej: 'PROCESS_IPA')
   * @param {String} errorMessage - Mensaje de error
   * @param {Number} duration - Duración hasta el error (ms)
   * @returns {Promise<void>}
   */
  async markFundFailed(idEjecucion, idFund, errorStep, errorMessage, duration = null) {
    try {
      const request = this.pool.request();
      await request
        .input('ID_Ejecucion', sql.BigInt, idEjecucion)
        .input('ID_Fund', sql.VarChar(50), String(idFund))
        .input('ErrorStep', sql.NVarChar(100), errorStep)
        .input('ErrorMessage', sql.NVarChar(sql.MAX), errorMessage)
        .input('Duration', sql.Int, duration)
        .query(`
          UPDATE logs.Ejecucion_Fondos
          SET Estado_Final = 'ERROR',
              Paso_Con_Error = @ErrorStep,
              Mensaje_Error = @ErrorMessage,
              Fin_Procesamiento = GETDATE(),
              Duracion_Ms = @Duration,
              FechaActualizacion = GETDATE()
          WHERE ID_Ejecucion = @ID_Ejecucion AND ID_Fund = @ID_Fund
        `);

      console.error(
        `[ExecutionTracker] Fondo fallido - Ejecución: ${idEjecucion}, ` +
        `Fondo: ${idFund}, Paso: ${errorStep}, Error: ${errorMessage}`
      );
    } catch (error) {
      console.error(
        `[ExecutionTracker] Error marcando fondo fallido (${idEjecucion}, ${idFund}):`,
        error
      );
      throw error;
    }
  }

  /**
   * Actualizar campo de error específico para un fondo
   *
   * @param {BigInt} idEjecucion - ID de la ejecución
   * @param {Number} idFund - ID del fondo
   * @param {String} errorStep - Paso donde ocurrió el error
   * @param {String} errorMessage - Mensaje de error
   * @returns {Promise<void>}
   */
  async updateFundErrorStep(idEjecucion, idFund, errorStep, errorMessage) {
    try {
      const request = this.pool.request();
      await request
        .input('ID_Ejecucion', sql.BigInt, idEjecucion)
        .input('ID_Fund', sql.VarChar(50), String(idFund))
        .input('ErrorStep', sql.NVarChar(100), errorStep)
        .input('ErrorMessage', sql.NVarChar(sql.MAX), errorMessage)
        .query(`
          UPDATE logs.Ejecucion_Fondos
          SET Paso_Con_Error = @ErrorStep,
              Mensaje_Error = @ErrorMessage,
              FechaActualizacion = GETDATE()
          WHERE ID_Ejecucion = @ID_Ejecucion AND ID_Fund = @ID_Fund
        `);
    } catch (error) {
      console.error(
        `[ExecutionTracker] Error actualizando paso con error (${idEjecucion}, ${idFund}):`,
        error
      );
      throw error;
    }
  }

  /**
   * Actualizar estado general de la ejecución
   *
   * @param {BigInt} idEjecucion - ID de la ejecución
   * @param {String} estado - Estado ('EN_PROGRESO', 'COMPLETADO', 'ERROR')
   * @param {Object} stats - Estadísticas opcionales (fondos_ok, fondos_error, etc.)
   * @returns {Promise<void>}
   */
  async updateExecutionState(idEjecucion, estado, stats = {}) {
    try {
      const request = this.pool.request();
      request
        .input('ID_Ejecucion', sql.BigInt, idEjecucion)
        .input('Estado', sql.NVarChar(50), estado);

      // Agregar estadísticas opcionales
      if (stats.fondosOK !== undefined) {
        request.input('FondosOK', sql.Int, stats.fondosOK);
      }
      if (stats.fondosError !== undefined) {
        request.input('FondosError', sql.Int, stats.fondosError);
      }
      if (stats.duracionTotal !== undefined) {
        request.input('DuracionTotal', sql.Int, stats.duracionTotal);
      }

      let query = `
        UPDATE logs.Ejecuciones
        SET Estado = @Estado,
            FechaActualizacion = GETDATE()
      `;

      if (stats.fondosOK !== undefined) {
        query += ', FondosExitosos = @FondosOK';
      }
      if (stats.fondosError !== undefined) {
        query += ', FondosFallidos = @FondosError';
      }
      if (stats.duracionTotal !== undefined) {
        query += ', Duracion_Total_Ms = @DuracionTotal';
      }
      if (estado === 'COMPLETADO' || estado === 'ERROR') {
        query += ', FechaFin = GETDATE()';
      }

      query += ' WHERE ID_Ejecucion = @ID_Ejecucion';

      await request.query(query);

      console.log(
        `[ExecutionTracker] Estado de ejecución actualizado - ID: ${idEjecucion}, Estado: ${estado}`
      );
    } catch (error) {
      console.error(
        `[ExecutionTracker] Error actualizando estado de ejecución ${idEjecucion}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Obtener estado actual de todos los fondos de una ejecución
   *
   * @param {BigInt} idEjecucion - ID de la ejecución
   * @returns {Promise<Array<Object>>} - Array de fondos con su estado
   */
  async getFundStates(idEjecucion) {
    try {
      const request = this.pool.request();
      const result = await request
        .input('ID_Ejecucion', sql.BigInt, idEjecucion)
        .query(`
          SELECT
            ID_Fund,
            FundShortName,
            Estado_Extraccion,
            Estado_Validacion,
            Estado_Process_IPA,
            Estado_Process_CAPM,
            Estado_Process_Derivados,
            Estado_Process_PNL,
            Estado_Process_UBS,
            Estado_Concatenar,
            Estado_Final,
            Paso_Con_Error,
            Mensaje_Error,
            Duracion_Ms,
            Inicio_Procesamiento,
            Fin_Procesamiento
          FROM logs.Ejecucion_Fondos
          WHERE ID_Ejecucion = @ID_Ejecucion
          ORDER BY ID_Fund
        `);

      return result.recordset;
    } catch (error) {
      console.error(
        `[ExecutionTracker] Error obteniendo estados de fondos para ejecución ${idEjecucion}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Obtener resumen de la ejecución
   *
   * @param {BigInt} idEjecucion - ID de la ejecución
   * @returns {Promise<Object>} - Resumen con estadísticas
   */
  async getExecutionSummary(idEjecucion) {
    try {
      const request = this.pool.request();
      const result = await request
        .input('ID_Ejecucion', sql.BigInt, idEjecucion)
        .query(`
          SELECT
            e.ID_Ejecucion,
            e.FechaReporte,
            e.Usuario,
            e.Estado,
            e.TotalFondos,
            e.FondosExitosos,
            e.FondosFallidos,
            e.Duracion_Total_Ms,
            e.FechaInicio,
            e.FechaFin,
            COUNT(CASE WHEN ef.Estado_Final = 'OK' THEN 1 END) AS Fondos_Completados,
            COUNT(CASE WHEN ef.Estado_Final = 'ERROR' THEN 1 END) AS Fondos_Fallidos_Count,
            COUNT(CASE WHEN ef.Estado_Final = 'PENDIENTE' THEN 1 END) AS Fondos_Pendientes
          FROM logs.Ejecuciones e
          LEFT JOIN logs.Ejecucion_Fondos ef ON e.ID_Ejecucion = ef.ID_Ejecucion
          WHERE e.ID_Ejecucion = @ID_Ejecucion
          GROUP BY
            e.ID_Ejecucion,
            e.FechaReporte,
            e.Usuario,
            e.Estado,
            e.TotalFondos,
            e.FondosExitosos,
            e.FondosFallidos,
            e.Duracion_Total_Ms,
            e.FechaInicio,
            e.FechaFin
        `);

      return result.recordset[0] || null;
    } catch (error) {
      console.error(
        `[ExecutionTracker] Error obteniendo resumen de ejecución ${idEjecucion}:`,
        error
      );
      throw error;
    }
  }
}

module.exports = ExecutionTracker;
