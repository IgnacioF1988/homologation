/**
 * Servicio para gestión de procesos batch
 * Sistema de ejecución paralela por fondo con logging estructurado
 */

import { apiClient } from './apiClient';

export const procesosService = {
  // ============================================
  // Ejecución de Pipeline
  // ============================================

  /**
   * Ejecuta el proceso con procesamiento paralelo por fondo
   * @param {Object} params - { fechaReporte: 'YYYY-MM-DD', fondos?: string[] }
   * @returns {Promise} - { ID_Ejecucion, FechaReporte, Estado, ... }
   */
  ejecutar: (params) =>
    apiClient.post('/procesos/v2/ejecutar', params),

  // Alias para compatibilidad
  ejecutarV2: (params) =>
    apiClient.post('/procesos/v2/ejecutar', params),

  /**
   * Obtiene el estado completo de una ejecución
   * Incluye: ejecución, fondos con estado por etapa, logs recientes
   * @param {number} idEjecucion 
   * @returns {Promise} - { ejecucion, fondos, logs, metricas }
   */
  getEjecucionEstado: (idEjecucion) =>
    apiClient.get(`/procesos/v2/ejecucion/${idEjecucion}`),

  /**
   * Obtiene el historial de ejecuciones
   * @param {Object} params - { fechaDesde?, fechaHasta?, limit? }
   */
  getHistorialEjecuciones: (params = {}) =>
    apiClient.get('/procesos/v2/historial', params),

  /**
   * Obtiene los fondos de una ejecución con filtros
   * @param {number} idEjecucion 
   * @param {Object} params - { estado?, etapa? }
   */
  getEjecucionFondos: (idEjecucion, params = {}) =>
    apiClient.get(`/procesos/v2/ejecucion/${idEjecucion}/fondos`, params),

  /**
   * Obtiene los logs de una ejecución
   * @param {number} idEjecucion 
   * @param {Object} params - { idFund?, nivel?, etapa?, offset?, limit? }
   */
  getEjecucionLogs: (idEjecucion, params = {}) =>
    apiClient.get(`/procesos/v2/ejecucion/${idEjecucion}/logs`, params),

  /**
   * Obtiene las métricas de una ejecución
   * @param {number} idEjecucion 
   * @param {string} idFund - opcional, para filtrar por fondo
   */
  getEjecucionMetricas: (idEjecucion, idFund = null) => {
    const params = idFund ? { idFund } : {};
    return apiClient.get(`/procesos/v2/ejecucion/${idEjecucion}/metricas`, params);
  },

  /**
   * Reprocesa un fondo específico que falló
   * @param {number} idEjecucion 
   * @param {string} idFund 
   */
  reprocesarFondo: (idEjecucion, idFund) =>
    apiClient.post(`/procesos/v2/ejecucion/${idEjecucion}/reprocesar`, { idFund }),

  /**
   * Reprocesa todos los fondos con error de una ejecución
   * @param {number} idEjecucion 
   */
  reprocesarFondosFallidos: (idEjecucion) =>
    apiClient.post(`/procesos/v2/ejecucion/${idEjecucion}/reprocesar-fallidos`),

  /**
   * Cancela una ejecución en progreso
   * @param {number} idEjecucion 
   */
  cancelarEjecucion: (idEjecucion) =>
    apiClient.post(`/procesos/v2/ejecucion/${idEjecucion}/cancelar`),

  // ============================================
  // API de Pipeline/Etapas
  // ============================================

  /**
   * Obtiene la configuración del pipeline (etapas, dependencias, etc.)
   */
  getPipelineConfig: () =>
    apiClient.get('/procesos/v2/pipeline/config'),

  /**
   * Obtiene estadísticas agregadas por etapa para una ejecución
   * @param {number} idEjecucion 
   */
  getEstadisticasPorEtapa: (idEjecucion) =>
    apiClient.get(`/procesos/v2/ejecucion/${idEjecucion}/estadisticas-etapas`),

  // ============================================
  // Diagnóstico
  // ============================================

  /**
   * Obtiene diagnóstico de una ejecución
   * @param {number} idEjecucion
   */
  getDiagnosticoEjecucion: (idEjecucion) =>
    apiClient.get(`/procesos/v2/ejecucion/${idEjecucion}/diagnostico`),

  // ============================================
  // Comparación y análisis
  // ============================================

  /**
   * Compara dos ejecuciones
   * @param {number} idEjecucion1 
   * @param {number} idEjecucion2 
   */
  compararEjecuciones: (idEjecucion1, idEjecucion2) =>
    apiClient.get('/procesos/v2/comparar', { id1: idEjecucion1, id2: idEjecucion2 }),

  /**
   * Obtiene tendencias de un fondo a través de múltiples ejecuciones
   * @param {string} idFund 
   * @param {Object} params - { limit? }
   */
  getTendenciasFondo: (idFund, params = {}) =>
    apiClient.get(`/procesos/v2/fondo/${idFund}/tendencias`, params),
};

export default procesosService;
