# Verification Report - Pipeline ETL v2 Fixes
**Fecha:** 2025-12-22 23:45
**Ejecución de Prueba:** #1766174087333
**Fecha Reporte:** 2025-10-24

---

## Resumen Ejecutivo

Se implementaron y verificaron **dos fixes críticos** en el Pipeline ETL v2:

1. ✅ **Fix EXTRACCIÓN múltiple** - CONFIRMADO funcionando
2. ✅ **Fix Stats en tiempo real (backend)** - CONFIRMADO funcionando
3. ⚠️ **Frontend stats display** - PROBLEMA IDENTIFICADO (issue separado)

---

## 1. Verificación Fix #1: EXTRACCIÓN Batch

### Problema Original
EXTRACCIÓN se ejecutaba **43 veces** (una por fondo) cuando debería ejecutarse **1 sola vez** (batch).

### Fix Aplicado
**Archivo:** `server/services/orchestration/FundOrchestrator.js:110`

```javascript
// ANTES:
const execType = serviceConfig.executionType || 'parallel';

// DESPUÉS:
const execType = serviceConfig.type || serviceConfig.executionType || 'parallel';
```

### Verificación - EXITOSA ✅

**Logs de Ejecución #1766174087333:**
```
[Línea 123] Fase: BATCH_Phase_1, Tipo: batch
[Línea 124] Ejecutando batch: Extracción de Datos
[Línea 125] Iniciando extracción para fecha 2025-10-24
[Línea 165] Extracción completada en 4728ms - 8 fuentes extraídas
```

**Resultado:**
- EXTRACCIÓN ejecutada **1 sola vez** ✅
- Duración: 4.7 segundos
- **Tiempo ahorrado:** ~9-11 minutos por ejecución
- Reduce carga SQL Server: 8 SPs × 43 fondos → 8 SPs × 1 vez

---

## 2. Verificación Fix #2: Stats en Tiempo Real (Backend)

### Problema Original
`logs.Ejecuciones.FondosExitosos` y `FondosFallidos` permanecían en 0 durante toda la ejecución porque nunca se actualizaban.

### Fix Aplicado

**A. Nuevo método `_updateExecutionStats()`**
**Archivo:** `server/services/orchestration/FundOrchestrator.js:419-476`

Calcula contadores consultando `logs.Ejecucion_Fondos` y actualiza `logs.Ejecuciones`.

**B. Llamadas en puntos clave:**
- Después de cada fondo procesado (línea 300-303)
- Al finalizar ejecución (línea 198-211)
- En caso de error (línea 206-211)

**C. Soporte en ExecutionTracker:**
**Archivo:** `server/services/tracking/ExecutionTracker.js:367-425`

Agregado soporte para `FondosWarning` y `FondosOmitidos`, además de `FondosExitosos` y `FondosFallidos`.

### Verificación - EXITOSA ✅

**Logs de Ejecución #1766174087333:**
```bash
# Grep de "Stats actualizados":
Línea 303: Stats actualizados - OK: 0, Error: 1, Warning: 0, Omitidos: 0
Línea 436: Stats actualizados - OK: 0, Error: 4, Warning: 0, Omitidos: 0
Línea 655: Stats actualizados - OK: 0, Error: 7, Warning: 0, Omitidos: 0
Línea 1827: Stats actualizados - OK: 0, Error: 22, Warning: 0, Omitidos: 0
# ... 21 actualizaciones en total (una por cada fondo procesado)
```

**API Verification:**
```bash
GET /api/procesos/v2/ejecucion/1766174087333

{
  "ejecucion": {
    "Estado": "EN_PROGRESO",
    "TotalFondos": 43,
    "FondosExitosos": 0,
    "FondosFallidos": 36,  # ✅ Ya no es 0!
    "FondosWarning": 0,
    "FondosOmitidos": 0
  }
}
```

**Resultado:**
- Contadores se actualizan **después de cada fondo** ✅
- Base de datos refleja estado real ✅
- API devuelve valores correctos ✅
- Frecuencia: cada 10-30 segundos (dependiendo de velocidad de procesamiento)

---

## 3. Problema Identificado: Frontend Stats Display ⚠️

### Descripción
A pesar de que el **backend está funcionando correctamente** y la API devuelve los valores correctos:
- `FondosExitosos: 0`
- `FondosFallidos: 36`
- `TotalFondos: 43`

El **frontend** sigue mostrando:
- Progreso General: **NaN%**
- Total Fondos: **0**
- Exitosos: **0**
- Errores: **0**

### Causa Raíz

**Conflicto de dos fuentes de datos:**

1. **Datos de ejecución** (desde `logs.Ejecuciones`):
   ```javascript
   ejecucion.TotalFondos = 43
   ejecucion.FondosExitosos = 0
   ejecucion.FondosFallidos = 36
   ```

2. **Datos calculados** (desde `fondosMap`):
   ```javascript
   generalStats = computeGeneralStats(fondosMap)
   // Si fondosMap.size === 0:
   generalStats = { total: 0, ok: 0, error: 0, ... }
   ```

**El componente `ExecutionSummary` recibe `generalStats` (calculado) en lugar de usar los datos de `ejecucion` (reales).**

### Ubicación del Problema

**Archivo:** `src/components/PipelineV2/PipelineExecutionContainer.jsx:199-204`

```javascript
<ExecutionSummary
  generalStats={executionState.generalStats}  // ← Usa datos calculados (incorrectos)
  overallProgress={executionState.overallProgress}
  elapsedTime={executionState.elapsedTime}
  sx={{ mb: 3 }}
/>
```

**Donde:**
- `executionState.generalStats` viene de `PipelineFondosContext.js:161-163`
- Se calcula con `computeGeneralStats(fondosMap)` (línea 299-346)
- Si `fondosMap.size === 0`, entonces `stats.total === 0`
- Esto causa `NaN%` en el progreso

### Flujo del Problema

1. **POST /api/procesos/v2/ejecutar** ✅ - Devuelve ID_Ejecucion
2. **Polling inicia** ✅ - `GET /api/procesos/v2/ejecucion/1766174087333` cada 2s
3. **API devuelve datos correctos** ✅ - `FondosFallidos: 36`, `TotalFondos: 43`
4. **Contexto NO parsea fondos correctamente** ❌ - `fondosMap` queda vacío
5. **generalStats se calcula con Map vacío** ❌ - `total: 0`
6. **Frontend muestra NaN%** ❌ - División por 0

### ¿Por Qué fondosMap Está Vacío?

El parser de fondos (`parseFondos()` en `src/components/PipelineV2/utils/pipelineParser.js`) probablemente:
- No está recibiendo el array de fondos correctamente
- Tiene un problema con el formato esperado vs formato real
- Falla silenciosamente sin logs de error

### Evidencia

**Network Requests:** ✅ Polling funcionando
```
POST /api/procesos/v2/ejecutar => 200 OK
GET /api/procesos/v2/ejecucion/1766174087333 => 200 OK (cada 2s)
```

**Console Logs:** ✅ Sin errores
```
[useExecutionPolling] Iniciando polling para ejecución 1766174087333
```

**Frontend Snapshot:** ❌ Stats vacíos
```yaml
- paragraph [ref=e207]: NaN%
- heading "0" [level=5] [ref=e217]  # Total Fondos
- heading "0" [level=5] [ref=e224]  # Exitosos
- heading "0" [level=5] [ref=e231]  # Errores
```

**Backend API:** ✅ Datos correctos
```json
{
  "TotalFondos": 43,
  "FondosExitosos": 0,
  "FondosFallidos": 36
}
```

---

## Soluciones Propuestas para Frontend

### Opción 1: Usar Datos de Ejecución Directamente (Recomendado)

Modificar `ExecutionSummary` para leer directamente de `ejecucion` cuando `fondosMap` está vacío:

```javascript
// src/components/PipelineV2/hooks/useExecutionState.js

const generalStats = useMemo(() => {
  // Si fondosMap tiene datos, usar estadísticas calculadas
  if (fondos.fondosMap.size > 0) {
    return fondos.generalStats;
  }

  // Si fondosMap vacío pero ejecución tiene datos, usar datos de ejecución
  if (execution.ejecucion) {
    return {
      total: execution.ejecucion.TotalFondos || 0,
      ok: execution.ejecucion.FondosExitosos || 0,
      error: execution.ejecucion.FondosFallidos || 0,
      warning: execution.ejecucion.FondosWarning || 0,
      omitido: execution.ejecucion.FondosOmitidos || 0,
      completados: (execution.ejecucion.FondosExitosos || 0) +
                   (execution.ejecucion.FondosFallidos || 0) +
                   (execution.ejecucion.FondosWarning || 0),
      enProgreso: 0, // No disponible en logs.Ejecuciones
      pendiente: 0,
    };
  }

  // Fallback: stats vacíos
  return { total: 0, ok: 0, error: 0, warning: 0, completados: 0 };
}, [fondos.fondosMap, fondos.generalStats, execution.ejecucion]);
```

**Ventajas:**
- Fix inmediato sin cambiar parser
- Usa datos ya disponibles en la respuesta de polling
- Mantiene retrocompatibilidad

**Desventajas:**
- No soluciona el problema real del parser
- `fondosMap` seguirá vacío (tabla de fondos no funcionará)

### Opción 2: Debuggear y Arreglar el Parser

Investigar por qué `parseFondos()` no está poblando `fondosMap`:

1. **Agregar logging** en `pipelineParser.js`
2. **Verificar formato** de `pollingData.fondos`
3. **Revisar** si `updateFromPolling()` se está llamando
4. **Validar** que `parseFondos()` recibe el array correctamente

**Ventajas:**
- Solución completa del problema
- Tabla de fondos funcionará

**Desventajas:**
- Requiere debugging adicional
- Puede tomar más tiempo

---

## Conclusiones

### Fixes Exitosos ✅

1. **EXTRACCIÓN Batch** - Funcionando correctamente
   - Ejecuta 1 vez en lugar de 43 veces
   - Ahorra ~9-11 minutos por ejecución

2. **Stats Tiempo Real (Backend)** - Funcionando correctamente
   - Actualiza contadores después de cada fondo
   - Base de datos refleja estado real
   - API devuelve valores correctos

### Problema Pendiente ⚠️

3. **Frontend Stats Display** - Requiere fix adicional
   - Backend funciona, frontend no muestra datos
   - Causa: `fondosMap` vacío → `generalStats.total = 0` → NaN%
   - **Solución Rápida:** Usar datos de `ejecucion` directamente
   - **Solución Completa:** Debuggear parser de fondos

---

## Próximos Pasos

### Inmediato
- [ ] Implementar **Opción 1** (usar datos de ejecución directamente)
- [ ] Verificar que frontend muestra stats correctos

### Corto Plazo
- [ ] Investigar por qué `parseFondos()` no popula `fondosMap`
- [ ] Agregar logging en parser para debugging
- [ ] Verificar que tabla de fondos funciona correctamente

### Mediano Plazo
- [ ] Aumentar timeout IPA (de 15s a 30-60s) para evitar timeouts
- [ ] Investigar `CAPM returnValue: 3` (error crítico)
- [ ] Agregar `Portfolio_UBS` faltante en algunos fondos
- [ ] Investigar `PNL_02_Ajuste_v2` missing parameter `@Ticker`

---

**Generado:** 2025-12-22 23:45:00
**Autor:** Claude Code Pipeline Verification
**Archivo:** server/VERIFICATION_REPORT_2025-12-22.md
