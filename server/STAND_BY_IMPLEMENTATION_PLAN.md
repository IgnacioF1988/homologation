# Implementation Plan: Fund Stand-By Logic for Dirty Records (Suciedades)

## Executive Summary

**Task**: Implement the missing stand-by/pause logic for fondos that have dirty records (suciedades) detected during IPA processing. When IPA_03 or IPA_04 detects records with [CXC/CXP?] flags or other dirt conditions, the fondo should be paused for operator review before continuing the pipeline.

**Current State**:
- ✅ Detection works (IPA_03_RenombrarCxCCxP_v2 marks [CXC/CXP?] field)
- ✅ Queue infrastructure exists (sandbox.colaAlertasSuciedades, Mission Control UI)
- ✅ Manual review flow exists (approve/reject/ignore)
- ❌ **Stand-by logic MISSING** - fondos continue pipeline even with pending dirty records

**User Requirement**: "Ese fondo debe quedar en stand by en el proceso" - Fund should be put on stand-by in the process when dirty records are detected

---

## Investigation Findings

### Legacy System (process_funds - Deleted)

**From Agent 1 findings:**
- Old system used `Incluir_En_Cubo` flag to exclude fondos from pipeline execution
- Legacy sync system (sync.routes.js - deleted commit 4b7e759) handled bidirectional queue management
- Fondos were moved to `sandbox.colaFondos` for manual assignment with `estado = 'pendiente'`
- After operator action → `estado = 'completado'` → synced back to pipeline

**Modern V2 System:**
- Uses `Incluir_En_Cubo` flag in `logs.Ejecucion_Fondos` table
- Fondos with `Incluir_En_Cubo = 0` are NOT loaded into FundOrchestrator
- No stand-by state exists - it's binary (included or excluded)

### Sandbox Schema Tables

**From Agent 2 findings:**

**Primary Queue Table:**
- `sandbox.colaAlertasSuciedades` - Dirty records queue (162 items, 6 pending)
- Columns: `id`, `estado`, `investId`, `portfolio`, `qty`, `fechaProceso`, `observaciones`, `accion`

**Related Tables:**
- `sandbox.Alertas_Suciedades_IPA` - Granular dirty record tracking
- `stock.Suciedades` - Final storage after approval
- `sandbox.Fondos_Problema` - Tracks funds with processing errors

**Queue States:**
- `pendiente` - Awaiting operator review
- `en_proceso` - Currently being reviewed
- `completado` - Resolved and written to dimensional
- `aprobado` - Confirmed as dirty
- `rechazado` - Rejected/not dirty

### Dirty Records Workflow

**From Agent 3 findings:**

**Detection Flow:**
1. IPA_03_RenombrarCxCCxP_v2 SP executes
2. Marks records with `[CXC/CXP?]` field ('CXC' or 'CXP')
3. Records remain in `staging.IPA_WorkTable` (temporary)
4. **⚠️ MISSING**: Should insert into `sandbox.colaAlertasSuciedades`
5. **⚠️ MISSING**: Should mark fund as "En_Espera"
6. **⚠️ MISSING**: Should block pipeline progression

**Resolution Flow (Exists):**
- `GET /api/sandbox-queues/suciedades` - Fetch dirty records
- `PATCH /api/sandbox-queues/suciedades/:id` - Operator updates (approve/reject)
- `POST /api/sandbox-queues/suciedades/resolve` - Writes to `stock.Suciedades` if approved
- **⚠️ MISSING**: Should resume fund after resolution

**Key Files:**
- API: `server/routes/sandboxQueues.routes.js`
- Frontend: `src/components/MissionControl/index.jsx`
- SP Config: `server/config/pipeline.config.yaml:118-123` (IPA_03)
- Service: `server/services/pipeline/IPAService.js`

---

## Recommended Implementation Approach

### Option A: Soft Pause with State Flag (RECOMMENDED)

**Rationale**: Minimal changes, leverages existing infrastructure, reversible

**Mechanism:**
1. Add `Estado_Suciedad` field to `logs.Ejecucion_Fondos` table
   - Values: `NULL` (no dirt), `PENDIENTE` (awaiting review), `APROBADO` (resolved)
2. When IPA_03/IPA_04 detects dirty records:
   - Insert records into `sandbox.colaAlertasSuciedades`
   - Update `Estado_Suciedad = 'PENDIENTE'` for the fund
   - Continue to IPA_05-07 (non-blocking initially)
3. Before CAPM stage:
   - Check `Estado_Suciedad`
   - If `PENDIENTE` → skip CAPM/PNL stages
   - Mark fund as `Estado_Process_CAPM = 'EN_ESPERA'`
4. After operator resolution (`/sandbox-queues/suciedades/resolve`):
   - Update `Estado_Suciedad = 'APROBADO'`
   - Trigger resume mechanism (manual or automatic)

**Pros:**
- Non-invasive (doesn't modify SP logic)
- Reversible (can disable with config flag)
- Allows IPA to complete (useful for data validation)
- Clear separation of concerns

**Cons:**
- Fund completes IPA but waits at CAPM boundary
- Requires resume mechanism

### Option B: Hard Pause Mid-IPA (Alternative)

**Rationale**: Immediate halt on detection, prevents wasted processing

**Mechanism:**
1. Modify IPA_04_TratamientoSuciedades_v2 SP:
   - After processing, count dirty records in `staging.IPA_WorkTable` WHERE `[CXC/CXP?]` IS NOT NULL
   - If count > 0 → return special return value (e.g., `returnValue = 5` for "Stand-By Required")
2. In `BasePipelineService.js:executeSP()`:
   - Handle `returnValue === 5`:
     - Insert dirty records into `sandbox.colaAlertasSuciedades`
     - Update `Estado_Process_IPA = 'EN_ESPERA_SUCIEDADES'`
     - Throw special exception to halt pipeline
3. FundOrchestrator catches exception, marks fund as paused
4. Resume flow same as Option A

**Pros:**
- Immediate halt (no wasted processing)
- Clear signal to operator
- SP-driven logic (closer to data)

**Cons:**
- More invasive (modifies SP and service layer)
- Harder to rollback
- Requires careful transaction management

---

## Recommended Implementation Plan

**Using Option A (Soft Pause with State Flag)**

### Phase 1: Database Schema Changes

**1.1. Add Estado_Suciedad field**
```sql
-- In logs.Ejecucion_Fondos table
ALTER TABLE logs.Ejecucion_Fondos
ADD Estado_Suciedad NVARCHAR(20) NULL;

-- Possible values: NULL, 'PENDIENTE', 'APROBADO', 'RECHAZADO'
```

**1.2. Add indexes for performance**
```sql
CREATE NONCLUSTERED INDEX IX_Ejecucion_Fondos_Estado_Suciedad
ON logs.Ejecucion_Fondos(ID_Ejecucion, Estado_Suciedad)
INCLUDE (ID_Fund);
```

### Phase 2: Detection and Queue Insertion Logic

**2.1. Modify IPA_04_TratamientoSuciedades_v2 SP**

Add logic to insert dirty records into sandbox queue:

```sql
-- After identifying dirty records in staging.IPA_WorkTable
-- Insert into sandbox.colaAlertasSuciedades
INSERT INTO sandbox.colaAlertasSuciedades (
    investId, portfolio, qty, fechaReporte, estado, fechaIngreso
)
SELECT
    InvestID,
    Portfolio,
    Qty,
    FechaReporte,
    'pendiente',
    GETDATE()
FROM staging.IPA_WorkTable
WHERE ID_Ejecucion = @ID_Ejecucion
  AND ID_Fund = @ID_Fund
  AND [CXC/CXP?] IS NOT NULL;

-- Count dirty records
DECLARE @DirtyCount INT;
SELECT @DirtyCount = @@ROWCOUNT;

-- Update fund estado if dirty records found
IF @DirtyCount > 0
BEGIN
    UPDATE logs.Ejecucion_Fondos
    SET Estado_Suciedad = 'PENDIENTE'
    WHERE ID_Ejecucion = @ID_Ejecucion
      AND ID_Fund = @ID_Fund;

    -- Return special code indicating stand-by required
    RETURN 1;  -- Warning: dirty records detected
END
```

**2.2. Update BasePipelineService.js to log stand-by state**

```javascript
// In executeSP(), after line 227 (returnValue === 1 handling)
if (returnValue === 1 && spName.includes('TratamientoSuciedades')) {
  await this.logWarning(idEjecucion, fund.ID_Fund,
    `${spName} detected dirty records - fund marked for stand-by review`);

  // Update tracking field
  await this.updateSubState(idEjecucion, fund.ID_Fund,
    'Estado_Suciedad', 'PENDIENTE');
}
```

### Phase 3: Pipeline Blocking Logic

**3.1. Add conditional check before CAPM**

Modify `FundOrchestrator.js:_executeFundServices()`:

```javascript
// Before executing service, check for stand-by state
async _executeFundServices(fund, services) {
  for (const serviceId of services) {
    const service = this.services.get(serviceId);

    // Check if fund is in stand-by due to dirty records
    if (serviceId === 'PROCESS_CAPM' && await this._isFundInStandBy(fund)) {
      await this.logWarning(
        this.idEjecucion,
        fund.ID_Fund,
        `Skipping CAPM - fund has pending dirty records for operator review`
      );

      await this.tracker.updateFundState(
        this.idEjecucion,
        fund.ID_Fund,
        'Estado_Process_CAPM',
        'EN_ESPERA_SUCIEDADES'
      );

      continue;  // Skip CAPM and subsequent stages
    }

    // Execute service normally
    await this._executeService(fund, service);
  }
}

async _isFundInStandBy(fund) {
  const result = await this.pool.request()
    .input('ID_Ejecucion', sql.BigInt, this.idEjecucion)
    .input('ID_Fund', sql.Int, fund.ID_Fund)
    .query(`
      SELECT Estado_Suciedad
      FROM logs.Ejecucion_Fondos
      WHERE ID_Ejecucion = @ID_Ejecucion
        AND ID_Fund = @ID_Fund
    `);

  return result.recordset[0]?.Estado_Suciedad === 'PENDIENTE';
}
```

### Phase 4: Resume Mechanism

**4.1. Modify resolve endpoint to update Estado_Suciedad**

In `sandboxQueues.routes.js`, after resolving dirty record:

```javascript
// After line 510 (after updating queue item to completado)
// Update fund estado_suciedad
const fundUpdateResult = await pool2.request()
  .input('Portfolio', sql.NVarChar, resolvedItem.portfolio)
  .query(`
    UPDATE ef
    SET Estado_Suciedad = 'APROBADO'
    FROM logs.Ejecucion_Fondos ef
    INNER JOIN config.Fondos f ON ef.ID_Fund = f.ID_Fund
    WHERE f.Portfolio_Geneva = @Portfolio
      AND ef.Estado_Suciedad = 'PENDIENTE'
      AND ef.ID_Ejecucion = (
        SELECT MAX(ID_Ejecucion)
        FROM logs.Ejecucion_Fondos
        WHERE ID_Fund = ef.ID_Fund
      )
  `);

// Log update
console.log(`[sandboxQueues] Fund estado updated to APROBADO for portfolio ${resolvedItem.portfolio}`);
```

**4.2. Add resume endpoint**

New endpoint to manually resume paused funds:

```javascript
// POST /api/procesos/v2/:idEjecucion/resume/:idFund
router.post('/v2/:idEjecucion/resume/:idFund', async (req, res) => {
  const { idEjecucion, idFund } = req.params;

  try {
    // Verify estado_suciedad is APROBADO
    const checkResult = await pool.request()
      .input('ID_Ejecucion', sql.BigInt, idEjecucion)
      .input('ID_Fund', sql.Int, idFund)
      .query(`
        SELECT Estado_Suciedad, Estado_Process_IPA, Estado_Process_CAPM
        FROM logs.Ejecucion_Fondos
        WHERE ID_Ejecucion = @ID_Ejecucion
          AND ID_Fund = @ID_Fund
      `);

    const estado = checkResult.recordset[0];

    if (estado.Estado_Suciedad !== 'APROBADO') {
      return res.status(400).json({
        error: 'Cannot resume: dirty records not yet approved'
      });
    }

    if (estado.Estado_Process_CAPM !== 'EN_ESPERA_SUCIEDADES') {
      return res.status(400).json({
        error: 'Fund is not in stand-by state'
      });
    }

    // Load fund data
    const fondoResult = await pool.request()
      .input('ID_Fund', sql.Int, idFund)
      .query(`SELECT * FROM config.Fondos WHERE ID_Fund = @ID_Fund`);

    const fondo = fondoResult.recordset[0];

    // Resume from CAPM stage
    // TODO: Implement resume logic with FundOrchestrator
    // For now, return success

    res.json({
      success: true,
      message: `Fund ${idFund} ready to resume from CAPM stage`
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

### Phase 5: Frontend Integration

**5.1. Add stand-by indicator in Mission Control**

Modify `MissionControl/index.jsx`:

```javascript
// Add new queue type for funds in stand-by
const QUEUE_CONFIG = {
  // ... existing queues
  fondosEnEspera: {
    displayName: 'Fondos En Espera',
    icon: 'pause',
    color: '#F59E0B',  // Orange for stand-by
  }
};

// Fetch count of funds in stand-by
const fetchStandByFunds = async () => {
  const result = await axios.get('/api/procesos/v2/fondos-en-espera');
  return result.data.count;
};
```

**5.2. Add resume button in PipelineExecutionContainer**

Add action button next to fund card to resume after operator approval.

---

## Critical Files for Modification

### Backend
1. **server/database/migrations/ADD_ESTADO_SUCIEDAD.sql** - New migration for schema change
2. **Database SP: staging.IPA_04_TratamientoSuciedades_v2** - Insert dirty records to queue
3. **server/services/pipeline/BasePipelineService.js** - Log stand-by warnings
4. **server/services/orchestration/FundOrchestrator.js** - Add stand-by check before CAPM
5. **server/routes/sandboxQueues.routes.js** - Update Estado_Suciedad on resolution
6. **server/routes/procesos.v2.routes.js** - Add resume endpoint

### Frontend
7. **src/components/MissionControl/index.jsx** - Add stand-by queue indicator
8. **src/components/PipelineV2/PipelineExecutionContainer.jsx** - Add resume button

---

## Testing Strategy

### Unit Tests
1. Test IPA_04 SP with dirty records → should insert to sandbox.colaAlertasSuciedades
2. Test Estado_Suciedad update → should set to 'PENDIENTE'
3. Test stand-by check → should skip CAPM when Estado_Suciedad='PENDIENTE'

### Integration Tests
1. Execute pipeline with fondo containing dirty records
2. Verify fondo pauses at CAPM stage
3. Operator approves dirty records via Mission Control
4. Verify Estado_Suciedad updates to 'APROBADO'
5. Manually resume fondo
6. Verify CAPM and PNL complete successfully

### Edge Cases
1. Fondo with NO dirty records → should proceed normally
2. Operator rejects dirty record → Estado_Suciedad should be 'RECHAZADO'
3. Multiple fondos with dirty records → each should pause independently
4. Resume without operator approval → should reject with error

---

## Rollback Plan

If implementation causes issues:

1. **Database rollback:**
   ```sql
   ALTER TABLE logs.Ejecucion_Fondos DROP COLUMN Estado_Suciedad;
   ```

2. **Code rollback:**
   - Revert changes to IPA_04 SP
   - Revert FundOrchestrator.js changes
   - Disable stand-by check with config flag

3. **Fallback behavior:**
   - Fondos continue pipeline even with dirty records
   - Operator can still review via Mission Control (manual process)

**Time to rollback:** 30 minutes

---

## Success Criteria

**Must-Have:**
- ✅ Fondos with dirty records pause at CAPM stage
- ✅ Estado_Suciedad field tracks stand-by state
- ✅ Operator can review and approve dirty records via Mission Control
- ✅ After approval, Estado_Suciedad updates to 'APROBADO'
- ✅ Fondos without dirty records proceed normally

**Should-Have:**
- ✅ Resume endpoint allows restarting paused fondos
- ✅ Frontend displays stand-by indicator
- ✅ Logging shows stand-by reason clearly

**Nice-to-Have:**
- ✅ Automatic resume after operator approval (no manual trigger)
- ✅ Email/Slack notification when fondo enters stand-by
- ✅ Dashboard showing all fondos in stand-by state

---

## Estimated Effort

**Phase 1 (Schema)**: 1 hour
**Phase 2 (Detection)**: 3 hours
**Phase 3 (Blocking)**: 2 hours
**Phase 4 (Resume)**: 2 hours
**Phase 5 (Frontend)**: 2 hours
**Testing**: 2 hours

**Total**: 12 hours (1.5 days)
**Confidence**: High (90%)

---

## Open Questions for User

Before proceeding with implementation, please clarify:

1. **Stand-by timing**: Should the fondo pause:
   - **Immediately after IPA_04** (before IPA_05-07)?
   - **Before CAPM** (after completing all IPA steps)?
   - Recommended: Before CAPM (allows IPA to complete for data validation)

2. **Resume mechanism**: How should fondos resume?
   - **Automatic** (as soon as operator approves dirty records)?
   - **Manual** (operator clicks "Resume" button)?
   - **Scheduled** (resume during next pipeline execution)?
   - Recommended: Manual first, then automatic later

3. **Dirty record types**: Should ALL of these trigger stand-by?
   - Records with `[CXC/CXP?]` marked (from IPA_03)
   - Zero-quantity positions (from IPA_04)
   - Descuadres (IPA-Derivados discrepancies)
   - Recommended: Start with [CXC/CXP?] only, expand later

4. **Multi-user**: Can multiple operators work on different fondos' dirty records simultaneously?
   - Recommended: Yes, `en_proceso` state prevents conflicts

5. **Legacy data**: What about existing fondos in sandbox.colaAlertasSuciedades?
   - Should we backfill Estado_Suciedad for historical executions?
   - Recommended: No, only for new executions forward
