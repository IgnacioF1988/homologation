/**
 * derivative.config.js - Configuracion completa para Derivados (DE)
 *
 * DIFERENCIAS IMPORTANTES CON OTROS TIPOS:
 * - NO tiene publicDataSource ni identificadores (isin, tickerBBG, etc.)
 * - NO tiene seccion de geografia (definition)
 * - Las monedas se AUTO-LLENAN desde la moneda de fuente
 * - Tiene campo SubID obligatorio (10000 = Pata Larga, 20000 = Pata Corta)
 *
 * FLUJO SIMPLIFICADO:
 * Paso 1: investmentTypeCode + nameInstrumento
 * Paso 2: companyName
 * Paso 3: subId
 *
 * NOTA: Este config define TODOS sus campos explicitamente.
 * No usa useSharedFields para maxima claridad.
 */

// No se necesitan imports de _base - todos los campos definidos explícitamente

export const DERIVATIVE_CONFIG = {
  // ===========================================
  // METADATA DEL TIPO
  // El ID debe coincidir EXACTAMENTE con el valor del catálogo investmentTypes
  // ===========================================
  id: 7, // ID numérico del catálogo cat.investmentTypes
  label: 'Derivados',
  color: '#FF9800', // Naranja

  // ===========================================
  // FLUJO DE SECCIONES (SIN definition ni identificadores)
  // ===========================================
  flow: ['identifiers', 'company', 'parameters'],

  // ===========================================
  // CONFIGURACION DE FLUJO - Define comportamiento del formulario
  // ===========================================
  flowConfig: {
    requiresPublicDataSource: false,
    requiresIdentifiers: false,
    identifierLogic: 'none', // Sin identificadores
    hasDefinition: false,
    hasParametersFI: false,
    hasParametersDE: true,
    steps: [
      { id: 1, requiredFields: ['investmentTypeCode', 'nameInstrumento'] },
      { id: 2, requiredFields: ['companyName', 'issuerTypeCode', 'sectorGICS'] },
      { id: 3, requiredFields: ['subId', 'issueCountry', 'riskCountry', 'issueCurrency', 'riskCurrency'] },
    ],
  },

  // ===========================================
  // MENSAJES POR PASO
  // ===========================================
  stepMessages: {
    1: 'Paso 1: Seleccione el tipo de inversion y nombre del instrumento.',
    2: 'Paso 2: Ingrese los datos de la compania.',
    3: 'Paso 3: Seleccione el SubID del derivado.',
    complete: 'Todos los campos requeridos estan completos.',
  },

  // ===========================================
  // DEFINICION DE SECCIONES
  // ===========================================
  sections: {
    // -----------------------------------------
    // SECCION: Identificadores (SIMPLIFICADA)
    // Solo investmentTypeCode y nameInstrumento
    // -----------------------------------------
    identifiers: {
      id: 'identifiers',
      title: 'Identificadores',
      icon: 'FingerprintIcon',

      groups: [
        {
          id: 'step1',
          step: 1,
          // SOLO estos dos campos - sin publicDataSource ni identificadores
          fields: ['investmentTypeCode', 'nameInstrumento'],
        },
        // NO hay step2 para derivados
      ],

      // Derivados NO usan estos campos
      hiddenFields: ['publicDataSource', 'isin', 'tickerBBG', 'sedol', 'cusip'],

      fields: {},

      alerts: [
        {
          severity: 'info',
          message: 'Los derivados no requieren identificadores (ISIN, TickerBBG, etc.)',
        },
      ],
    },

    // -----------------------------------------
    // SECCION: Compania
    // -----------------------------------------
    company: {
      id: 'company',
      title: 'Datos de la Compania',
      icon: 'BusinessIcon',
      step: 2,

      // Campos de compania (todos explicitos, con sectorGICS)
      fields: {
        companyName: {
          name: 'companyName',
          label: 'Nombre Compania',
          type: 'text',
          required: true,
          readOnly: true,
          defaultValue: '[DERIV]',
        },
        issuerTypeCode: {
          name: 'issuerTypeCode',
          label: 'Issuer_Type_Code',
          type: 'select',
          optionsKey: 'issuerTypes',
          required: true,
          readOnly: true,
          defaultValue: '0',
        },
        sectorGICS: {
          name: 'sectorGICS',
          label: 'Sector_GICS',
          type: 'select',
          optionsKey: 'sectoresGICS',
          required: true,
          readOnly: true,
          defaultValue: '77777777',
        },
      },
    },

    // -----------------------------------------
    // SECCION: Parametros Derivado
    // -----------------------------------------
    parameters: {
      id: 'parameters',
      title: 'Parametros Derivado',
      icon: 'ShowChartIcon',
      step: 3,

      groups: [
        {
          id: 'main',
          fields: ['subId'],
        },
        {
          id: 'geography',
          fields: ['issueCountry', 'riskCountry', 'issueCurrency', 'riskCurrency'],
        },
      ],

      fields: {
        subId: {
          name: 'subId',
          label: 'SubID (Pata del Derivado)',
          type: 'select',
          required: true,
          // Opciones fijas (no vienen de catalogo)
          options: [
            { value: 10000, label: '10000 - Pata Larga (Asset)' },
            { value: 20000, label: '20000 - Pata Corta (Liability)' },
          ],
          helpText: 'Seleccione 10000 para Pata Larga (Asset) o 20000 para Pata Corta (Liability)',
        },
        issueCountry: {
          name: 'issueCountry',
          label: 'Issue_Country',
          type: 'select',
          optionsKey: 'paises',
          required: true,
          readOnly: true,
          defaultValue: '[Deriv]',
        },
        riskCountry: {
          name: 'riskCountry',
          label: 'Risk_Country',
          type: 'select',
          optionsKey: 'paises',
          required: true,
          readOnly: true,
          defaultValue: '[Deriv]',
        },
        issueCurrency: {
          name: 'issueCurrency',
          label: 'Issue_Currency',
          type: 'select',
          optionsKey: 'monedas',
          required: true,
          readOnly: true,
          // No defaultValue, auto-filled from queue
        },
        riskCurrency: {
          name: 'riskCurrency',
          label: 'Risk_Currency',
          type: 'select',
          optionsKey: 'monedas',
          required: true,
          readOnly: true,
          // No defaultValue, auto-filled from queue
        },
      },

      alerts: [
        {
          severity: 'warning',
          message: 'IMPORTANTE: SubID es obligatorio. 10000 = Pata Larga (Asset) | 20000 = Pata Corta (Liability)',
        },
      ],
    },

    // -----------------------------------------
    // SECCION: Definition (NO EXISTE para derivados)
    // Las monedas se auto-llenan
    // -----------------------------------------
    // definition: null, // Explicitamente no existe
  },

  // ===========================================
  // VALIDACIONES A NIVEL DE FORMULARIO
  // ===========================================
  validations: {
    subIdRequired: {
      condition: (formData) => {
        const subIdValue = parseInt(formData.subId);
        return !formData.subId || ![10000, 20000].includes(subIdValue);
      },
      field: 'subId',
      message: 'SubID es OBLIGATORIO para derivados (10000 o 20000)',
    },
  },

  // ===========================================
  // CAMPOS QUE NO SE HEREDAN EN REESTRUCTURACION
  // ===========================================
  reestructuracionExclusions: [],

  // ===========================================
  // AUTO-POPULATE - Monedas desde fuente
  // ===========================================
  autoPopulate: {
    issueCurrency: { fromField: 'moneda' },
    riskCurrency: { fromField: 'moneda' },
  },

  // ===========================================
  // CAMPOS FORZADOS A READONLY
  // (Ademas de los que ya son readonly por modo)
  // ===========================================
  forceReadOnly: ['issueCurrency', 'riskCurrency'],

  // ===========================================
  // CAMPOS QUE NO APLICAN PARA ESTE TIPO
  // ===========================================
  excludedFields: [
    'publicDataSource',
    'isin',
    'tickerBBG',
    'sedol',
    'cusip',
    'sectorChileTypeCode',
    'emisionNacional',
    // Parametros FI
    'couponTypeCode',
    'yieldType',
    'yieldSource',
    'perpetuidad',
    'rendimiento',
    'couponFrequency',
    'coco',
    'callable',
    'sinkable',
    'yasYldFlag',
  ],
};

export default DERIVATIVE_CONFIG;
