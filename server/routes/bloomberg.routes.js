/**
 * Bloomberg Job Queue Routes
 * API endpoints for managing Bloomberg data fetching jobs
 *
 * Uses Inteligencia_Producto_Dev database (bbg schema)
 * Also writes to shared CSV file for Bloomberg machine
 */

const express = require('express');
const router = express.Router();
const sql = require('mssql');
const fs = require('fs');
const path = require('path');

// Simple file locking for Node.js (compatible with Python's filelock)
const LOCK_TIMEOUT_MS = 30000;
const LOCK_RETRY_MS = 100;

async function acquireLock(lockFile, timeout = LOCK_TIMEOUT_MS) {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    try {
      // Try to create lock file exclusively
      fs.writeFileSync(lockFile, process.pid.toString(), { flag: 'wx' });
      return true;
    } catch (err) {
      if (err.code === 'EEXIST') {
        // Lock exists, wait and retry
        await new Promise(resolve => setTimeout(resolve, LOCK_RETRY_MS));
      } else {
        throw err;
      }
    }
  }
  return false; // Timeout
}

function releaseLock(lockFile) {
  try {
    fs.unlinkSync(lockFile);
  } catch (err) {
    // Ignore errors (file might already be deleted)
  }
}

async function withLock(lockFile, fn) {
  if (await acquireLock(lockFile)) {
    try {
      return await fn();
    } finally {
      releaseLock(lockFile);
    }
  } else {
    throw new Error(`Timeout acquiring lock: ${lockFile}`);
  }
}

// ============================================
// FOLDER CONFIGURATION
// ============================================
// LOCAL folder - web server writes here, bridge copies to shared folder
const LOCAL_FOLDER = process.env.BBG_LOCAL_FOLDER || 'C:\\Users\\dwielandt.PATRIA\\Homologation-master\\BBG';
const LOCAL_JOBS_CSV = path.join(LOCAL_FOLDER, 'jobs.csv');
const LOCAL_CASHFLOWS_CSV = path.join(LOCAL_FOLDER, 'cashflows.csv');
const LOCAL_JOBS_LOCK = path.join(LOCAL_FOLDER, 'jobs.csv.lock');
const LOCAL_CASHFLOWS_LOCK = path.join(LOCAL_FOLDER, 'cashflows.csv.lock');

// SHARED folder - only used for direct access if available (legacy)
const SHARED_FOLDER = process.env.BBG_SHARED_FOLDER || '\\\\moneda03\\Compartidos\\Inteligencia de Negocios y Mercados\\BBG_Job_requests';
const JOBS_CSV = path.join(SHARED_FOLDER, 'jobs.csv');
const CASHFLOWS_CSV = path.join(SHARED_FOLDER, 'cashflows.csv');

// Background job settings
const POLL_INTERVAL_MS = 5000; // Check every 5 seconds
let lastCashflowsModified = 0;
let lastJobsCsvContent = ''; // Track last written content to avoid redundant writes

// CSV helper functions
function ensureSharedFolder() {
  try {
    if (!fs.existsSync(SHARED_FOLDER)) {
      fs.mkdirSync(SHARED_FOLDER, { recursive: true });
    }
    return true;
  } catch (err) {
    console.error('[Bloomberg] Cannot access shared folder:', err.message);
    return false;
  }
}

function parseCSVLine(line) {
  // Parse a CSV line respecting quoted fields
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      // Escaped quote inside quoted field
      current += '"';
      i++; // Skip next quote
    } else if (char === '"') {
      // Toggle quote mode
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      // Field separator
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim()); // Last field
  return result;
}

function readJobsCsv() {
  try {
    if (!fs.existsSync(JOBS_CSV)) {
      return [];
    }
    const content = fs.readFileSync(JOBS_CSV, 'utf-8');
    const lines = content.trim().split('\n');
    if (lines.length <= 1) return [];

    const headers = parseCSVLine(lines[0]);
    return lines.slice(1).map(line => {
      const values = parseCSVLine(line);
      const obj = {};
      headers.forEach((h, i) => obj[h] = values[i] || '');
      return obj;
    });
  } catch (err) {
    console.error('[Bloomberg] Error reading jobs CSV:', err);
    return [];
  }
}

function writeJobsCsv(jobs) {
  try {
    const headers = ['job_id', 'instruments_json', 'report_date', 'status', 'created_at',
                     'started_at', 'completed_at', 'error_message', 'instruments_total',
                     'instruments_fetched', 'instruments_skipped', 'progress', 'created_by'];

    const lines = [headers.join(',')];
    for (const job of jobs) {
      const values = headers.map(h => {
        let val = job[h] || '';
        // Escape commas and quotes in JSON
        if (h === 'instruments_json' || h === 'error_message') {
          val = `"${String(val).replace(/"/g, '""')}"`;
        }
        return val;
      });
      lines.push(values.join(','));
    }

    fs.writeFileSync(JOBS_CSV, lines.join('\n'), 'utf-8');
    return true;
  } catch (err) {
    console.error('[Bloomberg] Error writing jobs CSV:', err);
    return false;
  }
}

function appendJobToCsv(job) {
  try {
    ensureSharedFolder();
    const jobs = readJobsCsv();
    jobs.push(job);
    return writeJobsCsv(jobs);
  } catch (err) {
    console.error('[Bloomberg] Error appending job to CSV:', err);
    return false;
  }
}

// ============================================
// DATABASE CONNECTION - MonedaHomologacion
// ============================================
let bbgPool = null;

const getBBGPool = async () => {
  if (bbgPool && bbgPool.connected) {
    return bbgPool;
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
    requestTimeout: 120000, // 2 minutes for BBG operations
  };

  bbgPool = new sql.ConnectionPool(config);
  await bbgPool.connect();
  console.log('Conectado a MonedaHomologacion (Bloomberg)');
  return bbgPool;
};

// ============================================
// GET /api/bloomberg/instruments
// Get list of instruments with yield_source = 'BBG'
// ============================================
router.get('/instruments', async (req, res) => {
  try {
    const pool = await getBBGPool();

    const result = await pool.request()
      .execute('bbg.sp_Get_BBG_Instruments_JSON');

    // sp returns two recordsets: instruments_json and count
    const instrumentsJson = result.recordsets[0][0]?.instruments_json || '[]';
    const count = result.recordsets[1][0]?.instrument_count || 0;

    res.json({
      success: true,
      data: {
        instruments: JSON.parse(instrumentsJson),
        count: count
      }
    });

  } catch (err) {
    console.error('[Bloomberg] Error getting instruments:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// ============================================
// POST /api/bloomberg/jobs
// Create a new Bloomberg job
// ============================================
router.post('/jobs', async (req, res) => {
  try {
    const { instruments, report_date, created_by } = req.body;

    // Validation
    if (!instruments || !Array.isArray(instruments) || instruments.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Se requiere una lista de instrumentos'
      });
    }

    if (!report_date) {
      return res.status(400).json({
        success: false,
        error: 'Se requiere report_date'
      });
    }

    const pool = await getBBGPool();

    const result = await pool.request()
      .input('instruments_json', sql.NVarChar(sql.MAX), JSON.stringify(instruments))
      .input('report_date', sql.Date, new Date(report_date))
      .input('created_by', sql.NVarChar(100), created_by || 'web_user')
      .execute('bbg.sp_Create_Job');

    const jobInfo = result.recordset[0];

    if (jobInfo.status === 'ERROR') {
      return res.status(400).json({
        success: false,
        error: jobInfo.message
      });
    }

    // Also write to shared CSV for Bloomberg machine
    const csvJob = {
      job_id: jobInfo.job_id,
      instruments_json: JSON.stringify(instruments),
      report_date: report_date,
      status: 'PENDING',
      created_at: new Date().toISOString(),
      started_at: '',
      completed_at: '',
      error_message: '',
      instruments_total: jobInfo.instruments_total,
      instruments_fetched: '',
      instruments_skipped: '',
      progress: '',
      created_by: created_by || 'web_user'
    };

    const csvWritten = appendJobToCsv(csvJob);
    if (!csvWritten) {
      console.warn('[Bloomberg] Job created in SQL but CSV write failed');
    }

    res.status(201).json({
      success: true,
      data: {
        job_id: jobInfo.job_id,
        status: jobInfo.status,
        instruments_total: jobInfo.instruments_total,
        created_at: jobInfo.created_at,
        message: jobInfo.message,
        csv_synced: csvWritten
      }
    });

  } catch (err) {
    console.error('[Bloomberg] Error creating job:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// ============================================
// GET /api/bloomberg/jobs/:job_id
// Get job status
// ============================================
router.get('/jobs/:job_id', async (req, res) => {
  try {
    const { job_id } = req.params;

    if (!job_id || isNaN(parseInt(job_id))) {
      return res.status(400).json({
        success: false,
        error: 'job_id inválido'
      });
    }

    const pool = await getBBGPool();

    const result = await pool.request()
      .input('job_id', sql.BigInt, parseInt(job_id))
      .execute('bbg.sp_Get_Job_Status');

    // sp returns two recordsets: job info and logs
    const job = result.recordsets[0][0];
    const logs = result.recordsets[1] || [];

    if (!job) {
      return res.status(404).json({
        success: false,
        error: 'Job no encontrado'
      });
    }

    res.json({
      success: true,
      data: {
        job,
        logs
      }
    });

  } catch (err) {
    console.error('[Bloomberg] Error getting job status:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// ============================================
// GET /api/bloomberg/jobs
// Get job history with pagination and filters
// ============================================
router.get('/jobs', async (req, res) => {
  try {
    const {
      limit = 50,
      offset = 0,
      status = null,
      date_from = null,
      date_to = null
    } = req.query;

    const pool = await getBBGPool();

    const result = await pool.request()
      .input('limit', sql.Int, parseInt(limit))
      .input('offset', sql.Int, parseInt(offset))
      .input('status', sql.NVarChar(20), status)
      .input('date_from', sql.Date, date_from ? new Date(date_from) : null)
      .input('date_to', sql.Date, date_to ? new Date(date_to) : null)
      .execute('bbg.sp_Get_Job_History');

    // sp returns two recordsets: jobs and total count
    const jobs = result.recordsets[0] || [];
    const totalCount = result.recordsets[1][0]?.total_count || 0;

    res.json({
      success: true,
      data: {
        jobs,
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          total: totalCount,
          hasMore: parseInt(offset) + jobs.length < totalCount
        }
      }
    });

  } catch (err) {
    console.error('[Bloomberg] Error getting job history:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// ============================================
// GET /api/bloomberg/summary
// Get queue summary statistics
// ============================================
router.get('/summary', async (req, res) => {
  try {
    const pool = await getBBGPool();

    const result = await pool.request()
      .query('SELECT * FROM bbg.v_Job_Queue_Summary');

    // Transform to object
    const summary = {};
    result.recordset.forEach(row => {
      summary[row.status.toLowerCase()] = {
        count: row.job_count,
        instruments: row.total_instruments,
        fetched: row.total_fetched,
        oldest: row.oldest_job,
        newest: row.newest_job
      };
    });

    res.json({
      success: true,
      data: summary
    });

  } catch (err) {
    console.error('[Bloomberg] Error getting summary:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// ============================================
// POST /api/bloomberg/cleanup
// Manually trigger stuck job cleanup
// ============================================
router.post('/cleanup', async (req, res) => {
  try {
    const { timeout_minutes = 30 } = req.body;

    const pool = await getBBGPool();

    const result = await pool.request()
      .input('timeout_minutes', sql.Int, parseInt(timeout_minutes))
      .execute('bbg.sp_Cleanup_Stuck_Jobs');

    const stats = result.recordset[0];

    res.json({
      success: true,
      data: {
        jobs_marked_stuck: stats.jobs_marked_stuck,
        jobs_pending: stats.jobs_pending,
        jobs_running: stats.jobs_running,
        jobs_failed_permanently: stats.jobs_failed_permanently
      }
    });

  } catch (err) {
    console.error('[Bloomberg] Error cleaning up stuck jobs:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// ============================================
// GET /api/bloomberg/cashflows/:pk2
// Get cashflows for a specific instrument
// ============================================
router.get('/cashflows/:pk2', async (req, res) => {
  try {
    const { pk2 } = req.params;
    const { from_date } = req.query;

    const pool = await getBBGPool();

    let query = `
      SELECT
        pk2, isin, fecha,
        flujo_moneda_local, flujo_usd,
        balance_sheet, moneda_local,
        source, job_id, fetched_at
      FROM metrics.Cashflows
      WHERE pk2 = @pk2
    `;

    const request = pool.request().input('pk2', sql.NVarChar(50), pk2);

    if (from_date) {
      query += ' AND fecha >= @from_date';
      request.input('from_date', sql.Date, new Date(from_date));
    }

    query += ' ORDER BY fecha ASC';

    const result = await request.query(query);

    res.json({
      success: true,
      data: {
        pk2,
        cashflows: result.recordset,
        count: result.recordset.length
      }
    });

  } catch (err) {
    console.error('[Bloomberg] Error getting cashflows:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// ============================================
// GET /api/bloomberg/logs
// Get recent logs
// ============================================
router.get('/logs', async (req, res) => {
  try {
    const {
      limit = 100,
      job_id = null,
      level = null
    } = req.query;

    const pool = await getBBGPool();

    let query = `
      SELECT TOP (@limit)
        log_id, job_id, log_level, message,
        details, instrument_pk2, instrument_isin, created_at
      FROM logs.BBG_Log
      WHERE 1=1
    `;

    const request = pool.request().input('limit', sql.Int, parseInt(limit));

    if (job_id) {
      query += ' AND job_id = @job_id';
      request.input('job_id', sql.BigInt, parseInt(job_id));
    }

    if (level) {
      query += ' AND log_level = @level';
      request.input('level', sql.NVarChar(20), level);
    }

    query += ' ORDER BY created_at DESC';

    const result = await request.query(query);

    res.json({
      success: true,
      data: {
        logs: result.recordset,
        count: result.recordset.length
      }
    });

  } catch (err) {
    console.error('[Bloomberg] Error getting logs:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// ============================================
// POST /api/bloomberg/sync
// Sync data from shared CSV files back to SQL
// ============================================
router.post('/sync', async (req, res) => {
  try {
    const pool = await getBBGPool();
    const results = {
      jobs_synced: 0,
      cashflows_imported: 0,
      cashflows_skipped: 0,
      errors: []
    };

    // 1. Sync job statuses from CSV to SQL
    if (fs.existsSync(JOBS_CSV)) {
      const csvJobs = readJobsCsv();

      for (const csvJob of csvJobs) {
        if (csvJob.status === 'COMPLETED' || csvJob.status === 'ERROR') {
          try {
            await pool.request()
              .input('job_id', sql.BigInt, parseInt(csvJob.job_id))
              .input('status', sql.NVarChar(20), csvJob.status)
              .input('progress', sql.NVarChar(500), csvJob.progress || null)
              .input('instruments_fetched', sql.Int, parseInt(csvJob.instruments_fetched) || null)
              .input('instruments_skipped', sql.Int, parseInt(csvJob.instruments_skipped) || null)
              .input('error_message', sql.NVarChar(sql.MAX), csvJob.error_message || null)
              .execute('bbg.sp_Update_Job_Status');
            results.jobs_synced++;
          } catch (err) {
            results.errors.push(`Job ${csvJob.job_id}: ${err.message}`);
          }
        }
      }
    }

    // 2. Import cashflows from CSV to SQL
    if (fs.existsSync(CASHFLOWS_CSV)) {
      const content = fs.readFileSync(CASHFLOWS_CSV, 'utf-8');
      const lines = content.trim().split('\n');

      if (lines.length > 1) {
        const headers = parseCSVLine(lines[0]);

        for (let i = 1; i < lines.length; i++) {
          const values = parseCSVLine(lines[i]);
          const cf = {};
          headers.forEach((h, idx) => cf[h] = values[idx]?.trim() || null);

          try {
            // Check if cashflow already exists
            const existsResult = await pool.request()
              .input('pk2', sql.NVarChar(50), cf.pk2)
              .input('fecha', sql.Date, new Date(cf.fecha))
              .query('SELECT 1 as exists_flag FROM metrics.Cashflows WHERE pk2 = @pk2 AND fecha = @fecha');

            if (existsResult.recordset.length > 0) {
              // Already exists, skip
              results.cashflows_skipped++;
              continue;
            }

            // Insert new cashflow
            await pool.request()
              .input('pk2', sql.NVarChar(50), cf.pk2)
              .input('isin', sql.NVarChar(20), cf.isin)
              .input('fecha', sql.Date, new Date(cf.fecha))
              .input('flujo_moneda_local', sql.Decimal(18, 6), parseFloat(cf.flujo_moneda_local) || 0)
              .input('flujo_usd', sql.Decimal(18, 6), parseFloat(cf.flujo_usd) || 0)
              .input('balance_sheet', sql.Decimal(18, 6), parseFloat(cf.balance_sheet) || 0)
              .input('moneda_local', sql.NVarChar(10), cf.moneda_local)
              .input('job_id', sql.BigInt, parseInt(cf.job_id) || null)
              .query(`
                INSERT INTO metrics.Cashflows
                  (pk2, isin, fecha, flujo_moneda_local, flujo_usd, balance_sheet, moneda_local, source, job_id, fetched_at)
                VALUES
                  (@pk2, @isin, @fecha, @flujo_moneda_local, @flujo_usd, @balance_sheet, @moneda_local, 'BBG', @job_id, GETDATE())
              `);
            results.cashflows_imported++;
          } catch (err) {
            results.errors.push(`Cashflow ${cf.pk2}/${cf.fecha}: ${err.message}`);
          }
        }
      }
    }

    res.json({
      success: true,
      data: results
    });

  } catch (err) {
    console.error('[Bloomberg] Error syncing from CSV:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// ============================================
// GET /api/bloomberg/csv-status
// Check status of CSV files in shared folder
// ============================================
router.get('/csv-status', async (req, res) => {
  try {
    const status = {
      shared_folder: SHARED_FOLDER,
      folder_accessible: false,
      jobs_file: { exists: false, count: 0, pending: 0, completed: 0 },
      cashflows_file: { exists: false, count: 0 }
    };

    // Check folder access
    if (fs.existsSync(SHARED_FOLDER)) {
      status.folder_accessible = true;

      // Check jobs file
      if (fs.existsSync(JOBS_CSV)) {
        status.jobs_file.exists = true;
        const jobs = readJobsCsv();
        status.jobs_file.count = jobs.length;
        status.jobs_file.pending = jobs.filter(j => j.status === 'PENDING').length;
        status.jobs_file.completed = jobs.filter(j => j.status === 'COMPLETED').length;
      }

      // Check cashflows file
      if (fs.existsSync(CASHFLOWS_CSV)) {
        status.cashflows_file.exists = true;
        const content = fs.readFileSync(CASHFLOWS_CSV, 'utf-8');
        status.cashflows_file.count = content.trim().split('\n').length - 1;
      }
    }

    res.json({
      success: true,
      data: status
    });

  } catch (err) {
    console.error('[Bloomberg] Error checking CSV status:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// ============================================
// POST /api/bloomberg/process-completed-queue
// Manually trigger queue processing
// ============================================
router.post('/process-completed-queue', async (req, res) => {
  try {
    const pool = await getBBGPool();

    const result = await pool.request()
      .execute('sandbox.sp_Process_Completed_Queue');

    const summary = result.recordset[0] || {
      bbg_jobs_created: 0,
      job_id: null,
      bbg_instruments_queued: 0,
      non_bbg_archived: 0
    };

    res.json({
      success: true,
      data: {
        bbg_jobs_created: summary.bbg_jobs_created,
        job_id: summary.job_id,
        bbg_instruments_queued: summary.bbg_instruments_queued,
        non_bbg_archived: summary.non_bbg_archived
      }
    });

  } catch (err) {
    console.error('[Bloomberg] Error processing completed queue:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// ============================================
// POST /api/bloomberg/trigger-queue-check
// Manually trigger both queue processing and archival
// ============================================
router.post('/trigger-queue-check', async (req, res) => {
  try {
    const pool = await getBBGPool();
    const results = {
      queue_processed: null,
      cashflows_archived: null
    };

    // Process completed queue
    try {
      const processResult = await pool.request()
        .execute('sandbox.sp_Process_Completed_Queue');
      results.queue_processed = processResult.recordset[0] || {
        bbg_jobs_created: 0,
        job_id: null,
        bbg_instruments_queued: 0,
        non_bbg_archived: 0
      };
    } catch (spErr) {
      results.queue_processed = { error: spErr.message };
    }

    // Archive processed cashflows
    try {
      const archiveResult = await pool.request()
        .execute('sandbox.sp_Archive_Processed_Cashflows');
      results.cashflows_archived = archiveResult.recordset[0] || {
        instruments_archived: 0
      };
    } catch (spErr) {
      results.cashflows_archived = { error: spErr.message };
    }

    res.json({
      success: true,
      data: results
    });

  } catch (err) {
    console.error('[Bloomberg] Error in trigger queue check:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// ============================================
// BACKGROUND JOBS - Auto-sync SQL ↔ CSV
// ============================================

/**
 * Ensure local folder exists
 */
function ensureLocalFolder() {
  try {
    if (!fs.existsSync(LOCAL_FOLDER)) {
      fs.mkdirSync(LOCAL_FOLDER, { recursive: true });
      console.log('[Bloomberg] Created local folder:', LOCAL_FOLDER);
    }
    return true;
  } catch (err) {
    console.error('[Bloomberg] Cannot create local folder:', err.message);
    return false;
  }
}

/**
 * Write jobs to LOCAL CSV file (for bridge to pick up)
 * Returns true if file was written, false if skipped (no changes) or error
 */
async function writeLocalJobsCsv(jobs, forceWrite = false) {
  try {
    ensureLocalFolder();
    const headers = ['job_id', 'instruments_json', 'report_date', 'status', 'created_at',
                     'started_at', 'completed_at', 'error_message', 'instruments_total',
                     'instruments_fetched', 'instruments_skipped', 'progress', 'created_by'];

    const lines = [headers.join(',')];
    for (const job of jobs) {
      const values = headers.map(h => {
        let val = job[h] || '';
        if (h === 'instruments_json' || h === 'error_message') {
          val = `"${String(val).replace(/"/g, '""')}"`;
        }
        return val;
      });
      lines.push(values.join(','));
    }

    const newContent = lines.join('\n');

    // Read ACTUAL file content and compare (not in-memory cache)
    // This prevents overwriting changes made by bridge_sync
    let currentContent = '';
    try {
      if (fs.existsSync(LOCAL_JOBS_CSV)) {
        currentContent = fs.readFileSync(LOCAL_JOBS_CSV, 'utf-8');
      }
    } catch (e) {
      // Ignore read errors
    }

    // Normalize for comparison (handle line ending differences)
    const normalizeContent = (s) => s.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();

    if (!forceWrite && normalizeContent(newContent) === normalizeContent(currentContent)) {
      return false; // No changes, skipped
    }

    // Use file locking to prevent conflicts with bridge_sync
    try {
      await withLock(LOCAL_JOBS_LOCK, async () => {
        fs.writeFileSync(LOCAL_JOBS_CSV, newContent, 'utf-8');
      });
      return true;
    } catch (lockErr) {
      console.error('[Bloomberg] Lock error writing jobs CSV:', lockErr.message);
      // Fall back to direct write if locking fails
      fs.writeFileSync(LOCAL_JOBS_CSV, newContent, 'utf-8');
      return true;
    }
  } catch (err) {
    console.error('[Bloomberg] Error writing local jobs CSV:', err);
    return false;
  }
}

/**
 * Check SQL for pending jobs and export NEW ones to CSV
 * Called periodically by background job
 *
 * Only writes if there are NEW pending jobs not already in CSV
 * This prevents sync loops with bridge_sync.py
 */
async function exportPendingJobsToCSV() {
  try {
    const pool = await getBBGPool();

    // Get pending jobs from sandbox table
    const result = await pool.request().query(`
      SELECT
        job_id,
        instruments_json,
        CONVERT(VARCHAR(10), report_date, 120) as report_date,
        status,
        CONVERT(VARCHAR(30), created_at, 127) as created_at,
        CONVERT(VARCHAR(30), started_at, 127) as started_at,
        CONVERT(VARCHAR(30), completed_at, 127) as completed_at,
        error_message,
        instruments_total,
        instruments_fetched,
        instruments_skipped,
        progress,
        created_by
      FROM sandbox.rescatar_flujos_bbg
      WHERE status = 'PENDING'
      ORDER BY created_at ASC
    `);

    const pendingFromSql = result.recordset;
    if (pendingFromSql.length === 0) {
      return; // No pending jobs in SQL, nothing to export
    }

    // Read existing CSV to check for new jobs
    let existingJobIds = new Set();
    let existingJobs = [];
    if (fs.existsSync(LOCAL_JOBS_CSV)) {
      try {
        const content = fs.readFileSync(LOCAL_JOBS_CSV, 'utf-8');
        const lines = content.trim().split('\n');
        if (lines.length > 1) {
          const headers = parseCSVLine(lines[0]);
          existingJobs = lines.slice(1).map(line => {
            const values = parseCSVLine(line);
            const obj = {};
            headers.forEach((h, i) => obj[h] = values[i] || '');
            return obj;
          }).filter(j => j.job_id);
          existingJobIds = new Set(existingJobs.map(j => String(j.job_id)));
        }
      } catch (e) {
        // Ignore read errors
      }
    }

    // Check if there are NEW pending jobs (not already in CSV)
    const newPendingJobs = pendingFromSql.filter(j => !existingJobIds.has(String(j.job_id)));

    if (newPendingJobs.length === 0) {
      return; // All pending jobs already in CSV, no need to write
    }

    // Keep non-COMPLETED jobs from CSV (RUNNING, ERROR, PENDING)
    // Don't keep COMPLETED - they should be removed by importJobStatusFromCSV
    const activeFromCsv = existingJobs.filter(j => j.status !== 'COMPLETED');

    // Merge: active jobs from CSV + new pending from SQL
    const pendingJobIds = new Set(pendingFromSql.map(j => String(j.job_id)));
    const nonPendingFromCsv = activeFromCsv.filter(j =>
      j.status !== 'PENDING' && !pendingJobIds.has(String(j.job_id))
    );

    const mergedJobs = [...pendingFromSql, ...nonPendingFromCsv];
    mergedJobs.sort((a, b) => Number(a.job_id) - Number(b.job_id));

    const written = await writeLocalJobsCsv(mergedJobs);
    if (written) {
      console.log(`[Bloomberg] Exported ${newPendingJobs.length} new pending jobs (total: ${mergedJobs.length})`);
    }

  } catch (err) {
    // Silently ignore if table doesn't exist yet
    if (!err.message.includes('Invalid object name')) {
      console.error('[Bloomberg] Error exporting pending jobs:', err.message);
    }
  }
}

/**
 * Check local cashflows.csv for changes and sync to SQL
 * Called periodically by background job
 */
async function importCashflowsFromCSV() {
  try {
    if (!fs.existsSync(LOCAL_CASHFLOWS_CSV)) {
      return;
    }

    // Check if file was modified
    const stats = fs.statSync(LOCAL_CASHFLOWS_CSV);
    const mtime = stats.mtimeMs;

    if (mtime <= lastCashflowsModified) {
      return; // No changes
    }

    lastCashflowsModified = mtime;
    console.log('[Bloomberg] cashflows.csv changed, syncing to SQL...');

    const pool = await getBBGPool();
    const content = fs.readFileSync(LOCAL_CASHFLOWS_CSV, 'utf-8');
    const lines = content.trim().split('\n');

    if (lines.length <= 1) {
      return;
    }

    const headers = parseCSVLine(lines[0]);
    let imported = 0;
    let skipped = 0;

    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      const cf = {};
      headers.forEach((h, idx) => cf[h] = values[idx]?.trim() || null);

      try {
        // Check if exists
        const existsResult = await pool.request()
          .input('pk2', sql.NVarChar(50), cf.pk2)
          .input('fecha', sql.Date, new Date(cf.fecha))
          .query('SELECT 1 FROM metrics.Cashflows WHERE pk2 = @pk2 AND fecha = @fecha');

        if (existsResult.recordset.length > 0) {
          skipped++;
          continue;
        }

        // Insert
        await pool.request()
          .input('pk2', sql.NVarChar(50), cf.pk2)
          .input('isin', sql.NVarChar(20), cf.isin)
          .input('fecha', sql.Date, new Date(cf.fecha))
          .input('flujo_moneda_local', sql.Decimal(18, 6), parseFloat(cf.flujo_moneda_local) || 0)
          .input('flujo_usd', sql.Decimal(18, 6), parseFloat(cf.flujo_usd) || 0)
          .input('balance_sheet', sql.NVarChar(20), cf.balance_sheet || 'Asset')
          .input('moneda_local', sql.NVarChar(10), cf.moneda_local)
          .input('job_id', sql.BigInt, parseInt(cf.job_id) || null)
          .query(`
            INSERT INTO metrics.Cashflows
              (pk2, isin, fecha, flujo_moneda_local, flujo_usd, balance_sheet, moneda_local, source, job_id, fetched_at)
            VALUES
              (@pk2, @isin, @fecha, @flujo_moneda_local, @flujo_usd, @balance_sheet, @moneda_local, 'BBG', @job_id, GETDATE())
          `);
        imported++;
      } catch (err) {
        // Ignore individual row errors
      }
    }

    if (imported > 0 || skipped > 0) {
      console.log(`[Bloomberg] Sync complete: ${imported} imported, ${skipped} skipped`);
    }

  } catch (err) {
    console.error('[Bloomberg] Error importing cashflows:', err.message);
  }
}

/**
 * Sync job status from local CSV back to SQL
 * When Bloomberg marks a job as RUNNING/COMPLETED/ERROR, update SQL
 * After updating, remove COMPLETED jobs from CSV (they're done)
 *
 * IMPORTANT: Must sync RUNNING status too, otherwise exportPendingJobsToCSV()
 * will keep exporting the job as PENDING and overwrite the RUNNING status!
 */
async function importJobStatusFromCSV() {
  try {
    if (!fs.existsSync(LOCAL_JOBS_CSV)) {
      return;
    }

    const content = fs.readFileSync(LOCAL_JOBS_CSV, 'utf-8');
    const lines = content.trim().split('\n');
    if (lines.length <= 1) return;

    const headers = parseCSVLine(lines[0]);
    const csvJobs = lines.slice(1).map(line => {
      const values = parseCSVLine(line);
      const obj = {};
      headers.forEach((h, i) => obj[h] = values[i] || '');
      return obj;
    }).filter(j => j.job_id);

    // Find jobs that have been updated by Bloomberg (RUNNING, COMPLETED, or ERROR)
    // RUNNING must be synced to prevent exportPendingJobsToCSV from overwriting it!
    const updatedJobs = csvJobs.filter(j =>
      j.status === 'RUNNING' || j.status === 'COMPLETED' || j.status === 'ERROR'
    );

    const pool = await getBBGPool();

    // Update SQL with status changes
    for (const job of updatedJobs) {
      try {
        await pool.request()
          .input('job_id', sql.BigInt, parseInt(job.job_id))
          .input('status', sql.NVarChar(20), job.status)
          .input('started_at', sql.DateTime, job.started_at ? new Date(job.started_at) : null)
          .input('completed_at', sql.DateTime, job.completed_at ? new Date(job.completed_at) : null)
          .input('error_message', sql.NVarChar(sql.MAX), job.error_message || null)
          .input('instruments_fetched', sql.Int, parseInt(job.instruments_fetched) || 0)
          .input('instruments_skipped', sql.Int, parseInt(job.instruments_skipped) || 0)
          .input('progress', sql.NVarChar(500), job.progress || null)
          .query(`
            UPDATE sandbox.rescatar_flujos_bbg
            SET status = @status,
                started_at = COALESCE(@started_at, started_at),
                completed_at = COALESCE(@completed_at, completed_at),
                error_message = @error_message,
                instruments_fetched = @instruments_fetched,
                instruments_skipped = @instruments_skipped,
                progress = @progress
            WHERE job_id = @job_id
              AND status NOT IN ('COMPLETED', 'ERROR')
          `);
        console.log(`[Bloomberg] Synced job ${job.job_id} status to SQL: ${job.status}`);
      } catch (err) {
        // Ignore individual job errors
      }
    }

    // Remove COMPLETED jobs from CSV (they're done, SQL has the record)
    const completedJobIds = csvJobs.filter(j => j.status === 'COMPLETED').map(j => j.job_id);
    if (completedJobIds.length > 0) {
      const remainingJobs = csvJobs.filter(j => j.status !== 'COMPLETED');
      await writeLocalJobsCsv(remainingJobs, true); // forceWrite to ensure removal
      console.log(`[Bloomberg] Removed ${completedJobIds.length} completed jobs from CSV: ${completedJobIds.join(', ')}`);
    }

  } catch (err) {
    console.error('[Bloomberg] Error importing job status:', err.message);
  }
}

/**
 * Process completed queue - scan colaPendientes and create BBG jobs or archive
 * Calls sandbox.sp_Process_Completed_Queue
 */
async function processCompletedQueue() {
  try {
    const pool = await getBBGPool();

    const result = await pool.request()
      .execute('sandbox.sp_Process_Completed_Queue');

    const summary = result.recordset[0];

    if (summary && (summary.bbg_jobs_created > 0 || summary.non_bbg_archived > 0)) {
      console.log(`[Bloomberg] Queue processed: ${summary.bbg_jobs_created} BBG jobs created, ` +
                  `${summary.bbg_instruments_queued} instruments queued, ` +
                  `${summary.non_bbg_archived} non-BBG archived`);
    }

  } catch (err) {
    // Silently ignore if SP doesn't exist yet
    if (err.message && err.message.includes('Could not find stored procedure')) {
      // SP not deployed yet - silent
    } else {
      console.error('[Bloomberg] Error processing completed queue:', err.message || err);
      if (err.originalError) console.error('[Bloomberg]   Original:', err.originalError.message);
    }
  }
}

/**
 * Archive processed cashflows - move instruments with imported cashflows to historicos
 * Calls sandbox.sp_Archive_Processed_Cashflows
 */
async function archiveProcessedCashflows() {
  try {
    const pool = await getBBGPool();

    const result = await pool.request()
      .execute('sandbox.sp_Archive_Processed_Cashflows');

    const archived = result.recordset[0]?.instruments_archived || 0;

    if (archived > 0) {
      console.log(`[Bloomberg] Archived ${archived} instruments with imported cashflows`);
    }

  } catch (err) {
    // Silently ignore if SP doesn't exist yet
    if (err.message && err.message.includes('Could not find stored procedure')) {
      // SP not deployed yet - silent
    } else {
      console.error('[Bloomberg] Error archiving processed cashflows:', err.message || err);
      if (err.originalError) console.error('[Bloomberg]   Original:', err.originalError.message);
    }
  }
}

/**
 * Start background polling
 */
function startBackgroundJobs() {
  console.log('[Bloomberg] Starting background sync jobs...');
  console.log(`[Bloomberg] Local folder: ${LOCAL_FOLDER}`);
  console.log(`[Bloomberg] Poll interval: ${POLL_INTERVAL_MS}ms`);

  ensureLocalFolder();

  setInterval(async () => {
    await importJobStatusFromCSV();    // First sync completed job status from CSV → SQL
    await exportPendingJobsToCSV();    // Then export pending jobs from SQL → CSV
    await importCashflowsFromCSV();    // Import cashflows from CSV → SQL
    await processCompletedQueue();     // Process completed colaPendientes, create BBG jobs
    await archiveProcessedCashflows(); // Archive instruments with imported cashflows
  }, POLL_INTERVAL_MS);

  console.log('[Bloomberg] Background jobs started');
}

// Start background jobs when module loads
startBackgroundJobs();

module.exports = router;
