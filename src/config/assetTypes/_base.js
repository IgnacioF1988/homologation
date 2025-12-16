/**
 * _base.js - Configuracion base transversal para todos los Asset Types
 *
 * Este archivo contiene:
 * 1. Factory helpers para crear campos comunes (createCompanyFields, createGeographyFields, etc.)
 * 2. Configuracion de secciones transversales (SourceData, Restructuring)
 * 3. Helpers para evaluacion de condiciones
 * 4. Configuracion de flujo por defecto
 *
 * NOTA: Ya no existe SHARED_FIELDS.
 * Cada Asset Type config define TODOS sus campos explicitamente.
 * Usa los factory helpers para crear campos comunes de forma consistente.
 *
 * ESTRUCTURA DE UN CAMPO:
 * {
 *   name: 'fieldName',           // Nombre del campo (requerido)
 *   label: 'Label',              // Etiqueta visible (requerido)
 *   type: 'text|select|...',     // Tipo de campo (requerido)
 *   required: true/false,        // Si es obligatorio siempre
 *   requiredWhen: {...},         // Condicion para ser obligatorio
 *   visibleWhen: {...},          // Condicion para ser visible
 *   defaultValue: 'valor',       // Valor por defecto al seleccionar el tipo
 *   optionsKey: 'catalogName',   // Key del catalogo para selects
 *   ...
 * }
 *
 * ESTRUCTURA DE flowConfig (en cada Asset Type):
 * flowConfig: {
 *   requiresPublicDataSource: true/false,  // Si requiere Public_Data_Source
 *   requiresIdentifiers: true/false,       // Si tiene identificadores
 *   hasDefinition: true/false,             // Si tiene seccion de geografia
 *   hasParametersFI: true/false,           // Si tiene parametros FI
 *   hasParametersDE: true/false,           // Si tiene parametros DE
 *   steps: [                               // Pasos del flujo en modo NUEVA
 *     { id: 1, requiredFields: ['investmentTypeCode', 'nameInstrumento'] },
 *     { id: 2, requiredFields: ['publicDataSource'], conditionalFields: {...} },
 *     ...
 *   ]
 * }
 */

// ===========================================
// SECCIONES TRANSVERSALES - No varian por tipo
// ===========================================
export const TRANSVERSAL_SECTIONS = {
  sourceData: {
    id: 'sourceData',
    title: 'Datos Fuente',
    alwaysVisible: true,
    alwaysReadOnly: true,
    fields: ['nombreFuente', 'fuente', 'moneda', 'queueItemId'],
  },

  restructuring: {
    id: 'restructuring',
    title: 'Reestructuracion',
    alwaysVisible: true,
    fields: ['esReestructuracion', 'idPredecesor', 'monedaPredecesor', 'tipoContinuador', 'diaValidez'],
  },
};

// ===========================================
// HELPERS PARA EVALUACION DE CONDICIONES
// ===========================================

/**
 * Evalua una condicion contra los datos del formulario
 * @param {Object} condition - Objeto con la condicion a evaluar
 * @param {Object} formData - Datos actuales del formulario
 * @returns {boolean}
 */
export const evaluateCondition = (condition, formData) => {
  if (!condition) return true;

  // { field: 'x', equals: 'value' }
  if (condition.field && condition.equals !== undefined) {
    return formData[condition.field] === condition.equals;
  }

  // { field: 'x', notEquals: 'value' }
  if (condition.field && condition.notEquals !== undefined) {
    return formData[condition.field] !== condition.notEquals;
  }

  // { field: 'x', matches: ['val1', 'val2'] }
  if (condition.field && condition.matches) {
    const value = String(formData[condition.field] || '').toLowerCase();
    return condition.matches.some(v => String(v).toLowerCase() === value);
  }

  // { fieldsComplete: ['field1', 'field2'] }
  if (condition.fieldsComplete) {
    return condition.fieldsComplete.every(f => {
      const val = formData[f];
      return val !== undefined && val !== null && val !== '';
    });
  }

  // { fieldsAnyComplete: ['field1', 'field2'] }
  if (condition.fieldsAnyComplete) {
    return condition.fieldsAnyComplete.some(f => {
      const val = formData[f];
      return val !== undefined && val !== null && val !== '';
    });
  }

  return true;
};

// ===========================================
// CONFIGURACION DE FLUJO POR DEFECTO
// ===========================================
export const DEFAULT_FLOW_CONFIG = {
  requiresPublicDataSource: true,
  requiresIdentifiers: true,
  hasDefinition: true,
  hasParametersFI: false,
  hasParametersDE: false,
  hasParameters: false, // Seccion generica de parametros (Fund, Cash, etc.)
  identifierLogic: 'bbg', // 'bbg' = requiere según BBG, 'optional' = todos opcionales, 'none' = sin identificadores
  steps: [
    { id: 1, requiredFields: ['investmentTypeCode', 'nameInstrumento'] },
    { id: 2, requiredFields: ['publicDataSource'] },
    { id: 3, requiredFields: ['companyName'] },
    { id: 4, requiredFields: ['issueCountry', 'riskCountry', 'issueCurrency', 'riskCurrency'] },
  ],
};

/**
 * Calcula el paso actual basado en flowConfig
 * @param {Object} flowConfig - Configuracion de flujo del tipo
 * @param {Object} formData - Datos del formulario
 * @param {Function} isBBGFn - Funcion para verificar si es BBG
 * @returns {number|string} - Paso actual o 'complete'
 */
export const calculateStepFromConfig = (flowConfig, formData, isBBGFn) => {
  const steps = flowConfig?.steps || DEFAULT_FLOW_CONFIG.steps;

  for (const step of steps) {
    // Verificar campos requeridos del paso
    for (const field of step.requiredFields || []) {
      if (!formData[field]) {
        return step.id;
      }
    }

    // Verificar campos condicionales (ej: identificadores BBG)
    if (step.conditionalFields) {
      const { condition, fields } = step.conditionalFields;

      // Evaluar si la condicion aplica
      let conditionMet = false;
      if (condition === 'isBBG' && isBBGFn) {
        conditionMet = isBBGFn(formData.publicDataSource);
      } else if (condition === 'isChile') {
        conditionMet = formData.riskCountry === 'CL';
      }

      if (conditionMet) {
        for (const field of fields || []) {
          if (!formData[field]) {
            return step.id;
          }
        }
      }
    }
  }

  return 'complete';
};

/**
 * Calcula visibilidad de secciones basado en flowConfig
 * @param {Object} flowConfig - Configuracion de flujo
 * @param {Object} formData - Datos del formulario
 * @param {string} mode - Modo del formulario
 * @param {boolean} hasPredecesor - Si hay predecesor encontrado
 * @param {Function} isBBGFn - Funcion para verificar si es BBG (opcional)
 * @returns {Object} - Visibilidad de cada seccion
 */
export const calculateVisibilityFromConfig = (flowConfig, formData, mode, hasPredecesor, isBBGFn = null) => {
  const config = flowConfig || DEFAULT_FLOW_CONFIG;

  // Base: secciones transversales siempre visibles
  const visibility = {
    sourceData: true,
    restructuring: true,
    identifiers: false,
    company: false,
    definition: false,
    parametersFI: false,
    parametersDE: false,
    parameters: false, // Seccion generica de parametros (Fund, Cash, etc.)
  };

  // Sin modo = solo transversales
  if (!mode) return visibility;

  // Reestructuracion
  if (mode === 'reestructuracion') {
    visibility.identifiers = hasPredecesor;
    visibility.company = hasPredecesor;
    visibility.definition = hasPredecesor && config.hasDefinition;
    visibility.parametersFI = hasPredecesor && config.hasParametersFI;
    visibility.parametersDE = hasPredecesor && config.hasParametersDE;
    visibility.parameters = hasPredecesor && config.hasParameters;
    return visibility;
  }

  // Exacta o Parcial
  if (mode === 'exacta' || mode === 'parcial') {
    visibility.identifiers = true;
    visibility.company = true;
    visibility.definition = config.hasDefinition;
    visibility.parametersFI = config.hasParametersFI;
    visibility.parametersDE = config.hasParametersDE;
    visibility.parameters = config.hasParameters;
    return visibility;
  }

  // Nueva - flujo en cascada
  if (mode === 'nueva') {
    const paso1Completado = !!formData.investmentTypeCode && !!formData.nameInstrumento;

    visibility.identifiers = true;

    // CORRECCION FASE 11 y 11.2: Usar calculateStepFromConfig para TODAS las secciones
    // Esto asegura que cada seccion solo sea visible cuando el paso anterior este COMPLETO
    // incluyendo campos condicionales (ISIN si BBG, sectorChile si CL, etc.)
    const currentStep = calculateStepFromConfig(config, formData, isBBGFn);
    const isComplete = currentStep === 'complete';
    const stepNum = typeof currentStep === 'number' ? currentStep : Infinity;

    // Company visible SOLO si paso 2 esta COMPLETO (incluyendo condicionales)
    if (config.requiresPublicDataSource) {
      // Para tipos que requieren publicDataSource (EQ, FI)
      // currentStep >= 3 significa que paso 2 ya fue validado exitosamente
      visibility.company = isComplete || stepNum >= 3;
    } else {
      // Para tipos sin publicDataSource (Fund, Cash, DE)
      // Paso 1 es solo investmentTypeCode + nameInstrumento
      visibility.company = paso1Completado;
    }

    // Definition visible SOLO si paso 3 esta COMPLETO
    // currentStep >= 4 significa que paso 3 (company) ya fue validado exitosamente
    visibility.definition = config.hasDefinition && (isComplete || stepNum >= 4);

    // Parametros especificos (FI, DE) - visibles cuando paso 3 completo
    visibility.parametersFI = config.hasParametersFI && (isComplete || stepNum >= 4);
    visibility.parametersDE = config.hasParametersDE && (isComplete || stepNum >= 4);

    // Parametros genericos (Fund, Cash, etc.) - visibles cuando paso 4 completo
    visibility.parameters = config.hasParameters && (isComplete || stepNum >= 5);

    return visibility;
  }

  return visibility;
};

// ===========================================
// FIELD FACTORY HELPERS
// Funciones para crear campos comunes de forma consistente
// Evitan duplicacion sin la complejidad de SHARED_FIELDS
// ===========================================

/**
 * Crea un campo de tipo select
 * @param {string} name - Nombre del campo
 * @param {string} label - Etiqueta del campo
 * @param {string} optionsKey - Key del catalogo de opciones
 * @param {Object} overrides - Propiedades adicionales
 * @returns {Object} - Configuracion del campo
 */
export const createSelectField = (name, label, optionsKey, overrides = {}) => ({
  name,
  label,
  type: 'select',
  optionsKey,
  ...overrides,
});

/**
 * Crea un campo de tipo texto
 * @param {string} name - Nombre del campo
 * @param {string} label - Etiqueta del campo
 * @param {Object} overrides - Propiedades adicionales
 * @returns {Object} - Configuracion del campo
 */
export const createTextField = (name, label, overrides = {}) => ({
  name,
  label,
  type: 'text',
  ...overrides,
});

/**
 * Crea un campo de pais (Issue_Country o Risk_Country)
 * @param {string} name - 'issueCountry' o 'riskCountry'
 * @param {Object} overrides - Propiedades adicionales (ej: defaultValue, cascade)
 * @returns {Object} - Configuracion del campo
 */
export const createCountryField = (name, overrides = {}) =>
  createSelectField(
    name,
    name === 'issueCountry' ? 'Issue_Country' : 'Risk_Country',
    'paises',
    { required: true, ...overrides }
  );

/**
 * Crea un campo de moneda (Issue_Currency o Risk_Currency)
 * @param {string} name - 'issueCurrency' o 'riskCurrency'
 * @param {Object} overrides - Propiedades adicionales
 * @returns {Object} - Configuracion del campo
 */
export const createCurrencyField = (name, overrides = {}) =>
  createSelectField(
    name,
    name === 'issueCurrency' ? 'Issue_Currency' : 'Risk_Currency',
    'monedas',
    { required: true, ...overrides }
  );

/**
 * Crea un campo de identificador (ISIN, TickerBBG, SEDOL, CUSIP)
 * @param {string} name - Nombre del identificador
 * @param {Object} overrides - Propiedades adicionales
 * @returns {Object} - Configuracion del campo
 */
export const createIdentifierField = (name, overrides = {}) => {
  const configs = {
    isin: {
      label: 'ISIN',
      maxLength: 12,
      uppercase: true,
      placeholder: 'Ej: US0378331005',
    },
    tickerBBG: {
      label: 'TickerBBG',
      maxLength: 50,
      uppercase: true,
      placeholder: 'Ej: AAPL US',
    },
    sedol: {
      label: 'SEDOL',
      maxLength: 7,
      uppercase: true,
      placeholder: 'Ej: 2046251',
    },
    cusip: {
      label: 'CUSIP',
      maxLength: 9,
      uppercase: true,
      placeholder: 'Ej: 037833100',
    },
  };

  const baseConfig = configs[name] || { label: name };

  return {
    name,
    type: 'text',
    ...baseConfig,
    ...overrides,
  };
};

/**
 * Crea el campo sectorChileTypeCode con condiciones por defecto
 * @param {Object} overrides - Propiedades adicionales
 * @returns {Object} - Configuracion del campo
 */
export const createSectorChileField = (overrides = {}) => ({
  name: 'sectorChileTypeCode',
  label: 'Sector_Chile_Type_Code',
  type: 'select',
  optionsKey: 'sectorChile',
  visibleWhen: { field: 'riskCountry', equals: 'CL' },
  requiredWhen: { field: 'riskCountry', equals: 'CL' },
  ...overrides,
});

/**
 * Crea campos de compania (companyName, issuerTypeCode, sectorGICS)
 * @param {Object} options - { includeSectorGICS: true/false }
 * @returns {Object} - Objeto con los campos
 */
export const createCompanyFields = (options = { includeSectorGICS: true }) => {
  const fields = {
    companyName: {
      name: 'companyName',
      label: 'Nombre Compania',
      type: 'company-autocomplete',
      required: true,
    },
    issuerTypeCode: {
      name: 'issuerTypeCode',
      label: 'Issuer_Type_Code',
      type: 'select',
      optionsKey: 'issuerTypes',
    },
  };

  if (options.includeSectorGICS) {
    fields.sectorGICS = {
      name: 'sectorGICS',
      label: 'Sector_GICS',
      type: 'select',
      optionsKey: 'sectoresGICS',
    };
  }

  return fields;
};

/**
 * Crea campos de geografia (issueCountry, riskCountry, issueCurrency, riskCurrency)
 * @param {Object} options - { includeEmisionNacional: true/false, includeSectorChile: true/false }
 * @returns {Object} - Objeto con los campos
 */
export const createGeographyFields = (options = {}) => {
  const {
    includeEmisionNacional = false,
    includeSectorChile = true,
    countryDefaults = {},
    currencyDefaults = {},
  } = options;

  const fields = {
    issueCountry: createCountryField('issueCountry', countryDefaults.issueCountry || {}),
    riskCountry: createCountryField('riskCountry', {
      cascade: includeSectorChile ? ['sectorChileTypeCode'] : undefined,
      cascadeCondition: includeSectorChile ? { notEquals: 'CL' } : undefined,
      ...(countryDefaults.riskCountry || {}),
    }),
    issueCurrency: createCurrencyField('issueCurrency', currencyDefaults.issueCurrency || {}),
    riskCurrency: createCurrencyField('riskCurrency', currencyDefaults.riskCurrency || {}),
  };

  if (includeEmisionNacional) {
    fields.emisionNacional = {
      name: 'emisionNacional',
      label: 'Emision_Nacional',
      type: 'select',
      optionsKey: 'booleanValues',
    };
  }

  if (includeSectorChile) {
    fields.sectorChileTypeCode = createSectorChileField();
  }

  return fields;
};

export default {
  TRANSVERSAL_SECTIONS,
  DEFAULT_FLOW_CONFIG,
  evaluateCondition,
  calculateStepFromConfig,
  calculateVisibilityFromConfig,
  // Field factory helpers
  createSelectField,
  createTextField,
  createCountryField,
  createCurrencyField,
  createIdentifierField,
  createSectorChileField,
  createCompanyFields,
  createGeographyFields,
};
