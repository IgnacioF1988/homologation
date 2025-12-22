/**
 * useExecutionPolling.js - Hook de Polling Automático
 * Polling automático con auto-cleanup, retry logic y auto-stop
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { POLLING_CONFIG } from '../utils/constants';
import procesosService from '../../../services/procesosService';

/**
 * useExecutionPolling - Hook para polling automático de ejecución
 *
 * @param {number|string} idEjecucion - ID de la ejecución a monitorear
 * @param {Object} options - Opciones de configuración
 * @param {number} options.interval - Intervalo de polling en ms (default: 2000)
 * @param {boolean} options.enabled - Habilitar polling (default: true)
 * @param {Function} options.onUpdate - Callback cuando hay actualización
 * @param {Function} options.onComplete - Callback cuando ejecución completa
 * @param {Function} options.onError - Callback cuando hay error
 * @param {number} options.maxErrors - Máximo de errores antes de detener (default: 5)
 * @returns {PollingState} - Estado del polling
 */
export const useExecutionPolling = (idEjecucion, options = {}) => {
  const {
    interval = POLLING_CONFIG.INTERVAL,
    enabled = POLLING_CONFIG.ENABLED_BY_DEFAULT,
    onUpdate,
    onComplete,
    onError,
    maxErrors = POLLING_CONFIG.MAX_ERRORS,
  } = options;

  // Estado del polling
  const [isPolling, setIsPolling] = useState(false);
  const [errorCount, setErrorCount] = useState(0);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [lastError, setLastError] = useState(null);

  // Refs para cleanup
  const intervalRef = useRef(null);
  const isMountedRef = useRef(true);
  const consecutiveErrorsRef = useRef(0);

  /**
   * poll - Función de polling
   */
  const poll = useCallback(async () => {
    if (!idEjecucion) {
      console.warn('[useExecutionPolling] No execution ID provided');
      return;
    }

    try {
      // Llamar al endpoint de estado
      const response = await procesosService.getEjecucionEstado(idEjecucion);

      if (!isMountedRef.current) return;

      // Reset error count en caso de éxito
      consecutiveErrorsRef.current = 0;
      setErrorCount(0);
      setLastError(null);
      setLastUpdate(new Date());

      // Callback de actualización
      if (onUpdate) {
        onUpdate(response);
      }

      // Verificar si la ejecución ha completado
      const estado = response.ejecucion?.Estado;
      const isComplete = estado === 'COMPLETADO' || estado === 'ERROR' || estado === 'PARCIAL';

      if (isComplete) {
        // Detener polling
        stopPolling();

        // Callback de completado
        if (onComplete) {
          onComplete(response);
        }
      }
    } catch (error) {
      if (!isMountedRef.current) return;

      consecutiveErrorsRef.current++;
      setErrorCount(consecutiveErrorsRef.current);
      setLastError(error);

      console.error('[useExecutionPolling] Error en polling:', error);

      // Callback de error
      if (onError) {
        onError(error);
      }

      // Si excedemos el máximo de errores, detener polling
      if (consecutiveErrorsRef.current >= maxErrors) {
        console.error(`[useExecutionPolling] Deteniendo polling después de ${maxErrors} errores consecutivos`);
        stopPolling();
      }
    }
  }, [idEjecucion, onUpdate, onComplete, onError, maxErrors]);

  /**
   * startPolling - Inicia el polling
   */
  const startPolling = useCallback(() => {
    // Si ya está polling, no hacer nada
    if (intervalRef.current) {
      return;
    }

    console.log(`[useExecutionPolling] Iniciando polling para ejecución ${idEjecucion}`);

    // Reset state
    consecutiveErrorsRef.current = 0;
    setErrorCount(0);
    setLastError(null);
    setIsPolling(true);

    // Primer poll inmediato
    poll();

    // Iniciar intervalo
    intervalRef.current = setInterval(poll, interval);
  }, [idEjecucion, poll, interval]);

  /**
   * stopPolling - Detiene el polling
   */
  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      console.log('[useExecutionPolling] Deteniendo polling');
      clearInterval(intervalRef.current);
      intervalRef.current = null;
      setIsPolling(false);
    }
  }, []);

  /**
   * resetPolling - Resetea el polling (útil para reintentar después de errores)
   */
  const resetPolling = useCallback(() => {
    stopPolling();
    consecutiveErrorsRef.current = 0;
    setErrorCount(0);
    setLastError(null);

    if (enabled && idEjecucion) {
      startPolling();
    }
  }, [enabled, idEjecucion, startPolling, stopPolling]);

  // Effect: Auto-start cuando enabled y idEjecucion están disponibles
  useEffect(() => {
    if (enabled && idEjecucion) {
      startPolling();
    } else {
      stopPolling();
    }

    // Cleanup al desmontar o cambiar enabled/idEjecucion
    return () => {
      stopPolling();
    };
  }, [enabled, idEjecucion, startPolling, stopPolling]);

  // Effect: Cleanup al desmontar el componente
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return {
    // Estado
    isPolling,
    errorCount,
    lastUpdate,
    lastError,

    // Acciones
    startPolling,
    stopPolling,
    resetPolling,

    // Helpers
    hasErrors: errorCount > 0,
    isMaxErrorsReached: errorCount >= maxErrors,
  };
};

export default useExecutionPolling;
