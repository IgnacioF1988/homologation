/**
 * FundSubStages - Sub-Etapas Colapsables de un Fondo
 * Muestra las 22 sub-etapas agrupadas por fase (IPA, CAPM, Derivados, PNL, UBS)
 */

import React, { useMemo } from 'react';
import { Box, Typography, Collapse, LinearProgress } from '@mui/material';
import { ESTADO_COLORS, ESTADO_ICONS } from '../../utils/constants';
import { SUB_STAGE_CONFIG } from '../../utils/pipelineConfig';
import { parseSubStages } from '../../utils/pipelineParser';
import { colors } from '../../../../styles/theme';

/**
 * FundSubStages Component
 *
 * @param {Object} props
 * @param {Object} props.fondoBackend - Fondo raw del backend (para parsear sub-etapas)
 * @param {boolean} props.isExpanded - Si las sub-etapas están expandidas
 * @param {Array<string>} props.visiblePhases - Fases a mostrar (default: todas)
 * @param {Object} props.sx - Estilos adicionales
 */
export const FundSubStages = ({
  fondoBackend,
  isExpanded = false,
  visiblePhases = ['PROCESS_IPA', 'PROCESS_CAPM', 'PROCESS_DERIVADOS', 'PROCESS_PNL', 'PROCESS_UBS'],
  sx = {},
}) => {
  if (!fondoBackend) return null;

  // Parsear sub-etapas de todas las fases visibles
  const phasesData = useMemo(() => {
    return visiblePhases
      .map(phaseId => {
        const subStages = parseSubStages(fondoBackend, phaseId);
        if (!subStages || subStages.length === 0) return null;

        return {
          phaseId,
          phaseLabel: getPhaseLabel(phaseId),
          subStages,
        };
      })
      .filter(Boolean);
  }, [fondoBackend, visiblePhases]);

  if (phasesData.length === 0) {
    return null;
  }

  return (
    <Collapse in={isExpanded} timeout={300}>
      <Box
        sx={{
          px: 3,
          pb: 2,
          ...sx,
        }}
      >
        {phasesData.map((phaseData, phaseIndex) => (
          <PhaseSubStages
            key={phaseData.phaseId}
            phaseLabel={phaseData.phaseLabel}
            subStages={phaseData.subStages}
            isLast={phaseIndex === phasesData.length - 1}
          />
        ))}
      </Box>
    </Collapse>
  );
};

/**
 * PhaseSubStages - Sub-etapas de una fase específica
 */
const PhaseSubStages = ({ phaseLabel, subStages, isLast }) => {
  // Calcular progreso
  const progress = useMemo(() => {
    if (!subStages || subStages.length === 0) return 0;

    const completed = subStages.filter(s =>
      s.estado === 'OK' || s.estado === 'ERROR' || s.estado === 'WARNING'
    ).length;

    return Math.round((completed / subStages.length) * 100);
  }, [subStages]);

  return (
    <Box
      sx={{
        mb: isLast ? 0 : 2,
        pb: isLast ? 0 : 2,
        borderBottom: isLast ? 'none' : `1px solid ${colors.grey[200]}`,
      }}
    >
      {/* Header de fase */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          mb: 1.5,
        }}
      >
        <Typography
          variant="subtitle2"
          sx={{
            fontWeight: 700,
            color: colors.grey[800],
            fontSize: '0.875rem',
          }}
        >
          {phaseLabel}
        </Typography>

        {/* Progreso de fase */}
        <Typography
          variant="caption"
          sx={{
            fontSize: '0.75rem',
            fontWeight: 600,
            color: progress === 100 ? colors.success.main : colors.grey[600],
          }}
        >
          {progress}%
        </Typography>
      </Box>

      {/* Barra de progreso */}
      <LinearProgress
        variant="determinate"
        value={progress}
        sx={{
          mb: 2,
          height: 6,
          borderRadius: '3px',
          backgroundColor: colors.grey[200],
          '& .MuiLinearProgress-bar': {
            backgroundColor: progress === 100 ? colors.success.main : colors.primary.main,
            borderRadius: '3px',
          },
        }}
      />

      {/* Lista de sub-etapas */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: 1.5,
        }}
      >
        {subStages.map((subStage, index) => (
          <SubStageItem
            key={subStage.key}
            subStage={subStage}
            index={index}
          />
        ))}
      </Box>
    </Box>
  );
};

/**
 * SubStageItem - Item individual de sub-etapa
 */
const SubStageItem = ({ subStage, index }) => {
  const color = ESTADO_COLORS[subStage.estado] || ESTADO_COLORS.PENDIENTE;
  const Icon = ESTADO_ICONS[subStage.estado] || ESTADO_ICONS.PENDIENTE;

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        p: 1.5,
        borderRadius: '8px',
        backgroundColor: colors.grey[50],
        border: `1px solid ${colors.grey[200]}`,
        transition: 'all 0.2s ease',
        '&:hover': {
          backgroundColor: colors.grey[100],
          borderColor: color,
        },
      }}
    >
      {/* Número */}
      <Box
        sx={{
          minWidth: 24,
          height: 24,
          borderRadius: '50%',
          backgroundColor: `${color}20`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Typography
          variant="caption"
          sx={{
            fontSize: '0.7rem',
            fontWeight: 700,
            color: color,
          }}
        >
          {subStage.orden || index + 1}
        </Typography>
      </Box>

      {/* Label */}
      <Typography
        variant="body2"
        sx={{
          flex: 1,
          fontSize: '0.8rem',
          color: colors.grey[800],
          fontWeight: 500,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {subStage.label}
      </Typography>

      {/* Icono de estado */}
      <Icon
        sx={{
          fontSize: 18,
          color: color,
        }}
      />
    </Box>
  );
};

/**
 * getPhaseLabel - Obtiene label legible de una fase
 * @param {string} phaseId - ID de la fase
 * @returns {string} - Label de la fase
 */
const getPhaseLabel = (phaseId) => {
  const labels = {
    'PROCESS_IPA': 'IPA - Procesamiento de Inversiones',
    'PROCESS_CAPM': 'CAPM - Capital Asset Pricing Model',
    'PROCESS_DERIVADOS': 'Derivados - Instrumentos Financieros',
    'PROCESS_PNL': 'PNL - Pérdidas y Ganancias',
    'PROCESS_UBS': 'UBS - Procesamiento UBS',
  };

  return labels[phaseId] || phaseId;
};

export default FundSubStages;
