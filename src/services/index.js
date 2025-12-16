/**
 * Barrel export para todos los servicios
 */

// Importar servicios primero (requerido por ESLint import/first)
import { catalogosService } from './catalogosService';
import { instrumentosService } from './instrumentosService';
import { companiasService } from './companiasService';
import { colaPendientesService } from './colaPendientesService';

// Re-exportar servicios individuales
export { config } from './config';
export { apiClient, ApiError } from './apiClient';
export { catalogosService } from './catalogosService';
export { instrumentosService } from './instrumentosService';
export { companiasService } from './companiasService';
export { colaPendientesService } from './colaPendientesService';
export { draftService } from './draftService';

// Re-exportar por defecto el api unificado para compatibilidad
export const api = {
  catalogos: catalogosService,
  instrumentos: instrumentosService,
  companias: companiasService,
  colaPendientes: colaPendientesService,
};

export default api;
