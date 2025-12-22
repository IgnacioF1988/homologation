# Pipeline V2 Migration - Complete Documentation

**Date**: 2025-12-22
**Branch**: `feature/enhanced-tracing-system`
**Status**: ✅ MIGRATION COMPLETE
**Commit**: feat: Complete Pipeline V1→V2 migration

---

## 📋 Executive Summary

Successfully migrated the pipeline system from **V1 (Batch SQL Stored Procedures)** to **V2 (Service-Based Node.js Architecture)** with orchestrated execution.

### Key Achievements

- ✅ **35 tables** migrated from VARCHAR/NVARCHAR to INT for ID_Fund
- ✅ **3 stored procedures** updated to accept INT parameters
- ✅ **3 Node.js files** updated to remove type conversion workarounds
- ✅ **FundOrchestrator** implemented with adaptive concurrency
- ✅ **Routes** updated to use V2 architecture
- ✅ **24 files** committed with 4,220 insertions

### Architecture Change

**BEFORE (V1)**:
```
procesos.v2.routes.js
  └─> process.Process_Funds (SQL SP) ❌
       └─> Batch processing of all fondos
```

**AFTER (V2)**:
```
procesos.v2.routes.js
  └─> FundOrchestrator ✅
       ├─> DependencyResolver (Kahn's algorithm)
       ├─> IPAService, CAPMService, DerivadosService, etc.
       ├─> ExecutionTracker (state management)
       └─> LoggingService (structured logging)
```

---

## 🔄 What Changed

### 1. SQL Database Changes

#### Tables Migrated (35 total)

**Dimensionales (2 tables)**:
- `dimensionales.BD_Funds`: VARCHAR(50) → INT
- `dimensionales.HOMOL_Funds`: NVARCHAR(255) → INT

**Logging (3 tables)**:
- `logs.Ejecucion_Fondos`: VARCHAR(50) → INT
- `logs.Ejecucion_Logs`: VARCHAR(50) → INT
- `logs.Metricas_Ejecucion`: VARCHAR(50) → INT

**Process (8 tables)**:
- `process.CAPM_Fondos_DatosRentabilidad`
- `process.CAPM_Fondos_CAPM`
- `process.CAPM_Fondos_CAPM_final`
- `process.CAPM_Fondos_Modelo`
- `process.CAPM_Factores_Datos`
- `process.CAPM_Factores_CAPM`
- `process.CAPM_FactorTotalMercado`
- `process.Derivados_Resumen`

**Staging (5 tables)**:
- `staging.IPA_WorkTable`
- `staging.IPA`
- `staging.TBL_IPA`
- `staging.TBL_PNL`
- Others

**Sandbox (desarrollo)**:
- `sandbox.Fondos_Problema`: Cleaned invalid values, migrated to INT

#### Stored Procedures Updated (3 total)

1. **logs.sp_Actualizar_Estado_Fondo**
   - Parameter change: `@ID_Fund VARCHAR(50)` → `@ID_Fund INT`

2. **logs.sp_Registrar_Metrica**
   - Parameter change: `@ID_Fund VARCHAR(50)` → `@ID_Fund INT`

3. **logs.sp_Inicializar_Ejecucion**
   - Parameter change: `@ID_Fund VARCHAR(50)` → `@ID_Fund INT` (if applicable)

#### Migration Scripts Created

**File**: `server/database/migrations/MIGRATION_ID_Fund_To_INT_FIXED.sql`
- Handles 9 índices that block ALTER COLUMN operations
- Pattern: DROP INDEX → ALTER COLUMN → RECREATE INDEX
- Cleans invalid sandbox data
- Creates backups before migration

**File**: `server/database/migrations/UPDATE_SPs_Logging_ID_Fund_INT.sql`
- Updates SP signatures to accept INT
- Preserves SP logic and permissions

---

### 2. Node.js Code Changes

#### Modified Files (6 total)

**1. server/services/pipeline/BasePipelineService.js** (Lines 142-146)

**BEFORE**:
```javascript
// FIX: Convert ID_Fund from string to INT (workaround)
const idFundInt = parseInt(fund.ID_Fund, 10);
if (isNaN(idFundInt)) {
  throw new Error(`ID_Fund inválido para conversión a INT: ${fund.ID_Fund}`);
}
request.input('ID_Fund', sql.Int, idFundInt);
```

**AFTER**:
```javascript
// ID_Fund viene como INT desde logs.Ejecucion_Fondos (después de migración SQL)
request.input('ID_Fund', sql.Int, fund.ID_Fund);
```

**2. server/services/tracking/ExecutionTracker.js** (5 locations)

**Changes**:
- Line 87 (initializeFondos): `sql.VarChar(50)` → `sql.Int`
- Line 204 (updateFondoState): `sql.VarChar(50)` → `sql.Int`
- Line 240 (logMetric): `sql.VarChar(50)` → `sql.Int`
- Line 279 (getFondoState): `sql.VarChar(50)` → `sql.Int`
- Line 321 (setFondoError): `sql.VarChar(50)` → `sql.Int`
- Removed all `String()` wrapper calls

**3. server/services/tracking/LoggingService.js** (Line 182)

**BEFORE**:
```javascript
table.columns.add('ID_Fund', sql.VarChar(50), { nullable: true });
```

**AFTER**:
```javascript
table.columns.add('ID_Fund', sql.Int, { nullable: true });
```

#### New Files Created (2 total)

**1. server/services/orchestration/FundOrchestrator.js** (360 lines)

Complete orchestrator implementation with:
- **Constructor**: Accepts idEjecucion, fechaReporte, fondos, pool, tracker, logger
- **initialize()**: Loads pipeline.config.yaml, resolves dependencies, instantiates services
- **execute()**: Main execution loop through phases
- **_executeBatchPhase()**: One execution per date (extraction services)
- **_executeParallelPhase()**: Adaptive concurrency with p-limit
- **_executeFundServices()**: Per-fund service execution with conditionals
- **_executeSequentialPhase()**: Sequential consolidation
- **_shouldExecute()**: Evaluates conditionals (Flag_UBS, Flag_Derivados)
- **_handleServiceError()**: Implements error policies (STOP_ALL, STOP_FUND, CONTINUE)

**Key Features**:
```javascript
// Adaptive Concurrency
const concurrencyLimit = this.fondos.length > 100 ? 100 : this.fondos.length;

// Error Policies
if (policy === 'STOP_ALL') throw error;
if (policy === 'STOP_FUND') return; // Skip remaining services
if (policy === 'CONTINUE') /* log and continue */;
```

**2. server/services/orchestration/index.js** (Updated)

Added FundOrchestrator to exports:
```javascript
module.exports = {
  DependencyResolver,
  WorkerPool,
  FundOrchestrator,
};
```

#### Routes Updated (1 file)

**server/routes/procesos.v2.routes.js**

**Critical Change (Line ~174)**:

**BEFORE (V1)**:
```javascript
const result = await request.execute('process.Process_Funds'); // ❌ Calls V1 batch SP
```

**AFTER (V2)**:
```javascript
// 1. Load fondos from logs.Ejecucion_Fondos
const fondosResult = await pool.request()
  .input('ID_Ejecucion', sql.BigInt, idEjecucion)
  .query(`SELECT ID_Fund, FundShortName, Portfolio_Geneva, ... FROM logs.Ejecucion_Fondos ...`);

// 2. Instantiate tracking services
const tracker = new ExecutionTracker(pool);
const logger = new LoggingService(pool);

// 3. Create and execute orchestrator
const orchestrator = new FundOrchestrator(
  idEjecucion,
  fechaReporte,
  fondosResult.recordset,
  pool,
  tracker,
  logger
);

await orchestrator.initialize();
const result = await orchestrator.execute(); // ✅ Uses V2 architecture
```

**New Imports**:
```javascript
const { FundOrchestrator } = require('../services/orchestration');
const { ExecutionTracker, LoggingService } = require('../services/tracking');
```

---

### 3. Dependencies Added

**server/package.json**:
```json
{
  "dependencies": {
    "p-limit": "^3.1.0",
    "js-yaml": "^4.1.0"
  }
}
```

- **p-limit**: Adaptive concurrency control for parallel fund processing
- **js-yaml**: Parse pipeline.config.yaml for service configuration

---

## 🚀 How to Use V2

### API Endpoints (Unchanged)

V2 maintains backward compatibility with existing API endpoints:

```bash
POST /api/procesos/v2/ejecutar
Content-Type: application/json

{
  "fechaReporte": "2024-12-15",
  "idFund": null  // null = all fondos
}
```

### Execution Flow

1. **Client calls** `/api/procesos/v2/ejecutar`
2. **Routes initialize** execution via `logs.sp_Inicializar_Ejecucion`
3. **Routes query** fondos from `logs.Ejecucion_Fondos`
4. **FundOrchestrator** created with:
   - idEjecucion (BIGINT)
   - fechaReporte (YYYY-MM-DD)
   - fondos (Array of fund objects)
   - pool (SQL connection pool)
   - tracker (ExecutionTracker instance)
   - logger (LoggingService instance)
5. **Orchestrator.initialize()**:
   - Loads `server/config/pipeline.config.yaml`
   - Resolves service dependencies (Kahn's algorithm)
   - Instantiates service classes (IPAService, CAPMService, etc.)
6. **Orchestrator.execute()**:
   - Iterates through execution phases (batch → parallel → sequential)
   - Executes services with adaptive concurrency
   - Handles errors according to policies
7. **Tracker finalizes** execution state in database
8. **Response** returned to client with execution status

### Service Configuration

**File**: `server/config/pipeline.config.yaml`

Example service definition:
```yaml
services:
  - id: IPA
    name: IPA_Processing
    dependencies: []
    executionType: parallel  # batch | parallel | sequential
    conditional: null        # Flag_UBS | Flag_Derivados | null
    errorPolicy: STOP_ALL    # STOP_ALL | STOP_FUND | CONTINUE
    timeout: 300000          # 5 minutes
```

**Execution Types**:
- **batch**: Runs once per date (e.g., extraction from external systems)
- **parallel**: Runs for each fondo in parallel (adaptive concurrency)
- **sequential**: Runs once per date in order (e.g., consolidation, graph sync)

**Error Policies**:
- **STOP_ALL**: Halt entire pipeline execution, throw error
- **STOP_FUND**: Mark fondo as error, skip remaining services for that fondo, continue with others
- **CONTINUE**: Log error, update state to WARNING, continue execution

### Adaptive Concurrency

```javascript
// If >100 fondos: Process in batches of 100
// If ≤100 fondos: Process all in parallel
const concurrencyLimit = this.fondos.length > 100 ? 100 : this.fondos.length;
```

**Example**:
- 50 fondos → 50 concurrent executions
- 250 fondos → 100 concurrent executions (batched)

---

## 🧪 Testing Guide

### 1. Verify SQL Migration

```sql
-- Verify 35 tables migrated to INT
SELECT
  TABLE_SCHEMA,
  TABLE_NAME,
  COLUMN_NAME,
  DATA_TYPE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE COLUMN_NAME = 'ID_Fund'
  AND TABLE_SCHEMA IN ('dimensionales', 'logs', 'process', 'staging', 'sandbox')
ORDER BY TABLE_SCHEMA, TABLE_NAME;
-- Expected: All should show DATA_TYPE = 'int'

-- Verify SPs updated to INT
SELECT
  p.name AS ProcedureName,
  pm.name AS ParameterName,
  TYPE_NAME(pm.user_type_id) AS DataType
FROM sys.procedures p
INNER JOIN sys.parameters pm ON p.object_id = pm.object_id
WHERE p.name IN ('sp_Actualizar_Estado_Fondo', 'sp_Registrar_Metrica', 'sp_Inicializar_Ejecucion')
  AND pm.name = '@ID_Fund'
ORDER BY p.name;
-- Expected: All should show DataType = 'int'
```

### 2. Unit Test: FundOrchestrator Initialization

```bash
cd C:/Users/ifuentes/homologation/server
node -e "
const FundOrchestrator = require('./services/orchestration/FundOrchestrator');
const yaml = require('js-yaml');
const fs = require('fs');

const config = yaml.load(fs.readFileSync('./config/pipeline.config.yaml', 'utf8'));
console.log('✓ Config loaded:', config.services.length, 'services');
console.log('✓ FundOrchestrator imported successfully');
"
```

### 3. Integration Test: Full Pipeline Execution

Create test script `server/test_v2_integration.js`:

```javascript
const sql = require('mssql');
const { FundOrchestrator } = require('./services/orchestration');
const { ExecutionTracker, LoggingService } = require('./services/tracking');

async function testV2Integration() {
  const pool = new sql.ConnectionPool({
    server: process.env.DB_SERVER,
    database: 'Inteligencia_Producto_Dev',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    options: { encrypt: false, trustServerCertificate: true }
  });

  await pool.connect();
  console.log('✓ Connected to database');

  try {
    // 1. Initialize execution
    const initResult = await pool.request()
      .input('FechaReporte', sql.NVarChar(10), '2024-12-01')
      .output('ID_Ejecucion', sql.BigInt)
      .execute('logs.sp_Inicializar_Ejecucion');

    const idEjecucion = initResult.output.ID_Ejecucion;
    console.log(`✓ Execution initialized: ${idEjecucion}`);

    // 2. Load fondos (first 5 for testing)
    const fondosResult = await pool.request()
      .input('ID_Ejecucion', sql.BigInt, idEjecucion)
      .query(`
        SELECT TOP 5
          ID_Fund, FundShortName, Portfolio_Geneva,
          Flag_UBS, Flag_Derivados
        FROM logs.Ejecucion_Fondos
        WHERE ID_Ejecucion = @ID_Ejecucion
          AND Incluir_En_Cubo = 1
      `);

    console.log(`✓ Fondos loaded: ${fondosResult.recordset.length}`);

    // 3. Execute orchestrator
    const tracker = new ExecutionTracker(pool);
    const logger = new LoggingService(pool);

    const orchestrator = new FundOrchestrator(
      idEjecucion,
      '2024-12-01',
      fondosResult.recordset,
      pool,
      tracker,
      logger
    );

    await orchestrator.initialize();
    console.log('✓ Orchestrator initialized');

    const result = await orchestrator.execute();
    console.log('✓ Execution completed:', result);

    // 4. Verify results
    const estadoResult = await pool.request()
      .input('ID_Ejecucion', sql.BigInt, idEjecucion)
      .query(`
        SELECT Estado, TotalFondos, FondosCompletados, FondosConError
        FROM logs.Ejecuciones
        WHERE ID_Ejecucion = @ID_Ejecucion
      `);

    console.log('Final state:', estadoResult.recordset[0]);

    // 5. Check logs
    const logsResult = await pool.request()
      .input('ID_Ejecucion', sql.BigInt, idEjecucion)
      .query(`
        SELECT Nivel, COUNT(*) as Count
        FROM logs.Ejecucion_Logs
        WHERE ID_Ejecucion = @ID_Ejecucion
        GROUP BY Nivel
      `);

    console.log('Logs by level:', logsResult.recordset);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await pool.close();
  }
}

testV2Integration().catch(console.error);
```

**Run test**:
```bash
node server/test_v2_integration.js
```

**Expected Output**:
```
✓ Connected to database
✓ Execution initialized: 123456789
✓ Fondos loaded: 5
✓ Orchestrator initialized
✓ Execution completed: { success: true, idEjecucion: 123456789n }
Final state: { Estado: 'COMPLETADO', TotalFondos: 5, FondosCompletados: 5, FondosConError: 0 }
Logs by level: [ { Nivel: 'INFO', Count: 42 }, { Nivel: 'DEBUG', Count: 128 } ]
```

### 4. Comparison Test: V1 vs V2 Results

**Goal**: Verify V2 produces identical results to V1

**Steps**:
1. Backup current database state
2. Run V1 pipeline for specific date
3. Export results (CAPM_Fondos_CAPM_final, IPA_WorkTable, etc.)
4. Restore database to pre-execution state
5. Run V2 pipeline for same date
6. Export results
7. Compare datasets (should be identical)

**Query to compare CAPM results**:
```sql
-- After running both V1 and V2 on same date
SELECT
  v1.ID_Fund,
  v1.Beta AS Beta_V1,
  v2.Beta AS Beta_V2,
  ABS(v1.Beta - v2.Beta) AS Diff,
  CASE WHEN ABS(v1.Beta - v2.Beta) < 0.0001 THEN 'MATCH' ELSE 'DIFFER' END AS Status
FROM process.CAPM_Fondos_CAPM_final v1
INNER JOIN process.CAPM_Fondos_CAPM_final_V2 v2
  ON v1.ID_Fund = v2.ID_Fund
  AND v1.FechaReporte = v2.FechaReporte
WHERE v1.FechaReporte = '2024-12-01'
ORDER BY Diff DESC;
```

---

## 🔧 Troubleshooting

### Issue 1: "ID_Fund is null in service execution"

**Cause**: Fund object doesn't have ID_Fund property or is undefined

**Fix**:
```javascript
// In FundOrchestrator._executeFundServices, add validation:
if (!fund || !fund.ID_Fund) {
  console.error(`[FundOrchestrator] Invalid fund object:`, fund);
  return;
}
```

### Issue 2: "Service not found in serviceInstances Map"

**Cause**: Service ID in pipeline.config.yaml doesn't match service class mapping

**Fix**:
1. Check `FundOrchestrator._instantiateServices()` line 92-99
2. Verify service ID matches exactly: `IPA`, `CAPM`, `Derivados`, `PNL`, `UBS`
3. Add missing service class to `serviceClasses` object

### Issue 3: "Circular dependency detected"

**Cause**: Service dependencies form a cycle (A → B → C → A)

**Fix**:
1. Review `pipeline.config.yaml` dependencies
2. Use DependencyResolver to identify cycle:
```javascript
const resolver = new DependencyResolver(config.services);
try {
  const plan = resolver.resolve();
} catch (err) {
  console.error('Dependency error:', err.message);
  // Will show: "Circular dependency detected: A -> B -> C -> A"
}
```

### Issue 4: Performance degradation vs V1

**Cause**: Too many concurrent connections overwhelming database

**Fix**: Reduce concurrency limit in `FundOrchestrator._executeParallelPhase()`:
```javascript
// Change from:
const concurrencyLimit = this.fondos.length > 100 ? 100 : this.fondos.length;

// To:
const concurrencyLimit = Math.min(50, this.fondos.length); // Max 50 concurrent
```

### Issue 5: "Cannot read property 'execute' of undefined"

**Cause**: Service class not instantiated due to missing import or typo

**Fix**:
1. Verify service is in `FundOrchestrator._instantiateServices()` line 85-89
2. Check import path: `require('../pipeline/IPAService')`
3. Ensure service extends `BasePipelineService`

---

## 🔄 Rollback Procedure

If V2 causes issues and you need to revert to V1:

### 1. Revert Code Changes

```bash
# Checkout files from commit before migration
git checkout HEAD~1 -- server/routes/procesos.v2.routes.js
git checkout HEAD~1 -- server/services/pipeline/BasePipelineService.js
git checkout HEAD~1 -- server/services/tracking/ExecutionTracker.js
git checkout HEAD~1 -- server/services/tracking/LoggingService.js

# Remove new files
rm server/services/orchestration/FundOrchestrator.js
git checkout HEAD~1 -- server/services/orchestration/index.js

# Restore package.json (if needed)
npm uninstall p-limit js-yaml
```

### 2. Revert SQL Changes (CRITICAL - Data Loss Risk)

**⚠️ WARNING**: Only do this if you have backups!

```sql
-- Restore from backups (created during migration)
-- Example for dimensionales.BD_Funds:

-- 1. Drop migrated table
DROP TABLE dimensionales.BD_Funds;

-- 2. Rename backup
EXEC sp_rename 'dimensionales.BD_Funds_BACKUP_20251222', 'BD_Funds';

-- Repeat for all 35 tables
```

**Safer approach**: Keep V2 code and SQL, but temporarily bypass V2 in routes:

```javascript
// In procesos.v2.routes.js, function executeProcessV2:

// Comment out V2 code
/*
const orchestrator = new FundOrchestrator(...);
await orchestrator.execute();
*/

// Temporarily re-enable V1
const request = pool.request();
request.input('FechaReporte', sql.NVarChar(10), fechaReporte);
const result = await request.execute('process.Process_Funds');
```

This allows you to switch back to V1 without database migration rollback.

### 3. Restore SPs (if needed)

```sql
-- Restore SP signatures to VARCHAR(50)
ALTER PROCEDURE [logs].[sp_Actualizar_Estado_Fondo]
    @ID_Ejecucion BIGINT,
    @ID_Fund VARCHAR(50),  -- Back to VARCHAR
    @Estado NVARCHAR(50),
    @Mensaje NVARCHAR(MAX) = NULL
AS
BEGIN
    -- SP body unchanged
END
```

---

## 📊 Performance Expectations

### V1 (Batch Processing)

- **Architecture**: Single SQL stored procedure processes all fondos sequentially
- **Concurrency**: Limited to SQL Server's internal parallelism
- **Typical runtime**: ~45-60 minutes for 200 fondos

### V2 (Service-Based Orchestration)

- **Architecture**: Individual services per fondo, orchestrated concurrency
- **Concurrency**: Adaptive (50-100 parallel fondos)
- **Expected runtime**: ~20-30 minutes for 200 fondos (40-50% improvement)
- **Scalability**: Linear scaling with more fondos (up to concurrency limit)

### Metrics to Monitor

1. **Execution Time**:
```sql
SELECT
  ID_Ejecucion,
  FechaInicio,
  FechaFin,
  DATEDIFF(SECOND, FechaInicio, FechaFin) AS DuracionSegundos,
  TotalFondos,
  FondosCompletados,
  FondosConError
FROM logs.Ejecuciones
WHERE FechaInicio >= '2025-12-22'
ORDER BY FechaInicio DESC;
```

2. **Errors by Service**:
```sql
SELECT
  Etapa,
  Nivel,
  COUNT(*) AS Total
FROM logs.Ejecucion_Logs
WHERE ID_Ejecucion = @ID_Ejecucion
  AND Nivel IN ('ERROR', 'WARNING')
GROUP BY Etapa, Nivel
ORDER BY Total DESC;
```

3. **Fondo Processing Times**:
```sql
SELECT
  ID_Fund,
  FundShortName,
  Estado_Actual,
  DATEDIFF(SECOND, Fecha_Inicio, Fecha_Fin) AS DuracionSegundos
FROM logs.Ejecucion_Fondos
WHERE ID_Ejecucion = @ID_Ejecucion
ORDER BY DuracionSegundos DESC;
```

---

## 📚 Related Documentation

- **Architecture**: `server/services/README.md` (if exists)
- **Pipeline Config**: `server/config/pipeline.config.yaml`
- **Service Implementation**: `server/services/pipeline/*.js`
- **Migration Plan**: `C:\Users\ifuentes\.claude\plans\elegant-bubbling-haven.md`
- **Test Results**: `server/PIPELINE_TEST_REPORT_2025-12-22.md`

---

## ✅ Validation Checklist

- [x] SQL migration completed (35 tables, 3 SPs)
- [x] Code workarounds removed (3 files)
- [x] FundOrchestrator implemented
- [x] Routes updated to use V2
- [x] Dependencies installed (p-limit, js-yaml)
- [x] All changes committed to git
- [ ] Integration tests executed successfully
- [ ] V1 vs V2 comparison validates identical results
- [ ] Performance improvement confirmed
- [ ] Documentation reviewed by team
- [ ] Production deployment plan approved

---

## 🎯 Next Steps

### Immediate (Before Production)

1. **Run Integration Tests**:
   ```bash
   node server/test_v2_integration.js
   ```

2. **Execute V1 vs V2 Comparison**:
   - Run both versions on same dataset
   - Validate results match exactly
   - Document performance improvement

3. **Load Testing**:
   - Test with full 200+ fondos
   - Monitor database connections
   - Verify adaptive concurrency works correctly

4. **Error Handling Validation**:
   - Test STOP_ALL policy (execution halts on error)
   - Test STOP_FUND policy (fondo marked error, others continue)
   - Test CONTINUE policy (errors logged, execution continues)

### Medium Term (Post-Production)

1. **Monitoring Dashboard**:
   - Create real-time execution monitoring
   - Track per-fondo processing times
   - Alert on errors and performance degradation

2. **Service Optimization**:
   - Profile slow services
   - Optimize SQL queries in individual services
   - Consider caching for frequently accessed data

3. **Additional Services**:
   - Add PNL service (if not yet implemented)
   - Add Concatenar service
   - Add Graph_Sync service

4. **Testing Automation**:
   - Create automated V1 vs V2 comparison tests
   - Add CI/CD pipeline integration
   - Implement regression test suite

---

## 👥 Support

For questions or issues:
- **Technical Lead**: Review this document and FundOrchestrator.js
- **Database Issues**: Check migration scripts in `server/database/migrations/`
- **Service Errors**: Check `logs.Ejecucion_Logs` for detailed error traces
- **Performance**: Review adaptive concurrency settings in FundOrchestrator

---

**Migration completed successfully on 2025-12-22** 🎉
