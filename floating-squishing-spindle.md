# Plan: Identificación y Eliminación de Componentes Legacy del Pipeline ETL

## Resumen Ejecutivo

Análisis exhaustivo completado de código (backend + frontend) y base de datos SQL Server para identificar componentes legacy obsoletos del pipeline ETL.

**Estado general:** El sistema está ~90% modernizado. Los componentes legacy identificados son principalmente:
- **Base de datos**: 31 SPs V1 sin sufijo _v2, 8 tablas extract.*_1, 3 backups
- **Backend**: WorkerPool no usado, referencias obsoletas en comentarios
- **Frontend**: 1 componente .OLD.jsx deprecado (1123 líneas)

---

## Hallazgos Críticos

### 🗄️ BASE DE DATOS - COMPONENTES LEGACY

#### 1. **31 Stored Procedures V1 SIN VERSIÓN V2** ⚠️ CRÍTICO

**Schema staging - SPs Legacy (con V2 disponible):**

| Grupo | SPs V1 Legacy | Total |
|-------|---------------|-------|
| IPA | IPA_01 hasta IPA_07 (sin _v2) | 7 SPs |
| CAPM | CAPM_01, CAPM_02, CAPM_03 (sin _v2) | 3 SPs |
| PNL | PNL_01 hasta PNL_05 (sin _v2) | 5 SPs |
| DERIV | DERIV_01 hasta DERIV_04 (sin _v2) | 4 SPs |
| UBS | UBS_01 hasta UBS_03 (sin _v2) | 3 SPs |
| Otros | Concatenar_Cubo (sin _v2) | 1 SP |

**Total: 23 SPs con versión V2 disponible** → Candidatos a ELIMINAR

**SPs sin V2 (requieren revisión):**
- `staging.IPA_Consolidar_MDLAT_MLATHY`
- `staging.TH_01_Dimensiones`
- `staging.Tratamiento_RISK_AMERICA`
- `staging.UAF_01_Dimensiones`, `UAF_02_TiposCambio`, `UAF_03_Ajuste`, `UAF_04_Agrupacion`
- `staging.Generar_Exposicion_BMS`

**Total: 8 SPs sin V2** → Requieren **MIGRACIÓN o DECISIÓN de descontinuación**

---

#### 2. **8 Tablas extract.*_1 (COPIAS ANTIGUAS)** 🗑️

Tablas duplicadas con sufijo `_1` (legacy):
- `extract.CAPM_1`, `extract.CT_1`, `extract.IPA_1`, `extract.PNL_1`
- `extract.PosModRF_1`, `extract.SONA_1`, `extract.TH_1`, `extract.UAF_1`

**Acción:** ELIMINAR (son backups antiguos, las tablas principales existen)

---

#### 3. **3 Tablas process.TBL_*_BACKUP_20251222** 🗑️

Backups del 22-dic-2025:
- `process.TBL_IPA_BACKUP_20251222`
- `process.TBL_PNL_BACKUP_20251222`
- `process.TBL_PNL_IPA_BACKUP_20251222`

**Acción:** ELIMINAR (backups de 4 días, ya obsoletos)

---

#### 4. **3 Tablas logs.*_BACKUP_20251222** 🗑️

Backups del 22-dic-2025:
- `logs.Ejecucion_Fondos_BACKUP_20251222`
- `logs.Ejecucion_Logs_BACKUP_20251222`
- `logs.Ejecucion_Metricas_BACKUP_20251222`

**Acción:** ELIMINAR (backups de 4 días, ya obsoletos)

---

#### 5. **Schema process - SPs sin versión V2**

8 SPs legacy sin migrar a V2:
- `process.Process_IPA` → Usa staging.IPA_* V1 internamente
- `process.Process_CAPM` → Usa staging.CAPM_* V1 internamente
- `process.Process_Derivados` → Usa staging.DERIV_* V1 internamente
- `process.Process_PNL` → Usa staging.PNL_* V1 internamente
- `process.Process_UBS` → Usa staging.UBS_* V1 internamente
- `process.Process_Funds` → Reemplazado por `Process_Funds_WithTracking`
- `process.Process_BMS`
- `process.Process_BMS_Metrics`

**Acción:** REVISAR si se usan, luego **ELIMINAR o MIGRAR**

---

### 💻 BACKEND - COMPONENTES LEGACY

#### 1. **WorkerPool.js - NO USADO** ⚠️

**Ubicación:** `server/services/orchestration/WorkerPool.js` (7.3KB, 154 líneas)

**Problema:**
- Exportado en `index.js` ✅
- **NUNCA importado** en `procesos.v2.routes.js` ❌
- Los fondos se ejecutan con `Promise.all()` directamente
- Comentarios en FundOrchestrator mencionan WorkerPool pero NO se usa

**Evidencia:**
```javascript
// procesos.v2.routes.js línea 278-284
const results = await Promise.all(
  orchestrators.map(orc => orc.execute()...)
);
// ❌ NO usa WorkerPool
```

**Acción:**
- OPCIÓN A: **ELIMINAR** WorkerPool.js completo
- OPCIÓN B: **IMPLEMENTAR** uso de WorkerPool en procesos.v2.routes.js

---

#### 2. **Comentarios Obsoletos sobre WorkerPool**

**Archivos afectados:**
- `server/services/orchestration/FundOrchestrator.js` líneas 41-47
  - "ejecuta N orquestadores vía WorkerPool" ← FALSO
  - "WorkerPool controla concurrencia" ← NO SE USA
  - "WorkerPool: NO se usa aquí" ← Contradictorio

**Acción:** ACTUALIZAR comentarios para reflejar uso real (Promise.all sin WorkerPool)

---

#### 3. **procesos.routes.js (V1) - NO EXISTE** ✅

**Hallazgo:** NO hay archivo `procesos.routes.js` (V1)
- Solo existe `procesos.v2.routes.js`
- Migración V1→V2 completada exitosamente
- NO hay rutas legacy en el código

---

### 🎨 FRONTEND - COMPONENTES LEGACY

#### 1. **PipelineExecution.OLD.jsx - DEPRECADO** 🗑️

**Ubicación:** `src/components/PipelineExecution.OLD.jsx` (1123 líneas)

**Estado:**
- Marcado explícitamente como `.OLD.jsx`
- **NO importado** en ningún archivo
- Reemplazado por `PipelineV2/` (23+ componentes modulares)

**Acción:** **ELIMINAR** archivo completo

---

## Resumen de Componentes Legacy

| Categoría | Componente | Cantidad | Acción Recomendada |
|-----------|------------|----------|-------------------|
| **BD - SPs V1 con V2** | staging.IPA_01 hasta Concatenar_Cubo | 23 | ELIMINAR |
| **BD - SPs V1 sin V2** | TH_01, UAF_*, etc. | 8 | MIGRAR o DESCONTINUAR |
| **BD - Tablas extract.*_1** | CAPM_1, IPA_1, etc. | 8 | ELIMINAR |
| **BD - Backups process** | TBL_*_BACKUP_20251222 | 3 | ELIMINAR |
| **BD - Backups logs** | *_BACKUP_20251222 | 3 | ELIMINAR |
| **BD - SPs process** | Process_IPA, Process_CAPM, etc. | 8 | REVISAR → ELIMINAR/MIGRAR |
| **Backend - WorkerPool** | WorkerPool.js | 1 | ELIMINAR o IMPLEMENTAR |
| **Backend - Comentarios** | Referencias a WorkerPool | ~10 | ACTUALIZAR |
| **Frontend - .OLD** | PipelineExecution.OLD.jsx | 1 | ELIMINAR |

**TOTAL LEGACY:** ~55 componentes identificados

---

## Plan de Acción Propuesto

### Fase 1: Eliminación Segura (Sin Impacto)

**Base de Datos:**
1. Eliminar 8 tablas `extract.*_1` (backups antiguos)
2. Eliminar 3 tablas `process.TBL_*_BACKUP_20251222`
3. Eliminar 3 tablas `logs.*_BACKUP_20251222`

**Frontend:**
4. Eliminar `src/components/PipelineExecution.OLD.jsx`

**Riesgo:** CERO (no están en uso)

---

### Fase 2: Validación y Eliminación (Requiere Verificación)

**Base de Datos - SPs V1:**
5. Verificar uso de 23 SPs V1 (grep en código + query last_execution_time)
6. Si NO usados → Eliminar SPs V1 (IPA_01 hasta Concatenar_Cubo sin _v2)

**Backend:**
7. Verificar imports de WorkerPool
8. Decidir: ELIMINAR WorkerPool.js o IMPLEMENTAR su uso
9. Actualizar comentarios en FundOrchestrator.js

**Riesgo:** BAJO (pero requiere verificación)

---

### Fase 3: Migración (Requiere Decisión de Negocio)

**SPs sin V2:**
10. Revisar 8 SPs sin V2 (TH_01, UAF_*, RISK_AMERICA, etc.)
11. Decidir: ¿Se usan? ¿Migrar a V2 o descontinuar?

**SPs process.*:**
12. Revisar 8 SPs `process.Process_*`
13. Decidir: ¿Migrar a V2 o eliminar?

**Riesgo:** MEDIO (requiere análisis de negocio)

---

## Decisiones de Implementación

### 1. **WorkerPool.js** → ELIMINAR (Opción A)
**Razón**:
- Código exportado pero nunca usado (0 imports en toda la base de código)
- Los fondos ejecutan correctamente con `Promise.all()` directo
- Mantenerlo genera confusión en la arquitectura
- No hay beneficio funcional en implementarlo ahora

**Acciones**:
- Eliminar `server/services/orchestration/WorkerPool.js`
- Quitar export de `server/services/orchestration/index.js`
- Actualizar comentarios en `FundOrchestrator.js` (líneas 41-47) para eliminar referencias a WorkerPool

---

### 2. **SPs sin V2 (TH_01, UAF_*, etc.)** → DIFERIR (Fase 3)
**Razón**: Requieren análisis de negocio para determinar si siguen siendo necesarios.

**Acción inmediata**: NINGUNA (dejar para análisis posterior con stakeholders)

---

### 3. **SPs process.Process_*** → DIFERIR (Fase 2)
**Razón**: Pueden estar siendo llamados directamente desde aplicaciones externas o SQL Jobs.

**Acción**: Verificar usage con query `sys.dm_exec_procedure_stats` en siguiente iteración.

---

### 4. **Alcance de eliminación** → FASE 1 COMPLETA + WorkerPool (INMEDIATO)

**Implementación inmediata**:
- ✅ **Fase 1**: Eliminar 14 tablas backup + PipelineExecution.OLD.jsx (CERO riesgo)
- ✅ **WorkerPool**: Eliminar WorkerPool.js + actualizar comentarios en FundOrchestrator.js
- ⏸️ **Fase 2**: Diferir SPs V1 para siguiente iteración (requiere verificación de uso)
- ⏸️ **Fase 3**: Diferir SPs sin V2 para análisis de negocio

**Justificación**: Comenzar con cambios de CERO riesgo que limpian código inmediatamente.

---

## Archivos Críticos a Modificar

### Base de Datos (Scripts SQL):
- `DROP TABLE` scripts para 14 tablas legacy
- `DROP PROCEDURE` scripts para 23-31 SPs V1

### Backend:
- `server/services/orchestration/WorkerPool.js` (eliminar o mantener)
- `server/services/orchestration/FundOrchestrator.js` (actualizar comentarios líneas 41-47)
- `server/services/orchestration/index.js` (quitar export de WorkerPool si se elimina)

### Frontend:
- `src/components/PipelineExecution.OLD.jsx` (eliminar)

---

## Criterio de Éxito

Al finalizar:
- ✅ 0 tablas backup en BD
- ✅ 0 componentes .OLD en frontend
- ✅ SPs V1 eliminados (si no se usan)
- ✅ WorkerPool resuelto (eliminado o implementado)
- ✅ Comentarios actualizados
- ✅ Base de datos limpia y mantenible
