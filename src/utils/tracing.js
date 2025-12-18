/**
 * tracing.js - Sistema de logging estructurado para debugging del flujo de formularios
 *
 * PROPOSITO:
 * Proporciona namespaces claros para logs en diferentes partes del sistema,
 * facilitando el debugging de problemas de flujo, validaciones y comportamiento.
 *
 * NAMESPACES:
 * - [FLOW]: Cálculo de steps, visibilidad de secciones
 * - [VALIDATION]: Validación de campos required/conditional
 * - [CASCADE]: Limpieza en cascada de campos
 * - [DEFAULTS]: Aplicación de default values
 * - [READONLY]: Determinación de campos readonly
 * - [CONFIG]: Carga de configuraciones por tipo
 * - [COMPANY]: Auto-populate de compañía
 * - [MODE]: Cambios de modo (nueva/exacta/parcial)
 *
 * USO:
 * import { trace, TRACE } from './utils/tracing';
 *
 * trace.flow('Calculando step actual', { step: 3, formData });
 * trace.enter(TRACE.VALIDATION, 'validateField', { fieldName, value });
 * trace.exit(TRACE.VALIDATION, 'validateField', { isValid: true });
 */

// ===========================================
// NAMESPACES DE LOGGING
// ===========================================
export const TRACE = {
  FLOW: '[FLOW]',           // Cálculo de steps, visibilidad de secciones
  VALIDATION: '[VALIDATION]', // Validación de campos required/conditional
  CASCADE: '[CASCADE]',     // Limpieza en cascada de campos
  DEFAULTS: '[DEFAULTS]',   // Aplicación de default values
  READONLY: '[READONLY]',   // Determinación de campos readonly
  CONFIG: '[CONFIG]',       // Carga de configuraciones por tipo
  COMPANY: '[COMPANY]',     // Auto-populate de compañía
  MODE: '[MODE]',           // Cambios de modo (nueva/exacta/parcial)
};

// ===========================================
// CONFIGURACION DE TRACING
// ===========================================

// Flag global para habilitar/deshabilitar tracing
// Cambiar a false para silenciar todos los logs de tracing
let TRACING_ENABLED = true;

// Configuración de namespaces habilitados
// Puedes deshabilitar namespaces específicos para reducir noise
const ENABLED_NAMESPACES = {
  [TRACE.FLOW]: true,
  [TRACE.VALIDATION]: true,
  [TRACE.CASCADE]: true,
  [TRACE.DEFAULTS]: true,
  [TRACE.READONLY]: true,
  [TRACE.CONFIG]: true,
  [TRACE.COMPANY]: true,
  [TRACE.MODE]: true,
};

/**
 * Habilitar/deshabilitar tracing globalmente
 */
export const setTracingEnabled = (enabled) => {
  TRACING_ENABLED = enabled;
};

/**
 * Habilitar/deshabilitar un namespace específico
 */
export const setNamespaceEnabled = (namespace, enabled) => {
  ENABLED_NAMESPACES[namespace] = enabled;
};

/**
 * Verificar si un namespace está habilitado
 */
const isNamespaceEnabled = (namespace) => {
  return TRACING_ENABLED && ENABLED_NAMESPACES[namespace] !== false;
};

// ===========================================
// FUNCIONES DE LOGGING
// ===========================================

/**
 * Log genérico por namespace
 */
const log = (namespace, message, data = null) => {
  if (!isNamespaceEnabled(namespace)) return;

  if (data !== null && data !== undefined) {
    console.log(namespace, message, data);
  } else {
    console.log(namespace, message);
  }
};

/**
 * Log de entrada a función (útil para trazar call stack)
 */
const enter = (namespace, functionName, params = null) => {
  if (!isNamespaceEnabled(namespace)) return;

  const message = `→ ENTER ${functionName}`;
  if (params !== null && params !== undefined) {
    console.log(namespace, message, params);
  } else {
    console.log(namespace, message);
  }
};

/**
 * Log de salida de función (útil para ver resultados)
 */
const exit = (namespace, functionName, result = null) => {
  if (!isNamespaceEnabled(namespace)) return;

  const message = `← EXIT ${functionName}`;
  if (result !== null && result !== undefined) {
    console.log(namespace, message, result);
  } else {
    console.log(namespace, message);
  }
};

/**
 * Log de error con stack trace
 */
const error = (namespace, message, errorObj = null) => {
  if (!isNamespaceEnabled(namespace)) return;

  console.error(namespace, '❌', message);
  if (errorObj) {
    console.error(namespace, errorObj);
  }
};

/**
 * Log de warning
 */
const warn = (namespace, message, data = null) => {
  if (!isNamespaceEnabled(namespace)) return;

  if (data !== null && data !== undefined) {
    console.warn(namespace, '⚠️', message, data);
  } else {
    console.warn(namespace, '⚠️', message);
  }
};

/**
 * Log de éxito/confirmación
 */
const success = (namespace, message, data = null) => {
  if (!isNamespaceEnabled(namespace)) return;

  if (data !== null && data !== undefined) {
    console.log(namespace, '✅', message, data);
  } else {
    console.log(namespace, '✅', message);
  }
};

// ===========================================
// OBJETO TRACE EXPORTADO
// ===========================================

export const trace = {
  // Logs por namespace específico
  flow: (message, data) => log(TRACE.FLOW, message, data),
  validation: (message, data) => log(TRACE.VALIDATION, message, data),
  cascade: (message, data) => log(TRACE.CASCADE, message, data),
  defaults: (message, data) => log(TRACE.DEFAULTS, message, data),
  readonly: (message, data) => log(TRACE.READONLY, message, data),
  config: (message, data) => log(TRACE.CONFIG, message, data),
  company: (message, data) => log(TRACE.COMPANY, message, data),
  mode: (message, data) => log(TRACE.MODE, message, data),

  // Funciones de entrada/salida
  enter,
  exit,

  // Funciones de nivel
  error,
  warn,
  success,

  // Log genérico (usa cualquier namespace)
  log,
};

// ===========================================
// HELPERS DE DEBUGGING
// ===========================================

/**
 * Crea un objeto de debug con timestamp para análisis posterior
 */
export const createDebugSnapshot = (namespace, label, data) => {
  return {
    namespace,
    label,
    timestamp: new Date().toISOString(),
    data,
  };
};

/**
 * Registra el tiempo de ejecución de una función
 */
export const traceTime = async (namespace, functionName, fn) => {
  if (!isNamespaceEnabled(namespace)) {
    return await fn();
  }

  const startTime = performance.now();
  trace.enter(namespace, functionName);

  try {
    const result = await fn();
    const endTime = performance.now();
    const duration = (endTime - startTime).toFixed(2);

    trace.exit(namespace, functionName, {
      duration: `${duration}ms`,
      result
    });

    return result;
  } catch (error) {
    const endTime = performance.now();
    const duration = (endTime - startTime).toFixed(2);

    trace.error(namespace, `Error in ${functionName} after ${duration}ms`, error);
    throw error;
  }
};

/**
 * Agrupa múltiples logs relacionados
 */
export const traceGroup = (namespace, groupName, fn) => {
  if (!isNamespaceEnabled(namespace)) {
    fn();
    return;
  }

  console.group(namespace, groupName);
  try {
    fn();
  } finally {
    console.groupEnd();
  }
};

export default trace;
