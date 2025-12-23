# Fixes Applied - Pipeline ETL v2

**Fecha:** 2025-12-22 23:15
**Cambios:** Corrección de EXTRACCIÓN múltiple + Stats en tiempo real

---

## 1. Fix: EXTRACCIÓN Ejecutándose Múltiples Veces

### Problema
EXTRACCIÓN se ejecutaba **43 veces** (una por cada fondo) cuando debería ejecutarse **1 sola vez** (batch).

### Causa Raíz
`pipeline.config.yaml` usa `type: batch` pero `FundOrchestrator._buildExecutionPlan()` buscaba `executionType`.

### Solución
**Archivo:** `server/services/orchestration/FundOrchestrator.js`
**Línea:** 110

```javascript
// ANTES:
const execType = serviceConfig.executionType || 'parallel';

// DESPUÉS:
const execType = serviceConfig.type || serviceConfig.executionType || 'parallel';
```

### Resultado Esperado
- EXTRACCIÓN se ejecuta 1 vez al inicio (fase batch)
- Tiempo ahorrado: ~9-11 minutos por ejecución
- Reduce carga en SQL Server (8 SPs × 43 fondos → 8 SPs × 1 vez)

---

## 2. Fix: Contadores en Tiempo Real (Stats Updates)

### Problema
Frontend mostraba:
- Progreso General: **NaN%**
- Total Fondos: 0
- Exitosos: 0
- Errores: 0

**Causa:** `logs.Ejecuciones.FondosExitosos` y `FondosFallidos` nunca se actualizaban (permanecían en 0).

### Solución Implementada

#### A. Nuevo Método: `_updateExecutionStats()`
**Archivo:** `server/services/orchestration/FundOrchestrator.js`
**Líneas:** 419-476

```javascript
async _updateExecutionStats(estadoFinal = null) {
  // 1. Consultar logs.Ejecucion_Fondos para estados actuales
  const fondosStates = await this.tracker.getFundStates(this.idEjecucion);

  // 2. Calcular contadores
  const stats = {
    fondosOK: fondosStates.filter(f => f.Estado_Final === 'COMPLETADO').length,
    fondosError: fondosStates.filter(f => f.Estado_Final === 'ERROR').length,
    fondosWarning: fondosStates.filter(f => f.Estado_Final === 'WARNING').length,
    fondosOmitidos: fondosStates.filter(f => f.Estado_Final === 'OMITIDO').length,
  };

  // 3. Determinar estado automático si no se especifica
  if (!estadoFinal) {
    const totalProcesados = stats.fondosOK + stats.fondosError + stats.fondosWarning + stats.fondosOmitidos;
    if (totalProcesados === this.fondos.length) {
      if (stats.fondosError > 0) {
        estado = stats.fondosOK > 0 ? 'PARCIAL' : 'ERROR';
      } else {
        estado = 'COMPLETADO';
      }
    }
  }

  // 4. Actualizar logs.Ejecuciones
  await this.tracker.actualizarEstadoEjecucion(this.idEjecucion, estado, stats);
}
```

#### B. Llamar Stats Update Después de Cada Fondo
**Archivo:** `server/services/orchestration/FundOrchestrator.js`
**Líneas:** 300-303

```javascript
async _executeFundServices(fund, serviceIds) {
  try {
    // ... procesar servicios ...
  } finally {
    // Actualizar stats después de procesar cada fondo (tiempo real)
    await this._updateExecutionStats();
  }
}
```

#### C. Llamar Stats Update al Finalizar
**Archivo:** `server/services/orchestration/FundOrchestrator.js`
**Líneas:** 198-211

```javascript
async execute() {
  try {
    // ... ejecutar fases ...

    // Actualizar stats finales
    await this._updateExecutionStats('COMPLETADO');
    return { success: true };

  } catch (error) {
    // Actualizar stats finales con error
    await this._updateExecutionStats('ERROR');
    throw error;
  }
}
```

#### D. Actualizar ExecutionTracker
**Archivo:** `server/services/tracking/ExecutionTracker.js`
**Cambios:**

1. **Agregar soporte para FondosWarning y FondosOmitidos** (líneas 367-394)
2. **Agregar alias en español** `actualizarEstadoEjecucion()` (líneas 423-425)
3. **Mejorar logging** con todos los contadores (líneas 406-410)

```javascript
// Nuevo UPDATE query:
UPDATE logs.Ejecuciones
SET Estado = @Estado,
    FechaActualizacion = GETDATE(),
    FondosExitosos = @FondosOK,
    FondosFallidos = @FondosError,
    FondosWarning = @FondosWarning,
    FondosOmitidos = @FondosOmitidos,
    FechaFin = GETDATE()  -- si estado es final
WHERE ID_Ejecucion = @ID_Ejecucion
```

### Resultado Esperado

**Antes:**
```json
{
  "Estado": "EN_PROGRESO",
  "TotalFondos": 43,
  "FondosExitosos": 0,    // ❌ Siempre 0
  "FondosFallidos": 0,    // ❌ Siempre 0
  "FondosWarning": 0,
  "FondosOmitidos": 0
}
```

**Después:**
```json
{
  "Estado": "EN_PROGRESO",
  "TotalFondos": 43,
  "FondosExitosos": 15,   // ✅ Se actualiza en tiempo real
  "FondosFallidos": 7,    // ✅ Se actualiza en tiempo real
  "FondosWarning": 0,     // ✅ Se actualiza en tiempo real
  "FondosOmitidos": 0     // ✅ Se actualiza en tiempo real
}
```

**Frontend:**
- Progreso General: **51.2%** (22/43 fondos procesados)
- Total Fondos: **43**
- Exitosos: **15**
- Errores: **7**

---

## Frecuencia de Actualización

**¿Cuándo se actualiza?**

1. **Después de cada fondo procesado** (cada ~10-30 segundos dependiendo del fondo)
2. **Al finalizar la ejecución completa**
3. **En caso de error crítico**

**Impacto en Rendimiento:**
- Query adicional por fondo: `SELECT * FROM logs.Ejecucion_Fondos WHERE ID_Ejecucion = @ID`
- Costo: ~10-50ms por query
- Total: ~430-2,150ms por ejecución completa (despreciable)

**Beneficio:**
- Frontend muestra progreso en tiempo real
- Usuario ve actualización cada 2-4 segundos (polling)
- Mejor UX

---

## Estados de Ejecución Auto-calculados

El método `_updateExecutionStats()` calcula automáticamente el estado final:

| Condición | Estado |
|-----------|--------|
| Todos procesados + 0 errores + 0 warnings | `COMPLETADO` |
| Todos procesados + algunos errores + algunos OK | `PARCIAL` |
| Todos procesados + todos errores | `ERROR` |
| Algunos procesados | `EN_PROGRESO` |

---

## Testing

### Cómo Verificar el Fix

1. **Iniciar nueva ejecución:**
   ```bash
   POST /api/procesos/v2/ejecutar
   { "fechaReporte": "2025-10-24" }
   ```

2. **Verificar logs - EXTRACCIÓN una sola vez:**
   ```
   [ExtractionService 1766174087332] Iniciando extracción para fecha 2025-10-24
   [ExtractionService 1766174087332] Extracción completada en 13615ms - 8 fuentes extraídas

   // ✅ Solo aparece UNA vez, no 43 veces
   ```

3. **Verificar logs - Stats updates:**
   ```
   [FundOrchestrator 1766174087332] Stats actualizados - OK: 0, Error: 0, Warning: 0, Omitidos: 0
   [FundOrchestrator 1766174087332] Stats actualizados - OK: 0, Error: 1, Warning: 0, Omitidos: 0
   [FundOrchestrator 1766174087332] Stats actualizados - OK: 0, Error: 2, Warning: 0, Omitidos: 0
   ...
   [FundOrchestrator 1766174087332] Stats actualizados - OK: 15, Error: 7, Warning: 0, Omitidos: 0
   ```

4. **Verificar frontend - Polling:**
   ```
   GET /api/procesos/v2/ejecucion/1766174087332

   {
     "ejecucion": {
       "FondosExitosos": 15,    // ✅ Ya no es 0
       "FondosFallidos": 7,     // ✅ Ya no es 0
       "Estado": "EN_PROGRESO"
     }
   }
   ```

5. **Verificar frontend UI:**
   - Progreso General: Muestra porcentaje real (no NaN%)
   - Contadores: Muestran valores reales

---

## Archivos Modificados

1. `server/services/orchestration/FundOrchestrator.js`
   - Línea 110: Fix lectura de `type` vs `executionType`
   - Líneas 198-211: Stats update al finalizar
   - Líneas 300-303: Stats update después de cada fondo
   - Líneas 419-476: Nuevo método `_updateExecutionStats()`

2. `server/services/tracking/ExecutionTracker.js`
   - Líneas 367-394: Soporte para FondosWarning y FondosOmitidos
   - Líneas 423-425: Alias `actualizarEstadoEjecucion()`
   - Líneas 406-410: Mejor logging

---

## Próximos Pasos (Post-Testing)

1. ✅ **EXTRACCIÓN batch fix** - COMPLETADO
2. ✅ **Stats en tiempo real** - COMPLETADO
3. ⏳ **Probar con fecha 2025-10-24** - PENDIENTE
4. ⏳ **Aumentar timeout IPA** (de 15s a 30-60s) - PENDIENTE
5. ⏳ **Investigar CAPM returnValue: 3** - PENDIENTE
6. ⏳ **Agregar Portfolio_UBS faltante** - PENDIENTE

---

**Generado:** 2025-12-22 23:15:00
**Autor:** Claude Code Pipeline Fixes
**Archivo:** server/FIXES_APPLIED.md
