/**
 * FundsList - Lista Virtualizada de Fondos
 * Lista de fondos con virtual scrolling para manejar 50-100+ fondos eficientemente
 */

import React, { useMemo, useRef } from 'react';
import { Box, Typography } from '@mui/material';
import { useVirtualizer } from '@tanstack/react-virtual';
import FundCard from '../funds/FundCard';
import EmptyState from '../shared/EmptyState';
import { colors } from '../../../../styles/theme';

/**
 * FundsList Component
 *
 * @param {Object} props
 * @param {Array<string>} props.fondoIds - Array de IDs de fondos a mostrar (filtrados)
 * @param {Map<string, ParsedFondo>} props.fondosMap - Map de fondos parseados
 * @param {Map<string, Object>} props.fondosBackendMap - Map de fondos raw del backend (para sub-etapas)
 * @param {Map<string, Object>} props.changeFlags - Map de flags de cambios
 * @param {Function} props.onReprocess - Callback para reprocesar fondo
 * @param {Function} props.onShowDetails - Callback para mostrar detalles
 * @param {boolean} props.canReprocess - Si puede reprocesarse (default: false)
 * @param {number} props.estimatedItemHeight - Altura estimada de cada item (default: 120)
 * @param {number} props.maxHeight - Altura máxima de la lista (default: 600)
 * @param {Object} props.sx - Estilos adicionales
 */
export const FundsList = ({
  fondoIds = [],
  fondosMap,
  fondosBackendMap,
  changeFlags = new Map(),
  onReprocess,
  onShowDetails,
  canReprocess = false,
  estimatedItemHeight = 120,
  maxHeight = 600,
  sx = {},
}) => {
  const parentRef = useRef(null);

  // Si no hay fondos, mostrar estado vacío
  if (!fondosMap || fondosMap.size === 0) {
    return (
      <EmptyState
        variant="no-execution"
        sx={sx}
      />
    );
  }

  // Si hay fondos pero ninguno coincide con los filtros
  if (fondoIds.length === 0) {
    return (
      <EmptyState
        variant="no-results"
        sx={sx}
      />
    );
  }

  // Configurar virtualizador
  const virtualizer = useVirtualizer({
    count: fondoIds.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimatedItemHeight,
    overscan: 5, // Pre-render 5 items arriba/abajo
  });

  return (
    <Box
      sx={{
        ...sx,
      }}
    >
      {/* Header de resultados */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          mb: 2,
          px: 1,
        }}
      >
        <Typography
          variant="body2"
          sx={{
            fontSize: '0.875rem',
            color: colors.grey[600],
            fontWeight: 600,
          }}
        >
          Mostrando {fondoIds.length} {fondoIds.length === 1 ? 'fondo' : 'fondos'}
        </Typography>

        <Typography
          variant="caption"
          sx={{
            fontSize: '0.75rem',
            color: colors.grey[500],
          }}
        >
          Total: {fondosMap.size}
        </Typography>
      </Box>

      {/* Lista virtualizada */}
      <Box
        ref={parentRef}
        sx={{
          maxHeight: maxHeight,
          overflowY: 'auto',
          overflowX: 'hidden',
          '&::-webkit-scrollbar': {
            width: 8,
          },
          '&::-webkit-scrollbar-track': {
            backgroundColor: colors.grey[100],
            borderRadius: '4px',
          },
          '&::-webkit-scrollbar-thumb': {
            backgroundColor: colors.grey[400],
            borderRadius: '4px',
            '&:hover': {
              backgroundColor: colors.grey[500],
            },
          },
        }}
      >
        <Box
          sx={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const fondoId = fondoIds[virtualItem.index];
            const fondo = fondosMap.get(fondoId);
            const fondoBackend = fondosBackendMap?.get(fondoId);
            const hasChanges = changeFlags.has(fondoId);

            if (!fondo) return null;

            return (
              <Box
                key={fondoId}
                data-index={virtualItem.index}
                ref={virtualizer.measureElement}
                sx={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualItem.start}px)`,
                  mb: 2,
                }}
              >
                <FundCard
                  fondo={fondo}
                  fondoBackend={fondoBackend}
                  onReprocess={onReprocess}
                  onShowDetails={onShowDetails}
                  canReprocess={canReprocess}
                  hasChanges={hasChanges}
                />
              </Box>
            );
          })}
        </Box>
      </Box>

      {/* Indicador de scroll */}
      {fondoIds.length > 5 && (
        <Box
          sx={{
            mt: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 1,
          }}
        >
          <Typography
            variant="caption"
            sx={{
              fontSize: '0.7rem',
              color: colors.grey[500],
              textAlign: 'center',
            }}
          >
            Desplázate para ver más fondos
          </Typography>
        </Box>
      )}
    </Box>
  );
};

export default FundsList;
