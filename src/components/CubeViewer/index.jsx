/**
 * CubeViewer - Visualizador de Cubo IPA v1.0
 *
 * Dashboard interactivo para explorar el cubo de posiciones
 * con KPIs, gráficos de distribución y tabla de datos enriquecidos
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  Grid,
  Autocomplete,
  TextField,
  Chip,
  Button,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  IconButton,
  alpha,
  Divider,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import RefreshIcon from '@mui/icons-material/Refresh';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import PublicIcon from '@mui/icons-material/Public';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import PieChartIcon from '@mui/icons-material/PieChart';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import FilterListIcon from '@mui/icons-material/FilterList';

import { cuboService } from '../../services/cuboService';
import DateField from '../fields/DateField';
import { colors } from '../../styles/theme';

// Formateador de números
const formatNumber = (num, decimals = 0) => {
  if (num === null || num === undefined) return '-';
  return new Intl.NumberFormat('es-CL', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
};

const formatCurrency = (num) => {
  if (num === null || num === undefined) return '-';
  if (Math.abs(num) >= 1e9) {
    return `$${(num / 1e9).toFixed(2)}B`;
  }
  if (Math.abs(num) >= 1e6) {
    return `$${(num / 1e6).toFixed(2)}M`;
  }
  if (Math.abs(num) >= 1e3) {
    return `$${(num / 1e3).toFixed(1)}K`;
  }
  return `$${formatNumber(num, 0)}`;
};

// KPI Card Component
const KPICard = ({ title, value, subtitle, icon: Icon, color = 'primary', loading }) => (
  <Paper
    elevation={0}
    sx={{
      p: 3,
      height: '100%',
      border: `1px solid ${colors.border.light}`,
      borderRadius: 3,
      background: `linear-gradient(135deg, ${alpha(colors[color]?.main || colors.primary.main, 0.03)} 0%, ${alpha(colors[color]?.main || colors.primary.main, 0.08)} 100%)`,
      position: 'relative',
      overflow: 'hidden',
    }}
  >
    <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
      <Box>
        <Typography
          variant="overline"
          sx={{
            color: colors.text.tertiary,
            fontWeight: 600,
            letterSpacing: '0.1em',
            fontSize: '0.65rem',
          }}
        >
          {title}
        </Typography>
        {loading ? (
          <Skeleton width={120} height={40} />
        ) : (
          <Typography
            variant="h4"
            sx={{
              fontWeight: 700,
              color: colors[color]?.dark || colors.primary.dark,
              mt: 0.5,
              letterSpacing: '-0.02em',
            }}
          >
            {value}
          </Typography>
        )}
        {subtitle && (
          <Typography variant="caption" sx={{ color: colors.text.muted, mt: 0.5 }}>
            {subtitle}
          </Typography>
        )}
      </Box>
      <Box
        sx={{
          width: 48,
          height: 48,
          borderRadius: 2,
          backgroundColor: alpha(colors[color]?.main || colors.primary.main, 0.1),
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon sx={{ color: colors[color]?.main || colors.primary.main, fontSize: 24 }} />
      </Box>
    </Box>
  </Paper>
);

// Distribution Chart (Bar) Component
const DistributionChart = ({ data, title, loading, colorScale = 'primary' }) => {
  if (loading) {
    return (
      <Box sx={{ p: 3 }}>
        <Skeleton width="60%" height={24} sx={{ mb: 2 }} />
        {[1, 2, 3, 4, 5].map(i => (
          <Skeleton key={i} height={32} sx={{ mb: 1 }} />
        ))}
      </Box>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Typography color="text.secondary">Sin datos</Typography>
      </Box>
    );
  }

  const maxValue = Math.max(...data.map(d => d.totalMVal || 0));
  const total = data.reduce((sum, d) => sum + (d.totalMVal || 0), 0);

  const colorPalette = [
    colors.primary.main,
    colors.secondary.main,
    colors.success.main,
    colors.warning.main,
    colors.info.main,
    '#8b5cf6',
    '#ec4899',
    '#06b6d4',
  ];

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 2, color: colors.text.secondary }}>
        {title}
      </Typography>
      {data.slice(0, 8).map((item, index) => {
        const percentage = total > 0 ? (item.totalMVal / total) * 100 : 0;
        const barColor = colorPalette[index % colorPalette.length];

        return (
          <Box key={item.dimKey || index} sx={{ mb: 1.5 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography variant="caption" sx={{ fontWeight: 500, color: colors.text.primary }}>
                {item.dimLabel || 'N/A'}
              </Typography>
              <Typography variant="caption" sx={{ color: colors.text.secondary }}>
                {formatCurrency(item.totalMVal)} ({percentage.toFixed(1)}%)
              </Typography>
            </Box>
            <Box
              sx={{
                height: 8,
                borderRadius: 1,
                backgroundColor: colors.grey[100],
                overflow: 'hidden',
              }}
            >
              <Box
                sx={{
                  height: '100%',
                  width: `${(item.totalMVal / maxValue) * 100}%`,
                  backgroundColor: barColor,
                  borderRadius: 1,
                  transition: 'width 0.5s ease-out',
                }}
              />
            </Box>
          </Box>
        );
      })}
      {data.length > 8 && (
        <Typography variant="caption" sx={{ color: colors.text.muted, fontStyle: 'italic' }}>
          +{data.length - 8} más...
        </Typography>
      )}
    </Box>
  );
};

// Main Component
const CubeViewer = () => {
  // State
  const [fechasDisponibles, setFechasDisponibles] = useState([]); // Para validar fechas disponibles
  const [fondos, setFondos] = useState([]);
  const [selectedFecha, setSelectedFecha] = useState(''); // Formato YYYY-MM-DD para DateField
  const [selectedFondos, setSelectedFondos] = useState([]);
  const [stats, setStats] = useState(null);
  const [distribution, setDistribution] = useState(null);
  const [distributionType, setDistributionType] = useState('investmentType');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState({ fechas: true, fondos: true, stats: false, data: false });
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [fechaError, setFechaError] = useState(null);

  // Load initial data
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const [fechasRes, fondosRes] = await Promise.all([
          cuboService.getFechasReporte(),
          cuboService.getFondos(),
        ]);

        if (fechasRes.success) {
          setFechasDisponibles(fechasRes.data);
          // Auto-select most recent date (formato YYYY-MM-DD)
          if (fechasRes.data.length > 0) {
            setSelectedFecha(fechasRes.data[0]);
          }
        }

        if (fondosRes.success) {
          setFondos(fondosRes.data);
        }
      } catch (error) {
        console.error('Error loading initial data:', error);
      } finally {
        setLoading(prev => ({ ...prev, fechas: false, fondos: false }));
      }
    };

    loadInitialData();
  }, []);

  // Validar si la fecha seleccionada tiene datos
  const handleFechaChange = useCallback((e) => {
    const newFecha = e.target.value;
    setSelectedFecha(newFecha);

    // Validar si la fecha existe en las disponibles
    if (newFecha && fechasDisponibles.length > 0) {
      const exists = fechasDisponibles.includes(newFecha);
      setFechaError(exists ? null : 'No hay datos para esta fecha');
    } else {
      setFechaError(null);
    }
  }, [fechasDisponibles]);

  // Load data when filters change
  useEffect(() => {
    if (!selectedFecha) return;

    const loadCubeData = async () => {
      setLoading(prev => ({ ...prev, stats: true, data: true }));

      const filters = {
        fechaReporte: selectedFecha,
        fondos: selectedFondos.map(f => f.ID_Fund),
      };

      try {
        const [statsRes, dataRes, distRes] = await Promise.all([
          cuboService.getStats(filters),
          cuboService.getData({ ...filters, limit: 100 }),
          cuboService.getDistribution(distributionType, filters),
        ]);

        if (statsRes.success) setStats(statsRes.data);
        if (dataRes.success) setData(dataRes.data);
        if (distRes.success) setDistribution(distRes.data);
      } catch (error) {
        console.error('Error loading cube data:', error);
      } finally {
        setLoading(prev => ({ ...prev, stats: false, data: false }));
      }
    };

    loadCubeData();
  }, [selectedFecha, selectedFondos, distributionType]);

  // Handle distribution type change
  const handleDistributionChange = useCallback((_, newType) => {
    if (newType) setDistributionType(newType);
  }, []);

  // Handle download
  const handleDownload = useCallback(async () => {
    if (!selectedFecha) return;

    const url = await cuboService.downloadCSV({
      fechaReporte: selectedFecha,
      fondos: selectedFondos.map(f => f.ID_Fund),
    });

    window.open(`http://localhost:3001${url}`, '_blank');
  }, [selectedFecha, selectedFondos]);

  // Handle refresh
  const handleRefresh = useCallback(() => {
    setSelectedFecha(prev => prev); // Trigger re-fetch
  }, []);

  // Distribution type options
  const distributionOptions = [
    { value: 'investmentType', label: 'Tipo', icon: ShowChartIcon },
    { value: 'fund', label: 'Fondo', icon: AccountBalanceIcon },
    { value: 'currency', label: 'Moneda', icon: AttachMoneyIcon },
    { value: 'riskCountry', label: 'País', icon: PublicIcon },
    { value: 'estrategia', label: 'Estrategia', icon: PieChartIcon },
  ];

  // Table columns
  const columns = [
    { id: 'FundShortName', label: 'Fondo', width: 100 },
    { id: 'Name_Instrumento', label: 'Instrumento', width: 200 },
    { id: 'CompanyName', label: 'Emisor', width: 150 },
    { id: 'InvestmentType', label: 'Tipo', width: 100 },
    { id: 'Currency', label: 'Moneda', width: 80 },
    { id: 'Issue_Country', label: 'País', width: 80 },
    { id: 'BalanceSheet', label: 'Balance', width: 80 },
    { id: 'Qty', label: 'Cantidad', width: 120, align: 'right', format: v => formatNumber(v, 0) },
    { id: 'LocalPrice', label: 'Precio', width: 100, align: 'right', format: v => formatNumber(v, 4) },
    { id: 'TotalMVal', label: 'Valor Total', width: 130, align: 'right', format: v => formatCurrency(v) },
  ];

  return (
    <Box>
      {/* Header with Filters */}
      <Paper
        elevation={0}
        sx={{
          p: 3,
          mb: 3,
          borderRadius: 3,
          border: `1px solid ${colors.border.light}`,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box
              sx={{
                width: 48,
                height: 48,
                borderRadius: 2,
                background: colors.primary.gradient,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ViewModuleIcon sx={{ color: '#fff', fontSize: 24 }} />
            </Box>
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 700, color: colors.text.primary }}>
                Visualizador Cubo IPA
              </Typography>
              <Typography variant="body2" sx={{ color: colors.text.tertiary }}>
                Explorador de posiciones con dimensionales enriquecidas
              </Typography>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Tooltip title="Refrescar datos">
              <IconButton onClick={handleRefresh} disabled={loading.data}>
                <RefreshIcon />
              </IconButton>
            </Tooltip>
            <Button
              variant="contained"
              startIcon={<DownloadIcon />}
              onClick={handleDownload}
              disabled={!selectedFecha || loading.data}
              sx={{ borderRadius: 2 }}
            >
              Descargar CSV
            </Button>
          </Box>
        </Box>

        <Divider sx={{ mb: 3 }} />

        {/* Filters */}
        <Grid container spacing={3} alignItems="flex-start">
          <Grid item xs={12} md={4}>
            <DateField
              name="fechaReporte"
              label="Fecha de Reporte"
              value={selectedFecha}
              onChange={handleFechaChange}
              error={fechaError}
              helperText={fechaError || (fechasDisponibles.length > 0 ? `${fechasDisponibles.length} fechas con datos disponibles` : 'Cargando fechas...')}
              width="full"
              disabled={loading.fechas}
            />
          </Grid>
          <Grid item xs={12} md={8}>
            <Autocomplete
              multiple
              options={fondos}
              value={selectedFondos}
              onChange={(_, value) => setSelectedFondos(value)}
              getOptionLabel={(option) => option.FundShortName || ''}
              loading={loading.fondos}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Fondos"
                  placeholder={selectedFondos.length === 0 ? "Todos los fondos" : ""}
                  InputProps={{
                    ...params.InputProps,
                    startAdornment: (
                      <>
                        <FilterListIcon sx={{ color: colors.text.muted, mr: 1, fontSize: 20 }} />
                        {params.InputProps.startAdornment}
                      </>
                    ),
                  }}
                />
              )}
              renderTags={(value, getTagProps) =>
                value.map((option, index) => (
                  <Chip
                    {...getTagProps({ index })}
                    key={option.ID_Fund}
                    label={option.FundShortName}
                    size="small"
                    sx={{ borderRadius: 1 }}
                  />
                ))
              }
              renderOption={(props, option) => (
                <li {...props}>
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      {option.FundShortName}
                    </Typography>
                    <Typography variant="caption" sx={{ color: colors.text.muted }}>
                      {option.Estrategia_Cons_Fondo || 'Sin estrategia'}
                    </Typography>
                  </Box>
                </li>
              )}
            />
          </Grid>
        </Grid>
      </Paper>

      {/* KPIs */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={6} md={3}>
          <KPICard
            title="AUM Total"
            value={formatCurrency(stats?.aumTotal)}
            subtitle={stats?.aumAssets ? `Assets: ${formatCurrency(stats.aumAssets)}` : null}
            icon={TrendingUpIcon}
            color="primary"
            loading={loading.stats}
          />
        </Grid>
        <Grid item xs={6} md={3}>
          <KPICard
            title="Posiciones"
            value={formatNumber(stats?.totalPosiciones)}
            icon={ShowChartIcon}
            color="info"
            loading={loading.stats}
          />
        </Grid>
        <Grid item xs={6} md={3}>
          <KPICard
            title="Instrumentos"
            value={formatNumber(stats?.instrumentosUnicos)}
            subtitle="Únicos"
            icon={PieChartIcon}
            color="secondary"
            loading={loading.stats}
          />
        </Grid>
        <Grid item xs={6} md={3}>
          <KPICard
            title="Fondos"
            value={formatNumber(stats?.fondos)}
            icon={AccountBalanceIcon}
            color="success"
            loading={loading.stats}
          />
        </Grid>
      </Grid>

      {/* Distribution Chart & Data Table */}
      <Grid container spacing={3}>
        {/* Distribution */}
        <Grid item xs={12} md={4}>
          <Paper
            elevation={0}
            sx={{
              borderRadius: 3,
              border: `1px solid ${colors.border.light}`,
              height: '100%',
            }}
          >
            <Box sx={{ p: 2, borderBottom: `1px solid ${colors.border.light}` }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
                Distribución por
              </Typography>
              <ToggleButtonGroup
                value={distributionType}
                exclusive
                onChange={handleDistributionChange}
                size="small"
                sx={{
                  flexWrap: 'wrap',
                  '& .MuiToggleButton-root': {
                    borderRadius: '8px !important',
                    border: `1px solid ${colors.border.light} !important`,
                    mx: 0.5,
                    mb: 0.5,
                    px: 1.5,
                    py: 0.5,
                    textTransform: 'none',
                    fontSize: '0.75rem',
                    '&.Mui-selected': {
                      backgroundColor: alpha(colors.primary.main, 0.1),
                      color: colors.primary.main,
                      borderColor: `${colors.primary.main} !important`,
                    },
                  },
                }}
              >
                {distributionOptions.map(opt => (
                  <ToggleButton key={opt.value} value={opt.value}>
                    <opt.icon sx={{ fontSize: 16, mr: 0.5 }} />
                    {opt.label}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            </Box>
            <DistributionChart
              data={distribution}
              title={distributionOptions.find(o => o.value === distributionType)?.label}
              loading={loading.stats}
            />
          </Paper>
        </Grid>

        {/* Data Table */}
        <Grid item xs={12} md={8}>
          <Paper
            elevation={0}
            sx={{
              borderRadius: 3,
              border: `1px solid ${colors.border.light}`,
              overflow: 'hidden',
            }}
          >
            <Box sx={{ p: 2, borderBottom: `1px solid ${colors.border.light}` }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                Top Posiciones
              </Typography>
              <Typography variant="caption" sx={{ color: colors.text.muted }}>
                {data.length} registros cargados (ordenados por valor)
              </Typography>
            </Box>

            <TableContainer sx={{ maxHeight: 500 }}>
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow>
                    {columns.map(col => (
                      <TableCell
                        key={col.id}
                        align={col.align || 'left'}
                        sx={{
                          width: col.width,
                          fontWeight: 600,
                          fontSize: '0.7rem',
                          backgroundColor: colors.grey[50],
                        }}
                      >
                        {col.label}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {loading.data ? (
                    [...Array(10)].map((_, i) => (
                      <TableRow key={i}>
                        {columns.map(col => (
                          <TableCell key={col.id}>
                            <Skeleton />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : (
                    data
                      .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                      .map((row, index) => (
                        <TableRow
                          key={row.PK2 || index}
                          hover
                          sx={{
                            '&:nth-of-type(odd)': { backgroundColor: alpha(colors.grey[50], 0.5) },
                          }}
                        >
                          {columns.map(col => (
                            <TableCell
                              key={col.id}
                              align={col.align || 'left'}
                              sx={{ fontSize: '0.8rem' }}
                            >
                              {col.format ? col.format(row[col.id]) : (row[col.id] || '-')}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>

            <TablePagination
              component="div"
              count={data.length}
              page={page}
              onPageChange={(_, newPage) => setPage(newPage)}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={(e) => {
                setRowsPerPage(parseInt(e.target.value, 10));
                setPage(0);
              }}
              rowsPerPageOptions={[10, 25, 50, 100]}
              labelRowsPerPage="Filas:"
              labelDisplayedRows={({ from, to, count }) => `${from}-${to} de ${count}`}
            />
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default CubeViewer;
