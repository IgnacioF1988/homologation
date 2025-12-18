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
 *
 * NUEVAS FUNCIONES:
 * - traceAsync: Rastrear operaciones asíncronas con IDs únicos
 * - traceState: Capturar snapshots de estado con diffs opcionales
 * - window.tracing: API de consola para control en tiempo de ejecución
 */

// ===========================================
// REACT WARNING INTERCEPTION
// ===========================================

// Store original console methods before intercepting
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

// Helper to get active operations (will be defined later)
let getActiveOperationsRef = null;

// Intercept console.error to detect and enrich React warnings
console.error = (...args) => {
  const message = args[0];

  if (typeof message === 'string') {
    // Detect React duplicate key warning
    if (message.includes('Each child in a list') || message.includes('unique "key" prop')) {
      console.group('%c🔴 REACT WARNING: Duplicate Keys Detected', 'color: #F44336; font-weight: bold; font-size: 1.1em;');
      console.warn('This usually means a field is rendering duplicate options or components');
      if (getActiveOperationsRef) {
        console.warn('Active async operations:', getActiveOperationsRef());
      }
      console.trace('Origin stack:');
      originalConsoleError.apply(console, args);
      console.groupEnd();
      return;
    }

    // Detect state update during render warning
    if (message.includes('Cannot update a component') || message.includes('during an existing state transition')) {
      console.group('%c🔴 REACT WARNING: State Update During Render', 'color: #F44336; font-weight: bold; font-size: 1.1em;');
      console.warn('A component is trying to update state while rendering');
      if (getActiveOperationsRef) {
        console.warn('Active async operations:', getActiveOperationsRef());
      }
      originalConsoleError.apply(console, args);
      console.groupEnd();
      return;
    }
  }

  originalConsoleError.apply(console, args);
};

// Intercept console.warn for findDOMNode deprecation warnings
console.warn = (...args) => {
  const message = args[0];

  if (typeof message === 'string' && message.includes('findDOMNode')) {
    console.group('%c⚠️ REACT WARNING: findDOMNode Deprecated', 'color: #FF9800; font-weight: bold;');
    console.log('Consider using refs instead of findDOMNode');
    originalConsoleWarn.apply(console, args);
    console.groupEnd();
    return;
  }

  originalConsoleWarn.apply(console, args);
};

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

// ===========================================
// SETTINGS PERSISTENCE (localStorage)
// ===========================================

const SETTINGS_KEY = 'homologation_tracing_settings';

/**
 * Load settings from localStorage
 */
const loadSettings = () => {
  try {
    const saved = localStorage.getItem(SETTINGS_KEY);
    if (saved) {
      const settings = JSON.parse(saved);

      // Apply saved namespaces
      if (settings.namespaces) {
        Object.assign(ENABLED_NAMESPACES, settings.namespaces);
      }

      // Apply global enable/disable
      if (typeof settings.enabled === 'boolean') {
        TRACING_ENABLED = settings.enabled;
      }

      console.log('🔧 Tracing settings loaded from localStorage', settings);
    }
  } catch (error) {
    console.warn('⚠️ Failed to load tracing settings, using defaults:', error);
  }
};

/**
 * Save settings to localStorage
 */
const saveSettings = () => {
  try {
    const settings = {
      enabled: TRACING_ENABLED,
      namespaces: { ...ENABLED_NAMESPACES },
      savedAt: new Date().toISOString(),
    };

    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    console.warn('⚠️ Failed to save tracing settings:', error);
  }
};

// Auto-load settings on module import
loadSettings();

/**
 * Habilitar/deshabilitar tracing globalmente
 */
export const setTracingEnabled = (enabled) => {
  TRACING_ENABLED = enabled;
  saveSettings();
  console.log(`🔧 Tracing globally ${enabled ? 'enabled' : 'disabled'}`);
};

/**
 * Habilitar/deshabilitar un namespace específico
 */
export const setNamespaceEnabled = (namespace, enabled) => {
  ENABLED_NAMESPACES[namespace] = enabled;
  saveSettings();
  console.log(`🔧 Namespace ${namespace} ${enabled ? 'enabled' : 'disabled'}`);
};

/**
 * Verificar si un namespace está habilitado
 */
const isNamespaceEnabled = (namespace) => {
  return TRACING_ENABLED && ENABLED_NAMESPACES[namespace] !== false;
};

// ===========================================
// ASYNC OPERATION TRACKING
// ===========================================

const activeOperations = new Map(); // operationId → { namespace, name, startTime }
let operationCounter = 0;

/**
 * Track async operations with unique IDs for correlation
 * @param {string} namespace - Namespace for logging
 * @param {string} operationName - Human-readable operation name
 * @param {Function} promiseFn - Async function to execute
 * @returns {Promise} - Result of the async operation
 */
export const traceAsync = async (namespace, operationName, promiseFn) => {
  if (!isNamespaceEnabled(namespace)) {
    return await promiseFn();
  }

  const opId = `${namespace}-${++operationCounter}`;
  const startTime = performance.now();

  activeOperations.set(opId, { namespace, name: operationName, startTime });
  console.log(`%c[ASYNC-START] ${opId}%c ${operationName}`,
    'color: #00BCD4; font-weight: bold;',
    'color: inherit;',
    { namespace }
  );

  try {
    const result = await promiseFn();
    const duration = performance.now() - startTime;

    console.log(`%c[ASYNC-END] ${opId}%c ${operationName}`,
      'color: #4CAF50; font-weight: bold;',
      'color: inherit;',
      { duration: `${duration.toFixed(2)}ms`, result }
    );

    activeOperations.delete(opId);
    return result;
  } catch (error) {
    const duration = performance.now() - startTime;

    console.error(`%c[ASYNC-ERROR] ${opId}%c ${operationName}`,
      'color: #F44336; font-weight: bold;',
      'color: inherit;',
      { duration: `${duration.toFixed(2)}ms`, error }
    );

    activeOperations.delete(opId);
    throw error;
  }
};

/**
 * Get currently active async operations
 * @returns {Array} - List of active operations with details
 */
export const getActiveOperations = () => {
  return Array.from(activeOperations.entries()).map(([id, info]) => ({
    id,
    ...info,
    elapsed: `${(performance.now() - info.startTime).toFixed(2)}ms`
  }));
};

// Set reference for React warning interception
getActiveOperationsRef = getActiveOperations;

// ===========================================
// STATE SNAPSHOT HELPER
// ===========================================

/**
 * Capture state snapshot with optional diff
 * @param {string} namespace - Namespace for logging
 * @param {string} label - Human-readable label for the snapshot
 * @param {Object} state - Current state to capture
 * @param {Object} options - Options { diff: boolean, prevState: Object }
 */
export const traceState = (namespace, label, state, options = {}) => {
  if (!isNamespaceEnabled(namespace)) return;

  const { diff = false, prevState = null } = options;

  console.group(`${namespace} 📸 ${label}`);
  console.log('State:', state);

  if (diff && prevState) {
    const changes = {};
    Object.keys(state).forEach(key => {
      if (state[key] !== prevState[key]) {
        changes[key] = { from: prevState[key], to: state[key] };
      }
    });
    if (Object.keys(changes).length > 0) {
      console.log('Changes:', changes);
    } else {
      console.log('No changes detected');
    }
  }

  console.trace('Call stack');
  console.groupEnd();
};

// ===========================================
// FUNCIONES DE LOGGING
// ===========================================

// Namespace color scheme for enhanced visual distinction
const NAMESPACE_STYLES = {
  [TRACE.FLOW]: 'color: #2196F3; font-weight: bold;',           // Blue
  [TRACE.VALIDATION]: 'color: #4CAF50; font-weight: bold;',     // Green
  [TRACE.CASCADE]: 'color: #FF9800; font-weight: bold;',        // Orange
  [TRACE.DEFAULTS]: 'color: #9C27B0; font-weight: bold;',       // Purple
  [TRACE.READONLY]: 'color: #795548; font-weight: bold;',       // Brown
  [TRACE.CONFIG]: 'color: #607D8B; font-weight: bold;',         // Blue Grey
  [TRACE.COMPANY]: 'color: #00BCD4; font-weight: bold;',        // Cyan
  [TRACE.MODE]: 'color: #E91E63; font-weight: bold;',           // Pink
};

/**
 * Get formatted timestamp for logging
 * @returns {string} - Timestamp in HH:MM:SS.mmm format
 */
const getTimestamp = () => {
  return new Date().toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3
  });
};

/**
 * Log genérico por namespace con formato mejorado
 */
const log = (namespace, message, data = null) => {
  if (!isNamespaceEnabled(namespace)) return;

  const style = NAMESPACE_STYLES[namespace] || 'color: #666; font-weight: bold;';
  const timestamp = getTimestamp();

  if (data !== null && data !== undefined) {
    console.log(
      `%c${namespace}%c [${timestamp}] %c${message}`,
      style,
      'color: #999; font-size: 0.85em;',
      'color: inherit;',
      data
    );
  } else {
    console.log(
      `%c${namespace}%c [${timestamp}] %c${message}`,
      style,
      'color: #999; font-size: 0.85em;',
      'color: inherit;'
    );
  }
};

/**
 * Log de entrada a función (útil para trazar call stack)
 */
const enter = (namespace, functionName, params = null) => {
  if (!isNamespaceEnabled(namespace)) return;

  const style = NAMESPACE_STYLES[namespace] || 'color: #666; font-weight: bold;';
  const timestamp = getTimestamp();
  const message = `→ ENTER ${functionName}`;

  if (params !== null && params !== undefined) {
    console.log(
      `%c${namespace}%c [${timestamp}] %c${message}`,
      style,
      'color: #999; font-size: 0.85em;',
      'color: inherit;',
      params
    );
  } else {
    console.log(
      `%c${namespace}%c [${timestamp}] %c${message}`,
      style,
      'color: #999; font-size: 0.85em;',
      'color: inherit;'
    );
  }
};

/**
 * Log de salida de función (útil para ver resultados)
 */
const exit = (namespace, functionName, result = null) => {
  if (!isNamespaceEnabled(namespace)) return;

  const style = NAMESPACE_STYLES[namespace] || 'color: #666; font-weight: bold;';
  const timestamp = getTimestamp();
  const message = `← EXIT ${functionName}`;

  if (result !== null && result !== undefined) {
    console.log(
      `%c${namespace}%c [${timestamp}] %c${message}`,
      style,
      'color: #999; font-size: 0.85em;',
      'color: inherit;',
      result
    );
  } else {
    console.log(
      `%c${namespace}%c [${timestamp}] %c${message}`,
      style,
      'color: #999; font-size: 0.85em;',
      'color: inherit;'
    );
  }
};

/**
 * Log de error con stack trace
 */
const error = (namespace, message, errorObj = null) => {
  if (!isNamespaceEnabled(namespace)) return;

  const style = NAMESPACE_STYLES[namespace] || 'color: #666; font-weight: bold;';
  const timestamp = getTimestamp();

  console.error(
    `%c${namespace}%c [${timestamp}] %c❌ ${message}`,
    style,
    'color: #999; font-size: 0.85em;',
    'color: #F44336; font-weight: bold;'
  );
  if (errorObj) {
    console.error(errorObj);
  }
};

/**
 * Log de warning
 */
const warn = (namespace, message, data = null) => {
  if (!isNamespaceEnabled(namespace)) return;

  const style = NAMESPACE_STYLES[namespace] || 'color: #666; font-weight: bold;';
  const timestamp = getTimestamp();

  if (data !== null && data !== undefined) {
    console.warn(
      `%c${namespace}%c [${timestamp}] %c⚠️ ${message}`,
      style,
      'color: #999; font-size: 0.85em;',
      'color: #FF9800; font-weight: bold;',
      data
    );
  } else {
    console.warn(
      `%c${namespace}%c [${timestamp}] %c⚠️ ${message}`,
      style,
      'color: #999; font-size: 0.85em;',
      'color: #FF9800; font-weight: bold;'
    );
  }
};

/**
 * Log de éxito/confirmación
 */
const success = (namespace, message, data = null) => {
  if (!isNamespaceEnabled(namespace)) return;

  const style = NAMESPACE_STYLES[namespace] || 'color: #666; font-weight: bold;';
  const timestamp = getTimestamp();

  if (data !== null && data !== undefined) {
    console.log(
      `%c${namespace}%c [${timestamp}] %c✅ ${message}`,
      style,
      'color: #999; font-size: 0.85em;',
      'color: #4CAF50; font-weight: bold;',
      data
    );
  } else {
    console.log(
      `%c${namespace}%c [${timestamp}] %c✅ ${message}`,
      style,
      'color: #999; font-size: 0.85em;',
      'color: #4CAF50; font-weight: bold;'
    );
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

  // Nuevas funciones de debugging avanzado
  async: traceAsync,
  state: traceState,
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

// ===========================================
// BROWSER CONSOLE API (window.tracing)
// ===========================================

/**
 * Expose tracing controls to browser console for runtime debugging
 */
if (typeof window !== 'undefined') {
  window.tracing = {
    // Enable/disable tracing
    enable: () => setTracingEnabled(true),
    disable: () => setTracingEnabled(false),

    // Control namespaces
    enableNamespace: (namespace) => setNamespaceEnabled(namespace, true),
    disableNamespace: (namespace) => setNamespaceEnabled(namespace, false),

    // View current settings
    getSettings: () => ({
      enabled: TRACING_ENABLED,
      namespaces: { ...ENABLED_NAMESPACES },
    }),

    // Reset to defaults
    reset: () => {
      Object.keys(ENABLED_NAMESPACES).forEach(k => {
        ENABLED_NAMESPACES[k] = true;
      });
      setTracingEnabled(true);
      console.log('🔧 Tracing settings reset to defaults');
    },

    // Manual state capture
    captureState: (label, state) => {
      traceState('[MANUAL]', label, state);
    },

    // View active async operations
    activeOps: () => {
      const ops = getActiveOperations();
      console.table(ops);
      return ops;
    },

    // Quick namespace reference
    TRACE,

    // Help message
    help: () => {
      console.log(`
%c🔧 Tracing System - Quick Reference

%cGeneral Controls:%c
  window.tracing.enable()                    - Enable all tracing
  window.tracing.disable()                   - Disable all tracing
  window.tracing.getSettings()               - View current settings

%cNamespace Controls:%c
  window.tracing.enableNamespace('[FLOW]')   - Enable specific namespace
  window.tracing.disableNamespace('[FLOW]')  - Disable specific namespace

%cDebugging:%c
  window.tracing.captureState('label', obj)  - Capture state snapshot
  window.tracing.activeOps()                 - View running async ops

%cNamespaces:%c
  [FLOW], [VALIDATION], [CASCADE], [DEFAULTS]
  [READONLY], [CONFIG], [COMPANY], [MODE]

%cExample:%c
  window.tracing.disableNamespace('[FLOW]')
  window.tracing.captureState('after cascade', formData)
  window.tracing.activeOps()
      `,
      'color: #2196F3; font-size: 1.2em; font-weight: bold;',
      'color: #4CAF50; font-weight: bold;', 'color: inherit;',
      'color: #FF9800; font-weight: bold;', 'color: inherit;',
      'color: #9C27B0; font-weight: bold;', 'color: inherit;',
      'color: #00BCD4; font-weight: bold;', 'color: inherit;',
      'color: #795548; font-weight: bold;', 'color: inherit;'
      );
    }
  };

  // Show welcome message on load
  console.log('%c🔧 Tracing API available%c - Type %cwindow.tracing.help()%c for commands',
    'color: #2196F3; font-weight: bold;',
    'color: inherit;',
    'color: #FF9800; font-family: monospace;',
    'color: inherit;'
  );
}

export default trace;
