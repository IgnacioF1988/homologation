/**
 * AutocompleteField - Campo de autocompletado premium
 *
 * Especializado para búsqueda de compañías con auto-población de campos relacionados
 * Usa useFieldStyles hook para estilos centralizados
 */

import { useState, useEffect } from 'react';
import {
  Autocomplete,
  TextField,
  CircularProgress,
  Box,
  Typography,
  Paper,
  alpha,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import BusinessIcon from '@mui/icons-material/Business';
import { colors, borderRadius, shadows, typography } from '../../styles/theme';
import { useFieldStyles, getFieldState } from '../../hooks/useFieldStyles';

// Componente Paper personalizado para dropdown
const CustomPaper = (props) => (
  <Paper
    {...props}
    elevation={0}
    sx={{
      mt: 1,
      borderRadius: borderRadius.lg,
      boxShadow: shadows.floating,
      border: `1px solid ${colors.border.light}`,
      backgroundColor: 'rgba(255, 255, 255, 0.98)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      overflow: 'hidden',
      
      '& .MuiAutocomplete-listbox': {
        py: 1,
        maxHeight: 320,
        
        '& .MuiAutocomplete-option': {
          mx: 1,
          borderRadius: borderRadius.sm,
          fontSize: typography.fontSize.sm,
          py: 1.5,
          px: 1.5,
          transition: 'all 150ms ease',
          
          '&:hover': {
            backgroundColor: alpha(colors.primary.main, 0.06),
          },
          
          '&[aria-selected="true"]': {
            backgroundColor: alpha(colors.primary.main, 0.1),
            
            '&:hover': {
              backgroundColor: alpha(colors.primary.main, 0.14),
            },
          },
          
          '&.Mui-focused': {
            backgroundColor: alpha(colors.primary.main, 0.08),
          },
        },
      },
      
      '& .MuiAutocomplete-noOptions': {
        fontSize: typography.fontSize.sm,
        color: colors.text.tertiary,
        py: 3,
        textAlign: 'center',
      },
      
      '& .MuiAutocomplete-loading': {
        fontSize: typography.fontSize.sm,
        color: colors.text.tertiary,
        py: 3,
        textAlign: 'center',
      },
    }}
  />
);

const AutocompleteField = ({
  name,
  label,
  value,
  onChange,
  onSelect = null,
  searchFn,
  getOptionLabel = (option) => option?.label || option?.name || '',
  getOptionValue = (option) => option?.value || option?.id || option,
  isOptionEqualToValue = (option, val) => getOptionValue(option) === val,
  error = null,
  helperText = null,
  required = false,
  disabled = false,
  readOnly = false,
  width = 'flex2',
  minSearchLength = 2,
  debounceMs = 300,
  placeholder = 'Escriba para buscar...',
  noOptionsText = 'Sin resultados',
  loadingText = 'Buscando...',
  showIcon = true,
  freeSolo = true,
  size = 'small',
  sx = {},
  ...props
}) => {
  const [inputValue, setInputValue] = useState('');
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  // Estilos centralizados
  const fieldState = getFieldState({ error, readOnly, disabled, value, required });
  const fieldStyles = useFieldStyles({ state: fieldState, width, sx });

  // Debounce para búsqueda
  useEffect(() => {
    if (!searchFn) return;
    if (inputValue.length < minSearchLength) {
      setOptions([]);
      return;
    }
    const timeoutId = setTimeout(async () => {
      setLoading(true);
      try {
        const results = await searchFn(inputValue);
        setOptions(results || []);
      } catch (err) {
        console.error('Error en búsqueda:', err);
        setOptions([]);
      } finally {
        setLoading(false);
      }
    }, debounceMs);
    return () => clearTimeout(timeoutId);
  }, [inputValue, searchFn, minSearchLength, debounceMs]);

  // Sincronizar valor externo con input
  useEffect(() => {
    if (value && typeof value === 'string') setInputValue(value);
  }, [value]);

  // Manejar cambio de selección
  const handleChange = (_, newValue) => {
    const isObject = newValue && typeof newValue === 'object';
    const stringValue = isObject ? getOptionLabel(newValue) : (newValue || '');
    if (onChange) onChange({ target: { name, value: stringValue } });
    if (onSelect && isObject) onSelect(newValue);
  };

  // Manejar cambio de input
  const handleInputChange = (_, newInputValue) => {
    setInputValue(newInputValue);
    if (freeSolo && onChange) onChange({ target: { name, value: newInputValue } });
  };

  // Renderizar opción personalizada
  const renderOption = (optionProps, option) => {
    const { key, ...otherProps } = optionProps;
    return (
      <Box component="li" key={key} {...otherProps} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        {showIcon && (
          <Box sx={{
            width: 32, height: 32, borderRadius: borderRadius.sm,
            backgroundColor: alpha(colors.primary.main, 0.08),
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <BusinessIcon sx={{ fontSize: 18, color: colors.primary.main }} />
          </Box>
        )}
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="body2" sx={{ fontWeight: typography.fontWeight.medium, color: colors.text.primary }}>
            {getOptionLabel(option)}
          </Typography>
          {option.issuerTypeCode && (
            <Typography variant="caption" sx={{ color: colors.text.tertiary, display: 'block', mt: 0.25 }}>
              {option.issuerTypeCode} • {option.sectorGICS || 'Sin sector'}
            </Typography>
          )}
        </Box>
      </Box>
    );
  };

  return (
    <Autocomplete
      freeSolo={freeSolo}
      open={open}
      onOpen={() => !readOnly && setOpen(true)}
      onClose={() => setOpen(false)}
      value={value || ''}
      inputValue={inputValue}
      onChange={handleChange}
      onInputChange={handleInputChange}
      options={options}
      loading={loading}
      getOptionLabel={getOptionLabel}
      isOptionEqualToValue={isOptionEqualToValue}
      filterOptions={(x) => x}
      disabled={disabled}
      readOnly={readOnly}
      noOptionsText={inputValue.length < minSearchLength ? `Escriba al menos ${minSearchLength} caracteres` : noOptionsText}
      loadingText={loadingText}
      renderOption={renderOption}
      PaperComponent={CustomPaper}
      sx={fieldStyles}
      renderInput={(params) => (
        <TextField
          {...params}
          name={name}
          label={label}
          placeholder={placeholder}
          required={required}
          error={!!error}
          helperText={error || helperText}
          size={size}
          InputProps={{
            ...params.InputProps,
            startAdornment: showIcon ? (
              <SearchIcon sx={{ color: colors.text.tertiary, mr: 1, fontSize: 20, transition: 'color 200ms ease', '.Mui-focused &': { color: colors.primary.main } }} />
            ) : null,
            endAdornment: (
              <>
                {loading && <CircularProgress size={20} sx={{ color: colors.primary.main }} />}
                {params.InputProps.endAdornment}
              </>
            ),
          }}
        />
      )}
      {...props}
    />
  );
};

export default AutocompleteField;
