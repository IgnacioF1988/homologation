# 📊 DevTools Logger - WebSocket Real-Time Logging

Sistema profesional de logging en tiempo real usando WebSocket para monitorear logs de DevTools.

## 🚀 Inicio Rápido

### 1. Instalar dependencias del servidor WebSocket

```bash
cd devtools-logger
npm install
```

### 2. Iniciar el servidor WebSocket

```bash
npm start
```

El servidor se iniciará en:
- **HTTP Server**: http://localhost:3002
- **WebSocket Server**: ws://localhost:3002
- **Dashboard**: http://localhost:3002/dashboard.html

### 3. Iniciar tu aplicación React

```bash
# En otra terminal
cd ..
npm start
```

Tu aplicación React (puerto 3000) ahora enviará automáticamente todos los logs al servidor WebSocket.

### 4. Abrir el Dashboard

Abre en tu navegador: **http://localhost:3002/dashboard.html**

¡Listo! Verás todos los logs en tiempo real.

---

## 📋 Características

✅ **Intercepta todos los console.log/error/warn/info/debug**
✅ **Dashboard en tiempo real con colores por nivel**
✅ **Filtros por nivel de log (Error, Warning, Info, Log)**
✅ **Auto-scroll configurable**
✅ **Exportar logs a JSON**
✅ **Reconexión automática**
✅ **Historial de logs (últimos 1000)**
✅ **Captura errores no manejados**
✅ **Timestamps precisos**

---

## 🎨 Dashboard

El dashboard incluye:
- **Indicador de conexión en tiempo real**
- **Contador de logs**
- **Filtros por nivel**
- **Auto-scroll ON/OFF**
- **Botón de limpiar**
- **Exportar a JSON**

---

## 🔧 Configuración Avanzada

### Cambiar puerto del servidor

Edita `server.js`:

```javascript
const PORT = 3002; // Cambiar aquí
```

### Cambiar URL del WebSocket en el cliente

Edita `src/utils/devToolsLogger.js`:

```javascript
window.devToolsLogger = new DevToolsLogger('ws://localhost:PUERTO_AQUI');
```

---

## 📊 Uso Manual (sin auto-inicialización)

Si quieres controlar cuándo activar el logger:

```javascript
import DevToolsLogger from './utils/devToolsLogger';

// Inicializar manualmente
const logger = new DevToolsLogger('ws://localhost:3002');

// Enviar log personalizado
logger.send({
  level: 'info',
  message: 'Mi mensaje custom',
  data: { foo: 'bar' }
});

// Desconectar
logger.disconnect();
```

---

## 🛠️ Scripts Disponibles

### En `devtools-logger/`

```bash
npm start          # Iniciar servidor WebSocket
```

### En raíz del proyecto

```bash
npm start          # Iniciar React (con logger integrado)
```

---

## 🔥 Comandos PowerShell para iniciar todo

```powershell
# Terminal 1 - Backend de tu app
cd C:\Users\ifuentes\homologation\server
$env:HOST="0.0.0.0"; $env:PORT="3001"; npm start

# Terminal 2 - Logger WebSocket
cd C:\Users\ifuentes\homologation\devtools-logger
npm start

# Terminal 3 - Frontend React
cd C:\Users\ifuentes\homologation
$env:REACT_APP_API_URL="http://10.56.220.92:3001/api"; npm start

# Abrir en navegador:
# - App: http://10.56.220.92:3000
# - Dashboard de Logs: http://localhost:3002/dashboard.html
```

---

## 📝 Estructura de Logs

Cada log enviado incluye:

```json
{
  "level": "info",
  "message": "Texto del log",
  "timestamp": "2025-12-18T15:30:00.000Z",
  "serverTimestamp": "2025-12-18T15:30:00.100Z",
  "userAgent": "Mozilla/5.0...",
  "url": "http://localhost:3000/",
  "args": 2
}
```

---

## 🎯 Tips

- El dashboard se actualiza automáticamente sin refrescar
- Los logs se mantienen en memoria (últimos 1000)
- Puedes tener múltiples dashboards abiertos
- Los errores no capturados se registran automáticamente
- Las promesas rechazadas también se capturan

---

## 🐛 Troubleshooting

**No se conecta al WebSocket:**
- Verifica que el servidor esté corriendo en el puerto 3002
- Revisa la consola del navegador para errores
- Asegúrate de que no haya firewall bloqueando el puerto

**No aparecen logs:**
- Verifica que `devToolsLogger.js` esté importado en `index.js`
- Revisa que esté en modo desarrollo o localhost
- Abre la consola del navegador para ver mensajes del logger

---

## 📦 Dependencias

- **ws**: WebSocket server
- **express**: HTTP server para servir el dashboard

---

¡Disfruta del logging en tiempo real! 🎉
