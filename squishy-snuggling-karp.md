# Plan: Solución al Problema de Concurrencia en el Pipeline

## Resumen Ejecutivo

**Problema Identificado**: El pipeline actual instancia la ejecución a nivel de PROCESO (un ID_Ejecucion global para todos los fondos de una fecha), cuando debería instanciar a nivel de FONDO (un ID_Ejecucion individual por cada fondo). Esto genera contención masiva cuando se ejecutan 50 fondos en paralelo.

**Evidencia**:
```javascript
// En procesos.v2.routes.js:104
ID_Fund: null  // ← TODOS los fondos comparten el mismo ID_Ejecucion
```

**Impacto**:
- Deadlocks y lock escalation en tablas extract.* y staging.*
- Duración excesiva (~25 min para 50 fondos)
- Error 3998 (uncommittable transactions) frecuente

---

## Hipótesis Validadas

### Hipótesis 1: Instanciación Incorrecta ✅ CONFIRMADA

**Hallazgo**:
```
ACTUAL:
  1 ID_Ejecucion (global) → 50 fondos ejecutándose en paralelo

ESPERADO:
  1 ID_Proceso (padre) → 50 ID_Ejecucion (hijos, uno por fondo)
```

**Evidencia en código** (`server/routes/procesos.v2.routes.js:157-164`):
```javascript
const orchestrator = new FundOrchestrator(
  idEjecucion,      // ← UN SOLO ID para TODOS los fondos
  fechaReporte,
  fondos,           // ← Array completo de 50 fondos
  pool, tracker, logger
);
```

### Hipótesis 2: Tablas Extract Sin Particionamiento ✅ CONFIRMADA

**Hallazgo**: 6 tablas críticas extract.* NO tienen columna ID_Fund:

| Tabla | Identificación Actual | Fondos Paralelos | Riesgo |
|-------|----------------------|------------------|--------|
| extract.IPA | FechaReporte + Portfolio | 50 | CRÍTICO |
| extract.CAPM | FechaReporte + Portfolio | 50 | CRÍTICO |
| extract.PosModRF | FechaReporte + Portfolio + InvestID | 50 | CRÍTICO |
| extract.SONA | FechaReporte + Portfolio | 50 | CRÍTICO |
| extract.Derivados | FechaReporte + Portfolio | 50 | CRÍTICO |
| extract.UBS | FechaReporte + Portfolio | ~10 | ALTO |

**Problema**: 50 fondos ejecutando simultáneamente:
```sql
SELECT * FROM extract.IPA
WHERE FechaReporte = '2025-10-24' AND Portfolio = 'FONDO_X'
```
→ Todos compiten por el mismo índice `IX_IPA_FechaReporte`

### Hipótesis 3: Tablas Staging Con Contención ✅ CONFIRMADA

**Hallazgo**: 13 tablas staging.* SÍ tienen ID_Ejecucion+ID_Fund, PERO:
- Los 50 fondos comparten el MISMO ID_Ejecucion
- Lock escalation a nivel de página/tabla
- No hay aislamiento real

**Tablas afectadas**:
- staging.IPA_WorkTable
- staging.CAPM_WorkTable
- staging.PNL_WorkTable
- staging.Derivados_WorkTable
- staging.UBS_WorkTable
- (8 más...)

### Hipótesis 4: Recursos Compartidos con Competencia ✅ CONFIRMADA

**Recursos compartidos identificados**:

1. **Pool de Conexiones SQL** (CRÍTICO)
   - Singleton global con max 300 conexiones
   - 50 fondos × ~6 conexiones/fondo = 300 conexiones en pico
   - Sin headroom para burst

2. **WebSocketManager** (ALTO)
   - Singleton con Maps no sincronizados
   - 50 fondos emitiendo eventos simultáneamente

3. **LoggingService Buffer** (MEDIO)
   - Buffer compartido sin locks
   - Race conditions en flush

4. **ExecutionTracker** (MEDIO)
   - 350 UPDATEs sin batching (50 fondos × 7 servicios)

---

## Estrategia de Solución

### Fase 1: Arquitectura de IDs Jerárquica

**Objetivo**: Implementar ID_Proceso (padre) + ID_Ejecucion (hijo por fondo)

#### Cambios en Base de Datos

**1. Nueva tabla logs.Procesos**:
```sql
CREATE TABLE logs.Procesos (
  ID_Proceso BIGINT PRIMARY KEY,
  FechaReporte NVARCHAR(10) NOT NULL,
  Estado NVARCHAR(20) NOT NULL DEFAULT 'EN_PROGRESO',
  Etapa_Actual NVARCHAR(50),
  FechaInicio DATETIME2 DEFAULT GETDATE(),
  FechaFin DATETIME2,
  TotalFondos INT,
  FondosExitosos INT DEFAULT 0,
  FondosFallidos INT DEFAULT 0,
  FondosOmitidos INT DEFAULT 0
);

CREATE INDEX IX_Procesos_FechaReporte ON logs.Procesos(FechaReporte);
```

**2. Modificar logs.Ejecuciones**:
```sql
ALTER TABLE logs.Ejecuciones
ADD ID_Proceso BIGINT,
    ID_Fund INT;

ALTER TABLE logs.Ejecuciones
ADD CONSTRAINT FK_Ejecuciones_Procesos
  FOREIGN KEY (ID_Proceso) REFERENCES logs.Procesos(ID_Proceso);

CREATE INDEX IX_Ejecuciones_Proceso ON logs.Ejecuciones(ID_Proceso);
CREATE INDEX IX_Ejecuciones_Fund ON logs.Ejecuciones(ID_Fund);
```

**3. Nuevo SP logs.sp_Inicializar_Proceso**:
```sql
CREATE PROCEDURE logs.sp_Inicializar_Proceso
  @FechaReporte NVARCHAR(10),
  @ID_Proceso BIGINT OUTPUT
AS
BEGIN
  -- 1. Crear proceso padre
  SET @ID_Proceso = CONVERT(BIGINT, CONVERT(BIGINT, GETDATE()));

  INSERT INTO logs.Procesos (ID_Proceso, FechaReporte, Estado, TotalFondos)
  SELECT
    @ID_Proceso,
    @FechaReporte,
    'EN_PROGRESO',
    COUNT(*)
  FROM dimensionales.BD_Funds
  WHERE Active = 1 AND Incluir_En_Cubo = 1;

  -- 2. Crear ejecuciones hijas (una por fondo)
  INSERT INTO logs.Ejecuciones (
    ID_Ejecucion, ID_Proceso, ID_Fund, FechaReporte, Estado
  )
  SELECT
    @ID_Proceso + ROW_NUMBER() OVER (ORDER BY ID_Fund), -- ID único
    @ID_Proceso,
    ID_Fund,
    @FechaReporte,
    'PENDIENTE'
  FROM dimensionales.BD_Funds
  WHERE Active = 1 AND Incluir_En_Cubo = 1;

  RETURN 0;
END;
```

#### Cambios en Backend

**Archivos a modificar**:

1. **server/routes/procesos.v2.routes.js** (líneas 60-220)

**Cambio principal**: Generar múltiples ID_Ejecucion (uno por fondo)

```javascript
// ANTES (línea 82-87):
const initResult = await pool.request()
  .input('FechaReporte', sql.NVarChar(10), fechaReporte)
  .output('ID_Ejecucion', sql.BigInt)
  .execute('logs.sp_Inicializar_Ejecucion');

const idEjecucion = initResult.output.ID_Ejecucion; // ← UN SOLO ID

// DESPUÉS:
const initResult = await pool.request()
  .input('FechaReporte', sql.NVarChar(10), fechaReporte)
  .output('ID_Proceso', sql.BigInt)
  .execute('logs.sp_Inicializar_Proceso');

const idProceso = initResult.output.ID_Proceso;

// Obtener todas las ejecuciones hijas
const ejecucionesResult = await pool.request()
  .input('ID_Proceso', sql.BigInt, idProceso)
  .query(`
    SELECT ID_Ejecucion, ID_Fund, FechaReporte
    FROM logs.Ejecuciones
    WHERE ID_Proceso = @ID_Proceso
    ORDER BY ID_Fund
  `);

const ejecuciones = ejecucionesResult.recordset; // Array de ejecuciones
```

**Cambio en executeProcessV2** (líneas 124-217):

**OPCIÓN A - Múltiples Orquestadores** (RECOMENDADO):
```javascript
async function executeProcessV2(pool, idProceso, fechaReporte) {
  // Obtener todas las ejecuciones del proceso
  const ejecucionesResult = await pool.request()
    .input('ID_Proceso', sql.BigInt, idProceso)
    .query(`
      SELECT e.ID_Ejecucion, e.ID_Fund,
             f.FundShortName, f.Portfolio_Geneva,
             f.Portfolio_CAPM, f.Portfolio_Derivados, f.Portfolio_UBS,
             f.Flag_UBS, f.Flag_Derivados
      FROM logs.Ejecuciones e
      INNER JOIN dimensionales.BD_Funds f ON e.ID_Fund = f.ID_Fund
      WHERE e.ID_Proceso = @ID_Proceso
    `);

  const ejecuciones = ejecucionesResult.recordset;

  const tracker = new ExecutionTracker(pool);
  const logger = new LoggingService(pool);

  // Crear un orquestador por cada fondo
  const orchestrators = ejecuciones.map(ejecucion => {
    return new FundOrchestrator(
      ejecucion.ID_Ejecucion,  // ← ID ÚNICO POR FONDO
      fechaReporte,
      [ejecucion],             // ← Array de UN SOLO fondo
      pool, tracker, logger
    );
  });

  // Inicializar todos
  await Promise.all(orchestrators.map(orc => orc.initialize()));

  // Ejecutar todos en paralelo
  const results = await Promise.all(
    orchestrators.map(orc => orc.execute().catch(err => ({error: err})))
  );

  // Actualizar estadísticas del proceso
  await updateProcesoStats(pool, idProceso);
}
```

**OPCIÓN B - Un Orquestador con Grupos** (Alternativa):
```javascript
// Dividir fondos en grupos de 10
const chunkSize = 10;
for (let i = 0; i < ejecuciones.length; i += chunkSize) {
  const chunk = ejecuciones.slice(i, i + chunkSize);

  // Crear orquestador para este grupo
  const orchestrator = new FundOrchestrator(
    chunk[0].ID_Ejecucion, // ID del primer fondo del grupo
    fechaReporte,
    chunk,
    pool, tracker, logger
  );

  await orchestrator.initialize();
  await orchestrator.execute();
}
```

2. **server/services/orchestration/FundOrchestrator.js**

**Cambio**: Validar que reciba UN SOLO fondo (si usamos Opción A)

```javascript
constructor(idEjecucion, fechaReporte, fondos, pool, tracker, logger) {
  // Validación nueva
  if (fondos.length !== 1) {
    throw new Error(
      `FundOrchestrator debe recibir exactamente 1 fondo. ` +
      `Recibió ${fondos.length}. Use múltiples orquestadores para múltiples fondos.`
    );
  }

  this.idEjecucion = idEjecucion;
  this.fechaReporte = fechaReporte;
  this.fondos = fondos;
  // ...resto igual
}
```

3. **server/services/tracking/ExecutionTracker.js**

**Agregar método para actualizar estadísticas del proceso**:

```javascript
async updateProcesoStats(idProceso) {
  await this.pool.request()
    .input('ID_Proceso', sql.BigInt, idProceso)
    .query(`
      UPDATE p SET
        FondosExitosos = stats.Exitosos,
        FondosFallidos = stats.Fallidos,
        FondosOmitidos = stats.Omitidos,
        Estado = CASE
          WHEN stats.Fallidos > 0 THEN 'COMPLETADO_CON_ERRORES'
          ELSE 'COMPLETADO'
        END,
        FechaFin = GETDATE()
      FROM logs.Procesos p
      CROSS APPLY (
        SELECT
          SUM(CASE WHEN Estado = 'COMPLETADO' THEN 1 ELSE 0 END) AS Exitosos,
          SUM(CASE WHEN Estado = 'ERROR' THEN 1 ELSE 0 END) AS Fallidos,
          SUM(CASE WHEN Estado = 'OMITIDO' THEN 1 ELSE 0 END) AS Omitidos
        FROM logs.Ejecuciones
        WHERE ID_Proceso = @ID_Proceso
      ) stats
      WHERE p.ID_Proceso = @ID_Proceso
    `);
}
```

### Fase 2: Parametrización de Tablas Extract.*

**Objetivo**: Agregar columna ID_Ejecucion a tablas extract.* para aislar datos por fondo

#### Opción Recomendada: Agregar ID_Ejecucion

**Ventajas**:
- Con la nueva arquitectura, cada fondo tiene su propio ID_Ejecucion
- Aislamiento automático sin necesidad de ID_Fund
- Queries más simples: `WHERE ID_Ejecucion = @ID`

**Cambios**:

```sql
-- 1. Agregar columna a tablas extract
ALTER TABLE extract.IPA ADD ID_Ejecucion BIGINT;
ALTER TABLE extract.CAPM ADD ID_Ejecucion BIGINT;
ALTER TABLE extract.PosModRF ADD ID_Ejecucion BIGINT;
ALTER TABLE extract.SONA ADD ID_Ejecucion BIGINT;
ALTER TABLE extract.Derivados ADD ID_Ejecucion BIGINT;
ALTER TABLE extract.UBS ADD ID_Ejecucion BIGINT;

-- 2. Crear nuevos índices
CREATE INDEX IX_IPA_Ejecucion ON extract.IPA(ID_Ejecucion, Portfolio);
CREATE INDEX IX_CAPM_Ejecucion ON extract.CAPM(ID_Ejecucion, Portfolio);
CREATE INDEX IX_PosModRF_Ejecucion ON extract.PosModRF(ID_Ejecucion, Portfolio, InvestID);
CREATE INDEX IX_SONA_Ejecucion ON extract.SONA(ID_Ejecucion, Portfolio);
CREATE INDEX IX_Derivados_Ejecucion ON extract.Derivados(ID_Ejecucion, Portfolio);
CREATE INDEX IX_UBS_Ejecucion ON extract.UBS(ID_Ejecucion, Portfolio);

-- 3. Modificar SPs de extracción
-- Ejemplo: extract.Extract_IPA
ALTER PROCEDURE extract.Extract_IPA
  @FechaReporte NVARCHAR(10),
  @ID_Ejecucion BIGINT  -- ← NUEVO PARÁMETRO
AS
BEGIN
  -- Mapear Portfolio → ID_Fund para obtener el ID_Ejecucion correcto
  INSERT INTO extract.IPA (ID_Ejecucion, Portfolio, FechaReporte, ...)
  SELECT
    @ID_Ejecucion,
    ipa_source.Portfolio,
    ipa_source.FechaReporte,
    ...
  FROM homol.IPA ipa_source
  WHERE ipa_source.FechaReporte = @FechaReporte
    AND ipa_source.Portfolio IN (
      SELECT e.Portfolio_Geneva
      FROM logs.Ejecuciones e
      WHERE e.ID_Ejecucion = @ID_Ejecucion
    );
END;
```

**Problema**: Los SPs de extracción son BATCH (una vez por fecha para todos los fondos)

**Solución**: Cambiar a extracción por fondo individual

```javascript
// En FundOrchestrator, fase BATCH → PARALLEL
async _executeBatchPhase(phase) {
  // ANTES: Ejecutar EXTRACCION una sola vez
  // DESPUÉS: Ejecutar EXTRACCION por cada fondo

  const limit = pLimit(50);

  const promises = this.fondos.map(fund =>
    limit(() => this._executeFundExtraction(fund))
  );

  await Promise.all(promises);
}

async _executeFundExtraction(fund) {
  // Ejecutar SPs de extracción pasando ID_Ejecucion del fondo
  await pool.request()
    .input('FechaReporte', sql.NVarChar(10), this.fechaReporte)
    .input('ID_Ejecucion', sql.BigInt, this.idEjecucion)
    .execute('extract.Extract_IPA');

  // ... Extract_CAPM, Extract_PosModRF, etc.
}
```

### Fase 3: Estrategia de Trace Records

**Objetivo**: Implementar sistema de trazabilidad para seguir el flujo de cada fondo y detectar uso compartido de recursos

#### Componentes

**1. Tabla de Trace Records**:

```sql
CREATE TABLE logs.Trace_Records (
  ID_Trace BIGINT IDENTITY(1,1) PRIMARY KEY,
  ID_Proceso BIGINT,
  ID_Ejecucion BIGINT,
  ID_Fund INT,
  Timestamp DATETIME2 DEFAULT GETDATE(),
  Etapa NVARCHAR(50),
  SubEtapa NVARCHAR(50),
  Tipo_Evento NVARCHAR(20), -- START, END, LOCK, WAIT, ERROR
  Recurso NVARCHAR(100),    -- Tabla, conexión, servicio
  Duracion_Ms INT,
  Metadata NVARCHAR(MAX),   -- JSON con detalles
  Thread_ID INT
);

CREATE INDEX IX_Trace_Proceso ON logs.Trace_Records(ID_Proceso, Timestamp);
CREATE INDEX IX_Trace_Ejecucion ON logs.Trace_Records(ID_Ejecucion, Etapa);
CREATE INDEX IX_Trace_Recurso ON logs.Trace_Records(Recurso, Tipo_Evento);
```

**2. TraceService en Node.js**:

```javascript
class TraceService {
  constructor(pool) {
    this.pool = pool;
    this.buffer = [];
  }

  async recordStart(idProceso, idEjecucion, idFund, etapa, recurso, metadata = {}) {
    return this._record(idProceso, idEjecucion, idFund, etapa, null, 'START', recurso, 0, metadata);
  }

  async recordEnd(idProceso, idEjecucion, idFund, etapa, recurso, duracionMs, metadata = {}) {
    return this._record(idProceso, idEjecucion, idFund, etapa, null, 'END', recurso, duracionMs, metadata);
  }

  async recordLock(idProceso, idEjecucion, idFund, recurso, metadata = {}) {
    return this._record(idProceso, idEjecucion, idFund, 'LOCK', null, 'LOCK', recurso, 0, metadata);
  }

  async _record(idProceso, idEjecucion, idFund, etapa, subEtapa, tipoEvento, recurso, duracionMs, metadata) {
    this.buffer.push({
      ID_Proceso: idProceso,
      ID_Ejecucion: idEjecucion,
      ID_Fund: idFund,
      Etapa: etapa,
      SubEtapa: subEtapa,
      Tipo_Evento: tipoEvento,
      Recurso: recurso,
      Duracion_Ms: duracionMs,
      Metadata: JSON.stringify(metadata),
      Thread_ID: process.pid
    });

    if (this.buffer.length >= 100) {
      await this.flush();
    }
  }

  async flush() {
    if (this.buffer.length === 0) return;

    const table = new sql.Table('logs.Trace_Records');
    table.columns.add('ID_Proceso', sql.BigInt);
    table.columns.add('ID_Ejecucion', sql.BigInt);
    table.columns.add('ID_Fund', sql.Int);
    // ... resto de columnas

    this.buffer.forEach(trace => table.rows.add(...Object.values(trace)));

    await this.pool.request().bulk(table);
    this.buffer = [];
  }
}
```

**3. Instrumentación en BasePipelineService**:

```javascript
async execute(context) {
  const { idEjecucion, idProceso, fechaReporte, fund } = context;
  const startTime = Date.now();

  // TRACE START
  await this.trace.recordStart(
    idProceso, idEjecucion, fund.ID_Fund,
    this.config.id,
    `staging.${this.config.id}_WorkTable`,
    { portfolio: fund.Portfolio_Geneva }
  );

  try {
    // Ejecución normal
    const result = await this._executeService(context);

    // TRACE END
    await this.trace.recordEnd(
      idProceso, idEjecucion, fund.ID_Fund,
      this.config.id,
      `staging.${this.config.id}_WorkTable`,
      Date.now() - startTime,
      { rows_affected: result.rowsAffected }
    );

    return result;
  } catch (error) {
    // TRACE ERROR
    await this.trace.recordError(
      idProceso, idEjecucion, fund.ID_Fund,
      this.config.id,
      error.message
    );
    throw error;
  }
}
```

**4. Queries de Análisis**:

```sql
-- Detectar fondos que accedieron al mismo recurso simultáneamente
SELECT
  t1.ID_Fund AS Fund1,
  t2.ID_Fund AS Fund2,
  t1.Recurso,
  t1.Timestamp AS Inicio_Fund1,
  t2.Timestamp AS Inicio_Fund2,
  DATEDIFF(ms, t1.Timestamp, t2.Timestamp) AS Overlap_Ms
FROM logs.Trace_Records t1
INNER JOIN logs.Trace_Records t2
  ON t1.Recurso = t2.Recurso
  AND t1.ID_Proceso = t2.ID_Proceso
  AND t1.ID_Fund < t2.ID_Fund
  AND t1.Tipo_Evento = 'START'
  AND t2.Tipo_Evento = 'START'
  AND ABS(DATEDIFF(ms, t1.Timestamp, t2.Timestamp)) < 1000
WHERE t1.ID_Proceso = @ID_Proceso
ORDER BY Overlap_Ms DESC;

-- Identificar cuellos de botella por recurso
SELECT
  Recurso,
  COUNT(*) AS Total_Accesos,
  AVG(Duracion_Ms) AS Duracion_Promedio_Ms,
  MAX(Duracion_Ms) AS Duracion_Maxima_Ms,
  COUNT(CASE WHEN Tipo_Evento = 'LOCK' THEN 1 END) AS Total_Locks
FROM logs.Trace_Records
WHERE ID_Proceso = @ID_Proceso
GROUP BY Recurso
ORDER BY Total_Locks DESC, Duracion_Promedio_Ms DESC;

-- Timeline de ejecución por fondo
SELECT
  ID_Fund,
  Etapa,
  MIN(Timestamp) AS Inicio,
  MAX(Timestamp) AS Fin,
  DATEDIFF(ms, MIN(Timestamp), MAX(Timestamp)) AS Duracion_Ms
FROM logs.Trace_Records
WHERE ID_Proceso = @ID_Proceso
  AND Tipo_Evento IN ('START', 'END')
GROUP BY ID_Fund, Etapa
ORDER BY ID_Fund, Inicio;
```

---

## Archivos Críticos a Modificar

### Backend

1. **server/routes/procesos.v2.routes.js** (líneas 60-220)
   - Cambiar sp_Inicializar_Ejecucion → sp_Inicializar_Proceso
   - Modificar executeProcessV2 para múltiples orquestadores
   - Actualizar respuesta JSON con ID_Proceso

2. **server/services/orchestration/FundOrchestrator.js** (líneas 35-472)
   - Validar que reciba 1 solo fondo
   - Agregar soporte para ID_Proceso en contexto

3. **server/services/pipeline/BasePipelineService.js** (líneas 103-290)
   - Agregar TraceService
   - Instrumentar execute() con trace records

4. **server/services/tracking/ExecutionTracker.js** (todo el archivo)
   - Agregar updateProcesoStats()
   - Modificar métodos para soportar ID_Proceso

5. **server/services/tracking/LoggingService.js** (todo el archivo)
   - Agregar campo ID_Proceso a logs

6. **server/services/tracking/TraceService.js** (NUEVO)
   - Crear servicio de trazabilidad

### Base de Datos

7. **server/database/migrations/012_CREATE_PROCESOS_TABLE.sql** (NUEVO)
   - Crear tabla logs.Procesos

8. **server/database/migrations/013_ALTER_EJECUCIONES_ADD_PROCESO.sql** (NUEVO)
   - Agregar FK ID_Proceso a logs.Ejecuciones

9. **server/database/migrations/014_CREATE_SP_INICIALIZAR_PROCESO.sql** (NUEVO)
   - Crear SP para inicializar proceso

10. **server/database/migrations/015_ALTER_EXTRACT_TABLES_ADD_EJECUCION.sql** (NUEVO)
    - Agregar columna ID_Ejecucion a 6 tablas extract.*

11. **server/database/migrations/016_CREATE_TRACE_RECORDS_TABLE.sql** (NUEVO)
    - Crear tabla logs.Trace_Records

### Frontend

12. **src/components/PipelineV2/contexts/PipelineExecutionContext.js**
    - Agregar estado para ID_Proceso
    - Modificar polling para soportar múltiples ejecuciones

13. **src/components/PipelineV2/hooks/useExecutionState.js**
    - Agregar lógica para agrupar ejecuciones por proceso

---

## Riesgos y Mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| Breaking changes en API | Alta | Alto | Versionamiento de endpoints (/v2 vs /v3) |
| Queries complejas en frontend | Media | Medio | Crear vistas SQL que abstraigan jerarquía |
| Overhead de trace records | Media | Medio | Buffer + bulk insert + índices optimizados |
| Migración de datos legacy | Baja | Alto | Backfill con IDs sintéticos + validación |
| Aumento de uso de disco | Alta | Bajo | Limpieza periódica de traces antiguos |

---

## Métricas de Éxito

### Pre-implementación (Baseline)
- Deadlocks: ~20 por ejecución
- Lock escalations: ~50 por ejecución
- Duración: ~25 minutos (50 fondos)
- Error 3998: ~3-5 por ejecución

### Post-implementación (Objetivo)
- Deadlocks: 0
- Lock escalations: 0
- Duración: <10 minutos (50 fondos)
- Error 3998: 0
- Throughput: >300 fondos/hora

---

## Estimación de Esfuerzo

| Fase | Tarea | Horas | Prioridad |
|------|-------|-------|-----------|
| 1 | Crear tabla logs.Procesos | 1 | Alta |
| 1 | Modificar logs.Ejecuciones | 1 | Alta |
| 1 | Crear sp_Inicializar_Proceso | 2 | Alta |
| 1 | Modificar procesos.v2.routes.js | 3 | Alta |
| 1 | Modificar FundOrchestrator | 2 | Alta |
| 1 | Testing Fase 1 | 3 | Alta |
| 2 | Agregar ID_Ejecucion a extract.* | 2 | Media |
| 2 | Modificar SPs de extracción | 4 | Media |
| 2 | Crear índices | 1 | Media |
| 2 | Testing Fase 2 | 3 | Media |
| 3 | Crear tabla Trace_Records | 1 | Baja |
| 3 | Crear TraceService | 2 | Baja |
| 3 | Instrumentar BasePipelineService | 2 | Baja |
| 3 | Queries de análisis | 1 | Baja |
| 3 | Testing Fase 3 | 2 | Baja |
| **TOTAL** | | **30 horas** | |

---

## Recomendación Final

**Implementar Fase 1 INMEDIATAMENTE** (12 horas):
- Mayor impacto con menor esfuerzo
- Resuelve el 80% del problema de concurrencia
- Bajo riesgo técnico

**Implementar Fase 2 en paralelo** (10 horas):
- Complementa Fase 1
- Elimina contención residual en extract.*

**Implementar Fase 3 después de validar Fases 1-2** (8 horas):
- Permite debugging y optimización continua
- No es bloqueante para el funcionamiento

**Total: ~30 horas de desarrollo + 10 horas de testing = 1 sprint (40 horas)**
