/**
 * SelectField - Campo de selección premium
 *
 * Usa useFieldStyles hook para estilos centralizados
 */

import {
  TextField,
  MenuItem,
  ListSubheader,
  CircularProgress,
  InputAdornment,
  alpha,
} from '@mui/material';
import { colors, borderRadius, typography, shadows } from '../../styles/theme';
import { useFieldStyles, getFieldState } from '../../hooks/useFieldStyles';

// Estilos del menú desplegable
const menuProps = {
  PaperProps: {
    sx: {
      mt: 1,
      borderRadius: borderRadius.lg,
      boxShadow: shadows.floating,
      border: `1px solid ${colors.border.light}`,
      backgroundColor: colors.background.paper,
      backdropFilter: 'blur(20px)',
      maxHeight: 320,
      '& .MuiList-root': { py: 1 },
      '& .MuiMenuItem-root': {
        mx: 1,
        borderRadius: borderRadius.sm,
        fontSize: typography.fontSize.sm,
        py: 1.25,
        px: 1.5,
        transition: 'all 150ms ease',
        '&:hover': { backgroundColor: alpha(colors.primary.main, 0.06) },
        '&.Mui-selected': {
          backgroundColor: alpha(colors.primary.main, 0.1),
          fontWeight: typography.fontWeight.medium,
          '&:hover': { backgroundColor: alpha(colors.primary.main, 0.14) },
        },
      },
      '& .MuiListSubheader-root': {
        backgroundColor: colors.grey[50],
        fontWeight: typography.fontWeight.semibold,
        fontSize: typography.fontSize.xs,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        color: colors.text.tertiary,
        lineHeight: '36px',
        mx: 1,
        borderRadius: borderRadius.sm,
        mt: 0.5,
      },
    },
  },
};

const SelectField = ({
  name,
  label,
  value,
  onChange,
  options = [],
  error = null,
  helperText = null,
  required = false,
  disabled = false,
  readOnly = false,
  width = 'flex1',
  loading = false,
  emptyOption = true,
  emptyLabel = '-- Seleccione --',
  grouped = false,
  showSuccess = false,
  inherited = false,
  size = 'small',
  variant = 'outlined',
  sx = {},
  ...props
}) => {
  // Estilos centralizados
  const fieldState = getFieldState({ error, readOnly, disabled, inherited, value, required, showSuccess });
  const fieldStyles = useFieldStyles({ state: fieldState, width, sx });

  // Renderizar opciones (agrupadas o simples)
  const renderOptions = () => {
    if (!grouped) {
      return options.map(opt => <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>);
    }
    const groups = {};
    options.forEach(opt => {
      const groupName = opt.group || 'Sin grupo';
      if (!groups[groupName]) groups[groupName] = [];
      groups[groupName].push(opt);
    });
    const items = [];
    Object.entries(groups).forEach(([groupName, groupOptions]) => {
      items.push(<ListSubheader key={`group-${groupName}`}>{groupName}</ListSubheader>);
      groupOptions.forEach(opt => items.push(<MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>));
    });
    return items;
  };

  return (
    <TextField
      select
      name={name}
      label={label}
      value={value ?? ''}
      onChange={onChange}
      error={!!error}
      helperText={error || helperText}
      required={required}
      disabled={disabled || loading}
      size={size}
      variant={variant}
      SelectProps={{ MenuProps: menuProps }}
      InputProps={{
        readOnly,
        endAdornment: loading ? (
          <InputAdornment position="end">
            <CircularProgress size={20} sx={{ color: colors.primary.main }} />
          </InputAdornment>
        ) : undefined,
      }}
      sx={fieldStyles}
      {...props}
    >
      {emptyOption && (
        <MenuItem value="" sx={{ color: colors.text.muted, fontStyle: 'italic' }}>{emptyLabel}</MenuItem>
      )}
      {renderOptions()}
    </TextField>
  );
};

export default SelectField;
