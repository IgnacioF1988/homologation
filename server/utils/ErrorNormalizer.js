/**
 * ErrorNormalizer - Utilidad para normalizar errores del pipeline
 *
 * Estandariza la estructura de errores para eventos y logging,
 * detectando tipos especiales (deadlock, timeout, conexion).
 *
 * @module utils/ErrorNormalizer
 */

/**
 * Codigos de error SQL Server conocidos
 */
const SQL_ERROR_CODES = {
  DEADLOCK: 1205,
  LOCK_TIMEOUT: 1222,
  QUERY_TIMEOUT: -2
};

/**
 * Codigos de error de conexion Node.js
 */
const CONNECTION_ERROR_CODES = ['ECONNRESET', 'ESOCKET', 'ECONNREFUSED', 'ETIMEDOUT'];

/**
 * Normaliza un error a estructura estandar
 *
 * @param {Error|object|string} error - Error a normalizar
 * @returns {object} - Estructura normalizada
 */
function normalize(error) {
  if (!error) {
    return {
      message: 'Error desconocido',
      stack: null,
      code: null,
      name: 'Error',
      isDeadlock: false,
      isTimeout: false,
      isConnection: false,
      isRetriable: false
    };
  }

  // Si es string, convertir a objeto
  if (typeof error === 'string') {
    return {
      message: error,
      stack: null,
      code: null,
      name: 'Error',
      isDeadlock: false,
      isTimeout: false,
      isConnection: false,
      isRetriable: false
    };
  }

  // Extraer propiedades del error
  const message = error.message || String(error);
  const stack = error.stack || null;
  const code = error.code || error.number || null;
  const name = error.name || 'Error';

  // Detectar tipos especiales
  const isDeadlock = error.number === SQL_ERROR_CODES.DEADLOCK;
  const isLockTimeout = error.number === SQL_ERROR_CODES.LOCK_TIMEOUT;
  const isQueryTimeout = error.code === 'ETIMEOUT' || error.number === SQL_ERROR_CODES.QUERY_TIMEOUT;
  const isTimeout = isLockTimeout || isQueryTimeout;
  const isConnection = CONNECTION_ERROR_CODES.includes(error.code);

  // Determinar si es retriable
  const isRetriable = isDeadlock || isTimeout || isConnection;

  return {
    message,
    stack,
    code,
    name,
    isDeadlock,
    isTimeout,
    isConnection,
    isRetriable,
    // Campos adicionales para debugging
    originalNumber: error.number || null,
    originalCode: error.code || null
  };
}

/**
 * Normaliza error para eventos (version compacta sin stack)
 *
 * @param {Error|object|string} error - Error a normalizar
 * @returns {object} - Estructura compacta para eventos
 */
function normalizeForEvent(error) {
  const normalized = normalize(error);
  return {
    message: normalized.message,
    code: normalized.code,
    name: normalized.name,
    isDeadlock: normalized.isDeadlock,
    isTimeout: normalized.isTimeout,
    isConnection: normalized.isConnection
  };
}

/**
 * Normaliza error para logging (version completa con stack)
 *
 * @param {Error|object|string} error - Error a normalizar
 * @returns {object} - Estructura completa para logging
 */
function normalizeForLog(error) {
  return normalize(error);
}

/**
 * Verifica si un error es retriable
 *
 * @param {Error|object} error - Error a verificar
 * @returns {boolean}
 */
function isRetriable(error) {
  if (!error) return false;

  const isDeadlock = error.number === SQL_ERROR_CODES.DEADLOCK;
  const isTimeout = error.code === 'ETIMEOUT' || error.number === SQL_ERROR_CODES.QUERY_TIMEOUT;
  const isConnection = CONNECTION_ERROR_CODES.includes(error.code);

  return isDeadlock || isTimeout || isConnection;
}

module.exports = {
  normalize,
  normalizeForEvent,
  normalizeForLog,
  isRetriable,
  SQL_ERROR_CODES,
  CONNECTION_ERROR_CODES
};
