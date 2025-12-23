# Análisis: Flujo de Datos Frontend - Pipeline ETL v2

## Pregunta
¿La visualización del front en la parte del pipeline depende exclusivamente del sistema de logs del proceso?

## Respuesta Corta
**NO**. El frontend depende de **DOS sistemas diferentes**:

1. **Tablas de Tracking/Estado** (logs.Ejecuciones, logs.Ejecucion_Fondos)
2. **Tabla de Logs** (logs.Ejecucion_Logs)

---

## Flujo de Datos Detallado

### 1. Frontend → Backend

**Hook de Polling:**
```javascript
// src/components/PipelineV2/hooks/useExecutionPolling.js
const response = await procesosService.getEjecucionEstado(idEjecucion);
```

**Endpoint:**
```
GET /api/procesos/v2/ejecucion/:id
```

### 2. Backend → Base de Datos

El endpoint consulta **3 tablas diferentes**:

#### A. logs.Ejecuciones (Datos Agregados)
```sql
SELECT * FROM logs.Ejecuciones
WHERE ID_Ejecucion = @ID_Ejecucion
```

**Campos Clave:**
- `Estado`: EN_PROGRESO, COMPLETADO, ERROR, PARCIAL
- `FondosExitosos`: Contador agregado ⚠️ **PROBLEMA: No se actualiza**
- `FondosFallidos`: Contador agregado ⚠️ **PROBLEMA: No se actualiza**
- `FondosOmitidos`: Contador agregado
- `FondosWarning`: Contador agregado
- `TotalFondos`: Total de fondos en la ejecución
- `FechaInicio`, `FechaFin`, `Duracion_Total_Ms`

#### B. logs.Ejecucion_Fondos (Estado por Fondo)
```sql
SELECT
  ef.ID,
  ef.ID_Fund,
  ef.FundShortName,
  -- Estados por etapa del pipeline
  ef.Estado_Extraccion,
  ef.Estado_Process_IPA,
  ef.Estado_Process_CAPM,
  ef.Estado_Process_Derivados,
  ef.Estado_Process_PNL,
  ef.Estado_Process_UBS,
  ef.Estado_Concatenar,
  -- Estado final
  ef.Estado_Final,
  ef.Mensaje_Error,
  ef.Fin_Procesamiento
FROM logs.Ejecucion_Fondos ef
WHERE ef.ID_Ejecucion = @ID_Ejecucion
```

**Estados Posibles:**
- `null`: No iniciado
- `'EN_PROGRESO'`: Ejecutándose
- `'OK'`: Completado exitosamente
- `'ERROR'`: Falló
- `'WARNING'`: Completó con advertencias
- `'OMITIDO'`: Servicio omitido (condicional)

#### C. logs.Ejecucion_Logs (Logs de Eventos)
```sql
SELECT TOP 100 *
FROM logs.Ejecucion_Logs
WHERE ID_Ejecucion = @ID_Ejecucion
ORDER BY Timestamp DESC
```

**Campos:**
- `Nivel`: INFO, WARNING, ERROR
- `Categoria`: PIPELINE, VALIDACION, etc.
- `Etapa`: EXTRACCION, PROCESS_IPA, etc.
- `Mensaje`: Texto del log
- `Stack_Trace`: Stack trace en caso de error

---

## Servicios Responsables de Actualizar las Tablas

### ExecutionTracker
**Archivo:** `server/services/tracking/ExecutionTracker.js`

**Métodos:**

1. **`actualizarEstadoCampo(idEjecucion, idFund, campo, estado)`**
   - Actualiza campos individuales en `logs.Ejecucion_Fondos`
   - Ejemplo: `Estado_Process_IPA = 'EN_PROGRESO'`
   - ✅ **SE USA** - Funciona correctamente

2. **`markFundFailed(idEjecucion, idFund, etapa, mensaje)`**
   - Marca un fondo como fallido
   - Actualiza `Estado_Final = 'ERROR'` y `Mensaje_Error`
   - ✅ **SE USA** - Funciona correctamente

3. **`actualizarEstadoEjecucion(idEjecucion, estado, stats)`**
   - Actualiza `logs.Ejecuciones` con stats agregados
   - Puede actualizar `FondosExitosos`, `FondosFallidos`
   - ❌ **NO SE USA** - Nunca se llama desde FundOrchestrator

### LoggingService
**Archivo:** `server/services/logging/LoggingService.js`

**Método:**
- **`log(idEjecucion, idFund, nivel, categoria, mensaje)`**
  - Inserta en `logs.Ejecucion_Logs`
  - ✅ **SE USA** - Funciona correctamente

---

## Problema Identificado: Contadores No Actualizados

### Síntoma
```json
{
  "Estado": "EN_PROGRESO",
  "TotalFondos": 43,
  "FondosExitosos": 0,    // ❌ SIEMPRE 0
  "FondosFallidos": 0,    // ❌ SIEMPRE 0
  "FondosOmitidos": 0,
  "FondosWarning": 0
}
```

Frontend calcula:
```javascript
progreso = (FondosExitosos + FondosFallidos) / TotalFondos
         = (0 + 0) / 43
         = 0 / 43
         = 0 → NaN%
```

### Causa Raíz

El método `ExecutionTracker.actualizarEstadoEjecucion()` existe pero **nunca se llama**.

**Flujo Actual (INCORRECTO):**
```
FundOrchestrator._executeFundServices()
  → Solo llama tracker.actualizarEstadoCampo() para estados individuales
  → Solo llama tracker.markFundFailed() cuando policy = STOP_FUND
  → ❌ NUNCA llama tracker.actualizarEstadoEjecucion() con stats agregados
```

**Resultado:**
- `logs.Ejecucion_Fondos` SÍ se actualiza (estados individuales por fondo)
- `logs.Ejecuciones` NO se actualiza (contadores agregados)

### Estados Reales vs Reportados

**Realidad en logs.Ejecucion_Fondos:**
```sql
SELECT Estado_Final, COUNT(*)
FROM logs.Ejecucion_Fondos
WHERE ID_Ejecucion = 1766174087331
GROUP BY Estado_Final

Estado_Final | COUNT
-------------|------
ERROR        | 7
NULL         | 36
```

**Reportado en logs.Ejecuciones:**
```
FondosExitosos: 0
FondosFallidos: 0    ← Debería ser 7
```

---

## Solución Propuesta

### Opción 1: Actualizar Contadores al Final
Modificar `FundOrchestrator.execute()` para calcular stats al final:

```javascript
// FundOrchestrator.js - Al final de execute()
async execute() {
  try {
    // ... procesamiento actual ...

    // Al finalizar, calcular stats reales
    const fondosStates = await this.tracker.getFundStates(this.idEjecucion);

    const stats = {
      fondosOK: fondosStates.filter(f => f.Estado_Final === 'COMPLETADO').length,
      fondosError: fondosStates.filter(f => f.Estado_Final === 'ERROR').length,
      fondosWarning: fondosStates.filter(f => f.Estado_Final === 'WARNING').length,
      fondosOmitidos: fondosStates.filter(f => f.Estado_Final === 'OMITIDO').length,
    };

    // Actualizar contadores en logs.Ejecuciones
    await this.tracker.actualizarEstadoEjecucion(
      this.idEjecucion,
      'COMPLETADO',
      stats
    );
  } catch (error) {
    // En caso de error, también actualizar
    const fondosStates = await this.tracker.getFundStates(this.idEjecucion);
    const stats = { ... };
    await this.tracker.actualizarEstadoEjecucion(
      this.idEjecucion,
      'ERROR',
      stats
    );
  }
}
```

### Opción 2: Actualizar Contadores en Tiempo Real
Crear método `_updateExecutionStats()` llamado después de cada fondo:

```javascript
// FundOrchestrator.js
async _updateExecutionStats() {
  const fondosStates = await this.tracker.getFundStates(this.idEjecucion);

  const stats = {
    fondosOK: fondosStates.filter(f => f.Estado_Final === 'COMPLETADO').length,
    fondosError: fondosStates.filter(f => f.Estado_Final === 'ERROR').length,
    fondosWarning: fondosStates.filter(f => f.Estado_Final === 'WARNING').length,
  };

  await this.tracker.actualizarEstadoEjecucion(
    this.idEjecucion,
    'EN_PROGRESO',
    stats
  );
}

// Llamar después de cada fondo
async _executeFundServices(fund, services) {
  try {
    // ... procesamiento ...
  } finally {
    await this._updateExecutionStats();  // Actualizar después de cada fondo
  }
}
```

### Opción 3: Usar SQL Triggers
Crear trigger en `logs.Ejecucion_Fondos` que actualice automáticamente los contadores:

```sql
CREATE TRIGGER trg_UpdateExecutionStats
ON logs.Ejecucion_Fondos
AFTER UPDATE
AS
BEGIN
  UPDATE e
  SET
    FondosExitosos = (SELECT COUNT(*) FROM logs.Ejecucion_Fondos WHERE ID_Ejecucion = e.ID_Ejecucion AND Estado_Final = 'COMPLETADO'),
    FondosFallidos = (SELECT COUNT(*) FROM logs.Ejecucion_Fondos WHERE ID_Ejecucion = e.ID_Ejecucion AND Estado_Final = 'ERROR'),
    FondosWarning = (SELECT COUNT(*) FROM logs.Ejecucion_Fondos WHERE ID_Ejecucion = e.ID_Ejecucion AND Estado_Final = 'WARNING'),
    FondosOmitidos = (SELECT COUNT(*) FROM logs.Ejecucion_Fondos WHERE ID_Ejecucion = e.ID_Ejecucion AND Estado_Final = 'OMITIDO')
  FROM logs.Ejecuciones e
  WHERE e.ID_Ejecucion IN (SELECT DISTINCT ID_Ejecucion FROM inserted)
END
```

---

## Recomendación

**Opción 2** (Actualizar en tiempo real) es la mejor porque:
- ✅ Frontend ve progreso en tiempo real
- ✅ No requiere cambios en SQL Server
- ✅ Mantiene consistencia entre polling updates
- ⚠️ Más queries SQL (pero aceptable con polling de 2s)

**Implementación:**
1. Agregar método `_updateExecutionStats()` a FundOrchestrator
2. Llamarlo después de procesar cada fondo
3. Llamarlo al finalizar la ejecución completa

---

## Visualización Frontend: Dependencias

### Datos de logs.Ejecuciones (Usado para):
- ✅ Header: ID_Ejecucion, FechaReporte, Estado, FechaInicio
- ✅ Badge "LIVE" (si Estado = EN_PROGRESO)
- ❌ **Resumen de Ejecución:** Progreso General (NaN% por contadores en 0)
- ❌ **Estadísticas:** Total/Exitosos/Errores/Advertencias (todos en 0)

### Datos de logs.Ejecucion_Fondos (Usado para):
- ✅ **Lista de fondos:** FundShortName, FundName
- ✅ **Roadmap por fondo:** Estado_Process_IPA, Estado_Process_CAPM, etc.
- ✅ **Badges de estado:** Estado_Final (ERROR, WARNING, COMPLETADO)
- ✅ **Filtros:** Contar fondos por estado (Errores, Advertencias, etc.)

### Datos de logs.Ejecucion_Logs (Usado para):
- ✅ **Panel de logs:** Mostrar últimos 100 eventos
- ✅ **Detalles de error:** Stack traces, mensajes detallados

---

## Conclusión

**Respuesta a la pregunta:**

El frontend NO depende exclusivamente del sistema de logs (`logs.Ejecucion_Logs`).

Depende de **3 fuentes de datos**:

1. **logs.Ejecuciones** → Datos agregados de la ejecución
   - ✅ Se crea al inicio
   - ❌ NO se actualiza durante la ejecución (contadores permanecen en 0)

2. **logs.Ejecucion_Fondos** → Estado detallado por fondo
   - ✅ Se actualiza correctamente en tiempo real
   - ✅ ExecutionTracker.actualizarEstadoCampo() funciona

3. **logs.Ejecucion_Logs** → Logs de eventos
   - ✅ Se escribe correctamente con LoggingService

**Problema principal:** Los contadores agregados en `logs.Ejecuciones` nunca se actualizan porque `ExecutionTracker.actualizarEstadoEjecucion()` nunca se llama.

**Impacto:** Frontend muestra NaN% y contadores en 0, dando la impresión de que "nada está pasando" cuando en realidad los fondos SÍ están procesándose (visible en logs.Ejecucion_Fondos).

---

**Generado:** 2025-12-22 23:10:00
**Archivo:** server/FRONTEND_DATA_FLOW_ANALYSIS.md
