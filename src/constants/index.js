/**
 * constants/index.js - Barrel export para todas las constantes
 *
 * USO:
 * import { FORM_MODES, cascadeConfig, FIELD_VALIDATION_RULES } from '../constants';
 *
 * ESTRUCTURA DE CONSTANTES:
 *
 * formModes.js          - IDs de catalogos y modos de formulario
 * fieldCascade.js       - Configuracion de cascadas entre campos
 * validationRules.js    - Reglas de validacion y campos requeridos
 * formFieldConfig.js    - Campos editables por modo y pasos del flujo
 */

// --- Modos e IDs de catalogos ---
export {
  FORM_MODES,
  INVESTMENT_TYPES,
  ISSUER_TYPES,
  COUPON_TYPES,
  COUPON_FREQUENCIES,
  RANK_CODES,
  YIELD_SOURCES,
  YIELD_TYPES,
  BOOLEAN_VALUES,
} from './formModes';

// --- Configuracion de cascadas ---
export {
  cascadeConfig,
  COMPANY_FIELDS,
  IDENTIFIER_FIELDS,
  GEOGRAPHY_FIELDS,
  FI_PARAMETER_FIELDS,
  BBG_FIELDS,
  ALL_DEPENDENT_FIELDS,
  REESTRUCTURACION_FIELDS,
} from './fieldCascade';

// --- Reglas de validacion ---
export {
  FIELD_VALIDATION_RULES,
  REQUIRED_FIELDS_BY_MODE,
  REQUIRED_FIELDS_BY_INVESTMENT_TYPE,
  DUPLICATE_VALIDATION_FIELDS,
  IDENTIFIER_ERROR_MESSAGES,
} from './validationRules';

// --- Configuracion de campos por modo ---
export {
  SOURCE_FIELDS,
  FIELD_GROUPS,
  MODE_FIELD_CONFIG,
  FORM_STEPS,
  STEP_MESSAGES,
} from './formFieldConfig';
