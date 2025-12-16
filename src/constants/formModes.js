/**
 * Constantes centralizadas para el sistema de homologación
 *
 * Estos valores deben coincidir con los IDs en las tablas de catálogos de la BD
 */

// Modos de operación del formulario de instrumentos
export const FORM_MODES = {
  EXACTA: 'exacta',
  PARCIAL: 'parcial',
  NUEVA: 'nueva',
  REESTRUCTURACION: 'reestructuracion',
};

// IDs de Investment Types (cat.investmentTypes)
export const INVESTMENT_TYPES = {
  NO_APLICA: 0,
  FIXED_INCOME: 1,
  EQUITY: 2,
  CASH: 3,
  PAYABLE_RECEIVABLE: 4,
  BANK_DEBT: 5,
  FUND: 6,
  DERIVATIVE: 7,
};

// IDs de Issuer Types (cat.issuerTypes)
export const ISSUER_TYPES = {
  NO_APLICA: 0,
  CORPORATE: 1,
  SOVEREIGN: 2,
  QUASI_SOVEREIGN: 3,
  MUNICIPAL: 4,
};

// IDs de Coupon Types (cat.couponTypes)
export const COUPON_TYPES = {
  NO_APLICA: 0,
  FIXED: 1,
  FLOATING: 2,
  INFLATION_LINKED: 3,
  WARRANT: 4,
  CUSTOM: 5,
};

// IDs de Coupon Frequencies (cat.couponFrequencies)
export const COUPON_FREQUENCIES = {
  ANNUAL: 1,
  SEMIANNUAL: 2,
  QUARTERLY: 4,
  MONTHLY: 5,
};

// IDs de Rank Codes (cat.rankCodes)
export const RANK_CODES = {
  NO_APLICA: 0,
  SECURED: 1,
  UNSECURED: 2,
  SUBORDINATED: 3,
  CUSTOM: 5,
};

// Valores Yield Sources (cat.yieldSources usa 'nombre' como value)
export const YIELD_SOURCES = {
  BBG: 'BBG',
  RISKAM: 'RiskAm',
  JPM: 'JPM',
  PROP: 'PROP',
};

// Valores Yield Types (cat.yieldTypes usa 'code' como value)
export const YIELD_TYPES = {
  YTM: 'YTM',
  YTC: 'YTC',
  YTW: 'YTW',
  YTA: 'YTA',
};

// Valores Boolean (cat.booleanValues)
export const BOOLEAN_VALUES = {
  SI: 'S',
  NO: 'N',
};

export default {
  FORM_MODES,
  INVESTMENT_TYPES,
  ISSUER_TYPES,
  COUPON_TYPES,
  COUPON_FREQUENCIES,
  RANK_CODES,
  YIELD_SOURCES,
  YIELD_TYPES,
  BOOLEAN_VALUES,
};
