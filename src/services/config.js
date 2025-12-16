/**
 * Configuración de la capa de servicios
 * Conecta directamente al backend Express + SQL Server
 */

export const config = {
  // URL base del API
  API_BASE_URL: process.env.REACT_APP_API_URL || 'http://localhost:3001/api',

  // Timeouts
  REQUEST_TIMEOUT: 30000, // 30 segundos

  // Retry configuration
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000, // 1 segundo
};

export default config;
