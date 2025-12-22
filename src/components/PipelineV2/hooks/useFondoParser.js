/**
 * useFondoParser.js - Hook de Parsing con Cache
 * Parsea fondos del backend con caching hash-based para evitar re-parsing innecesario
 */

import { useCallback, useRef } from 'react';
import {
  parseFondo,
  parseFondos,
  parseSubStages,
  parseAllSubStages,
} from '../utils/pipelineParser';
import { computeHash, detectChanges } from '../utils/pipelineChangeDetector';

/**
 * useFondoParser - Hook de parsing con cache
 * Cachea fondos parseados por hash para evitar re-parsing innecesario
 *
 * @returns {FondoParser} - Funciones de parsing
 */
export const useFondoParser = () => {
  // Cache de fondos parseados (por hash)
  const cacheRef = useRef(new Map());

  /**
   * parseSingleFondo - Parsea un solo fondo con cache
   * @param {Object} fondoBackend - Fondo raw del backend
   * @returns {ParsedFondo|null} - Fondo parseado o null
   */
  const parseSingleFondo = useCallback((fondoBackend) => {
    if (!fondoBackend) return null;

    // Generar ID para cache lookup
    const fondoId = String(fondoBackend.ID_Fund);

    // Buscar en cache
    const cached = cacheRef.current.get(fondoId);

    // Parsear nuevo fondo
    const parsed = parseFondo(fondoBackend);

    if (!parsed) return null;

    // Si hay cache y el hash coincide, retornar del cache
    if (cached && cached._hash === parsed._hash) {
      return cached;
    }

    // Guardar en cache
    cacheRef.current.set(fondoId, parsed);

    return parsed;
  }, []);

  /**
   * parseMultipleFondos - Parsea array de fondos con cache
   * @param {Array<Object>} fondosBackend - Array de fondos raw
   * @returns {Array<ParsedFondo>} - Array de fondos parseados
   */
  const parseMultipleFondos = useCallback((fondosBackend) => {
    if (!Array.isArray(fondosBackend)) return [];

    return fondosBackend
      .map(parseSingleFondo)
      .filter(f => f !== null);
  }, [parseSingleFondo]);

  /**
   * parseWithChanges - Parsea fondos y detecta cambios respecto a cache
   * @param {Array<Object>} fondosBackend - Array de fondos raw
   * @returns {Object} - { fondos, changes }
   */
  const parseWithChanges = useCallback((fondosBackend) => {
    if (!Array.isArray(fondosBackend)) {
      return { fondos: [], changes: [] };
    }

    const changes = [];
    const fondos = [];

    fondosBackend.forEach(fondoBackend => {
      const fondoId = String(fondoBackend.ID_Fund);
      const cached = cacheRef.current.get(fondoId);

      // Parsear nuevo
      const parsed = parseFondo(fondoBackend);

      if (!parsed) return;

      // Detectar cambios
      if (cached) {
        const changeInfo = detectChanges(cached, parsed);
        if (changeInfo.hasChanges) {
          changes.push({
            fondoId,
            changeInfo,
            oldFondo: cached,
            newFondo: parsed,
          });
        }
      } else {
        // Fondo nuevo (no estaba en cache)
        changes.push({
          fondoId,
          changeInfo: {
            hasChanges: true,
            isNew: true,
          },
          newFondo: parsed,
        });
      }

      // Actualizar cache
      cacheRef.current.set(fondoId, parsed);
      fondos.push(parsed);
    });

    return { fondos, changes };
  }, []);

  /**
   * parseSubStagesLazy - Parsea sub-etapas de un fondo (lazy loading)
   * @param {Object} fondoBackend - Fondo raw
   * @param {ParsedFondo} parsedFondo - Fondo parseado
   * @param {string} stageId - ID de la etapa (PROCESS_IPA, etc.)
   * @returns {Array<SubStageStatus>|null} - Sub-etapas parseadas
   */
  const parseSubStagesLazy = useCallback((fondoBackend, parsedFondo, stageId) => {
    if (!fondoBackend || !parsedFondo) return null;

    // Verificar si ya están parseadas (en el fondo parseado)
    if (parsedFondo.subStages && parsedFondo.subStages[stageId.toLowerCase()]) {
      return parsedFondo.subStages[stageId.toLowerCase()];
    }

    // Parsear sub-etapas
    return parseSubStages(fondoBackend, stageId);
  }, []);

  /**
   * parseAllSubStagesForFondo - Parsea todas las sub-etapas de un fondo
   * @param {Object} fondoBackend - Fondo raw
   * @returns {Object} - Objeto con todas las sub-etapas
   */
  const parseAllSubStagesForFondo = useCallback((fondoBackend) => {
    if (!fondoBackend) return null;

    return parseAllSubStages(fondoBackend);
  }, []);

  /**
   * invalidateCache - Invalida cache completo o de un fondo específico
   * @param {string} [fondoId] - ID del fondo (opcional, si no se pasa invalida todo)
   */
  const invalidateCache = useCallback((fondoId) => {
    if (fondoId) {
      cacheRef.current.delete(fondoId);
    } else {
      cacheRef.current.clear();
    }
  }, []);

  /**
   * getCacheSize - Obtiene tamaño del cache
   * @returns {number} - Número de fondos en cache
   */
  const getCacheSize = useCallback(() => {
    return cacheRef.current.size;
  }, []);

  /**
   * getCached - Obtiene un fondo del cache
   * @param {string} fondoId - ID del fondo
   * @returns {ParsedFondo|undefined} - Fondo parseado o undefined
   */
  const getCached = useCallback((fondoId) => {
    return cacheRef.current.get(fondoId);
  }, []);

  /**
   * isCached - Verifica si un fondo está en cache
   * @param {string} fondoId - ID del fondo
   * @returns {boolean} - True si está en cache
   */
  const isCached = useCallback((fondoId) => {
    return cacheRef.current.has(fondoId);
  }, []);

  return {
    // Parsing básico
    parseSingleFondo,
    parseMultipleFondos,

    // Parsing con detección de cambios
    parseWithChanges,

    // Lazy loading de sub-etapas
    parseSubStagesLazy,
    parseAllSubStagesForFondo,

    // Gestión de cache
    invalidateCache,
    getCacheSize,
    getCached,
    isCached,

    // Exponer parser directo (sin cache) para casos especiales
    parseFondoDirect: parseFondo,
    parseFondosDirect: parseFondos,
  };
};

export default useFondoParser;
