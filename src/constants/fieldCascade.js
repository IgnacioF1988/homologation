/**
 * fieldCascade.js - Configuracion de dependencias en cascada entre campos
 *
 * PROPOSITO:
 * Define que campos se limpian cuando otro campo cambia.
 * Esto asegura consistencia de datos en el formulario.
 *
 * COMO AGREGAR UN NUEVO CAMPO CON CASCADA:
 * 1. Agregar entrada en cascadeConfig con el nombre del campo
 * 2. Definir clearFields: array de campos que se limpian cuando este cambia
 * 3. Opcional: condition - funcion que determina si aplicar la cascada
 * 4. Opcional: skipIfAutoPopulate - no limpiar si viene de auto-populate
 * 5. Opcional: skipIfCompanySelected - no limpiar si hay compania seleccionada
 * 6. Opcional: clearCompanyState - si debe resetear el estado de compania
 *
 * FLUJO ACTUAL (modo NUEVA):
 * Paso 1: investmentTypeCode + nameInstrumento
 * Paso 2: publicDataSource + identificadores (ISIN/TickerBBG)
 * Paso 3: companyName + issuerTypeCode + sectorGICS
 * Paso 4: Geografia (issueCountry, riskCountry, monedas)
 * Paso 5: Parametros FI (solo Fixed Income)
 *
 * @example
 * // Agregar cascada para un nuevo campo "myNewField":
 * myNewField: {
 *   clearFields: ['dependentField1', 'dependentField2'],
 *   condition: (newValue) => newValue === 'SOME_VALUE', // opcional
 * }
 */

// Campos que se limpian en cada nivel de cascada
export const COMPANY_FIELDS = ['companyName', 'issuerTypeCode', 'sectorGICS'];
export const IDENTIFIER_FIELDS = ['publicDataSource', 'isin', 'tickerBBG', 'sedol', 'cusip'];
export const GEOGRAPHY_FIELDS = ['issueCountry', 'riskCountry', 'sectorChileTypeCode', 'issueCurrency', 'riskCurrency', 'emisionNacional'];
export const FI_PARAMETER_FIELDS = ['couponTypeCode', 'yieldType', 'yieldSource', 'perpetuidad', 'rendimiento', 'couponFrequency'];
export const BBG_FIELDS = ['coco', 'callable', 'sinkable', 'yasYldFlag'];

// Todos los campos dependientes (para reseteo completo)
export const ALL_DEPENDENT_FIELDS = [
  ...COMPANY_FIELDS,
  ...IDENTIFIER_FIELDS,
  ...GEOGRAPHY_FIELDS,
  ...FI_PARAMETER_FIELDS,
  ...BBG_FIELDS,
  'issueTypeCode', 'rankCode', 'cashTypeCode', 'bankDebtTypeCode', 'fundTypeCode',
  'comentarios',
];

// Campos de reestructuracion
export const REESTRUCTURACION_FIELDS = ['idPredecesor', 'monedaPredecesor', 'main', 'diaValidez'];

/**
 * Configuracion de cascada por campo
 *
 * Estructura:
 * - clearFields: campos a limpiar cuando este campo cambia
 * - clearCompanyState: si debe resetear el estado de seleccion de compania
 * - skipIfAutoPopulate: no ejecutar si el cambio viene de auto-populate
 * - skipIfCompanySelected: no ejecutar si hay una compania seleccionada
 * - condition: funcion que recibe el nuevo valor y retorna si debe ejecutar la cascada
 */
export const cascadeConfig = {
  // ===========================================
  // PASO 1: Investment Type + Name
  // Al cambiar estos, se limpia TODO lo demas
  // ===========================================
  investmentTypeCode: {
    clearFields: [
      ...COMPANY_FIELDS,
      ...IDENTIFIER_FIELDS,
      ...GEOGRAPHY_FIELDS,
      ...FI_PARAMETER_FIELDS,
      ...BBG_FIELDS,
    ],
    clearCompanyState: true,
  },

  nameInstrumento: {
    clearFields: [
      ...IDENTIFIER_FIELDS,
      ...COMPANY_FIELDS,
      ...GEOGRAPHY_FIELDS,
      ...FI_PARAMETER_FIELDS,
      ...BBG_FIELDS,
    ],
    clearCompanyState: true,
  },

  // ===========================================
  // PASO 2: Public Data Source
  // ===========================================
  publicDataSource: {
    clearFields: [
      'isin', 'tickerBBG', 'sedol', 'cusip',
      ...GEOGRAPHY_FIELDS,
      'perpetuidad', 'rendimiento', 'couponFrequency',
      ...BBG_FIELDS,
    ],
  },

  // ===========================================
  // PASO 3: Company
  // NO limpia publicDataSource ni identificadores
  // ===========================================
  companyName: {
    clearFields: [
      'issuerTypeCode', 'sectorGICS',
      ...GEOGRAPHY_FIELDS,
      ...FI_PARAMETER_FIELDS,
      ...BBG_FIELDS,
    ],
    skipIfAutoPopulate: true,
  },

  issuerTypeCode: {
    clearFields: [
      ...GEOGRAPHY_FIELDS,
      ...FI_PARAMETER_FIELDS,
      ...BBG_FIELDS,
    ],
    skipIfCompanySelected: true,
  },

  sectorGICS: {
    clearFields: [
      ...GEOGRAPHY_FIELDS,
      ...FI_PARAMETER_FIELDS,
      ...BBG_FIELDS,
    ],
    skipIfCompanySelected: true,
  },

  // ===========================================
  // PASO 4: Geografia
  // ===========================================
  riskCountry: {
    clearFields: ['sectorChileTypeCode'],
    condition: (newValue) => newValue !== 'CL', // Solo limpiar si NO es Chile
  },

  // ===========================================
  // PASO 5: Parametros FI
  // ===========================================
  yieldSource: {
    clearFields: [...BBG_FIELDS],
    condition: (newValue) => newValue !== 'BBG', // Solo limpiar si NO es BBG
  },

  couponTypeCode: {
    clearFields: ['couponFrequency'],
    condition: (newValue) => newValue === 'ZERO', // Solo limpiar si es ZERO
  },
};

export default cascadeConfig;
