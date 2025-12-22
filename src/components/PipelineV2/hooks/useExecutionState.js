/**
 * useExecutionState.js - Hook Central de Estado
 * Combina ExecutionContext y FondosContext para acceso unificado al estado
 */

import { useCallback, useMemo } from 'react';
import { usePipelineExecution } from '../contexts/PipelineExecutionContext';
import { usePipelineFondos } from '../contexts/PipelineFondosContext';
import { parseFondos } from '../utils/pipelineParser';

/**
 * useExecutionState - Hook central de estado de ejecución
 * Combina datos de execution y fondos contexts
 *
 * @returns {ExecutionState} - Estado combinado
 */
export const useExecutionState = () => {
  const execution = usePipelineExecution();
  const fondos = usePipelineFondos();

  // Computed: Estado actual de la ejecución
  const executionStatus = useMemo(() => {
    if (!execution.ejecucion) return 'idle';

    const estado = execution.ejecucion.Estado;

    if (estado === 'COMPLETADO') return 'completed';
    if (estado === 'ERROR') return 'error';
    if (estado === 'PARCIAL') return 'partial';
    if (estado === 'EN_PROGRESO') return 'running';
    if (estado === 'INICIALIZANDO') return 'initializing';

    return 'idle';
  }, [execution.ejecucion]);

  // Computed: ¿Está la ejecución activa?
  const isExecuting = useMemo(() => {
    return executionStatus === 'running' || executionStatus === 'initializing';
  }, [executionStatus]);

  // Computed: ¿Está la ejecución terminada?
  const isFinished = useMemo(() => {
    return executionStatus === 'completed' ||
           executionStatus === 'error' ||
           executionStatus === 'partial';
  }, [executionStatus]);

  // Computed: ¿Hay fondos cargados?
  const hasFondos = useMemo(() => {
    return fondos.fondosMap.size > 0;
  }, [fondos.fondosMap]);

  // Computed: Progreso general (0-100)
  const overallProgress = useMemo(() => {
    return execution.getOverallProgress();
  }, [execution]);

  // Computed: Tiempo transcurrido (en ms)
  const elapsedTime = useMemo(() => {
    if (!execution.ejecucion?.IniciadoEn) return 0;

    const startTime = new Date(execution.ejecucion.IniciadoEn).getTime();
    const endTime = execution.ejecucion.FinalizadoEn
      ? new Date(execution.ejecucion.FinalizadoEn).getTime()
      : Date.now();

    return endTime - startTime;
  }, [execution.ejecucion]);

  /**
   * updateFromPolling - Actualiza estado desde respuesta de polling
   * @param {Object} pollingData - Datos del endpoint de polling
   */
  const updateFromPolling = useCallback((pollingData) => {
    if (!pollingData) return;

    // Actualizar ejecución
    if (pollingData.ejecucion) {
      execution.updateEjecucion(pollingData.ejecucion);
    }

    // Actualizar fondos
    if (pollingData.fondos && Array.isArray(pollingData.fondos)) {
      const parsedFondos = parseFondos(pollingData.fondos);
      fondos.updateFondos(parsedFondos);
    }
  }, [execution, fondos]);

  /**
   * reset - Resetea todo el estado
   */
  const reset = useCallback(() => {
    execution.clearEjecucion();
    fondos.clearFondos();
  }, [execution, fondos]);

  /**
   * getFondoById - Obtiene un fondo por ID
   * @param {string} fondoId - ID del fondo
   * @returns {ParsedFondo|undefined} - Fondo o undefined
   */
  const getFondoById = useCallback((fondoId) => {
    return fondos.getFondo(fondoId);
  }, [fondos]);

  /**
   * getFondosByStatus - Obtiene fondos filtrados por status
   * @param {number} status - Status a filtrar (FINAL_STATUS enum)
   * @returns {Array<ParsedFondo>} - Array de fondos
   */
  const getFondosByStatus = useCallback((status) => {
    const result = [];
    fondos.fondosMap.forEach(fondo => {
      if (fondo.status === status) {
        result.push(fondo);
      }
    });
    return result;
  }, [fondos.fondosMap]);

  /**
   * getExecutionMetadata - Obtiene metadata de la ejecución
   * @returns {Object} - Metadata
   */
  const getExecutionMetadata = useCallback(() => {
    if (!execution.ejecucion) return null;

    return {
      idEjecucion: execution.ejecucion.ID_Ejecucion,
      fechaReporte: execution.ejecucion.FechaReporte,
      estado: execution.ejecucion.Estado,
      totalFondos: execution.ejecucion.TotalFondos,
      fondosExitosos: execution.ejecucion.FondosExitosos,
      fondosFallidos: execution.ejecucion.FondosFallidos,
      iniciadoEn: execution.ejecucion.IniciadoEn,
      finalizadoEn: execution.ejecucion.FinalizadoEn,
      duracionTotal: execution.ejecucion.DuracionTotal,
    };
  }, [execution.ejecucion]);

  // Return unified state
  return {
    // Estado de ejecución
    ejecucion: execution.ejecucion,
    executionStatus,
    isExecuting,
    isFinished,
    isPolling: execution.isPolling,
    error: execution.error,

    // Estado de fondos
    fondosMap: fondos.fondosMap,
    fondosOrder: fondos.fondosOrder,
    hasFondos,

    // Estadísticas
    stageStats: fondos.stageStats,
    generalStats: fondos.generalStats,
    overallProgress,
    elapsedTime,

    // Acciones
    updateFromPolling,
    reset,
    updateError: execution.updateError,
    updatePollingState: execution.updatePollingState,

    // Queries
    getFondoById,
    getFondosByStatus,
    getExecutionMetadata,
    isExecutionComplete: execution.isExecutionComplete,

    // Change tracking
    changeFlags: fondos.changeFlags,
    hasChanges: fondos.hasChanges,
    getChangeInfo: fondos.getChangeInfo,
    clearChangeFlags: fondos.clearChangeFlags,
  };
};

export default useExecutionState;
