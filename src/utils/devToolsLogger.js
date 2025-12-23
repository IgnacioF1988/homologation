/**
 * WebSocket Logger Client
 * Intercepta console.log, console.error, etc. y los envía al servidor WebSocket
 */

class DevToolsLogger {
  constructor(wsUrl = 'ws://localhost:3002') {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.queue = [];
    this.connected = false;
    this.originalConsole = {};
    
    this.connect();
    this.interceptConsole();
  }

  connect() {
    try {
      this.ws = new WebSocket(this.wsUrl);

      this.ws.onopen = () => {
        console.log('%c[DevToolsLogger] Conectado al servidor', 'color: #28a745; font-weight: bold;');
        this.connected = true;
        this.flushQueue();
      };

      this.ws.onclose = () => {
        console.log('%c[DevToolsLogger] Desconectado del servidor', 'color: #dc3545; font-weight: bold;');
        this.connected = false;
        
        // Reintentar conexión después de 5 segundos
        setTimeout(() => this.connect(), 5000);
      };

      this.ws.onerror = (error) => {
        console.error('[DevToolsLogger] Error:', error);
      };
    } catch (error) {
      console.error('[DevToolsLogger] Error al conectar:', error);
      setTimeout(() => this.connect(), 5000);
    }
  }

  send(data) {
    const logEntry = {
      ...data,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href
    };

    if (this.connected && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(logEntry));
    } else {
      // Guardar en cola si no está conectado
      this.queue.push(logEntry);
      
      // Limitar tamaño de la cola
      if (this.queue.length > 100) {
        this.queue.shift();
      }
    }
  }

  flushQueue() {
    while (this.queue.length > 0) {
      const entry = this.queue.shift();
      this.ws.send(JSON.stringify(entry));
    }
  }

  interceptConsole() {
    const levels = ['log', 'info', 'warn', 'error', 'debug'];
    
    levels.forEach(level => {
      this.originalConsole[level] = console[level];
      
      console[level] = (...args) => {
        // Llamar al console original
        this.originalConsole[level].apply(console, args);
        
        // Enviar al WebSocket
        const message = args.map(arg => {
          if (typeof arg === 'object') {
            try {
              return JSON.stringify(arg, null, 2);
            } catch (e) {
              return String(arg);
            }
          }
          return String(arg);
        }).join(' ');

        this.send({
          level,
          message,
          args: args.length
        });
      };
    });

    // Interceptar errores no capturados
    window.addEventListener('error', (event) => {
      this.send({
        level: 'error',
        message: `Uncaught Error: ${event.message}`,
        stack: event.error?.stack,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno
      });
    });

    // Interceptar promesas rechazadas
    window.addEventListener('unhandledrejection', (event) => {
      this.send({
        level: 'error',
        message: `Unhandled Promise Rejection: ${event.reason}`,
        stack: event.reason?.stack
      });
    });
  }

  restore() {
    Object.keys(this.originalConsole).forEach(level => {
      console[level] = this.originalConsole[level];
    });
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
    }
    this.restore();
  }
}

// Auto-inicializar si está en desarrollo
if (process.env.NODE_ENV === 'development' || window.location.hostname === 'localhost') {
  window.devToolsLogger = new DevToolsLogger();
  console.log('%c📊 DevTools Logger activado', 'color: #0e639c; font-weight: bold; font-size: 14px;');
}

export default DevToolsLogger;
