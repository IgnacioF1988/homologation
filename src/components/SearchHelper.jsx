/**
 * SearchHelper - FAB de ayuda con panel expandible
 *
 * Diseño simplificado: FAB minimalista en esquina inferior derecha
 * Se expande mostrando búsqueda de instrumentos del stock
 *
 * FLUJO:
 * 1. Usuario abre el panel
 * 2. Escribe para buscar instrumentos (infinite scroll en resultados)
 * 3. Selecciona un instrumento para ver opciones:
 *    - "Usar como Exacta": Establece ID + moneda y hereda todos los campos
 *    - "Usar como Parcial": Establece ID y hereda campos (excepto monedas)
 *    - "Copiar Campos": Solo copia campos sin establecer ID (para instrumento nuevo)
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Box,
  TextField,
  Typography,
  IconButton,
  Paper,
  Chip,
  CircularProgress,
  Collapse,
  Tooltip,
  InputAdornment,
  alpha,
  ClickAwayListener,
  Button,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import LinkIcon from '@mui/icons-material/Link';
import AddLinkIcon from '@mui/icons-material/AddLink';
import EditIcon from '@mui/icons-material/Edit';
import { colors } from '../styles/theme';
import { api } from '../services/api';
import { isEquity, normalizeInvestmentType } from '../hooks';

// Campos que NO se copian (pero se pasan como metadata de origen)
const EXCLUDED_COPY_FIELDS = [
  'idInstrumento', 'isin', 'tickerBBG', 'sedol', 'cusip',
  'queueItemId', 'nombreFuente', 'fuente', 'moneda', 'comentarios',
];

// Agrupación de campos para mostrar en detalle
const FIELD_GROUPS = {
  identificacion: {
    title: 'Identificación',
    icon: 'description',
    fields: [
      { key: 'idInstrumento', label: 'ID' },
      { key: 'moneda', label: 'Moneda' },
      { key: 'nameInstrumento', label: 'Nombre' },
      { key: 'isin', label: 'ISIN' },
    ],
  },
  compania: {
    title: 'Compañía',
    icon: 'business',
    fields: [
      { key: 'companyName', label: 'Nombre' },
      { key: 'issuerTypeCode', label: 'Tipo' },
      { key: 'sectorGICS', label: 'GICS' },
    ],
  },
  clasificacion: {
    title: 'Clasificación',
    icon: 'trending',
    fields: [
      { key: 'investmentTypeCode', label: 'Inversión' },
      { key: 'issueTypeCode', label: 'Emisión' },
      { key: 'publicDataSource', label: 'Origen' },
    ],
  },
  geografia: {
    title: 'Geografía',
    icon: 'account',
    fields: [
      { key: 'issueCountry', label: 'País Em.' },
      { key: 'riskCountry', label: 'País Rgo.' },
      { key: 'issueCurrency', label: 'Mon. Em.' },
      { key: 'riskCurrency', label: 'Mon. Rgo.' },
    ],
  },
};

// Helper para íconos de grupo
const GroupIcon = ({ type }) => {
  const sx = { fontSize: 14, color: colors.text.tertiary };
  switch (type) {
    case 'description': return <DescriptionOutlinedIcon sx={sx} />;
    case 'business': return <BusinessOutlinedIcon sx={sx} />;
    case 'trending': return <TrendingUpIcon sx={sx} />;
    case 'account': return <AccountBalanceIcon sx={sx} />;
    default: return <DescriptionOutlinedIcon sx={sx} />;
  }
};

// Íconos según tipo de inversión
const getInvestmentIcon = (type) => {
  const sx = { fontSize: 18 };
  const normalizedType = normalizeInvestmentType(type);
  switch (normalizedType) {
    case 'EQ':
      return <TrendingUpIcon sx={{ ...sx, color: colors.primary.main }} />;
    case 'FI':
      return <AccountBalanceIcon sx={{ ...sx, color: colors.secondary.main }} />;
    default:
      return <DescriptionOutlinedIcon sx={{ ...sx, color: colors.text.tertiary }} />;
  }
};

const SearchHelper = ({
  onCopyValues,
  disabled = false,
  formData = {},
  noFormActive = false,
  onSelectExacta,
  onSelectParcial,
  onModificar,
  isProcessingQueue = false,
}) => {
  // Determinar si se puede copiar (solo cuando es instrumento nuevo o no tiene ID)
  const canCopy = formData.esInstrumentoNuevo || !formData.idInstrumento;

  // Determinar visibilidad de opciones según contexto
  // 1. esInstrumentoNuevo=true: No mostrar ninguna opción
  // 2. Processing queue item (isProcessingQueue=true): Mostrar Exacta, Parcial, Copiar - NO Modificar
  // 3. Empty form (no queue, !isProcessingQueue && !noFormActive): SOLO Modificar
  const isNewInstrument = formData.esInstrumentoNuevo === true;
  const showExactaParcial = !isNewInstrument && isProcessingQueue;
  const showCopiar = !isNewInstrument && isProcessingQueue && canCopy;
  // Mostrar Modificar cuando:
  // 1. No procesa cola (!isProcessingQueue), O
  // 2. Procesa cola Y esReestructuracion está marcado (formData.esReestructuracion === 'S')
  const showModificar = !isNewInstrument && (!isProcessingQueue || formData?.esReestructuracion === 'S') && !noFormActive;

  // Estados
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedInstrument, setSelectedInstrument] = useState(null);
  const [copied, setCopied] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchPage, setSearchPage] = useState(1);

  const searchInputRef = useRef(null);
  const debounceRef = useRef(null);
  const lastQueryRef = useRef('');

  // Toggle panel
  const handleToggle = () => {
    setIsOpen(!isOpen);
  };

  // Cerrar panel
  const handleClose = () => {
    setIsOpen(false);
  };

  // Focus en input cuando se abre
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 150);
    }
  }, [isOpen]);

  // Buscar instrumentos
  const searchInstruments = useCallback(async (query, page = 1, append = false) => {
    if (!query || query.trim().length < 2) {
      setResults([]);
      setHasMore(false);
      return;
    }

    if (page === 1) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }

    try {
      const limit = 20;
      const response = await api.instrumentos.search(query, limit, page);

      if (response.success) {
        const newResults = response.data || [];

        if (append) {
          setResults(prev => [...prev, ...newResults]);
        } else {
          setResults(newResults);
        }

        // Determinar si hay más resultados
        setHasMore(newResults.length === limit);
        setSearchPage(page);
        lastQueryRef.current = query;
      }
    } catch (error) {
      console.error('Error buscando instrumentos:', error);
      if (!append) {
        setResults([]);
      }
      setHasMore(false);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  // Cargar más resultados
  const loadMoreResults = useCallback(() => {
    if (loadingMore || !hasMore || !lastQueryRef.current) return;
    searchInstruments(lastQueryRef.current, searchPage + 1, true);
  }, [loadingMore, hasMore, searchPage, searchInstruments]);

  // Handler de scroll para infinite scroll
  const handleScroll = useCallback((e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target;
    if (scrollHeight - scrollTop - clientHeight < 100 && hasMore && !loadingMore) {
      loadMoreResults();
    }
  }, [hasMore, loadingMore, loadMoreResults]);

  // Manejar cambio en búsqueda
  const handleSearchChange = useCallback((e) => {
    const value = e.target.value;
    setSearchQuery(value);
    setSelectedInstrument(null);
    setSearchPage(1);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchInstruments(value, 1, false), 300);
  }, [searchInstruments]);

  // Seleccionar instrumento
  const handleSelectInstrument = useCallback((instrument) => {
    setSelectedInstrument(
      selectedInstrument?.idInstrumento === instrument.idInstrumento &&
      selectedInstrument?.moneda === instrument.moneda
        ? null
        : instrument
    );
  }, [selectedInstrument]);

  // Limpiar búsqueda
  const handleClear = useCallback(() => {
    setSearchQuery('');
    setResults([]);
    setSelectedInstrument(null);
    setHasMore(false);
    setSearchPage(1);
    lastQueryRef.current = '';
    searchInputRef.current?.focus();
  }, []);

  // Copiar valores al formulario (para instrumento nuevo)
  const handleCopyValues = useCallback(() => {
    if (!selectedInstrument || !onCopyValues) return;

    const valuesToCopy = {};
    Object.keys(selectedInstrument).forEach((key) => {
      if (!EXCLUDED_COPY_FIELDS.includes(key)) {
        valuesToCopy[key] = selectedInstrument[key] ?? '';
      }
    });

    // Agregar metadata del instrumento origen
    valuesToCopy._sourceInstrument = {
      idInstrumento: selectedInstrument.idInstrumento,
      moneda: selectedInstrument.moneda,
      nameInstrumento: selectedInstrument.nameInstrumento,
    };

    onCopyValues(valuesToCopy);
    setCopied(true);

    setTimeout(() => {
      setCopied(false);
      setSelectedInstrument(null);
      setSearchQuery('');
      setResults([]);
      setIsOpen(false);
    }, 1200);
  }, [selectedInstrument, onCopyValues]);

  // Handler para selección como coincidencia exacta
  const handleSelectExacta = useCallback(() => {
    if (!selectedInstrument || !onSelectExacta) return;
    onSelectExacta(selectedInstrument);
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
      setSelectedInstrument(null);
      setSearchQuery('');
      setResults([]);
      setIsOpen(false);
    }, 1000);
  }, [selectedInstrument, onSelectExacta]);

  // Handler para selección como coincidencia parcial
  const handleSelectParcial = useCallback(() => {
    if (!selectedInstrument || !onSelectParcial) return;
    onSelectParcial(selectedInstrument);
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
      setSelectedInstrument(null);
      setSearchQuery('');
      setResults([]);
      setIsOpen(false);
    }, 1000);
  }, [selectedInstrument, onSelectParcial]);

  // Handler para modificar instrumento existente (4ta opción)
  const handleModificar = useCallback(() => {
    if (!selectedInstrument || !onModificar) return;
    onModificar(selectedInstrument);
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
      setSelectedInstrument(null);
      setSearchQuery('');
      setResults([]);
      setIsOpen(false);
    }, 1000);
  }, [selectedInstrument, onModificar]);

  // Renderizar valor de campo
  const renderFieldValue = (value) => {
    if (value === null || value === undefined || value === '') {
      return <Typography component="span" sx={{ color: colors.text.muted, fontSize: '0.7rem' }}>—</Typography>;
    }
    return (
      <Typography component="span" sx={{ fontWeight: 500, color: colors.text.primary, fontSize: '0.7rem' }}>
        {String(value)}
      </Typography>
    );
  };

  if (disabled) return null;

  return (
    <Box sx={{ position: 'fixed', bottom: 32, right: 32, zIndex: 1300 }}>
      {/* FAB - siempre visible cuando cerrado */}
      {!isOpen && (
        <Tooltip title="Buscar en Stock de Instrumentos" placement="left">
          <Box
            onClick={handleToggle}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && handleToggle()}
            sx={{
              width: 56,
              height: 56,
              borderRadius: '16px',
              background: colors.primary.gradient,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: `0 8px 32px ${alpha(colors.primary.main, 0.35)}`,
              transition: 'all 200ms ease',
              userSelect: 'none',
              '&:hover': {
                transform: 'scale(1.05)',
                boxShadow: `0 12px 40px ${alpha(colors.primary.main, 0.45)}`,
              },
              '&:active': {
                transform: 'scale(0.95)',
              },
            }}
          >
            <AutoAwesomeIcon sx={{ color: '#fff', fontSize: 26 }} />
          </Box>
        </Tooltip>
      )}

      {/* Panel expandido */}
      {isOpen && (
        <ClickAwayListener onClickAway={handleClose}>
          <Paper
            elevation={0}
            sx={{
              width: 380,
              maxHeight: 'calc(100vh - 80px)',
              borderRadius: '20px',
              border: `1px solid ${colors.border.light}`,
              backgroundColor: 'rgba(255, 255, 255, 0.98)',
              backdropFilter: 'blur(20px)',
              boxShadow: `0 20px 60px ${alpha('#000', 0.12)}, 0 8px 24px ${alpha('#000', 0.08)}`,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              animation: 'slideUp 200ms ease-out',
              '@keyframes slideUp': {
                from: { opacity: 0, transform: 'translateY(20px)' },
                to: { opacity: 1, transform: 'translateY(0)' },
              },
            }}
          >
            {/* Header */}
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                px: 2.5,
                py: 2,
                background: `linear-gradient(135deg, ${alpha(colors.primary.main, 0.06)} 0%, ${alpha(colors.primary.light, 0.02)} 100%)`,
                borderBottom: `1px solid ${colors.border.light}`,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Box
                  sx={{
                    width: 36,
                    height: 36,
                    borderRadius: '10px',
                    background: colors.primary.gradient,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: `0 4px 12px ${alpha(colors.primary.main, 0.3)}`,
                  }}
                >
                  <SearchIcon sx={{ fontSize: 18, color: '#fff' }} />
                </Box>
                <Box>
                  <Typography sx={{ fontWeight: 600, fontSize: '0.9rem', color: colors.text.primary }}>
                    Buscar en Stock
                  </Typography>
                  <Typography sx={{ fontSize: '0.7rem', color: colors.text.tertiary }}>
                    Buscar instrumento para usar o copiar datos
                  </Typography>
                </Box>
              </Box>
              <IconButton onClick={handleClose} size="small" sx={{ color: colors.text.tertiary }}>
                <CloseIcon sx={{ fontSize: 20 }} />
              </IconButton>
            </Box>

            {/* Search Input */}
            <Box sx={{ px: 2, py: 1.5 }}>
              <TextField
                inputRef={searchInputRef}
                fullWidth
                size="small"
                placeholder={noFormActive ? "Seleccione un formulario primero" : "Buscar por nombre, ISIN, ticker..."}
                value={searchQuery}
                onChange={handleSearchChange}
                disabled={noFormActive}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon sx={{ fontSize: 18, color: colors.text.muted }} />
                    </InputAdornment>
                  ),
                  endAdornment: (
                    <InputAdornment position="end">
                      {loading ? (
                        <CircularProgress size={16} sx={{ color: colors.primary.main }} />
                      ) : searchQuery ? (
                        <IconButton size="small" onClick={handleClear} sx={{ p: 0.5 }}>
                          <CloseIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      ) : null}
                    </InputAdornment>
                  ),
                }}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    borderRadius: '12px',
                    backgroundColor: colors.grey[50],
                    fontSize: '0.85rem',
                    '& fieldset': { borderColor: 'transparent' },
                    '&:hover fieldset': { borderColor: colors.border.default },
                    '&.Mui-focused': {
                      backgroundColor: '#fff',
                      '& fieldset': { borderColor: colors.primary.main, borderWidth: '1.5px' },
                    },
                  },
                }}
              />
            </Box>

            {/* Results Area */}
            <Box
              onScroll={handleScroll}
              sx={{ flex: 1, overflowY: 'auto', px: 2, pb: 2 }}
            >
              {/* Mensaje cuando no hay formulario activo */}
              {noFormActive && (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <Box
                    sx={{
                      width: 48,
                      height: 48,
                      borderRadius: '12px',
                      backgroundColor: colors.warning.bg,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      mx: 'auto',
                      mb: 1.5,
                    }}
                  >
                    <SearchIcon sx={{ fontSize: 24, color: colors.warning.main }} />
                  </Box>
                  <Typography sx={{ color: colors.text.secondary, fontSize: '0.8rem', fontWeight: 500 }}>
                    Sin formulario activo
                  </Typography>
                  <Typography sx={{ color: colors.text.tertiary, fontSize: '0.75rem', mt: 0.5 }}>
                    Seleccione un instrumento de la cola o use la pestaña "Nuevo Instrumento"
                  </Typography>
                </Box>
              )}

              {/* Estado inicial - sin búsqueda */}
              {!noFormActive && !searchQuery && (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <Box
                    sx={{
                      width: 48,
                      height: 48,
                      borderRadius: '12px',
                      backgroundColor: colors.grey[100],
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      mx: 'auto',
                      mb: 1.5,
                    }}
                  >
                    <SearchIcon sx={{ fontSize: 24, color: colors.grey[400] }} />
                  </Box>
                  <Typography sx={{ color: colors.text.secondary, fontSize: '0.8rem', fontWeight: 500 }}>
                    Buscar instrumentos existentes
                  </Typography>
                  <Typography sx={{ color: colors.text.tertiary, fontSize: '0.75rem', mt: 0.5 }}>
                    Escriba al menos 2 caracteres para buscar
                  </Typography>
                </Box>
              )}

              {/* Sin resultados */}
              {!noFormActive && searchQuery && searchQuery.length >= 2 && !loading && results.length === 0 && (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <Typography sx={{ color: colors.text.tertiary, fontSize: '0.8rem' }}>
                    No se encontraron resultados para "{searchQuery}"
                  </Typography>
                </Box>
              )}

              {/* Lista de resultados */}
              {results.length > 0 && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {results.map((instrument, index) => {
                    const uniqueKey = `${instrument.idInstrumento}-${instrument.moneda}-${index}`;
                    const isSelected = selectedInstrument?.idInstrumento === instrument.idInstrumento &&
                      selectedInstrument?.moneda === instrument.moneda;

                    return (
                      <Box
                        key={uniqueKey}
                        onClick={() => handleSelectInstrument(instrument)}
                        sx={{
                          p: 1.5,
                          borderRadius: '12px',
                          border: `1px solid ${isSelected ? colors.primary.main : colors.border.light}`,
                          backgroundColor: isSelected ? alpha(colors.primary.main, 0.04) : '#fff',
                          cursor: 'pointer',
                          transition: 'all 150ms ease',
                          '&:hover': {
                            borderColor: colors.primary.light,
                            backgroundColor: alpha(colors.primary.main, 0.02),
                          },
                        }}
                      >
                        {/* Header del resultado */}
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                          {getInvestmentIcon(instrument.investmentTypeCode)}
                          <Typography
                            sx={{
                              flex: 1,
                              fontWeight: 500,
                              fontSize: '0.8rem',
                              color: colors.text.primary,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {instrument.nameInstrumento || instrument.nombreFuente || 'Sin nombre'}
                          </Typography>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            {/* ID Badge */}
                            <Chip
                              label={`ID: ${instrument.idInstrumento}`}
                              size="small"
                              sx={{
                                height: 18,
                                fontSize: '0.6rem',
                                fontWeight: 600,
                                backgroundColor: alpha(colors.grey[500], 0.1),
                                color: colors.grey[700],
                              }}
                            />
                            {/* Moneda Badge */}
                            <Chip
                              label={`M: ${instrument.moneda}`}
                              size="small"
                              sx={{
                                height: 18,
                                fontSize: '0.6rem',
                                fontWeight: 600,
                                backgroundColor: alpha(colors.secondary.main, 0.1),
                                color: colors.secondary.dark,
                              }}
                            />
                            {/* Tipo de inversión */}
                            <Chip
                              label={instrument.investmentTypeCode || '—'}
                              size="small"
                              sx={{
                                height: 18,
                                fontSize: '0.6rem',
                                fontWeight: 600,
                                backgroundColor:
                                  isEquity(instrument.investmentTypeCode)
                                    ? alpha(colors.primary.main, 0.1)
                                    : alpha(colors.secondary.main, 0.1),
                                color:
                                  isEquity(instrument.investmentTypeCode)
                                    ? colors.primary.dark
                                    : colors.secondary.dark,
                              }}
                            />
                          </Box>
                        </Box>

                        {/* Info secundaria */}
                        <Typography sx={{ fontSize: '0.7rem', color: colors.text.tertiary }}>
                          {instrument.companyName || 'Sin compañía'}
                          {instrument.isin && ` • ${instrument.isin}`}
                        </Typography>

                        {/* Detalle expandido */}
                        <Collapse in={isSelected}>
                          <Box sx={{ mt: 1.5, pt: 1.5, borderTop: `1px solid ${colors.border.light}` }}>
                            {Object.entries(FIELD_GROUPS).map(([key, group]) => (
                              <Box key={key} sx={{ mb: 1.5 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                                  <GroupIcon type={group.icon} />
                                  <Typography
                                    sx={{
                                      fontSize: '0.65rem',
                                      fontWeight: 600,
                                      color: colors.text.secondary,
                                      textTransform: 'uppercase',
                                      letterSpacing: '0.05em',
                                    }}
                                  >
                                    {group.title}
                                  </Typography>
                                </Box>
                                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 0.5 }}>
                                  {group.fields.map((field) => (
                                    <Box key={field.key}>
                                      <Typography
                                        sx={{
                                          fontSize: '0.6rem',
                                          color: colors.text.muted,
                                          textTransform: 'uppercase',
                                          letterSpacing: '0.03em',
                                        }}
                                      >
                                        {field.label}
                                      </Typography>
                                      {renderFieldValue(instrument[field.key])}
                                    </Box>
                                  ))}
                                </Box>
                              </Box>
                            ))}

                            {/* Área de acciones */}
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 2 }}>
                              {/* Título de acciones */}
                              <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: colors.text.secondary, mb: 0.5 }}>
                                Acciones disponibles:
                              </Typography>

                              {/* Mensaje cuando es instrumento nuevo (no hay opciones) */}
                              {isNewInstrument && (
                                <Box sx={{ p: 1.5, borderRadius: '8px', backgroundColor: colors.warning.bg }}>
                                  <Typography sx={{ fontSize: '0.7rem', color: colors.warning.dark }}>
                                    No hay opciones disponibles para instrumentos nuevos.
                                  </Typography>
                                </Box>
                              )}

                              {/* Botón Usar como Exacta - solo cuando procesa cola */}
                              {showExactaParcial && onSelectExacta && (
                                <Button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSelectExacta();
                                  }}
                                  startIcon={<LinkIcon sx={{ fontSize: 16 }} />}
                                  fullWidth
                                  sx={{
                                    background: 'linear-gradient(135deg, #4caf50, #81c784)',
                                    color: '#fff',
                                    fontWeight: 600,
                                    fontSize: '0.75rem',
                                    py: 1,
                                    borderRadius: '10px',
                                    textTransform: 'none',
                                    boxShadow: `0 4px 12px ${alpha('#4caf50', 0.3)}`,
                                    '&:hover': {
                                      background: 'linear-gradient(135deg, #388e3c, #66bb6a)',
                                      boxShadow: `0 6px 16px ${alpha('#4caf50', 0.4)}`,
                                    },
                                  }}
                                >
                                  Usar como Exacta (ID + Moneda)
                                </Button>
                              )}

                              {/* Botón Usar como Parcial - solo cuando procesa cola */}
                              {showExactaParcial && onSelectParcial && (
                                <Button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSelectParcial();
                                  }}
                                  startIcon={<AddLinkIcon sx={{ fontSize: 16 }} />}
                                  fullWidth
                                  sx={{
                                    background: 'linear-gradient(135deg, #ff9800, #ffb74d)',
                                    color: '#fff',
                                    fontWeight: 600,
                                    fontSize: '0.75rem',
                                    py: 1,
                                    borderRadius: '10px',
                                    textTransform: 'none',
                                    boxShadow: `0 4px 12px ${alpha('#ff9800', 0.3)}`,
                                    '&:hover': {
                                      background: 'linear-gradient(135deg, #f57c00, #ffa726)',
                                      boxShadow: `0 6px 16px ${alpha('#ff9800', 0.4)}`,
                                    },
                                  }}
                                >
                                  Usar como Parcial (solo ID)
                                </Button>
                              )}

                              {/* Botón Copiar Campos - solo cuando procesa cola con instrumento nuevo */}
                              {showCopiar && onCopyValues && (
                                <Tooltip title="Copia los campos pero mantiene el ID auto-generado" placement="top">
                                  <Button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleCopyValues();
                                    }}
                                    startIcon={copied ? <CheckCircleOutlineIcon sx={{ fontSize: 16 }} /> : <ContentCopyIcon sx={{ fontSize: 16 }} />}
                                    fullWidth
                                    sx={{
                                      background: copied ? colors.success.main : colors.primary.gradient,
                                      color: '#fff',
                                      fontWeight: 600,
                                      fontSize: '0.75rem',
                                      py: 1,
                                      borderRadius: '10px',
                                      textTransform: 'none',
                                      boxShadow: copied ? 'none' : `0 4px 12px ${alpha(colors.primary.main, 0.25)}`,
                                      '&:hover': !copied ? {
                                        filter: 'brightness(1.05)',
                                        boxShadow: `0 6px 16px ${alpha(colors.primary.main, 0.35)}`,
                                      } : {},
                                    }}
                                  >
                                    {copied ? '¡Campos copiados!' : 'Copiar Campos (instrumento nuevo)'}
                                  </Button>
                                </Tooltip>
                              )}

                              {/* Botón Modificar Instrumento - solo cuando NO procesa cola */}
                              {showModificar && onModificar && (
                                <Tooltip title="Carga el instrumento para modificar sus atributos" placement="top">
                                  <Button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleModificar();
                                    }}
                                    startIcon={copied ? <CheckCircleOutlineIcon sx={{ fontSize: 16 }} /> : <EditIcon sx={{ fontSize: 16 }} />}
                                    fullWidth
                                    sx={{
                                      background: copied ? colors.success.main : 'linear-gradient(135deg, #9c27b0, #ba68c8)',
                                      color: '#fff',
                                      fontWeight: 600,
                                      fontSize: '0.75rem',
                                      py: 1,
                                      borderRadius: '10px',
                                      textTransform: 'none',
                                      boxShadow: copied ? 'none' : `0 4px 12px ${alpha('#9c27b0', 0.3)}`,
                                      '&:hover': !copied ? {
                                        background: 'linear-gradient(135deg, #7b1fa2, #ab47bc)',
                                        boxShadow: `0 6px 16px ${alpha('#9c27b0', 0.4)}`,
                                      } : {},
                                    }}
                                  >
                                    {copied ? '¡Instrumento cargado!' : 'Modificar Instrumento'}
                                  </Button>
                                </Tooltip>
                              )}

                              {/* Texto explicativo contextual */}
                              <Box sx={{ mt: 1, p: 1.5, borderRadius: '8px', backgroundColor: colors.grey[50] }}>
                                <Typography sx={{ fontSize: '0.65rem', color: colors.text.tertiary, lineHeight: 1.4 }}>
                                  {showExactaParcial && (
                                    <>
                                      <strong>Exacta:</strong> Usa este instrumento (ID {instrument.idInstrumento} + Moneda {instrument.moneda})<br />
                                      <strong>Parcial:</strong> Crea nueva moneda para ID {instrument.idInstrumento}<br />
                                    </>
                                  )}
                                  {showCopiar && <><strong>Copiar:</strong> Solo copia datos, mantiene ID auto-generado<br /></>}
                                  {showModificar && (
                                    <><strong>Modificar:</strong> Carga todos los datos del instrumento para editar atributos. Se creará una nueva versión al guardar.</>
                                  )}
                                  {isNewInstrument && (
                                    <>El instrumento actual es nuevo. Complete los datos manualmente.</>
                                  )}
                                </Typography>
                              </Box>
                            </Box>
                          </Box>
                        </Collapse>
                      </Box>
                    );
                  })}

                  {/* Loading more indicator */}
                  {loadingMore && (
                    <Box sx={{ textAlign: 'center', py: 2 }}>
                      <CircularProgress size={24} sx={{ color: colors.primary.main }} />
                      <Typography sx={{ fontSize: '0.7rem', color: colors.text.tertiary, mt: 1 }}>
                        Cargando más resultados...
                      </Typography>
                    </Box>
                  )}

                  {/* Mensaje de scroll */}
                  {hasMore && !loadingMore && (
                    <Box sx={{ textAlign: 'center', py: 1 }}>
                      <Typography sx={{ fontSize: '0.65rem', color: colors.text.muted }}>
                        Desplácese para cargar más resultados
                      </Typography>
                    </Box>
                  )}

                  {/* End of results */}
                  {!hasMore && results.length > 0 && (
                    <Box sx={{ textAlign: 'center', py: 1 }}>
                      <Typography sx={{ fontSize: '0.65rem', color: colors.text.muted }}>
                        {results.length} resultado{results.length !== 1 ? 's' : ''} encontrado{results.length !== 1 ? 's' : ''}
                      </Typography>
                    </Box>
                  )}
                </Box>
              )}
            </Box>
          </Paper>
        </ClickAwayListener>
      )}
    </Box>
  );
};

export default SearchHelper;
