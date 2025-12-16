/**
 * StatusMessage - Componente para mostrar mensajes de estado
 * Soporta diferentes tipos: success, error, warning, info
 */

import React from 'react';
import { Box, Typography, IconButton, Collapse } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import WarningIcon from '@mui/icons-material/Warning';
import InfoIcon from '@mui/icons-material/Info';
import CloseIcon from '@mui/icons-material/Close';
import { statusStyles } from '../../styles/formStyles';

const iconMap = {
  success: CheckCircleIcon,
  error: ErrorIcon,
  warning: WarningIcon,
  info: InfoIcon,
};

const StatusMessage = ({
  type = 'info', // 'success' | 'error' | 'warning' | 'info'
  message,
  title = null,
  show = true,
  onClose = null,
  children = null,
  sx = {},
}) => {
  if (!message && !children) return null;

  const Icon = iconMap[type] || InfoIcon;
  const styles = statusStyles[type] || statusStyles.info;

  return (
    <Collapse in={show}>
      <Box
        sx={{
          ...styles,
          display: 'flex',
          alignItems: 'flex-start',
          gap: 1.5,
          ...sx,
        }}
      >
        <Icon sx={{ fontSize: 24, mt: 0.25 }} />
        <Box sx={{ flex: 1 }}>
          {title && (
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>
              {title}
            </Typography>
          )}
          {message && (
            <Typography variant="body2">
              {message}
            </Typography>
          )}
          {children}
        </Box>
        {onClose && (
          <IconButton
            size="small"
            onClick={onClose}
            sx={{ mt: -0.5, mr: -0.5 }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        )}
      </Box>
    </Collapse>
  );
};

// Variantes especificas para conveniencia
export const SuccessMessage = (props) => <StatusMessage type="success" {...props} />;
export const ErrorMessage = (props) => <StatusMessage type="error" {...props} />;
export const WarningMessage = (props) => <StatusMessage type="warning" {...props} />;
export const InfoMessage = (props) => <StatusMessage type="info" {...props} />;

export default StatusMessage;
