/**
 * FormActions - Seccion de botones de accion del formulario
 *
 * UX MEJORADO:
 * - Iconos modernos (Outlined)
 * - Transiciones suaves en botones
 * - Boton guardar con efecto gradient
 */

import { Box, Button, CircularProgress } from '@mui/material';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import RefreshOutlinedIcon from '@mui/icons-material/RefreshOutlined';
import { enhancedButtonStyles, buttonStyles } from '../../styles/formStyles';
import { FORM_MODES } from '../../hooks/useFormMode';

const FormActions = ({
  mode,
  onSubmit,
  onCancel,
  onReset,
  loading = false,
  disabled = false,
  hasErrors = false,
}) => {
  // Texto del boton principal segun modo
  const getSubmitButtonText = () => {
    switch (mode) {
      case FORM_MODES.EXACTA:
        return 'Confirmar';
      case FORM_MODES.PARCIAL:
        return 'Completar y Guardar';
      case FORM_MODES.NUEVA:
        return 'Crear Instrumento';
      case FORM_MODES.REESTRUCTURACION:
        return 'Guardar Cambios';
      default:
        return 'Guardar';
    }
  };

  // Icono del boton principal segun modo
  const getSubmitButtonIcon = () => {
    if (loading) {
      return <CircularProgress size={20} color="inherit" />;
    }
    switch (mode) {
      case FORM_MODES.EXACTA:
        return <CheckCircleOutlinedIcon />;
      default:
        return <SaveOutlinedIcon />;
    }
  };

  // Determinar si el boton esta deshabilitado
  const isDisabled = loading || disabled || hasErrors;

  return (
    <Box sx={buttonStyles.actionContainer}>
      {onReset && (
        <Button
          variant="outlined"
          color="inherit"
          onClick={onReset}
          disabled={loading}
          startIcon={<RefreshOutlinedIcon />}
          sx={enhancedButtonStyles.secondary}
        >
          Limpiar
        </Button>
      )}

      {onCancel && (
        <Button
          variant="outlined"
          color="error"
          onClick={onCancel}
          disabled={loading}
          startIcon={<CancelOutlinedIcon />}
          sx={enhancedButtonStyles.secondary}
        >
          Cancelar
        </Button>
      )}

      <Button
        variant="contained"
        color="primary"
        onClick={onSubmit}
        disabled={isDisabled}
        startIcon={getSubmitButtonIcon()}
        sx={enhancedButtonStyles.save}
      >
        {getSubmitButtonText()}
      </Button>
    </Box>
  );
};

export default FormActions;
