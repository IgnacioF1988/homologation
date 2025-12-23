/**
 * useFondoFilters.js - Hook de Filtrado y Ordenamiento
 * Filtra y ordena fondos según criterios de UI
 */

import { useMemo } from 'react';
import { FINAL_STATUS, FILTER_OPTIONS, SORT_FIELDS } from '../utils/constants';
import { usePipelineUI } from '../contexts/PipelineUIContext';

/**
 * useFondoFilters - Hook para filtrar y ordenar fondos
 * @param {Map<string, ParsedFondo>} fondosMap - Map de fondos parseados
 * @param {Array<string>} fondosOrder - Orden original de fondos
 * @returns {FilteredFondos} - Fondos filtrados y ordenados
 */
export const useFondoFilters = (fondosMap, fondosOrder) => {
  const { filterStatus, searchQuery, sortBy, sortDirection } = usePipelineUI();

  // Aplicar filtros
  const filteredIds = useMemo(() => {
    return applyFilters(fondosMap, fondosOrder, filterStatus, searchQuery);
  }, [fondosMap, fondosOrder, filterStatus, searchQuery]);

  // Aplicar ordenamiento
  const sortedIds = useMemo(() => {
    return applySorting(fondosMap, filteredIds, sortBy, sortDirection);
  }, [fondosMap, filteredIds, sortBy, sortDirection]);

  // Contar fondos por status (para chips de filtro)
  const counts = useMemo(() => {
    return computeFilterCounts(fondosMap);
  }, [fondosMap]);

  // Verificar si hay filtros activos
  const hasActiveFilters = useMemo(() => {
    return filterStatus !== FILTER_OPTIONS.ALL || searchQuery.trim() !== '';
  }, [filterStatus, searchQuery]);

  return {
    filteredIds: sortedIds,
    counts,
    hasActiveFilters,
    totalFiltered: sortedIds.length,
    totalAll: fondosOrder.length,
  };
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * applyFilters - Aplica filtros de status y búsqueda
 * @param {Map<string, ParsedFondo>} fondosMap - Map de fondos
 * @param {Array<string>} fondosOrder - Orden original
 * @param {string} filterStatus - Status a filtrar
 * @param {string} searchQuery - Query de búsqueda
 * @returns {Array<string>} - IDs filtrados
 */
function applyFilters(fondosMap, fondosOrder, filterStatus, searchQuery) {
  const searchLower = searchQuery.trim().toLowerCase();

  return fondosOrder.filter(fondoId => {
    const fondo = fondosMap.get(fondoId);
    if (!fondo) return false;

    // Filtro por status
    if (!matchesStatusFilter(fondo, filterStatus)) {
      return false;
    }

    // Filtro por búsqueda
    if (searchLower && !matchesSearchQuery(fondo, searchLower)) {
      return false;
    }

    return true;
  });
}

/**
 * matchesStatusFilter - Verifica si fondo coincide con filtro de status
 * @param {ParsedFondo} fondo - Fondo parseado
 * @param {string} filterStatus - Status a filtrar
 * @returns {boolean} - True si coincide
 */
function matchesStatusFilter(fondo, filterStatus) {
  if (filterStatus === FILTER_OPTIONS.ALL) {
    return true;
  }

  // Mapear filtro a status enum
  const statusMap = {
    [FILTER_OPTIONS.ERROR]: FINAL_STATUS.ERROR,
    [FILTER_OPTIONS.WARNING]: FINAL_STATUS.WARNING,
    [FILTER_OPTIONS.OK]: FINAL_STATUS.OK,
    [FILTER_OPTIONS.EN_PROGRESO]: FINAL_STATUS.EN_PROGRESO,
    [FILTER_OPTIONS.PARCIAL]: FINAL_STATUS.PARCIAL,
  };

  const targetStatus = statusMap[filterStatus];
  return fondo.status === targetStatus;
}

/**
 * matchesSearchQuery - Verifica si fondo coincide con query de búsqueda
 * @param {ParsedFondo} fondo - Fondo parseado
 * @param {string} searchLower - Query en minúsculas
 * @returns {boolean} - True si coincide
 */
function matchesSearchQuery(fondo, searchLower) {
  // Buscar en nombre corto
  if (fondo.shortName.toLowerCase().includes(searchLower)) {
    return true;
  }

  // Buscar en nombre completo
  if (fondo.fullName.toLowerCase().includes(searchLower)) {
    return true;
  }

  // Buscar en ID
  if (fondo.id.includes(searchLower)) {
    return true;
  }

  return false;
}

/**
 * applySorting - Aplica ordenamiento a fondos
 * @param {Map<string, ParsedFondo>} fondosMap - Map de fondos
 * @param {Array<string>} fondoIds - IDs a ordenar
 * @param {string} sortBy - Campo por el cual ordenar
 * @param {string} sortDirection - Dirección ('asc' o 'desc')
 * @returns {Array<string>} - IDs ordenados
 */
function applySorting(fondosMap, fondoIds, sortBy, sortDirection) {
  const sorted = [...fondoIds];

  sorted.sort((aId, bId) => {
    const fondoA = fondosMap.get(aId);
    const fondoB = fondosMap.get(bId);

    if (!fondoA || !fondoB) return 0;

    let comparison = 0;

    switch (sortBy) {
      case SORT_FIELDS.FUND_NAME:
        comparison = fondoA.shortName.localeCompare(fondoB.shortName);
        break;

      case SORT_FIELDS.STATUS:
        // Ordenar por status numérico (ERROR primero, OK último)
        comparison = fondoB.status - fondoA.status;
        break;

      case SORT_FIELDS.DURATION:
        // Ordenar por duración (más largo primero)
        const durationA = fondoA.duration || 0;
        const durationB = fondoB.duration || 0;
        comparison = durationB - durationA;
        break;

      case SORT_FIELDS.START_TIME:
        // Ordenar por tiempo de inicio (más reciente primero)
        const startA = fondoA.startTime || 0;
        const startB = fondoB.startTime || 0;
        comparison = startB - startA;
        break;

      default:
        comparison = 0;
    }

    // Invertir si es descendente (excepto STATUS y DURATION que ya están desc por defecto)
    if (sortDirection === 'desc' && (sortBy === SORT_FIELDS.FUND_NAME || sortBy === SORT_FIELDS.START_TIME)) {
      comparison = -comparison;
    }

    if (sortDirection === 'asc' && (sortBy === SORT_FIELDS.STATUS || sortBy === SORT_FIELDS.DURATION)) {
      comparison = -comparison;
    }

    return comparison;
  });

  return sorted;
}

/**
 * computeFilterCounts - Calcula contadores para chips de filtro
 * @param {Map<string, ParsedFondo>} fondosMap - Map de fondos
 * @returns {Object} - Contadores por filtro
 */
function computeFilterCounts(fondosMap) {
  const counts = {
    all: fondosMap.size,
    ok: 0,
    error: 0,
    warning: 0,
    enProgreso: 0,
    parcial: 0,
  };

  fondosMap.forEach(fondo => {
    switch (fondo.status) {
      case FINAL_STATUS.OK:
        counts.ok++;
        break;
      case FINAL_STATUS.ERROR:
        counts.error++;
        break;
      case FINAL_STATUS.WARNING:
        counts.warning++;
        break;
      case FINAL_STATUS.EN_PROGRESO:
        counts.enProgreso++;
        break;
      case FINAL_STATUS.PARCIAL:
        counts.parcial++;
        break;
      default:
        break;
    }
  });

  return counts;
}

export default useFondoFilters;
