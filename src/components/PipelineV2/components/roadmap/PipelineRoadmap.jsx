/**
 * PipelineRoadmap - Roadmap Visual del Pipeline
 * Muestra las 8 etapas principales del pipeline con nodos y conectores
 */

import React, { useMemo } from 'react';
import { Box, Paper, Typography } from '@mui/material';
import StageNode from './StageNode';
import StageConnector from './StageConnector';
import { PIPELINE_STAGES } from '../../utils/pipelineConfig';
import { colors } from '../../../../styles/theme';

/**
 * PipelineRoadmap Component
 *
 * @param {Object} props
 * @param {Array<StageStatus>} props.stages - Array de 8 estados de etapas
 * @param {number} props.currentStageIndex - Índice de la etapa actual (opcional)
 * @param {string} props.variant - Variante ('full', 'compact')
 * @param {number} props.nodeSize - Tamaño de los nodos (default: 60)
 * @param {number} props.connectorWidth - Ancho de los conectores (default: 80)
 * @param {boolean} props.showLabels - Mostrar labels de etapas (default: true)
 * @param {Function} props.onStageClick - Callback al hacer click en una etapa (opcional)
 * @param {Object} props.sx - Estilos adicionales
 */
export const PipelineRoadmap = ({
  stages = [],
  currentStageIndex = null,
  variant = 'full',
  nodeSize = 60,
  connectorWidth = 80,
  showLabels = true,
  onStageClick,
  sx = {},
}) => {
  // Validar que tengamos las 8 etapas
  const validStages = useMemo(() => {
    if (!stages || stages.length !== PIPELINE_STAGES.length) {
      // Crear etapas vacías si no hay datos
      return PIPELINE_STAGES.map(stage => ({
        id: stage.id,
        estado: 'PENDIENTE',
        index: PIPELINE_STAGES.findIndex(s => s.id === stage.id),
      }));
    }
    return stages;
  }, [stages]);

  // Determinar etapa activa
  const activeStageIndex = useMemo(() => {
    if (currentStageIndex !== null) return currentStageIndex;

    // Buscar primera etapa EN_PROGRESO
    const activeIndex = validStages.findIndex(s => s.estado === 'EN_PROGRESO');
    if (activeIndex !== -1) return activeIndex;

    return null;
  }, [currentStageIndex, validStages]);

  // Variant: Compact (sin paper wrapper)
  if (variant === 'compact') {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0,
          py: 2,
          overflowX: 'auto',
          ...sx,
        }}
      >
        {PIPELINE_STAGES.map((stageConfig, index) => {
          const stageStatus = validStages[index];
          const isActive = index === activeStageIndex;
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
                size={nodeSize}
                showLabel={showLabels}
                onClick={onStageClick ? () => onStageClick(index, stageConfig) : undefined}
              />

              {/* Connector (excepto después del último) */}
              {!isLastStage && (
                <StageConnector
                  isActive={isActive}
                  isCompleted={isCompleted}
                  width={connectorWidth}
                  color={isCompleted ? stageConfig.color : undefined}
                />
              )}
            </React.Fragment>
          );
        })}
      </Box>
    );
  }

  // Variant: Full (con paper wrapper y título)
  return (
    <Paper
      elevation={2}
      sx={{
        p: 3,
        borderRadius: '16px',
        backgroundColor: '#fff',
        border: `1px solid ${colors.grey[200]}`,
        ...sx,
      }}
    >
      {/* Título */}
      <Typography
        variant="h6"
        sx={{
          mb: 3,
          color: colors.grey[800],
          fontWeight: 600,
        }}
      >
        Pipeline de Procesamiento
      </Typography>

      {/* Roadmap */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0,
          overflowX: 'auto',
          pb: 1,
        }}
      >
        {PIPELINE_STAGES.map((stageConfig, index) => {
          const stageStatus = validStages[index];
          const isActive = index === activeStageIndex;
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
                size={nodeSize}
                showLabel={showLabels}
                onClick={onStageClick ? () => onStageClick(index, stageConfig) : undefined}
              />

              {/* Connector (excepto después del último) */}
              {!isLastStage && (
                <StageConnector
                  isActive={isActive}
                  isCompleted={isCompleted}
                  width={connectorWidth}
                  color={isCompleted ? stageConfig.color : undefined}
                />
              )}
            </React.Fragment>
          );
        })}
      </Box>

      {/* Leyenda (opcional) */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 3,
          mt: 3,
          pt: 2,
          borderTop: `1px solid ${colors.grey[200]}`,
          flexWrap: 'wrap',
        }}
      >
        <LegendItem color={colors.success.main} label="Completado" />
        <LegendItem color={colors.primary.main} label="En Progreso" />
        <LegendItem color={colors.error.main} label="Error" />
        <LegendItem color={colors.warning.main} label="Advertencia" />
        <LegendItem color={colors.grey[400]} label="Pendiente" />
      </Box>
    </Paper>
  );
};

/**
 * LegendItem - Elemento de leyenda
 */
const LegendItem = ({ color, label }) => (
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
    <Box
      sx={{
        width: 12,
        height: 12,
        borderRadius: '50%',
        backgroundColor: color,
      }}
    />
    <Typography
      variant="caption"
      sx={{
        color: colors.grey[600],
        fontSize: '0.75rem',
      }}
    >
      {label}
    </Typography>
  </Box>
);

export default PipelineRoadmap;
