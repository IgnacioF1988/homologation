/**
 * RestructuringSection - Seccion de reestructuracion
 *
 * Solo visible cuando esReestructuracion === true
 * Permite buscar predecesor y heredar datos (excluyendo parametros FI)
 *
 * FLUJO:
 * 1. Usuario marca checkbox esReestructuracion
 * 2. Se auto-genera nuevo idInstrumento
 * 3. Usuario selecciona predecesor (dropdown o campos ID + Moneda)
 * 4. Se heredan campos del predecesor EXCEPTO parametros FI
 * 5. Usuario completa parametros FI manualmente
 */

import React, { useState, useEffect } from 'react';
import {
  Box,
  Alert,
  CircularProgress,
  Chip,
  Autocomplete,
  TextField as MuiTextField,
} from '@mui/material';
import SwapHorizOutlinedIcon from '@mui/icons-material/SwapHorizOutlined';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { FormSection, FormRow, WarningMessage } from '../layout';
import { TextField, CheckboxField, DateField, SelectField } from '../fields';

const RestructuringSection = ({
  formData,
  handleChange,
  handleReestructuracionChange,
  isFieldReadOnly,
  formErrors,
  predecesorEncontrado,
  loadingPredecesor,
  predecesorError,
  getInstrumentosExistentes,
  options = {},
}) => {
  // Estado local para la lista de instrumentos (para dropdown)
  const [instrumentos, setInstrumentos] = useState([]);
  const [loadingInstrumentos, setLoadingInstrumentos] = useState(false);
  const [selectedPredecesor, setSelectedPredecesor] = useState(null);

  // Cargar lista de instrumentos cuando se activa reestructuracion
  useEffect(() => {
    if (formData.esReestructuracion && getInstrumentosExistentes) {
      setLoadingInstrumentos(true);
      getInstrumentosExistentes()
        .then((data) => {
          setInstrumentos(data || []);
        })
        .catch((err) => {
          console.error('Error cargando instrumentos:', err);
          setInstrumentos([]);
        })
        .finally(() => {
          setLoadingInstrumentos(false);
        });
    }
  }, [formData.esReestructuracion, getInstrumentosExistentes]);

  // Obtener error de un campo
  const getError = (fieldName) => {
    return formErrors && formErrors[fieldName] ? formErrors[fieldName] : null;
  };

  // Manejar seleccion de predecesor desde dropdown
  const handlePredecesorSelect = (event, newValue) => {
    setSelectedPredecesor(newValue);
    if (newValue) {
      // Verificar que los valores existan antes de convertir a string
      const idInstrumento = newValue.idInstrumento !== undefined && newValue.idInstrumento !== null
        ? String(newValue.idInstrumento)
        : '';
      const moneda = newValue.moneda !== undefined && newValue.moneda !== null
        ? String(newValue.moneda)
        : '';

      // Actualizar campos idPredecesor y monedaPredecesor
      handleChange({
        target: { name: 'idPredecesor', value: idInstrumento, type: 'text' },
      });
      handleChange({
        target: { name: 'monedaPredecesor', value: moneda, type: 'text' },
      });
    } else {
      // Limpiar campos
      handleChange({
        target: { name: 'idPredecesor', value: '', type: 'text' },
      });
      handleChange({
        target: { name: 'monedaPredecesor', value: '', type: 'text' },
      });
    }
  };

  return (
    <FormSection
      title="Reestructuracion"
      icon={<SwapHorizOutlinedIcon color="primary" />}
      collapsible
      defaultExpanded
    >
      {/* Checkbox para activar modo reestructuracion */}
      <FormRow>
        <CheckboxField
          name="esReestructuracion"
          label="Este instrumento es una reestructuracion de uno existente"
          checked={formData.esReestructuracion}
          onChange={handleReestructuracionChange || handleChange}
          disabled={isFieldReadOnly('esReestructuracion')}
        />
      </FormRow>

      {/* Campos de predecesor - solo si esReestructuracion === true */}
      {formData.esReestructuracion && (
        <>
          <WarningMessage
            message="Seleccione el instrumento predecesor. Los datos se heredaran automaticamente (excepto parametros de renta fija)."
            sx={{ mb: 2 }}
          />

          {/* Dropdown para seleccionar predecesor */}
          <FormRow>
            <Box sx={{ flex: 1, minWidth: 400 }}>
              <Autocomplete
                options={instrumentos}
                getOptionLabel={(option) => option.label || ''}
                value={selectedPredecesor}
                onChange={handlePredecesorSelect}
                loading={loadingInstrumentos}
                disabled={isFieldReadOnly('idPredecesor')}
                renderInput={(params) => (
                  <MuiTextField
                    {...params}
                    label="Seleccionar Instrumento Predecesor"
                    placeholder="Buscar por ID o nombre..."
                    size="small"
                    InputProps={{
                      ...params.InputProps,
                      endAdornment: (
                        <>
                          {loadingInstrumentos ? <CircularProgress size={20} /> : null}
                          {params.InputProps.endAdornment}
                        </>
                      ),
                    }}
                  />
                )}
                renderOption={(props, option) => (
                  <li {...props} key={`${option.idInstrumento}-${option.moneda}`}>
                    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                      <span>{option.nombre}</span>
                      <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
                        <Chip label={`ID_Instrumento: ${option.idInstrumento}`} size="small" variant="outlined" />
                        <Chip label={`Moneda: ${option.moneda}`} size="small" variant="outlined" />
                      </Box>
                    </Box>
                  </li>
                )}
                isOptionEqualToValue={(option, value) =>
                  option.idInstrumento === value.idInstrumento && option.moneda === value.moneda
                }
              />
            </Box>
          </FormRow>

          {/* Campos manuales (alternativa al dropdown) */}
          <Box sx={{ mt: 2, mb: 1 }}>
            <Alert severity="info" sx={{ py: 0.5 }}>
              O ingrese manualmente el ID y Moneda del predecesor:
            </Alert>
          </Box>

          <FormRow>
            <TextField
              name="idPredecesor"
              label="ID_Predecesor"
              value={formData.idPredecesor}
              onChange={handleChange}
              readOnly={isFieldReadOnly('idPredecesor')}
              error={getError('idPredecesor')}
              required
              width="md"
              type="number"
              placeholder="ID del instrumento predecesor"
            />
            <TextField
              name="monedaPredecesor"
              label="Moneda_Predecesor"
              value={formData.monedaPredecesor}
              onChange={handleChange}
              readOnly={isFieldReadOnly('monedaPredecesor')}
              error={getError('monedaPredecesor')}
              required
              width="md"
              type="number"
              placeholder="Codigo de moneda"
            />
          </FormRow>

          {/* Estado de busqueda del predecesor */}
          {loadingPredecesor && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 2 }}>
              <CircularProgress size={20} />
              <span>Buscando predecesor...</span>
            </Box>
          )}

          {predecesorError && (
            <Alert severity="error" sx={{ mt: 2 }} icon={<ErrorOutlineIcon />}>
              {predecesorError}
            </Alert>
          )}

          {predecesorEncontrado && !loadingPredecesor && (
            <Alert severity="success" sx={{ mt: 2 }} icon={<CheckCircleOutlinedIcon />}>
              Predecesor encontrado: <strong>{predecesorEncontrado.nameInstrumento || predecesorEncontrado.nombreFuente}</strong>
              <br />
              Los datos han sido heredados. Complete los parametros de renta fija manualmente.
            </Alert>
          )}

          {/* Campos de reestructuracion */}
          {predecesorEncontrado && (
            <FormRow>
              <SelectField
                name="tipoContinuador"
                label="Tipo Continuador"
                value={formData.tipoContinuador}
                onChange={handleChange}
                options={options.tiposContinuador || []}
                readOnly={isFieldReadOnly('tipoContinuador')}
                error={getError('tipoContinuador')}
                required
                width="md"
                helperText="Seleccione el tipo de continuador"
              />
              <DateField
                name="diaValidez"
                label="Dia_Validez"
                value={formData.diaValidez}
                onChange={handleChange}
                readOnly={isFieldReadOnly('diaValidez')}
                error={getError('diaValidez')}
                width="md"
              />
            </FormRow>
          )}

          {/* Mensaje informativo sobre herencia */}
          {predecesorEncontrado && (
            <Box sx={{ mt: 2 }}>
              <Alert severity="warning" sx={{ py: 0.5 }}>
                <strong>Importante:</strong> Los siguientes campos NO se heredan y deben completarse manualmente:
                <ul style={{ margin: '8px 0 0 0', paddingLeft: 20 }}>
                  <li>Perpetuidad</li>
                  <li>Rendimiento</li>
                  <li>Coupon_Frequency</li>
                  <li>Campos BBG (CoCo, Callable, Sinkable, YAS_YLD_FLAG)</li>
                </ul>
              </Alert>
            </Box>
          )}
        </>
      )}
    </FormSection>
  );
};

export default RestructuringSection;
