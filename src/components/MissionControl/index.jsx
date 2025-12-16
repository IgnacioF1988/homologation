/**
 * MissionControl - Centro de control de pendientes ETL
 * Componente flotante elegante para gestionar todas las colas sandbox
 *
 * v2.0 - Diseño premium alineado con paleta Ocean Blue + Slate
 */

import { useState, useEffect, useCallback, memo } from 'react';
import {
  Box,
  Fab,
  Badge,
  Drawer,
  Typography,
  IconButton,
  Chip,
  Paper,
  LinearProgress,
  Tooltip,
  alpha,
  keyframes,
  Collapse,
  Button,
  Divider,
  CircularProgress,
} from '@mui/material';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import CloseIcon from '@mui/icons-material/Close';
import RefreshIcon from '@mui/icons-material/Refresh';
import AssignmentIcon from '@mui/icons-material/Assignment';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import CurrencyExchangeIcon from '@mui/icons-material/CurrencyExchange';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import BalanceIcon from '@mui/icons-material/Balance';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { colors, borderRadius, shadows } from '../../styles/theme';
import { sandboxQueuesService } from '../../services/sandboxQueuesService';
import QueueResolverModal from './QueueResolverModal';

// ============================================
// ANIMACIONES - Más sutiles
// ============================================
const slideIn = keyframes`
  from { opacity: 0; transform: translateX(10px); }
  to { opacity: 1; transform: translateX(0); }
`;

const countUp = keyframes`
  from { opacity: 0; transform: translateY(5px); }
  to { opacity: 1; transform: translateY(0); }
`;

// ============================================
// CONFIGURACIÓN DE COLAS
// ============================================
const QUEUE_ICONS = {
  instrumentos: AssignmentIcon,
  fondos: AccountBalanceIcon,
  monedas: CurrencyExchangeIcon,
  benchmarks: TrendingUpIcon,
  suciedades: WarningAmberIcon,
  descuadres: BalanceIcon,
};

const QUEUE_DESCRIPTIONS = {
  instrumentos: 'Instrumentos sin mapear que requieren homologación',
  fondos: 'Fondos no reconocidos que necesitan asignación de ID',
  monedas: 'Monedas sin código ID que requieren mapeo',
  benchmarks: 'Benchmarks sin identificar para asignación',
  suciedades: 'Registros con cantidad cero que requieren validación',
  descuadres: 'Descuadres IPA-Derivados, IPA-SONA y otros para validar',
};

// ============================================
// COMPONENTE: Card de Cola
// Diseño premium más limpio
// ============================================
const QueueCard = memo(({ queueKey, data, expanded, onToggle, onResolve }) => {
  const IconComponent = QUEUE_ICONS[queueKey];
  const pendingCount = data?.counts?.pendiente || 0;
  const totalCount = data?.counts?.total || 0;
  const completedCount = data?.counts?.completado || 0;
  const progress = totalCount > 0 ? ((completedCount / totalCount) * 100) : 0;

  const hasUrgent = pendingCount > 0;
  const cardColor = data?.color || colors.grey[500];

  return (
    <Paper
      elevation={0}
      sx={{
        mb: 1.5,
        borderRadius: borderRadius.md,
        border: `1px solid ${hasUrgent ? alpha(cardColor, 0.2) : colors.border.light}`,
        backgroundColor: colors.background.paper,
        overflow: 'hidden',
        transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        animation: `${slideIn} 0.3s ease-out`,
        '&:hover': {
          borderColor: alpha(cardColor, 0.3),
          boxShadow: shadows.sm,
        },
      }}
    >
      {/* Header */}
      <Box
        onClick={onToggle}
        sx={{
          p: 2,
          display: 'flex',
          alignItems: 'center',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        {/* Icono */}
        <Box
          sx={{
            width: 36,
            height: 36,
            borderRadius: borderRadius.sm,
            background: hasUrgent
              ? `linear-gradient(135deg, ${cardColor} 0%, ${alpha(cardColor, 0.8)} 100%)`
              : alpha(cardColor, 0.08),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            mr: 1.5,
            transition: 'all 0.2s ease',
          }}
        >
          <IconComponent sx={{
            fontSize: 18,
            color: hasUrgent ? '#fff' : cardColor,
          }} />
        </Box>

        {/* Info */}
        <Box sx={{ flex: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography
              variant="body2"
              sx={{
                fontWeight: 600,
                color: colors.text.primary,
                fontSize: '0.875rem',
              }}
            >
              {data?.displayName}
            </Typography>
            {pendingCount > 0 && (
              <Chip
                label={pendingCount}
                size="small"
                sx={{
                  height: 20,
                  minWidth: 24,
                  fontSize: '0.6875rem',
                  fontWeight: 700,
                  backgroundColor: alpha(cardColor, 0.12),
                  color: cardColor,
                  animation: `${countUp} 0.2s ease-out`,
                }}
              />
            )}
            {pendingCount === 0 && totalCount > 0 && (
              <CheckCircleIcon sx={{ fontSize: 16, color: colors.success.main }} />
            )}
          </Box>

          {/* Progress bar */}
          {totalCount > 0 && (
            <Box sx={{ mt: 0.75, display: 'flex', alignItems: 'center', gap: 1 }}>
              <LinearProgress
                variant="determinate"
                value={progress}
                sx={{
                  flex: 1,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: alpha(cardColor, 0.1),
                  '& .MuiLinearProgress-bar': {
                    backgroundColor: cardColor,
                    borderRadius: 2,
                  },
                }}
              />
              <Typography variant="caption" sx={{ color: colors.text.muted, minWidth: 40, fontSize: '0.6875rem' }}>
                {completedCount}/{totalCount}
              </Typography>
            </Box>
          )}
        </Box>

        {/* Expand icon */}
        <IconButton size="small" sx={{ ml: 0.5, color: colors.text.tertiary }}>
          {expanded ? <ExpandLessIcon sx={{ fontSize: 18 }} /> : <ExpandMoreIcon sx={{ fontSize: 18 }} />}
        </IconButton>
      </Box>

      {/* Expanded content */}
      <Collapse in={expanded}>
        <Divider sx={{ borderColor: colors.border.light }} />
        <Box sx={{ p: 2, backgroundColor: colors.grey[50] }}>
          <Typography variant="caption" sx={{ color: colors.text.tertiary, mb: 1.5, display: 'block', fontSize: '0.75rem' }}>
            {QUEUE_DESCRIPTIONS[queueKey]}
          </Typography>

          <Box sx={{ display: 'flex', gap: 1 }}>
            {pendingCount > 0 && (
              <Button
                variant="contained"
                size="small"
                onClick={(e) => { e.stopPropagation(); onResolve(queueKey); }}
                sx={{
                  background: `linear-gradient(135deg, ${cardColor} 0%, ${alpha(cardColor, 0.85)} 100%)`,
                  borderRadius: borderRadius.sm,
                  textTransform: 'none',
                  fontWeight: 600,
                  fontSize: '0.75rem',
                  px: 2,
                  py: 0.75,
                  boxShadow: `0 2px 8px ${alpha(cardColor, 0.25)}`,
                  '&:hover': {
                    boxShadow: `0 4px 12px ${alpha(cardColor, 0.35)}`,
                  },
                }}
                endIcon={<OpenInNewIcon sx={{ fontSize: 14 }} />}
              >
                Resolver ({pendingCount})
              </Button>
            )}
            {pendingCount === 0 && totalCount === 0 && (
              <Typography variant="caption" sx={{ color: colors.text.muted, fontStyle: 'italic' }}>
                Sin registros pendientes
              </Typography>
            )}
          </Box>
        </Box>
      </Collapse>
    </Paper>
  );
});

QueueCard.displayName = 'QueueCard';

// ============================================
// COMPONENTE PRINCIPAL: MissionControl
// ============================================
const MissionControl = ({ onNavigateToQueue }) => {
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expandedQueues, setExpandedQueues] = useState({});
  const [resolverModal, setResolverModal] = useState({ open: false, queueType: null });

  // Cargar resumen
  const loadSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await sandboxQueuesService.getSummary();
      if (response.success) {
        setSummary(response.data);
      } else {
        setError(response.error || 'Error desconocido');
      }
    } catch (err) {
      console.error('Error cargando resumen:', err);
      setError(err.message || 'Error de conexión');
    } finally {
      setLoading(false);
    }
  }, []);

  // Cargar inmediatamente al montar el componente
  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  // Auto-refresh cada 30s
  useEffect(() => {
    const interval = setInterval(loadSummary, 30000);
    return () => clearInterval(interval);
  }, [loadSummary]);

  // Calcular total de pendientes
  const totalPendientes = summary
    ? Object.values(summary).reduce((acc, q) => acc + (q?.counts?.pendiente || 0), 0)
    : 0;

  const toggleQueue = (key) => {
    setExpandedQueues(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleResolve = (queueType) => {
    if (queueType === 'instrumentos') {
      // Para instrumentos, navegar a la cola existente
      setOpen(false);
      if (onNavigateToQueue) onNavigateToQueue();
    } else {
      // Para otros tipos, abrir modal de resolución
      setResolverModal({ open: true, queueType });
    }
  };

  const handleResolverClose = () => {
    setResolverModal({ open: false, queueType: null });
    loadSummary(); // Refrescar después de cerrar
  };

  return (
    <>
      {/* FAB - Mission Control Button - Diseño más sutil */}
      <Tooltip title="Mission Control - Pendientes ETL" placement="left" arrow>
        <Fab
          onClick={() => setOpen(true)}
          sx={{
            position: 'fixed',
            bottom: 32,
            right: 32,
            width: 52,
            height: 52,
            background: totalPendientes > 0
              ? `linear-gradient(135deg, ${colors.warning.main} 0%, ${colors.warning.dark} 100%)`
              : `linear-gradient(135deg, ${colors.primary.main} 0%, ${colors.primary.dark} 100%)`,
            boxShadow: totalPendientes > 0
              ? `0 4px 16px ${alpha(colors.warning.main, 0.35)}`
              : shadows.primary,
            transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
            '&:hover': {
              transform: 'translateY(-2px)',
              boxShadow: totalPendientes > 0
                ? `0 6px 20px ${alpha(colors.warning.main, 0.45)}`
                : shadows.primaryHover,
            },
          }}
        >
          <Badge
            badgeContent={totalPendientes}
            max={99}
            sx={{
              '& .MuiBadge-badge': {
                fontSize: '0.625rem',
                fontWeight: 700,
                minWidth: 18,
                height: 18,
                backgroundColor: totalPendientes > 0 ? '#fff' : colors.error.main,
                color: totalPendientes > 0 ? colors.warning.dark : '#fff',
                top: -2,
                right: -2,
              },
            }}
          >
            <RocketLaunchIcon sx={{ fontSize: 24, color: '#fff' }} />
          </Badge>
        </Fab>
      </Tooltip>

      {/* Drawer Panel - Diseño premium limpio */}
      <Drawer
        anchor="right"
        open={open}
        onClose={() => setOpen(false)}
        PaperProps={{
          sx: {
            width: 380,
            maxWidth: '100vw',
            borderRadius: `${borderRadius.xl} 0 0 ${borderRadius.xl}`,
            boxShadow: shadows.floating,
          },
        }}
      >
        {/* Header - Fondo blanco con línea de color */}
        <Box
          sx={{
            p: 2.5,
            backgroundColor: colors.background.paper,
            borderBottom: `1px solid ${colors.border.light}`,
            position: 'relative',
            '&::before': {
              content: '""',
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: '3px',
              background: totalPendientes > 0
                ? `linear-gradient(90deg, ${colors.warning.main} 0%, ${colors.warning.light} 100%)`
                : colors.primary.gradient,
            },
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Box
                sx={{
                  width: 44,
                  height: 44,
                  borderRadius: borderRadius.md,
                  background: totalPendientes > 0
                    ? `linear-gradient(135deg, ${colors.warning.main} 0%, ${colors.warning.dark} 100%)`
                    : colors.primary.gradient,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: `0 4px 12px ${alpha(totalPendientes > 0 ? colors.warning.main : colors.primary.main, 0.25)}`,
                }}
              >
                <RocketLaunchIcon sx={{ fontSize: 22, color: '#fff' }} />
              </Box>
              <Box>
                <Typography
                  variant="subtitle1"
                  sx={{
                    fontWeight: 700,
                    color: colors.text.primary,
                    letterSpacing: '-0.02em',
                  }}
                >
                  Mission Control
                </Typography>
                <Typography variant="caption" sx={{ color: colors.text.tertiary }}>
                  {totalPendientes > 0
                    ? `${totalPendientes} pendiente${totalPendientes > 1 ? 's' : ''}`
                    : 'Sin pendientes'
                  }
                </Typography>
              </Box>
            </Box>
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              <IconButton
                onClick={loadSummary}
                disabled={loading}
                size="small"
                sx={{
                  color: colors.text.secondary,
                  '&:hover': { backgroundColor: colors.grey[100] },
                }}
              >
                <RefreshIcon sx={{ fontSize: 20, animation: loading ? 'spin 1s linear infinite' : 'none' }} />
              </IconButton>
              <IconButton
                onClick={() => setOpen(false)}
                size="small"
                sx={{
                  color: colors.text.secondary,
                  '&:hover': { backgroundColor: colors.grey[100] },
                }}
              >
                <CloseIcon sx={{ fontSize: 20 }} />
              </IconButton>
            </Box>
          </Box>

          {/* Status summary - más compacto */}
          <Box sx={{ display: 'flex', gap: 4, mt: 2, pt: 2, borderTop: `1px solid ${colors.border.light}` }}>
            <Box>
              <Typography
                variant="h5"
                sx={{
                  fontWeight: 700,
                  color: totalPendientes > 0 ? colors.warning.dark : colors.success.main,
                  lineHeight: 1,
                }}
              >
                {totalPendientes}
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  color: colors.text.muted,
                  fontSize: '0.625rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                }}
              >
                Pendientes
              </Typography>
            </Box>
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 700, color: colors.text.primary, lineHeight: 1 }}>
                {summary ? Object.keys(summary).length : 0}
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  color: colors.text.muted,
                  fontSize: '0.625rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                }}
              >
                Colas
              </Typography>
            </Box>
          </Box>
        </Box>

        {/* Content */}
        <Box sx={{ p: 2, flex: 1, overflowY: 'auto', backgroundColor: colors.grey[50] }}>
          {loading && !summary ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 8 }}>
              <CircularProgress size={32} thickness={4} sx={{ color: colors.primary.main }} />
            </Box>
          ) : error ? (
            <Box sx={{ textAlign: 'center', py: 6 }}>
              <Box
                sx={{
                  width: 56,
                  height: 56,
                  borderRadius: '50%',
                  backgroundColor: alpha(colors.warning.main, 0.1),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  mx: 'auto',
                  mb: 2,
                }}
              >
                <WarningAmberIcon sx={{ fontSize: 28, color: colors.warning.main }} />
              </Box>
              <Typography variant="body2" sx={{ color: colors.text.secondary, mb: 0.5 }}>
                Error al cargar datos
              </Typography>
              <Typography variant="caption" sx={{ color: colors.text.muted, display: 'block', mb: 2 }}>
                {error}
              </Typography>
              <Button
                variant="outlined"
                size="small"
                onClick={loadSummary}
                startIcon={<RefreshIcon sx={{ fontSize: 16 }} />}
                sx={{
                  borderRadius: borderRadius.sm,
                  textTransform: 'none',
                  fontWeight: 500,
                  fontSize: '0.75rem',
                  borderColor: colors.border.default,
                  color: colors.text.secondary,
                }}
              >
                Reintentar
              </Button>
            </Box>
          ) : summary && Object.keys(summary).length > 0 ? (
            Object.entries(summary).map(([key, data]) => (
              <QueueCard
                key={key}
                queueKey={key}
                data={data}
                expanded={expandedQueues[key]}
                onToggle={() => toggleQueue(key)}
                onResolve={handleResolve}
              />
            ))
          ) : (
            <Box sx={{ textAlign: 'center', py: 6 }}>
              <Box
                sx={{
                  width: 56,
                  height: 56,
                  borderRadius: '50%',
                  backgroundColor: alpha(colors.success.main, 0.1),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  mx: 'auto',
                  mb: 2,
                }}
              >
                <CheckCircleIcon sx={{ fontSize: 28, color: colors.success.main }} />
              </Box>
              <Typography variant="body2" sx={{ color: colors.text.secondary, mb: 0.5 }}>
                Sin datos de colas disponibles
              </Typography>
              <Typography variant="caption" sx={{ color: colors.text.muted }}>
                Ejecute el pipeline ETL para generar pendientes
              </Typography>
            </Box>
          )}
        </Box>

        {/* Footer */}
        <Box
          sx={{
            p: 2,
            borderTop: `1px solid ${colors.border.light}`,
            backgroundColor: colors.background.paper,
          }}
        >
          <Typography
            variant="caption"
            sx={{
              color: colors.text.muted,
              display: 'block',
              textAlign: 'center',
              fontSize: '0.6875rem',
            }}
          >
            Los pendientes bloquean la creación del cubo hasta ser resueltos
          </Typography>
        </Box>
      </Drawer>

      {/* Modal de resolución */}
      <QueueResolverModal
        open={resolverModal.open}
        queueType={resolverModal.queueType}
        onClose={handleResolverClose}
      />

      {/* Global styles for animations */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
};

export default MissionControl;
