/**
 * WebSocketManager.js - Gestor Central de WebSockets
 *
 * Responsabilidades:
 * - Gestionar conexiones WebSocket activas
 * - Mantener Map de suscripciones por ejecución
 * - Emitir eventos a clientes suscritos
 * - Heartbeat (ping/pong)
 * - Auto-cleanup de conexiones muertas
 */

const WebSocket = require('ws');

class WebSocketManager {
  constructor() {
    this.wss = null; // WebSocket.Server
    this.clients = new Map(); // Map<clientId, { ws, subscriptions: Set<idEjecucion>, lastPing: Date }>
    this.subscriptions = new Map(); // Map<idEjecucion, Set<clientId>>
    this.heartbeatInterval = null;
    this.nextClientId = 1;
    this.getPoolFn = null; // Función para obtener pool de DB
  }

  /**
   * Inicializar WebSocket Server
   * @param {http.Server} server - Servidor HTTP de Express
   * @param {Function} getPoolFn - Función para obtener pool de DB
   */
  initialize(server, getPoolFn = null) {
    console.log('[WebSocketManager] Inicializando WebSocket Server...');

    this.getPoolFn = getPoolFn;

    this.wss = new WebSocket.Server({
      server,
      path: '/api/ws/pipeline',
      clientTracking: false, // Nosotros hacemos tracking manual
    });

    this.wss.on('connection', (ws, req) => this.handleConnection(ws, req));

    // Iniciar heartbeat
    this.startHeartbeat();

    console.log('[WebSocketManager] ✅ WebSocket Server inicializado en /api/ws/pipeline');
  }

  /**
   * Manejar nueva conexión
   */
  handleConnection(ws, req) {
    const clientId = this.nextClientId++;
    const ip = req.socket.remoteAddress;

    console.log(`[WebSocketManager] Nueva conexión - Cliente ${clientId} desde ${ip}`);

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

      console.log(`[WebSocketManager] Mensaje de cliente ${clientId}:`, type);

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
    console.log(`[WebSocketManager] Cliente ${clientId} desconectado`);

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

    console.log(`[WebSocketManager] Cliente ${clientId} suscrito a ejecución ${ejecucionKey}`);

    // Confirmar suscripción
    this.send(clientId, {
      type: 'SUBSCRIBED',
      data: {
        ID_Ejecucion: ejecucionKey,
        timestamp: new Date().toISOString(),
      },
    });

    // Enviar estado inicial
    await this.sendInitialState(clientId, ejecucionKey);
  }

  /**
   * Enviar estado inicial de una ejecución a un cliente
   */
  async sendInitialState(clientId, idEjecucion) {
    if (!this.getPoolFn) {
      console.warn('[WebSocketManager] No se puede enviar estado inicial - getPoolFn no configurado');
      return;
    }

    try {
      const sql = require('mssql');
      const pool = await this.getPoolFn();

      // Obtener ejecución
      const ejecucionResult = await pool.request()
        .input('ID_Ejecucion', sql.BigInt, idEjecucion)
        .query(`
          SELECT * FROM logs.Ejecuciones
          WHERE ID_Ejecucion = @ID_Ejecucion
        `);

      if (ejecucionResult.recordset.length === 0) {
        console.warn(`[WebSocketManager] Ejecución ${idEjecucion} no encontrada en BD`);
        return;
      }

      // Obtener fondos
      const fondosResult = await pool.request()
        .input('ID_Ejecucion', sql.BigInt, idEjecucion)
        .query(`
          SELECT
            ef.ID,
            ef.ID_Ejecucion,
            ef.ID_Fund,
            ef.FundShortName,
            ef.Portfolio_Geneva,
            ef.Portfolio_CAPM,
            ef.Portfolio_Derivados,
            ef.Portfolio_UBS,
            ef.Estado_Extraccion,
            ef.Estado_Validacion,
            ef.Estado_Process_IPA,
            ef.Estado_Process_CAPM,
            ef.Estado_Process_Derivados,
            ef.Estado_Process_PNL,
            ef.Estado_Process_UBS,
            ef.Estado_Concatenar,
            ef.Estado_Final,
            ef.Paso_Con_Error,
            ef.Mensaje_Error,
            ef.Inicio_Procesamiento,
            ef.Fin_Procesamiento,
            ef.Duracion_Ms,
            ef.Requiere_Derivados,
            ef.Incluir_En_Cubo,
            ef.Elegible_Reproceso,
            bf.FundName
          FROM logs.Ejecucion_Fondos ef
          LEFT JOIN dimensionales.BD_Funds bf ON CAST(ef.ID_Fund AS INT) = bf.ID_Fund
          WHERE ef.ID_Ejecucion = @ID_Ejecucion
          ORDER BY ef.FundShortName
        `);

      console.log(`[WebSocketManager] Enviando estado inicial a cliente ${clientId}: ${fondosResult.recordset.length} fondos`);

      // Enviar mensaje INITIAL_STATE
      this.send(clientId, {
        type: 'INITIAL_STATE',
        data: {
          ejecucion: ejecucionResult.recordset[0],
          fondos: fondosResult.recordset,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error(`[WebSocketManager] Error enviando estado inicial a cliente ${clientId}:`, error);
      this.send(clientId, {
        type: 'ERROR',
        data: {
          error: 'Error obteniendo estado inicial',
          details: error.message,
        },
      });
    }
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
        console.log(`[WebSocketManager] No hay más suscriptores para ejecución ${ejecucionKey}`);
      }
    }

    console.log(`[WebSocketManager] Cliente ${clientId} desuscrito de ejecución ${ejecucionKey}`);
  }

  /**
   * Emitir evento a todos los clientes suscritos a una ejecución
   */
  emitToExecution(idEjecucion, event) {
    const ejecucionKey = String(idEjecucion);
    const subscribers = this.subscriptions.get(ejecucionKey);

    if (!subscribers || subscribers.size === 0) {
      // No hay suscriptores, no hay nada que hacer
      return;
    }

    console.log(`[WebSocketManager] Emitiendo evento ${event.type} a ${subscribers.size} cliente(s) de ejecución ${ejecucionKey}`);

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
    console.log(`[WebSocketManager] Broadcasting mensaje ${message.type} a ${this.clients.size} cliente(s)`);

    this.clients.forEach((client, clientId) => {
      this.send(clientId, message);
    });
  }

  /**
   * Heartbeat - Ping cada 30 segundos
   */
  startHeartbeat() {
    console.log('[WebSocketManager] Iniciando heartbeat (ping cada 30s)');

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
      console.log('[WebSocketManager] Deteniendo heartbeat');
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Cerrar WebSocket Server
   */
  close() {
    console.log('[WebSocketManager] Cerrando WebSocket Server...');

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
      this.wss.close(() => {
        console.log('[WebSocketManager] ✅ WebSocket Server cerrado');
      });
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
