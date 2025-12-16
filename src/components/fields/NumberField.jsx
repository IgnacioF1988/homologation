/**
 * NumberField - Campo numérico premium
 *
 * Soporta decimales, negativos, porcentajes, monedas, etc.
 * Usa useFieldStyles hook para estilos centralizados
 */

import { useState, useEffect } from 'react';
import { TextField, InputAdornment } from '@mui/material';
import { useFieldStyles, getFieldState } from '../../hooks/useFieldStyles';

const NumberField = ({
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
  min = null,
  max = null,
  step = 1,
  decimals = null,
  allowNegative = false,
  prefix = null,
  suffix = null,
  thousandSeparator = true,
  showSuccess = false,
  onBlur = null,
  size = 'small',
  variant = 'outlined',
  sx = {},
  ...props
}) => {
  const [displayValue, setDisplayValue] = useState('');

  // Estilos centralizados
  const fieldState = getFieldState({ error, readOnly, disabled, value, required, showSuccess });
  const fieldStyles = useFieldStyles({ state: fieldState, width, sx });

  const formatNumber = (num) => {
    if (num === null || num === undefined || num === '') return '';
    let formatted = String(num);
    if (thousandSeparator) {
      const parts = formatted.split('.');
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      formatted = parts.join('.');
    }
    return formatted;
  };

  useEffect(() => {
    if (value === null || value === undefined || value === '') {
      setDisplayValue('');
    } else {
      setDisplayValue(formatNumber(value));
    }
  }, [value, thousandSeparator]);

  const parseNumber = (str) => {
    if (!str) return '';
    let cleaned = str.replace(/,/g, '').replace(/\s/g, '');
    const regex = allowNegative ? /^-?\d*\.?\d*$/ : /^\d*\.?\d*$/;
    if (!regex.test(cleaned)) return null;
    return cleaned;
  };

  const handleChange = (e) => {
    const inputValue = e.target.value;
    const parsed = parseNumber(inputValue);
    if (parsed === null) return;
    setDisplayValue(inputValue);
    if (onChange) {
      onChange({ ...e, target: { ...e.target, name, value: parsed === '' ? '' : parsed } });
    }
  };

  const handleBlur = (e) => {
    if (value !== null && value !== undefined && value !== '') {
      let finalValue = parseFloat(value);
      if (min !== null && finalValue < min) finalValue = min;
      if (max !== null && finalValue > max) finalValue = max;
      if (decimals !== null) finalValue = parseFloat(finalValue.toFixed(decimals));
      if (String(finalValue) !== String(value)) {
        onChange({ target: { name, value: String(finalValue) } });
      }
      setDisplayValue(formatNumber(finalValue));
    }
    if (onBlur) onBlur(e);
  };

  const buildInputProps = () => {
    const result = {};
    if (prefix) result.startAdornment = <InputAdornment position="start">{prefix}</InputAdornment>;
    if (suffix) result.endAdornment = <InputAdornment position="end">{suffix}</InputAdornment>;
    if (readOnly) result.readOnly = true;
    return result;
  };

  return (
    <TextField
      name={name}
      label={label}
      value={displayValue}
      onChange={handleChange}
      onBlur={handleBlur}
      error={!!error}
      helperText={error || helperText}
      required={required}
      disabled={disabled}
      size={size}
      variant={variant}
      inputProps={{ inputMode: 'decimal', step }}
      InputProps={buildInputProps()}
      sx={fieldStyles}
      {...props}
    />
  );
};

export default NumberField;
