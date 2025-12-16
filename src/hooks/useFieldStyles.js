/**
 * useFieldStyles - Hook centralizado para estilos de campos de formulario
 *
 * Elimina ~200 lineas de código duplicado entre TextField, SelectField,
 * NumberField, DateField y AutocompleteField.
 *
 * ESTADOS VISUALES:
 * - base: Estado normal
 * - error: Campo con error (rosa sutil)
 * - success: Campo válido (esmeralda sutil)
 * - requiredEmpty: Campo obligatorio vacío (amber sutil)
 * - readOnly: Campo de solo lectura (slate sutil)
 * - inherited: Campo heredado de predecesor (indigo punteado)
 */

import { useMemo } from 'react';
import { alpha } from '@mui/material';
import { colors, borderRadius, typography } from '../styles/theme';

// Anchos de campos predefinidos
export const fieldWidths = {
  xs: { width: 100 },
  sm: { width: 150 },
  md: { width: 220 },
  lg: { width: 300 },
  xl: { width: 400 },
  full: { width: '100%' },
  flex1: { flex: 1, minWidth: 200 },
  flex2: { flex: 2, minWidth: 280 },
};

// Estilos base compartidos por todos los campos
const baseStyles = {
  '& .MuiOutlinedInput-root': {
    borderRadius: borderRadius.md,
    backgroundColor: colors.background.paper,
    fontSize: typography.fontSize.md,
    transition: 'all 250ms cubic-bezier(0.16, 1, 0.3, 1)',

    '& fieldset': {
      borderColor: 'rgba(0, 0, 0, 0.08)',
      borderWidth: '1px',
      transition: 'all 250ms cubic-bezier(0.16, 1, 0.3, 1)',
    },

    '&:hover:not(.Mui-disabled):not(.Mui-error)': {
      '& fieldset': {
        borderColor: 'rgba(0, 0, 0, 0.15)',
      },
    },

    '&.Mui-focused': {
      '& fieldset': {
        borderColor: colors.primary.main,
        borderWidth: '1.5px',
      },
    },
  },

  '& .MuiInputLabel-root': {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.text.secondary,
    transition: 'all 200ms ease',

    '&.Mui-focused': {
      color: colors.primary.main,
    },
  },

  '& .MuiOutlinedInput-input': {
    padding: '14px 16px',
    fontSize: typography.fontSize.md,

    '&::placeholder': {
      color: colors.text.muted,
      opacity: 1,
    },
  },

  '& .MuiInputAdornment-root': {
    color: colors.text.tertiary,
  },

  '& .MuiFormHelperText-root': {
    fontSize: typography.fontSize.xs,
    marginTop: '8px',
    marginLeft: '2px',
    lineHeight: 1.4,
  },
};

// Configuración de estados
const stateConfigs = {
  error: {
    color: colors.error,
    labelColor: colors.error.main,
    helperColor: colors.error.main,
  },
  success: {
    color: colors.success,
    labelColor: colors.success.dark,
  },
  requiredEmpty: {
    color: colors.warning,
    labelColor: colors.warning.dark,
    labelWeight: typography.fontWeight.medium,
  },
  readOnly: {
    bgColor: alpha(colors.grey[500], 0.04),
    borderColor: 'transparent',
    textColor: colors.text.secondary,
    cursor: 'default',
  },
  inherited: {
    color: colors.secondary,
    borderStyle: 'dashed',
  },
};

/**
 * Genera estilos para un estado específico
 */
const getStateStyles = (state) => {
  if (state === 'readOnly') {
    const config = stateConfigs.readOnly;
    return {
      ...baseStyles,
      '& .MuiOutlinedInput-root': {
        ...baseStyles['& .MuiOutlinedInput-root'],
        backgroundColor: config.bgColor,
        cursor: config.cursor,
        '& fieldset': {
          borderColor: config.borderColor,
        },
        '&:hover': {
          '& fieldset': {
            borderColor: config.borderColor,
          },
        },
      },
      '& .MuiInputBase-input': {
        color: config.textColor,
        cursor: config.cursor,
        WebkitTextFillColor: config.textColor,
      },
    };
  }

  if (state === 'inherited') {
    const config = stateConfigs.inherited;
    return {
      ...baseStyles,
      '& .MuiOutlinedInput-root': {
        ...baseStyles['& .MuiOutlinedInput-root'],
        backgroundColor: alpha(config.color.main, 0.03),
        '& fieldset': {
          borderColor: alpha(config.color.main, 0.4),
          borderStyle: config.borderStyle,
          borderWidth: '1.5px',
        },
        '&:hover:not(.Mui-disabled)': {
          '& fieldset': {
            borderColor: config.color.main,
          },
        },
        '&.Mui-focused fieldset': {
          borderColor: config.color.main,
          borderStyle: config.borderStyle,
          boxShadow: `0 0 0 4px ${alpha(config.color.main, 0.12)}`,
        },
      },
    };
  }

  // Estados con color (error, success, requiredEmpty)
  const config = stateConfigs[state];
  if (config?.color) {
    return {
      ...baseStyles,
      '& .MuiOutlinedInput-root': {
        ...baseStyles['& .MuiOutlinedInput-root'],
        backgroundColor: alpha(config.color.main, 0.03),
        '& fieldset': {
          borderColor: alpha(config.color.main, 0.5),
          borderWidth: '1.5px',
        },
        '&:hover:not(.Mui-disabled)': {
          '& fieldset': {
            borderColor: config.color.main,
          },
        },
        '&.Mui-focused fieldset': {
          borderColor: config.color.main,
          boxShadow: `0 0 0 4px ${alpha(config.color.main, 0.12)}`,
        },
      },
      '& .MuiInputLabel-root': {
        ...baseStyles['& .MuiInputLabel-root'],
        color: config.labelColor,
        ...(config.labelWeight && { fontWeight: config.labelWeight }),
      },
      ...(config.helperColor && {
        '& .MuiFormHelperText-root': {
          color: config.helperColor,
        },
      }),
    };
  }

  // Estado base/default
  return {
    ...baseStyles,
    '& .MuiOutlinedInput-root': {
      ...baseStyles['& .MuiOutlinedInput-root'],
      '&.Mui-focused fieldset': {
        borderColor: colors.primary.main,
        boxShadow: `0 0 0 4px ${alpha(colors.primary.main, 0.12)}`,
      },
    },
  };
};

/**
 * Hook principal para obtener estilos de campo
 *
 * @param {Object} options - Opciones del campo
 * @param {string} options.state - Estado visual (error, success, requiredEmpty, readOnly, inherited, base)
 * @param {string} options.width - Ancho del campo (xs, sm, md, lg, xl, full, flex1, flex2)
 * @param {boolean} options.fullWidth - Si el campo ocupa todo el ancho
 * @param {Object} options.sx - Estilos adicionales
 * @returns {Object} Objeto con estilos sx para aplicar al campo
 */
export const useFieldStyles = ({ state = 'base', width = 'flex1', fullWidth = false, sx = {} } = {}) => {
  return useMemo(() => {
    const widthStyles = fullWidth
      ? { width: '100%' }
      : (typeof width === 'number' ? { width } : (fieldWidths[width] || fieldWidths.flex1));

    return {
      ...widthStyles,
      ...getStateStyles(state),
      ...sx,
    };
  }, [state, width, fullWidth, sx]);
};

/**
 * Función helper para determinar el estado visual de un campo
 *
 * @param {Object} options
 * @param {boolean} options.error - Si hay error
 * @param {boolean} options.readOnly - Si es solo lectura
 * @param {boolean} options.disabled - Si está deshabilitado
 * @param {boolean} options.inherited - Si es heredado
 * @param {any} options.value - Valor del campo
 * @param {boolean} options.required - Si es requerido
 * @param {boolean} options.showSuccess - Si mostrar estado de éxito
 * @returns {string} Estado visual del campo
 */
export const getFieldState = ({
  error,
  readOnly,
  disabled,
  inherited,
  value,
  required,
  showSuccess
}) => {
  if (error) return 'error';
  if (readOnly || disabled) {
    return inherited ? 'inherited' : 'readOnly';
  }
  if (value) {
    return showSuccess ? 'success' : 'base';
  }
  if (required && !value) return 'requiredEmpty';
  return 'base';
};

/**
 * Función para obtener estilos de ancho
 */
export const getWidthStyles = (width, fullWidth) => {
  if (fullWidth) return { width: '100%' };
  if (typeof width === 'number') return { width };
  return fieldWidths[width] || fieldWidths.flex1;
};

export default useFieldStyles;
