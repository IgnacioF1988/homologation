/**
 * SandboxWriterService - Servicio dedicado para escritura en tablas sandbox
 *
 * Extraido de TrackingService para separar responsabilidades.
 * Conoce la estructura de cada tabla sandbox y sus parsers.
 *
 * TABLAS MANEJADAS:
 * - sandbox.Homologacion_Instrumentos (codigo 6)
 * - sandbox.Homologacion_Fondos (codigo 10)
 * - sandbox.Homologacion_Monedas (codigo 11)
 * - sandbox.Homologacion_Benchmarks (codigo 12)
 * - sandbox.Alertas_Descuadre_Cash (codigo 7)
 * - sandbox.Alertas_Descuadre_Derivados (codigo 8)
 * - sandbox.Alertas_Descuadre_NAV (codigo 9)
 * - sandbox.Alertas_Suciedades_IPA (codigo 5)
 * - sandbox.Fondos_Problema
 *
 * @module services/sandbox/SandboxWriterService
 */

const sql = require('mssql');

class SandboxWriterService {
  /**
   * Constructor
   * @param {object} pool - Pool de conexiones SQL Server
   */
  constructor(pool) {
    if (!pool) {
      throw new Error('SandboxWriterService requiere un pool de conexiones valido');
    }
    this.pool = pool;
  }

  // =============================================
  // METODO PRINCIPAL - ESCRIBIR POR CODIGO
  // =============================================

  /**
   * Escribe datos a sandbox segun codigo de stand-by
   * @param {number} codigoStandBy - Codigo (5-12)
   * @param {number} idEjecucion - ID de la ejecucion
   * @param {object} data - Datos del evento standby:activado
   * @param {object} transaction - Transaccion SQL opcional
   */
  async escribirPorCodigo(codigoStandBy, idEjecucion, data, transaction = null) {
    const homologData = data.detalles?.homologacionData || [];

    switch (codigoStandBy) {
      case 5: // SUCIEDADES
        await this.escribirSuciedades(idEjecucion, data, transaction);
        break;
      case 6: // HOMOLOGACION_INSTRUMENTOS
        await this.escribirHomologacionInstrumentos(idEjecucion, homologData, transaction);
        break;
      case 7: // DESCUADRES_CAPM (Cash)
        await this.escribirDescuadreCash(idEjecucion, data, transaction);
        break;
      case 8: // DESCUADRES_DERIVADOS
        await this.escribirDescuadreDerivados(idEjecucion, data, transaction);
        break;
      case 9: // DESCUADRES_NAV
        await this.escribirDescuadreNAV(idEjecucion, data, transaction);
        break;
      case 10: // HOMOLOGACION_FONDOS
        await this.escribirHomologacionFondos(idEjecucion, homologData, transaction);
        break;
      case 11: // HOMOLOGACION_MONEDAS
        await this.escribirHomologacionMonedas(idEjecucion, homologData, transaction);
        break;
      case 12: // HOMOLOGACION_BENCHMARKS
        await this.escribirHomologacionBenchmarks(idEjecucion, homologData, transaction);
        break;
    }
  }

  // =============================================
  // HOMOLOGACION
  // =============================================

  /**
   * Escribe instrumentos sin homologar - Codigo 6
   */
  async escribirHomologacionInstrumentos(idEjecucion, homologacionData, transaction = null) {
    if (!homologacionData || homologacionData.length === 0) return;

    const fechaReporte = await this._getFechaReporteFromEjecucion(idEjecucion);
    const fechaProceso = new Date().toISOString();
    const instrumentos = homologacionData.filter(h => h.TipoHomologacion === 'INSTRUMENTO');

    if (instrumentos.length > 0) {
      const conn = transaction || this.pool;
      const values = instrumentos.map(item =>
        `('${fechaReporte}', '${this._escape(item.Item)}', '${item.Source || 'GENEVA'}', '${fechaProceso}', '${this._escape(item.Currency)}')`
      ).join(',\n');

      await conn.request().query(`
        INSERT INTO sandbox.Homologacion_Instrumentos (FechaReporte, Instrumento, Source, FechaProceso, Currency)
        VALUES ${values}
      `);
    }
  }

  /**
   * Escribe fondos sin homologar - Codigo 10
   */
  async escribirHomologacionFondos(idEjecucion, homologacionData, transaction = null) {
    if (!homologacionData || homologacionData.length === 0) return;

    const fechaReporte = await this._getFechaReporteFromEjecucion(idEjecucion);
    const fechaProceso = new Date().toISOString();
    const fondos = homologacionData.filter(h => h.TipoHomologacion === 'FONDO');

    if (fondos.length > 0) {
      const conn = transaction || this.pool;
      const values = fondos.map(item =>
        `('${fechaReporte}', '${this._escape(item.Item)}', '${item.Source || 'GENEVA'}', '${fechaProceso}')`
      ).join(',\n');

      await conn.request().query(`
        INSERT INTO sandbox.Homologacion_Fondos (FechaReporte, Fondo, Source, FechaProceso)
        VALUES ${values}
      `);
    }
  }

  /**
   * Escribe monedas sin homologar - Codigo 11
   */
  async escribirHomologacionMonedas(idEjecucion, homologacionData, transaction = null) {
    if (!homologacionData || homologacionData.length === 0) return;

    const fechaReporte = await this._getFechaReporteFromEjecucion(idEjecucion);
    const fechaProceso = new Date().toISOString();
    const monedas = homologacionData.filter(h => h.TipoHomologacion === 'MONEDA');

    if (monedas.length > 0) {
      const conn = transaction || this.pool;
      const values = monedas.map(item =>
        `('${fechaReporte}', '${this._escape(item.Item)}', '${item.Source || 'GENEVA'}', '${fechaProceso}')`
      ).join(',\n');

      await conn.request().query(`
        INSERT INTO sandbox.Homologacion_Monedas (FechaReporte, Moneda, Source, FechaProceso)
        VALUES ${values}
      `);
    }
  }

  /**
   * Escribe benchmarks sin homologar - Codigo 12
   */
  async escribirHomologacionBenchmarks(idEjecucion, homologacionData, transaction = null) {
    if (!homologacionData || homologacionData.length === 0) return;

    const fechaReporte = await this._getFechaReporteFromEjecucion(idEjecucion);
    const fechaProceso = new Date().toISOString();
    const benchmarks = homologacionData.filter(h => h.TipoHomologacion === 'BENCHMARK');

    if (benchmarks.length > 0) {
      const conn = transaction || this.pool;
      const values = benchmarks.map(item =>
        `('${fechaReporte}', '${this._escape(item.Item)}', '${item.Source || 'GENEVA'}', '${fechaProceso}')`
      ).join(',\n');

      await conn.request().query(`
        INSERT INTO sandbox.Homologacion_Benchmarks (FechaReporte, Benchmark, Source, FechaProceso)
        VALUES ${values}
      `);
    }
  }

  // =============================================
  // DESCUADRES
  // =============================================

  /**
   * Escribe descuadres Cash (CAPM vs IPA) - Codigo 7
   */
  async escribirDescuadreCash(idEjecucion, data, transaction = null) {
    const homologData = data.detalles?.homologacionData || [];
    if (homologData.length === 0) return;

    const fechaReporte = await this._getFechaReporteFromEjecucion(idEjecucion);
    const descuadres = homologData.filter(h => h.TipoHomologacion === 'DESCUADRE');
    const conn = transaction || this.pool;

    for (const item of descuadres) {
      const valores = this._parsearDetalleDescuadreCash(item.Detalle);

      await conn.request()
        .input('FechaReporte', sql.NVarChar(sql.MAX), fechaReporte)
        .input('Portfolio', sql.NVarChar(sql.MAX), item.Item || 'UNKNOWN')
        .input('MVBook_IPA', sql.Float, valores.mvBookIPA)
        .input('MVBook_CAPM', sql.Float, valores.mvBookCAPM)
        .input('Diferencia', sql.Float, valores.diferencia)
        .query(`
          INSERT INTO sandbox.Alertas_Descuadre_Cash
          (FechaReporte, Portfolio, MVBook_IPA, MVBook_CAPM, Diferencia, FechaProceso)
          VALUES (@FechaReporte, @Portfolio, @MVBook_IPA, @MVBook_CAPM, @Diferencia, GETDATE())
        `);
    }
  }

  /**
   * Escribe descuadres Derivados vs IPA - Codigo 8
   */
  async escribirDescuadreDerivados(idEjecucion, data, transaction = null) {
    const homologData = data.detalles?.homologacionData || [];
    if (homologData.length === 0) return;

    const fechaReporte = await this._getFechaReporteFromEjecucion(idEjecucion);
    const descuadres = homologData.filter(h => h.TipoHomologacion === 'DESCUADRE');
    const conn = transaction || this.pool;

    for (const item of descuadres) {
      const valores = this._parsearDetalleDescuadreDerivados(item.Detalle);

      await conn.request()
        .input('FechaReporte', sql.NVarChar(sql.MAX), fechaReporte)
        .input('Portfolio', sql.NVarChar(sql.MAX), item.Item || 'UNKNOWN')
        .input('MVBook_IPA', sql.Float, valores.mvBook)
        .input('MTM_Derivados', sql.Float, valores.mtm)
        .input('Diferencia', sql.Float, valores.diferencia)
        .query(`
          INSERT INTO sandbox.Alertas_Descuadre_Derivados
          (FechaReporte, Portfolio, MVBook_IPA, MTM_Derivados, Diferencia, FechaProceso)
          VALUES (@FechaReporte, @Portfolio, @MVBook_IPA, @MTM_Derivados, @Diferencia, GETDATE())
        `);
    }
  }

  /**
   * Escribe descuadres NAV (Source vs calculado) - Codigo 9
   */
  async escribirDescuadreNAV(idEjecucion, data, transaction = null) {
    const homologData = data.detalles?.homologacionData || [];
    if (homologData.length === 0) return;

    const fechaReporte = await this._getFechaReporteFromEjecucion(idEjecucion);
    const descuadres = homologData.filter(h => h.TipoHomologacion === 'DESCUADRE');
    const conn = transaction || this.pool;

    for (const item of descuadres) {
      const valores = this._parsearDetalleDescuadreNAV(item.Detalle);

      await conn.request()
        .input('FechaReporte', sql.NVarChar(sql.MAX), fechaReporte)
        .input('Portfolio', sql.NVarChar(sql.MAX), item.Item || 'UNKNOWN')
        .input('NAV_Source', sql.Float, valores.navSource)
        .input('NAV_Calculado', sql.Float, valores.navCalculado)
        .input('Diferencia', sql.Float, valores.diferencia)
        .input('DiferenciaPct', sql.Float, valores.diferenciaPct)
        .query(`
          INSERT INTO sandbox.Alertas_Descuadre_NAV
          (FechaReporte, Portfolio, NAV_Source, NAV_Calculado, Diferencia, DiferenciaPct, FechaProceso)
          VALUES (@FechaReporte, @Portfolio, @NAV_Source, @NAV_Calculado, @Diferencia, @DiferenciaPct, GETDATE())
        `);
    }
  }

  // =============================================
  // SUCIEDADES
  // =============================================

  /**
   * Escribe suciedades - Codigo 5
   */
  async escribirSuciedades(idEjecucion, data, transaction = null) {
    const homologData = data.detalles?.homologacionData || [];
    if (homologData.length === 0) return;

    const conn = transaction || this.pool;

    // Obtener FechaReporte y Portfolio desde el proceso
    const infoResult = await conn.request()
      .input('idEjecucion', sql.BigInt, idEjecucion)
      .query(`
        SELECT CONVERT(VARCHAR(10), p.FechaReporte, 120) AS FechaReporte,
               e.Portfolio_Geneva AS Portfolio
        FROM logs.Ejecuciones e
        INNER JOIN logs.Procesos p ON e.ID_Proceso = p.ID_Proceso
        WHERE e.ID_Ejecucion = @idEjecucion
      `);

    const fechaReporte = infoResult.recordset[0]?.FechaReporte || new Date().toISOString().split('T')[0];
    const portfolio = infoResult.recordset[0]?.Portfolio || data.detalles?.portfolio || 'UNKNOWN';

    // Filtrar solo suciedades
    const suciedades = homologData.filter(h => h.TipoHomologacion === 'SUCIEDAD');

    for (const item of suciedades) {
      const valores = this._parsearDetalleSuciedad(item.Detalle);

      await conn.request()
        .input('FechaReporte', sql.NVarChar(sql.MAX), fechaReporte)
        .input('InvestID', sql.NVarChar(sql.MAX), item.Item || 'UNKNOWN')
        .input('Qty', sql.Float, valores.qty)
        .input('Portfolio', sql.NVarChar(sql.MAX), portfolio)
        .query(`
          INSERT INTO sandbox.Alertas_Suciedades_IPA
          (FechaReporte, InvestID, Qty, FechaProceso, Portfolio)
          VALUES (@FechaReporte, @InvestID, @Qty, GETDATE(), @Portfolio)
        `);
    }
  }

  // =============================================
  // FONDOS PROBLEMA
  // =============================================

  /**
   * Registra un fondo con problema
   */
  async escribirFondoProblema(idEjecucion, idFund, proceso, tipoProblema, transaction = null) {
    const conn = transaction || this.pool;

    // Obtener FechaReporte desde el proceso
    const fechaResult = await conn.request()
      .input('idEjecucion', sql.BigInt, idEjecucion)
      .query(`
        SELECT CONVERT(VARCHAR(10), p.FechaReporte, 120) AS FechaReporte
        FROM logs.Ejecuciones e
        INNER JOIN logs.Procesos p ON e.ID_Proceso = p.ID_Proceso
        WHERE e.ID_Ejecucion = @idEjecucion
      `);

    const fechaReporte = fechaResult.recordset[0]?.FechaReporte || new Date().toISOString().split('T')[0];

    await conn.request()
      .input('FechaReporte', sql.NVarChar(sql.MAX), fechaReporte)
      .input('ID_Fund', sql.Int, idFund)
      .input('Proceso', sql.NVarChar(sql.MAX), proceso)
      .input('Tipo_Problema', sql.NVarChar(sql.MAX), tipoProblema)
      .query(`
        INSERT INTO sandbox.Fondos_Problema
        (FechaReporte, ID_Fund, Proceso, Tipo_Problema, FechaProceso)
        VALUES (@FechaReporte, @ID_Fund, @Proceso, @Tipo_Problema, GETDATE())
      `);
  }

  // =============================================
  // HELPERS PRIVADOS
  // =============================================

  /**
   * Obtiene FechaReporte desde la ejecucion
   * @private
   */
  async _getFechaReporteFromEjecucion(idEjecucion) {
    const fechaResult = await this.pool.request()
      .input('idEjecucion', sql.BigInt, idEjecucion)
      .query(`
        SELECT CONVERT(VARCHAR(10), p.FechaReporte, 120) AS FechaReporte
        FROM logs.Ejecuciones e
        INNER JOIN logs.Procesos p ON e.ID_Proceso = p.ID_Proceso
        WHERE e.ID_Ejecucion = @idEjecucion
      `);
    return fechaResult.recordset[0]?.FechaReporte || new Date().toISOString().split('T')[0];
  }

  /**
   * Escapa comillas simples para SQL
   * @private
   */
  _escape(str) {
    return (str || '').replace(/'/g, "''");
  }

  // =============================================
  // PARSERS DE DETALLE
  // =============================================

  /**
   * Parsea detalle de descuadre Cash
   * Formato: "MVBook_IPA=1000.00, MVBook_CAPM=950.00, Diferencia=50.00"
   * @private
   */
  _parsearDetalleDescuadreCash(detalle) {
    const resultado = { mvBookIPA: 0, mvBookCAPM: 0, diferencia: 0 };
    if (!detalle) return resultado;

    const ipaMatch = detalle.match(/MVBook_IPA=\s*([-\d.,]+)/i);
    if (ipaMatch) resultado.mvBookIPA = parseFloat(ipaMatch[1].replace(/,/g, '')) || 0;

    const capmMatch = detalle.match(/MVBook_CAPM=\s*([-\d.,]+)/i);
    if (capmMatch) resultado.mvBookCAPM = parseFloat(capmMatch[1].replace(/,/g, '')) || 0;

    const difMatch = detalle.match(/Diferencia[s]?=\s*([-\d.,]+)/i);
    if (difMatch) resultado.diferencia = parseFloat(difMatch[1].replace(/,/g, '')) || 0;

    return resultado;
  }

  /**
   * Parsea detalle de descuadre Derivados
   * Formato: "MVBook=1000.00, MTM=950.00, Diferencia=50.00"
   * @private
   */
  _parsearDetalleDescuadreDerivados(detalle) {
    const resultado = { mvBook: 0, mtm: 0, diferencia: 0 };
    if (!detalle) return resultado;

    const mvBookMatch = detalle.match(/MVBook[^=]*=\s*([-\d.,]+)/i);
    if (mvBookMatch) resultado.mvBook = parseFloat(mvBookMatch[1].replace(/,/g, '')) || 0;

    const mtmMatch = detalle.match(/MTM[^=]*=\s*([-\d.,]+)/i);
    if (mtmMatch) resultado.mtm = parseFloat(mtmMatch[1].replace(/,/g, '')) || 0;

    const difMatch = detalle.match(/Diferencia[s]?=\s*([-\d.,]+)/i);
    if (difMatch) resultado.diferencia = parseFloat(difMatch[1].replace(/,/g, '')) || 0;

    return resultado;
  }

  /**
   * Parsea detalle de descuadre NAV
   * Formato: "NAV_Source=1000000.00, NAV_Calculado=999500.00, Diferencia=500.00, Pct=0.05%"
   * @private
   */
  _parsearDetalleDescuadreNAV(detalle) {
    const resultado = { navSource: 0, navCalculado: 0, diferencia: 0, diferenciaPct: null };
    if (!detalle) return resultado;

    const sourceMatch = detalle.match(/NAV_Source=\s*([-\d.,]+)/i);
    if (sourceMatch) resultado.navSource = parseFloat(sourceMatch[1].replace(/,/g, '')) || 0;

    const calcMatch = detalle.match(/NAV_Calculado=\s*([-\d.,]+)/i);
    if (calcMatch) resultado.navCalculado = parseFloat(calcMatch[1].replace(/,/g, '')) || 0;

    const difMatch = detalle.match(/Diferencia=\s*([-\d.,]+)/i);
    if (difMatch) resultado.diferencia = parseFloat(difMatch[1].replace(/,/g, '')) || 0;

    const pctMatch = detalle.match(/Pct=\s*([-\d.,]+)/i);
    if (pctMatch) resultado.diferenciaPct = parseFloat(pctMatch[1].replace(/,/g, '')) || 0;

    return resultado;
  }

  /**
   * Parsea detalle de suciedad
   * Formato: "Qty=100, MVBook=0.005"
   * @private
   */
  _parsearDetalleSuciedad(detalle) {
    const resultado = { qty: 0, mvBook: 0 };
    if (!detalle) return resultado;

    const qtyMatch = detalle.match(/Qty=\s*([-\d.,]+)/i);
    if (qtyMatch) resultado.qty = parseFloat(qtyMatch[1].replace(/,/g, '')) || 0;

    const mvBookMatch = detalle.match(/MVBook=\s*([-\d.,]+)/i);
    if (mvBookMatch) resultado.mvBook = parseFloat(mvBookMatch[1].replace(/,/g, '')) || 0;

    return resultado;
  }
}

// =============================================
// SINGLETON
// =============================================
let instance = null;

module.exports = {
  SandboxWriterService,

  /**
   * Obtiene la instancia singleton
   * @param {object} pool - Pool de conexiones (requerido en primera llamada)
   * @returns {SandboxWriterService}
   */
  getInstance: (pool) => {
    if (!instance) {
      if (!pool) {
        throw new Error('SandboxWriterService.getInstance() requiere pool en primera llamada');
      }
      instance = new SandboxWriterService(pool);
    }
    return instance;
  },

  /**
   * Resetea la instancia singleton (para testing)
   */
  resetInstance: () => {
    instance = null;
  }
};
