/**
 * Rutas para el Visualizador de Cubo IPA
 * Consulta [Inteligencia_Producto_Dev].[process].[TBL_IPA]
 */

const express = require('express');
const router = express.Router();
const sql = require('mssql');

// Configuración para la base de datos del cubo (diferente a la principal)
const cuboConfig = {
  user: process.env.DB_USER || 'moneda_read',
  password: process.env.DB_PASSWORD || 'moneda_read',
  server: process.env.DB_SERVER || '10.1.12.59',
  database: 'Inteligencia_Producto_Dev',
  options: {
    encrypt: false,
    trustServerCertificate: true,
    requestTimeout: 60000,
  },
  pool: {
    max: 5,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

// Pool separado para el cubo (no usa el pool global de sql.connect)
let cuboPool = null;

async function getCuboPool() {
  if (!cuboPool || !cuboPool.connected) {
    // Crear un pool nuevo y separado para Inteligencia_Producto_Dev
    cuboPool = new sql.ConnectionPool(cuboConfig);
    await cuboPool.connect();
    console.log('✅ Conexión a Inteligencia_Producto_Dev establecida');
  }
  return cuboPool;
}

// GET /api/cubo/fechas - Obtener fechas de reporte disponibles
router.get('/fechas', async (req, res) => {
  try {
    const pool = await getCuboPool();
    const result = await pool.request().query(`
      SELECT DISTINCT
        CONVERT(VARCHAR(10), FechaReporte, 120) as fecha
      FROM [process].[TBL_IPA]
      ORDER BY fecha DESC
    `);

    res.json({
      success: true,
      data: result.recordset.map(r => r.fecha),
    });
  } catch (error) {
    console.error('Error obteniendo fechas:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/cubo/fondos - Obtener fondos disponibles
router.get('/fondos', async (req, res) => {
  try {
    const pool = await getCuboPool();
    const result = await pool.request().query(`
      SELECT DISTINCT
        f.ID_Fund,
        f.FundShortName,
        f.FundName,
        f.Estrategia_Cons_Fondo
      FROM [process].[TBL_IPA] c
      INNER JOIN [dimensionales].[BD_Funds] f ON c.ID_Fund = f.ID_Fund
      ORDER BY f.FundShortName
    `);

    res.json({
      success: true,
      data: result.recordset,
    });
  } catch (error) {
    console.error('Error obteniendo fondos:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/cubo/stats - Obtener estadísticas agregadas
router.get('/stats', async (req, res) => {
  try {
    const { fechaReporte, fondos } = req.query;

    if (!fechaReporte) {
      return res.status(400).json({ success: false, error: 'Se requiere fechaReporte' });
    }

    const pool = await getCuboPool();
    const request = pool.request();
    request.input('fechaReporte', sql.Date, fechaReporte);

    let fondosFilter = '';
    if (fondos) {
      const fondosArray = fondos.split(',');
      fondosFilter = `AND c.ID_Fund IN (${fondosArray.map((_, i) => `@fondo${i}`).join(',')})`;
      fondosArray.forEach((f, i) => {
        request.input(`fondo${i}`, sql.NVarChar, f);
      });
    }

    const result = await request.query(`
      SELECT
        COUNT(*) as totalPosiciones,
        COUNT(DISTINCT c.ID_Instrumento) as instrumentosUnicos,
        COUNT(DISTINCT c.ID_Fund) as fondos,
        SUM(c.TotalMVal) as aumTotal,
        SUM(CASE WHEN c.BalanceSheet = 'Asset' THEN c.TotalMVal ELSE 0 END) as aumAssets,
        SUM(CASE WHEN c.BalanceSheet = 'Liability' THEN c.TotalMVal ELSE 0 END) as aumLiabilities
      FROM [process].[TBL_IPA] c
      WHERE c.FechaReporte = @fechaReporte
      ${fondosFilter}
    `);

    res.json({
      success: true,
      data: result.recordset[0],
    });
  } catch (error) {
    console.error('Error obteniendo stats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/cubo/distribution - Obtener distribución por dimensión
router.get('/distribution', async (req, res) => {
  try {
    const { fechaReporte, fondos, dimension } = req.query;

    if (!fechaReporte || !dimension) {
      return res.status(400).json({ success: false, error: 'Se requieren fechaReporte y dimension' });
    }

    const pool = await getCuboPool();
    const request = pool.request();
    request.input('fechaReporte', sql.Date, fechaReporte);

    let fondosFilter = '';
    if (fondos) {
      const fondosArray = fondos.split(',');
      fondosFilter = `AND c.ID_Fund IN (${fondosArray.map((_, i) => `@fondo${i}`).join(',')})`;
      fondosArray.forEach((f, i) => {
        request.input(`fondo${i}`, sql.NVarChar, f);
      });
    }

    // Mapeo de dimensiones a campos SQL
    const dimensionMap = {
      investmentType: {
        select: 'COALESCE(i.Investment_Type_Code, -1) as dimKey, CASE WHEN i.Investment_Type_Code = 1 THEN \'Fixed Income\' WHEN i.Investment_Type_Code = 2 THEN \'Equity\' WHEN i.Investment_Type_Code = 7 THEN \'Derivative\' ELSE \'Otros\' END as dimLabel',
        join: 'LEFT JOIN [dimensionales].[BD_Instrumentos] i ON c.ID_Instrumento = i.ID_Instrumento',
        groupBy: 'i.Investment_Type_Code',
      },
      issueCountry: {
        select: 'COALESCE(i.Issue_Country, \'N/A\') as dimKey, COALESCE(i.Issue_Country, \'N/A\') as dimLabel',
        join: 'LEFT JOIN [dimensionales].[BD_Instrumentos] i ON c.ID_Instrumento = i.ID_Instrumento',
        groupBy: 'i.Issue_Country',
      },
      riskCountry: {
        select: 'COALESCE(i.Risk_Country, \'N/A\') as dimKey, COALESCE(i.Risk_Country, \'N/A\') as dimLabel',
        join: 'LEFT JOIN [dimensionales].[BD_Instrumentos] i ON c.ID_Instrumento = i.ID_Instrumento',
        groupBy: 'i.Risk_Country',
      },
      currency: {
        select: 'COALESCE(m.Code, \'N/A\') as dimKey, COALESCE(m.Code, \'N/A\') as dimLabel',
        join: 'LEFT JOIN [dimensionales].[BD_Monedas_Dimensiones] m ON c.id_CURR = m.id_CURR',
        groupBy: 'm.Code',
      },
      supramoneda: {
        select: 'COALESCE(m.Code_Supramoneda, \'N/A\') as dimKey, COALESCE(m.Code_Supramoneda, \'N/A\') as dimLabel',
        join: 'LEFT JOIN [dimensionales].[BD_Monedas_Dimensiones] m ON c.id_CURR = m.id_CURR',
        groupBy: 'm.Code_Supramoneda',
      },
      fund: {
        select: 'f.ID_Fund as dimKey, f.FundShortName as dimLabel',
        join: 'LEFT JOIN [dimensionales].[BD_Funds] f ON c.ID_Fund = f.ID_Fund',
        groupBy: 'f.ID_Fund, f.FundShortName',
      },
      estrategia: {
        select: 'COALESCE(f.Estrategia_Cons_Fondo, \'Sin Estrategia\') as dimKey, COALESCE(f.Estrategia_Cons_Fondo, \'Sin Estrategia\') as dimLabel',
        join: 'LEFT JOIN [dimensionales].[BD_Funds] f ON c.ID_Fund = f.ID_Fund',
        groupBy: 'f.Estrategia_Cons_Fondo',
      },
      balanceSheet: {
        select: 'c.BalanceSheet as dimKey, c.BalanceSheet as dimLabel',
        join: '',
        groupBy: 'c.BalanceSheet',
      },
    };

    const dimConfig = dimensionMap[dimension];
    if (!dimConfig) {
      return res.status(400).json({ success: false, error: `Dimensión no válida: ${dimension}` });
    }

    const result = await request.query(`
      SELECT
        ${dimConfig.select},
        COUNT(*) as posiciones,
        SUM(c.TotalMVal) as totalMVal,
        COUNT(DISTINCT c.ID_Instrumento) as instrumentos
      FROM [process].[TBL_IPA] c
      ${dimConfig.join}
      WHERE c.FechaReporte = @fechaReporte
      ${fondosFilter}
      GROUP BY ${dimConfig.groupBy}
      ORDER BY totalMVal DESC
    `);

    res.json({
      success: true,
      data: result.recordset,
    });
  } catch (error) {
    console.error('Error obteniendo distribución:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/cubo/data - Obtener datos del cubo con enriquecimiento
router.get('/data', async (req, res) => {
  try {
    const { fechaReporte, fondos, limit = 100 } = req.query;

    if (!fechaReporte) {
      return res.status(400).json({ success: false, error: 'Se requiere fechaReporte' });
    }

    const pool = await getCuboPool();
    const request = pool.request();
    request.input('fechaReporte', sql.Date, fechaReporte);
    request.input('limit', sql.Int, Math.min(parseInt(limit), 1000));

    let fondosFilter = '';
    if (fondos) {
      const fondosArray = fondos.split(',');
      fondosFilter = `AND c.ID_Fund IN (${fondosArray.map((_, i) => `@fondo${i}`).join(',')})`;
      fondosArray.forEach((f, i) => {
        request.input(`fondo${i}`, sql.NVarChar, f);
      });
    }

    const result = await request.query(`
      SELECT TOP (@limit)
        c.PK2,
        c.ID_Fund,
        f.FundShortName,
        f.Estrategia_Cons_Fondo as Estrategia,
        c.ID_Instrumento,
        i.Name_Instrumento,
        i.CompanyName,
        CASE
          WHEN i.Investment_Type_Code = 1 THEN 'Fixed Income'
          WHEN i.Investment_Type_Code = 2 THEN 'Equity'
          WHEN i.Investment_Type_Code = 7 THEN 'Derivative'
          ELSE 'Otros'
        END as InvestmentType,
        i.Issue_Country,
        i.Risk_Country,
        m.Code as Currency,
        m.Code_Supramoneda as Supramoneda,
        c.BalanceSheet,
        c.Source,
        c.LocalPrice,
        c.Qty,
        c.TotalMVal,
        c.FechaReporte,
        c.FechaCartera
      FROM [process].[TBL_IPA] c
      LEFT JOIN [dimensionales].[BD_Funds] f ON c.ID_Fund = f.ID_Fund
      LEFT JOIN [dimensionales].[BD_Instrumentos] i ON c.ID_Instrumento = i.ID_Instrumento
      LEFT JOIN [dimensionales].[BD_Monedas_Dimensiones] m ON c.id_CURR = m.id_CURR
      WHERE c.FechaReporte = @fechaReporte
      ${fondosFilter}
      ORDER BY c.TotalMVal DESC
    `);

    res.json({
      success: true,
      data: result.recordset,
      count: result.recordset.length,
    });
  } catch (error) {
    console.error('Error obteniendo datos:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/cubo/download - Descargar cubo completo como CSV
router.get('/download', async (req, res) => {
  try {
    const { fechaReporte, fondos } = req.query;

    if (!fechaReporte) {
      return res.status(400).json({ success: false, error: 'Se requiere fechaReporte' });
    }

    const pool = await getCuboPool();
    const request = pool.request();
    request.input('fechaReporte', sql.Date, fechaReporte);

    let fondosFilter = '';
    if (fondos) {
      const fondosArray = fondos.split(',');
      fondosFilter = `AND c.ID_Fund IN (${fondosArray.map((_, i) => `@fondo${i}`).join(',')})`;
      fondosArray.forEach((f, i) => {
        request.input(`fondo${i}`, sql.NVarChar, f);
      });
    }

    const result = await request.query(`
      SELECT
        c.PK2,
        c.ID_Fund,
        f.FundShortName,
        f.FundName,
        f.Estrategia_Cons_Fondo as Estrategia,
        c.ID_Instrumento,
        i.Name_Instrumento,
        i.ISIN,
        i.TickerBBG,
        i.CompanyName,
        CASE
          WHEN i.Investment_Type_Code = 1 THEN 'Fixed Income'
          WHEN i.Investment_Type_Code = 2 THEN 'Equity'
          WHEN i.Investment_Type_Code = 7 THEN 'Derivative'
          ELSE 'Otros'
        END as InvestmentType,
        i.Issue_Country,
        i.Risk_Country,
        m.Code as Currency,
        m.Code_Supramoneda as Supramoneda,
        c.BalanceSheet,
        c.Source,
        c.LocalPrice,
        c.Qty,
        c.OriginalFace,
        c.Factor,
        c.AI,
        c.MVBook,
        c.TotalMVal,
        c.TotalMVal_Balance,
        c.FechaReporte,
        c.FechaCartera,
        c.FechaProceso
      FROM [process].[TBL_IPA] c
      LEFT JOIN [dimensionales].[BD_Funds] f ON c.ID_Fund = f.ID_Fund
      LEFT JOIN [dimensionales].[BD_Instrumentos] i ON c.ID_Instrumento = i.ID_Instrumento
      LEFT JOIN [dimensionales].[BD_Monedas_Dimensiones] m ON c.id_CURR = m.id_CURR
      WHERE c.FechaReporte = @fechaReporte
      ${fondosFilter}
      ORDER BY f.FundShortName, c.TotalMVal DESC
    `);

    // Generar CSV
    const columns = Object.keys(result.recordset[0] || {});
    const csvHeader = columns.join(',');
    const csvRows = result.recordset.map(row =>
      columns.map(col => {
        const val = row[col];
        if (val === null || val === undefined) return '';
        if (typeof val === 'string' && (val.includes(',') || val.includes('"'))) {
          return `"${val.replace(/"/g, '""')}"`;
        }
        return val;
      }).join(',')
    );
    const csv = [csvHeader, ...csvRows].join('\n');

    // Configurar headers para descarga
    const filename = `cubo_${fechaReporte}_${fondos ? fondos.replace(/,/g, '-') : 'todos'}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send('\uFEFF' + csv); // BOM para Excel
  } catch (error) {
    console.error('Error descargando cubo:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
