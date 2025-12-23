/**
 * FundRoadmap - Roadmap de Pipeline por Fondo
 * Muestra el roadmap de 8 etapas específico para un fondo individual
 */

import React, { useMemo } from 'react';
import { Box } from '@mui/material';
import StageNode from '../roadmap/StageNode';
import StageConnector from '../roadmap/StageConnector';
import { PIPELINE_STAGES } from '../../utils/pipelineConfig';
import { getCurrentStage } from '../../utils/stageCalculator';

/**
 * FundRoadmap Component
 *
 * @param {Object} props
 * @param {ParsedFondo} props.fondo - Fondo parseado con stages
 * @param {number} props.nodeSize - Tamaño de los nodos (default: 48)
 * @param {number} props.connectorWidth - Ancho de los conectores (default: 60)
 * @param {boolean} props.showLabels - Mostrar labels de etapas (default: true)
 * @param {boolean} props.compact - Modo compacto (default: false)
 * @param {Function} props.onStageClick - Callback al hacer click en etapa (opcional)
 * @param {Object} props.sx - Estilos adicionales
 */
export const FundRoadmap = ({
  fondo,
  nodeSize = 48,
  connectorWidth = 60,
  showLabels = true,
  compact = false,
  onStageClick,
  sx = {},
}) => {
  // Determinar etapa actual (ANTES de condicionales - React Hooks rules)
  const currentStageInfo = useMemo(() => {
    if (!fondo) return null;
    return getCurrentStage(fondo);
  }, [fondo]);

  if (!fondo || !fondo.stages) {
    return null;
  }

  // Tamaños para modo compacto
  const actualNodeSize = compact ? nodeSize * 0.8 : nodeSize;
  const actualConnectorWidth = compact ? connectorWidth * 0.7 : connectorWidth;
  const actualShowLabels = compact ? false : showLabels;

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0,
        py: compact ? 1 : 2,
        overflowX: 'auto',
        '&::-webkit-scrollbar': {
          height: 6,
        },
        '&::-webkit-scrollbar-track': {
          backgroundColor: 'transparent',
        },
        '&::-webkit-scrollbar-thumb': {
          backgroundColor: 'rgba(0,0,0,0.2)',
          borderRadius: '3px',
        },
        ...sx,
      }}
    >
      {PIPELINE_STAGES.map((stageConfig, index) => {
        const stageStatus = fondo.stages[index];
        const isActive = currentStageInfo?.index === index;
        const isCompleted = stageStatus.estado === 'OK' ||
                            stageStatus.estado === 'ERROR' ||
                            stageStatus.estado === 'WARNING';
        const isLastStage = index === PIPELINE_STAGES.length - 1;

        return (
          <React.Fragment key={stageConfig.id}>
            {/* Stage Node */}
            <StageNode
              stage={stageConfig}
              estado={stageStatus.estado}
              isActive={isActive}
              isCompleted={isCompleted}
              size={actualNodeSize}
              showLabel={actualShowLabels}
              onClick={onStageClick ? () => onStageClick(index, stageConfig, stageStatus) : undefined}
            />

            {/* Connector (excepto después del último) */}
            {!isLastStage && (
              <StageConnector
                isActive={isActive}
                isCompleted={isCompleted}
                width={actualConnectorWidth}
                color={isCompleted ? stageConfig.color : undefined}
              />
            )}
          </React.Fragment>
        );
      })}
    </Box>
  );
};

export default FundRoadmap;
