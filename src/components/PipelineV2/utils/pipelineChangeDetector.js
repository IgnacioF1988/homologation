/**
 * pipelineChangeDetector.js - Detección de Cambios
 * Detecta cambios entre estados de fondos para optimizar re-renders y animaciones
 */

/**
 * detectChanges - Detecta cambios entre dos fondos
 * @param {ParsedFondo} oldFondo - Fondo anterior
 * @param {ParsedFondo} newFondo - Fondo nuevo
 * @returns {ChangeInfo} - Información de cambios
 */
export const detectChanges = (oldFondo, newFondo) => {
  if (!oldFondo || !newFondo) {
    return {
      hasChanges: true,
      changedFields: [],
      changedStages: [],
      statusChanged: false,
      stagesChanged: false,
      errorChanged: false,
      timingChanged: false,
    };
  }

  // Comparación rápida por hash
  if (oldFondo._hash === newFondo._hash) {
    return {
      hasChanges: false,
      changedFields: [],
      changedStages: [],
      statusChanged: false,
      stagesChanged: false,
      errorChanged: false,
      timingChanged: false,
    };
  }

  // Detección detallada
  const changedFields = detectFieldChanges(oldFondo, newFondo);
  const changedStages = detectStageChanges(oldFondo.stages, newFondo.stages);
  const statusChanged = oldFondo.status !== newFondo.status;
  const stagesChanged = changedStages.length > 0;
  const errorChanged = detectErrorChanged(oldFondo, newFondo);
  const timingChanged = detectTimingChanged(oldFondo, newFondo);

  return {
    hasChanges: true,
    changedFields,
    changedStages,
    statusChanged,
    stagesChanged,
    errorChanged,
    timingChanged,
  };
};

/**
 * detectFieldChanges - Detecta qué campos específicos cambiaron
 * @param {ParsedFondo} oldFondo - Fondo anterior
 * @param {ParsedFondo} newFondo - Fondo nuevo
 * @returns {Array<string>} - Array de nombres de campos que cambiaron
 */
export const detectFieldChanges = (oldFondo, newFondo) => {
  const changed = [];

  // Campos primitivos a comparar
  const fieldsToCheck = [
    'status',
    'hasError',
    'hasWarning',
    'isProcessing',
    'startTime',
    'endTime',
    'duration',
    'flags',
  ];

  fieldsToCheck.forEach(field => {
    if (oldFondo[field] !== newFondo[field]) {
      changed.push(field);
    }
  });

  // Comparar errorInfo
  if (JSON.stringify(oldFondo.errorInfo) !== JSON.stringify(newFondo.errorInfo)) {
    changed.push('errorInfo');
  }

  return changed;
};

/**
 * detectStageChanges - Detecta qué etapas cambiaron
 * @param {Array<StageStatus>} oldStages - Etapas anteriores
 * @param {Array<StageStatus>} newStages - Etapas nuevas
 * @returns {Array<number>} - Índices de etapas que cambiaron
 */
export const detectStageChanges = (oldStages, newStages) => {
  if (!oldStages || !newStages) return [];
  if (oldStages.length !== newStages.length) return [];

  const changed = [];

  oldStages.forEach((oldStage, index) => {
    const newStage = newStages[index];
    if (oldStage.estado !== newStage.estado) {
      changed.push(index);
    }
  });

  return changed;
};

/**
 * detectErrorChanged - Detecta si cambió el estado de error
 * @param {ParsedFondo} oldFondo - Fondo anterior
 * @param {ParsedFondo} newFondo - Fondo nuevo
 * @returns {boolean} - True si cambió
 */
export const detectErrorChanged = (oldFondo, newFondo) => {
  const oldHasError = oldFondo.hasError;
  const newHasError = newFondo.hasError;

  if (oldHasError !== newHasError) return true;

  // Si ambos tienen error, comparar mensaje
  if (oldHasError && newHasError) {
    return JSON.stringify(oldFondo.errorInfo) !== JSON.stringify(newFondo.errorInfo);
  }

  return false;
};

/**
 * detectTimingChanged - Detecta si cambió timing (inicio/fin)
 * @param {ParsedFondo} oldFondo - Fondo anterior
 * @param {ParsedFondo} newFondo - Fondo nuevo
 * @returns {boolean} - True si cambió
 */
export const detectTimingChanged = (oldFondo, newFondo) => {
  return (
    oldFondo.startTime !== newFondo.startTime ||
    oldFondo.endTime !== newFondo.endTime ||
    oldFondo.duration !== newFondo.duration
  );
};

/**
 * computeHash - Calcula hash detallado de un fondo
 * @param {ParsedFondo} fondo - Fondo parseado
 * @returns {string} - Hash
 */
export const computeHash = (fondo) => {
  if (!fondo) return '';

  // Incluir todos los campos críticos
  const parts = [
    fondo.id,
    fondo.status,
    fondo.hasError ? '1' : '0',
    fondo.hasWarning ? '1' : '0',
    fondo.isProcessing ? '1' : '0',
    fondo.startTime || '',
    fondo.endTime || '',
    fondo.duration || '',
    fondo.flags,
  ];

  // Agregar estados de stages
  if (fondo.stages) {
    parts.push(fondo.stages.map(s => s.estado).join('|'));
  }

  // Agregar error info
  if (fondo.errorInfo) {
    parts.push(fondo.errorInfo.step, fondo.errorInfo.message);
  }

  return parts.join('::');
};

/**
 * computeQuickHash - Calcula hash rápido solo con campos esenciales
 * @param {ParsedFondo} fondo - Fondo parseado
 * @returns {string} - Hash rápido
 */
export const computeQuickHash = (fondo) => {
  if (!fondo) return '';

  return [
    fondo.id,
    fondo.status,
    fondo.stages ? fondo.stages.map(s => s.estado).join('|') : '',
  ].join('::');
};

/**
 * hasStageCompleted - Detecta si una etapa pasó de no-completada a completada
 * @param {StageStatus} oldStage - Etapa anterior
 * @param {StageStatus} newStage - Etapa nueva
 * @returns {boolean} - True si se completó
 */
export const hasStageCompleted = (oldStage, newStage) => {
  const completedStates = ['OK', 'ERROR', 'WARNING'];
  const wasNotCompleted = !completedStates.includes(oldStage.estado);
  const isNowCompleted = completedStates.includes(newStage.estado);

  return wasNotCompleted && isNowCompleted;
};

/**
 * hasStageStarted - Detecta si una etapa pasó de PENDIENTE a EN_PROGRESO
 * @param {StageStatus} oldStage - Etapa anterior
 * @param {StageStatus} newStage - Etapa nueva
 * @returns {boolean} - True si empezó
 */
export const hasStageStarted = (oldStage, newStage) => {
  return oldStage.estado === 'PENDIENTE' && newStage.estado === 'EN_PROGRESO';
};

/**
 * hasStageFailed - Detecta si una etapa falló
 * @param {StageStatus} oldStage - Etapa anterior
 * @param {StageStatus} newStage - Etapa nueva
 * @returns {boolean} - True si falló
 */
export const hasStageFailed = (oldStage, newStage) => {
  return oldStage.estado !== 'ERROR' && newStage.estado === 'ERROR';
};

/**
 * getStageTransition - Obtiene el tipo de transición de una etapa
 * @param {StageStatus} oldStage - Etapa anterior
 * @param {StageStatus} newStage - Etapa nueva
 * @returns {string} - Tipo de transición: 'started', 'completed', 'failed', 'changed', 'none'
 */
export const getStageTransition = (oldStage, newStage) => {
  if (!oldStage || !newStage) return 'none';
  if (oldStage.estado === newStage.estado) return 'none';

  if (hasStageStarted(oldStage, newStage)) return 'started';
  if (hasStageFailed(oldStage, newStage)) return 'failed';
  if (hasStageCompleted(oldStage, newStage)) return 'completed';

  return 'changed';
};

/**
 * computeChangeMetrics - Calcula métricas de cambios entre dos snapshots
 * @param {Map<string, ParsedFondo>} oldFondosMap - Map anterior
 * @param {Map<string, ParsedFondo>} newFondosMap - Map nuevo
 * @returns {ChangeMetrics} - Métricas de cambios
 */
export const computeChangeMetrics = (oldFondosMap, newFondosMap) => {
  const metrics = {
    totalFondos: newFondosMap.size,
    changedFondos: 0,
    newFondos: 0,
    removedFondos: 0,
    stagesChanged: 0,
    statusChanges: {
      toOk: 0,
      toError: 0,
      toWarning: 0,
      toEnProgreso: 0,
    },
  };

  // Detectar fondos nuevos y cambiados
  newFondosMap.forEach((newFondo, id) => {
    const oldFondo = oldFondosMap.get(id);

    if (!oldFondo) {
      metrics.newFondos++;
      return;
    }

    const changes = detectChanges(oldFondo, newFondo);
    if (changes.hasChanges) {
      metrics.changedFondos++;
    }

    if (changes.stagesChanged) {
      metrics.stagesChanged += changes.changedStages.length;
    }

    if (changes.statusChanged) {
      switch (newFondo.status) {
        case 2: // OK
          metrics.statusChanges.toOk++;
          break;
        case 4: // ERROR
          metrics.statusChanges.toError++;
          break;
        case 3: // WARNING
          metrics.statusChanges.toWarning++;
          break;
        case 1: // EN_PROGRESO
          metrics.statusChanges.toEnProgreso++;
          break;
        default:
          break;
      }
    }
  });

  // Detectar fondos eliminados
  oldFondosMap.forEach((_, id) => {
    if (!newFondosMap.has(id)) {
      metrics.removedFondos++;
    }
  });

  return metrics;
};

/**
 * shouldAnimateChange - Determina si un cambio debe animarse
 * @param {ChangeInfo} changeInfo - Info de cambios
 * @returns {boolean} - True si debe animarse
 */
export const shouldAnimateChange = (changeInfo) => {
  if (!changeInfo.hasChanges) return false;

  // Animar cambios de status o stages
  return changeInfo.statusChanged || changeInfo.stagesChanged;
};

/**
 * getAnimationDuration - Calcula duración de animación basada en cambios
 * @param {ChangeInfo} changeInfo - Info de cambios
 * @returns {number} - Duración en ms
 */
export const getAnimationDuration = (changeInfo) => {
  if (!changeInfo.hasChanges) return 0;

  // Animaciones más largas para cambios de status
  if (changeInfo.statusChanged) return 800;

  // Animaciones moderadas para cambios de stages
  if (changeInfo.stagesChanged) return 500;

  // Animaciones cortas para otros cambios
  return 300;
};
