/**
 * Configuración de la capa de servicios
 * Conecta directamente al backend Express + SQL Server
 */

// Derivar WebSocket URL del API URL
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';
const WS_BASE_URL = API_BASE_URL.replace('http://', 'ws://').replace('https://', 'wss://').replace('/api', '');

export const config = {
  // URL base del API
  API_BASE_URL,

  // WebSocket URL
  WS_URL: `${WS_BASE_URL}/api/ws/pipeline`,

  // Timeouts
  REQUEST_TIMEOUT: 60000, // 60 segundos (aumentado para queries pesadas con muchos fondos)

  // Retry configuration
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000, // 1 segundo
};

export default config;
