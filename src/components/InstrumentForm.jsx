/**
 * InstrumentForm - Componente principal del formulario de instrumentos
 *
 * FLUJO CORRECTO:
 * 1. Recibe datos de la cola (nombreFuente, fuente, moneda) + queueItemId
 * 2. El operador ingresa idInstrumento para buscar coincidencias
 * 3. Segun el modo (exacta/parcial/nueva/reestructuracion) habilita campos
 * 4. Al guardar, marca el item de la cola como completado
 *
 * CASOS Y VISIBILIDAD DE SECCIONES:
 * - CASO 1 (EXACTA): Todas las secciones visibles pero readonly
 * - CASO 2 (PARCIAL): Todas las secciones visibles, solo issueCurrency/riskCurrency editables
 * - CASO 3 (NUEVA): Flujo en cascada con 6 pasos secuenciales
 * - CASO 4 (REESTRUCTURACION): Predecesor + herencia de datos (sin params FI)
 */

import { useState, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Box, Paper, Alert, Snackbar } from '@mui/material';

// Hooks
import {
  useFormState,
  useFormMode,
  useFieldCascade,
  useInstrumentLookup,
  useDuplicateValidation,
  useFormValidation,
  useCatalogOptions,
  useInvestmentTypeConfig,
  useSectionVisibility,
  isDerivative,
  useAssetTypeConfig,
} from '../hooks';

// Sections
import {
  SourceDataSection,
  IdentifiersSection,
  CompanySection,
  COMPANY_STATES,
  DefinitionSection,
  ParametersFISection,
  ParametersDerivativeSection,
  ParametersSection,
  RestructuringSection,
  FormActions,
} from './sections';

// Layout
import { LoadingOverlay } from './layout';



// API
import { api } from '../services/api';

// Utils - Funciones de mapeo compartidas
import { mapRegistroCompleto, mapRegistroSinMonedas } from '../utils/instrumentMapping';

// Styles
import { formContainer } from '../styles/formStyles';

// BEACON LOG - Verificar que código actualizado se está sirviendo
console.log('[BEACON-2025-12-17-v2] InstrumentForm.jsx CARGADO - Versión actualizada');

const InstrumentForm = forwardRef(({
  // Datos iniciales de la cola (nombreFuente, fuente, moneda)
  initialData = null,
  // Datos recuperados de un borrador guardado
  recoveredDraft = null,
  // ID del item en la cola de pendientes (para marcarlo como completado)
  queueItemId = null,
  // Callback cuando se guarda exitosamente
  onSaveSuccess = null,
  // Callback cuando se cancela
  onCancel = null,
  // Callback para notificar cambios sin guardar (dirty state)
  onDirtyChange = null,
}, ref) => {
  // Estado de UI
  const [saving, setSaving] = useState(false);
  const [notification, setNotification] = useState({ open: false, message: '', severity: 'success' });

  // Estado de la compania (NEW = crear nueva, SELECTED = existente)
  const [companyState, setCompanyState] = useState(COMPANY_STATES.WRITING);

  // Estado para almacenar metadata del instrumento origen (copiado desde SearchHelper)
  // Se usa para auto-poblar campos de predecesor si el usuario marca "Reestructuración"
  const [sourceInstrument, setSourceInstrument] = useState(null);

  // Hook de estado del formulario
  // Si hay un borrador recuperado, usarlo; sino usar initialData
  const {
    formData,
    setFields,
    setFormData,
    resetForm,
    isDirty,
  } = useFormState({
    ...initialData,
    ...(recoveredDraft || {}), // Aplicar borrador si existe
    queueItemId: queueItemId, // Guardar el ID de la cola
  });

  // Hook de configuracion por tipo de inversion
  const investmentTypeConfig = useInvestmentTypeConfig(formData.investmentTypeCode);

  // Hook de modo del formulario
  const {
    mode,
    setMode,
    modeLabel,
    modeColor,
    modeDescription,
    isFieldReadOnly,
  } = useFormMode(null, formData, investmentTypeConfig?.config);

  // Notificar al padre cuando cambia el estado dirty (incluye formData para borradores)
  useEffect(() => {
    if (onDirtyChange) {
      onDirtyChange(isDirty, formData);
    }
  }, [isDirty, formData, onDirtyChange]);

  // Para derivados: auto-llenar issueCurrency y riskCurrency con la moneda fuente
  useEffect(() => {
    if (isDerivative(formData.investmentTypeCode) && formData.moneda) {
      const updates = {};
      if (!formData.issueCurrency || formData.issueCurrency !== formData.moneda) {
        updates.issueCurrency = formData.moneda;
      }
      if (!formData.riskCurrency || formData.riskCurrency !== formData.moneda) {
        updates.riskCurrency = formData.moneda;
      }
      if (Object.keys(updates).length > 0) {
        setFields(updates);
      }
    }
  }, [formData.investmentTypeCode, formData.moneda, formData.issueCurrency, formData.riskCurrency, setFields]);

  // Hook de cascada de campos (ahora solo necesita setFields, no setField)
  const {
    handleChangeWithCascade,
    populateFromCompany,
  } = useFieldCascade(setFields);

  // Hook de busqueda de instrumentos - AHORA USA formData para disparar busquedas
  const {
    loading: lookupLoading,
    registroEncontrado,
    lookupError,
    predecesorEncontrado,
    loadingPredecesor,
    predecesorError,
    getInstrumentosExistentes,
    activarInstrumentoNuevo,
    desactivarInstrumentoNuevo,
    activarReestructuracion,
    desactivarReestructuracion,
  } = useInstrumentLookup(formData, setMode, setFields);

  // Hook de validacion de duplicados (solo activo en modo NUEVA)
  const {
    duplicateErrors,
    validating,
    validateFieldDebounced,
    hasDuplicateErrors,
    clearDuplicateErrors,
  } = useDuplicateValidation(formData, mode === 'nueva' ? null : formData.idInstrumento);

  // Hook de validacion del formulario
  const {
    errors: formErrors,
    hasErrors: hasFormErrors,
    isFormComplete,
    validateForm,
    clearErrors,
  } = useFormValidation(formData, mode);

  // Hook de opciones de catalogos
  const {
    options,
    loading: catalogsLoading,
  } = useCatalogOptions();


  // Hook para obtener defaults del Asset Type
  const { getDefaultValues } = useAssetTypeConfig(formData.investmentTypeCode, formData);

  // =============================================================================
  // AUTO-APLICACIÓN DE DEFAULTS POR TIPO DE INVERSIÓN
  // Consolidado: aplica defaults estáticos + monedas dinámicas en un solo lugar
  // =============================================================================
  useEffect(() => {
    console.log('[AUTO-DEFAULTS] useEffect ejecutado:', {
      mode,
      investmentTypeCode: formData.investmentTypeCode,
      moneda: formData.moneda
    });

    // QUICK FIX: Solo bloquear si NO hay investmentTypeCode
    if (!formData.investmentTypeCode) {
      console.log('[AUTO-DEFAULTS] Saliendo - no hay investmentTypeCode');
      return;
    }

    // No sobrescribir datos en modo exacta/parcial
    if (mode === 'exacta' || mode === 'parcial') {
      console.log('[AUTO-DEFAULTS] Saliendo - modo exacta/parcial, no sobrescribir');
      return;
    }

    const applyDefaults = async () => {
      try {
        const fieldsToApply = {};

        // 1. SIEMPRE aplicar defaults estáticos del config (no depende de moneda)
        const staticDefaults = getDefaultValues();
        console.log('[AUTO-DEFAULTS] Defaults del config:', staticDefaults);

        Object.entries(staticDefaults).forEach(([fieldName, defaultValue]) => {
          // No sobrescribir campos que ya tienen valor
          if (!formData[fieldName] || formData[fieldName] === '') {
            console.log(`[AUTO-DEFAULTS] Campo ${fieldName} vacío, aplicando default:`, defaultValue);
            fieldsToApply[fieldName] = defaultValue;
          } else {
            console.log(`[AUTO-DEFAULTS] Campo ${fieldName} ya tiene valor:`, formData[fieldName]);
          }
        });

        // 2. SI hay moneda, aplicar currencies (solo para tipos que lo necesitan)
        if ([3, 4, 5, 6, 7].includes(formData.investmentTypeCode) && formData.moneda) {
          console.log('[AUTO-DEFAULTS] Obteniendo monedas de API para tipo:', formData.investmentTypeCode);
          try {
            const monedaRes = await api.catalogos.getMonedaById(formData.moneda);

            if (monedaRes.success) {
              console.log('[AUTO-DEFAULTS] Moneda obtenida:', monedaRes.data.nombre);
              if (!formData.issueCurrency && !fieldsToApply.issueCurrency) {
                fieldsToApply.issueCurrency = monedaRes.data.nombre;
              }
              if (!formData.riskCurrency && !fieldsToApply.riskCurrency) {
                fieldsToApply.riskCurrency = monedaRes.data.nombre;
              }
            }
          } catch (apiError) {
            console.error('[AUTO-DEFAULTS] Error obteniendo moneda de API:', apiError);
          }
        }

        // 3. Aplicar todos en batch
        if (Object.keys(fieldsToApply).length > 0) {
          console.log('[AUTO-DEFAULTS] Aplicando campos:', fieldsToApply);
          setFields(fieldsToApply);

          // DEBUG: Verificar inmediatamente después (próximo tick)
          setTimeout(() => {
            console.log('[AUTO-DEFAULTS-VERIFY] formData después de setFields:', {
              companyName: formData.companyName,
              issuerTypeCode: formData.issuerTypeCode,
              sectorGICS: formData.sectorGICS,
            });
          }, 100);
        } else {
          console.log('[AUTO-DEFAULTS] No hay campos para aplicar');
        }
      } catch (error) {
        console.error('[AUTO-DEFAULTS] Error aplicando defaults:', error);
      }
    };

    applyDefaults();
  }, [formData.investmentTypeCode, mode, formData.moneda, getDefaultValues, setFields]);

  // =============================================================================
  // DEBUG: Verificar valores de formData después de aplicar defaults
  // =============================================================================
  useEffect(() => {
    if (formData.investmentTypeCode === 3) {
      console.log('[FORM-DATA-CASH] Valores actuales:', {
        companyName: formData.companyName,
        issuerTypeCode: formData.issuerTypeCode,
        sectorGICS: formData.sectorGICS,
        issueCountry: formData.issueCountry,
        riskCountry: formData.riskCountry,
        issueCurrency: formData.issueCurrency,
        riskCurrency: formData.riskCurrency,
      });
    }
  }, [formData.companyName, formData.issuerTypeCode, formData.sectorGICS, formData.issueCountry, formData.riskCountry, formData.issueCurrency, formData.riskCurrency, formData.investmentTypeCode]);

  // =============================================================================
  // AUTO-ACTIVACIÓN DE MODO 'NUEVA'
  // Si usuario selecciona investment type sin marcar checkbox, auto-activar modo nueva
  // =============================================================================
  useEffect(() => {
    if (!mode && formData.investmentTypeCode && !formData.idInstrumento && activarInstrumentoNuevo) {
      console.log('[AUTO-MODE] Auto-activando modo nueva por selección de investment type');
      activarInstrumentoNuevo();
    }
  }, [mode, formData.investmentTypeCode, formData.idInstrumento, activarInstrumentoNuevo]);

  // ============================================================================
  // LOGICA DE VISIBILIDAD DE SECCIONES - CENTRALIZADA EN HOOK
  // La lógica ahora está en useSectionVisibility, usando configs por Asset Type
  // ============================================================================
  const { currentStep, sectionVisibility } = useSectionVisibility(
    mode,
    formData,
    predecesorEncontrado
  );

  // Manejar cambio de campos (con cascada y validacion)
  const handleFieldChange = useCallback((e) => {
    handleChangeWithCascade(e);
  }, [handleChangeWithCascade]);

  // Manejar cambio de checkbox de reestructuracion
  const handleReestructuracionChange = useCallback(async (e) => {
    const { checked } = e.target;
    if (checked) {
      await activarReestructuracion();

      // Si hay un instrumento origen guardado (copiado desde SearchHelper),
      // usar su ID e issueCurrency como predecesor
      if (sourceInstrument?.idInstrumento) {
        console.log('Usando instrumento origen como predecesor:', sourceInstrument);
        // Establecer los campos del predecesor con un pequeño delay para que se apliquen después de activarReestructuracion
        setTimeout(() => {
          setFields({
            idPredecesor: String(sourceInstrument.idInstrumento),
            monedaPredecesor: sourceInstrument.issueCurrency ? String(sourceInstrument.issueCurrency) : '',
          });
        }, 100);
      }
    } else {
      desactivarReestructuracion();
    }
  }, [activarReestructuracion, desactivarReestructuracion, sourceInstrument, setFields]);

  // Manejar guardado
  const handleSubmit = useCallback(async () => {
    // Validar formulario
    const isValid = validateForm();
    if (!isValid) {
      setNotification({
        open: true,
        message: 'Por favor corrija los errores antes de guardar',
        severity: 'error',
      });
      return;
    }

    // Verificar duplicados (solo en modo nueva)
    if (mode === 'nueva' && hasDuplicateErrors()) {
      setNotification({
        open: true,
        message: 'Existen valores duplicados que deben ser corregidos',
        severity: 'error',
      });
      return;
    }

    setSaving(true);

    try {
      let response;

      // Preparar datos para guardar (excluir metadata de cola)
      const dataToSave = { ...formData };
      delete dataToSave.queueItemId;

      // Limpiar campos booleanos nchar(1) que no deben enviarse como false/vacío
      // La BD espera 'S' o NULL, no false/empty string
      const nchar1Fields = ['esReestructuracion', 'emisionNacional', 'perpetuidad', 'rendimiento', 'coco', 'callable', 'sinkable'];
      nchar1Fields.forEach(field => {
        if (!dataToSave[field] || dataToSave[field] === false || dataToSave[field] === 'false') {
          delete dataToSave[field];
        }
      });
      // esInstrumentoNuevo es solo para UI, no existe en BD
      delete dataToSave.esInstrumentoNuevo;

      // Para no-derivados, si subId está vacío, copiar el código de moneda
      // Los derivados deben tener subId = 10000 o 20000 (validado arriba)
      if (!isDerivative(dataToSave.investmentTypeCode) && !dataToSave.subId && dataToSave.moneda) {
        dataToSave.subId = dataToSave.moneda;
      }

      // Si es compania nueva, crearla primero
      if (companyState === COMPANY_STATES.NEW && formData.companyName) {
        console.log('[handleSubmit] Creando nueva compania:', formData.companyName);
        try {
          const companyData = {
            companyName: formData.companyName,
            issuerTypeCode: formData.issuerTypeCode || null,
            sectorGICS: formData.sectorGICS || null,
          };
          const companyResponse = await api.companias.create(companyData);
          if (!companyResponse.success) {
            // Si la compania ya existe, no es error fatal - continuar
            console.warn('[handleSubmit] Advertencia al crear compania:', companyResponse.error);
          } else {
            console.log('[handleSubmit] Compania creada:', companyResponse.data);
          }
        } catch (companyError) {
          // Si falla por duplicado (409), continuar - la compania ya existe
          if (!companyError.message?.includes('409') && !companyError.message?.includes('Ya existe')) {
            console.error('[handleSubmit] Error creando compania:', companyError);
          }
        }
      }

      if (mode === 'exacta' || mode === 'parcial') {
        // Actualizar instrumento existente
        response = await api.instrumentos.update(formData.idInstrumento, dataToSave);
      } else {
        // Crear nuevo instrumento
        console.log('[handleSubmit] Creando instrumento con datos:', dataToSave);
        response = await api.instrumentos.create(dataToSave);
      }

      if (response.success) {
        // Marcar item de cola como completado
        if (queueItemId) {
          await api.colaPendientes.updateEstado(queueItemId, 'completado');
        }

        setNotification({
          open: true,
          message: mode === 'exacta' || mode === 'parcial'
            ? 'Instrumento actualizado exitosamente'
            : 'Instrumento creado exitosamente',
          severity: 'success',
        });

        // Callback de exito
        if (onSaveSuccess) {
          onSaveSuccess(response.data, queueItemId);
        }
      } else {
        setNotification({
          open: true,
          message: response.error || 'Error al guardar',
          severity: 'error',
        });
      }
    } catch (error) {
      console.error('[handleSubmit] Error:', error);
      setNotification({
        open: true,
        message: error.message || 'Error inesperado',
        severity: 'error',
      });
    } finally {
      setSaving(false);
    }
  }, [formData, mode, companyState, validateForm, hasDuplicateErrors, queueItemId, onSaveSuccess]);

  // Manejar reset
  const handleReset = useCallback(() => {
    resetForm({
      ...initialData,
      queueItemId: queueItemId,
    });
    clearErrors();
    clearDuplicateErrors();
    setMode(null);
    setSourceInstrument(null); // Limpiar instrumento origen
  }, [resetForm, clearErrors, clearDuplicateErrors, setMode, initialData, queueItemId]);

  // Manejar cancelar
  const handleCancel = useCallback(() => {
    if (onCancel) {
      onCancel();
    }
  }, [onCancel]);

  // Manejar copia de valores desde SearchHelper
  // NO establecer modo automáticamente - el usuario decide si es reestructuración o nuevo
  const handleCopyFromSearch = useCallback((values) => {
    console.log('handleCopyFromSearch llamado con:', values);

    // Extraer metadata del instrumento origen
    const { _sourceInstrument, ...fieldValues } = values;

    // Guardar metadata del origen para posible reestructuración
    if (_sourceInstrument) {
      setSourceInstrument(_sourceInstrument);
      console.log('Instrumento origen guardado:', _sourceInstrument);
    }

    // Usar setFormData directamente para evitar problemas con otros hooks
    setFormData(prev => {
      const newData = { ...prev, ...fieldValues };
      console.log('Nuevo formData:', newData);
      return newData;
    });

    setNotification({
      open: true,
      message: `Datos copiados de "${_sourceInstrument?.nameInstrumento || 'instrumento'}". Marque "Reestructuración" si corresponde, o "Instrumento Nuevo" para crear uno nuevo.`,
      severity: 'info',
    });
  }, [setFormData]);

  // Manejar selección de coincidencia EXACTA desde SearchHelper
  // ID + Moneda del instrumento seleccionado coinciden con formData
  const handleSelectExacta = useCallback((instrument) => {
    console.log('handleSelectExacta llamado con:', instrument);

    // Establecer modo EXACTA
    setMode('exacta');

    // Heredar todos los campos del instrumento seleccionado
    const mappedFields = mapRegistroCompleto(instrument);

    // Actualizar formData con el ID y todos los campos heredados
    setFormData(prev => ({
      ...prev,
      idInstrumento: String(instrument.idInstrumento),
      ...mappedFields,
    }));

    setNotification({
      open: true,
      message: `Coincidencia exacta confirmada: ID ${instrument.idInstrumento} + Moneda ${instrument.moneda}`,
      severity: 'success',
    });
  }, [setMode, setFormData]);

  // Manejar selección de coincidencia PARCIAL desde SearchHelper
  // ID coincide pero Moneda es diferente
  const handleSelectParcial = useCallback((instrument) => {
    console.log('handleSelectParcial llamado con:', instrument);

    // Establecer modo PARCIAL
    setMode('parcial');

    // Heredar campos excepto monedas (issueCurrency, riskCurrency)
    const mappedFields = mapRegistroSinMonedas(instrument);

    // Actualizar formData con el ID y campos heredados (sin monedas)
    setFormData(prev => ({
      ...prev,
      idInstrumento: String(instrument.idInstrumento),
      ...mappedFields,
    }));

    setNotification({
      open: true,
      message: `Coincidencia parcial confirmada: ID ${instrument.idInstrumento}. Complete las monedas de emisión y riesgo.`,
      severity: 'info',
    });
  }, [setMode, setFormData]);

  // Exponer métodos y datos para el SearchHelper a nivel de página
  useImperativeHandle(ref, () => ({
    handleCopyFromSearch,
    handleSelectExacta,
    handleSelectParcial,
    formData,
    saving,
  }), [handleCopyFromSearch, handleSelectExacta, handleSelectParcial, formData, saving]);

  // Cerrar notificacion
  const handleCloseNotification = useCallback(() => {
    setNotification(prev => ({ ...prev, open: false }));
  }, []);

  // Loading general
  const isLoading = lookupLoading || catalogsLoading;

  return (
    <Box sx={{ width: '100%' }}>
      <LoadingOverlay loading={isLoading} message="Cargando...">
        <Paper sx={formContainer}>
          {/* Error de busqueda */}
          {lookupError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {lookupError}
            </Alert>
          )}

          {/* Datos de la fuente + campo idInstrumento */}
          <SourceDataSection
            formData={formData}
            handleChange={handleFieldChange}
            isFieldReadOnly={isFieldReadOnly}
            modeLabel={modeLabel}
            modeColor={modeColor}
            modeDescription={modeDescription}
            registroEncontrado={registroEncontrado}
            activarInstrumentoNuevo={activarInstrumentoNuevo}
            desactivarInstrumentoNuevo={desactivarInstrumentoNuevo}
            queueItemId={queueItemId}
            options={options}
          />

          {/* Reestructuracion - Siempre visible para poder activar/desactivar */}
          {sectionVisibility.restructuring && (
            <RestructuringSection
              formData={formData}
              handleChange={handleFieldChange}
              handleReestructuracionChange={handleReestructuracionChange}
              isFieldReadOnly={isFieldReadOnly}
              formErrors={formErrors}
              predecesorEncontrado={predecesorEncontrado}
              loadingPredecesor={loadingPredecesor}
              predecesorError={predecesorError}
              getInstrumentosExistentes={getInstrumentosExistentes}
              options={options}
            />
          )}

          {/* Identificadores - Paso 1 (investmentType + name) + Paso 3 (publicDataSource) + Paso 4 (identificadores) */}
          {sectionVisibility.identifiers && (
            <IdentifiersSection
              formData={formData}
              handleChange={handleFieldChange}
              isFieldReadOnly={isFieldReadOnly}
              duplicateErrors={duplicateErrors}
              validating={validating}
              validateFieldDebounced={validateFieldDebounced}
              formErrors={formErrors}
              options={options}
              investmentTypeConfig={investmentTypeConfig}
              mode={mode}
              currentStep={currentStep}
            />
          )}

          {/* Datos de la compania - Paso 2 */}
          {sectionVisibility.company && (
            <CompanySection
              formData={formData}
              handleChange={handleFieldChange}
              isFieldReadOnly={isFieldReadOnly}
              populateFromCompany={populateFromCompany}
              options={options}
              formErrors={formErrors}
              investmentTypeConfig={investmentTypeConfig}
              mode={mode}
              onCompanyStateChange={setCompanyState}
            />
          )}

          {/* Definicion (geografia) - Paso 5 (solo EQ) */}
          {sectionVisibility.definition && (
            <DefinitionSection
              formData={formData}
              handleChange={handleFieldChange}
              isFieldReadOnly={isFieldReadOnly}
              options={options}
              formErrors={formErrors}
              investmentTypeConfig={investmentTypeConfig}
              mode={mode}
            />
          )}

          {/* Parametros FI - Paso 6 (solo FI) */}
          {sectionVisibility.parametersFI && (
            <ParametersFISection
              formData={formData}
              handleChange={handleFieldChange}
              isFieldReadOnly={isFieldReadOnly}
              options={options}
              formErrors={formErrors}
              investmentTypeConfig={investmentTypeConfig}
              mode={mode}
            />
          )}

          {/* Parametros Derivados - (solo DE) */}
          {sectionVisibility.parametersDE && (
            <ParametersDerivativeSection
              formData={formData}
              handleChange={handleFieldChange}
              isFieldReadOnly={isFieldReadOnly}
              formErrors={formErrors}
              mode={mode}
            />
          )}

          {/* Parametros Genericos - (Fund, Cash, etc.) */}
          {sectionVisibility.parameters && (
            <ParametersSection
              formData={formData}
              handleChange={handleFieldChange}
              isFieldReadOnly={isFieldReadOnly}
              options={options}
              formErrors={formErrors}
              mode={mode}
            />
          )}

          {/* Botones de accion */}
          <FormActions
            mode={mode}
            onSubmit={handleSubmit}
            onCancel={onCancel ? handleCancel : null}
            onReset={handleReset}
            loading={saving}
            hasErrors={!isFormComplete || hasFormErrors || (mode === 'nueva' && hasDuplicateErrors())}
            isDirty={isDirty}
          />
        </Paper>
      </LoadingOverlay>

      {/* Notificaciones */}
      <Snackbar
        open={notification.open}
        autoHideDuration={6000}
        onClose={handleCloseNotification}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          onClose={handleCloseNotification}
          severity={notification.severity}
          variant="filled"
        >
          {notification.message}
        </Alert>
      </Snackbar>

    </Box>
  );
});

// Nombre para debugging
InstrumentForm.displayName = 'InstrumentForm';

export default InstrumentForm;

// Force recompile
