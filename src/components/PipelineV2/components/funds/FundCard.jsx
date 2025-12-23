/**
 * FundCard - Card de Fondo Completo
 * Integra todos los componentes de un fondo: header, roadmap, sub-etapas, errores
 */

import React, { memo, useCallback } from 'react';
import { Paper, Collapse, Box } from '@mui/material';
import FundCardHeader from './FundCardHeader';
import FundRoadmap from './FundRoadmap';
import FundSubStages from './FundSubStages';
import FundErrorPanel from './FundErrorPanel';
import { usePipelineUI } from '../../contexts/PipelineUIContext';
import { slideIn } from '../../utils/animationKeyframes';
import { colors } from '../../../../styles/theme';

/**
 * FundCard Component
 *
 * @param {Object} props
 * @param {ParsedFondo} props.fondo - Fondo parseado
 * @param {Object} props.fondoBackend - Fondo raw del backend (para sub-etapas)
 * @param {Function} props.onReprocess - Callback para reprocesar fondo (opcional)
 * @param {Function} props.onShowDetails - Callback para mostrar detalles (opcional)
 * @param {boolean} props.canReprocess - Si puede reprocesarse (default: false)
 * @param {boolean} props.hasChanges - Si el fondo tiene cambios recientes (para animación)
 * @param {Object} props.sx - Estilos adicionales
 */
export const FundCard = memo(({
  fondo,
  fondoBackend,
  onReprocess,
  onShowDetails,
  canReprocess = false,
  hasChanges = false,
  sx = {},
}) => {
  const {
    isFundExpanded,
    toggleFundExpansion,
    isSubStageExpanded,
    toggleSubStageExpansion,
  } = usePipelineUI();

  // Callbacks (ANTES de condicionales - React Hooks rules)
  const handleToggleExpand = useCallback(() => {
    if (!fondo) return;
    toggleFundExpansion(fondo.id);
  }, [fondo, toggleFundExpansion]);

  const handleToggleSubStages = useCallback(() => {
    if (!fondo) return;
    toggleSubStageExpansion(fondo.id);
  }, [fondo, toggleSubStageExpansion]);

  const handleReprocess = useCallback(() => {
    if (!fondo || !onReprocess) return;
    onReprocess(fondo);
  }, [fondo, onReprocess]);

  const handleShowDetails = useCallback(() => {
    if (!fondo || !onShowDetails) return;
    onShowDetails(fondo);
  }, [fondo, onShowDetails]);

  if (!fondo) return null;

  const isExpanded = isFundExpanded(fondo.id);
  const isSubStagesExpanded = isSubStageExpanded(fondo.id);

  // Determinar elevación basada en estado
  const elevation = getCardElevation(fondo);

  // Determinar si debe mostrar error/warning panel
  const shouldShowErrorPanel = fondo.hasError || fondo.hasWarning;

  return (
    <Paper
      elevation={elevation}
      sx={{
        borderRadius: '16px',
        overflow: 'hidden',
        border: `1px solid ${getCardBorderColor(fondo)}`,
        transition: 'all 0.3s ease',
        backgroundColor: '#fff',
        // Animación de entrada si tiene cambios
        ...(hasChanges && {
          animation: `${slideIn} 0.3s ease-out`,
        }),
        '&:hover': {
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
        },
        ...sx,
      }}
    >
      {/* Header */}
      <FundCardHeader
        fondo={fondo}
        isExpanded={isExpanded}
        isSubStagesExpanded={isSubStagesExpanded}
        onToggleExpand={handleToggleExpand}
        onToggleSubStages={handleToggleSubStages}
        onReprocess={canReprocess ? handleReprocess : undefined}
        onShowDetails={handleShowDetails}
        canReprocess={canReprocess}
      />

      {/* Contenido expandible */}
      <Collapse in={isExpanded} timeout={300}>
        <Box sx={{ p: 3, pt: 2 }}>
          {/* Roadmap del fondo (8 etapas) */}
          <FundRoadmap
            fondo={fondo}
            nodeSize={52}
            connectorWidth={70}
            showLabels={true}
            sx={{ mb: shouldShowErrorPanel || isSubStagesExpanded ? 3 : 0 }}
          />

          {/* Panel de error/warning */}
          {shouldShowErrorPanel && (
            <FundErrorPanel
              fondo={fondo}
              sx={{ mt: 2, mb: isSubStagesExpanded ? 2 : 0 }}
            />
          )}

          {/* Sub-etapas colapsables */}
          {fondoBackend && (
            <FundSubStages
              fondoBackend={fondoBackend}
              isExpanded={isSubStagesExpanded}
              sx={{ mt: 2 }}
            />
          )}
        </Box>
      </Collapse>
    </Paper>
  );
}, arePropsEqual);

/**
 * arePropsEqual - Custom comparator para React.memo
 * Solo re-renderizar si cambian props críticas
 */
function arePropsEqual(prevProps, nextProps) {
  // Comparar hash del fondo (detección de cambios)
  if (prevProps.fondo?._hash !== nextProps.fondo?._hash) {
    return false;
  }

  // Comparar flags de cambios
  if (prevProps.hasChanges !== nextProps.hasChanges) {
    return false;
  }

  // Comparar callbacks (solo si cambiaron las referencias)
  if (prevProps.onReprocess !== nextProps.onReprocess) {
    return false;
  }

  if (prevProps.onShowDetails !== nextProps.onShowDetails) {
    return false;
  }

  // Comparar canReprocess
  if (prevProps.canReprocess !== nextProps.canReprocess) {
    return false;
  }

  // Si nada cambió, no re-renderizar
  return true;
}

/**
 * getCardElevation - Obtiene elevación del card basada en estado
 * @param {ParsedFondo} fondo - Fondo parseado
 * @returns {number} - Elevación (0-4)
 */
const getCardElevation = (fondo) => {
  if (fondo.hasError) return 3;
  if (fondo.isProcessing) return 2;
  if (fondo.hasWarning) return 2;
  return 1;
};

/**
 * getCardBorderColor - Obtiene color de borde del card
 * @param {ParsedFondo} fondo - Fondo parseado
 * @returns {string} - Color de borde
 */
const getCardBorderColor = (fondo) => {
  if (fondo.hasError) return colors.error.light;
  if (fondo.hasWarning) return colors.warning.light;
  if (fondo.isProcessing) return colors.primary.light;
  if (fondo.status === 2) return colors.success.light; // OK

  return colors.grey[200];
};

export default FundCard;
