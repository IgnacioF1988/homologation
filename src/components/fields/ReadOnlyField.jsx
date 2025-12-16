/**
 * ReadOnlyField - Campo de solo lectura premium
 * 
 * Muestra valores que no se pueden editar con estilo elegante
 */

import React from 'react';
import { TextField, Box, Typography, Tooltip, alpha } from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { colors, borderRadius, typography } from '../../styles/theme';

// Anchos
const fieldWidths = {
  xs: { width: 100 },
  sm: { width: 150 },
  md: { width: 220 },
  lg: { width: 300 },
  xl: { width: 400 },
  full: { width: '100%' },
  flex1: { flex: 1, minWidth: 200 },
  flex2: { flex: 2, minWidth: 280 },
};

// Estilos readonly
const readOnlyStyles = {
  '& .MuiOutlinedInput-root': {
    borderRadius: borderRadius.md,
    backgroundColor: alpha(colors.grey[500], 0.04),
    fontSize: typography.fontSize.md,
    transition: 'all 200ms ease',
    
    '& fieldset': {
      borderColor: 'transparent',
    },
    
    '&:hover': {
      backgroundColor: alpha(colors.grey[500], 0.06),
      '& fieldset': {
        borderColor: 'transparent',
      },
    },
  },
  
  '& .MuiFilledInput-root': {
    borderRadius: borderRadius.md,
    backgroundColor: alpha(colors.grey[500], 0.04),
    
    '&:before, &:after': {
      display: 'none',
    },
    
    '&:hover': {
      backgroundColor: alpha(colors.grey[500], 0.06),
    },
  },
  
  '& .MuiInputLabel-root': {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.text.tertiary,
  },
  
  '& .MuiInputBase-input': {
    color: colors.text.secondary,
    cursor: 'default',
    padding: '14px 16px',
    WebkitTextFillColor: colors.text.secondary,
  },
};

const ReadOnlyField = ({
  name,
  label,
  value,
  displayValue = null,
  width = 'flex1',
  variant = 'outlined',
  tooltip = null,
  icon = null,
  size = 'small',
  sx = {},
  ...props
}) => {
  const getWidthStyles = () => {
    if (typeof width === 'number') return { width };
    return fieldWidths[width] || fieldWidths.flex1;
  };

  const showValue = displayValue ?? value ?? '';

  // Variante plain - solo texto
  if (variant === 'plain') {
    return (
      <Box sx={{ ...getWidthStyles(), ...sx }}>
        <Typography 
          variant="caption" 
          sx={{ 
            display: 'block', 
            mb: 0.75,
            fontSize: typography.fontSize.xs,
            fontWeight: typography.fontWeight.medium,
            color: colors.text.tertiary,
            letterSpacing: '0.02em',
          }}
        >
          {label}
          {tooltip && (
            <Tooltip title={tooltip} arrow placement="top">
              <InfoOutlinedIcon 
                sx={{ 
                  fontSize: 14, 
                  ml: 0.5, 
                  verticalAlign: 'middle', 
                  cursor: 'help',
                  color: colors.text.muted,
                  '&:hover': {
                    color: colors.primary.main,
                  },
                }} 
              />
            </Tooltip>
          )}
        </Typography>
        <Typography 
          variant="body2" 
          sx={{ 
            fontWeight: typography.fontWeight.medium,
            color: showValue ? colors.text.primary : colors.text.muted,
            fontSize: typography.fontSize.sm,
          }}
        >
          {showValue || '—'}
        </Typography>
      </Box>
    );
  }

  return (
    <TextField
      name={name}
      label={label}
      value={showValue}
      variant={variant}
      size={size}
      InputProps={{
        readOnly: true,
        startAdornment: icon,
      }}
      sx={{
        ...getWidthStyles(),
        ...readOnlyStyles,
        ...sx,
      }}
      {...props}
    />
  );
};

export default ReadOnlyField;
