/**
 * useStageStats.js - Hook de Estadísticas de Etapas
 * Calcula estadísticas agregadas por etapa desde fondos
 */

import { useMemo } from 'react';
import { PIPELINE_STAGES } from '../utils/pipelineConfig';

/**
 * useStageStats - Hook para calcular estadísticas de etapas
 * @param {Map<string, ParsedFondo>} fondosMap - Map de fondos parseados
 * @returns {StageStats} - Estadísticas por etapa
 */
export const useStageStats = (fondosMap) => {
  // Calcular estadísticas por etapa
  const stageStats = useMemo(() => {
    return computeStageStats(fondosMap);
  }, [fondosMap]);

  // Estadísticas generales (summary)
  const generalStats = useMemo(() => {
    return computeGeneralStats(fondosMap);
  }, [fondosMap]);

  // Progreso por etapa (% completado)
  const stageProgress = useMemo(() => {
    return computeStageProgress(stageStats);
  }, [stageStats]);

  // Etapa con más errores
  const stageWithMostErrors = useMemo(() => {
    return findStageWithMostErrors(stageStats);
  }, [stageStats]);

  // Etapa con más warnings
  const stageWithMostWarnings = useMemo(() => {
    return findStageWithMostWarnings(stageStats);
  }, [stageStats]);

  // Etapas activas (en progreso)
  const activeStages = useMemo(() => {
    return findActiveStages(stageStats);
  }, [stageStats]);

  return {
    stageStats,
    generalStats,
    stageProgress,
    stageWithMostErrors,
    stageWithMostWarnings,
    activeStages,
  };
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * computeStageStats - Calcula estadísticas por etapa
 * @param {Map<string, ParsedFondo>} fondosMap - Map de fondos
 * @returns {Object} - Estadísticas por etapa (index 0-7)
 */
function computeStageStats(fondosMap) {
  const stats = {};

  // Inicializar stats para 8 etapas
  PIPELINE_STAGES.forEach((stage, index) => {
    stats[index] = {
      stageId: stage.id,
      stageName: stage.nombre,
      ok: 0,
      error: 0,
      warning: 0,
      enProgreso: 0,
      pendiente: 0,
      omitido: 0,
      na: 0,
      total: 0,
    };
  });

  // Contar estados por etapa
  fondosMap.forEach(fondo => {
    if (!fondo.stages) return;

    fondo.stages.forEach((stage, index) => {
      const stageStats = stats[index];
      stageStats.total++;

      switch (stage.estado) {
        case 'OK':
          stageStats.ok++;
          break;
        case 'ERROR':
          stageStats.error++;
          break;
        case 'WARNING':
          stageStats.warning++;
          break;
        case 'EN_PROGRESO':
          stageStats.enProgreso++;
          break;
        case 'PENDIENTE':
          stageStats.pendiente++;
          break;
        case 'OMITIDO':
          stageStats.omitido++;
          break;
        case 'N/A':
          stageStats.na++;
          break;
        default:
          break;
      }
    });
  });

  return stats;
}

/**
 * computeGeneralStats - Calcula estadísticas generales
 * @param {Map<string, ParsedFondo>} fondosMap - Map de fondos
 * @returns {Object} - Estadísticas generales
 */
function computeGeneralStats(fondosMap) {
  const stats = {
    total: fondosMap.size,
    ok: 0,
    error: 0,
    warning: 0,
    enProgreso: 0,
    pendiente: 0,
    parcial: 0,
    omitido: 0,
    completados: 0,
    porcentajeExito: 0,
    porcentajeError: 0,
    porcentajeWarning: 0,
  };

  fondosMap.forEach(fondo => {
    // Contar por status final (usando valores numéricos del enum)
    switch (fondo.status) {
      case 2: // OK
        stats.ok++;
        stats.completados++;
        break;
      case 4: // ERROR
        stats.error++;
        stats.completados++;
        break;
      case 3: // WARNING
        stats.warning++;
        stats.completados++;
        break;
      case 5: // PARCIAL
        stats.parcial++;
        stats.completados++;
        break;
      case 1: // EN_PROGRESO
        stats.enProgreso++;
        break;
      case 0: // PENDIENTE
        stats.pendiente++;
        break;
      case 6: // OMITIDO
        stats.omitido++;
        break;
      default:
        break;
    }
  });

  // Calcular porcentajes
  if (stats.completados > 0) {
    stats.porcentajeExito = Math.round((stats.ok / stats.completados) * 100);
    stats.porcentajeError = Math.round((stats.error / stats.completados) * 100);
    stats.porcentajeWarning = Math.round((stats.warning / stats.completados) * 100);
  }

  return stats;
}

/**
 * computeStageProgress - Calcula progreso por etapa
 * @param {Object} stageStats - Estadísticas por etapa
 * @returns {Object} - Progreso por etapa (0-100)
 */
function computeStageProgress(stageStats) {
  const progress = {};

  Object.keys(stageStats).forEach(stageIndex => {
    const stats = stageStats[stageIndex];

    if (stats.total === 0) {
      progress[stageIndex] = 0;
      return;
    }

    // Progreso = (ok + error + warning) / total
    const completed = stats.ok + stats.error + stats.warning;
    progress[stageIndex] = Math.round((completed / stats.total) * 100);
  });

  return progress;
}

/**
 * findStageWithMostErrors - Encuentra etapa con más errores
 * @param {Object} stageStats - Estadísticas por etapa
 * @returns {Object|null} - { stageIndex, count } o null
 */
function findStageWithMostErrors(stageStats) {
  let maxErrors = 0;
  let stageIndex = null;

  Object.keys(stageStats).forEach(index => {
    const stats = stageStats[index];
    if (stats.error > maxErrors) {
      maxErrors = stats.error;
      stageIndex = parseInt(index);
    }
  });

  if (stageIndex === null) return null;

  return {
    stageIndex,
    stageId: stageStats[stageIndex].stageId,
    stageName: stageStats[stageIndex].stageName,
    count: maxErrors,
  };
}

/**
 * findStageWithMostWarnings - Encuentra etapa con más warnings
 * @param {Object} stageStats - Estadísticas por etapa
 * @returns {Object|null} - { stageIndex, count } o null
 */
function findStageWithMostWarnings(stageStats) {
  let maxWarnings = 0;
  let stageIndex = null;

  Object.keys(stageStats).forEach(index => {
    const stats = stageStats[index];
    if (stats.warning > maxWarnings) {
      maxWarnings = stats.warning;
      stageIndex = parseInt(index);
    }
  });

  if (stageIndex === null) return null;

  return {
    stageIndex,
    stageId: stageStats[stageIndex].stageId,
    stageName: stageStats[stageIndex].stageName,
    count: maxWarnings,
  };
}

/**
 * findActiveStages - Encuentra etapas activas (en progreso)
 * @param {Object} stageStats - Estadísticas por etapa
 * @returns {Array<Object>} - Array de etapas activas
 */
function findActiveStages(stageStats) {
  const active = [];

  Object.keys(stageStats).forEach(index => {
    const stats = stageStats[index];
    if (stats.enProgreso > 0) {
      active.push({
        stageIndex: parseInt(index),
        stageId: stats.stageId,
        stageName: stats.stageName,
        count: stats.enProgreso,
      });
    }
  });

  return active;
}

export default useStageStats;
