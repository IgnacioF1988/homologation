/**
 * useDuplicateValidation - Hook para validar duplicados en tiempo real
 * Verifica ISIN, Ticker, SEDOL, CUSIP contra instrumentos existentes
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { api } from '../services/api';

// Campos que requieren validacion de duplicados
// nameInstrumento, isin, tickerBBG, sedol, cusip - segun formulario original
const DUPLICATE_FIELDS = ['nameInstrumento', 'isin', 'tickerBBG', 'sedol', 'cusip'];

const useDuplicateValidation = (formData, excludeId = null) => {
  const [duplicateErrors, setDuplicateErrors] = useState({});
  const [validating, setValidating] = useState({});
  const debounceTimers = useRef({});

  // Validar un campo especifico
  const validateField = useCallback(async (fieldName, value) => {
    // Ignorar si no es un campo de duplicados
    if (!DUPLICATE_FIELDS.includes(fieldName)) return;

    // Ignorar valores vacios
    if (!value || value.trim() === '') {
      setDuplicateErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[fieldName];
        return newErrors;
      });
      return;
    }

    // Marcar como validando
    setValidating(prev => ({ ...prev, [fieldName]: true }));

    try {
      const response = await api.instrumentos.checkDuplicate(fieldName, value, excludeId);

      if (response.success && response.data.isDuplicate) {
        setDuplicateErrors(prev => ({
          ...prev,
          [fieldName]: `Ya existe un instrumento con este ${fieldName.toUpperCase()}`,
        }));
      } else {
        setDuplicateErrors(prev => {
          const newErrors = { ...prev };
          delete newErrors[fieldName];
          return newErrors;
        });
      }
    } catch (error) {
      console.error(`Error validando duplicado para ${fieldName}:`, error);
    } finally {
      setValidating(prev => ({ ...prev, [fieldName]: false }));
    }
  }, [excludeId]);

  // Validar con debounce (para usar en onChange)
  const validateFieldDebounced = useCallback((fieldName, value, delayMs = 500) => {
    // Cancelar timer anterior
    if (debounceTimers.current[fieldName]) {
      clearTimeout(debounceTimers.current[fieldName]);
    }

    // Crear nuevo timer
    debounceTimers.current[fieldName] = setTimeout(() => {
      validateField(fieldName, value);
    }, delayMs);
  }, [validateField]);

  // Validar todos los campos de duplicados
  const validateAllDuplicates = useCallback(async () => {
    const promises = DUPLICATE_FIELDS.map(field => {
      if (formData[field]) {
        return validateField(field, formData[field]);
      }
      return Promise.resolve();
    });

    await Promise.all(promises);
  }, [formData, validateField]);

  // Verificar si hay errores de duplicados
  const hasDuplicateErrors = useCallback(() => {
    return Object.keys(duplicateErrors).length > 0;
  }, [duplicateErrors]);

  // Obtener error de duplicado para un campo
  const getDuplicateError = useCallback((fieldName) => {
    return duplicateErrors[fieldName] || null;
  }, [duplicateErrors]);

  // Verificar si un campo esta siendo validado
  const isValidating = useCallback((fieldName) => {
    return validating[fieldName] || false;
  }, [validating]);

  // Limpiar errores de duplicados
  const clearDuplicateErrors = useCallback(() => {
    setDuplicateErrors({});
  }, []);

  // Cleanup de timers al desmontar
  useEffect(() => {
    return () => {
      Object.values(debounceTimers.current).forEach(timer => {
        clearTimeout(timer);
      });
    };
  }, []);

  return {
    // Estado
    duplicateErrors,
    validating,

    // Funciones de validacion
    validateField,
    validateFieldDebounced,
    validateAllDuplicates,

    // Verificaciones
    hasDuplicateErrors,
    getDuplicateError,
    isValidating,

    // Utilidades
    clearDuplicateErrors,

    // Constantes
    DUPLICATE_FIELDS,
  };
};

export default useDuplicateValidation;
