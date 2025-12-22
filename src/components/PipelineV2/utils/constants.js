/**
 * Constants - Pipeline ETL
 * Constantes, enums y configuraciones centrales
 */

import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import WarningIcon from '@mui/icons-material/Warning';
import ScheduleIcon from '@mui/icons-material/Schedule';
import BlockIcon from '@mui/icons-material/Block';
import RemoveCircleIcon from '@mui/icons-material/RemoveCircle';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import { colors } from '../../../styles/theme';

/**
 * FINAL_STATUS - Enum de estados finales de fondo
 * Valores numéricos para comparación y ordenamiento rápido
 */
export const FINAL_STATUS = {
  PENDIENTE: 0,
  EN_PROGRESO: 1,
  OK: 2,
  WARNING: 3,
  ERROR: 4,
  PARCIAL: 5,
  OMITIDO: 6
};

/**
 * ESTADO_ETAPA - Enum de estados de etapa
 * Valores numéricos para comparación rápida
 */
export const ESTADO_ETAPA = {
  PENDIENTE: 0,
  EN_PROGRESO: 1,
  OK: 2,
  ERROR: 3,
  WARNING: 4,
  OMITIDO: 5,
  NA: 6
};

/**
 * ESTADO_STRINGS - Map de strings de estado (backend) a enum
 */
export const ESTADO_STRINGS = {
  'PENDIENTE': ESTADO_ETAPA.PENDIENTE,
  'EN_PROGRESO': ESTADO_ETAPA.EN_PROGRESO,
  'OK': ESTADO_ETAPA.OK,
  'ERROR': ESTADO_ETAPA.ERROR,
  'WARNING': ESTADO_ETAPA.WARNING,
  'OMITIDO': ESTADO_ETAPA.OMITIDO,
  'N/A': ESTADO_ETAPA.NA,
};

/**
 * ESTADO_COLORS - Mapa de colores por estado
 */
export const ESTADO_COLORS = {
  PENDIENTE: colors.grey[500],
  EN_PROGRESO: colors.primary.main,
  OK: colors.success.main,
  ERROR: colors.error.main,
  WARNING: colors.warning.main,
  OMITIDO: colors.grey[400],
  NA: colors.grey[300],
};

/**
 * ESTADO_COLORS_LIGHT - Colores claros para backgrounds
 */
export const ESTADO_COLORS_LIGHT = {
  PENDIENTE: colors.grey[100],
  EN_PROGRESO: colors.primary.light,
  OK: colors.success.light,
  ERROR: colors.error.light,
  WARNING: colors.warning.light,
  OMITIDO: colors.grey[50],
  NA: colors.grey[50],
};

/**
 * ESTADO_ICONS - Iconos por estado
 */
export const ESTADO_ICONS = {
  PENDIENTE: ScheduleIcon,
  EN_PROGRESO: HourglassEmptyIcon,
  OK: CheckCircleIcon,
  ERROR: ErrorIcon,
  WARNING: WarningIcon,
  OMITIDO: BlockIcon,
  NA: RemoveCircleIcon,
};

/**
 * ESTADO_LABELS - Labels legibles por estado
 */
export const ESTADO_LABELS = {
  PENDIENTE: 'Pendiente',
  EN_PROGRESO: 'En Progreso',
  OK: 'Completado',
  ERROR: 'Error',
  WARNING: 'Advertencia',
  OMITIDO: 'Omitido',
  NA: 'No Aplica',
  PARCIAL: 'Parcial',
  COMPLETADO: 'Completado'
};

/**
 * POLLING_CONFIG - Configuración del polling
 */
export const POLLING_CONFIG = {
  INTERVAL: 2000,           // 2 segundos
  MAX_ERRORS: 5,            // Máximo de errores consecutivos antes de detener
  RETRY_DELAY: 1000,        // Delay antes de retry
  ENABLED_BY_DEFAULT: true  // Polling habilitado por defecto
};

/**
 * FLAG_BITS - Bitmask para flags de fondos
 * Optimización: 1 byte en vez de múltiples booleanos
 */
export const FLAG_BITS = {
  REQUIERE_DERIVADOS: 0x01,  // 0000 0001
  ES_MLCCII: 0x02,           // 0000 0010
  ELEGIBLE_REPROCESO: 0x04,  // 0000 0100
  FLAG_UBS: 0x08,            // 0000 1000
  INCLUIR_EN_CUBO: 0x10,     // 0001 0000
};

/**
 * hasFlag - Verifica si un flag está activo
 * @param {number} flags - Bitmask de flags
 * @param {number} flag - Flag a verificar (FLAG_BITS.xxx)
 * @returns {boolean} - True si el flag está activo
 */
export const hasFlag = (flags, flag) => {
  return (flags & flag) !== 0;
};

/**
 * setFlag - Activa un flag
 * @param {number} flags - Bitmask actual
 * @param {number} flag - Flag a activar
 * @returns {number} - Nuevo bitmask
 */
export const setFlag = (flags, flag) => {
  return flags | flag;
};

/**
 * unsetFlag - Desactiva un flag
 * @param {number} flags - Bitmask actual
 * @param {number} flag - Flag a desactivar
 * @returns {number} - Nuevo bitmask
 */
export const unsetFlag = (flags, flag) => {
  return flags & ~flag;
};

/**
 * FILTER_OPTIONS - Opciones de filtrado de fondos
 */
export const FILTER_OPTIONS = {
  ALL: 'all',
  ERROR: 'ERROR',
  WARNING: 'WARNING',
  OK: 'OK',
  EN_PROGRESO: 'EN_PROGRESO',
  PARCIAL: 'PARCIAL'
};

/**
 * SORT_FIELDS - Campos disponibles para ordenamiento
 */
export const SORT_FIELDS = {
  FUND_NAME: 'fundName',
  STATUS: 'status',
  DURATION: 'duration',
  START_TIME: 'startTime'
};

/**
 * VIRTUAL_LIST_CONFIG - Configuración del virtual scrolling
 */
export const VIRTUAL_LIST_CONFIG = {
  ITEM_HEIGHT: 120,         // Altura de card colapsado
  ITEM_HEIGHT_EXPANDED: 400, // Altura de card expandido
  OVERSCAN: 5,              // Pre-render 5 items arriba/abajo
  HEIGHT: 600               // Altura del contenedor
};

/**
 * UI_STATES - Estados de la UI
 */
export const UI_STATES = {
  IDLE: 'idle',
  LOADING: 'loading',
  SUCCESS: 'success',
  ERROR: 'error',
  EMPTY: 'empty'
};

/**
 * ANIMATION_STATES - Estados de animación
 */
export const ANIMATION_STATES = {
  IDLE: 'idle',
  LOADING: 'loading',
  SUCCESS: 'success',
  ERROR: 'error',
  WARNING: 'warning'
};

/**
 * getAnimationState - Mapea estado de etapa a estado de animación
 * @param {string} estado - Estado de etapa
 * @returns {string} - Estado de animación
 */
export const getAnimationState = (estado) => {
  switch (estado) {
    case 'OK':
      return ANIMATION_STATES.SUCCESS;
    case 'EN_PROGRESO':
      return ANIMATION_STATES.LOADING;
    case 'ERROR':
      return ANIMATION_STATES.ERROR;
    case 'WARNING':
      return ANIMATION_STATES.WARNING;
    default:
      return ANIMATION_STATES.IDLE;
  }
};
