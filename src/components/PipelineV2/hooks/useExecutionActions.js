/**
 * useExecutionActions.js - Hook de Acciones de Ejecución
 * Maneja acciones: ejecutar, reprocesar, cancelar
 */

import { useState, useCallback } from 'react';
import procesosService from '../../../services/procesosService';

/**
 * useExecutionActions - Hook para acciones de pipeline
 *
 * @param {Object} options - Opciones de configuración
 * @param {Function} options.onExecuteSuccess - Callback cuando ejecutar tiene éxito
 * @param {Function} options.onExecuteError - Callback cuando ejecutar falla
 * @param {Function} options.onReprocessSuccess - Callback cuando reprocesar tiene éxito
 * @param {Function} options.onReprocessError - Callback cuando reprocesar falla
 * @returns {ExecutionActions} - Acciones disponibles
 */
export const useExecutionActions = (options = {}) => {
  const {
    onExecuteSuccess,
    onExecuteError,
    onReprocessSuccess,
    onReprocessError,
  } = options;

  // Estado de las acciones
  const [isExecuting, setIsExecuting] = useState(false);
  const [isReprocessing, setIsReprocessing] = useState(false);
  const [executeError, setExecuteError] = useState(null);
  const [reprocessError, setReprocessError] = useState(null);

  /**
   * executeProcess - Ejecuta el pipeline para una fecha
   * @param {string} fechaReporte - Fecha en formato YYYY-MM-DD
   * @returns {Promise<Object>} - Resultado de la ejecución
   */
  const executeProcess = useCallback(async (fechaReporte) => {
    if (!fechaReporte) {
      const error = new Error('Fecha de reporte es requerida');
      setExecuteError(error);
      if (onExecuteError) onExecuteError(error);
      throw error;
    }

    setIsExecuting(true);
    setExecuteError(null);

    try {
      console.log(`[useExecutionActions] Ejecutando pipeline para fecha: ${fechaReporte}`);

      const response = await procesosService.ejecutarV2({ fechaReporte });

      setIsExecuting(false);

      // Callback de éxito
      if (onExecuteSuccess) {
        onExecuteSuccess(response);
      }

      return response;
    } catch (error) {
      console.error('[useExecutionActions] Error al ejecutar pipeline:', error);

      setIsExecuting(false);
      setExecuteError(error);

      // Callback de error
      if (onExecuteError) {
        onExecuteError(error);
      }

      throw error;
    }
  }, [onExecuteSuccess, onExecuteError]);

  /**
   * reprocesarFondo - Reprocesa un fondo específico
   * @param {number} idEjecucion - ID de la ejecución
   * @param {number} idFund - ID del fondo a reprocesar
   * @returns {Promise<Object>} - Resultado del reproceso
   */
  const reprocesarFondo = useCallback(async (idEjecucion, idFund) => {
    if (!idEjecucion || !idFund) {
      const error = new Error('ID de ejecución y ID de fondo son requeridos');
      setReprocessError(error);
      if (onReprocessError) onReprocessError(error);
      throw error;
    }

    setIsReprocessing(true);
    setReprocessError(null);

    try {
      console.log(`[useExecutionActions] Reprocesando fondo ${idFund} de ejecución ${idEjecucion}`);

      const response = await procesosService.reprocesarFondo(idEjecucion, idFund);

      setIsReprocessing(false);

      // Callback de éxito
      if (onReprocessSuccess) {
        onReprocessSuccess(response);
      }

      return response;
    } catch (error) {
      console.error('[useExecutionActions] Error al reprocesar fondo:', error);

      setIsReprocessing(false);
      setReprocessError(error);

      // Callback de error
      if (onReprocessError) {
        onReprocessError(error);
      }

      throw error;
    }
  }, [onReprocessSuccess, onReprocessError]);

  /**
   * cancelarEjecucion - Cancela una ejecución en progreso
   * @param {number} idEjecucion - ID de la ejecución
   * @returns {Promise<Object>} - Resultado de la cancelación
   */
  const cancelarEjecucion = useCallback(async (idEjecucion) => {
    if (!idEjecucion) {
      throw new Error('ID de ejecución es requerido');
    }

    try {
      console.log(`[useExecutionActions] Cancelando ejecución ${idEjecucion}`);

      // TODO: Implementar endpoint de cancelación cuando esté disponible
      // const response = await procesosService.cancelarEjecucion(idEjecucion);
      // return response;

      console.warn('[useExecutionActions] Endpoint de cancelación no implementado aún');
      throw new Error('Funcionalidad de cancelación no disponible');
    } catch (error) {
      console.error('[useExecutionActions] Error al cancelar ejecución:', error);
      throw error;
    }
  }, []);

  /**
   * descargarReporte - Descarga reporte de ejecución
   * @param {number} idEjecucion - ID de la ejecución
   * @param {string} formato - Formato del reporte ('pdf', 'excel', etc.)
   * @returns {Promise<void>}
   */
  const descargarReporte = useCallback(async (idEjecucion, formato = 'excel') => {
    if (!idEjecucion) {
      throw new Error('ID de ejecución es requerido');
    }

    try {
      console.log(`[useExecutionActions] Descargando reporte ${formato} de ejecución ${idEjecucion}`);

      // TODO: Implementar endpoint de descarga cuando esté disponible
      // const blob = await procesosService.descargarReporte(idEjecucion, formato);
      // const url = window.URL.createObjectURL(blob);
      // const a = document.createElement('a');
      // a.href = url;
      // a.download = `reporte_${idEjecucion}.${formato}`;
      // a.click();
      // window.URL.revokeObjectURL(url);

      console.warn('[useExecutionActions] Endpoint de descarga no implementado aún');
      throw new Error('Funcionalidad de descarga no disponible');
    } catch (error) {
      console.error('[useExecutionActions] Error al descargar reporte:', error);
      throw error;
    }
  }, []);

  /**
   * descargarLogs - Descarga logs de ejecución
   * @param {number} idEjecucion - ID de la ejecución
   * @returns {Promise<void>}
   */
  const descargarLogs = useCallback(async (idEjecucion) => {
    if (!idEjecucion) {
      throw new Error('ID de ejecución es requerido');
    }

    try {
      console.log(`[useExecutionActions] Descargando logs de ejecución ${idEjecucion}`);

      // Obtener logs usando endpoint existente
      const response = await procesosService.getEjecucionLogs(idEjecucion, {
        nivel: 'DEBUG',
        offset: 0,
        limit: 10000, // Obtener todos los logs
      });

      // Convertir logs a texto
      const logsText = response.logs
        .map(log => `[${log.Timestamp}] [${log.Nivel}] ${log.Mensaje}`)
        .join('\n');

      // Descargar como archivo
      const blob = new Blob([logsText], { type: 'text/plain' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `logs_ejecucion_${idEjecucion}.txt`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('[useExecutionActions] Error al descargar logs:', error);
      throw error;
    }
  }, []);

  /**
   * clearErrors - Limpia errores de estado
   */
  const clearErrors = useCallback(() => {
    setExecuteError(null);
    setReprocessError(null);
  }, []);

  return {
    // Estado
    isExecuting,
    isReprocessing,
    executeError,
    reprocessError,
    hasErrors: !!executeError || !!reprocessError,
    isBusy: isExecuting || isReprocessing,

    // Acciones principales
    executeProcess,
    reprocesarFondo,
    cancelarEjecucion,

    // Acciones secundarias
    descargarReporte,
    descargarLogs,

    // Utilidades
    clearErrors,
  };
};

export default useExecutionActions;
