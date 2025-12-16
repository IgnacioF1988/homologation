/**
 * equity.config.js - Configuracion completa para Equity (EQ)
 *
 * Este archivo define TODO lo que el formulario necesita saber sobre Equity:
 * - Que secciones mostrar y en que orden
 * - Que campos tiene cada seccion
 * - Que campos son requeridos y bajo que condiciones
 * - Que campos disparan cascadas
 * - Mensajes de cada paso
 *
 * COMO AGREGAR UN CAMPO A EQUITY:
 * 1. Agregarlo a la seccion correspondiente en 'sections.fields'
 * 2. Definir sus propiedades (type, label, required, etc.)
 * 3. Si es condicional, usar visibleWhen/requiredWhen
 * 4. Si dispara cascada, usar cascade + cascadeCondition
 *
 * NOTA: Este config define TODOS sus campos explicitamente.
 * No usa useSharedFields para maxima claridad.
 */

import {
  createIdentifierField,
  createCompanyFields,
  createGeographyFields,
} from './_base';

export const EQUITY_CONFIG = {
  // ===========================================
  // METADATA DEL TIPO
  // El ID debe coincidir EXACTAMENTE con el valor del catálogo investmentTypes
  // ===========================================
  id: 2, // ID numérico del catálogo cat.investmentTypes
  label: 'Equity (Renta Variable)',
  color: '#4CAF50', // Verde

  // ===========================================
  // FLUJO DE SECCIONES (orden en modo NUEVA)
  // ===========================================
  flow: ['identifiers', 'company', 'definition'],

  // ===========================================
  // CONFIGURACION DE FLUJO - Define comportamiento del formulario
  // ===========================================
  flowConfig: {
    requiresPublicDataSource: true,
    requiresIdentifiers: true,
    identifierLogic: 'bbg', // Requiere tickerBBG si BBG
    hasDefinition: true,
    hasParametersFI: false,
    hasParametersDE: false,
    steps: [
      { id: 1, requiredFields: ['investmentTypeCode', 'nameInstrumento'] },
      { id: 2, requiredFields: ['publicDataSource'], conditionalFields: { condition: 'isBBG', fields: ['tickerBBG'] } },
      { id: 3, requiredFields: ['companyName', 'issuerTypeCode', 'sectorGICS' ]},
      { id: 4, requiredFields: ['issueCountry', 'riskCountry', 'issueCurrency', 'riskCurrency'], conditionalFields: { condition: 'isChile', fields: ['sectorChileTypeCode'] } },
    ],
  },

  // ===========================================
  // MENSAJES POR PASO
  // ===========================================
  stepMessages: {
    1: 'Paso 1: Seleccione el tipo de inversion y nombre del instrumento.',
    2: 'Paso 2: Seleccione la fuente de datos y complete los identificadores.',
    3: 'Paso 3: Ingrese los datos de la compania.',
    4: 'Paso 4: Complete los paises y monedas.',
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

      // Grupos de campos (para control de visibilidad por pasos)
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
          fields: ['publicDataSource', 'tickerBBG', 'isin', 'sedol', 'cusip'],
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
        tickerBBG: {
          ...createIdentifierField('tickerBBG'),
          // Para EQ + BBG: tickerBBG es OBLIGATORIO
          requiredWhen: { field: 'publicDataSource', matches: ['BBG', 'Bloomberg', '3', '14'] },
          priorityIdentifier: true, // Este es el identificador principal para EQ
        },
        isin: {
          ...createIdentifierField('isin'),
          // Para EQ: isin NO es obligatorio con BBG (a diferencia de FI)
          required: false,
        },
        sedol: createIdentifierField('sedol'),
        cusip: createIdentifierField('cusip'),
      },

      // Alerta especial para BBG
      alerts: [
        {
          condition: { field: 'publicDataSource', matches: ['BBG', 'Bloomberg', '3', '14'] },
          severity: 'info',
          message: 'Para Bloomberg + Equity: TickerBBG es OBLIGATORIO',
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
        // Override: Para EQ, GICS es requerido
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
          includeEmisionNacional: false,
          includeSectorChile: true,
        }),
        // Override specific fields to ensure they're explicit and required
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
  },

  // ===========================================
  // VALIDACIONES A NIVEL DE FORMULARIO
  // ===========================================
  validations: {
    // Validacion: Si BBG, debe tener tickerBBG
    bbgRequiresTickerBBG: {
      condition: (formData) => {
        const isBBG = ['bbg', 'bloomberg', '3', '14'].includes(
          String(formData.publicDataSource || '').toLowerCase()
        );
        return isBBG && !formData.tickerBBG;
      },
      field: 'tickerBBG',
      message: 'TickerBBG es OBLIGATORIO para Bloomberg + Equity',
    },

    // Validacion: Al menos un identificador si no es BBG
    atLeastOneIdentifier: {
      condition: (formData) => {
        const isBBG = ['bbg', 'bloomberg', '3', '14'].includes(
          String(formData.publicDataSource || '').toLowerCase()
        );
        if (isBBG) return false; // No aplica si es BBG
        const hasId = formData.isin || formData.tickerBBG || formData.sedol || formData.cusip;
        return !hasId;
      },
      field: '_identifiers',
      message: 'Se recomienda al menos un identificador (ISIN, TickerBBG, SEDOL o CUSIP)',
      severity: 'warning', // Solo advertencia, no bloquea
    },
  },

  // ===========================================
  // CAMPOS QUE NO SE HEREDAN EN REESTRUCTURACION
  // ===========================================
  reestructuracionExclusions: [],

  // ===========================================
  // AUTO-POPULATE (campos que se llenan automaticamente)
  // ===========================================
  autoPopulate: {},
};

export default EQUITY_CONFIG;
