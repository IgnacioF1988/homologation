/**
 * instrumentMapping.js - Utilidades compartidas para mapeo de instrumentos
 *
 * Este módulo contiene funciones para mapear registros de instrumentos encontrados
 * en la base de datos a los campos del formulario. Se utiliza en diferentes contextos:
 *
 * - useInstrumentLookup.js: Hook de búsqueda de instrumentos
 * - SearchHelper.jsx: Componente de búsqueda y ayuda
 * - InstrumentForm.jsx: Formulario principal de instrumentos
 *
 * MODOS DE MAPEO:
 * 1. EXACTA (mapRegistroCompleto): Hereda TODOS los campos cuando ID + Moneda coinciden
 * 2. PARCIAL (mapRegistroSinMonedas): Hereda campos excepto issueCurrency y riskCurrency
 * 3. REESTRUCTURACION (mapRegistroParaReestructuracion): Hereda campos excepto params FI
 * 4. NUEVA (getClearFields): Todos los campos vacíos para nuevo instrumento
 */

/**
 * Retorna un objeto con todos los campos del formulario vacíos
 * Se usa cuando no hay registro encontrado (MODO NUEVA) o al limpiar el formulario
 *
 * @returns {Object} Objeto con todos los campos vacíos
 *
 * @example
 * // Limpiar formulario cuando cambia a modo NUEVA
 * const camposVacios = getClearFields();
 * setFields(camposVacios);
 */
export function getClearFields() {
  return {
    // Identificadores - limpiar
    nameInstrumento: '',
    publicDataSource: '',
    isin: '',
    tickerBBG: '',
    sedol: '',
    cusip: '',

    // Compania - limpiar
    companyName: '',
    issuerTypeCode: '',
    sectorGICS: '',

    // Clasificacion - limpiar
    investmentTypeCode: '',
    issueTypeCode: '',
    sectorChileTypeCode: '',

    // Geografia - limpiar
    issueCountry: '',
    riskCountry: '',
    issueCurrency: '',
    riskCurrency: '',
    emisionNacional: '',

    // Parametros FI - limpiar
    couponTypeCode: '',
    yieldType: '',
    yieldSource: '',
    perpetuidad: '',
    rendimiento: '',
    couponFrequency: '',
    coco: '',
    callable: '',
    sinkable: '',
    yasYldFlag: '',

    // Otros - limpiar
    rankCode: '',
    cashTypeCode: '',
    bankDebtTypeCode: '',
    fundTypeCode: '',
    comentarios: '',
  };
}

/**
 * Mapea un registro completo de la base de datos a los campos del formulario
 * Se usa en MODO EXACTA cuando idInstrumento + moneda coinciden exactamente
 *
 * Hereda TODOS los campos del registro encontrado, incluyendo:
 * - Identificadores (name, isin, ticker, etc.)
 * - Compañía (companyName, issuerType, sector)
 * - Clasificación (investmentType, issueType, sectorChile)
 * - Geografía (countries, currencies, emisionNacional)
 * - Parámetros FI completos (coupon, yield, perpetuidad, callable, etc.)
 * - Otros (rank, cashType, bankDebt, fundType, comentarios)
 *
 * @param {Object} registro - Registro de instrumento de la BD
 * @returns {Object} Objeto con todos los campos mapeados
 *
 * @example
 * // MODO EXACTA: ID=123, Moneda=1 coincide con registro en BD
 * const registro = await api.instrumentos.getById(123);
 * const campos = mapRegistroCompleto(registro);
 * setFields(campos);
 */
export function mapRegistroCompleto(registro) {
  return {
    // Identificadores - heredar todos
    nameInstrumento: registro.nameInstrumento || '',
    publicDataSource: registro.publicDataSource || '',
    isin: registro.isin || '',
    tickerBBG: registro.tickerBBG || '',
    sedol: registro.sedol || '',
    cusip: registro.cusip || '',

    // Compania
    companyName: registro.companyName || '',
    issuerTypeCode: registro.issuerTypeCode || '',
    sectorGICS: registro.sectorGICS || '',

    // Clasificacion
    investmentTypeCode: registro.investmentTypeCode || '',
    issueTypeCode: registro.issueTypeCode || '',
    sectorChileTypeCode: registro.sectorChileTypeCode || '',

    // Geografia - heredar todos los campos
    issueCountry: registro.issueCountry || '',
    riskCountry: registro.riskCountry || '',
    issueCurrency: registro.issueCurrency || '',
    riskCurrency: registro.riskCurrency || '',
    emisionNacional: registro.emisionNacional || '',

    // Parametros FI
    couponTypeCode: registro.couponTypeCode || '',
    yieldType: registro.yieldType || '',
    yieldSource: registro.yieldSource || '',
    perpetuidad: registro.perpetuidad || '',
    rendimiento: registro.rendimiento || '',
    couponFrequency: registro.couponFrequency || '',
    coco: registro.coco || '',
    callable: registro.callable || '',
    sinkable: registro.sinkable || '',
    yasYldFlag: registro.yasYldFlag || '',

    // Otros
    rankCode: registro.rankCode || '',
    cashTypeCode: registro.cashTypeCode || '',
    bankDebtTypeCode: registro.bankDebtTypeCode || '',
    fundTypeCode: registro.fundTypeCode || '',
    comentarios: registro.comentarios || '',
  };
}

/**
 * Mapea un registro excluyendo los campos de moneda
 * Se usa en MODO PARCIAL cuando idInstrumento existe pero moneda es diferente
 *
 * Hereda todos los campos EXCEPTO:
 * - issueCurrency (debe completarse manualmente)
 * - riskCurrency (debe completarse manualmente)
 *
 * Esto permite al operador definir las monedas correctas para la nueva
 * combinación ID + Moneda mientras reutiliza el resto de la información
 *
 * @param {Object} registro - Registro de instrumento de la BD
 * @returns {Object} Objeto con campos mapeados excepto monedas
 *
 * @example
 * // MODO PARCIAL: ID=123 existe pero con Moneda=1, operador quiere Moneda=2
 * const registro = await api.instrumentos.getById(123);
 * const campos = mapRegistroSinMonedas(registro);
 * // campos.issueCurrency === ''
 * // campos.riskCurrency === ''
 * setFields(campos);
 */
export function mapRegistroSinMonedas(registro) {
  const campos = mapRegistroCompleto(registro);
  // En modo parcial, las monedas se dejan vacias para que el operador las complete
  campos.issueCurrency = '';
  campos.riskCurrency = '';
  return campos;
}

/**
 * Mapea un registro para reestructuración
 * Se usa cuando esReestructuracion=true y se busca el predecesor
 *
 * Hereda la mayoría de campos EXCEPTO parámetros FI que deben completarse manualmente:
 *
 * CAMPOS QUE SÍ SE HEREDAN:
 * - Identificadores (name, publicDataSource, isin, ticker, sedol, cusip)
 * - Compañía (companyName, issuerType, sectorGICS)
 * - Clasificación (investmentType, issueType, sectorChile)
 * - Geografía (countries, currencies, emisionNacional)
 * - Algunos parámetros FI básicos (couponTypeCode, yieldType, yieldSource)
 * - Otros (rankCode, cashTypeCode, bankDebtTypeCode, fundTypeCode)
 *
 * CAMPOS QUE NO SE HEREDAN (operador debe completar):
 * - perpetuidad
 * - rendimiento
 * - couponFrequency
 * - coco
 * - callable
 * - sinkable
 * - yasYldFlag
 * - tipoContinuador
 * - diaValidez
 * - comentarios
 *
 * @param {Object} registro - Registro del instrumento predecesor
 * @returns {Object} Objeto con campos mapeados para reestructuración
 *
 * @example
 * // REESTRUCTURACION: Buscar predecesor ID=100, Moneda=1
 * const predecesor = await api.instrumentos.getByIdAndMoneda(100, 1);
 * const campos = mapRegistroParaReestructuracion(predecesor);
 * // Hereda identificadores, clasificación, geo
 * // NO hereda perpetuidad, rendimiento, couponFrequency, etc.
 * setFields(campos);
 */
export function mapRegistroParaReestructuracion(registro) {
  return {
    // Identificadores - heredar todos
    nameInstrumento: registro.nameInstrumento || '',
    publicDataSource: registro.publicDataSource || '',
    isin: registro.isin || '',
    tickerBBG: registro.tickerBBG || '',
    sedol: registro.sedol || '',
    cusip: registro.cusip || '',

    // Compania - heredar
    companyName: registro.companyName || '',
    issuerTypeCode: registro.issuerTypeCode || '',
    sectorGICS: registro.sectorGICS || '',

    // Clasificacion - heredar
    investmentTypeCode: registro.investmentTypeCode || '',
    issueTypeCode: registro.issueTypeCode || '',
    sectorChileTypeCode: registro.sectorChileTypeCode || '',

    // Geografia - heredar todos los campos
    issueCountry: registro.issueCountry || '',
    riskCountry: registro.riskCountry || '',
    issueCurrency: registro.issueCurrency || '',
    riskCurrency: registro.riskCurrency || '',
    emisionNacional: registro.emisionNacional || '',

    // Parametros FI - PARCIALMENTE heredados segun especificacion
    // Estos SI se heredan:
    couponTypeCode: registro.couponTypeCode || '',
    yieldType: registro.yieldType || '',
    yieldSource: registro.yieldSource || '',

    // Estos NO se heredan (el operador debe completarlos manualmente):
    perpetuidad: '',
    rendimiento: '',
    couponFrequency: '',
    coco: '',
    callable: '',
    sinkable: '',
    yasYldFlag: '',

    // Campos de reestructuracion - NO heredar, el operador debe completarlos
    tipoContinuador: '', // El usuario debe seleccionar Continuador Directo o Indirecto
    diaValidez: '', // El usuario debe ingresar la fecha

    // Otros - heredar
    rankCode: registro.rankCode || '',
    cashTypeCode: registro.cashTypeCode || '',
    bankDebtTypeCode: registro.bankDebtTypeCode || '',
    fundTypeCode: registro.fundTypeCode || '',
    comentarios: '', // Comentarios no se heredan
  };
}
