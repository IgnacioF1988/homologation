/**
 * Pipeline Configuration - Pipeline ETL
 * Configuración central de etapas, sub-etapas y mapeos
 * Extraído y extendido de PipelineExecution.jsx
 */

import StorageIcon from '@mui/icons-material/Storage';
import VerifiedIcon from '@mui/icons-material/Verified';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import DataObjectIcon from '@mui/icons-material/DataObject';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import PublicIcon from '@mui/icons-material/Public';
import ViewInArIcon from '@mui/icons-material/ViewInAr';
import { colors } from '../../../styles/theme';

/**
 * PIPELINE_STAGES - Configuración de las 8 etapas principales
 * Cada etapa incluye: id, dbField (campo en BD), nombre, icono, colores
 */
export const PIPELINE_STAGES = [
  {
    id: 'EXTRACCION',
    dbField: 'Estado_Extraccion',
    nombre: 'Extracción',
    icono: StorageIcon,
    color: colors.info.main,
    colorDark: colors.info.dark
  },
  {
    id: 'VALIDACION',
    dbField: 'Estado_Validacion',
    nombre: 'Validación',
    icono: VerifiedIcon,
    color: colors.secondary.main,
    colorDark: colors.secondary.dark
  },
  {
    id: 'PROCESS_IPA',
    dbField: 'Estado_Process_IPA',
    nombre: 'IPA',
    icono: AccountBalanceIcon,
    color: colors.success.main,
    colorDark: colors.success.dark
  },
  {
    id: 'PROCESS_CAPM',
    dbField: 'Estado_Process_CAPM',
    nombre: 'CAPM',
    icono: TrendingUpIcon,
    color: colors.warning.main,
    colorDark: colors.warning.dark
  },
  {
    id: 'PROCESS_DERIVADOS',
    dbField: 'Estado_Process_Derivados',
    nombre: 'Derivados',
    icono: DataObjectIcon,
    color: colors.primary.main,
    colorDark: colors.primary.dark
  },
  {
    id: 'PROCESS_PNL',
    dbField: 'Estado_Process_PNL',
    nombre: 'PNL',
    icono: ShowChartIcon,
    color: colors.error.main,
    colorDark: colors.error.dark
  },
  {
    id: 'PROCESS_UBS',
    dbField: 'Estado_Process_UBS',
    nombre: 'UBS',
    icono: PublicIcon,
    color: colors.secondary.main,
    colorDark: colors.secondary.dark
  },
  {
    id: 'CONCATENAR',
    dbField: 'Estado_Concatenar',
    nombre: 'Cubo',
    icono: ViewInArIcon,
    color: colors.info.main,
    colorDark: colors.info.dark
  },
];

/**
 * ETAPA_ACTUAL_MAP - Mapeo de Etapa_Actual (backend) a ID de etapa (frontend)
 * Usado para determinar qué etapa está actualmente en ejecución
 */
export const ETAPA_ACTUAL_MAP = {
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
};

/**
 * SUB_STAGE_CONFIG - Configuración de sub-etapas por fase
 * Cada fase tiene un array de sub-etapas con: key (campo BD), label, orden
 */
export const SUB_STAGE_CONFIG = {
  PROCESS_IPA: [
    { key: 'Estado_IPA_01_RescatarLocalPrice', label: 'Rescatar LocalPrice', orden: 1 },
    { key: 'Estado_IPA_02_AjusteSONA', label: 'Ajuste SONA', orden: 2 },
    { key: 'Estado_IPA_03_RenombrarCxCCxP', label: 'Renombrar CxC/CxP', orden: 3 },
    { key: 'Estado_IPA_04_TratamientoSuciedades', label: 'Tratamiento Suciedades', orden: 4 },
    { key: 'Estado_IPA_05_EliminarCajasMTM', label: 'Eliminar Cajas MTM', orden: 5 },
    { key: 'Estado_IPA_06_CrearDimensiones', label: 'Crear Dimensiones', orden: 6 },
    { key: 'Estado_IPA_07_AgruparRegistros', label: 'Agrupar Registros', orden: 7 },
  ],

  PROCESS_CAPM: [
    { key: 'Estado_CAPM_01_Ajuste', label: 'Ajuste CAPM', orden: 1 },
    { key: 'Estado_CAPM_02_ExtractTransform', label: 'Extract & Transform', orden: 2 },
    { key: 'Estado_CAPM_03_CargaFinal', label: 'Carga Final', orden: 3 },
  ],

  PROCESS_DERIVADOS: [
    { key: 'Estado_DERIV_01_Posiciones', label: 'Posiciones Long/Short', orden: 1 },
    { key: 'Estado_DERIV_02_Dimensiones', label: 'Dimensiones', orden: 2 },
    { key: 'Estado_DERIV_03_Ajuste', label: 'Ajuste', orden: 3 },
    { key: 'Estado_DERIV_04_Paridad', label: 'Paridad', orden: 4 },
  ],

  PROCESS_PNL: [
    { key: 'Estado_PNL_01_Dimensiones', label: 'Dimensiones', orden: 1 },
    { key: 'Estado_PNL_02_Ajuste', label: 'Ajuste', orden: 2 },
    { key: 'Estado_PNL_03_Agrupacion', label: 'Agrupación', orden: 3 },
    { key: 'Estado_PNL_04_AjusteIPA', label: 'Ajuste vs IPA', orden: 4 },
    { key: 'Estado_PNL_05_Consolidar', label: 'Consolidar', orden: 5 },
  ],

  PROCESS_UBS: [
    { key: 'Estado_UBS_01_Tratamiento', label: 'Tratamiento Fondos', orden: 1 },
    { key: 'Estado_UBS_02_Derivados', label: 'Derivados MLCCII', orden: 2 },
    { key: 'Estado_UBS_03_Cartera', label: 'Cartera MLCCII', orden: 3 },
  ],
};

/**
 * getStageById - Obtiene configuración de etapa por ID
 * @param {string} stageId - ID de la etapa
 * @returns {Object|null} - Configuración de la etapa o null
 */
export const getStageById = (stageId) => {
  return PIPELINE_STAGES.find(stage => stage.id === stageId) || null;
};

/**
 * getStageByDbField - Obtiene configuración de etapa por campo de BD
 * @param {string} dbField - Campo de BD (ej: 'Estado_Process_IPA')
 * @returns {Object|null} - Configuración de la etapa o null
 */
export const getStageByDbField = (dbField) => {
  return PIPELINE_STAGES.find(stage => stage.dbField === dbField) || null;
};

/**
 * getSubStages - Obtiene sub-etapas de una fase
 * @param {string} stageId - ID de la etapa
 * @returns {Array} - Array de sub-etapas o array vacío
 */
export const getSubStages = (stageId) => {
  return SUB_STAGE_CONFIG[stageId] || [];
};

/**
 * hasSubStages - Verifica si una etapa tiene sub-etapas
 * @param {string} stageId - ID de la etapa
 * @returns {boolean} - True si tiene sub-etapas
 */
export const hasSubStages = (stageId) => {
  return !!SUB_STAGE_CONFIG[stageId] && SUB_STAGE_CONFIG[stageId].length > 0;
};

/**
 * getStageIndex - Obtiene índice de una etapa en el pipeline
 * @param {string} stageId - ID de la etapa
 * @returns {number} - Índice (0-7) o -1 si no existe
 */
export const getStageIndex = (stageId) => {
  return PIPELINE_STAGES.findIndex(stage => stage.id === stageId);
};

/**
 * isStageAfter - Verifica si stageA está después de stageB en el pipeline
 * @param {string} stageA - ID de la primera etapa
 * @param {string} stageB - ID de la segunda etapa
 * @returns {boolean} - True si stageA está después de stageB
 */
export const isStageAfter = (stageA, stageB) => {
  return getStageIndex(stageA) > getStageIndex(stageB);
};
