/**
 * Theme - Sistema de diseño premium
 * 
 * Paleta: Ocean Blue + Slate grays
 * Inspiración: Linear, Raycast, Arc Browser
 * Estética: Clean, spacious, world-class
 */

// ============================================
// PALETA DE COLORES - MODERNA Y FRESCA
// ============================================

export const colors = {
  // Color primario - Ocean/Teal - Fresco y profesional
  primary: {
    50: '#f0fdfa',
    100: '#ccfbf1',
    200: '#99f6e4',
    300: '#5eead4',
    400: '#2dd4bf',
    500: '#14b8a6',
    600: '#0d9488',
    700: '#0f766e',
    800: '#115e59',
    900: '#134e4a',
    main: '#0d9488',
    light: '#2dd4bf',
    dark: '#0f766e',
    contrastText: '#ffffff',
    // Gradientes premium
    gradient: 'linear-gradient(135deg, #0d9488 0%, #2dd4bf 100%)',
    gradientHover: 'linear-gradient(135deg, #0f766e 0%, #14b8a6 100%)',
    gradientSubtle: 'linear-gradient(135deg, rgba(13, 148, 136, 0.08) 0%, rgba(45, 212, 191, 0.04) 100%)',
  },

  // Secundario - Indigo profundo
  secondary: {
    50: '#eef2ff',
    100: '#e0e7ff',
    200: '#c7d2fe',
    300: '#a5b4fc',
    400: '#818cf8',
    500: '#6366f1',
    600: '#4f46e5',
    700: '#4338ca',
    800: '#3730a3',
    900: '#312e81',
    main: '#6366f1',
    light: '#818cf8',
    dark: '#4f46e5',
    contrastText: '#ffffff',
  },

  // Éxito - Esmeralda vibrante
  success: {
    50: '#ecfdf5',
    100: '#d1fae5',
    200: '#a7f3d0',
    300: '#6ee7b7',
    400: '#34d399',
    500: '#10b981',
    600: '#059669',
    700: '#047857',
    800: '#065f46',
    900: '#064e3b',
    main: '#10b981',
    light: '#34d399',
    dark: '#059669',
    bg: 'rgba(16, 185, 129, 0.06)',
    bgHover: 'rgba(16, 185, 129, 0.10)',
    contrastText: '#ffffff',
  },

  // Advertencia - Ámbar cálido
  warning: {
    50: '#fffbeb',
    100: '#fef3c7',
    200: '#fde68a',
    300: '#fcd34d',
    400: '#fbbf24',
    500: '#f59e0b',
    600: '#d97706',
    700: '#b45309',
    800: '#92400e',
    900: '#78350f',
    main: '#f59e0b',
    light: '#fbbf24',
    dark: '#d97706',
    bg: 'rgba(245, 158, 11, 0.06)',
    bgHover: 'rgba(245, 158, 11, 0.10)',
    contrastText: '#000000',
  },

  // Error - Rosa/Rojo elegante
  error: {
    50: '#fef2f2',
    100: '#fee2e2',
    200: '#fecaca',
    300: '#fca5a5',
    400: '#f87171',
    500: '#ef4444',
    600: '#dc2626',
    700: '#b91c1c',
    800: '#991b1b',
    900: '#7f1d1d',
    main: '#ef4444',
    light: '#f87171',
    dark: '#dc2626',
    bg: 'rgba(239, 68, 68, 0.06)',
    bgHover: 'rgba(239, 68, 68, 0.10)',
    contrastText: '#ffffff',
  },

  // Info - Sky blue
  info: {
    50: '#f0f9ff',
    100: '#e0f2fe',
    200: '#bae6fd',
    300: '#7dd3fc',
    400: '#38bdf8',
    500: '#0ea5e9',
    600: '#0284c7',
    700: '#0369a1',
    800: '#075985',
    900: '#0c4a6e',
    main: '#0ea5e9',
    light: '#38bdf8',
    dark: '#0284c7',
    bg: 'rgba(14, 165, 233, 0.06)',
    bgHover: 'rgba(14, 165, 233, 0.10)',
    contrastText: '#ffffff',
  },

  // Estados de campos - Súper sutiles
  fieldStates: {
    requiredEmpty: {
      border: 'rgba(245, 158, 11, 0.5)',
      bg: 'rgba(245, 158, 11, 0.03)',
      bgHover: 'rgba(245, 158, 11, 0.06)',
    },
    completed: {
      border: 'rgba(16, 185, 129, 0.5)',
      bg: 'rgba(16, 185, 129, 0.03)',
      bgHover: 'rgba(16, 185, 129, 0.06)',
    },
    error: {
      border: 'rgba(239, 68, 68, 0.6)',
      bg: 'rgba(239, 68, 68, 0.03)',
      bgHover: 'rgba(239, 68, 68, 0.06)',
    },
    readonly: {
      border: 'transparent',
      bg: 'rgba(100, 116, 139, 0.04)',
      bgHover: 'rgba(100, 116, 139, 0.06)',
    },
    inherited: {
      border: 'rgba(99, 102, 241, 0.4)',
      bg: 'rgba(99, 102, 241, 0.03)',
      bgHover: 'rgba(99, 102, 241, 0.06)',
    },
    focused: {
      border: '#0d9488',
      bg: '#ffffff',
      ring: 'rgba(13, 148, 136, 0.12)',
    },
  },

  // Slate grays - Más cálidos y sofisticados
  grey: {
    25: '#fcfcfd',
    50: '#f9fafb',
    100: '#f3f4f6',
    200: '#e5e7eb',
    300: '#d1d5db',
    400: '#9ca3af',
    500: '#6b7280',
    600: '#4b5563',
    700: '#374151',
    800: '#1f2937',
    900: '#111827',
    950: '#030712',
  },

  // Fondos - Ultra limpios
  background: {
    default: '#f9fafb',
    paper: '#ffffff',
    section: '#ffffff',
    elevated: '#ffffff',
    subtle: '#f3f4f6',
    muted: 'rgba(107, 114, 128, 0.04)',
  },

  // Textos - Alto contraste pero suave
  text: {
    primary: '#111827',
    secondary: '#4b5563',
    tertiary: '#6b7280',
    disabled: '#9ca3af',
    inverse: '#ffffff',
    link: '#0d9488',
    muted: '#9ca3af',
  },

  // Bordes - Hairline y sutiles
  border: {
    light: 'rgba(0, 0, 0, 0.04)',
    default: 'rgba(0, 0, 0, 0.08)',
    dark: 'rgba(0, 0, 0, 0.12)',
    focus: '#0d9488',
  },

  // Casos del formulario
  cases: {
    exacta: {
      main: '#10b981',
      gradient: 'linear-gradient(135deg, #10b981 0%, #34d399 100%)',
      bg: 'rgba(16, 185, 129, 0.06)',
      border: 'rgba(16, 185, 129, 0.2)',
    },
    parcial: {
      main: '#f59e0b',
      gradient: 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)',
      bg: 'rgba(245, 158, 11, 0.06)',
      border: 'rgba(245, 158, 11, 0.2)',
    },
    nueva: {
      main: '#0d9488',
      gradient: 'linear-gradient(135deg, #0d9488 0%, #2dd4bf 100%)',
      bg: 'rgba(13, 148, 136, 0.06)',
      border: 'rgba(13, 148, 136, 0.2)',
    },
    reestructuracion: {
      main: '#6366f1',
      gradient: 'linear-gradient(135deg, #6366f1 0%, #818cf8 100%)',
      bg: 'rgba(99, 102, 241, 0.06)',
      border: 'rgba(99, 102, 241, 0.2)',
    },
  },

  // Overlays
  overlay: {
    light: 'rgba(255, 255, 255, 0.9)',
    dark: 'rgba(17, 24, 39, 0.6)',
    blur: 'rgba(255, 255, 255, 0.85)',
  },
};

// ============================================
// ESPACIADO - Sistema generoso de 8px
// ============================================

export const spacing = {
  0: 0,
  0.5: '4px',
  1: '8px',
  1.5: '12px',
  2: '16px',
  2.5: '20px',
  3: '24px',
  3.5: '28px',
  4: '32px',
  5: '40px',
  6: '48px',
  7: '56px',
  8: '64px',
  10: '80px',
  12: '96px',
  16: '128px',
};

// ============================================
// BORDER RADIUS - Más generoso
// ============================================

export const borderRadius = {
  none: 0,
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '20px',
  '2xl': '24px',
  '3xl': '32px',
  full: '9999px',
};

// ============================================
// SOMBRAS - Extremadamente sutiles
// ============================================

export const shadows = {
  none: 'none',
  xs: '0 1px 2px rgba(0, 0, 0, 0.02)',
  sm: '0 1px 3px rgba(0, 0, 0, 0.03), 0 1px 2px rgba(0, 0, 0, 0.02)',
  md: '0 4px 8px rgba(0, 0, 0, 0.04), 0 2px 4px rgba(0, 0, 0, 0.02)',
  lg: '0 10px 24px rgba(0, 0, 0, 0.05), 0 4px 8px rgba(0, 0, 0, 0.02)',
  xl: '0 20px 40px rgba(0, 0, 0, 0.06), 0 8px 16px rgba(0, 0, 0, 0.03)',
  '2xl': '0 25px 50px rgba(0, 0, 0, 0.08)',
  // Sombras con color - muy sutiles
  primary: '0 4px 16px rgba(13, 148, 136, 0.15)',
  primaryHover: '0 8px 24px rgba(13, 148, 136, 0.20)',
  success: '0 4px 16px rgba(16, 185, 129, 0.15)',
  error: '0 4px 16px rgba(239, 68, 68, 0.15)',
  // Cards
  card: '0 1px 3px rgba(0, 0, 0, 0.02)',
  cardHover: '0 8px 24px rgba(0, 0, 0, 0.06)',
  // Elevados
  elevated: '0 4px 12px rgba(0, 0, 0, 0.04)',
  floating: '0 12px 40px rgba(0, 0, 0, 0.08)',
};

// ============================================
// TIPOGRAFÍA - Inter con mejor jerarquía
// ============================================

export const typography = {
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  fontFamilyMono: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace",
  
  fontSize: {
    xs: '0.6875rem',  // 11px
    sm: '0.75rem',    // 12px
    base: '0.8125rem',// 13px
    md: '0.875rem',   // 14px
    lg: '0.9375rem',  // 15px
    xl: '1rem',       // 16px
    '2xl': '1.125rem',// 18px
    '3xl': '1.25rem', // 20px
    '4xl': '1.5rem',  // 24px
    '5xl': '1.875rem',// 30px
    '6xl': '2.25rem', // 36px
  },

  fontWeight: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },

  lineHeight: {
    none: 1,
    tight: 1.2,
    snug: 1.35,
    normal: 1.5,
    relaxed: 1.625,
    loose: 1.8,
  },

  letterSpacing: {
    tighter: '-0.04em',
    tight: '-0.02em',
    normal: '0',
    wide: '0.02em',
    wider: '0.04em',
    widest: '0.08em',
  },

  // Estilos predefinidos
  h1: { fontSize: '2.25rem', fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.15 },
  h2: { fontSize: '1.875rem', fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1.2 },
  h3: { fontSize: '1.5rem', fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.25 },
  h4: { fontSize: '1.25rem', fontWeight: 600, letterSpacing: '-0.015em', lineHeight: 1.3 },
  h5: { fontSize: '1.125rem', fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1.35 },
  h6: { fontSize: '1rem', fontWeight: 600, letterSpacing: '0', lineHeight: 1.4 },
  body1: { fontSize: '0.9375rem', fontWeight: 400, lineHeight: 1.6 },
  body2: { fontSize: '0.875rem', fontWeight: 400, lineHeight: 1.55 },
  caption: { fontSize: '0.75rem', fontWeight: 400, lineHeight: 1.4, color: colors.text.secondary },
  label: { fontSize: '0.8125rem', fontWeight: 500, letterSpacing: '0.01em', color: colors.text.secondary },
  overline: { fontSize: '0.6875rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' },
};

// ============================================
// BREAKPOINTS
// ============================================

export const breakpoints = {
  xs: 0,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
};

// ============================================
// TRANSICIONES - Suaves y elegantes
// ============================================

export const transitions = {
  duration: {
    instant: '0ms',
    fast: '120ms',
    normal: '200ms',
    slow: '300ms',
    slower: '400ms',
  },

  easing: {
    linear: 'linear',
    ease: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
    easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
    easeOut: 'cubic-bezier(0, 0, 0.2, 1)',
    easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
    // Premium curves
    spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    smooth: 'cubic-bezier(0.16, 1, 0.3, 1)',
    bounce: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
  },

  // Presets
  default: 'all 200ms cubic-bezier(0.16, 1, 0.3, 1)',
  fast: 'all 120ms cubic-bezier(0.16, 1, 0.3, 1)',
  slow: 'all 300ms cubic-bezier(0.16, 1, 0.3, 1)',
  field: 'border-color 200ms ease, background-color 200ms ease, box-shadow 200ms ease',
  button: 'all 150ms cubic-bezier(0.16, 1, 0.3, 1)',
  transform: 'transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1)',
  opacity: 'opacity 200ms ease',
};

// ============================================
// ANIMACIONES KEYFRAMES
// ============================================

export const keyframes = {
  fadeIn: {
    from: { opacity: 0 },
    to: { opacity: 1 },
  },
  slideDown: {
    from: { opacity: 0, transform: 'translateY(-8px)' },
    to: { opacity: 1, transform: 'translateY(0)' },
  },
  slideUp: {
    from: { opacity: 0, transform: 'translateY(8px)' },
    to: { opacity: 1, transform: 'translateY(0)' },
  },
  scaleIn: {
    from: { opacity: 0, transform: 'scale(0.97)' },
    to: { opacity: 1, transform: 'scale(1)' },
  },
  shimmer: {
    '0%': { backgroundPosition: '-200% 0' },
    '100%': { backgroundPosition: '200% 0' },
  },
  pulse: {
    '0%, 100%': { opacity: 1 },
    '50%': { opacity: 0.6 },
  },
  spin: {
    from: { transform: 'rotate(0deg)' },
    to: { transform: 'rotate(360deg)' },
  },
};

// ============================================
// Z-INDEX
// ============================================

export const zIndex = {
  hide: -1,
  auto: 'auto',
  base: 0,
  docked: 10,
  dropdown: 1000,
  sticky: 1100,
  banner: 1200,
  overlay: 1300,
  modal: 1400,
  popover: 1500,
  toast: 1700,
  tooltip: 1800,
};

// ============================================
// EFECTOS ESPECIALES
// ============================================

export const effects = {
  // Glassmorphism sutil
  glass: {
    background: 'rgba(255, 255, 255, 0.85)',
    backdropFilter: 'blur(16px) saturate(180%)',
    WebkitBackdropFilter: 'blur(16px) saturate(180%)',
  },
  // Hover elevado
  hoverLift: {
    transition: 'transform 200ms ease, box-shadow 200ms ease',
    '&:hover': {
      transform: 'translateY(-2px)',
      boxShadow: shadows.cardHover,
    },
  },
  // Focus ring premium
  focusRing: {
    '&:focus-visible': {
      outline: 'none',
      boxShadow: `0 0 0 3px ${colors.fieldStates.focused.ring}`,
    },
  },
};

export default {
  colors,
  spacing,
  borderRadius,
  shadows,
  typography,
  breakpoints,
  transitions,
  keyframes,
  zIndex,
  effects,
};
