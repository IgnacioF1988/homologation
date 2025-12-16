/**
 * CheckboxField - Campo de checkbox premium
 * 
 * EFECTOS:
 * - Transiciones suaves
 * - Hover states elegantes
 * - Check animation
 */

import React from 'react';
import {
  FormControlLabel,
  Checkbox,
  FormControl,
  FormHelperText,
  Box,
  Tooltip,
  alpha,
} from '@mui/material';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import { colors, borderRadius, typography } from '../../styles/theme';

const CheckboxField = ({
  name,
  label,
  checked,
  onChange,
  error = null,
  helperText = null,
  disabled = false,
  readOnly = false,
  tooltip = null,
  color = 'primary',
  size = 'medium',
  sx = {},
  ...props
}) => {
  const handleChange = (e) => {
    if (readOnly) return;

    if (onChange) {
      const syntheticEvent = {
        ...e,
        target: {
          ...e.target,
          name,
          value: e.target.checked,
          type: 'checkbox',
        },
      };
      onChange(syntheticEvent);
    }
  };

  const renderLabel = () => {
    if (tooltip) {
      return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <span>{label}</span>
          <Tooltip title={tooltip} arrow placement="top">
            <HelpOutlineIcon 
              sx={{ 
                fontSize: 16, 
                color: colors.text.muted, 
                cursor: 'help',
                transition: 'color 200ms ease',
                '&:hover': {
                  color: colors.primary.main,
                },
              }} 
            />
          </Tooltip>
        </Box>
      );
    }
    return label;
  };

  return (
    <FormControl error={!!error} sx={sx}>
      <FormControlLabel
        control={
          <Checkbox
            name={name}
            checked={!!checked}
            onChange={handleChange}
            disabled={disabled || readOnly}
            size={size}
            sx={{
              color: colors.grey[400],
              transition: 'all 200ms ease',
              
              '&:hover': {
                backgroundColor: alpha(colors.primary.main, 0.06),
              },
              
              '&.Mui-checked': {
                color: colors.primary.main,
              },
              
              '&.Mui-disabled': {
                color: colors.grey[300],
              },
              
              '& .MuiSvgIcon-root': {
                fontSize: size === 'small' ? 20 : 24,
              },
            }}
            {...props}
          />
        }
        label={renderLabel()}
        sx={{
          marginLeft: 0,
          marginRight: 0,
          
          '& .MuiFormControlLabel-label': {
            fontSize: typography.fontSize.sm,
            fontWeight: typography.fontWeight.medium,
            color: disabled ? colors.text.disabled : colors.text.primary,
            transition: 'color 200ms ease',
          },
          
          '&:hover .MuiFormControlLabel-label': {
            color: disabled ? colors.text.disabled : colors.text.primary,
          },
          
          // Efecto de container
          padding: '6px 10px 6px 0',
          borderRadius: borderRadius.sm,
          transition: 'background-color 200ms ease',
          
          '&:hover': {
            backgroundColor: disabled ? 'transparent' : alpha(colors.grey[500], 0.04),
          },
        }}
      />
      {(error || helperText) && (
        <FormHelperText 
          error={!!error}
          sx={{
            fontSize: typography.fontSize.xs,
            marginTop: '4px',
            marginLeft: '2px',
          }}
        >
          {error || helperText}
        </FormHelperText>
      )}
    </FormControl>
  );
};

export default CheckboxField;
