/**
 * filterEngine.js - Motor de filtrado para el Explorador Dimensional
 *
 * Implementa la lógica AND/OR para filtrar instrumentos
 * basándose en las dimensiones seleccionadas.
 */

import { getDimensionByKey } from './dimensionConfig';

/**
 * Verifica si un instrumento coincide con un filtro específico
 *
 * @param {Object} instrument - El instrumento a verificar
 * @param {Object} filter - El filtro a aplicar { dimension, value }
 * @returns {boolean} - true si coincide, false si no
 */
export const matchFilter = (instrument, filter) => {
  const dimension = getDimensionByKey(filter.dimension);
  if (!dimension) return false;

  const fieldValue = instrument[dimension.field];

  // Si el campo es null/undefined/empty, no coincide
  if (fieldValue === null || fieldValue === undefined || fieldValue === '') {
    return false;
  }

  // Comparación case-insensitive para strings
  if (typeof fieldValue === 'string' && typeof filter.value === 'string') {
    return fieldValue.toLowerCase() === filter.value.toLowerCase();
  }

  // Comparación directa para otros tipos
  return fieldValue === filter.value;
};

/**
 * Filtra una lista de instrumentos según el estado de filtros
 *
 * @param {Array} instruments - Lista de instrumentos a filtrar
 * @param {Object} filterState - Estado de filtros { operator: 'AND'|'OR', filters: [...] }
 * @returns {Array} - Lista filtrada de instrumentos
 */
export const filterInstruments = (instruments, filterState) => {
  // Si no hay filtros, retornar todos
  if (!filterState.filters || filterState.filters.length === 0) {
    return instruments;
  }

  return instruments.filter((instrument) => {
    // Evaluar cada filtro
    const results = filterState.filters.map((filter) =>
      matchFilter(instrument, filter)
    );

    // Aplicar lógica AND u OR
    if (filterState.operator === 'AND') {
      return results.every((r) => r);
    } else {
      return results.some((r) => r);
    }
  });
};

/**
 * Agrupa los filtros por dimensión para estadísticas
 *
 * @param {Array} filters - Lista de filtros
 * @returns {Object} - Objeto agrupado por dimensión
 */
export const groupFiltersByDimension = (filters) => {
  return filters.reduce((acc, filter) => {
    if (!acc[filter.dimension]) {
      acc[filter.dimension] = [];
    }
    acc[filter.dimension].push(filter.value);
    return acc;
  }, {});
};

/**
 * Calcula estadísticas de los resultados filtrados
 *
 * @param {Array} instruments - Lista de instrumentos filtrados
 * @returns {Object} - Estadísticas por dimensión
 */
export const calculateStats = (instruments) => {
  const stats = {
    total: instruments.length,
    byType: {},
    byCountry: {},
    byCurrency: {},
    bySource: {},
  };

  instruments.forEach((instrument) => {
    // Por tipo de inversión
    const type = instrument.investmentTypeCode;
    if (type) {
      stats.byType[type] = (stats.byType[type] || 0) + 1;
    }

    // Por país
    const country = instrument.issueCountry;
    if (country) {
      stats.byCountry[country] = (stats.byCountry[country] || 0) + 1;
    }

    // Por moneda
    const currency = instrument.issueCurrency;
    if (currency) {
      stats.byCurrency[currency] = (stats.byCurrency[currency] || 0) + 1;
    }

    // Por fuente de datos
    const source = instrument.publicDataSource;
    if (source) {
      stats.bySource[source] = (stats.bySource[source] || 0) + 1;
    }
  });

  return stats;
};

/**
 * Ordena los instrumentos por una columna
 *
 * @param {Array} instruments - Lista de instrumentos
 * @param {string} column - Nombre de la columna
 * @param {string} direction - 'asc' o 'desc'
 * @returns {Array} - Lista ordenada
 */
export const sortInstruments = (instruments, column, direction = 'asc') => {
  return [...instruments].sort((a, b) => {
    let aVal = a[column];
    let bVal = b[column];

    // Manejar nulls
    if (aVal === null || aVal === undefined) aVal = '';
    if (bVal === null || bVal === undefined) bVal = '';

    // Comparación
    let comparison = 0;
    if (typeof aVal === 'string' && typeof bVal === 'string') {
      comparison = aVal.localeCompare(bVal);
    } else if (typeof aVal === 'number' && typeof bVal === 'number') {
      comparison = aVal - bVal;
    } else {
      comparison = String(aVal).localeCompare(String(bVal));
    }

    return direction === 'asc' ? comparison : -comparison;
  });
};

/**
 * Pagina los resultados
 *
 * @param {Array} instruments - Lista de instrumentos
 * @param {number} page - Número de página (0-indexed)
 * @param {number} pageSize - Tamaño de página
 * @returns {Object} - { data, total, hasMore }
 */
export const paginateInstruments = (instruments, page = 0, pageSize = 100) => {
  const startIndex = page * pageSize;
  const endIndex = startIndex + pageSize;
  const data = instruments.slice(startIndex, endIndex);

  return {
    data,
    total: instruments.length,
    page,
    pageSize,
    totalPages: Math.ceil(instruments.length / pageSize),
    hasMore: endIndex < instruments.length,
  };
};

/**
 * Genera un ID único para un filtro
 */
export const generateFilterId = () => {
  return `filter_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Crea un nuevo objeto de filtro
 *
 * @param {string} dimension - Key de la dimensión
 * @param {string} value - Valor del filtro
 * @param {string} label - Etiqueta para mostrar
 * @returns {Object} - Objeto de filtro
 */
export const createFilter = (dimension, value, label) => {
  return {
    id: generateFilterId(),
    dimension,
    value,
    label: label || value,
    createdAt: Date.now(),
  };
};

export default {
  matchFilter,
  filterInstruments,
  groupFiltersByDimension,
  calculateStats,
  sortInstruments,
  paginateInstruments,
  generateFilterId,
  createFilter,
};
