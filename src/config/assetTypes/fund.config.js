/**
 * fund.config.js - Configuracion completa para Fondos (Fund)
 *
 * CARACTERISTICAS:
 * - Identificadores: ISIN, TickerBBG, SEDOL, CUSIP (todos opcionales)
 * - NO tiene Public_Data_Source
 * - Tiene seccion de geografia (paises/monedas)
 * - Campo especial: investmentFundType (en seccion de parametros propia)
 *
 * FLUJO:
 * Paso 1: investmentTypeCode + nameInstrumento
 * Paso 2: Identificadores (sin publicDataSource)
 * Paso 3: companyName
 * Paso 4: Geografia (paises + monedas)
 * Paso 5: investmentFundType (parametros del fondo)
 *
 * NOTA: Este config define TODOS sus campos explicitamente.
 * No usa useSharedFields para maxima claridad.
 */

import {
  createCompanyFields,
  createGeographyFields,
} from './_base';

export const FUND_CONFIG = {
  // ===========================================
  // METADATA DEL TIPO
  // El ID debe coincidir EXACTAMENTE con el valor del catálogo investmentTypes
  // ===========================================
  id: 6, // ID numérico del catálogo cat.investmentTypes
  label: 'Fondos',
  color: '#9C27B0', // Morado

  // ===========================================
  // FLUJO DE SECCIONES
  // ===========================================
  flow: ['identifiers', 'company', 'definition', 'parameters'],

  // ===========================================
  // CONFIGURACION DE FLUJO - Define comportamiento del formulario
  // ===========================================
  flowConfig: {
    requiresPublicDataSource: false,
    requiresIdentifiers: true,
    identifierLogic: 'optional', // Todos los identificadores opcionales
    hasDefinition: true,
    hasParametersFI: false,
    hasParametersDE: false,
    hasParameters: true, // Usa ParametersSection generico
    steps: [
      { id: 1, requiredFields: ['investmentTypeCode', 'nameInstrumento'] },
      // Paso 2: Identificadores (todos opcionales, siempre pasa)
      { id: 2, requiredFields: [] },
      { id: 3, requiredFields: ['companyName', 'issuerTypeCode', 'sectorGICS'] },
      { id: 4, requiredFields: ['issueCountry', 'riskCountry', 'issueCurrency', 'riskCurrency'], conditionalFields: { condition: 'isChile', fields: ['sectorChileTypeCode'] } },
      { id: 5, requiredFields: ['investmentFundType'] },
    ],
  },

  // ===========================================
  // MENSAJES POR PASO
  // ===========================================
  stepMessages: {
    1: 'Paso 1: Seleccione el tipo de inversion y nombre del instrumento.',
    2: 'Paso 2: Complete los identificadores del fondo (todos opcionales).',
    3: 'Paso 3: Ingrese los datos de la compania.',
    4: 'Paso 4: Complete la definicion geografica.',
    5: 'Paso 5: Seleccione el tipo de fondo.',
    complete: 'Todos los campos requeridos estan completos.',
  },

  // ===========================================
  // DEFINICION DE SECCIONES
  // ===========================================
  sections: {
    // -----------------------------------------
    // SECCION: Identificadores
    // Sin publicDataSource, todos los identificadores opcionales
    // -----------------------------------------
    identifiers: {
      id: 'identifiers',
      title: 'Identificadores',
      icon: 'FingerprintIcon',

      // Ocultar publicDataSource para fondos
      hiddenFields: ['publicDataSource'],

      groups: [
        {
          id: 'step1',
          step: 1,
          fields: ['investmentTypeCode', 'nameInstrumento'],
        },
        {
          id: 'step2',
          step: 2,
          // Todos los identificadores visibles pero opcionales
          fields: ['isin', 'tickerBBG', 'sedol', 'cusip'],
        },
      ],

      fields: {
        // Todos los identificadores son opcionales para fondos
        isin: {
          name: 'isin',
          label: 'ISIN',
          type: 'text',
          required: false,
          placeholder: 'Ej: US0378331005',
          maxLength: 12,
        },
        tickerBBG: {
          name: 'tickerBBG',
          label: 'TickerBBG',
          type: 'text',
          required: false,
          placeholder: 'Ej: AAPL US',
          maxLength: 20,
        },
        sedol: {
          name: 'sedol',
          label: 'SEDOL',
          type: 'text',
          required: false,
          placeholder: 'Ej: 2046251',
          maxLength: 7,
        },
        cusip: {
          name: 'cusip',
          label: 'CUSIP',
          type: 'text',
          required: false,
          placeholder: 'Ej: 037833100',
          maxLength: 9,
        },
      },

      alerts: [
        {
          severity: 'info',
          message: 'Los fondos no requieren Public_Data_Source. Todos los identificadores son opcionales.',
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
      step: 3,

      // Campos de compania (todos explicitos, con sectorGICS)
      fields: {
        companyName: {
          name: 'companyName',
          label: 'Nombre Compania',
          type: 'text',
          required: true,
          readOnly: true,
          defaultValue: '[FUND]',
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
          defaultValue: '66666666',
        },
      },
    },

    // -----------------------------------------
    // SECCION: Definition (Solo Geografia)
    // -----------------------------------------
    definition: {
      id: 'definition',
      title: 'Definicion Geografica',
      icon: 'PublicIcon',
      step: 4,
    
      groups: [
        {
          id: 'geography',
          fields: ['issueCountry', 'riskCountry', 'issueCurrency', 'riskCurrency'],
        },
      ],
    
      fields: {
        issueCountry: {
          name: 'issueCountry',
          label: 'Issue_Country',
          type: 'select',
          optionsKey: 'paises',
          required: true,
        },
        riskCountry: {
          name: 'riskCountry',
          label: 'Risk_Country',
          type: 'select',
          optionsKey: 'paises',
          required: true,
          readOnly: true,
          defaultValue: '[Fund]', // Auto-filled to [Fund]
        },
        issueCurrency: {
          name: 'issueCurrency',
          label: 'Issue_Currency',
          type: 'select',
          optionsKey: 'monedas',
          required: true,
          readOnly: true, // Auto-filled from queue
        },
        riskCurrency: {
          name: 'riskCurrency',
          label: 'Risk_Currency',
          type: 'select',
          optionsKey: 'monedas',
          required: true,
          readOnly: true, // Auto-filled from queue
        },
      },
    
      alerts: [
        {
          severity: 'info',
          message: 'Para Fondos: Risk Country = [Fund], currencies = moneda de cola (auto-completados).',
        },
      ],
    },

    // -----------------------------------------
    // SECCION: Parametros del Fondo
    // Campo especifico: investmentFundType
    // -----------------------------------------
    parameters: {
      id: 'parameters',
      title: 'Parametros del Fondo',
      icon: 'AccountBalanceIcon',
      step: 5,

      fields: {
        fundTypeCode: {
          name: 'fundTypeCode',
          label: 'Fund_Type_Code',
          type: 'select',
          required: true,
          optionsKey: 'fundTypes',
          helpText: 'Tipo de fondo de inversion',
        },
      },

      alerts: [],
    },
  },

  // ===========================================
  // VALIDACIONES A NIVEL DE FORMULARIO
  // ===========================================
  validations: {
    fundTypeRequired: {
      condition: (formData) => !formData.fundTypeCode,
      field: 'fundTypeCode',
      message: 'El tipo de fondo es obligatorio',
    },
  },

  // ===========================================
  // CAMPOS QUE NO SE HEREDAN EN REESTRUCTURACION
  // ===========================================
  reestructuracionExclusions: [],

  // ===========================================
  // CAMPOS QUE NO APLICAN PARA ESTE TIPO
  // ===========================================
  excludedFields: [
    'publicDataSource',
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
    // Parametros DE
    'subId',
    // Otros tipos
    'cashTypeCode',
    'bankDebtTypeCode',
  ],
};

export default FUND_CONFIG;
