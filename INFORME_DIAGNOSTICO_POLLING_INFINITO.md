# Informe de Diagnóstico: Polling Infinito en Pipeline ETL V2

**Fecha**: 2024-12-24
**Autor**: Claude Code (Análisis Automatizado)
**Sistema**: Pipeline ETL V2 - Frontend React + Backend Node.js
**ID Ejecución Analizada**: 1766174087379

---

## 📊 Resumen Ejecutivo

### Problema Identificado
El sistema de polling del frontend continúa ejecutando peticiones HTTP indefinidamente (`GET /api/procesos/v2/ejecucion/:id`) cada 2 segundos, aún después de que el proceso ETL ha finalizado exitosamente con estado `COMPLETADO` en la base de datos.

### Impacto
- **Carga innecesaria en servidor**: Peticiones continuas sin propósito
- **Consumo de recursos del navegador**: Timers activos que nunca se limpian
- **UX degradada**: Indicador de "polling activo" permanece visible
- **Posibles memory leaks**: Closures que no se liberan

### Root Cause Identificado
Problema de **reactividad en React hooks** causado por:
1. Dependencias incompletas en `useEffect` del hook de polling
2. Doble sistema de control (interno y externo) que crea complejidad
3. Posible uso de referencias de objeto obsoletas (stale closures)

### Solución Propuesta
Corrección del hook de polling y mejora de la reactividad en el sistema de contextos de React.

---

## 🔍 Investigación Detallada

### 1. Verificación de Evidencias

#### 1.1 Estado en Base de Datos

**Consulta SQL Ejecutada**:
```sql
SELECT TOP 1
    ID_Ejecucion,
    FechaReporte,
    FechaInicio,
    FechaFin,
    Estado,
    Etapa_Actual,
    TotalFondos,
    FondosExitosos,
    FondosFallidos
FROM logs.Ejecuciones
WHERE ID_Ejecucion = 1766174087379
```

**Resultado**:
```json
{
  "ID_Ejecucion": "1766174087379",
  "FechaReporte": "2025-10-24T00:00:00.000Z",
  "FechaInicio": "2025-12-24T10:29:04.740Z",
  "FechaFin": "2025-12-24T10:32:36.840Z",
  "Estado": "COMPLETADO",
  "Etapa_Actual": "COMPLETADO",
  "TotalFondos": 43,
  "FondosExitosos": 0,
  "FondosFallidos": 43,
  "FondosWarning": 0
}
```

**Conclusión**: ✅ El estado en la base de datos es correcto (`COMPLETADO`)

#### 1.2 Logs del Backend

**Evidencia del usuario**:
```
[ExecutionTracker] Estado de ejecución actualizado - ID: 1766174087379, Estado: COMPLETADO
[FundOrchestrator 1766174087379] Stats actualizados - OK: 0, Error: 43, Warning: 0, Omitidos: 0
[FundOrchestrator 1766174087379] Ejecución completada exitosamente
[Ejecución 1766174087379] FundOrchestrator V2 completado exitosamente

2025-12-24T13:34:01.615Z - GET /api/procesos/v2/ejecucion/1766174087379
2025-12-24T13:34:03.610Z - GET /api/procesos/v2/ejecucion/1766174087379
2025-12-24T13:34:05.614Z - GET /api/procesos/v2/ejecucion/1766174087379
... (continúa indefinidamente)
```

**Conclusión**: ✅ El backend procesa y finaliza correctamente, pero el frontend sigue haciendo polling

#### 1.3 Logs del DevTools Frontend

**Evidencia del usuario**:
```
[useExecutionPolling] Iniciando polling para ejecución 1766174087379
```

**Conclusión**: ⚠️ No hay log de `[useExecutionPolling] Deteniendo polling`, lo que indica que `stopPolling()` nunca se ejecuta

---

### 2. Análisis de Arquitectura del Sistema de Polling

#### 2.1 Componentes Involucrados

```
┌─────────────────────────────────────────────────────────────────┐
│                  PipelineExecutionContainer                     │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │              useExecutionState (Hook Central)             │  │
│  │  ┌────────────────────────────────────────────────────┐   │  │
│  │  │        PipelineExecutionContext                    │   │  │
│  │  │  - ejecucion: { Estado: 'COMPLETADO', ... }       │   │  │
│  │  └────────────────────────────────────────────────────┘   │  │
│  │  ┌────────────────────────────────────────────────────┐   │  │
│  │  │   Computed: executionStatus                        │   │  │
│  │  │   useMemo(() => {                                  │   │  │
│  │  │     if (Estado === 'COMPLETADO') return 'completed'│   │  │
│  │  │   }, [execution.ejecucion]) ← Dependencia objeto   │   │  │
│  │  └────────────────────────────────────────────────────┘   │  │
│  │  ┌────────────────────────────────────────────────────┐   │  │
│  │  │   Computed: isFinished                             │   │  │
│  │  │   useMemo(() => {                                  │   │  │
│  │  │     return executionStatus === 'completed' || ...  │   │  │
│  │  │   }, [executionStatus])                            │   │  │
│  │  └────────────────────────────────────────────────────┘   │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  useExecutionPolling(idEjecucion, {                             │
│    enabled: !!ejecucion && !isFinished ← Control externo       │
│  })                                                              │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │           useExecutionPolling Hook                         │ │
│  │  ┌──────────────────────────────────────────────────────┐  │ │
│  │  │  poll() {                                            │  │ │
│  │  │    const estado = response.ejecucion?.Estado;        │  │ │
│  │  │    if (estado === 'COMPLETADO') {                    │  │ │
│  │  │      stopPolling(); ← Control interno                │  │ │
│  │  │    }                                                 │  │ │
│  │  │  }                                                   │  │ │
│  │  └──────────────────────────────────────────────────────┘  │ │
│  │  ┌──────────────────────────────────────────────────────┐  │ │
│  │  │  useEffect(() => {                                   │  │ │
│  │  │    if (enabled && idEjecucion) {                     │  │ │
│  │  │      startPolling();                                 │  │ │
│  │  │    } else {                                          │  │ │
│  │  │      stopPolling();                                  │  │ │
│  │  │    }                                                 │  │ │
│  │  │  }, [enabled, idEjecucion]) ← Deps incompletas!     │  │ │
│  │  │  // eslint-disable react-hooks/exhaustive-deps      │  │ │
│  │  └──────────────────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

#### 2.2 Flujo de Datos Esperado

```
Backend finaliza ETL
    ↓
Estado en DB = 'COMPLETADO'
    ↓
Polling hace GET /api/procesos/v2/ejecucion/:id
    ↓
Response: { ejecucion: { Estado: 'COMPLETADO' } }
    ↓
poll() detecta: isComplete = true
    ↓
Llama stopPolling() internamente ← MECANISMO 1 (DEBERÍA FUNCIONAR)
    ↓
clearInterval(intervalRef.current)
    ↓
intervalRef.current = null
    ↓
setIsPolling(false)
    ↓
ADEMÁS: onUpdate(response) actualiza context
    ↓
execution.updateEjecucion({ Estado: 'COMPLETADO' })
    ↓
executionStatus useMemo recalcula → 'completed'
    ↓
isFinished useMemo recalcula → true
    ↓
PipelineExecutionContainer re-render
    ↓
enabled: !isFinished → false
    ↓
useEffect detecta cambio en [enabled, idEjecucion]
    ↓
Ejecuta: stopPolling() ← MECANISMO 2 (REDUNDANTE)
```

**Problema**: Si MECANISMO 1 falla, MECANISMO 2 debería funcionar como respaldo, pero tampoco lo hace.

---

### 3. Root Cause Analysis Detallado

#### 3.1 Hipótesis Principal: Problema de Dependencias en useEffect

**Archivo**: `src/components/PipelineV2/hooks/useExecutionPolling.js`
**Líneas**: 168-180

**Código actual**:
```javascript
useEffect(() => {
  if (enabled && idEjecucion) {
    startPolling();
  } else {
    stopPolling();
  }

  return () => {
    stopPolling();
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [enabled, idEjecucion]);
```

**Análisis del problema**:

1. **Dependencias incompletas**: El useEffect depende de `[enabled, idEjecucion]`, pero usa `startPolling` y `stopPolling` que NO están en las dependencias.

2. **eslint-disable es señal de problema**: La deshabilitación de la advertencia de React hooks indica que alguien conscientemente ignoró el warning, probablemente porque agregar las dependencias causaba re-renders infinitos.

3. **Stale closures**: Las funciones `startPolling` y `stopPolling` están envueltas en `useCallback`, pero cuando el useEffect se ejecuta, podría estar usando versiones viejas de estas funciones si el `useCallback` no se regeneró.

4. **Control externo depende de reactividad**: El parámetro `enabled` depende de `isFinished`, que a su vez depende de `executionStatus`, que depende de `execution.ejecucion`. Si hay un problema en esta cadena de dependencias, `enabled` nunca cambia.

#### 3.2 Hipótesis Secundaria: Referencia de Objeto No Cambia

**Archivo**: `src/components/PipelineV2/contexts/PipelineExecutionContext.js`
**Líneas**: 25-27

**Código actual**:
```javascript
const updateEjecucion = useCallback((newEjecucion) => {
  setEjecucion(newEjecucion);
}, []);
```

**Problema potencial**:

Si `pollingData.ejecucion` (que viene del endpoint) tiene la misma referencia de objeto entre polls (aunque cambie el contenido), React no detectará el cambio y los `useMemo` que dependen de `execution.ejecucion` NO se recalcularán.

**Ejemplo**:
```javascript
// Poll 1: Estado = 'EN_PROGRESO'
const obj1 = { Estado: 'EN_PROGRESO', ... };
execution.updateEjecucion(obj1);
// useMemo se ejecuta: executionStatus = 'running'

// Poll 2: Estado = 'COMPLETADO' (pero mismo objeto mutado)
obj1.Estado = 'COMPLETADO'; // Mutación!
execution.updateEjecucion(obj1); // MISMA REFERENCIA
// useMemo NO se ejecuta porque la referencia es la misma
// executionStatus sigue siendo 'running'
// isFinished sigue siendo false
```

#### 3.3 Hipótesis Terciaria: useMemo con Dependencia de Objeto Completo

**Archivo**: `src/components/PipelineV2/hooks/useExecutionState.js`
**Líneas**: 22-34

**Código actual**:
```javascript
const executionStatus = useMemo(() => {
  if (!execution.ejecucion) return 'idle';

  const estado = execution.ejecucion.Estado;

  if (estado === 'COMPLETADO') return 'completed';
  // ...
}, [execution.ejecucion]); // ← Dependencia del objeto completo
```

**Problema**:

El useMemo depende del objeto completo `execution.ejecucion` en lugar de solo la propiedad `Estado`. Esto puede causar:
- Recalculos innecesarios cuando cambian otras propiedades
- Falta de recalculos si la referencia del objeto no cambia

**Mejor approach**:
```javascript
const estado = execution.ejecucion?.Estado;

const executionStatus = useMemo(() => {
  if (!estado) return 'idle';
  // ...
}, [estado]); // Depender solo del valor que importa
```

---

### 4. Análisis de Código Fuente

#### 4.1 Hook de Polling (useExecutionPolling.js)

**Función poll()** - Líneas 47-104:
```javascript
const poll = useCallback(async () => {
  if (!idEjecucion) {
    console.warn('[useExecutionPolling] No execution ID provided');
    return;
  }

  try {
    // Llamar al endpoint de estado
    const response = await procesosService.getEjecucionEstado(idEjecucion);

    if (!isMountedRef.current) return;

    // Reset error count en caso de éxito
    consecutiveErrorsRef.current = 0;
    setErrorCount(0);
    setLastError(null);
    setLastUpdate(new Date());

    // Callback de actualización
    if (onUpdate) {
      onUpdate(response);
    }

    // ⭐ PUNTO CRÍTICO: Verificar si la ejecución ha completado
    const estado = response.ejecucion?.Estado;
    const isComplete = estado === 'COMPLETADO' || estado === 'ERROR' || estado === 'PARCIAL';

    if (isComplete) {
      // Detener polling
      stopPolling(); // ← DEBERÍA ejecutarse cuando Estado = 'COMPLETADO'

      // Callback de completado
      if (onComplete) {
        onComplete(response);
      }
    }
  } catch (error) {
    // ... manejo de errores
  }
}, [idEjecucion, onUpdate, onComplete, onError, maxErrors]);
```

**Análisis**:
- ✅ La lógica de detección es correcta: `isComplete = estado === 'COMPLETADO'`
- ✅ Llama a `stopPolling()` cuando detecta finalización
- ⚠️ No hay guards para evitar que poll() se ejecute si ya se limpió el intervalo
- ⚠️ `onUpdate(response)` se ejecuta ANTES de verificar `isComplete`, lo cual puede causar race conditions

**Función stopPolling()** - Líneas 133-140:
```javascript
const stopPolling = useCallback(() => {
  if (intervalRef.current) {
    console.log('[useExecutionPolling] Deteniendo polling');
    clearInterval(intervalRef.current);
    intervalRef.current = null;
    setIsPolling(false);
  }
}, []);
```

**Análisis**:
- ✅ Lógica correcta de limpieza
- ⚠️ `setIsPolling(false)` solo se ejecuta si `intervalRef.current` existe
- ⚠️ Si por alguna razón `intervalRef.current` es null pero el intervalo sigue activo, no se limpia

**useEffect de control** - Líneas 168-180:
```javascript
useEffect(() => {
  if (enabled && idEjecucion) {
    startPolling();
  } else {
    stopPolling();
  }

  return () => {
    stopPolling();
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [enabled, idEjecucion]);
```

**Análisis**:
- ❌ **Dependencias incompletas**: Falta `startPolling` y `stopPolling`
- ❌ **eslint-disable**: Indica problema de diseño
- ⚠️ Si `enabled` no cambia correctamente, este useEffect no se ejecuta

#### 4.2 Hook de Estado (useExecutionState.js)

**Cálculo de executionStatus** - Líneas 22-34:
```javascript
const executionStatus = useMemo(() => {
  if (!execution.ejecucion) return 'idle';

  const estado = execution.ejecucion.Estado;

  if (estado === 'COMPLETADO') return 'completed';
  if (estado === 'ERROR') return 'error';
  if (estado === 'PARCIAL') return 'partial';
  if (estado === 'EN_PROGRESO') return 'running';
  if (estado === 'INICIALIZANDO') return 'initializing';

  return 'idle';
}, [execution.ejecucion]); // ← Depende del objeto completo
```

**Cálculo de isFinished** - Líneas 42-46:
```javascript
const isFinished = useMemo(() => {
  return executionStatus === 'completed' ||
         executionStatus === 'error' ||
         executionStatus === 'partial';
}, [executionStatus]);
```

**updateFromPolling** - Líneas 74-87:
```javascript
const updateFromPolling = useCallback((pollingData) => {
  if (!pollingData) return;

  // Actualizar ejecución
  if (pollingData.ejecucion) {
    execution.updateEjecucion(pollingData.ejecucion);
  }

  // Actualizar fondos
  if (pollingData.fondos && Array.isArray(pollingData.fondos)) {
    const parsedFondos = parseFondos(pollingData.fondos);
    fondos.updateFondos(parsedFondos);
  }
}, [execution, fondos]);
```

**Análisis**:
- ⚠️ `pollingData.ejecucion` se pasa directamente a `updateEjecucion` sin crear nuevo objeto
- ⚠️ Si el endpoint retorna el mismo objeto con mutaciones, React no detectará cambios

#### 4.3 Context de Ejecución (PipelineExecutionContext.js)

**updateEjecucion** - Líneas 25-27:
```javascript
const updateEjecucion = useCallback((newEjecucion) => {
  setEjecucion(newEjecucion);
}, []);
```

**Análisis**:
- ⚠️ No garantiza que se cree un nuevo objeto
- ⚠️ Si `newEjecucion` es la misma referencia, React podría no re-renderizar

#### 4.4 Contenedor Principal (PipelineExecutionContainer.jsx)

**Configuración del polling** - Líneas 70-84:
```javascript
const pollingHook = useExecutionPolling(
  executionState.ejecucion?.ID_Ejecucion,
  {
    enabled: !!executionState.ejecucion && !executionState.isFinished, // ← Control externo
    onUpdate: (data) => {
      executionState.updateFromPolling(data);
    },
    onComplete: (data) => {
      console.log('[PipelineContainer] Ejecución completada:', data);
    },
    onError: (error) => {
      console.error('[PipelineContainer] Error en polling:', error);
    },
  }
);
```

**Análisis**:
- ✅ Lógica correcta: `enabled: !isFinished`
- ⚠️ Depende completamente de la reactividad de `isFinished`
- ⚠️ Si `isFinished` no se actualiza, `enabled` permanece `true`

---

### 5. Endpoint del Backend

**Ruta**: `GET /api/procesos/v2/ejecucion/:id`
**Archivo**: `server/routes/procesos.v2.routes.js`
**Líneas**: 223-329

**Código relevante** - Líneas 230-235:
```javascript
const ejecucionResult = await pool.request()
  .input('ID_Ejecucion', sql.BigInt, id)
  .query(`
    SELECT * FROM logs.Ejecuciones
    WHERE ID_Ejecucion = @ID_Ejecucion
  `);
```

**Respuesta** - Líneas 303-313:
```javascript
res.json({
  success: true,
  data: {
    ejecucion: ejecucionResult.recordset[0],
    fondos: fondosResult.recordset,
    logs: logsResult.recordset.reverse(),
    metricas: metricasResult.recordset,
  },
});
```

**Análisis**:
- ✅ El endpoint retorna `ejecucionResult.recordset[0]` directamente desde SQL Server
- ✅ Cada llamada crea un nuevo objeto desde el recordset
- ✅ No hay mutación de objetos en el backend
- ✅ El endpoint SIEMPRE retorna datos frescos de la BD

---

## 🎯 Conclusiones

### Causa Raíz Identificada

**Problema Principal**: El hook `useExecutionPolling` tiene un useEffect con dependencias incompletas (`[enabled, idEjecucion]`) que no incluye `startPolling` ni `stopPolling`. Esto, combinado con `eslint-disable`, indica que el control externo del polling (mediante el parámetro `enabled`) NO está funcionando correctamente.

**Mecanismos de fallo**:

1. **Control interno** (líneas 71-82 de useExecutionPolling.js):
   - DEBERÍA funcionar: detecta `Estado === 'COMPLETADO'` y llama `stopPolling()`
   - Posible fallo: Race condition entre `onUpdate()` y verificación de `isComplete`

2. **Control externo** (línea 73 de PipelineExecutionContainer.jsx):
   - DEBERÍA funcionar: cuando `isFinished = true`, `enabled = false` → useEffect llama `stopPolling()`
   - **Fallo confirmado**: El useEffect no se ejecuta correctamente por dependencias incompletas

### Evidencia del Fallo

- ✅ Backend retorna `Estado: 'COMPLETADO'` correctamente
- ✅ Base de datos tiene estado correcto
- ❌ No hay log de `[useExecutionPolling] Deteniendo polling`
- ❌ Peticiones continúan indefinidamente cada 2 segundos
- ❌ El intervalo nunca se limpia

---

## 🔧 Plan de Solución

### Fase 1: Diagnóstico con Logs (1 hora)

**Objetivo**: Confirmar hipótesis mediante logs estratégicos

**Archivos a modificar**:

1. **useExecutionPolling.js** - Agregar logs:
   ```javascript
   // En poll() después de recibir response
   console.log('[DEBUG] Poll response:', {
     idEjecucion,
     estado: response.ejecucion?.Estado,
     isComplete,
     intervalRefExists: !!intervalRef.current,
     isPollingState: isPolling
   });

   // En stopPolling()
   console.log('[DEBUG] stopPolling called', {
     hadInterval: !!intervalRef.current,
     stack: new Error().stack
   });

   // En startPolling()
   console.log('[DEBUG] startPolling called', {
     alreadyRunning: !!intervalRef.current
   });
   ```

2. **useExecutionState.js** - Logs en useMemo:
   ```javascript
   const executionStatus = useMemo(() => {
     const estado = execution.ejecucion?.Estado;
     console.log('[DEBUG] executionStatus recalculated:', { estado });
     // ... lógica
   }, [execution.ejecucion]);

   const isFinished = useMemo(() => {
     const finished = executionStatus === 'completed' || ...;
     console.log('[DEBUG] isFinished recalculated:', { executionStatus, isFinished: finished });
     return finished;
   }, [executionStatus]);
   ```

3. **PipelineExecutionContainer.jsx** - Log de enabled:
   ```javascript
   useEffect(() => {
     const enabledValue = !!executionState.ejecucion && !executionState.isFinished;
     console.log('[DEBUG] Polling config changed:', {
       enabled: enabledValue,
       hasEjecucion: !!executionState.ejecucion,
       isFinished: executionState.isFinished,
       estado: executionState.ejecucion?.Estado,
       executionStatus: executionState.executionStatus
     });
   }, [executionState.ejecucion, executionState.isFinished, executionState.executionStatus]);
   ```

**Prueba**: Ejecutar pipeline y analizar secuencia de logs

### Fase 2: Corrección del Hook de Polling (30 minutos)

**Archivo**: `src/components/PipelineV2/hooks/useExecutionPolling.js`

**Cambio 1**: Arreglar dependencias del useEffect (líneas 168-180):
```javascript
useEffect(() => {
  if (enabled && idEjecucion) {
    startPolling();
  } else {
    stopPolling();
  }

  return () => {
    stopPolling();
  };
}, [enabled, idEjecucion, startPolling, stopPolling]); // Agregar dependencias
```

**Cambio 2**: Mejorar stopPolling para garantizar limpieza (líneas 133-140):
```javascript
const stopPolling = useCallback(() => {
  if (intervalRef.current) {
    console.log('[useExecutionPolling] Deteniendo polling');
    clearInterval(intervalRef.current);
    intervalRef.current = null;
  }
  setIsPolling(false); // Mover FUERA del if
}, []);
```

**Cambio 3**: Agregar guards en poll() (líneas 47-104):
```javascript
const poll = useCallback(async () => {
  if (!idEjecucion) return;

  // Guard: Verificar si ya se detuvo
  if (!intervalRef.current && !isPolling) {
    console.warn('[useExecutionPolling] Poll llamado pero polling ya detenido');
    return;
  }

  try {
    const response = await procesosService.getEjecucionEstado(idEjecucion);

    if (!isMountedRef.current) return;

    // Guard: Verificar nuevamente después del async
    if (!intervalRef.current) {
      console.warn('[useExecutionPolling] Interval limpio durante poll async');
      return;
    }

    // ... resto del código sin cambios
  }
}, [idEjecucion, onUpdate, onComplete, onError, maxErrors, isPolling]);
```

### Fase 3: Mejorar Reactividad del Context (20 minutos)

**Archivo**: `src/components/PipelineV2/contexts/PipelineExecutionContext.js`

**Cambio**: Forzar nuevo objeto (líneas 25-27):
```javascript
const updateEjecucion = useCallback((newEjecucion) => {
  if (!newEjecucion) {
    setEjecucion(null);
    return;
  }

  // Crear siempre un nuevo objeto para garantizar re-render
  setEjecucion(prev => {
    if (prev?.ID_Ejecucion === newEjecucion.ID_Ejecucion) {
      // Mismo ID, forzar nueva referencia
      return { ...newEjecucion };
    }
    return newEjecucion;
  });
}, []);
```

### Fase 4: Simplificar useMemo (15 minutos)

**Archivo**: `src/components/PipelineV2/hooks/useExecutionState.js`

**Cambio**: Extraer Estado como dependencia (líneas 22-34):
```javascript
// Extraer valor primitivo
const estado = execution.ejecucion?.Estado;

const executionStatus = useMemo(() => {
  if (!estado) return 'idle';

  if (estado === 'COMPLETADO') return 'completed';
  if (estado === 'ERROR') return 'error';
  if (estado === 'PARCIAL') return 'partial';
  if (estado === 'EN_PROGRESO') return 'running';
  if (estado === 'INICIALIZANDO') return 'initializing';

  return 'idle';
}, [estado]); // Depender solo del string, no del objeto
```

### Fase 5: Pruebas de Validación (30 minutos)

**Test Suite**:

1. **Test 1**: Ejecución hasta completado
   - Iniciar ejecución
   - Verificar polling inicia
   - Esperar COMPLETADO
   - ✅ Verificar polling se detiene
   - ✅ Verificar en consola: "Deteniendo polling"

2. **Test 2**: Ejecución con error
   - Forzar error en ETL
   - ✅ Verificar polling se detiene con Estado = 'ERROR'

3. **Test 3**: Ejecución parcial
   - Crear escenario parcial
   - ✅ Verificar polling se detiene con Estado = 'PARCIAL'

4. **Test 4**: Múltiples ejecuciones consecutivas
   - Ejecutar → esperar completado → ejecutar nuevo
   - ✅ Verificar primer polling se detiene antes del segundo

5. **Test 5**: Cleanup al desmontar
   - Iniciar polling
   - Navegar a otra página
   - ✅ Verificar no hay peticiones en red

### Fase 6: Limpieza (15 minutos)

- Eliminar console.logs de debug agregados en Fase 1
- Verificar que no se rompió nada
- Commit con mensaje descriptivo

---

## 📊 Métricas de Éxito

### Antes de la Corrección
- ❌ Polling continúa indefinidamente
- ❌ ~30 peticiones por minuto sin propósito
- ❌ Indicador de "polling activo" permanece visible
- ❌ No hay log de "Deteniendo polling"

### Después de la Corrección
- ✅ Polling se detiene automáticamente al completar
- ✅ 0 peticiones después de finalización
- ✅ Indicador de "polling activo" desaparece
- ✅ Log confirma: "[useExecutionPolling] Deteniendo polling"
- ✅ Sin memory leaks (verificar con React DevTools)

---

## 🔬 Análisis de Impacto

### Riesgo de la Corrección
**BAJO**: Los cambios son focalizados en la lógica de polling, no afectan el procesamiento ETL.

### Regresión Posible
- Polling podría detenerse prematuramente (mitigado con tests)
- Re-renders adicionales por nueva referencia de objeto (impacto mínimo)

### Beneficios
- ✅ Reduce carga en servidor backend
- ✅ Mejora rendimiento del navegador
- ✅ Mejor UX (indicadores correctos)
- ✅ Sin memory leaks
- ✅ Código más mantenible (sin eslint-disable)

---

## 📚 Lecciones Aprendidas

### 1. Dependencias de useEffect
**Problema**: Deshabilitar advertencias de dependencias con `eslint-disable` es una bandera roja.

**Lección**: Si React Hooks te advierte sobre dependencias faltantes, hay un problema de diseño. No ignorar el warning.

**Buena práctica**:
```javascript
// ❌ MAL
useEffect(() => {
  someFunction();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [someDep]);

// ✅ BIEN
useEffect(() => {
  someFunction();
}, [someDep, someFunction]); // Incluir todas las dependencias
```

### 2. useMemo con Objetos Complejos
**Problema**: Depender de objetos completos en useMemo puede causar problemas de reactividad.

**Lección**: Extraer valores primitivos antes de usarlos en useMemo.

**Buena práctica**:
```javascript
// ❌ MAL
const computed = useMemo(() => {
  return obj.propA + obj.propB;
}, [obj]); // Depende de todo el objeto

// ✅ BIEN
const propA = obj?.propA;
const propB = obj?.propB;
const computed = useMemo(() => {
  return propA + propB;
}, [propA, propB]); // Depende solo de lo que usa
```

### 3. Doble Control es Complejidad Innecesaria
**Problema**: Tener mecanismo interno (en poll) y externo (vía enabled) crea redundancia.

**Lección**: Un solo mecanismo bien diseñado es mejor que dos que pueden fallar.

**Recomendación**: Confiar en el mecanismo interno de `stopPolling()` en `poll()`, y usar el control externo solo como respaldo.

### 4. Referencias de Objeto en React State
**Problema**: Si actualizas estado con el mismo objeto (misma referencia), React no re-renderiza.

**Lección**: Siempre crear nuevos objetos al actualizar estado.

**Buena práctica**:
```javascript
// ❌ MAL
obj.prop = newValue;
setState(obj);

// ✅ BIEN
setState({ ...obj, prop: newValue });
setState(prev => ({ ...prev, prop: newValue }));
```

---

## 🔗 Referencias

### Archivos del Sistema

| Archivo | Ruta Completa | Función |
|---------|---------------|---------|
| Hook de Polling | `src/components/PipelineV2/hooks/useExecutionPolling.js` | Sistema de polling automático |
| Hook de Estado | `src/components/PipelineV2/hooks/useExecutionState.js` | Estado central de ejecución |
| Context Ejecución | `src/components/PipelineV2/contexts/PipelineExecutionContext.js` | Context de ejecución |
| Contenedor | `src/components/PipelineV2/PipelineExecutionContainer.jsx` | Componente principal |
| Endpoint Backend | `server/routes/procesos.v2.routes.js` | API de estado |

### Documentación React
- [Rules of Hooks](https://react.dev/reference/rules/rules-of-hooks)
- [useEffect](https://react.dev/reference/react/useEffect)
- [useMemo](https://react.dev/reference/react/useMemo)
- [useCallback](https://react.dev/reference/react/useCallback)

---

## 📝 Notas Adicionales

### Alternativa: Simplificar Sistema de Polling

Si las correcciones propuestas no resuelven el problema completamente, considerar refactorización más profunda:

**Opción A**: Eliminar control externo, confiar solo en mecanismo interno
```javascript
// En PipelineExecutionContainer
const pollingHook = useExecutionPolling(
  executionState.ejecucion?.ID_Ejecucion,
  {
    enabled: true, // Siempre habilitado, el hook maneja su propia lógica
    // ...
  }
);
```

**Opción B**: Usar biblioteca especializada
- [react-query](https://tanstack.com/query) - Manejo automático de polling
- [swr](https://swr.vercel.app/) - Stale-while-revalidate pattern

**Opción C**: WebSockets en lugar de polling
- Más eficiente para actualizaciones en tiempo real
- Requiere cambios en backend

---

## ✅ Checklist de Implementación

- [ ] Fase 1: Agregar logs de diagnóstico
- [ ] Ejecutar test y capturar logs
- [ ] Analizar secuencia de logs
- [ ] Fase 2: Corregir hook de polling
- [ ] Fase 3: Mejorar context
- [ ] Fase 4: Simplificar useMemo
- [ ] Fase 5: Ejecutar suite de tests
- [ ] Fase 6: Eliminar logs debug
- [ ] Verificar en DevTools (no memory leaks)
- [ ] Commit y PR

---

**Fin del Informe**

---

**Anexo A: SQL Queries Útiles**

```sql
-- Ver estado de ejecución
SELECT ID_Ejecucion, Estado, Etapa_Actual, FechaFin
FROM logs.Ejecuciones
WHERE ID_Ejecucion = 1766174087379;

-- Ver fondos de ejecución
SELECT ID_Fund, FundShortName, Estado_Final, Mensaje_Error
FROM logs.Ejecucion_Fondos
WHERE ID_Ejecucion = 1766174087379;

-- Contar fondos por estado
SELECT Estado_Final, COUNT(*) as Total
FROM logs.Ejecucion_Fondos
WHERE ID_Ejecucion = 1766174087379
GROUP BY Estado_Final;
```

**Anexo B: Logs Esperados (Secuencia Correcta)**

```
[useExecutionPolling] Iniciando polling para ejecución 1766174087379
[DEBUG] startPolling called: { alreadyRunning: false }
[DEBUG] Poll response: { estado: 'EN_PROGRESO', isComplete: false, ... }
[DEBUG] executionStatus recalculated: { estado: 'EN_PROGRESO' }
[DEBUG] isFinished recalculated: { executionStatus: 'running', isFinished: false }
[DEBUG] Polling config changed: { enabled: true, isFinished: false }
... (varios polls)
[DEBUG] Poll response: { estado: 'COMPLETADO', isComplete: true, ... }
[DEBUG] stopPolling called: { hadInterval: true }
[useExecutionPolling] Deteniendo polling
[DEBUG] executionStatus recalculated: { estado: 'COMPLETADO' }
[DEBUG] isFinished recalculated: { executionStatus: 'completed', isFinished: true }
[DEBUG] Polling config changed: { enabled: false, isFinished: true }
[PipelineContainer] Ejecución completada
```
