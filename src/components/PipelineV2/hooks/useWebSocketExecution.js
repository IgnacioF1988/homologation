/**
 * useWebSocketExecution.js - Hook de WebSocket para Ejecución
 * Integra useWebSocketConnection con PipelineExecutionContext y PipelineFondosContext
 */

import { useCallback, useEffect, useRef } from 'react';
import { useWebSocketConnection } from './useWebSocketConnection';
import { usePipelineExecution } from '../contexts/PipelineExecutionContext';
import { usePipelineFondos } from '../contexts/PipelineFondosContext';
import { parseFondos } from '../utils/pipelineParser';

/**
 * useWebSocketExecution - Hook para actualización en tiempo real de ejecución
 *
 * @param {number|string} idEjecucion - ID de la ejecución a monitorear
 * @param {boolean} enabled - Habilitar WebSocket
 * @returns {WebSocketState} - Estado y métodos
 */
export const useWebSocketExecution = (idEjecucion, enabled = true) => {
  const execution = usePipelineExecution();
  const fondos = usePipelineFondos();

  // Ref para evitar re-suscripciones
  const subscribedToRef = useRef(null);

  /**
   * Procesar mensaje recibido de WebSocket
   */
  const handleMessage = useCallback((message) => {
    const { type, data } = message;

    console.log('[useWebSocketExecution] Procesando mensaje:', type);

    switch (type) {
      case 'CONNECTED':
        console.log('[useWebSocketExecution] Conectado a WebSocket, client:', data.clientId);
        break;

      case 'SUBSCRIBED':
        console.log('[useWebSocketExecution] Suscrito a ejecución:', data.ID_Ejecucion);
        break;

      case 'INITIAL_STATE':
        // Actualizar estado completo (cuando hay estado inicial del servidor)
        console.log('[useWebSocketExecution] Estado inicial recibido');

        if (data.ejecucion) {
          execution.updateEjecucion(data.ejecucion);
        }

        if (data.fondos) {
          const parsedFondos = parseFondos(data.fondos);
          fondos.updateFondos(parsedFondos);
        }
        break;

      case 'FUND_UPDATE':
        // Actualizar solo fondo específico
        console.log('[useWebSocketExecution] Actualización de fondo:', data.ID_Fund);
        console.log('[useWebSocketExecution] Datos del fondo:', data);

        // Obtener fondo actual
        const fondoId = String(data.ID_Fund);
        console.log('[useWebSocketExecution] Buscando fondo:', fondoId);
        const currentFondo = fondos.getFondo(fondoId);
        console.log('[useWebSocketExecution] Fondo encontrado:', !!currentFondo);

        if (currentFondo) {
          // Merge de datos (mantener datos existentes, actualizar solo campos nuevos)
          const updatedFondo = {
            ...currentFondo._raw, // Raw data original
            ...data,              // Nuevos campos del WebSocket
          };

          console.log('[useWebSocketExecution] updatedFondo:', updatedFondo);

          // Re-parsear con datos actualizados
          const parsedFondo = parseFondos([updatedFondo])[0];

          console.log('[useWebSocketExecution] parsedFondo:', parsedFondo);

          if (parsedFondo) {
            // Actualizar en el contexto
            console.log('[useWebSocketExecution] Actualizando fondo en contexto');
            fondos.updateFondo(parsedFondo);
            console.log('[useWebSocketExecution] updateFondo llamado');
          }
        } else {
          console.warn('[useWebSocketExecution] Fondo no encontrado en fondosMap:', fondoId);
        }
        break;

      case 'EXECUTION_UPDATE':
        // Actualizar estadísticas globales de ejecución
        console.log('[useWebSocketExecution] Actualización de ejecución:', data.Estado);
        console.log('[useWebSocketExecution] execution.ejecucion existe:', !!execution.ejecucion);

        if (execution.ejecucion) {
          const updatedEjecucion = {
            ...execution.ejecucion,
            Estado: data.Estado,
            FondosExitosos: data.FondosExitosos,
            FondosFallidos: data.FondosFallidos,
            FondosWarning: data.FondosWarning,
            FondosOmitidos: data.FondosOmitidos,
          };
          console.log('[useWebSocketExecution] Actualizando ejecucion:', updatedEjecucion);
          execution.updateEjecucion(updatedEjecucion);
          console.log('[useWebSocketExecution] updateEjecucion llamado');
        } else {
          console.warn('[useWebSocketExecution] ⚠️ No hay execution.ejecucion, ignorando EXECUTION_UPDATE');
        }
        break;

      case 'EXECUTION_COMPLETE':
        // Ejecución completada
        console.log('[useWebSocketExecution] Ejecución completada');

        if (execution.ejecucion) {
          execution.updateEjecucion({
            ...execution.ejecucion,
            Estado: 'COMPLETADO',
            ...data,
          });
        }
        break;

      case 'PONG':
        // Respuesta a heartbeat
        break;

      case 'ERROR':
        console.error('[useWebSocketExecution] Error del servidor:', data.error);
        break;

      default:
        console.warn('[useWebSocketExecution] Tipo de mensaje desconocido:', type);
    }
  }, [execution, fondos]);

  /**
   * Callback de desconexión
   */
  const handleDisconnect = useCallback(() => {
    console.log('[useWebSocketExecution] WebSocket desconectado');
  }, []);

  /**
   * Callback de error
   */
  const handleError = useCallback((error) => {
    console.error('[useWebSocketExecution] Error de WebSocket:', error);
    execution.updateError(error.message);
  }, [execution]);

  /**
   * Hook de conexión WebSocket
   */
  const ws = useWebSocketConnection({
    enabled: enabled && !!idEjecucion,
    onMessage: handleMessage,
    onDisconnect: handleDisconnect,
    onError: handleError,
  });

  /**
   * Effect: Suscribirse cuando conecta
   * FIXED: Usar ref para evitar re-suscripciones infinitas
   */
  useEffect(() => {
    if (ws.isConnected && idEjecucion && subscribedToRef.current !== idEjecucion) {
      console.log('[useWebSocketExecution] WebSocket conectado, suscribiendo...');
      ws.subscribe(idEjecucion);
      subscribedToRef.current = idEjecucion;
    }
  }, [ws.isConnected, idEjecucion, ws.subscribe]);

  /**
   * Effect: Limpiar suscripción cuando cambia la ejecución
   */
  useEffect(() => {
    return () => {
      subscribedToRef.current = null;
    };
  }, [idEjecucion]);

  return ws;
};

export default useWebSocketExecution;
