/**
 * PipelineProvider - Provider Principal
 * Combina los 3 contexts separados en un único provider
 * Orden de anidación optimizado para minimizar re-renders
 */

import React from 'react';
import { PipelineExecutionProvider, usePipelineExecution } from './PipelineExecutionContext';
import { PipelineFondosProvider, usePipelineFondos } from './PipelineFondosContext';
import { PipelineUIProvider, usePipelineUI } from './PipelineUIContext';

/**
 * PipelineProvider - Wrapper de los 3 contexts
 *
 * Orden de anidación (de afuera hacia adentro):
 * 1. ExecutionContext - Cambia menos frecuentemente
 * 2. FondosContext - Cambia frecuentemente (polling)
 * 3. UIContext - Cambia con interacción del usuario
 *
 * Este orden minimiza re-renders innecesarios
 */
export const PipelineProvider = ({ children }) => {
  return (
    <PipelineExecutionProvider>
      <PipelineFondosProvider>
        <PipelineUIProvider>
          {children}
        </PipelineUIProvider>
      </PipelineFondosProvider>
    </PipelineExecutionProvider>
  );
};

/**
 * Re-exportar hooks para conveniencia
 */
export { usePipelineExecution } from './PipelineExecutionContext';
export { usePipelineFondos } from './PipelineFondosContext';
export { usePipelineUI } from './PipelineUIContext';

/**
 * Hook combinado - Para componentes que necesitan todo el estado
 * IMPORTANTE: Solo usar cuando realmente se necesiten los 3 contexts
 * De lo contrario, usar hooks individuales para evitar re-renders
 */
export const usePipeline = () => {
  const execution = usePipelineExecution();
  const fondos = usePipelineFondos();
  const ui = usePipelineUI();

  return {
    execution,
    fondos,
    ui,
  };
};

export default PipelineProvider;
