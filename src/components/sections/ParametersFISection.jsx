/**
 * ParametersFISection - Seccion de parametros de Renta Fija (Fixed Income)
 *
 * La configuracion de campos esta en: src/config/assetTypes/fixedIncome.config.js
 * Ver ese archivo para modificar campos, condiciones y alertas.
 *
 * Campos: couponTypeCode, yieldType, yieldSource, perpetuidad, rendimiento, couponFrequency
 * Campos condicionales BBG: coco, callable, sinkable, yasYldFlag (si yieldSource === 'BBG')
 */

import { Alert, Box } from '@mui/material';
import AccountBalanceOutlinedIcon from '@mui/icons-material/AccountBalanceOutlined';
import { FormSection, FormRow } from '../layout';
import { SelectField, TextField } from '../fields';
import useAssetTypeConfig from '../../hooks/useAssetTypeConfig';

const ParametersFISection = ({
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
    isFieldVisible,
    getStepMessage,
  } = useAssetTypeConfig(formData.investmentTypeCode, formData);

  // Campos BBG visibles segun config (o fallback a yieldSource === 'BBG')
  const showBBGFields = isFieldVisible('coco', formData);

  // Obtener error de un campo
  const getError = (fieldName) => {
    return formErrors && formErrors[fieldName] ? formErrors[fieldName] : null;
  };

  // Es modo nueva o reestructuracion?
  const isNuevaMode = mode === 'nueva';
  const isReestructuracionMode = mode === 'reestructuracion';

  return (
    <FormSection
      title="Parametros"
      icon={<AccountBalanceOutlinedIcon color="primary" />}
      collapsible
      defaultExpanded
    >
      {/* Mensaje de paso para modo NUEVA (usa config o fallback) */}
      {isNuevaMode && (
        <Box sx={{ mb: 2 }}>
          <Alert severity="info" sx={{ py: 0.5 }}>
            {getStepMessage(5) || 'Complete los parametros del instrumento.'}
          </Alert>
        </Box>
      )}

      {/* Mensaje para modo reestructuracion */}
      {isReestructuracionMode && (
        <Box sx={{ mb: 2 }}>
          <Alert severity="warning" sx={{ py: 0.5 }}>
            Los campos <strong>Perpetuidad</strong>, <strong>Rendimiento</strong>, <strong>Coupon_Frequency</strong> y campos BBG NO se heredan del predecesor. Debe completarlos manualmente.
          </Alert>
        </Box>
      )}

      {/* Primera fila: Coupon_Type_Code, Yield_Type, Yield_Source */}
      <FormRow>
        <SelectField
          name="couponTypeCode"
          label="Coupon_Type_Code"
          value={formData.couponTypeCode}
          onChange={handleChange}
          options={options?.couponTypes || []}
          readOnly={isFieldReadOnly('couponTypeCode')}
          error={getError('couponTypeCode')}
          required
          width="md"
        />
        <SelectField
          name="yieldType"
          label="Yield_Type"
          value={formData.yieldType}
          onChange={handleChange}
          options={options?.yieldTypes || []}
          readOnly={isFieldReadOnly('yieldType')}
          error={getError('yieldType')}
          required
          width="md"
        />
        <SelectField
          name="yieldSource"
          label="Yield_Source"
          value={formData.yieldSource}
          onChange={handleChange}
          options={options?.yieldSources || []}
          readOnly={isFieldReadOnly('yieldSource')}
          error={getError('yieldSource')}
          required
          width="md"
        />
      </FormRow>

      {/* Segunda fila: Perpetuidad, Rendimiento, Coupon_Frequency */}
      <FormRow>
        <SelectField
          name="perpetuidad"
          label="Perpetuidad"
          value={formData.perpetuidad}
          onChange={handleChange}
          options={options?.booleanValues || []}
          readOnly={isFieldReadOnly('perpetuidad')}
          error={getError('perpetuidad')}
          required
          width="md"
        />
        <SelectField
          name="rendimiento"
          label="Rendimiento"
          value={formData.rendimiento}
          onChange={handleChange}
          options={options?.booleanValues || []}
          readOnly={isFieldReadOnly('rendimiento')}
          error={getError('rendimiento')}
          required
          width="md"
        />
        <SelectField
          name="couponFrequency"
          label="Coupon_Frequency"
          value={formData.couponFrequency}
          onChange={handleChange}
          options={options?.couponFrequencies || []}
          readOnly={isFieldReadOnly('couponFrequency')}
          error={getError('couponFrequency')}
          required
          width="md"
        />
      </FormRow>

      {/* Campos BBG - Solo si yieldSource === 'BBG' */}
      {showBBGFields && (
        <>
        <Box sx={{ mt: 2, mb: 1 }}>
          <Alert severity="info" sx={{ py: 0.5 }}>
            Complete los campos Bloomberg requeridos:
          </Alert>
        </Box>
        <FormRow>
          <SelectField
            name="coco"
            label="CoCo"
            value={formData.coco}
            onChange={handleChange}
            options={options?.booleanValues || []}
            readOnly={isFieldReadOnly('coco')}
            error={getError('coco')}
            required
            width="md"
          />
          <SelectField
            name="callable"
            label="Callable"
            value={formData.callable}
            onChange={handleChange}
            options={options?.booleanValues || []}
            readOnly={isFieldReadOnly('callable')}
            error={getError('callable')}
            required
            width="md"
          />
          <SelectField
            name="sinkable"
            label="Sinkable"
            value={formData.sinkable}
            onChange={handleChange}
            options={options?.booleanValues || []}
            readOnly={isFieldReadOnly('sinkable')}
            error={getError('sinkable')}
            required
            width="md"
          />
          <TextField
            name="yasYldFlag"
            label="YAS_YLD_FLAG"
            value={formData.yasYldFlag}
            onChange={handleChange}
            readOnly={isFieldReadOnly('yasYldFlag')}
            error={getError('yasYldFlag')}
            width="md"
            type="number"
          />
        </FormRow>
        </>
      )}
    </FormSection>
  );
};

export default ParametersFISection;
