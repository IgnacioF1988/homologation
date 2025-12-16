/**
 * Form Styles - Sistema de diseño premium para formularios
 * 
 * Características:
 * - Espaciado generoso ("breathing room")
 * - Bordes sutiles y hairline
 * - Estados visuales elegantes
 * - Transiciones suaves
 */

import { colors, borderRadius, shadows, transitions, typography } from './theme';

// ============================================
// CONTENEDORES PRINCIPALES
// ============================================

export const pageContainer = {
  maxWidth: 1440,
  mx: 'auto',
  px: { xs: 2, sm: 4, md: 5, lg: 6 },
  py: { xs: 3, md: 4, lg: 5 },
};

export const formContainer = {
  backgroundColor: colors.background.paper,
  borderRadius: borderRadius.xl,
  border: `1px solid ${colors.border.light}`,
  p: { xs: 3, sm: 4, md: 5, lg: 6 },
  position: 'relative',
  overflow: 'hidden',
  // Línea decorativa superior sutil
  '&::before': {
    content: '""',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '3px',
    background: colors.primary.gradient,
    borderRadius: `${borderRadius.xl} ${borderRadius.xl} 0 0`,
    opacity: 0.9,
  },
};

// ============================================
// ESTILOS DE SECCIONES
// ============================================

export const sectionStyles = {
  container: {
    mb: 4,
    p: { xs: 3, sm: 4, md: 5 },
    backgroundColor: colors.background.paper,
    borderRadius: borderRadius.lg,
    border: `1px solid ${colors.border.light}`,
    position: 'relative',
    transition: transitions.slow,
    '&:hover': {
      borderColor: 'rgba(0, 0, 0, 0.08)',
    },
  },
  
  // Header moderno con más espacio
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    mb: 4,
    pb: 3,
    borderBottom: `1px solid ${colors.border.light}`,
  },
  
  // Título limpio
  title: {
    display: 'flex',
    alignItems: 'center',
    gap: 2,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
    letterSpacing: typography.letterSpacing.tight,
    '& .MuiSvgIcon-root': {
      fontSize: '1.375rem',
      color: colors.primary.main,
      opacity: 0.9,
    },
  },

  // Subtítulo
  subtitle: {
    fontSize: typography.fontSize.sm,
    color: colors.text.tertiary,
    mt: 0.75,
    fontWeight: typography.fontWeight.normal,
  },

  // Sección con indicador de caso
  withCaseIndicator: (caseType) => ({
    borderLeftWidth: '3px',
    borderLeftStyle: 'solid',
    borderLeftColor: colors.cases[caseType]?.main || colors.primary.main,
    pl: { xs: 4, md: 5 },
    backgroundColor: colors.cases[caseType]?.bg || 'transparent',
  }),
};

// ============================================
// FILAS Y GRID - Más espaciosos
// ============================================

export const rowStyles = {
  // Fila de campos estándar
  fieldRow: {
    display: 'flex',
    gap: 4,
    mb: 4,
    flexWrap: 'wrap',
    alignItems: 'flex-start',
  },

  // Fila responsive
  responsiveRow: {
    display: 'flex',
    gap: { xs: 3, md: 4 },
    mb: { xs: 3, md: 4 },
    flexWrap: { xs: 'wrap', lg: 'nowrap' },
    alignItems: 'flex-start',
  },

  // Grid de campos
  fieldGrid: {
    display: 'grid',
    gap: 4,
    gridTemplateColumns: {
      xs: '1fr',
      sm: 'repeat(2, 1fr)',
      md: 'repeat(3, 1fr)',
      lg: 'repeat(4, 1fr)',
    },
  },

  // Fila con separador
  separatedRow: {
    display: 'flex',
    gap: 4,
    mb: 4,
    pb: 4,
    borderBottom: `1px solid ${colors.border.light}`,
    flexWrap: 'wrap',
    alignItems: 'flex-start',
  },
};

// ============================================
// ESTILOS DE CAMPOS - Ultra limpios
// ============================================

const fieldBase = {
  '& .MuiOutlinedInput-root': {
    borderRadius: borderRadius.md,
    backgroundColor: '#ffffff',
    fontSize: typography.fontSize.md,
    transition: transitions.field,
    
    '& fieldset': {
      borderColor: 'rgba(0, 0, 0, 0.08)',
      borderWidth: '1px',
      transition: 'border-color 200ms ease, box-shadow 200ms ease',
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
        boxShadow: `0 0 0 3px ${colors.fieldStates.focused.ring}`,
      },
    },
  },
  
  '& .MuiInputLabel-root': {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.text.secondary,
    
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

export const fieldStyles = {
  base: fieldBase,

  // Solo lectura - muy sutil
  readOnly: {
    ...fieldBase,
    '& .MuiOutlinedInput-root': {
      ...fieldBase['& .MuiOutlinedInput-root'],
      backgroundColor: colors.fieldStates.readonly.bg,
      cursor: 'default',
      
      '& fieldset': {
        borderColor: 'transparent',
        borderWidth: '1px',
      },
      
      '&:hover': {
        '& fieldset': {
          borderColor: 'transparent',
        },
      },
    },
    '& .MuiInputBase-input': {
      color: colors.text.secondary,
      cursor: 'default',
      WebkitTextFillColor: colors.text.secondary,
    },
  },

  // Error
  error: {
    ...fieldBase,
    '& .MuiOutlinedInput-root': {
      ...fieldBase['& .MuiOutlinedInput-root'],
      backgroundColor: colors.fieldStates.error.bg,
      
      '& fieldset': {
        borderColor: colors.fieldStates.error.border,
        borderWidth: '1.5px',
      },
      
      '&:hover': {
        '& fieldset': {
          borderColor: colors.error.main,
        },
      },
      
      '&.Mui-focused fieldset': {
        borderColor: colors.error.main,
        boxShadow: `0 0 0 3px rgba(239, 68, 68, 0.1)`,
      },
    },
    '& .MuiInputLabel-root': {
      color: colors.error.main,
    },
    '& .MuiFormHelperText-root': {
      color: colors.error.main,
    },
  },

  // Éxito
  success: {
    ...fieldBase,
    '& .MuiOutlinedInput-root': {
      ...fieldBase['& .MuiOutlinedInput-root'],
      backgroundColor: colors.fieldStates.completed.bg,
      
      '& fieldset': {
        borderColor: colors.fieldStates.completed.border,
        borderWidth: '1.5px',
      },
      
      '&:hover': {
        '& fieldset': {
          borderColor: colors.success.main,
        },
      },
    },
    '& .MuiInputLabel-root': {
      color: colors.success.dark,
    },
  },

  // Requerido vacío
  requiredEmpty: {
    ...fieldBase,
    '& .MuiOutlinedInput-root': {
      ...fieldBase['& .MuiOutlinedInput-root'],
      backgroundColor: colors.fieldStates.requiredEmpty.bg,
      
      '& fieldset': {
        borderColor: colors.fieldStates.requiredEmpty.border,
        borderWidth: '1.5px',
      },
      
      '&:hover': {
        '& fieldset': {
          borderColor: colors.warning.main,
        },
      },
    },
    '& .MuiInputLabel-root': {
      color: colors.warning.dark,
      fontWeight: typography.fontWeight.medium,
    },
  },

  // Heredado
  inherited: {
    ...fieldBase,
    '& .MuiOutlinedInput-root': {
      ...fieldBase['& .MuiOutlinedInput-root'],
      backgroundColor: colors.fieldStates.inherited.bg,
      
      '& fieldset': {
        borderColor: colors.fieldStates.inherited.border,
        borderStyle: 'dashed',
        borderWidth: '1.5px',
      },
    },
  },
};

// Anchos de campos
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

// ============================================
// MENSAJES DE ESTADO
// ============================================

export const statusStyles = {
  base: {
    borderRadius: borderRadius.md,
    px: 2.5,
    py: 2,
    mb: 3,
    display: 'flex',
    alignItems: 'center',
    gap: 2,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    border: '1px solid',
  },
  
  success: {
    backgroundColor: colors.success.bg,
    color: '#065f46',
    borderColor: 'rgba(16, 185, 129, 0.15)',
  },
  
  error: {
    backgroundColor: colors.error.bg,
    color: '#991b1b',
    borderColor: 'rgba(239, 68, 68, 0.15)',
  },
  
  warning: {
    backgroundColor: colors.warning.bg,
    color: '#92400e',
    borderColor: 'rgba(245, 158, 11, 0.15)',
  },
  
  info: {
    backgroundColor: colors.info.bg,
    color: '#075985',
    borderColor: 'rgba(14, 165, 233, 0.15)',
  },
};

// ============================================
// BOTONES PREMIUM
// ============================================

export const buttonStyles = {
  // Contenedor de acciones
  actionContainer: {
    display: 'flex',
    gap: 3,
    justifyContent: 'flex-end',
    alignItems: 'center',
    mt: 5,
    pt: 4,
    borderTop: `1px solid ${colors.border.light}`,
  },

  // Botón primario
  primary: {
    textTransform: 'none',
    fontWeight: typography.fontWeight.semibold,
    fontSize: typography.fontSize.sm,
    px: 4,
    py: 1.5,
    borderRadius: borderRadius.md,
    transition: transitions.button,
    '&:hover': {
      transform: 'translateY(-1px)',
    },
    '&:active': {
      transform: 'translateY(0)',
    },
  },

  // Botón secundario
  secondary: {
    textTransform: 'none',
    fontWeight: typography.fontWeight.medium,
    fontSize: typography.fontSize.sm,
    px: 3,
    py: 1.25,
    borderRadius: borderRadius.md,
    transition: transitions.button,
  },
};

// Botones con efectos premium
export const enhancedButtonStyles = {
  // Primario con gradiente
  primary: {
    ...buttonStyles.primary,
    background: colors.primary.gradient,
    color: colors.primary.contrastText,
    boxShadow: shadows.primary,
    border: 'none',
    '&:hover': {
      background: colors.primary.gradientHover,
      boxShadow: shadows.primaryHover,
      transform: 'translateY(-2px)',
    },
    '&:active': {
      transform: 'translateY(0)',
    },
    '&.Mui-disabled': {
      background: colors.grey[200],
      boxShadow: 'none',
      color: colors.grey[400],
    },
  },

  // Secundario
  secondary: {
    ...buttonStyles.secondary,
    backgroundColor: 'transparent',
    border: `1.5px solid ${colors.border.default}`,
    color: colors.text.primary,
    '&:hover': {
      backgroundColor: colors.grey[50],
      borderColor: 'rgba(0, 0, 0, 0.15)',
    },
  },

  // Guardar
  save: {
    textTransform: 'none',
    fontWeight: typography.fontWeight.semibold,
    fontSize: typography.fontSize.sm,
    px: 5,
    py: 1.75,
    borderRadius: borderRadius.md,
    background: colors.primary.gradient,
    color: colors.primary.contrastText,
    boxShadow: shadows.primary,
    transition: transitions.button,
    '&:hover': {
      background: colors.primary.gradientHover,
      boxShadow: shadows.primaryHover,
      transform: 'translateY(-2px)',
    },
    '&.Mui-disabled': {
      background: colors.grey[200],
      boxShadow: 'none',
      color: colors.grey[400],
    },
  },

  // Ghost (sin fondo)
  ghost: {
    textTransform: 'none',
    fontWeight: typography.fontWeight.medium,
    fontSize: typography.fontSize.sm,
    px: 2.5,
    py: 1,
    borderRadius: borderRadius.md,
    backgroundColor: 'transparent',
    color: colors.text.secondary,
    transition: transitions.button,
    '&:hover': {
      backgroundColor: colors.grey[100],
      color: colors.text.primary,
    },
  },
};

// ============================================
// ESTILOS PARA CASOS
// ============================================

export const caseStyles = {
  exacta: {
    borderLeft: `3px solid ${colors.cases.exacta.main}`,
    backgroundColor: colors.cases.exacta.bg,
  },
  parcial: {
    borderLeft: `3px solid ${colors.cases.parcial.main}`,
    backgroundColor: colors.cases.parcial.bg,
  },
  nueva: {
    borderLeft: `3px solid ${colors.cases.nueva.main}`,
    backgroundColor: colors.cases.nueva.bg,
  },
  reestructuracion: {
    borderLeft: `3px solid ${colors.cases.reestructuracion.main}`,
    backgroundColor: colors.cases.reestructuracion.bg,
  },
};

// ============================================
// ESTADOS DE COMPAÑÍA
// ============================================

export const companyStateStyles = {
  writing: {},
  
  new: {
    '& .MuiOutlinedInput-root': {
      backgroundColor: colors.warning.bg,
      '& fieldset': {
        borderColor: colors.fieldStates.requiredEmpty.border,
        borderWidth: '1.5px',
      },
    },
  },
  
  selected: {
    '& .MuiOutlinedInput-root': {
      backgroundColor: colors.success.bg,
      '& fieldset': {
        borderColor: colors.fieldStates.completed.border,
        borderWidth: '1.5px',
      },
    },
  },
};

// ============================================
// TABLAS LIMPIAS
// ============================================

export const tableStyles = {
  container: {
    backgroundColor: colors.background.paper,
    borderRadius: borderRadius.lg,
    border: `1px solid ${colors.border.light}`,
    overflow: 'hidden',
  },
  
  header: {
    backgroundColor: colors.grey[50],
    '& .MuiTableCell-head': {
      fontWeight: typography.fontWeight.semibold,
      fontSize: typography.fontSize.xs,
      color: colors.text.secondary,
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
      borderBottom: `1px solid ${colors.border.light}`,
      py: 2,
      px: 2.5,
    },
  },
  
  row: {
    transition: transitions.fast,
    '&:hover': {
      backgroundColor: 'rgba(0, 0, 0, 0.02)',
    },
    '& .MuiTableCell-body': {
      fontSize: typography.fontSize.sm,
      borderBottom: `1px solid ${colors.border.light}`,
      py: 2,
      px: 2.5,
    },
  },
  
  rowSelected: {
    backgroundColor: 'rgba(13, 148, 136, 0.04)',
    '&:hover': {
      backgroundColor: 'rgba(13, 148, 136, 0.08)',
    },
  },
};

// ============================================
// LOADING STATES
// ============================================

export const loadingStyles = {
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.overlay.blur,
    backdropFilter: 'blur(8px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    borderRadius: borderRadius.lg,
  },
  
  inline: {
    display: 'flex',
    alignItems: 'center',
    gap: 2,
    color: colors.text.secondary,
    fontSize: typography.fontSize.sm,
  },
  
  skeleton: {
    borderRadius: borderRadius.md,
    backgroundColor: colors.grey[100],
  },
};

// ============================================
// ANIMACIONES
// ============================================

export const animationStyles = {
  fadeIn: {
    animation: 'fadeIn 200ms ease-out forwards',
    '@keyframes fadeIn': {
      from: { opacity: 0 },
      to: { opacity: 1 },
    },
  },

  slideDown: {
    animation: 'slideDown 250ms ease-out forwards',
    '@keyframes slideDown': {
      from: { opacity: 0, transform: 'translateY(-8px)' },
      to: { opacity: 1, transform: 'translateY(0)' },
    },
  },

  slideUp: {
    animation: 'slideUp 250ms ease-out forwards',
    '@keyframes slideUp': {
      from: { opacity: 0, transform: 'translateY(8px)' },
      to: { opacity: 1, transform: 'translateY(0)' },
    },
  },

  scaleIn: {
    animation: 'scaleIn 200ms ease-out forwards',
    '@keyframes scaleIn': {
      from: { opacity: 0, transform: 'scale(0.97)' },
      to: { opacity: 1, transform: 'scale(1)' },
    },
  },
};

// ============================================
// CHIPS Y BADGES
// ============================================

export const chipStyles = {
  base: {
    fontWeight: typography.fontWeight.medium,
    fontSize: typography.fontSize.xs,
    borderRadius: borderRadius.sm,
    transition: transitions.fast,
  },
  
  status: {
    pendiente: {
      backgroundColor: colors.warning.bg,
      color: '#92400e',
      border: '1px solid rgba(245, 158, 11, 0.2)',
    },
    en_proceso: {
      backgroundColor: colors.info.bg,
      color: '#075985',
      border: '1px solid rgba(14, 165, 233, 0.2)',
    },
    completado: {
      backgroundColor: colors.success.bg,
      color: '#065f46',
      border: '1px solid rgba(16, 185, 129, 0.2)',
    },
    error: {
      backgroundColor: colors.error.bg,
      color: '#991b1b',
      border: '1px solid rgba(239, 68, 68, 0.2)',
    },
  },
  
  mode: {
    exacta: {
      background: colors.cases.exacta.gradient,
      color: '#fff',
    },
    parcial: {
      background: colors.cases.parcial.gradient,
      color: '#fff',
    },
    nueva: {
      background: colors.cases.nueva.gradient,
      color: '#fff',
    },
    reestructuracion: {
      background: colors.cases.reestructuracion.gradient,
      color: '#fff',
    },
  },
};

// ============================================
// CARDS
// ============================================

export const cardStyles = {
  base: {
    backgroundColor: colors.background.paper,
    borderRadius: borderRadius.lg,
    border: `1px solid ${colors.border.light}`,
    transition: transitions.slow,
    overflow: 'hidden',
  },
  
  interactive: {
    cursor: 'pointer',
    '&:hover': {
      borderColor: 'rgba(0, 0, 0, 0.12)',
      boxShadow: shadows.cardHover,
      transform: 'translateY(-2px)',
    },
  },
  
  elevated: {
    boxShadow: shadows.md,
    border: 'none',
  },
};

// ============================================
// INPUTS ESPECIALES
// ============================================

export const specialInputStyles = {
  // Search
  search: {
    '& .MuiOutlinedInput-root': {
      borderRadius: borderRadius.full,
      backgroundColor: colors.grey[50],
      '& fieldset': {
        borderColor: 'transparent',
      },
      '&:hover': {
        backgroundColor: colors.grey[100],
        '& fieldset': {
          borderColor: 'transparent',
        },
      },
      '&.Mui-focused': {
        backgroundColor: '#fff',
        '& fieldset': {
          borderColor: colors.primary.main,
          borderWidth: '1.5px',
        },
      },
    },
  },
  
  // Autocomplete
  autocomplete: {
    '& .MuiAutocomplete-paper': {
      borderRadius: borderRadius.lg,
      boxShadow: shadows.floating,
      border: `1px solid ${colors.border.light}`,
      mt: 1,
    },
    '& .MuiAutocomplete-listbox': {
      padding: '8px',
    },
    '& .MuiAutocomplete-option': {
      borderRadius: borderRadius.sm,
      mx: '4px',
      '&:hover': {
        backgroundColor: colors.grey[100],
      },
      '&[aria-selected="true"]': {
        backgroundColor: 'rgba(13, 148, 136, 0.08)',
      },
    },
  },
};

export default {
  pageContainer,
  formContainer,
  sectionStyles,
  rowStyles,
  fieldStyles,
  fieldWidths,
  statusStyles,
  buttonStyles,
  enhancedButtonStyles,
  caseStyles,
  companyStateStyles,
  tableStyles,
  loadingStyles,
  animationStyles,
  chipStyles,
  cardStyles,
  specialInputStyles,
};
