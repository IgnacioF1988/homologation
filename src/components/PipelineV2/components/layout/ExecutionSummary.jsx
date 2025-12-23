/**
 * ExecutionSummary - Resumen de Ejecución
 * Muestra métricas agregadas de la ejecución actual
 */

import React from 'react';
import { Box, Paper, Typography, LinearProgress, Grid } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import WarningIcon from '@mui/icons-material/Warning';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import { formatPercentage, formatDuration } from '../../utils/formatters';
import { colors } from '../../../../styles/theme';

/**
 * ExecutionSummary Component
 *
 * @param {Object} props
 * @param {Object} props.generalStats - Estadísticas generales { total, ok, error, warning, enProgreso, completados, porcentajeExito }
 * @param {number} props.overallProgress - Progreso general (0-100)
 * @param {number} props.elapsedTime - Tiempo transcurrido en ms
 * @param {Object} props.sx - Estilos adicionales
 */
export const ExecutionSummary = ({
  generalStats = {
    total: 0,
    ok: 0,
    error: 0,
    warning: 0,
    enProgreso: 0,
    completados: 0,
    porcentajeExito: 0,
  },
  overallProgress = 0,
  elapsedTime = 0,
  sx = {},
}) => {
  return (
    <Paper
      elevation={1}
      sx={{
        p: 3,
        borderRadius: '16px',
        backgroundColor: '#fff',
        border: `1px solid ${colors.grey[200]}`,
        ...sx,
      }}
    >
      {/* Título */}
      <Typography
        variant="h6"
        sx={{
          mb: 2,
          fontWeight: 600,
          color: colors.grey[800],
        }}
      >
        Resumen de Ejecución
      </Typography>

      {/* Barra de progreso general */}
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: colors.grey[700] }}>
            Progreso General
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 700, color: colors.primary.main }}>
            {formatPercentage(overallProgress)}
          </Typography>
        </Box>
        <LinearProgress
          variant="determinate"
          value={overallProgress}
          sx={{
            height: 10,
            borderRadius: '5px',
            backgroundColor: colors.grey[200],
            '& .MuiLinearProgress-bar': {
              backgroundColor: overallProgress === 100 ? colors.success.main : colors.primary.main,
              borderRadius: '5px',
            },
          }}
        />
      </Box>

      {/* Métricas en grid */}
      <Grid container spacing={2}>
        {/* Total Fondos */}
        <Grid item xs={6} md={3}>
          <MetricCard
            icon={HourglassEmptyIcon}
            label="Total Fondos"
            value={generalStats.total}
            color={colors.grey[700]}
            bgColor={colors.grey[100]}
          />
        </Grid>

        {/* Exitosos */}
        <Grid item xs={6} md={3}>
          <MetricCard
            icon={CheckCircleIcon}
            label="Exitosos"
            value={generalStats.ok}
            color={colors.success.main}
            bgColor={colors.success.light}
          />
        </Grid>

        {/* Errores */}
        <Grid item xs={6} md={3}>
          <MetricCard
            icon={ErrorIcon}
            label="Errores"
            value={generalStats.error}
            color={colors.error.main}
            bgColor={colors.error.light}
          />
        </Grid>

        {/* Advertencias */}
        <Grid item xs={6} md={3}>
          <MetricCard
            icon={WarningIcon}
            label="Advertencias"
            value={generalStats.warning}
            color={colors.warning.main}
            bgColor={colors.warning.light}
          />
        </Grid>
      </Grid>

      {/* Información adicional */}
      <Box
        sx={{
          mt: 3,
          pt: 2,
          borderTop: `1px solid ${colors.grey[200]}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 2,
        }}
      >
        {/* Tasa de éxito */}
        {generalStats.completados > 0 && (
          <Box>
            <Typography variant="caption" sx={{ color: colors.grey[600], display: 'block', mb: 0.5 }}>
              Tasa de Éxito
            </Typography>
            <Typography
              variant="h6"
              sx={{
                fontWeight: 700,
                color: generalStats.porcentajeExito >= 80 ? colors.success.main : colors.warning.main,
              }}
            >
              {formatPercentage(generalStats.porcentajeExito)}
            </Typography>
          </Box>
        )}

        {/* Completados */}
        <Box>
          <Typography variant="caption" sx={{ color: colors.grey[600], display: 'block', mb: 0.5 }}>
            Completados
          </Typography>
          <Typography variant="h6" sx={{ fontWeight: 700, color: colors.grey[800] }}>
            {generalStats.completados} / {generalStats.total}
          </Typography>
        </Box>

        {/* En Progreso */}
        {generalStats.enProgreso > 0 && (
          <Box>
            <Typography variant="caption" sx={{ color: colors.grey[600], display: 'block', mb: 0.5 }}>
              En Progreso
            </Typography>
            <Typography variant="h6" sx={{ fontWeight: 700, color: colors.primary.main }}>
              {generalStats.enProgreso}
            </Typography>
          </Box>
        )}

        {/* Tiempo transcurrido */}
        {elapsedTime > 0 && (
          <Box>
            <Typography variant="caption" sx={{ color: colors.grey[600], display: 'block', mb: 0.5 }}>
              Tiempo Transcurrido
            </Typography>
            <Typography variant="h6" sx={{ fontWeight: 700, color: colors.grey[800] }}>
              {formatDuration(elapsedTime)}
            </Typography>
          </Box>
        )}
      </Box>
    </Paper>
  );
};

/**
 * MetricCard - Card de métrica individual
 */
const MetricCard = ({ icon: Icon, label, value, color, bgColor }) => (
  <Box
    sx={{
      p: 2,
      borderRadius: '12px',
      backgroundColor: bgColor,
      border: `1px solid ${color}30`,
      display: 'flex',
      alignItems: 'center',
      gap: 1.5,
      transition: 'all 0.2s ease',
      '&:hover': {
        transform: 'translateY(-2px)',
        boxShadow: `0 4px 12px ${color}30`,
      },
    }}
  >
    <Icon
      sx={{
        fontSize: 32,
        color: color,
      }}
    />
    <Box>
      <Typography
        variant="caption"
        sx={{
          fontSize: '0.7rem',
          color: colors.grey[600],
          display: 'block',
          mb: 0.5,
        }}
      >
        {label}
      </Typography>
      <Typography
        variant="h5"
        sx={{
          fontSize: '1.5rem',
          fontWeight: 700,
          color: color,
        }}
      >
        {value}
      </Typography>
    </Box>
  </Box>
);

export default ExecutionSummary;
