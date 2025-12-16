/**
 * Servicio para consulta del Cubo IPA
 * Conecta con [Inteligencia_Producto_Dev].[process].[TBL_IPA]
 */

import { apiClient } from './apiClient';

export const cuboService = {
  /**
   * Obtiene las fechas de reporte disponibles
   */
  async getFechasReporte() {
    const response = await apiClient.get('/cubo/fechas');
    return response;
  },

  /**
   * Obtiene los fondos disponibles
   */
  async getFondos() {
    const response = await apiClient.get('/cubo/fondos');
    return response;
  },

  /**
   * Obtiene los datos del cubo con filtros
   * @param {Object} filters - Filtros a aplicar
   * @param {string} filters.fechaReporte - Fecha de reporte (requerido)
   * @param {Array<string>} filters.fondos - IDs de fondos (opcional)
   * @param {number} filters.limit - Límite de registros (default 100)
   */
  async getData(filters = {}) {
    const params = {
      fechaReporte: filters.fechaReporte,
      limit: filters.limit || 100,
    };

    if (filters.fondos && filters.fondos.length > 0) {
      params.fondos = filters.fondos.join(',');
    }

    const response = await apiClient.get('/cubo/data', params);
    return response;
  },

  /**
   * Obtiene estadísticas agregadas del cubo
   * @param {Object} filters - Filtros a aplicar
   */
  async getStats(filters = {}) {
    const params = {
      fechaReporte: filters.fechaReporte,
    };

    if (filters.fondos && filters.fondos.length > 0) {
      params.fondos = filters.fondos.join(',');
    }

    const response = await apiClient.get('/cubo/stats', params);
    return response;
  },

  /**
   * Obtiene distribución por una dimensión específica
   * @param {string} dimension - Nombre de la dimensión (investmentType, country, currency, etc.)
   * @param {Object} filters - Filtros a aplicar
   */
  async getDistribution(dimension, filters = {}) {
    const params = {
      fechaReporte: filters.fechaReporte,
      dimension,
    };

    if (filters.fondos && filters.fondos.length > 0) {
      params.fondos = filters.fondos.join(',');
    }

    const response = await apiClient.get('/cubo/distribution', params);
    return response;
  },

  /**
   * Descarga el cubo completo como CSV
   * @param {Object} filters - Filtros a aplicar
   */
  async downloadCSV(filters = {}) {
    const params = new URLSearchParams({
      fechaReporte: filters.fechaReporte,
      format: 'csv',
    });

    if (filters.fondos && filters.fondos.length > 0) {
      params.append('fondos', filters.fondos.join(','));
    }

    // Devolver URL para descarga directa
    return `/api/cubo/download?${params.toString()}`;
  },
};

export default cuboService;
