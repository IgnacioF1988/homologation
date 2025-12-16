/**
 * DimensionalExplorer - Drawer principal del explorador dimensional
 *
 * Orquesta todos los componentes: CatalogPanel, FilterDropZone,
 * ResultsGrid, ResultsCounter. Provee el contexto de DnD.
 */

import React, { useCallback } from 'react';
import { DndContext, DragOverlay, closestCenter } from '@dnd-kit/core';
import {
  Drawer,
  Box,
  Typography,
  IconButton,
  alpha,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ExploreIcon from '@mui/icons-material/Explore';
import { colors, borderRadius, shadows, transitions } from '../../styles/theme';

// Componentes
import CatalogPanel from './components/CatalogPanel';
import FilterDropZone from './components/FilterDropZone';
import ResultsGrid from './components/ResultsGrid';
import ResultsCounter from './components/ResultsCounter';
import DraggableChip from './components/DraggableChip';

// Hooks
import useDimensionalFilters from './hooks/useDimensionalFilters';
import useFilteredInstruments from './hooks/useFilteredInstruments';
import useDimensionData from './hooks/useDimensionData';

const DRAWER_WIDTH = 'calc(100vw - 64px)';
const MAX_DRAWER_WIDTH = 1600;

const DimensionalExplorer = ({
  open = false,
  onClose,
}) => {
  // Hook de datos de dimensiones (catálogos)
  const {
    dimensions,
    booleanDimensions,
    loading: catalogsLoading,
  } = useDimensionData();

  // Hook de filtros
  const {
    filterState,
    filters,
    operator,
    filterCount,
    addFilter,
    removeFilter,
    toggleOperator,
    clearAll,
    toggleFilter,
  } = useDimensionalFilters();

  // Hook de instrumentos filtrados
  const {
    results,
    total,
    hasMore,
    loading: instrumentsLoading,
    loadProgress,
    sortColumn,
    sortDirection,
    handleSort,
    loadMore,
  } = useFilteredInstruments(filterState);

  // Combinar estados de carga
  const loading = catalogsLoading || instrumentsLoading;

  // Estado para el drag overlay
  const [activeDragItem, setActiveDragItem] = React.useState(null);

  // Manejar inicio de drag
  const handleDragStart = useCallback((event) => {
    const { active } = event;
    if (active?.data?.current) {
      setActiveDragItem(active.data.current);
    }
  }, []);

  // Manejar fin de drag
  const handleDragEnd = useCallback(
    (event) => {
      const { active, over } = event;

      // Limpiar estado de drag
      setActiveDragItem(null);

      // Si se soltó sobre la zona de drop
      if (over?.id === 'filter-drop-zone' && active?.data?.current) {
        const { dimension, value, label } = active.data.current;
        addFilter(dimension, value, label);
      }
    },
    [addFilter]
  );

  // Manejar cambio de operador
  const handleOperatorChange = useCallback(
    (newOperator) => {
      if (newOperator === 'AND' || newOperator === 'OR') {
        // toggleOperator solo hace toggle, necesitamos setOperator
        // pero usemos toggleOperator si operator actual es diferente
        if (operator !== newOperator) {
          toggleOperator();
        }
      }
    },
    [operator, toggleOperator]
  );

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      disableScrollLock
      keepMounted={false}
      PaperProps={{
        sx: {
          width: DRAWER_WIDTH,
          maxWidth: MAX_DRAWER_WIDTH,
          borderRadius: `${borderRadius.xl} 0 0 ${borderRadius.xl}`,
          boxShadow: shadows.floating,
          overflow: 'hidden',
        },
      }}
      // Backdrop con blur
      slotProps={{
        backdrop: {
          sx: {
            backgroundColor: 'rgba(0, 0, 0, 0.3)',
            backdropFilter: 'blur(4px)',
          },
        },
      }}
    >
      <DndContext
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        {/* Layout principal */}
        <Box
          sx={{
            height: '100vh',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: colors.background.default,
          }}
        >
          {/* Header */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              px: 3,
              py: 2,
              backgroundColor: colors.background.paper,
              borderBottom: `1px solid ${colors.border.light}`,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Box
                sx={{
                  width: 44,
                  height: 44,
                  borderRadius: borderRadius.md,
                  background: colors.primary.gradient,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: `0 4px 16px ${alpha(colors.primary.main, 0.3)}`,
                }}
              >
                <ExploreIcon sx={{ fontSize: 24, color: '#fff' }} />
              </Box>
              <Box>
                <Typography
                  sx={{
                    fontSize: '1.25rem',
                    fontWeight: 700,
                    color: colors.text.primary,
                    letterSpacing: '-0.02em',
                  }}
                >
                  Explorador Dimensional
                </Typography>
                <Typography
                  sx={{
                    fontSize: '0.8rem',
                    color: colors.text.tertiary,
                  }}
                >
                  Explora y filtra el stock de instrumentos
                </Typography>
              </Box>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              {/* Contador inline en el header */}
              <Box
                sx={{
                  px: 2,
                  py: 1,
                  borderRadius: borderRadius.md,
                  backgroundColor: alpha(colors.primary.main, 0.08),
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                }}
              >
                <Typography
                  sx={{
                    fontSize: '1.25rem',
                    fontWeight: 700,
                    color: colors.primary.main,
                  }}
                >
                  {total.toLocaleString()}
                </Typography>
                <Typography
                  sx={{
                    fontSize: '0.75rem',
                    color: colors.text.secondary,
                  }}
                >
                  instrumentos
                </Typography>
              </Box>

              {/* Botón cerrar */}
              <IconButton
                onClick={onClose}
                sx={{
                  width: 40,
                  height: 40,
                  color: colors.text.tertiary,
                  transition: transitions.fast,
                  '&:hover': {
                    backgroundColor: colors.grey[100],
                    color: colors.text.primary,
                  },
                }}
              >
                <CloseIcon />
              </IconButton>
            </Box>
          </Box>

          {/* Contenido principal - Grid layout */}
          <Box
            sx={{
              flex: 1,
              display: 'flex',
              overflow: 'hidden',
            }}
          >
            {/* Panel izquierdo - Catálogos */}
            <CatalogPanel
              activeFilters={filters}
              onToggleFilter={toggleFilter}
              filterCount={filterCount}
              dimensions={dimensions}
              booleanDimensions={booleanDimensions}
              loading={catalogsLoading}
            />

            {/* Panel derecho - Filtros y resultados */}
            <Box
              sx={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                p: 2,
                gap: 2,
              }}
            >
              {/* Zona de drop de filtros */}
              <FilterDropZone
                filters={filters}
                operator={operator}
                onOperatorChange={handleOperatorChange}
                onRemoveFilter={removeFilter}
                onClearAll={clearAll}
              />

              {/* Contador de resultados */}
              <ResultsCounter
                total={total}
                loading={loading}
                loadProgress={loadProgress}
              />

              {/* Grilla de resultados */}
              <ResultsGrid
                results={results}
                loading={loading}
                hasMore={hasMore}
                onLoadMore={loadMore}
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
                total={total}
              />
            </Box>
          </Box>
        </Box>

        {/* Overlay durante drag */}
        <DragOverlay>
          {activeDragItem && (
            <DraggableChip
              id="drag-overlay"
              dimension={activeDragItem.dimension}
              value={activeDragItem.value}
              label={activeDragItem.label}
              color={colors.primary.main}
              isActive
            />
          )}
        </DragOverlay>
      </DndContext>
    </Drawer>
  );
};

export default DimensionalExplorer;
