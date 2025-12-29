/**
 * useFormMode - Hook para manejar los 4 modos del formulario
 *
 * La configuracion de campos por modo esta en: src/constants/formFieldConfig.js
 * Ver ese archivo para agregar/modificar campos editables por modo.
 *
 * MODOS:
 * - exacta: ID + Moneda coinciden exactamente -> casi todo readonly
 * - parcial: ID existe pero moneda diferente -> heredar campos, editar monedas
 * - nueva: ID no existe en BD -> flujo en cascada secuencial
 * - reestructuracion: Se crea nuevo ID automaticamente
 */

import { useState, useCallback, useMemo } from 'react';
import { isEquity, isFixedIncome, isDerivative, isBBG as isBBGHelper } from '../config/assetTypes';
import { FORM_MODES } from '../constants/formModes';
import {
  SOURCE_FIELDS,
  MODE_FIELD_CONFIG,
  FORM_STEPS,
  STEP_MESSAGES,
} from '../constants/formFieldConfig';

// Re-exportar para compatibilidad con imports existentes
export { FORM_MODES, FORM_STEPS };

// Determinar identificador obligatorio segun publicDataSource + investmentTypeCode
// Usa funciones helper para soportar diferentes formatos (EQ, Equity, 2, etc.)
const getRequiredIdentifier = (investmentTypeCode, publicDataSource) => {
  // Solo aplica si publicDataSource es BBG
  // Usar helper centralizado que soporta múltiples formatos (BBG, Bloomberg, ID 3, etc.)
  if (!isBBGHelper(publicDataSource)) return null;

  if (isEquity(investmentTypeCode)) return 'tickerBBG';
  if (isFixedIncome(investmentTypeCode)) return 'isin';

  return null;
};

// Determinar paso actual del flujo secuencial
// FLUJO ACTUALIZADO: PublicDataSource + Identificadores van ANTES de Company
const calculateCurrentStep = (formData, mode) => {
  // Solo aplica a modo NUEVA
  if (mode !== FORM_MODES.NUEVA) return null;

  // Paso 1: Investment Type + Name Instrumento
  if (!formData.investmentTypeCode || !formData.nameInstrumento) {
    return FORM_STEPS.INVESTMENT_TYPE;
  }

  // Paso 2: Public Data Source + Identificadores (NO aplica para derivados)
  // Derivados saltan directamente a Company
  if (!isDerivative(formData.investmentTypeCode)) {
    if (!formData.publicDataSource) {
      return FORM_STEPS.PUBLIC_DATA;
    }
    // Verificar identificador obligatorio según tipo
    const requiredId = getRequiredIdentifier(formData.investmentTypeCode, formData.publicDataSource);
    if (requiredId && !formData[requiredId]) {
      return FORM_STEPS.PUBLIC_DATA;
    }
  }

  // Paso 3: Company
  if (!formData.companyName) {
    return FORM_STEPS.COMPANY;
  }

  // Paso 4: Definicion (geografia)
  // Para derivados: solo requiere monedas (se auto-llenan desde moneda fuente)
  // Para otros tipos: requiere países y monedas
  if (isDerivative(formData.investmentTypeCode)) {
    // Derivados solo necesitan monedas (se auto-llenan)
    if (!formData.issueCurrency || !formData.riskCurrency) {
      return FORM_STEPS.DEFINITION;
    }
  } else {
    // Otros tipos requieren países y monedas
    if (!formData.issueCountry || !formData.riskCountry ||
        !formData.issueCurrency || !formData.riskCurrency) {
      return FORM_STEPS.DEFINITION;
    }
    // Si riskCountry es CL, también requiere sectorChileTypeCode
    if (formData.riskCountry === 'CL' && !formData.sectorChileTypeCode) {
      return FORM_STEPS.DEFINITION;
    }
  }

  // Paso 5: Parametros FI (solo FI)
  // Usar isFixedIncome() para soportar diferentes formatos (FI, Fixed Income, 1, etc.)
  if (isFixedIncome(formData.investmentTypeCode)) {
    if (!formData.couponTypeCode || !formData.yieldType || !formData.yieldSource ||
        !formData.perpetuidad || !formData.rendimiento || !formData.couponFrequency) {
      return FORM_STEPS.PARAMETERS;
    }
    // Si yieldSource es BBG, también requiere campos BBG
    if (formData.yieldSource === 'BBG') {
      if (!formData.coco || !formData.callable || !formData.sinkable) {
        return FORM_STEPS.PARAMETERS;
      }
    }
  }

  return FORM_STEPS.COMPLETE;
};

const useFormMode = (initialMode = null, formData = {}, fieldConfig = null) => {
  const [mode, setMode] = useState(initialMode);

  // Obtener configuracion del modo actual
  const modeConfig = useMemo(() => {
    if (!mode) return null;
    return MODE_FIELD_CONFIG[mode] || null;
  }, [mode]);

  // Verificar si un campo es editable en el modo actual
  const isFieldEditable = useCallback((fieldName) => {
    if (SOURCE_FIELDS.includes(fieldName)) {
      return false;
    }

    // idInstrumento bloqueado cuando esInstrumentoNuevo === true
    if (fieldName === 'idInstrumento' && formData.esInstrumentoNuevo) {
      return false;
    }

    // Para derivados: issueCurrency y riskCurrency son readonly (se auto-llenan desde moneda fuente)
    if (isDerivative(formData.investmentTypeCode) &&
        (fieldName === 'issueCurrency' || fieldName === 'riskCurrency')) {
      return false;
    }

    if (!mode || !modeConfig) {
      return ['idInstrumento', 'esReestructuracion', 'esInstrumentoNuevo'].includes(fieldName);
    }

    return modeConfig.editable.includes(fieldName);
  }, [mode, modeConfig, formData.esInstrumentoNuevo, formData.investmentTypeCode]);

  // Verificar si un campo es de solo lectura
  const isFieldReadOnly = useCallback((fieldName) => {
    // First check if field has readOnly in its config
    if (fieldConfig) {
      for (const section of Object.values(fieldConfig.sections || {})) {
        const field = section.fields?.[fieldName];
        if (field?.readOnly === true) {
          return true;
        }
      }
    }
    return !isFieldEditable(fieldName);
  }, [isFieldEditable, fieldConfig]);

  // Determinar paso actual (solo para modo NUEVA)
  const getCurrentStep = useCallback((formData) => {
    return calculateCurrentStep(formData, mode);
  }, [mode]);

  // Verificar si un paso esta habilitado
  const isStepEnabled = useCallback((step, formData) => {
    if (mode !== FORM_MODES.NUEVA) return true;

    const currentStep = calculateCurrentStep(formData, mode);
    if (currentStep === FORM_STEPS.COMPLETE) return true;

    return step <= currentStep;
  }, [mode]);

  // Verificar si una seccion esta visible segun el flujo
  // FLUJO ACTUALIZADO: PublicData + Identificadores (paso 2) van ANTES de Company (paso 3)
  const isSectionVisible = useCallback((sectionName, formData) => {
    // En modos no-nueva, todas las secciones son visibles
    if (mode !== FORM_MODES.NUEVA) return true;

    const currentStep = calculateCurrentStep(formData, mode);

    switch (sectionName) {
      case 'publicData':
      case 'identifiers':
        // Seccion identifiers siempre visible (contiene Investment Type + Name)
        // publicDataSource e identificadores se ocultan INTERNAMENTE en IdentifiersSection para derivados
        return currentStep >= FORM_STEPS.PUBLIC_DATA || isDerivative(formData.investmentTypeCode);
      case 'company':
        // Paso 3: visible después de completar paso 2
        return currentStep >= FORM_STEPS.COMPANY;
      case 'definition':
        // Paso 4: visible para TODOS los tipos después de paso 3
        return currentStep >= FORM_STEPS.DEFINITION;
      case 'parameters':
        // Paso 5: solo visible para FI y si esta en el paso correcto
        // Usar isFixedIncome() para soportar diferentes formatos
        return isFixedIncome(formData.investmentTypeCode) && currentStep >= FORM_STEPS.PARAMETERS;
      default:
        return true;
    }
  }, [mode]);

  // Obtener mensaje de progreso segun el paso actual
  const getStepMessage = useCallback((formData) => {
    if (mode !== FORM_MODES.NUEVA) return null;

    const currentStep = calculateCurrentStep(formData, mode);
    return STEP_MESSAGES[currentStep] || null;
  }, [mode]);

  // Obtener identificador requerido segun tipo
  const getRequiredId = useCallback((formData) => {
    return getRequiredIdentifier(formData.investmentTypeCode, formData.publicDataSource);
  }, []);

  // Descripcion del modo
  const modeDescription = useMemo(() => {
    return modeConfig?.description || 'Ingrese el ID_Instrumento para buscar coincidencias.';
  }, [modeConfig]);

  // Verificar si es un modo de edicion (vs creacion)
  const isEditMode = useMemo(() => {
    return mode === FORM_MODES.EXACTA || mode === FORM_MODES.PARCIAL || mode === FORM_MODES.MODIFICAR;
  }, [mode]);

  // Verificar si es modo de solo confirmacion
  const isConfirmOnly = useMemo(() => {
    return mode === FORM_MODES.EXACTA;
  }, [mode]);

  // Color del indicador segun modo
  const modeColor = useMemo(() => {
    const colors = {
      [FORM_MODES.EXACTA]: 'success',
      [FORM_MODES.PARCIAL]: 'warning',
      [FORM_MODES.NUEVA]: 'info',
      [FORM_MODES.REESTRUCTURACION]: 'secondary',
      [FORM_MODES.MODIFICAR]: 'primary',
    };
    return colors[mode] || 'default';
  }, [mode]);

  // Labels para mostrar en UI
  const modeLabel = useMemo(() => {
    const labels = {
      [FORM_MODES.EXACTA]: 'Coincidencia Exacta',
      [FORM_MODES.PARCIAL]: 'Coincidencia Parcial',
      [FORM_MODES.NUEVA]: 'Nuevo Instrumento',
      [FORM_MODES.REESTRUCTURACION]: 'Reestructuracion',
      [FORM_MODES.MODIFICAR]: 'Modificar Instrumento',
    };
    return labels[mode] || 'Sin modo';
  }, [mode]);

  return {
    // Estado
    mode,
    modeConfig,
    modeDescription,
    modeColor,
    modeLabel,

    // Setters
    setMode,

    // Verificaciones de campos
    isFieldEditable,
    isFieldReadOnly,
    isEditMode,
    isConfirmOnly,

    // Flujo secuencial (modo NUEVA)
    getCurrentStep,
    isStepEnabled,
    isSectionVisible,
    getStepMessage,
    getRequiredId,

    // Constantes
    MODES: FORM_MODES,
    STEPS: FORM_STEPS,
  };
};

export default useFormMode;
