/**
 * index.js - Registry central de Asset Types
 *
 * SIMPLIFICADO: El ID de cada config es el valor EXACTO del catálogo investmentTypes.
 * No hay aliases ni mapeos - lookup directo por ID numérico.
 *
 * COMO AGREGAR UN NUEVO ASSET TYPE:
 * 1. Crear archivo [nombre].config.js en esta carpeta
 * 2. El ID debe ser el número del catálogo cat.investmentTypes
 * 3. Importar y agregar a ASSET_TYPE_REGISTRY con el ID como key
 *
 * El tipo estara disponible automaticamente en todo el sistema.
 */

import { EQUITY_CONFIG } from './equity.config';
import { FIXED_INCOME_CONFIG } from './fixedIncome.config';
import { DERIVATIVE_CONFIG } from './derivative.config';
import { FUND_CONFIG } from './fund.config';
import { CASH_CONFIG } from './cash.config';
import { PAYABLE_RECEIVABLE_CONFIG } from './payableReceivable.config';
import { BANK_DEBT_CONFIG } from './bankDebt.config';
import { TRANSVERSAL_SECTIONS, evaluateCondition } from './_base';

// ===========================================
// REGISTRY DE ASSET TYPES
// Key = ID numérico del catálogo cat.investmentTypes
// ===========================================
const ASSET_TYPE_REGISTRY = {
  1: FIXED_INCOME_CONFIG,  // Fixed Income
  2: EQUITY_CONFIG,        // Equity
  3: CASH_CONFIG,          // Cash
  4: PAYABLE_RECEIVABLE_CONFIG, // payable and receivable
  5: BANK_DEBT_CONFIG, // Bank Debt
  6: FUND_CONFIG,          // Fund
  7: DERIVATIVE_CONFIG,    // Derivative
};

// ===========================================
// FUNCIONES DE ACCESO
// ===========================================

/**
 * Obtener configuracion de un Asset Type por ID del catálogo
 * El ID es el valor numérico que viene del dropdown investmentTypes
 *
 * @param {string|number} typeId - ID del catálogo (1, 2, 6, 7, etc.)
 * @returns {Object|null} - Configuracion del tipo o null si no existe
 */
export const getAssetTypeConfig = (typeId) => {
  if (typeId === null || typeId === undefined || typeId === '') {
    return null;
  }

  // Convertir a número para lookup directo
  const numericId = typeof typeId === 'number' ? typeId : parseInt(typeId, 10);

  // Lookup directo en el registry
  return ASSET_TYPE_REGISTRY[numericId] || null;
};

/**
 * Verificar si un valor corresponde a un tipo especifico
 * @param {string|number} value - Valor a verificar (ID del catálogo)
 * @param {number} targetTypeId - ID del tipo objetivo (1, 2, 6, 7)
 * @returns {boolean}
 */
export const isAssetType = (value, targetTypeId) => {
  const config = getAssetTypeConfig(value);
  return config?.id === targetTypeId;
};

/**
 * Helpers de conveniencia para tipos comunes
 * Usan los IDs numéricos del catálogo cat.investmentTypes
 */
export const isEquity = (value) => isAssetType(value, 2);        // ID 2 = Equity
export const isFixedIncome = (value) => isAssetType(value, 1);   // ID 1 = Fixed Income
export const isCash = (value) => isAssetType(value, 3);          // ID 3 = Cash
export const isDerivative = (value) => isAssetType(value, 7);    // ID 7 = Derivative
export const isFund = (value) => isAssetType(value, 6);          // ID 6 = Fund

/**
 * Verificar si un valor es BBG (Bloomberg)
 * @param {string|number} value - Valor de publicDataSource
 * @returns {boolean}
 */
export const isBBG = (value) => {
  if (!value) return false;
  const normalized = String(value).toLowerCase().trim();
  return ['bbg', 'bloomberg', '3', '14'].includes(normalized);
};

/**
 * Obtener lista de todos los IDs de tipos disponibles
 * @returns {number[]} - Array de IDs numéricos
 */
export const getAvailableTypes = () => Object.keys(ASSET_TYPE_REGISTRY).map(Number);

/**
 * Obtener todas las configuraciones
 * @returns {Object} - Objeto con todas las configuraciones
 */
export const getAllConfigs = () => ({ ...ASSET_TYPE_REGISTRY });

/**
 * Registrar un nuevo tipo dinamicamente (para extensibilidad futura)
 * @param {Object} config - Configuracion del tipo (debe tener id numérico)
 */
export const registerAssetType = (config) => {
  if (config.id === undefined || config.id === null) {
    console.error('Asset type config must have a numeric id');
    return;
  }

  const numericId = typeof config.id === 'number' ? config.id : parseInt(config.id, 10);
  ASSET_TYPE_REGISTRY[numericId] = config;
};

/**
 * Normalizar un tipo de inversion a su ID numérico
 * @param {string|number} value - Valor a normalizar
 * @returns {number|null} - ID numérico o null
 */
export const normalizeAssetType = (value) => {
  const config = getAssetTypeConfig(value);
  return config?.id ?? null;
};

// ===========================================
// EXPORTS
// ===========================================
export {
  ASSET_TYPE_REGISTRY,
  TRANSVERSAL_SECTIONS,
  evaluateCondition,
};

// Re-exportar configs individuales para acceso directo si es necesario
export { EQUITY_CONFIG } from './equity.config';
export { FIXED_INCOME_CONFIG } from './fixedIncome.config';
export { CASH_CONFIG } from './cash.config';
export { DERIVATIVE_CONFIG } from './derivative.config';
export { FUND_CONFIG } from './fund.config';
export { PAYABLE_RECEIVABLE_CONFIG } from './payableReceivable.config';
export { BANK_DEBT_CONFIG } from './bankDebt.config';

export default {
  getAssetTypeConfig,
  isEquity,
  isFixedIncome,
  isCash,
  isDerivative,
  isFund,
  isBBG,
  getAvailableTypes,
  getAllConfigs,
  registerAssetType,
  normalizeAssetType,
};
