/**
 * fixedIncome.config.js - Configuracion completa para Fixed Income (FI)
 *
 * Este archivo define TODO lo que el formulario necesita saber sobre Fixed Income:
 * - Secciones y campos
 * - Parametros especificos de renta fija (coupon, yield, etc.)
 * - Campos BBG condicionales
 *
 * DIFERENCIAS CON EQUITY:
 * - ISIN es obligatorio si BBG (en vez de TickerBBG)
 * - Tiene seccion de parametros (coupon, yield, etc.)
 * - Campos BBG adicionales si yieldSource = BBG
 *
 * NOTA: Este config define TODOS sus campos explicitamente.
 * No usa useSharedFields para maxima claridad.
 */

import {
  createIdentifierField,
  createCompanyFields,
  createGeographyFields,
} from './_base';

export const FIXED_INCOME_CONFIG = {
  // ===========================================
  // METADATA DEL TIPO
  // El ID debe coincidir EXACTAMENTE con el valor del catálogo investmentTypes
  // ===========================================
  id: 1, // ID numérico del catálogo cat.investmentTypes
  label: 'Fixed Income (Renta Fija)',
  color: '#2196F3', // Azul

  // ===========================================
  // FLUJO DE SECCIONES (orden en modo NUEVA)
  // ===========================================
  flow: ['identifiers', 'company', 'definition', 'parameters'],

  // ===========================================
  // CONFIGURACION DE FLUJO - Define comportamiento del formulario
  // ===========================================
  flowConfig: {
    requiresPublicDataSource: true,
    requiresIdentifiers: true,
    identifierLogic: 'bbg', // Requiere isin si BBG
    hasDefinition: true,
    hasParametersFI: true,
    hasParametersDE: false,
    steps: [
      { id: 1, requiredFields: ['investmentTypeCode', 'nameInstrumento'] },
      { id: 2, requiredFields: ['publicDataSource'], conditionalFields: { condition: 'isBBG', fields: ['isin'] } },
      { id: 3, requiredFields: ['companyName', 'issuerTypeCode', 'sectorGICS'] },
      { id: 4, requiredFields: ['issueCountry', 'riskCountry', 'issueCurrency', 'riskCurrency'], conditionalFields: { condition: 'isChile', fields: ['sectorChileTypeCode'] } },
      { id: 5, requiredFields: ['couponTypeCode', 'yieldType', 'yieldSource', 'perpetuidad', 'rendimiento', 'couponFrequency'], conditionalFields: { condition: 'isYieldSourceBBG', fields: ['coco', 'callable', 'sinkable'] } },
    ],
  },

  // ===========================================
  // MENSAJES POR PASO
  // ===========================================
  stepMessages: {
    1: 'Paso 1: Seleccione el tipo de inversion y nombre del instrumento.',
    2: 'Paso 2: Seleccione la fuente de datos y complete ISIN.',
    3: 'Paso 3: Ingrese los datos de la compania.',
    4: 'Paso 4: Complete los paises y monedas.',
    5: 'Paso 5: Complete los parametros de renta fija.',
    complete: 'Todos los campos requeridos estan completos.',
  },

  // ===========================================
  // DEFINICION DE SECCIONES
  // ===========================================
  sections: {
    // -----------------------------------------
    // SECCION: Identificadores
    // -----------------------------------------
    identifiers: {
      id: 'identifiers',
      title: 'Identificadores',
      icon: 'FingerprintIcon',

      groups: [
        {
          id: 'step1',
          step: 1,
          fields: ['investmentTypeCode', 'nameInstrumento'],
        },
        {
          id: 'step2',
          step: 2,
          visibleWhen: { fieldsComplete: ['investmentTypeCode', 'nameInstrumento'] },
          fields: ['publicDataSource', 'isin', 'tickerBBG', 'sedol', 'cusip'],
        },
      ],

      // Definicion de campos (todos explicitos)
      fields: {
        // Paso 1: Tipo e instrumento
        investmentTypeCode: {
          name: 'investmentTypeCode',
          label: 'Investment_Type_Code',
          type: 'select',
          optionsKey: 'investmentTypes',
          required: true,
        },
        nameInstrumento: {
          name: 'nameInstrumento',
          label: 'Name_Instrumento',
          type: 'text',
          required: true,
          maxLength: 200,
        },

        // Paso 2: Fuente de datos
        publicDataSource: {
          name: 'publicDataSource',
          label: 'Public_Data_Source',
          type: 'select',
          optionsKey: 'dataSources',
          required: true,
          cascade: ['isin', 'tickerBBG', 'sedol', 'cusip'],
        },

        // Identificadores
        isin: {
          ...createIdentifierField('isin'),
          // Para FI + BBG: ISIN es OBLIGATORIO
          requiredWhen: { field: 'publicDataSource', matches: ['BBG', 'Bloomberg', '14'] },
          priorityIdentifier: true, // Este es el identificador principal para FI
        },
        tickerBBG: {
          ...createIdentifierField('tickerBBG'),
          // Para FI: tickerBBG NO es obligatorio con BBG
          required: false,
        },
        sedol: createIdentifierField('sedol'),
        cusip: createIdentifierField('cusip'),
      },

      alerts: [
        {
          condition: { field: 'publicDataSource', matches: ['BBG', 'Bloomberg', '14'] },
          severity: 'info',
          message: 'Para Bloomberg + Fixed Income: ISIN es OBLIGATORIO',
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

      // Campos de compania (todos explicitos)
      fields: {
        ...createCompanyFields({ includeSectorGICS: true }),
        issuerTypeCode: {
            name: 'issuerTypeCode',
            label: 'Issuer_Type_Code',
            type: 'select',
            optionsKey: 'issuerTypes',
            required: true,
          },
        sectorGICS: {
          name: 'sectorGICS',
          label: 'Sector_GICS',
          type: 'select',
          optionsKey: 'sectoresGICS',
          required: true,
        },
      },
    },

    // -----------------------------------------
    // SECCION: Definicion (Geografia)
    // -----------------------------------------
    definition: {
      id: 'definition',
      title: 'Definicion Geografica',
      icon: 'PublicIcon',
      step: 4,

      // Campos de geografia (todos explicitos)
      fields: {
        ...createGeographyFields({
          includeEmisionNacional: true,
          includeSectorChile: true,
        }),
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
            cascade: ['sectorChileTypeCode'],
            cascadeCondition: { notEquals: 'CL' },
          },
          issueCurrency: {
            name: 'issueCurrency',
            label: 'Issue_Currency',
            type: 'select',
            optionsKey: 'monedas',
            required: true,
          },
          riskCurrency: {
            name: 'riskCurrency',
            label: 'Risk_Currency',
            type: 'select',
            optionsKey: 'monedas',
            required: true,
          },
          emisionNacional: {
            name: 'emisionNacional',
            label: 'Emision_Nacional',
            type: 'select',
            optionsKey: 'booleanValues',
            visibleWhen: { or: [{ field: 'riskCountry', equals: 'CL' }, { field: 'issueCountry', equals: 'CL' }] },
            requiredWhen: { or: [{ field: 'riskCountry', equals: 'CL' }, { field: 'issueCountry', equals: 'CL' }] }
          },
          sectorChileTypeCode: {
            name: 'sectorChileTypeCode',
            label: 'Sector_Chile_Type_Code',
            type: 'select',
            optionsKey: 'sectorChile',
            visibleWhen: { or: [{ field: 'riskCountry', equals: 'CL' }, { field: 'issueCountry', equals: 'CL' }] },
            requiredWhen: { or: [{ field: 'riskCountry', equals: 'CL' }, { field: 'issueCountry', equals: 'CL' }] },
          },
      },
    },

    // -----------------------------------------
    // SECCION: Parametros FI (EXCLUSIVA DE FI)
    // -----------------------------------------
    parameters: {
      id: 'parameters',
      title: 'Parametros Renta Fija',
      icon: 'AccountBalanceIcon',
      step: 5,

      groups: [
        {
          id: 'main',
          fields: ['couponTypeCode', 'yieldType', 'yieldSource', 'perpetuidad', 'rendimiento', 'couponFrequency'],
        },
        {
          id: 'bbgFields',
          visibleWhen: { field: 'yieldSource', equals: '1' },
          fields: ['coco', 'callable', 'sinkable', 'yasYldFlag'],
          alertMessage: 'Complete los campos Bloomberg:',
        },
      ],

      fields: {
        couponTypeCode: {
          name: 'couponTypeCode',
          label: 'Coupon_Type_Code',
          type: 'select',
          optionsKey: 'couponTypes',
          required: true,
          cascade: ['couponFrequency'],
          cascadeCondition: { equals: 'ZERO' },
        },

        yieldType: {
          name: 'yieldType',
          label: 'Yield_Type',
          type: 'select',
          optionsKey: 'yieldTypes',
          required: true,
        },

        yieldSource: {
          name: 'yieldSource',
          label: 'Yield_Source',
          type: 'select',
          optionsKey: 'yieldSources',
          required: true,
          cascade: ['coco', 'callable', 'sinkable', 'yasYldFlag'],
          cascadeCondition: { notEquals: '1' },
        },

        perpetuidad: {
          name: 'perpetuidad',
          label: 'Perpetuidad',
          type: 'select',
          optionsKey: 'booleanValues',
          required: true,
        },

        rendimiento: {
          name: 'rendimiento',
          label: 'Rendimiento',
          type: 'select',
          optionsKey: 'booleanValues',
          required: true,
        },

        couponFrequency: {
          name: 'couponFrequency',
          label: 'Coupon_Frequency',
          type: 'select',
          optionsKey: 'couponFrequencies',
          required: true,
          // Se limpia si couponTypeCode = ZERO
          visibleWhen: { field: 'couponTypeCode', notEquals: 'ZERO' },
        },

        // Campos BBG (condicionales a yieldSource = BBG)
        coco: {
          name: 'coco',
          label: 'CoCo',
          type: 'select',
          optionsKey: 'booleanValues',
        },

        callable: {
          name: 'callable',
          label: 'Callable',
          type: 'select',
          optionsKey: 'booleanValues',
        },

        sinkable: {
          name: 'sinkable',
          label: 'Sinkable',
          type: 'select',
          optionsKey: 'booleanValues',
        },

        yasYldFlag: {
          name: 'yasYldFlag',
          label: 'YAS_YLD_FLAG',
          type: 'number',
        },
      },

      alerts: [
        {
          condition: { field: 'yieldSource', equals: 'BBG' },
          severity: 'info',
          message: 'Yield Source = BBG: Complete los campos adicionales de Bloomberg.',
        },
      ],
    },
  },

  // ===========================================
  // VALIDACIONES A NIVEL DE FORMULARIO
  // ===========================================
  validations: {
    bbgRequiresISIN: {
      condition: (formData) => {
        const isBBG = ['bbg', 'bloomberg', '3', '14'].includes(
          String(formData.publicDataSource || '').toLowerCase()
        );
        return isBBG && !formData.isin;
      },
      field: 'isin',
      message: 'ISIN es OBLIGATORIO para Bloomberg + Fixed Income',
    },
  },

  // ===========================================
  // CAMPOS QUE NO SE HEREDAN EN REESTRUCTURACION
  // ===========================================
  reestructuracionExclusions: [
    'perpetuidad',
    'rendimiento',
    'couponFrequency',
    'coco',
    'callable',
    'sinkable',
    'yasYldFlag',
  ],

  // ===========================================
  // AUTO-POPULATE
  // ===========================================
  autoPopulate: {},
};

export default FIXED_INCOME_CONFIG;
