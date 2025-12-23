/**
 * StageNode - Nodo de Etapa del Roadmap
 * Representa una etapa individual del pipeline con icono, estado y animaciones
 */

import React from 'react';
import { Box, Tooltip, Typography } from '@mui/material';
import { ESTADO_COLORS, ESTADO_ICONS } from '../../utils/constants';
import { shimmer, pulse } from '../../utils/animationKeyframes';
import { colors } from '../../../../styles/theme';

/**
 * StageNode Component
 *
 * @param {Object} props
 * @param {Object} props.stage - Configuración de la etapa (de PIPELINE_STAGES)
 * @param {string} props.estado - Estado actual de la etapa ('OK', 'ERROR', etc.)
 * @param {boolean} props.isActive - Si la etapa está activa (EN_PROGRESO)
 * @param {boolean} props.isCompleted - Si la etapa ha completado
 * @param {number} props.size - Tamaño del nodo (default: 60)
 * @param {boolean} props.showLabel - Mostrar label debajo del nodo (default: true)
 * @param {Function} props.onClick - Callback al hacer click (opcional)
 * @param {Object} props.sx - Estilos adicionales
 */
export const StageNode = ({
  stage,
  estado = 'PENDIENTE',
  isActive = false,
  isCompleted = false,
  size = 60,
  showLabel = true,
  onClick,
  sx = {},
}) => {
  if (!stage) return null;

  // Configuración de colores
  const stageColor = isCompleted && estado === 'OK' ? stage.color : ESTADO_COLORS[estado];
  const StateIcon = ESTADO_ICONS[estado];
  const StageIcon = stage.icono;

  // Determinar si debe animarse
  const shouldAnimate = isActive || estado === 'EN_PROGRESO';

  return (
    <Tooltip
      title={
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
            {stage.nombre}
          </Typography>
          <Typography variant="caption" sx={{ color: colors.grey[300] }}>
            Estado: {estado}
          </Typography>
        </Box>
      }
      placement="top"
      arrow
    >
      <Box
        onClick={onClick}
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 1,
          cursor: onClick ? 'pointer' : 'default',
          transition: 'transform 0.2s ease',
          '&:hover': onClick ? {
            transform: 'scale(1.05)',
          } : {},
          ...sx,
        }}
      >
        {/* Nodo principal */}
        <Box
          sx={{
            position: 'relative',
            width: size,
            height: size,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: getBackgroundColor(estado, stageColor),
            border: `3px solid ${stageColor}`,
            boxShadow: isActive ? `0 0 20px ${stageColor}40` : '0 4px 8px rgba(0,0,0,0.1)',
            transition: 'all 0.3s ease',
            // Animación shimmer si está activo
            ...(shouldAnimate && {
              background: `linear-gradient(90deg, ${stageColor}20 0%, ${stageColor}40 50%, ${stageColor}20 100%)`,
              backgroundSize: '200% 100%',
              animation: `${shimmer} 2s infinite`,
            }),
          }}
        >
          {/* Icono de etapa */}
          <StageIcon
            sx={{
              fontSize: size * 0.5,
              color: stageColor,
              zIndex: 1,
            }}
          />

          {/* Badge de estado (pequeño icono en esquina) */}
          {(estado === 'ERROR' || estado === 'WARNING' || estado === 'OK') && (
            <Box
              sx={{
                position: 'absolute',
                bottom: -4,
                right: -4,
                width: size * 0.35,
                height: size * 0.35,
                borderRadius: '50%',
                backgroundColor: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: `2px solid ${stageColor}`,
                boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
              }}
            >
              <StateIcon
                sx={{
                  fontSize: size * 0.25,
                  color: stageColor,
                }}
              />
            </Box>
          )}

          {/* Pulse animation para estados activos */}
          {shouldAnimate && (
            <Box
              sx={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                borderRadius: '50%',
                border: `2px solid ${stageColor}`,
                animation: `${pulse} 2s cubic-bezier(0.4, 0, 0.6, 1) infinite`,
                opacity: 0.5,
              }}
            />
          )}
        </Box>

        {/* Label */}
        {showLabel && (
          <Typography
            variant="caption"
            sx={{
              fontSize: '0.75rem',
              fontWeight: 600,
              color: isActive ? stageColor : colors.grey[700],
              textAlign: 'center',
              maxWidth: size + 20,
              lineHeight: 1.2,
            }}
          >
            {stage.nombre}
          </Typography>
        )}
      </Box>
    </Tooltip>
  );
};

/**
 * getBackgroundColor - Obtiene color de fondo basado en estado
 * @param {string} estado - Estado de la etapa
 * @param {string} stageColor - Color de la etapa
 * @returns {string} - Color de fondo
 */
const getBackgroundColor = (estado, stageColor) => {
  switch (estado) {
    case 'OK':
      return `${stageColor}15`;
    case 'ERROR':
      return `${ESTADO_COLORS.ERROR}15`;
    case 'WARNING':
      return `${ESTADO_COLORS.WARNING}15`;
    case 'EN_PROGRESO':
      return `${stageColor}25`;
    case 'PENDIENTE':
      return colors.grey[100];
    case 'OMITIDO':
    case 'N/A':
      return colors.grey[50];
    default:
      return '#fff';
  }
};

export default StageNode;
