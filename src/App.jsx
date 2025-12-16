/**
 * App - Componente raiz de la aplicacion
 * Sistema de diseno premium - Clean, spacious, world-class
 */

import React, { useEffect } from 'react';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { HomologacionPage } from './pages';
import { preloadDimensionData } from './components/DimensionalExplorer/hooks/useDimensionData';
import { preloadInstruments } from './components/DimensionalExplorer/hooks/useFilteredInstruments';
import muiTheme from './styles/muiTheme';

function App() {
  // Pre-cargar datos del DimensionalExplorer en background
  useEffect(() => {
    const timer = setTimeout(() => {
      preloadDimensionData();
      preloadInstruments();
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <ThemeProvider theme={muiTheme}>
      <CssBaseline />
      <HomologacionPage />
    </ThemeProvider>
  );
}

export default App;
