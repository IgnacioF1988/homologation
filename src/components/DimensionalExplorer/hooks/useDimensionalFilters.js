/**
 * useDimensionalFilters - Hook para manejar el estado de filtros dimensionales
 *
 * Gestiona los filtros activos, el operador lógico (AND/OR),
 * y proporciona acciones para modificar el estado.
 */

import { useState, useCallback, useMemo } from 'react';
import { createFilter } from '../utils/filterEngine';

/**
 * Estado inicial de filtros
 */
const initialState = {
  operator: 'AND',
  filters: [],
};

/**
 * Hook para gestionar filtros dimensionales
 *
 * @returns {Object} - Estado y acciones para filtros
 */
const useDimensionalFilters = () => {
  const [filterState, setFilterState] = useState(initialState);

  /**
   * Agrega un nuevo filtro
   */
  const addFilter = useCallback((dimension, value, label) => {
    setFilterState((prev) => {
      // Verificar si ya existe este filtro exacto
      const exists = prev.filters.some(
        (f) => f.dimension === dimension && f.value === value
      );

      if (exists) {
        return prev; // No agregar duplicados
      }

      const newFilter = createFilter(dimension, value, label);

      return {
        ...prev,
        filters: [...prev.filters, newFilter],
      };
    });
  }, []);

  /**
   * Elimina un filtro por ID
   */
  const removeFilter = useCallback((filterId) => {
    setFilterState((prev) => ({
      ...prev,
      filters: prev.filters.filter((f) => f.id !== filterId),
    }));
  }, []);

  /**
   * Elimina todos los filtros de una dimensión
   */
  const removeFiltersByDimension = useCallback((dimension) => {
    setFilterState((prev) => ({
      ...prev,
      filters: prev.filters.filter((f) => f.dimension !== dimension),
    }));
  }, []);

  /**
   * Alterna el operador entre AND y OR
   */
  const toggleOperator = useCallback(() => {
    setFilterState((prev) => ({
      ...prev,
      operator: prev.operator === 'AND' ? 'OR' : 'AND',
    }));
  }, []);

  /**
   * Establece el operador directamente
   */
  const setOperator = useCallback((operator) => {
    if (operator === 'AND' || operator === 'OR') {
      setFilterState((prev) => ({
        ...prev,
        operator,
      }));
    }
  }, []);

  /**
   * Limpia todos los filtros
   */
  const clearAll = useCallback(() => {
    setFilterState(initialState);
  }, []);

  /**
   * Verifica si un valor está activo como filtro
   */
  const isFilterActive = useCallback(
    (dimension, value) => {
      return filterState.filters.some(
        (f) => f.dimension === dimension && f.value === value
      );
    },
    [filterState.filters]
  );

  /**
   * Obtiene los filtros agrupados por dimensión
   */
  const filtersByDimension = useMemo(() => {
    return filterState.filters.reduce((acc, filter) => {
      if (!acc[filter.dimension]) {
        acc[filter.dimension] = [];
      }
      acc[filter.dimension].push(filter);
      return acc;
    }, {});
  }, [filterState.filters]);

  /**
   * Cuenta de filtros activos
   */
  const filterCount = useMemo(() => {
    return filterState.filters.length;
  }, [filterState.filters]);

  /**
   * Cuenta de dimensiones con filtros activos
   */
  const dimensionsWithFilters = useMemo(() => {
    return Object.keys(filtersByDimension).length;
  }, [filtersByDimension]);

  /**
   * Alterna un filtro (agrega si no existe, elimina si existe)
   */
  const toggleFilter = useCallback(
    (dimension, value, label) => {
      const existingFilter = filterState.filters.find(
        (f) => f.dimension === dimension && f.value === value
      );

      if (existingFilter) {
        removeFilter(existingFilter.id);
      } else {
        addFilter(dimension, value, label);
      }
    },
    [filterState.filters, addFilter, removeFilter]
  );

  return {
    // Estado
    filterState,
    filters: filterState.filters,
    operator: filterState.operator,
    filterCount,
    dimensionsWithFilters,
    filtersByDimension,

    // Acciones
    addFilter,
    removeFilter,
    removeFiltersByDimension,
    toggleOperator,
    setOperator,
    clearAll,
    toggleFilter,

    // Helpers
    isFilterActive,
  };
};

export default useDimensionalFilters;
