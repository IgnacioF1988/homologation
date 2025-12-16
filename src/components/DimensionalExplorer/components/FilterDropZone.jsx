/**
 * FilterDropZone - Zona de drop para filtros
 *
 * Área donde se pueden soltar los chips arrastrados
 * Incluye LogicToggle, lista de ActiveFilterChip y botón limpiar
 */

import React, { memo } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { Box, Typography, Button, alpha, Fade } from '@mui/material';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import FilterListIcon from '@mui/icons-material/FilterList';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import { colors, borderRadius, transitions } from '../../../styles/theme';
import LogicToggle from './LogicToggle';
import ActiveFilterChip from './ActiveFilterChip';

const FilterDropZone = memo(({
  filters = [],
  operator = 'AND',
  onOperatorChange,
  onRemoveFilter,
  onClearAll,
}) => {
  // Setup droppable
  const { isOver, setNodeRef } = useDroppable({
    id: 'filter-drop-zone',
  });

  const hasFilters = filters.length > 0;

  return (
    <Box
      ref={setNodeRef}
      sx={{
        minHeight: 80,
        p: 2,
        borderRadius: borderRadius.lg,
        border: `2px dashed ${isOver ? colors.primary.main : colors.border.default}`,
        backgroundColor: isOver
          ? alpha(colors.primary.main, 0.04)
          : hasFilters
          ? colors.background.paper
          : alpha(colors.grey[100], 0.5),
        transition: transitions.slow,
        position: 'relative',

        // Efecto de glow cuando hay drag over
        ...(isOver && {
          boxShadow: `0 0 0 4px ${alpha(colors.primary.main, 0.1)}, inset 0 0 20px ${alpha(colors.primary.main, 0.05)}`,
        }),
      }}
    >
      {/* Header con toggle y botón limpiar */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          mb: hasFilters ? 1.5 : 0,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <FilterListIcon
            sx={{
              fontSize: 18,
              color: hasFilters ? colors.primary.main : colors.text.muted,
            }}
          />
          <Typography
            sx={{
              fontSize: '0.8rem',
              fontWeight: 600,
              color: hasFilters ? colors.text.primary : colors.text.muted,
            }}
          >
            Filtros Activos
          </Typography>

          {/* Toggle AND/OR - solo visible si hay filtros */}
          {hasFilters && (
            <Fade in>
              <Box>
                <LogicToggle
                  operator={operator}
                  onChange={onOperatorChange}
                  disabled={filters.length < 2}
                />
              </Box>
            </Fade>
          )}
        </Box>

        {/* Botón limpiar todo */}
        {hasFilters && (
          <Fade in>
            <Button
              size="small"
              onClick={onClearAll}
              startIcon={<DeleteSweepIcon sx={{ fontSize: 16 }} />}
              sx={{
                fontSize: '0.7rem',
                fontWeight: 500,
                color: colors.text.tertiary,
                textTransform: 'none',
                px: 1,
                py: 0.5,
                minWidth: 'auto',
                '&:hover': {
                  color: colors.error.main,
                  backgroundColor: alpha(colors.error.main, 0.08),
                },
              }}
            >
              Limpiar
            </Button>
          </Fade>
        )}
      </Box>

      {/* Contenido */}
      {hasFilters ? (
        /* Grid de filtros activos */
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 0.75,
          }}
        >
          {filters.map((filter, index) => (
            <ActiveFilterChip
              key={filter.id}
              filter={filter}
              onRemove={onRemoveFilter}
              animationDelay={index * 50}
            />
          ))}
        </Box>
      ) : (
        /* Estado vacío con placeholder */
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            py: 2,
            gap: 1,
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              animation: isOver ? 'pulse 1s infinite' : 'none',
              '@keyframes pulse': {
                '0%, 100%': { opacity: 1 },
                '50%': { opacity: 0.5 },
              },
            }}
          >
            <DragIndicatorIcon
              sx={{
                fontSize: 20,
                color: isOver ? colors.primary.main : colors.text.muted,
                transition: transitions.fast,
              }}
            />
            <Typography
              sx={{
                fontSize: '0.8rem',
                color: isOver ? colors.primary.main : colors.text.muted,
                fontWeight: isOver ? 500 : 400,
                transition: transitions.fast,
              }}
            >
              {isOver ? 'Suelta aquí para filtrar' : 'Arrastra chips aquí o haz clic para agregar'}
            </Typography>
          </Box>
        </Box>
      )}

      {/* Indicador visual durante drag */}
      {isOver && (
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            borderRadius: borderRadius.lg,
            pointerEvents: 'none',
            border: `2px solid ${colors.primary.main}`,
            animation: 'borderPulse 1s infinite',
            '@keyframes borderPulse': {
              '0%, 100%': { opacity: 1 },
              '50%': { opacity: 0.5 },
            },
          }}
        />
      )}
    </Box>
  );
});

FilterDropZone.displayName = 'FilterDropZone';

export default FilterDropZone;
