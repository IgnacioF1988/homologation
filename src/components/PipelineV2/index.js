/**
 * PipelineV2 - Barrel Export
 * Punto de entrada principal para el módulo PipelineV2
 */

// Componente principal
export { default } from './PipelineExecutionContainer';
export { default as PipelineExecutionContainer } from './PipelineExecutionContainer';

// Contexts (para uso avanzado)
export { PipelineProvider } from './contexts/PipelineProvider';
export { usePipelineExecution } from './contexts/PipelineExecutionContext';
export { usePipelineFondos } from './contexts/PipelineFondosContext';
export { usePipelineUI } from './contexts/PipelineUIContext';
export { usePipeline } from './contexts/PipelineProvider';

// Hooks principales (para uso avanzado)
export { default as useExecutionState } from './hooks/useExecutionState';
export { default as useExecutionPolling } from './hooks/useExecutionPolling';
export { default as useExecutionActions } from './hooks/useExecutionActions';
export { default as useFondoParser } from './hooks/useFondoParser';
export { default as useFondoFilters } from './hooks/useFondoFilters';
export { default as useStageStats } from './hooks/useStageStats';
export { default as useSubEtapasExpansion } from './hooks/useSubEtapasExpansion';

// Utilidades (para uso avanzado)
export * from './utils/constants';
export * from './utils/formatters';
export * from './utils/pipelineConfig';
export * from './utils/pipelineParser';
export * from './utils/stageCalculator';

// Componentes compartidos (para reutilización)
export { default as StatusBadge } from './components/shared/StatusBadge';
export { default as LoadingState } from './components/shared/LoadingState';
export { default as EmptyState } from './components/shared/EmptyState';

// Componentes de roadmap (para reutilización)
export { default as StageNode } from './components/roadmap/StageNode';
export { default as StageConnector } from './components/roadmap/StageConnector';
export { default as PipelineRoadmap } from './components/roadmap/PipelineRoadmap';

// Componentes de fondos (para reutilización)
export { default as FundCard } from './components/funds/FundCard';
export { default as FundCardHeader } from './components/funds/FundCardHeader';
export { default as FundRoadmap } from './components/funds/FundRoadmap';
export { default as FundSubStages } from './components/funds/FundSubStages';
export { default as FundErrorPanel } from './components/funds/FundErrorPanel';
export { default as FundFilters } from './components/funds/FundFilters';
