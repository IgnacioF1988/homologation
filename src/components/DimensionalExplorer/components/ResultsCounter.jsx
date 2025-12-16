/**
 * ResultsCounter - Contador animado de resultados
 *
 * Muestra el número total de instrumentos con animación
 * de pulso cuando cambia el valor
 */

import React, { memo, useEffect, useState, useRef } from 'react';
import { Box, Typography, alpha, LinearProgress } from '@mui/material';
import AnalyticsIcon from '@mui/icons-material/Analytics';
import { colors, borderRadius, shadows } from '../../../styles/theme';

const ResultsCounter = memo(({
  total = 0,
  loading = false,
  loadProgress = { loaded: 0, total: 0 },
}) => {
  // Estado para animación de cambio
  const [isAnimating, setIsAnimating] = useState(false);
  const [displayValue, setDisplayValue] = useState(total);
  const prevTotalRef = useRef(total);

  // Animar cuando cambia el total
  useEffect(() => {
    if (total !== prevTotalRef.current) {
      setIsAnimating(true);

      // Animación de incremento/decremento gradual
      const startValue = displayValue;
      const endValue = total;
      const duration = 300;
      const steps = 15;
      const increment = (endValue - startValue) / steps;
      let currentStep = 0;

      const timer = setInterval(() => {
        currentStep++;
        if (currentStep >= steps) {
          setDisplayValue(endValue);
          clearInterval(timer);
        } else {
          setDisplayValue(Math.round(startValue + increment * currentStep));
        }
      }, duration / steps);

      // Quitar animación después de completar
      setTimeout(() => {
        setIsAnimating(false);
      }, 400);

      prevTotalRef.current = total;

      return () => clearInterval(timer);
    }
  }, [total, displayValue]);

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        px: 2.5,
        py: 1.5,
        borderRadius: borderRadius.md,
        backgroundColor: colors.background.paper,
        border: `1px solid ${colors.border.light}`,
        boxShadow: shadows.sm,
      }}
    >
      <Box
        sx={{
          width: 36,
          height: 36,
          borderRadius: borderRadius.sm,
          background: colors.primary.gradient,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: `0 4px 12px ${alpha(colors.primary.main, 0.25)}`,
        }}
      >
        <AnalyticsIcon sx={{ fontSize: 20, color: '#fff' }} />
      </Box>
      <Box sx={{ flex: 1 }}>
        <Typography
          sx={{
            fontSize: '1.5rem',
            fontWeight: 700,
            color: colors.text.primary,
            lineHeight: 1,
            transition: 'transform 200ms ease',
            transform: isAnimating ? 'scale(1.1)' : 'scale(1)',
            // Efecto de pulso
            animation: isAnimating ? 'pulse 300ms ease' : 'none',
            '@keyframes pulse': {
              '0%': { transform: 'scale(1)' },
              '50%': { transform: 'scale(1.15)' },
              '100%': { transform: 'scale(1)' },
            },
          }}
        >
          {loading && loadProgress.total > 0
            ? `${loadProgress.loaded.toLocaleString()} / ${loadProgress.total.toLocaleString()}`
            : loading
              ? '...'
              : displayValue.toLocaleString()}
        </Typography>
        <Typography
          sx={{
            fontSize: '0.7rem',
            color: colors.text.muted,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            fontWeight: 500,
          }}
        >
          {loading && loadProgress.total > 0
            ? 'Cargando instrumentos...'
            : 'Instrumentos'}
        </Typography>
        {/* Barra de progreso durante la carga */}
        {loading && loadProgress.total > 0 && (
          <LinearProgress
            variant="determinate"
            value={(loadProgress.loaded / loadProgress.total) * 100}
            sx={{
              mt: 1,
              height: 4,
              borderRadius: 2,
              backgroundColor: alpha(colors.primary.main, 0.1),
              '& .MuiLinearProgress-bar': {
                borderRadius: 2,
                background: colors.primary.gradient,
              },
            }}
          />
        )}
      </Box>
    </Box>
  );
});

ResultsCounter.displayName = 'ResultsCounter';

export default ResultsCounter;
