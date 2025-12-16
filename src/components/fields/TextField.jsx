/**
 * TextField - Campo de texto premium
 *
 * Usa useFieldStyles hook para estilos centralizados
 */

import { TextField as MuiTextField, InputAdornment } from '@mui/material';
import { useFieldStyles, getFieldState } from '../../hooks/useFieldStyles';

const TextField = ({
  name,
  label,
  value,
  onChange,
  error = null,
  helperText = null,
  required = false,
  disabled = false,
  readOnly = false,
  width = 'flex1',
  type = 'text',
  multiline = false,
  rows = 1,
  maxLength = null,
  placeholder = '',
  startIcon = null,
  endIcon = null,
  showSuccess = false,
  inherited = false,
  onBlur = null,
  onFocus = null,
  autoFocus = false,
  fullWidth = false,
  size = 'small',
  variant = 'outlined',
  sx = {},
  inputProps = {},
  InputProps = {},
  ...props
}) => {
  // Determinar estado y obtener estilos con hook centralizado
  const fieldState = getFieldState({ error, readOnly, disabled, inherited, value, required, showSuccess });
  const fieldStyles = useFieldStyles({ state: fieldState, width, fullWidth, sx });

  // Construir InputProps con íconos
  const buildInputProps = () => {
    const inputPropsResult = { ...InputProps };
    if (startIcon) {
      inputPropsResult.startAdornment = <InputAdornment position="start">{startIcon}</InputAdornment>;
    }
    if (endIcon) {
      inputPropsResult.endAdornment = <InputAdornment position="end">{endIcon}</InputAdornment>;
    }
    if (readOnly) {
      inputPropsResult.readOnly = true;
    }
    return inputPropsResult;
  };

  return (
    <MuiTextField
      name={name}
      label={label}
      value={value ?? ''}
      onChange={onChange}
      onBlur={onBlur}
      onFocus={onFocus}
      error={!!error}
      helperText={error || helperText}
      required={required}
      disabled={disabled}
      type={type}
      multiline={multiline}
      rows={multiline ? rows : undefined}
      placeholder={placeholder}
      autoFocus={autoFocus}
      size={size}
      variant={variant}
      inputProps={{ maxLength, ...inputProps }}
      InputProps={buildInputProps()}
      sx={fieldStyles}
      {...props}
    />
  );
};

export default TextField;
