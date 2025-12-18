/**
 * useFieldCascade - Hook para manejar dependencias en cascada entre campos
 *
 * La configuracion de cascadas esta en: src/constants/fieldCascade.js
 * Ver ese archivo para agregar/modificar reglas de cascada.
 */

import { useCallback, useRef } from 'react';
import {
  cascadeConfig,
  ALL_DEPENDENT_FIELDS,
  REESTRUCTURACION_FIELDS,
} from '../constants/fieldCascade';
import { trace, TRACE, traceState } from '../utils/tracing';
import { getAssetTypeConfig } from '../config/assetTypes';

const useFieldCascade = (setFields, companyState = null, investmentTypeCode = null) => {
  // Flag para indicar si viene de auto-populate
  const isAutoPopulatingRef = useRef(false);

  // Wrapper para handleChange que incluye cascada - CONSOLIDADO EN UNA SOLA ACTUALIZACION
  const handleChangeWithCascade = useCallback((e, investmentTypeCode, formData = {}) => {
    const { name, value, type, checked } = e.target;
    const newValue = type === 'checkbox' ? checked : value;

    trace.enter(TRACE.CASCADE, 'handleChangeWithCascade', {
      field: name,
      newValue,
      investmentTypeCode,
    });

    // SNAPSHOT: Capture state before cascade
    traceState(TRACE.CASCADE, `BEFORE cascade (${name} changed)`, formData);

    // Preparar TODAS las actualizaciones en un solo objeto
    const updates = { [name]: newValue };

    // Obtener configuracion de cascada para este campo
    const config = cascadeConfig[name];

    if (config?.clearFields) {
      // Verificar si debemos ejecutar la cascada
      const shouldCascade = !config.condition || config.condition(newValue);
      const skipAutoPopulate = config.skipIfAutoPopulate && isAutoPopulatingRef.current;
      const skipCompanySelected = config.skipIfCompanySelected && companyState?.selectedCompany;

      trace.cascade('Evaluando cascada', {
        field: name,
        hasCascade: true,
        shouldCascade,
        skipAutoPopulate,
        skipCompanySelected,
        fieldsToClean: config.clearFields,
      });

      if (shouldCascade && !skipAutoPopulate && !skipCompanySelected) {
        // EXCEPCIÓN: Si cambia investmentTypeCode a Fund (6),
        // NO limpiar sectorGICS ni issuerTypeCode porque tienen defaults fijos
        const isChangingToFund = name === 'investmentTypeCode' && parseInt(newValue) === 6;

        // Agregar campos a limpiar
        config.clearFields.forEach(field => {
          // Skip sectorGICS e issuerTypeCode si es Fund
          if (isChangingToFund && (field === 'sectorGICS' || field === 'issuerTypeCode')) {
            trace.cascade(`✅ Preservando ${field} para Fund`);
            return;
          }

          // Verificar si el campo tiene defaultValue en la config
          const assetConfig = getAssetTypeConfig(investmentTypeCode);
          let defaultValue = '';

          // Buscar el defaultValue en todas las secciones
          if (assetConfig?.sections) {
            for (const section of Object.values(assetConfig.sections)) {
              if (section.fields?.[field]?.defaultValue !== undefined) {
                defaultValue = section.fields[field].defaultValue;
                trace.cascade(`🔄 Aplicando defaultValue para ${field}: ${defaultValue}`);
                break;
              }
            }
          }

          trace.cascade(`🧹 Limpiando campo: ${field} = ${defaultValue || '(vacío)'}`);
          updates[field] = defaultValue;
        });
      } else {
        trace.cascade('⏭️ Skip cascada por condiciones', {
          shouldCascade,
          skipAutoPopulate,
          skipCompanySelected,
        });
      }
    } else {
      trace.cascade('⏭️ Sin cascada configurada para este campo');
    }

    // SNAPSHOT: Capture projected state after cascade
    const projectedState = { ...formData, ...updates };
    traceState(TRACE.CASCADE, `AFTER cascade (${name} changed)`, projectedState, {
      diff: true,
      prevState: formData
    });

    trace.exit(TRACE.CASCADE, 'handleChangeWithCascade', {
      totalUpdates: Object.keys(updates).length,
      updates,
    });

    // UNA SOLA llamada a setState con todos los cambios
    setFields(updates);

    return { shouldClearCompanyState: config?.clearCompanyState || false };
  }, [setFields, companyState]);

  // Procesar cascada manualmente (para casos especiales donde no viene de un evento)
  const processCascade = useCallback((fieldName, newValue) => {
    const config = cascadeConfig[fieldName];
    if (!config) return { shouldClearCompanyState: false };

    // Verificar si debemos ejecutar la cascada
    const shouldCascade = !config.condition || config.condition(newValue);
    const skipAutoPopulate = config.skipIfAutoPopulate && isAutoPopulatingRef.current;
    const skipCompanySelected = config.skipIfCompanySelected && companyState?.selectedCompany;

    if (!shouldCascade || skipAutoPopulate || skipCompanySelected) {
      return { shouldClearCompanyState: false };
    }

    // Limpiar campos dependientes
    if (config.clearFields && config.clearFields.length > 0) {
      const clears = {};
      const assetConfig = getAssetTypeConfig(investmentTypeCode);

      config.clearFields.forEach(field => {
        let defaultValue = '';

        // Buscar el defaultValue en todas las secciones
        if (assetConfig?.sections) {
          for (const section of Object.values(assetConfig.sections)) {
            if (section.fields?.[field]?.defaultValue !== undefined) {
              defaultValue = section.fields[field].defaultValue;
              break;
            }
          }
        }

        clears[field] = defaultValue;
      });
      setFields(clears);
    }

    return { shouldClearCompanyState: !!config.clearCompanyState };
  }, [setFields, companyState, investmentTypeCode]);

  // Auto-poblar campos desde una compania seleccionada
  const populateFromCompany = useCallback((company, companyName, investmentTypeCode) => {
    if (!company) return;

    isAutoPopulatingRef.current = true;

    try {
      const updates = {
        companyName: companyName || company.companyName,
      };

      // Para Fund (6), NO auto-poblar issuerTypeCode ni sectorGICS
      // porque el usuario busca compañía pero sectorGICS debe ser siempre '66666666' (FIP)
      const skipCompanyDefaults = investmentTypeCode === 6;

      if (!skipCompanyDefaults) {
        if (company.issuerTypeCode !== undefined && company.issuerTypeCode !== null) {
          updates.issuerTypeCode = String(company.issuerTypeCode);
        }
        if (company.sectorGICS !== undefined && company.sectorGICS !== null) {
          updates.sectorGICS = String(company.sectorGICS);
        }
      }

      setFields(updates);
    } finally {
      isAutoPopulatingRef.current = false;
    }
  }, [setFields]);

  // Limpiar todos los campos excepto los de fuente (para reset)
  const clearAllDependentFields = useCallback(() => {
    // Usar constantes de fieldCascade.js + campos adicionales
    const allFieldsToClear = [
      'investmentTypeCode', 'nameInstrumento',
      ...ALL_DEPENDENT_FIELDS,
    ];

    const clears = {};
    allFieldsToClear.forEach(field => {
      clears[field] = '';
    });
    setFields(clears);

    return { shouldClearCompanyState: true };
  }, [setFields]);

  // Limpiar campos de reestructuracion
  const clearReestructuracionFields = useCallback(() => {
    const clears = {};
    REESTRUCTURACION_FIELDS.forEach(field => {
      clears[field] = '';
    });
    setFields(clears);
  }, [setFields]);

  // Verificar si un campo tiene cascada configurada
  const hasCascade = useCallback((fieldName) => {
    return !!cascadeConfig[fieldName];
  }, []);

  // Obtener lista de campos que se limpian
  const getClearFields = useCallback((fieldName) => {
    return cascadeConfig[fieldName]?.clearFields || [];
  }, []);

  return {
    handleChangeWithCascade,
    processCascade,
    populateFromCompany,
    clearAllDependentFields,
    clearReestructuracionFields,
    hasCascade,
    getClearFields,
  };
};

export default useFieldCascade;
