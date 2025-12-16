/**
 * LoadingOverlay - Componente para mostrar estado de carga
 * Puede ser overlay completo o inline
 */

import React from 'react';
import { Box, CircularProgress, Typography, Backdrop } from '@mui/material';
import { loadingStyles } from '../../styles/formStyles';

const LoadingOverlay = ({
  loading = false,
  message = 'Cargando...',
  variant = 'overlay', // 'overlay' | 'inline' | 'backdrop'
  size = 40,
  children = null,
}) => {
  // Variante inline - solo spinner con mensaje
  if (variant === 'inline') {
    if (!loading) return null;
    return (
      <Box sx={loadingStyles.inline}>
        <CircularProgress size={20} />
        {message && <Typography variant="body2">{message}</Typography>}
      </Box>
    );
  }

  // Variante backdrop - overlay de pantalla completa
  if (variant === 'backdrop') {
    return (
      <Backdrop open={loading} sx={{ zIndex: (theme) => theme.zIndex.modal + 1 }}>
        <Box sx={{ textAlign: 'center', color: 'white' }}>
          <CircularProgress size={size} color="inherit" />
          {message && (
            <Typography variant="body1" sx={{ mt: 2 }}>
              {message}
            </Typography>
          )}
        </Box>
      </Backdrop>
    );
  }

  // Variante overlay - sobre contenedor padre (necesita position: relative)
  return (
    <Box sx={{ position: 'relative' }}>
      {children}
      {loading && (
        <Box sx={loadingStyles.overlay}>
          <Box sx={{ textAlign: 'center' }}>
            <CircularProgress size={size} />
            {message && (
              <Typography variant="body2" sx={{ mt: 1 }}>
                {message}
              </Typography>
            )}
          </Box>
        </Box>
      )}
    </Box>
  );
};

// Variante especifica para carga inline
export const InlineLoader = ({ loading, message }) => (
  <LoadingOverlay loading={loading} message={message} variant="inline" />
);

export default LoadingOverlay;
