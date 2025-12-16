/**
 * useInstrumentLookup - Hook para gestionar instrumentos
 *
 * FLUJO SIMPLIFICADO:
 * 1. El operador selecciona un item de la cola (nombreFuente, fuente, moneda)
 * 2. El ID_Instrumento se establece de 2 formas:
 *    a) Auto-generado al marcar "Instrumento Nuevo" → MODO NUEVA
 *    b) Desde SearchHelper al seleccionar Exacta/Parcial → MODO EXACTA o PARCIAL
 * 3. NO hay búsqueda automática al escribir en el campo ID
 *
 * REESTRUCTURACION:
 * - Se activa con checkbox esReestructuracion
 * - Busca predecesor por idPredecesor + monedaPredecesor
 * - Hereda campos EXCLUYENDO parametros FI (couponTypeCode, yieldType, etc.)
 * - Los parametros FI deben completarse manualmente
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { FORM_MODES } from './useFormMode';
import { getClearFields, mapRegistroParaReestructuracion } from '../utils/instrumentMapping';

const useInstrumentLookup = (formData, setMode, setFields) => {
  // loading se retorna para uso futuro, setLoading disponible si se necesita
  const [loading] = useState(false);
  const [registroEncontrado, setRegistroEncontrado] = useState(null);
  const [lookupError, setLookupError] = useState(null);

  // Estado para predecesor (reestructuracion)
  const [predecesorEncontrado, setPredecesorEncontrado] = useState(null);
  const [loadingPredecesor, setLoadingPredecesor] = useState(false);
  const [predecesorError, setPredecesorError] = useState(null);

  // Ref para evitar busquedas duplicadas
  const lastPredecesorSearchRef = useRef({ idPredecesor: '', monedaPredecesor: '' });

  // Efecto de inicializacion - limpiar estado al montar
  useEffect(() => {
    // Resetear refs al montar para evitar datos persistentes entre instancias
    lastPredecesorSearchRef.current = { idPredecesor: '', monedaPredecesor: '' };
  }, []);

  // NOTA: Ya NO hay búsqueda automática por idInstrumento
  // El modo se establece desde:
  // - activarInstrumentoNuevo() → MODO NUEVA
  // - SearchHelper → handleSelectExacta/handleSelectParcial en InstrumentForm

  // Efecto para buscar predecesor (solo en modo reestructuracion)
  useEffect(() => {
    // Solo buscar si es reestructuracion
    if (!formData.esReestructuracion) {
      setPredecesorEncontrado(null);
      return;
    }

    // No buscar si faltan datos
    if (!formData.idPredecesor || !formData.monedaPredecesor) {
      setPredecesorEncontrado(null);
      return;
    }

    // Evitar busquedas duplicadas
    const currentSearch = {
      idPredecesor: formData.idPredecesor,
      monedaPredecesor: formData.monedaPredecesor,
    };

    if (
      lastPredecesorSearchRef.current.idPredecesor === currentSearch.idPredecesor &&
      lastPredecesorSearchRef.current.monedaPredecesor === currentSearch.monedaPredecesor
    ) {
      return;
    }

    lastPredecesorSearchRef.current = currentSearch;

    // Buscar predecesor
    const buscarPredecesor = async () => {
      setLoadingPredecesor(true);
      setPredecesorError(null);

      try {
        const idNum = parseInt(formData.idPredecesor);
        const monedaNum = parseInt(formData.monedaPredecesor);

        // Buscar por ID y moneda
        const response = await api.instrumentos.getByIdAndMoneda(idNum, monedaNum);

        if (!response.success || !response.data) {
          setPredecesorEncontrado(null);
          setPredecesorError('No se encontro el instrumento predecesor con esa combinacion ID + Moneda');
        } else {
          const predecesor = response.data;
          setPredecesorEncontrado(predecesor);
          setPredecesorError(null);

          // HEREDAR campos del predecesor EXCLUYENDO parametros FI
          const camposHeredados = mapRegistroParaReestructuracion(predecesor);
          setFields(camposHeredados);
        }
      } catch (error) {
        setPredecesorError(error.message || 'Error al buscar predecesor');
        setPredecesorEncontrado(null);
      } finally {
        setLoadingPredecesor(false);
      }
    };

    const timeoutId = setTimeout(buscarPredecesor, 300);
    return () => clearTimeout(timeoutId);
  }, [
    formData.esReestructuracion,
    formData.idPredecesor,
    formData.monedaPredecesor,
    setFields,
  ]);

  // Obtener el siguiente ID disponible (para reestructuracion e instrumento nuevo)
  const getNextId = useCallback(async () => {
    try {
      const response = await api.instrumentos.getNextId();
      if (response.success && response.data?.nextId) {
        return response.data.nextId;
      }
      return 1;
    } catch {
      return 1;
    }
  }, []);

  // Obtener lista de instrumentos existentes (para dropdown de predecesor)
  const getInstrumentosExistentes = useCallback(async () => {
    try {
      const response = await api.instrumentos.getAll();
      if (response.success) {
        return response.data.map(i => ({
          idInstrumento: i.idInstrumento,
          moneda: i.moneda,
          nombre: i.nameInstrumento || i.nombreFuente,
          label: `${i.idInstrumento} - ${i.nameInstrumento || i.nombreFuente} (Moneda: ${i.moneda})`,
        }));
      }
      return [];
    } catch {
      return [];
    }
  }, []);

  // Activar modo instrumento nuevo (auto-genera idInstrumento)
  const activarInstrumentoNuevo = useCallback(async () => {
    const nextId = await getNextId();
    setMode(FORM_MODES.NUEVA);
    setFields({
      esInstrumentoNuevo: true,
      idInstrumento: nextId.toString(),
    });
    setRegistroEncontrado(null);
  }, [getNextId, setMode, setFields]);

  // Desactivar modo instrumento nuevo (requiere confirmacion previa en UI)
  const desactivarInstrumentoNuevo = useCallback(() => {
    // Limpiar TODOS los campos del formulario excepto datos fuente
    setFields({
      ...getClearFields(),
      esInstrumentoNuevo: false,
      esReestructuracion: false,
      idInstrumento: '',
      idPredecesor: '',
      monedaPredecesor: '',
      main: '',
      diaValidez: '',
    });
    setMode(null);
    setRegistroEncontrado(null);
    setPredecesorEncontrado(null);
    setPredecesorError(null);
    lastPredecesorSearchRef.current = { idPredecesor: '', monedaPredecesor: '' };
  }, [setFields, setMode]);

  // Activar modo reestructuracion (auto-genera idInstrumento)
  const activarReestructuracion = useCallback(async () => {
    const nextId = await getNextId();
    setMode(FORM_MODES.REESTRUCTURACION);
    setFields({
      esReestructuracion: true,
      esInstrumentoNuevo: true,  // Reestructuracion siempre activa instrumento nuevo
      idInstrumento: nextId.toString(),
    });
    setRegistroEncontrado(null);
    setPredecesorEncontrado(null);
  }, [getNextId, setMode, setFields]);

  // Desactivar modo reestructuracion
  const desactivarReestructuracion = useCallback(() => {
    setFields({
      esReestructuracion: false,
      // NO desactivar esInstrumentoNuevo - el usuario debe hacerlo explicitamente
      idPredecesor: '',
      monedaPredecesor: '',
      main: '',
      diaValidez: '',
    });
    // Volver a modo NUEVA si esInstrumentoNuevo sigue activo
    setMode(FORM_MODES.NUEVA);
    setPredecesorEncontrado(null);
    setPredecesorError(null);
    lastPredecesorSearchRef.current = { idPredecesor: '', monedaPredecesor: '' };
  }, [setFields, setMode]);

  // Limpiar busqueda
  const clearLookup = useCallback(() => {
    setRegistroEncontrado(null);
    setLookupError(null);
  }, []);

  // Limpiar busqueda de predecesor
  const clearPredecesorLookup = useCallback(() => {
    setPredecesorEncontrado(null);
    setPredecesorError(null);
    lastPredecesorSearchRef.current = { idPredecesor: '', monedaPredecesor: '' };
  }, []);

  return {
    // Estado principal
    loading,
    registroEncontrado,
    lookupError,

    // Estado predecesor (reestructuracion)
    predecesorEncontrado,
    loadingPredecesor,
    predecesorError,

    // Utilidades
    getNextId,
    getInstrumentosExistentes,
    activarInstrumentoNuevo,
    desactivarInstrumentoNuevo,
    activarReestructuracion,
    desactivarReestructuracion,
    clearLookup,
    clearPredecesorLookup,
  };
};

export default useInstrumentLookup;
