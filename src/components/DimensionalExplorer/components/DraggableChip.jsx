/**
 * DraggableChip - Chip arrastrable para filtros dimensionales
 *
 * Usa @dnd-kit/core para el drag and drop
 * Con estados visuales: normal, hover, dragging, selected
 */

import React, { memo } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { Box, Typography, Tooltip, alpha } from '@mui/material';
import { colors, borderRadius, shadows, transitions } from '../../../styles/theme';

const DraggableChip = memo(({
  id,
  dimension,
  value,
  label,
  description,
  color = colors.primary.main,
  isActive = false,
  onClick,
  disabled = false,
}) => {
  // Setup drag
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useDraggable({
    id: `${dimension}-${value}`,
    data: {
      dimension,
      value,
      label,
      description,
    },
    disabled,
  });

  // Estilos de transformación durante drag
  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined;

  // Handler de click para toggle
  const handleClick = (e) => {
    e.stopPropagation();
    if (onClick && !disabled) {
      onClick(dimension, value, label);
    }
  };

  const chipContent = (
    <Box
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={handleClick}
      style={style}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        px: 1.5,
        py: 0.5,
        minWidth: 40,
        height: 28,
        borderRadius: borderRadius.md,
        fontSize: '0.75rem',
        fontWeight: 600,
        letterSpacing: '0.02em',
        cursor: disabled ? 'not-allowed' : isDragging ? 'grabbing' : 'grab',
        userSelect: 'none',
        transition: transitions.fast,
        position: 'relative',

        // Estados de color
        backgroundColor: isActive
          ? alpha(color, 0.15)
          : alpha(color, 0.08),
        color: isActive ? color : colors.text.primary,
        border: `1.5px solid ${isActive ? color : 'transparent'}`,

        // Estado de drag
        ...(isDragging && {
          zIndex: 1000,
          boxShadow: shadows.floating,
          transform: 'scale(1.05)',
          opacity: 0.9,
          backgroundColor: alpha(color, 0.2),
          border: `1.5px solid ${color}`,
        }),

        // Hover
        '&:hover': !disabled && !isDragging ? {
          backgroundColor: alpha(color, 0.15),
          border: `1.5px solid ${alpha(color, 0.4)}`,
          transform: 'translateY(-1px)',
          boxShadow: `0 4px 12px ${alpha(color, 0.15)}`,
        } : {},

        // Active (pressed)
        '&:active': !disabled ? {
          transform: 'scale(0.98)',
        } : {},

        // Disabled
        ...(disabled && {
          opacity: 0.5,
          pointerEvents: 'none',
        }),
      }}
    >
      <Typography
        component="span"
        sx={{
          fontSize: 'inherit',
          fontWeight: 'inherit',
          lineHeight: 1,
        }}
      >
        {label}
      </Typography>

      {/* Indicador de activo */}
      {isActive && (
        <Box
          sx={{
            position: 'absolute',
            top: -3,
            right: -3,
            width: 8,
            height: 8,
            borderRadius: '50%',
            backgroundColor: color,
            border: `2px solid ${colors.background.paper}`,
            boxShadow: `0 0 4px ${alpha(color, 0.5)}`,
          }}
        />
      )}
    </Box>
  );

  // Wrap con tooltip si hay descripción
  if (description) {
    return (
      <Tooltip
        title={description}
        placement="top"
        arrow
        enterDelay={500}
        leaveDelay={0}
      >
        {chipContent}
      </Tooltip>
    );
  }

  return chipContent;
});

DraggableChip.displayName = 'DraggableChip';

export default DraggableChip;
