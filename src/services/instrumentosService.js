/**
 * Servicio para gestión de instrumentos financieros
 */

import { apiClient } from './apiClient';

export const instrumentosService = {
  /**
   * Obtiene instrumentos con paginación
   * @param {Object} options - Opciones de paginación
   * @param {number} options.page - Página (default 1)
   * @param {number} options.limit - Límite por página (default 100, max 500)
   * @param {string} options.orderBy - Campo para ordenar (default 'idInstrumento')
   * @param {string} options.order - Dirección 'ASC' o 'DESC' (default 'ASC')
   */
  async getAll(options = {}) {
    const { page = 1, limit = 100, orderBy = 'idInstrumento', order = 'ASC' } = options;
    const response = await apiClient.get('/instrumentos', { page, limit, orderBy, order });
    return response; // Devolver objeto completo { success, data, pagination }
  },

  /**
   * Obtiene una página específica de instrumentos para infinite scroll
   * @param {number} page - Número de página
   * @param {number} limit - Cantidad por página
   */
  async getPage(page = 1, limit = 100) {
    const response = await apiClient.get('/instrumentos', {
      page,
      limit,
      orderBy: 'idInstrumento',
      order: 'ASC',
    });
    return response;
  },

  /**
   * Busca instrumentos por término con soporte para paginación
   * @param {string} query - Término de búsqueda
   * @param {number} limit - Cantidad de resultados por página (default 50)
   * @param {number} page - Número de página (default 1)
   */
  async search(query, limit = 50, page = 1) {
    const response = await apiClient.get('/instrumentos/search', { q: query, limit, page });
    // Devolver respuesta completa para que el componente verifique success
    return response;
  },

  /**
   * Obtiene un instrumento por ID (puede retornar múltiples si hay diferentes monedas)
   */
  async getById(id) {
    const response = await apiClient.get(`/instrumentos/${id}`);
    return response; // Devolver objeto completo
  },

  /**
   * Obtiene un instrumento por clave primaria compuesta (id + moneda)
   */
  async getByPK(id, moneda) {
    const response = await apiClient.get(`/instrumentos/${id}/moneda/${moneda}`);
    return response; // Devolver objeto completo
  },

  /**
   * Crea un nuevo instrumento
   */
  async create(data) {
    const response = await apiClient.post('/instrumentos', data);
    return response; // Devolver objeto completo
  },

  /**
   * Actualiza un instrumento existente
   */
  async update(id, moneda, data) {
    const response = await apiClient.put(`/instrumentos/${id}/${moneda}`, data);
    return response; // Devolver objeto completo
  },

  /**
   * Versiona un instrumento existente (cierra la versión actual y crea una nueva)
   * Usado para cambios de atributos que requieren tracking histórico
   */
  async version(id, moneda, data) {
    const response = await apiClient.post(`/instrumentos/${id}/${moneda}/version`, data);
    return response; // Devolver objeto completo
  },

  /**
   * Elimina un instrumento
   */
  async delete(id, moneda) {
    const response = await apiClient.delete(`/instrumentos/${id}/${moneda}`);
    return response; // Devolver objeto completo
  },

  /**
   * Verifica si existe un duplicado para un campo específico
   */
  async checkDuplicate(field, value, excludeId = null, excludeMoneda = null) {
    const params = { field, value };
    if (excludeId) params.excludeId = excludeId;
    if (excludeMoneda) params.excludeMoneda = excludeMoneda;

    const response = await apiClient.get('/instrumentos/check-duplicate', params);
    return {
      isDuplicate: response.isDuplicate,
      existingRecords: response.data || [],
    };
  },

  /**
   * Verifica duplicados para múltiples campos a la vez
   */
  async checkAllDuplicates(fields, excludeId = null, excludeMoneda = null) {
    const results = {};

    await Promise.all(
      Object.entries(fields)
        .filter(([, value]) => value && value.trim())
        .map(async ([field, value]) => {
          try {
            const result = await this.checkDuplicate(field, value, excludeId, excludeMoneda);
            results[field] = result;
          } catch (error) {
            console.warn(`Error checking duplicate for ${field}:`, error);
            results[field] = { isDuplicate: false, existingRecords: [], error: true };
          }
        })
    );

    return results;
  },

  /**
   * Obtiene instrumentos filtrados por criterios
   */
  async getFiltered(filters = {}) {
    // Por ahora, obtener todos y filtrar en cliente
    // En el futuro, implementar filtros en el backend
    const response = await this.getAll();
    const allInstruments = response.data || [];

    const filtered = allInstruments.filter(instrument => {
      return Object.entries(filters).every(([key, value]) => {
        if (value === undefined || value === null || value === '') return true;
        return instrument[key] === value;
      });
    });

    return { success: true, data: filtered };
  },

  /**
   * Cuenta instrumentos por un campo específico (para estadísticas)
   */
  async countBy(field) {
    const response = await this.getAll();
    const allInstruments = response.data || [];

    const counts = allInstruments.reduce((acc, instrument) => {
      const value = instrument[field] || 'Sin especificar';
      acc[value] = (acc[value] || 0) + 1;
      return acc;
    }, {});

    return { success: true, data: counts };
  },

  /**
   * Alias para getByPK (compatibilidad con código existente)
   */
  getByIdAndMoneda(id, moneda) {
    return this.getByPK(id, moneda);
  },

  /**
   * Obtiene el siguiente ID disponible para crear un nuevo instrumento
   */
  async getNextId() {
    const response = await apiClient.get('/instrumentos/next-id');
    return response;
  },

  /**
   * Obtiene TODOS los instrumentos cargando páginas en paralelo
   * Elimina duplicados usando idInstrumento + subId como llave única
   *
   * @param {Object} options - Opciones
   * @param {Function} options.onProgress - Callback de progreso (loaded, total)
   * @returns {Promise<{success: boolean, data: Array, total: number}>}
   */
  async getAllComplete(options = {}) {
    const { onProgress } = options;
    const pageSize = 500; // Máximo permitido por el backend

    try {
      // Primera llamada para obtener el total
      const firstResponse = await apiClient.get('/instrumentos', {
        page: 1,
        limit: pageSize,
        orderBy: 'idInstrumento',
        order: 'ASC',
      });

      if (!firstResponse.success) {
        return { success: false, data: [], total: 0 };
      }

      const total = firstResponse.pagination?.total || firstResponse.data?.length || 0;
      const totalPages = Math.ceil(total / pageSize);

      // Iniciar con los datos de la primera página
      let allData = [...(firstResponse.data || [])];

      if (onProgress) {
        onProgress(allData.length, total);
      }

      // Si hay más páginas, cargarlas en paralelo (en lotes para no sobrecargar)
      if (totalPages > 1) {
        const batchSize = 5; // Cargar 5 páginas en paralelo

        for (let batchStart = 2; batchStart <= totalPages; batchStart += batchSize) {
          const batchEnd = Math.min(batchStart + batchSize - 1, totalPages);
          const pagePromises = [];

          for (let page = batchStart; page <= batchEnd; page++) {
            pagePromises.push(
              apiClient.get('/instrumentos', {
                page,
                limit: pageSize,
                orderBy: 'idInstrumento',
                order: 'ASC',
              })
            );
          }

          const responses = await Promise.all(pagePromises);

          for (const response of responses) {
            if (response.success && response.data) {
              allData = allData.concat(response.data);
            }
          }

          if (onProgress) {
            onProgress(allData.length, total);
          }
        }
      }

      // Eliminar duplicados usando idInstrumento + subId como llave única
      const uniqueMap = new Map();
      for (const instrument of allData) {
        // Crear llave única: idInstrumento-subId (subId puede ser null/undefined)
        const key = `${instrument.idInstrumento}-${instrument.subId || ''}`;

        // Si ya existe, mantener el más reciente (por fechaModificacion o fechaCreacion)
        if (uniqueMap.has(key)) {
          const existing = uniqueMap.get(key);
          const existingDate = existing.fechaModificacion || existing.fechaCreacion || '';
          const newDate = instrument.fechaModificacion || instrument.fechaCreacion || '';

          if (newDate > existingDate) {
            uniqueMap.set(key, instrument);
          }
        } else {
          uniqueMap.set(key, instrument);
        }
      }

      const uniqueData = Array.from(uniqueMap.values());

      return {
        success: true,
        data: uniqueData,
        total: uniqueData.length,
        originalTotal: total,
        duplicatesRemoved: allData.length - uniqueData.length,
      };
    } catch (error) {
      console.error('Error cargando todos los instrumentos:', error);
      return { success: false, data: [], total: 0, error: error.message };
    }
  },
};

export default instrumentosService;
