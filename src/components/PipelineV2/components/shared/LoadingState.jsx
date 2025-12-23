/**
 * LoadingState - Componente de Estado de Carga
 * Muestra skeleton loaders con animación shimmer
 */

import React from 'react';
import { Box, CircularProgress, Typography, Skeleton } from '@mui/material';
import { shimmer } from '../../utils/animationKeyframes';
import { colors } from '../../../../styles/theme';

/**
 * LoadingState Component
 *
 * @param {Object} props
 * @param {string} props.variant - Variante ('circular', 'skeleton', 'cards', 'fullpage')
 * @param {string} props.message - Mensaje de carga (opcional)
 * @param {number} props.count - Número de skeletons a mostrar (default: 3)
 * @param {number} props.height - Altura de skeletons (default: 120)
 * @param {Object} props.sx - Estilos adicionales
 */
export const LoadingState = ({
  variant = 'circular',
  message,
  count = 3,
  height = 120,
  sx = {},
}) => {
  // Variant: Circular (spinner simple)
  if (variant === 'circular') {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
          py: 6,
          ...sx,
        }}
      >
        <CircularProgress
          size={48}
          sx={{
            color: colors.primary.main,
          }}
        />
        {message && (
          <Typography
            variant="body2"
            sx={{
              color: colors.grey[600],
              fontWeight: 500,
            }}
          >
            {message}
          </Typography>
        )}
      </Box>
    );
  }

  // Variant: Skeleton (skeleton loader simple)
  if (variant === 'skeleton') {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          py: 2,
          ...sx,
        }}
      >
        {message && (
          <Typography
            variant="body2"
            sx={{
              color: colors.grey[600],
              fontWeight: 500,
              mb: 1,
            }}
          >
            {message}
          </Typography>
        )}
        {Array.from({ length: count }).map((_, index) => (
          <Skeleton
            key={index}
            variant="rectangular"
            height={height}
            sx={{
              borderRadius: '12px',
              background: `linear-gradient(90deg, ${colors.grey[100]} 0%, ${colors.grey[200]} 50%, ${colors.grey[100]} 100%)`,
              backgroundSize: '200% 100%',
              animation: `${shimmer} 2s infinite`,
            }}
          />
        ))}
      </Box>
    );
  }

  // Variant: Cards (skeleton de cards completos con detalles)
  if (variant === 'cards') {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          py: 2,
          ...sx,
        }}
      >
        {message && (
          <Typography
            variant="body2"
            sx={{
              color: colors.grey[600],
              fontWeight: 500,
              mb: 1,
            }}
          >
            {message}
          </Typography>
        )}
        {Array.from({ length: count }).map((_, index) => (
          <Box
            key={index}
            sx={{
              p: 3,
              borderRadius: '16px',
              border: `1px solid ${colors.grey[200]}`,
              backgroundColor: colors.grey[50],
            }}
          >
            {/* Header skeleton */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
              <Skeleton
                variant="circular"
                width={40}
                height={40}
                sx={{
                  background: `linear-gradient(90deg, ${colors.grey[200]} 0%, ${colors.grey[300]} 50%, ${colors.grey[200]} 100%)`,
                  backgroundSize: '200% 100%',
                  animation: `${shimmer} 2s infinite`,
                }}
              />
              <Box sx={{ flex: 1 }}>
                <Skeleton
                  variant="text"
                  width="60%"
                  height={24}
                  sx={{
                    background: `linear-gradient(90deg, ${colors.grey[200]} 0%, ${colors.grey[300]} 50%, ${colors.grey[200]} 100%)`,
                    backgroundSize: '200% 100%',
                    animation: `${shimmer} 2s infinite`,
                  }}
                />
                <Skeleton
                  variant="text"
                  width="40%"
                  height={18}
                  sx={{
                    background: `linear-gradient(90deg, ${colors.grey[200]} 0%, ${colors.grey[300]} 50%, ${colors.grey[200]} 100%)`,
                    backgroundSize: '200% 100%',
                    animation: `${shimmer} 2s infinite`,
                  }}
                />
              </Box>
            </Box>

            {/* Content skeleton */}
            <Skeleton
              variant="rectangular"
              height={80}
              sx={{
                borderRadius: '8px',
                background: `linear-gradient(90deg, ${colors.grey[100]} 0%, ${colors.grey[200]} 50%, ${colors.grey[100]} 100%)`,
                backgroundSize: '200% 100%',
                animation: `${shimmer} 2s infinite`,
              }}
            />
          </Box>
        ))}
      </Box>
    );
  }

  // Variant: Fullpage (pantalla completa con spinner y mensaje)
  if (variant === 'fullpage') {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '60vh',
          gap: 3,
          ...sx,
        }}
      >
        <CircularProgress
          size={64}
          thickness={4}
          sx={{
            color: colors.primary.main,
          }}
        />
        {message && (
          <Typography
            variant="h6"
            sx={{
              color: colors.grey[700],
              fontWeight: 500,
              textAlign: 'center',
            }}
          >
            {message}
          </Typography>
        )}
        <Typography
          variant="body2"
          sx={{
            color: colors.grey[500],
            textAlign: 'center',
          }}
        >
          Por favor espera...
        </Typography>
      </Box>
    );
  }

  // Default: circular
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        py: 6,
        ...sx,
      }}
    >
      <CircularProgress
        size={48}
        sx={{
          color: colors.primary.main,
        }}
      />
      {message && (
        <Typography
          variant="body2"
          sx={{
            color: colors.grey[600],
            fontWeight: 500,
          }}
        >
          {message}
        </Typography>
      )}
    </Box>
  );
};

export default LoadingState;
