/**
 * useFormValidation - Hook para validacion del formulario
 *
 * Las reglas de validacion estan en: src/constants/validationRules.js
 * Ver ese archivo para agregar/modificar reglas.
 */

import { useState, useCallback, useMemo } from 'react';
import { FORM_MODES } from './useFormMode';
import { isEquity, isFixedIncome, isDerivative, normalizeAssetType as normalizeInvestmentType, isBBG } from '../config/assetTypes';
import {
  FIELD_VALIDATION_RULES as validationRules,
  REQUIRED_FIELDS_BY_MODE as requiredByMode,
  REQUIRED_FIELDS_BY_INVESTMENT_TYPE as requiredByInvestmentType,
  IDENTIFIER_ERROR_MESSAGES,
} from '../constants/validationRules';

const useFormValidation = (formData, mode) => {
  const [errors, setErrors] = useState({});

  // Obtener campos requeridos para el modo actual (incluyendo por tipo de inversion)
  const requiredFields = useMemo(() => {
    const baseFields = requiredByMode[mode] || [];
    // Normalizar el tipo de inversión para buscar en requiredByInvestmentType
    const normalizedType = normalizeInvestmentType(formData.investmentTypeCode);
    const typeFields = (normalizedType && requiredByInvestmentType[normalizedType]) || [];
    return [...baseFields, ...typeFields];
  }, [mode, formData.investmentTypeCode]);

  // Validar un campo individual
  const validateField = useCallback((fieldName, value) => {
    const rule = validationRules[fieldName];
    const isRequired = requiredFields.includes(fieldName);

    // Verificar requerido
    if (isRequired && (!value || value.toString().trim() === '')) {
      return rule?.message || `${fieldName} es requerido`;
    }

    // Si no hay valor y no es requerido, no validar mas
    if (!value || value.toString().trim() === '') {
      return null;
    }

    if (!rule) return null;

    // Validar patron
    if (rule.pattern && !rule.pattern.test(value)) {
      return rule.message;
    }

    // Validar longitud
    if (rule.minLength && value.length < rule.minLength) {
      return rule.message || `Minimo ${rule.minLength} caracteres`;
    }
    if (rule.maxLength && value.length > rule.maxLength) {
      return rule.message || `Maximo ${rule.maxLength} caracteres`;
    }

    // Validar rango numerico
    if (rule.min !== undefined && parseFloat(value) < rule.min) {
      return rule.message || `Valor minimo: ${rule.min}`;
    }
    if (rule.max !== undefined && parseFloat(value) > rule.max) {
      return rule.message || `Valor maximo: ${rule.max}`;
    }

    // Validar fechas
    if (rule.futureDate) {
      const date = new Date(value);
      if (date <= new Date()) {
        return rule.message;
      }
    }
    if (rule.pastDate) {
      const date = new Date(value);
      if (date > new Date()) {
        return rule.message;
      }
    }

    return null;
  }, [requiredFields]);

  // Validar todo el formulario
  const validateForm = useCallback(() => {
    const newErrors = {};

    // Validar campos requeridos
    requiredFields.forEach(field => {
      const error = validateField(field, formData[field]);
      if (error) {
        newErrors[field] = error;
      }
    });

    // Validar campos con reglas (aunque no sean requeridos)
    Object.keys(validationRules).forEach(field => {
      if (formData[field] && !newErrors[field]) {
        const error = validateField(field, formData[field]);
        if (error) {
          newErrors[field] = error;
        }
      }
    });

    // Validar identificadores segun publicDataSource + investmentType
    // BBG + EQ = TickerBBG obligatorio
    // BBG + FI = ISIN obligatorio
    // Usar helper centralizado que soporta múltiples formatos (BBG, Bloomberg, ID 3, etc.)
    const isBBGSource = isBBG(formData.publicDataSource);

    // Usar helpers centralizados que soportan EQ, Equity, 2, etc.
    const isEquityType = isEquity(formData.investmentTypeCode);
    const isFixedIncomeType = isFixedIncome(formData.investmentTypeCode);

    // Validar identificadores (NO aplica para derivados)
    const isDerivativeType = isDerivative(formData.investmentTypeCode);
    if (!isDerivativeType) {
      if ((mode === FORM_MODES.NUEVA || mode === FORM_MODES.REESTRUCTURACION) && isBBGSource) {
        if (isEquityType && !formData.tickerBBG) {
          newErrors.tickerBBG = IDENTIFIER_ERROR_MESSAGES.BBG_EQUITY_TICKER;
        }
        if (isFixedIncomeType && !formData.isin) {
          newErrors.isin = IDENTIFIER_ERROR_MESSAGES.BBG_FI_ISIN;
        }
      } else if (mode === FORM_MODES.NUEVA) {
        // Si no es BBG, se recomienda al menos un identificador
        const hasIdentifier = formData.isin || formData.tickerBBG || formData.sedol || formData.cusip;
        if (!hasIdentifier) {
          newErrors._identifiers = IDENTIFIER_ERROR_MESSAGES.NO_IDENTIFIER;
        }
      }
    }

    // Validar SubID para derivados
    if ((mode === FORM_MODES.NUEVA || mode === FORM_MODES.REESTRUCTURACION) && isDerivativeType) {
      const subIdValue = parseInt(formData.subId);
      if (!formData.subId || ![10000, 20000].includes(subIdValue)) {
        newErrors.subId = IDENTIFIER_ERROR_MESSAGES.DERIVATIVE_SUBID;
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData, mode, requiredFields, validateField]);

  // Obtener error de un campo
  const getError = useCallback((fieldName) => {
    return errors[fieldName] || null;
  }, [errors]);

  // Verificar si hay errores
  const hasErrors = useMemo(() => {
    return Object.keys(errors).length > 0;
  }, [errors]);

  // Verificar si el formulario esta completo (todos los campos requeridos tienen valor)
  const isFormComplete = useMemo(() => {
    // Verificar campos requeridos
    for (const field of requiredFields) {
      const value = formData[field];
      if (!value || value.toString().trim() === '') {
        return false;
      }
    }

    // Verificar tipo de instrumento
    const isDerivativeComplete = isDerivative(formData.investmentTypeCode);

    // En modo nueva/reestructuracion con publicDataSource = BBG, verificar identificador segun tipo
    // NO aplica para derivados
    if (!isDerivativeComplete) {
      const isBBGComplete = isBBG(formData.publicDataSource);
      const isEquityComplete = isEquity(formData.investmentTypeCode);
      const isFixedIncomeComplete = isFixedIncome(formData.investmentTypeCode);

      if ((mode === FORM_MODES.NUEVA || mode === FORM_MODES.REESTRUCTURACION) && isBBGComplete) {
        // Para BBG + Equity: requiere tickerBBG
        if (isEquityComplete && !formData.tickerBBG) {
          return false;
        }
        // Para BBG + Fixed Income: requiere ISIN
        if (isFixedIncomeComplete && !formData.isin) {
          return false;
        }
      }
    }

    // Verificar SubID para derivados
    if ((mode === FORM_MODES.NUEVA || mode === FORM_MODES.REESTRUCTURACION) && isDerivativeComplete) {
      const subIdValue = parseInt(formData.subId);
      if (!formData.subId || ![10000, 20000].includes(subIdValue)) {
        return false;
      }
    }

    return true;
  }, [formData, requiredFields, mode]);

  // Limpiar errores
  const clearErrors = useCallback(() => {
    setErrors({});
  }, []);

  // Limpiar error de un campo
  const clearError = useCallback((fieldName) => {
    setErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors[fieldName];
      return newErrors;
    });
  }, []);

  return {
    // Estado
    errors,
    hasErrors,
    isFormComplete,
    requiredFields,

    // Funciones
    validateField,
    validateForm,
    getError,
    clearErrors,
    clearError,
  };
};

export default useFormValidation;
