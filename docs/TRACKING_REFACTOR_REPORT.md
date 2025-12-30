# Reporte Exhaustivo: Refactorización del Sistema de Tracking

**Fecha:** 2025-12-30
**Autor:** Claude Code
**Estado:** Plan aprobado, listo para implementación

---

## 1. RESUMEN EJECUTIVO

Este documento detalla el análisis exhaustivo y plan de refactorización del sistema de tracking del pipeline ETL. El objetivo es eliminar la contaminación de código, unificar 3 servicios paralelos en uno solo, y simplificar el schema de base de datos.

### Problema Principal
El sistema actual tiene **4 capas de tracking paralelas** que no conversan entre sí:
1. ExecutionTracker.js (598 líneas) → logs.Ejecucion_Fondos
2. LoggingService.js (618 líneas) → logs.Ejecucion_Logs
3. TraceService.js (272 líneas) → logs.Trace_Records (casi muerto)
4. console.log/warn/error → stdout (no persistente)

**Resultado:** Un mismo evento se registra 3-5 veces en lugares diferentes, causando:
- Redundancia masiva en BD
- Confusión sobre "fuente de verdad"
- Inconsistencias en naming y niveles
- Campos nunca utilizados

### Solución
Arquitectura Event-Driven con un único TrackingService que escucha eventos emitidos por BasePipelineService.

---

## 2. ANÁLISIS DE CONTAMINACIÓN

### 2.1 Estadísticas Globales

| Métrica | Valor |
|---------|-------|
| **Total puntos contaminados** | 217 |
| **Llamadas a logger/console** | 113 (52%) |
| **Llamadas a tracker/trace** | 11 (5%) |
| **Queries SQL directos** | 93 (43%) |
| **Archivos afectados** | 11 |

### 2.2 Contaminación por Archivo

| Archivo | Líneas | Contaminación | Problema Principal |
|---------|--------|---------------|-------------------|
| `BasePipelineService.js` | 1048 | 95% | Clase base mezclada con logging |
| `ExtractionService.js` | 516 | 65% | 25 console.log de debug |
| `ValidationService.js` | 426 | 52% | 18 SQL directos |
| `IPAService.js` | 363 | 48% | Logger/tracker en cada paso |
| `CAPMService.js` | 350 | 45% | Logger/tracker en cada paso |
| `DerivadosService.js` | 279 | 42% | Logger/tracker en cada paso |
| `PNLService.js` | 282 | 42% | Logger/tracker en cada paso |
| `UBSService.js` | 279 | 42% | Logger/tracker en cada paso |
| `procesos.v2.routes.js` | 1263 | 14 endpoints | SQL directo sin abstracción |
| `logs.routes.js` | 319 | 4 endpoints | SQL directo sin abstracción |
| `FundOrchestrator.js` | 892 | 30% | Instancia 3 servicios separados |

### 2.3 Detalle de BasePipelineService.js (Más Contaminado)

```
Total: 1048 líneas
├── 50% Coordinación pura (MANTENER)
├── 35% Coordinación + Logging mezclado (CONTAMINADO)
└── 15% Logging/Tracking puro (EXTRAER)

Llamadas contaminantes:
- 29 llamadas a logger.log()
- 11 llamadas a tracker.*
- 8 llamadas a trace.*
- 9 llamadas a console.*
- 35 queries SQL directos
- 4 métodos helper de logging (logInfo, logWarning, logError, logDebug)
```

---

## 3. INCONSISTENCIAS DETECTADAS

### 3.1 Naming Inconsistente de Estados

| Campo Actual | Problema |
|--------------|----------|
| `Estado_Process_Derivados` | Prefijo "Process_" |
| `Estado_DERIV_01` | Prefijo "DERIV_" (diferente) |
| `Estado_Concatenar` | Nunca se actualiza |
| `Estado_Graph_Sync` | Nunca se usa |

### 3.2 SubEtapa Siempre NULL

Los métodos `logInfo()`, `logWarning()`, `logError()` en BasePipelineService **nunca pasan `subEtapa`**, por lo que esta columna siempre es NULL en logs.Ejecucion_Logs.

### 3.3 Duplicación de Eventos

Ejemplo: Inicio de servicio IPA crea **4 registros** del mismo momento lógico:
1. console.log → stdout
2. LoggingService → logs.Ejecucion_Logs (nivel=INFO)
3. TraceService → logs.Trace_Records (tipo=START)
4. ExecutionTracker → logs.Ejecucion_Fondos (Estado_Process_IPA='EN_PROGRESO')

### 3.4 Niveles de Severidad Mezclados

| Evento | console.* | LoggingService | Correcto |
|--------|-----------|----------------|----------|
| Stand-by activado | console.log() | INFO | WARNING |
| Consolidación con deadlock | console.warn() | (no registra) | WARNING en logger |
| Transacción uncommittable | console.warn() | ERROR | ERROR |

---

## 4. EVENTOS NO REGISTRADOS CORRECTAMENTE

| Evento | Logger | Trace | Tracker | Console | Problema |
|--------|--------|-------|---------|---------|----------|
| Consolidación CUBO OK | - | - | - | ✓ | Solo console |
| Consolidación CUBO Error | - | - | - | ✓ | Solo console |
| Deadlocks | - | - | - | ✓ | Solo console |
| Inicio ejecución | - | - | ✓ | ✓ | Falta logger |
| Fin ejecución OK | - | ✓ | ✓ | ✓ | Falta logger |
| recordLock() | - | (nunca se usa) | - | - | Método muerto |
| recordWait() | - | (nunca se usa) | - | - | Método muerto |

---

## 5. SCHEMA DE BD ACTUAL VS NUEVO

### 5.1 Schema Actual (6 tablas, 150+ columnas)

| Tabla | Columnas | Problema |
|-------|----------|----------|
| logs.Procesos | 12 | OK |
| logs.Ejecuciones | 19 | Duplica con Procesos |
| logs.Ejecucion_Fondos | **71** | Excesivo (30+ sub-estados) |
| logs.Ejecucion_Logs | 12 | Registra TODO (DEBUG, INFO) |
| logs.Trace_Records | 12 | Casi vacío (no se usa) |
| logs.FondosEnStandBy | 14 | OK |

**Total:** ~140 columnas activas

### 5.2 Schema Nuevo (4 tablas, ~50 columnas)

| Tabla | Columnas | Propósito |
|-------|----------|-----------|
| logs.Procesos | 12 | Proceso batch (sin cambios) |
| logs.Ejecuciones | **25** | Estados por servicio (8) + metadata |
| logs.EventosDetallados | 9 | SOLO ERROR/WARNING/STAND_BY |
| logs.StandBy | 12 | Fondos en pausa |

**Reducción:** ~90 columnas eliminadas (64% menos)

### 5.3 Comparación de logs.Ejecucion_Fondos

**ANTES (71 columnas):**
```
Estado_IPA_01_RescatarLocalPrice
Estado_IPA_02_AjusteSONA
Estado_IPA_03_RenombrarCxCCxP
Estado_IPA_04_TratamientoSuciedades
Estado_IPA_05_EliminarCajasMTM
Estado_IPA_06_CrearDimensiones
Estado_IPA_06B_PopulateIPACash
Estado_IPA_07_AgruparRegistros
Estado_CAPM_01_Ajuste
Estado_CAPM_02_ExtractTransform
Estado_CAPM_03_CargaFinal
Estado_DERIV_01_Posiciones
Estado_DERIV_02_Dimensiones
... (30+ más)
```

**DESPUÉS (8 columnas de estado):**
```
Estado_Extraccion
Estado_Validacion
Estado_IPA
Estado_CAPM
Estado_Derivados
Estado_PNL
Estado_UBS
Estado_Concatenar
```

---

## 6. NUEVA ARQUITECTURA EVENT-DRIVEN

### 6.1 Diagrama de Componentes

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      ARQUITECTURA EVENT-DRIVEN                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────┐                    ┌─────────────────┐            │
│  │ BasePipeline    │    emit()          │ PipelineEvent   │            │
│  │ Service (limpio)│───────────────────>│ Emitter         │            │
│  │                 │                    │ (singleton)     │            │
│  │ emit('inicio')  │                    │                 │            │
│  │ emit('fin')     │                    │ .on('inicio')   │            │
│  │ emit('error')   │                    │ .on('fin')      │            │
│  │ emit('standby') │                    │ .on('error')    │            │
│  └─────────────────┘                    └────────┬────────┘            │
│                                                  │                      │
│                                                  │ listeners            │
│                                                  ▼                      │
│                                         ┌─────────────────┐            │
│                                         │ TrackingService │            │
│                                         │ (único)         │            │
│                                         │                 │            │
│                                         │ - updateEstado()│            │
│                                         │ - registrarEvt()│            │
│                                         │ - notifyWS()    │            │
│                                         └────────┬────────┘            │
│                                                  │                      │
│                                                  │ SQL                  │
│                                                  ▼                      │
│                                         ┌─────────────────┐            │
│                                         │ SQL Server      │            │
│                                         │ logs.Ejecuciones│            │
│                                         │ logs.Eventos    │            │
│                                         │ logs.StandBy    │            │
│                                         └─────────────────┘            │
└─────────────────────────────────────────────────────────────────────────┘
```

### 6.2 Eventos del Sistema

| Evento | Emisor | Listener | Acción |
|--------|--------|----------|--------|
| `servicio:inicio` | BasePipelineService | TrackingService | UPDATE Estado_X = 'EN_PROGRESO' |
| `servicio:fin` | BasePipelineService | TrackingService | UPDATE Estado_X = 'OK' |
| `servicio:error` | BasePipelineService | TrackingService | UPDATE Estado_X = 'ERROR' + INSERT logs.EventosDetallados |
| `servicio:warning` | Services | TrackingService | INSERT logs.EventosDetallados (sin cambiar estado) |
| `standby:activado` | BasePipelineService | TrackingService | UPDATE Estado_X = 'STAND_BY' + INSERT logs.StandBy |
| `proceso:inicio` | FundOrchestrator | TrackingService | WebSocket notification |
| `proceso:fin` | FundOrchestrator | TrackingService | UPDATE logs.Procesos + WebSocket |

### 6.3 Granularidad Híbrida

**SIEMPRE se registra:**
- Cambios de estado de servicio (PENDIENTE → EN_PROGRESO → OK/ERROR)
- Stand-by activados

**SOLO se registra en logs.EventosDetallados:**
- Errores (con stack trace)
- Warnings (con contexto)
- Stand-by (con detalles del problema)

**NUNCA se registra:**
- DEBUG (eliminado)
- INFO de rutina (eliminado)
- console.log (eliminado 100%)

---

## 7. PLAN DE MIGRACIÓN

### 7.1 Fases

| Fase | Duración | Descripción |
|------|----------|-------------|
| **1** | 2-3 horas | Crear nuevo schema BD con sufijo _v2 |
| **2** | 4-6 horas | Crear PipelineEventEmitter + TrackingService |
| **3** | 3-4 horas | Limpiar BasePipelineService (1048 → ~350 líneas) |
| **4** | 4-6 horas | Limpiar 7 servicios del pipeline |
| **5** | 4-5 horas | Actualizar FundOrchestrator y routes |
| **6** | 2-3 horas | Eliminar código obsoleto, migrar BD |

**Total estimado:** 19-27 horas (3-5 días)

### 7.2 Archivos a Crear

| Archivo | Propósito |
|---------|-----------|
| `server/services/events/PipelineEventEmitter.js` | Singleton para eventos |
| `server/services/tracking/TrackingService.js` | Servicio unificado |
| `server/database/migrations/100_CREATE_NEW_LOGS_SCHEMA.sql` | Nuevo schema |

### 7.3 Archivos a Eliminar

| Archivo | Líneas | Razón |
|---------|--------|-------|
| `ExecutionTracker.js` | 598 | Reemplazado por TrackingService |
| `LoggingService.js` | 618 | Reemplazado por TrackingService |
| `TraceService.js` | 272 | No se usa, eliminado |

**Total eliminado:** 1,488 líneas

### 7.4 Archivos a Modificar

| Archivo | Antes | Después | Reducción |
|---------|-------|---------|-----------|
| `BasePipelineService.js` | 1048 | ~350 | 67% |
| `ExtractionService.js` | 516 | ~200 | 61% |
| `ValidationService.js` | 426 | ~200 | 53% |
| `IPAService.js` | 363 | ~150 | 59% |
| `CAPMService.js` | 350 | ~150 | 57% |
| `DerivadosService.js` | 279 | ~120 | 57% |
| `PNLService.js` | 282 | ~120 | 57% |
| `UBSService.js` | 279 | ~120 | 57% |
| `FundOrchestrator.js` | 892 | ~700 | 22% |

---

## 8. ROLLBACK

Si la migración falla:

### 8.1 Rollback de BD
```sql
-- Revertir nombres de tablas
EXEC sp_rename 'logs.Procesos', 'logs.Procesos_v2';
EXEC sp_rename 'logs.Procesos_OLD', 'logs.Procesos';
-- Repetir para todas las tablas
```

### 8.2 Rollback de Código
```bash
git revert HEAD~N  # N = número de commits
git push origin master
```

### 8.3 Restaurar Servicios Eliminados
```bash
git checkout HEAD~N -- server/services/tracking/ExecutionTracker.js
git checkout HEAD~N -- server/services/tracking/LoggingService.js
git checkout HEAD~N -- server/services/tracking/TraceService.js
```

---

## 9. VALIDACIÓN POST-MIGRACIÓN

### 9.1 Comandos de Verificación

```bash
# Buscar contaminación residual
grep -r "console.log\|this.logger\|this.tracker\|this.trace" server/services/pipeline/
# Debe retornar 0 resultados

# Buscar referencias a servicios eliminados
grep -r "ExecutionTracker\|LoggingService\|TraceService" server/
# Solo debe aparecer en TrackingService.js (documentación)
```

### 9.2 Tests E2E

1. Ejecutar pipeline con 1 fondo
2. Verificar logs.Ejecuciones tiene registro con estados correctos
3. Verificar logs.EventosDetallados solo tiene ERROR/WARNING/STAND_BY
4. Verificar WebSocket emite eventos correctamente
5. Verificar que NO hay console.log en producción

---

## 10. CONCLUSIONES

### Beneficios de la Refactorización

| Aspecto | Antes | Después | Mejora |
|---------|-------|---------|--------|
| Servicios de tracking | 3 | 1 | 67% menos |
| Columnas en BD | ~140 | ~50 | 64% menos |
| Líneas de código tracking | 1,488 | ~400 | 73% menos |
| Eventos duplicados | 3-5x | 1x | 100% eliminado |
| console.log | 50+ | 0 | 100% eliminado |
| Fuentes de verdad | 4 | 1 | 100% unificado |

### Riesgos Mitigados

1. **Pérdida de datos históricos:** Tablas _OLD se mantienen 30 días
2. **Frontend rompe:** Vistas de compatibilidad (opcional)
3. **WebSocket falla:** Tests E2E antes de deploy
4. **Performance:** Índices optimizados en nuevas tablas

### Próximos Pasos

1. ✅ Plan aprobado
2. ⏳ Fase 1: Crear nuevo schema BD
3. ⏳ Fase 2: Crear TrackingService
4. ⏳ Fase 3: Limpiar BasePipelineService
5. ⏳ Fase 4: Limpiar servicios del pipeline
6. ⏳ Fase 5: Actualizar orchestrator y routes
7. ⏳ Fase 6: Eliminar código obsoleto
