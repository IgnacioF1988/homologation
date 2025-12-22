/**
 * PipelineUIContext - Context de UI State
 * Maneja estado de interfaz (filtros, expansión, sorting, selección)
 * Separado para evitar re-renders innecesarios
 */

import { createContext, useContext, useState, useCallback } from 'react';
import { FILTER_OPTIONS, SORT_FIELDS } from '../utils/constants';

const PipelineUIContext = createContext(null);

export const usePipelineUI = () => {
  const context = useContext(PipelineUIContext);
  if (!context) {
    throw new Error('usePipelineUI must be used within PipelineUIProvider');
  }
  return context;
};

export const PipelineUIProvider = ({ children }) => {
  // Filtros
  const [filterStatus, setFilterStatus] = useState(FILTER_OPTIONS.ALL);
  const [searchQuery, setSearchQuery] = useState('');

  // Sorting
  const [sortBy, setSortBy] = useState(SORT_FIELDS.FUND_NAME);
  const [sortDirection, setSortDirection] = useState('asc');

  // Expansión de fondos (Set para O(1) lookups)
  const [expandedFunds, setExpandedFunds] = useState(new Set());

  // Expansión de sub-etapas por fondo (Set para O(1) lookups)
  const [expandedSubStages, setExpandedSubStages] = useState(new Set());

  // Selección (para modales/detalles)
  const [selectedFundId, setSelectedFundId] = useState(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  // Modal nueva ejecución
  const [newExecutionModalOpen, setNewExecutionModalOpen] = useState(false);

  /**
   * toggleFundExpansion - Expande/colapsa un fondo
   * @param {string} fondoId - ID del fondo
   */
  const toggleFundExpansion = useCallback((fondoId) => {
    setExpandedFunds(prev => {
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
   * expandFund - Expande un fondo
   * @param {string} fondoId - ID del fondo
   */
  const expandFund = useCallback((fondoId) => {
    setExpandedFunds(prev => new Set([...prev, fondoId]));
  }, []);

  /**
   * collapseFund - Colapsa un fondo
   * @param {string} fondoId - ID del fondo
   */
  const collapseFund = useCallback((fondoId) => {
    setExpandedFunds(prev => {
      const newSet = new Set(prev);
      newSet.delete(fondoId);
      return newSet;
    });
  }, []);

  /**
   * expandAllFunds - Expande todos los fondos
   * @param {Array<string>} fondoIds - IDs de fondos
   */
  const expandAllFunds = useCallback((fondoIds) => {
    setExpandedFunds(new Set(fondoIds));
  }, []);

  /**
   * collapseAllFunds - Colapsa todos los fondos
   */
  const collapseAllFunds = useCallback(() => {
    setExpandedFunds(new Set());
  }, []);

  /**
   * isFundExpanded - Verifica si un fondo está expandido
   * @param {string} fondoId - ID del fondo
   * @returns {boolean} - True si está expandido
   */
  const isFundExpanded = useCallback((fondoId) => {
    return expandedFunds.has(fondoId);
  }, [expandedFunds]);

  /**
   * toggleSubStageExpansion - Expande/colapsa sub-etapas de un fondo
   * @param {string} fondoId - ID del fondo
   */
  const toggleSubStageExpansion = useCallback((fondoId) => {
    setExpandedSubStages(prev => {
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
   * isSubStageExpanded - Verifica si sub-etapas están expandidas
   * @param {string} fondoId - ID del fondo
   * @returns {boolean} - True si está expandido
   */
  const isSubStageExpanded = useCallback((fondoId) => {
    return expandedSubStages.has(fondoId);
  }, [expandedSubStages]);

  /**
   * expandSubStage - Expande sub-etapas
   * @param {string} fondoId - ID del fondo
   */
  const expandSubStage = useCallback((fondoId) => {
    setExpandedSubStages(prev => new Set([...prev, fondoId]));
  }, []);

  /**
   * collapseSubStage - Colapsa sub-etapas
   * @param {string} fondoId - ID del fondo
   */
  const collapseSubStage = useCallback((fondoId) => {
    setExpandedSubStages(prev => {
      const newSet = new Set(prev);
      newSet.delete(fondoId);
      return newSet;
    });
  }, []);

  /**
   * collapseAllSubStages - Colapsa todas las sub-etapas
   */
  const collapseAllSubStages = useCallback(() => {
    setExpandedSubStages(new Set());
  }, []);

  /**
   * updateSorting - Actualiza sorting (alterna dirección si mismo campo)
   * @param {string} field - Campo por el cual ordenar
   */
  const updateSorting = useCallback((field) => {
    setSortBy(prevField => {
      if (prevField === field) {
        setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
      } else {
        setSortDirection('asc');
      }
      return field;
    });
  }, []);

  /**
   * resetFilters - Resetea todos los filtros
   */
  const resetFilters = useCallback(() => {
    setFilterStatus(FILTER_OPTIONS.ALL);
    setSearchQuery('');
    setSortBy(SORT_FIELDS.FUND_NAME);
    setSortDirection('asc');
  }, []);

  /**
   * resetUI - Resetea todo el estado de UI
   */
  const resetUI = useCallback(() => {
    resetFilters();
    setExpandedFunds(new Set());
    setExpandedSubStages(new Set());
    setSelectedFundId(null);
    setDetailModalOpen(false);
    setNewExecutionModalOpen(false);
  }, [resetFilters]);

  /**
   * openDetailModal - Abre modal de detalle de un fondo
   * @param {string} fondoId - ID del fondo
   */
  const openDetailModal = useCallback((fondoId) => {
    setSelectedFundId(fondoId);
    setDetailModalOpen(true);
  }, []);

  /**
   * closeDetailModal - Cierra modal de detalle
   */
  const closeDetailModal = useCallback(() => {
    setDetailModalOpen(false);
    setSelectedFundId(null);
  }, []);

  /**
   * openNewExecutionModal - Abre modal nueva ejecución
   */
  const openNewExecutionModal = useCallback(() => {
    setNewExecutionModalOpen(true);
  }, []);

  /**
   * closeNewExecutionModal - Cierra modal nueva ejecución
   */
  const closeNewExecutionModal = useCallback(() => {
    setNewExecutionModalOpen(false);
  }, []);

  const value = {
    // Filtros
    filterStatus,
    setFilterStatus,
    searchQuery,
    setSearchQuery,

    // Sorting
    sortBy,
    sortDirection,
    updateSorting,

    // Expansión de fondos
    expandedFunds,
    toggleFundExpansion,
    expandFund,
    collapseFund,
    expandAllFunds,
    collapseAllFunds,
    isFundExpanded,

    // Expansión de sub-etapas
    expandedSubStages,
    toggleSubStageExpansion,
    isSubStageExpanded,
    expandSubStage,
    collapseSubStage,
    collapseAllSubStages,

    // Selección y modales
    selectedFundId,
    detailModalOpen,
    openDetailModal,
    closeDetailModal,
    newExecutionModalOpen,
    openNewExecutionModal,
    closeNewExecutionModal,

    // Reset
    resetFilters,
    resetUI,
  };

  return (
    <PipelineUIContext.Provider value={value}>
      {children}
    </PipelineUIContext.Provider>
  );
};

export default PipelineUIContext;
