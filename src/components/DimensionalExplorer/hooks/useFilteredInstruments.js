/**
 * useFilteredInstruments - Hook para búsqueda y filtrado de instrumentos
 *
 * Aplica los filtros dimensionales al stock de instrumentos
 * con debounce, paginación y estadísticas.
 *
 * OPTIMIZACIÓN: Usa cache a nivel de módulo para apertura instantánea
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  filterInstruments,
  calculateStats,
  sortInstruments,
  paginateInstruments,
} from '../utils/filterEngine';
import { instrumentosService } from '../../../services/instrumentosService';

// Cache a nivel de módulo - persiste entre renders y re-montajes
let instrumentsCache = null;
let instrumentsLoadPromise = null;
let loadingProgress = { loaded: 0, total: 0 };

/**
 * Carga TODOS los instrumentos usando paginación y elimina duplicados
 * @param {Function} onProgress - Callback de progreso opcional
 */
const loadAllInstruments = async (onProgress) => {
  // Si ya hay datos en cache, retornarlos inmediatamente
  if (instrumentsCache) {
    return instrumentsCache;
  }

  // Si ya hay una carga en progreso, esperar a que termine
  if (instrumentsLoadPromise) {
    return instrumentsLoadPromise;
  }

  // Iniciar nueva carga usando getAllComplete (carga todas las páginas)
  instrumentsLoadPromise = (async () => {
    const response = await instrumentosService.getAllComplete({
      onProgress: (loaded, total) => {
        loadingProgress = { loaded, total };
        if (onProgress) onProgress(loaded, total);
      },
    });

    if (response.success) {
      instrumentsCache = response.data || [];
      console.log(
        `[DimensionalExplorer] Cargados ${instrumentsCache.length} instrumentos únicos ` +
        `(${response.duplicatesRemoved || 0} duplicados eliminados de ${response.originalTotal || 0} totales)`
      );
    } else {
      instrumentsCache = [];
    }

    instrumentsLoadPromise = null;
    return instrumentsCache;
  })();

  return instrumentsLoadPromise;
};

/**
 * Obtiene el progreso de carga actual
 */
export const getLoadingProgress = () => loadingProgress;

/**
 * Hook para filtrar instrumentos con debounce
 *
 * @param {Object} filterState - Estado de filtros { operator, filters }
 * @param {Object} options - Opciones { debounceMs, pageSize, sortColumn, sortDirection }
 * @returns {Object} - Resultados, estadísticas y acciones
 */
const useFilteredInstruments = (filterState, options = {}) => {
  const {
    debounceMs = 300,
    pageSize = 100,
    initialSortColumn = 'idInstrumento',
    initialSortDirection = 'asc',
  } = options;

  // Inicializar con cache si existe (apertura instantánea)
  const [loading, setLoading] = useState(!instrumentsCache);
  const [loadProgress, setLoadProgress] = useState({ loaded: 0, total: 0 });
  const [page, setPage] = useState(0);
  const [sortColumn, setSortColumn] = useState(initialSortColumn);
  const [sortDirection, setSortDirection] = useState(initialSortDirection);
  const [allInstruments, setAllInstruments] = useState(instrumentsCache || []);
  const [filteredResults, setFilteredResults] = useState(instrumentsCache || []);

  // Ref para debounce
  const debounceRef = useRef(null);
  const mountedRef = useRef(true);

  // Cargar instrumentos desde la API (usa cache)
  useEffect(() => {
    mountedRef.current = true;

    // Si ya hay cache, no necesitamos cargar
    if (instrumentsCache) {
      return;
    }

    const loadInstruments = async () => {
      try {
        const data = await loadAllInstruments((loaded, total) => {
          if (mountedRef.current) {
            setLoadProgress({ loaded, total });
          }
        });
        if (mountedRef.current) {
          setAllInstruments(data);
          setFilteredResults(data);
          setLoading(false);
        }
      } catch (error) {
        console.error('Error cargando instrumentos:', error);
        if (mountedRef.current) {
          setAllInstruments([]);
          setFilteredResults([]);
          setLoading(false);
        }
      }
    };

    loadInstruments();

    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Aplicar filtros con debounce
  useEffect(() => {
    if (allInstruments.length === 0) return;

    setLoading(true);

    // Limpiar debounce anterior
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      try {
        // Aplicar filtros
        const filtered = filterInstruments(allInstruments, filterState);

        // Aplicar ordenamiento
        const sorted = sortInstruments(filtered, sortColumn, sortDirection);

        setFilteredResults(sorted);
        setPage(0); // Reset página al cambiar filtros
      } catch (error) {
        console.error('Error filtrando instrumentos:', error);
        setFilteredResults([]);
      } finally {
        setLoading(false);
      }
    }, debounceMs);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [filterState, allInstruments, sortColumn, sortDirection, debounceMs]);

  // Resultados paginados
  const paginatedResults = useMemo(() => {
    return paginateInstruments(filteredResults, page, pageSize);
  }, [filteredResults, page, pageSize]);

  // Estadísticas
  const stats = useMemo(() => {
    return calculateStats(filteredResults);
  }, [filteredResults]);

  // Cargar más resultados
  const loadMore = useCallback(() => {
    if (paginatedResults.hasMore) {
      setPage((prev) => prev + 1);
    }
  }, [paginatedResults.hasMore]);

  // Reiniciar paginación
  const resetPagination = useCallback(() => {
    setPage(0);
  }, []);

  // Cambiar ordenamiento
  const handleSort = useCallback(
    (column) => {
      if (column === sortColumn) {
        // Toggle dirección
        setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortColumn(column);
        setSortDirection('asc');
      }
    },
    [sortColumn]
  );

  // Resultados acumulados para scroll infinito
  const accumulatedResults = useMemo(() => {
    const endIndex = (page + 1) * pageSize;
    return filteredResults.slice(0, endIndex);
  }, [filteredResults, page, pageSize]);

  // Recargar instrumentos (invalida cache y recarga)
  const reloadInstruments = useCallback(async () => {
    setLoading(true);
    setLoadProgress({ loaded: 0, total: 0 });
    // Invalidar cache para forzar recarga
    instrumentsCache = null;
    instrumentsLoadPromise = null;
    try {
      const data = await loadAllInstruments((loaded, total) => {
        setLoadProgress({ loaded, total });
      });
      setAllInstruments(data);
      setFilteredResults(data);
    } catch (error) {
      console.error('Error recargando instrumentos:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    // Resultados
    results: accumulatedResults,
    paginatedResults: paginatedResults.data,
    allFilteredResults: filteredResults,
    total: paginatedResults.total,
    totalPages: paginatedResults.totalPages,
    currentPage: page,
    hasMore: paginatedResults.hasMore,

    // Estado
    loading,
    loadProgress,
    stats,

    // Ordenamiento
    sortColumn,
    sortDirection,
    handleSort,

    // Acciones
    loadMore,
    resetPagination,
    setPage,
    reloadInstruments,
  };
};

/**
 * Función para invalidar el cache de instrumentos
 */
export const invalidateInstrumentsCache = () => {
  instrumentsCache = null;
  instrumentsLoadPromise = null;
};

/**
 * Función para pre-cargar los instrumentos en background
 * Llamar esto al inicio de la app para que estén listos cuando se abra el explorer
 */
export const preloadInstruments = () => {
  if (!instrumentsCache && !instrumentsLoadPromise) {
    loadAllInstruments().catch(err => {
      console.warn('Error pre-cargando instrumentos:', err);
    });
  }
};

export default useFilteredInstruments;
