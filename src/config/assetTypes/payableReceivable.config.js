
import {
  createCompanyFields,
  createGeographyFields,
} from './_base';

export const PAYABLE_RECEIVABLE_CONFIG = {
  id: 4, // ID del catalogo investmentTypes
  label: 'Payable/Receivable',
  color: '#00897B', // Teal

  flow: ['identifiers', 'company', 'definition'],

  flowConfig: {
    requiresPublicDataSource: false,
    requiresIdentifiers: true,
    identifierLogic: 'optional',
    hasDefinition: true,
    hasParametersFI: false,
    hasParametersDE: false,
    hasParameters: false, // NO tiene parametros
    steps: [
      { id: 1, requiredFields: ['investmentTypeCode', 'nameInstrumento'] },
      { id: 2, requiredFields: [] },
      { id: 3, requiredFields: ['companyName', 'issuerTypeCode', 'sectorGICS'] },
      { id: 4, requiredFields: ['issueCountry', 'riskCountry', 'issueCurrency', 'riskCurrency'] },
    ],
  },

  stepMessages: {
    1: 'Paso 1: Seleccione el tipo de inversion y nombre del instrumento.',
    2: 'Paso 2: Complete los identificadores (todos opcionales).',
    3: 'Paso 3: Datos de compania (auto-completados).',
    4: 'Paso 4: Geografia (auto-completada).',
    complete: 'Todos los campos requeridos estan completos.',
  },

  sections: {
    identifiers: {
      id: 'identifiers',
      title: 'Identificadores',
      icon: 'FingerprintIcon',
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
          fields: ['isin', 'tickerBBG', 'sedol', 'cusip'],
        },
      ],

      fields: {
        isin: {
          name: 'isin',
          label: 'ISIN',
          type: 'text',
          required: false,
          maxLength: 12,
        },
        tickerBBG: {
          name: 'tickerBBG',
          label: 'TickerBBG',
          type: 'text',
          required: false,
          maxLength: 20,
        },
        sedol: {
          name: 'sedol',
          label: 'SEDOL',
          type: 'text',
          required: false,
          maxLength: 7,
        },
        cusip: {
          name: 'cusip',
          label: 'CUSIP',
          type: 'text',
          required: false,
          maxLength: 9,
        },
      },

      alerts: [
        {
          severity: 'info',
          message: 'Payable/Receivable no requiere Public_Data_Source.',
        },
      ],
    },

    company: {
      id: 'company',
      title: 'Datos de la Compania',
      icon: 'BusinessIcon',
      step: 3,

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
        ...createGeographyFields({
          includeEmisionNacional: false,
          includeSectorChile: false,
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
          readOnly: true,
        },
        riskCurrency: {
          name: 'riskCurrency',
          label: 'Risk_Currency',
          type: 'select',
          optionsKey: 'monedas',
          required: true,
          readOnly: true,
        },
      },

      alerts: [],
    },
  },

  validations: {},
  reestructuracionExclusions: [],
  excludedFields: [
    'publicDataSource',
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
    'subId',
    'cashTypeCode',
    'bankDebtTypeCode',
    'fundTypeCode',
  ],
};

export default PAYABLE_RECEIVABLE_CONFIG;