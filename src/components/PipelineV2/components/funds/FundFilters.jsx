/**
 * FundFilters - Filtros de Fondos
 * Chips de filtrado por estado con contadores
 */

import React from 'react';
import { Box, Chip, Typography, TextField, InputAdornment } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import { FILTER_OPTIONS } from '../../utils/constants';
import { usePipelineUI } from '../../contexts/PipelineUIContext';
import { colors } from '../../../../styles/theme';

/**
 * FundFilters Component
 *
 * @param {Object} props
 * @param {Object} props.counts - Contadores por filtro { all, ok, error, warning, enProgreso }
 * @param {boolean} props.showSearch - Mostrar barra de búsqueda (default: true)
 * @param {Object} props.sx - Estilos adicionales
 */
export const FundFilters = ({
  counts = { all: 0, ok: 0, error: 0, warning: 0, enProgreso: 0 },
  showSearch = true,
  sx = {},
}) => {
  const {
    filterStatus,
    setFilterStatus,
    searchQuery,
    setSearchQuery,
  } = usePipelineUI();

  // Configuración de filtros
  const filters = [
    {
      value: FILTER_OPTIONS.ALL,
      label: 'Todos',
      count: counts.all,
      color: colors.grey[700],
      bgColor: colors.grey[100],
    },
    {
      value: FILTER_OPTIONS.ERROR,
      label: 'Errores',
      count: counts.error,
      color: colors.error.main,
      bgColor: colors.error.light,
    },
    {
      value: FILTER_OPTIONS.WARNING,
      label: 'Advertencias',
      count: counts.warning,
      color: colors.warning.main,
      bgColor: colors.warning.light,
    },
    {
      value: FILTER_OPTIONS.OK,
      label: 'Exitosos',
      count: counts.ok,
      color: colors.success.main,
      bgColor: colors.success.light,
    },
    {
      value: FILTER_OPTIONS.EN_PROGRESO,
      label: 'En Progreso',
      count: counts.enProgreso,
      color: colors.primary.main,
      bgColor: colors.primary.light,
    },
  ];

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        ...sx,
      }}
    >
      {/* Barra de búsqueda */}
      {showSearch && (
        <TextField
          size="small"
          placeholder="Buscar por nombre o código de fondo..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ color: colors.grey[400] }} />
              </InputAdornment>
            ),
          }}
          sx={{
            '& .MuiOutlinedInput-root': {
              borderRadius: '12px',
              backgroundColor: '#fff',
              '&:hover': {
                '& .MuiOutlinedInput-notchedOutline': {
                  borderColor: colors.primary.main,
                },
              },
            },
          }}
        />
      )}

      {/* Filtros por estado */}
      <Box>
        <Typography
          variant="caption"
          sx={{
            display: 'block',
            mb: 1,
            color: colors.grey[600],
            fontWeight: 600,
            fontSize: '0.75rem',
          }}
        >
          Filtrar por estado:
        </Typography>

        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 1,
          }}
        >
          {filters.map((filter) => {
            const isSelected = filterStatus === filter.value;

            return (
              <Chip
                key={filter.value}
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Typography
                      variant="body2"
                      sx={{
                        fontSize: '0.875rem',
                        fontWeight: 600,
                      }}
                    >
                      {filter.label}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        px: 0.75,
                        py: 0.25,
                        borderRadius: '8px',
                        backgroundColor: isSelected ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.1)',
                      }}
                    >
                      {filter.count}
                    </Typography>
                  </Box>
                }
                onClick={() => setFilterStatus(filter.value)}
                sx={{
                  borderRadius: '12px',
                  px: 1,
                  py: 2.5,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  backgroundColor: isSelected ? filter.color : filter.bgColor,
                  color: isSelected ? '#fff' : filter.color,
                  border: `2px solid ${isSelected ? filter.color : 'transparent'}`,
                  fontWeight: 600,
                  '&:hover': {
                    backgroundColor: isSelected ? filter.color : `${filter.color}30`,
                    transform: 'translateY(-2px)',
                    boxShadow: `0 4px 12px ${filter.color}40`,
                  },
                }}
              />
            );
          })}
        </Box>
      </Box>

      {/* Indicador de resultados */}
      {(searchQuery || filterStatus !== FILTER_OPTIONS.ALL) && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            py: 1,
            px: 2,
            borderRadius: '8px',
            backgroundColor: colors.grey[50],
            border: `1px solid ${colors.grey[200]}`,
          }}
        >
          <Typography
            variant="body2"
            sx={{
              fontSize: '0.875rem',
              color: colors.grey[700],
            }}
          >
            Filtros activos
          </Typography>

          <Chip
            label="Limpiar filtros"
            size="small"
            onClick={() => {
              setFilterStatus(FILTER_OPTIONS.ALL);
              setSearchQuery('');
            }}
            sx={{
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer',
              backgroundColor: colors.grey[200],
              '&:hover': {
                backgroundColor: colors.grey[300],
              },
            }}
          />
        </Box>
      )}
    </Box>
  );
};

export default FundFilters;
