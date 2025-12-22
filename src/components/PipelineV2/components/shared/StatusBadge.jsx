/**
 * StatusBadge - Badge de Estado Reutilizable
 * Muestra un badge con color, icono y label basado en el estado
 */

import React from 'react';
import { Box, Chip, Typography } from '@mui/material';
import { ESTADO_COLORS, ESTADO_COLORS_LIGHT, ESTADO_ICONS, ESTADO_LABELS } from '../../utils/constants';

/**
 * StatusBadge Component
 *
 * @param {Object} props
 * @param {string} props.status - Estado ('OK', 'ERROR', 'WARNING', etc.)
 * @param {string} props.variant - Variante del badge ('chip', 'dot', 'full')
 * @param {string} props.size - Tamaño ('small', 'medium', 'large')
 * @param {boolean} props.showIcon - Mostrar icono (default: true)
 * @param {boolean} props.showLabel - Mostrar label (default: true)
 * @param {string} props.customLabel - Label personalizado (opcional)
 * @param {Object} props.sx - Estilos adicionales
 */
export const StatusBadge = ({
  status,
  variant = 'chip',
  size = 'medium',
  showIcon = true,
  showLabel = true,
  customLabel,
  sx = {},
}) => {
  if (!status) return null;

  const color = ESTADO_COLORS[status] || ESTADO_COLORS.PENDIENTE;
  const colorLight = ESTADO_COLORS_LIGHT[status] || ESTADO_COLORS_LIGHT.PENDIENTE;
  const Icon = ESTADO_ICONS[status] || ESTADO_ICONS.PENDIENTE;
  const label = customLabel || ESTADO_LABELS[status] || status;

  // Chip variant (Material-UI Chip)
  if (variant === 'chip') {
    return (
      <Chip
        icon={showIcon ? <Icon sx={{ fontSize: getSizeIcon(size), color: color }} /> : undefined}
        label={showLabel ? label : null}
        size={size === 'large' ? 'medium' : size}
        sx={{
          backgroundColor: colorLight,
          color: color,
          fontWeight: 600,
          fontSize: getSizeFontSize(size),
          borderRadius: '12px',
          border: `1px solid ${color}`,
          '& .MuiChip-icon': {
            marginLeft: '8px',
          },
          ...sx,
        }}
      />
    );
  }

  // Dot variant (pequeño círculo con label)
  if (variant === 'dot') {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          ...sx,
        }}
      >
        <Box
          sx={{
            width: getSizeDot(size),
            height: getSizeDot(size),
            borderRadius: '50%',
            backgroundColor: color,
            flexShrink: 0,
          }}
        />
        {showLabel && (
          <Typography
            variant="body2"
            sx={{
              fontSize: getSizeFontSize(size),
              color: color,
              fontWeight: 600,
            }}
          >
            {label}
          </Typography>
        )}
      </Box>
    );
  }

  // Full variant (box con background, icono y label)
  if (variant === 'full') {
    return (
      <Box
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 1,
          px: 2,
          py: 1,
          borderRadius: '8px',
          backgroundColor: colorLight,
          border: `1px solid ${color}`,
          ...sx,
        }}
      >
        {showIcon && (
          <Icon
            sx={{
              fontSize: getSizeIcon(size),
              color: color,
            }}
          />
        )}
        {showLabel && (
          <Typography
            variant="body2"
            sx={{
              fontSize: getSizeFontSize(size),
              color: color,
              fontWeight: 600,
            }}
          >
            {label}
          </Typography>
        )}
      </Box>
    );
  }

  // Default: chip variant
  return (
    <Chip
      icon={showIcon ? <Icon sx={{ fontSize: getSizeIcon(size), color: color }} /> : undefined}
      label={showLabel ? label : null}
      size={size === 'large' ? 'medium' : size}
      sx={{
        backgroundColor: colorLight,
        color: color,
        fontWeight: 600,
        ...sx,
      }}
    />
  );
};

// Helper: Tamaño de icono basado en size
const getSizeIcon = (size) => {
  switch (size) {
    case 'small':
      return 16;
    case 'large':
      return 24;
    case 'medium':
    default:
      return 20;
  }
};

// Helper: Tamaño de fuente basado en size
const getSizeFontSize = (size) => {
  switch (size) {
    case 'small':
      return '0.75rem';
    case 'large':
      return '1rem';
    case 'medium':
    default:
      return '0.875rem';
  }
};

// Helper: Tamaño de dot basado en size
const getSizeDot = (size) => {
  switch (size) {
    case 'small':
      return 8;
    case 'large':
      return 16;
    case 'medium':
    default:
      return 12;
  }
};

export default StatusBadge;
