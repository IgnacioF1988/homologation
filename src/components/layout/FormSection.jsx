/**
 * FormSection - Sección de formulario con diseño moderno
 * Inspirado en Linear, Vercel, Stripe
 */

import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Fade,
  alpha,
} from '@mui/material';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import { colors, borderRadius, shadows } from '../../styles/theme';
import { animations } from '../../styles/animations';

const FormSection = ({
  title,
  subtitle,
  children,
  collapsible = false,
  defaultExpanded = true,
  caseType = null,
  icon = null,
  action = null,
  animate = true,
  animationType = 'fadeIn',
  sx = {},
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [isVisible, setIsVisible] = useState(!animate);

  useEffect(() => {
    if (animate) {
      const timer = setTimeout(() => {
        setIsVisible(true);
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [animate]);

  // Estilos por tipo de caso
  const getCaseStyles = () => {
    if (!caseType) return {};
    
    const caseColors = {
      exacta: colors.success,
      parcial: colors.warning,
      nueva: colors.primary,
      reestructuracion: colors.secondary,
    };
    
    const caseColor = caseColors[caseType];
    if (!caseColor) return {};

    return {
      borderLeft: `4px solid ${caseColor.main}`,
      '&::before': {
        content: '""',
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        background: `linear-gradient(135deg, ${alpha(caseColor.main, 0.03)} 0%, transparent 50%)`,
        pointerEvents: 'none',
        borderRadius: 'inherit',
      },
    };
  };

  // Estilos de animación (usando animaciones centralizadas)
  const getAnimationStyles = (type) => {
    const anim = animations[type];
    if (!anim) return {};
    const duration = type === 'fadeIn' || type === 'scaleIn' ? '250ms' : '300ms';
    return {
      animation: `${anim.name} ${duration} ease-out forwards`,
      ...anim.keyframes,
    };
  };

  // Estilos base de la sección
  const baseSectionStyles = {
    position: 'relative',
    mb: 3,
    p: { xs: 2.5, sm: 3 },
    backgroundColor: colors.background.paper,
    borderRadius: borderRadius.lg,
    border: `1px solid ${colors.border.light}`,
    transition: 'all 200ms ease',
    '&:hover': {
      borderColor: colors.border.default,
      boxShadow: shadows.sm,
    },
    ...getCaseStyles(),
  };

  // Header de la sección
  const SectionHeader = () => (
    <Box 
      sx={{ 
        display: 'flex', 
        alignItems: 'flex-start', 
        justifyContent: 'space-between',
        mb: children ? 3 : 0,
        pb: children ? 2.5 : 0,
        borderBottom: children ? `1px solid ${colors.border.light}` : 'none',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
        {icon && (
          <Box
            sx={{
              mt: 0.25,
              color: caseType 
                ? {
                    exacta: colors.success.main,
                    parcial: colors.warning.main,
                    nueva: colors.primary.main,
                    reestructuracion: colors.secondary.main,
                  }[caseType] 
                : colors.primary.main,
            }}
          >
            {icon}
          </Box>
        )}
        <Box>
          <Typography
            variant="h6"
            sx={{
              fontWeight: 600,
              fontSize: '1rem',
              color: colors.text.primary,
              letterSpacing: '-0.01em',
              lineHeight: 1.4,
            }}
          >
            {title}
          </Typography>
          {subtitle && (
            <Typography
              variant="body2"
              sx={{
                color: colors.text.secondary,
                fontSize: '0.8125rem',
                mt: 0.25,
              }}
            >
              {subtitle}
            </Typography>
          )}
        </Box>
      </Box>
      {action && (
        <Box onClick={(e) => e.stopPropagation()}>
          {action}
        </Box>
      )}
    </Box>
  );

  // Contenido de la sección
  const sectionContent = collapsible ? (
    <Accordion
      expanded={expanded}
      onChange={() => setExpanded(!expanded)}
      sx={{
        ...baseSectionStyles,
        boxShadow: 'none',
        '&:before': { display: 'none' },
        '&.Mui-expanded': {
          margin: 0,
          mb: 3,
        },
        ...sx,
      }}
      disableGutters
      TransitionProps={{ timeout: 250 }}
    >
      <AccordionSummary
        expandIcon={
          <ExpandMoreRoundedIcon 
            sx={{ 
              color: colors.text.secondary,
              transition: 'transform 250ms ease',
            }} 
          />
        }
        sx={{
          p: 0,
          minHeight: 'auto',
          '& .MuiAccordionSummary-content': {
            m: 0,
            mr: 1,
          },
          '&:hover': {
            backgroundColor: 'transparent',
          },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flex: 1 }}>
          {icon && (
            <Box sx={{ color: colors.primary.main }}>
              {icon}
            </Box>
          )}
          <Box sx={{ flex: 1 }}>
            <Typography
              sx={{
                fontWeight: 600,
                fontSize: '1rem',
                color: colors.text.primary,
              }}
            >
              {title}
            </Typography>
            {subtitle && (
              <Typography
                variant="body2"
                sx={{
                  color: colors.text.secondary,
                  fontSize: '0.8125rem',
                }}
              >
                {subtitle}
              </Typography>
            )}
          </Box>
        </Box>
        {action && (
          <Box onClick={(e) => e.stopPropagation()} sx={{ mr: 2 }}>
            {action}
          </Box>
        )}
      </AccordionSummary>
      <AccordionDetails 
        sx={{ 
          p: 0, 
          pt: 2.5,
          borderTop: `1px solid ${colors.border.light}`,
          mt: 2,
        }}
      >
        {children}
      </AccordionDetails>
    </Accordion>
  ) : (
    <Box sx={{ ...baseSectionStyles, ...sx }}>
      {title && <SectionHeader />}
      {children}
    </Box>
  );

  if (!animate) {
    return sectionContent;
  }

  return (
    <Fade in={isVisible} timeout={250}>
      <Box sx={getAnimationStyles(animationType)}>
        {sectionContent}
      </Box>
    </Fade>
  );
};

export default FormSection;
