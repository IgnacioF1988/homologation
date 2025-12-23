/**
 * FundCardHeader - Header del Card de Fondo
 * Muestra nombre, estado, duración y acciones del fondo
 */

import React from 'react';
import { Box, Typography, IconButton, Tooltip } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import RefreshIcon from '@mui/icons-material/Refresh';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import StatusBadge from '../shared/StatusBadge';
import { formatDuration, formatTimeAgo } from '../../utils/formatters';
import { colors } from '../../../../styles/theme';

/**
 * FundCardHeader Component
 *
 * @param {Object} props
 * @param {ParsedFondo} props.fondo - Fondo parseado
 * @param {boolean} props.isExpanded - Si el card está expandido
 * @param {boolean} props.isSubStagesExpanded - Si sub-etapas están expandidas
 * @param {Function} props.onToggleExpand - Callback para expandir/colapsar card
 * @param {Function} props.onToggleSubStages - Callback para expandir/colapsar sub-etapas
 * @param {Function} props.onReprocess - Callback para reprocesar (opcional)
 * @param {Function} props.onShowDetails - Callback para mostrar detalles (opcional)
 * @param {boolean} props.canReprocess - Si puede reprocesarse (default: false)
 * @param {Object} props.sx - Estilos adicionales
 */
export const FundCardHeader = ({
  fondo,
  isExpanded = false,
  isSubStagesExpanded = false,
  onToggleExpand,
  onToggleSubStages,
  onReprocess,
  onShowDetails,
  canReprocess = false,
  sx = {},
}) => {
  if (!fondo) return null;

  // Determinar color de borde basado en estado
  const borderColor = getBorderColor(fondo);

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        p: 2,
        borderBottom: isExpanded ? `1px solid ${colors.grey[200]}` : 'none',
        cursor: onToggleExpand ? 'pointer' : 'default',
        transition: 'background-color 0.2s ease',
        '&:hover': onToggleExpand ? {
          backgroundColor: colors.grey[50],
        } : {},
        borderLeft: `4px solid ${borderColor}`,
        ...sx,
      }}
      onClick={onToggleExpand}
    >
      {/* Nombre del fondo */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          variant="h6"
          sx={{
            fontSize: '1rem',
            fontWeight: 700,
            color: colors.grey[900],
            mb: 0.5,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {fondo.shortName}
        </Typography>
        <Typography
          variant="body2"
          sx={{
            fontSize: '0.75rem',
            color: colors.grey[600],
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {fondo.fullName}
        </Typography>
      </Box>

      {/* Status Badge */}
      <StatusBadge
        status={getStatusString(fondo.status)}
        variant="chip"
        size="medium"
      />

      {/* Duración / Tiempo */}
      {(fondo.duration || fondo.startTime) && (
        <Box sx={{ minWidth: 80, textAlign: 'right' }}>
          {fondo.duration ? (
            <Tooltip title="Duración total">
              <Typography
                variant="body2"
                sx={{
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  color: colors.grey[700],
                }}
              >
                {formatDuration(fondo.duration)}
              </Typography>
            </Tooltip>
          ) : fondo.startTime ? (
            <Tooltip title="Tiempo transcurrido">
              <Typography
                variant="body2"
                sx={{
                  fontSize: '0.75rem',
                  color: colors.grey[600],
                }}
              >
                {formatTimeAgo(fondo.startTime)}
              </Typography>
            </Tooltip>
          ) : null}
        </Box>
      )}

      {/* Acciones */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
        }}
        onClick={(e) => e.stopPropagation()} // Prevenir propagación del click
      >
        {/* Botón de detalles */}
        {onShowDetails && (
          <Tooltip title="Ver detalles">
            <IconButton
              size="small"
              onClick={onShowDetails}
              sx={{
                color: colors.grey[600],
                '&:hover': {
                  backgroundColor: colors.grey[100],
                  color: colors.primary.main,
                },
              }}
            >
              <InfoOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}

        {/* Botón de reprocesar */}
        {canReprocess && onReprocess && (
          <Tooltip title="Reprocesar fondo">
            <IconButton
              size="small"
              onClick={onReprocess}
              sx={{
                color: colors.grey[600],
                '&:hover': {
                  backgroundColor: colors.warning.light,
                  color: colors.warning.main,
                },
              }}
            >
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}

        {/* Botón de expandir/colapsar sub-etapas */}
        {onToggleSubStages && (
          <Tooltip title={isSubStagesExpanded ? "Ocultar sub-etapas" : "Mostrar sub-etapas"}>
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                onToggleSubStages();
              }}
              sx={{
                color: colors.grey[600],
                '&:hover': {
                  backgroundColor: colors.grey[100],
                  color: colors.primary.main,
                },
              }}
            >
              {isSubStagesExpanded ? (
                <ExpandLessIcon fontSize="small" />
              ) : (
                <ExpandMoreIcon fontSize="small" />
              )}
            </IconButton>
          </Tooltip>
        )}

        {/* Botón de expandir/colapsar card */}
        {onToggleExpand && (
          <Tooltip title={isExpanded ? "Colapsar" : "Expandir"}>
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpand();
              }}
              sx={{
                color: colors.grey[600],
                '&:hover': {
                  backgroundColor: colors.grey[100],
                  color: colors.primary.main,
                },
              }}
            >
              {isExpanded ? (
                <ExpandLessIcon fontSize="small" />
              ) : (
                <ExpandMoreIcon fontSize="small" />
              )}
            </IconButton>
          </Tooltip>
        )}
      </Box>
    </Box>
  );
};

/**
 * getStatusString - Convierte status numérico a string
 * @param {number} status - Status numérico (FINAL_STATUS enum)
 * @returns {string} - Status como string
 */
const getStatusString = (status) => {
  const statusMap = {
    0: 'PENDIENTE',
    1: 'EN_PROGRESO',
    2: 'OK',
    3: 'WARNING',
    4: 'ERROR',
    5: 'PARCIAL',
    6: 'OMITIDO',
  };

  return statusMap[status] || 'PENDIENTE';
};

/**
 * getBorderColor - Obtiene color de borde basado en estado
 * @param {ParsedFondo} fondo - Fondo parseado
 * @returns {string} - Color de borde
 */
const getBorderColor = (fondo) => {
  if (fondo.hasError) return colors.error.main;
  if (fondo.hasWarning) return colors.warning.main;
  if (fondo.isProcessing) return colors.primary.main;
  if (fondo.status === 2) return colors.success.main; // OK

  return colors.grey[300];
};

export default FundCardHeader;
