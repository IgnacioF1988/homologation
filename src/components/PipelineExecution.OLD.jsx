/**
 * PipelineExecution - Componente de ejecución con visualización de pipeline
 * Vista de roadmap interactiva con estado por fondo
 *
 * v5.1 - Diseño premium alineado con paleta Ocean Blue + Slate
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Chip,
  IconButton,
  Tooltip,
  CircularProgress,
  alpha,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Collapse,
  Divider,
  keyframes,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import WarningIcon from '@mui/icons-material/Warning';
import ScheduleIcon from '@mui/icons-material/Schedule';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ReplayIcon from '@mui/icons-material/Replay';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import StorageIcon from '@mui/icons-material/Storage';
import VerifiedIcon from '@mui/icons-material/Verified';
import DataObjectIcon from '@mui/icons-material/DataObject';
import ViewInArIcon from '@mui/icons-material/ViewInAr';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import PublicIcon from '@mui/icons-material/Public';
import { colors, borderRadius, shadows } from '../styles/theme';
import { procesosService } from '../services/procesosService';
import DateField from './fields/DateField';

// ============================================
// ANIMACIONES (solo las usadas)
// ============================================
const shimmer = keyframes`
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
`;

const flowRight = keyframes`
  0% { left: -30%; opacity: 0; }
  20% { opacity: 1; }
  80% { opacity: 1; }
  100% { left: 100%; opacity: 0; }
`;

const blink = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
`;

const ripple = keyframes`
  0% { transform: scale(1); opacity: 0.5; }
  100% { transform: scale(2.5); opacity: 0; }
`;

// ============================================
// CONFIGURACIÓN DEL PIPELINE - 8 ETAPAS
// Usa colores del tema para consistencia
// ============================================
const PIPELINE_STAGES = [
  { id: 'EXTRACCION', dbField: 'Estado_Extraccion', nombre: 'Extracción', icono: StorageIcon, color: colors.info.main, colorDark: colors.info.dark },
  { id: 'VALIDACION', dbField: 'Estado_Validacion', nombre: 'Validación', icono: VerifiedIcon, color: colors.secondary.main, colorDark: colors.secondary.dark },
  { id: 'PROCESS_IPA', dbField: 'Estado_Process_IPA', nombre: 'IPA', icono: AccountBalanceIcon, color: colors.success.main, colorDark: colors.success.dark },
  { id: 'PROCESS_CAPM', dbField: 'Estado_Process_CAPM', nombre: 'CAPM', icono: TrendingUpIcon, color: colors.warning.main, colorDark: colors.warning.dark },
  { id: 'PROCESS_DERIVADOS', dbField: 'Estado_Process_Derivados', nombre: 'Derivados', icono: DataObjectIcon, color: colors.primary.main, colorDark: colors.primary.dark },
  { id: 'PROCESS_PNL', dbField: 'Estado_Process_PNL', nombre: 'PNL', icono: ShowChartIcon, color: colors.error.main, colorDark: colors.error.dark },
  { id: 'PROCESS_UBS', dbField: 'Estado_Process_UBS', nombre: 'UBS', icono: PublicIcon, color: colors.secondary.main, colorDark: colors.secondary.dark },
  { id: 'CONCATENAR', dbField: 'Estado_Concatenar', nombre: 'Cubo', icono: ViewInArIcon, color: colors.info.main, colorDark: colors.info.dark },
];

// Mapeo de Etapa_Actual del backend a ID de etapa
const ETAPA_ACTUAL_MAP = {
  'INICIALIZACION': null,
  'EXTRACCION': 'EXTRACCION',
  'VALIDACION': 'VALIDACION',
  'PROCESS_IPA': 'PROCESS_IPA',
  'PROCESS_CAPM': 'PROCESS_CAPM',
  'PROCESS_DERIVADOS': 'PROCESS_DERIVADOS',
  'PROCESS_PNL': 'PROCESS_PNL',
  'PROCESS_UBS': 'PROCESS_UBS',
  'CONCATENAR': 'CONCATENAR',
  'FINALIZANDO': 'CONCATENAR',
  'ERROR': null,
  'COMPLETADO': null,
};

// ============================================
// HELPER: Determinar estado de una etapa
// Ahora usa etapaActual del backend para determinar qué está "active"
// ============================================
const getStageStatus = (stageId, stats, etapaActual, isProcessFinished) => {
  if (!stats) return 'pending';
  
  const { ok, error, warning, pending, na } = stats;
  const processed = ok + error + warning + (na || 0);
  const total = processed + pending;
  
  if (total === 0) return 'pending';
  
  // Si el proceso ya terminó, no mostrar "active"
  if (isProcessFinished) {
    if (processed === 0) return 'pending';
    if ((ok > 0 || na > 0) && error === 0 && warning === 0) return 'success';
    if (error > 0 && ok === 0 && warning === 0 && na === 0) return 'error';
    return 'warning'; // Mixto
  }
  
  // Proceso en curso: usar etapaActual del backend
  const etapaMapeada = ETAPA_ACTUAL_MAP[etapaActual];
  
  // Esta etapa está activa si coincide con etapaActual
  if (etapaMapeada === stageId) {
    return 'active';
  }
  
  // Etapa ya pasó (tiene resultados y no es la actual)
  if (processed > 0 && pending === 0) {
    if ((ok > 0 || na > 0) && error === 0 && warning === 0) return 'success';
    if (error > 0 && ok === 0 && warning === 0 && na === 0) return 'error';
    return 'warning';
  }
  
  // Etapa tiene algunos resultados pero también pendientes (puede estar procesando)
  if (processed > 0 && pending > 0) {
    // Si es la etapa actual según backend, es active
    if (etapaMapeada === stageId) return 'active';
    // Si no, mostrar como warning (parcial)
    return 'warning';
  }
  
  // Etapa aún no empieza
  return 'pending';
};

// ============================================
// COMPONENTE: Nodo del Pipeline
// Diseño premium más sutil y elegante
// ============================================
const PipelineNode = ({ stage, stats, etapaActual, isProcessFinished }) => {
  const IconComponent = stage.icono;
  const status = getStageStatus(stage.id, stats, etapaActual, isProcessFinished);

  const statusConfig = {
    pending: {
      borderColor: colors.border.light,
      bgColor: colors.background.paper,
      iconBg: colors.grey[100],
      iconColor: colors.grey[400],
      textColor: colors.text.muted,
      badge: null,
    },
    active: {
      borderColor: alpha(stage.color, 0.4),
      bgColor: alpha(stage.color, 0.03),
      iconBg: `linear-gradient(135deg, ${stage.color} 0%, ${stage.colorDark} 100%)`,
      iconColor: '#fff',
      textColor: stage.color,
      badge: null,
      animate: true,
    },
    success: {
      borderColor: alpha(colors.success.main, 0.3),
      bgColor: alpha(colors.success.main, 0.03),
      iconBg: colors.success.main,
      iconColor: '#fff',
      textColor: colors.success.dark,
      badge: { icon: CheckCircleIcon, color: colors.success.main },
    },
    warning: {
      borderColor: alpha(colors.warning.main, 0.3),
      bgColor: alpha(colors.warning.main, 0.03),
      iconBg: colors.warning.main,
      iconColor: '#fff',
      textColor: colors.warning.dark,
      badge: { icon: WarningIcon, color: colors.warning.main },
    },
    error: {
      borderColor: alpha(colors.error.main, 0.3),
      bgColor: alpha(colors.error.main, 0.03),
      iconBg: colors.error.main,
      iconColor: '#fff',
      textColor: colors.error.dark,
      badge: { icon: ErrorIcon, color: colors.error.main },
    },
  };

  const config = statusConfig[status];
  const isActive = status === 'active';

  return (
    <Tooltip
      title={
        <Box sx={{ p: 0.5 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>{stage.nombre}</Typography>
          {stats && (
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
              {stats.ok > 0 && <Chip size="small" label={`✓ ${stats.ok}`} sx={{ height: 18, fontSize: '0.65rem', bgcolor: alpha(colors.success.main, 0.15), color: colors.success.main }} />}
              {stats.na > 0 && <Chip size="small" label={`N/A ${stats.na}`} sx={{ height: 18, fontSize: '0.65rem', bgcolor: alpha(colors.grey[500], 0.15), color: colors.grey[600] }} />}
              {stats.warning > 0 && <Chip size="small" label={`⚠ ${stats.warning}`} sx={{ height: 18, fontSize: '0.65rem', bgcolor: alpha(colors.warning.main, 0.15), color: colors.warning.dark }} />}
              {stats.error > 0 && <Chip size="small" label={`✗ ${stats.error}`} sx={{ height: 18, fontSize: '0.65rem', bgcolor: alpha(colors.error.main, 0.15), color: colors.error.main }} />}
              {stats.pending > 0 && <Chip size="small" label={`◦ ${stats.pending}`} sx={{ height: 18, fontSize: '0.65rem', bgcolor: alpha(colors.grey[500], 0.15), color: colors.grey[500] }} />}
            </Box>
          )}
        </Box>
      }
      arrow
      placement="top"
    >
      <Box sx={{ position: 'relative', cursor: 'pointer' }}>
        {/* Ripple sutil solo para active */}
        {isActive && (
          <Box
            sx={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              width: 76,
              height: 76,
              borderRadius: '50%',
              border: `1px solid ${alpha(stage.color, 0.3)}`,
              transform: 'translate(-50%, -50%)',
              animation: `${ripple} 2.5s ease-out infinite`,
              pointerEvents: 'none',
            }}
          />
        )}

        <Paper
          elevation={0}
          sx={{
            position: 'relative',
            width: 80,
            p: 1.5,
            borderRadius: borderRadius.lg,
            border: `1px solid ${config.borderColor}`,
            backgroundColor: config.bgColor,
            transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
            boxShadow: isActive ? `0 0 0 3px ${alpha(stage.color, 0.1)}` : 'none',
            '&:hover': {
              transform: 'translateY(-2px)',
              boxShadow: shadows.md,
            },
            overflow: 'hidden',
          }}
        >
          {/* Shimmer sutil para active */}
          {isActive && (
            <Box
              sx={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: `linear-gradient(90deg, transparent, ${alpha(stage.color, 0.08)}, transparent)`,
                backgroundSize: '200% 100%',
                animation: `${shimmer} 2s infinite`,
                pointerEvents: 'none',
              }}
            />
          )}

          {/* Badge de estado pequeño */}
          {config.badge && (
            <Box
              sx={{
                position: 'absolute',
                top: -4,
                right: -4,
                width: 18,
                height: 18,
                borderRadius: '50%',
                backgroundColor: config.badge.color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '2px solid #fff',
                zIndex: 2,
              }}
            >
              <config.badge.icon sx={{ fontSize: 10, color: '#fff' }} />
            </Box>
          )}

          {/* Indicador LIVE sutil */}
          {isActive && (
            <Box
              sx={{
                position: 'absolute',
                top: -3,
                right: -3,
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: stage.color,
                border: '2px solid #fff',
                animation: `${blink} 1.5s ease-in-out infinite`,
                zIndex: 2,
              }}
            />
          )}

          {/* Icono */}
          <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1, position: 'relative', zIndex: 1 }}>
            <Box
              sx={{
                width: 36,
                height: 36,
                borderRadius: borderRadius.sm,
                background: config.iconBg,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.3s ease',
              }}
            >
              <IconComponent sx={{ fontSize: 18, color: config.iconColor, transition: 'color 0.3s ease' }} />
            </Box>
          </Box>

          {/* Nombre */}
          <Typography
            variant="caption"
            align="center"
            sx={{
              fontWeight: 600,
              color: config.textColor,
              fontSize: '0.6875rem',
              position: 'relative',
              zIndex: 1,
              transition: 'color 0.3s ease',
              display: 'block',
              letterSpacing: '-0.01em',
            }}
          >
            {stage.nombre}
          </Typography>

          {/* Barra de stats mini */}
          {stats && (stats.ok > 0 || stats.error > 0 || stats.warning > 0 || stats.na > 0) && (
            <Box sx={{ mt: 1, display: 'flex', gap: '1px', justifyContent: 'center', height: 3, position: 'relative', zIndex: 1 }}>
              {stats.ok > 0 && <Box sx={{ flex: stats.ok, backgroundColor: colors.success.main, borderRadius: 1, minWidth: 4 }} />}
              {stats.na > 0 && <Box sx={{ flex: stats.na, backgroundColor: colors.grey[300], borderRadius: 1, minWidth: 4 }} />}
              {stats.warning > 0 && <Box sx={{ flex: stats.warning, backgroundColor: colors.warning.main, borderRadius: 1, minWidth: 4 }} />}
              {stats.error > 0 && <Box sx={{ flex: stats.error, backgroundColor: colors.error.main, borderRadius: 1, minWidth: 4 }} />}
            </Box>
          )}
        </Paper>
      </Box>
    </Tooltip>
  );
};

// ============================================
// COMPONENTE: Conector
// Más sutil, sin animación excesiva
// ============================================
const PipelineConnector = ({ fromStageId, toStageId, fromStats, toStats, fromStage, etapaActual, isProcessFinished }) => {
  const fromStatus = getStageStatus(fromStageId, fromStats, etapaActual, isProcessFinished);
  const toStatus = getStageStatus(toStageId, toStats, etapaActual, isProcessFinished);

  const isActive = fromStatus !== 'pending' && toStatus === 'active';
  const isCompleted = ['success', 'warning', 'error'].includes(fromStatus);

  const connectorColor = isCompleted
    ? (fromStatus === 'success' ? colors.success.main : fromStatus === 'warning' ? colors.warning.main : colors.error.main)
    : colors.grey[200];

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', px: 0.5, position: 'relative', width: 32 }}>
      <Box
        sx={{
          flex: 1,
          height: 2,
          backgroundColor: connectorColor,
          borderRadius: 1,
          position: 'relative',
          overflow: 'hidden',
          transition: 'background-color 0.4s ease',
        }}
      >
        {isActive && (
          <Box
            sx={{
              position: 'absolute',
              top: 0,
              width: '40%',
              height: '100%',
              background: `linear-gradient(90deg, transparent, ${alpha(fromStage.color, 0.6)}, transparent)`,
              borderRadius: 1,
              animation: `${flowRight} 1.5s ease-in-out infinite`,
            }}
          />
        )}
      </Box>
      <ArrowForwardIcon
        sx={{
          fontSize: 12,
          color: isCompleted ? connectorColor : isActive ? fromStage.color : colors.grey[300],
          ml: -0.2,
          transition: 'color 0.3s ease',
        }}
      />
    </Box>
  );
};

// ============================================
// COMPONENTE: Card de Fondo
// Diseño premium más limpio
// ============================================
const FundCard = ({ fund, onReprocesar, expanded, onToggleExpand }) => {
  const getStatusConfig = (estado) => {
    switch (estado) {
      case 'COMPLETADO': return { color: colors.success.main, bg: alpha(colors.success.main, 0.03), icon: CheckCircleIcon, label: 'OK' };
      case 'ERROR': return { color: colors.error.main, bg: alpha(colors.error.main, 0.03), icon: ErrorIcon, label: 'Error' };
      case 'PARCIAL':
      case 'WARNING': return { color: colors.warning.main, bg: alpha(colors.warning.main, 0.03), icon: WarningIcon, label: 'Parcial' };
      case 'OMITIDO': return { color: colors.grey[500], bg: colors.grey[50], icon: ScheduleIcon, label: 'Omitido' };
      default: return { color: colors.info.main, bg: alpha(colors.info.main, 0.03), icon: ScheduleIcon, label: 'En Proceso' };
    }
  };

  const status = getStatusConfig(fund.Estado_Final);
  const StatusIcon = status.icon;

  const ipaSteps = ['01', '02', '03', '04', '05', '06', '07'];
  const ipaNames = { '01': 'RescatarLocalPrice', '02': 'AjusteSONA', '03': 'RenombrarCxCCxP', '04': 'TratamientoSuciedades', '05': 'EliminarCajasMTM', '06': 'CrearDimensiones', '07': 'AgruparRegistros' };

  return (
    <Paper
      elevation={0}
      sx={{
        mb: 1.5,
        borderRadius: borderRadius.md,
        border: `1px solid ${colors.border.light}`,
        backgroundColor: status.bg,
        overflow: 'hidden',
        transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        '&:hover': {
          borderColor: alpha(status.color, 0.3),
          boxShadow: shadows.sm,
        },
      }}
    >
      <Box onClick={onToggleExpand} sx={{ p: 2, display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
        <Box
          sx={{
            width: 32,
            height: 32,
            borderRadius: borderRadius.sm,
            backgroundColor: alpha(status.color, 0.1),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            mr: 1.5,
          }}
        >
          <StatusIcon sx={{ fontSize: 16, color: status.color }} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: colors.text.primary, fontSize: '0.875rem' }}>
            {fund.FundShortName || fund.ID_Fund}
          </Typography>
          {fund.Paso_Con_Error && (
            <Typography variant="caption" sx={{ color: colors.error.main, display: 'block', fontWeight: 500, fontSize: '0.75rem' }}>
              Error en: {fund.Paso_Con_Error}
            </Typography>
          )}
        </Box>
        <Chip
          label={status.label}
          size="small"
          sx={{
            height: 22,
            fontSize: '0.6875rem',
            backgroundColor: alpha(status.color, 0.1),
            color: status.color,
            fontWeight: 600,
            mr: 1,
            borderRadius: borderRadius.sm,
          }}
        />
        {fund.Elegible_Reproceso === 1 && (
          <Tooltip title="Reprocesar este fondo" arrow>
            <IconButton
              size="small"
              onClick={(e) => { e.stopPropagation(); onReprocesar(fund.ID_Fund); }}
              sx={{
                color: colors.primary.main,
                p: 0.5,
                backgroundColor: alpha(colors.primary.main, 0.08),
                '&:hover': { backgroundColor: alpha(colors.primary.main, 0.15) },
              }}
            >
              <ReplayIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
        )}
        <IconButton size="small" sx={{ p: 0.5, ml: 0.5, color: colors.text.tertiary }}>
          {expanded ? <ExpandLessIcon sx={{ fontSize: 18 }} /> : <ExpandMoreIcon sx={{ fontSize: 18 }} />}
        </IconButton>
      </Box>
      <Collapse in={expanded}>
        <Divider sx={{ borderColor: colors.border.light }} />
        <Box sx={{ p: 2, backgroundColor: colors.grey[50] }}>
          <Typography
            variant="caption"
            sx={{
              color: colors.text.muted,
              mb: 1.5,
              display: 'block',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              fontSize: '0.625rem',
            }}
          >
            Progreso IPA
          </Typography>
          <Box sx={{ display: 'flex', gap: '3px', mb: 2 }}>
            {ipaSteps.map((num) => {
              const estado = fund[`Estado_IPA_${num}_${ipaNames[num]}`];
              const stepColor = estado === 'OK' ? colors.success.main : estado === 'ERROR' ? colors.error.main : estado === 'WARNING' ? colors.warning.main : colors.grey[200];
              return (
                <Tooltip key={num} title={`IPA-${num}: ${estado || 'Pendiente'}`} arrow>
                  <Box
                    sx={{
                      flex: 1,
                      height: 6,
                      borderRadius: 1,
                      backgroundColor: stepColor,
                      cursor: 'help',
                      transition: 'transform 0.2s',
                      '&:hover': { transform: 'scaleY(1.3)' },
                    }}
                  />
                </Tooltip>
              );
            })}
          </Box>
          {fund.Mensaje_Error && (
            <Box
              sx={{
                p: 1.5,
                backgroundColor: alpha(colors.error.main, 0.05),
                borderRadius: borderRadius.sm,
                border: `1px solid ${alpha(colors.error.main, 0.15)}`,
              }}
            >
              <Typography variant="caption" sx={{ color: colors.error.dark, fontWeight: 500, fontSize: '0.75rem' }}>
                {fund.Mensaje_Error}
              </Typography>
            </Box>
          )}
        </Box>
      </Collapse>
    </Paper>
  );
};

// ============================================
// COMPONENTE PRINCIPAL
// ============================================
const PipelineExecution = ({ onExecutionComplete }) => {
  const [ejecucion, setEjecucion] = useState(null);
  const [fondos, setFondos] = useState([]);
  const [stageStats, setStageStats] = useState({});
  const [expandedFunds, setExpandedFunds] = useState({});
  const [dateModalOpen, setDateModalOpen] = useState(false);
  const [fechaReporte, setFechaReporte] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');
  const pollingRef = useRef(null);
  const errorCountRef = useRef(0); // Contador de errores consecutivos de polling

  // Etapa actual del backend
  const etapaActual = ejecucion?.Etapa_Actual || null;
  
  const filteredFunds = useMemo(() => {
    if (!fondos.length) return [];
    if (filterStatus === 'all') return fondos;
    if (filterStatus === 'ERROR') return fondos.filter(f => f.Estado_Final === 'ERROR');
    if (filterStatus === 'PARCIAL') return fondos.filter(f => ['PARCIAL', 'WARNING'].includes(f.Estado_Final));
    if (filterStatus === 'COMPLETADO') return fondos.filter(f => f.Estado_Final === 'COMPLETADO');
    return fondos;
  }, [fondos, filterStatus]);

  // Polling con cálculo de estadísticas inline (sin dependencias inestables)
  const startPolling = useCallback((idEjecucion) => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    errorCountRef.current = 0; // Reset error count al iniciar nuevo polling

    const poll = async () => {
      try {
        const response = await procesosService.getEjecucionEstado(idEjecucion);
        if (response.success) {
          errorCountRef.current = 0; // Reset errores consecutivos en respuesta exitosa
          setEjecucion(response.data.ejecucion);
          setFondos(response.data.fondos || []);

          // Calcular estadísticas por etapa INLINE (evita dependencia inestable)
          const fondosData = response.data.fondos || [];
          const stats = {};
          PIPELINE_STAGES.forEach(stage => {
            const field = stage.dbField;
            stats[stage.id] = {
              ok: fondosData.filter(f => f[field] === 'OK').length,
              error: fondosData.filter(f => f[field] === 'ERROR').length,
              warning: fondosData.filter(f => f[field] === 'WARNING').length,
              na: fondosData.filter(f => f[field] === 'N/A').length,
              pending: fondosData.filter(f => !f[field] || f[field] === 'EN_PROGRESO').length,
            };
          });
          setStageStats(stats);

          const estado = response.data.ejecucion?.Estado;
          if (['COMPLETADO', 'PARCIAL', 'ERROR'].includes(estado)) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
            setIsExecuting(false);
            // Notificar que la ejecución terminó para refrescar cola de pendientes
            if (onExecutionComplete) {
              onExecutionComplete(response.data.ejecucion);
            }
          }
        }
      } catch (err) {
        console.error('Error polling:', err);
        errorCountRef.current += 1;

        // Detener polling después de 5 errores consecutivos para prevenir loop infinito
        if (errorCountRef.current >= 5) {
          console.error('Polling detenido después de 5 errores consecutivos');
          clearInterval(pollingRef.current);
          pollingRef.current = null;
          setIsExecuting(false);
        }
      }
    };

    poll();
    pollingRef.current = setInterval(poll, 2000); // Polling cada 2 segundos para reducir carga
  }, []); // SIN DEPENDENCIAS - evita ciclo infinito de re-renders
  
  const handleEjecutar = useCallback(async () => {
    if (!fechaReporte) return;
    setDateModalOpen(false);
    setIsExecuting(true);
    setFondos([]);
    setStageStats({});
    setEjecucion(null);
    
    try {
      const response = await procesosService.ejecutarV2({ fechaReporte });
      if (response.success) {
        setEjecucion(response.data);
        startPolling(response.data.ID_Ejecucion);
      }
    } catch (err) {
      console.error('Error ejecutando:', err);
      setIsExecuting(false);
    }
  }, [fechaReporte, startPolling]);
  
  const handleReprocesarFondo = useCallback(async (idFund) => {
    if (!ejecucion) return;
    try {
      await procesosService.reprocesarFondo(ejecucion.ID_Ejecucion, idFund);
      startPolling(ejecucion.ID_Ejecucion);
    } catch (err) { console.error('Error reprocesando:', err); }
  }, [ejecucion, startPolling]);
  
  useEffect(() => () => { if (pollingRef.current) clearInterval(pollingRef.current); }, []);
  
  const toggleFundExpand = useCallback((fundId) => {
    setExpandedFunds(prev => ({ ...prev, [fundId]: !prev[fundId] }));
  }, []);
  
  // Determinar si el proceso terminó
  const isProcessFinished = ejecucion && ['PARCIAL', 'COMPLETADO', 'ERROR'].includes(ejecucion.Estado);

  return (
    <Box sx={{ width: '100%' }}>
      {/* Header - Diseño premium limpio */}
      <Paper
        elevation={0}
        sx={{
          p: 4,
          mb: 4,
          borderRadius: borderRadius.xl,
          border: `1px solid ${colors.border.light}`,
          backgroundColor: colors.background.paper,
          position: 'relative',
          overflow: 'hidden',
          '&::before': {
            content: '""',
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '3px',
            background: colors.primary.gradient,
          },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2.5 }}>
            <Box
              sx={{
                width: 48,
                height: 48,
                borderRadius: borderRadius.md,
                background: colors.primary.gradient,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: `0 4px 12px ${alpha(colors.primary.main, 0.25)}`,
              }}
            >
              <PlayArrowIcon sx={{ fontSize: 24, color: '#fff' }} />
            </Box>
            <Box>
              <Typography
                variant="h6"
                sx={{
                  fontWeight: 700,
                  color: colors.text.primary,
                  letterSpacing: '-0.02em',
                }}
              >
                Pipeline ETL
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25 }}>
                <Typography variant="body2" sx={{ color: colors.text.tertiary }}>
                  8 etapas • Procesamiento secuencial
                </Typography>
                {etapaActual && !isProcessFinished && (
                  <Chip
                    size="small"
                    label={etapaActual}
                    sx={{
                      height: 18,
                      fontSize: '0.625rem',
                      bgcolor: alpha(colors.primary.main, 0.08),
                      color: colors.primary.main,
                      fontWeight: 600,
                    }}
                  />
                )}
              </Box>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            {ejecucion && (
              <Chip
                icon={ejecucion.Estado === 'EN_PROGRESO' ? <CircularProgress size={12} color="inherit" /> : undefined}
                label={`${ejecucion.FechaReporte} • ${ejecucion.Estado}`}
                sx={{
                  fontWeight: 600,
                  borderRadius: borderRadius.sm,
                  fontSize: '0.75rem',
                  height: 28,
                  backgroundColor:
                    ejecucion.Estado === 'COMPLETADO' ? alpha(colors.success.main, 0.1) :
                    ejecucion.Estado === 'ERROR' ? alpha(colors.error.main, 0.1) :
                    ejecucion.Estado === 'PARCIAL' ? alpha(colors.warning.main, 0.1) :
                    alpha(colors.info.main, 0.1),
                  color:
                    ejecucion.Estado === 'COMPLETADO' ? colors.success.dark :
                    ejecucion.Estado === 'ERROR' ? colors.error.dark :
                    ejecucion.Estado === 'PARCIAL' ? colors.warning.dark :
                    colors.info.dark,
                }}
              />
            )}
            <Button
              variant="contained"
              startIcon={isExecuting ? <CircularProgress size={16} color="inherit" /> : <PlayArrowIcon />}
              disabled={isExecuting}
              onClick={() => setDateModalOpen(true)}
              sx={{
                background: colors.primary.gradient,
                textTransform: 'none',
                fontWeight: 600,
                px: 3,
                py: 1.25,
                borderRadius: borderRadius.md,
                fontSize: '0.875rem',
                boxShadow: shadows.primary,
                transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                '&:hover': {
                  background: colors.primary.gradientHover,
                  boxShadow: shadows.primaryHover,
                  transform: 'translateY(-1px)',
                },
                '&:disabled': {
                  background: colors.grey[200],
                  boxShadow: 'none',
                },
              }}
            >
              {isExecuting ? 'Ejecutando...' : 'Nueva Ejecución'}
            </Button>
          </Box>
        </Box>
      </Paper>
      
      {/* Pipeline Visual */}
      <Paper
        elevation={0}
        sx={{
          p: 3,
          mb: 4,
          borderRadius: borderRadius.xl,
          border: `1px solid ${colors.border.light}`,
          backgroundColor: colors.background.paper,
        }}
      >
        <Typography
          variant="overline"
          sx={{
            color: colors.text.muted,
            mb: 2,
            display: 'block',
            fontWeight: 600,
            letterSpacing: '0.08em',
            fontSize: '0.625rem',
          }}
        >
          Estado del Pipeline
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', overflowX: 'auto', py: 2, px: 1 }}>
          {PIPELINE_STAGES.map((stage, index) => (
            <Box key={stage.id} sx={{ display: 'flex', alignItems: 'center' }}>
              <PipelineNode
                stage={stage}
                stats={stageStats[stage.id]}
                etapaActual={etapaActual}
                isProcessFinished={isProcessFinished}
              />
              {index < PIPELINE_STAGES.length - 1 && (
                <PipelineConnector
                  fromStageId={stage.id}
                  toStageId={PIPELINE_STAGES[index + 1].id}
                  fromStats={stageStats[stage.id]}
                  toStats={stageStats[PIPELINE_STAGES[index + 1].id]}
                  fromStage={stage}
                  etapaActual={etapaActual}
                  isProcessFinished={isProcessFinished}
                />
              )}
            </Box>
          ))}
        </Box>

        {/* Resumen */}
        {ejecucion && (
          <Box sx={{ display: 'flex', justifyContent: 'center', gap: 5, mt: 3, pt: 3, borderTop: `1px solid ${colors.border.light}` }}>
            {[
              {
                value: ejecucion.FondosExitosos || fondos.filter(f => f.Estado_Final === 'COMPLETADO').length,
                label: 'Exitosos',
                color: colors.success.main
              },
              {
                value: ejecucion.FondosWarning || fondos.filter(f => f.Estado_Final === 'WARNING').length,
                label: 'Warnings',
                color: colors.warning.main
              },
              {
                value: ejecucion.FondosFallidos || fondos.filter(f => ['ERROR', 'PARCIAL'].includes(f.Estado_Final)).length,
                label: 'Errores',
                color: colors.error.main
              },
              {
                value: ejecucion.TiempoTotal_Segundos ||
                       (ejecucion.FechaInicio
                         ? Math.floor((new Date() - new Date(ejecucion.FechaInicio)) / 1000)
                         : 0),
                label: 'Segundos',
                color: colors.text.secondary
              },
            ].map((item, i) => (
              <Box key={i} sx={{ textAlign: 'center' }}>
                <Typography variant="h4" sx={{ color: item.color, fontWeight: 700, lineHeight: 1, fontSize: '1.5rem' }}>
                  {item.value}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{
                    color: colors.text.muted,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    fontSize: '0.5625rem',
                  }}
                >
                  {item.label}
                </Typography>
              </Box>
            ))}
          </Box>
        )}
      </Paper>
      
      {/* Lista de Fondos */}
      {fondos.length > 0 && (
        <Paper
          elevation={0}
          sx={{
            borderRadius: borderRadius.xl,
            border: `1px solid ${colors.border.light}`,
            overflow: 'hidden',
          }}
        >
          <Box
            sx={{
              p: 2.5,
              borderBottom: `1px solid ${colors.border.light}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: colors.background.paper,
            }}
          >
            <Typography variant="subtitle1" sx={{ fontWeight: 600, color: colors.text.primary }}>
              Estado por Fondo
              <Typography component="span" sx={{ ml: 1, color: colors.text.muted, fontWeight: 500, fontSize: '0.875rem' }}>
                ({filteredFunds.length})
              </Typography>
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.75 }}>
              {[
                { key: 'all', label: 'Todos', color: colors.primary.main },
                { key: 'ERROR', label: 'Errores', color: colors.error.main },
                { key: 'PARCIAL', label: 'Parcial', color: colors.warning.main },
                { key: 'COMPLETADO', label: 'OK', color: colors.success.main },
              ].map((item) => (
                <Chip
                  key={item.key}
                  label={item.label}
                  size="small"
                  onClick={() => setFilterStatus(item.key)}
                  sx={{
                    cursor: 'pointer',
                    fontWeight: 600,
                    borderRadius: borderRadius.sm,
                    fontSize: '0.6875rem',
                    height: 24,
                    transition: 'all 0.2s ease',
                    backgroundColor: filterStatus === item.key ? alpha(item.color, 0.1) : 'transparent',
                    color: filterStatus === item.key ? item.color : colors.text.tertiary,
                    border: `1px solid ${filterStatus === item.key ? alpha(item.color, 0.3) : colors.border.light}`,
                    '&:hover': {
                      backgroundColor: alpha(item.color, 0.08),
                      borderColor: alpha(item.color, 0.3),
                    },
                  }}
                />
              ))}
            </Box>
          </Box>
          <Box sx={{ p: 2, maxHeight: 450, overflowY: 'auto', backgroundColor: colors.grey[50] }}>
            {filteredFunds.length === 0 ? (
              <Typography sx={{ textAlign: 'center', color: colors.text.muted, py: 6, fontSize: '0.875rem' }}>
                No hay fondos que coincidan con el filtro
              </Typography>
            ) : (
              filteredFunds.map((fund) => (
                <FundCard
                  key={fund.ID_Fund}
                  fund={fund}
                  onReprocesar={handleReprocesarFondo}
                  expanded={expandedFunds[fund.ID_Fund]}
                  onToggleExpand={() => toggleFundExpand(fund.ID_Fund)}
                />
              ))
            )}
          </Box>
        </Paper>
      )}

      {/* Modal de fecha - Diseño limpio */}
      <Dialog
        open={dateModalOpen}
        onClose={() => setDateModalOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: borderRadius['2xl'],
            overflow: 'hidden',
            boxShadow: shadows.floating,
          },
        }}
      >
        <DialogTitle
          sx={{
            backgroundColor: colors.background.paper,
            borderBottom: `1px solid ${colors.border.light}`,
            pb: 2,
            pt: 2.5,
            px: 3,
            position: 'relative',
            '&::before': {
              content: '""',
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: '3px',
              background: colors.primary.gradient,
            },
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box
              sx={{
                width: 44,
                height: 44,
                borderRadius: borderRadius.md,
                background: colors.primary.gradient,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: `0 4px 12px ${alpha(colors.primary.main, 0.25)}`,
              }}
            >
              <PlayArrowIcon sx={{ color: '#fff', fontSize: 22 }} />
            </Box>
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, color: colors.text.primary }}>
                Nueva Ejecución
              </Typography>
              <Typography variant="caption" sx={{ color: colors.text.tertiary }}>
                Pipeline ETL • 8 Etapas
              </Typography>
            </Box>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ py: 3, px: 3 }}>
          <Typography variant="body2" sx={{ color: colors.text.secondary, mb: 2.5 }}>
            Seleccione la fecha de reporte:
          </Typography>
          <DateField
            name="fechaReporte"
            label="Fecha de Reporte"
            value={fechaReporte}
            onChange={(e) => setFechaReporte(e.target.value)}
            required
            width="full"
          />
        </DialogContent>
        <DialogActions
          sx={{
            px: 3,
            py: 2,
            backgroundColor: colors.grey[50],
            borderTop: `1px solid ${colors.border.light}`,
            gap: 1,
          }}
        >
          <Button
            onClick={() => setDateModalOpen(false)}
            sx={{
              borderRadius: borderRadius.sm,
              px: 2.5,
              color: colors.text.secondary,
              textTransform: 'none',
              fontWeight: 500,
            }}
          >
            Cancelar
          </Button>
          <Button
            variant="contained"
            onClick={handleEjecutar}
            disabled={!fechaReporte}
            startIcon={<PlayArrowIcon />}
            sx={{
              background: colors.primary.gradient,
              borderRadius: borderRadius.sm,
              px: 3,
              fontWeight: 600,
              textTransform: 'none',
              boxShadow: shadows.primary,
              '&:hover': {
                background: colors.primary.gradientHover,
                boxShadow: shadows.primaryHover,
              },
              '&:disabled': {
                background: colors.grey[200],
                boxShadow: 'none',
              },
            }}
          >
            Ejecutar
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default PipelineExecution;
