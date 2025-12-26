# Plan de Migración: Arquitectura ID_Proceso + ID_Ejecucion

**Fecha**: 2025-12-24
**Objetivo**: Resolver concurrencia masiva en tablas extract.* y staging.* mediante identificación jerárquica

---

## 📋 Resumen Ejecutivo

### Problema Identificado
- **Contención masiva**: 50 fondos comparten el mismo ID_Ejecucion global
- **1 ID_Ejecucion global** → 50 fondos compiten por las mismas filas en extract.* y staging.*
- **Deadlocks y timeouts**: Lock escalation en tablas compartidas sin partición

### Solución Propuesta
- **ID_Proceso** (padre): Agrupa la ejecución completa de una fecha
- **ID_Ejecucion** (hijo): Individual por cada fondo
- **Ratio**: 1 ID_Proceso contiene N ID_Ejecucion (uno por fondo)

### Impacto
- ✅ **Aislamiento real**: Cada fondo trabaja en sus propias filas
- ✅ **Eliminación de contención**: No más competencia por mismos registros
- ⚠️ **Complejidad añadida**: Requiere refactor de orquestador y SPs
- ⚠️ **Migración de datos**: Backfill de ID_Proceso para ejecuciones históricas

---

## 🔍 Análisis de Arquitectura Actual

### Flujo Actual (PROBLEMÁTICO)

```
POST /api/procesos/v2/ejecutar { fechaReporte: '2025-10-24' }
    ↓
sp_Inicializar_Ejecucion(@FechaReporte) 
    → Crea 1 ID_Ejecucion = 1766174087388 (timestamp)
    → INSERT INTO logs.Ejecuciones (ID_Ejecucion, FechaReporte='2025-10-24')
    → INSERT INTO logs.Ejecucion_Fondos (50 fondos con MISMO ID_Ejecucion)
    ↓
FundOrchestrator (UNA instancia para toda la ejecución)
    → idEjecucion = 1766174087388
    → fondos = [F1, F2, ..., F50]
    ↓
executeParallelPhase (50 fondos en paralelo con pLimit(50))
    → BasePipelineService ejecuta SPs con MISMO ID_Ejecucion
    ↓
staging.IPA_01_RescatarLocalPrice_v2 
    @ID_Ejecucion=1766174087388, @ID_Fund=101
    → DELETE FROM staging.IPA_WorkTable WHERE ID_Ejecucion=1766174087388 AND ID_Fund=101
    ↓
staging.IPA_01_RescatarLocalPrice_v2 (otro fondo en paralelo)
    @ID_Ejecucion=1766174087388, @ID_Fund=102
    → DELETE FROM staging.IPA_WorkTable WHERE ID_Ejecucion=1766174087388 AND ID_Fund=102
    ↓
[PROBLEMA] 50 fondos compiten por índice en ID_Ejecucion+ID_Fund
            → Lock escalation a nivel de tabla
            → Deadlocks masivos
```

### Tablas Críticas (Contención Identificada)

#### Extract Schema (6 tablas SIN partición)
```sql
-- PROBLEMA: Una única fecha tiene 50 fondos con ID_Ejecucion compartido
extract.IPA                 -- NO tiene ID_Fund → 50 fondos usan MISMO WHERE ID_Ejecucion=X
extract.CAPM                -- NO tiene ID_Fund
extract.PosModRF            -- NO tiene ID_Fund
extract.SONA                -- NO tiene ID_Fund
extract.Derivados           -- NO tiene ID_Fund
extract.UBS                 -- NO tiene ID_Fund
```

#### Staging Schema (13+ tablas CON partición pero insuficiente)
```sql
-- PROBLEMA: Tienen ID_Ejecucion+ID_Fund pero generan contención por índice compartido
staging.IPA_WorkTable       -- WHERE ID_Ejecucion=X AND ID_Fund=Y → lock escalation
staging.IPA_Cash
staging.IPA_Final
staging.CAPM_WorkTable
staging.CAPM_Final
staging.PNL_WorkTable
staging.Derivados_WorkTable
staging.UBS_WorkTable
-- ... más tablas
```

### Logs Schema (2 tablas maestras)
```sql
logs.Ejecuciones            -- Estado global de la ejecución
    ID_Ejecucion (PK)       -- ACTUAL: timestamp único
    FechaReporte
    Estado
    TotalFondos
    FondosExitosos, FondosFallidos

logs.Ejecucion_Fondos       -- Estado por fondo
    ID_Ejecucion + ID_Fund (PK compuesta)
    Estado_Process_IPA, Estado_Process_CAPM, ...
```

---

## 🎯 Arquitectura Objetivo

### Diseño Jerárquico

```
┌──────────────────────────────────────────────────────┐
│               logs.Procesos (NUEVO)                  │
├──────────────────────────────────────────────────────┤
│  ID_Proceso      BIGINT  PK (timestamp)              │
│  FechaReporte    DATE                                │
│  Estado          VARCHAR(50)                         │
│  Usuario         VARCHAR(100)                        │
│  FechaInicio     DATETIME                            │
│  FechaFin        DATETIME                            │
│  TotalFondos     INT                                 │
│  FondosExitosos  INT                                 │
│  FondosFallidos  INT                                 │
└──────────────────────────────────────────────────────┘
                        │
                        │ 1:N (1 proceso tiene N ejecuciones)
                        ↓
┌──────────────────────────────────────────────────────┐
│            logs.Ejecuciones (MODIFICADA)             │
├──────────────────────────────────────────────────────┤
│  ID_Ejecucion    BIGINT  PK (timestamp por fondo)    │
│  ID_Proceso      BIGINT  FK → logs.Procesos          │ ← NUEVO
│  ID_Fund         INT                                 │ ← NUEVO (redundante pero útil)
│  FechaReporte    DATE                                │
│  Estado          VARCHAR(50)                         │
│  FechaInicio     DATETIME                            │
│  FechaFin        DATETIME                            │
└──────────────────────────────────────────────────────┘
                        │
                        │ 1:1 (cada ejecución tiene 1 fondo)
                        ↓
┌──────────────────────────────────────────────────────┐
│         logs.Ejecucion_Fondos (SIMPLIFICADA)         │
├──────────────────────────────────────────────────────┤
│  ID_Ejecucion    BIGINT  PK (ahora único por fondo)  │
│  ID_Fund         INT                                 │
│  FundShortName   VARCHAR(100)                        │
│  Portfolio_*     VARCHAR(50)                         │
│  Estado_*        VARCHAR(50)                         │
└──────────────────────────────────────────────────────┘
```

### Ejemplo de Datos

**Escenario**: Ejecutar fecha 2025-10-24 con 3 fondos

```sql
-- 1. Crear ID_Proceso padre
INSERT INTO logs.Procesos (ID_Proceso, FechaReporte, Estado, TotalFondos)
VALUES (1766174087388, '2025-10-24', 'EN_PROGRESO', 3);

-- 2. Crear ID_Ejecucion hijo por CADA fondo
INSERT INTO logs.Ejecuciones (ID_Ejecucion, ID_Proceso, ID_Fund, FechaReporte, Estado)
VALUES 
    (1766174087401, 1766174087388, 101, '2025-10-24', 'EN_PROGRESO'),  -- Fondo 101
    (1766174087402, 1766174087388, 102, '2025-10-24', 'EN_PROGRESO'),  -- Fondo 102
    (1766174087403, 1766174087388, 103, '2025-10-24', 'EN_PROGRESO'); -- Fondo 103

-- 3. Procesar cada fondo con SU PROPIO ID_Ejecucion
-- Fondo 101 usa ID_Ejecucion=1766174087401
EXEC staging.IPA_01_RescatarLocalPrice_v2 
    @ID_Ejecucion=1766174087401,  -- ÚNICO para este fondo
    @FechaReporte='2025-10-24',
    @ID_Fund=101,
    @Portfolio_Geneva='LAFID01';

-- Fondo 102 usa ID_Ejecucion=1766174087402 (DISTINTO, sin contención)
EXEC staging.IPA_01_RescatarLocalPrice_v2 
    @ID_Ejecucion=1766174087402,  -- ÚNICO para este fondo
    @FechaReporte='2025-10-24',
    @ID_Fund=102,
    @Portfolio_Geneva='LAFID02';
```

### Ventajas vs Estado Actual

| Aspecto | Actual | Nueva Arquitectura |
|---------|--------|-------------------|
| **ID_Ejecucion** | Compartido entre 50 fondos | Único por fondo |
| **Contención en extract.\*** | ALTA (50 fondos mismo WHERE) | BAJA (cada fondo tiene ID distinto) |
| **Contención en staging.\*** | ALTA (lock escalation) | NULA (partición perfecta) |
| **Trazabilidad** | Difusa (todos mezclados) | Clara (un ID = un fondo) |
| **Rollback por fondo** | Imposible (datos mezclados) | Fácil (DELETE WHERE ID_Ejecucion=X) |
| **Agregación de stats** | Directa (GROUP BY ID_Ejecucion) | Requiere JOIN a ID_Proceso |

---

## 📝 Plan de Implementación Detallado

### FASE 1: Cambios en Base de Datos (2-3 horas)

#### 1.1 Crear Nueva Tabla logs.Procesos

Ver Migration: `012_CREATE_PROCESOS_TABLE.sql` (a crear)

#### 1.2 Modificar Tabla logs.Ejecuciones

Ver Migration: `013_ALTER_EJECUCIONES_ADD_ID_PROCESO.sql` (a crear)

#### 1.3 Crear Stored Procedure de Inicialización

Ver Migration: `014_CREATE_SP_INICIALIZAR_PROCESO.sql` (a crear)

#### 1.4 Migración de Datos Históricos

Ver Migration: `015_BACKFILL_ID_PROCESO.sql` (a crear)

---

### FASE 2: Cambios en Backend Node.js (4-5 horas)

#### Archivos Críticos a Modificar

**1. server/routes/procesos.v2.routes.js**:
- Líneas 60-120: Modificar POST /api/procesos/v2/ejecutar
- Líneas 122-217: Refactor de executeProcessV2 function
- Crear nuevos endpoints GET /api/procesos/v2/proceso/:id

**2. server/services/orchestration/FundOrchestrator.js**:
- Líneas 24-46: Validar que fondos.length === 1
- Líneas 256-270: Simplificar _executeParallelPhase para 1 fondo

**3. server/services/tracking/ExecutionTracker.js**:
- Agregar método updateProcesoStats(idProceso)
- Modificar updateExecutionState para actualizar proceso padre

#### Estrategia de Refactor

**OPCIÓN A: Múltiples Orquestadores (RECOMENDADA)**

```javascript
// Crear UNA instancia de FundOrchestrator por CADA fondo
const orchestrators = ejecuciones.map(ejecucion => {
  return new FundOrchestrator(
    ejecucion.ID_Ejecucion,   // ID único por fondo
    fechaReporte,
    [ejecucion],              // Array de UN SOLO fondo
    pool,
    tracker,
    logger
  );
});

// Ejecutar todos en paralelo
await Promise.all(orchestrators.map(orc => orc.execute()));
```

**Ventajas**:
- Aislamiento total (cada orquestador con su ID_Ejecucion)
- Sin cambios en FundOrchestrator (sigue esperando array de fondos)
- Paralelismo real (Promise.all sin límites artificiales)

**OPCIÓN B: Orquestador Compartido con Lógica Dual**

```javascript
// Mantener un solo orquestador pero cambiar lógica interna
const orchestrator = new FundOrchestrator(
  idProceso,      // Nivel proceso
  fechaReporte,
  ejecuciones,    // Array de {ID_Ejecucion, ID_Fund, ...}
  pool,
  tracker,
  logger
);

// Internamente, detecta si es nueva arquitectura y usa ID_Ejecucion individual
```

**Desventajas**:
- Más complejo (lógica dual dentro del orquestador)
- Riesgo de bugs por caminos de código distintos

**Decisión**: Usar OPCIÓN A por simplicidad y aislamiento

---

### FASE 3: Compatibilidad y Versionamiento (2 horas)

#### Estrategia de Compatibilidad

**OPCIÓN A: Breaking Change (Recomendado para sistemas internos)**

- Migrar completamente a nueva arquitectura
- Deprecar endpoint `/v2/ejecutar` antiguo
- Crear nuevo endpoint `/v3/ejecutar` con ID_Proceso

**OPCIÓN B: Compatibilidad Dual (No recomendado)**

- Mantener ambos endpoints funcionando
- Complejidad de mantener dos flujos diferentes
- Riesgo de divergencia de comportamiento

**Decisión Recomendada**: OPCIÓN A con período de transición de 1 semana

---

### FASE 4: Testing y Validación (3 horas)

#### Tests Críticos

1. **Test de Aislamiento**: 50 fondos en paralelo NO generan deadlocks
2. **Test de Integridad**: Todos los fondos tienen ID_Ejecucion único
3. **Test de Agregación**: Stats de proceso calculan correctamente desde hijos
4. **Test de Rollback**: Eliminar proceso borra todas sus ejecuciones (CASCADE)

#### Métricas de Éxito

| Métrica | Baseline | Objetivo | Tolerancia |
|---------|----------|----------|------------|
| **Deadlocks por ejecución** | ~20 | 0 | Máximo 1 |
| **Lock escalations** | ~50 | 0 | Máximo 2 |
| **Duración total (50 fondos)** | ~25 min | <10 min | <15 min |
| **Fondos procesados/hora** | ~120 | >300 | >200 |
| **Queries con timeout** | ~10/día | 0 | Máximo 1/día |

---

## 🚨 Riesgos y Mitigaciones

### Riesgo 1: Complejidad Añadida

**Impacto**: MEDIO

**Mitigación**:
- Crear vistas SQL simplificadas para queries comunes
- Documentar patrones de acceso claramente
- Agregar índices compuestos (ID_Proceso, ID_Fund)

### Riesgo 2: Migración de Datos Históricos

**Impacto**: ALTO (si falla, se pierde trazabilidad histórica)

**Mitigación**:
- Ejecutar backfill en TRANSACCIÓN con rollback automático si falla
- Crear backup ANTES de ejecutar migración
- Validar conteos antes y después del backfill
- Permitir NULL en ID_Proceso temporalmente (constraint opcional)

### Riesgo 3: Breaking Change en Frontend

**Impacto**: MEDIO

**Mitigación**:
- Implementar dual support temporalmente (aceptar ambos IDs)
- Agregar feature flags para activar nueva arquitectura gradualmente
- Rollback plan: mantener endpoint v2 funcionando por 2 semanas

---

## 🔄 Rollback Plan

### Escenario 1: Fallos en Producción Inmediatos

**Trigger**: Más de 50% de ejecuciones fallan en primeras 2 horas

**Acción**:
1. Revertir endpoint a versión v2
2. Desactivar nuevas ejecuciones con v3
3. Permitir que ejecuciones en curso completen
4. Investigar logs y reintentar

### Escenario 2: Performance Peor que Baseline

**Trigger**: Duración promedio >20% superior a baseline después de 1 semana

**Acción**:
1. Analizar execution plans de queries lentos
2. Agregar índices faltantes
3. Si no mejora en 48h, rollback a v2

---

## 📚 Critical Files for Implementation

Las siguientes son las 5 rutas críticas para implementar este plan:

### 1. `server/routes/procesos.v2.routes.js`
**Razón**: Punto de entrada de la API - modificar POST /ejecutar y executeProcessV2

**Cambios Requeridos**:
- Reemplazar sp_Inicializar_Ejecucion por sp_Inicializar_Proceso
- Crear múltiples orquestadores (uno por fondo)
- Agregar endpoint GET /api/procesos/v2/proceso/:id

### 2. `server/services/orchestration/FundOrchestrator.js`
**Razón**: Orquestador central - validar que maneja 1 fondo por instancia

**Cambios Requeridos**:
- Agregar validación: `if (fondos.length !== 1) warn(...)`
- Simplificar _executeParallelPhase (opcional)
- Mantener compatibilidad con arquitectura legacy

### 3. `server/services/tracking/ExecutionTracker.js`
**Razón**: Tracking de estados - agregar método para actualizar proceso padre

**Cambios Requeridos**:
- Crear método `updateProcesoStats(idProceso)`
- Modificar `updateExecutionState` para actualizar proceso automáticamente
- Agregar queries de agregación desde ejecuciones hijas

### 4. `server/database/migrations/012_CREATE_PROCESOS_TABLE.sql`
**Razón**: Schema de nueva tabla logs.Procesos - base de la nueva arquitectura

**A Crear**:
- Tabla logs.Procesos con columnas: ID_Proceso, FechaReporte, Estado, TotalFondos, etc.
- Índices en FechaReporte, Estado, FechaInicio
- Constraints de check para Estado válido

### 5. `server/database/migrations/013_ALTER_EJECUCIONES_ADD_ID_PROCESO.sql`
**Razón**: Modificar tabla existente - agregar FK a procesos

**A Crear**:
- ALTER TABLE logs.Ejecuciones ADD ID_Proceso BIGINT NULL
- ALTER TABLE logs.Ejecuciones ADD ID_Fund INT NULL
- Crear índices en ID_Proceso, ID_Fund
- Agregar FK con ON DELETE CASCADE

---

## ✅ Checklist de Implementación

### FASE 1: Base de Datos
- [ ] Crear tabla logs.Procesos (Migration 012)
- [ ] Modificar tabla logs.Ejecuciones (Migration 013)
- [ ] Crear SP sp_Inicializar_Proceso (Migration 014)
- [ ] Ejecutar backfill de datos históricos (Migration 015)
- [ ] Validar migración con queries de conteo

### FASE 2: Backend
- [ ] Modificar POST /api/procesos/v2/ejecutar
- [ ] Refactor executeProcessV2 (múltiples orquestadores)
- [ ] Adaptar FundOrchestrator (validaciones)
- [ ] Actualizar ExecutionTracker (updateProcesoStats)
- [ ] Crear endpoint GET /api/procesos/v2/proceso/:id

### FASE 3: Testing
- [ ] Test unitario: FundOrchestrator con 1 fondo
- [ ] Test de integración: 3 fondos en paralelo
- [ ] Performance test: 50 fondos (validar 0 deadlocks)
- [ ] Validar métricas de éxito vs baseline

### FASE 4: Deployment
- [ ] Backup de base de datos
- [ ] Deployment en staging
- [ ] Validación con datos reales en staging
- [ ] Deployment a producción (off-hours)
- [ ] Monitorear primeras 24 horas

---

**FIN DEL PLAN**

