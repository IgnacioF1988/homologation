/**
 * Servicio para gestión de catálogos
 * Proporciona acceso a los 19 catálogos del sistema
 */

import { apiClient } from './apiClient';

// Cache en memoria para catálogos (raramente cambian)
const catalogCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

/**
 * Obtiene un catálogo completo
 */
async function getCatalogo(nombre) {
  // Verificar cache
  const cached = catalogCache.get(nombre);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.response; // Devolver respuesta completa cacheada
  }

  const response = await apiClient.get(`/catalogos/${nombre}`);

  // Guardar en cache (toda la respuesta)
  catalogCache.set(nombre, {
    response: response,
    timestamp: Date.now(),
  });

  return response; // Devolver objeto completo { success, data, count }
}

/**
 * Obtiene un item de un catálogo por ID
 */
async function getCatalogoById(nombre, id) {
  // Primero intentar desde cache
  const cached = catalogCache.get(nombre);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    const item = cached.response.data.find(item => item.id === id || item.id === String(id));
    if (item) return { success: true, data: item };
  }

  const response = await apiClient.get(`/catalogos/${nombre}/${id}`);
  return response; // Devolver objeto completo
}

/**
 * Configuración de campos para cada catálogo
 * valueField: campo a usar como value en el dropdown
 * labelField: campo a mostrar como label en el dropdown
 */
const catalogFieldConfig = {
  paises: { valueField: 'code', labelField: 'ShortName', fallbackLabel: 'Description' },
  monedas: { valueField: 'id', labelField: 'descripcion' }, // DB expects INT for issueCurrency/riskCurrency
  sectoresGICS: { valueField: 'code', labelField: 'nombre'},
  dataSources: { valueField: 'nombre', labelField: 'nombre' }, // BBG, MANUAL, etc.
  investmentTypes: { valueField: 'id', labelField: 'nombre' }, // DB expects INT
  yieldTypes: { valueField: 'code', labelField: 'nombre' }, // YTM, YTC, etc.
  yieldSources: { valueField: 'nombre', labelField: 'nombre' }, // BBG, MANUAL, etc.
  // Resto usa configuración por defecto (id, nombre)
};

/**
 * Obtiene opciones formateadas para dropdowns
 * Formato: [{ value: id, label: nombre }]
 */
async function getCatalogoOptions(nombre) {
  const response = await getCatalogo(nombre);
  const data = response.data; // Extraer el array de datos

  // Obtener configuración específica o usar defaults
  const fieldConfig = catalogFieldConfig[nombre] || {};
  const valueField = fieldConfig.valueField || 'id';
  const labelField = fieldConfig.labelField || 'nombre';
  const fallbackLabel = fieldConfig.fallbackLabel;

  // Función helper para obtener label con fallback
  const getLabel = (item) => {
    // Primero intentar el campo principal
    if (item[labelField]) return item[labelField];
    // Si hay fallback configurado, usarlo
    if (fallbackLabel && item[fallbackLabel]) return item[fallbackLabel];
    // Fallbacks genéricos
    return item.nombre || item.name || item.descripcion || String(item[valueField] ?? item.id);
  };

  // Caso especial: sectoresGICS necesita valores únicos
  if (fieldConfig.unique) {
    const uniqueByLabel = new Map();
    data.forEach(item => {
      const label = getLabel(item);
      if (!uniqueByLabel.has(label)) {
        uniqueByLabel.set(label, item);
      }
    });
    return {
      success: true,
      data: Array.from(uniqueByLabel.values()).map(item => ({
        value: item[valueField],
        label: getLabel(item),
      })),
    };
  }

  return {
    success: true,
    data: data.map(item => ({
      value: item[valueField] ?? item.id,
      label: getLabel(item),
    })),
  };
}

/**
 * Limpia el cache de catálogos
 */
function clearCache(nombre = null) {
  if (nombre) {
    catalogCache.delete(nombre);
  } else {
    catalogCache.clear();
  }
}

// Exportaciones específicas por catálogo para compatibilidad con código existente
export const catalogosService = {
  // Métodos genéricos
  getCatalogo,
  getCatalogoById,
  getCatalogoOptions,
  clearCache,

  // Paises
  getPaises: () => getCatalogo('paises'),
  getPaisById: (id) => getCatalogoById('paises', id),
  getPaisesOptions: () => getCatalogoOptions('paises'),

  // Monedas
  getMonedas: () => getCatalogo('monedas'),
  getMonedaById: (id) => getCatalogoById('monedas', id),
  getMonedasOptions: () => getCatalogoOptions('monedas'),

  // Sectores GICS
  getSectoresGICS: () => getCatalogo('sectoresGICS'),
  getSectorGICSById: (id) => getCatalogoById('sectoresGICS', id),
  getSectoresGICSOptions: () => getCatalogoOptions('sectoresGICS'),

  // Sector Chile
  getSectorChile: () => getCatalogo('sectorChile'),
  getSectorChileById: (id) => getCatalogoById('sectorChile', id),
  getSectorChileOptions: () => getCatalogoOptions('sectorChile'),

  // Investment Types
  getInvestmentTypes: () => getCatalogo('investmentTypes'),
  getInvestmentTypeById: (id) => getCatalogoById('investmentTypes', id),
  getInvestmentTypesOptions: () => getCatalogoOptions('investmentTypes'),

  // Issuer Types
  getIssuerTypes: () => getCatalogo('issuerTypes'),
  getIssuerTypeById: (id) => getCatalogoById('issuerTypes', id),
  getIssuerTypesOptions: () => getCatalogoOptions('issuerTypes'),

  // Issue Types
  getIssueTypes: () => getCatalogo('issueTypes'),
  getIssueTypeById: (id) => getCatalogoById('issueTypes', id),
  getIssueTypesOptions: () => getCatalogoOptions('issueTypes'),

  // Coupon Types
  getCouponTypes: () => getCatalogo('couponTypes'),
  getCouponTypeById: (id) => getCatalogoById('couponTypes', id),
  getCouponTypesOptions: () => getCatalogoOptions('couponTypes'),

  // Coupon Frequencies
  getCouponFrequencies: () => getCatalogo('couponFrequencies'),
  getCouponFrequencyById: (id) => getCatalogoById('couponFrequencies', id),
  getCouponFrequenciesOptions: () => getCatalogoOptions('couponFrequencies'),

  // Yield Types
  getYieldTypes: () => getCatalogo('yieldTypes'),
  getYieldTypeById: (id) => getCatalogoById('yieldTypes', id),
  getYieldTypesOptions: () => getCatalogoOptions('yieldTypes'),

  // Yield Sources
  getYieldSources: () => getCatalogo('yieldSources'),
  getYieldSourceById: (id) => getCatalogoById('yieldSources', id),
  getYieldSourcesOptions: () => getCatalogoOptions('yieldSources'),

  // Rank Codes
  getRankCodes: () => getCatalogo('rankCodes'),
  getRankCodeById: (id) => getCatalogoById('rankCodes', id),
  getRankCodesOptions: () => getCatalogoOptions('rankCodes'),

  // Data Sources
  getDataSources: () => getCatalogo('dataSources'),
  getDataSourceById: (id) => getCatalogoById('dataSources', id),
  getDataSourcesOptions: () => getCatalogoOptions('dataSources'),

  // Fuentes
  getFuentes: () => getCatalogo('fuentes'),
  getFuenteById: (id) => getCatalogoById('fuentes', id),
  getFuentesOptions: () => getCatalogoOptions('fuentes'),

  // Boolean Values
  getBooleanValues: () => getCatalogo('booleanValues'),
  getBooleanValueById: (id) => getCatalogoById('booleanValues', id),
  getBooleanValuesOptions: () => getCatalogoOptions('booleanValues'),

  // Cash Types
  getCashTypes: () => getCatalogo('cashTypes'),
  getCashTypeById: (id) => getCatalogoById('cashTypes', id),
  getCashTypesOptions: () => getCatalogoOptions('cashTypes'),

  // Bank Debt Types
  getBankDebtTypes: () => getCatalogo('bankDebtTypes'),
  getBankDebtTypeById: (id) => getCatalogoById('bankDebtTypes', id),
  getBankDebtTypesOptions: () => getCatalogoOptions('bankDebtTypes'),

  // Fund Types
  getFundTypes: () => getCatalogo('fundTypes'),
  getFundTypeById: (id) => getCatalogoById('fundTypes', id),
  getFundTypesOptions: () => getCatalogoOptions('fundTypes'),

  // Tipos Continuador
  getTiposContinuador: () => getCatalogo('tiposContinuador'),
  getTipoContinuadorById: (id) => getCatalogoById('tiposContinuador', id),
  getTiposContinuadorOptions: () => getCatalogoOptions('tiposContinuador'),
};

export default catalogosService;
