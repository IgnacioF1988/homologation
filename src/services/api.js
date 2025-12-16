/**
 * api.js - Punto de entrada unificado para todos los servicios
 *
 * Reemplaza a mockApi.js - Todas las llamadas van directamente a los servicios reales.
 * Los servicios ya manejan las llamadas HTTP al backend Express/SQL Server.
 */

import { instrumentosService } from './instrumentosService';
import { companiasService } from './companiasService';
import { colaPendientesService } from './colaPendientesService';
import { catalogosService } from './catalogosService';
import { cuboService } from './cuboService';

// Exportación unificada manteniendo la misma estructura que mockApi
export const api = {
  instrumentos: instrumentosService,
  companias: companiasService,
  colaPendientes: colaPendientesService,
  catalogos: catalogosService,
  cubo: cuboService,
};

export default api;
