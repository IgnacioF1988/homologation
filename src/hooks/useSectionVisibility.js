/**
 * useSectionVisibility - Hook para determinar visibilidad de secciones
 *
 * CENTRALIZA la lógica de visibilidad que antes estaba en InstrumentForm.jsx
 * Usa las configuraciones por Asset Type para determinar qué secciones mostrar.
 *
 * REFACTORIZADO: Ahora lee flowConfig de cada Asset Type en vez de usar ifs hardcodeados.
 *
 * REGLAS DE VISIBILIDAD:
 * - SourceData y Restructuring: SIEMPRE visibles (transversales)
 * - El resto se determina por flowConfig del Asset Type
 */

import { useMemo } from 'react';
import {
  isEquity,
  isFixedIncome,
  isDerivative,
  isFund,
  isBBG,
  getAssetTypeConfig,
} from '../config/assetTypes';
import {
  DEFAULT_FLOW_CONFIG,
  calculateStepFromConfig,
  calculateVisibilityFromConfig,
} from '../config/assetTypes/_base';

/**
 * Calcula el paso actual en modo NUEVA (flujo en cascada)
 * REFACTORIZADO: Usa flowConfig del Asset Type
 */
const calculateCurrentStep = (mode, formData) => {
  if (mode !== 'nueva') return null;

  // Obtener config del tipo
  const typeConfig = getAssetTypeConfig(formData.investmentTypeCode);
  const flowConfig = typeConfig?.flowConfig || DEFAULT_FLOW_CONFIG;

  // Usar la funcion de _base.js para calcular
  return calculateStepFromConfig(flowConfig, formData, isBBG);
};

/**
 * Calcula la visibilidad de secciones según modo y tipo
 * REFACTORIZADO: Usa flowConfig del Asset Type
 * CORREGIDO: Ahora pasa isBBG para validar campos condicionales (ISIN/TickerBBG si BBG)
 */
const calculateSectionVisibility = (mode, formData, predecesorEncontrado) => {
  // Obtener config del tipo
  const typeConfig = getAssetTypeConfig(formData.investmentTypeCode);
  const flowConfig = typeConfig?.flowConfig || DEFAULT_FLOW_CONFIG;

  // Usar la funcion de _base.js para calcular
  // CORRECCION: Pasar isBBG para que se validen campos condicionales
  return calculateVisibilityFromConfig(flowConfig, formData, mode, !!predecesorEncontrado, isBBG);
};

/**
 * Hook principal para visibilidad de secciones
 */
const useSectionVisibility = (mode, formData, predecesorEncontrado = null) => {
  // Calcular paso actual (solo relevante para modo NUEVA)
  const currentStep = useMemo(() => {
    return calculateCurrentStep(mode, formData);
  }, [mode, formData]);

  // Calcular visibilidad de secciones
  const sectionVisibility = useMemo(() => {
    return calculateSectionVisibility(mode, formData, predecesorEncontrado);
  }, [mode, formData, predecesorEncontrado]);

  return {
    currentStep,
    sectionVisibility,
    // Helpers de tipo para conveniencia
    isDerivativeType: isDerivative(formData.investmentTypeCode),
    isFixedIncomeType: isFixedIncome(formData.investmentTypeCode),
    isEquityType: isEquity(formData.investmentTypeCode),
    isFundType: isFund(formData.investmentTypeCode),
  };
};

export default useSectionVisibility;

// Exportar funciones auxiliares para testing
export {
  calculateCurrentStep,
  calculateSectionVisibility,
};
