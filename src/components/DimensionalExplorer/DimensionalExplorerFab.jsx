/**
 * DimensionalExplorerFab - FAB flotante para activar el explorador
 *
 * Posicionado 70px arriba del SearchHelper (que está en bottom: 32px)
 * Con ícono de base de datos y badge de filtros activos
 */

import React, { memo } from 'react';
import { Box, Badge, Tooltip, alpha } from '@mui/material';
import StorageRoundedIcon from '@mui/icons-material/StorageRounded';
import { colors, borderRadius, transitions } from '../../styles/theme';

const DimensionalExplorerFab = memo(({
  onClick,
  filterCount = 0,
  disabled = false,
}) => {
  return (
    <Box
      sx={{
        position: 'fixed',
        bottom: 32 + 70, // 70px arriba del SearchHelper
        right: 32,
        zIndex: 1200,
      }}
    >
      <Tooltip
        title="Explorador Dimensional"
        placement="left"
        arrow
      >
        <Badge
          badgeContent={filterCount}
          color="error"
          invisible={filterCount === 0}
          sx={{
            '& .MuiBadge-badge': {
              fontSize: '0.65rem',
              height: 18,
              minWidth: 18,
              fontWeight: 600,
            },
          }}
        >
          <Box
            onClick={disabled ? undefined : onClick}
            role="button"
            tabIndex={disabled ? -1 : 0}
            onKeyDown={(e) => !disabled && e.key === 'Enter' && onClick?.()}
            sx={{
              width: 56,
              height: 56,
              borderRadius: borderRadius.lg,
              background: `linear-gradient(135deg, ${colors.secondary.main} 0%, ${colors.secondary.light} 100%)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: disabled ? 'not-allowed' : 'pointer',
              boxShadow: `0 8px 32px ${alpha(colors.secondary.main, 0.35)}`,
              transition: transitions.default,
              userSelect: 'none',
              opacity: disabled ? 0.6 : 1,

              '&:hover': !disabled ? {
                transform: 'scale(1.05) translateY(-2px)',
                boxShadow: `0 12px 40px ${alpha(colors.secondary.main, 0.45)}`,
              } : {},

              '&:active': !disabled ? {
                transform: 'scale(0.95)',
              } : {},

              // Anillo de foco para accesibilidad
              '&:focus-visible': {
                outline: 'none',
                boxShadow: `0 0 0 4px ${alpha(colors.secondary.main, 0.3)}, 0 8px 32px ${alpha(colors.secondary.main, 0.35)}`,
              },
            }}
          >
            <StorageRoundedIcon
              sx={{
                color: '#fff',
                fontSize: 26,
                filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))',
              }}
            />
          </Box>
        </Badge>
      </Tooltip>
    </Box>
  );
});

DimensionalExplorerFab.displayName = 'DimensionalExplorerFab';

export default DimensionalExplorerFab;
