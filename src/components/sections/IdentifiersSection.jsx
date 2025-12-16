/**
 * IdentifiersSection - Seccion de identificadores del instrumento
 *
 * La configuracion de campos por tipo esta en: src/config/assetTypes/
 * Ver [tipo].config.js para modificar campos, requerimientos y alertas.
 *
 * FLUJO EN CASCADA (modo NUEVA):
 * - PASO 1: investmentTypeCode + nameInstrumento (siempre visible)
 * - PASO 2: publicDataSource + identificadores (visible si paso 1 completado)
 *           Derivados NO tienen paso 2 (sin identificadores)
 */

import { Alert, Box } from '@mui/material';
import FingerprintOutlinedIcon from '@mui/icons-material/FingerprintOutlined';
import CircularProgress from '@mui/material/CircularProgress';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { FormSection, FormRow } from '../layout';
import { TextField, SelectField } from '../fields';
import useAssetTypeConfig from '../../hooks/useAssetTypeConfig';

const IdentifiersSection = ({
  formData,
  handleChange,
  isFieldReadOnly,
  duplicateErrors,
  validating,
  validateFieldDebounced,
  formErrors,
  options,
  investmentTypeConfig,
  mode,
  currentStep,
}) => {
  // ===========================================
  // USAR CONFIGURACION POR ASSET TYPE
  // ===========================================
  const {
    isDerivative: isDerivativeType,
    isFieldRequired,
    isFieldVisible,
    getSectionAlerts,
    getStepMessage: getConfigStepMessage,
  } = useAssetTypeConfig(formData.investmentTypeCode, formData);

  // Verificar si publicDataSource debe mostrarse (Fund lo oculta)
  const showPublicDataSource = isFieldVisible('publicDataSource', formData);

  // Manejar cambio con validacion de duplicados
  const handleIdentifierChange = (e) => {
    handleChange(e);
    const { name, value } = e.target;
    if (validateFieldDebounced) {
      validateFieldDebounced(name, value);
    }
  };

  // Obtener icono de estado para un campo
  const getStatusIcon = (fieldName) => {
    if (validating && validating[fieldName]) {
      return <CircularProgress size={16} />;
    }
    if (duplicateErrors && duplicateErrors[fieldName]) {
      return <ErrorOutlineIcon color="error" fontSize="small" />;
    }
    if (formData[fieldName] && (!formErrors || !formErrors[fieldName])) {
      return <CheckCircleOutlinedIcon color="success" fontSize="small" />;
    }
    return null;
  };

  // Obtener error combinado (duplicado o validacion)
  const getError = (fieldName) => {
    return (duplicateErrors && duplicateErrors[fieldName]) ||
           (formErrors && formErrors[fieldName]) ||
           null;
  };

  // Determinar si identificador es requerido usando la config del tipo
  const isIdentifierRequired = (fieldName) => {
    // Usar la funcion del hook que lee desde la config
    return isFieldRequired(fieldName, formData);
  };

  // ===========================================
  // LOGICA DE VISIBILIDAD SEGUN MODO Y PASO
  // ===========================================
  const isNuevaMode = mode === 'nueva';

  // Paso 2 visible: si paso 1 esta completado (investmentType + name)
  // EXCEPTO para derivados - no muestran este paso
  // Fund SI muestra identificadores pero NO publicDataSource
const showPaso2 = !isDerivativeType && (
  !isNuevaMode ||
  (isNuevaMode && currentStep >= 2) ||
  !!formData.publicDataSource
);

  // Mensajes de progreso para modo NUEVA
  const getStepMessage = () => {
    if (!isNuevaMode) return null;

    // Usar mensaje de la config si existe
    const configMessage = getConfigStepMessage(currentStep);
    if (configMessage) return configMessage;

    // Fallback
    if (currentStep === 1) {
      return 'Paso 1: Seleccione el tipo de inversión y nombre del instrumento.';
    }
    if (currentStep === 2 && !isDerivativeType) {
      return 'Paso 2: Seleccione la fuente de datos y complete los identificadores requeridos.';
    }
    return null;
  };

  const stepMessage = getStepMessage();

  // Obtener alertas desde la config
  const sectionAlerts = getSectionAlerts('identifiers', formData);

  return (
    <FormSection
      title="Identificadores"
      icon={<FingerprintOutlinedIcon color="primary" />}
      collapsible
      defaultExpanded
    >
      {/* Mensaje de progreso */}
      {stepMessage && (
        <Box sx={{ mb: 2 }}>
          <Alert severity="info" sx={{ py: 0.5 }}>
            {stepMessage}
          </Alert>
        </Box>
      )}

      {/* PASO 1: Investment_Type_Code + Name_Instrumento */}
      <FormRow>
        <SelectField
          name="investmentTypeCode"
          label="Investment_Type_Code"
          value={formData.investmentTypeCode}
          onChange={handleChange}
          options={options?.investmentTypes || []}
          readOnly={isFieldReadOnly('investmentTypeCode')}
          error={getError('investmentTypeCode')}
          required
          width="md"
        />
        <TextField
          name="nameInstrumento"
          label="Name_Instrumento"
          value={formData.nameInstrumento}
          onChange={handleIdentifierChange}
          readOnly={isFieldReadOnly('nameInstrumento')}
          error={getError('nameInstrumento')}
          endIcon={getStatusIcon('nameInstrumento')}
          required
          width="flex2"
          placeholder="Nombre del instrumento"
        />
      </FormRow>

      {/* PASO 2: Public_Data_Source - Solo si el tipo lo requiere (Fund no lo muestra) */}
      {showPaso2 && showPublicDataSource && (
        <FormRow>
          <SelectField
            name="publicDataSource"
            label="Public_Data_Source"
            value={formData.publicDataSource}
            onChange={handleChange}
            options={options?.dataSources || []}
            readOnly={isFieldReadOnly('publicDataSource')}
            error={getError('publicDataSource')}
            required
            width="md"
          />
        </FormRow>
      )}

      {/* Identificadores - Visible junto con Public_Data_Source */}
      {showPaso2 && (
        <>
          {/* Alertas desde la configuracion del tipo */}
          {(isNuevaMode || mode === 'reestructuracion') && sectionAlerts.length > 0 && (
            <Box sx={{ mb: 2 }}>
              {sectionAlerts.map((alert, idx) => (
                <Alert key={idx} severity={alert.severity || 'info'} sx={{ py: 0.5, mb: 1 }}>
                  {alert.message}
                </Alert>
              ))}
            </Box>
          )}

          <FormRow>
            <TextField
              name="isin"
              label="ISIN"
              value={formData.isin}
              onChange={handleIdentifierChange}
              readOnly={isFieldReadOnly('isin')}
              error={getError('isin')}
              endIcon={getStatusIcon('isin')}
              required={isIdentifierRequired('isin')}
              width="lg"
              placeholder="Ej: US0378331005"
              inputProps={{ maxLength: 12, style: { textTransform: 'uppercase' } }}
            />
            <TextField
              name="tickerBBG"
              label="TickerBBG"
              value={formData.tickerBBG}
              onChange={handleIdentifierChange}
              readOnly={isFieldReadOnly('tickerBBG')}
              error={getError('tickerBBG')}
              endIcon={getStatusIcon('tickerBBG')}
              required={isIdentifierRequired('tickerBBG')}
              width="lg"
              placeholder="Ej: AAPL US"
              inputProps={{ maxLength: 20, style: { textTransform: 'uppercase' } }}
            />
            <TextField
              name="sedol"
              label="SEDOL"
              value={formData.sedol}
              onChange={handleIdentifierChange}
              readOnly={isFieldReadOnly('sedol')}
              error={getError('sedol')}
              endIcon={getStatusIcon('sedol')}
              width="md"
              placeholder="Ej: 2046251"
              inputProps={{ maxLength: 7, style: { textTransform: 'uppercase' } }}
            />
            <TextField
              name="cusip"
              label="CUSIP"
              value={formData.cusip}
              onChange={handleIdentifierChange}
              readOnly={isFieldReadOnly('cusip')}
              error={getError('cusip')}
              endIcon={getStatusIcon('cusip')}
              width="md"
              placeholder="Ej: 037833100"
              inputProps={{ maxLength: 9, style: { textTransform: 'uppercase' } }}
            />
          </FormRow>
        </>
      )}
    </FormSection>
  );
};

export default IdentifiersSection;
