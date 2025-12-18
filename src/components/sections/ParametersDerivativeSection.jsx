/**
 * ParametersDerivativeSection - Seccion de parametros de Derivados
 *
 * La configuracion esta en: src/config/assetTypes/derivative.config.js
 * Ver ese archivo para modificar campos, opciones y alertas.
 *
 * Campo principal: subId (10000 = Pata Larga, 20000 = Pata Corta)
 */

import { Alert, Box } from '@mui/material';
import ShowChartOutlinedIcon from '@mui/icons-material/ShowChartOutlined';
import { FormSection, FormRow } from '../layout';
import { SelectField } from '../fields';
import useAssetTypeConfig from '../../hooks/useAssetTypeConfig';

const ParametersDerivativeSection = ({
  formData,
  handleChange,
  isFieldReadOnly,
  formErrors,
  mode,
}) => {
  // ===========================================
  // USAR CONFIGURACION POR ASSET TYPE
  // ===========================================
  const {
    getFieldConfig,
    getSectionAlerts,
    getStepMessage,
  } = useAssetTypeConfig(formData.investmentTypeCode, formData);

  // Obtener error de un campo
  const getError = (fieldName) => {
    return formErrors && formErrors[fieldName] ? formErrors[fieldName] : null;
  };

  // Es modo nueva o reestructuracion?
  const isNuevaMode = mode === 'nueva';

  // Obtener opciones de SubID desde la config (o usar fallback)
  const subIdFieldConfig = getFieldConfig('subId');
  const subIdOptions = subIdFieldConfig?.options || [
    { value: 10000, label: '10000 - Pata Larga (Asset)' },
    { value: 20000, label: '20000 - Pata Corta (Liability)' },
  ];

  // Obtener alertas de la seccion
  const sectionAlerts = getSectionAlerts('parameters', formData);

  return (
    <FormSection
      title="Parametros Derivado"
      icon={<ShowChartOutlinedIcon color="primary" />}
      collapsible
      defaultExpanded
    >
      {/* Alertas desde la configuracion */}
      {sectionAlerts.length > 0 && (
        <Box sx={{ mb: 2 }}>
          {sectionAlerts.map((alert) => (
            <Alert key={alert.id} severity={alert.severity || 'warning'} sx={{ py: 0.5, mb: 1 }}>
              {alert.message}
            </Alert>
          ))}
        </Box>
      )}

      {/* Mensaje de paso para modo NUEVA (usa config o fallback) */}
      {isNuevaMode && (
        <Box sx={{ mb: 2 }}>
          <Alert severity="info" sx={{ py: 0.5 }}>
            {getStepMessage(3) || 'Seleccione el SubID correspondiente a la pata del derivado.'}
          </Alert>
        </Box>
      )}

      {/* Campo SubID */}
      <FormRow>
        <SelectField
          name="subId"
          label="SubID (Pata del Derivado)"
          value={formData.subId}
          onChange={handleChange}
          options={subIdOptions}
          readOnly={isFieldReadOnly('subId')}
          error={getError('subId')}
          required
          width="lg"
        />
      </FormRow>
    </FormSection>
  );
};

export default ParametersDerivativeSection;
