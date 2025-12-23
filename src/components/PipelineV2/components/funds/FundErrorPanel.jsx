/**
 * FundErrorPanel - Panel de Error de Fondo
 * Muestra información detallada de error cuando un fondo falla
 */

import React from 'react';
import { Box, Typography, Alert, Chip } from '@mui/material';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { colors } from '../../../../styles/theme';

/**
 * FundErrorPanel Component
 *
 * @param {Object} props
 * @param {ParsedFondo} props.fondo - Fondo parseado
 * @param {boolean} props.variant - Variante ('error', 'warning')
 * @param {Object} props.sx - Estilos adicionales
 */
export const FundErrorPanel = ({
  fondo,
  variant = 'error',
  sx = {},
}) => {
  if (!fondo) return null;

  // No mostrar si no hay error ni warning
  if (!fondo.hasError && !fondo.hasWarning) {
    return null;
  }

  const isError = fondo.hasError;
  const errorInfo = fondo.errorInfo;

  return (
    <Box
      sx={{
        px: 3,
        pb: 2,
        ...sx,
      }}
    >
      <Alert
        severity={isError ? 'error' : 'warning'}
        icon={isError ? <ErrorOutlineIcon /> : <WarningAmberIcon />}
        sx={{
          borderRadius: '12px',
          border: `1px solid ${isError ? colors.error.main : colors.warning.main}`,
          '& .MuiAlert-icon': {
            fontSize: 24,
          },
        }}
      >
        {/* Título */}
        <Typography
          variant="subtitle2"
          sx={{
            fontWeight: 700,
            mb: 1,
            color: isError ? colors.error.dark : colors.warning.dark,
          }}
        >
          {isError ? 'Error en Procesamiento' : 'Advertencia en Procesamiento'}
        </Typography>

        {/* Información de error */}
        {errorInfo && (
          <Box sx={{ mb: 1 }}>
            {/* Paso donde ocurrió el error */}
            {errorInfo.step && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                <Typography
                  variant="caption"
                  sx={{
                    fontWeight: 600,
                    color: colors.grey[700],
                  }}
                >
                  Paso:
                </Typography>
                <Chip
                  label={errorInfo.step}
                  size="small"
                  sx={{
                    height: 20,
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    backgroundColor: isError ? colors.error.light : colors.warning.light,
                    color: isError ? colors.error.dark : colors.warning.dark,
                  }}
                />
              </Box>
            )}

            {/* Mensaje de error */}
            {errorInfo.message && (
              <Typography
                variant="body2"
                sx={{
                  fontSize: '0.875rem',
                  color: colors.grey[800],
                  mt: 1,
                  p: 1.5,
                  backgroundColor: colors.grey[50],
                  borderRadius: '8px',
                  border: `1px solid ${colors.grey[200]}`,
                  fontFamily: 'monospace',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {errorInfo.message}
              </Typography>
            )}
          </Box>
        )}

        {/* Mensaje genérico si no hay errorInfo */}
        {!errorInfo && (
          <Typography
            variant="body2"
            sx={{
              fontSize: '0.875rem',
              color: colors.grey[700],
            }}
          >
            {isError
              ? 'Ocurrió un error durante el procesamiento de este fondo. Por favor, revisa los logs para más detalles.'
              : 'Se detectaron advertencias durante el procesamiento. El fondo se procesó parcialmente.'}
          </Typography>
        )}

        {/* Recomendaciones */}
        <Box
          sx={{
            mt: 1.5,
            pt: 1.5,
            borderTop: `1px solid ${isError ? colors.error.light : colors.warning.light}`,
          }}
        >
          <Typography
            variant="caption"
            sx={{
              fontSize: '0.75rem',
              color: colors.grey[600],
              fontWeight: 600,
              display: 'block',
              mb: 0.5,
            }}
          >
            Recomendaciones:
          </Typography>
          <Typography
            variant="caption"
            sx={{
              fontSize: '0.75rem',
              color: colors.grey[600],
              display: 'block',
            }}
          >
            • Verifica los datos de entrada del fondo
            {isError && ' • Intenta reprocesar el fondo después de corregir el problema'}
            {isError && ' • Contacta al equipo de soporte si el problema persiste'}
          </Typography>
        </Box>
      </Alert>
    </Box>
  );
};

export default FundErrorPanel;
