/**
 * @deprecated USAR useAssetTypeConfig en su lugar
 *
 * useInvestmentTypeConfig - Configuracion de campos y secciones por tipo de inversion
 *
 * NOTA: Este hook esta deprecado. La funcionalidad ha sido movida a:
 * - src/config/assetTypes/ - Configuraciones por tipo
 * - src/hooks/useAssetTypeConfig.js - Hook principal
 *
 * Los helpers (isEquity, isFixedIncome, etc.) ahora se exportan desde:
 * - src/config/assetTypes/index.js
 *
 * Este archivo se mantiene por compatibilidad hacia atras.
 */

import { useMemo } from 'react';

// ============================================================================
// CONSTANTES DE TIPOS DE INVERSIÓN
// Usar estas constantes en lugar de strings hardcodeados para comparaciones
// ============================================================================
export const INVESTMENT_TYPES = {
  EQUITY: 'EQ',
  FIXED_INCOME: 'FI',
  FOREIGN_EXCHANGE: 'FX',
  COMMODITY: 'CO',
  CASH: 'CA',
  DERIVATIVE: 'DE',
};

// Mapeo de valores alternativos a códigos estándar
// Esto permite que el sistema funcione con diferentes formatos de datos
// NOTA: Los IDs numéricos se manejan en normalizeInvestmentType() para evitar
// duplicados de claves (JavaScript convierte números a strings en objeto keys)
const INVESTMENT_TYPE_ALIASES = {
  // Códigos estándar
  'EQ': 'EQ',
  'FI': 'FI',
  'FX': 'FX',
  'CO': 'CO',
  'CA': 'CA',
  'DE': 'DE',
  // Nombres completos - TODAS las variantes posibles
  'Equity': 'EQ',
  'EQUITY': 'EQ',
  'equity': 'EQ',
  'Renta Variable': 'EQ',
  'RENTA VARIABLE': 'EQ',
  'renta variable': 'EQ',
  'Fixed Income': 'FI',
  'FIXED INCOME': 'FI',
  'fixed income': 'FI',
  'FixedIncome': 'FI',
  'Renta Fija': 'FI',
  'RENTA FIJA': 'FI',
  'renta fija': 'FI',
  'Foreign Exchange': 'FX',
  'Commodity': 'CO',
  'Cash': 'CA',
  'Derivative': 'DE',
  // IDs numéricos como strings (tanto '1' como 1 se convierten a '1' en objetos JS)
  '1': 'FI',  // Fixed Income
  '2': 'EQ',  // Equity
  '3': 'CA',  // Cash
  '4': 'CA',  // Payable/Receivable (usa mismo código que Cash)
  '5': 'CA',  // Bank Debt (usa mismo código que Cash)
  '6': 'FI',  // Fund (usa mismo código que Fixed Income por ahora)
  '7': 'DE',  // Derivative
};

/**
 * Normaliza un valor de investmentType a su código estándar (EQ, FI, etc.)
 * @param {string|number} value - Valor a normalizar
 * @returns {string|null} Código normalizado o null si no se reconoce
 */
export const normalizeInvestmentType = (value) => {
  if (!value && value !== 0) return null;

  // Convertir a string y limpiar
  const strValue = String(value).trim();

  // Buscar en aliases (exacto)
  const normalized = INVESTMENT_TYPE_ALIASES[strValue];
  if (normalized) return normalized;

  // Intentar búsqueda case-insensitive y con espacios normalizados
  const upperValue = strValue.toUpperCase().replace(/\s+/g, ' ');

  for (const [key, code] of Object.entries(INVESTMENT_TYPE_ALIASES)) {
    const upperKey = String(key).toUpperCase().replace(/\s+/g, ' ');
    if (upperKey === upperValue) {
      return code;
    }
  }

  // Búsqueda parcial para casos como "Fixed Income" vs "FixedIncome"
  const noSpaceValue = upperValue.replace(/\s/g, '');
  for (const [key, code] of Object.entries(INVESTMENT_TYPE_ALIASES)) {
    const noSpaceKey = String(key).toUpperCase().replace(/\s/g, '');
    if (noSpaceKey === noSpaceValue) {
      return code;
    }
  }

  // Debug: log si no se encuentra
  console.warn(`[normalizeInvestmentType] Valor no reconocido: "${value}" (tipo: ${typeof value})`);

  return null;
};

/**
 * Verifica si un valor corresponde a Equity
 * @param {string|number} value - Valor a verificar
 * @returns {boolean}
 */
export const isEquity = (value) => {
  return normalizeInvestmentType(value) === INVESTMENT_TYPES.EQUITY;
};

/**
 * Verifica si un valor corresponde a Fixed Income
 * @param {string|number} value - Valor a verificar
 * @returns {boolean}
 */
export const isFixedIncome = (value) => {
  return normalizeInvestmentType(value) === INVESTMENT_TYPES.FIXED_INCOME;
};

/**
 * Verifica si un valor corresponde a Derivative
 * @param {string|number} value - Valor a verificar
 * @returns {boolean}
 */
export const isDerivative = (value) => {
  return normalizeInvestmentType(value) === INVESTMENT_TYPES.DERIVATIVE;
};

// ============================================================================
// NORMALIZACIÓN DE PUBLIC DATA SOURCE
// ============================================================================

/**
 * Verifica si un valor de publicDataSource corresponde a Bloomberg
 * Soporta múltiples formatos: 'BBG', 'Bloomberg', ID numérico 3, etc.
 * @param {string|number} value - Valor a verificar
 * @returns {boolean}
 */
export const isBBG = (value) => {
  if (!value && value !== 0) {
    return false;
  }

  const strValue = String(value).toUpperCase().trim();

  // Verificaciones directas por código string
  if (strValue === 'BBG' || strValue === 'BLOOMBERG') {
    return true;
  }

  // IDs numéricos que corresponden a BBG en la BD
  // ID 3: código legacy
  // ID 14: ID actual en la base de datos del catálogo dataSources
  if (value === 3 || strValue === '3' || value === 14 || strValue === '14') {
    return true;
  }

  return false;
};


// Configuracion base que heredan todos los tipos
const baseConfig = {
  requiredFields: [
    'nameInstrumento',
    'companyName',
    'issuerTypeCode',
    'issueCountry',
    'riskCountry',
    'issueCurrency',
    'riskCurrency',
  ],
  conditionalFields: {},
  identifierPriority: null, // ninguno obligatorio por defecto si publicDataSource='BBG'
  hasParameters: false,
  parametersSection: null,
};

// Configuraciones especificas por tipo
const typeConfigs = {
  EQ: {
    ...baseConfig,
    requiredFields: [
      ...baseConfig.requiredFields,
      'sectorGICS',
    ],
    conditionalFields: {
      // Sector Chile solo si Risk_Country es Chile
      sectorChileTypeCode: (data) => data.riskCountry === 'CL',
    },
    identifierPriority: 'tickerBBG', // obligatorio si publicDataSource='BBG'
    hasParameters: false,
  },

  FI: {
    ...baseConfig,
    requiredFields: [
      ...baseConfig.requiredFields,
      'issueTypeCode',
      'couponTypeCode',
      'yieldType',
      'yieldSource',
      'perpetuidad',
      'rendimiento',
      'couponFrequency',
    ],
    conditionalFields: {
      // Campos BBG solo si yieldSource es BBG
      coco: (data) => data.yieldSource === 'BBG',
      callable: (data) => data.yieldSource === 'BBG',
      sinkable: (data) => data.yieldSource === 'BBG',
      yasYldFlag: (data) => data.yieldSource === 'BBG',
    },
    identifierPriority: 'isin', // obligatorio si publicDataSource='BBG'
    hasParameters: true,
    parametersSection: 'ParametersFISection',
  },

  // Tipos adicionales - usan configuracion base por ahora
  // Se pueden extender cuando se definan sus campos especificos
  FX: { ...baseConfig }, // Foreign Exchange
  CO: { ...baseConfig }, // Commodity
  CA: { ...baseConfig }, // Cash

  // DERIVADOS - Configuración especial con SubID obligatorio
  // Los derivados tienen requisitos mínimos: solo nombre, compañía y SubID
  DE: {
    requiredFields: [
      'nameInstrumento',
      'companyName',
      'subId',  // SubID obligatorio para derivados (10000 o 20000)
    ],
    conditionalFields: {},
    identifierPriority: null,
    hasParameters: true,
    parametersSection: 'ParametersDerivativeSection',
    // Valores válidos para SubID
    validSubIds: [10000, 20000],
  },
};

/**
 * Hook para obtener configuracion del tipo de inversion
 * @param {string} investmentType - Codigo del tipo (EQ, FI, FX, CO, CA, DE) o nombre (Equity, Fixed Income)
 * @returns {object} Configuracion del tipo
 */
const useInvestmentTypeConfig = (investmentType) => {
  const config = useMemo(() => {
    // Normalizar el tipo de inversión para soportar diferentes formatos
    const normalizedType = normalizeInvestmentType(investmentType);
    const typeConfig = typeConfigs[normalizedType] || baseConfig;

    return {
      ...baseConfig,
      ...typeConfig,
      // Asegurar que requiredFields siempre sea un array
      requiredFields: typeConfig.requiredFields || baseConfig.requiredFields,
    };
  }, [investmentType]);

  // Verificar si un campo es requerido
  const isFieldRequired = (fieldName, formData = {}) => {
    // Campos base siempre requeridos
    if (config.requiredFields.includes(fieldName)) {
      return true;
    }

    // Campos condicionales
    const condition = config.conditionalFields[fieldName];
    if (condition && typeof condition === 'function') {
      return condition(formData);
    }

    return false;
  };

  // Verificar si un campo condicional debe mostrarse
  const shouldShowField = (fieldName, formData = {}) => {
    const condition = config.conditionalFields[fieldName];
    if (condition && typeof condition === 'function') {
      return condition(formData);
    }
    // Si no hay condicion, siempre mostrar
    return true;
  };

  // Obtener identificador prioritario segun publicDataSource
  const getPriorityIdentifier = (publicDataSource) => {
    if (publicDataSource === 'BBG' && config.identifierPriority) {
      return config.identifierPriority;
    }
    return null;
  };

  // Verificar si tiene seccion de parametros
  const hasParametersSection = () => {
    return config.hasParameters;
  };

  return {
    config,
    isFieldRequired,
    shouldShowField,
    getPriorityIdentifier,
    hasParametersSection,
  };
};

/**
 * Funcion para registrar nuevos tipos de inversion dinamicamente
 * Util para extender la aplicacion sin modificar el codigo fuente
 */
export const registerInvestmentType = (code, config) => {
  typeConfigs[code] = { ...baseConfig, ...config };
};

/**
 * Obtener todos los tipos de inversion disponibles
 */
export const getAvailableInvestmentTypes = () => {
  return Object.keys(typeConfigs);
};

export default useInvestmentTypeConfig;
