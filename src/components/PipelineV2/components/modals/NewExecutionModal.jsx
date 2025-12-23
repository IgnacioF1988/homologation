/**
 * NewExecutionModal - Modal de Nueva Ejecución
 * Permite seleccionar fecha y ejecutar nuevo proceso del pipeline
 */

import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  Alert,
  CircularProgress,
} from '@mui/material';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import CloseIcon from '@mui/icons-material/Close';
import { colors } from '../../../../styles/theme';

/**
 * NewExecutionModal Component
 *
 * @param {Object} props
 * @param {boolean} props.open - Si el modal está abierto
 * @param {Function} props.onClose - Callback para cerrar el modal
 * @param {Function} props.onExecute - Callback para ejecutar (recibe fecha en formato YYYY-MM-DD)
 * @param {boolean} props.isExecuting - Si está ejecutando (loading state)
 * @param {string} props.error - Mensaje de error (opcional)
 */
export const NewExecutionModal = ({
  open,
  onClose,
  onExecute,
  isExecuting = false,
  error,
}) => {
  // Estado local para la fecha seleccionada
  const [selectedDate, setSelectedDate] = useState(() => {
    // Default: día anterior
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.toISOString().split('T')[0];
  });

  // Handler para cambio de fecha
  const handleDateChange = (event) => {
    setSelectedDate(event.target.value);
  };

  // Handler para ejecutar
  const handleExecute = () => {
    if (!selectedDate) {
      return;
    }

    if (onExecute) {
      onExecute(selectedDate);
    }
  };

  // Handler para cerrar
  const handleClose = () => {
    if (!isExecuting && onClose) {
      onClose();
    }
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: '16px',
        },
      }}
    >
      {/* Título */}
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          pb: 2,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <CalendarTodayIcon sx={{ fontSize: 28, color: colors.primary.main }} />
          <Typography variant="h6" sx={{ fontWeight: 700, color: colors.grey[900] }}>
            Nueva Ejecución del Pipeline
          </Typography>
        </Box>
      </DialogTitle>

      {/* Contenido */}
      <DialogContent>
        <Box sx={{ pt: 1 }}>
          {/* Descripción */}
          <Typography
            variant="body2"
            sx={{
              mb: 3,
              color: colors.grey[700],
              lineHeight: 1.6,
            }}
          >
            Selecciona la fecha de reporte para ejecutar el proceso ETL del pipeline.
            El sistema procesará todos los fondos disponibles para la fecha seleccionada.
          </Typography>

          {/* Selector de fecha */}
          <TextField
            type="date"
            label="Fecha de Reporte"
            value={selectedDate}
            onChange={handleDateChange}
            fullWidth
            disabled={isExecuting}
            InputLabelProps={{
              shrink: true,
            }}
            inputProps={{
              max: new Date().toISOString().split('T')[0], // No permitir fechas futuras
            }}
            sx={{
              mb: 2,
              '& .MuiOutlinedInput-root': {
                borderRadius: '12px',
              },
            }}
          />

          {/* Información adicional */}
          <Alert
            severity="info"
            sx={{
              borderRadius: '12px',
              backgroundColor: colors.info.light,
              '& .MuiAlert-icon': {
                color: colors.info.main,
              },
            }}
          >
            <Typography variant="body2" sx={{ fontSize: '0.875rem' }}>
              <strong>Nota:</strong> La ejecución puede tardar varios minutos dependiendo de la cantidad
              de fondos a procesar. Podrás ver el progreso en tiempo real.
            </Typography>
          </Alert>

          {/* Error */}
          {error && (
            <Alert
              severity="error"
              sx={{
                mt: 2,
                borderRadius: '12px',
              }}
            >
              <Typography variant="body2" sx={{ fontSize: '0.875rem' }}>
                {error}
              </Typography>
            </Alert>
          )}

          {/* Estado de carga */}
          {isExecuting && (
            <Box
              sx={{
                mt: 3,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 2,
              }}
            >
              <CircularProgress size={48} sx={{ color: colors.primary.main }} />
              <Typography
                variant="body2"
                sx={{
                  color: colors.grey[600],
                  fontWeight: 500,
                }}
              >
                Iniciando ejecución...
              </Typography>
            </Box>
          )}
        </Box>
      </DialogContent>

      {/* Acciones */}
      <DialogActions
        sx={{
          px: 3,
          pb: 3,
          gap: 1,
        }}
      >
        <Button
          onClick={handleClose}
          disabled={isExecuting}
          sx={{
            borderRadius: '8px',
            px: 3,
            textTransform: 'none',
            fontWeight: 600,
            color: colors.grey[700],
          }}
          startIcon={<CloseIcon />}
        >
          Cancelar
        </Button>

        <Button
          variant="contained"
          onClick={handleExecute}
          disabled={!selectedDate || isExecuting}
          sx={{
            borderRadius: '8px',
            px: 3,
            textTransform: 'none',
            fontWeight: 600,
            backgroundColor: colors.primary.main,
            '&:hover': {
              backgroundColor: colors.primary.dark,
            },
            '&:disabled': {
              backgroundColor: colors.grey[300],
              color: colors.grey[500],
            },
          }}
          startIcon={isExecuting ? <CircularProgress size={20} color="inherit" /> : <PlayArrowIcon />}
        >
          {isExecuting ? 'Ejecutando...' : 'Ejecutar Pipeline'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default NewExecutionModal;
