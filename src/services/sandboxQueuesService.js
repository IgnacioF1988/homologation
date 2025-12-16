/**
 * Servicio para gestión de colas sandbox (Mission Control)
 * Sistema unificado de pendientes que bloquean la creación del cubo
 */

import { apiClient } from './apiClient';

export const sandboxQueuesService = {
  // ============================================
  // Resumen general de todas las colas
  // ============================================

  /**
   * Obtiene el resumen de todas las colas con conteos
   * @returns {Promise} - { instrumentos, fondos, monedas, benchmarks, suciedades, descuadres }
   */
  getSummary: () =>
    apiClient.get('/sandbox-queues/summary'),

  // ============================================
  // Operaciones por cola
  // ============================================

  /**
   * Obtiene los items de una cola específica
   * @param {string} queueType - instrumentos, fondos, monedas, benchmarks, suciedades, descuadres
   * @param {Object} params - { estado?, limit? }
   */
  getQueue: (queueType, params = {}) =>
    apiClient.get(`/sandbox-queues/${queueType}`, params),

  /**
   * Actualiza el estado de un item en la cola
   * @param {string} queueType
   * @param {number} id
   * @param {Object} data - { estado, observaciones, ...asignacion }
   */
  updateItem: (queueType, id, data) =>
    apiClient.patch(`/sandbox-queues/${queueType}/${id}`, data),

  /**
   * Resuelve un item y escribe en la tabla dimensional correspondiente
   * @param {string} queueType
   * @param {number} id
   * @param {Object} asignacion - datos de asignación según tipo
   */
  resolveItem: (queueType, id, asignacion) =>
    apiClient.post(`/sandbox-queues/${queueType}/resolve`, { id, asignacion }),

  /**
   * Resuelve múltiples items en una sola operación (batch)
   * @param {string} queueType
   * @param {Array} items - Array de { id, asignacion }
   */
  resolveItemsBatch: (queueType, items) =>
    apiClient.post(`/sandbox-queues/${queueType}/resolve-batch`, { items }),

  /**
   * Elimina un item permanentemente
   * @param {string} queueType
   * @param {number} id
   */
  deleteItem: (queueType, id) =>
    apiClient.delete(`/sandbox-queues/${queueType}/${id}`),

  // ============================================
  // Opciones para asignación
  // ============================================

  /**
   * Obtiene las opciones disponibles para asignar
   * @param {string} type - fondos, monedas, benchmarks
   * @param {string} source - opcional, filtra por fuente
   */
  getOptions: (type, source = null) =>
    apiClient.get(`/sandbox-queues/options/${type}`, source ? { source } : {}),

  /**
   * Obtiene todas las opciones para el formulario de nuevo fondo
   * @returns {Promise} - { monedas, estrategiasConsFondo, estrategiasComparador, benchmarks }
   */
  getFundFormOptions: () =>
    apiClient.get('/sandbox-queues/fund-form-options'),
};

export default sandboxQueuesService;
