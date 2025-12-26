/**
 * useWebSocketConnection.js - Hook de Conexión WebSocket
 * Maneja conexión, auto-reconexión, heartbeat y suscripciones
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { config } from '../../../services/config';

const WS_URL = config.WS_URL;
const RECONNECT_DELAYS = [1000, 2000, 5000, 10000, 30000]; // Exponential backoff
const MAX_RECONNECT_ATTEMPTS = 10;
const HEARTBEAT_INTERVAL = 30000; // 30 segundos

/**
 * useWebSocketConnection - Hook para conexión WebSocket con auto-reconexión
 *
 * @param {Object} options - Opciones de configuración
 * @param {boolean} options.enabled - Habilitar conexión (default: true)
 * @param {Function} options.onMessage - Callback cuando llega mensaje
 * @param {Function} options.onConnect - Callback cuando conecta
 * @param {Function} options.onDisconnect - Callback cuando desconecta
 * @param {Function} options.onError - Callback cuando hay error
 * @returns {ConnectionState} - Estado de conexión y métodos
 */
export const useWebSocketConnection = (options = {}) => {
  const {
    enabled = true,
    onMessage,
    onConnect,
    onDisconnect,
    onError,
  } = options;

  // Estado
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);

  // Refs
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const heartbeatIntervalRef = useRef(null);
  const isMountedRef = useRef(true);
  const subscriptionsRef = useRef(new Set());

  // Refs para callbacks y enabled (evitar stale closures)
  const onMessageRef = useRef(onMessage);
  const onConnectRef = useRef(onConnect);
  const onDisconnectRef = useRef(onDisconnect);
  const onErrorRef = useRef(onError);
  const enabledRef = useRef(enabled);
  const reconnectAttemptsRef = useRef(reconnectAttempts);

  // Actualizar refs cuando cambien
  useEffect(() => {
    onMessageRef.current = onMessage;
    onConnectRef.current = onConnect;
    onDisconnectRef.current = onDisconnect;
    onErrorRef.current = onError;
    enabledRef.current = enabled;
    reconnectAttemptsRef.current = reconnectAttempts;
  }, [onMessage, onConnect, onDisconnect, onError, enabled, reconnectAttempts]);

  /**
   * Conectar a WebSocket
   */
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) {
      console.log('[useWebSocketConnection] Ya hay una conexión activa');
      return;
    }

    console.log('[useWebSocketConnection] Conectando a', WS_URL);
    setIsConnecting(true);
    setError(null);

    try {
      const ws = new WebSocket(WS_URL);

      // IMPORTANTE: Setear wsRef INMEDIATAMENTE para poder verificar en handlers
      wsRef.current = ws;

      console.log('[useWebSocketConnection] WebSocket creado, readyState:', ws.readyState);

      // Función inline para heartbeat (evitar dependencia)
      const startHeartbeatInline = () => {
        // Limpiar heartbeat existente
        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current);
        }

        heartbeatIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'PING' }));
          }
        }, HEARTBEAT_INTERVAL);
      };

      ws.onopen = () => {
        console.log('[useWebSocketConnection] ONOPEN disparado, readyState:', ws.readyState);
        console.log('[useWebSocketConnection] wsRef.current === ws:', wsRef.current === ws);

        // CRITICAL: Verificar que este WebSocket sigue siendo el actual
        // Si el componente se desmontó, disconnect() puso wsRef.current = null
        // Si se creó un nuevo WebSocket, wsRef.current apunta al nuevo
        if (wsRef.current !== ws) {
          console.warn('[useWebSocketConnection] ⚠️ WebSocket obsoleto, ignorando onopen');
          ws.close(); // Cerrar el WebSocket obsoleto
          return;
        }

        // NO chequeamos isMountedRef porque:
        // 1. En montajes/desmontajes rápidos, puede estar false aunque wsRef sea válido
        // 2. React ignora state updates en componentes desmontados de manera segura
        // 3. Lo importante es que wsRef.current === ws (WebSocket actual)

        console.log('[useWebSocketConnection] ✅ Conectado');
        setIsConnected(true);
        setIsConnecting(false);
        setReconnectAttempts(0);
        setError(null);

        // Reenviar suscripciones
        subscriptionsRef.current.forEach(idEjecucion => {
          ws.send(JSON.stringify({
            type: 'SUBSCRIBE',
            data: { ID_Ejecucion: idEjecucion },
          }));
        });

        // Callback
        if (onConnectRef.current) {
          onConnectRef.current();
        }

        // Iniciar heartbeat
        startHeartbeatInline();
      };

      ws.onmessage = (event) => {
        console.log('[useWebSocketConnection] ONMESSAGE disparado, data:', event.data);

        // NO chequeamos isMountedRef - el WebSocket es válido si llegó aquí
        if (wsRef.current !== ws) {
          console.warn('[useWebSocketConnection] ⚠️ Mensaje de WebSocket obsoleto, ignorando');
          return;
        }

        try {
          const message = JSON.parse(event.data);
          console.log('[useWebSocketConnection] Mensaje parseado:', {
            type: message.type,
            hasData: !!message.data,
            dataKeys: message.data ? Object.keys(message.data) : []
          });

          // Callback
          if (onMessageRef.current) {
            console.log('[useWebSocketConnection] Llamando onMessage callback');
            onMessageRef.current(message);
          } else {
            console.warn('[useWebSocketConnection] ⚠️ No hay onMessage callback');
          }
        } catch (err) {
          console.error('[useWebSocketConnection] Error parseando mensaje:', err, 'data:', event.data);
        }
      };

      ws.onerror = (event) => {
        if (!isMountedRef.current) return;

        console.error('[useWebSocketConnection] ONERROR disparado:', {
          readyState: ws.readyState,
          url: WS_URL,
          event
        });
        const errorMsg = 'Error de conexión WebSocket';
        setError(errorMsg);

        // Callback
        if (onErrorRef.current) {
          onErrorRef.current(new Error(errorMsg));
        }
      };

      ws.onclose = (event) => {
        if (!isMountedRef.current) return;

        console.log('[useWebSocketConnection] ONCLOSE disparado', {
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean,
          readyState: ws.readyState,
          url: WS_URL,
        });

        setIsConnected(false);
        setIsConnecting(false);
        stopHeartbeat();

        // Callback
        if (onDisconnectRef.current) {
          onDisconnectRef.current();
        }

        // Auto-reconexión (usar refs para evitar stale closures)
        const currentEnabled = enabledRef.current;
        const currentAttempts = reconnectAttemptsRef.current;

        if (currentEnabled && currentAttempts < MAX_RECONNECT_ATTEMPTS) {
          const delay = RECONNECT_DELAYS[Math.min(currentAttempts, RECONNECT_DELAYS.length - 1)];
          console.log(`[useWebSocketConnection] Reconectando en ${delay}ms (intento ${currentAttempts + 1}/${MAX_RECONNECT_ATTEMPTS})`);

          reconnectTimeoutRef.current = setTimeout(() => {
            if (!isMountedRef.current) return;
            setReconnectAttempts(prev => prev + 1);
            connect();
          }, delay);
        } else if (currentAttempts >= MAX_RECONNECT_ATTEMPTS) {
          console.error('[useWebSocketConnection] Máximo de intentos de reconexión alcanzado');
          setError('No se pudo conectar después de múltiples intentos');
        }
      };

      // wsRef.current ya se seteó al principio (línea 82)

    } catch (err) {
      console.error('[useWebSocketConnection] Error creando WebSocket:', err);
      setError(err.message);
      setIsConnecting(false);

      if (onErrorRef.current) {
        onErrorRef.current(err);
      }
    }
    // No dependencies - usa refs para evitar recreación
  }, []);

  /**
   * Desconectar WebSocket
   */
  const disconnect = useCallback(() => {
    console.log('[useWebSocketConnection] Desconectando...');

    // Limpiar timeout de reconexión
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // Detener heartbeat
    stopHeartbeat();

    // Cerrar conexión
    if (wsRef.current) {
      wsRef.current.close(1000, 'Client disconnect');
      wsRef.current = null;
    }

    setIsConnected(false);
    setIsConnecting(false);
    setReconnectAttempts(0);
  }, []);

  /**
   * Suscribirse a una ejecución
   */
  const subscribe = useCallback((idEjecucion) => {
    if (!idEjecucion) {
      console.warn('[useWebSocketConnection] No se proporcionó ID de ejecución');
      return;
    }

    console.log('[useWebSocketConnection] Suscribiendo a ejecución', idEjecucion);

    // Agregar a Set de suscripciones
    subscriptionsRef.current.add(String(idEjecucion));

    // Enviar mensaje si está conectado
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'SUBSCRIBE',
        data: { ID_Ejecucion: idEjecucion },
      }));
    }
  }, []);

  /**
   * Desuscribirse de una ejecución
   */
  const unsubscribe = useCallback((idEjecucion) => {
    if (!idEjecucion) return;

    console.log('[useWebSocketConnection] Desuscribiendo de ejecución', idEjecucion);

    // Remover del Set
    subscriptionsRef.current.delete(String(idEjecucion));

    // Enviar mensaje si está conectado
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'UNSUBSCRIBE',
        data: { ID_Ejecucion: idEjecucion },
      }));
    }
  }, []);

  /**
   * Iniciar heartbeat (ping cada 30 segundos)
   */
  const startHeartbeat = useCallback((ws) => {
    stopHeartbeat(); // Limpiar cualquier heartbeat existente

    heartbeatIntervalRef.current = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'PING' }));
      }
    }, HEARTBEAT_INTERVAL);
  }, []);

  /**
   * Detener heartbeat
   */
  const stopHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
  }, []);

  /**
   * Effect: Auto-connect cuando enabled es true
   */
  useEffect(() => {
    if (enabled) {
      connect();
    } else {
      disconnect();
    }

    // Cleanup al desmontar
    return () => {
      disconnect();
    };
    // Solo depender de enabled (connect/disconnect son estables)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  /**
   * Effect: Cleanup al desmontar
   */
  useEffect(() => {
    return () => {
      isMountedRef.current = false;

      // Limpiar todos los timeouts e intervals
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }

      // Detener heartbeat directamente (sin usar función)
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }

      // Cerrar WebSocket
      if (wsRef.current) {
        wsRef.current.close(1000, 'Component unmount');
      }
    };
    // Sin dependencias - solo se ejecuta al desmontar
  }, []);

  return {
    // Estado
    isConnected,
    isConnecting,
    error,
    reconnectAttempts,

    // Acciones
    connect,
    disconnect,
    subscribe,
    unsubscribe,

    // Helpers
    hasMaxReconnectAttempts: reconnectAttempts >= MAX_RECONNECT_ATTEMPTS,
  };
};

export default useWebSocketConnection;
