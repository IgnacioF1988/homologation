/**
 * DiagnosticPanel - Modal de diagnóstico de errores de proceso
 * Muestra resumen de tablas sandbox y errores del log de ejecución
 * Con detalles expandibles para cada error y tabla
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  Box,
  Typography,
  Chip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  CircularProgress,
  Alert,
  Divider,
  alpha,
  Fab,
  Zoom,
  Tooltip,
  Badge,
  Collapse,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Tabs,
  Tab,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import BugReportIcon from '@mui/icons-material/BugReport';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import StorageIcon from '@mui/icons-material/Storage';
import AssessmentIcon from '@mui/icons-material/Assessment';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import CurrencyExchangeIcon from '@mui/icons-material/CurrencyExchange';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import TableViewIcon from '@mui/icons-material/TableView';
import { colors, borderRadius } from '../styles/theme';
import { apiClient } from '../services/apiClient';

// Configuración de categorías de tablas sandbox
const SANDBOX_TABLES = {
  alertasSuciedades: {
    label: 'Alertas Suciedades IPA',
    icon: <WarningAmberIcon />,
    color: colors.warning.main,
    columns: ['FechaReporte', 'InvestID', 'Qty', 'Portfolio'],
    description: 'Posiciones con datos inconsistentes en IPA',
    tableName: '[sandbox].[Alertas_Suciedades_IPA]',
  },
  alertasDescuadreDerivados: {
    label: 'Descuadre Derivados',
    icon: <TrendingDownIcon />,
    color: colors.error.main,
    columns: ['FechaReporte', 'Portfolio', 'MVBook_IPA', 'MTM_Derivados', 'Diferencia'],
    description: 'Descuadres entre valorización de derivados',
    tableName: '[sandbox].[Alertas_Descuadre_Derivados]',
  },
  homologacionInstrumentos: {
    label: 'Instrumentos Pendientes',
    icon: <StorageIcon />,
    color: colors.primary.main,
    columns: ['FechaReporte', 'Instrumento', 'Source', 'Currency'],
    description: 'Instrumentos sin homologar',
    tableName: '[sandbox].[Homologacion_Instrumentos]',
  },
  alertasFixedIncomeUBS: {
    label: 'Fixed Income UBS',
    icon: <AccountBalanceIcon />,
    color: colors.secondary.main,
    columns: ['FechaReporte', 'Asset'],
    description: 'Alertas de renta fija UBS',
    tableName: '[sandbox].[Alertas_Fixed_Income_UBS]',
  },
  fondosProblema: {
    label: 'Fondos con Problemas',
    icon: <AssessmentIcon />,
    color: colors.error.dark,
    columns: ['FechaReporte', 'ID_Fund', 'Proceso', 'Tipo_Problema'],
    description: 'Fondos con errores en procesamiento',
    tableName: '[sandbox].[Fondos_Problema]',
  },
  homologacionBenchmarks: {
    label: 'Benchmarks Pendientes',
    icon: <ReceiptLongIcon />,
    color: colors.info?.main || '#0288d1',
    columns: ['FechaReporte', 'Benchmark', 'Source'],
    description: 'Benchmarks sin homologar',
    tableName: '[sandbox].[Homologacion_Benchmarks]',
  },
  homologacionFondos: {
    label: 'Fondos Pendientes',
    icon: <AssessmentIcon />,
    color: colors.warning.dark,
    columns: ['FechaReporte', 'Fondo', 'Source'],
    description: 'Fondos sin homologar',
    tableName: '[sandbox].[Homologacion_Fondos]',
  },
  homologacionMonedas: {
    label: 'Monedas Pendientes',
    icon: <CurrencyExchangeIcon />,
    color: '#9c27b0',
    columns: ['FechaReporte', 'Moneda', 'Source'],
    description: 'Monedas sin homologar',
    tableName: '[sandbox].[Homologacion_Monedas]',
  },
};

// Componente FAB de diagnóstico
export const DiagnosticFab = ({ show, errorCount, onClick }) => {
  return (
    <Zoom in={show}>
      <Tooltip title="Ver diagnóstico de errores" placement="left">
        <Badge
          badgeContent={errorCount}
          color="error"
          max={99}
          sx={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 1000,
          }}
        >
          <Fab
            color="error"
            onClick={onClick}
            sx={{
              background: `linear-gradient(135deg, ${colors.error.main} 0%, ${colors.error.dark} 100%)`,
              boxShadow: `0 8px 32px ${alpha(colors.error.main, 0.4)}`,
              '&:hover': {
                background: `linear-gradient(135deg, ${colors.error.dark} 0%, ${colors.error.main} 100%)`,
                transform: 'scale(1.05)',
              },
              transition: 'all 0.3s ease',
            }}
          >
            <BugReportIcon />
          </Fab>
        </Badge>
      </Tooltip>
    </Zoom>
  );
};

// Componente de Error Individual Expandible
const ErrorLogItem = ({ log, index, allLogs }) => {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  // Extraer información adicional del mensaje de error
  const parseErrorDetails = (mensaje) => {
    const details = {
      originalMessage: mensaje,
      errorType: 'Error General',
      possibleCause: null,
      suggestion: null,
      relatedData: [],
    };

    // Detectar tipo de error
    if (mensaje.includes('timeout') || mensaje.includes('Timeout')) {
      details.errorType = 'Timeout de Conexión';
      details.possibleCause = 'La operación excedió el tiempo máximo permitido';
      details.suggestion = 'Verificar conectividad de red y estado del servidor de base de datos';
    } else if (mensaje.includes('connection') || mensaje.includes('Connection')) {
      details.errorType = 'Error de Conexión';
      details.possibleCause = 'No se pudo establecer conexión con la base de datos';
      details.suggestion = 'Verificar credenciales y disponibilidad del servidor';
    } else if (mensaje.includes('permission') || mensaje.includes('Permission') || mensaje.includes('denied')) {
      details.errorType = 'Error de Permisos';
      details.possibleCause = 'El usuario no tiene permisos suficientes';
      details.suggestion = 'Contactar al administrador de base de datos';
    } else if (mensaje.includes('syntax') || mensaje.includes('Syntax')) {
      details.errorType = 'Error de Sintaxis SQL';
      details.possibleCause = 'Query SQL mal formado';
      details.suggestion = 'Revisar el stored procedure correspondiente';
    } else if (mensaje.includes('null') || mensaje.includes('NULL')) {
      details.errorType = 'Error de Datos Nulos';
      details.possibleCause = 'Se encontraron valores nulos inesperados';
      details.suggestion = 'Verificar integridad de datos de entrada';
    } else if (mensaje.includes('duplicate') || mensaje.includes('Duplicate')) {
      details.errorType = 'Error de Duplicados';
      details.possibleCause = 'Se intentó insertar un registro duplicado';
      details.suggestion = 'Verificar datos existentes antes de insertar';
    } else if (mensaje.includes('foreign key') || mensaje.includes('constraint')) {
      details.errorType = 'Error de Integridad Referencial';
      details.possibleCause = 'Violación de restricción de clave foránea';
      details.suggestion = 'Verificar que los datos relacionados existan';
    }

    // Extraer datos relacionados del mensaje (números, IDs, etc.)
    const numbersMatch = mensaje.match(/\d+/g);
    if (numbersMatch) {
      details.relatedData = numbersMatch.slice(0, 5); // Máximo 5 números
    }

    return details;
  };

  const errorDetails = parseErrorDetails(log.mensaje);

  // Encontrar logs relacionados (cercanos en tiempo)
  const getRelatedLogs = () => {
    const currentTime = new Date(log.timestamp).getTime();
    return allLogs
      .filter((l, i) => {
        if (i === index) return false;
        const logTime = new Date(l.timestamp).getTime();
        return Math.abs(logTime - currentTime) < 5000; // Dentro de 5 segundos
      })
      .slice(0, 3);
  };

  const relatedLogs = getRelatedLogs();

  const handleCopy = () => {
    const fullText = `
Timestamp: ${new Date(log.timestamp).toLocaleString('es-CL')}
Tipo: ${log.tipo}
Mensaje: ${log.mensaje}
Tipo de Error: ${errorDetails.errorType}
${errorDetails.possibleCause ? `Posible Causa: ${errorDetails.possibleCause}` : ''}
${errorDetails.suggestion ? `Sugerencia: ${errorDetails.suggestion}` : ''}
    `.trim();
    navigator.clipboard.writeText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Paper
      elevation={expanded ? 3 : 1}
      sx={{
        mb: 1.5,
        borderRadius: borderRadius.md,
        overflow: 'hidden',
        border: `1px solid ${expanded ? colors.error.main : 'transparent'}`,
        transition: 'all 0.2s ease',
      }}
    >
      {/* Cabecera del error - clickeable */}
      <Box
        onClick={() => setExpanded(!expanded)}
        sx={{
          p: 2,
          cursor: 'pointer',
          backgroundColor: expanded ? alpha(colors.error.main, 0.08) : 'white',
          borderLeft: `4px solid ${colors.error.main}`,
          display: 'flex',
          alignItems: 'flex-start',
          gap: 2,
          '&:hover': {
            backgroundColor: alpha(colors.error.main, 0.05),
          },
        }}
      >
        <ErrorOutlineIcon sx={{ color: colors.error.main, mt: 0.3 }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            <Chip
              label={errorDetails.errorType}
              size="small"
              sx={{
                backgroundColor: alpha(colors.error.main, 0.1),
                color: colors.error.dark,
                fontWeight: 600,
                fontSize: '0.7rem',
              }}
            />
            <Typography variant="caption" sx={{ color: colors.text.tertiary, display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <AccessTimeIcon sx={{ fontSize: 12 }} />
              {new Date(log.timestamp).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 })}
            </Typography>
          </Box>
          <Typography
            variant="body2"
            sx={{
              color: colors.error.dark,
              fontFamily: 'monospace',
              fontSize: '0.8rem',
              wordBreak: 'break-word',
              whiteSpace: expanded ? 'pre-wrap' : 'nowrap',
              overflow: expanded ? 'visible' : 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {log.mensaje}
          </Typography>
        </Box>
        <IconButton size="small" sx={{ color: colors.text.tertiary }}>
          {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        </IconButton>
      </Box>

      {/* Detalles expandidos */}
      <Collapse in={expanded}>
        <Box sx={{ px: 3, py: 2, backgroundColor: alpha(colors.grey[500], 0.03) }}>
          {/* Análisis del error */}
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1, color: colors.text.primary }}>
              Análisis del Error
            </Typography>
            <List dense disablePadding>
              {errorDetails.possibleCause && (
                <ListItem disablePadding sx={{ mb: 0.5 }}>
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <InfoOutlinedIcon sx={{ fontSize: 18, color: colors.warning.main }} />
                  </ListItemIcon>
                  <ListItemText
                    primary="Posible Causa"
                    secondary={errorDetails.possibleCause}
                    primaryTypographyProps={{ variant: 'caption', fontWeight: 600 }}
                    secondaryTypographyProps={{ variant: 'body2' }}
                  />
                </ListItem>
              )}
              {errorDetails.suggestion && (
                <ListItem disablePadding sx={{ mb: 0.5 }}>
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <CheckCircleOutlineIcon sx={{ fontSize: 18, color: colors.success.main }} />
                  </ListItemIcon>
                  <ListItemText
                    primary="Sugerencia"
                    secondary={errorDetails.suggestion}
                    primaryTypographyProps={{ variant: 'caption', fontWeight: 600 }}
                    secondaryTypographyProps={{ variant: 'body2' }}
                  />
                </ListItem>
              )}
            </List>
          </Box>

          {/* Información técnica */}
          <Box sx={{ mb: 2, p: 1.5, backgroundColor: colors.grey[900], borderRadius: borderRadius.sm }}>
            <Typography variant="caption" sx={{ color: colors.grey[400], fontWeight: 600, display: 'block', mb: 1 }}>
              Información Técnica
            </Typography>
            <Typography
              variant="body2"
              sx={{
                fontFamily: 'monospace',
                fontSize: '0.75rem',
                color: colors.grey[300],
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
              }}
            >
              {`Timestamp: ${log.timestamp}
Index: ${index}
Tipo: ${log.tipo}
Mensaje completo:
${log.mensaje}`}
            </Typography>
          </Box>

          {/* Datos relacionados encontrados */}
          {errorDetails.relatedData.length > 0 && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="caption" sx={{ fontWeight: 600, color: colors.text.secondary }}>
                Valores detectados en el mensaje:
              </Typography>
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
                {errorDetails.relatedData.map((val, i) => (
                  <Chip key={i} label={val} size="small" variant="outlined" sx={{ fontSize: '0.7rem' }} />
                ))}
              </Box>
            </Box>
          )}

          {/* Logs relacionados */}
          {relatedLogs.length > 0 && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="caption" sx={{ fontWeight: 600, color: colors.text.secondary, display: 'block', mb: 1 }}>
                Logs cercanos en tiempo:
              </Typography>
              {relatedLogs.map((relLog, i) => (
                <Box
                  key={i}
                  sx={{
                    p: 1,
                    mb: 0.5,
                    backgroundColor: alpha(
                      relLog.tipo === 'error' ? colors.error.main :
                      relLog.tipo === 'warning' ? colors.warning.main :
                      relLog.tipo === 'success' ? colors.success.main : colors.info.main,
                      0.1
                    ),
                    borderRadius: borderRadius.sm,
                    fontSize: '0.75rem',
                  }}
                >
                  <Typography variant="caption" sx={{ color: colors.text.tertiary }}>
                    {new Date(relLog.timestamp).toLocaleTimeString('es-CL')} - {relLog.tipo}
                  </Typography>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.7rem' }}>
                    {relLog.mensaje.substring(0, 100)}{relLog.mensaje.length > 100 ? '...' : ''}
                  </Typography>
                </Box>
              ))}
            </Box>
          )}

          {/* Botón copiar */}
          <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Tooltip title={copied ? '¡Copiado!' : 'Copiar detalles'}>
              <IconButton size="small" onClick={handleCopy}>
                {copied ? <CheckCircleOutlineIcon color="success" /> : <ContentCopyIcon />}
              </IconButton>
            </Tooltip>
          </Box>
        </Box>
      </Collapse>
    </Paper>
  );
};

// Componente principal del panel
const DiagnosticPanel = ({ open, onClose, fechaProceso, errorLogs = [] }) => {
  const [loading, setLoading] = useState(false);
  const [diagnosticData, setDiagnosticData] = useState(null);
  const [error, setError] = useState(null);
  const [expandedTables, setExpandedTables] = useState({});
  const [activeTab, setActiveTab] = useState(0);

  // Cargar datos de diagnóstico
  const loadDiagnosticData = useCallback(async () => {
    if (!fechaProceso) return;

    setLoading(true);
    setError(null);

    try {
      const response = await apiClient.get(`/procesos/diagnostico/${fechaProceso}`);
      if (response.success) {
        setDiagnosticData(response.data);
        // Auto-expandir tablas con datos
        const expanded = {};
        Object.keys(response.data.summary).forEach(key => {
          if (response.data.summary[key] > 0) {
            expanded[key] = false; // Empezar colapsado, el usuario expande
          }
        });
        setExpandedTables(expanded);
      } else {
        setError(response.error || 'Error al cargar diagnóstico');
      }
    } catch (err) {
      setError(err.message || 'Error de conexión');
    } finally {
      setLoading(false);
    }
  }, [fechaProceso]);

  useEffect(() => {
    if (open && fechaProceso) {
      loadDiagnosticData();
    }
  }, [open, fechaProceso, loadDiagnosticData]);

  const handleAccordionChange = (tableKey) => (event, isExpanded) => {
    setExpandedTables(prev => ({
      ...prev,
      [tableKey]: isExpanded,
    }));
  };

  // Formatear valor de celda
  const formatCellValue = (value, columnName) => {
    if (value === null || value === undefined) return '-';
    if (typeof value === 'number') {
      // Formatear diferencias y valores monetarios con más decimales
      if (columnName?.includes('Diferencia') || columnName?.includes('MV') || columnName?.includes('MTM')) {
        return value.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
      }
      return value.toLocaleString('es-CL', { maximumFractionDigits: 2 });
    }
    if (value instanceof Date || (typeof value === 'string' && value.includes('T'))) {
      try {
        const date = new Date(value);
        return date.toLocaleDateString('es-CL');
      } catch {
        return value;
      }
    }
    return String(value);
  };

  // Contar total de problemas en sandbox
  const totalSandboxProblems = diagnosticData?.totalProblemas || 0;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      disableScrollLock
      PaperProps={{
        sx: {
          borderRadius: borderRadius.lg,
          maxHeight: '90vh',
          minHeight: '70vh',
        },
      }}
    >
      <DialogTitle
        sx={{
          background: `linear-gradient(135deg, ${colors.error.main} 0%, ${colors.error.dark} 100%)`,
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          py: 2,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <BugReportIcon sx={{ fontSize: 28 }} />
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 600, lineHeight: 1.2 }}>
              Diagnóstico de Ejecución
            </Typography>
            <Typography variant="caption" sx={{ opacity: 0.9 }}>
              Fecha de proceso: {fechaProceso}
            </Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Box sx={{ textAlign: 'right' }}>
            <Typography variant="caption" sx={{ opacity: 0.8, display: 'block' }}>
              Errores: {errorLogs.length} | Sandbox: {totalSandboxProblems}
            </Typography>
          </Box>
          <IconButton onClick={onClose} sx={{ color: 'white' }}>
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      {/* Tabs para navegación */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', backgroundColor: colors.grey[50] }}>
        <Tabs
          value={activeTab}
          onChange={(e, newValue) => setActiveTab(newValue)}
          sx={{
            '& .MuiTab-root': {
              textTransform: 'none',
              fontWeight: 500,
            },
          }}
        >
          <Tab
            icon={<ErrorOutlineIcon />}
            iconPosition="start"
            label={`Errores de Ejecución (${errorLogs.length})`}
            sx={{ color: errorLogs.length > 0 ? colors.error.main : 'inherit' }}
          />
          <Tab
            icon={<TableViewIcon />}
            iconPosition="start"
            label={`Tablas Sandbox (${totalSandboxProblems})`}
            sx={{ color: totalSandboxProblems > 0 ? colors.warning.main : 'inherit' }}
          />
        </Tabs>
      </Box>

      <DialogContent sx={{ p: 0 }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 8 }}>
            <CircularProgress />
          </Box>
        ) : error ? (
          <Alert severity="error" sx={{ m: 3 }}>{error}</Alert>
        ) : (
          <Box>
            {/* Tab 0: Errores de Ejecución */}
            {activeTab === 0 && (
              <Box sx={{ p: 3 }}>
                {errorLogs.length > 0 ? (
                  <>
                    <Alert severity="info" sx={{ mb: 2 }}>
                      Haz clic en cada error para ver más detalles, análisis y sugerencias de resolución.
                    </Alert>
                    <Box sx={{ maxHeight: 'calc(70vh - 200px)', overflow: 'auto' }}>
                      {errorLogs.map((log, index) => (
                        <ErrorLogItem key={index} log={log} index={index} allLogs={errorLogs} />
                      ))}
                    </Box>
                  </>
                ) : (
                  <Alert severity="success">
                    No se encontraron errores en el log de ejecución.
                  </Alert>
                )}
              </Box>
            )}

            {/* Tab 1: Tablas Sandbox */}
            {activeTab === 1 && diagnosticData && (
              <Box sx={{ p: 3 }}>
                {/* Cards de resumen */}
                <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <StorageIcon color="primary" />
                  Registros Pendientes por Categoría
                </Typography>
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                    gap: 2,
                    mb: 3,
                  }}
                >
                  {Object.entries(SANDBOX_TABLES).map(([key, config]) => {
                    const count = diagnosticData.summary[key] || 0;
                    return (
                      <Box
                        key={key}
                        sx={{
                          p: 2,
                          borderRadius: borderRadius.md,
                          backgroundColor: count > 0 ? alpha(config.color, 0.08) : alpha(colors.grey[500], 0.05),
                          border: `1px solid ${count > 0 ? alpha(config.color, 0.3) : 'transparent'}`,
                          transition: 'all 0.2s ease',
                          cursor: count > 0 ? 'pointer' : 'default',
                          '&:hover': count > 0 ? {
                            backgroundColor: alpha(config.color, 0.12),
                            transform: 'translateY(-2px)',
                            boxShadow: `0 4px 12px ${alpha(config.color, 0.2)}`,
                          } : {},
                        }}
                        onClick={() => count > 0 && setExpandedTables(prev => ({ ...prev, [key]: !prev[key] }))}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                          <Box sx={{ color: count > 0 ? config.color : colors.grey[400] }}>
                            {config.icon}
                          </Box>
                          <Typography
                            variant="h5"
                            sx={{
                              fontWeight: 700,
                              color: count > 0 ? config.color : colors.grey[400],
                            }}
                          >
                            {count}
                          </Typography>
                        </Box>
                        <Typography
                          variant="caption"
                          sx={{
                            color: count > 0 ? colors.text.primary : colors.text.secondary,
                            fontWeight: 500,
                          }}
                        >
                          {config.label}
                        </Typography>
                      </Box>
                    );
                  })}
                </Box>

                {/* Acordeones con detalles de tablas */}
                <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
                  Detalle de Registros
                </Typography>
                <Box sx={{ maxHeight: 'calc(70vh - 350px)', overflow: 'auto' }}>
                  {Object.entries(SANDBOX_TABLES).map(([key, config]) => {
                    const data = diagnosticData.detalles[key] || [];
                    if (data.length === 0) return null;

                    return (
                      <Accordion
                        key={key}
                        expanded={expandedTables[key] || false}
                        onChange={handleAccordionChange(key)}
                        sx={{
                          mb: 1,
                          borderRadius: `${borderRadius.md} !important`,
                          '&:before': { display: 'none' },
                          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                          overflow: 'hidden',
                        }}
                      >
                        <AccordionSummary
                          expandIcon={<ExpandMoreIcon />}
                          sx={{
                            backgroundColor: alpha(config.color, 0.08),
                            '&:hover': { backgroundColor: alpha(config.color, 0.12) },
                          }}
                        >
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, width: '100%' }}>
                            <Box sx={{ color: config.color }}>{config.icon}</Box>
                            <Box sx={{ flex: 1 }}>
                              <Typography sx={{ fontWeight: 600 }}>{config.label}</Typography>
                              <Typography variant="caption" color="text.secondary">
                                {config.description} | Tabla: {config.tableName}
                              </Typography>
                            </Box>
                            <Chip
                              label={`${data.length} registros`}
                              size="small"
                              sx={{
                                backgroundColor: config.color,
                                color: 'white',
                                fontWeight: 600,
                              }}
                            />
                          </Box>
                        </AccordionSummary>
                        <AccordionDetails sx={{ p: 0 }}>
                          <TableContainer component={Paper} elevation={0} sx={{ maxHeight: 350 }}>
                            <Table stickyHeader size="small">
                              <TableHead>
                                <TableRow>
                                  <TableCell
                                    sx={{
                                      fontWeight: 600,
                                      backgroundColor: alpha(config.color, 0.1),
                                      color: config.color,
                                      width: 40,
                                    }}
                                  >
                                    #
                                  </TableCell>
                                  {config.columns.map((col) => (
                                    <TableCell
                                      key={col}
                                      sx={{
                                        fontWeight: 600,
                                        backgroundColor: alpha(config.color, 0.1),
                                        color: config.color,
                                      }}
                                    >
                                      {col}
                                    </TableCell>
                                  ))}
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {data.map((row, idx) => (
                                  <TableRow
                                    key={idx}
                                    sx={{
                                      '&:nth-of-type(odd)': { backgroundColor: alpha(colors.grey[500], 0.03) },
                                      '&:hover': { backgroundColor: alpha(config.color, 0.05) },
                                    }}
                                  >
                                    <TableCell sx={{ color: colors.text.tertiary, fontSize: 11 }}>
                                      {idx + 1}
                                    </TableCell>
                                    {config.columns.map((col) => (
                                      <TableCell key={col} sx={{ fontFamily: 'monospace', fontSize: 12 }}>
                                        {formatCellValue(row[col], col)}
                                      </TableCell>
                                    ))}
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </TableContainer>
                        </AccordionDetails>
                      </Accordion>
                    );
                  })}
                </Box>

                {diagnosticData.totalProblemas === 0 && (
                  <Alert severity="success" sx={{ mt: 2 }}>
                    No se encontraron registros pendientes en las tablas sandbox para esta fecha.
                  </Alert>
                )}
              </Box>
            )}
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default DiagnosticPanel;
