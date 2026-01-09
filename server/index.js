const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { getPool, getPoolHomologacion, closePool } = require('./config/database');

// Importar WebSocket Manager
const wsManager = require('./services/websocket/WebSocketManager');

// Importar Service Broker Listener (arquitectura DB-centric)
const serviceBrokerListener = require('./services/broker/ServiceBrokerListener');

// Importar rutas
const catalogosRoutes = require('./routes/catalogos.routes');
const instrumentosRoutes = require('./routes/instrumentos.routes');
const companiasRoutes = require('./routes/companias.routes');
const colaPendientesRoutes = require('./routes/colaPendientes.routes');
// OBSOLETO: Reemplazado por pipeline.routes.js (arquitectura DB-centric)
// const procesosV2Routes = require('./routes/procesos.v2.routes.OLD');
const sandboxQueuesRoutes = require('./routes/sandboxQueues.routes');
// OBSOLETO: Consultas a estructura DB antigua
// const logsRoutes = require('./routes/logs.routes.OLD');
const pipelineRoutes = require('./routes/pipeline.routes');

const app = express();
const PORT = process.env.PORT || 3001;

// Middlewares
app.use(cors({
  origin: true, // Permite cualquier origen en desarrollo
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/api/health', async (req, res) => {
  try {
    const poolPrincipal = await getPool();
    const poolHomologacion = await getPoolHomologacion();

    const result1 = await poolPrincipal.request().query('SELECT DB_NAME() as db');
    const result2 = await poolHomologacion.request().query('SELECT DB_NAME() as db');

    // Estado del Service Broker Listener
    const brokerStatus = serviceBrokerListener.getStatus();

    res.json({
      success: true,
      status: 'healthy',
      databases: {
        principal: result1.recordset[0].db,
        homologacion: result2.recordset[0].db,
      },
      serviceBroker: brokerStatus,
      websocket: wsManager.getStats(),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      status: 'unhealthy',
      database: 'disconnected',
      error: err.message,
    });
  }
});

// Rutas API
app.use('/api/catalogos', catalogosRoutes);
app.use('/api/instrumentos', instrumentosRoutes);
app.use('/api/companias', companiasRoutes);
app.use('/api/cola-pendientes', colaPendientesRoutes);
// OBSOLETO: Rutas de procesos v2 - reemplazadas por /api/pipeline (DB-centric)
// app.use('/api/procesos', procesosV2Routes);
// Rutas unificadas de colas sandbox (Mission Control)
app.use('/api/sandbox-queues', sandboxQueuesRoutes);
// OBSOLETO: Rutas de logs - estructura DB antigua
// app.use('/api/logs', logsRoutes);
// Rutas de pipeline (arquitectura DB-centric)
app.use('/api/pipeline', pipelineRoutes);

// Ruta raíz
app.get('/api', (req, res) => {
  res.json({
    success: true,
    message: 'API de Homologación de Instrumentos Financieros',
    version: '1.0.0',
    endpoints: {
      health: 'GET /api/health',
      catalogos: {
        list: 'GET /api/catalogos',
        getAll: 'GET /api/catalogos/:catalogo',
        getById: 'GET /api/catalogos/:catalogo/:id',
        options: 'GET /api/catalogos/:catalogo/options',
      },
      instrumentos: {
        getAll: 'GET /api/instrumentos',
        search: 'GET /api/instrumentos/search?q=&limit=',
        checkDuplicate: 'GET /api/instrumentos/check-duplicate?field=&value=',
        getById: 'GET /api/instrumentos/:id',
        getByPK: 'GET /api/instrumentos/:id/moneda/:moneda',
        create: 'POST /api/instrumentos',
        bulkCreate: 'POST /api/instrumentos/bulk-create',
        update: 'PUT /api/instrumentos/:id/:moneda',
        delete: 'DELETE /api/instrumentos/:id/:moneda',
        stats: {
          byInvestmentType: 'GET /api/instrumentos/stats/by-investment-type',
          byCountry: 'GET /api/instrumentos/stats/by-country',
          bySector: 'GET /api/instrumentos/stats/by-sector',
          summary: 'GET /api/instrumentos/stats/summary',
        },
      },
      companias: {
        getAll: 'GET /api/companias',
        search: 'GET /api/companias/search?q=&limit=',
        getExact: 'GET /api/companias/exacta/:nombre',
        getById: 'GET /api/companias/:id',
        create: 'POST /api/companias',
        update: 'PUT /api/companias/:id',
        delete: 'DELETE /api/companias/:id',
      },
      colaPendientes: {
        getAll: 'GET /api/cola-pendientes',
        stats: 'GET /api/cola-pendientes/stats',
        getById: 'GET /api/cola-pendientes/:id',
        create: 'POST /api/cola-pendientes',
        updateEstado: 'PATCH /api/cola-pendientes/:id/estado',
        update: 'PUT /api/cola-pendientes/:id',
        delete: 'DELETE /api/cola-pendientes/:id',
      },
      pipeline: {
        iniciar: 'POST /api/pipeline/iniciar',
        pausar: 'POST /api/pipeline/:id/pausar',
        resumir: 'POST /api/pipeline/:id/resumir',
        cancelar: 'POST /api/pipeline/:id/cancelar',
        reprocesar: 'POST /api/pipeline/:id/reprocesar/:idFund',
        estado: 'GET /api/pipeline/:id/estado',
        activas: 'GET /api/pipeline/activas',
        historial: 'GET /api/pipeline/historial',
        brokerStatus: 'GET /api/pipeline/broker/status',
        brokerTest: 'POST /api/pipeline/broker/test',
      },
      websocket: {
        connect: 'WS /api/ws/pipeline',
        subscribe: 'Send: { type: "SUBSCRIBE", data: { ID_Ejecucion: 123 } }',
        unsubscribe: 'Send: { type: "UNSUBSCRIBE", data: { ID_Ejecucion: 123 } }',
      },
    },
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `Ruta ${req.method} ${req.path} no encontrada`,
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    success: false,
    error: err.message || 'Error interno del servidor',
  });
});

// Iniciar servidor - escuchar en todas las interfaces (0.0.0.0)
const HOST = process.env.HOST || '0.0.0.0';
const server = app.listen(PORT, HOST, async () => {
  console.log(`\n🚀 Servidor iniciado en http://${HOST}:${PORT}`);
  console.log(`📚 API docs: http://localhost:${PORT}/api`);
  console.log(`❤️  Health check: http://localhost:${PORT}/api/health\n`);

  // Probar conexión a ambas BDs
  try {
    await getPool();
    await getPoolHomologacion();
    console.log('✅ Conexiones a SQL Server establecidas (ambas BDs)\n');
  } catch (err) {
    console.error('❌ Error conectando a SQL Server:', err.message);
    console.log('   Verifica la configuración en el archivo .env\n');
  }

  // ============================================
  // INICIALIZAR WEBSOCKET MANAGER
  // ============================================
  try {
    wsManager.initialize(server);
    console.log('✅ WebSocket Manager inicializado\n');
  } catch (err) {
    console.error('❌ Error inicializando WebSocket Manager:', err.message);
  }

  // ============================================
  // INICIALIZAR SERVICE BROKER LISTENER
  // ============================================
  // Arquitectura DB-centric: La DB orquesta, el backend escucha
  try {
    const dbConfig = {
      server: process.env.DB_SERVER || 'localhost',
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      port: parseInt(process.env.DB_PORT) || 1433,
      options: {
        encrypt: process.env.DB_ENCRYPT === 'true',
        trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true',
      },
      authentication: process.env.DB_USER ? {
        type: 'default',
        options: {
          userName: process.env.DB_USER,
          password: process.env.DB_PASSWORD
        }
      } : {
        type: 'ntlm',
        options: {
          domain: process.env.DB_DOMAIN || '',
        }
      },
    };

    await serviceBrokerListener.initialize(dbConfig, wsManager);
    console.log('✅ Service Broker Listener inicializado\n');
  } catch (err) {
    console.error('❌ Error inicializando Service Broker Listener:', err.message);
    console.log('   El servidor continuará sin push notifications desde DB\n');
  }

  console.log('🎯 Arquitectura DB-centric activa:');
  console.log('   - DB orquesta el pipeline');
  console.log('   - Service Broker emite eventos');
  console.log('   - Backend escucha y retransmite via WebSocket\n');
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Apagando servidor...');

  // Detener Service Broker Listener primero
  await serviceBrokerListener.stop();

  // Cerrar WebSocket Manager
  wsManager.close();

  // Cerrar conexiones de BD
  await closePool();

  // Cerrar servidor HTTP
  server.close(() => {
    console.log('👋 Servidor cerrado\n');
    process.exit(0);
  });
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Apagando servidor...');

  // Detener Service Broker Listener primero
  await serviceBrokerListener.stop();

  // Cerrar WebSocket Manager
  wsManager.close();

  // Cerrar conexiones de BD
  await closePool();

  // Cerrar servidor HTTP
  server.close(() => {
    console.log('👋 Servidor cerrado\n');
    process.exit(0);
  });
});

module.exports = app;
