/**
 * Animaciones centralizadas - Keyframes reutilizables
 *
 * Uso en sx props:
 * sx={{ animation: `${animations.fadeIn.name} 200ms ease-out`, ...animations.fadeIn.keyframes }}
 *
 * O importar los keyframes directamente para styled-components
 */

// Animaciones base definidas una sola vez
export const animations = {
  // Fade animations
  fadeIn: {
    name: 'fadeIn',
    keyframes: {
      '@keyframes fadeIn': {
        from: { opacity: 0 },
        to: { opacity: 1 },
      },
    },
  },

  fadeOut: {
    name: 'fadeOut',
    keyframes: {
      '@keyframes fadeOut': {
        from: { opacity: 1 },
        to: { opacity: 0 },
      },
    },
  },

  // Slide animations
  slideUp: {
    name: 'slideUp',
    keyframes: {
      '@keyframes slideUp': {
        from: { opacity: 0, transform: 'translateY(12px)' },
        to: { opacity: 1, transform: 'translateY(0)' },
      },
    },
  },

  slideDown: {
    name: 'slideDown',
    keyframes: {
      '@keyframes slideDown': {
        from: { opacity: 0, transform: 'translateY(-12px)' },
        to: { opacity: 1, transform: 'translateY(0)' },
      },
    },
  },

  slideInRight: {
    name: 'slideInRight',
    keyframes: {
      '@keyframes slideInRight': {
        from: { opacity: 0, transform: 'translateX(20px)' },
        to: { opacity: 1, transform: 'translateX(0)' },
      },
    },
  },

  // Scale animations
  scaleIn: {
    name: 'scaleIn',
    keyframes: {
      '@keyframes scaleIn': {
        from: { opacity: 0, transform: 'scale(0.97)' },
        to: { opacity: 1, transform: 'scale(1)' },
      },
    },
  },

  chipEnter: {
    name: 'chipEnter',
    keyframes: {
      '@keyframes chipEnter': {
        '0%': { opacity: 0, transform: 'scale(0.8)' },
        '100%': { opacity: 1, transform: 'scale(1)' },
      },
    },
  },

  // Rotation
  spin: {
    name: 'spin',
    keyframes: {
      '@keyframes spin': {
        from: { transform: 'rotate(0deg)' },
        to: { transform: 'rotate(360deg)' },
      },
    },
  },

  // Pulse animations
  pulse: {
    name: 'pulse',
    keyframes: {
      '@keyframes pulse': {
        '0%, 100%': { opacity: 1 },
        '50%': { opacity: 0.5 },
      },
    },
  },

  pulseScale: {
    name: 'pulseScale',
    keyframes: {
      '@keyframes pulseScale': {
        '0%': { transform: 'scale(1)' },
        '50%': { transform: 'scale(1.15)' },
        '100%': { transform: 'scale(1)' },
      },
    },
  },

  // Border pulse (for drop zones)
  borderPulse: {
    name: 'borderPulse',
    keyframes: {
      '@keyframes borderPulse': {
        '0%, 100%': { opacity: 1 },
        '50%': { opacity: 0.5 },
      },
    },
  },
};

// Helper para crear sx con animación
export const withAnimation = (animationKey, duration = '200ms', easing = 'ease-out', delay = '0ms') => {
  const anim = animations[animationKey];
  if (!anim) return {};

  return {
    animation: `${anim.name} ${duration} ${easing} ${delay}`,
    ...anim.keyframes,
  };
};

// Helper para animaciones con índice (staggered)
export const withStaggeredAnimation = (animationKey, index, duration = '200ms', staggerDelay = '30ms') => {
  const anim = animations[animationKey];
  if (!anim) return {};

  return {
    animation: `${anim.name} ${duration} ease-out ${index * parseInt(staggerDelay)}ms both`,
    ...anim.keyframes,
  };
};

// CSS string para inyectar en <style> tags (MissionControl style)
export const globalAnimationsCSS = `
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes slideUp {
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
`;

export default animations;
