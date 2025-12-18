/**
 * fieldValidations.js - Validaciones centralizadas de campos
 *
 * PROPOSITO:
 * Centralizar la lógica de validación de campos (especialmente readOnly)
 * para evitar arrays hardcodeados dispersos en componentes.
 *
 * ANTES (en CompanySection.jsx):
 *   disabled={[3, 4, 5].includes(formData.investmentTypeCode)}
 *
 * DESPUÉS:
 *   disabled={isFieldReadOnly('companyName', formData.investmentTypeCode, config, mode)}
 *
 * BENEFICIOS:
 * 1. Lógica en un solo lugar (fácil de mantener)
 * 2. Automáticamente incluye todos los tipos (no se olvida ID 7)
 * 3. Trazable con logging estructurado
 * 4. Puede consultar el config del asset type
 */

import { trace, TRACE } from './tracing';

// ===========================================
// REGLAS DE READONLY POR INVESTMENT TYPE
// ===========================================

/**
 * Obtiene reglas de readOnly para un investment type específico
 * Esta función centraliza TODAS las reglas que antes estaban dispersas
 * en arrays hardcodeados como [3, 4, 5] o [3, 4, 5, 6]
 *
 * @param {number} investmentTypeCode - Código del tipo de inversión
 * @returns {Object} - Objeto con campos que deben ser readonly
 */
function getReadOnlyRulesByType(investmentTypeCode) {
  const typeCode = parseInt(investmentTypeCode);

  // Tipos con campos company bloqueados (companyName, issuerTypeCode)
  // Cash (3), Payable (4), BankDebt (5), Derivative (7)
  const typesWithBlockedCompany = [3, 4, 5, 7];

  // Tipos con sectorGICS bloqueado
  // Cash (3), Payable (4), BankDebt (5), Fund (6), Derivative (7)
  const typesWithBlockedSectorGICS = [3, 4, 5, 6, 7];

  const rules = {};

  // Regla 1: Tipos con company bloqueado
  if (typesWithBlockedCompany.includes(typeCode)) {
    rules.companyName = true;
    rules.issuerTypeCode = true;
  }

  // Regla 2: Tipos con sectorGICS bloqueado
  if (typesWithBlockedSectorGICS.includes(typeCode)) {
    rules.sectorGICS = true;
  }

  // EXCEPCIÓN: Fund tiene sectorGICS bloqueado pero companyName editable
  if (typeCode === 6) {
    rules.sectorGICS = true;
    rules.companyName = false; // Explícitamente editable
    rules.issuerTypeCode = false; // Explícitamente editable (pero oculto en UI)
  }

  trace.readonly('Reglas readOnly para tipo', {
    investmentTypeCode: typeCode,
    rules,
  });

  return rules;
}

// ===========================================
// FUNCIONES PÚBLICAS DE VALIDACIÓN
// ===========================================

/**
 * Determina si un campo debe ser readOnly basado en:
 * 1. La propiedad readOnly del config del asset type
 * 2. El investment type (reglas especiales por tipo)
 * 3. El modo del formulario
 *
 * @param {string} fieldName - Nombre del campo a validar
 * @param {number} investmentTypeCode - Código del tipo de inversión
 * @param {Object} fieldConfig - Configuración del asset type (opcional)
 * @param {string} mode - Modo del formulario (nueva/exacta/parcial)
 * @returns {boolean} - True si el campo debe ser readOnly
 */
export const isFieldReadOnly = (fieldName, investmentTypeCode, fieldConfig = null, mode = 'nueva') => {
  trace.enter(TRACE.READONLY, 'isFieldReadOnly', {
    fieldName,
    investmentTypeCode,
    mode,
  });

  // 1. En modo exacta, TODOS los campos son readonly
  if (mode === 'exacta') {
    trace.readonly(`✓ Modo exacta - campo ${fieldName} readonly`);
    trace.exit(TRACE.READONLY, 'isFieldReadOnly', true);
    return true;
  }

  // 2. En modo parcial, solo currencies son editables
  if (mode === 'parcial') {
    const editableInParcial = ['issueCurrency', 'riskCurrency'];
    const isReadOnly = !editableInParcial.includes(fieldName);
    trace.readonly(`Modo parcial - campo ${fieldName}: ${isReadOnly ? 'readonly' : 'editable'}`);
    trace.exit(TRACE.READONLY, 'isFieldReadOnly', isReadOnly);
    return isReadOnly;
  }

  // 3. Buscar readOnly en config del asset type
  if (fieldConfig) {
    for (const section of Object.values(fieldConfig.sections || {})) {
      const field = section.fields?.[fieldName];
      if (field?.readOnly === true) {
        trace.readonly(`✓ Campo ${fieldName} tiene readOnly: true en config`);
        trace.exit(TRACE.READONLY, 'isFieldReadOnly', true);
        return true;
      }
    }
  }

  // 4. Reglas especiales por investment type
  const readOnlyRules = getReadOnlyRulesByType(investmentTypeCode);
  if (readOnlyRules[fieldName] === true) {
    trace.readonly(`✓ Campo ${fieldName} readonly por regla de tipo ${investmentTypeCode}`);
    trace.exit(TRACE.READONLY, 'isFieldReadOnly', true);
    return true;
  }

  // 5. Excepción explícita: si la regla es false, el campo es editable
  if (readOnlyRules[fieldName] === false) {
    trace.readonly(`✓ Campo ${fieldName} explícitamente editable para tipo ${investmentTypeCode}`);
    trace.exit(TRACE.READONLY, 'isFieldReadOnly', false);
    return false;
  }

  // 6. Default: campo editable
  trace.readonly(`Campo ${fieldName} es editable (default)`);
  trace.exit(TRACE.READONLY, 'isFieldReadOnly', false);
  return false;
};

/**
 * Verifica si campos relacionados (issuerTypeCode, sectorGICS) son editables
 * cuando companyName está bloqueado.
 *
 * Usado para determinar si issuerTypeCode y sectorGICS deben ser readonly
 * cuando vienen de una compañía seleccionada.
 *
 * @param {Object} companyState - Estado de selección de compañía
 * @param {number} investmentTypeCode - Código del tipo de inversión
 * @returns {boolean} - True si los campos relacionados son editables
 */
export const areRelatedFieldsEditable = (companyState, investmentTypeCode) => {
  trace.enter(TRACE.READONLY, 'areRelatedFieldsEditable', {
    hasSelectedCompany: !!companyState?.selectedCompany,
    investmentTypeCode,
  });

  // Si hay compañía seleccionada, los campos vienen de ella y son readonly
  if (companyState?.selectedCompany) {
    trace.readonly('Hay compañía seleccionada - campos relacionados readonly');
    trace.exit(TRACE.READONLY, 'areRelatedFieldsEditable', false);
    return false;
  }

  // Tipos que nunca permiten edición de campos relacionados
  // Cash (3), Payable (4), BankDebt (5), Derivative (7)
  const typesWithBlockedFields = [3, 4, 5, 7];

  if (typesWithBlockedFields.includes(parseInt(investmentTypeCode))) {
    trace.readonly(`Tipo ${investmentTypeCode} tiene campos relacionados bloqueados`);
    trace.exit(TRACE.READONLY, 'areRelatedFieldsEditable', false);
    return false;
  }

  // EXCEPCIÓN: Fund (6) tiene campos relacionados bloqueados
  if (parseInt(investmentTypeCode) === 6) {
    trace.readonly('Tipo Fund - campos relacionados bloqueados (sectorGICS fijo)');
    trace.exit(TRACE.READONLY, 'areRelatedFieldsEditable', false);
    return false;
  }

  // Default: campos relacionados editables (FI, EQ)
  trace.readonly('Campos relacionados editables');
  trace.exit(TRACE.READONLY, 'areRelatedFieldsEditable', true);
  return true;
};

/**
 * Verifica si un campo debe estar oculto (hidden) en la UI
 *
 * @param {string} fieldName - Nombre del campo
 * @param {Object} fieldConfig - Configuración del asset type
 * @returns {boolean} - True si el campo debe estar oculto
 */
export const isFieldHidden = (fieldName, fieldConfig) => {
  if (!fieldConfig) return false;

  for (const section of Object.values(fieldConfig.sections || {})) {
    if (section.hiddenFields?.includes(fieldName)) {
      trace.readonly(`Campo ${fieldName} está en hiddenFields`);
      return true;
    }
  }

  return false;
};

/**
 * Obtiene el mensaje de ayuda para campos readonly
 * según la razón por la que están bloqueados
 *
 * @param {string} fieldName - Nombre del campo
 * @param {number} investmentTypeCode - Código del tipo de inversión
 * @returns {string|null} - Mensaje de ayuda o null
 */
export const getReadOnlyHelpText = (fieldName, investmentTypeCode) => {
  const typeCode = parseInt(investmentTypeCode);

  // Mapeo de tipos a nombres legibles
  const typeNames = {
    1: 'Fixed Income',
    2: 'Equity',
    3: 'Cash',
    4: 'Payable/Receivable',
    5: 'Bank Debt',
    6: 'Fund',
    7: 'Derivative',
  };

  const typeName = typeNames[typeCode] || `Tipo ${typeCode}`;

  // Mensajes específicos por campo y tipo
  if (fieldName === 'companyName' && [3, 4, 5, 7].includes(typeCode)) {
    return `Para ${typeName}, este campo tiene un valor fijo predeterminado`;
  }

  if (fieldName === 'sectorGICS' && typeCode === 6) {
    return 'Para Fondos, Sector GICS siempre es FIP (66666666)';
  }

  if (fieldName === 'sectorGICS' && [3, 4, 5, 7].includes(typeCode)) {
    return `Para ${typeName}, este campo tiene un valor fijo predeterminado`;
  }

  return null;
};

// ===========================================
// HELPERS DE VALIDACIÓN
// ===========================================

/**
 * Valida si un campo es requerido en el contexto actual
 *
 * @param {string} fieldName - Nombre del campo
 * @param {Object} fieldConfig - Configuración del campo
 * @param {Object} formData - Datos actuales del formulario
 * @returns {boolean} - True si el campo es requerido
 */
export const isFieldRequired = (fieldName, fieldConfig, formData) => {
  if (!fieldConfig) return false;

  for (const section of Object.values(fieldConfig.sections || {})) {
    const field = section.fields?.[fieldName];
    if (field) {
      // Required incondicional
      if (field.required === true) return true;

      // Required condicional
      if (field.requiredWhen) {
        // Evaluar condición (implementar según necesidad)
        // Por ahora, retornar false
        return false;
      }
    }
  }

  return false;
};

/**
 * Valida si un campo debe estar visible
 *
 * @param {string} fieldName - Nombre del campo
 * @param {Object} fieldConfig - Configuración del campo
 * @param {Object} formData - Datos actuales del formulario
 * @returns {boolean} - True si el campo debe estar visible
 */
export const isFieldVisible = (fieldName, fieldConfig, formData) => {
  // Si está en hiddenFields, no es visible
  if (isFieldHidden(fieldName, fieldConfig)) return false;

  if (!fieldConfig) return true;

  for (const section of Object.values(fieldConfig.sections || {})) {
    const field = section.fields?.[fieldName];
    if (field) {
      // Visible incondicional
      if (!field.visibleWhen) return true;

      // Visible condicional
      // Evaluar condición (implementar según necesidad)
      // Por ahora, retornar true
      return true;
    }
  }

  return true;
};

export default {
  isFieldReadOnly,
  areRelatedFieldsEditable,
  isFieldHidden,
  isFieldRequired,
  isFieldVisible,
  getReadOnlyHelpText,
};
