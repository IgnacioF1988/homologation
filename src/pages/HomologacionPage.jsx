/**
 * HomologacionPage - Página principal con diseño premium
 * Clean, spacious, world-class
 */

import { useState, useCallback, useRef, useMemo, memo, useEffect } from 'react';
import {
  Box,
  Container,
  Typography,
  Paper,
  Tabs,
  Tab,
  Chip,
  alpha,
} from '@mui/material';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import ListAltOutlinedIcon from '@mui/icons-material/ListAltOutlined';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';

import InstrumentForm from '../components/InstrumentForm';
import PipelineExecution from '../components/PipelineV2';
import WorkQueue from '../components/WorkQueue';
import SearchHelper from '../components/SearchHelper';
import { DimensionalExplorer, DimensionalExplorerFab } from '../components/DimensionalExplorer';
import MissionControl from '../components/MissionControl';
import { StatusMessage } from '../components/layout';
import { colors } from '../styles/theme';
import { api } from '../services/api';

// ============================================
// HEADER MEMOIZADO - Evita re-renders innecesarios
// ============================================
// Estilos estáticos del header (fuera del componente)
const headerContainerSx = {
  backgroundColor: colors.background.paper,
  borderBottom: `1px solid ${colors.border.light}`,
  position: 'relative',
};

const headerLineSx = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  height: '3px',
  background: colors.primary.gradient,
};

const headerIconBoxSx = {
  width: 56,
  height: 56,
  borderRadius: '16px',
  background: colors.primary.gradient,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxShadow: colors.primary.main + '30 0 8px 24px',
};

const headerTitleSx = {
  fontWeight: 700,
  color: colors.text.primary,
  letterSpacing: '-0.02em',
  fontSize: '1.75rem',
};

const headerChipSx = {
  background: colors.primary.gradientSubtle,
  color: colors.primary.main,
  fontWeight: 600,
  fontSize: '0.7rem',
  height: 24,
  border: `1px solid ${alpha(colors.primary.main, 0.15)}`,
};

const headerSubtitleSx = {
  color: colors.text.tertiary,
  mt: 0.75,
  fontSize: '0.9375rem',
};

const headerStatLabelSx = {
  color: colors.text.muted,
  fontSize: '0.6875rem',
  fontWeight: 600,
  letterSpacing: '0.1em',
};

const PageHeader = memo(({ pendientes, procesadosHoy }) => (
  <Box sx={headerContainerSx}>
    <Box sx={headerLineSx} />
    <Container maxWidth="xl" sx={{ py: 5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <Box sx={headerIconBoxSx}>
            <AssignmentOutlinedIcon sx={{ fontSize: 28, color: '#fff' }} />
          </Box>
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Typography variant="h4" sx={headerTitleSx}>
                Homologación de Instrumentos
              </Typography>
              <Chip label="v2.0" size="small" sx={headerChipSx} />
            </Box>
            <Typography variant="body2" sx={headerSubtitleSx}>
              Sistema de gestión y clasificación de instrumentos financieros
            </Typography>
          </Box>
        </Box>
        <Box sx={{ display: { xs: 'none', lg: 'flex' }, gap: 6 }}>
          <Box sx={{ textAlign: 'right' }}>
            <Typography variant="overline" sx={headerStatLabelSx}>
              Pendientes
            </Typography>
            <Typography variant="h5" sx={{ fontWeight: 700, color: colors.warning.dark, mt: 0.25 }}>
              {pendientes ?? '--'}
            </Typography>
          </Box>
          <Box sx={{ width: '1px', backgroundColor: colors.border.light }} />
          <Box sx={{ textAlign: 'right' }}>
            <Typography variant="overline" sx={headerStatLabelSx}>
              Procesados hoy
            </Typography>
            <Typography variant="h5" sx={{ fontWeight: 700, color: colors.success.dark, mt: 0.25 }}>
              {procesadosHoy ?? '--'}
            </Typography>
          </Box>
        </Box>
      </Box>
    </Container>
  </Box>
));

PageHeader.displayName = 'PageHeader';

// ============================================
// TABS MEMOIZADOS
// ============================================
// Estilos estáticos para tabs (evita recálculos)
const tabsContainerSx = {
  mb: 5,
  borderRadius: '16px',
  overflow: 'hidden',
  border: `1px solid ${colors.border.light}`,
};

const tabsSx = {
  px: 2,
  pt: 1,
  backgroundColor: colors.grey[50],
  // Desactivar transiciones para evitar titilado
  '& .MuiTabs-indicator': {
    transition: 'none',
  },
  '& .MuiTab-root': {
    minHeight: 56,
    borderRadius: '12px 12px 0 0',
    mx: 0.5,
    transition: 'none',
  },
};

const tabItemSx = { gap: 1.5, transition: 'none' };

const TabsNavigation = memo(({ activeTab, onTabChange }) => (
  <Paper elevation={0} sx={tabsContainerSx}>
    <Tabs value={activeTab} onChange={onTabChange} sx={tabsSx}>
      <Tab
        icon={<ListAltOutlinedIcon sx={{ fontSize: 20 }} />}
        iconPosition="start"
        label="Cola de Pendientes"
        sx={tabItemSx}
      />
      <Tab
        icon={<AddCircleOutlineIcon sx={{ fontSize: 20 }} />}
        iconPosition="start"
        label="Nuevo Instrumento"
        sx={tabItemSx}
      />
      <Tab
        icon={<RocketLaunchIcon sx={{ fontSize: 20 }} />}
        iconPosition="start"
        label="Pipeline ETL"
        sx={{ ...tabItemSx, '& .MuiTab-iconWrapper': { color: colors.success.main } }}
      />
    </Tabs>
  </Paper>
));

TabsNavigation.displayName = 'TabsNavigation';

const HomologacionPage = () => {
  // Estado de la página
  const [activeTab, setActiveTab] = useState(0);
  const [selectedItem, setSelectedItem] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  // Estado para el explorador dimensional
  const [explorerOpen, setExplorerOpen] = useState(false);
  // Estado para estadísticas del header
  const [stats, setStats] = useState({ pendiente: null, procesadosHoy: null });

  // Refs para los formularios (para acceder a handleCopyFromSearch)
  const queueFormRef = useRef(null);
  const newFormRef = useRef(null);

  // Ref para el WorkQueue (para refrescar)
  const workQueueRef = useRef(null);

  // Cargar estadísticas al montar y refrescar periódicamente
  const loadStats = useCallback(async () => {
    try {
      const response = await api.colaPendientes.getStats();
      if (response.success) {
        setStats({
          pendiente: response.data.pendiente,
          procesadosHoy: response.data.procesadosHoy,
        });
      }
    } catch (error) {
      console.error('Error cargando estadísticas:', error);
    }
  }, []);

  useEffect(() => {
    loadStats();
    // Refrescar cada 30 segundos
    const interval = setInterval(loadStats, 30000);
    return () => clearInterval(interval);
  }, [loadStats]);

  // Seleccionar item de la cola
  const handleSelectQueueItem = useCallback((item) => {
    if (selectedItem?.id === item.id) return;

    // Si hay un item anterior, volver a pendiente
    if (selectedItem) {
      workQueueRef.current?.updateItemState(selectedItem.id, 'pendiente');
      api.colaPendientes.updateEstado(selectedItem.id, 'pendiente');
    }

    // Seleccionar el nuevo item
    setSelectedItem(item);
    setSuccessMessage(null);

    // Marcar el nuevo item como en_proceso
    workQueueRef.current?.updateItemState(item.id, 'en_proceso');
    api.colaPendientes.updateEstado(item.id, 'en_proceso');
  }, [selectedItem]);

  // Manejar guardado exitoso
  const handleSaveSuccess = useCallback((savedData) => {
    // Actualizar estado a completado
    if (selectedItem?.id) {
      workQueueRef.current?.updateItemState(selectedItem.id, 'completado');
    }

    // Refrescar estadísticas
    loadStats();

    setSuccessMessage(
      `Instrumento "${savedData?.nameInstrumento || savedData?.nombreFuente || 'Nuevo'}" procesado exitosamente.`
    );

    setTimeout(() => {
      setSelectedItem(null);
    }, 2000);
  }, [selectedItem, loadStats]);

  // Manejar cancelación
  const handleCancel = useCallback(() => {
    if (selectedItem) {
      // Actualizar estado a pendiente
      workQueueRef.current?.updateItemState(selectedItem.id, 'pendiente');
      api.colaPendientes.updateEstado(selectedItem.id, 'pendiente');
    }
    setSelectedItem(null);
    setSuccessMessage(null);
  }, [selectedItem]);

  // Cambiar de tab directamente
  const changeTabDirectly = useCallback((newValue) => {
    setActiveTab(newValue);
    setSuccessMessage(null);
  }, []);

  // Callback cuando la ETL termina - refrescar cola de pendientes
  const handleExecutionComplete = useCallback((ejecucion) => {
    // Refrescar estadísticas del header
    loadStats();
    // Refrescar la cola de pendientes
    if (workQueueRef.current?.refresh) {
      workQueueRef.current.refresh();
    }
    // Mostrar mensaje de éxito si hubo instrumentos pendientes
    if (ejecucion?.Estado === 'PARCIAL' || ejecucion?.FondosFallidos > 0) {
      setSuccessMessage(`ETL completada. Revise la cola de pendientes para homologar instrumentos detectados.`);
    }
  }, [loadStats]);

  // Manejar cambio de tab
  const handleTabChange = useCallback((_, newValue) => {
    if (activeTab === newValue) return;

    // Si hay item seleccionado, volver a pendiente
    if (selectedItem) {
      workQueueRef.current?.updateItemState(selectedItem.id, 'pendiente');
      api.colaPendientes.updateEstado(selectedItem.id, 'pendiente');
    }

    setSelectedItem(null);
    changeTabDirectly(newValue);
  }, [activeTab, selectedItem, changeTabDirectly]);

  // Obtener el formulario activo actual
  const activeFormRef = useMemo(() => {
    if (activeTab === 0 && selectedItem) {
      return queueFormRef;
    } else if (activeTab === 1) {
      return newFormRef;
    }
    return null;
  }, [activeTab, selectedItem]);

  // Handler para copiar valores desde SearchHelper
  const handleCopyFromSearch = useCallback((values) => {
    if (activeFormRef?.current?.handleCopyFromSearch) {
      activeFormRef.current.handleCopyFromSearch(values);
    }
  }, [activeFormRef]);

  // Handler para seleccionar coincidencia EXACTA desde SearchHelper
  const handleSelectExacta = useCallback((instrument) => {
    if (activeFormRef?.current?.handleSelectExacta) {
      activeFormRef.current.handleSelectExacta(instrument);
    }
  }, [activeFormRef]);

  // Handler para seleccionar coincidencia PARCIAL desde SearchHelper
  const handleSelectParcial = useCallback((instrument) => {
    if (activeFormRef?.current?.handleSelectParcial) {
      activeFormRef.current.handleSelectParcial(instrument);
    }
  }, [activeFormRef]);

  // Datos del formulario activo para SearchHelper
  const activeFormData = activeFormRef?.current?.formData || {};
  const isFormSaving = activeFormRef?.current?.saving || false;

  return (
    <Box
      sx={{
        minHeight: '100vh',
        backgroundColor: colors.background.default,
      }}
    >
      {/* Header Premium - Memoizado para evitar re-renders */}
      <PageHeader pendientes={stats.pendiente} procesadosHoy={stats.procesadosHoy} />

      {/* Contenido Principal */}
      <Container maxWidth="xl" sx={{ py: 5 }}>
        {/* Tabs - Memoizados */}
        <TabsNavigation activeTab={activeTab} onTabChange={handleTabChange} />

        {/* Mensaje de éxito */}
        {successMessage && (
          <StatusMessage
            type="success"
            message={successMessage}
            onClose={() => setSuccessMessage(null)}
            sx={{ mb: 4 }}
          />
        )}

        {/* Tab: Cola de Pendientes */}
        <Box sx={{ display: activeTab === 0 ? 'block' : 'none' }}>
          <WorkQueue
            ref={workQueueRef}
            onSelectItem={handleSelectQueueItem}
            selectedItemId={selectedItem?.id}
            resetOnMount={true}
          />

          {selectedItem ? (
            <Box
              key={`form-container-${selectedItem.id}`}
              sx={{
                mt: 4,
                animation: 'slideUp 300ms ease-out forwards',
                '@keyframes slideUp': {
                  from: { opacity: 0, transform: 'translateY(12px)' },
                  to: { opacity: 1, transform: 'translateY(0)' },
                },
              }}
            >
              <InstrumentForm
                ref={queueFormRef}
                initialData={{
                  nombreFuente: selectedItem.nombreFuente,
                  fuente: selectedItem.fuente,
                  moneda: selectedItem.moneda,
                  subId: selectedItem.subId,
                }}
                queueItemId={selectedItem.id}
                onSaveSuccess={handleSaveSuccess}
                onCancel={handleCancel}
              />
            </Box>
          ) : (
            <Paper 
              elevation={0}
              sx={{ 
                p: 8, 
                textAlign: 'center',
                borderRadius: '16px',
                border: `2px dashed ${colors.border.default}`,
                backgroundColor: colors.grey[50],
                mt: 4,
              }}
            >
              <Box
                sx={{
                  width: 72,
                  height: 72,
                  borderRadius: '20px',
                  backgroundColor: colors.grey[100],
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  mx: 'auto',
                  mb: 3,
                }}
              >
                <ListAltOutlinedIcon sx={{ fontSize: 36, color: colors.grey[400] }} />
              </Box>
              <Typography 
                variant="h6" 
                sx={{ 
                  color: colors.text.secondary,
                  fontWeight: 500,
                  mb: 1,
                }}
              >
                Seleccione un instrumento
              </Typography>
              <Typography 
                variant="body2" 
                sx={{ color: colors.text.tertiary }}
              >
                Elija un item de la cola de pendientes para comenzar el proceso de homologación
              </Typography>
            </Paper>
          )}
        </Box>

        {/* Tab: Nuevo Instrumento */}
        <Box sx={{ display: activeTab === 1 ? 'block' : 'none' }}>
          <InstrumentForm
            ref={newFormRef}
            key="new-instrument"
            initialData={null}
            queueItemId={null}
            onSaveSuccess={handleSaveSuccess}
          />
        </Box>

        {/* Tab: Pipeline ETL */}
        <Box sx={{ display: activeTab === 2 ? 'block' : 'none' }}>
          <PipelineExecution onExecutionComplete={handleExecutionComplete} />
        </Box>
      </Container>

      {/* FAB del Explorador Dimensional - oculto en pestaña de ejecución */}
      <Box sx={{
        visibility: activeTab === 2 ? 'hidden' : 'visible',
        pointerEvents: activeTab === 2 ? 'none' : 'auto',
      }}>
        <DimensionalExplorerFab
          onClick={() => setExplorerOpen(true)}
        />
      </Box>

      {/* Explorador Dimensional - solo renderizar cuando está abierto */}
      {explorerOpen && (
        <DimensionalExplorer
          open={explorerOpen}
          onClose={() => setExplorerOpen(false)}
        />
      )}

      {/* SearchHelper flotante - oculto en pestaña de ejecución */}
      <Box sx={{
        visibility: activeTab === 2 ? 'hidden' : 'visible',
        pointerEvents: activeTab === 2 ? 'none' : 'auto',
      }}>
        <SearchHelper
          onCopyValues={handleCopyFromSearch}
          onSelectExacta={handleSelectExacta}
          onSelectParcial={handleSelectParcial}
          disabled={isFormSaving}
          formData={activeFormData}
          noFormActive={activeTab === 0 && !selectedItem}
        />
      </Box>

      {/* Mission Control - Centro de control de pendientes ETL - Solo visible en pestaña ETL */}
      {activeTab === 2 && (
        <MissionControl
          onNavigateToQueue={() => {
            changeTabDirectly(0); // Ir a pestaña de cola de pendientes
          }}
        />
      )}
    </Box>
  );
};

export default HomologacionPage;
