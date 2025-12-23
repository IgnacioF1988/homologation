/**
 * PipelineFondosContext - Context de Fondos
 * Maneja estado de fondos (cambia frecuentemente durante polling)
 * Usa Map para O(1) lookups y tracking eficiente de cambios
 */

import { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { FINAL_STATUS } from '../utils/constants';

const PipelineFondosContext = createContext(null);

export const usePipelineFondos = () => {
  const context = useContext(PipelineFondosContext);
  if (!context) {
    throw new Error('usePipelineFondos must be used within PipelineFondosProvider');
  }
  return context;
};

export const PipelineFondosProvider = ({ children }) => {
  // Estado principal: Map para O(1) lookups
  const [fondosMap, setFondosMap] = useState(new Map());

  // Orden de fondos para renderizado
  const [fondosOrder, setFondosOrder] = useState([]);

  // Flags de cambios para optimizar re-renders
  const [changeFlags, setChangeFlags] = useState(new Map());

  /**
   * updateFondos - Actualiza múltiples fondos a la vez
   * @param {Array<ParsedFondo>} fondos - Array de fondos parseados
   */
  const updateFondos = useCallback((fondos) => {
    const newMap = new Map();
    const newOrder = [];
    const newChangeFlags = new Map();

    fondos.forEach(fondo => {
      newMap.set(fondo.id, fondo);
      newOrder.push(fondo.id);

      // Marcar si cambió respecto al estado anterior
      const oldFondo = fondosMap.get(fondo.id);
      if (oldFondo && oldFondo._hash !== fondo._hash) {
        newChangeFlags.set(fondo.id, {
          changed: true,
          timestamp: Date.now(),
          fields: detectChangedFields(oldFondo, fondo)
        });
      }
    });

    setFondosMap(newMap);
    setFondosOrder(newOrder);
    setChangeFlags(newChangeFlags);
  }, [fondosMap]);

  /**
   * updateFondo - Actualiza un solo fondo
   * @param {ParsedFondo} fondo - Fondo parseado
   */
  const updateFondo = useCallback((fondo) => {
    setFondosMap(prev => {
      const newMap = new Map(prev);
      newMap.set(fondo.id, fondo);
      return newMap;
    });

    setFondosOrder(prev => {
      if (!prev.includes(fondo.id)) {
        return [...prev, fondo.id];
      }
      return prev;
    });

    setChangeFlags(prev => {
      const oldFondo = fondosMap.get(fondo.id);
      if (oldFondo && oldFondo._hash !== fondo._hash) {
        const newFlags = new Map(prev);
        newFlags.set(fondo.id, {
          changed: true,
          timestamp: Date.now(),
          fields: detectChangedFields(oldFondo, fondo)
        });
        return newFlags;
      }
      return prev;
    });
  }, [fondosMap]);

  /**
   * removeFondo - Elimina un fondo
   * @param {string} fondoId - ID del fondo
   */
  const removeFondo = useCallback((fondoId) => {
    setFondosMap(prev => {
      const newMap = new Map(prev);
      newMap.delete(fondoId);
      return newMap;
    });

    setFondosOrder(prev => prev.filter(id => id !== fondoId));

    setChangeFlags(prev => {
      const newFlags = new Map(prev);
      newFlags.delete(fondoId);
      return newFlags;
    });
  }, []);

  /**
   * clearFondos - Limpia todos los fondos
   */
  const clearFondos = useCallback(() => {
    setFondosMap(new Map());
    setFondosOrder([]);
    setChangeFlags(new Map());
  }, []);

  /**
   * clearChangeFlags - Limpia flags de cambios (después de animaciones)
   */
  const clearChangeFlags = useCallback(() => {
    setChangeFlags(new Map());
  }, []);

  /**
   * getFondo - Obtiene un fondo por ID
   * @param {string} fondoId - ID del fondo
   * @returns {ParsedFondo|undefined} - Fondo o undefined
   */
  const getFondo = useCallback((fondoId) => {
    return fondosMap.get(fondoId);
  }, [fondosMap]);

  /**
   * hasChanges - Verifica si un fondo tiene cambios pendientes
   * @param {string} fondoId - ID del fondo
   * @returns {boolean} - True si tiene cambios
   */
  const hasChanges = useCallback((fondoId) => {
    return changeFlags.has(fondoId);
  }, [changeFlags]);

  /**
   * getChangeInfo - Obtiene info de cambios de un fondo
   * @param {string} fondoId - ID del fondo
   * @returns {Object|null} - Info de cambios o null
   */
  const getChangeInfo = useCallback((fondoId) => {
    return changeFlags.get(fondoId) || null;
  }, [changeFlags]);

  // Computed: Estadísticas agregadas por etapa
  const stageStats = useMemo(() => {
    return computeStageStats(fondosMap);
  }, [fondosMap]);

  // Computed: Contadores generales
  const generalStats = useMemo(() => {
    return computeGeneralStats(fondosMap);
  }, [fondosMap]);

  const value = {
    // Estado
    fondosMap,
    fondosOrder,
    changeFlags,

    // Acciones
    updateFondos,
    updateFondo,
    removeFondo,
    clearFondos,
    clearChangeFlags,

    // Queries
    getFondo,
    hasChanges,
    getChangeInfo,

    // Computed
    stageStats,
    generalStats,
  };

  return (
    <PipelineFondosContext.Provider value={value}>
      {children}
    </PipelineFondosContext.Provider>
  );
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * detectChangedFields - Detecta qué campos cambiaron entre dos fondos
 * @param {ParsedFondo} oldFondo - Fondo anterior
 * @param {ParsedFondo} newFondo - Fondo nuevo
 * @returns {Array<string>} - Array de nombres de campos que cambiaron
 */
function detectChangedFields(oldFondo, newFondo) {
  const changedFields = [];

  // Comparar campos principales
  const fieldsToCheck = [
    'status', 'hasError', 'hasWarning', 'isProcessing',
    'startTime', 'endTime'
  ];

  fieldsToCheck.forEach(field => {
    if (oldFondo[field] !== newFondo[field]) {
      changedFields.push(field);
    }
  });

  // Comparar stages
  if (oldFondo.stages && newFondo.stages) {
    oldFondo.stages.forEach((oldStage, index) => {
      const newStage = newFondo.stages[index];
      if (oldStage.estado !== newStage.estado) {
        changedFields.push(`stage_${index}`);
      }
    });
  }

  return changedFields;
}

/**
 * computeStageStats - Calcula estadísticas agregadas por etapa
 * @param {Map<string, ParsedFondo>} fondosMap - Map de fondos
 * @returns {Object} - Estadísticas por etapa
 */
function computeStageStats(fondosMap) {
  const stats = {};

  // Inicializar stats para 8 etapas
  for (let i = 0; i < 8; i++) {
    stats[i] = {
      ok: 0,
      error: 0,
      warning: 0,
      enProgreso: 0,
      pendiente: 0,
      omitido: 0,
      na: 0,
      total: 0
    };
  }

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
  };

  fondosMap.forEach(fondo => {
    // Contar por status final
    switch (fondo.status) {
      case FINAL_STATUS.OK:
        stats.ok++;
        stats.completados++;
        break;
      case FINAL_STATUS.ERROR:
        stats.error++;
        stats.completados++;
        break;
      case FINAL_STATUS.WARNING:
        stats.warning++;
        stats.completados++;
        break;
      case FINAL_STATUS.PARCIAL:
        stats.parcial++;
        stats.completados++;
        break;
      case FINAL_STATUS.EN_PROGRESO:
        stats.enProgreso++;
        break;
      case FINAL_STATUS.PENDIENTE:
        stats.pendiente++;
        break;
      case FINAL_STATUS.OMITIDO:
        stats.omitido++;
        break;
      default:
        break;
    }
  });

  return stats;
}

export default PipelineFondosContext;
