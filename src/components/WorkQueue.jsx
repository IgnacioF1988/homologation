/**
 * WorkQueue - Cola de pendientes con diseño premium
 * Clean table, spacious, elegant interactions
 */

import React, { useState, useEffect, useCallback, forwardRef, useImperativeHandle, useRef, useMemo } from 'react';
import {
  Box,
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Chip,
  Tooltip,
  CircularProgress,
  Button,
} from '@mui/material';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import InboxOutlinedIcon from '@mui/icons-material/InboxOutlined';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import SyncOutlinedIcon from '@mui/icons-material/SyncOutlined';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import KeyboardArrowDownRoundedIcon from '@mui/icons-material/KeyboardArrowDownRounded';
import { api } from '../services/api';
import { colors } from '../styles/theme';
import { downloadBulkLoadTemplate } from '../utils/excel';

// Configuración de paginación
const PAGE_SIZE = 10;

// ============================================
// ESTILOS ESTÁTICOS - Fuera del componente para evitar re-renders
// ============================================
const paperSx = {
  borderRadius: '16px',
  border: `1px solid ${colors.border.light}`,
  overflow: 'hidden',
};

const headerBoxSx = {
  px: 4,
  py: 3,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  borderBottom: `1px solid ${colors.border.light}`,
  backgroundColor: colors.grey[50],
};

const headerIconBoxSx = {
  width: 44,
  height: 44,
  borderRadius: '12px',
  backgroundColor: 'rgba(13, 148, 136, 0.08)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: `1px solid rgba(13, 148, 136, 0.12)`,
};

const headerTitleSx = {
  fontWeight: 600,
  fontSize: '1.0625rem',
  color: colors.text.primary,
};

const headerSubtitleSx = {
  color: colors.text.tertiary,
  fontSize: '0.8125rem',
  mt: 0.25,
};

const refreshBtnSx = {
  width: 40,
  height: 40,
  backgroundColor: '#fff',
  border: `1px solid ${colors.border.light}`,
  '&:hover': {
    backgroundColor: colors.grey[50],
    borderColor: colors.border.default,
  },
};

const emptyBoxSx = {
  p: 8,
  textAlign: 'center',
};

const emptyIconBoxSx = {
  width: 88,
  height: 88,
  borderRadius: '24px',
  backgroundColor: colors.grey[100],
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  mx: 'auto',
  mb: 3,
};

const loadingPaperSx = {
  p: 8,
  textAlign: 'center',
  borderRadius: '16px',
  border: `1px solid ${colors.border.light}`,
};

const errorPaperSx = {
  p: 6,
  textAlign: 'center',
  borderRadius: '16px',
  border: `1px solid rgba(239, 68, 68, 0.15)`,
  backgroundColor: colors.error.bg,
};

const errorIconBoxSx = {
  width: 64,
  height: 64,
  borderRadius: '18px',
  backgroundColor: 'rgba(239, 68, 68, 0.1)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  mx: 'auto',
  mb: 2,
};

const tableContainerSx = {
  maxHeight: 520,
};

const loadMoreBoxSx = {
  p: 2,
  display: 'flex',
  justifyContent: 'center',
  borderTop: `1px solid ${colors.border.light}`,
  backgroundColor: colors.grey[50],
};

const loadMoreBtnSx = {
  color: colors.primary.main,
  fontWeight: 500,
  fontSize: '0.875rem',
  textTransform: 'none',
  px: 3,
  py: 1,
  borderRadius: '10px',
  backgroundColor: 'rgba(13, 148, 136, 0.08)',
  '&:hover': {
    backgroundColor: 'rgba(13, 148, 136, 0.15)',
  },
};

const totalBoxSx = {
  p: 1.5,
  display: 'flex',
  justifyContent: 'center',
  borderTop: `1px solid ${colors.border.light}`,
  backgroundColor: colors.grey[50],
};

const WorkQueue = forwardRef(({ onSelectItem, selectedItemId = null, resetOnMount = false }, ref) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const tableContainerRef = useRef(null);

  // Cargar items de la cola
  const loadQueue = useCallback(async (isRefresh = false, resetEnProceso = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const response = await api.colaPendientes.getAll(resetEnProceso);
      if (response.success) {
        setItems(response.data);
      } else {
        setError(response.error);
      }
    } catch (err) {
      setError(err.message || 'Error al cargar la cola');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Carga inicial - con reset si se pide
  useEffect(() => {
    if (!initialLoadDone) {
      loadQueue(false, resetOnMount);
      setInitialLoadDone(true);
    }
  }, [initialLoadDone, loadQueue, resetOnMount]);

  // Actualizar estado de un item localmente (optimistic update)
  const updateItemState = useCallback((itemId, newState) => {
    setItems(prevItems =>
      prevItems.map(item =>
        item.id === itemId ? { ...item, estado: newState } : item
      )
    );
  }, []);

  // Exponer métodos al padre
  useImperativeHandle(ref, () => ({
    refresh: () => loadQueue(true),
    updateItemState, // Actualización optimista sin recargar
  }), [loadQueue, updateItemState]);

  const handleSelectItem = useCallback((item) => {
    if (onSelectItem) {
      onSelectItem(item);
    }
  }, [onSelectItem]);

  // Descargar plantilla Excel
  const handleDownloadTemplate = useCallback(async () => {
    setDownloading(true);
    try {
      await downloadBulkLoadTemplate(items);
    } catch (err) {
      console.error('Error descargando plantilla:', err);
    } finally {
      setDownloading(false);
    }
  }, [items]);

  // Items visibles (paginados)
  const visibleItems = useMemo(() => {
    return items.slice(0, visibleCount);
  }, [items, visibleCount]);

  // ¿Hay más items por mostrar?
  const hasMore = visibleCount < items.length;
  const remainingCount = items.length - visibleCount;

  // Cargar más items
  const handleLoadMore = useCallback(() => {
    setVisibleCount(prev => Math.min(prev + PAGE_SIZE, items.length));
  }, [items.length]);

  // Reset visibleCount cuando se refresca
  useEffect(() => {
    if (!loading && !refreshing) {
      setVisibleCount(PAGE_SIZE);
    }
  }, [items.length, loading, refreshing]);

  // Configuración de estados
  const getEstadoConfig = (estado) => {
    const configs = {
      pendiente: {
        icon: <ScheduleOutlinedIcon sx={{ fontSize: 14 }} />,
        label: 'Pendiente',
        bg: colors.warning.bg,
        textColor: '#92400e',
        borderColor: 'rgba(245, 158, 11, 0.2)',
      },
      en_proceso: {
        icon: <SyncOutlinedIcon sx={{ fontSize: 14 }} />,
        label: 'En proceso',
        bg: colors.info.bg,
        textColor: '#075985',
        borderColor: 'rgba(14, 165, 233, 0.2)',
      },
      completado: {
        icon: <CheckCircleOutlinedIcon sx={{ fontSize: 14 }} />,
        label: 'Completado',
        bg: colors.success.bg,
        textColor: '#065f46',
        borderColor: 'rgba(16, 185, 129, 0.2)',
      },
      error: {
        icon: <ErrorOutlineRoundedIcon sx={{ fontSize: 14 }} />,
        label: 'Error',
        bg: colors.error.bg,
        textColor: '#991b1b',
        borderColor: 'rgba(239, 68, 68, 0.2)',
      },
      esperando_bbg: {
        icon: <HourglassEmptyIcon sx={{ fontSize: 14 }} />,
        label: 'Esperando BBG',
        bg: 'rgba(139, 92, 246, 0.1)',
        textColor: '#5b21b6',
        borderColor: 'rgba(139, 92, 246, 0.2)',
      },
    };
    return configs[estado] || configs.pendiente;
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('es-CL', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  if (loading) {
    return (
      <Paper elevation={0} sx={loadingPaperSx}>
        <CircularProgress size={44} thickness={3} sx={{ color: colors.primary.main }} />
        <Typography sx={{ mt: 3, color: colors.text.secondary, fontSize: '0.9375rem' }}>
          Cargando cola de pendientes...
        </Typography>
      </Paper>
    );
  }

  if (error) {
    return (
      <Paper elevation={0} sx={errorPaperSx}>
        <Box sx={errorIconBoxSx}>
          <ErrorOutlineRoundedIcon sx={{ fontSize: 32, color: colors.error.main }} />
        </Box>
        <Typography sx={{ color: colors.error.dark, mb: 3, fontWeight: 500 }}>
          Error: {error}
        </Typography>
        <IconButton
          onClick={() => loadQueue()}
          sx={{
            backgroundColor: colors.error.main,
            color: '#fff',
            '&:hover': {
              backgroundColor: colors.error.dark,
            },
          }}
        >
          <RefreshRoundedIcon />
        </IconButton>
      </Paper>
    );
  }

  return (
    <Paper elevation={0} sx={paperSx}>
      {/* Header limpio */}
      <Box sx={headerBoxSx}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2.5 }}>
          <Box sx={headerIconBoxSx}>
            <InboxOutlinedIcon sx={{ color: colors.primary.main, fontSize: 22 }} />
          </Box>
          <Box>
            <Typography variant="h6" sx={headerTitleSx}>
              Cola de Pendientes
            </Typography>
            <Typography variant="body2" sx={headerSubtitleSx}>
              {items.length} {items.length === 1 ? 'instrumento' : 'instrumentos'} en cola
            </Typography>
          </Box>
        </Box>
        
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Tooltip title="Descargar plantilla Excel">
            <IconButton
              onClick={handleDownloadTemplate}
              disabled={downloading || items.length === 0}
              sx={{
                width: 40,
                height: 40,
                backgroundColor: items.length > 0 ? 'rgba(13, 148, 136, 0.08)' : '#fff',
                border: `1px solid ${items.length > 0 ? 'rgba(13, 148, 136, 0.2)' : colors.border.light}`,
                color: items.length > 0 ? colors.primary.main : colors.grey[400],
                '&:hover': {
                  backgroundColor: items.length > 0 ? 'rgba(13, 148, 136, 0.15)' : colors.grey[50],
                  borderColor: items.length > 0 ? colors.primary.main : colors.border.default,
                },
                '&:disabled': {
                  backgroundColor: colors.grey[100],
                  color: colors.grey[400],
                  borderColor: colors.border.light,
                },
              }}
            >
              {downloading ? (
                <CircularProgress size={18} thickness={4} sx={{ color: colors.primary.main }} />
              ) : (
                <FileDownloadOutlinedIcon sx={{ fontSize: 20 }} />
              )}
            </IconButton>
          </Tooltip>
          <Tooltip title="Refrescar lista">
            <IconButton
              onClick={() => loadQueue(true)}
              disabled={refreshing}
              sx={refreshBtnSx}
            >
              <RefreshRoundedIcon
                sx={{
                  fontSize: 20,
                  animation: refreshing ? 'spin 1s linear infinite' : 'none',
                  '@keyframes spin': {
                    from: { transform: 'rotate(0deg)' },
                    to: { transform: 'rotate(360deg)' },
                  },
                }}
              />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Tabla con altura máxima y scroll */}
      {items.length === 0 ? (
        <Box sx={emptyBoxSx}>
          <Box sx={emptyIconBoxSx}>
            <InboxOutlinedIcon sx={{ fontSize: 44, color: colors.grey[400] }} />
          </Box>
          <Typography variant="h6" sx={{ color: colors.text.secondary, fontWeight: 500, mb: 1 }}>
            Cola vacía
          </Typography>
          <Typography variant="body2" sx={{ color: colors.text.tertiary }}>
            No hay instrumentos pendientes de procesar
          </Typography>
        </Box>
      ) : (
        <Box>
          <TableContainer ref={tableContainerRef} sx={tableContainerSx}>
            <Table stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: 80, pl: 4 }}>ID</TableCell>
                  <TableCell>Nombre en Fuente</TableCell>
                  <TableCell sx={{ width: 130 }}>Fuente</TableCell>
                  <TableCell sx={{ width: 110 }}>Moneda</TableCell>
                  <TableCell sx={{ width: 140 }}>Fecha</TableCell>
                  <TableCell sx={{ width: 140 }}>Estado</TableCell>
                  <TableCell align="center" sx={{ width: 90, pr: 4 }}>Acción</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {visibleItems.map((item, index) => {
                const isSelected = selectedItemId === item.id;
                const estadoConfig = getEstadoConfig(item.estado);
                
                return (
                  <TableRow
                    key={item.id}
                    sx={{
                      cursor: item.estado !== 'completado' ? 'pointer' : 'default',
                      backgroundColor: isSelected ? 'rgba(13, 148, 136, 0.04)' : 'transparent',
                      transition: 'background-color 120ms ease',
                      animation: `fadeIn 200ms ease-out ${index * 30}ms both`,
                      '@keyframes fadeIn': {
                        from: { opacity: 0 },
                        to: { opacity: 1 },
                      },
                      '&:hover': {
                        backgroundColor: isSelected ? 'rgba(13, 148, 136, 0.08)' : 'rgba(0, 0, 0, 0.02)',
                      },
                    }}
                    onClick={() => item.estado !== 'completado' && handleSelectItem(item)}
                  >
                    <TableCell sx={{ pl: 4 }}>
                      <Typography 
                        variant="body2" 
                        sx={{ 
                          fontFamily: "'JetBrains Mono', monospace",
                          fontWeight: 500,
                          color: colors.text.tertiary,
                          fontSize: '0.8125rem',
                        }}
                      >
                        #{item.id}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: isSelected ? 600 : 500,
                          color: isSelected ? colors.primary.dark : colors.text.primary,
                          maxWidth: 300,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {item.nombreFuente}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={item.fuente}
                        size="small"
                        sx={{
                          backgroundColor: colors.grey[100],
                          color: colors.text.secondary,
                          fontWeight: 500,
                          fontSize: '0.75rem',
                          height: 28,
                          border: `1px solid ${colors.border.light}`,
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography 
                        variant="body2" 
                        sx={{ 
                          fontWeight: 500,
                          color: colors.text.secondary,
                        }}
                      >
                        {item.moneda}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography 
                        variant="body2" 
                        sx={{ 
                          color: colors.text.tertiary,
                          fontSize: '0.8125rem',
                        }}
                      >
                        {formatDate(item.fechaIngreso)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        icon={estadoConfig.icon}
                        label={estadoConfig.label}
                        size="small"
                        sx={{
                          backgroundColor: estadoConfig.bg,
                          color: estadoConfig.textColor,
                          border: `1px solid ${estadoConfig.borderColor}`,
                          fontWeight: 500,
                          fontSize: '0.75rem',
                          height: 30,
                          width: 120, // Ancho fijo para evitar saltos de layout
                          justifyContent: 'flex-start',
                          '& .MuiChip-icon': {
                            color: estadoConfig.textColor,
                            marginLeft: '8px',
                          },
                          '& .MuiChip-label': {
                            paddingRight: '12px',
                          },
                        }}
                      />
                    </TableCell>
                    <TableCell align="center" sx={{ pr: 4 }}>
                      <Tooltip title={item.estado === 'completado' ? 'Ya procesado' : 'Procesar instrumento'}>
                        <span>
                          <IconButton
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectItem(item);
                            }}
                            disabled={item.estado === 'completado'}
                            sx={{
                              width: 38,
                              height: 38,
                              backgroundColor: isSelected 
                                ? colors.primary.main 
                                : item.estado === 'completado' 
                                  ? colors.grey[100] 
                                  : 'rgba(13, 148, 136, 0.08)',
                              color: isSelected 
                                ? '#fff' 
                                : item.estado === 'completado' 
                                  ? colors.grey[400] 
                                  : colors.primary.main,
                              border: isSelected ? 'none' : `1px solid ${item.estado === 'completado' ? 'transparent' : 'rgba(13, 148, 136, 0.15)'}`,
                              transition: 'all 150ms ease',
                              '&:hover': {
                                backgroundColor: item.estado === 'completado' 
                                  ? colors.grey[100] 
                                  : colors.primary.main,
                                color: item.estado === 'completado' ? colors.grey[400] : '#fff',
                                transform: item.estado !== 'completado' ? 'scale(1.05)' : 'none',
                                border: 'none',
                              },
                              '&:disabled': {
                                backgroundColor: colors.grey[100],
                                color: colors.grey[400],
                              },
                            }}
                          >
                            <PlayArrowRoundedIcon sx={{ fontSize: 20 }} />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                );
              })}
              </TableBody>
            </Table>
          </TableContainer>

          {/* Botón "Cargar más" */}
          {hasMore && (
            <Box sx={loadMoreBoxSx}>
              <Button
                onClick={handleLoadMore}
                startIcon={<KeyboardArrowDownRoundedIcon />}
                sx={loadMoreBtnSx}
              >
                Cargar más ({remainingCount} restantes)
              </Button>
            </Box>
          )}

          {/* Indicador de total mostrado */}
          {!hasMore && items.length > PAGE_SIZE && (
            <Box sx={totalBoxSx}>
              <Typography
                variant="body2"
                sx={{
                  color: colors.text.tertiary,
                  fontSize: '0.8125rem',
                }}
              >
                Mostrando todos los {items.length} instrumentos
              </Typography>
            </Box>
          )}
        </Box>
      )}
    </Paper>
  );
});

WorkQueue.displayName = 'WorkQueue';

export default WorkQueue;
