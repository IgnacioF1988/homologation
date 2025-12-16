/**
 * ResultsGrid - Grilla virtualizada de resultados
 *
 * Usa @tanstack/react-virtual para renderizado eficiente
 * con scroll infinito y skeleton loading
 */

import React, { memo, useRef, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  Box,
  Typography,
  Chip,
  alpha,
  Button,
} from '@mui/material';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import InventoryIcon from '@mui/icons-material/Inventory';
import { colors, borderRadius, transitions } from '../../../styles/theme';
import { RESULT_GRID_COLUMNS } from '../utils/dimensionConfig';

// Altura de cada fila
const ROW_HEIGHT = 44;
const HEADER_HEIGHT = 40;

/**
 * Componente de celda individual
 */
const GridCell = memo(({ value, column, rowIndex }) => {
  // Renderizado especial para ciertas columnas
  if (column.key === 'investmentTypeCode' && value) {
    const typeColors = {
      EQ: colors.primary.main,
      FI: colors.secondary.main,
      FX: colors.warning.main,
      CO: colors.success.main,
      CA: colors.info.main,
      DE: colors.error.main,
    };

    return (
      <Chip
        label={value}
        size="small"
        sx={{
          height: 20,
          fontSize: '0.65rem',
          fontWeight: 600,
          backgroundColor: alpha(typeColors[value] || colors.grey[400], 0.1),
          color: typeColors[value] || colors.grey[600],
          '& .MuiChip-label': { px: 1 },
        }}
      />
    );
  }

  // Renderizado por defecto
  return (
    <Typography
      sx={{
        fontSize: '0.75rem',
        color: colors.text.primary,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
      title={value ?? '—'}
    >
      {value ?? '—'}
    </Typography>
  );
});

/**
 * Componente de fila
 */
const GridRow = memo(({ instrument, columns, index, style }) => {
  const isEven = index % 2 === 0;

  return (
    <Box
      style={style}
      sx={{
        display: 'flex',
        alignItems: 'center',
        px: 2,
        backgroundColor: isEven ? colors.background.paper : colors.grey[50],
        borderBottom: `1px solid ${colors.border.light}`,
        transition: transitions.fast,
        '&:hover': {
          backgroundColor: alpha(colors.primary.main, 0.04),
        },
      }}
    >
      {columns.map((column) => (
        <Box
          key={column.key}
          sx={{
            width: column.width,
            flex: column.flex || 'none',
            px: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: column.align || 'flex-start',
          }}
        >
          <GridCell
            value={instrument[column.key]}
            column={column}
            rowIndex={index}
          />
        </Box>
      ))}
    </Box>
  );
});

/**
 * ResultsGrid principal
 */
const ResultsGrid = memo(({
  results = [],
  loading = false,
  hasMore = false,
  onLoadMore,
  sortColumn,
  sortDirection,
  onSort,
  total = 0,
}) => {
  // Ref para el contenedor de scroll
  const parentRef = useRef(null);

  // Virtualizer
  const rowVirtualizer = useVirtualizer({
    count: results.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  // Manejar scroll para load more
  const handleScroll = useCallback(
    (e) => {
      const { scrollTop, scrollHeight, clientHeight } = e.target;
      const scrollBottom = scrollHeight - scrollTop - clientHeight;

      // Cargar más cuando faltan 200px para llegar al final
      if (scrollBottom < 200 && hasMore && !loading && onLoadMore) {
        onLoadMore();
      }
    },
    [hasMore, loading, onLoadMore]
  );

  // Renderizar header de columna
  const renderColumnHeader = (column) => {
    const isSorted = sortColumn === column.key;
    const canSort = column.key !== 'actions'; // Excluir columnas que no se ordenan

    return (
      <Box
        key={column.key}
        onClick={() => canSort && onSort?.(column.key)}
        sx={{
          width: column.width,
          flex: column.flex || 'none',
          px: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: column.align || 'flex-start',
          gap: 0.5,
          cursor: canSort ? 'pointer' : 'default',
          userSelect: 'none',
          transition: transitions.fast,
          '&:hover': canSort
            ? {
                color: colors.primary.main,
              }
            : {},
        }}
      >
        <Typography
          sx={{
            fontSize: '0.7rem',
            fontWeight: 600,
            color: isSorted ? colors.primary.main : colors.text.secondary,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          {column.label}
        </Typography>

        {/* Indicador de ordenamiento */}
        {isSorted &&
          (sortDirection === 'asc' ? (
            <ArrowUpwardIcon sx={{ fontSize: 12, color: colors.primary.main }} />
          ) : (
            <ArrowDownwardIcon sx={{ fontSize: 12, color: colors.primary.main }} />
          ))}
      </Box>
    );
  };

  // Estado vacío
  if (!loading && results.length === 0) {
    return (
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          py: 6,
          gap: 2,
        }}
      >
        <Box
          sx={{
            width: 64,
            height: 64,
            borderRadius: borderRadius.lg,
            backgroundColor: colors.grey[100],
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <InventoryIcon sx={{ fontSize: 32, color: colors.grey[400] }} />
        </Box>
        <Box sx={{ textAlign: 'center' }}>
          <Typography
            sx={{
              fontSize: '0.9rem',
              fontWeight: 500,
              color: colors.text.secondary,
              mb: 0.5,
            }}
          >
            No se encontraron instrumentos
          </Typography>
          <Typography
            sx={{
              fontSize: '0.8rem',
              color: colors.text.muted,
            }}
          >
            Ajusta los filtros para ver resultados
          </Typography>
        </Box>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        borderRadius: borderRadius.md,
        border: `1px solid ${colors.border.light}`,
        backgroundColor: colors.background.paper,
        overflow: 'hidden',
      }}
    >
      {/* Header de la grilla */}
      <Box
        sx={{
          height: HEADER_HEIGHT,
          display: 'flex',
          alignItems: 'center',
          px: 2,
          backgroundColor: colors.grey[50],
          borderBottom: `1px solid ${colors.border.default}`,
        }}
      >
        {RESULT_GRID_COLUMNS.map(renderColumnHeader)}
      </Box>

      {/* Contenido virtualizado */}
      <Box
        ref={parentRef}
        onScroll={handleScroll}
        sx={{
          flex: 1,
          overflow: 'auto',
          '&::-webkit-scrollbar': {
            width: 8,
            height: 8,
          },
          '&::-webkit-scrollbar-track': {
            backgroundColor: colors.grey[100],
          },
          '&::-webkit-scrollbar-thumb': {
            backgroundColor: colors.grey[300],
            borderRadius: 4,
            '&:hover': {
              backgroundColor: colors.grey[400],
            },
          },
        }}
      >
        <Box
          sx={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const instrument = results[virtualRow.index];

            return (
              <GridRow
                key={instrument?.idInstrumento || virtualRow.index}
                instrument={instrument}
                columns={RESULT_GRID_COLUMNS}
                index={virtualRow.index}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              />
            );
          })}
        </Box>

        {/* Loading indicator para más resultados */}
        {loading && (
          <Box sx={{ py: 2, display: 'flex', justifyContent: 'center' }}>
            <Typography sx={{ fontSize: '0.8rem', color: colors.text.muted }}>
              Cargando más...
            </Typography>
          </Box>
        )}
      </Box>

      {/* Footer con información y botón cargar más */}
      <Box
        sx={{
          py: 1.5,
          px: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderTop: `1px solid ${colors.border.light}`,
          backgroundColor: colors.grey[50],
        }}
      >
        <Typography sx={{ fontSize: '0.75rem', color: colors.text.tertiary }}>
          Mostrando {results.length} de {total} instrumentos
        </Typography>

        {hasMore && (
          <Button
            size="small"
            onClick={onLoadMore}
            disabled={loading}
            endIcon={<KeyboardArrowDownIcon sx={{ fontSize: 16 }} />}
            sx={{
              fontSize: '0.75rem',
              textTransform: 'none',
              color: colors.primary.main,
              '&:hover': {
                backgroundColor: alpha(colors.primary.main, 0.08),
              },
            }}
          >
            Cargar más
          </Button>
        )}
      </Box>
    </Box>
  );
});

ResultsGrid.displayName = 'ResultsGrid';

export default ResultsGrid;
