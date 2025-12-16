/**
 * useCompanyAutocomplete - Hook para manejar autocompletado de companias
 *
 * TRES ESTADOS VISUALES (segun especificacion):
 * 1. ESCRIBIENDO: Usuario escribiendo texto libre (borde normal)
 * 2. NUEVO: Compania no encontrada en BD, se creara nueva (borde amarillo/naranja)
 * 3. SELECCIONADO: Compania existente seleccionada de la lista (borde verde)
 *
 * Al seleccionar compania existente:
 * - Auto-poblar issuerTypeCode y sectorGICS
 * - Marcar campos como readOnly
 *
 * Al crear compania nueva:
 * - Habilitar edicion de issuerTypeCode y sectorGICS
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { api } from '../services/api';

// Estados posibles del campo company
export const COMPANY_STATES = {
  WRITING: 'writing',      // Usuario escribiendo
  NEW: 'new',              // Compania nueva (no existe en BD)
  SELECTED: 'selected',    // Compania seleccionada de lista existente
};

// Configuracion de debounce
const DEBOUNCE_DELAY = 300;
const MIN_SEARCH_LENGTH = 2;

const useCompanyAutocomplete = (formData, setFields, mode) => {
  // Estado interno
  const [companyState, setCompanyState] = useState(COMPANY_STATES.WRITING);
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Ref para debounce
  const debounceRef = useRef(null);
  const inputRef = useRef(null);

  // Limpiar timeout al desmontar
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  // Buscar companias por nombre
  const searchCompanies = useCallback(async (searchText) => {
    if (!searchText || searchText.length < MIN_SEARCH_LENGTH) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    setLoading(true);
    try {
      const results = await api.companias.search(searchText);
      setSuggestions(results || []);
      setShowSuggestions(results && results.length > 0);
    } catch (error) {
      console.error('Error buscando companias:', error);
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Manejar cambio en el campo companyName
  const handleCompanyNameChange = useCallback((e) => {
    const { value } = e.target;

    // Actualizar el campo
    setFields({ companyName: value });

    // Si estaba seleccionada una compania y el usuario edita, volver a estado WRITING
    if (selectedCompany && value !== selectedCompany.companyName) {
      setSelectedCompany(null);
      setCompanyState(COMPANY_STATES.WRITING);
      // Limpiar campos auto-poblados
      setFields({
        issuerTypeCode: '',
        sectorGICS: '',
      });
    }

    // Cancelar busqueda anterior
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // Nueva busqueda con debounce
    debounceRef.current = setTimeout(() => {
      searchCompanies(value);
    }, DEBOUNCE_DELAY);
  }, [selectedCompany, setFields, searchCompanies]);

  // Seleccionar compania de la lista
  const handleSelectCompany = useCallback((company) => {
    setSelectedCompany(company);
    setCompanyState(COMPANY_STATES.SELECTED);
    setShowSuggestions(false);
    setSuggestions([]);

    // Auto-poblar campos desde la compania seleccionada
    const updates = {
      companyName: company.companyName,
    };

    if (company.issuerTypeCode) {
      updates.issuerTypeCode = company.issuerTypeCode;
    }
    if (company.sectorGICS) {
      updates.sectorGICS = company.sectorGICS;
    }

    setFields(updates);
  }, [setFields]);

  // Confirmar como compania nueva (cuando no hay coincidencias)
  const confirmAsNewCompany = useCallback(() => {
    if (formData.companyName && formData.companyName.trim()) {
      setCompanyState(COMPANY_STATES.NEW);
      setSelectedCompany(null);
      setShowSuggestions(false);
      // Los campos issuerTypeCode y sectorGICS quedan editables
    }
  }, [formData.companyName]);

  // Manejar blur del campo (salir del input)
  const handleCompanyBlur = useCallback(() => {
    // Delay para permitir click en sugerencia
    setTimeout(() => {
      if (showSuggestions && suggestions.length === 0 && formData.companyName) {
        // No hay sugerencias y hay texto -> marcar como nueva
        confirmAsNewCompany();
      }
      setShowSuggestions(false);
    }, 200);
  }, [showSuggestions, suggestions.length, formData.companyName, confirmAsNewCompany]);

  // Manejar focus en el campo
  const handleCompanyFocus = useCallback(() => {
    if (suggestions.length > 0 && !selectedCompany) {
      setShowSuggestions(true);
    }
  }, [suggestions.length, selectedCompany]);

  // Resetear estado de compania
  const resetCompanyState = useCallback(() => {
    setCompanyState(COMPANY_STATES.WRITING);
    setSelectedCompany(null);
    setSuggestions([]);
    setShowSuggestions(false);
  }, []);

  // Verificar si los campos de compania son editables
  const isCompanyFieldsEditable = useCallback(() => {
    // En modo exacta, todo es readonly
    if (mode === 'exacta') return false;

    // Si hay compania seleccionada, issuerTypeCode y sectorGICS son readonly
    if (companyState === COMPANY_STATES.SELECTED) return false;

    // En otros casos, editable
    return true;
  }, [mode, companyState]);

  // Obtener estilo del borde segun estado
  const getCompanyBorderStyle = useCallback(() => {
    switch (companyState) {
      case COMPANY_STATES.NEW:
        return {
          '& .MuiOutlinedInput-root': {
            backgroundColor: '#fff8e1',
            '& fieldset': {
              borderColor: '#ff9800',
              borderWidth: 2,
            },
            '&:hover fieldset': {
              borderColor: '#f57c00',
            },
            '&.Mui-focused fieldset': {
              borderColor: '#ff9800',
            },
          },
        };
      case COMPANY_STATES.SELECTED:
        return {
          '& .MuiOutlinedInput-root': {
            backgroundColor: '#e8f5e9',
            '& fieldset': {
              borderColor: '#4caf50',
              borderWidth: 2,
            },
            '&:hover fieldset': {
              borderColor: '#388e3c',
            },
            '&.Mui-focused fieldset': {
              borderColor: '#4caf50',
            },
          },
        };
      case COMPANY_STATES.WRITING:
      default:
        return {};
    }
  }, [companyState]);

  // Obtener mensaje de estado para mostrar al usuario
  const getCompanyStateMessage = useCallback(() => {
    switch (companyState) {
      case COMPANY_STATES.NEW:
        return 'Nueva compania - Se creara al guardar';
      case COMPANY_STATES.SELECTED:
        return `Compania seleccionada: ${selectedCompany?.companyName || ''}`;
      case COMPANY_STATES.WRITING:
      default:
        return suggestions.length > 0
          ? `${suggestions.length} sugerencias encontradas`
          : 'Escriba para buscar companias existentes';
    }
  }, [companyState, selectedCompany, suggestions.length]);

  return {
    // Estado
    companyState,
    suggestions,
    loading,
    selectedCompany,
    showSuggestions,

    // Handlers
    handleCompanyNameChange,
    handleSelectCompany,
    handleCompanyBlur,
    handleCompanyFocus,
    confirmAsNewCompany,
    resetCompanyState,

    // Utilidades
    isCompanyFieldsEditable,
    getCompanyBorderStyle,
    getCompanyStateMessage,

    // Refs
    inputRef,
  };
};

export default useCompanyAutocomplete;
