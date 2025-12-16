/**
 * BaseField - Componente base del cual heredan todos los campos
 * Proporciona funcionalidad comun: labels, errores, estados, etc.
 */

import React from 'react';
import { FormControl, FormHelperText } from '@mui/material';
import { fieldStyles, fieldWidths } from '../../styles/formStyles';

const BaseField = ({
  name,
  label,
  value,
  error = null,
  helperText = null,
  required = false,
  disabled = false,
  readOnly = false,
  width = 'flex1', // 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'full' | 'flex1' | 'flex2' | number
  tooltip = null,
  showSuccess = false,
  children,
  sx = {},
  ...props
}) => {
  // Obtener estilos de ancho
  const getWidthStyles = () => {
    if (typeof width === 'number') {
      return { width };
    }
    return fieldWidths[width] || fieldWidths.flex1;
  };

  // Combinar estilos segun estado
  const getFieldStyles = () => {
    let styles = { ...fieldStyles.base };

    if (readOnly) {
      styles = { ...styles, ...fieldStyles.readOnly };
    }
    if (disabled) {
      styles = { ...styles, ...fieldStyles.disabled };
    }
    if (error) {
      styles = { ...styles, ...fieldStyles.error };
    }
    if (showSuccess && !error && value) {
      styles = { ...styles, ...fieldStyles.success };
    }
    if (required) {
      styles = { ...styles, ...fieldStyles.required };
    }

    return styles;
  };

  return (
    <FormControl
      error={!!error}
      disabled={disabled}
      required={required}
      sx={{
        ...getWidthStyles(),
        ...getFieldStyles(),
        ...sx,
      }}
      {...props}
    >
      {children}
      {(error || helperText) && (
        <FormHelperText error={!!error}>
          {error || helperText}
        </FormHelperText>
      )}
    </FormControl>
  );
};

export default BaseField;
