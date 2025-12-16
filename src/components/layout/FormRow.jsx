/**
 * FormRow - Componente para organizar campos en una fila horizontal
 * Soporta diferentes configuraciones de layout
 */

import React from 'react';
import { Box } from '@mui/material';
import { rowStyles, spacing } from '../../styles';

const FormRow = ({
  children,
  variant = 'default', // 'default' | 'responsive' | 'grid'
  columns = null, // Para grid: numero de columnas o configuracion responsive
  gap = spacing.md,
  alignItems = 'flex-start',
  justifyContent = 'flex-start',
  wrap = true,
  sx = {},
}) => {
  // Estilos base segun variante
  const getVariantStyles = () => {
    switch (variant) {
      case 'responsive':
        return rowStyles.responsiveRow;
      case 'grid':
        return {
          ...rowStyles.fieldGrid,
          ...(columns && {
            gridTemplateColumns: typeof columns === 'object'
              ? columns
              : `repeat(${columns}, 1fr)`,
          }),
        };
      default:
        return rowStyles.fieldRow;
    }
  };

  return (
    <Box
      sx={{
        ...getVariantStyles(),
        gap,
        alignItems,
        justifyContent,
        flexWrap: wrap ? 'wrap' : 'nowrap',
        ...sx,
      }}
    >
      {children}
    </Box>
  );
};

// Variante especifica para grid con columnas fijas
export const FormGrid = ({ children, columns = 4, gap = spacing.md, sx = {} }) => (
  <FormRow variant="grid" columns={columns} gap={gap} sx={sx}>
    {children}
  </FormRow>
);

// Variante para fila responsive que se stackea en mobile
export const ResponsiveRow = ({ children, gap = spacing.md, sx = {} }) => (
  <FormRow variant="responsive" gap={gap} sx={sx}>
    {children}
  </FormRow>
);

export default FormRow;
