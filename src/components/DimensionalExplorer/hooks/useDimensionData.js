/**
 * useDimensionData - Hook para cargar datos de dimensiones desde la API
 *
 * Carga todos los catálogos necesarios para el DimensionalExplorer
 * y proporciona los datos procesados para cada dimensión.
 *
 * OPTIMIZACIÓN: Usa cache a nivel de módulo para evitar recargas
 * innecesarias y mantener la UI fluida.
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import { catalogosService } from '../../../services/catalogosService';
import { companiasService } from '../../../services/companiasService';
import { DIMENSIONS, BOOLEAN_DIMENSIONS } from '../utils/dimensionConfig';

// Cache a nivel de módulo - persiste entre renders y re-montajes
let catalogosCache = null;
let dimensionsCache = null;
let booleanDimensionsCache = null;
let loadPromise = null;

/**
 * Carga los catálogos (usa cache si ya están cargados)
 */
const loadAllCatalogos = async () => {
  // Si ya hay datos en cache, retornarlos inmediatamente
  if (catalogosCache) {
    return catalogosCache;
  }

  // Si ya hay una carga en progreso, esperar a que termine
  if (loadPromise) {
    return loadPromise;
  }

  // Iniciar nueva carga
  loadPromise = (async () => {
    const [
      investmentTypes,
      issuerTypes,
      paises,
      monedas,
      dataSources,
      sectoresGICS,
      sectorChile,
      couponTypes,
      couponFrequencies,
      yieldTypes,
      yieldSources,
      rankCodes,
      issueTypes,
      fuentes,
      booleanValues,
      companias,
    ] = await Promise.all([
      catalogosService.getInvestmentTypes(),
      catalogosService.getIssuerTypes(),
      catalogosService.getPaises(),
      catalogosService.getMonedas(),
      catalogosService.getDataSources(),
      catalogosService.getSectoresGICS(),
      catalogosService.getSectorChile(),
      catalogosService.getCouponTypes(),
      catalogosService.getCouponFrequencies(),
      catalogosService.getYieldTypes(),
      catalogosService.getYieldSources(),
      catalogosService.getRankCodes(),
      catalogosService.getIssueTypes(),
      catalogosService.getFuentes(),
      catalogosService.getBooleanValues(),
      companiasService.getAll(),
    ]);

    // Extraer data de cada respuesta { success, data }
    catalogosCache = {
      investmentTypes: investmentTypes.data || [],
      issuerTypes: issuerTypes.data || [],
      paises: paises.data || [],
      monedas: monedas.data || [],
      dataSources: dataSources.data || [],
      sectoresGICS: sectoresGICS.data || [],
      sectorChile: sectorChile.data || [],
      couponTypes: couponTypes.data || [],
      couponFrequencies: couponFrequencies.data || [],
      yieldTypes: yieldTypes.data || [],
      yieldSources: yieldSources.data || [],
      rankCodes: rankCodes.data || [],
      issueTypes: issueTypes.data || [],
      fuentes: fuentes.data || [],
      booleanValues: booleanValues.data || [],
      companias: companias.data || [],
    };

    // Pre-procesar dimensiones para el cache
    dimensionsCache = DIMENSIONS.map(dim => ({
      ...dim,
      items: dim.getData(catalogosCache),
    }));

    booleanDimensionsCache = BOOLEAN_DIMENSIONS.map(dim => ({
      ...dim,
      values: dim.getValues(catalogosCache),
    }));

    loadPromise = null;
    return catalogosCache;
  })();

  return loadPromise;
};

const useDimensionData = () => {
  // Inicializar con cache si existe (apertura instantánea)
  const [catalogos, setCatalogos] = useState(catalogosCache);
  const [loading, setLoading] = useState(!catalogosCache);
  const [error, setError] = useState(null);
  const mountedRef = useRef(true);

  // Cargar catálogos si no están en cache
  useEffect(() => {
    mountedRef.current = true;

    // Si ya hay cache, no necesitamos cargar nada
    if (catalogosCache) {
      return;
    }

    const load = async () => {
      try {
        await loadAllCatalogos();

        if (mountedRef.current) {
          setCatalogos(catalogosCache);
          setLoading(false);
        }
      } catch (err) {
        console.error('Error cargando catálogos para DimensionalExplorer:', err);
        if (mountedRef.current) {
          setError(err.message || 'Error al cargar catálogos');
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Usar dimensiones cacheadas si existen, sino calcular
  const dimensions = useMemo(() => {
    if (dimensionsCache) return dimensionsCache;
    if (!catalogos) return [];

    return DIMENSIONS.map(dim => ({
      ...dim,
      items: dim.getData(catalogos),
    }));
  }, [catalogos]);

  // Usar dimensiones booleanas cacheadas si existen, sino calcular
  const booleanDimensions = useMemo(() => {
    if (booleanDimensionsCache) return booleanDimensionsCache;
    if (!catalogos) return [];

    return BOOLEAN_DIMENSIONS.map(dim => ({
      ...dim,
      values: dim.getValues(catalogos),
    }));
  }, [catalogos]);

  return {
    catalogos,
    dimensions,
    booleanDimensions,
    loading,
    error,
  };
};

/**
 * Función para invalidar el cache (útil si se modifican catálogos)
 */
export const invalidateDimensionCache = () => {
  catalogosCache = null;
  dimensionsCache = null;
  booleanDimensionsCache = null;
  loadPromise = null;
};

/**
 * Función para pre-cargar los catálogos en background
 * Llamar esto al inicio de la app para que estén listos cuando se abra el explorer
 */
export const preloadDimensionData = () => {
  if (!catalogosCache && !loadPromise) {
    loadAllCatalogos().catch(err => {
      console.warn('Error pre-cargando catálogos:', err);
    });
  }
};

export default useDimensionData;
