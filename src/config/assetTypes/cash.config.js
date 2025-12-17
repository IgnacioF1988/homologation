/**
 * cash.config.js - Configuracion completa para Cash (Efectivo)
 *
 * CARACTERISTICAS:
 * - Identificadores: ISIN, TickerBBG, SEDOL, CUSIP (todos opcionales)
 * - NO tiene Public_Data_Source
 * - Tiene seccion de geografia (paises/monedas)
 * - Campo especial: cashTypeCode (en seccion de parametros propia)
 *
 * FLUJO:
 * Paso 1: investmentTypeCode + nameInstrumento
 * Paso 2: Identificadores (sin publicDataSource, todos opcionales)
 * Paso 3: companyName
 * Paso 4: Geografia (paises + monedas)
 * Paso 5: cashTypeCode (parametros de efectivo)
 *
 * NOTA: Este config define TODOS sus campos explicitamente.
 * No usa useSharedFields para maxima claridad.
 */

import {
  createCompanyFields,
  createGeographyFields,
} from './_base';

export const CASH_CONFIG = {
  // ===========================================
  // METADATA DEL TIPO
  // El ID debe coincidir EXACTAMENTE con el valor del catálogo investmentTypes
  // ===========================================
  id: 3, // ID numérico del catálogo cat.investmentTypes
  label: 'Cash (Efectivo)',
  color: '#00897B', // Teal

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
      { id: 5, requiredFields: ['cashTypeCode'] },
    ],
  },

  // ===========================================
  // MENSAJES POR PASO
  // ===========================================
  stepMessages: {
    1: 'Paso 1: Seleccione el tipo de inversion y nombre del instrumento.',
    2: 'Paso 2: Complete los identificadores (todos opcionales).',
    3: 'Paso 3: Ingrese los datos de la compania.',
    4: 'Paso 4: Complete la definicion geografica.',
    5: 'Paso 5: Seleccione el tipo de efectivo.',
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

      // Ocultar publicDataSource para cash
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
        // Todos los identificadores son opcionales para cash
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
          message: 'Cash no requiere Public_Data_Source. Todos los identificadores son opcionales.',
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

      // Campos de compania (todos explicitos, sin sectorGICS para Cash)
      fields: {
        ...createCompanyFields({ includeSectorGICS: false }),
        companyName: {
          name: 'companyName',
          label: 'Nombre Compania',
          type: 'text',
          required: true,
          readOnly: true,  
          defaultValue: '[CASH & EQUIV.]',
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
          defaultValue: '88888888',
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
          fields: ['issueCountry', 'riskCountry', 'issueCurrency', 'riskCurrency', 'sectorChileTypeCode'],
        },
      ],

      // Campos de geografia (todos explicitos, sin emisionNacional)
      fields: {
        ...createGeographyFields({
          includeEmisionNacional: false,
          includeSectorChile: true,
        }),
        issueCountry: {
        name: 'issueCountry',
        label: 'Issue_Country',
        type: 'select',
        optionsKey: 'paises',
        required: true,
        readOnly: true,
        defaultValue: '[Cash & Eq]',
      },
      riskCountry: {
        name: 'riskCountry',
        label: 'Risk_Country',
        type: 'select',
        optionsKey: 'paises',
        required: true,
        readOnly: true,  
        defaultValue: '[Cash & Eq]',
      },
      issueCurrency: {
        name: 'issueCurrency',
        label: 'Issue_Currency',
        type: 'select',
        optionsKey: 'monedas',
        required: true,
        readOnly: true,  // ADD THIS
      },
      riskCurrency: {
        name: 'riskCurrency',
        label: 'Risk_Currency',
        type: 'select',
        optionsKey: 'monedas',
        required: true,
        readOnly: true,  // ADD THIS
      },
      },

      alerts: [],
    },

    // -----------------------------------------
    // SECCION: Parametros de Efectivo
    // Campo especifico: cashTypeCode
    // -----------------------------------------
    parameters: {
      id: 'parameters',
      title: 'Parametros de Efectivo',
      icon: 'AccountBalanceIcon',
      step: 5,

      fields: {
        cashTypeCode: {
          name: 'cashTypeCode',
          label: 'Cash_Type_Code',
          type: 'select',
          required: true,
          optionsKey: 'cashTypes',
          helpText: 'Tipo de efectivo (Restricted, Unrestricted, DAP, etc.)',
          // defaultValue: 2, // Ejemplo: 2 = Unrestricted (descomentar para activar)
        },
      },

      alerts: [],
    },
  },

  // ===========================================
  // VALIDACIONES A NIVEL DE FORMULARIO
  // ===========================================
  validations: {
    cashTypeRequired: {
      condition: (formData) => !formData.cashTypeCode,
      field: 'cashTypeCode',
      message: 'El tipo de efectivo es obligatorio',
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
    'investmentFundType',
    'bankDebtTypeCode',
  ],
};

export default CASH_CONFIG;
