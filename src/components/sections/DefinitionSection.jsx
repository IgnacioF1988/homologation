/**
 * DefinitionSection - Seccion de definicion geografica
 *
 * REFACTORIZADO: Ahora usa GenericFormSection internamente.
 * Los campos se leen directamente desde el config del Asset Type.
 *
 * La configuracion de campos esta en: src/config/assetTypes/[tipo].config.js
 * Ver sections.definition para modificar campos.
 *
 * COMO OCULTAR UN CAMPO (ej: emisionNacional en Equity):
 * Opcion 1: Usar hiddenFields en la seccion
 *   definition: {
 *     hiddenFields: ['emisionNacional'],
 *     fields: { ... }
 *   }
 *
 * Opcion 2: Usar hidden: true en el campo
 *   emisionNacional: {
 *     ...createSelectField(...),
 *     hidden: true,
 *   }
 *
 * COMO AGREGAR UN CAMPO:
 *   definition: {
 *     fields: {
 *       ...createGeographyFields({ ... }),
 *       miNuevoCampo: {
 *         name: 'miNuevoCampo',
 *         label: 'Mi Nuevo Campo',
 *         type: 'select',
 *         optionsKey: 'miCatalogo',
 *       },
 *     }
 *   }
 *
 * NOTA: Los derivados NO tienen esta seccion (monedas se auto-llenan)
 * NOTA: Los campos especificos por tipo (investmentFundType, cashTypeCode)
 *       se muestran en ParametersSection, NO aqui.
 */

import { Alert, Box } from '@mui/material';
import PublicOutlinedIcon from '@mui/icons-material/PublicOutlined';
import GenericFormSection from './GenericFormSection';

const DefinitionSection = ({
  formData,
  handleChange,
  isFieldReadOnly,
  options,
  formErrors,
  investmentTypeConfig,
  mode,
}) => {
  // Alerta especial para modo parcial
  const parcialAlert = mode === 'parcial' ? (
    <Box sx={{ mb: 2 }}>
      <Alert severity="warning" sx={{ py: 0.5 }}>
        Los campos <strong>Issue_Currency</strong> y <strong>Risk_Currency</strong> son obligatorios para continuar.
      </Alert>
    </Box>
  ) : null;

  return (
    <GenericFormSection
      sectionId="definition"
      formData={formData}
      handleChange={handleChange}
      isFieldReadOnly={isFieldReadOnly}
      options={options}
      formErrors={formErrors}
      mode={mode}
      title="Definicion Geografica"
      icon={PublicOutlinedIcon}
      customAlerts={parcialAlert}
    />
  );
};

export default DefinitionSection;
