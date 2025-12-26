const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { getPool, closePool } = require('./config/database');

// Importar rutas
const catalogosRoutes = require('./routes/catalogos.routes');
const instrumentosRoutes = require('./routes/instrumentos.routes');
const companiasRoutes = require('./routes/companias.routes');
const colaPendientesRoutes = require('./routes/colaPendientes.routes');
const procesosV2Routes = require('./routes/procesos.v2.routes');
const sandboxQueuesRoutes = require('./routes/sandboxQueues.routes');
const logsRoutes = require('./routes/logs.routes');
const bloombergRoutes = require('./routes/bloomberg.routes');

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
    const pool = await getPool();
    const result = await pool.request().query('SELECT 1 as connected');
    res.json({
      success: true,
      status: 'healthy',
      database: 'connected',
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
// Rutas de procesos v2 (parallel processing con logging estructurado)
app.use('/api/procesos', procesosV2Routes);
// Rutas unificadas de colas sandbox (Mission Control)
app.use('/api/sandbox-queues', sandboxQueuesRoutes);
// Rutas de logs
app.use('/api/logs', logsRoutes);
// Rutas de Bloomberg job queue
app.use('/api/bloomberg', bloombergRoutes);

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
      bloomberg: {
        instruments: 'GET /api/bloomberg/instruments',
        createJob: 'POST /api/bloomberg/jobs',
        getJob: 'GET /api/bloomberg/jobs/:job_id',
        getJobs: 'GET /api/bloomberg/jobs',
        summary: 'GET /api/bloomberg/summary',
        cleanup: 'POST /api/bloomberg/cleanup',
        cashflows: 'GET /api/bloomberg/cashflows/:pk2',
        logs: 'GET /api/bloomberg/logs',
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

  // Probar conexión a BD
  try {
    await getPool();
    console.log('✅ Conexión a SQL Server establecida\n');
  } catch (err) {
    console.error('❌ Error conectando a SQL Server:', err.message);
    console.log('   Verifica la configuración en el archivo .env\n');
  }

  // ============================================
  // JOBS DE SINCRONIZACIÓN - ELIMINADOS
  // ============================================
  // Sistema de sincronización bidireccional eliminado el 2025-12-18
  console.log('ℹ️  Sistema de sincronización legacy descontinuado\n');
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Apagando servidor...');
  await closePool();
  server.close(() => {
    console.log('👋 Servidor cerrado\n');
    process.exit(0);
  });
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Apagando servidor...');
  await closePool();
  server.close(() => {
    console.log('👋 Servidor cerrado\n');
    process.exit(0);
  });
});

module.exports = app;
