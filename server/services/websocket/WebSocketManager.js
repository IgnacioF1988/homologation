/**
 * WebSocketManager - Gestor Central de WebSockets (Singleton)
 *
 * ARQUITECTURA DB-CENTRIC:
 * Este servicio es un RETRANSMISOR pasivo. Recibe eventos del MessageProcessor
 * (que los obtiene via Service Broker desde la DB) y los retransmite a clientes
 * WebSocket suscritos.
 *
 * RECIBE:
 * - server: Servidor HTTP de Express (para montar WebSocket Server)
 * - Mensajes de clientes: SUBSCRIBE, UNSUBSCRIBE, PING
 * - Eventos desde MessageProcessor: emitToExecution() para retransmitir
 *
 * PROCESA:
 * 1. Inicializa WebSocket Server en /api/ws/pipeline
 * 2. Maneja conexiones entrantes: asigna clientId, registra cliente
 * 3. Gestiona suscripciones: Map de idEjecucion → Set de clientIds suscritos
 * 4. Recibe mensajes de clientes: SUBSCRIBE, UNSUBSCRIBE, PING
 * 5. Heartbeat: ping cada 30s, desconecta clientes sin pong en 60s
 *
 * ENVIA:
 * - Eventos WebSocket a clientes suscritos:
 *   * CONNECTED: al conectarse (incluye clientId)
 *   * SUBSCRIBED: al suscribirse a ejecución
 *   * SP_START, SP_END, STANDBY, ERROR: eventos del pipeline (via MessageProcessor)
 *   * FUND_UPDATE: estado agregado de fondo (via MessageProcessor)
 *   * PONG: respuesta a PING
 *
 * DEPENDENCIAS:
 * - Requiere: HTTP Server de Express
 * - Requerido por: MessageProcessor (retransmite eventos), Frontend (recibe)
 *
 * FLUJO:
 * DB (sp_EmitirEvento) → Service Broker → ServiceBrokerListener → MessageProcessor → WebSocketManager → Browser
 */

const WebSocket = require('ws');

class WebSocketManager {
  constructor() {
    this.wss = null; // WebSocket.Server
    this.clients = new Map(); // Map<clientId, { ws, subscriptions: Set<idEjecucion>, lastPing: Date }>
    this.subscriptions = new Map(); // Map<idEjecucion, Set<clientId>>
    this.heartbeatInterval = null;
    this.nextClientId = 1;
  }

  /**
   * Inicializar WebSocket Server
   * @param {http.Server} server - Servidor HTTP de Express
   */
  initialize(server) {
    this.wss = new WebSocket.Server({
      server,
      path: '/api/ws/pipeline',
      clientTracking: false, // Nosotros hacemos tracking manual
    });

    this.wss.on('connection', (ws, req) => this.handleConnection(ws, req));

    // Iniciar heartbeat
    this.startHeartbeat();
  }

  /**
   * Manejar nueva conexión
   */
  handleConnection(ws, req) {
    const clientId = this.nextClientId++;
    const ip = req.socket.remoteAddress;

    // Registrar cliente
    this.clients.set(clientId, {
      ws,
      subscriptions: new Set(),
      lastPing: new Date(),
      ip,
    });

    // Eventos del WebSocket
    ws.on('message', (data) => this.handleMessage(clientId, data));
    ws.on('close', () => this.handleClose(clientId));
    ws.on('error', (error) => this.handleError(clientId, error));
    ws.on('pong', () => this.handlePong(clientId));

    // Enviar mensaje de bienvenida
    this.send(clientId, {
      type: 'CONNECTED',
      data: {
        clientId,
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * Manejar mensaje recibido de cliente
   */
  handleMessage(clientId, data) {
    try {
      const message = JSON.parse(data.toString());
      const { type, data: payload } = message;

      switch (type) {
        case 'SUBSCRIBE':
          this.subscribe(clientId, payload.ID_Ejecucion);
          break;

        case 'UNSUBSCRIBE':
          this.unsubscribe(clientId, payload.ID_Ejecucion);
          break;

        case 'PING':
          this.send(clientId, { type: 'PONG', data: { timestamp: new Date().toISOString() } });
          break;

        default:
          console.warn(`[WebSocketManager] Tipo de mensaje desconocido: ${type}`);
          this.send(clientId, {
            type: 'ERROR',
            data: { error: `Tipo de mensaje desconocido: ${type}` },
          });
      }
    } catch (error) {
      console.error(`[WebSocketManager] Error procesando mensaje de cliente ${clientId}:`, error);
      this.send(clientId, {
        type: 'ERROR',
        data: { error: 'Error procesando mensaje', details: error.message },
      });
    }
  }

  /**
   * Manejar cierre de conexión
   */
  handleClose(clientId) {
    const client = this.clients.get(clientId);
    if (!client) return;

    // Desuscribir de todas las ejecuciones
    client.subscriptions.forEach(idEjecucion => {
      this.unsubscribe(clientId, idEjecucion);
    });

    // Eliminar cliente
    this.clients.delete(clientId);
  }

  /**
   * Manejar error de conexión
   */
  handleError(clientId, error) {
    console.error(`[WebSocketManager] Error en cliente ${clientId}:`, error.message);
  }

  /**
   * Manejar pong (respuesta a ping de heartbeat)
   */
  handlePong(clientId) {
    const client = this.clients.get(clientId);
    if (client) {
      client.lastPing = new Date();
    }
  }

  /**
   * Suscribir cliente a una ejecución
   */
  async subscribe(clientId, idEjecucion) {
    const client = this.clients.get(clientId);
    if (!client) {
      console.warn(`[WebSocketManager] Cliente ${clientId} no encontrado para suscripción`);
      return;
    }

    // Convertir a string para consistencia
    const ejecucionKey = String(idEjecucion);

    // Agregar a subscriptions del cliente
    client.subscriptions.add(ejecucionKey);

    // Agregar a Map global de suscripciones
    if (!this.subscriptions.has(ejecucionKey)) {
      this.subscriptions.set(ejecucionKey, new Set());
    }
    this.subscriptions.get(ejecucionKey).add(clientId);

    // Confirmar suscripción
    this.send(clientId, {
      type: 'SUBSCRIBED',
      data: {
        ID_Ejecucion: ejecucionKey,
        timestamp: new Date().toISOString(),
      },
    });

    // NOTA: No hay "estado inicial" - el cliente recibe eventos en tiempo real
    // via Service Broker. El estado se construye acumulando eventos.
  }

  /**
   * Desuscribir cliente de una ejecución
   */
  unsubscribe(clientId, idEjecucion) {
    const client = this.clients.get(clientId);
    if (!client) return;

    const ejecucionKey = String(idEjecucion);

    // Remover de subscriptions del cliente
    client.subscriptions.delete(ejecucionKey);

    // Remover de Map global de suscripciones
    const subscribers = this.subscriptions.get(ejecucionKey);
    if (subscribers) {
      subscribers.delete(clientId);

      // Si no quedan suscriptores, limpiar el Map
      if (subscribers.size === 0) {
        this.subscriptions.delete(ejecucionKey);
      }
    }
  }

  /**
   * Emitir evento a todos los clientes suscritos a una ejecución
   */
  emitToExecution(idEjecucion, event) {
    const ejecucionKey = String(idEjecucion);
    const subscribers = this.subscriptions.get(ejecucionKey);

    if (!subscribers || subscribers.size === 0) {
      return;
    }

    // Enviar a cada suscriptor
    subscribers.forEach(clientId => {
      this.send(clientId, event);
    });
  }

  /**
   * Enviar mensaje a un cliente específico
   */
  send(clientId, message) {
    const client = this.clients.get(clientId);
    if (!client) {
      console.warn(`[WebSocketManager] Cliente ${clientId} no encontrado para enviar mensaje`);
      return;
    }

    const { ws } = client;

    // Verificar que el WebSocket está abierto
    if (ws.readyState !== WebSocket.OPEN) {
      console.warn(`[WebSocketManager] WebSocket de cliente ${clientId} no está abierto (readyState: ${ws.readyState})`);
      return;
    }

    try {
      ws.send(JSON.stringify(message));
    } catch (error) {
      console.error(`[WebSocketManager] Error enviando mensaje a cliente ${clientId}:`, error);
    }
  }

  /**
   * Broadcast a todos los clientes conectados
   */
  broadcast(message) {
    this.clients.forEach((client, clientId) => {
      this.send(clientId, message);
    });
  }

  /**
   * Heartbeat - Ping cada 30 segundos
   */
  startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      const now = new Date();
      const TIMEOUT = 60000; // 60 segundos

      this.clients.forEach((client, clientId) => {
        const { ws, lastPing } = client;

        // Si el último pong fue hace más de 60 segundos, cerrar conexión
        if (now - lastPing > TIMEOUT) {
          console.warn(`[WebSocketManager] Cliente ${clientId} sin respuesta, cerrando conexión`);
          ws.terminate();
          this.handleClose(clientId);
          return;
        }

        // Enviar ping
        if (ws.readyState === WebSocket.OPEN) {
          ws.ping();
        }
      });
    }, 30000); // Cada 30 segundos
  }

  /**
   * Detener heartbeat
   */
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Cerrar WebSocket Server
   */
  close() {
    // Detener heartbeat
    this.stopHeartbeat();

    // Cerrar todas las conexiones
    this.clients.forEach((client, clientId) => {
      client.ws.close(1000, 'Server shutting down');
    });

    // Limpiar Maps
    this.clients.clear();
    this.subscriptions.clear();

    // Cerrar WSS
    if (this.wss) {
      this.wss.close();
    }
  }

  /**
   * Obtener estadísticas
   */
  getStats() {
    return {
      totalClients: this.clients.size,
      totalSubscriptions: this.subscriptions.size,
      executionsWithSubscribers: Array.from(this.subscriptions.entries()).map(([idEjecucion, subscribers]) => ({
        idEjecucion,
        subscribers: subscribers.size,
      })),
    };
  }
}

// Singleton
const wsManager = new WebSocketManager();

module.exports = wsManager;
