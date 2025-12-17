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

const useFieldCascade = (setFields, companyState = null) => {
  // Flag para indicar si viene de auto-populate
  const isAutoPopulatingRef = useRef(false);

  // Wrapper para handleChange que incluye cascada - CONSOLIDADO EN UNA SOLA ACTUALIZACION
  const handleChangeWithCascade = useCallback((e) => {
    const { name, value, type, checked } = e.target;
    const newValue = type === 'checkbox' ? checked : value;

    // Preparar TODAS las actualizaciones en un solo objeto
    const updates = { [name]: newValue };

    // Obtener configuracion de cascada para este campo
    const config = cascadeConfig[name];

    if (config?.clearFields) {
      // Verificar si debemos ejecutar la cascada
      const shouldCascade = !config.condition || config.condition(newValue);
      const skipAutoPopulate = config.skipIfAutoPopulate && isAutoPopulatingRef.current;
      const skipCompanySelected = config.skipIfCompanySelected && companyState?.selectedCompany;

      if (shouldCascade && !skipAutoPopulate && !skipCompanySelected) {
        // Agregar campos a limpiar
        config.clearFields.forEach(field => {
          updates[field] = '';
        });
      }
    }

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
      config.clearFields.forEach(field => {
        clears[field] = '';
      });
      setFields(clears);
    }

    return { shouldClearCompanyState: !!config.clearCompanyState };
  }, [setFields, companyState]);

  // Auto-poblar campos desde una compania seleccionada
  const populateFromCompany = useCallback((company, companyName) => {
    if (!company) return;

    isAutoPopulatingRef.current = true;

    try {
      const updates = {
        companyName: companyName || company.companyName,
      };

      if (company.issuerTypeCode !== undefined && company.issuerTypeCode !== null) {
        updates.issuerTypeCode = String(company.issuerTypeCode);
      }
      if (company.sectorGICS !== undefined && company.sectorGICS !== null) {
        updates.sectorGICS = String(company.sectorGICS);
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
