/**
 * PipelineExecutionContext - Context de Ejecución General
 * Maneja estado de la ejecución actual (cambia poco)
 */

import { createContext, useContext, useState, useCallback } from 'react';

const PipelineExecutionContext = createContext(null);

export const usePipelineExecution = () => {
  const context = useContext(PipelineExecutionContext);
  if (!context) {
    throw new Error('usePipelineExecution must be used within PipelineExecutionProvider');
  }
  return context;
};

export const PipelineExecutionProvider = ({ children }) => {
  // Estado de la ejecución actual
  const [ejecucion, setEjecucion] = useState(null);
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState(null);

  // Actualizar ejecución
  const updateEjecucion = useCallback((newEjecucion) => {
    setEjecucion(newEjecucion);
  }, []);

  // Limpiar ejecución
  const clearEjecucion = useCallback(() => {
    setEjecucion(null);
    setIsPolling(false);
    setError(null);
  }, []);

  // Actualizar estado de polling
  const updatePollingState = useCallback((polling) => {
    setIsPolling(polling);
  }, []);

  // Actualizar error
  const updateError = useCallback((err) => {
    setError(err);
  }, []);

  // Verificar si ejecución está completa
  const isExecutionComplete = useCallback(() => {
    if (!ejecucion) return false;
    return ['COMPLETADO', 'PARCIAL', 'ERROR'].includes(ejecucion.Estado);
  }, [ejecucion]);

  // Obtener progreso general (0-100)
  const getOverallProgress = useCallback(() => {
    if (!ejecucion || ejecucion.TotalFondos === 0) return 0;

    const completedFondos = (ejecucion.FondosExitosos || 0) + (ejecucion.FondosFallidos || 0);
    return Math.round((completedFondos / ejecucion.TotalFondos) * 100);
  }, [ejecucion]);

  const value = {
    // Estado
    ejecucion,
    isPolling,
    error,

    // Acciones
    updateEjecucion,
    clearEjecucion,
    updatePollingState,
    updateError,

    // Computed
    isExecutionComplete,
    getOverallProgress,
  };

  return (
    <PipelineExecutionContext.Provider value={value}>
      {children}
    </PipelineExecutionContext.Provider>
  );
};

export default PipelineExecutionContext;
