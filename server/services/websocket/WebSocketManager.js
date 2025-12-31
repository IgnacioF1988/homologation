/**
 * WebSocketManager - Gestor Central de WebSockets (Singleton)
 *
 * Gestiona conexiones WebSocket para actualizar clientes en tiempo real sobre el estado
 * de ejecuciones del pipeline (fondos procesándose, estados granulares, errores).
 *
 * RECIBE:
 * - server: Servidor HTTP de Express (para montar WebSocket Server)
 * - getPoolFn: Función para obtener pool de SQL Server (opcional)
 * - Mensajes de clientes: SUBSCRIBE, UNSUBSCRIBE, PING, GET_STATUS
 * - Eventos desde TrackingService: broadcast() para actualizaciones en tiempo real
 *
 * PROCESA:
 * 1. Inicializa WebSocket Server en /api/ws/pipeline
 * 2. Maneja conexiones entrantes: asigna clientId, registra cliente
 * 3. Gestiona suscripciones: Map de idEjecucion → Set de clientIds suscritos
 * 4. Recibe mensajes de clientes: SUBSCRIBE (suscribirse a ejecución), PING (heartbeat)
 * 5. Emite eventos a clientes suscritos: FUND_UPDATE (cambio estado fondo), EXECUTION_UPDATE (cambio estado ejecución)
 * 6. Heartbeat: ping cada 30s, desconecta clientes sin pong en 60s
 * 7. Auto-cleanup: elimina conexiones cerradas y clientes inactivos
 *
 * ENVIA:
 * - Eventos WebSocket a: Clientes conectados (frontend)
 *   * CONNECTED: al conectarse (incluye clientId)
 *   * SUBSCRIBED: al suscribirse a ejecución
 *   * FUND_UPDATE: estado de fondo actualizado (desde TrackingService)
 *   * EXECUTION_UPDATE: estado de ejecución actualizado (desde TrackingService)
 *   * PONG: respuesta a PING (heartbeat)
 *
 * DEPENDENCIAS:
 * - Requiere: HTTP Server de Express (para montar WebSocket)
 * - Requerido por: TrackingService (emite eventos), Frontend (recibe actualizaciones)
 *
 * CONTEXTO PARALELO:
 * - Servicio SINGLETON: una sola instancia global para toda la aplicación
 * - Thread-safe: Node.js single-threaded (event loop), Map operations son síncronas
 * - Múltiples clientes: cada conexión tiene su clientId único
 * - Suscripciones: un cliente puede suscribirse a múltiples ejecuciones
 * - Broadcasting selectivo: eventos se emiten SOLO a clientes suscritos a esa ejecución
 * - Heartbeat: ping/pong cada 30s para detectar conexiones muertas
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
    this.getPoolFn = getPoolFn;

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
