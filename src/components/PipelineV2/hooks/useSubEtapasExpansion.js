/**
 * useSubEtapasExpansion.js - Hook de Expansión de Sub-Etapas
 * Maneja estado de expansión de sub-etapas por fondo usando Set para O(1) lookups
 */

import { useState, useCallback } from 'react';

/**
 * useSubEtapasExpansion - Hook para manejar expansión de sub-etapas
 *
 * @param {Object} options - Opciones de configuración
 * @param {boolean} options.expandByDefault - Expandir por defecto (default: false)
 * @param {Array<string>} options.initialExpanded - IDs de fondos expandidos inicialmente
 * @returns {SubEtapasExpansion} - Estado y acciones de expansión
 */
export const useSubEtapasExpansion = (options = {}) => {
  const {
    initialExpanded = [],
  } = options;

  // Estado: Set de IDs de fondos con sub-etapas expandidas
  const [expanded, setExpanded] = useState(() => {
    return new Set(initialExpanded);
  });

  /**
   * toggle - Alterna expansión de un fondo
   * @param {string} fondoId - ID del fondo
   */
  const toggle = useCallback((fondoId) => {
    setExpanded(prev => {
      const newSet = new Set(prev);
      if (newSet.has(fondoId)) {
        newSet.delete(fondoId);
      } else {
        newSet.add(fondoId);
      }
      return newSet;
    });
  }, []);

  /**
   * expand - Expande sub-etapas de un fondo
   * @param {string} fondoId - ID del fondo
   */
  const expand = useCallback((fondoId) => {
    setExpanded(prev => new Set([...prev, fondoId]));
  }, []);

  /**
   * collapse - Colapsa sub-etapas de un fondo
   * @param {string} fondoId - ID del fondo
   */
  const collapse = useCallback((fondoId) => {
    setExpanded(prev => {
      const newSet = new Set(prev);
      newSet.delete(fondoId);
      return newSet;
    });
  }, []);

  /**
   * expandMultiple - Expande sub-etapas de múltiples fondos
   * @param {Array<string>} fondoIds - Array de IDs de fondos
   */
  const expandMultiple = useCallback((fondoIds) => {
    setExpanded(prev => {
      const newSet = new Set(prev);
      fondoIds.forEach(id => newSet.add(id));
      return newSet;
    });
  }, []);

  /**
   * collapseMultiple - Colapsa sub-etapas de múltiples fondos
   * @param {Array<string>} fondoIds - Array de IDs de fondos
   */
  const collapseMultiple = useCallback((fondoIds) => {
    setExpanded(prev => {
      const newSet = new Set(prev);
      fondoIds.forEach(id => newSet.delete(id));
      return newSet;
    });
  }, []);

  /**
   * expandAll - Expande todos los fondos
   * @param {Array<string>} allFondoIds - Array de todos los IDs
   */
  const expandAll = useCallback((allFondoIds) => {
    setExpanded(new Set(allFondoIds));
  }, []);

  /**
   * collapseAll - Colapsa todos los fondos
   */
  const collapseAll = useCallback(() => {
    setExpanded(new Set());
  }, []);

  /**
   * isExpanded - Verifica si un fondo está expandido
   * @param {string} fondoId - ID del fondo
   * @returns {boolean} - True si está expandido
   */
  const isExpanded = useCallback((fondoId) => {
    return expanded.has(fondoId);
  }, [expanded]);

  /**
   * expandErrors - Expande fondos con errores
   * @param {Map<string, ParsedFondo>} fondosMap - Map de fondos
   */
  const expandErrors = useCallback((fondosMap) => {
    const errorIds = [];
    fondosMap.forEach((fondo, id) => {
      if (fondo.hasError) {
        errorIds.push(id);
      }
    });
    expandMultiple(errorIds);
  }, [expandMultiple]);

  /**
   * expandWarnings - Expande fondos con warnings
   * @param {Map<string, ParsedFondo>} fondosMap - Map de fondos
   */
  const expandWarnings = useCallback((fondosMap) => {
    const warningIds = [];
    fondosMap.forEach((fondo, id) => {
      if (fondo.hasWarning) {
        warningIds.push(id);
      }
    });
    expandMultiple(warningIds);
  }, [expandMultiple]);

  /**
   * expandErrorsAndWarnings - Expande fondos con errores o warnings
   * @param {Map<string, ParsedFondo>} fondosMap - Map de fondos
   */
  const expandErrorsAndWarnings = useCallback((fondosMap) => {
    const ids = [];
    fondosMap.forEach((fondo, id) => {
      if (fondo.hasError || fondo.hasWarning) {
        ids.push(id);
      }
    });
    expandMultiple(ids);
  }, [expandMultiple]);

  /**
   * expandProcessing - Expande fondos en progreso
   * @param {Map<string, ParsedFondo>} fondosMap - Map de fondos
   */
  const expandProcessing = useCallback((fondosMap) => {
    const processingIds = [];
    fondosMap.forEach((fondo, id) => {
      if (fondo.isProcessing) {
        processingIds.push(id);
      }
    });
    expandMultiple(processingIds);
  }, [expandMultiple]);

  /**
   * getExpandedCount - Obtiene número de fondos expandidos
   * @returns {number} - Número de fondos expandidos
   */
  const getExpandedCount = useCallback(() => {
    return expanded.size;
  }, [expanded]);

  /**
   * getExpandedIds - Obtiene array de IDs expandidos
   * @returns {Array<string>} - Array de IDs
   */
  const getExpandedIds = useCallback(() => {
    return Array.from(expanded);
  }, [expanded]);

  /**
   * reset - Resetea estado de expansión
   */
  const reset = useCallback(() => {
    if (initialExpanded.length > 0) {
      setExpanded(new Set(initialExpanded));
    } else {
      setExpanded(new Set());
    }
  }, [initialExpanded]);

  return {
    // Estado
    expanded,

    // Acciones básicas
    toggle,
    expand,
    collapse,

    // Acciones múltiples
    expandMultiple,
    collapseMultiple,
    expandAll,
    collapseAll,

    // Expansión condicional
    expandErrors,
    expandWarnings,
    expandErrorsAndWarnings,
    expandProcessing,

    // Queries
    isExpanded,
    getExpandedCount,
    getExpandedIds,

    // Utilidades
    reset,
  };
};

export default useSubEtapasExpansion;
