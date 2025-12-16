/**
 * formFieldConfig.js - Configuracion de campos editables por modo
 *
 * PROPOSITO:
 * Define que campos son editables/readonly en cada modo del formulario.
 * Esto controla la interaccion del usuario segun el contexto.
 *
 * COMO AGREGAR UN NUEVO CAMPO:
 * 1. Agregarlo al array 'editable' de los modos donde debe ser editable
 * 2. Si siempre es readonly, agregarlo a SOURCE_FIELDS
 * 3. Actualizar la descripcion del modo si es necesario
 *
 * MODOS DISPONIBLES:
 * - EXACTA: Coincidencia exacta ID + Moneda -> casi todo readonly
 * - PARCIAL: ID existe, moneda diferente -> solo monedas editables
 * - NUEVA: Instrumento nuevo -> flujo en cascada
 * - REESTRUCTURACION: Nuevo ID automatico desde predecesor
 *
 * @example
 * // Para hacer un campo editable en modo NUEVA:
 * // Agregar 'myNewField' al array editable de FORM_MODES.NUEVA
 */

import { FORM_MODES } from './formModes';

// ===========================================
// CAMPOS QUE NUNCA SON EDITABLES
// Datos fuente de la cola de pendientes
// ===========================================
export const SOURCE_FIELDS = [
  'nombreFuente',
  'fuente',
  'moneda',
  'queueItemId',
];

// ===========================================
// GRUPOS DE CAMPOS PARA FACILITAR CONFIGURACION
// ===========================================
export const FIELD_GROUPS = {
  // Identificadores
  identifiers: ['isin', 'tickerBBG', 'sedol', 'cusip'],

  // Company y clasificacion
  company: ['companyName', 'issuerTypeCode', 'sectorGICS'],

  // Clasificacion adicional
  classification: ['investmentTypeCode', 'issueTypeCode', 'sectorChileTypeCode'],

  // Geografia
  geography: ['issueCountry', 'riskCountry', 'issueCurrency', 'riskCurrency', 'emisionNacional'],

  // Parametros FI
  fiParameters: ['couponTypeCode', 'yieldType', 'yieldSource', 'perpetuidad', 'rendimiento', 'couponFrequency'],

  // Campos BBG
  bbgFields: ['coco', 'callable', 'sinkable', 'yasYldFlag'],

  // Otros tipos
  otherTypes: ['rankCode', 'cashTypeCode', 'bankDebtTypeCode', 'fundTypeCode'],

  // Reestructuracion
  reestructuracion: ['idPredecesor', 'monedaPredecesor', 'tipoContinuador', 'diaValidez'],
};

// ===========================================
// CONFIGURACION POR MODO
// ===========================================
export const MODE_FIELD_CONFIG = {
  [FORM_MODES.EXACTA]: {
    editable: ['idInstrumento', 'comentarios'],
    readonly: '*', // Todo lo demas es readonly
    description: 'Coincidencia exacta encontrada. Puede confirmar o cambiar el ID para buscar otro.',
    color: 'success',
    label: 'Coincidencia Exacta',
  },

  [FORM_MODES.PARCIAL]: {
    editable: [
      'idInstrumento',
      'issueCurrency',
      'riskCurrency',
      'esReestructuracion',
      'comentarios',
    ],
    readonly: [
      ...SOURCE_FIELDS,
      'nameInstrumento', 'publicDataSource',
      ...FIELD_GROUPS.identifiers,
      ...FIELD_GROUPS.company,
      ...FIELD_GROUPS.classification,
      'issueCountry', 'riskCountry', 'emisionNacional',
      ...FIELD_GROUPS.fiParameters,
      ...FIELD_GROUPS.bbgFields,
      ...FIELD_GROUPS.otherTypes,
    ],
    description: 'ID encontrado con moneda diferente. Complete Issue_Currency y Risk_Currency, o marque Reestructuracion.',
    color: 'warning',
    label: 'Coincidencia Parcial',
  },

  [FORM_MODES.NUEVA]: {
    editable: [
      'idInstrumento', 'esInstrumentoNuevo',
      'nameInstrumento', 'publicDataSource',
      ...FIELD_GROUPS.identifiers,
      ...FIELD_GROUPS.company,
      ...FIELD_GROUPS.classification,
      ...FIELD_GROUPS.geography,
      ...FIELD_GROUPS.fiParameters,
      ...FIELD_GROUPS.bbgFields,
      ...FIELD_GROUPS.otherTypes,
      'comentarios',
    ],
    readonly: SOURCE_FIELDS,
    description: 'Instrumento nuevo. Complete todos los campos.',
    color: 'info',
    label: 'Nuevo Instrumento',
  },

  [FORM_MODES.REESTRUCTURACION]: {
    editable: [
      'esReestructuracion', 'esInstrumentoNuevo',
      ...FIELD_GROUPS.reestructuracion,
      'nameInstrumento', 'publicDataSource',
      ...FIELD_GROUPS.identifiers,
      ...FIELD_GROUPS.company,
      ...FIELD_GROUPS.classification,
      ...FIELD_GROUPS.geography,
      ...FIELD_GROUPS.fiParameters,
      ...FIELD_GROUPS.bbgFields,
      ...FIELD_GROUPS.otherTypes,
      'comentarios',
    ],
    readonly: [...SOURCE_FIELDS, 'idInstrumento'],
    description: 'Reestructuracion. El ID se asigna automaticamente. Busque el predecesor.',
    color: 'secondary',
    label: 'Reestructuracion',
  },
};

// ===========================================
// PASOS DEL FLUJO SECUENCIAL (modo NUEVA)
// ===========================================
export const FORM_STEPS = {
  INITIAL: 0,
  INVESTMENT_TYPE: 1,  // Paso 1: investmentTypeCode + nameInstrumento
  PUBLIC_DATA: 2,      // Paso 2: publicDataSource + identificadores
  COMPANY: 3,          // Paso 3: companyName + issuerTypeCode + sectorGICS
  DEFINITION: 4,       // Paso 4: issueCountry, riskCountry, monedas
  PARAMETERS: 5,       // Paso 5: Parametros FI (solo si FI)
  COMPLETE: 'complete',
};

// ===========================================
// MENSAJES DE PROGRESO POR PASO
// ===========================================
export const STEP_MESSAGES = {
  [FORM_STEPS.INVESTMENT_TYPE]: 'Paso 1: Seleccione el tipo de inversion y nombre del instrumento.',
  [FORM_STEPS.PUBLIC_DATA]: 'Paso 2: Seleccione la fuente de datos y complete los identificadores requeridos.',
  [FORM_STEPS.COMPANY]: 'Paso 3: Ingrese los datos de la compania.',
  [FORM_STEPS.DEFINITION]: 'Paso 4: Complete los paises de emision, riesgo y monedas.',
  [FORM_STEPS.PARAMETERS]: 'Paso 5: Complete los parametros del instrumento.',
  [FORM_STEPS.COMPLETE]: 'Todos los campos requeridos estan completos.',
};

export default {
  SOURCE_FIELDS,
  FIELD_GROUPS,
  MODE_FIELD_CONFIG,
  FORM_STEPS,
  STEP_MESSAGES,
};
