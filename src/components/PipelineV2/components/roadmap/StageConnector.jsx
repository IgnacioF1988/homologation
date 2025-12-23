/**
 * StageConnector - Conector entre Nodos de Etapa
 * Línea animada que conecta etapas del roadmap
 */

import React from 'react';
import { Box } from '@mui/material';
import { flowRight } from '../../utils/animationKeyframes';
import { colors } from '../../../../styles/theme';

/**
 * StageConnector Component
 *
 * @param {Object} props
 * @param {boolean} props.isActive - Si el conector está activo (animación de flujo)
 * @param {boolean} props.isCompleted - Si la conexión ha completado
 * @param {string} props.color - Color del conector (opcional)
 * @param {number} props.width - Ancho del conector (default: 80)
 * @param {number} props.height - Altura de la línea (default: 4)
 * @param {string} props.direction - Dirección ('horizontal', 'vertical')
 * @param {Object} props.sx - Estilos adicionales
 */
export const StageConnector = ({
  isActive = false,
  isCompleted = false,
  color,
  width = 80,
  height = 4,
  direction = 'horizontal',
  sx = {},
}) => {
  // Determinar color del conector
  const connectorColor = color || (isCompleted ? colors.success.main : colors.grey[300]);

  // Configuración para dirección vertical u horizontal
  const isVertical = direction === 'vertical';

  return (
    <Box
      sx={{
        position: 'relative',
        width: isVertical ? height : width,
        height: isVertical ? width : height,
        backgroundColor: isCompleted ? connectorColor : colors.grey[200],
        borderRadius: '2px',
        overflow: 'hidden',
        transition: 'all 0.3s ease',
        ...sx,
      }}
    >
      {/* Dot de flujo animado */}
      {isActive && (
        <Box
          sx={{
            position: 'absolute',
            top: isVertical ? '-30%' : '50%',
            left: isVertical ? '50%' : '-30%',
            transform: isVertical ? 'translate(-50%, 0)' : 'translate(0, -50%)',
            width: isVertical ? height * 2 : '30%',
            height: isVertical ? '30%' : height * 2,
            background: `linear-gradient(${
              isVertical ? '180deg' : '90deg'
            }, transparent 0%, ${connectorColor} 50%, transparent 100%)`,
            borderRadius: '50%',
            animation: isVertical
              ? `${flowRight} 2s ease-in-out infinite`
              : `${flowRight} 2s ease-in-out infinite`,
            // Ajustar animación para vertical
            ...(isVertical && {
              '@keyframes flowDown': {
                '0%': { top: '-30%', opacity: 0 },
                '20%': { opacity: 1 },
                '80%': { opacity: 1 },
                '100%': { top: '100%', opacity: 0 },
              },
              animation: 'flowDown 2s ease-in-out infinite',
            }),
          }}
        />
      )}

      {/* Glow effect para conector activo */}
      {isActive && (
        <Box
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            backgroundColor: connectorColor,
            opacity: 0.3,
            filter: 'blur(4px)',
          }}
        />
      )}
    </Box>
  );
};

export default StageConnector;
