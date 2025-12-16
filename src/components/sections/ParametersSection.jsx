/**
 * ParametersSection - Seccion generica de parametros por Asset Type
 *
 * Lee campos desde la config del tipo (sections.parameters)
 * y los renderiza dinamicamente.
 *
 * Usado por:
 * - Fund: investmentFundType
 * - Cash: cashTypeCode
 * - Futuros tipos que necesiten parametros especificos
 *
 * NO confundir con:
 * - ParametersFISection: Parametros especificos de Fixed Income (coupon, yield, etc.)
 * - ParametersDerivativeSection: Parametros especificos de Derivados (subId)
 *
 * La configuracion esta en: src/config/assetTypes/[tipo].config.js
 * Ver sections.parameters para modificar campos.
 */

import { Alert, Box } from '@mui/material';
import AccountBalanceOutlinedIcon from '@mui/icons-material/AccountBalanceOutlined';
import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined';
import { FormSection, FormRow } from '../layout';
import { SelectField, TextField } from '../fields';
import useAssetTypeConfig from '../../hooks/useAssetTypeConfig';

// Mapeo de nombres de iconos a componentes
const iconMap = {
  AccountBalanceIcon: AccountBalanceOutlinedIcon,
  CategoryIcon: CategoryOutlinedIcon,
};

const ParametersSection = ({
  formData,
  handleChange,
  isFieldReadOnly,
  options,
  formErrors,
  mode,
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

  // Obtener la seccion de parametros desde la config
  const section = config?.sections?.parameters;

  // Si no hay seccion de parametros, no renderizar nada
  if (!section || !section.fields) {
    return null;
  }

  // Obtener error de un campo
  const getError = (fieldName) => {
    return formErrors && formErrors[fieldName] ? formErrors[fieldName] : null;
  };

  // Es modo nueva?
  const isNuevaMode = mode === 'nueva';

  // Obtener campos de la seccion
  const fields = Object.entries(section.fields);

  // Filtrar campos visibles
  const visibleFields = fields.filter(([name]) => isFieldVisible(name, formData));

  // Si no hay campos visibles, no renderizar
  if (visibleFields.length === 0) {
    return null;
  }

  // Obtener alertas de la seccion
  const sectionAlerts = getSectionAlerts('parameters', formData);

  // Determinar icono
  const IconComponent = iconMap[section.icon] || AccountBalanceOutlinedIcon;

  return (
    <FormSection
      title={section.title || 'Parametros'}
      icon={<IconComponent color="primary" />}
      collapsible
      defaultExpanded
    >
      {/* Alertas desde la configuracion */}
      {sectionAlerts.length > 0 && (
        <Box sx={{ mb: 2 }}>
          {sectionAlerts.map((alert, idx) => (
            <Alert key={idx} severity={alert.severity || 'info'} sx={{ py: 0.5, mb: 1 }}>
              {alert.message}
            </Alert>
          ))}
        </Box>
      )}

      {/* Mensaje de paso para modo NUEVA */}
      {isNuevaMode && section.step && (
        <Box sx={{ mb: 2 }}>
          <Alert severity="info" sx={{ py: 0.5 }}>
            {getStepMessage(section.step) || `Complete los parametros requeridos.`}
          </Alert>
        </Box>
      )}

      {/* Campos dinamicos */}
      <FormRow>
        {visibleFields.map(([name, fieldConfig]) => {
          const isRequired = isFieldRequired(name, formData);
          const fieldValue = formData[name];
          const fieldOptions = options?.[fieldConfig.optionsKey] || fieldConfig.options || [];

          // Renderizar segun tipo de campo
          if (fieldConfig.type === 'select') {
            return (
              <SelectField
                key={name}
                name={name}
                label={fieldConfig.label}
                value={fieldValue}
                onChange={handleChange}
                options={fieldOptions}
                readOnly={isFieldReadOnly(name)}
                error={getError(name)}
                required={isRequired}
                width={fieldConfig.width || 'lg'}
                helperText={fieldConfig.helpText}
              />
            );
          }

          // Default: TextField
          return (
            <TextField
              key={name}
              name={name}
              label={fieldConfig.label}
              value={fieldValue}
              onChange={handleChange}
              readOnly={isFieldReadOnly(name)}
              error={getError(name)}
              required={isRequired}
              width={fieldConfig.width || 'lg'}
              placeholder={fieldConfig.placeholder}
              helperText={fieldConfig.helpText}
            />
          );
        })}
      </FormRow>
    </FormSection>
  );
};

export default ParametersSection;
