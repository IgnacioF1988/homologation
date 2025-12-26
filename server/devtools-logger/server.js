const WebSocket = require('ws');
const express = require('express');
const path = require('path');

const app = express();
const PORT = 3002;

// Servir archivos estáticos
app.use(express.static('public'));

// Crear servidor HTTP
const HOST = '0.0.0.0'; // Escuchar en todas las interfaces
const server = app.listen(PORT, HOST, () => {
  console.log(`🚀 Servidor HTTP corriendo en http://0.0.0.0:${PORT}`);
  console.log(`📊 Dashboard Local: http://localhost:${PORT}/dashboard.html`);
  console.log(`📊 Dashboard Red: http://10.56.220.92:${PORT}/dashboard.html`);
});

// Crear servidor WebSocket
const wss = new WebSocket.Server({ server });

let clients = [];
let logHistory = [];

wss.on('connection', (ws, req) => {
  const clientType = req.url.includes('dashboard') ? 'dashboard' : 'logger';
  
  console.log(`✅ Cliente conectado: ${clientType}`);
  
  const client = { ws, type: clientType, connectedAt: new Date() };
  clients.push(client);

  // Enviar historial a dashboards
  if (clientType === 'dashboard') {
    ws.send(JSON.stringify({
      type: 'history',
      logs: logHistory
    }));
  }

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      // Agregar timestamp del servidor
      data.serverTimestamp = new Date().toISOString();
      
      // Guardar en historial
      logHistory.push(data);
      
      // Mantener solo últimos 1000 logs
      if (logHistory.length > 1000) {
        logHistory = logHistory.slice(-1000);
      }

      // Reenviar a todos los dashboards
      clients.forEach(client => {
        if (client.type === 'dashboard' && client.ws.readyState === WebSocket.OPEN) {
          client.ws.send(JSON.stringify({
            type: 'log',
            data: data
          }));
        }
      });

      // Log en consola del servidor
      console.log(`[${data.level || 'LOG'}] ${data.message || JSON.stringify(data)}`);
      
    } catch (error) {
      console.error('Error procesando mensaje:', error);
    }
  });

  ws.on('close', () => {
    clients = clients.filter(c => c.ws !== ws);
    console.log(`❌ Cliente desconectado: ${clientType} (${clients.length} restantes)`);
  });

  ws.on('error', (error) => {
    console.error('Error en WebSocket:', error);
  });
});

console.log(`🔌 Servidor WebSocket corriendo en ws://localhost:${PORT}`);
console.log(`\n📝 Para conectar desde tu app:\n`);
console.log(`   const ws = new WebSocket('ws://localhost:${PORT}');`);
console.log(`   ws.send(JSON.stringify({ level: 'info', message: 'Hello!' }));\n`);
