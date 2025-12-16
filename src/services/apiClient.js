/**
 * Cliente API genérico con manejo de errores y retry
 */

import { config } from './config';

class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Realiza una petición HTTP con retry automático
 */
async function fetchWithRetry(url, options = {}, retries = config.MAX_RETRIES) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.REQUEST_TIMEOUT);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    clearTimeout(timeoutId);

    const data = await response.json();

    if (!response.ok) {
      throw new ApiError(
        data.error || `HTTP ${response.status}`,
        response.status,
        data
      );
    }

    return data;
  } catch (error) {
    clearTimeout(timeoutId);

    // Si es un error de red o timeout y tenemos retries disponibles
    if (retries > 0 && (error.name === 'AbortError' || error.name === 'TypeError')) {
      console.warn(`Retry ${config.MAX_RETRIES - retries + 1}/${config.MAX_RETRIES} para ${url}`);
      await sleep(config.RETRY_DELAY);
      return fetchWithRetry(url, options, retries - 1);
    }

    throw error;
  }
}

/**
 * Cliente API con métodos convenientes
 */
export const apiClient = {
  /**
   * GET request
   */
  async get(endpoint, params = {}) {
    const url = new URL(`${config.API_BASE_URL}${endpoint}`);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, value);
      }
    });

    return fetchWithRetry(url.toString(), { method: 'GET' });
  },

  /**
   * POST request
   */
  async post(endpoint, body = {}) {
    return fetchWithRetry(`${config.API_BASE_URL}${endpoint}`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  /**
   * PUT request
   */
  async put(endpoint, body = {}) {
    return fetchWithRetry(`${config.API_BASE_URL}${endpoint}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  },

  /**
   * PATCH request
   */
  async patch(endpoint, body = {}) {
    return fetchWithRetry(`${config.API_BASE_URL}${endpoint}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  },

  /**
   * DELETE request
   */
  async delete(endpoint, params = {}) {
    const url = new URL(`${config.API_BASE_URL}${endpoint}`);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, value);
      }
    });

    return fetchWithRetry(url.toString(), { method: 'DELETE' });
  },
};

export { ApiError };
export default apiClient;
