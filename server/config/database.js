const sql = require('mssql');
require('dotenv').config();

// Configuración base compartida
const baseConfig = {
  server: process.env.DB_SERVER || 'localhost',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT) || 1433,
  options: {
    encrypt: process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true',
    enableArithAbort: true,
    ...(process.env.DB_INSTANCE_NAME && { instanceName: process.env.DB_INSTANCE_NAME }),
  },
  pool: {
    max: 300,     // Pool grande para paralelización masiva (múltiples ejecuciones × 100+ fondos simultáneos)
    min: 20,      // Mantener conexiones baseline para respuesta rápida
    idleTimeoutMillis: 30000,
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

// Configuración para Inteligencia_Producto_Dev (BD principal de procesamiento)
const configPrincipal = {
  ...baseConfig,
  database: 'Inteligencia_Producto_Dev',
};

// Configuración para MonedaHomologacion (BD de frontend/sandbox)
const configHomologacion = {
  ...baseConfig,
  database: 'MonedaHomologacion',
};

let poolPrincipal = null;
let poolHomologacion = null;

/**
 * Obtiene el pool de conexión a Inteligencia_Producto_Dev (BD principal)
 */
const getPool = async () => {
  if (!poolPrincipal) {
    try {
      poolPrincipal = await sql.connect(configPrincipal);
      console.log('✅ Conectado a SQL Server:', configPrincipal.database);
    } catch (err) {
      console.error('❌ Error conectando a SQL Server (Principal):', err.message);
      throw err;
    }
  }
  return poolPrincipal;
};

/**
 * Obtiene el pool de conexión a MonedaHomologacion (BD de sandbox/frontend)
 */
const getPoolHomologacion = async () => {
  if (!poolHomologacion) {
    try {
      poolHomologacion = await new sql.ConnectionPool(configHomologacion).connect();
      console.log('✅ Conectado a SQL Server:', configHomologacion.database);
    } catch (err) {
      console.error('❌ Error conectando a SQL Server (Homologacion):', err.message);
      throw err;
    }
  }
  return poolHomologacion;
};

/**
 * Cierra ambos pools de conexión
 */
const closePool = async () => {
  if (poolPrincipal) {
    await poolPrincipal.close();
    poolPrincipal = null;
    console.log('🔌 Conexión a Inteligencia_Producto_Dev cerrada');
  }
  if (poolHomologacion) {
    await poolHomologacion.close();
    poolHomologacion = null;
    console.log('🔌 Conexión a MonedaHomologacion cerrada');
  }
};

module.exports = {
  sql,
  getPool,              // Pool principal (Inteligencia_Producto_Dev)
  getPoolHomologacion,  // Pool de homologación (MonedaHomologacion)
  closePool,
};
