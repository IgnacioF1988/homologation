/**
 * dimensionConfig.js - Configuración de dimensiones para el Explorador Dimensional
 *
 * Define las 14 dimensiones de catálogos + 5 dimensiones booleanas
 * que se pueden usar para filtrar el stock de instrumentos.
 *
 * NOTA: Los datos de catálogos se cargan dinámicamente desde la API
 * a través del hook useDimensionData
 */

import ShowChartIcon from '@mui/icons-material/ShowChart';
import BusinessIcon from '@mui/icons-material/Business';
import PublicIcon from '@mui/icons-material/Public';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import SourceIcon from '@mui/icons-material/Source';
import CategoryIcon from '@mui/icons-material/Category';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import PercentIcon from '@mui/icons-material/Percent';
import EventRepeatIcon from '@mui/icons-material/EventRepeat';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import StorageIcon from '@mui/icons-material/Storage';
import RankingIcon from '@mui/icons-material/EmojiEvents';
import ToggleOnIcon from '@mui/icons-material/ToggleOn';
import FlagIcon from '@mui/icons-material/Flag';
import ApartmentIcon from '@mui/icons-material/Apartment';

/**
 * Configuración de dimensiones principales (catálogos)
 * getData se ejecuta con los catálogos cargados como parámetro
 */
export const DIMENSIONS = [
  {
    key: 'investmentTypes',
    label: 'Tipo Inversión',
    field: 'investmentTypeCode',
    icon: ShowChartIcon,
    priority: 1,
    color: '#0d9488', // teal
    getData: (catalogos) => (catalogos.investmentTypes || []).filter(t => t.activo).map(t => ({
      value: t.id,
      label: t.nombre,
      description: t.descripcion,
    })),
  },
  {
    key: 'issuerTypes',
    label: 'Tipo Emisor',
    field: 'issuerTypeCode',
    icon: BusinessIcon,
    priority: 2,
    color: '#6366f1', // indigo
    getData: (catalogos) => (catalogos.issuerTypes || []).filter(t => t.activo).map(t => ({
      value: t.id,
      label: t.nombre,
      description: t.descripcion,
    })),
  },
  {
    key: 'companias',
    label: 'Compañía',
    field: 'companyName',
    icon: ApartmentIcon,
    priority: 3,
    color: '#0ea5e9', // sky blue
    getData: (catalogos) => (catalogos.companias || []).filter(c => c.activo).map(c => ({
      value: c.companyName,
      label: c.companyName,
    })),
  },
  {
    key: 'paises',
    label: 'País',
    field: 'issueCountry',
    icon: PublicIcon,
    priority: 3,
    color: '#f59e0b', // amber
    getData: (catalogos) => (catalogos.paises || []).filter(p => p.activo).map(p => ({
      value: p.code,
      label: p.ShortName || p.Description || p.code,
    })),
  },
  {
    key: 'riskCountry',
    label: 'País Riesgo',
    field: 'riskCountry',
    icon: FlagIcon,
    priority: 4,
    color: '#ef4444', // red
    getData: (catalogos) => (catalogos.paises || []).filter(p => p.activo).map(p => ({
      value: p.code,
      label: p.ShortName || p.Description || p.code,
    })),
  },
  {
    key: 'monedas',
    label: 'Moneda Emisión',
    field: 'issueCurrency',
    icon: AttachMoneyIcon,
    priority: 5,
    color: '#10b981', // emerald
    getData: (catalogos) => (catalogos.monedas || []).filter(m => m.activo).map(m => ({
      value: m.nombre,
      label: m.descripcion || m.nombre,
    })),
  },
  {
    key: 'dataSources',
    label: 'Origen',
    field: 'publicDataSource',
    icon: SourceIcon,
    priority: 6,
    color: '#8b5cf6', // violet
    getData: (catalogos) => (catalogos.dataSources || []).filter(d => d.activo).map(d => ({
      value: d.nombre,
      label: d.nombre,
      description: d.descripcion,
    })),
  },
  {
    key: 'fuentes',
    label: 'Fuente Consulta',
    field: 'fuente',
    icon: StorageIcon,
    priority: 7,
    color: '#3b82f6', // blue
    getData: (catalogos) => (catalogos.fuentes || []).filter(f => f.activo).map(f => ({
      value: f.nombre,
      label: f.nombre,
      description: f.descripcion,
    })),
  },
  {
    key: 'sectoresGICS',
    label: 'Sector GICS',
    field: 'sectorGICS',
    icon: CategoryIcon,
    priority: 8,
    color: '#ec4899', // pink
    isLarge: false,
    getData: (catalogos) => {
      // Obtener nombres únicos de sectores usando GICS_Sector_ShortName
      const uniqueLabels = new Map();
      (catalogos.sectoresGICS || []).filter(s => s.activo).forEach(s => {
        const label = s.GICS_Sector_ShortName || s.nombre;
        if (!uniqueLabels.has(label)) {
          uniqueLabels.set(label, s.code);
        }
      });
      return Array.from(uniqueLabels.entries()).map(([label, code]) => ({
        value: code,
        label: label,
      }));
    },
  },
  {
    key: 'sectorChile',
    label: 'Sector Chile',
    field: 'sectorChileTypeCode',
    icon: AccountBalanceIcon,
    priority: 9,
    color: '#14b8a6', // teal-light
    getData: (catalogos) => (catalogos.sectorChile || []).filter(s => s.activo).map(s => ({
      value: s.id,
      label: s.nombre,
      description: s.descripcion,
    })),
  },
  {
    key: 'issueTypes',
    label: 'Tipo Emisión',
    field: 'issueTypeCode',
    icon: CategoryIcon,
    priority: 10,
    color: '#f97316', // orange
    getData: (catalogos) => (catalogos.issueTypes || []).filter(t => t.activo).map(t => ({
      value: t.id,
      label: t.nombre,
      description: t.descripcion,
    })),
  },
  {
    key: 'couponTypes',
    label: 'Tipo Cupón',
    field: 'couponTypeCode',
    icon: PercentIcon,
    priority: 11,
    color: '#06b6d4', // cyan
    getData: (catalogos) => (catalogos.couponTypes || []).filter(c => c.activo).map(c => ({
      value: c.id,
      label: c.nombre,
      description: c.descripcion,
    })),
  },
  {
    key: 'couponFrequencies',
    label: 'Frecuencia Cupón',
    field: 'couponFrequency',
    icon: EventRepeatIcon,
    priority: 12,
    color: '#84cc16', // lime
    getData: (catalogos) => (catalogos.couponFrequencies || []).filter(f => f.activo).map(f => ({
      value: f.pagosAnuales,
      label: f.nombre,
    })),
  },
  {
    key: 'yieldTypes',
    label: 'Tipo Yield',
    field: 'yieldType',
    icon: TrendingUpIcon,
    priority: 13,
    color: '#a855f7', // purple
    getData: (catalogos) => (catalogos.yieldTypes || []).filter(y => y.activo).map(y => ({
      value: y.code,
      label: `${y.code} - ${y.descripcion}`,
    })),
  },
  {
    key: 'yieldSources',
    label: 'Fuente Yield',
    field: 'yieldSource',
    icon: StorageIcon,
    priority: 14,
    color: '#22c55e', // green
    getData: (catalogos) => (catalogos.yieldSources || []).filter(y => y.activo).map(y => ({
      value: y.nombre,
      label: y.nombre,
      description: y.descripcion,
    })),
  },
  {
    key: 'rankCodes',
    label: 'Rank Code',
    field: 'rankCode',
    icon: RankingIcon,
    priority: 15,
    color: '#eab308', // yellow
    getData: (catalogos) => (catalogos.rankCodes || []).filter(r => r.activo).map(r => ({
      value: r.id,
      label: r.nombre,
      description: r.descripcion,
    })),
  },
];

// Helper para mapear catálogo booleano a formato de dimensión
const mapBooleanCatalog = (catalogos, positiveColor = '#10b981', negativeColor = '#ef4444') => {
  return (catalogos.booleanValues || []).filter(b => b.activo).map(b => ({
    value: b.codigo,
    label: b.nombre,
    color: b.codigo === 'S' ? positiveColor : negativeColor,
  }));
};

/**
 * Configuración de dimensiones booleanas
 * Todas usan booleanValues unificado (S/N en español)
 */
export const BOOLEAN_DIMENSIONS = [
  {
    key: 'emisionNacional',
    label: 'Emisión Nacional',
    field: 'emisionNacional',
    icon: ToggleOnIcon,
    getValues: (catalogos) => mapBooleanCatalog(catalogos),
  },
  {
    key: 'perpetuidad',
    label: 'Perpetuidad',
    field: 'perpetuidad',
    icon: ToggleOnIcon,
    getValues: (catalogos) => mapBooleanCatalog(catalogos),
  },
  {
    key: 'rendimiento',
    label: 'Rendimiento',
    field: 'rendimiento',
    icon: ToggleOnIcon,
    getValues: (catalogos) => mapBooleanCatalog(catalogos),
  },
  {
    key: 'callable',
    label: 'Callable',
    field: 'callable',
    icon: ToggleOnIcon,
    getValues: (catalogos) => mapBooleanCatalog(catalogos),
  },
  {
    key: 'coco',
    label: 'CoCo',
    field: 'coco',
    icon: ToggleOnIcon,
    getValues: (catalogos) => mapBooleanCatalog(catalogos),
  },
  {
    key: 'sinkable',
    label: 'Sinkable',
    field: 'sinkable',
    icon: ToggleOnIcon,
    getValues: (catalogos) => mapBooleanCatalog(catalogos),
  },
  {
    key: 'esReestructuracion',
    label: 'Es Reestructuración',
    field: 'esReestructuracion',
    icon: ToggleOnIcon,
    getValues: (catalogos) => mapBooleanCatalog(catalogos),
  },
];

/**
 * Obtiene todas las dimensiones (catálogos + booleanos)
 */
export const getAllDimensions = () => [...DIMENSIONS, ...BOOLEAN_DIMENSIONS];

/**
 * Obtiene una dimensión por su key
 */
export const getDimensionByKey = (key) => {
  return DIMENSIONS.find(d => d.key === key) ||
         BOOLEAN_DIMENSIONS.find(d => d.key === key) ||
         null;
};

/**
 * Obtiene una dimensión por el nombre del campo
 */
export const getDimensionByField = (field) => {
  return DIMENSIONS.find(d => d.field === field) ||
         BOOLEAN_DIMENSIONS.find(d => d.field === field) ||
         null;
};

/**
 * Columnas para la grilla de resultados
 */
export const RESULT_GRID_COLUMNS = [
  { key: 'idInstrumento', label: 'ID', width: 60, align: 'center' },
  { key: 'nameInstrumento', label: 'Nombre', width: 220, flex: 1 },
  { key: 'investmentTypeCode', label: 'Tipo', width: 55, align: 'center' },
  { key: 'companyName', label: 'Compañía', width: 160 },
  { key: 'issuerTypeCode', label: 'Emisor', width: 65, align: 'center' },
  { key: 'sectorGICS', label: 'GICS', width: 70, align: 'center' },
  { key: 'issueCountry', label: 'País', width: 55, align: 'center' },
  { key: 'issueCurrency', label: 'Mon', width: 55, align: 'center' },
  { key: 'publicDataSource', label: 'Fuente', width: 65, align: 'center' },
  { key: 'isin', label: 'ISIN', width: 130 },
];

export default {
  DIMENSIONS,
  BOOLEAN_DIMENSIONS,
  getAllDimensions,
  getDimensionByKey,
  getDimensionByField,
  RESULT_GRID_COLUMNS,
};
