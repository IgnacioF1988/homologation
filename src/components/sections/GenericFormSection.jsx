/**
 * GenericFormSection - Componente generico para renderizar secciones desde config
 *
 * Este componente permite renderizar CUALQUIER seccion leyendo directamente desde
 * el config del Asset Type. Soporta:
 *
 * 1. Agregar campos = agregar al config
 * 2. Ocultar campos = usar hidden: true o hiddenFields
 * 3. Campos condicionales = usar visibleWhen
 * 4. Campos requeridos condicionales = usar requiredWhen
 *
 * USO:
 * <GenericFormSection
 *   sectionId="definition"
 *   formData={formData}
 *   handleChange={handleChange}
 *   options={options}
 *   isFieldReadOnly={isFieldReadOnly}
 *   formErrors={formErrors}
 *   mode={mode}
 * />
 *
 * La configuracion de campos esta en: src/config/assetTypes/[tipo].config.js
 */

import { Alert, Box, alpha } from '@mui/material';
import PublicOutlinedIcon from '@mui/icons-material/PublicOutlined';
import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';
import FingerprintOutlinedIcon from '@mui/icons-material/FingerprintOutlined';
import AccountBalanceOutlinedIcon from '@mui/icons-material/AccountBalanceOutlined';
import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import { FormSection, FormRow } from '../layout';
import { SelectField, TextField } from '../fields';
import { colors } from '../../styles/theme';
import useAssetTypeConfig from '../../hooks/useAssetTypeConfig';

// Mapeo de nombres de iconos a componentes
const iconMap = {
  PublicIcon: PublicOutlinedIcon,
  BusinessIcon: BusinessOutlinedIcon,
  FingerprintIcon: FingerprintOutlinedIcon,
  AccountBalanceIcon: AccountBalanceOutlinedIcon,
  CategoryIcon: CategoryOutlinedIcon,
  SettingsIcon: SettingsOutlinedIcon,
};

/**
 * Renderiza un campo segun su tipo
 * @param {string} name - Nombre del campo
 * @param {Object} fieldConfig - Configuracion del campo
 * @param {Object} formData - Datos del formulario
 * @param {Function} handleChange - Handler de cambio
 * @param {Object} options - Catalogos de opciones
 * @param {Function} isFieldReadOnly - Funcion para verificar si es readonly
 * @param {Object} formErrors - Errores del formulario
 * @param {boolean} isRequired - Si el campo es requerido
 * @param {string} mode - Modo del formulario
 * @returns {JSX.Element} - Elemento JSX del campo
 */
const renderField = (
  name,
  fieldConfig,
  formData,
  handleChange,
  options,
  isFieldReadOnly,
  formErrors,
  isRequired,
  mode
) => {
  const fieldValue = formData[name] || '';
  const fieldOptions = options?.[fieldConfig.optionsKey] || fieldConfig.options || [];
  const error = formErrors?.[name] || null;
  const isCashOrPayableOrBankDebt = [3, 4, 5].includes(formData.investmentTypeCode);
  const isFund = formData.investmentTypeCode === 6;
  const autoFilledForCashTypes = ['issueCountry', 'riskCountry', 'issueCurrency', 'riskCurrency', 'companyName', 'issuerTypeCode', 'sectorGICS'];
  const autoFilledForFund = ['issuerTypeCode', 'sectorGICS', 'riskCountry', 'issueCurrency', 'riskCurrency'];
  const isReadOnly = 
    (isCashOrPayableOrBankDebt && autoFilledForCashTypes.includes(name)) ||
    (isFund && autoFilledForFund.includes(name)) ||
    (isFieldReadOnly?.(name) ?? false);
    
  // Props comunes para todos los campos
  const commonProps = {
    key: name,
    name,
    label: fieldConfig.label,
    value: fieldValue,
    onChange: handleChange,
    readOnly: isReadOnly,
    error,
    required: isRequired,
    width: fieldConfig.width || 'md',
    helperText: fieldConfig.helpText,
  };

  // Estilos especiales para modo parcial (campos obligatorios vacios)
  const parcialStyles = mode === 'parcial' && isRequired && !fieldValue ? {
    '& .MuiOutlinedInput-root': {
      backgroundColor: alpha(colors.warning.main, 0.08),
      '& fieldset': { borderColor: colors.warning.main, borderWidth: 2 },
    }
  } : undefined;

  // Renderizar segun tipo de campo
  switch (fieldConfig.type) {
    case 'select':
      return (
        <SelectField
          {...commonProps}
          options={fieldOptions}
          sx={parcialStyles}
        />
      );

    case 'text':
    default:
      return (
        <TextField
          {...commonProps}
          maxLength={fieldConfig.maxLength}
          placeholder={fieldConfig.placeholder}
          sx={parcialStyles}
        />
      );
  }
};

/**
 * Componente principal GenericFormSection
 */
const GenericFormSection = ({
  sectionId,
  formData,
  handleChange,
  isFieldReadOnly,
  options,
  formErrors,
  mode,
  // Props opcionales para override
  title: titleOverride,
  icon: iconOverride,
  showStepMessage = true,
  customAlerts = null,
}) => {
  // ===========================================
  // USAR CONFIGURACION POR ASSET TYPE
  // ===========================================
  const {
    config,
    isFieldVisible,
    isFieldRequired,
    getSectionAlerts,
    getStepMessage,
  } = useAssetTypeConfig(formData.investmentTypeCode, formData);

  // Obtener la seccion desde la config
  const section = config?.sections?.[sectionId];

  // Si no hay seccion o no tiene campos, no renderizar nada
  if (!section || !section.fields) {
    return null;
  }

  // Obtener campos de la seccion
  const allFields = Object.entries(section.fields);

  // Filtrar campos visibles (respeta hidden, hiddenFields, visibleWhen)
  const visibleFields = allFields.filter(([name]) => isFieldVisible(name, formData));

  // Si no hay campos visibles, no renderizar
  if (visibleFields.length === 0) {
    return null;
  }

  // Determinar titulo e icono
  const sectionTitle = titleOverride || section.title || sectionId;
  const IconComponent = iconOverride
    ? (typeof iconOverride === 'string' ? iconMap[iconOverride] : iconOverride)
    : (iconMap[section.icon] || PublicOutlinedIcon);

  // Obtener alertas de la seccion
  const sectionAlerts = getSectionAlerts(sectionId, formData);

  // Es modo nueva?
  const isNuevaMode = mode === 'nueva';

  // Mensaje de paso
  const stepMessage = section.step && showStepMessage ? getStepMessage(section.step) : null;

  return (
    <FormSection
      title={sectionTitle}
      icon={<IconComponent color="primary" />}
      collapsible
      defaultExpanded
    >
      {/* Alertas desde la configuracion */}
      {sectionAlerts.length > 0 && (
        <Box sx={{ mb: 2 }}>
          {sectionAlerts.map((alert) => (
            <Alert key={alert.id} severity={alert.severity || 'info'} sx={{ py: 0.5, mb: 1 }}>
              {alert.message}
            </Alert>
          ))}
        </Box>
      )}

      {/* Alertas personalizadas */}
      {customAlerts}

      {/* Mensaje de paso para modo NUEVA */}
      {isNuevaMode && stepMessage && (
        <Box sx={{ mb: 2 }}>
          <Alert severity="info" sx={{ py: 0.5 }}>
            {stepMessage}
          </Alert>
        </Box>
      )}

      {/* Campos dinamicos */}
      <FormRow>
        {visibleFields.map(([name, fieldConfig]) => {
          const isRequired = isFieldRequired(name, formData);
          return renderField(
            name,
            fieldConfig,
            formData,
            handleChange,
            options,
            isFieldReadOnly,
            formErrors,
            isRequired,
            mode
          );
        })}
      </FormRow>
    </FormSection>
  );
};

// Exportar el helper renderField para uso en otros componentes
export { renderField };

export default GenericFormSection;
