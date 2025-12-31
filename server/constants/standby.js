/**
 * Constantes de Stand-By del Pipeline ETL
 *
 * Define los codigos de retorno de los SPs que indican stand-by
 * y sus tipos de problema asociados.
 *
 * FLUJO:
 * SP retorna codigo -> BasePipelineService interpreta -> PipelineEventEmitter emite
 * -> TrackingService persiste -> SandboxWriterService escribe sandbox
 *
 * @module constants/standby
 */

/**
 * Mapeo de codigos de stand-by a tipos de problema
 * Codigos 5-12 indican stand-by (pausa para revision humana)
 */
const STANDBY_CODES = {
  5: 'SUCIEDADES',
  6: 'HOMOLOGACION_INSTRUMENTOS',
  7: 'DESCUADRES_CAPM',
  8: 'DESCUADRES_DERIVADOS',
  9: 'DESCUADRES_NAV',
  10: 'HOMOLOGACION_FONDOS',
  11: 'HOMOLOGACION_MONEDAS',
  12: 'HOMOLOGACION_BENCHMARKS'
};

/**
 * Mapeo inverso: tipo de problema a codigo
 */
const STANDBY_TYPES = Object.fromEntries(
  Object.entries(STANDBY_CODES).map(([code, type]) => [type, parseInt(code)])
);

/**
 * Rango de codigos que indican stand-by
 */
const STANDBY_CODE_MIN = 5;
const STANDBY_CODE_MAX = 12;

/**
 * Verifica si un codigo de retorno indica stand-by
 * @param {number} returnValue - Codigo de retorno del SP
 * @returns {boolean}
 */
function isStandByCode(returnValue) {
  return returnValue >= STANDBY_CODE_MIN && returnValue <= STANDBY_CODE_MAX;
}

/**
 * Obtiene el tipo de problema para un codigo de stand-by
 * @param {number} code - Codigo de stand-by (5-12)
 * @returns {string} - Tipo de problema o 'DESCONOCIDO'
 */
function getTipoProblema(code) {
  return STANDBY_CODES[code] || 'DESCONOCIDO';
}

/**
 * Mapeo de tipo de problema a columna flag en logs.Ejecuciones
 */
const PROBLEMA_TO_FLAG = {
  'SUCIEDADES': 'TieneSuciedades',
  'HOMOLOGACION_INSTRUMENTOS': 'TieneProblemasHomologacion',
  'HOMOLOGACION_FONDOS': 'TieneProblemasHomologacion',
  'HOMOLOGACION_MONEDAS': 'TieneProblemasHomologacion',
  'HOMOLOGACION_BENCHMARKS': 'TieneProblemasHomologacion',
  'DESCUADRES_CAPM': 'TieneDescuadres',
  'DESCUADRES_DERIVADOS': 'TieneDescuadres',
  'DESCUADRES_NAV': 'TieneDescuadres'
};

/**
 * Obtiene la columna flag para un tipo de problema
 * @param {string} tipoProblema - Tipo de problema
 * @returns {string|null} - Nombre de columna o null
 */
function getFlagColumn(tipoProblema) {
  return PROBLEMA_TO_FLAG[tipoProblema] || null;
}

/**
 * Codigos de retorno generales de SPs
 */
const RETURN_CODES = {
  OK: 0,
  WARNING: 1,
  RETRY: 2,
  ERROR_CRITICO: 3,
  RETRY_EXHAUSTED: 4
  // 5-12: Stand-by codes (ver STANDBY_CODES)
};

module.exports = {
  STANDBY_CODES,
  STANDBY_TYPES,
  STANDBY_CODE_MIN,
  STANDBY_CODE_MAX,
  isStandByCode,
  getTipoProblema,
  PROBLEMA_TO_FLAG,
  getFlagColumn,
  RETURN_CODES
};
