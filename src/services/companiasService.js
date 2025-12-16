/**
 * Servicio para gestión de compañías
 */

import { apiClient } from './apiClient';

export const companiasService = {
  /**
   * Obtiene todas las compañías
   */
  async getAll() {
    const response = await apiClient.get('/companias');
    return response; // Devolver objeto completo { success, data }
  },

  /**
   * Busca compañías por término
   */
  async search(query, limit = 20) {
    if (!query || query.length < 2) {
      return { success: true, data: [] };
    }
    const response = await apiClient.get('/companias/search', { q: query, limit });
    return response; // Devolver objeto completo
  },

  /**
   * Obtiene una compañía por ID
   */
  async getById(id) {
    const response = await apiClient.get(`/companias/${id}`);
    return response; // Devolver objeto completo
  },

  /**
   * Busca una compañía por nombre exacto
   */
  async getByNombre(nombre) {
    try {
      const response = await apiClient.get(`/companias/exacta/${encodeURIComponent(nombre)}`);
      return response; // Devolver objeto completo
    } catch (error) {
      if (error.status === 404) {
        return { success: false, data: null };
      }
      throw error;
    }
  },

  /**
   * Crea una nueva compañía
   */
  async create(data) {
    const response = await apiClient.post('/companias', data);
    return response; // Devolver objeto completo
  },

  /**
   * Actualiza una compañía existente
   */
  async update(id, data) {
    const response = await apiClient.put(`/companias/${id}`, data);
    return response; // Devolver objeto completo
  },

  /**
   * Elimina una compañía
   */
  async delete(id) {
    const response = await apiClient.delete(`/companias/${id}`);
    return response; // Devolver objeto completo
  },

  /**
   * Obtiene opciones formateadas para autocomplete
   */
  async getOptions(query = '') {
    const response = query ? await this.search(query) : await this.getAll();
    const companies = response.data || [];

    return {
      success: true,
      data: companies.map(company => ({
        value: company.id,
        label: company.nombre,
        data: company,
      })),
    };
  },

  /**
   * Alias para getByNombre (compatibilidad con código existente)
   */
  getExacta(nombre) {
    return this.getByNombre(nombre);
  },
};

export default companiasService;
