/**
 * Módulo de exportación Excel para carga masiva de instrumentos
 * CON FORMATO CONDICIONAL DINÁMICO Y VALIDACIONES VINCULADAS A CATÁLOGOS
 * 
 * Sistema de colores:
 * - Naranja (FFF3E0): Campo obligatorio vacío
 * - Verde (E8F5E9): Campo completado correctamente
 * - Gris (F5F5F5): Campo no aplica para este tipo de instrumento
 * - Azul (E3F2FD): Campo opcional
 * - Sin color: Campo de la cola (pre-llenado)
 * 
 * Sistema de validaciones:
 * - Dropdowns vinculados a rangos nombrados en hoja "Datos_Catalogos"
 * - Rangos dinámicos que se actualizan automáticamente
 */

import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { INSTRUMENT_FIELDS, CATALOG_MAPPINGS } from './fieldDefinitions';
import { catalogosService } from '../../services/catalogosService';

// Cache para los catálogos cargados
let catalogosCache = null;

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURACIÓN DE COLORES DEL TEMA
// ═══════════════════════════════════════════════════════════════════════════

const THEME_COLORS = {
  // Colores principales
  primary: '0d9488',
  primaryDark: '0f766e',
  primaryLight: 'ccfbf1',
  
  // Header
  headerBg: '0d9488',
  headerText: 'FFFFFF',
  
  // Catálogos
  catalogHeaderBg: '115e59',
  catalogHeaderText: 'FFFFFF',
  catalogDataBg: '134e4a',
  
  // Secciones
  sectionBg: 'f0fdfa',
  borderColor: 'ccfbf1',
  alternateRow: 'f8fffe',
  
  // Estados de campos (formato condicional)
  required: {
    empty: 'FFF3E0',
    emptyBorder: 'FF9800',
  },
  completed: {
    bg: 'E8F5E9',
    border: '4CAF50',
  },
  notApplicable: {
    bg: 'F5F5F5',
    text: '9E9E9E',
  },
  optional: {
    bg: 'E3F2FD',
    border: '2196F3',
  },
  queue: {
    bg: 'ECEFF1',
    text: '607D8B',
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// DEFINICIÓN DE CATÁLOGOS CON RANGOS NOMBRADOS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Configuración de catálogos para rangos nombrados
 * Cada catálogo tendrá su propia columna en la hoja de datos
 */
const CATALOG_CONFIG = {
  investmentTypes: {
    rangeName: 'Lista_TipoInversion',
    displayName: 'Tipo Inversión',
    column: 1,
  },
  paises: {
    rangeName: 'Lista_Paises',
    displayName: 'Países',
    column: 2,
  },
  monedas: {
    rangeName: 'Lista_Monedas',
    displayName: 'Monedas',
    column: 3,
  },
  dataSources: {
    rangeName: 'Lista_FuentesDatos',
    displayName: 'Fuentes de Datos',
    column: 4,
  },
  issuerTypes: {
    rangeName: 'Lista_TipoEmisor',
    displayName: 'Tipo Emisor',
    column: 5,
  },
  issueTypes: {
    rangeName: 'Lista_TipoEmision',
    displayName: 'Tipo Emisión',
    column: 6,
  },
  couponTypes: {
    rangeName: 'Lista_TipoCupon',
    displayName: 'Tipo Cupón',
    column: 7,
  },
  couponFrequencies: {
    rangeName: 'Lista_FrecuenciaCupon',
    displayName: 'Frecuencia Cupón',
    column: 8,
  },
  yieldTypes: {
    rangeName: 'Lista_TipoRendimiento',
    displayName: 'Tipo Rendimiento',
    column: 9,
  },
  yieldSources: {
    rangeName: 'Lista_FuenteRendimiento',
    displayName: 'Fuente Rendimiento',
    column: 10,
  },
  rankCodes: {
    rangeName: 'Lista_RankCode',
    displayName: 'Rank Code',
    column: 11,
  },
  sectorChile: {
    rangeName: 'Lista_SectorChile',
    displayName: 'Sector Chile',
    column: 12,
  },
  sectoresGICS: {
    rangeName: 'Lista_SectorGICS',
    displayName: 'Sector GICS',
    column: 13,
  },
  fuentes: {
    rangeName: 'Lista_Fuentes',
    displayName: 'Fuentes',
    column: 14,
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// DEFINICIÓN DE REGLAS DE CAMPOS
// ═══════════════════════════════════════════════════════════════════════════

const getColumnIndices = () => {
  const indices = {};
  INSTRUMENT_FIELDS.forEach((field, idx) => {
    indices[field.key] = idx + 1;
  });
  return indices;
};

const getColumnLetter = (colNumber) => {
  let letter = '';
  let num = colNumber;
  while (num > 0) {
    const remainder = (num - 1) % 26;
    letter = String.fromCharCode(65 + remainder) + letter;
    num = Math.floor((num - 1) / 26);
  }
  return letter;
};

const FIELD_RULES = {
  // Campos de la cola
  nombreFuente: { type: 'queue' },
  fuente: { type: 'queue' },
  moneda: { type: 'queue' },
  fechaIngreso: { type: 'queue' },

  // Campos siempre obligatorios
  idInstrumento: { type: 'always_required' },
  nameInstrumento: { type: 'always_required' },
  investmentTypeCode: { type: 'always_required' },
  publicDataSource: { type: 'always_required' },
  companyName: { type: 'always_required' },
  issuerTypeCode: { type: 'always_required' },
  issueCountry: { type: 'always_required' },
  riskCountry: { type: 'always_required' },
  issueCurrency: { type: 'always_required' },
  riskCurrency: { type: 'always_required' },

  // Campos condicionales EQ
  sectorGICS: {
    type: 'conditional_required',
    requiredCondition: { investmentTypeCode: 'EQ' },
    optionalCondition: { investmentTypeCode: ['FI', 'FX', 'CO', 'CA', 'DE'] },
  },
  sectorChileTypeCode: {
    type: 'conditional_required',
    requiredCondition: { investmentTypeCode: 'EQ', riskCountry: 'CL' },
    notApplicableCondition: { investmentTypeCode: ['FI', 'FX', 'CO', 'CA', 'DE'] },
    optionalCondition: { investmentTypeCode: 'EQ', riskCountry: '!CL' },
  },

  // Campos condicionales FI
  issueTypeCode: {
    type: 'conditional_required',
    requiredCondition: { investmentTypeCode: 'FI' },
    optionalCondition: { investmentTypeCode: ['EQ', 'FX', 'CO', 'CA', 'DE'] },
  },
  couponTypeCode: {
    type: 'conditional_required',
    requiredCondition: { investmentTypeCode: 'FI' },
    notApplicableCondition: { investmentTypeCode: ['EQ', 'FX', 'CO', 'CA', 'DE'] },
  },
  couponFrequency: {
    type: 'conditional_required',
    requiredCondition: { investmentTypeCode: 'FI' },
    notApplicableCondition: { investmentTypeCode: ['EQ', 'FX', 'CO', 'CA', 'DE'] },
  },
  yieldType: {
    type: 'conditional_required',
    requiredCondition: { investmentTypeCode: 'FI' },
    notApplicableCondition: { investmentTypeCode: ['EQ', 'FX', 'CO', 'CA', 'DE'] },
  },
  yieldSource: {
    type: 'conditional_required',
    requiredCondition: { investmentTypeCode: 'FI' },
    notApplicableCondition: { investmentTypeCode: ['EQ', 'FX', 'CO', 'CA', 'DE'] },
  },
  perpetuidad: {
    type: 'conditional_required',
    requiredCondition: { investmentTypeCode: 'FI' },
    notApplicableCondition: { investmentTypeCode: ['EQ', 'FX', 'CO', 'CA', 'DE'] },
  },
  rendimiento: {
    type: 'conditional_required',
    requiredCondition: { investmentTypeCode: 'FI' },
    notApplicableCondition: { investmentTypeCode: ['EQ', 'FX', 'CO', 'CA', 'DE'] },
  },
  rankCode: {
    type: 'optional',
    notApplicableCondition: { investmentTypeCode: ['EQ', 'FX', 'CO', 'CA', 'DE'] },
  },

  // Identificadores
  isin: {
    type: 'conditional_required',
    requiredCondition: { investmentTypeCode: 'FI', publicDataSource: 'BBG' },
    optionalCondition: true,
  },
  tickerBBG: {
    type: 'conditional_required',
    requiredCondition: { investmentTypeCode: 'EQ', publicDataSource: 'BBG' },
    optionalCondition: true,
  },
  sedol: { type: 'optional' },
  cusip: { type: 'optional' },

  // Campos Bloomberg
  coco: {
    type: 'conditional_required',
    requiredCondition: { investmentTypeCode: 'FI', yieldSource: 'BBG' },
    notApplicableCondition: { investmentTypeCode: ['EQ', 'FX', 'CO', 'CA', 'DE'] },
    optionalCondition: { investmentTypeCode: 'FI', yieldSource: '!BBG' },
  },
  callable: {
    type: 'conditional_required',
    requiredCondition: { investmentTypeCode: 'FI', yieldSource: 'BBG' },
    notApplicableCondition: { investmentTypeCode: ['EQ', 'FX', 'CO', 'CA', 'DE'] },
    optionalCondition: { investmentTypeCode: 'FI', yieldSource: '!BBG' },
  },
  sinkable: {
    type: 'conditional_required',
    requiredCondition: { investmentTypeCode: 'FI', yieldSource: 'BBG' },
    notApplicableCondition: { investmentTypeCode: ['EQ', 'FX', 'CO', 'CA', 'DE'] },
    optionalCondition: { investmentTypeCode: 'FI', yieldSource: '!BBG' },
  },
  yasYldFlag: {
    type: 'optional',
    notApplicableCondition: { investmentTypeCode: ['EQ', 'FX', 'CO', 'CA', 'DE'] },
  },

  // Opcionales generales
  emisionNacional: { type: 'optional' },
  cashTypeCode: { type: 'optional' },
  bankDebtTypeCode: { type: 'optional' },
  fundTypeCode: { type: 'optional' },
  main: { type: 'optional' },
  comentarios: { type: 'optional' },
};

// ═══════════════════════════════════════════════════════════════════════════
// FUNCIONES DE CATÁLOGOS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Carga todos los catálogos desde la API
 */
const loadCatalogos = async () => {
  if (catalogosCache) return catalogosCache;

  const [
    investmentTypes,
    paises,
    monedas,
    dataSources,
    issuerTypes,
    issueTypes,
    couponTypes,
    couponFrequencies,
    yieldTypes,
    yieldSources,
    rankCodes,
    sectorChile,
    sectoresGICS,
    fuentes,
  ] = await Promise.all([
    catalogosService.getInvestmentTypes(),
    catalogosService.getPaises(),
    catalogosService.getMonedas(),
    catalogosService.getDataSources(),
    catalogosService.getIssuerTypes(),
    catalogosService.getIssueTypes(),
    catalogosService.getCouponTypes(),
    catalogosService.getCouponFrequencies(),
    catalogosService.getYieldTypes(),
    catalogosService.getYieldSources(),
    catalogosService.getRankCodes(),
    catalogosService.getSectorChile(),
    catalogosService.getSectoresGICS(),
    catalogosService.getFuentes(),
  ]);

  catalogosCache = {
    investmentTypes,
    paises,
    monedas,
    dataSources,
    issuerTypes,
    issueTypes,
    couponTypes,
    couponFrequencies,
    yieldTypes,
    yieldSources,
    rankCodes,
    sectorChile,
    sectoresGICS,
    fuentes,
  };

  return catalogosCache;
};

/**
 * Obtiene los valores de un catálogo
 */
const getCatalogValues = (catalogName, catalogos) => {
  const mapping = CATALOG_MAPPINGS[catalogName];
  if (!mapping) return [];

  const catalogData = catalogos[mapping.arrayName];
  if (!catalogData || !Array.isArray(catalogData)) return [];

  return catalogData
    .filter(item => item.activo !== false)
    .map(item => item[mapping.codeField]);
};

/**
 * Obtiene los datos completos de un catálogo (código + nombre)
 */
const getCatalogDataWithNames = (catalogName, catalogos) => {
  const mapping = CATALOG_MAPPINGS[catalogName];
  if (!mapping) return [];

  const catalogData = catalogos[mapping.arrayName];
  if (!catalogData || !Array.isArray(catalogData)) return [];

  return catalogData
    .filter(item => item.activo !== false)
    .map(item => ({
      codigo: item[mapping.codeField],
      nombre: item[mapping.nameField] || item[mapping.codeField],
      descripcion: item.descripcion || '',
    }));
};

// ═══════════════════════════════════════════════════════════════════════════
// FORMATO CONDICIONAL
// ═══════════════════════════════════════════════════════════════════════════

const buildConditionFormula = (condition, row, colIndices) => {
  if (condition === true) return 'TRUE';
  if (!condition || typeof condition !== 'object') return 'FALSE';

  const parts = [];

  Object.entries(condition).forEach(([field, value]) => {
    const colIdx = colIndices[field];
    if (!colIdx) return;

    const colLetter = getColumnLetter(colIdx);
    const cellRef = `${colLetter}${row}`;

    if (Array.isArray(value)) {
      const orParts = value.map(v => `${cellRef}="${v}"`);
      parts.push(`OR(${orParts.join(',')})`);
    } else if (typeof value === 'string' && value.startsWith('!')) {
      const actualValue = value.substring(1);
      parts.push(`${cellRef}<>"${actualValue}"`);
    } else {
      parts.push(`${cellRef}="${value}"`);
    }
  });

  if (parts.length === 0) return 'FALSE';
  if (parts.length === 1) return parts[0];

  return `AND(${parts.join(',')})`;
};

const applyConditionalFormatting = (worksheet, fieldKey, colIndex, maxRow, colIndices) => {
  const rule = FIELD_RULES[fieldKey];
  if (!rule) return;

  const colLetter = getColumnLetter(colIndex);
  const range = `${colLetter}2:${colLetter}${maxRow}`;
  const currentCell = `${colLetter}2`;

  switch (rule.type) {
    case 'queue':
      worksheet.addConditionalFormatting({
        ref: range,
        rules: [{
          type: 'expression',
          formulae: ['TRUE'],
          style: {
            fill: {
              type: 'pattern',
              pattern: 'solid',
              bgColor: { argb: THEME_COLORS.queue.bg },
            },
            font: {
              color: { argb: THEME_COLORS.queue.text },
              italic: true,
            },
          },
          priority: 100,
        }],
      });
      break;

    case 'always_required':
      worksheet.addConditionalFormatting({
        ref: range,
        rules: [
          {
            type: 'expression',
            formulae: [`${currentCell}=""`],
            style: {
              fill: {
                type: 'pattern',
                pattern: 'solid',
                bgColor: { argb: THEME_COLORS.required.empty },
              },
            },
            priority: 1,
          },
          {
            type: 'expression',
            formulae: [`${currentCell}<>""`],
            style: {
              fill: {
                type: 'pattern',
                pattern: 'solid',
                bgColor: { argb: THEME_COLORS.completed.bg },
              },
            },
            priority: 2,
          },
        ],
      });
      break;

    case 'conditional_required':
      const rules = [];

      if (rule.notApplicableCondition) {
        const notApplicableFormula = buildConditionFormula(rule.notApplicableCondition, 2, colIndices);
        rules.push({
          type: 'expression',
          formulae: [notApplicableFormula],
          style: {
            fill: {
              type: 'pattern',
              pattern: 'solid',
              bgColor: { argb: THEME_COLORS.notApplicable.bg },
            },
            font: {
              color: { argb: THEME_COLORS.notApplicable.text },
            },
          },
          priority: 1,
        });
      }

      if (rule.requiredCondition) {
        const requiredFormula = buildConditionFormula(rule.requiredCondition, 2, colIndices);
        rules.push({
          type: 'expression',
          formulae: [`AND(${requiredFormula},${currentCell}="")`],
          style: {
            fill: {
              type: 'pattern',
              pattern: 'solid',
              bgColor: { argb: THEME_COLORS.required.empty },
            },
          },
          priority: 2,
        });

        rules.push({
          type: 'expression',
          formulae: [`AND(${requiredFormula},${currentCell}<>"")`],
          style: {
            fill: {
              type: 'pattern',
              pattern: 'solid',
              bgColor: { argb: THEME_COLORS.completed.bg },
            },
          },
          priority: 3,
        });
      }

      if (rule.optionalCondition) {
        const optionalFormula = buildConditionFormula(rule.optionalCondition, 2, colIndices);
        rules.push({
          type: 'expression',
          formulae: [`AND(${optionalFormula},${currentCell}="")`],
          style: {
            fill: {
              type: 'pattern',
              pattern: 'solid',
              bgColor: { argb: THEME_COLORS.optional.bg },
            },
          },
          priority: 4,
        });
      }

      rules.push({
        type: 'expression',
        formulae: [`${currentCell}<>""`],
        style: {
          fill: {
            type: 'pattern',
            pattern: 'solid',
            bgColor: { argb: THEME_COLORS.completed.bg },
          },
        },
        priority: 5,
      });

      if (rules.length > 0) {
        worksheet.addConditionalFormatting({ ref: range, rules });
      }
      break;

    case 'optional':
      const optRules = [];

      if (rule.notApplicableCondition) {
        const notApplicableFormula = buildConditionFormula(rule.notApplicableCondition, 2, colIndices);
        optRules.push({
          type: 'expression',
          formulae: [notApplicableFormula],
          style: {
            fill: {
              type: 'pattern',
              pattern: 'solid',
              bgColor: { argb: THEME_COLORS.notApplicable.bg },
            },
            font: {
              color: { argb: THEME_COLORS.notApplicable.text },
            },
          },
          priority: 1,
        });
      }

      optRules.push({
        type: 'expression',
        formulae: [`${currentCell}=""`],
        style: {
          fill: {
            type: 'pattern',
            pattern: 'solid',
            bgColor: { argb: THEME_COLORS.optional.bg },
          },
        },
        priority: 2,
      });

      optRules.push({
        type: 'expression',
        formulae: [`${currentCell}<>""`],
        style: {
          fill: {
            type: 'pattern',
            pattern: 'solid',
            bgColor: { argb: THEME_COLORS.completed.bg },
          },
        },
        priority: 3,
      });

      worksheet.addConditionalFormatting({ ref: range, rules: optRules });
      break;
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// CREACIÓN DE HOJA DE DATOS DE CATÁLOGOS (para rangos nombrados)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Crea una hoja con los datos de catálogos para usar en validaciones
 * Esta hoja puede estar oculta o visible para referencia
 */
const createCatalogDataSheet = (workbook, catalogos) => {
  const worksheet = workbook.addWorksheet('Datos_Catalogos', {
    properties: { tabColor: { argb: THEME_COLORS.catalogDataBg } },
    state: 'veryHidden', // Oculta la hoja pero mantiene los datos accesibles
  });

  // Encontrar el catálogo más largo para dimensionar
  let maxRows = 0;
  const catalogData = {};

  Object.entries(CATALOG_CONFIG).forEach(([key]) => {
    const values = getCatalogValues(key, catalogos);
    catalogData[key] = values;
    if (values.length > maxRows) {
      maxRows = values.length;
    }
  });

  // Configurar columnas con headers
  const columns = Object.entries(CATALOG_CONFIG).map(([key, config]) => ({
    header: config.displayName,
    key: key,
    width: 20,
  }));

  worksheet.columns = columns;

  // Estilo del header
  const headerRow = worksheet.getRow(1);
  headerRow.height = 24;
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: THEME_COLORS.catalogHeaderBg },
    };
    cell.font = {
      bold: true,
      color: { argb: 'FFFFFF' },
      size: 10,
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  // Llenar datos de cada catálogo
  for (let i = 0; i < maxRows; i++) {
    const rowData = {};
    Object.entries(CATALOG_CONFIG).forEach(([key]) => {
      const values = catalogData[key];
      rowData[key] = values[i] || '';
    });
    worksheet.addRow(rowData);
  }

  // Crear rangos nombrados para cada catálogo
  Object.entries(CATALOG_CONFIG).forEach(([key, config]) => {
    const values = catalogData[key];
    if (values.length > 0) {
      const colLetter = getColumnLetter(config.column);
      const rangeRef = `Datos_Catalogos!$${colLetter}$2:$${colLetter}$${values.length + 1}`;
      
      // Agregar el rango nombrado al workbook
      workbook.definedNames.add(rangeRef, config.rangeName);
    }
  });

  return worksheet;
};

// ═══════════════════════════════════════════════════════════════════════════
// CREACIÓN DE HOJA PRINCIPAL DE PLANTILLA
// ═══════════════════════════════════════════════════════════════════════════

const createTemplateSheet = (workbook, queueItems, catalogos) => {
  const worksheet = workbook.addWorksheet('Plantilla_Carga', {
    properties: { tabColor: { argb: THEME_COLORS.primary } }
  });

  const colIndices = getColumnIndices();

  // Configurar columnas
  worksheet.columns = INSTRUMENT_FIELDS.map(field => ({
    header: field.header,
    key: field.key,
    width: field.width || 15,
  }));

  // Estilo del header con indicador de obligatoriedad
  const headerRow = worksheet.getRow(1);
  headerRow.height = 36;
  headerRow.eachCell((cell, colNumber) => {
    const field = INSTRUMENT_FIELDS[colNumber - 1];
    const rule = FIELD_RULES[field?.key];

    let headerColor = THEME_COLORS.headerBg;
    let headerIcon = '';

    if (rule?.type === 'queue') {
      headerColor = '607D8B';
      headerIcon = '📋 ';
    } else if (rule?.type === 'always_required') {
      headerColor = 'E65100';
      headerIcon = '⚠️ ';
    } else if (rule?.type === 'conditional_required') {
      headerColor = '1565C0';
      headerIcon = '🔄 ';
    }

    cell.value = headerIcon + (cell.value || '');

    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: headerColor },
    };
    cell.font = {
      bold: true,
      color: { argb: THEME_COLORS.headerText },
      size: 9,
    };
    cell.alignment = {
      vertical: 'middle',
      horizontal: 'center',
      wrapText: true,
    };
    cell.border = {
      bottom: { style: 'medium', color: { argb: THEME_COLORS.primaryDark } },
    };
  });

  // Congelar primera fila
  worksheet.views = [{ state: 'frozen', ySplit: 1 }];

  // Agregar filas de datos de la cola
  queueItems.forEach((item) => {
    const rowData = {};
    INSTRUMENT_FIELDS.forEach(field => {
      if (field.fromQueue && item[field.key] !== undefined) {
        rowData[field.key] = item[field.key];
      } else {
        rowData[field.key] = '';
      }
    });
    worksheet.addRow(rowData);
  });

  const maxRow = Math.max(queueItems.length + 100, 500);

  // ═══════════════════════════════════════════════════════════════════════
  // APLICAR VALIDACIONES VINCULADAS A RANGOS NOMBRADOS
  // ═══════════════════════════════════════════════════════════════════════
  
  INSTRUMENT_FIELDS.forEach((field, index) => {
    const colLetter = getColumnLetter(index + 1);
    const colRange = `${colLetter}2:${colLetter}${maxRow}`;

    if (field.catalog) {
      // Buscar el rango nombrado correspondiente
      const catalogConfig = CATALOG_CONFIG[field.catalog];
      
      if (catalogConfig) {
        // Usar rango nombrado para la validación
        worksheet.dataValidations.add(colRange, {
          type: 'list',
          allowBlank: true,
          formulae: [catalogConfig.rangeName], // Referencia al rango nombrado
          showErrorMessage: true,
          errorStyle: 'warning',
          errorTitle: 'Valor no válido',
          error: `Por favor seleccione un valor de la lista "${catalogConfig.displayName}"`,
          showInputMessage: true,
          promptTitle: field.header,
          prompt: `Seleccione de: ${catalogConfig.displayName}`,
        });
      } else {
        // Fallback: usar valores directos si no hay rango configurado
        const values = getCatalogValues(field.catalog, catalogos);
        if (values.length > 0 && values.length <= 50) {
          worksheet.dataValidations.add(colRange, {
            type: 'list',
            allowBlank: true,
            formulae: [`"${values.join(',')}"`],
            showErrorMessage: true,
            errorTitle: 'Valor inválido',
            error: `Seleccione un valor válido`,
          });
        }
      }
    } else if (field.validation) {
      // Validaciones simples (S/N, Y/N, etc.)
      worksheet.dataValidations.add(colRange, {
        type: 'list',
        allowBlank: true,
        formulae: [`"${field.validation.join(',')}"`],
        showErrorMessage: true,
        errorStyle: 'stop',
        errorTitle: 'Valor no permitido',
        error: `Valores permitidos: ${field.validation.join(', ')}`,
        showInputMessage: true,
        promptTitle: field.header,
        prompt: `Opciones: ${field.validation.join(' / ')}`,
      });
    }
  });

  // Aplicar formato condicional
  INSTRUMENT_FIELDS.forEach((field, index) => {
    applyConditionalFormatting(worksheet, field.key, index + 1, maxRow, colIndices);
  });

  // Auto-filtro
  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: INSTRUMENT_FIELDS.length },
  };

  return worksheet;
};

// ═══════════════════════════════════════════════════════════════════════════
// HOJA DE LEYENDA
// ═══════════════════════════════════════════════════════════════════════════

const createLegendSheet = (workbook) => {
  const worksheet = workbook.addWorksheet('Leyenda', {
    properties: { tabColor: { argb: 'FFC107' } }
  });

  worksheet.columns = [
    { header: 'Símbolo', key: 'symbol', width: 12 },
    { header: 'Color', key: 'color', width: 18 },
    { header: 'Significado', key: 'meaning', width: 25 },
    { header: 'Descripción', key: 'description', width: 55 },
  ];

  const headerRow = worksheet.getRow(1);
  headerRow.height = 28;
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: THEME_COLORS.primary },
    };
    cell.font = { bold: true, color: { argb: 'FFFFFF' }, size: 11 };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  // Leyenda de colores
  const legendData = [
    {
      symbol: '⚠️',
      color: 'Naranja Header',
      colorCode: 'E65100',
      meaning: 'SIEMPRE OBLIGATORIO',
      description: 'Este campo debe completarse en todos los casos.',
    },
    {
      symbol: '🔄',
      color: 'Azul Header',
      colorCode: '1565C0',
      meaning: 'CONDICIONAL',
      description: 'Obligatorio u opcional según el tipo de instrumento.',
    },
    {
      symbol: '📋',
      color: 'Gris Header',
      colorCode: '607D8B',
      meaning: 'DATO DE COLA',
      description: 'Pre-llenado automáticamente. No modificar.',
    },
    {
      symbol: '',
      color: '',
      colorCode: '',
      meaning: '',
      description: '',
    },
    {
      symbol: '🟠',
      color: 'Naranja Celda',
      colorCode: THEME_COLORS.required.empty,
      meaning: 'Pendiente',
      description: 'Campo obligatorio que aún no ha sido completado.',
    },
    {
      symbol: '🟢',
      color: 'Verde Celda',
      colorCode: THEME_COLORS.completed.bg,
      meaning: 'Completado',
      description: 'Campo llenado correctamente.',
    },
    {
      symbol: '🔵',
      color: 'Azul Celda',
      colorCode: THEME_COLORS.optional.bg,
      meaning: 'Opcional',
      description: 'Campo opcional, puede dejarse vacío.',
    },
    {
      symbol: '⬜',
      color: 'Gris Celda',
      colorCode: THEME_COLORS.notApplicable.bg,
      meaning: 'No Aplica',
      description: 'Campo no aplicable para este tipo de instrumento.',
    },
  ];

  legendData.forEach((item, index) => {
    const row = worksheet.addRow({
      symbol: item.symbol,
      color: item.color,
      meaning: item.meaning,
      description: item.description,
    });

    row.height = item.color ? 28 : 14;

    if (item.colorCode) {
      row.getCell(2).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: item.colorCode },
      };
    }

    row.eachCell((cell) => {
      cell.alignment = { vertical: 'middle', wrapText: true };
      if (item.color) {
        cell.border = {
          bottom: { style: 'thin', color: { argb: 'E0E0E0' } },
        };
      }
    });
  });

  // Agregar reglas condicionales
  worksheet.addRow([]);
  worksheet.addRow([]);

  const rulesTitle = worksheet.addRow(['', 'REGLAS CONDICIONALES POR TIPO DE INVERSIÓN']);
  rulesTitle.getCell(2).font = { bold: true, size: 13, color: { argb: THEME_COLORS.primaryDark } };
  worksheet.mergeCells(rulesTitle.number, 2, rulesTitle.number, 4);

  worksheet.addRow([]);

  const condRules = [
    ['', 'EQ (Equity)', 'sectorGICS obligatorio', 'tickerBBG obligatorio si Fuente=BBG'],
    ['', 'EQ + País=CL', 'sectorChileTypeCode obligatorio', ''],
    ['', 'FI (Fixed Income)', 'Parámetros FI obligatorios', 'ISIN obligatorio si Fuente=BBG'],
    ['', 'FI + yieldSource=BBG', 'coco, callable, sinkable obligatorios', ''],
  ];

  condRules.forEach(rule => {
    const row = worksheet.addRow(rule);
    row.getCell(2).font = { bold: true };
    row.eachCell((cell) => {
      cell.alignment = { vertical: 'middle' };
    });
  });

  return worksheet;
};

// ═══════════════════════════════════════════════════════════════════════════
// HOJA DE CATÁLOGOS DE REFERENCIA (visible para el usuario)
// ═══════════════════════════════════════════════════════════════════════════

const createCatalogsReferenceSheet = (workbook, catalogos) => {
  const worksheet = workbook.addWorksheet('Catálogos_Referencia', {
    properties: { tabColor: { argb: THEME_COLORS.catalogHeaderBg } }
  });

  worksheet.columns = [
    { header: 'Catálogo', key: 'catalogo', width: 25 },
    { header: 'Código', key: 'codigo', width: 18 },
    { header: 'Nombre', key: 'nombre', width: 45 },
    { header: 'Descripción', key: 'descripcion', width: 50 },
  ];

  const headerRow = worksheet.getRow(1);
  headerRow.height = 26;
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: THEME_COLORS.catalogHeaderBg },
    };
    cell.font = { bold: true, color: { argb: 'FFFFFF' }, size: 11 };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  worksheet.views = [{ state: 'frozen', ySplit: 1 }];

  const catalogsToShow = [
    { key: 'investmentTypes', name: '📊 TIPOS DE INVERSIÓN' },
    { key: 'issuerTypes', name: '🏢 TIPOS DE EMISOR' },
    { key: 'issueTypes', name: '📄 TIPOS DE EMISIÓN' },
    { key: 'dataSources', name: '🔗 FUENTES DE DATOS' },
    { key: 'paises', name: '🌍 PAÍSES' },
    { key: 'monedas', name: '💱 MONEDAS' },
    { key: 'couponTypes', name: '💰 TIPOS DE CUPÓN' },
    { key: 'couponFrequencies', name: '📅 FRECUENCIAS DE CUPÓN' },
    { key: 'yieldTypes', name: '📈 TIPOS DE RENDIMIENTO' },
    { key: 'yieldSources', name: '📡 FUENTES DE RENDIMIENTO' },
    { key: 'rankCodes', name: '🏆 CÓDIGOS DE RANKING' },
    { key: 'sectorChile', name: '🇨🇱 SECTORES CHILE' },
    { key: 'sectoresGICS', name: '🏭 SECTORES GICS' },
  ];

  let currentRow = 2;

  catalogsToShow.forEach((catalog, catIndex) => {
    const data = getCatalogDataWithNames(catalog.key, catalogos);
    if (data.length === 0) return;

    if (catIndex > 0) {
      currentRow++;
    }

    // Título del catálogo
    const titleRow = worksheet.getRow(currentRow);
    titleRow.getCell(1).value = catalog.name;
    titleRow.getCell(1).font = {
      bold: true,
      size: 11,
      color: { argb: THEME_COLORS.primaryDark },
    };
    titleRow.getCell(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: THEME_COLORS.sectionBg },
    };
    titleRow.height = 26;
    worksheet.mergeCells(currentRow, 1, currentRow, 4);
    currentRow++;

    // Datos
    data.forEach((item, itemIndex) => {
      const dataRow = worksheet.getRow(currentRow);
      dataRow.getCell(1).value = '';
      dataRow.getCell(2).value = item.codigo;
      dataRow.getCell(3).value = item.nombre;
      dataRow.getCell(4).value = item.descripcion;

      // Código en negrita
      dataRow.getCell(2).font = { bold: true, color: { argb: THEME_COLORS.primary } };

      if (itemIndex % 2 === 1) {
        dataRow.eachCell((cell) => {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: THEME_COLORS.alternateRow },
          };
        });
      }

      dataRow.eachCell((cell) => {
        cell.alignment = { vertical: 'middle' };
      });

      currentRow++;
    });
  });

  return worksheet;
};

// ═══════════════════════════════════════════════════════════════════════════
// FUNCIONES DE EXPORTACIÓN
// ═══════════════════════════════════════════════════════════════════════════

export const generateBulkLoadTemplate = async (queueItems = []) => {
  // Cargar catálogos desde la API
  const catalogos = await loadCatalogos();

  const workbook = new ExcelJS.Workbook();

  workbook.creator = 'Sistema de Homologación';
  workbook.created = new Date();
  workbook.modified = new Date();

  workbook.properties = {
    title: 'Plantilla Carga Masiva de Instrumentos',
    subject: 'Homologación de Instrumentos Financieros',
    company: 'Patria Investimentos',
    description: 'Plantilla con formato condicional y validaciones vinculadas a catálogos',
  };

  // IMPORTANTE: Crear primero la hoja de datos de catálogos
  // para que los rangos nombrados estén disponibles
  createCatalogDataSheet(workbook, catalogos);

  // Luego crear las demás hojas
  createTemplateSheet(workbook, queueItems, catalogos);
  createLegendSheet(workbook);
  createCatalogsReferenceSheet(workbook, catalogos);

  return workbook;
};

export const downloadExcel = async (workbook, filename = 'plantilla_carga_masiva') => {
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });

  const date = new Date().toISOString().slice(0, 10);
  const time = new Date().toTimeString().slice(0, 5).replace(':', '');
  const finalFilename = `${filename}_${date}_${time}.xlsx`;

  saveAs(blob, finalFilename);
};

export const downloadBulkLoadTemplate = async (queueItems = []) => {
  try {
    const workbook = await generateBulkLoadTemplate(queueItems);
    await downloadExcel(workbook, 'plantilla_homologacion');
    return { success: true };
  } catch (error) {
    console.error('Error al generar plantilla Excel:', error);
    return { success: false, error: error.message };
  }
};
