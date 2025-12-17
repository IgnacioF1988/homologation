/**
 * CompanySection - Seccion de datos de la compania
 *
 * PASO 2 del flujo en cascada (modo NUEVA)
 *
 * TRES ESTADOS VISUALES (segun especificacion):
 * 1. ESCRIBIENDO: Usuario escribiendo texto libre (borde normal)
 * 2. NUEVO: Compania no encontrada en BD, se creara nueva (borde amarillo/naranja)
 * 3. SELECCIONADO: Compania existente seleccionada de la lista (borde verde)
 *
 * Al seleccionar compania existente:
 * - Auto-poblar issuerTypeCode y sectorGICS
 * - Marcar campos como readOnly
 *
 * Al crear compania nueva:
 * - Habilitar edicion de issuerTypeCode y sectorGICS
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  Alert,
  Box,
  TextField as MuiTextField,
  Paper,
  List,
  ListItem,
  ListItemText,
  CircularProgress,
  Typography,
  Chip,
  alpha,
} from '@mui/material';
import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import { FormSection, FormRow } from '../layout';
import { SelectField } from '../fields';
import { api } from '../../services/api';
import { colors } from '../../styles/theme';

// Estados de la compania (exportar para uso externo)
export const COMPANY_STATES = {
  WRITING: 'writing',
  NEW: 'new',
  SELECTED: 'selected',
};

// Estilos segun estado (usando tokens del tema)
const getCompanyInputStyles = (state) => {
  switch (state) {
    case COMPANY_STATES.NEW:
      return {
        '& .MuiOutlinedInput-root': {
          backgroundColor: alpha(colors.warning.main, 0.08),
          '& fieldset': { borderColor: colors.warning.main, borderWidth: 2 },
          '&:hover fieldset': { borderColor: colors.warning.dark },
          '&.Mui-focused fieldset': { borderColor: colors.warning.main },
        },
      };
    case COMPANY_STATES.SELECTED:
      return {
        '& .MuiOutlinedInput-root': {
          backgroundColor: alpha(colors.success.main, 0.08),
          '& fieldset': { borderColor: colors.success.main, borderWidth: 2 },
          '&:hover fieldset': { borderColor: colors.success.dark },
          '&.Mui-focused fieldset': { borderColor: colors.success.main },
        },
      };
    default:
      return {};
  }
};

const CompanySection = ({
  formData,
  handleChange,
  isFieldReadOnly,
  populateFromCompany,
  options,
  formErrors,
  mode,
  onCompanyStateChange, // Callback para notificar cambios de estado al padre
}) => {
  // Estado interno del componente
  const [companyState, setCompanyStateInternal] = useState(COMPANY_STATES.WRITING);

  // Wrapper para notificar al padre cuando cambia el estado
  const setCompanyState = useCallback((newState) => {
    setCompanyStateInternal(newState);
    if (onCompanyStateChange) {
      onCompanyStateChange(newState);
    }
  }, [onCompanyStateChange]);
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState(null);

  // Ref para trackear el último nombre de compañía verificado (evita loops)
  const lastVerifiedCompanyRef = useRef(null);

  // Ref para obtener el estado actual de companyState (evita closures stale)
  const companyStateRef = useRef(companyState);
  useEffect(() => {
    companyStateRef.current = companyState;
  }, [companyState]);

  // Ref para obtener el valor actual de selectedCompany (evita closures stale)
  const selectedCompanyRef = useRef(selectedCompany);
  useEffect(() => {
    selectedCompanyRef.current = selectedCompany;
  }, [selectedCompany]);

  // Ref para obtener el valor actual de formData.companyName (evita closures stale)
  const companyNameRef = useRef(formData.companyName);
  useEffect(() => {
    companyNameRef.current = formData.companyName;
  }, [formData.companyName]);

  // Refs
  const debounceRef = useRef(null);
  const containerRef = useRef(null);

  // Limpiar timeout al desmontar
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  // Efecto para resetear estado cuando formData.companyName cambia externamente
  // (por ejemplo, al limpiar el formulario o seleccionar otro item de la cola)
  useEffect(() => {
    const currentName = formData.companyName?.trim().toLowerCase() || '';
    const selectedName = selectedCompany?.companyName?.trim().toLowerCase() || '';

    // Si el nombre cambió y no coincide con la compañía seleccionada, resetear estado
    if (currentName && selectedName && currentName !== selectedName) {
      // El nombre cambió respecto a la compañía seleccionada
      setSelectedCompany(null);
      setCompanyState(COMPANY_STATES.WRITING);
      lastVerifiedCompanyRef.current = null;
    } else if (!currentName && companyState !== COMPANY_STATES.WRITING) {
      // Se limpió el campo, volver a estado inicial
      setSelectedCompany(null);
      setCompanyState(COMPANY_STATES.WRITING);
      lastVerifiedCompanyRef.current = null;
    }
  }, [formData.companyName, selectedCompany, companyState, setCompanyState]);

  // Auto-fill Fund defaults
  useEffect(() => {
    if (formData.investmentTypeCode === 6 && mode === 'nueva') {
      (async () => {
        try {
          const monedaRes = await api.catalogos.getMonedaById(formData.moneda);
          
          if (monedaRes.success) {
            // Always enforce these defaults for Fund, even if company was selected
            handleChange({ target: { name: 'issuerTypeCode', value: '0' } });
            handleChange({ target: { name: 'sectorGICS', value: '66666666' } });
            handleChange({ target: { name: 'riskCountry', value: '[Fund]' } });
            handleChange({ target: { name: 'issueCurrency', value: monedaRes.data.nombre } });
            handleChange({ target: { name: 'riskCurrency', value: monedaRes.data.nombre } });
          }
        } catch (error) {
          console.error('Error setting Fund defaults:', error);
        }
      })();
    }
  }, [formData.investmentTypeCode, mode, formData.moneda, formData.companyName, handleChange]);
  
  // Cerrar sugerencias al hacer click fuera
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Buscar companias
  const searchCompanies = useCallback(async (searchText) => {
    if (!searchText || searchText.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    setLoading(true);
    try {
      const response = await api.companias.search(searchText);
      const results = response.success ? response.data : [];
      setSuggestions(results);
      setShowSuggestions(results.length > 0);
    } catch (error) {
      console.error('Error buscando companias:', error);
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Manejar cambio en el input de companyName
  const handleCompanyNameChange = useCallback((e) => {
    const { value } = e.target;

    // Crear evento sintetico para handleChange
    handleChange({
      target: { name: 'companyName', value, type: 'text' },
    });

    // Si estaba seleccionada una compania y el usuario edita, volver a estado WRITING
    // Usar comparación case-insensitive para evitar falsos positivos
    if (selectedCompany && value.trim().toLowerCase() !== selectedCompany.companyName?.trim().toLowerCase()) {
      setSelectedCompany(null);
      setCompanyState(COMPANY_STATES.WRITING);
      lastVerifiedCompanyRef.current = null;
    }

    // Cancelar busqueda anterior
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // Nueva busqueda con debounce
    debounceRef.current = setTimeout(() => {
      searchCompanies(value);
    }, 300);
  }, [selectedCompany, handleChange, searchCompanies]);

  // Seleccionar compania de la lista
  const handleSelectCompany = useCallback((company) => {
    setSelectedCompany(company);
    setCompanyState(COMPANY_STATES.SELECTED);
    setShowSuggestions(false);
    setSuggestions([]);
    // Marcar como verificada para evitar re-verificación en blur
    lastVerifiedCompanyRef.current = company.companyName?.trim().toLowerCase() || null;

    // Usar populateFromCompany para auto-poblar
    if (populateFromCompany) {
      populateFromCompany(company, company.companyName);
    }
  }, [populateFromCompany, setCompanyState]);

  // Confirmar como compania nueva
  const handleConfirmNewCompany = useCallback(() => {
    if (formData.companyName && formData.companyName.trim()) {
      setCompanyState(COMPANY_STATES.NEW);
      setSelectedCompany(null);
      setShowSuggestions(false);
      // Marcar como verificada para evitar re-verificación
      lastVerifiedCompanyRef.current = formData.companyName.trim().toLowerCase();
    }
  }, [formData.companyName, setCompanyState]);

  // Verificar si compania existe (funcion auxiliar)
  const checkExactCompany = useCallback(async (companyName) => {
    try {
      const response = await api.companias.getExacta(companyName);
      if (response.success && response.data) {
        // Compania encontrada exacta - seleccionarla automaticamente
        const company = response.data;
        setSelectedCompany(company);
        setCompanyState(COMPANY_STATES.SELECTED);
        // Marcar como verificada
        lastVerifiedCompanyRef.current = company.companyName?.trim().toLowerCase() || null;
        // Auto-poblar campos
        if (populateFromCompany) {
          populateFromCompany(company, company.companyName);
        }
        return true;
      }
    } catch (error) {
      console.error('Error verificando compania:', error);
    }
    return false;
  }, [populateFromCompany, setCompanyState]);

  // Manejar blur del campo
  const handleBlur = useCallback(() => {
    // Delay para permitir click en sugerencia y que se complete handleSelectCompany
    const timeoutId = setTimeout(async () => {
      setShowSuggestions(false);

      // IMPORTANTE: Usar REFS para obtener el estado ACTUAL después del timeout
      // porque handleSelectCompany puede haber cambiado el estado durante el delay
      // Los valores del closure estarían desactualizados
      const currentCompanyState = companyStateRef.current;
      const currentSelectedCompany = selectedCompanyRef.current;
      const alreadyVerified = lastVerifiedCompanyRef.current;
      // Usar el ref para obtener el valor actual del nombre
      const currentCompanyName = companyNameRef.current || '';
      const currentNameLower = currentCompanyName.trim().toLowerCase();

      // Si ya se verificó este nombre (sea porque se seleccionó de la lista o porque
      // ya se hizo la verificación exacta), no hacer nada
      if (alreadyVerified === currentNameLower) {
        return;
      }

      // Si ya hay una compañía seleccionada (el usuario hizo click en una sugerencia), no verificar
      if (currentCompanyState === COMPANY_STATES.SELECTED || currentSelectedCompany) {
        return;
      }

      // Solo verificar si estamos en estado WRITING y hay texto
      if (currentCompanyState === COMPANY_STATES.WRITING && currentNameLower) {
        lastVerifiedCompanyRef.current = currentNameLower;
        // Usar el valor actual del ref, no el del closure
        const found = await checkExactCompany(currentCompanyName);
        if (!found) {
          // No existe - marcar como nueva
          setCompanyState(COMPANY_STATES.NEW);
        }
      }
    }, 300); // Delay para dar tiempo a handleSelectCompany

    return () => clearTimeout(timeoutId);
  }, [checkExactCompany, setCompanyState]);

  // Manejar focus en el campo
  const handleFocus = useCallback(() => {
    if (suggestions.length > 0 && !selectedCompany) {
      setShowSuggestions(true);
    }
  }, [suggestions.length, selectedCompany]);

  // Determinar si issuerTypeCode y sectorGICS son editables
  const areRelatedFieldsEditable = useCallback(() => {
    // En modo exacta, siempre readonly
    if (mode === 'exacta') return false;
    // Si hay compania seleccionada de BD, readonly
    if (companyState === COMPANY_STATES.SELECTED) return false;
    // En otros casos, editable
    return true;
  }, [mode, companyState]);

  // Obtener mensaje de estado
  const getStateMessage = useCallback(() => {
    switch (companyState) {
      case COMPANY_STATES.NEW:
        return 'Nueva compania - Se creara al guardar';
      case COMPANY_STATES.SELECTED:
        return 'Compania existente seleccionada';
      default:
        return loading ? 'Buscando...' : 'Escriba para buscar companias existentes';
    }
  }, [companyState, loading]);

  // Obtener error de un campo
  const getError = useCallback((fieldName) => {
    return formErrors && formErrors[fieldName] ? formErrors[fieldName] : null;
  }, [formErrors]);

  // Solo visible si hay investmentTypeCode seleccionado
  if (!formData.investmentTypeCode) {
    return null;
  }

  // Mensaje de paso para modo NUEVA
  const isNuevaMode = mode === 'nueva';

  return (
    <FormSection
      title="Datos de la Compania"
      icon={<BusinessOutlinedIcon color="primary" />}
      collapsible
      defaultExpanded
    >
      {/* Mensaje de progreso para modo NUEVA */}
      {isNuevaMode && (
        <Box sx={{ mb: 2 }}>
          <Alert severity="info" sx={{ py: 0.5 }}>
            Paso 2: Ingrese los datos de la compania.
          </Alert>
        </Box>
      )}

      {/* Campo companyName con autocompletado personalizado */}
      <FormRow>
        <Box ref={containerRef} sx={{ position: 'relative', flex: 2, minWidth: 400 }}>
          <MuiTextField
            name="companyName"
            label="Nombre de la Compania"
            value={formData.companyName || ''}
            onChange={handleCompanyNameChange}
            onBlur={handleBlur}
            onFocus={handleFocus}
            disabled={isFieldReadOnly('companyName') || [3, 4, 5].includes(formData.investmentTypeCode)}
            error={!!getError('companyName')}
            helperText={getError('companyName') || getStateMessage()}
            required
            fullWidth
            size="small"
            placeholder="Escriba para buscar companias..."
            sx={getCompanyInputStyles(companyState)}
            InputProps={{
              endAdornment: (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  {loading && <CircularProgress size={20} />}
                  {companyState === COMPANY_STATES.SELECTED && (
                    <CheckCircleOutlinedIcon color="success" fontSize="small" />
                  )}
                  {companyState === COMPANY_STATES.NEW && (
                    <AddCircleOutlineIcon color="warning" fontSize="small" />
                  )}
                </Box>
              ),
            }}
          />

          {/* Lista de sugerencias */}
          {showSuggestions && suggestions.length > 0 && (
            <Paper
              elevation={3}
              sx={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                maxHeight: 250,
                overflow: 'auto',
                zIndex: 1000,
                mt: 0.5,
              }}
            >
              <List dense>
                {suggestions.map((company, index) => (
                  <ListItem
                    key={company.id || index}
                    onClick={() => handleSelectCompany(company)}
                    sx={{
                      cursor: 'pointer',
                      '&:hover': { backgroundColor: alpha(colors.primary.main, 0.08) },
                    }}
                  >
                    <ListItemText
                      primary={company.companyName}
                      secondary={
                        <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
                          {company.issuerTypeCode && (
                            <Chip
                              label={`Emisor: ${company.issuerTypeCode}`}
                              size="small"
                              variant="outlined"
                            />
                          )}
                          {company.sectorGICS && (
                            <Chip
                              label={`GICS: ${company.sectorGICS}`}
                              size="small"
                              variant="outlined"
                            />
                          )}
                        </Box>
                      }
                    />
                  </ListItem>
                ))}
              </List>

              {/* Opcion para crear nueva */}
              <Box
                sx={{
                  p: 1,
                  borderTop: `1px solid ${colors.border.light}`,
                  backgroundColor: alpha(colors.warning.main, 0.08),
                  cursor: 'pointer',
                  '&:hover': { backgroundColor: alpha(colors.warning.main, 0.16) },
                }}
                onClick={handleConfirmNewCompany}
              >
                <Typography variant="body2" color="warning.dark">
                  <AddCircleOutlineIcon fontSize="small" sx={{ verticalAlign: 'middle', mr: 0.5 }} />
                  Crear nueva compania: "{formData.companyName}"
                </Typography>
              </Box>
            </Paper>
          )}

          {/* Mostrar opcion de crear nueva si no hay sugerencias */}
          {showSuggestions && suggestions.length === 0 && formData.companyName && formData.companyName.length >= 2 && !loading && (
            <Paper
              elevation={3}
              sx={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                zIndex: 1000,
                mt: 0.5,
              }}
            >
              <Box
                sx={{
                  p: 2,
                  backgroundColor: alpha(colors.warning.main, 0.08),
                  cursor: 'pointer',
                  '&:hover': { backgroundColor: alpha(colors.warning.main, 0.16) },
                }}
                onClick={handleConfirmNewCompany}
              >
                <Typography variant="body2" color="warning.dark">
                  <AddCircleOutlineIcon fontSize="small" sx={{ verticalAlign: 'middle', mr: 0.5 }} />
                  No se encontraron coincidencias. Crear nueva compania: "{formData.companyName}"
                </Typography>
              </Box>
            </Paper>
          )}
        </Box>

        {/* Tipo de Emisor - Solo visible cuando hay companyName */}
        {(formData.companyName || mode === 'exacta' || mode === 'parcial') && (
          <SelectField
            name="issuerTypeCode"
            label="Tipo de Emisor"
            value={formData.issuerTypeCode}
            onChange={handleChange}
            options={options?.issuerTypes || []}
            readOnly={isFieldReadOnly('issuerTypeCode') || !areRelatedFieldsEditable() || [3, 4, 5, 6].includes(formData.investmentTypeCode)}
            error={getError('issuerTypeCode')}
            width="md"
            helperText={companyState === COMPANY_STATES.SELECTED ? 'Auto-poblado de compania' : undefined}
          />
        )}
      </FormRow>

      {/* Sector GICS - Solo visible cuando hay companyName */}
      {(formData.companyName || mode === 'exacta' || mode === 'parcial') && (
        <FormRow>
          <SelectField
            name="sectorGICS"
            label="Sector GICS"
            value={formData.sectorGICS}
            onChange={handleChange}
            options={options?.sectoresGICS || []}
            readOnly={isFieldReadOnly('sectorGICS') || !areRelatedFieldsEditable() || [3, 4, 5, 6].includes(formData.investmentTypeCode)}
            error={getError('sectorGICS')}
            width="flex1"
            helperText={companyState === COMPANY_STATES.SELECTED ? 'Auto-poblado de compania' : undefined}
          />
        </FormRow>
      )}

      {/* Indicador de estado de compania */}
      {companyState !== COMPANY_STATES.WRITING && (
        <Box sx={{ mt: 1 }}>
          {companyState === COMPANY_STATES.SELECTED && (
            <Chip
              icon={<CheckCircleOutlinedIcon />}
              label={`Compania existente: ${selectedCompany?.companyName || formData.companyName}`}
              color="success"
              variant="outlined"
              size="small"
            />
          )}
          {companyState === COMPANY_STATES.NEW && (
            <Chip
              icon={<AddCircleOutlineIcon />}
              label="Nueva compania - Los datos se guardaran junto con el instrumento"
              color="warning"
              variant="outlined"
              size="small"
            />
          )}
        </Box>
      )}
    </FormSection>
  );
};

export default CompanySection;
