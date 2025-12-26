/**
 * PipelineHeader - Header Principal del Pipeline
 * Muestra título e información de ejecución
 */

import React from 'react';
import { Box, Typography, Chip } from '@mui/material';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import { formatTimestamp, formatExecutionId } from '../../utils/formatters';
import { blink } from '../../utils/animationKeyframes';
import { colors } from '../../../../styles/theme';

/**
 * PipelineHeader Component
 *
 * @param {Object} props
 * @param {Object} props.ejecucion - Ejecución actual (opcional)
 * @param {boolean} props.isPolling - Si está haciendo polling
 * @param {Object} props.sx - Estilos adicionales
 */
export const PipelineHeader = ({
  ejecucion,
  isPolling = false,
  sx = {},
}) => {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 2,
        mb: 3,
        ...sx,
      }}
    >
      {/* Título e información de ejecución */}
      <Box sx={{ flex: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
          <Typography
            variant="h4"
            sx={{
              fontWeight: 700,
              color: colors.grey[900],
              fontSize: '1.75rem',
            }}
          >
            Pipeline ETL
          </Typography>

          {/* Indicador LIVE */}
          {isPolling && (
            <Chip
              icon={
                <FiberManualRecordIcon
                  sx={{
                    fontSize: 12,
                    animation: `${blink} 1.5s ease-in-out infinite`,
                  }}
                />
              }
              label="LIVE"
              size="small"
              sx={{
                backgroundColor: colors.error.main,
                color: '#fff',
                fontWeight: 700,
                fontSize: '0.75rem',
                height: 24,
                '& .MuiChip-icon': {
                  color: '#fff',
                  marginLeft: '8px',
                },
              }}
            />
          )}
        </Box>

        {/* Información de ejecución actual */}
        {ejecucion && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
            <Chip
              label={formatExecutionId(ejecucion.ID_Ejecucion)}
              size="small"
              sx={{
                backgroundColor: colors.primary.light,
                color: colors.primary.dark,
                fontWeight: 600,
                fontSize: '0.75rem',
              }}
            />

            <Typography
              variant="body2"
              sx={{
                fontSize: '0.875rem',
                color: colors.grey[600],
              }}
            >
              Fecha: <strong>{ejecucion.FechaReporte}</strong>
            </Typography>

            <Typography
              variant="body2"
              sx={{
                fontSize: '0.875rem',
                color: colors.grey[600],
              }}
            >
              Iniciado: <strong>{formatTimestamp(ejecucion.IniciadoEn)}</strong>
            </Typography>

            {ejecucion.FinalizadoEn && (
              <Typography
                variant="body2"
                sx={{
                  fontSize: '0.875rem',
                  color: colors.grey[600],
                }}
              >
                Finalizado: <strong>{formatTimestamp(ejecucion.FinalizadoEn)}</strong>
              </Typography>
            )}
          </Box>
        )}

        {/* Mensaje cuando no hay ejecución */}
        {!ejecucion && (
          <Typography
            variant="body2"
            sx={{
              fontSize: '0.875rem',
              color: colors.grey[500],
            }}
          >
            No hay ejecución activa. Inicia un nuevo proceso para comenzar.
          </Typography>
        )}
      </Box>
    </Box>
  );
};

export default PipelineHeader;
