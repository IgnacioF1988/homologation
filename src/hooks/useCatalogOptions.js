/**
 * useCatalogOptions - Hook para cargar opciones de catalogos
 * Centraliza la carga de todos los dropdowns del formulario
 */

import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';

const useCatalogOptions = () => {
  const [options, setOptions] = useState({
    paises: [],
    monedas: [],
    fuentes: [],
    sectoresGICS: [],
    sectorChile: [],
    investmentTypes: [],
    issuerTypes: [],
    issueTypes: [],
    couponTypes: [],
    couponFrequencies: [],
    yieldTypes: [],
    yieldSources: [],
    rankCodes: [],
    dataSources: [],
    // Nuevos catálogos
    booleanValues: [],
    cashTypes: [],
    bankDebtTypes: [],
    fundTypes: [],
    tiposContinuador: [],
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Cargar todas las opciones al montar
  useEffect(() => {
    const loadAllOptions = async () => {
      setLoading(true);
      setError(null);

      try {
        const [
          paisesRes,
          monedasRes,
          fuentesRes,
          sectoresGICSRes,
          sectorChileRes,
          investmentTypesRes,
          issuerTypesRes,
          issueTypesRes,
          couponTypesRes,
          couponFrequenciesRes,
          yieldTypesRes,
          yieldSourcesRes,
          rankCodesRes,
          dataSourcesRes,
          // Nuevos catálogos
          booleanValuesRes,
          cashTypesRes,
          bankDebtTypesRes,
          fundTypesRes,
          tiposContinuadorRes,
        ] = await Promise.all([
          api.catalogos.getPaisesOptions(),
          api.catalogos.getMonedasOptions(),
          api.catalogos.getFuentesOptions(),
          api.catalogos.getSectoresGICSOptions(),
          api.catalogos.getSectorChileOptions(),
          api.catalogos.getInvestmentTypesOptions(),
          api.catalogos.getIssuerTypesOptions(),
          api.catalogos.getIssueTypesOptions(),
          api.catalogos.getCouponTypesOptions(),
          api.catalogos.getCouponFrequenciesOptions(),
          api.catalogos.getYieldTypesOptions(),
          api.catalogos.getYieldSourcesOptions(),
          api.catalogos.getRankCodesOptions(),
          api.catalogos.getDataSourcesOptions(),
          // Nuevos catálogos
          api.catalogos.getBooleanValuesOptions(),
          api.catalogos.getCashTypesOptions(),
          api.catalogos.getBankDebtTypesOptions(),
          api.catalogos.getFundTypesOptions(),
          api.catalogos.getTiposContinuadorOptions(),
        ]);

        setOptions({
          paises: paisesRes.data || [],
          monedas: monedasRes.data || [],
          fuentes: fuentesRes.data || [],
          sectoresGICS: sectoresGICSRes.data || [],
          sectorChile: sectorChileRes.data || [],
          investmentTypes: investmentTypesRes.data || [],
          issuerTypes: issuerTypesRes.data || [],
          issueTypes: issueTypesRes.data || [],
          couponTypes: couponTypesRes.data || [],
          couponFrequencies: couponFrequenciesRes.data || [],
          yieldTypes: yieldTypesRes.data || [],
          yieldSources: yieldSourcesRes.data || [],
          rankCodes: rankCodesRes.data || [],
          dataSources: dataSourcesRes.data || [],
          // Nuevos catálogos
          booleanValues: booleanValuesRes.data || [],
          cashTypes: cashTypesRes.data || [],
          bankDebtTypes: bankDebtTypesRes.data || [],
          fundTypes: fundTypesRes.data || [],
          tiposContinuador: tiposContinuadorRes.data || [],
        });
      } catch (err) {
        setError(err.message || 'Error al cargar catalogos');
        console.error('Error cargando catalogos:', err);
      } finally {
        setLoading(false);
      }
    };

    loadAllOptions();
  }, []);

  // Obtener opciones de un catalogo especifico
  const getOptions = useCallback((catalogName) => {
    return options[catalogName] || [];
  }, [options]);

  // Recargar un catalogo especifico
  const reloadCatalog = useCallback(async (catalogName) => {
    const methodName = `get${catalogName.charAt(0).toUpperCase() + catalogName.slice(1)}Options`;

    if (api.catalogos[methodName]) {
      try {
        const response = await api.catalogos[methodName]();
        if (response.success) {
          setOptions(prev => ({
            ...prev,
            [catalogName]: response.data,
          }));
        }
      } catch (err) {
        console.error(`Error recargando ${catalogName}:`, err);
      }
    }
  }, []);

  // Buscar label por valor en un catalogo
  const findLabel = useCallback((catalogName, value) => {
    const catalogOptions = options[catalogName] || [];
    const option = catalogOptions.find(opt => opt.value === value);
    return option?.label || value;
  }, [options]);

  return {
    // Estado - options contiene todos los catálogos, usar options.paises, options.monedas, etc.
    options,
    loading,
    error,

    // Funciones
    getOptions,
    reloadCatalog,
    findLabel,
  };
};

export default useCatalogOptions;
