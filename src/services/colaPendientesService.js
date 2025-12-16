/**
 * Servicio para gestión de la cola de pendientes
 */

import { apiClient } from './apiClient';

export const colaPendientesService = {
  /**
   * Obtiene todos los pendientes
   * @param {boolean} resetEnProceso - Si true, resetea estados en_proceso antes de devolver
   * @param {string|null} estado - Filtrar por estado
   */
  async getAll(resetEnProceso = false, estado = null) {
    const params = {};
    if (estado) params.estado = estado;
    if (resetEnProceso) params.resetEnProceso = 'true';
    const response = await apiClient.get('/cola-pendientes', params);
    // Devolver respuesta completa para que el componente verifique success
    return response;
  },

  /**
   * Obtiene estadísticas de la cola
   */
  async getStats() {
    const response = await apiClient.get('/cola-pendientes/stats');
    return response; // Devolver objeto completo
  },

  /**
   * Obtiene un pendiente por ID
   */
  async getById(id) {
    const response = await apiClient.get(`/cola-pendientes/${id}`);
    return response; // Devolver objeto completo
  },

  /**
   * Crea un nuevo pendiente
   * @param {Object} data - Datos del pendiente
   * @param {string} data.idInstrumentoOrigen - ID del instrumento origen (opcional)
   * @param {string} data.nombreInstrumentoOrigen - Nombre del instrumento (requerido)
   * @param {string} data.fuente - Fuente de datos (BBG, RTR, MSC, etc)
   * @param {number} data.moneda - Código de moneda (opcional)
   * @param {string} data.estado - Estado inicial (default: 'pendiente')
   * @param {string} data.prioridad - Prioridad (default: 'normal')
   * @param {Object} data.datosOrigen - Datos adicionales en formato JSON (opcional)
   */
  async create(data) {
    const response = await apiClient.post('/cola-pendientes', data);
    return response; // Devolver objeto completo
  },

  /**
   * Actualiza el estado de un pendiente
   */
  async updateEstado(id, estado, observaciones = null) {
    const body = { estado };
    if (observaciones) body.observaciones = observaciones;

    const response = await apiClient.patch(`/cola-pendientes/${id}/estado`, body);
    return response; // Devolver objeto completo
  },

  /**
   * Actualiza un pendiente completo
   */
  async update(id, data) {
    const response = await apiClient.put(`/cola-pendientes/${id}`, data);
    return response; // Devolver objeto completo
  },

  /**
   * Elimina un pendiente (soft delete por defecto)
   */
  async delete(id, hardDelete = false) {
    const params = hardDelete ? { hardDelete: 'true' } : {};
    const response = await apiClient.delete(`/cola-pendientes/${id}`, params);
    return response; // Devolver objeto completo
  },

  /**
   * Marca un pendiente como completado
   */
  async complete(id, instrumentoAsignado = null) {
    const data = { estado: 'completado' };
    if (instrumentoAsignado) data.instrumentoAsignado = instrumentoAsignado;

    const response = await apiClient.patch(`/cola-pendientes/${id}/estado`, data);
    return response; // Devolver objeto completo
  },

  /**
   * Marca un pendiente como en proceso
   */
  async startProcessing(id) {
    return this.updateEstado(id, 'en_proceso');
  },

  /**
   * Marca un pendiente con error
   */
  async markError(id, observaciones) {
    return this.updateEstado(id, 'error', observaciones);
  },

  /**
   * Obtiene solo los pendientes activos (no completados)
   */
  async getPendientes() {
    return this.getAll(false, 'pendiente');
  },

  /**
   * Obtiene los pendientes en proceso
   */
  async getEnProceso() {
    return this.getAll(false, 'en_proceso');
  },

  /**
   * Resetea todos los registros en_proceso a pendiente
   * Se llama al iniciar la aplicación para limpiar estados huérfanos
   */
  async resetEnProceso() {
    const response = await apiClient.post('/cola-pendientes/reset-en-proceso');
    return response;
  },
};

export default colaPendientesService;
