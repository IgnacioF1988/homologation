/**
 * catalogCodeMapper.js
 * Utilidad para convertir entre códigos de catálogo (BD) e IDs (frontend)
 */

// Mapeos de códigos string → IDs numéricos
// Estos deben coincidir con los valores de los catálogos

const DATA_SOURCES = {
  'GENEVA': 1,
  'INFOVIEW': 2,
  'BBG': 3,
  'REFINITIV': 4,
  'FACTSET': 5,
  'S&P': 6,
  'MOODY\'S': 7,
  'BLOOMBERG': 8,
  'REUTERS': 9,
  'WIND': 10,
  'EASTMONEY': 11,
  'SINA': 12,
  'TENCENT': 13,
};

const EMISION_NACIONAL = {
  'S': 1,  // Sí
  'N': 2,  // No
};

// Mapeo inverso para convertir ID → Código
const DATA_SOURCES_REVERSE = Object.entries(DATA_SOURCES).reduce((acc, [key, value]) => {
  acc[value] = key;
  return acc;
}, {});

const EMISION_NACIONAL_REVERSE = Object.entries(EMISION_NACIONAL).reduce((acc, [key, value]) => {
  acc[value] = key;
  return acc;
}, {});

/**
 * Convierte códigos de catálogo a IDs para usar en dropdowns
 * @param {Object} data - Datos del instrumento con códigos string
 * @returns {Object} - Datos con IDs numéricos
 */
export function catalogCodesToIds(data) {
  const converted = { ...data };

  // publicDataSource: "BBG" → 3
  if (converted.publicDataSource && typeof converted.publicDataSource === 'string') {
    const uppercaseCode = converted.publicDataSource.toUpperCase();
    converted.publicDataSource = DATA_SOURCES[uppercaseCode] || converted.publicDataSource;
  }

  // emisionNacional: "S" → 1
  if (converted.emisionNacional && typeof converted.emisionNacional === 'string') {
    const uppercaseCode = converted.emisionNacional.toUpperCase().trim();
    converted.emisionNacional = EMISION_NACIONAL[uppercaseCode] || converted.emisionNacional;
  }

  // NOTA: issueCountry y riskCountry requieren búsqueda dinámica en el catálogo
  // porque son muchos países y no es práctico hacer un mapeo estático
  // Estos se manejarán en el hook con una búsqueda

  return converted;
}

/**
 * Convierte IDs de catálogo a códigos string para guardar en BD
 * @param {Object} data - Datos del instrumento con IDs numéricos
 * @returns {Object} - Datos con códigos string
 */
export function catalogIdsToCodes(data) {
  const converted = { ...data };

  // publicDataSource: 3 → "BBG"
  if (converted.publicDataSource && typeof converted.publicDataSource === 'number') {
    converted.publicDataSource = DATA_SOURCES_REVERSE[converted.publicDataSource] || converted.publicDataSource;
  }

  // emisionNacional: 1 → "S"
  if (converted.emisionNacional && typeof converted.emisionNacional === 'number') {
    converted.emisionNacional = EMISION_NACIONAL_REVERSE[converted.emisionNacional] || converted.emisionNacional;
  }

  return converted;
}

/**
 * Buscar ID de país por código
 * @param {Array} paises - Lista de países del catálogo
 * @param {String} code - Código del país (ej: "CL", "US")
 * @returns {Number|null} - ID del país o null si no se encuentra
 */
export function findPaisIdByCode(paises, code) {
  if (!code || !paises) return null;
  const pais = paises.find(p => p.code?.toUpperCase() === code.toUpperCase());
  return pais ? pais.id : null;
}

/**
 * Buscar código de país por ID
 * @param {Array} paises - Lista de países del catálogo
 * @param {Number} id - ID del país
 * @returns {String|null} - Código del país o null si no se encuentra
 */
export function findPaisCodeById(paises, id) {
  if (id === null || id === undefined || !paises) return null;
  const pais = paises.find(p => p.id === parseInt(id));
  return pais ? pais.code : null;
}

export default {
  catalogCodesToIds,
  catalogIdsToCodes,
  findPaisIdByCode,
  findPaisCodeById,
};
