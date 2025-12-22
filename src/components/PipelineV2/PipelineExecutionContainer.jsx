/**
 * PipelineExecutionContainer - Orquestador Principal
 * Integra todos los componentes y hooks del Pipeline ETL v2
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Box, Container } from '@mui/material';
import { PipelineProvider } from './contexts/PipelineProvider';
import PipelineHeader from './components/layout/PipelineHeader';
import PipelineRoadmap from './components/roadmap/PipelineRoadmap';
import ExecutionSummary from './components/layout/ExecutionSummary';
import FundFilters from './components/funds/FundFilters';
import FundsList from './components/layout/FundsList';
import NewExecutionModal from './components/modals/NewExecutionModal';
import LoadingState from './components/shared/LoadingState';
import EmptyState from './components/shared/EmptyState';
import useExecutionState from './hooks/useExecutionState';
import useExecutionPolling from './hooks/useExecutionPolling';
import useExecutionActions from './hooks/useExecutionActions';
import useFondoParser from './hooks/useFondoParser';
import useFondoFilters from './hooks/useFondoFilters';
import { colors } from '../../styles/theme';

/**
 * PipelineExecutionContainer - Componente principal del Pipeline v2
 */
const PipelineExecutionContainer = () => {
  // Estado local
  const [newExecutionModalOpen, setNewExecutionModalOpen] = useState(false);

  // Hook central de estado
  const executionState = useExecutionState();

  // Hook de parsing con cache
  const parser = useFondoParser();

  // Hook de acciones
  const actions = useExecutionActions({
    onExecuteSuccess: (response) => {
      console.log('[PipelineContainer] Ejecución iniciada exitosamente:', response);
      setNewExecutionModalOpen(false);

      // Iniciar polling
      if (response.ID_Ejecucion) {
        pollingHook.startPolling();
      }
    },
    onExecuteError: (error) => {
      console.error('[PipelineContainer] Error al ejecutar:', error);
    },
    onReprocessSuccess: (response) => {
      console.log('[PipelineContainer] Reproceso exitoso:', response);
    },
    onReprocessError: (error) => {
      console.error('[PipelineContainer] Error al reprocesar:', error);
    },
  });

  // Hook de polling
  const pollingHook = useExecutionPolling(
    executionState.ejecucion?.ID_Ejecucion,
    {
      enabled: !!executionState.ejecucion && !executionState.isFinished,
      onUpdate: (data) => {
        executionState.updateFromPolling(data);
      },
      onComplete: (data) => {
        console.log('[PipelineContainer] Ejecución completada:', data);
      },
      onError: (error) => {
        console.error('[PipelineContainer] Error en polling:', error);
      },
    }
  );

  // Hook de filtros
  const filteredFondos = useFondoFilters(
    executionState.fondosMap,
    executionState.fondosOrder
  );

  // Crear Map de fondos backend (raw) para sub-etapas
  const fondosBackendMap = useMemo(() => {
    // Por ahora retornar empty map, se llenará con datos del polling
    // En una implementación completa, esto vendría del estado
    return new Map();
  }, []);

  // Callbacks
  const handleNewExecution = useCallback(() => {
    setNewExecutionModalOpen(true);
  }, []);

  const handleCloseNewExecutionModal = useCallback(() => {
    setNewExecutionModalOpen(false);
    actions.clearErrors();
  }, [actions]);

  const handleExecuteProcess = useCallback(async (fechaReporte) => {
    try {
      await actions.executeProcess(fechaReporte);
    } catch (error) {
      // Error ya manejado por el hook
      console.error('[PipelineContainer] Error al ejecutar proceso:', error);
    }
  }, [actions]);

  const handleReprocessFondo = useCallback(async (fondo) => {
    if (!executionState.ejecucion?.ID_Ejecucion) {
      console.error('[PipelineContainer] No hay ejecución activa para reprocesar');
      return;
    }

    try {
      await actions.reprocesarFondo(
        executionState.ejecucion.ID_Ejecucion,
        fondo.id
      );
    } catch (error) {
      // Error ya manejado por el hook
      console.error('[PipelineContainer] Error al reprocesar fondo:', error);
    }
  }, [executionState.ejecucion, actions]);

  const handleShowFundDetails = useCallback((fondo) => {
    // TODO: Implementar modal de detalles
    console.log('[PipelineContainer] Mostrar detalles de fondo:', fondo);
  }, []);

  // Determinar si puede ejecutar
  const canExecute = !executionState.isExecuting && !actions.isBusy;

  // Determinar si puede reprocesar
  const canReprocess = executionState.isFinished && !actions.isReprocessing;

  // Si no hay ejecución, mostrar estado inicial
  if (!executionState.ejecucion) {
    return (
      <Container maxWidth="xl" sx={{ py: 4 }}>
        <PipelineHeader
          ejecucion={null}
          isPolling={false}
          onNewExecution={handleNewExecution}
          canExecute={canExecute}
        />

        <EmptyState
          variant="no-execution"
          actionLabel="Iniciar Nueva Ejecución"
          onAction={handleNewExecution}
          sx={{ mt: 4 }}
        />

        {/* Modal de nueva ejecución */}
        <NewExecutionModal
          open={newExecutionModalOpen}
          onClose={handleCloseNewExecutionModal}
          onExecute={handleExecuteProcess}
          isExecuting={actions.isExecuting}
          error={actions.executeError?.message}
        />
      </Container>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      {/* Header */}
      <PipelineHeader
        ejecucion={executionState.ejecucion}
        isPolling={pollingHook.isPolling}
        onNewExecution={handleNewExecution}
        canExecute={canExecute}
      />

      {/* Roadmap general (contexto visual) */}
      <PipelineRoadmap
        stages={executionState.fondosMap.size > 0
          ? Array.from(executionState.fondosMap.values())[0]?.stages
          : []
        }
        variant="full"
        nodeSize={64}
        connectorWidth={90}
        sx={{ mb: 3 }}
      />

      {/* Resumen de ejecución */}
      <ExecutionSummary
        generalStats={executionState.generalStats}
        overallProgress={executionState.overallProgress}
        elapsedTime={executionState.elapsedTime}
        sx={{ mb: 3 }}
      />

      {/* Filtros */}
      <FundFilters
        counts={filteredFondos.counts}
        showSearch={true}
        sx={{ mb: 3 }}
      />

      {/* Lista de fondos */}
      {executionState.hasFondos ? (
        <FundsList
          fondoIds={filteredFondos.filteredIds}
          fondosMap={executionState.fondosMap}
          fondosBackendMap={fondosBackendMap}
          changeFlags={executionState.changeFlags}
          onReprocess={handleReprocessFondo}
          onShowDetails={handleShowFundDetails}
          canReprocess={canReprocess}
          estimatedItemHeight={140}
          maxHeight={700}
        />
      ) : (
        <LoadingState
          variant="cards"
          message="Cargando fondos..."
          count={5}
        />
      )}

      {/* Modal de nueva ejecución */}
      <NewExecutionModal
        open={newExecutionModalOpen}
        onClose={handleCloseNewExecutionModal}
        onExecute={handleExecuteProcess}
        isExecuting={actions.isExecuting}
        error={actions.executeError?.message}
      />
    </Container>
  );
};

/**
 * PipelineExecutionContainerWithProvider - Wrapper con Provider
 * Exportar este componente como default
 */
const PipelineExecutionContainerWithProvider = () => {
  return (
    <PipelineProvider>
      <PipelineExecutionContainer />
    </PipelineProvider>
  );
};

export default PipelineExecutionContainerWithProvider;
