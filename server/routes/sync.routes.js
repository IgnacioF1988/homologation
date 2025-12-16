/**
 * Rutas de Sincronización entre Inteligencia_Producto_Dev (legacy) y MonedaHomologacion (moderno)
 *
 * Sistema dual de homologación:
 * - Legacy HOMOL_* ←→ Moderno sandbox.cola*
 * - Legacy BD_* → Moderno stock.*
 */

const express = require('express');
const router = express.Router();
const sql = require('mssql');

// Pool para MonedaHomologacion (moderno)
let modernPool = null;

const getModernPool = async () => {
  if (modernPool && modernPool.connected) {
    return modernPool;
  }

  const config = {
    server: process.env.DB_SERVER,
    database: 'MonedaHomologacion',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT) || 1433,
    options: {
      encrypt: process.env.DB_ENCRYPT === 'true',
      trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true',
      enableArithAbort: true,
    },
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000,
    },
    requestTimeout: 60000,
  };

  modernPool = new sql.ConnectionPool(config);
  await modernPool.connect();
  console.log('Conectado a MonedaHomologacion (sync)');
  return modernPool;
};

// Pool para Inteligencia_Producto_Dev (legacy)
let legacyPool = null;

const getLegacyPool = async () => {
  if (legacyPool && legacyPool.connected) {
    return legacyPool;
  }

  const config = {
    server: process.env.DB_SERVER,
    database: 'Inteligencia_Producto_Dev',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT) || 1433,
    options: {
      encrypt: process.env.DB_ENCRYPT === 'true',
      trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true',
      enableArithAbort: true,
    },
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000,
    },
    requestTimeout: 60000,
  };

  legacyPool = new sql.ConnectionPool(config);
  await legacyPool.connect();
  console.log('Conectado a Inteligencia_Producto_Dev (sync)');
  return legacyPool;
};

// ============================================
// POST /api/sync/homologacion-from-legacy
// Sincroniza pendientes desde legacy a moderno
// ============================================
router.post('/homologacion-from-legacy', async (req, res) => {
  const resultado = {
    instrumentos: 0,
    fondos: 0,
    monedas: 0,
    benchmarks: 0,
    errores: [],
  };

  try {
    const legacy = await getLegacyPool();
    const modern = await getModernPool();

    console.log('[SYNC] Iniciando sincronización Legacy → Moderno...');

    // ---------------------------------------------------------------
    // 1. Sincronizar INSTRUMENTOS (HOMOL_Instrumentos → colaPendientes)
    // ---------------------------------------------------------------
    try {
      const instrumentosResult = await modern.request().query(`
        INSERT INTO MonedaHomologacion.sandbox.colaPendientes
          (nombreFuente, fuente, moneda, estado, fechaIngreso, datosOrigen, observaciones)
        SELECT
          h.SourceInvestment,
          h.Source,
          (SELECT TOP 1 id FROM MonedaHomologacion.cat.monedas WHERE nombre = 'USD' AND activo = 1),
          'pendiente',
          GETDATE(),
          '{"origen":"sync_legacy"}',
          'Pendiente detectado en Inteligencia_Producto_Dev'
        FROM Inteligencia_Producto_Dev.dimensionales.HOMOL_Instrumentos h
        WHERE (h.ID_Instrumento = '0' OR h.ID_Instrumento IS NULL OR h.ID_Instrumento = '')
          AND NOT EXISTS (
            SELECT 1 FROM MonedaHomologacion.sandbox.colaPendientes cp
            WHERE cp.nombreFuente COLLATE SQL_Latin1_General_CP1_CS_AS = h.SourceInvestment
              AND cp.fuente COLLATE SQL_Latin1_General_CP1_CS_AS = h.Source
          )
      `);

      resultado.instrumentos = instrumentosResult.rowsAffected[0];
      console.log(`[SYNC] Instrumentos sincronizados: ${resultado.instrumentos}`);
    } catch (err) {
      resultado.errores.push(`Instrumentos: ${err.message}`);
      console.error('[SYNC] Error en instrumentos:', err.message);
    }

    // ---------------------------------------------------------------
    // 2. Sincronizar FONDOS (HOMOL_Funds → colaFondos)
    // ---------------------------------------------------------------
    try {
      const fondosResult = await modern.request().query(`
        INSERT INTO MonedaHomologacion.sandbox.colaFondos
          (nombreFondo, fuente, estado, fechaIngreso, datosOrigen, observaciones)
        SELECT
          h.Portfolio,
          h.Source,
          'pendiente',
          GETDATE(),
          '{"origen":"sync_legacy"}',
          'Pendiente detectado en Inteligencia_Producto_Dev'
        FROM Inteligencia_Producto_Dev.dimensionales.HOMOL_Funds h
        WHERE (h.ID_Fund IS NULL OR h.ID_Fund = '')
          AND NOT EXISTS (
            SELECT 1 FROM MonedaHomologacion.sandbox.colaFondos cf
            WHERE cf.nombreFondo COLLATE SQL_Latin1_General_CP1_CS_AS = h.Portfolio
              AND cf.fuente COLLATE SQL_Latin1_General_CP1_CS_AS = h.Source
          )
      `);

      resultado.fondos = fondosResult.rowsAffected[0];
      console.log(`[SYNC] Fondos sincronizados: ${resultado.fondos}`);
    } catch (err) {
      resultado.errores.push(`Fondos: ${err.message}`);
      console.error('[SYNC] Error en fondos:', err.message);
    }

    // ---------------------------------------------------------------
    // 3. Sincronizar MONEDAS (HOMOL_Monedas → colaMonedas)
    // ---------------------------------------------------------------
    try {
      const monedasResult = await modern.request().query(`
        INSERT INTO MonedaHomologacion.sandbox.colaMonedas
          (nombreMoneda, fuente, estado, fechaIngreso, datosOrigen, observaciones)
        SELECT
          h.Name,
          h.Source,
          'pendiente',
          GETDATE(),
          '{"origen":"sync_legacy"}',
          'Pendiente detectado en Inteligencia_Producto_Dev'
        FROM Inteligencia_Producto_Dev.dimensionales.HOMOL_Monedas h
        WHERE (h.id_CURR IS NULL OR h.id_CURR = '')
          AND NOT EXISTS (
            SELECT 1 FROM MonedaHomologacion.sandbox.colaMonedas cm
            WHERE cm.nombreMoneda COLLATE SQL_Latin1_General_CP1_CS_AS = h.Name
              AND cm.fuente COLLATE SQL_Latin1_General_CP1_CS_AS = h.Source
          )
      `);

      resultado.monedas = monedasResult.rowsAffected[0];
      console.log(`[SYNC] Monedas sincronizadas: ${resultado.monedas}`);
    } catch (err) {
      resultado.errores.push(`Monedas: ${err.message}`);
      console.error('[SYNC] Error en monedas:', err.message);
    }

    // ---------------------------------------------------------------
    // 4. Sincronizar BENCHMARKS (HOMOL_Benchmarks → colaBenchmarks)
    // ---------------------------------------------------------------
    try {
      const benchmarksResult = await modern.request().query(`
        INSERT INTO MonedaHomologacion.sandbox.colaBenchmarks
          (nombreBenchmark, fuente, estado, fechaIngreso, datosOrigen, observaciones)
        SELECT
          h.Portfolio,
          h.Source,
          'pendiente',
          GETDATE(),
          '{"origen":"sync_legacy"}',
          'Pendiente detectado en Inteligencia_Producto_Dev'
        FROM Inteligencia_Producto_Dev.dimensionales.HOMOL_Benchmarks h
        WHERE (h.ID_BM IS NULL OR h.ID_BM = '')
          AND NOT EXISTS (
            SELECT 1 FROM MonedaHomologacion.sandbox.colaBenchmarks cb
            WHERE cb.nombreBenchmark COLLATE SQL_Latin1_General_CP1_CS_AS = h.Portfolio
              AND cb.fuente COLLATE SQL_Latin1_General_CP1_CS_AS = h.Source
          )
      `);

      resultado.benchmarks = benchmarksResult.rowsAffected[0];
      console.log(`[SYNC] Benchmarks sincronizados: ${resultado.benchmarks}`);
    } catch (err) {
      resultado.errores.push(`Benchmarks: ${err.message}`);
      console.error('[SYNC] Error en benchmarks:', err.message);
    }

    const totalSincronizado = resultado.instrumentos + resultado.fondos + resultado.monedas + resultado.benchmarks;

    res.json({
      success: true,
      message: `Sincronización completada: ${totalSincronizado} items pendientes desde legacy`,
      data: resultado,
    });

  } catch (err) {
    console.error('[SYNC] Error general:', err);
    res.status(500).json({
      success: false,
      error: err.message,
      resultado,
    });
  }
});

// ============================================
// POST /api/sync/homologacion-to-legacy
// Sincroniza resoluciones desde moderno a legacy
// ============================================
router.post('/homologacion-to-legacy', async (req, res) => {
  const resultado = {
    instrumentos: 0,
    fondos: 0,
    monedas: 0,
    benchmarks: 0,
    errores: [],
  };

  try {
    const legacy = await getLegacyPool();
    const modern = await getModernPool();

    console.log('[SYNC] Iniciando sincronización Moderno → Legacy...');

    // ---------------------------------------------------------------
    // 1. Sincronizar INSTRUMENTOS (colaPendientes → HOMOL_Instrumentos)
    // ---------------------------------------------------------------
    try {
      const instrumentosResult = await legacy.request().query(`
        UPDATE Inteligencia_Producto_Dev.dimensionales.HOMOL_Instrumentos
        SET ID_Instrumento = CAST(cp.idInstrumentoAsignado AS NVARCHAR(MAX))
        FROM Inteligencia_Producto_Dev.dimensionales.HOMOL_Instrumentos h
        INNER JOIN MonedaHomologacion.sandbox.colaPendientes cp
          ON h.SourceInvestment = cp.nombreFuente COLLATE SQL_Latin1_General_CP1_CI_AS
          AND h.Source = cp.fuente COLLATE SQL_Latin1_General_CP1_CI_AS
        WHERE cp.estado IN ('completado', 'aprobado')
          AND cp.idInstrumentoAsignado IS NOT NULL
          AND (h.ID_Instrumento = '0' OR h.ID_Instrumento IS NULL OR h.ID_Instrumento = '')
      `);

      resultado.instrumentos = instrumentosResult.rowsAffected[0];
      console.log(`[SYNC] Instrumentos actualizados en legacy: ${resultado.instrumentos}`);
    } catch (err) {
      resultado.errores.push(`Instrumentos: ${err.message}`);
      console.error('[SYNC] Error en instrumentos:', err.message);
    }

    // ---------------------------------------------------------------
    // 2. Sincronizar FONDOS (colaFondos → HOMOL_Funds)
    // ---------------------------------------------------------------
    try {
      const fondosResult = await legacy.request().query(`
        UPDATE Inteligencia_Producto_Dev.dimensionales.HOMOL_Funds
        SET ID_Fund = CAST(cf.idFundAsignado AS NVARCHAR(MAX))
        FROM Inteligencia_Producto_Dev.dimensionales.HOMOL_Funds h
        INNER JOIN MonedaHomologacion.sandbox.colaFondos cf
          ON h.Portfolio = cf.nombreFondo COLLATE SQL_Latin1_General_CP1_CI_AS
          AND h.Source = cf.fuente COLLATE SQL_Latin1_General_CP1_CI_AS
        WHERE cf.estado IN ('completado', 'aprobado')
          AND cf.idFundAsignado IS NOT NULL
          AND (h.ID_Fund IS NULL OR h.ID_Fund = '')
      `);

      resultado.fondos = fondosResult.rowsAffected[0];
      console.log(`[SYNC] Fondos actualizados en legacy: ${resultado.fondos}`);
    } catch (err) {
      resultado.errores.push(`Fondos: ${err.message}`);
      console.error('[SYNC] Error en fondos:', err.message);
    }

    // ---------------------------------------------------------------
    // 3. Sincronizar MONEDAS (colaMonedas → HOMOL_Monedas)
    // ---------------------------------------------------------------
    try {
      const monedasResult = await legacy.request().query(`
        UPDATE Inteligencia_Producto_Dev.dimensionales.HOMOL_Monedas
        SET id_CURR = CAST(cm.idMonedaAsignada AS NVARCHAR(MAX))
        FROM Inteligencia_Producto_Dev.dimensionales.HOMOL_Monedas h
        INNER JOIN MonedaHomologacion.sandbox.colaMonedas cm
          ON h.Name = cm.nombreMoneda COLLATE SQL_Latin1_General_CP1_CI_AS
          AND h.Source = cm.fuente COLLATE SQL_Latin1_General_CP1_CI_AS
        WHERE cm.estado IN ('completado', 'aprobado')
          AND cm.idMonedaAsignada IS NOT NULL
          AND (h.id_CURR IS NULL OR h.id_CURR = '')
      `);

      resultado.monedas = monedasResult.rowsAffected[0];
      console.log(`[SYNC] Monedas actualizadas en legacy: ${resultado.monedas}`);
    } catch (err) {
      resultado.errores.push(`Monedas: ${err.message}`);
      console.error('[SYNC] Error en monedas:', err.message);
    }

    // ---------------------------------------------------------------
    // 4. Sincronizar BENCHMARKS (colaBenchmarks → HOMOL_Benchmarks)
    // ---------------------------------------------------------------
    try {
      const benchmarksResult = await legacy.request().query(`
        UPDATE Inteligencia_Producto_Dev.dimensionales.HOMOL_Benchmarks
        SET ID_BM = cb.idBenchmarkAsignado
        FROM Inteligencia_Producto_Dev.dimensionales.HOMOL_Benchmarks h
        INNER JOIN MonedaHomologacion.sandbox.colaBenchmarks cb
          ON h.Portfolio = cb.nombreBenchmark COLLATE SQL_Latin1_General_CP1_CI_AS
          AND h.Source = cb.fuente COLLATE SQL_Latin1_General_CP1_CI_AS
        WHERE cb.estado IN ('completado', 'aprobado')
          AND cb.idBenchmarkAsignado IS NOT NULL
          AND (h.ID_BM IS NULL OR h.ID_BM = '')
      `);

      resultado.benchmarks = benchmarksResult.rowsAffected[0];
      console.log(`[SYNC] Benchmarks actualizados en legacy: ${resultado.benchmarks}`);
    } catch (err) {
      resultado.errores.push(`Benchmarks: ${err.message}`);
      console.error('[SYNC] Error en benchmarks:', err.message);
    }

    const totalSincronizado = resultado.instrumentos + resultado.fondos + resultado.monedas + resultado.benchmarks;

    res.json({
      success: true,
      message: `Sincronización completada: ${totalSincronizado} resoluciones hacia legacy`,
      data: resultado,
    });

  } catch (err) {
    console.error('[SYNC] Error general:', err);
    res.status(500).json({
      success: false,
      error: err.message,
      resultado,
    });
  }
});

// ============================================
// POST /api/sync/dimensionales-from-legacy
// Sincroniza tablas dimensionales (BD_* → stock.*)
// ============================================
router.post('/dimensionales-from-legacy', async (req, res) => {
  const resultado = {
    instrumentos: 0,
    fondos: 0,
    benchmarks: 0,
    monedas: 0,
    errores: [],
  };

  try {
    const legacy = await getLegacyPool();
    const modern = await getModernPool();

    console.log('[SYNC] Iniciando sincronización dimensional Legacy → Moderno...');

    // ---------------------------------------------------------------
    // 1. Sincronizar BD_Instrumentos → stock.instrumentos (MERGE)
    // ---------------------------------------------------------------
    try {
      const instrumentosResult = await modern.request().query(`
        MERGE INTO MonedaHomologacion.stock.instrumentos AS target
        USING (
          SELECT
            CAST(ID_Instrumento AS INT) AS idInstrumento,
            ISNULL((SELECT TOP 1 id FROM MonedaHomologacion.cat.monedas WHERE codigo = 'USD'), 1) AS moneda,
            Name_Instrumento AS nameInstrumento,
            CompanyName AS companyName,
            Investment_Type_Code AS investmentTypeCode,
            Issuer_Type_Code AS issuerTypeCode,
            ISIN AS isin,
            TickerBBG AS tickerBBG,
            Sedol AS sedol,
            Cusip AS cusip,
            Sector_GICS AS sectorGICS,
            Issue_Country AS issueCountry,
            Risk_Country AS riskCountry
          FROM Inteligencia_Producto_Dev.dimensionales.BD_Instrumentos
          WHERE ID_Instrumento IS NOT NULL
            AND TRY_CAST(ID_Instrumento AS INT) IS NOT NULL
        ) AS source
        ON target.idInstrumento = source.idInstrumento AND target.moneda = source.moneda
        WHEN NOT MATCHED BY TARGET THEN
          INSERT (idInstrumento, moneda, nameInstrumento, companyName, investmentTypeCode,
                  issuerTypeCode, isin, tickerBBG, sedol, cusip, sectorGICS, issueCountry,
                  riskCountry, fechaCreacion, Valid_From, Valid_To)
          VALUES (source.idInstrumento, source.moneda, source.nameInstrumento, source.companyName,
                  source.investmentTypeCode, source.issuerTypeCode, source.isin, source.tickerBBG,
                  source.sedol, source.cusip, source.sectorGICS, source.issueCountry,
                  source.riskCountry, GETDATE(), '1990-01-01', '2050-12-31');
      `);

      resultado.instrumentos = instrumentosResult.rowsAffected[0] || 0;
      console.log(`[SYNC] Instrumentos sincronizados: ${resultado.instrumentos}`);
    } catch (err) {
      resultado.errores.push(`Instrumentos: ${err.message}`);
      console.error('[SYNC] Error en instrumentos:', err.message);
    }

    // ---------------------------------------------------------------
    // 2. Sincronizar BD_Funds → stock.fondos (TRUNCATE + INSERT)
    // ---------------------------------------------------------------
    try {
      // Verificar si la tabla existe, si no, crearla
      const tableCheck = await modern.request().query(`
        SELECT 1 FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = 'stock' AND TABLE_NAME = 'fondos'
      `);

      if (tableCheck.recordset.length === 0) {
        // Crear tabla si no existe
        await modern.request().query(`
          CREATE TABLE MonedaHomologacion.stock.fondos (
            ID_Fund NVARCHAR(10) PRIMARY KEY,
            FundShortName NVARCHAR(50) NOT NULL,
            FundName NVARCHAR(200),
            FundBaseCurrency NVARCHAR(10),
            id_CURR INT,
            NombreTupungato NVARCHAR(100),
            Estrategia_Cons_Fondo NVARCHAR(50),
            Estrategia_Comparador NVARCHAR(50),
            BM1 INT,
            BM2 INT,
            Activo_MantenedorFondos BIT DEFAULT 1,
            Flag_Derivados BIT DEFAULT 0,
            Flag_UBS BIT DEFAULT 0,
            fechaSincronizacion DATETIME DEFAULT GETDATE()
          );
        `);
        console.log('[SYNC] Tabla stock.fondos creada');
      }

      // Sincronización completa
      await modern.request().query(`TRUNCATE TABLE MonedaHomologacion.stock.fondos`);
      const fondosResult = await modern.request().query(`
        INSERT INTO MonedaHomologacion.stock.fondos
        SELECT *, GETDATE() FROM Inteligencia_Producto_Dev.dimensionales.BD_Funds
      `);

      resultado.fondos = fondosResult.rowsAffected[0];
      console.log(`[SYNC] Fondos sincronizados: ${resultado.fondos}`);
    } catch (err) {
      resultado.errores.push(`Fondos: ${err.message}`);
      console.error('[SYNC] Error en fondos:', err.message);
    }

    // ---------------------------------------------------------------
    // 3. Sincronizar BD_Benchmarks → stock.benchmarks (TRUNCATE + INSERT)
    // ---------------------------------------------------------------
    try {
      await modern.request().query(`TRUNCATE TABLE MonedaHomologacion.stock.benchmarks`);
      const benchmarksResult = await modern.request().query(`
        INSERT INTO MonedaHomologacion.stock.benchmarks
        SELECT * FROM Inteligencia_Producto_Dev.dimensionales.BD_Benchmarks
      `);

      resultado.benchmarks = benchmarksResult.rowsAffected[0];
      console.log(`[SYNC] Benchmarks sincronizados: ${resultado.benchmarks}`);
    } catch (err) {
      resultado.errores.push(`Benchmarks: ${err.message}`);
      console.error('[SYNC] Error en benchmarks:', err.message);
    }

    // ---------------------------------------------------------------
    // 4. Sincronizar BD_Monedas → cat.monedas (MERGE con columna origen)
    // ---------------------------------------------------------------
    try {
      // Agregar columna origen si no existe
      const columnCheck = await modern.request().query(`
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = 'cat' AND TABLE_NAME = 'monedas' AND COLUMN_NAME = 'origen'
      `);

      if (columnCheck.recordset.length === 0) {
        await modern.request().query(`
          ALTER TABLE MonedaHomologacion.cat.monedas
          ADD origen NVARCHAR(20) DEFAULT 'manual'
        `);
        console.log('[SYNC] Columna "origen" agregada a cat.monedas');
      }

      const monedasResult = await modern.request().query(`
        MERGE INTO MonedaHomologacion.cat.monedas AS target
        USING (
          SELECT
            id_CURR AS id,
            Code AS codigo,
            Name AS nombre,
            'legacy' AS origen
          FROM Inteligencia_Producto_Dev.dimensionales.BD_Monedas_Dimensiones
        ) AS source
        ON target.codigo = source.codigo
        WHEN NOT MATCHED BY TARGET THEN
          INSERT (id, codigo, nombre, origen)
          VALUES (source.id, source.codigo, source.nombre, source.origen)
        WHEN MATCHED THEN
          UPDATE SET target.origen = 'legacy';
      `);

      resultado.monedas = monedasResult.rowsAffected[0] || 0;
      console.log(`[SYNC] Monedas sincronizadas: ${resultado.monedas}`);
    } catch (err) {
      resultado.errores.push(`Monedas: ${err.message}`);
      console.error('[SYNC] Error en monedas:', err.message);
    }

    res.json({
      success: true,
      message: 'Sincronización dimensional completada',
      data: resultado,
    });

  } catch (err) {
    console.error('[SYNC] Error general:', err);
    res.status(500).json({
      success: false,
      error: err.message,
      resultado,
    });
  }
});

// ============================================
// GET /api/sync/status
// Estado actual de sincronización
// ============================================
router.get('/status', async (req, res) => {
  try {
    const legacy = await getLegacyPool();
    const modern = await getModernPool();

    // Pendientes en legacy
    const legacyPendientes = await legacy.request().query(`
      SELECT
        'HOMOL_Instrumentos' AS Tabla,
        COUNT(*) AS Total,
        SUM(CASE WHEN ID_Instrumento = '0' OR ID_Instrumento IS NULL OR ID_Instrumento = '' THEN 1 ELSE 0 END) AS Pendientes
      FROM Inteligencia_Producto_Dev.dimensionales.HOMOL_Instrumentos

      UNION ALL

      SELECT 'HOMOL_Funds', COUNT(*),
        SUM(CASE WHEN ID_Fund IS NULL OR ID_Fund = '' THEN 1 ELSE 0 END)
      FROM Inteligencia_Producto_Dev.dimensionales.HOMOL_Funds

      UNION ALL

      SELECT 'HOMOL_Monedas', COUNT(*),
        SUM(CASE WHEN id_CURR IS NULL OR id_CURR = '' THEN 1 ELSE 0 END)
      FROM Inteligencia_Producto_Dev.dimensionales.HOMOL_Monedas

      UNION ALL

      SELECT 'HOMOL_Benchmarks', COUNT(*),
        SUM(CASE WHEN ID_BM IS NULL OR ID_BM = '' THEN 1 ELSE 0 END)
      FROM Inteligencia_Producto_Dev.dimensionales.HOMOL_Benchmarks
    `);

    // Pendientes en moderno
    const modernPendientes = await modern.request().query(`
      SELECT
        'colaPendientes' AS Cola,
        COUNT(*) AS Total,
        SUM(CASE WHEN estado = 'pendiente' THEN 1 ELSE 0 END) AS Pendientes
      FROM MonedaHomologacion.sandbox.colaPendientes

      UNION ALL

      SELECT 'colaFondos', COUNT(*),
        SUM(CASE WHEN estado = 'pendiente' THEN 1 ELSE 0 END)
      FROM MonedaHomologacion.sandbox.colaFondos

      UNION ALL

      SELECT 'colaMonedas', COUNT(*),
        SUM(CASE WHEN estado = 'pendiente' THEN 1 ELSE 0 END)
      FROM MonedaHomologacion.sandbox.colaMonedas

      UNION ALL

      SELECT 'colaBenchmarks', COUNT(*),
        SUM(CASE WHEN estado = 'pendiente' THEN 1 ELSE 0 END)
      FROM MonedaHomologacion.sandbox.colaBenchmarks
    `);

    res.json({
      success: true,
      data: {
        legacy: legacyPendientes.recordset,
        moderno: modernPendientes.recordset,
        timestamp: new Date().toISOString(),
      },
    });

  } catch (err) {
    console.error('[SYNC] Error obteniendo estado:', err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// ============================================
// GET /api/sync/fondos-problema
// Fondos con problemas del legacy
// ============================================
router.get('/fondos-problema', async (req, res) => {
  try {
    const legacy = await getLegacyPool();

    const result = await legacy.request().query(`
      SELECT
        fp.ID_Fund,
        fp.Tipo_Problema AS Problema,
        fp.FechaReporte AS FechaDetectado,
        fp.Proceso,
        fp.FechaProceso,
        bf.FundShortName,
        bf.FundName
      FROM Inteligencia_Producto_Dev.sandbox.Fondos_Problema fp
      LEFT JOIN Inteligencia_Producto_Dev.dimensionales.BD_Funds bf
        ON fp.ID_Fund = bf.ID_Fund
      ORDER BY fp.FechaReporte DESC
    `);

    res.json({
      success: true,
      data: result.recordset,
    });

  } catch (err) {
    console.error('[SYNC] Error obteniendo fondos con problema:', err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

module.exports = router;
