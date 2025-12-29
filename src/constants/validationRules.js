/**
 * validationRules.js - Reglas de validacion del formulario
 *
 * PROPOSITO:
 * Centraliza todas las reglas de validacion para campos del formulario.
 * Facilita agregar nuevos campos con validacion consistente.
 *
 * COMO AGREGAR VALIDACION PARA UN NUEVO CAMPO:
 * 1. Agregar entrada en FIELD_VALIDATION_RULES con el nombre del campo
 * 2. Definir las reglas aplicables (pattern, minLength, maxLength, etc.)
 * 3. Agregar mensaje de error descriptivo
 *
 * COMO HACER UN CAMPO REQUERIDO:
 * 1. Si es requerido en un modo especifico, agregarlo a REQUIRED_FIELDS_BY_MODE
 * 2. Si es requerido segun tipo de inversion, agregarlo a REQUIRED_FIELDS_BY_INVESTMENT_TYPE
 *
 * @example
 * // Agregar validacion para un nuevo campo:
 * myNewField: {
 *   pattern: /^[A-Z0-9]+$/,
 *   minLength: 3,
 *   maxLength: 20,
 *   message: 'MyNewField debe tener entre 3-20 caracteres alfanumericos',
 * }
 */

import { FORM_MODES } from './formModes';

// ===========================================
// REGLAS DE VALIDACION POR CAMPO
// ===========================================
export const FIELD_VALIDATION_RULES = {
  // --- Identificadores ---
  isin: {
    pattern: /^[A-Z]{2}[A-Z0-9]{10}$/,
    message: 'ISIN debe tener formato: 2 letras + 10 caracteres alfanumericos',
  },
  tickerBBG: {
    maxLength: 50,
    message: 'TickerBBG no puede exceder 50 caracteres',
  },
  sedol: {
    pattern: /^[A-Z0-9]{7}$/,
    message: 'SEDOL debe tener 7 caracteres alfanumericos',
  },
  cusip: {
    pattern: /^[A-Z0-9]{9}$/,
    message: 'CUSIP debe tener 9 caracteres alfanumericos',
  },

  // --- Company ---
  companyName: {
    required: true,
    minLength: 2,
    message: 'Nombre de compania es requerido',
  },

  // --- Clasificacion ---
  investmentTypeCode: {
    required: true,
    message: 'Tipo de inversion es requerido',
  },
  issueTypeCode: {
    required: false,
    message: 'Tipo de emision es requerido',
  },

  // --- Geografia ---
  riskCountry: {
    required: true,
    message: 'Pais de riesgo es requerido',
  },
  issueCountry: {
    required: true,
    message: 'Pais de emision es requerido',
  },
  issueCurrency: {
    required: false, // Solo requerido en modo parcial
    message: 'Moneda de emision es requerida',
  },
  riskCurrency: {
    required: false, // Solo requerido en modo parcial
    message: 'Moneda de riesgo es requerida',
  },

  // --- Derivados ---
  subId: {
    required: false, // Solo requerido para derivados
    validValues: [10000, 20000],
    message: 'SubID debe ser 10000 (Pata Larga) o 20000 (Pata Corta)',
  },
};

// ===========================================
// CAMPOS REQUERIDOS POR MODO
// ===========================================
export const REQUIRED_FIELDS_BY_MODE = {
  [FORM_MODES.EXACTA]: [],
  [FORM_MODES.PARCIAL]: ['issueCurrency', 'riskCurrency'],
  [FORM_MODES.NUEVA]: ['nameInstrumento', 'companyName', 'investmentTypeCode'],
  [FORM_MODES.REESTRUCTURACION]: ['nameInstrumento', 'companyName', 'investmentTypeCode'],
};

// ===========================================
// CAMPOS REQUERIDOS POR TIPO DE INVERSION
// Usa IDs numéricos del catálogo cat.investmentTypes
// ===========================================
export const REQUIRED_FIELDS_BY_INVESTMENT_TYPE = {
  1: [], // Fixed Income - no requiere paises como campos obligatorios
  2: ['riskCountry', 'issueCountry'], // Equity requiere paises
  3: [], // Cash
  4: [], // Payable/Receivable
  5: [], // Bank Debt
  6: [], // Fund
  7: ['subId'], // Derivative requiere SubID
};

// ===========================================
// CAMPOS QUE REQUIEREN VALIDACION DE DUPLICADOS
// ===========================================
export const DUPLICATE_VALIDATION_FIELDS = [
  'nameInstrumento',
  'isin',
  'tickerBBG',
  'sedol',
  'cusip',
];

// ===========================================
// MENSAJES DE ERROR PARA IDENTIFICADORES
// ===========================================
export const IDENTIFIER_ERROR_MESSAGES = {
  BBG_EQUITY_TICKER: 'TickerBBG es OBLIGATORIO para Bloomberg + Equity',
  BBG_FI_ISIN: 'ISIN es OBLIGATORIO para Bloomberg + Fixed Income',
  NO_IDENTIFIER: 'Al menos un identificador (ISIN, TickerBBG, SEDOL o CUSIP) es requerido',
  DERIVATIVE_SUBID: 'SubID es OBLIGATORIO para derivados (10000 = Pata Larga, 20000 = Pata Corta)',
};

export default {
  FIELD_VALIDATION_RULES,
  REQUIRED_FIELDS_BY_MODE,
  REQUIRED_FIELDS_BY_INVESTMENT_TYPE,
  DUPLICATE_VALIDATION_FIELDS,
  IDENTIFIER_ERROR_MESSAGES,
};
