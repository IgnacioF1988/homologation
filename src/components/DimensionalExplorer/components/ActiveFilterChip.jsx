/**
 * ActiveFilterChip - Chip de filtro activo con botón de eliminar
 *
 * Muestra un filtro activo con animación de entrada
 * y botón X para eliminarlo
 */

import React, { memo } from 'react';
import { Box, Typography, IconButton, alpha, Tooltip } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { colors, borderRadius, transitions } from '../../../styles/theme';
import { getDimensionByKey } from '../utils/dimensionConfig';

const ActiveFilterChip = memo(({
  filter,
  onRemove,
  animationDelay = 0,
}) => {
  const { id, dimension, label } = filter;

  // Obtener info de la dimensión
  const dimensionInfo = getDimensionByKey(dimension);
  const dimensionLabel = dimensionInfo?.label || dimension;
  const color = dimensionInfo?.color || colors.primary.main;

  const handleRemove = (e) => {
    e.stopPropagation();
    if (onRemove) {
      onRemove(id);
    }
  };

  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        pl: 1.5,
        pr: 0.5,
        py: 0.25,
        borderRadius: borderRadius.full,
        backgroundColor: alpha(color, 0.1),
        border: `1px solid ${alpha(color, 0.3)}`,
        transition: transitions.fast,

        // Animación de entrada
        animation: 'chipEnter 200ms ease-out forwards',
        animationDelay: `${animationDelay}ms`,
        opacity: 0,
        transform: 'scale(0.8)',

        '@keyframes chipEnter': {
          '0%': {
            opacity: 0,
            transform: 'scale(0.8)',
          },
          '100%': {
            opacity: 1,
            transform: 'scale(1)',
          },
        },

        '&:hover': {
          backgroundColor: alpha(color, 0.15),
          borderColor: alpha(color, 0.5),
          boxShadow: `0 2px 8px ${alpha(color, 0.2)}`,
        },
      }}
    >
      {/* Etiqueta del valor */}
      <Tooltip title={`${dimensionLabel}: ${label}`} placement="top" arrow>
        <Typography
          sx={{
            fontSize: '0.75rem',
            fontWeight: 600,
            color: color,
            whiteSpace: 'nowrap',
            maxWidth: 120,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {label}
        </Typography>
      </Tooltip>

      {/* Indicador de dimensión */}
      <Typography
        sx={{
          fontSize: '0.6rem',
          fontWeight: 500,
          color: alpha(color, 0.7),
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        {dimensionLabel.substring(0, 3)}
      </Typography>

      {/* Botón eliminar */}
      <IconButton
        size="small"
        onClick={handleRemove}
        sx={{
          width: 18,
          height: 18,
          padding: 0,
          ml: 0.25,
          transition: transitions.fast,
          color: colors.text.tertiary,
          '&:hover': {
            color: colors.error.main,
            backgroundColor: alpha(colors.error.main, 0.1),
          },
        }}
      >
        <CloseIcon sx={{ fontSize: 12 }} />
      </IconButton>
    </Box>
  );
});

ActiveFilterChip.displayName = 'ActiveFilterChip';

export default ActiveFilterChip;
