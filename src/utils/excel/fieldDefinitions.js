/**
 * Definiciones centralizadas de campos para exportación/importación Excel
 * Incluye metadata para validaciones, catálogos y anchos de columna
 */

// Mapeo de catálogos a sus nombres de exportación en el módulo de catálogos
export const CATALOG_MAPPINGS = {
  paises: { arrayName: 'paises', codeField: 'codigo', nameField: 'nombre' },
  monedas: { arrayName: 'monedas', codeField: 'codigo', nameField: 'nombre' },
  investmentTypes: { arrayName: 'investmentTypes', codeField: 'codigo', nameField: 'nombre' },
  issuerTypes: { arrayName: 'issuerTypes', codeField: 'codigo', nameField: 'nombre' },
  issueTypes: { arrayName: 'issueTypes', codeField: 'codigo', nameField: 'nombre' },
  couponTypes: { arrayName: 'couponTypes', codeField: 'codigo', nameField: 'nombre' },
  couponFrequencies: { arrayName: 'couponFrequencies', codeField: 'codigo', nameField: 'nombre' },
  yieldTypes: { arrayName: 'yieldTypes', codeField: 'codigo', nameField: 'nombre' },
  yieldSources: { arrayName: 'yieldSources', codeField: 'codigo', nameField: 'nombre' },
  rankCodes: { arrayName: 'rankCodes', codeField: 'codigo', nameField: 'nombre' },
  sectorChile: { arrayName: 'sectorChile', codeField: 'codigo', nameField: 'nombre' },
  sectoresGICS: { arrayName: 'sectoresGICS', codeField: 'code', nameField: 'name' },
  dataSources: { arrayName: 'dataSources', codeField: 'codigo', nameField: 'nombre' },
  fuentes: { arrayName: 'fuentes', codeField: 'codigo', nameField: 'nombre' },
};

// Definición de todos los campos del instrumento
export const INSTRUMENT_FIELDS = [
  // ═══════════════════════════════════════════════════════════════════════
  // DATOS DE LA COLA (pre-llenados desde la cola de pendientes)
  // ═══════════════════════════════════════════════════════════════════════
  {
    key: 'nombreFuente',
    header: 'Nombre en Fuente',
    width: 40,
    fromQueue: true,
    section: 'Cola',
    description: 'Nombre del instrumento según la fuente de datos'
  },
  {
    key: 'fuente',
    header: 'Fuente',
    width: 12,
    catalog: 'fuentes',
    fromQueue: true,
    section: 'Cola',
    description: 'Fuente de donde proviene el dato'
  },
  {
    key: 'moneda',
    header: 'Moneda (ID)',
    width: 14,
    fromQueue: true,
    section: 'Cola',
    description: 'ID numérico de la moneda según catálogo'
  },
  {
    key: 'fechaIngreso',
    header: 'Fecha Ingreso',
    width: 16,
    fromQueue: true,
    section: 'Cola',
    description: 'Fecha de ingreso a la cola de pendientes'
  },

  // ═══════════════════════════════════════════════════════════════════════
  // IDENTIFICACIÓN DEL INSTRUMENTO
  // ═══════════════════════════════════════════════════════════════════════
  {
    key: 'idInstrumento',
    header: 'ID Instrumento',
    width: 18,
    section: 'Identificación',
    description: 'Identificador único interno del instrumento'
  },
  {
    key: 'nameInstrumento',
    header: 'Nombre Instrumento',
    width: 45,
    section: 'Identificación',
    description: 'Nombre oficial del instrumento'
  },

  // ═══════════════════════════════════════════════════════════════════════
  // CLASIFICACIÓN
  // ═══════════════════════════════════════════════════════════════════════
  {
    key: 'investmentTypeCode',
    header: 'Tipo Inversión',
    width: 18,
    catalog: 'investmentTypes',
    section: 'Clasificación',
    description: 'Código del tipo de inversión (EQ, FI, FX, etc.)'
  },
  {
    key: 'issueTypeCode',
    header: 'Tipo Emisión',
    width: 18,
    catalog: 'issueTypes',
    section: 'Clasificación',
    description: 'Código del tipo de emisión (GOVT, CORP, etc.)'
  },
  {
    key: 'issuerTypeCode',
    header: 'Tipo Emisor',
    width: 16,
    catalog: 'issuerTypes',
    section: 'Clasificación',
    description: 'Código del tipo de emisor (CORP, SOV, etc.)'
  },

  // ═══════════════════════════════════════════════════════════════════════
  // IDENTIFICADORES EXTERNOS
  // ═══════════════════════════════════════════════════════════════════════
  {
    key: 'publicDataSource',
    header: 'Fuente Datos Pública',
    width: 20,
    catalog: 'dataSources',
    section: 'Identificadores',
    description: 'Fuente pública de datos (BBG, RTR, etc.)'
  },
  {
    key: 'isin',
    header: 'ISIN',
    width: 15,
    section: 'Identificadores',
    description: 'International Securities Identification Number'
  },
  {
    key: 'tickerBBG',
    header: 'Ticker Bloomberg',
    width: 18,
    section: 'Identificadores',
    description: 'Código Bloomberg del instrumento'
  },
  {
    key: 'sedol',
    header: 'SEDOL',
    width: 12,
    section: 'Identificadores',
    description: 'Stock Exchange Daily Official List (UK)'
  },
  {
    key: 'cusip',
    header: 'CUSIP',
    width: 12,
    section: 'Identificadores',
    description: 'Committee on Uniform Securities Identification Procedures'
  },

  // ═══════════════════════════════════════════════════════════════════════
  // INFORMACIÓN DE LA COMPAÑÍA
  // ═══════════════════════════════════════════════════════════════════════
  {
    key: 'companyName',
    header: 'Nombre Compañía',
    width: 40,
    section: 'Compañía',
    description: 'Nombre de la compañía emisora'
  },
  {
    key: 'sectorGICS',
    header: 'Sector GICS',
    width: 20,
    catalog: 'sectoresGICS',
    section: 'Compañía',
    description: 'Código GICS (Global Industry Classification Standard)'
  },
  {
    key: 'sectorChileTypeCode',
    header: 'Sector Chile',
    width: 16,
    catalog: 'sectorChile',
    section: 'Compañía',
    description: 'Clasificación sectorial chilena (CMF)'
  },

  // ═══════════════════════════════════════════════════════════════════════
  // GEOGRAFÍA Y MONEDAS
  // ═══════════════════════════════════════════════════════════════════════
  {
    key: 'issueCountry',
    header: 'País Emisión',
    width: 14,
    catalog: 'paises',
    section: 'Geografía',
    description: 'País donde se emitió el instrumento'
  },
  {
    key: 'riskCountry',
    header: 'País Riesgo',
    width: 14,
    catalog: 'paises',
    section: 'Geografía',
    description: 'País de riesgo del instrumento'
  },
  {
    key: 'issueCurrency',
    header: 'Moneda Emisión',
    width: 16,
    catalog: 'monedas',
    section: 'Geografía',
    description: 'Código de la moneda de emisión'
  },
  {
    key: 'riskCurrency',
    header: 'Moneda Riesgo',
    width: 16,
    catalog: 'monedas',
    section: 'Geografía',
    description: 'Código de la moneda de riesgo'
  },
  {
    key: 'emisionNacional',
    header: 'Emisión Nacional',
    width: 18,
    validation: ['S', 'N'],
    section: 'Geografía',
    description: 'Indica si es emisión nacional (S/N)'
  },

  // ═══════════════════════════════════════════════════════════════════════
  // PARÁMETROS RENTA FIJA
  // ═══════════════════════════════════════════════════════════════════════
  {
    key: 'couponTypeCode',
    header: 'Tipo Cupón',
    width: 14,
    catalog: 'couponTypes',
    section: 'Renta Fija',
    description: 'Tipo de cupón (FIX, FLT, ZERO, etc.)'
  },
  {
    key: 'couponFrequency',
    header: 'Frecuencia Cupón',
    width: 18,
    catalog: 'couponFrequencies',
    section: 'Renta Fija',
    description: 'Frecuencia de pago del cupón'
  },
  {
    key: 'yieldType',
    header: 'Tipo Rendimiento',
    width: 18,
    catalog: 'yieldTypes',
    section: 'Renta Fija',
    description: 'Tipo de rendimiento (YTM, YTW, etc.)'
  },
  {
    key: 'yieldSource',
    header: 'Fuente Rendimiento',
    width: 20,
    catalog: 'yieldSources',
    section: 'Renta Fija',
    description: 'Fuente del dato de rendimiento'
  },
  {
    key: 'perpetuidad',
    header: 'Perpetuidad',
    width: 14,
    validation: ['S', 'N'],
    section: 'Renta Fija',
    description: 'Indica si es perpetuo (S/N)'
  },
  {
    key: 'rendimiento',
    header: 'Rendimiento',
    width: 14,
    validation: ['S', 'N'],
    section: 'Renta Fija',
    description: 'Indica si tiene rendimiento (S/N)'
  },
  {
    key: 'rankCode',
    header: 'Rank Code',
    width: 14,
    catalog: 'rankCodes',
    section: 'Renta Fija',
    description: 'Código de prioridad de la deuda'
  },

  // ═══════════════════════════════════════════════════════════════════════
  // CAMPOS BLOOMBERG
  // ═══════════════════════════════════════════════════════════════════════
  {
    key: 'coco',
    header: 'CoCo',
    width: 10,
    validation: ['Y', 'N'],
    section: 'Bloomberg',
    description: 'Contingent Convertible (Y/N)'
  },
  {
    key: 'callable',
    header: 'Callable',
    width: 12,
    validation: ['Y', 'N'],
    section: 'Bloomberg',
    description: 'Es callable (Y/N)'
  },
  {
    key: 'sinkable',
    header: 'Sinkable',
    width: 12,
    validation: ['Y', 'N'],
    section: 'Bloomberg',
    description: 'Es sinkable (Y/N)'
  },
  {
    key: 'yasYldFlag',
    header: 'YAS Yield Flag',
    width: 16,
    section: 'Bloomberg',
    description: 'Flag de rendimiento YAS Bloomberg'
  },

  // ═══════════════════════════════════════════════════════════════════════
  // OTROS CAMPOS
  // ═══════════════════════════════════════════════════════════════════════
  {
    key: 'cashTypeCode',
    header: 'Tipo Cash',
    width: 14,
    section: 'Otros',
    description: 'Código de tipo de efectivo'
  },
  {
    key: 'bankDebtTypeCode',
    header: 'Tipo Deuda Bancaria',
    width: 20,
    section: 'Otros',
    description: 'Código de tipo de deuda bancaria'
  },
  {
    key: 'fundTypeCode',
    header: 'Tipo Fondo',
    width: 14,
    section: 'Otros',
    description: 'Código de tipo de fondo'
  },
  {
    key: 'main',
    header: 'Main (Reestructuración)',
    width: 22,
    section: 'Otros',
    description: 'Indica instrumento principal en reestructuración'
  },
  {
    key: 'comentarios',
    header: 'Comentarios',
    width: 50,
    section: 'Otros',
    description: 'Comentarios adicionales'
  },
];

// Helper para obtener campos que vienen de la cola
export const getQueueFields = () =>
  INSTRUMENT_FIELDS.filter(f => f.fromQueue);

// Helper para obtener campos con catálogo
export const getCatalogFields = () =>
  INSTRUMENT_FIELDS.filter(f => f.catalog);

// Helper para obtener campos con validación simple
export const getValidationFields = () =>
  INSTRUMENT_FIELDS.filter(f => f.validation);

// Helper para agrupar campos por sección
export const getFieldsBySection = () => {
  const sections = {};
  INSTRUMENT_FIELDS.forEach(field => {
    const section = field.section || 'Otros';
    if (!sections[section]) {
      sections[section] = [];
    }
    sections[section].push(field);
  });
  return sections;
};
