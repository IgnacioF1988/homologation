/**
 * QueueResolverModal - Modal para resolver items de las colas sandbox
 * Permite asignar IDs, confirmar suciedades de forma elegante
 *
 * Para suciedades: Solo existe la opción "Confirmar Suciedad" que escribe en tabla de stock
 *
 * Diseño: Sigue la paleta Ocean Blue + Slate grays del sistema
 */

import { useState, useEffect, useCallback, useMemo, memo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  Box,
  Typography,
  IconButton,
  Paper,
  Button,
  TextField,
  Autocomplete,
  Chip,
  CircularProgress,
  alpha,
  Divider,
  Tooltip,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  ToggleButton,
  ToggleButtonGroup,
  FormControlLabel,
  Switch,
  Grid,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import CurrencyExchangeIcon from '@mui/icons-material/CurrencyExchange';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import BalanceIcon from '@mui/icons-material/Balance';
import FilterListIcon from '@mui/icons-material/FilterList';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import LinkIcon from '@mui/icons-material/Link';
import NewReleasesIcon from '@mui/icons-material/NewReleases';
import { colors, shadows, borderRadius } from '../../styles/theme';
import { sandboxQueuesService } from '../../services/sandboxQueuesService';

// ============================================
// CONFIGURACIÓN POR TIPO DE COLA
// Usa colores del tema para consistencia visual
// ============================================
const QUEUE_CONFIG = {
  fondos: {
    icon: AccountBalanceIcon,
    color: colors.success.main,  // Esmeralda del tema
    colorLight: colors.success.light,
    colorDark: colors.success.dark,
    title: 'Resolver Fondos Pendientes',
    itemLabel: (item) => item.nombreFondo,
    itemSubLabel: (item) => `Fuente: ${item.fuente} | Fecha: ${item.fechaReporte}`,
    assignField: 'idFund',
    assignLabel: 'Asignar a Fondo Existente',
    optionLabel: (opt) => `${opt.nombre} - ${opt.nombreCompleto || ''} (ID: ${opt.id})`,
    optionSubLabel: (opt) => `Moneda: ${opt.moneda || 'N/A'} | ${opt.activo ? 'Activo' : 'Inactivo'}`,
    supportsNewCreation: true,  // Permite crear nuevo fondo
    newCreationLabel: 'Crear Nuevo Fondo',
    existingLabel: 'Asignar a Existente',
  },
  monedas: {
    icon: CurrencyExchangeIcon,
    color: colors.warning.main,  // Ámbar del tema
    colorLight: colors.warning.light,
    colorDark: colors.warning.dark,
    title: 'Resolver Monedas Pendientes',
    itemLabel: (item) => item.nombreMoneda,
    itemSubLabel: (item) => `Fuente: ${item.fuente}`,
    assignField: 'idMoneda',
    assignLabel: 'Asignar ID Moneda',
    optionLabel: (opt) => `${opt.nombre} (ID: ${opt.id})`,
  },
  benchmarks: {
    icon: TrendingUpIcon,
    color: colors.secondary.main,  // Indigo del tema
    colorLight: colors.secondary.light,
    colorDark: colors.secondary.dark,
    title: 'Resolver Benchmarks Pendientes',
    itemLabel: (item) => item.nombreBenchmark,
    itemSubLabel: (item) => `Fuente: ${item.fuente}`,
    assignField: 'idBenchmark',
    assignLabel: 'Asignar a Benchmark Existente',
    optionLabel: (opt) => `${opt.nombre} (ID: ${opt.id})`,
    optionSubLabel: (opt) => `Moneda: ${opt.moneda || 'N/A'}`,
    supportsNewCreation: true,  // Permite crear nuevo benchmark
    newCreationLabel: 'Crear Nuevo Benchmark',
    existingLabel: 'Asignar a Existente',
  },
  suciedades: {
    icon: WarningAmberIcon,
    color: colors.error.main,  // Rosa/Rojo del tema
    colorLight: colors.error.light,
    colorDark: colors.error.dark,
    title: 'Validar Suciedades',
    itemLabel: (item) => item.investId,
    itemSubLabel: (item) => `Portfolio: ${item.portfolio} | Qty: ${item.qty?.toFixed(2)}`,
    isSuciedad: true,
    hasPortfolioFilter: true,
  },
  descuadres: {
    icon: BalanceIcon,
    color: colors.info.main,  // Sky blue del tema
    colorLight: colors.info.light,
    colorDark: colors.info.dark,
    title: 'Validar Descuadres',
    itemLabel: (item) => `${item.portfolio} - ${item.tipoDescuadre || 'IPA-Derivados'}`,
    itemSubLabel: (item) => {
      const tipo = item.tipoDescuadre || 'IPA-Derivados';
      if (tipo === 'IPA-SONA') {
        return `IPA: ${item.mvBookIPA?.toLocaleString()} | SONA: ${item.mtmDerivados?.toLocaleString()} | Diff: ${item.diferencia?.toLocaleString()}`;
      }
      return `IPA: ${item.mvBookIPA?.toLocaleString()} | Derivados: ${item.mtmDerivados?.toLocaleString()} | Diff: ${item.diferencia?.toLocaleString()}`;
    },
    isAlert: true,
    hasTypeFilter: true,  // Habilitar filtro por tipo de descuadre
    hasObservaciones: true,  // Habilitar campo de observaciones
    actions: [
      { key: 'aprobar', label: 'Aprobar diferencia', color: colors.success.main },
      { key: 'rechazar', label: 'Rechazar', color: colors.error.main },
    ],
  },
};

// ============================================
// COMPONENTE: Item Card
// Diseño premium con bordes sutiles y transiciones suaves
// ============================================
const ItemCard = memo(({ item, config, selected, onClick }) => {
  const IconComponent = config.icon;

  return (
    <Paper
      elevation={0}
      onClick={onClick}
      sx={{
        p: 2,
        mb: 1.5,
        borderRadius: borderRadius.md,
        border: `1px solid ${selected ? alpha(config.color, 0.4) : colors.border.light}`,
        backgroundColor: selected ? alpha(config.color, 0.04) : colors.background.paper,
        cursor: 'pointer',
        transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        boxShadow: selected ? `0 0 0 3px ${alpha(config.color, 0.1)}` : 'none',
        '&:hover': {
          borderColor: alpha(config.color, 0.3),
          backgroundColor: alpha(config.color, 0.02),
          transform: 'translateX(4px)',
          boxShadow: shadows.sm,
        },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Box
          sx={{
            width: 40,
            height: 40,
            borderRadius: borderRadius.sm,
            background: selected
              ? `linear-gradient(135deg, ${config.color} 0%, ${config.colorDark || config.color} 100%)`
              : alpha(config.color, 0.08),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s ease',
          }}
        >
          <IconComponent sx={{
            fontSize: 20,
            color: selected ? '#fff' : config.color,
            transition: 'color 0.2s ease',
          }} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            variant="subtitle2"
            sx={{
              fontWeight: 600,
              color: colors.text.primary,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontSize: '0.875rem',
              letterSpacing: '-0.01em',
            }}
          >
            {config.itemLabel(item)}
          </Typography>
          <Typography
            variant="caption"
            sx={{
              color: colors.text.tertiary,
              fontSize: '0.75rem',
              display: 'block',
              mt: 0.25,
            }}
          >
            {config.itemSubLabel(item)}
          </Typography>
        </Box>
        {selected && (
          <CheckCircleIcon sx={{ fontSize: 20, color: config.color }} />
        )}
      </Box>
    </Paper>
  );
});

ItemCard.displayName = 'ItemCard';

// ============================================
// COMPONENTE PRINCIPAL
// ============================================
const QueueResolverModal = ({ open, queueType, onClose }) => {
  const [allItems, setAllItems] = useState([]);
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(null);
  const [portfolioFilter, setPortfolioFilter] = useState('');
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [descuadreTypeFilter, setDescuadreTypeFilter] = useState('');
  const [observaciones, setObservaciones] = useState('');

  // Estados para modo nuevo vs existente
  const [creationMode, setCreationMode] = useState('existing'); // 'existing' | 'new'

  // Opciones dinámicas cargadas desde el backend
  const [formOptions, setFormOptions] = useState({
    monedas: [],
    estrategiasConsFondo: [],
    estrategiasComparador: [],
    benchmarks: [],
  });

  // Campos para nuevo fondo
  const [newFundData, setNewFundData] = useState({
    fundShortName: '',
    fundName: '',
    fundBaseCurrency: '1', // USD por defecto
    estrategiaConsFondo: '',
    estrategiaComparador: '',
    bm1: '',
    bm2: '',
    flagDerivados: false,
    flagUBS: false,
  });

  // Campos para nuevo benchmark
  const [newBenchmarkData, setNewBenchmarkData] = useState({
    fundShortName: '',
    bmName: '',
    fundBaseCurrency: '1', // USD por defecto
    estrategia: '',
  });

  const config = queueType ? QUEUE_CONFIG[queueType] : null;

  // Obtener lista única de portfolios para el filtro
  const uniquePortfolios = useMemo(() => {
    if (!config?.hasPortfolioFilter) return [];
    const portfolios = [...new Set(allItems.map(item => item.portfolio))].sort();
    return portfolios;
  }, [allItems, config?.hasPortfolioFilter]);

  // Obtener lista única de tipos de descuadre para el filtro
  const uniqueDescuadreTypes = useMemo(() => {
    if (!config?.hasTypeFilter) return [];
    const types = [...new Set(allItems.map(item => item.tipoDescuadre || 'IPA-Derivados'))].sort();
    return types;
  }, [allItems, config?.hasTypeFilter]);

  // Items filtrados por portfolio y/o tipo de descuadre
  const items = useMemo(() => {
    let filtered = allItems;
    if (portfolioFilter && config?.hasPortfolioFilter) {
      filtered = filtered.filter(item => item.portfolio === portfolioFilter);
    }
    if (descuadreTypeFilter && config?.hasTypeFilter) {
      filtered = filtered.filter(item => (item.tipoDescuadre || 'IPA-Derivados') === descuadreTypeFilter);
    }
    return filtered;
  }, [allItems, portfolioFilter, descuadreTypeFilter, config?.hasPortfolioFilter, config?.hasTypeFilter]);

  const currentItem = items[selectedIndex];

  // Cargar items de la cola
  const loadItems = useCallback(async () => {
    if (!queueType) return;
    setLoading(true);
    try {
      const response = await sandboxQueuesService.getQueue(queueType, { estado: 'pendiente' });
      if (response.success) {
        setAllItems(response.data);
        setSelectedIndex(0);
      }
    } catch (err) {
      console.error('Error cargando items:', err);
    } finally {
      setLoading(false);
    }
  }, [queueType]);

  // Cargar opciones para asignación
  const loadOptions = useCallback(async () => {
    if (!queueType || config?.isSuciedad || config?.isAlert) return;
    setLoadingOptions(true);
    try {
      const response = await sandboxQueuesService.getOptions(queueType);
      if (response.success) {
        setOptions(response.data);
      }
    } catch (err) {
      console.error('Error cargando opciones:', err);
    } finally {
      setLoadingOptions(false);
    }
  }, [queueType, config?.isSuciedad, config?.isAlert]);

  // Cargar opciones del formulario para fondos y benchmarks (monedas, estrategias, benchmarks)
  const loadFormOptions = useCallback(async () => {
    if (queueType !== 'fondos' && queueType !== 'benchmarks') return;
    try {
      const response = await sandboxQueuesService.getFundFormOptions();
      if (response.success) {
        setFormOptions(response.data);
      }
    } catch (err) {
      console.error('Error cargando opciones de formulario:', err);
    }
  }, [queueType]);

  useEffect(() => {
    if (open && queueType) {
      loadItems();
      loadOptions();
      loadFormOptions();
      setSelectedOption(null);
      setSuccess(null);
      setPortfolioFilter('');
      setDescuadreTypeFilter('');
      setObservaciones('');
      setCreationMode('existing');
      setNewFundData({
        fundShortName: '',
        fundName: '',
        fundBaseCurrency: '',
        estrategiaConsFondo: '',
        estrategiaComparador: '',
        bm1: '',
        bm2: '',
        flagDerivados: false,
        flagUBS: false,
      });
      setNewBenchmarkData({
        fundShortName: '',
        bmName: '',
        fundBaseCurrency: '1',
        estrategia: '',
      });
    }
  }, [open, queueType, loadItems, loadOptions, loadFormOptions]);

  // Reset selectedIndex cuando cambia el filtro
  useEffect(() => {
    setSelectedIndex(0);
  }, [portfolioFilter, descuadreTypeFilter]);

  // Resolver item actual
  const handleResolve = async (action = null) => {
    if (!currentItem) return;

    setSaving(true);
    try {
      if (config.isSuciedad) {
        // Para suciedades: escribir en tabla de stock
        await sandboxQueuesService.resolveItem(queueType, currentItem.id, {
          investId: currentItem.investId,
          portfolio: currentItem.portfolio,
          qty: currentItem.qty,
          estado: 'Suciedad',
        });
      } else if (config.isAlert) {
        // Para alertas (descuadres) - usar resolve para escribir en historial
        await sandboxQueuesService.resolveItem(queueType, currentItem.id, {
          accion: action,
          observaciones: observaciones || null,
        });
        setObservaciones(''); // Limpiar observaciones después de resolver
      } else if (config.supportsNewCreation && creationMode === 'new') {
        // Modo CREAR NUEVO (fondo o benchmark)
        if (queueType === 'fondos') {
          // Validar campos requeridos para nuevo fondo
          if (!newFundData.fundShortName || !newFundData.fundName || !newFundData.fundBaseCurrency) {
            alert('Complete los campos obligatorios: Nombre Corto, Nombre Completo y Moneda Base');
            setSaving(false);
            return;
          }
          // Buscar el id_CURR correspondiente a la moneda seleccionada
          const monedaSeleccionada = formOptions.monedas.find(m => m.id.toString() === newFundData.fundBaseCurrency);
          await sandboxQueuesService.resolveItem(queueType, currentItem.id, {
            createNew: true,
            fundShortName: newFundData.fundShortName,
            fundName: newFundData.fundName,
            fundBaseCurrency: newFundData.fundBaseCurrency,
            idCurr: monedaSeleccionada?.id || null,
            estrategiaConsFondo: newFundData.estrategiaConsFondo || null,
            estrategiaComparador: newFundData.estrategiaComparador || null,
            bm1: newFundData.bm1 || null,
            bm2: newFundData.bm2 || null,
            flagDerivados: newFundData.flagDerivados,
            flagUBS: newFundData.flagUBS,
          });
        } else if (queueType === 'benchmarks') {
          // Validar campos requeridos para nuevo benchmark
          if (!newBenchmarkData.fundShortName || !newBenchmarkData.bmName) {
            alert('Complete los campos obligatorios: Código y Nombre del Benchmark');
            setSaving(false);
            return;
          }
          await sandboxQueuesService.resolveItem(queueType, currentItem.id, {
            createNew: true,
            fundShortName: newBenchmarkData.fundShortName,
            bmName: newBenchmarkData.bmName,
            fundBaseCurrency: newBenchmarkData.fundBaseCurrency,
            estrategia: newBenchmarkData.estrategia || null,
          });
        }
        // Resetear formularios
        setNewFundData({
          fundShortName: '',
          fundName: '',
          fundBaseCurrency: '',
          estrategiaConsFondo: '',
          estrategiaComparador: '',
          bm1: '',
          bm2: '',
          flagDerivados: false,
          flagUBS: false,
        });
        setNewBenchmarkData({
          fundShortName: '',
          bmName: '',
          fundBaseCurrency: '1',
          estrategia: '',
        });
      } else {
        // Modo ASIGNAR A EXISTENTE (homologaciones tradicionales)
        if (!selectedOption) {
          alert('Seleccione una opción para asignar');
          setSaving(false);
          return;
        }
        await sandboxQueuesService.resolveItem(queueType, currentItem.id, {
          [config.assignField]: selectedOption.id,
        });
      }

      setSuccess(`${config.itemLabel(currentItem)} confirmado exitosamente`);

      // Remover item de la lista
      const newAllItems = allItems.filter(item => item.id !== currentItem.id);
      setAllItems(newAllItems);

      // Ajustar índice
      const newFilteredItems = portfolioFilter
        ? newAllItems.filter(item => item.portfolio === portfolioFilter)
        : newAllItems;
      setSelectedIndex(Math.min(selectedIndex, Math.max(0, newFilteredItems.length - 1)));
      setSelectedOption(null);
      setCreationMode('existing'); // Volver al modo existente

      // Limpiar mensaje después de 2s
      setTimeout(() => setSuccess(null), 2000);

      // Si no hay más items (totales), cerrar
      if (newAllItems.length === 0) {
        setTimeout(onClose, 1500);
      }
    } catch (err) {
      console.error('Error resolviendo:', err);
      alert('Error al resolver: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Confirmar todas las suciedades del portfolio filtrado (en batch)
  const handleBulkConfirm = async () => {
    if (!config?.isSuciedad || items.length === 0) return;

    const confirmMsg = portfolioFilter
      ? `¿Confirmar las ${items.length} suciedades del portfolio "${portfolioFilter}"?`
      : `¿Confirmar todas las ${items.length} suciedades?`;

    if (!window.confirm(confirmMsg)) return;

    setBulkProcessing(true);

    try {
      // Preparar items para batch
      const batchItems = items.map(item => ({
        id: item.id,
        asignacion: {
          investId: item.investId,
          portfolio: item.portfolio,
          qty: item.qty,
          estado: 'Suciedad',
        },
      }));

      // Ejecutar en una sola llamada
      const response = await sandboxQueuesService.resolveItemsBatch(queueType, batchItems);

      // Recargar items
      await loadItems();

      const processed = response.results?.success || items.length;
      const errors = response.results?.failed || 0;

      setSuccess(`${processed} suciedades confirmadas${errors > 0 ? ` (${errors} errores)` : ''}`);
      setTimeout(() => setSuccess(null), 3000);

      // Si no hay más items, cerrar
      if (errors === 0) {
        const remaining = allItems.filter(item =>
          portfolioFilter ? item.portfolio !== portfolioFilter : false
        );
        if (remaining.length === 0) {
          setTimeout(onClose, 1500);
        }
      }
    } catch (err) {
      console.error('Error en batch:', err);
      setSuccess({ type: 'error', message: 'Error al procesar las suciedades: ' + err.message });
    } finally {
      setBulkProcessing(false);
    }
  };

  // Navegación
  const goNext = () => setSelectedIndex((prev) => Math.min(prev + 1, items.length - 1));
  const goPrev = () => setSelectedIndex((prev) => Math.max(prev - 1, 0));

  if (!config) return null;

  const IconComponent = config.icon;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: borderRadius['2xl'],
          overflow: 'hidden',
          maxHeight: '85vh',
          boxShadow: shadows.floating,
        },
      }}
    >
      {/* Header - Diseño premium con gradiente sutil */}
      <DialogTitle
        sx={{
          background: colors.background.paper,
          borderBottom: `1px solid ${colors.border.light}`,
          py: 2.5,
          px: 3,
          position: 'relative',
          '&::before': {
            content: '""',
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '3px',
            background: `linear-gradient(90deg, ${config.color} 0%, ${config.colorLight || config.color} 100%)`,
          },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2.5 }}>
            <Box
              sx={{
                width: 52,
                height: 52,
                borderRadius: borderRadius.lg,
                background: `linear-gradient(135deg, ${config.color} 0%, ${config.colorDark || config.color} 100%)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: `0 8px 24px ${alpha(config.color, 0.3)}`,
              }}
            >
              <IconComponent sx={{ fontSize: 26, color: '#fff' }} />
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
                {config.title}
              </Typography>
              <Typography
                variant="body2"
                sx={{
                  color: colors.text.tertiary,
                  mt: 0.25,
                }}
              >
                {items.length} pendiente{items.length !== 1 ? 's' : ''}
                {portfolioFilter && ` en ${portfolioFilter}`}
                {allItems.length !== items.length && ` (${allItems.length} total)`}
              </Typography>
            </Box>
          </Box>
          <IconButton
            onClick={onClose}
            sx={{
              color: colors.text.secondary,
              '&:hover': {
                backgroundColor: colors.grey[100],
              },
            }}
          >
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent sx={{ p: 0 }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 10 }}>
            <CircularProgress sx={{ color: config.color }} size={40} thickness={4} />
          </Box>
        ) : allItems.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 10, px: 4 }}>
            <Box
              sx={{
                width: 80,
                height: 80,
                borderRadius: '50%',
                background: colors.success.bg,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                mx: 'auto',
                mb: 3,
              }}
            >
              <CheckCircleIcon sx={{ fontSize: 40, color: colors.success.main }} />
            </Box>
            <Typography
              variant="h6"
              sx={{
                color: colors.text.primary,
                fontWeight: 700,
                mb: 1,
                letterSpacing: '-0.02em',
              }}
            >
              ¡Todo resuelto!
            </Typography>
            <Typography variant="body2" sx={{ color: colors.text.tertiary }}>
              No hay más items pendientes en esta cola
            </Typography>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', height: '60vh' }}>
            {/* Lista de items - Sidebar */}
            <Box
              sx={{
                width: 360,
                borderRight: `1px solid ${colors.border.light}`,
                display: 'flex',
                flexDirection: 'column',
                backgroundColor: colors.grey[50],
              }}
            >
              {/* Filtro por portfolio */}
              {config.hasPortfolioFilter && uniquePortfolios.length >= 1 && (
                <Box
                  sx={{
                    p: 2,
                    borderBottom: `1px solid ${colors.border.light}`,
                    backgroundColor: colors.background.paper,
                  }}
                >
                  <FormControl fullWidth size="small">
                    <InputLabel sx={{ fontSize: '0.875rem' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <FilterListIcon sx={{ fontSize: 16 }} />
                        Filtrar por Portfolio
                      </Box>
                    </InputLabel>
                    <Select
                      value={portfolioFilter}
                      onChange={(e) => setPortfolioFilter(e.target.value)}
                      label="Filtrar por Portfolio..."
                      sx={{
                        borderRadius: borderRadius.sm,
                        backgroundColor: colors.background.paper,
                        '& .MuiOutlinedInput-notchedOutline': {
                          borderColor: colors.border.default,
                        },
                        '&:hover .MuiOutlinedInput-notchedOutline': {
                          borderColor: config.color,
                        },
                        '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                          borderColor: config.color,
                        },
                      }}
                    >
                      <MenuItem value="">
                        <em>Todos los portfolios ({allItems.length})</em>
                      </MenuItem>
                      {uniquePortfolios.map(portfolio => {
                        const count = allItems.filter(i => i.portfolio === portfolio).length;
                        return (
                          <MenuItem key={portfolio} value={portfolio}>
                            {portfolio} ({count})
                          </MenuItem>
                        );
                      })}
                    </Select>
                  </FormControl>
                </Box>
              )}

              {/* Filtro por tipo de descuadre */}
              {config.hasTypeFilter && uniqueDescuadreTypes.length >= 1 && (
                <Box
                  sx={{
                    p: 2,
                    borderBottom: `1px solid ${colors.border.light}`,
                    backgroundColor: colors.background.paper,
                  }}
                >
                  <FormControl fullWidth size="small">
                    <InputLabel sx={{ fontSize: '0.875rem' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <BalanceIcon sx={{ fontSize: 16 }} />
                        Filtrar por Tipo
                      </Box>
                    </InputLabel>
                    <Select
                      value={descuadreTypeFilter}
                      onChange={(e) => setDescuadreTypeFilter(e.target.value)}
                      label="Filtrar por Tipo..."
                      sx={{
                        borderRadius: borderRadius.sm,
                        backgroundColor: colors.background.paper,
                        '& .MuiOutlinedInput-notchedOutline': {
                          borderColor: colors.border.default,
                        },
                        '&:hover .MuiOutlinedInput-notchedOutline': {
                          borderColor: config.color,
                        },
                        '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                          borderColor: config.color,
                        },
                      }}
                    >
                      <MenuItem value="">
                        <em>Todos los tipos ({allItems.length})</em>
                      </MenuItem>
                      {uniqueDescuadreTypes.map(tipo => {
                        const count = allItems.filter(i => (i.tipoDescuadre || 'IPA-Derivados') === tipo).length;
                        return (
                          <MenuItem key={tipo} value={tipo}>
                            {tipo} ({count})
                          </MenuItem>
                        );
                      })}
                    </Select>
                  </FormControl>
                </Box>
              )}

              {/* Lista */}
              <Box sx={{ flex: 1, overflowY: 'auto', p: 2 }}>
                <Typography
                  variant="overline"
                  sx={{
                    color: colors.text.muted,
                    fontWeight: 600,
                    fontSize: '0.6875rem',
                    letterSpacing: '0.08em',
                  }}
                >
                  Pendientes ({items.length})
                </Typography>
                <Box sx={{ mt: 1.5 }}>
                  {items.map((item, index) => (
                    <ItemCard
                      key={item.id}
                      item={item}
                      config={config}
                      selected={index === selectedIndex}
                      onClick={() => setSelectedIndex(index)}
                    />
                  ))}
                </Box>
              </Box>

              {/* Botón confirmar todos (solo suciedades) */}
              {config.isSuciedad && items.length > 0 && (
                <Box
                  sx={{
                    p: 2,
                    borderTop: `1px solid ${colors.border.light}`,
                    backgroundColor: colors.background.paper,
                  }}
                >
                  <Button
                    variant="contained"
                    fullWidth
                    onClick={handleBulkConfirm}
                    disabled={bulkProcessing}
                    startIcon={bulkProcessing ? <CircularProgress size={18} color="inherit" /> : <DoneAllIcon />}
                    sx={{
                      background: `linear-gradient(135deg, ${colors.success.main} 0%, ${colors.success.dark} 100%)`,
                      borderRadius: borderRadius.sm,
                      textTransform: 'none',
                      fontWeight: 600,
                      py: 1.25,
                      boxShadow: `0 4px 12px ${alpha(colors.success.main, 0.3)}`,
                      '&:hover': {
                        background: `linear-gradient(135deg, ${colors.success.dark} 0%, ${colors.success.main} 100%)`,
                        boxShadow: `0 6px 16px ${alpha(colors.success.main, 0.4)}`,
                      },
                      '&:disabled': {
                        background: colors.grey[300],
                      },
                    }}
                  >
                    {bulkProcessing
                      ? 'Procesando...'
                      : `Confirmar todas (${items.length})`
                    }
                  </Button>
                </Box>
              )}
            </Box>

            {/* Panel de resolución */}
            <Box
              sx={{
                flex: 1,
                p: 3,
                display: 'flex',
                flexDirection: 'column',
                backgroundColor: colors.background.paper,
              }}
            >
              {/* Success alert */}
              {success && (
                <Alert
                  severity="success"
                  sx={{
                    mb: 2,
                    borderRadius: borderRadius.md,
                    border: `1px solid ${alpha(colors.success.main, 0.2)}`,
                  }}
                  onClose={() => setSuccess(null)}
                >
                  {success}
                </Alert>
              )}

              {currentItem && (
                <>
                  {/* Item info card */}
                  <Paper
                    elevation={0}
                    sx={{
                      p: 3,
                      borderRadius: borderRadius.lg,
                      border: `1px solid ${colors.border.light}`,
                      backgroundColor: colors.grey[50],
                      mb: 3,
                      position: 'relative',
                      overflow: 'hidden',
                      '&::before': {
                        content: '""',
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '4px',
                        height: '100%',
                        background: config.color,
                      },
                    }}
                  >
                    <Typography
                      variant="h6"
                      sx={{
                        fontWeight: 700,
                        color: colors.text.primary,
                        mb: 0.75,
                        letterSpacing: '-0.02em',
                      }}
                    >
                      {config.itemLabel(currentItem)}
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{
                        color: colors.text.secondary,
                        mb: 2,
                        fontSize: '0.875rem',
                      }}
                    >
                      {config.itemSubLabel(currentItem)}
                    </Typography>

                    {currentItem.datosOrigen && (
                      <Box
                        sx={{
                          mt: 2,
                          p: 2,
                          backgroundColor: colors.background.paper,
                          borderRadius: borderRadius.sm,
                          border: `1px solid ${colors.border.light}`,
                        }}
                      >
                        <Typography
                          variant="caption"
                          sx={{
                            fontFamily: "'JetBrains Mono', monospace",
                            fontSize: '0.75rem',
                            color: colors.text.secondary,
                          }}
                        >
                          {typeof currentItem.datosOrigen === 'string'
                            ? currentItem.datosOrigen
                            : JSON.stringify(currentItem.datosOrigen, null, 2)
                          }
                        </Typography>
                      </Box>
                    )}
                  </Paper>

                  {/* Acciones según tipo */}
                  {config.isSuciedad ? (
                    // Suciedades: solo botón "Confirmar Suciedad"
                    <Box>
                      <Button
                        variant="contained"
                        fullWidth
                        onClick={() => handleResolve()}
                        disabled={saving}
                        startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <CheckCircleIcon />}
                        sx={{
                          py: 1.5,
                          background: `linear-gradient(135deg, ${config.color} 0%, ${config.colorDark || config.color} 100%)`,
                          borderRadius: borderRadius.md,
                          textTransform: 'none',
                          fontWeight: 600,
                          fontSize: '0.9375rem',
                          boxShadow: `0 4px 16px ${alpha(config.color, 0.3)}`,
                          '&:hover': {
                            background: `linear-gradient(135deg, ${config.colorDark || config.color} 0%, ${config.color} 100%)`,
                            boxShadow: `0 6px 20px ${alpha(config.color, 0.4)}`,
                          },
                          '&:disabled': {
                            background: colors.grey[300],
                          },
                        }}
                      >
                        {saving ? 'Guardando...' : 'Confirmar Suciedad'}
                      </Button>
                      <Typography
                        variant="caption"
                        sx={{
                          display: 'block',
                          textAlign: 'center',
                          mt: 2,
                          color: colors.text.muted,
                          fontSize: '0.75rem',
                          lineHeight: 1.5,
                        }}
                      >
                        Al confirmar, este registro se guardará en la tabla de stock
                        y no volverá a aparecer en futuras ejecuciones
                      </Typography>
                    </Box>
                  ) : config.isAlert ? (
                    // Alertas (descuadres): campo observaciones + botones de acción
                    <Box>
                      {config.hasObservaciones && (
                        <TextField
                          fullWidth
                          multiline
                          rows={2}
                          label="Observaciones (opcional)"
                          value={observaciones}
                          onChange={(e) => setObservaciones(e.target.value)}
                          sx={{
                            mb: 2,
                            '& .MuiOutlinedInput-root': {
                              borderRadius: borderRadius.md,
                              '&:hover .MuiOutlinedInput-notchedOutline': {
                                borderColor: config.color,
                              },
                              '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                                borderColor: config.color,
                              },
                            },
                          }}
                        />
                      )}
                      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                        {config.actions.map((action) => (
                          <Button
                            key={action.key}
                            variant="contained"
                            onClick={() => handleResolve(action.key)}
                            disabled={saving}
                            sx={{
                              flex: 1,
                              minWidth: 150,
                              py: 1.5,
                              background: action.key === 'rechazar'
                                ? `linear-gradient(135deg, ${action.color} 0%, ${colors.error.dark} 100%)`
                                : `linear-gradient(135deg, ${action.color} 0%, ${colors.success.dark} 100%)`,
                              borderRadius: borderRadius.md,
                              textTransform: 'none',
                              fontWeight: 600,
                              boxShadow: `0 4px 16px ${alpha(action.color, 0.3)}`,
                              '&:hover': {
                                boxShadow: `0 6px 20px ${alpha(action.color, 0.4)}`,
                              },
                            }}
                          >
                            {saving ? 'Procesando...' : action.label}
                          </Button>
                        ))}
                      </Box>
                      <Typography
                        variant="caption"
                        sx={{
                          display: 'block',
                          textAlign: 'center',
                          mt: 2,
                          color: colors.text.muted,
                          fontSize: '0.75rem',
                          lineHeight: 1.5,
                        }}
                      >
                        Los descuadres aprobados/rechazados quedarán registrados en el historial
                      </Typography>
                    </Box>
                  ) : (
                    // Homologaciones: toggle nuevo/existente + formularios
                    <Box>
                      {/* Toggle para tipos que soportan creación nueva */}
                      {config.supportsNewCreation && (
                        <Box sx={{ mb: 3 }}>
                          <Alert
                            severity="info"
                            icon={<NewReleasesIcon />}
                            sx={{
                              mb: 2,
                              borderRadius: borderRadius.md,
                              backgroundColor: alpha(colors.info.main, 0.08),
                              border: `1px solid ${alpha(colors.info.main, 0.2)}`,
                              '& .MuiAlert-icon': { color: colors.info.main },
                            }}
                          >
                            <Typography variant="body2" sx={{ fontWeight: 500 }}>
                              Este es un {queueType === 'fondos' ? 'fondo' : 'benchmark'} nuevo no registrado en el sistema
                            </Typography>
                          </Alert>

                          <ToggleButtonGroup
                            value={creationMode}
                            exclusive
                            onChange={(_, newMode) => newMode && setCreationMode(newMode)}
                            fullWidth
                            sx={{ mb: 2 }}
                          >
                            <ToggleButton
                              value="existing"
                              sx={{
                                py: 1.5,
                                textTransform: 'none',
                                fontWeight: 600,
                                borderRadius: `${borderRadius.md} 0 0 ${borderRadius.md}`,
                                '&.Mui-selected': {
                                  backgroundColor: alpha(config.color, 0.1),
                                  color: config.color,
                                  borderColor: config.color,
                                  '&:hover': {
                                    backgroundColor: alpha(config.color, 0.15),
                                  },
                                },
                              }}
                            >
                              <LinkIcon sx={{ mr: 1 }} />
                              {config.existingLabel}
                            </ToggleButton>
                            <ToggleButton
                              value="new"
                              sx={{
                                py: 1.5,
                                textTransform: 'none',
                                fontWeight: 600,
                                borderRadius: `0 ${borderRadius.md} ${borderRadius.md} 0`,
                                '&.Mui-selected': {
                                  backgroundColor: alpha(colors.warning.main, 0.1),
                                  color: colors.warning.dark,
                                  borderColor: colors.warning.main,
                                  '&:hover': {
                                    backgroundColor: alpha(colors.warning.main, 0.15),
                                  },
                                },
                              }}
                            >
                              <AddCircleOutlineIcon sx={{ mr: 1 }} />
                              {config.newCreationLabel}
                            </ToggleButton>
                          </ToggleButtonGroup>
                        </Box>
                      )}

                      {/* Formulario según el modo */}
                      {creationMode === 'existing' ? (
                        // MODO EXISTENTE: Autocomplete para seleccionar
                        <>
                          <Autocomplete
                            value={selectedOption}
                            onChange={(_, newValue) => setSelectedOption(newValue)}
                            options={options}
                            loading={loadingOptions}
                            getOptionLabel={(opt) => config.optionLabel(opt)}
                            isOptionEqualToValue={(opt, val) => opt.id === val.id}
                            renderInput={(params) => (
                              <TextField
                                {...params}
                                label={config.assignLabel}
                                variant="outlined"
                                sx={{
                                  '& .MuiOutlinedInput-root': {
                                    borderRadius: borderRadius.md,
                                    '&:hover .MuiOutlinedInput-notchedOutline': {
                                      borderColor: config.color,
                                    },
                                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                                      borderColor: config.color,
                                    },
                                  },
                                }}
                              />
                            )}
                            renderOption={(props, option) => (
                              <li {...props}>
                                <Box>
                                  <Typography variant="body2" sx={{ fontWeight: 600, color: colors.text.primary }}>
                                    {option.nombre}
                                    {option.nombreCompleto && option.nombreCompleto !== option.nombre && (
                                      <Typography component="span" sx={{ color: colors.text.secondary, fontWeight: 400, ml: 1 }}>
                                        ({option.nombreCompleto})
                                      </Typography>
                                    )}
                                  </Typography>
                                  <Typography variant="caption" sx={{ color: colors.text.tertiary }}>
                                    {config.optionSubLabel
                                      ? config.optionSubLabel(option)
                                      : `ID: ${option.id} | Fuente: ${option.fuente}`
                                    }
                                  </Typography>
                                </Box>
                              </li>
                            )}
                            sx={{ mb: 3 }}
                          />

                          <Button
                            variant="contained"
                            fullWidth
                            onClick={() => handleResolve()}
                            disabled={!selectedOption || saving}
                            startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <CheckCircleIcon />}
                            sx={{
                              py: 1.5,
                              background: `linear-gradient(135deg, ${config.color} 0%, ${config.colorDark || config.color} 100%)`,
                              borderRadius: borderRadius.md,
                              textTransform: 'none',
                              fontWeight: 600,
                              fontSize: '0.9375rem',
                              boxShadow: `0 4px 16px ${alpha(config.color, 0.3)}`,
                              '&:hover': {
                                background: `linear-gradient(135deg, ${config.colorDark || config.color} 0%, ${config.color} 100%)`,
                                boxShadow: `0 6px 20px ${alpha(config.color, 0.4)}`,
                              },
                              '&:disabled': {
                                background: colors.grey[300],
                                boxShadow: 'none',
                              },
                            }}
                          >
                            {saving ? 'Guardando...' : 'Asignar y Homologar'}
                          </Button>
                        </>
                      ) : queueType === 'fondos' ? (
                        // MODO NUEVO FONDO: Formulario completo con campos dinámicos
                        <>
                          <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600, color: colors.text.secondary }}>
                            Datos del nuevo fondo
                          </Typography>
                          <Grid container spacing={2}>
                            {/* Campos requeridos */}
                            <Grid item xs={6}>
                              <TextField
                                fullWidth
                                required
                                label="Nombre Corto"
                                placeholder="Ej: MRCOP"
                                value={newFundData.fundShortName}
                                onChange={(e) => setNewFundData({ ...newFundData, fundShortName: e.target.value })}
                                sx={{ '& .MuiOutlinedInput-root': { borderRadius: borderRadius.md } }}
                              />
                            </Grid>
                            <Grid item xs={6}>
                              <TextField
                                fullWidth
                                required
                                label="Nombre Completo"
                                placeholder="Ej: Moneda Renta COP"
                                value={newFundData.fundName}
                                onChange={(e) => setNewFundData({ ...newFundData, fundName: e.target.value })}
                                sx={{ '& .MuiOutlinedInput-root': { borderRadius: borderRadius.md } }}
                              />
                            </Grid>
                            <Grid item xs={12}>
                              <FormControl fullWidth required>
                                <InputLabel>Moneda Base *</InputLabel>
                                <Select
                                  value={newFundData.fundBaseCurrency}
                                  label="Moneda Base *"
                                  onChange={(e) => setNewFundData({ ...newFundData, fundBaseCurrency: e.target.value })}
                                  sx={{ borderRadius: borderRadius.md }}
                                >
                                  <MenuItem value="" disabled><em>Seleccione una moneda</em></MenuItem>
                                  {formOptions.monedas.map((m) => (
                                    <MenuItem key={m.id} value={m.id.toString()}>
                                      {m.codigo} - {m.nombre}
                                    </MenuItem>
                                  ))}
                                </Select>
                              </FormControl>
                            </Grid>

                            {/* Campos opcionales */}
                            <Grid item xs={12}>
                              <Typography variant="caption" sx={{ color: colors.text.muted, display: 'block', mb: 1 }}>
                                Campos opcionales
                              </Typography>
                            </Grid>
                            <Grid item xs={6}>
                              <Autocomplete
                                freeSolo
                                value={newFundData.estrategiaConsFondo}
                                onChange={(_, newValue) => setNewFundData({ ...newFundData, estrategiaConsFondo: newValue || '' })}
                                onInputChange={(_, newValue) => setNewFundData({ ...newFundData, estrategiaConsFondo: newValue || '' })}
                                options={formOptions.estrategiasConsFondo}
                                renderInput={(params) => (
                                  <TextField
                                    {...params}
                                    label="Estrategia Cons. Fondo"
                                    placeholder="Seleccione o escriba"
                                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: borderRadius.md } }}
                                  />
                                )}
                              />
                            </Grid>
                            <Grid item xs={6}>
                              <Autocomplete
                                freeSolo
                                value={newFundData.estrategiaComparador}
                                onChange={(_, newValue) => setNewFundData({ ...newFundData, estrategiaComparador: newValue || '' })}
                                onInputChange={(_, newValue) => setNewFundData({ ...newFundData, estrategiaComparador: newValue || '' })}
                                options={formOptions.estrategiasComparador}
                                renderInput={(params) => (
                                  <TextField
                                    {...params}
                                    label="Estrategia Comparador"
                                    placeholder="Seleccione o escriba"
                                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: borderRadius.md } }}
                                  />
                                )}
                              />
                            </Grid>
                            <Grid item xs={6}>
                              <FormControl fullWidth>
                                <InputLabel>Benchmark 1 (BM1)</InputLabel>
                                <Select
                                  value={newFundData.bm1}
                                  label="Benchmark 1 (BM1)"
                                  onChange={(e) => setNewFundData({ ...newFundData, bm1: e.target.value })}
                                  sx={{ borderRadius: borderRadius.md }}
                                >
                                  <MenuItem value=""><em>Sin benchmark</em></MenuItem>
                                  {formOptions.benchmarks.map((bm) => (
                                    <MenuItem key={bm.id} value={bm.id.toString()}>
                                      {bm.nombre} {bm.codigo && `(${bm.codigo})`}
                                    </MenuItem>
                                  ))}
                                </Select>
                              </FormControl>
                            </Grid>
                            <Grid item xs={6}>
                              <FormControl fullWidth>
                                <InputLabel>Benchmark 2 (BM2)</InputLabel>
                                <Select
                                  value={newFundData.bm2}
                                  label="Benchmark 2 (BM2)"
                                  onChange={(e) => setNewFundData({ ...newFundData, bm2: e.target.value })}
                                  sx={{ borderRadius: borderRadius.md }}
                                >
                                  <MenuItem value=""><em>Sin benchmark</em></MenuItem>
                                  {formOptions.benchmarks.map((bm) => (
                                    <MenuItem key={bm.id} value={bm.id.toString()}>
                                      {bm.nombre} {bm.codigo && `(${bm.codigo})`}
                                    </MenuItem>
                                  ))}
                                </Select>
                              </FormControl>
                            </Grid>
                            <Grid item xs={6}>
                              <FormControlLabel
                                control={
                                  <Switch
                                    checked={newFundData.flagDerivados}
                                    onChange={(e) => setNewFundData({ ...newFundData, flagDerivados: e.target.checked })}
                                    color="primary"
                                  />
                                }
                                label="Tiene Derivados"
                              />
                            </Grid>
                            <Grid item xs={6}>
                              <FormControlLabel
                                control={
                                  <Switch
                                    checked={newFundData.flagUBS}
                                    onChange={(e) => setNewFundData({ ...newFundData, flagUBS: e.target.checked })}
                                    color="primary"
                                  />
                                }
                                label="Flag UBS"
                              />
                            </Grid>
                          </Grid>

                          <Button
                            variant="contained"
                            fullWidth
                            onClick={() => handleResolve()}
                            disabled={!newFundData.fundShortName || !newFundData.fundName || !newFundData.fundBaseCurrency || saving}
                            startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <AddCircleOutlineIcon />}
                            sx={{
                              mt: 3,
                              py: 1.5,
                              background: `linear-gradient(135deg, ${colors.warning.main} 0%, ${colors.warning.dark} 100%)`,
                              borderRadius: borderRadius.md,
                              textTransform: 'none',
                              fontWeight: 600,
                              fontSize: '0.9375rem',
                              boxShadow: `0 4px 16px ${alpha(colors.warning.main, 0.3)}`,
                              '&:hover': {
                                background: `linear-gradient(135deg, ${colors.warning.dark} 0%, ${colors.warning.main} 100%)`,
                                boxShadow: `0 6px 20px ${alpha(colors.warning.main, 0.4)}`,
                              },
                              '&:disabled': {
                                background: colors.grey[300],
                                boxShadow: 'none',
                              },
                            }}
                          >
                            {saving ? 'Creando...' : 'Crear Fondo y Homologar'}
                          </Button>
                        </>
                      ) : queueType === 'benchmarks' ? (
                        // MODO NUEVO BENCHMARK: Formulario completo
                        <>
                          <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600, color: colors.text.secondary }}>
                            Datos del nuevo benchmark
                          </Typography>
                          <Grid container spacing={2}>
                            <Grid item xs={6}>
                              <TextField
                                fullWidth
                                required
                                label="Código / Short Name"
                                placeholder="Ej: BMCOP1"
                                value={newBenchmarkData.fundShortName}
                                onChange={(e) => setNewBenchmarkData({ ...newBenchmarkData, fundShortName: e.target.value })}
                                sx={{ '& .MuiOutlinedInput-root': { borderRadius: borderRadius.md } }}
                              />
                            </Grid>
                            <Grid item xs={6}>
                              <TextField
                                fullWidth
                                required
                                label="Nombre del Benchmark"
                                placeholder="Ej: Colombia Bond Index"
                                value={newBenchmarkData.bmName}
                                onChange={(e) => setNewBenchmarkData({ ...newBenchmarkData, bmName: e.target.value })}
                                sx={{ '& .MuiOutlinedInput-root': { borderRadius: borderRadius.md } }}
                              />
                            </Grid>
                            <Grid item xs={6}>
                              <FormControl fullWidth>
                                <InputLabel>Moneda Base</InputLabel>
                                <Select
                                  value={newBenchmarkData.fundBaseCurrency}
                                  label="Moneda Base"
                                  onChange={(e) => setNewBenchmarkData({ ...newBenchmarkData, fundBaseCurrency: e.target.value })}
                                  sx={{ borderRadius: borderRadius.md }}
                                >
                                  {formOptions.monedas.map((m) => (
                                    <MenuItem key={m.id} value={m.id.toString()}>
                                      {m.codigo} - {m.nombre}
                                    </MenuItem>
                                  ))}
                                </Select>
                              </FormControl>
                            </Grid>
                            <Grid item xs={6}>
                              <Autocomplete
                                freeSolo
                                value={newBenchmarkData.estrategia}
                                onChange={(_, newValue) => setNewBenchmarkData({ ...newBenchmarkData, estrategia: newValue || '' })}
                                onInputChange={(_, newValue) => setNewBenchmarkData({ ...newBenchmarkData, estrategia: newValue || '' })}
                                options={formOptions.estrategiasComparador}
                                renderInput={(params) => (
                                  <TextField
                                    {...params}
                                    label="Estrategia Comparador"
                                    placeholder="Seleccione o escriba"
                                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: borderRadius.md } }}
                                  />
                                )}
                              />
                            </Grid>
                          </Grid>

                          <Button
                            variant="contained"
                            fullWidth
                            onClick={() => handleResolve()}
                            disabled={!newBenchmarkData.fundShortName || !newBenchmarkData.bmName || saving}
                            startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <AddCircleOutlineIcon />}
                            sx={{
                              mt: 3,
                              py: 1.5,
                              background: `linear-gradient(135deg, ${colors.warning.main} 0%, ${colors.warning.dark} 100%)`,
                              borderRadius: borderRadius.md,
                              textTransform: 'none',
                              fontWeight: 600,
                              fontSize: '0.9375rem',
                              boxShadow: `0 4px 16px ${alpha(colors.warning.main, 0.3)}`,
                              '&:hover': {
                                background: `linear-gradient(135deg, ${colors.warning.dark} 0%, ${colors.warning.main} 100%)`,
                                boxShadow: `0 6px 20px ${alpha(colors.warning.main, 0.4)}`,
                              },
                              '&:disabled': {
                                background: colors.grey[300],
                                boxShadow: 'none',
                              },
                            }}
                          >
                            {saving ? 'Creando...' : 'Crear Benchmark y Homologar'}
                          </Button>
                        </>
                      ) : (
                        // Fallback para otros tipos sin creación nueva
                        <>
                          <Autocomplete
                            value={selectedOption}
                            onChange={(_, newValue) => setSelectedOption(newValue)}
                            options={options}
                            loading={loadingOptions}
                            getOptionLabel={(opt) => config.optionLabel(opt)}
                            isOptionEqualToValue={(opt, val) => opt.id === val.id}
                            renderInput={(params) => (
                              <TextField
                                {...params}
                                label={config.assignLabel}
                                variant="outlined"
                                sx={{
                                  '& .MuiOutlinedInput-root': {
                                    borderRadius: borderRadius.md,
                                  },
                                }}
                              />
                            )}
                            sx={{ mb: 3 }}
                          />
                          <Button
                            variant="contained"
                            fullWidth
                            onClick={() => handleResolve()}
                            disabled={!selectedOption || saving}
                            startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <CheckCircleIcon />}
                            sx={{
                              py: 1.5,
                              background: `linear-gradient(135deg, ${config.color} 0%, ${config.colorDark || config.color} 100%)`,
                              borderRadius: borderRadius.md,
                              textTransform: 'none',
                              fontWeight: 600,
                            }}
                          >
                            {saving ? 'Guardando...' : 'Resolver y Guardar'}
                          </Button>
                        </>
                      )}
                    </Box>
                  )}

                  {/* Spacer */}
                  <Box sx={{ flex: 1 }} />

                  {/* Footer con navegación */}
                  <Divider sx={{ my: 2, borderColor: colors.border.light }} />
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5 }}>
                    <Tooltip title="Anterior" arrow>
                      <span>
                        <IconButton
                          onClick={goPrev}
                          disabled={selectedIndex === 0}
                          size="small"
                          sx={{
                            backgroundColor: colors.grey[100],
                            '&:hover': {
                              backgroundColor: colors.grey[200],
                            },
                            '&:disabled': {
                              backgroundColor: colors.grey[50],
                            },
                          }}
                        >
                          <NavigateBeforeIcon />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Chip
                      label={`${selectedIndex + 1} / ${items.length}`}
                      size="small"
                      sx={{
                        fontWeight: 600,
                        fontSize: '0.8125rem',
                        backgroundColor: colors.grey[100],
                        color: colors.text.secondary,
                        px: 1,
                      }}
                    />
                    <Tooltip title="Siguiente" arrow>
                      <span>
                        <IconButton
                          onClick={goNext}
                          disabled={selectedIndex === items.length - 1}
                          size="small"
                          sx={{
                            backgroundColor: colors.grey[100],
                            '&:hover': {
                              backgroundColor: colors.grey[200],
                            },
                            '&:disabled': {
                              backgroundColor: colors.grey[50],
                            },
                          }}
                        >
                          <NavigateNextIcon />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </Box>
                </>
              )}
            </Box>
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default QueueResolverModal;
