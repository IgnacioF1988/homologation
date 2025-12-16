/**
 * BooleanDimension - Componente para dimensiones booleanas
 *
 * Muestra toggles para valores Sí/No o Yes/No
 */

import React, { memo } from 'react';
import { Box, Typography, alpha } from '@mui/material';
import ToggleOnIcon from '@mui/icons-material/ToggleOn';
import { colors, borderRadius, transitions } from '../../../styles/theme';
import DraggableChip from './DraggableChip';

const BooleanDimension = memo(({
  dimension,
  activeFilters = [],
  onToggleFilter,
}) => {
  const { key, label, values = [], icon: Icon = ToggleOnIcon } = dimension;

  // Verificar si un valor está activo
  const isValueActive = (value) => {
    return activeFilters.some(
      (f) => f.dimension === key && f.value === value
    );
  };

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        py: 1,
        px: 1,
        borderRadius: borderRadius.sm,
        transition: transitions.fast,
        '&:hover': {
          backgroundColor: alpha(colors.primary.main, 0.04),
        },
      }}
    >
      {/* Label con ícono */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Icon
          sx={{
            fontSize: 16,
            color: colors.text.tertiary,
          }}
        />
        <Typography
          sx={{
            fontSize: '0.75rem',
            fontWeight: 500,
            color: colors.text.secondary,
          }}
        >
          {label}
        </Typography>
      </Box>

      {/* Chips de valores */}
      <Box sx={{ display: 'flex', gap: 0.5 }}>
        {values.map((valueConfig) => (
          <DraggableChip
            key={`${key}-${valueConfig.value}`}
            id={`${key}-${valueConfig.value}`}
            dimension={key}
            value={valueConfig.value}
            label={valueConfig.label}
            color={valueConfig.color || colors.primary.main}
            isActive={isValueActive(valueConfig.value)}
            onClick={onToggleFilter}
          />
        ))}
      </Box>
    </Box>
  );
});

BooleanDimension.displayName = 'BooleanDimension';

export default BooleanDimension;
