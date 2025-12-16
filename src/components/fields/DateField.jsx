/**
 * DateField - Campo de fecha premium
 *
 * Usa useFieldStyles hook para estilos centralizados
 */

import { TextField } from '@mui/material';
import { useFieldStyles, getFieldState } from '../../hooks/useFieldStyles';

const DateField = ({
  name,
  label,
  value,
  onChange,
  error = null,
  helperText = null,
  required = false,
  disabled = false,
  readOnly = false,
  width = 'md',
  minDate = null,
  maxDate = null,
  showSuccess = false,
  size = 'small',
  variant = 'outlined',
  sx = {},
  ...props
}) => {
  // Estilos centralizados
  const fieldState = getFieldState({ error, readOnly, disabled, value, required, showSuccess });
  const fieldStyles = useFieldStyles({ state: fieldState, width, sx });

  return (
    <TextField
      type="date"
      name={name}
      label={label}
      value={value ?? ''}
      onChange={onChange}
      error={!!error}
      helperText={error || helperText}
      required={required}
      disabled={disabled}
      size={size}
      variant={variant}
      InputLabelProps={{ shrink: true }}
      inputProps={{ min: minDate, max: maxDate, readOnly }}
      sx={fieldStyles}
      {...props}
    />
  );
};

export default DateField;
