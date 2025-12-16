/**
 * CatalogPanel - Panel izquierdo con todos los catálogos
 *
 * Contiene un campo de búsqueda global y la lista de
 * CatalogAccordion para cada dimensión.
 */

import React, { memo, useState, useMemo, useCallback } from 'react';
import {
  Box,
  TextField,
  Typography,
  InputAdornment,
  Divider,
  CircularProgress,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import FilterAltIcon from '@mui/icons-material/FilterAlt';
import { colors, borderRadius, transitions } from '../../../styles/theme';
import CatalogAccordion from './CatalogAccordion';
import BooleanDimension from './BooleanDimension';

const CatalogPanel = memo(({
  activeFilters = [],
  onToggleFilter,
  filterCount = 0,
  dimensions = [],
  booleanDimensions = [],
  loading = false,
}) => {
  // Estado de búsqueda global
  const [globalSearch, setGlobalSearch] = useState('');

  // Estado de acordeones expandidos
  const [expandedAccordions, setExpandedAccordions] = useState({});

  // Manejar expansión de acordeón
  const handleAccordionChange = useCallback((key, expanded) => {
    setExpandedAccordions((prev) => ({
      ...prev,
      [key]: expanded,
    }));
  }, []);

  // Filtrar dimensiones por búsqueda global
  const filteredDimensions = useMemo(() => {
    if (!globalSearch.trim()) return dimensions;

    const term = globalSearch.toLowerCase();
    return dimensions.filter((dim) => {
      // Buscar en nombre de dimensión
      if (dim.label && dim.label.toLowerCase().includes(term)) return true;

      // Buscar en valores de la dimensión (ya vienen procesados en items)
      const items = dim.items || [];
      return items.some(
        (item) =>
          (item.value && String(item.value).toLowerCase().includes(term)) ||
          (item.label && String(item.label).toLowerCase().includes(term)) ||
          (item.description && String(item.description).toLowerCase().includes(term))
      );
    });
  }, [globalSearch, dimensions]);

  // Verificar si algún booleano está en la búsqueda
  const showBooleans = useMemo(() => {
    if (!globalSearch.trim()) return true;
    const term = globalSearch.toLowerCase();
    return booleanDimensions.some((dim) =>
      dim.label.toLowerCase().includes(term)
    );
  }, [globalSearch, booleanDimensions]);

  return (
    <Box
      sx={{
        width: 320,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: colors.grey[50],
        borderRight: `1px solid ${colors.border.light}`,
      }}
    >
      {/* Header del panel */}
      <Box
        sx={{
          px: 2,
          py: 2,
          borderBottom: `1px solid ${colors.border.light}`,
          backgroundColor: colors.background.paper,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
          <Box
            sx={{
              width: 32,
              height: 32,
              borderRadius: borderRadius.sm,
              background: colors.primary.gradient,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <FilterAltIcon sx={{ fontSize: 18, color: '#fff' }} />
          </Box>
          <Box>
            <Typography
              sx={{
                fontSize: '0.9rem',
                fontWeight: 600,
                color: colors.text.primary,
              }}
            >
              Catálogos
            </Typography>
            <Typography
              sx={{
                fontSize: '0.7rem',
                color: colors.text.tertiary,
              }}
            >
              {filterCount > 0
                ? `${filterCount} filtro${filterCount > 1 ? 's' : ''} activo${filterCount > 1 ? 's' : ''}`
                : 'Arrastra o haz clic para filtrar'}
            </Typography>
          </Box>
        </Box>

        {/* Campo de búsqueda global */}
        <TextField
          fullWidth
          size="small"
          placeholder="Buscar en catálogos..."
          value={globalSearch}
          onChange={(e) => setGlobalSearch(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ fontSize: 18, color: colors.text.muted }} />
              </InputAdornment>
            ),
          }}
          sx={{
            '& .MuiOutlinedInput-root': {
              fontSize: '0.8rem',
              borderRadius: borderRadius.md,
              backgroundColor: colors.grey[50],
              transition: transitions.fast,
              '& fieldset': { borderColor: 'transparent' },
              '&:hover fieldset': { borderColor: colors.border.default },
              '&.Mui-focused': {
                backgroundColor: '#fff',
                '& fieldset': {
                  borderColor: colors.primary.main,
                  borderWidth: 1.5,
                },
              },
            },
          }}
        />
      </Box>

      {/* Lista de acordeones */}
      <Box
        sx={{
          flex: 1,
          overflowY: 'auto',
          '&::-webkit-scrollbar': {
            width: 6,
          },
          '&::-webkit-scrollbar-track': {
            backgroundColor: 'transparent',
          },
          '&::-webkit-scrollbar-thumb': {
            backgroundColor: colors.grey[300],
            borderRadius: 3,
            '&:hover': {
              backgroundColor: colors.grey[400],
            },
          },
        }}
      >
        {/* Loading state */}
        {loading && (
          <Box sx={{ p: 3, textAlign: 'center' }}>
            <CircularProgress size={24} sx={{ color: colors.primary.main }} />
            <Typography sx={{ color: colors.text.muted, fontSize: '0.8rem', mt: 1 }}>
              Cargando catálogos...
            </Typography>
          </Box>
        )}

        {/* Dimensiones principales */}
        {!loading && filteredDimensions.map((dimension) => (
          <CatalogAccordion
            key={dimension.key}
            dimension={dimension}
            items={dimension.items || []}
            activeFilters={activeFilters}
            onToggleFilter={onToggleFilter}
            isExpanded={expandedAccordions[dimension.key] || false}
            onExpandChange={handleAccordionChange}
          />
        ))}

        {/* Mensaje si no hay resultados */}
        {!loading && filteredDimensions.length === 0 && !showBooleans && (
          <Box sx={{ p: 3, textAlign: 'center' }}>
            <Typography sx={{ color: colors.text.muted, fontSize: '0.8rem' }}>
              No se encontraron catálogos
            </Typography>
          </Box>
        )}

        {/* Separador antes de booleanos */}
        {!loading && showBooleans && booleanDimensions.length > 0 && (
          <>
            <Divider sx={{ my: 1 }}>
              <Typography
                sx={{
                  fontSize: '0.65rem',
                  color: colors.text.muted,
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  px: 1,
                }}
              >
                Booleanos
              </Typography>
            </Divider>

            {/* Dimensiones booleanas */}
            <Box sx={{ px: 2, pb: 2 }}>
              {booleanDimensions.map((dim) => (
                <BooleanDimension
                  key={dim.key}
                  dimension={dim}
                  activeFilters={activeFilters}
                  onToggleFilter={onToggleFilter}
                />
              ))}
            </Box>
          </>
        )}
      </Box>
    </Box>
  );
});

CatalogPanel.displayName = 'CatalogPanel';

export default CatalogPanel;
