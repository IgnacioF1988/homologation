/**
 * CatalogAccordion - Acordeón individual para una dimensión/catálogo
 *
 * Muestra el nombre del catálogo y su cantidad de valores,
 * con un indicador si tiene filtros activos.
 * El contenido es un grid de DraggableChip.
 */

import React, { memo, useMemo, useState } from 'react';
import {
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Box,
  Typography,
  Badge,
  alpha,
  TextField,
  InputAdornment,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SearchIcon from '@mui/icons-material/Search';
import { colors, borderRadius, transitions } from '../../../styles/theme';
import DraggableChip from './DraggableChip';

const CatalogAccordion = memo(({
  dimension,
  items = [],
  activeFilters = [],
  onToggleFilter,
  isExpanded = false,
  onExpandChange,
}) => {
  const {
    key,
    label,
    icon: Icon,
    color = colors.primary.main,
    isLarge = false,
  } = dimension;

  // Estado local para búsqueda en catálogos grandes
  const [searchTerm, setSearchTerm] = useState('');

  // Contar filtros activos para esta dimensión
  const activeCount = useMemo(() => {
    return activeFilters.filter((f) => f.dimension === key).length;
  }, [activeFilters, key]);

  // Filtrar items si hay término de búsqueda
  const filteredItems = useMemo(() => {
    if (!searchTerm.trim()) return items;

    const term = searchTerm.toLowerCase();
    return items.filter(
      (item) =>
        item.value.toLowerCase().includes(term) ||
        (item.description && item.description.toLowerCase().includes(term))
    );
  }, [items, searchTerm]);

  // Verificar si un valor está activo
  const isValueActive = (value) => {
    return activeFilters.some(
      (f) => f.dimension === key && f.value === value
    );
  };

  return (
    <Accordion
      expanded={isExpanded}
      onChange={(_, expanded) => onExpandChange?.(key, expanded)}
      disableGutters
      elevation={0}
      sx={{
        backgroundColor: 'transparent',
        borderBottom: `1px solid ${colors.border.light}`,
        '&:before': { display: 'none' },
        '&.Mui-expanded': {
          margin: 0,
        },
      }}
    >
      <AccordionSummary
        expandIcon={
          <ExpandMoreIcon
            sx={{
              color: colors.text.tertiary,
              fontSize: 20,
              transition: transitions.fast,
            }}
          />
        }
        sx={{
          minHeight: 48,
          px: 2,
          py: 0,
          transition: transitions.fast,
          '&:hover': {
            backgroundColor: alpha(color, 0.04),
          },
          '&.Mui-expanded': {
            minHeight: 48,
            backgroundColor: alpha(color, 0.04),
          },
          '& .MuiAccordionSummary-content': {
            margin: '12px 0',
            alignItems: 'center',
            gap: 1.5,
          },
        }}
      >
        {/* Ícono de la dimensión */}
        <Box
          sx={{
            width: 28,
            height: 28,
            borderRadius: borderRadius.sm,
            backgroundColor: alpha(color, 0.1),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {Icon && (
            <Icon
              sx={{
                fontSize: 16,
                color: color,
              }}
            />
          )}
        </Box>

        {/* Nombre y contador */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            sx={{
              fontSize: '0.8rem',
              fontWeight: 500,
              color: colors.text.primary,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {label}
          </Typography>
        </Box>

        {/* Badge con contador */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {/* Indicador de filtros activos */}
          {activeCount > 0 && (
            <Badge
              badgeContent={activeCount}
              color="primary"
              sx={{
                '& .MuiBadge-badge': {
                  fontSize: '0.65rem',
                  height: 16,
                  minWidth: 16,
                  backgroundColor: color,
                },
              }}
            >
              <Box sx={{ width: 20 }} />
            </Badge>
          )}

          {/* Contador total */}
          <Typography
            sx={{
              fontSize: '0.7rem',
              color: colors.text.muted,
              fontWeight: 500,
            }}
          >
            ({items.length})
          </Typography>
        </Box>
      </AccordionSummary>

      <AccordionDetails
        sx={{
          px: 2,
          pb: 2,
          pt: 0.5,
        }}
      >
        {/* Campo de búsqueda para catálogos grandes */}
        {isLarge && (
          <TextField
            fullWidth
            size="small"
            placeholder="Buscar..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ fontSize: 16, color: colors.text.muted }} />
                </InputAdornment>
              ),
            }}
            sx={{
              mb: 1.5,
              '& .MuiOutlinedInput-root': {
                fontSize: '0.75rem',
                borderRadius: borderRadius.sm,
                backgroundColor: colors.grey[50],
                '& fieldset': { borderColor: 'transparent' },
                '&:hover fieldset': { borderColor: colors.border.default },
                '&.Mui-focused fieldset': {
                  borderColor: color,
                  borderWidth: 1,
                },
              },
            }}
          />
        )}

        {/* Grid de chips */}
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 0.75,
            maxHeight: isLarge ? 200 : 'none',
            overflowY: isLarge ? 'auto' : 'visible',
            '&::-webkit-scrollbar': {
              width: 4,
            },
            '&::-webkit-scrollbar-thumb': {
              backgroundColor: colors.grey[300],
              borderRadius: 2,
            },
          }}
        >
          {filteredItems.map((item) => (
            <DraggableChip
              key={`${key}-${item.value}`}
              id={`${key}-${item.value}`}
              dimension={key}
              value={item.value}
              label={item.label}
              description={item.description}
              color={color}
              isActive={isValueActive(item.value)}
              onClick={onToggleFilter}
            />
          ))}

          {/* Mensaje si no hay resultados */}
          {filteredItems.length === 0 && (
            <Typography
              sx={{
                fontSize: '0.75rem',
                color: colors.text.muted,
                fontStyle: 'italic',
                py: 1,
              }}
            >
              No se encontraron coincidencias
            </Typography>
          )}
        </Box>
      </AccordionDetails>
    </Accordion>
  );
});

CatalogAccordion.displayName = 'CatalogAccordion';

export default CatalogAccordion;
