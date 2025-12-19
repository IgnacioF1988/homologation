const sql = require('mssql');
require('dotenv').config();

const config = {
  server: process.env.DB_SERVER || 'localhost',
  database: process.env.DB_DATABASE || 'Inteligencia_Producto_Dev',
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
    max: 200,     // Pool grande para paralelización masiva (múltiples ejecuciones × 100+ fondos simultáneos)
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

let pool = null;

const getPool = async () => {
  if (!pool) {
    try {
      pool = await sql.connect(config);
      console.log('Conectado a SQL Server:', config.database);
    } catch (err) {
      console.error('Error conectando a SQL Server:', err.message);
      throw err;
    }
  }
  return pool;
};

const closePool = async () => {
  if (pool) {
    await pool.close();
    pool = null;
    console.log('Conexión a SQL Server cerrada');
  }
};

module.exports = {
  sql,
  getPool,
  closePool,
};
