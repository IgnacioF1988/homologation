/**
 * DimensionalExplorer - Barrel export
 *
 * Exporta los componentes principales del explorador dimensional
 */

// Componentes principales
export { default as DimensionalExplorer } from './DimensionalExplorer';
export { default as DimensionalExplorerFab } from './DimensionalExplorerFab';

// Hooks (por si se necesitan externamente)
export { default as useDimensionalFilters } from './hooks/useDimensionalFilters';
export { default as useFilteredInstruments } from './hooks/useFilteredInstruments';

// Funciones de pre-carga para apertura instantánea
export { preloadDimensionData, invalidateDimensionCache } from './hooks/useDimensionData';
export { preloadInstruments, invalidateInstrumentsCache } from './hooks/useFilteredInstruments';

// Utilidades
export * from './utils/dimensionConfig';
export * from './utils/filterEngine';
