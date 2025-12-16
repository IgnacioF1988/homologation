/**
 * MUI Theme - Tema Material-UI usando tokens de theme.js
 * Este archivo genera el tema MUI reutilizando la paleta centralizada
 */

import { createTheme } from '@mui/material';
import { colors, typography, shadows, borderRadius } from './theme';

// Construir paleta MUI desde tokens
const palette = {
  primary: {
    main: colors.primary.main,
    light: colors.primary.light,
    dark: colors.primary.dark,
    50: colors.primary[50],
    100: colors.primary[100],
    200: colors.primary[200],
    300: colors.primary[300],
    400: colors.primary[400],
    500: colors.primary[500],
    600: colors.primary[600],
    700: colors.primary[700],
    contrastText: colors.primary.contrastText,
  },
  secondary: {
    main: colors.secondary.main,
    light: colors.secondary.light,
    dark: colors.secondary.dark,
    contrastText: colors.secondary.contrastText,
  },
  success: {
    main: colors.success.main,
    light: colors.success.light,
    dark: colors.success.dark,
    contrastText: colors.success.contrastText,
  },
  warning: {
    main: colors.warning.main,
    light: colors.warning.light,
    dark: colors.warning.dark,
    contrastText: colors.warning.contrastText,
  },
  error: {
    main: colors.error.main,
    light: colors.error.light,
    dark: colors.error.dark,
    contrastText: colors.error.contrastText,
  },
  info: {
    main: colors.info.main,
    light: colors.info.light,
    dark: colors.info.dark,
    contrastText: colors.info.contrastText,
  },
  background: {
    default: colors.background.default,
    paper: colors.background.paper,
  },
  text: {
    primary: colors.text.primary,
    secondary: colors.text.secondary,
    disabled: colors.text.disabled,
  },
  divider: colors.border.default,
  grey: colors.grey,
};

// Sombras MUI (array de 25 elementos)
const muiShadows = [
  'none',
  shadows.xs,
  shadows.sm,
  shadows.md,
  shadows.md,
  shadows.lg,
  shadows.lg,
  ...Array(18).fill(shadows.xl),
];

// Crear tema MUI
const muiTheme = createTheme({
  palette,

  typography: {
    fontFamily: typography.fontFamily,
    h1: { ...typography.h1, color: palette.text.primary },
    h2: { ...typography.h2, color: palette.text.primary },
    h3: { ...typography.h3, color: palette.text.primary },
    h4: { ...typography.h4, color: palette.text.primary },
    h5: { ...typography.h5, color: palette.text.primary },
    h6: { ...typography.h6, color: palette.text.primary },
    subtitle1: { fontWeight: 500, fontSize: '1rem', lineHeight: 1.5, color: palette.text.secondary },
    subtitle2: { fontWeight: 500, fontSize: '0.875rem', lineHeight: 1.5, color: palette.text.secondary },
    body1: typography.body1,
    body2: { ...typography.body2, color: palette.text.secondary },
    button: { fontWeight: 500, fontSize: '0.875rem', letterSpacing: '0.01em', textTransform: 'none' },
    caption: typography.caption,
    overline: { ...typography.overline, color: palette.text.secondary },
  },

  shape: { borderRadius: 12 },
  shadows: muiShadows,

  components: {
    MuiCssBaseline: {
      styleOverrides: {
        '*': { boxSizing: 'border-box' },
        html: { WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale', overflowY: 'scroll' },
        body: {
          backgroundColor: palette.background.default,
          color: palette.text.primary,
          overflowX: 'hidden',
          scrollbarWidth: 'thin',
          scrollbarColor: `${colors.grey[300]} transparent`,
          '&::-webkit-scrollbar': { width: '10px', height: '10px' },
          '&::-webkit-scrollbar-track': { background: 'transparent' },
          '&::-webkit-scrollbar-thumb': {
            background: colors.grey[300],
            borderRadius: '100px',
            border: '3px solid transparent',
            backgroundClip: 'content-box',
            '&:hover': { background: colors.grey[400], backgroundClip: 'content-box' },
          },
        },
        ':focus-visible': { outline: 'none', boxShadow: `0 0 0 3px ${colors.fieldStates.focused.ring}` },
        '::selection': { backgroundColor: `rgba(13, 148, 136, 0.15)`, color: palette.text.primary },
      },
    },

    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: { backgroundImage: 'none', transition: 'box-shadow 200ms ease, border-color 200ms ease' },
        rounded: { borderRadius: borderRadius.lg },
        elevation0: { border: `1px solid ${palette.divider}` },
        elevation1: { boxShadow: shadows.sm, border: `1px solid ${palette.divider}` },
        elevation2: { boxShadow: shadows.md },
      },
    },

    MuiTextField: { defaultProps: { size: 'small', variant: 'outlined' } },

    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          backgroundColor: colors.background.paper,
          fontSize: '0.9375rem',
          transition: 'all 200ms cubic-bezier(0.16, 1, 0.3, 1)',
          '& fieldset': { borderColor: colors.border.default, borderWidth: '1px', transition: 'border-color 200ms ease, box-shadow 200ms ease' },
          '&:hover:not(.Mui-disabled):not(.Mui-error) fieldset': { borderColor: colors.border.dark },
          '&.Mui-focused': { '& fieldset': { borderColor: palette.primary.main, borderWidth: '1.5px', boxShadow: `0 0 0 3px ${colors.fieldStates.focused.ring}` } },
          '&.Mui-error fieldset': { borderColor: palette.error.main },
          '&.Mui-disabled': { backgroundColor: colors.grey[50], '& fieldset': { borderColor: 'transparent' } },
        },
        input: { padding: '14px 16px', fontSize: '0.9375rem', fontWeight: 400, '&::placeholder': { color: colors.grey[400], opacity: 1 } },
        notchedOutline: { borderColor: colors.border.default },
        multiline: { padding: 0 },
      },
    },

    MuiInputLabel: {
      styleOverrides: {
        root: {
          fontSize: '0.875rem', fontWeight: 500, color: palette.text.secondary,
          transform: 'translate(16px, 14px) scale(1)',
          '&.Mui-focused': { color: palette.primary.main },
          '&.Mui-error': { color: palette.error.main },
        },
        shrink: { transform: 'translate(14px, -9px) scale(0.85)', backgroundColor: colors.background.paper, padding: '0 6px', marginLeft: '-4px' },
      },
    },

    MuiSelect: {
      styleOverrides: {
        select: { padding: '14px 16px' },
        icon: { color: colors.grey[400], right: 12, transition: 'transform 200ms ease' },
      },
    },

    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          textTransform: 'none', fontWeight: 500, fontSize: '0.875rem', borderRadius: 10, padding: '10px 20px',
          transition: 'all 150ms cubic-bezier(0.16, 1, 0.3, 1)',
          '&:active': { transform: 'scale(0.98)' },
        },
        contained: { boxShadow: 'none', '&:hover': { boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)', transform: 'translateY(-1px)' } },
        containedPrimary: { background: colors.primary.gradient, '&:hover': { background: colors.primary.gradientHover } },
        outlined: { borderWidth: '1.5px', borderColor: colors.border.dark, backgroundColor: 'transparent', '&:hover': { borderWidth: '1.5px', backgroundColor: colors.grey[50], borderColor: 'rgba(0, 0, 0, 0.2)' } },
        outlinedPrimary: { borderColor: colors.primary[300], color: palette.primary.main, '&:hover': { borderColor: palette.primary.main, backgroundColor: colors.primary.gradientSubtle } },
        text: { '&:hover': { backgroundColor: colors.grey[100] } },
        sizeSmall: { padding: '6px 14px', fontSize: '0.8125rem' },
        sizeLarge: { padding: '14px 28px', fontSize: '0.9375rem', borderRadius: 12 },
      },
    },

    MuiIconButton: {
      styleOverrides: {
        root: { borderRadius: 10, transition: 'all 150ms ease', color: palette.text.secondary, '&:hover': { backgroundColor: colors.grey[100], color: palette.text.primary } },
        colorPrimary: { color: palette.primary.main, '&:hover': { backgroundColor: colors.primary.gradientSubtle } },
      },
    },

    MuiChip: {
      styleOverrides: {
        root: { borderRadius: 8, fontWeight: 500, fontSize: '0.75rem', height: 'auto', padding: '5px 0', transition: 'all 150ms ease' },
        filled: {
          '&.MuiChip-colorPrimary': { background: colors.primary.gradient },
          '&.MuiChip-colorSuccess': { background: colors.success.main },
          '&.MuiChip-colorWarning': { background: colors.warning.main, color: colors.text.inverse },
          '&.MuiChip-colorError': { background: colors.error.main },
          '&.MuiChip-colorInfo': { background: colors.info.main },
        },
        outlined: { borderWidth: '1.5px', backgroundColor: 'transparent' },
        label: { padding: '0 12px' },
        labelSmall: { padding: '0 10px' },
      },
    },

    MuiAccordion: {
      defaultProps: { disableGutters: true, elevation: 0 },
      styleOverrides: {
        root: { borderRadius: `${borderRadius.lg} !important`, border: `1px solid ${palette.divider}`, backgroundColor: colors.background.paper, '&:before': { display: 'none' }, '&.Mui-expanded': { margin: 0 } },
      },
    },

    MuiAccordionSummary: {
      styleOverrides: {
        root: { borderRadius: borderRadius.lg, minHeight: 56, padding: '0 20px', transition: 'background-color 150ms ease', '&:hover': { backgroundColor: colors.grey[50] }, '&.Mui-expanded': { minHeight: 56 } },
        content: { margin: '16px 0', '&.Mui-expanded': { margin: '16px 0' } },
        expandIconWrapper: { color: palette.primary.main },
      },
    },

    MuiAccordionDetails: { styleOverrides: { root: { padding: '0 20px 20px' } } },

    MuiAlert: {
      styleOverrides: {
        root: { borderRadius: borderRadius.md, fontSize: '0.875rem', fontWeight: 500, padding: '12px 16px', alignItems: 'center' },
        standard: { border: '1px solid' },
        standardSuccess: { backgroundColor: colors.success.bg, borderColor: colors.success[200], color: colors.success[800], '& .MuiAlert-icon': { color: colors.success.main } },
        standardWarning: { backgroundColor: colors.warning.bg, borderColor: colors.warning[200], color: colors.warning[800], '& .MuiAlert-icon': { color: colors.warning.main } },
        standardError: { backgroundColor: colors.error.bg, borderColor: colors.error[200], color: colors.error[800], '& .MuiAlert-icon': { color: colors.error.main } },
        standardInfo: { backgroundColor: colors.info.bg, borderColor: colors.info[200], color: colors.info[800], '& .MuiAlert-icon': { color: colors.info.main } },
        icon: { marginRight: 12, padding: 0, opacity: 1 },
      },
    },

    MuiTabs: {
      styleOverrides: {
        root: { minHeight: 52 },
        indicator: { height: 3, borderRadius: '3px 3px 0 0', background: colors.primary.gradient },
        flexContainer: { gap: 4 },
      },
    },

    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none', fontWeight: 500, fontSize: '0.9375rem', minHeight: 52, padding: '14px 24px',
          borderRadius: '12px 12px 0 0', transition: 'all 150ms ease', color: palette.text.secondary,
          '&.Mui-selected': { color: palette.primary.main, fontWeight: 600 },
          '&:hover': { backgroundColor: colors.grey[50], color: palette.text.primary },
        },
      },
    },

    MuiTableContainer: { styleOverrides: { root: { borderRadius: 0, boxShadow: 'none' } } },
    MuiTableHead: { styleOverrides: { root: { backgroundColor: colors.grey[50] } } },
    MuiTableCell: {
      styleOverrides: {
        head: { fontWeight: 600, fontSize: '0.75rem', color: palette.text.secondary, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: `1px solid ${palette.divider}`, padding: '16px 20px', backgroundColor: colors.grey[50] },
        body: { fontSize: '0.875rem', borderBottom: `1px solid ${palette.divider}`, padding: '16px 20px' },
      },
    },
    MuiTableRow: { styleOverrides: { root: { transition: 'background-color 120ms ease', '&:hover': { backgroundColor: 'rgba(0, 0, 0, 0.02)' }, '&:last-child td': { borderBottom: 'none' } } } },

    MuiTooltip: {
      styleOverrides: {
        tooltip: { backgroundColor: colors.grey[800], borderRadius: 8, fontSize: '0.8125rem', fontWeight: 500, padding: '8px 14px', boxShadow: shadows.floating },
        arrow: { color: colors.grey[800] },
      },
    },

    MuiMenu: {
      styleOverrides: {
        paper: { borderRadius: borderRadius.md, boxShadow: shadows.floating, border: `1px solid ${palette.divider}`, marginTop: 8 },
        list: { padding: 8 },
      },
    },

    MuiMenuItem: {
      styleOverrides: {
        root: {
          borderRadius: 8, margin: '2px 0', padding: '10px 14px', fontSize: '0.875rem', fontWeight: 450, transition: 'background-color 100ms ease',
          '&:hover': { backgroundColor: colors.grey[100] },
          '&.Mui-selected': { backgroundColor: colors.primary.gradientSubtle, fontWeight: 500, '&:hover': { backgroundColor: 'rgba(13, 148, 136, 0.12)' } },
        },
      },
    },

    MuiAutocomplete: {
      styleOverrides: {
        paper: { borderRadius: borderRadius.md, boxShadow: shadows.floating, border: `1px solid ${palette.divider}`, marginTop: 8 },
        listbox: { padding: 8 },
        option: { borderRadius: 8, margin: '2px 4px', padding: '10px 14px', '&:hover': { backgroundColor: colors.grey[100] }, '&[aria-selected="true"]': { backgroundColor: `${colors.primary.gradientSubtle} !important` } },
      },
    },

    MuiDialog: { styleOverrides: { paper: { borderRadius: borderRadius.xl, boxShadow: shadows['2xl'] } } },
    MuiDialogTitle: { styleOverrides: { root: { fontWeight: 600, fontSize: '1.25rem', padding: '28px 28px 20px' } } },
    MuiDialogContent: { styleOverrides: { root: { padding: '8px 28px 24px' } } },
    MuiDialogActions: { styleOverrides: { root: { padding: '16px 28px 28px', gap: 12 } } },

    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          borderRadius: borderRadius.lg, border: `1px solid ${palette.divider}`,
          transition: 'box-shadow 200ms ease, border-color 200ms ease, transform 200ms ease',
          '&:hover': { borderColor: colors.border.dark, boxShadow: shadows.cardHover },
        },
      },
    },

    MuiDivider: { styleOverrides: { root: { borderColor: palette.divider } } },

    MuiLinearProgress: {
      styleOverrides: {
        root: { borderRadius: 6, height: 6, backgroundColor: colors.grey[100] },
        bar: { borderRadius: 6, background: colors.primary.gradient },
      },
    },

    MuiCircularProgress: { styleOverrides: { root: { color: palette.primary.main } } },

    MuiSwitch: {
      styleOverrides: {
        root: { padding: 8 },
        track: { borderRadius: 14, backgroundColor: colors.grey[300], opacity: 1 },
        thumb: { boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)' },
        switchBase: { '&.Mui-checked': { '& + .MuiSwitch-track': { backgroundColor: palette.primary.main, opacity: 1 } } },
      },
    },

    MuiCheckbox: {
      styleOverrides: {
        root: { borderRadius: 6, padding: 8, color: colors.grey[400], '&.Mui-checked': { color: palette.primary.main }, '&:hover': { backgroundColor: colors.primary.gradientSubtle } },
      },
    },

    MuiRadio: {
      styleOverrides: {
        root: { padding: 8, color: colors.grey[400], '&.Mui-checked': { color: palette.primary.main }, '&:hover': { backgroundColor: colors.primary.gradientSubtle } },
      },
    },

    MuiFormLabel: { styleOverrides: { root: { fontSize: '0.875rem', fontWeight: 500, color: palette.text.secondary, '&.Mui-focused': { color: palette.primary.main } } } },
    MuiFormControlLabel: { styleOverrides: { label: { fontSize: '0.875rem' } } },
    MuiFormHelperText: { styleOverrides: { root: { fontSize: '0.75rem', marginTop: 6, marginLeft: 2 } } },

    MuiSkeleton: {
      styleOverrides: {
        root: { backgroundColor: colors.grey[100], borderRadius: 8 },
        wave: { '&::after': { background: `linear-gradient(90deg, transparent, ${colors.grey[50]}, transparent)` } },
      },
    },

    MuiBadge: { styleOverrides: { badge: { fontWeight: 600, fontSize: '0.65rem' } } },
    MuiSnackbar: { styleOverrides: { root: { '& .MuiPaper-root': { borderRadius: borderRadius.md } } } },
    MuiBackdrop: { styleOverrides: { root: { backgroundColor: colors.overlay.dark, backdropFilter: 'blur(8px)' } } },

    MuiFab: {
      styleOverrides: {
        root: { boxShadow: shadows.primary, '&:hover': { boxShadow: shadows.primaryHover } },
        primary: { background: colors.primary.gradient, '&:hover': { background: colors.primary.gradientHover } },
      },
    },

    MuiPopper: { styleOverrides: { root: { zIndex: 1500 } } },
  },
});

export default muiTheme;
