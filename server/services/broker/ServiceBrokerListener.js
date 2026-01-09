/**
 * ServiceBrokerListener - Listener Persistente para Service Broker
 *
 * ARQUITECTURA DB-CENTRIC:
 * Este listener mantiene una conexion DEDICADA (no del pool) para recibir
 * mensajes del Service Broker de SQL Server. Utiliza WAITFOR RECEIVE para
 * escuchar eventos push desde la base de datos.
 *
 * RECIBE:
 * - Eventos desde DB via Service Broker (SP_INICIO, SP_FIN, ERROR, STANDBY, etc.)
 *
 * PROCESA:
 * - Loop persistente con WAITFOR RECEIVE
 * - Parsea mensajes JSON del Service Broker
 * - Delega procesamiento a MessageProcessor
 *
 * ENVIA:
 * - Eventos al MessageProcessor para distribucion via WebSocket
 *
 * RECONEXION:
 * - Backoff exponencial en caso de desconexion
 * - Auto-reconexion transparente
 */

const sql = require('mssql');
const config = require('../../config/serviceBroker.config');
const MessageProcessor = require('./MessageProcessor');

class ServiceBrokerListener {
  constructor() {
    this.connection = null;
    this.isRunning = false;
    this.reconnectAttempt = 0;
    this.messageProcessor = null;
    this.dbConfig = null;
  }

  /**
   * Inicializar el listener
   * @param {Object} dbConfig - Configuracion de conexion a SQL Server
   * @param {Object} wsManager - Instancia del WebSocketManager
   */
  async initialize(dbConfig, wsManager) {
    this.dbConfig = {
      ...dbConfig,
      database: config.database,
      options: {
        ...dbConfig.options,
        enableArithAbort: true,
      },
      requestTimeout: config.requestTimeout,
      // Conexion dedicada, no usar pool
      pool: {
        max: 1,
        min: 1,
        idleTimeoutMillis: 300000, // 5 minutos (nunca deberia aplicar con min=1)
      },
    };

    this.messageProcessor = new MessageProcessor(wsManager);

    console.log('[ServiceBrokerListener] Inicializando...');

    await this.connect();
    this.startListening();
  }

  /**
   * Establecer conexion dedicada
   */
  async connect() {
    try {
      // Cerrar conexion existente si hay
      if (this.connection) {
        try {
          await this.connection.close();
        } catch (e) {
          // Ignorar errores al cerrar
        }
      }

      // Nueva conexion dedicada
      this.connection = await new sql.ConnectionPool(this.dbConfig).connect();

      console.log(`[ServiceBrokerListener] Conectado a ${config.database}`);

      // Verificar que Service Broker esta habilitado
      const result = await this.connection.request().query(`
        SELECT is_broker_enabled
        FROM sys.databases
        WHERE name = DB_NAME()
      `);

      if (!result.recordset[0]?.is_broker_enabled) {
        throw new Error('Service Broker no esta habilitado en la base de datos');
      }

      console.log('[ServiceBrokerListener] Service Broker habilitado - OK');

      // Reset reconnect attempt on successful connection
      this.reconnectAttempt = 0;

      return true;
    } catch (error) {
      console.error('[ServiceBrokerListener] Error conectando:', error.message);
      throw error;
    }
  }

  /**
   * Iniciar loop de escucha
   */
  startListening() {
    if (this.isRunning) {
      console.warn('[ServiceBrokerListener] Ya esta escuchando');
      return;
    }

    this.isRunning = true;
    console.log('[ServiceBrokerListener] Iniciando loop de escucha...');

    this.listenLoop();
  }

  /**
   * Loop principal de escucha
   * Usa WAITFOR RECEIVE para esperar mensajes
   */
  async listenLoop() {
    while (this.isRunning) {
      try {
        const messages = await this.receiveMessages();

        if (messages && messages.length > 0) {
          await this.processMessages(messages);
        }
      } catch (error) {
        console.error('[ServiceBrokerListener] Error en loop:', error.message);

        if (!this.isRunning) break;

        // Intentar reconectar
        await this.handleDisconnect();
      }
    }

    console.log('[ServiceBrokerListener] Loop de escucha terminado');
  }

  /**
   * Recibir mensajes del Service Broker
   * Usa WAITFOR RECEIVE con timeout
   */
  async receiveMessages() {
    if (!this.connection || !this.connection.connected) {
      throw new Error('No hay conexion activa');
    }

    const timeoutSeconds = Math.floor(config.receiveTimeout / 1000);

    // WAITFOR RECEIVE con timeout
    // Esto bloquea hasta que llegue un mensaje o expire el timeout
    const result = await this.connection.request().query(`
      WAITFOR (
        RECEIVE TOP (${config.maxMessages})
          conversation_handle,
          message_type_name,
          message_body,
          message_sequence_number
        FROM ${config.queueName}
      ), TIMEOUT ${timeoutSeconds * 1000};
    `);

    return result.recordset;
  }

  /**
   * Procesar batch de mensajes recibidos
   */
  async processMessages(messages) {
    for (const msg of messages) {
      try {
        const messageType = msg.message_type_name;
        const conversationHandle = msg.conversation_handle;

        // Manejar mensajes de sistema de Service Broker
        if (this.isSystemMessage(messageType)) {
          await this.handleSystemMessage(messageType, msg, conversationHandle);
          continue;
        }

        // Parsear mensaje - NVARCHAR de SQL Server es UTF-16LE
        const messageBody = msg.message_body
          ? msg.message_body.toString('utf16le')
          : null;

        if (!messageBody) {
          console.warn('[ServiceBrokerListener] Mensaje sin body, ignorando');
          continue;
        }

        // Parsear JSON
        let payload;
        try {
          payload = JSON.parse(messageBody);
        } catch (parseError) {
          console.error('[ServiceBrokerListener] Error parseando JSON:', parseError.message);
          console.error('[ServiceBrokerListener] Body raw:', messageBody.substring(0, 200));
          continue;
        }

        // Delegar al MessageProcessor
        await this.messageProcessor.process(payload);

      } catch (error) {
        console.error('[ServiceBrokerListener] Error procesando mensaje:', error.message);
      }
    }
  }

  /**
   * Verificar si es un mensaje de sistema de Service Broker
   */
  isSystemMessage(messageType) {
    const systemTypes = [
      'http://schemas.microsoft.com/SQL/ServiceBroker/Error',
      'http://schemas.microsoft.com/SQL/ServiceBroker/EndDialog',
      'http://schemas.microsoft.com/SQL/ServiceBroker/DialogTimer'
    ];
    return systemTypes.includes(messageType);
  }

  /**
   * Manejar mensajes de sistema de Service Broker
   */
  async handleSystemMessage(messageType, msg, conversationHandle) {
    if (messageType === 'http://schemas.microsoft.com/SQL/ServiceBroker/Error') {
      // Mensaje de error - la conversacion expiro o hubo un problema
      const errorBody = msg.message_body ? msg.message_body.toString('utf16le') : '';

      // Extraer codigo de error del XML si es posible
      const codeMatch = errorBody.match(/<Code>(-?\d+)<\/Code>/);
      const descMatch = errorBody.match(/<Description>([^<]+)<\/Description>/);

      const errorCode = codeMatch ? codeMatch[1] : 'unknown';
      const errorDesc = descMatch ? descMatch[1] : 'unknown';

      console.log(`[ServiceBrokerListener] Mensaje de error del broker - Code: ${errorCode}, Desc: ${errorDesc}`);

      // Limpiar la conversacion con error
      await this.cleanupConversation(conversationHandle);

    } else if (messageType === 'http://schemas.microsoft.com/SQL/ServiceBroker/EndDialog') {
      // Dialogo terminado normalmente
      console.log('[ServiceBrokerListener] EndDialog recibido, cerrando conversacion');
      await this.cleanupConversation(conversationHandle);

    } else {
      console.log(`[ServiceBrokerListener] Mensaje de sistema ignorado: ${messageType}`);
    }
  }

  /**
   * Limpiar una conversacion
   */
  async cleanupConversation(conversationHandle) {
    try {
      if (!this.connection || !this.connection.connected) return;

      await this.connection.request().query(`
        END CONVERSATION '${conversationHandle}' WITH CLEANUP
      `);
      console.log('[ServiceBrokerListener] Conversacion limpiada');
    } catch (error) {
      // Ignorar errores - puede que la conversacion ya este cerrada
      console.log('[ServiceBrokerListener] Conversacion ya cerrada o error:', error.message);
    }
  }

  /**
   * Manejar desconexion con backoff exponencial
   */
  async handleDisconnect() {
    const delay = config.reconnectIntervals[
      Math.min(this.reconnectAttempt, config.reconnectIntervals.length - 1)
    ];

    console.log(`[ServiceBrokerListener] Reconectando en ${delay}ms (intento ${this.reconnectAttempt + 1})...`);

    this.reconnectAttempt++;

    await this.sleep(delay);

    try {
      await this.connect();
      console.log('[ServiceBrokerListener] Reconexion exitosa');
    } catch (error) {
      console.error('[ServiceBrokerListener] Reconexion fallida:', error.message);
      // El loop continuara e intentara de nuevo
    }
  }

  /**
   * Detener el listener
   */
  async stop() {
    console.log('[ServiceBrokerListener] Deteniendo...');

    this.isRunning = false;

    if (this.connection) {
      try {
        await this.connection.close();
        console.log('[ServiceBrokerListener] Conexion cerrada');
      } catch (error) {
        console.error('[ServiceBrokerListener] Error cerrando conexion:', error.message);
      }
      this.connection = null;
    }
  }

  /**
   * Obtener estado del listener
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      isConnected: this.connection?.connected || false,
      reconnectAttempt: this.reconnectAttempt,
      database: config.database,
      queue: config.queueName,
    };
  }

  /**
   * Helper para sleep
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Singleton
const serviceBrokerListener = new ServiceBrokerListener();

module.exports = serviceBrokerListener;
