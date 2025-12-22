/**
 * EmptyState - Componente de Estado Vacío
 * Muestra un mensaje cuando no hay datos disponibles
 */

import React from 'react';
import { Box, Typography, Button } from '@mui/material';
import InboxOutlinedIcon from '@mui/icons-material/InboxOutlined';
import SearchOffIcon from '@mui/icons-material/SearchOff';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import { colors } from '../../../../styles/theme';

/**
 * EmptyState Component
 *
 * @param {Object} props
 * @param {string} props.variant - Variante ('no-data', 'no-results', 'error', 'no-execution')
 * @param {string} props.title - Título del mensaje
 * @param {string} props.message - Mensaje descriptivo
 * @param {React.Component} props.icon - Icono personalizado (opcional)
 * @param {string} props.actionLabel - Label del botón de acción (opcional)
 * @param {Function} props.onAction - Callback del botón de acción (opcional)
 * @param {Object} props.sx - Estilos adicionales
 */
export const EmptyState = ({
  variant = 'no-data',
  title,
  message,
  icon: CustomIcon,
  actionLabel,
  onAction,
  sx = {},
}) => {
  // Configuración por variante
  const variantConfig = getVariantConfig(variant);

  const Icon = CustomIcon || variantConfig.icon;
  const defaultTitle = title || variantConfig.title;
  const defaultMessage = message || variantConfig.message;

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        py: 8,
        px: 4,
        textAlign: 'center',
        ...sx,
      }}
    >
      {/* Icono */}
      <Box
        sx={{
          mb: 3,
          p: 3,
          borderRadius: '50%',
          backgroundColor: colors.grey[100],
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon
          sx={{
            fontSize: 64,
            color: colors.grey[400],
          }}
        />
      </Box>

      {/* Título */}
      <Typography
        variant="h6"
        sx={{
          mb: 1,
          color: colors.grey[700],
          fontWeight: 600,
        }}
      >
        {defaultTitle}
      </Typography>

      {/* Mensaje */}
      <Typography
        variant="body2"
        sx={{
          mb: 3,
          color: colors.grey[600],
          maxWidth: 400,
        }}
      >
        {defaultMessage}
      </Typography>

      {/* Botón de acción (opcional) */}
      {actionLabel && onAction && (
        <Button
          variant="contained"
          onClick={onAction}
          sx={{
            backgroundColor: colors.primary.main,
            color: '#fff',
            fontWeight: 600,
            px: 4,
            py: 1.5,
            borderRadius: '8px',
            textTransform: 'none',
            '&:hover': {
              backgroundColor: colors.primary.dark,
            },
          }}
        >
          {actionLabel}
        </Button>
      )}
    </Box>
  );
};

/**
 * getVariantConfig - Obtiene configuración por variante
 * @param {string} variant - Variante del estado vacío
 * @returns {Object} - Configuración { icon, title, message }
 */
const getVariantConfig = (variant) => {
  const configs = {
    'no-data': {
      icon: InboxOutlinedIcon,
      title: 'No hay datos disponibles',
      message: 'No se encontraron datos para mostrar. Intenta ejecutar un nuevo proceso.',
    },
    'no-results': {
      icon: SearchOffIcon,
      title: 'No se encontraron resultados',
      message: 'Tu búsqueda no arrojó resultados. Intenta con otros filtros o términos de búsqueda.',
    },
    'error': {
      icon: ErrorOutlineIcon,
      title: 'Error al cargar datos',
      message: 'Ocurrió un error al intentar cargar los datos. Por favor, intenta nuevamente.',
    },
    'no-execution': {
      icon: PlayCircleOutlineIcon,
      title: 'No hay ejecución activa',
      message: 'Inicia una nueva ejecución del pipeline para ver el progreso en tiempo real.',
    },
  };

  return configs[variant] || configs['no-data'];
};

export default EmptyState;
