/**
 * useAssetTypeConfig - Hook principal para consumir configuracion por Asset Type
 *
 * Este hook es el PUNTO CENTRAL de acceso a la configuracion de cada tipo.
 * Las secciones del formulario lo usan para:
 * - Saber que campos mostrar
 * - Saber si un campo es requerido
 * - Saber si un campo es visible
 * - Obtener cascadas
 *
 * USO:
 * const { config, isFieldVisible, isFieldRequired, getFieldConfig } = useAssetTypeConfig(formData.investmentTypeCode);
 */

import { useMemo, useCallback } from 'react';
import {
  getAssetTypeConfig,
  isEquity,
  isFixedIncome,
  isDerivative,
  isBBG,
  evaluateCondition,
} from '../config/assetTypes';

const useAssetTypeConfig = (investmentTypeCode, formData = {}) => {
  // ===========================================
  // OBTENER CONFIGURACION DEL TIPO
  // ===========================================
  const config = useMemo(() => {
    return getAssetTypeConfig(investmentTypeCode);
  }, [investmentTypeCode]);

  // ===========================================
  // HELPERS DE TIPO
  // ===========================================
  const typeHelpers = useMemo(() => ({
    isEquity: isEquity(investmentTypeCode),
    isFixedIncome: isFixedIncome(investmentTypeCode),
    isDerivative: isDerivative(investmentTypeCode),
    typeId: config?.id || null,
    typeLabel: config?.label || null,
    typeColor: config?.color || null,
  }), [investmentTypeCode, config]);

  // ===========================================
  // OBTENER CONFIGURACION DE UN CAMPO
  // Simplificado: busca directamente en las secciones del config
  // Ya no hay merge con SHARED_FIELDS - cada config tiene todos sus campos
  // ===========================================
  const getFieldConfig = useCallback((fieldName) => {
    if (!config) return null;

    // Buscar en secciones del tipo
    for (const section of Object.values(config.sections || {})) {
      if (section.fields?.[fieldName]) {
        return section.fields[fieldName];
      }
    }

    return null;
  }, [config]);

  // ===========================================
  // VERIFICAR SI UN CAMPO ES VISIBLE
  // Soporta múltiples formas de ocultar campos:
  // 1. excludedFields: array a nivel de config
  // 2. hiddenFields: array a nivel de seccion
  // 3. hidden: true en el campo individual
  // 4. visibleWhen: condicion dinamica
  // ===========================================
  const isFieldVisible = useCallback((fieldName, currentFormData = formData) => {
    if (!config) return true;

    // 1. Verificar si esta en excludedFields del tipo
    if (config.excludedFields?.includes(fieldName)) {
      return false;
    }

    // 2. Obtener config del campo primero (necesario para verificar hidden)
    const fieldConfig = getFieldConfig(fieldName);

    // 3. Verificar hidden: true en el campo individual
    if (fieldConfig?.hidden === true) {
      return false;
    }

    // 4. Verificar en secciones si tiene hiddenFields
    for (const section of Object.values(config.sections || {})) {
      if (section.hiddenFields?.includes(fieldName)) {
        return false;
      }
    }

    // 5. Evaluar visibleWhen si existe (condicion dinamica)
    if (fieldConfig?.visibleWhen) {
      return evaluateCondition(fieldConfig.visibleWhen, currentFormData);
    }

    return true;
  }, [config, formData, getFieldConfig]);

  // ===========================================
  // VERIFICAR SI UN CAMPO ES REQUERIDO
  // ===========================================
  const isFieldRequired = useCallback((fieldName, currentFormData = formData) => {
    const fieldConfig = getFieldConfig(fieldName);
    if (!fieldConfig) return false;

    // Si tiene required: true, es siempre requerido
    if (fieldConfig.required === true) return true;

    // Si tiene requiredWhen, evaluar condicion
    if (fieldConfig.requiredWhen) {
      return evaluateCondition(fieldConfig.requiredWhen, currentFormData);
    }

    return false;
  }, [formData, getFieldConfig]);

  // ===========================================
  // OBTENER CAMPOS A LIMPIAR EN CASCADA
  // ===========================================
  const getCascadeFields = useCallback((fieldName, newValue, currentFormData = formData) => {
    const fieldConfig = getFieldConfig(fieldName);
    if (!fieldConfig?.cascade) return [];

    // Si tiene cascadeCondition, evaluar
    if (fieldConfig.cascadeCondition) {
      const conditionMet = evaluateCondition(
        { field: fieldName, ...fieldConfig.cascadeCondition },
        { ...currentFormData, [fieldName]: newValue }
      );
      if (!conditionMet) return [];
    }

    return fieldConfig.cascade;
  }, [formData, getFieldConfig]);

  // ===========================================
  // OBTENER SECCIONES EN ORDEN
  // ===========================================
  const orderedSections = useMemo(() => {
    if (!config?.flow || !config?.sections) return [];

    return config.flow
      .map(sectionId => config.sections[sectionId])
      .filter(Boolean);
  }, [config]);

  // ===========================================
  // VERIFICAR SI UNA SECCION ES VISIBLE
  // ===========================================
  const isSectionVisible = useCallback((sectionId, currentFormData = formData) => {
    if (!config) return false;

    const section = config.sections?.[sectionId];
    if (!section) return false;

    // Verificar si el tipo tiene esta seccion en su flow
    if (!config.flow?.includes(sectionId)) return false;

    return true;
  }, [config, formData]);

  // ===========================================
  // OBTENER MENSAJE DEL PASO ACTUAL
  // ===========================================
  const getStepMessage = useCallback((step) => {
    if (!config?.stepMessages) return null;
    return config.stepMessages[step] || config.stepMessages.complete || null;
  }, [config]);

  // ===========================================
  // VERIFICAR VISIBILIDAD DE GRUPO
  // ===========================================
  const isGroupVisible = useCallback((sectionId, groupId, currentFormData = formData) => {
    if (!config) return true;

    const section = config.sections?.[sectionId];
    if (!section?.groups) return true;

    const group = section.groups.find(g => g.id === groupId);
    if (!group) return true;

    if (group.visibleWhen) {
      return evaluateCondition(group.visibleWhen, currentFormData);
    }

    return true;
  }, [config, formData]);

  // ===========================================
  // OBTENER CAMPOS DE UN GRUPO
  // ===========================================
  const getGroupFields = useCallback((sectionId, groupId) => {
    if (!config) return [];

    const section = config.sections?.[sectionId];
    if (!section?.groups) return [];

    const group = section.groups.find(g => g.id === groupId);
    return group?.fields || [];
  }, [config]);

  // ===========================================
  // OBTENER ALERTAS DE UNA SECCION
  // ===========================================
  const getSectionAlerts = useCallback((sectionId, currentFormData = formData) => {
    if (!config) return [];

    const section = config.sections?.[sectionId];
    if (!section?.alerts) return [];

    return section.alerts
      .filter(alert => {
        if (!alert.condition) return true;
        return evaluateCondition(alert.condition, currentFormData);
      })
      .map(alert => ({
        ...alert,
        id: crypto.randomUUID(), // Add unique ID to each alert
      }));
  }, [config, formData]);

  // ===========================================
  // VALIDAR FORMULARIO SEGUN TIPO
  // ===========================================
  const validateByType = useCallback((currentFormData = formData) => {
    if (!config?.validations) return {};

    const errors = {};

    Object.entries(config.validations).forEach(([key, validation]) => {
      if (validation.condition(currentFormData)) {
        errors[validation.field] = {
          message: validation.message,
          severity: validation.severity || 'error',
        };
      }
    });

    return errors;
  }, [config, formData]);

  // ===========================================
  // AUTO-POPULATE SEGUN TIPO
  // ===========================================
  const getAutoPopulateValues = useCallback((currentFormData = formData) => {
    if (!config?.autoPopulate) return {};

    const values = {};

    Object.entries(config.autoPopulate).forEach(([targetField, rule]) => {
      if (rule.fromField && currentFormData[rule.fromField]) {
        values[targetField] = currentFormData[rule.fromField];
      }
    });

    return values;
  }, [config, formData]);

  // ===========================================
  // VERIFICAR SI CAMPO ES FORZADO A READONLY
  // ===========================================
  const isForceReadOnly = useCallback((fieldName) => {
    return config?.forceReadOnly?.includes(fieldName) || false;
  }, [config]);

  // ===========================================
  // OBTENER VALORES POR DEFECTO DEL TIPO
  // Simplificado: recorre campos de cada seccion buscando defaultValue
  // ===========================================
  const getDefaultValues = useCallback(() => {
    if (!config) return {};

    const defaults = {};

    // Recorrer todas las secciones
    Object.values(config.sections || {}).forEach((section) => {
      // Recorrer todos los campos de la seccion
      Object.entries(section.fields || {}).forEach(([fieldName, fieldConfig]) => {
        if (fieldConfig.defaultValue !== undefined) {
          defaults[fieldName] = fieldConfig.defaultValue;
        }
      });
    });

    return defaults;
  }, [config]);

  // ===========================================
  // OBTENER IDENTIFICADOR PRIORITARIO
  // ===========================================
  const getPriorityIdentifier = useCallback(() => {
    if (!config) return null;

    const identifiersSection = config.sections?.identifiers;
    if (!identifiersSection?.fields) return null;

    for (const [fieldName, fieldConfig] of Object.entries(identifiersSection.fields)) {
      if (fieldConfig.priorityIdentifier) {
        return fieldName;
      }
    }

    return null;
  }, [config]);

  // ===========================================
  // OBTENER TODOS LOS CAMPOS DE UNA SECCION
  // Retorna todos los campos definidos en la seccion
  // Simplificado: ya no hay useSharedFields
  // ===========================================
  const getSectionExtraFields = useCallback((sectionId) => {
    if (!config) return [];

    const section = config.sections?.[sectionId];
    if (!section?.fields) return [];

    // Retornar todos los campos de la seccion
    return Object.entries(section.fields)
      .map(([fieldName, fieldConfig]) => ({
        name: fieldName,
        ...fieldConfig,
      }));
  }, [config]);

  // ===========================================
  // RETURN
  // ===========================================
  return {
    // Configuracion
    config,
    orderedSections,

    // Helpers de tipo
    ...typeHelpers,

    // Funciones de campo
    getFieldConfig,
    isFieldVisible,
    isFieldRequired,
    getCascadeFields,
    isForceReadOnly,
    getPriorityIdentifier,

    // Funciones de seccion
    isSectionVisible,
    isGroupVisible,
    getGroupFields,
    getSectionAlerts,
    getSectionExtraFields,
    getStepMessage,

    // Validacion y auto-populate
    validateByType,
    getAutoPopulateValues,
    getDefaultValues,

    // Re-exportar helpers para conveniencia
    isBBG: (value) => isBBG(value),
  };
};

export default useAssetTypeConfig;

// Re-exportar helpers para uso directo
export {
  isEquity,
  isFixedIncome,
  isDerivative,
  isBBG,
  getAssetTypeConfig,
};
