/**
 * Animation Keyframes - Pipeline ETL
 * Animaciones reutilizables para componentes del pipeline
 * Extraído de PipelineExecution.jsx
 */

import { keyframes } from '@mui/material';

/**
 * Shimmer - Animación de brillo para estados activos
 * Uso: animation: `${shimmer} 2s infinite`
 */
export const shimmer = keyframes`
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
`;

/**
 * Flow Right - Animación de flujo para conectores
 * Uso: animation: `${flowRight} 2s ease-in-out infinite`
 */
export const flowRight = keyframes`
  0% { left: -30%; opacity: 0; }
  20% { opacity: 1; }
  80% { opacity: 1; }
  100% { left: 100%; opacity: 0; }
`;

/**
 * Blink - Animación de parpadeo para indicadores LIVE
 * Uso: animation: `${blink} 1.5s ease-in-out infinite`
 */
export const blink = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
`;

/**
 * Ripple - Animación de onda para efectos hover
 * Uso: animation: `${ripple} 0.6s ease-out`
 */
export const ripple = keyframes`
  0% { transform: scale(1); opacity: 0.5; }
  100% { transform: scale(2.5); opacity: 0; }
`;

/**
 * Pulse - Animación de pulso suave
 * Uso: animation: `${pulse} 2s cubic-bezier(0.4, 0, 0.6, 1) infinite`
 */
export const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
`;

/**
 * Slide In - Animación de entrada desde arriba
 * Uso: animation: `${slideIn} 0.3s ease-out`
 */
export const slideIn = keyframes`
  from {
    opacity: 0;
    transform: translateY(-20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
`;

/**
 * Fade In - Animación de aparición suave
 * Uso: animation: `${fadeIn} 0.5s ease-in`
 */
export const fadeIn = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`;
