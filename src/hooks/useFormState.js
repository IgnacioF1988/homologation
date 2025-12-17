/**
 * useFormState - Hook para manejar estado del formulario
 * Proporciona funciones para actualizar campos, resetear, y validar
 */

import { useState, useCallback, useMemo } from 'react';

// Estado inicial del formulario - CAMPOS EXACTOS del formulario original
export const getInitialFormState = () => ({
  // === METADATA DE LA COLA (NO se guarda en instrumento) ===
  queueItemId: null,  // ID del item en cola_pendientes (para marcar completado)

  // === DATOS FUENTE (read-only, vienen de la cola) ===
  nombreFuente: '',
  fuente: '',
  moneda: '',  // Viene de la cola, se usa para determinar el modo

  // === CAMPO QUE INGRESA EL OPERADOR ===
  idInstrumento: '',  // El operador lo ingresa, dispara busqueda en BD

  // === INSTRUMENTO NUEVO ===
  esInstrumentoNuevo: false,  // Indica si es un instrumento nuevo (ID auto-generado)

  // === REESTRUCTURACION ===
  esReestructuracion: false,
  idPredecesor: '',
  monedaPredecesor: '',
  main: '',
  diaValidez: '',

  // === IDENTIFICADORES ===
  nameInstrumento: '',
  publicDataSource: '',
  isin: '',
  tickerBBG: '',
  sedol: '',
  cusip: '',

  // === COMPANIA ===
  companyName: '',
  issuerTypeCode: '',
  sectorGICS: '',

  // === CLASIFICACION ===
  investmentTypeCode: '',
  issueTypeCode: '',
  sectorChileTypeCode: '',

  // === GEOGRAFIA ===
  issueCountry: '',
  riskCountry: '',
  issueCurrency: '',
  riskCurrency: '',
  emisionNacional: '',

  // === PARAMETROS FI (solo si investmentTypeCode='FI') ===
  couponTypeCode: '',
  yieldType: '',
  yieldSource: '',
  perpetuidad: '',
  rendimiento: '',
  couponFrequency: '',
  coco: '',
  callable: '',
  sinkable: '',
  yasYldFlag: '',

  // === PARAMETROS DE (solo si investmentTypeCode='DE') ===
  subId: '',  // SubID para derivados: 10000 = Pata Larga, 20000 = Pata Corta

  // === OTROS ===
  rankCode: '',
  cashTypeCode: '',
  bankDebtTypeCode: '',
  fundTypeCode: '',
  comentarios: '',
});

const useFormState = (initialValues = {}) => {
  const [formData, setFormDataRaw] = useState(() => ({
    ...getInitialFormState(),
    ...initialValues,
  }));

  // Wrapper de setFormData para debug
  const setFormData = useCallback((updater) => {
    setFormDataRaw(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      // DEBUG: Log si companyName cambia a vacío
      if (prev.companyName && !next.companyName) {
        console.log('[SET-FORM-DATA] companyName se limpió!', { prev: prev.companyName, next: next.companyName });
        console.trace('[SET-FORM-DATA] Stack trace:');
      }
      return next;
    });
  }, []);

  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [isDirty, setIsDirty] = useState(false);

  // Actualizar un campo
  const setField = useCallback((name, value) => {
    setFormDataRaw(prev => ({
      ...prev,
      [name]: value,
    }));
    setIsDirty(true);
  }, []);

  // Manejar evento de cambio de input
  const handleChange = useCallback((e) => {
    const { name, value, type, checked } = e.target;
    const newValue = type === 'checkbox' ? checked : value;
    setField(name, newValue);
  }, [setField]);

  // Actualizar multiples campos a la vez
  const setFields = useCallback((fields) => {
    // DEBUG: Log para rastrear quién llama setFields
    if (fields.companyName !== undefined || fields.issuerTypeCode !== undefined || fields.sectorGICS !== undefined) {
      console.log('[SET-FIELDS] Actualizando campos company:', fields);
      console.trace('[SET-FIELDS] Stack trace:');
    }

    setFormDataRaw(prev => ({
      ...prev,
      ...fields,
    }));
    setIsDirty(true);
  }, []);

  // Marcar campo como tocado (para mostrar errores solo despues de interaccion)
  const setFieldTouched = useCallback((name, isTouched = true) => {
    setTouched(prev => ({
      ...prev,
      [name]: isTouched,
    }));
  }, []);

  // Manejar blur para marcar como tocado
  const handleBlur = useCallback((e) => {
    const { name } = e.target;
    setFieldTouched(name, true);
  }, [setFieldTouched]);

  // Establecer error para un campo
  const setFieldError = useCallback((name, error) => {
    setErrors(prev => ({
      ...prev,
      [name]: error,
    }));
  }, []);

  // Establecer multiples errores
  const setFieldErrors = useCallback((newErrors) => {
    setErrors(prev => ({
      ...prev,
      ...newErrors,
    }));
  }, []);

  // Limpiar error de un campo
  const clearFieldError = useCallback((name) => {
    setErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors[name];
      return newErrors;
    });
  }, []);

  // Limpiar todos los errores
  const clearAllErrors = useCallback(() => {
    setErrors({});
  }, []);

  // Resetear formulario a valores iniciales
  const resetForm = useCallback((newInitialValues = {}) => {
    setFormDataRaw({
      ...getInitialFormState(),
      ...newInitialValues,
    });
    setErrors({});
    setTouched({});
    setIsDirty(false);
  }, []);

  // Obtener valor de un campo
  const getFieldValue = useCallback((name) => {
    return formData[name];
  }, [formData]);

  // Verificar si hay errores
  const hasErrors = useMemo(() => {
    return Object.keys(errors).length > 0;
  }, [errors]);

  // Obtener error de un campo (solo si fue tocado)
  const getFieldError = useCallback((name) => {
    return touched[name] ? errors[name] : null;
  }, [errors, touched]);

  return {
    // Estado
    formData,
    errors,
    touched,
    isDirty,
    hasErrors,

    // Setters
    setField,
    setFields,
    setFormData,
    handleChange,
    handleBlur,

    // Errores
    setFieldError,
    setFieldErrors,
    clearFieldError,
    clearAllErrors,
    getFieldError,

    // Touched
    setFieldTouched,

    // Utilidades
    resetForm,
    getFieldValue,
  };
};

export default useFormState;
