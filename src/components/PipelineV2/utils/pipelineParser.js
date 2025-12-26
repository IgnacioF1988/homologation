/**
 * pipelineParser.js - Utilidades de Parsing
 * Convierte datos backend (45+ campos) a modelo UI optimizado
 */

import { FINAL_STATUS, FLAG_BITS, hasFlag } from './constants';
import { PIPELINE_STAGES, SUB_STAGE_CONFIG } from './pipelineConfig';

/**
 * parseFondo - Parsea un fondo del backend a modelo UI optimizado
 * @param {Object} fondoBackend - Fondo raw del backend
 * @returns {ParsedFondo} - Fondo parseado
 */
export const parseFondo = (fondoBackend) => {
  if (!fondoBackend) return null;

  // Parsear stages principales (8 etapas)
  const stages = parseStages(fondoBackend);

  // Determinar status final del fondo
  const status = determineFinalStatus(fondoBackend, stages);

  // Flags principales
  const hasError = status === FINAL_STATUS.ERROR;
  const hasWarning = status === FINAL_STATUS.WARNING;
  const isProcessing = status === FINAL_STATUS.EN_PROGRESO;

  // Parsear flags a bitmask
  const flags = parseFlags(fondoBackend);

  // Parsear tiempos
  // IMPORTANTE: El backend retorna Inicio_Procesamiento, Fin_Procesamiento, Duracion_Ms
  const startTime = fondoBackend.Inicio_Procesamiento ? new Date(fondoBackend.Inicio_Procesamiento).getTime() : null;
  const endTime = fondoBackend.Fin_Procesamiento ? new Date(fondoBackend.Fin_Procesamiento).getTime() : null;
  const duration = fondoBackend.Duracion_Ms || null;

  // Error info
  // IMPORTANTE: El backend retorna Paso_Con_Error, Mensaje_Error
  const errorInfo = hasError ? {
    step: fondoBackend.Paso_Con_Error || 'Desconocido',
    message: fondoBackend.Mensaje_Error || 'Error sin mensaje',
  } : null;

  // Construir objeto parseado
  const parsed = {
    id: String(fondoBackend.ID_Fund),
    // IMPORTANTE: El backend retorna FundName (del JOIN) y FundShortName
    fullName: fondoBackend.FundName || fondoBackend.FundShortName || 'Sin nombre',
    shortName: fondoBackend.FundShortName || fondoBackend.FundName || 'SIN_CODIGO',
    status,
    hasError,
    hasWarning,
    isProcessing,
    stages,
    errorInfo,
    flags,
    startTime,
    endTime,
    duration,
    // Hash para detección de cambios (calculado después)
    _hash: null,
    // Raw data para debugging (opcional, comentar en producción)
    _raw: fondoBackend,
  };

  // Calcular hash para change detection
  parsed._hash = computeSimpleHash(parsed);

  return parsed;
};

/**
 * parseStages - Parsea las 8 etapas principales
 * @param {Object} fondoBackend - Fondo raw
 * @returns {Array<StageStatus>} - Array de 8 etapas
 */
export const parseStages = (fondoBackend) => {
  return PIPELINE_STAGES.map((stageConfig, index) => {
    const estadoString = fondoBackend[stageConfig.dbField];
    const estado = mapEstadoString(estadoString);

    return {
      id: stageConfig.id,
      index,
      estado,
      dbField: stageConfig.dbField,
      // Sub-etapas (lazy loading, se parsean cuando se expande)
      _hasSubStages: !!SUB_STAGE_CONFIG[stageConfig.id],
    };
  });
};

/**
 * parseSubStages - Parsea sub-etapas de una fase específica
 * @param {Object} fondoBackend - Fondo raw
 * @param {string} stageId - ID de la etapa (PROCESS_IPA, PROCESS_CAPM, etc.)
 * @returns {Array<SubStageStatus>|null} - Array de sub-etapas o null
 */
export const parseSubStages = (fondoBackend, stageId) => {
  const subStageConfig = SUB_STAGE_CONFIG[stageId];
  if (!subStageConfig) return null;

  return subStageConfig.map(config => {
    const estadoString = fondoBackend[config.key];
    const estado = mapEstadoString(estadoString);

    return {
      key: config.key,
      label: config.label,
      orden: config.orden,
      estado,
    };
  });
};

/**
 * parseIPASubStages - Parsea sub-etapas de IPA
 * @param {Object} fondoBackend - Fondo raw
 * @returns {Array<SubStageStatus>} - 7 sub-etapas de IPA
 */
export const parseIPASubStages = (fondoBackend) => {
  return parseSubStages(fondoBackend, 'PROCESS_IPA');
};

/**
 * parseCAPMSubStages - Parsea sub-etapas de CAPM
 * @param {Object} fondoBackend - Fondo raw
 * @returns {Array<SubStageStatus>} - 3 sub-etapas de CAPM
 */
export const parseCAPMSubStages = (fondoBackend) => {
  return parseSubStages(fondoBackend, 'PROCESS_CAPM');
};

/**
 * parseDerivadosSubStages - Parsea sub-etapas de Derivados
 * @param {Object} fondoBackend - Fondo raw
 * @returns {Array<SubStageStatus>} - 4 sub-etapas de Derivados
 */
export const parseDerivadosSubStages = (fondoBackend) => {
  return parseSubStages(fondoBackend, 'PROCESS_DERIVADOS');
};

/**
 * parsePNLSubStages - Parsea sub-etapas de PNL
 * @param {Object} fondoBackend - Fondo raw
 * @returns {Array<SubStageStatus>} - 5 sub-etapas de PNL
 */
export const parsePNLSubStages = (fondoBackend) => {
  return parseSubStages(fondoBackend, 'PROCESS_PNL');
};

/**
 * parseUBSSubStages - Parsea sub-etapas de UBS
 * @param {Object} fondoBackend - Fondo raw
 * @returns {Array<SubStageStatus>} - 3 sub-etapas de UBS
 */
export const parseUBSSubStages = (fondoBackend) => {
  return parseSubStages(fondoBackend, 'PROCESS_UBS');
};

/**
 * parseAllSubStages - Parsea TODAS las sub-etapas de todas las fases
 * @param {Object} fondoBackend - Fondo raw
 * @returns {Object} - Objeto con sub-etapas por fase
 */
export const parseAllSubStages = (fondoBackend) => {
  return {
    ipa: parseIPASubStages(fondoBackend),
    capm: parseCAPMSubStages(fondoBackend),
    derivados: parseDerivadosSubStages(fondoBackend),
    pnl: parsePNLSubStages(fondoBackend),
    ubs: parseUBSSubStages(fondoBackend),
  };
};

/**
 * mapEstadoString - Mapea string de estado del backend a enum
 * @param {string} estadoString - Estado como string ('OK', 'ERROR', etc.)
 * @returns {string} - Estado normalizado
 */
export const mapEstadoString = (estadoString) => {
  if (!estadoString) return 'PENDIENTE';

  // Normalizar string
  const normalized = String(estadoString).toUpperCase().trim();

  // Casos especiales
  if (normalized === 'N/A' || normalized === 'NA') return 'N/A';
  if (normalized === 'OMITIDO' || normalized === 'SKIP') return 'OMITIDO';

  // Retornar normalizado
  return normalized;
};

/**
 * determineFinalStatus - Determina el status final de un fondo
 * @param {Object} fondoBackend - Fondo raw
 * @param {Array<StageStatus>} stages - Etapas parseadas
 * @returns {number} - Status final (enum FINAL_STATUS)
 */
export const determineFinalStatus = (fondoBackend, stages) => {
  // Si hay error explícito
  if (fondoBackend.MensajeError || fondoBackend.PasoError) {
    return FINAL_STATUS.ERROR;
  }

  // Contar estados de las etapas
  let hasError = false;
  let hasWarning = false;
  let hasEnProgreso = false;
  let hasPendiente = false;
  let completedCount = 0;

  stages.forEach(stage => {
    switch (stage.estado) {
      case 'ERROR':
        hasError = true;
        completedCount++;
        break;
      case 'WARNING':
        hasWarning = true;
        completedCount++;
        break;
      case 'OK':
        completedCount++;
        break;
      case 'EN_PROGRESO':
        hasEnProgreso = true;
        break;
      case 'PENDIENTE':
        hasPendiente = true;
        break;
      case 'OMITIDO':
      case 'N/A':
        // No cuenta como completado ni pendiente
        break;
      default:
        break;
    }
  });

  // Determinar status final
  if (hasError) {
    return FINAL_STATUS.ERROR;
  }

  if (hasEnProgreso) {
    return FINAL_STATUS.EN_PROGRESO;
  }

  if (hasPendiente) {
    return FINAL_STATUS.PENDIENTE;
  }

  // Si tiene warnings pero está completo
  if (hasWarning && completedCount > 0) {
    return FINAL_STATUS.WARNING;
  }

  // Si está completamente OK
  if (completedCount === stages.length) {
    return FINAL_STATUS.OK;
  }

  // Si completó algunas etapas pero no todas
  if (completedCount > 0 && completedCount < stages.length) {
    return FINAL_STATUS.PARCIAL;
  }

  // Default: pendiente
  return FINAL_STATUS.PENDIENTE;
};

/**
 * parseFlags - Convierte flags booleanos a bitmask
 * @param {Object} fondoBackend - Fondo raw
 * @returns {number} - Bitmask de flags
 */
export const parseFlags = (fondoBackend) => {
  let flags = 0;

  if (fondoBackend.RequiereDerivados) {
    flags |= FLAG_BITS.REQUIERE_DERIVADOS;
  }

  if (fondoBackend.EsMLCCII) {
    flags |= FLAG_BITS.ES_MLCCII;
  }

  if (fondoBackend.ElegibleReproceso) {
    flags |= FLAG_BITS.ELEGIBLE_REPROCESO;
  }

  if (fondoBackend.FlagUBS) {
    flags |= FLAG_BITS.FLAG_UBS;
  }

  if (fondoBackend.IncluirEnCubo) {
    flags |= FLAG_BITS.INCLUIR_EN_CUBO;
  }

  return flags;
};

/**
 * computeSimpleHash - Calcula hash simple para change detection
 * @param {ParsedFondo} fondo - Fondo parseado
 * @returns {string} - Hash simple
 */
export const computeSimpleHash = (fondo) => {
  // Hash basado en campos críticos
  // IMPORTANTE: Incluir ID de stage + estado para detectar cambios en cualquier etapa
  const parts = [
    fondo.id,
    fondo.status,
    fondo.startTime,
    fondo.endTime,
    // Incluir ID:estado para cada stage (más robusto que solo estado)
    fondo.stages.map(s => `${s.id}:${s.estado}`).join('|'),
    fondo.hasError,
    fondo.hasWarning,
    fondo.isProcessing,
  ];

  return parts.join('::');
};

/**
 * parseFondos - Parsea array de fondos
 * @param {Array<Object>} fondosBackend - Array de fondos raw
 * @returns {Array<ParsedFondo>} - Array de fondos parseados
 */
export const parseFondos = (fondosBackend) => {
  if (!Array.isArray(fondosBackend)) return [];

  return fondosBackend
    .map(parseFondo)
    .filter(f => f !== null);
};

/**
 * getFondoRequiresDerivados - Verifica si fondo requiere derivados
 * @param {ParsedFondo} fondo - Fondo parseado
 * @returns {boolean} - True si requiere derivados
 */
export const getFondoRequiresDerivados = (fondo) => {
  return hasFlag(fondo.flags, FLAG_BITS.REQUIERE_DERIVADOS);
};

/**
 * getFondoEsMLCCII - Verifica si fondo es MLCCII
 * @param {ParsedFondo} fondo - Fondo parseado
 * @returns {boolean} - True si es MLCCII
 */
export const getFondoEsMLCCII = (fondo) => {
  return hasFlag(fondo.flags, FLAG_BITS.ES_MLCCII);
};

/**
 * getFondoElegibleReproceso - Verifica si fondo es elegible para reproceso
 * @param {ParsedFondo} fondo - Fondo parseado
 * @returns {boolean} - True si es elegible
 */
export const getFondoElegibleReproceso = (fondo) => {
  return hasFlag(fondo.flags, FLAG_BITS.ELEGIBLE_REPROCESO);
};
