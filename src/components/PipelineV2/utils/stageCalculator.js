/**
 * stageCalculator.js - Lógica de Cálculo de Estados
 * Funciones para calcular estados, progreso y métricas de etapas
 */

import { PIPELINE_STAGES, getStageIndex, ETAPA_ACTUAL_MAP } from './pipelineConfig';

/**
 * getStageStatus - Obtiene el status de una etapa específica de un fondo
 * @param {ParsedFondo} fondo - Fondo parseado
 * @param {number} stageIndex - Índice de la etapa (0-7)
 * @returns {string} - Estado de la etapa ('OK', 'ERROR', etc.)
 */
export const getStageStatus = (fondo, stageIndex) => {
  if (!fondo || !fondo.stages || stageIndex < 0 || stageIndex >= fondo.stages.length) {
    return 'PENDIENTE';
  }

  return fondo.stages[stageIndex].estado;
};

/**
 * getStageStatusById - Obtiene status de una etapa por ID
 * @param {ParsedFondo} fondo - Fondo parseado
 * @param {string} stageId - ID de la etapa ('EXTRACCION', 'PROCESS_IPA', etc.)
 * @returns {string} - Estado de la etapa
 */
export const getStageStatusById = (fondo, stageId) => {
  const stageIndex = getStageIndex(stageId);
  if (stageIndex === -1) return 'PENDIENTE';

  return getStageStatus(fondo, stageIndex);
};

/**
 * calculateStageProgreso - Calcula progreso de una etapa (0-100)
 * Basado en sub-etapas si las tiene, o en estado principal
 * @param {ParsedFondo} fondo - Fondo parseado
 * @param {number} stageIndex - Índice de la etapa
 * @returns {number} - Progreso (0-100)
 */
export const calculateStageProgreso = (fondo, stageIndex) => {
  const status = getStageStatus(fondo, stageIndex);

  // Estados finales
  if (status === 'OK') return 100;
  if (status === 'ERROR') return 100; // Completado con error
  if (status === 'WARNING') return 100; // Completado con warning
  if (status === 'OMITIDO') return 100;
  if (status === 'N/A') return 0;

  // En progreso: calcular basado en sub-etapas si las tiene
  if (status === 'EN_PROGRESO') {
    // TODO: Implementar cálculo basado en sub-etapas cuando estén disponibles
    return 50; // Por ahora retornar 50%
  }

  // Pendiente
  return 0;
};

/**
 * calculateOverallProgreso - Calcula progreso general de un fondo (0-100)
 * @param {ParsedFondo} fondo - Fondo parseado
 * @returns {number} - Progreso general (0-100)
 */
export const calculateOverallProgreso = (fondo) => {
  if (!fondo || !fondo.stages) return 0;

  let totalProgress = 0;
  const totalStages = fondo.stages.length;

  fondo.stages.forEach((_, index) => {
    totalProgress += calculateStageProgreso(fondo, index);
  });

  return Math.round(totalProgress / totalStages);
};

/**
 * getCurrentStage - Obtiene la etapa actual de un fondo
 * @param {ParsedFondo} fondo - Fondo parseado
 * @returns {Object|null} - { index, stageId, estado } o null
 */
export const getCurrentStage = (fondo) => {
  if (!fondo || !fondo.stages) return null;

  // Buscar primera etapa EN_PROGRESO
  const enProgresoIndex = fondo.stages.findIndex(s => s.estado === 'EN_PROGRESO');
  if (enProgresoIndex !== -1) {
    return {
      index: enProgresoIndex,
      stageId: fondo.stages[enProgresoIndex].id,
      estado: 'EN_PROGRESO',
    };
  }

  // Buscar primera etapa PENDIENTE
  const pendienteIndex = fondo.stages.findIndex(s => s.estado === 'PENDIENTE');
  if (pendienteIndex !== -1) {
    return {
      index: pendienteIndex,
      stageId: fondo.stages[pendienteIndex].id,
      estado: 'PENDIENTE',
    };
  }

  // Si todas están completadas, retornar última
  return {
    index: fondo.stages.length - 1,
    stageId: fondo.stages[fondo.stages.length - 1].id,
    estado: fondo.stages[fondo.stages.length - 1].estado,
  };
};

/**
 * getCompletedStagesCount - Cuenta etapas completadas
 * @param {ParsedFondo} fondo - Fondo parseado
 * @returns {number} - Número de etapas completadas
 */
export const getCompletedStagesCount = (fondo) => {
  if (!fondo || !fondo.stages) return 0;

  return fondo.stages.filter(s =>
    s.estado === 'OK' ||
    s.estado === 'ERROR' ||
    s.estado === 'WARNING'
  ).length;
};

/**
 * getFailedStagesCount - Cuenta etapas fallidas
 * @param {ParsedFondo} fondo - Fondo parseado
 * @returns {number} - Número de etapas con error
 */
export const getFailedStagesCount = (fondo) => {
  if (!fondo || !fondo.stages) return 0;

  return fondo.stages.filter(s => s.estado === 'ERROR').length;
};

/**
 * hasStageStarted - Verifica si una etapa ha iniciado
 * @param {ParsedFondo} fondo - Fondo parseado
 * @param {number} stageIndex - Índice de la etapa
 * @returns {boolean} - True si ha iniciado
 */
export const hasStageStarted = (fondo, stageIndex) => {
  const status = getStageStatus(fondo, stageIndex);
  return status !== 'PENDIENTE' && status !== 'N/A';
};

/**
 * hasStageCompleted - Verifica si una etapa ha completado
 * @param {ParsedFondo} fondo - Fondo parseado
 * @param {number} stageIndex - Índice de la etapa
 * @returns {boolean} - True si ha completado
 */
export const hasStageCompleted = (fondo, stageIndex) => {
  const status = getStageStatus(fondo, stageIndex);
  return status === 'OK' || status === 'ERROR' || status === 'WARNING' || status === 'OMITIDO';
};

/**
 * hasStageFailed - Verifica si una etapa ha fallado
 * @param {ParsedFondo} fondo - Fondo parseado
 * @param {number} stageIndex - Índice de la etapa
 * @returns {boolean} - True si ha fallado
 */
export const hasStageFailed = (fondo, stageIndex) => {
  return getStageStatus(fondo, stageIndex) === 'ERROR';
};

/**
 * isStageActive - Verifica si una etapa está activa (EN_PROGRESO)
 * @param {ParsedFondo} fondo - Fondo parseado
 * @param {number} stageIndex - Índice de la etapa
 * @returns {boolean} - True si está activa
 */
export const isStageActive = (fondo, stageIndex) => {
  return getStageStatus(fondo, stageIndex) === 'EN_PROGRESO';
};

/**
 * getStageColor - Obtiene color de una etapa basado en su estado
 * @param {ParsedFondo} fondo - Fondo parseado
 * @param {number} stageIndex - Índice de la etapa
 * @returns {string} - Color de la etapa
 */
export const getStageColor = (fondo, stageIndex) => {
  const status = getStageStatus(fondo, stageIndex);
  const stageConfig = PIPELINE_STAGES[stageIndex];

  // Si la etapa está OK, usar su color característico
  if (status === 'OK') {
    return stageConfig.color;
  }

  // Para otros estados, usar colores estándar de estado
  // Estos deben importarse de constants.js cuando sea necesario
  const statusColors = {
    'ERROR': '#f44336',
    'WARNING': '#ff9800',
    'EN_PROGRESO': '#2196f3',
    'PENDIENTE': '#9e9e9e',
    'OMITIDO': '#757575',
    'N/A': '#bdbdbd',
  };

  return statusColors[status] || '#9e9e9e';
};

/**
 * getEstimatedTimeRemaining - Estima tiempo restante de un fondo
 * @param {ParsedFondo} fondo - Fondo parseado
 * @param {number} avgDurationPerStage - Duración promedio por etapa (ms)
 * @returns {number|null} - Tiempo estimado en ms, o null
 */
export const getEstimatedTimeRemaining = (fondo, avgDurationPerStage = 30000) => {
  if (!fondo || !fondo.stages) return null;
  if (fondo.status === 2 || fondo.status === 4) return 0; // OK o ERROR (completado)

  const completedStages = getCompletedStagesCount(fondo);
  const remainingStages = fondo.stages.length - completedStages;

  return remainingStages * avgDurationPerStage;
};

/**
 * shouldShowSubStages - Determina si deben mostrarse sub-etapas
 * @param {ParsedFondo} fondo - Fondo parseado
 * @param {number} stageIndex - Índice de la etapa
 * @returns {boolean} - True si deben mostrarse
 */
export const shouldShowSubStages = (fondo, stageIndex) => {
  const status = getStageStatus(fondo, stageIndex);

  // Mostrar sub-etapas si la etapa está activa o completada
  return status === 'EN_PROGRESO' ||
         status === 'OK' ||
         status === 'ERROR' ||
         status === 'WARNING';
};

/**
 * getStageDisplayStatus - Obtiene status display-friendly
 * @param {string} estado - Estado raw
 * @returns {string} - Status legible
 */
export const getStageDisplayStatus = (estado) => {
  const displayMap = {
    'OK': 'Completado',
    'ERROR': 'Error',
    'WARNING': 'Advertencia',
    'EN_PROGRESO': 'En Progreso',
    'PENDIENTE': 'Pendiente',
    'OMITIDO': 'Omitido',
    'N/A': 'No Aplica',
  };

  return displayMap[estado] || estado;
};

/**
 * getCurrentStageFromEtapaActual - Obtiene índice de etapa desde Etapa_Actual
 * @param {string} etapaActual - Valor de Etapa_Actual del backend
 * @returns {number} - Índice de etapa (0-7) o -1
 */
export const getCurrentStageFromEtapaActual = (etapaActual) => {
  if (!etapaActual) return -1;

  const stageId = ETAPA_ACTUAL_MAP[etapaActual];
  if (!stageId) return -1;

  return getStageIndex(stageId);
};

/**
 * getStageTimeline - Obtiene timeline de etapas (cuándo empezó/terminó cada una)
 * @param {ParsedFondo} fondo - Fondo parseado
 * @returns {Array<Object>} - Array de timeline events
 */
export const getStageTimeline = (fondo) => {
  if (!fondo || !fondo.stages) return [];

  const timeline = [];

  fondo.stages.forEach((stage, index) => {
    if (hasStageStarted(fondo, index)) {
      timeline.push({
        stageIndex: index,
        stageId: stage.id,
        event: 'started',
        // timestamp: stage.startTime, // TODO: Implementar cuando backend provea timestamps por etapa
      });

      if (hasStageCompleted(fondo, index)) {
        timeline.push({
          stageIndex: index,
          stageId: stage.id,
          event: 'completed',
          status: stage.estado,
          // timestamp: stage.endTime, // TODO: Implementar cuando backend provea timestamps por etapa
        });
      }
    }
  });

  return timeline;
};
