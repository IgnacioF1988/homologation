/**
 * Formatters - Pipeline ETL
 * Funciones de formateo para tiempos, estados, números, etc.
 */

import { ESTADO_LABELS } from './constants';

/**
 * formatDuration - Formatea duración en ms a string legible
 * @param {number} durationMs - Duración en milisegundos
 * @returns {string} - Duración formateada (ej: "2m 30s", "45s", "1h 15m")
 */
export const formatDuration = (durationMs) => {
  if (!durationMs || durationMs < 0) return '-';

  const seconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  }

  if (minutes > 0) {
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  }

  return `${seconds}s`;
};

/**
 * formatTimestamp - Formatea timestamp a string legible
 * @param {Date|string|number} timestamp - Timestamp a formatear
 * @param {boolean} includeTime - Incluir hora
 * @returns {string} - Timestamp formateado
 */
export const formatTimestamp = (timestamp, includeTime = true) => {
  if (!timestamp) return '-';

  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);

  if (isNaN(date.getTime())) return '-';

  const options = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  };

  if (includeTime) {
    options.hour = '2-digit';
    options.minute = '2-digit';
    options.second = '2-digit';
  }

  return new Intl.DateTimeFormat('es-CL', options).format(date);
};

/**
 * formatTimeAgo - Formatea timestamp como tiempo relativo
 * @param {Date|string|number} timestamp - Timestamp
 * @returns {string} - Tiempo relativo (ej: "hace 2 minutos", "hace 1 hora")
 */
export const formatTimeAgo = (timestamp) => {
  if (!timestamp) return '-';

  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) return 'hace unos segundos';
  if (diffMinutes < 60) return `hace ${diffMinutes} min`;
  if (diffHours < 24) return `hace ${diffHours}h`;
  return `hace ${diffDays}d`;
};

/**
 * mapStatusLabel - Obtiene label legible de un estado
 * @param {string} status - Estado
 * @returns {string} - Label legible
 */
export const mapStatusLabel = (status) => {
  return ESTADO_LABELS[status] || status;
};

/**
 * formatPercentage - Formatea número como porcentaje
 * @param {number} value - Valor (0-100)
 * @param {number} decimals - Decimales a mostrar
 * @returns {string} - Porcentaje formateado
 */
export const formatPercentage = (value, decimals = 0) => {
  if (value === null || value === undefined) return '-';
  return `${value.toFixed(decimals)}%`;
};

/**
 * formatNumber - Formatea número con separadores de miles
 * @param {number} value - Número a formatear
 * @param {number} decimals - Decimales a mostrar
 * @returns {string} - Número formateado
 */
export const formatNumber = (value, decimals = 0) => {
  if (value === null || value === undefined) return '-';
  return new Intl.NumberFormat('es-CL', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(value);
};

/**
 * formatCurrency - Formatea número como moneda
 * @param {number} value - Valor
 * @param {string} currency - Código de moneda (default: CLP)
 * @returns {string} - Moneda formateada
 */
export const formatCurrency = (value, currency = 'CLP') => {
  if (value === null || value === undefined) return '-';
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
};

/**
 * formatFundName - Formatea nombre de fondo (uppercase)
 * @param {string} fundName - Nombre del fondo
 * @returns {string} - Nombre formateado
 */
export const formatFundName = (fundName) => {
  if (!fundName) return '-';
  return fundName.toUpperCase();
};

/**
 * formatFechaNombreCorto - Formatea fecha de reporte como string corto
 * @param {string} fechaReporte - Fecha en formato YYYY-MM-DD
 * @returns {string} - Fecha corta (ej: "24 Oct")
 */
export const formatFechaCorta = (fechaReporte) => {
  if (!fechaReporte) return '-';

  const date = new Date(fechaReporte + 'T00:00:00');
  const options = { day: 'numeric', month: 'short' };
  return new Intl.DateTimeFormat('es-CL', options).format(date);
};

/**
 * formatFechaCompleta - Formatea fecha de reporte como string completo
 * @param {string} fechaReporte - Fecha en formato YYYY-MM-DD
 * @returns {string} - Fecha completa (ej: "24 de Octubre de 2025")
 */
export const formatFechaCompleta = (fechaReporte) => {
  if (!fechaReporte) return '-';

  const date = new Date(fechaReporte + 'T00:00:00');
  const options = { day: 'numeric', month: 'long', year: 'numeric' };
  return new Intl.DateTimeFormat('es-CL', options).format(date);
};

/**
 * formatExecutionId - Formatea ID de ejecución con padding
 * @param {number|bigint} idEjecucion - ID de ejecución
 * @returns {string} - ID formateado (ej: "#00123")
 */
export const formatExecutionId = (idEjecucion) => {
  if (!idEjecucion) return '-';
  return `#${String(idEjecucion).padStart(5, '0')}`;
};

/**
 * truncateText - Trunca texto largo con ellipsis
 * @param {string} text - Texto a truncar
 * @param {number} maxLength - Longitud máxima
 * @returns {string} - Texto truncado
 */
export const truncateText = (text, maxLength = 50) => {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.substring(0, maxLength)}...`;
};

/**
 * formatProgressText - Formatea texto de progreso
 * @param {number} completed - Completados
 * @param {number} total - Total
 * @returns {string} - Texto de progreso (ej: "5 / 10")
 */
export const formatProgressText = (completed, total) => {
  if (total === 0) return '-';
  return `${completed} / ${total}`;
};

/**
 * calculateProgressPercentage - Calcula porcentaje de progreso
 * @param {number} completed - Completados
 * @param {number} total - Total
 * @returns {number} - Porcentaje (0-100)
 */
export const calculateProgressPercentage = (completed, total) => {
  if (total === 0) return 0;
  return Math.round((completed / total) * 100);
};
