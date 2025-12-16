/**
 * LogicToggle - Toggle para cambiar entre AND y OR
 *
 * Un componente elegante para alternar la lógica de filtros
 */

import React, { memo } from 'react';
import { Box, Typography, Tooltip } from '@mui/material';
import { colors, borderRadius, transitions, shadows } from '../../../styles/theme';

const LogicToggle = memo(({
  operator = 'AND',
  onChange,
  disabled = false,
}) => {
  const isAnd = operator === 'AND';

  const handleToggle = () => {
    if (!disabled && onChange) {
      onChange(isAnd ? 'OR' : 'AND');
    }
  };

  return (
    <Tooltip
      title={
        isAnd
          ? 'AND: El instrumento debe cumplir TODOS los filtros'
          : 'OR: El instrumento debe cumplir AL MENOS UNO de los filtros'
      }
      placement="top"
      arrow
    >
      <Box
        onClick={handleToggle}
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          backgroundColor: colors.grey[100],
          borderRadius: borderRadius.full,
          padding: '3px',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          transition: transitions.fast,
          '&:hover': !disabled ? {
            backgroundColor: colors.grey[200],
          } : {},
        }}
      >
        {/* Opción AND */}
        <Box
          sx={{
            px: 1.5,
            py: 0.5,
            borderRadius: borderRadius.full,
            transition: transitions.fast,
            backgroundColor: isAnd ? colors.primary.main : 'transparent',
            boxShadow: isAnd ? shadows.sm : 'none',
          }}
        >
          <Typography
            sx={{
              fontSize: '0.7rem',
              fontWeight: 600,
              color: isAnd ? '#fff' : colors.text.tertiary,
              letterSpacing: '0.05em',
              transition: transitions.fast,
            }}
          >
            AND
          </Typography>
        </Box>

        {/* Opción OR */}
        <Box
          sx={{
            px: 1.5,
            py: 0.5,
            borderRadius: borderRadius.full,
            transition: transitions.fast,
            backgroundColor: !isAnd ? colors.secondary.main : 'transparent',
            boxShadow: !isAnd ? shadows.sm : 'none',
          }}
        >
          <Typography
            sx={{
              fontSize: '0.7rem',
              fontWeight: 600,
              color: !isAnd ? '#fff' : colors.text.tertiary,
              letterSpacing: '0.05em',
              transition: transitions.fast,
            }}
          >
            OR
          </Typography>
        </Box>
      </Box>
    </Tooltip>
  );
});

LogicToggle.displayName = 'LogicToggle';

export default LogicToggle;
