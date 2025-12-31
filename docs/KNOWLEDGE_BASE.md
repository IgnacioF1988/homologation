# DOCUMENTO BASE DE CONOCIMIENTO - Pipeline Homologacion Moneda

**Fecha:** 2025-12-30
**Proyecto:** Homologation Pipeline ETL
**Version:** 4.0 - TRACKING EVENT-DRIVEN IMPLEMENTADO

---

## 1. ARQUITECTURA ACTUAL DEL SISTEMA

### 1.1 Estructura del Proyecto

```
C:\Users\ifuentes\homologation\
├── server/                              # Backend Node.js + Express
│   ├── index.js                         # Punto de entrada (puerto 3001)
│   ├── config/
│   │   ├── database.js                  # Pool SQL Server (50 conexiones)
│   │   └── pipeline.config.yaml         # Definicion del pipeline (7 fases)
│   ├── routes/
│   │   ├── procesos.v2.routes.js        # API principal (/v2/ejecutar)
│   │   └── logs.routes.js               # API de consulta de logs
│   ├── services/
│   │   ├── pipeline/                    # Servicios por fase
│   │   │   ├── BasePipelineService.js   # Clase base (retry, estado, logging)
│   │   │   ├── IPAService.js            # Fase IPA
│   │   │   ├── CAPMService.js           # Fase CAPM
│   │   │   ├── PNLService.js            # Fase PNL
│   │   │   ├── DerivadosService.js      # Fase Derivados
│   │   │   └── UBSService.js            # Fase UBS
│   │   ├── orchestration/
│   │   │   ├── FundOrchestrator.js      # Orquestador por fondo
│   │   │   └── DependencyResolver.js    # Orden topologico
│   │   ├── tracking/
│   │   │   └── TrackingService.js      # UNIFICADO: Event-driven
│   │   ├── events/
│   │   │   └── PipelineEventEmitter.js # Emisor de eventos del pipeline
│   │   └── websocket/
│   │       └── WebSocketManager.js      # Tiempo real al frontend
├── database/migrations/                 # Migraciones SQL
└── src/                                 # Frontend React
```

### 1.2 Flujo del Pipeline

```
POST /api/procesos/v2/ejecutar
    |
    v
+------------------------------------------------------------------+
|  FASE 0: EXTRACCION (Batch - 1 vez para TODOS los fondos)        |
|  SPs: Extract_IPA_Batch, Extract_CAPM_Batch, Extract_PNL_Batch   |
|       Extract_PosModRF_Batch, Extract_SONA_Batch, etc.           |
+------------------------------------------------------------------+
    |
    v
+------------------------------------------------------------------+
|  TAGGING: Tag_Extraction_Data (asigna ID_Ejecucion por fondo)    |
+------------------------------------------------------------------+
    |
    v Promise.all([FundOrchestrator_1, FundOrchestrator_2, ...])
    |
+------------------------------------------------------------------+
|  POR CADA FONDO (PARALELO - conexion dedicada):                  |
|                                                                  |
|  FASE 1: PROCESS_IPA (IPA_01 -> IPA_07)                          |
|          [OK] USA TABLAS TEMPORALES: ##IPA_Work_*, ##IPA_Cash_*  |
|                                                                  |
|  FASE 2: PROCESS_CAPM (CAPM_01 -> CAPM_03)                       |
|          [OK] USA TABLA TEMPORAL: ##CAPM_Work_*                  |
|                                                                  |
|  FASE 3: PROCESS_DERIVADOS (DERIV_01 -> DERIV_04)                |
|          [OK] USA TABLA TEMPORAL: ##Derivados_Work_*             |
|                                                                  |
|  FASE 4: PROCESS_PNL (PNL_01 -> PNL_05)                          |
|          [OK] USA TABLA TEMPORAL: ##PNL_Work_*                   |
|                                                                  |
|  FASE 5: PROCESS_UBS (UBS_01 -> UBS_03)                          |
|          [OK] USA TABLA TEMPORAL: ##UBS_Work_*                   |
+------------------------------------------------------------------+
    |
    v
+------------------------------------------------------------------+
|  FASE 6: CONCATENAR_CUBO (Sequential - 1 vez)                    |
|  FASE 7: GRAPH_SYNC (Optional)                                   |
+------------------------------------------------------------------+
```

---

## 2. ESTADO ACTUAL DE TABLAS TEMPORALES POR PIPELINE

### FASE 1 COMPLETADA: Todos los pipelines usan tablas temporales ##

### 2.1 IPA: COMPLETADO

| SP | Entrada | Salida | Tipo Tabla |
|----|---------|--------|------------|
| IPA_01_RescatarLocalPrice_v2 | extract.IPA | ##IPA_Work_{ID}_{Fund} | TEMPORAL |
| IPA_02_AjusteSONA_v2 | ##IPA_Work | ##IPA_Work (modificada) | TEMPORAL |
| IPA_03_RenombrarCxCCxP_v2 | ##IPA_Work | ##IPA_Work (modificada) | TEMPORAL |
| IPA_04_TratamientoSuciedades_v2 | ##IPA_Work | ##IPA_Work (eliminaciones) | TEMPORAL |
| IPA_05_EliminarCajasMTM_v2 | ##IPA_Work | ##IPA_Work (eliminaciones) | TEMPORAL |
| IPA_06_CrearDimensiones_v2 | ##IPA_Work | ##IPA_Work (homologada) | TEMPORAL |
| IPA_06B_PopulateIPACash_v2 | ##IPA_Work | ##IPA_Cash_{ID}_{Fund} | TEMPORAL |
| IPA_07_AgruparRegistros_v2 | ##IPA_Work | ##IPA_Final_{ID}_{Fund} | TEMPORAL |

### 2.2 CAPM: COMPLETADO

| SP | Entrada | Salida | Tipo Tabla |
|----|---------|--------|------------|
| CAPM_01_Ajuste_CAPM_v2 | ##IPA_Cash | staging.Ajuste_CAPM | PERMANENTE (pendiente FASE 2) |
| CAPM_02_Extract_Transform_v2 | extract.CAPM | ##CAPM_Work_{ID}_{Fund} | TEMPORAL |
| CAPM_03_Carga_Final_v2 | ##CAPM_Work | staging.CAPM | PERMANENTE (pendiente FASE 2) |

### 2.3 PNL: COMPLETADO

| SP | Entrada | Salida | Tipo Tabla |
|----|---------|--------|------------|
| PNL_01_Dimensiones_v2 | extract.PNL | ##PNL_Work_{ID}_{Fund} | TEMPORAL |
| PNL_02_Ajuste_v2 | ##PNL_Work | ##PNL_Work (modificada) | TEMPORAL |
| PNL_03_Agrupacion_v2 | ##PNL_Work | staging.PNL | PERMANENTE (pendiente FASE 2) |
| PNL_04_CrearRegistrosAjusteIPA_v2 | ##PNL_Work | staging.PNL_IPA_Ajustes | PERMANENTE (pendiente FASE 2) |
| PNL_05_Consolidar_IPA_PNL_v2 | staging.PNL + staging.IPA | staging.PNL_IPA | PERMANENTE (pendiente FASE 2) |

**Nota:** PNL_01 incluye fix de COLLATE DATABASE_DEFAULT para compatibilidad con tempdb.

### 2.4 Derivados: COMPLETADO

| SP | Entrada | Salida | Tipo Tabla |
|----|---------|--------|------------|
| DERIV_01_Tratamiento_Posiciones_v2 | extract.Derivados | ##Derivados_Work_{ID}_{Fund} | TEMPORAL |
| DERIV_02_Homologar_Dimensiones_v2 | ##Derivados_Work | staging.Derivados | PERMANENTE (pendiente FASE 2) |
| DERIV_03_Ajuste_Derivados_v2 | ##Derivados_Work | staging.Ajuste_Derivados | PERMANENTE (pendiente FASE 2) |
| DERIV_04_Parity_Adjust_v2 | ##Derivados_Work | staging.Ajuste_Paridades | PERMANENTE (pendiente FASE 2) |

### 2.5 UBS: COMPLETADO

| SP | Entrada | Salida | Tipo Tabla |
|----|---------|--------|------------|
| UBS_01_Tratamiento_Fondos_v2 | extract.UBS | ##UBS_Work_{ID}_{Fund} | TEMPORAL |
| UBS_02_Tratamiento_Derivados_MLCCII_v2 | ##UBS_Work | staging.MLCCII_Derivados | PERMANENTE (pendiente FASE 2) |
| UBS_03_Creacion_Cartera_MLCCII_v2 | ##UBS_Work | staging.MLCCII | PERMANENTE (pendiente FASE 2) |

---

## 3. ANALISIS DE SCHEMAS Y TABLAS (POST-MIGRATION 008)

### 3.1 Schema STAGING (20 tablas restantes)

#### WorkTables ELIMINADAS (Migration 008):
- staging.PNL_WorkTable - ELIMINADA
- staging.CAPM_WorkTable - ELIMINADA
- staging.Derivados_WorkTable - ELIMINADA
- staging.UBS_WorkTable - ELIMINADA
- staging.UAF_WorkTable - ELIMINADA
- Todos los BACKUP_* - ELIMINADOS

#### Tablas Finales (pendiente FASE 2 - mover a process.*):
| Tabla | Estado FASE 2 |
|-------|---------------|
| staging.IPA | -> process.TBL_IPA |
| staging.CAPM | -> process.TBL_CAPM |
| staging.PNL | -> ##PNL_Final (temporal) |
| staging.PNL_IPA | -> process.TBL_PNL_IPA |
| staging.Derivados | -> process.TBL_Derivados |
| staging.MLCCII | -> process.TBL_MLCCII |
| staging.MLCCII_Derivados | -> process.TBL_MLCCII_Derivados |

#### Tablas Ajuste (pendiente FASE 2 - mover a temporales):
| Tabla | Estado FASE 2 |
|-------|---------------|
| staging.Ajuste_CAPM | -> ##Ajuste_CAPM_{ID}_{Fund} |
| staging.Ajuste_Derivados | -> ##Ajuste_Derivados_{ID}_{Fund} |
| staging.Ajuste_Paridades | -> ##Ajuste_Paridades_{ID}_{Fund} |
| staging.Ajuste_PNL | -> ##Ajuste_PNL_{ID}_{Fund} |
| staging.Ajuste_SONA | -> ##Ajuste_SONA_{ID}_{Fund} |

#### Tablas a PRESERVAR (no migrar):
| Tabla | Razon |
|-------|-------|
| staging.PNL_ValoresAcumulados | Acumulador persistente dias no habiles |
| staging.UAF_ValoresAcumulados | Acumulador persistente dias no habiles |
| staging.TBL_IPA_MDLAT_MLATHY | Consolidacion especial para reportes |
| staging.UAF | Pipeline UAF (fuera de alcance) |
| staging.BMS_Exp_WorkTable | Pipeline BMS (fuera de alcance) |
| staging.RISK_AMERICA_WorkTable | Pipeline RA (fuera de alcance) |
| staging.TH_WorkTable | Pipeline TH (fuera de alcance) |

### 3.2 Schema LOGS (Post-Migration 008)

| Tabla | Estado |
|-------|--------|
| logs.Procesos | ESENCIAL |
| logs.Ejecuciones | ESENCIAL |
| logs.Ejecucion_Fondos | ESENCIAL |
| logs.Ejecucion_Logs | ESENCIAL |
| logs.Trace_Records | ESENCIAL |
| logs.FondosEnStandBy | ESENCIAL |
| logs.BBG_Log | PRESERVAR (Bloomberg) |

**ELIMINADAS en Migration 008:**
- logs.SP_Errors
- logs.Ejecucion_Metricas
- logs.Ejecucion_*_BACKUP_*

---

## 4. SISTEMAS DE LOGGING/TRACKING

### 4.1 Servicios de Tracking (Backend)

| Servicio | Archivo | Destino BD | Proposito |
|----------|---------|------------|----------|
| **TrackingService** | tracking/TrackingService.js | logs.Ejecuciones, logs.EventosDetallados, logs.StandBy, sandbox.* | Tracking unificado event-driven |

### 4.2 Arquitectura de Logging (MANTENER SEPARADOS)

```
+------------------------------------------------------------------+
|                    ARQUITECTURA ACTUAL                            |
+------------------------------------------------------------------+
|                                                                  |
|  TrackingService -> logs.Ejecuciones, logs.EventosDetallados     |
|      Proposito: Estados actuales para frontend (WebSocket)       |
|                                                                  |
|  (LEGACY) LoggingService -> logs.Ejecucion_Logs (OBSOLETO)       |
|      Proposito: Reemplazado por logs.EventosDetallados           |
|      Caracteristicas: Bulk insert (100 registros), auto-flush    |
|                                                                  |
|  (LEGACY) TraceService -> logs.Trace_Records (OBSOLETO)          |
|      Proposito: Reemplazado por TrackingService                  |
|      Caracteristicas: Buffer 100, analisis de cuellos botella    |
|                                                                  |
+------------------------------------------------------------------+
```

---

## 5. CONEXIONES INDEPENDIENTES POR FONDO

### 5.1 Pool de Conexiones

```javascript
// server/config/database.js
pool: {
  max: 50,              // Maximo de conexiones activas
  min: 10,              // Minimo idle
  idleTimeoutMillis: 30000
},
requestTimeout: 120000  // 2 minutos por request
```

### 5.2 Conexion Dedicada por Fondo

```javascript
// FundOrchestrator.initialize()
this.dedicatedConnection = await this.pool.connect();
// Mantiene ##tablas_temporales vivas durante todo el pipeline
```

**Ventajas:**
- Tablas temporales (##) aisladas por fondo
- Transacciones separadas
- Sin bloqueos gracias a RCSI
- Control de recursos por fondo

### 5.3 Patron de Tablas Temporales

```sql
-- Nomenclatura estandar:
-- ##[Pipeline]_[Tipo]_{ID_Ejecucion}_{ID_Fund}

-- Ejemplos:
##IPA_Work_1001_5      -- IPA WorkTable, Ejecucion 1001, Fondo 5
##IPA_Cash_1001_5      -- IPA Cash, Ejecucion 1001, Fondo 5
##IPA_Final_1001_5     -- IPA Final, Ejecucion 1001, Fondo 5
##CAPM_Work_1001_5     -- CAPM WorkTable, Ejecucion 1001, Fondo 5
##PNL_Work_1001_5      -- PNL WorkTable, Ejecucion 1001, Fondo 5

-- Indice estandar:
CREATE CLUSTERED INDEX IX_Work ON ##[Pipeline]_Work_*
    (ID_Ejecucion, ID_Fund, [ClavePrincipal])
```

### 5.4 Patron de Collation para Temp Tables

```sql
-- IMPORTANTE: Las temp tables en tempdb pueden tener collation diferente
-- Usar COLLATE DATABASE_DEFAULT en:
-- 1. Definicion de columnas de temp table
-- 2. JOINs con tablas de la base de datos principal

-- Ejemplo en CREATE TABLE:
CREATE TABLE ##PNL_Work_... (
    Portfolio NVARCHAR(50) COLLATE DATABASE_DEFAULT,
    Symb NVARCHAR(100) COLLATE DATABASE_DEFAULT,
    ...
)

-- Ejemplo en JOIN:
LEFT JOIN dimensionales.HOMOL_Instrumentos hi
    ON pnl.Symb COLLATE DATABASE_DEFAULT = hi.SourceInvestment COLLATE DATABASE_DEFAULT
```

---

## 6. STORED PROCEDURES POR SCHEMA

### 6.1 Schema extract (Extraccion)
- Extract_IPA_Batch, Extract_CAPM_Batch, Extract_PNL_Batch
- Extract_PosModRF_Batch, Extract_SONA_Batch, Extract_Derivados_Batch
- Extract_UBS_Batch, Extract_UBS_MonedaDerivados_Batch, Extract_UBS_Patrimonio
- Tag_Extraction_Data

### 6.2 Schema staging (Transformacion)
- IPA_01 a IPA_07 (COMPLETADO - temporales)
- CAPM_01 a CAPM_03 (COMPLETADO - temporales para WorkTable)
- PNL_01 a PNL_05 (COMPLETADO - temporales para WorkTable)
- DERIV_01 a DERIV_04 (COMPLETADO - temporales para WorkTable)
- UBS_01 a UBS_03 (COMPLETADO - temporales para WorkTable)

### 6.3 Schema process (Orquestacion)
- Process_IPA, Process_CAPM, Process_PNL
- Process_Derivados, Process_UBS
- Process_Funds_WithTracking
- Validar_FondosActivos

### 6.4 Schema logs (Control)
- sp_Inicializar_Proceso, sp_Inicializar_Ejecucion
- sp_Actualizar_Estado_Fondo, sp_Finalizar_Ejecucion
- sp_Log, sp_Registrar_Metrica

---

## 7. VISTAS DE TRAZABILIDAD

### Schema logs:
- `v_Trace_Fund_Timeline` - Linea de tiempo por fondo
- `v_Trace_Parallel_Efficiency` - Eficiencia paralela
- `v_Trace_Proceso_Summary` - Resumen procesamiento
- `v_Trace_Resource_Bottlenecks` - Cuellos de botella
- `v_Trace_Resource_Contention` - Contencion de recursos
- `v_Trace_Slowest_Services` - Servicios mas lentos

---

## 8. MIGRACIONES EJECUTADAS

| Migration | Fecha | Descripcion |
|-----------|-------|-------------|
| 001-005 | Pre-2025-12 | Estructura inicial |
| 006 | 2025-12-28 | Migrar IPA a tablas temporales |
| 007 | 2025-12-28 | Migrar CAPM, PNL, Derivados, UBS a temporales |
| 008 | 2025-12-29 | Cleanup WorkTables y backups obsoletos |

---

*Documento actualizado - 2025-12-29*
*FASE 1: WorkTables migradas a temporales - COMPLETADA*
*FASE 2: Eliminar staging.* completamente - PENDIENTE*
