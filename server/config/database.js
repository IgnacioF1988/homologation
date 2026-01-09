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
    max: 50,      // Pool optimizado: 5 fondos × 4 SPs paralelos × 2 (margen) = ~40 conexiones
    min: 10,      // Conexiones baseline reducidas
    idleTimeoutMillis: 30000,
  },
  requestTimeout: 120000,  // 120 segundos para SPs de extracción (evita timeout con paralelización)
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

// Configuración para BD principal de procesamiento (desde .env)
const configPrincipal = {
  ...baseConfig,
  database: process.env.DB_DATABASE,
};

// Configuración para MonedaHomologacion (BD de frontend/sandbox)
const configHomologacion = {
  ...baseConfig,
  database: 'MonedaHomologacion',
};

let poolPrincipal = null;
let poolHomologacion = null;

/**
 * Obtiene el pool de conexión a la BD principal (configurada en .env DB_DATABASE)
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
    console.log('🔌 Conexión a BD principal cerrada');
  }
  if (poolHomologacion) {
    await poolHomologacion.close();
    poolHomologacion = null;
    console.log('🔌 Conexión a MonedaHomologacion cerrada');
  }
};

module.exports = {
  sql,
  getPool,              // Pool principal (DB_DATABASE en .env)
  getPoolHomologacion,  // Pool de homologación (MonedaHomologacion)
  closePool,
};
