# Análisis Exhaustivo del Pipeline ETL - Moneda

**Fecha**: 2025-12-30
**Versión**: 1.0
**Estado**: Análisis post-refactorización

---

## 1. Resumen Ejecutivo

Este documento consolida el análisis completo del pipeline ETL tras la refactorización que:
- Migró todos los SPs a usar tablas temporales de SQL Server (`##tabla`)
- Centralizó el tracking en `TrackingService` con arquitectura event-driven
- Eliminó los servicios legacy (`ExecutionTracker`, `LoggingService`, `TraceService`)

**Hallazgos críticos**:
- **120+ SPs** distribuidos en 6 schemas
- **3 GAPS P0** que bloquean funcionalidad de tablas sandbox
- **Arquitectura event-driven parcialmente implementada**

---

## 2. Arquitectura de Base de Datos

### 2.1 Schemas y Responsabilidades

| Schema | Responsabilidad | Tablas Principales |
|--------|-----------------|-------------------|
| `logs` | Tracking y auditoría | Procesos, Ejecuciones, EventosDetallados, StandBy |
| `sandbox` | Alertas y validación | Alertas_*, Homologacion_*, Fondos_Problema |
| `extract` | Datos extraídos de fuentes | IPA, CAPM, Derivados, UBS, PNL |
| `staging` | Transformación intermedia | SPs de procesamiento (_v2) |
| `process` | Datos procesados finales | TBL_IPA, TBL_CAPM, CUBO_Final |
| `dimensionales` | Dimensiones y homologación | HOMOL_*, BD_* |

### 2.2 Tablas del Schema `logs`

| Tabla | Propósito | Poblada por |
|-------|-----------|-------------|
| `logs.Procesos` | Proceso padre (por fecha) | sp_Inicializar_Proceso |
| `logs.Ejecuciones` | Ejecución por fondo | sp_Inicializar_Ejecucion, TrackingService |
| `logs.EventosDetallados` | Eventos ERROR/WARNING/STAND_BY | TrackingService |
| `logs.StandBy` | Registros de stand-by | TrackingService |
| `logs.Ejecucion_Fondos` | Estados granulares (71 cols) | **NO SE USA** (legacy) |
| `logs.Ejecucion_Logs` | Logs bulk insert | **NO SE USA** (legacy) |
| `logs.FondosEnStandBy` | Fondos pausados | **NO SE USA** (legacy) |

### 2.3 Tablas del Schema `sandbox`

| Tabla | Propósito | Estado | Poblada por |
|-------|-----------|--------|-------------|
| `sandbox.Homologacion_Fondos` | Fondos sin homologar | ✅ OK | TrackingService (código 6) |
| `sandbox.Homologacion_Instrumentos` | Instrumentos sin homologar | ✅ OK | TrackingService (código 6) |
| `sandbox.Homologacion_Monedas` | Monedas sin homologar | ✅ OK | TrackingService (código 6) |
| `sandbox.Alertas_Suciedades_IPA` | Suciedades detectadas | ❌ NO SE POPULA | Ninguno (código 5 no implementado) |
| `sandbox.Alertas_Descuadre_Derivados` | Descuadres IPA-Derivados | ❌ NO SE POPULA | Ninguno (falta handler código 8) |
| `sandbox.Fondos_Problema` | Fondos con problemas | ⚠️ PARCIAL | Solo SP Validar_FondosActivos |

---

## 3. Stored Procedures del Pipeline

### 3.1 Flujo Principal: Process_Funds (7 pasos)

```
INICIO Process_Funds(@FechaReporte, @ID_Ejecucion)
│
├─ PASO 0: EXTRACCIÓN
│  ├─ extract.Extract_IPA
│  ├─ extract.Extract_CAPM
│  ├─ extract.Extract_Derivados
│  └─ extract.Extract_UBS
│
├─ PASO 0.5: VALIDACIÓN
│  └─ process.Validar_FondosActivos
│
├─ PASO 1: PROCESS_IPA
│  └─ staging.IPA_01 → IPA_02 → ... → IPA_07
│
├─ PASO 2: PROCESS_CAPM
│  └─ staging.CAPM_01 → CAPM_02 → CAPM_03
│
├─ PASO 3: PROCESS_DERIVADOS
│  └─ staging.DERIV_01 → DERIV_02 → DERIV_03 → DERIV_04
│
├─ PASO 4: PROCESS_PNL
│  └─ staging.PNL_01 → PNL_02 → PNL_03 → PNL_04
│
├─ PASO 5: PROCESS_UBS
│  └─ staging.UBS_01 → UBS_02 → UBS_03
│
├─ PASO 6: CONCATENAR_CUBO
│  └─ staging.Consolidar_Fondo_A_Cubo_v3
│
└─ PASO 7: SYNC_TO_GRAPH
   └─ process.Sync_PNL_To_Graph_v2
```

### 3.2 SPs por Schema

#### Schema `staging` (40+ SPs de transformación)

| SP | Entrada | Salida | Código Stand-by |
|----|---------|--------|-----------------|
| IPA_01_RescatarLocalPrice_v2 | extract.IPA | ##IPA_Work_{ID}_{Fund} | - |
| IPA_02_AjusteSONA_v2 | ##IPA_Work | ##IPA_Work | - |
| IPA_03_AjusteDerivados_v2 | ##IPA_Work | ##IPA_Work | - |
| **IPA_04_TratamientoSuciedades_v2** | ##IPA_Work | ##IPA_Work | **5 (pendiente)** |
| IPA_05_Homologacion_v2 | ##IPA_Work | ##IPA_Work | 6 |
| IPA_06_Calculados_v2 | ##IPA_Work | ##IPA_Final | - |
| IPA_07_AgruparRegistros_v2 | ##IPA_Final | ##IPA_Final | - |
| CAPM_01_Ajuste_CAPM_v2 | extract.CAPM | ##CAPM_Work | - |
| **CAPM_02_Extract_Transform_v2** | ##CAPM_Work | ##CAPM_Work | **6** |
| CAPM_03_Carga_Final_v2 | ##CAPM_Work | ##CAPM_Final | - |
| DERIV_01_Tratamiento_Posiciones | extract.Derivados | ##Derivados_Work | - |
| **DERIV_02_Homologar_Dimensiones_v2** | ##Derivados_Work | ##Derivados_Work | **6** |
| **DERIV_03_Ajuste_Derivados_v2** | ##Derivados_Work | ##Derivados_Final | **8** |
| **PNL_01_Dimensiones_v2** | extract.PNL | ##PNL_Work | **6** |
| **PNL_02_Ajuste_v2** | ##PNL_Work | ##PNL_Final | **8** |
| UBS_01_Tratamiento_v2 | extract.UBS | ##UBS_Work | - |
| UBS_02_Derivados_v2 | ##UBS_Work | ##UBS_Work | - |
| UBS_03_Carga_Final_v2 | ##UBS_Work | ##UBS_Final | - |
| Consolidar_Fondo_A_Cubo_v3 | ##*_Final | process.CUBO_Final | - |

### 3.3 Códigos de Retorno

| Código | Tipo | Significado | Acción Backend |
|--------|------|-------------|----------------|
| 0 | OK | Éxito con datos | Continuar |
| 1 | OK | Éxito sin datos (skip válido) | Continuar |
| 2 | RETRY | Deadlock/Timeout | Reintentar (max 3) |
| 3 | ERROR | Error crítico | Rollback, marcar ERROR |
| 5 | STAND_BY | Suciedades detectadas | ❌ NO IMPLEMENTADO |
| 6 | STAND_BY | Elementos sin homologar | ✅ TrackingService |
| 7 | STAND_BY | Descuadres CAPM | ❌ NO IMPLEMENTADO |
| 8 | STAND_BY | Descuadres general | ❌ NO IMPLEMENTADO |

---

## 4. Arquitectura Backend

### 4.1 Componentes Principales

```
┌─────────────────────────────────────────────────────────────┐
│                    procesos.v2.routes.js                     │
│                    (Endpoints HTTP)                          │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    FundOrchestrator.js                       │
│            (Orquesta ejecución por fondo)                    │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Fases: batch → parallel → sequential                 │    │
│  │ - EXTRACCION, VALIDACION (batch)                     │    │
│  │ - IPA, CAPM, DERIVADOS, PNL, UBS (parallel)         │    │
│  │ - CONSOLIDACION, CONCATENAR (sequential)             │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  BasePipelineService.js                      │
│               (Base de todos los servicios)                  │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ executeSP() → interpreta returnValue                 │    │
│  │ - 0-1: OK → emit('servicio:fin')                    │    │
│  │ - 2: RETRY → executeWithRetry()                     │    │
│  │ - 3: ERROR → throw Error                            │    │
│  │ - 5-8: STAND_BY → emit('standby:activado')          │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────┬───────────────────────────────┘
                              │ emit()
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                 PipelineEventEmitter.js                      │
│                    (Singleton)                               │
└─────────────────────────────┬───────────────────────────────┘
                              │ on()
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   TrackingService.js                         │
│              (Escucha eventos, persiste)                     │
│                                                              │
│  Eventos escuchados:                                         │
│  - servicio:inicio → _updateEstadoServicio('EN_PROGRESO')   │
│  - servicio:fin → _updateEstadoServicio('OK')               │
│  - servicio:error → _registrarEvento(), _updateErrorInfo()  │
│  - servicio:warning → _registrarEvento()                    │
│  - standby:activado → _registrarStandBy(),                  │
│                       _escribirHomologacionSandbox()         │
│  - ejecucion:fin → _finalizarEjecucion()                    │
│  - proceso:fin → _finalizarProceso()                        │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  WebSocketManager.js                         │
│            (Notifica frontend en tiempo real)                │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Flujo de Eventos

```
BasePipelineService.executeSP()
    │
    ├─ returnValue = 0-1 (OK)
    │   └─ pipelineEvents.emitServicioFin()
    │       └─ TrackingService.on('servicio:fin')
    │           └─ _updateEstadoServicio(idEjecucion, servicio, 'OK')
    │
    ├─ returnValue = 5-8 (STAND_BY)
    │   └─ pipelineEvents.emitStandByActivado(idEjecucion, idFund, codigo, servicio, {
    │       tipoProblema, cantidad, puntoBloqueo, motivo, homologacionData
    │   })
    │       └─ TrackingService.on('standby:activado')
    │           ├─ _updateEstadoServicio(..., 'STAND_BY')
    │           ├─ _registrarStandBy() → INSERT logs.StandBy
    │           ├─ _registrarEvento() → INSERT logs.EventosDetallados
    │           ├─ _updateFlagsProblema() → UPDATE logs.Ejecuciones
    │           ├─ _escribirHomologacionSandbox() → INSERT sandbox.Homologacion_*
    │           │   ⚠️ SOLO si código = 6 (HOMOLOGACION)
    │           │   ❌ NO escribe si código = 5 (SUCIEDADES)
    │           │   ❌ NO escribe si código = 7-8 (DESCUADRES)
    │           └─ _notifyWebSocket('STANDBY_ACTIVADO')
    │
    └─ returnValue = 3 (ERROR)
        └─ throw Error
            └─ FundOrchestrator.handleError()
                └─ pipelineEvents.emitServicioError()
                    └─ TrackingService.on('servicio:error')
                        ├─ _updateEstadoServicio(..., 'ERROR')
                        ├─ _registrarEvento()
                        └─ _updateErrorInfo()
```

---

## 5. GAPS Identificados

### 5.1 GAP-001: Descuadres no se escriben a sandbox (P0)

**Problema**: Cuando los SPs `DERIV_03_Ajuste_Derivados_v2` o `PNL_02_Ajuste_v2` retornan código 8, los datos de descuadre llegan a TrackingService pero NO se escriben a `sandbox.Alertas_Descuadre_Derivados`.

**Datos disponibles en el evento**:
```javascript
data.detalles.homologacionData = [
  {
    TipoHomologacion: 'DESCUADRE',
    Item: 'PORTFOLIO_NAME',
    Currency: null,
    Source: 'DERIVADOS',
    Detalle: 'Descuadre IPA-Derivados: MVBook=1000.00, MTM=950.00, Diferencia=50.00'
  }
]
```

**Tabla destino**:
```sql
sandbox.Alertas_Descuadre_Derivados (
    FechaReporte    NVARCHAR(MAX) NOT NULL,
    Portfolio       NVARCHAR(MAX) NOT NULL,
    MVBook_IPA      FLOAT NOT NULL,
    MTM_Derivados   FLOAT NOT NULL,
    Diferencia      FLOAT NOT NULL,
    FechaProceso    DATETIME
)
```

**Solución**: Agregar método `_escribirDescuadreSandbox()` en TrackingService que parsee el campo Detalle.

### 5.2 GAP-002: Suciedades no se auditan (P0)

**Problema**: El SP `IPA_04_TratamientoSuciedades_v2` elimina suciedades silenciosamente (DELETE) sin retornar código 5 ni datos.

**SP actual**:
```sql
-- Elimina sin registrar
DELETE FROM ##IPA_Work_...
WHERE ABS(ISNULL(MVBook, 0)) < 0.01
  AND InvestDescription NOT LIKE '%CASH%'
  AND InvestDescription NOT LIKE '%FX%';
RETURN 0;
```

**Solución**: Modificar SP para:
1. Contar suciedades antes de eliminar
2. Si hay suciedades, retornar recordset + código 5
3. Agregar handler en TrackingService para código 5

### 5.3 GAP-003: sandbox.Fondos_Problema parcialmente poblada (P0)

**Problema**: Solo el SP `Validar_FondosActivos` escribe a esta tabla. Errores detectados en otras etapas del backend no se registran.

**Solución**: Agregar escritura en handler `servicio:error` de TrackingService.

---

## 6. Tablas Temporales

### 6.1 Convención de Nombres

```
##<Servicio>_<Stage>_<ID_Ejecucion>_<ID_Fund>

Ejemplos:
- ##IPA_Work_123_456      → IPA en progreso
- ##IPA_Final_123_456     → IPA procesado
- ##CAPM_Work_123_456     → CAPM en progreso
- ##Derivados_Final_123_456 → Derivados procesado
```

### 6.2 Ciclo de Vida

```
1. CREACIÓN: SP de staging crea la tabla
   staging.IPA_01_v2 → CREATE TABLE ##IPA_Work_123_456

2. TRANSFORMACIÓN: SPs sucesivos modifican
   staging.IPA_02_v2 → UPDATE ##IPA_Work_123_456
   staging.IPA_03_v2 → UPDATE ##IPA_Work_123_456
   ...

3. FINALIZACIÓN: Último SP renombra o crea _Final
   staging.IPA_06_v2 → SELECT INTO ##IPA_Final_123_456

4. CONSOLIDACIÓN: Cubo lee y agrega
   staging.Consolidar_Fondo_A_Cubo_v3 → SELECT FROM ##*_Final_123_456

5. LIMPIEZA: Automática al cerrar conexión o explícita en error
   FundOrchestrator._cleanupTempTables() → DROP TABLE ##*_123_456
```

---

## 7. Recomendaciones

### Prioridad 0 (Críticas)

1. **Implementar escritura de descuadres** (GAP-001)
   - Archivo: `server/services/tracking/TrackingService.js`
   - Agregar `_escribirDescuadreSandbox()` + `_parsearDetalleDescuadre()`

2. **Implementar auditoría de suciedades** (GAP-002)
   - Archivo BD: `staging.IPA_04_TratamientoSuciedades_v2`
   - Archivo: `server/services/tracking/TrackingService.js`
   - Agregar `_escribirSuciedadSandbox()` + `_parsearDetalleSuciedad()`

3. **Completar sandbox.Fondos_Problema** (GAP-003)
   - Archivo: `server/services/tracking/TrackingService.js`
   - Agregar `_registrarFondoProblema()` en handler `servicio:error`

### Prioridad 1 (Importantes)

4. **Documentar códigos de retorno desconocidos**
   - Auditar todos los SPs para mapear códigos no estándar

5. **Evaluar tablas legacy**
   - `logs.Ejecucion_Fondos`: ¿Se requieren los 71 estados granulares?
   - `logs.Ejecucion_Logs`: ¿Hay código que la lee?

### Prioridad 2 (Mejoras)

6. **Agregar métricas de performance**
   - Duración por SP en `logs.EventosDetallados`

7. **Habilitar modo DEBUG**
   - Flag en TrackingService para console.log condicional

---

## 8. Apéndice: Estructura de Tablas

### sandbox.Alertas_Suciedades_IPA
```sql
FechaReporte    NVARCHAR(MAX)  -- Fecha del reporte
InvestID        NVARCHAR(MAX)  -- ID del instrumento
Qty             FLOAT          -- Cantidad
FechaProceso    NVARCHAR(MAX)  -- Timestamp
Portfolio       NVARCHAR(MAX)  -- Portfolio
```

### sandbox.Alertas_Descuadre_Derivados
```sql
FechaReporte    NVARCHAR(MAX) NOT NULL
Portfolio       NVARCHAR(MAX) NOT NULL
MVBook_IPA      FLOAT NOT NULL
MTM_Derivados   FLOAT NOT NULL
Diferencia      FLOAT NOT NULL
FechaProceso    DATETIME
```

### sandbox.Fondos_Problema
```sql
FechaReporte    NVARCHAR(MAX)
ID_Fund         INT
Proceso         NVARCHAR(MAX)
Tipo_Problema   NVARCHAR(MAX)
FechaProceso    NVARCHAR(MAX)
```

---

## 9. Plan Fase 4: Estados Granulares

### 9.1 Objetivo

Implementar tracking a nivel de SP individual para actualizar las 23 columnas granulares existentes en `logs.Ejecucion_Fondos` que actualmente no se actualizan.

### 9.2 Columnas Existentes (NO SE USAN)

| Servicio | Columnas Granulares | Cant. |
|----------|---------------------|-------|
| **IPA** | Estado_IPA_01_RescatarLocalPrice, Estado_IPA_02_AjusteSONA, Estado_IPA_03_RenombrarCxCCxP, Estado_IPA_04_TratamientoSuciedades, Estado_IPA_05_EliminarCajasMTM, Estado_IPA_06_CrearDimensiones, Estado_IPA_06B_PopulateIPACash, Estado_IPA_07_AgruparRegistros | 8 |
| **CAPM** | Estado_CAPM_01_Ajuste, Estado_CAPM_02_ExtractTransform, Estado_CAPM_03_CargaFinal | 3 |
| **DERIV** | Estado_DERIV_01_Posiciones, Estado_DERIV_02_Dimensiones, Estado_DERIV_03_Ajuste, Estado_DERIV_04_Paridad | 4 |
| **PNL** | Estado_PNL_01_Dimensiones, Estado_PNL_02_Ajuste, Estado_PNL_03_Agrupacion, Estado_PNL_04_AjusteIPA, Estado_PNL_05_Consolidar | 5 |
| **UBS** | Estado_UBS_01_Tratamiento, Estado_UBS_02_Derivados, Estado_UBS_03_Cartera | 3 |

**Total: 23 columnas granulares**

### 9.3 Arquitectura Actual

```
BasePipelineService.execute()
    ├── emitServicioInicio()     → TrackingService → Estado_IPA = 'EN_PROGRESO'
    ├── for (sp in spList):
    │       executeSP(sp)        → [SIN EVENTO]
    ├── emitServicioFin()        → TrackingService → Estado_IPA = 'OK'
    └── emitServicioError()      → TrackingService → Estado_IPA = 'ERROR'
```

**Problema**: No hay eventos entre SPs individuales, solo a nivel de servicio.

### 9.4 Solución: Nuevo Evento `sp:completado`

#### PipelineEventEmitter.js
```javascript
emitSPCompletado(idEjecucion, idFund, servicio, spName, subStateField, duracionMs, metadata = {}) {
  this.emit('sp:completado', {
    idEjecucion, idFund, servicio, spName, subStateField, duracionMs,
    rowsProcessed: metadata.rowsProcessed || 0,
    timestamp: new Date()
  });
}
```

#### BasePipelineService.js (en executeSP)
```javascript
const subStateField = spConfig.tracking?.subStateField;
if (subStateField) {
  pipelineEvents.emitSPCompletado(
    idEjecucion, fund.ID_Fund, this.id, spName, subStateField,
    Date.now() - spStartTime,
    { rowsProcessed, errorCount: result.output.ErrorCount || 0 }
  );
}
```

#### TrackingService.js
```javascript
pipelineEvents.on('sp:completado', async (data) => {
  await this._actualizarEstadoGranular(
    data.idEjecucion, data.idFund, data.subStateField, 'OK', data.duracionMs
  );
});

async _actualizarEstadoGranular(idEjecucion, idFund, columnName, estado, duracionMs) {
  const columnasValidas = [/* whitelist de 23 columnas */];
  if (!columnasValidas.includes(columnName)) return;

  await this.pool.request()
    .input('idEjecucion', sql.BigInt, idEjecucion)
    .input('idFund', sql.Int, idFund)
    .input('estado', sql.NVarChar(20), estado)
    .query(`UPDATE logs.Ejecucion_Fondos SET [${columnName}] = @estado
            WHERE ID_Ejecucion = @idEjecucion AND ID_Fund = @idFund`);
}
```

### 9.5 Mapeo SP → Columna (pipeline.config.yaml)

Ya configurado bajo `spConfig.tracking.subStateField`:

| SP | subStateField |
|----|---------------|
| staging.IPA_01_RescatarLocalPrice_v2 | Estado_IPA_01_RescatarLocalPrice |
| staging.IPA_02_AjusteSONA_v2 | Estado_IPA_02_AjusteSONA |
| staging.IPA_03_RenombrarCxCCxP_v2 | Estado_IPA_03_RenombrarCxCCxP |
| staging.IPA_04_TratamientoSuciedades_v2 | Estado_IPA_04_TratamientoSuciedades |
| staging.IPA_05_EliminarCajasMTM_v2 | Estado_IPA_05_EliminarCajasMTM |
| staging.IPA_06_CrearDimensiones_v2 | Estado_IPA_06_CrearDimensiones |
| staging.IPA_06B_PopulateIPACash_v2 | Estado_IPA_06B_PopulateIPACash |
| staging.IPA_07_AgruparRegistros_v2 | Estado_IPA_07_AgruparRegistros |
| staging.CAPM_01_Ajuste_CAPM_v2 | Estado_CAPM_01_Ajuste |
| staging.CAPM_02_Extract_Transform_v2 | Estado_CAPM_02_ExtractTransform |
| staging.CAPM_03_Carga_Final_v2 | Estado_CAPM_03_CargaFinal |
| staging.DERIV_01_Tratamiento_Posiciones_Larga_Corta_v2 | Estado_DERIV_01_Posiciones |
| staging.DERIV_02_Homologar_Dimensiones_v2 | Estado_DERIV_02_Dimensiones |
| staging.DERIV_03_Ajuste_Derivados_v2 | Estado_DERIV_03_Ajuste |
| staging.DERIV_04_Parity_Adjust_v2 | Estado_DERIV_04_Paridad |
| staging.PNL_01_Dimensiones_v2 | Estado_PNL_01_Dimensiones |
| staging.PNL_02_Ajuste_v2 | Estado_PNL_02_Ajuste |
| staging.PNL_03_Agrupacion_v2 | Estado_PNL_03_Agrupacion |
| staging.PNL_04_CrearRegistrosAjusteIPA_v2 | Estado_PNL_04_AjusteIPA |
| staging.PNL_05_Consolidar_IPA_PNL_v2 | Estado_PNL_05_Consolidar |
| staging.UBS_01_Tratamiento_Fondos_Luxemburgo_v2 | Estado_UBS_01_Tratamiento |
| staging.UBS_02_Tratamiento_Derivados_MLCCII_v2 | Estado_UBS_02_Derivados |
| staging.UBS_03_Creacion_Cartera_MLCCII_v2 | Estado_UBS_03_Cartera |

### 9.6 Archivos a Modificar

| Archivo | Cambio |
|---------|--------|
| `server/services/events/PipelineEventEmitter.js` | Agregar `emitSPCompletado()` |
| `server/services/pipeline/BasePipelineService.js` | Emitir evento después de SP |
| `server/services/tracking/TrackingService.js` | Agregar listener y método |

### 9.7 Resultado Esperado

Después de implementación, `logs.Ejecucion_Fondos` mostrará:

```
┌─────────────────────────────────────┬────────────┐
│ Columna                             │ Valor      │
├─────────────────────────────────────┼────────────┤
│ Estado_IPA_01_RescatarLocalPrice    │ OK         │
│ Estado_IPA_02_AjusteSONA            │ OK         │
│ Estado_IPA_03_RenombrarCxCCxP       │ OK         │
│ ... (23 columnas actualizadas)      │            │
└─────────────────────────────────────┴────────────┘
```

---

*Documento generado automáticamente como parte del análisis de refactorización del pipeline ETL.*
