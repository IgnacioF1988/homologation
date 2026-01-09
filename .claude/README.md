# Claude Code Configuration - Homologation v2.1

## Arquitectura DB-Centric

El proyecto Homologation utiliza una arquitectura donde la **Base de Datos SQL Server es el orquestador completo** del pipeline ETL. El backend actua como listener pasivo que recibe eventos via Service Broker y los retransmite al frontend via WebSocket.

```
┌──────────────────────────────────────────────────────────────┐
│                    ARQUITECTURA DB-CENTRIC                    │
├──────────────────────────────────────────────────────────────┤
│  FRONTEND ←─ WebSocket ←─ BACKEND ←─ Service Broker ←─ DB    │
│  (reactivo)   (push)     (pasivo)     (eventos)    (orquesta)│
└──────────────────────────────────────────────────────────────┘
```

## Principios Fundamentales

| Capa | Rol | Responsabilidad |
|------|-----|-----------------|
| **DB** | Orquestador | Ejecuta pipeline, valida, transforma, notifica |
| **Backend** | Listener | Recibe eventos, retransmite a WebSocket |
| **Frontend** | Reactivo | Actualiza UI en tiempo real via WebSocket |

**IMPORTANTE:** El estado del pipeline se obtiene SOLO via WebSocket (tiempo real), NO via polling REST.

---

## Cambios v2.1 (2026-01-09)

### CHECKPOINT Events
Nuevo tipo de evento para tracking granular del ciclo de vida de tablas temporales:

| Operacion | Descripcion | Ejemplo |
|-----------|-------------|---------|
| **CREATED** | Tabla temporal creada | `##IPA_Work` con 45 rows |
| **VERIFIED** | Prerequisito validado | `##IPA_Cash` existe antes de CAPM |
| **CONSUMED** | Datos consumidos en consolidacion | `##CAPM_Work` → `##IPA_Final` |

### SPs Actualizados con CHECKPOINT

| SP | Version | CHECKPOINTs |
|----|---------|-------------|
| `sp_Process_IPA` | v2.0 | CREATED: ##IPA_Work, ##IPA_Cash, ##IPA_MTM, ##Ajustes |
| `sp_Process_CAPM` | v2.1 | VERIFIED: ##IPA_Cash, CREATED: ##CAPM_Work |
| `sp_Process_Derivados` | v2.0 | VERIFIED: ##IPA_MTM, CREATED: ##Derivados_Work |
| `sp_Process_SONA` | v2.0 | VERIFIED: ##IPA_Work |
| `sp_Process_PNL` | v2.0 | CREATED: ##PNL_Work |
| `sp_Consolidar_Cubo` | v2.0 | VERIFIED: ##IPA_Work, CONSUMED: all sources, CREATED: ##IPA_Final |

### Fixes Importantes

| SP | Fix | Descripcion |
|----|-----|-------------|
| `sp_Homologate` | v2.1 | Collation fix - `COLLATE Latin1_General_CS_AS` explicito en JOINs |
| `sp_Process_CAPM` | v2.1 | Columnas faltantes (`InvestDescription`, `LocalPrice`, `AI`) → NULL/0 |

---

## Pipeline de Ejecucion

```
┌─────────────────────────────────────────────────────────────────────┐
│                         PIPELINE COMPLETO                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  1. sp_ValidateFund                                                  │
│     └─ Valida homologacion, extracts, descuadres                    │
│                                                                      │
│  2. sp_Process_IPA                                                   │
│     ├─ CHECKPOINT: CREATED ##IPA_Work                               │
│     ├─ CHECKPOINT: CREATED ##IPA_Cash                               │
│     ├─ CHECKPOINT: CREATED ##IPA_MTM                                │
│     └─ CHECKPOINT: CREATED ##Ajustes                                │
│                                                                      │
│  3. sp_Process_CAPM (si Req_CAPM=1)                                 │
│     ├─ CHECKPOINT: VERIFIED ##IPA_Cash                              │
│     └─ CHECKPOINT: CREATED ##CAPM_Work                              │
│                                                                      │
│  4. sp_Process_Derivados (si Req_Derivados=1)                       │
│     ├─ CHECKPOINT: VERIFIED ##IPA_MTM                               │
│     └─ CHECKPOINT: CREATED ##Derivados_Work                         │
│                                                                      │
│  5. sp_Process_SONA (si Req_SONA=1)                                 │
│     └─ CHECKPOINT: VERIFIED ##IPA_Work                              │
│                                                                      │
│  6. sp_Process_PNL (si Req_PNL=1)                                   │
│     └─ CHECKPOINT: CREATED ##PNL_Work                               │
│                                                                      │
│  7. sp_Consolidar_Cubo                                              │
│     ├─ CHECKPOINT: VERIFIED ##IPA_Work                              │
│     ├─ CHECKPOINT: CONSUMED ##IPA_Work, ##CAPM_Work, etc.          │
│     └─ CHECKPOINT: CREATED ##IPA_Final                              │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## Codigos de Retorno del Pipeline

| Codigo | Estado | Tipo | Accion |
|--------|--------|------|--------|
| 0 | OK | Exito | Continuar |
| 1 | WARNING | Exito | Continuar, loguear |
| 2 | RETRY | Temporal | Reintentar con backoff |
| 3 | ERROR_CRITICO | Fatal | Detener fondo |
| 4 | ASSERTION_FAILED | Bug | Detener, investigar (bug del sistema) |
| 5 | STANDBY_SUCIEDADES | Pausado | Revisar suciedades pendientes |
| 6 | STANDBY_HOMOL_INSTRUMENTOS | Pausado | Agregar mapeo instrumentos |
| 7 | STANDBY_DESCUADRE_CASH | Pausado | Revisar descuadre IPA vs CAPM |
| 8 | STANDBY_DESCUADRE_DERIVADOS | Pausado | Revisar descuadre IPA vs Derivados |
| 9 | STANDBY_DESCUADRE_NAV | Pausado | Revisar descuadre vs SONA |
| 10 | STANDBY_HOMOL_FONDOS | Pausado | Agregar mapeo fondos |
| 11 | STANDBY_HOMOL_MONEDAS | Pausado | Agregar mapeo monedas |
| 13-18 | STANDBY_EXTRACT_* | Pausado | Verificar fuente de datos |

### Diferencia STANDBY vs ASSERTION_FAILED

- **STANDBY (5-18)**: Condicion de negocio esperada. El usuario debe resolver (agregar homologacion, revisar datos).
- **ASSERTION_FAILED (4)**: Bug del sistema. Si `sp_ValidateFund` paso, los Process_* NO deberian fallar por validaciones.

---

## Tipos de Eventos WebSocket

### Eventos de Ciclo de Vida
```javascript
// SP iniciando
{ type: "SP_START", data: { ID_Ejecucion, ID_Fund, NombreSP } }

// SP terminado
{ type: "SP_END", data: { ID_Ejecucion, ID_Fund, NombreSP, CodigoRetorno, DuracionMs } }

// Pipeline iniciando/terminando
{ type: "PIPELINE_START", data: { ID_Ejecucion, ID_Fund } }
{ type: "PIPELINE_END", data: { ID_Ejecucion, ID_Fund, CodigoRetorno } }
```

### Eventos de Estado
```javascript
// Actualizacion de estado de fondo
{ type: "FUND_UPDATE", data: { ID_Ejecucion, ID_Fund, Status, CurrentSP } }

// Fondo en standby (esperando accion usuario)
{ type: "STANDBY", data: { ID_Ejecucion, ID_Fund, CodigoRetorno, Detalles } }

// Error
{ type: "ERROR", data: { ID_Ejecucion, ID_Fund, NombreSP, Detalles } }
```

### CHECKPOINT Events (Nuevo v2.1)
```javascript
// Tabla temporal creada
{
  type: "CHECKPOINT",
  data: {
    ID_Ejecucion, ID_Fund, NombreSP,
    Operacion: "CREATED",      // CREATED | VERIFIED | CONSUMED
    Objeto: "##IPA_Work_9925_9925_2",
    Registros: 45,
    Mensaje: null
  }
}

// Prerequisito verificado
{
  type: "CHECKPOINT",
  data: {
    Operacion: "VERIFIED",
    Objeto: "##IPA_Cash_9925_9925_2",
    Mensaje: "Prerequisito IPA Cash existe"
  }
}

// Datos consumidos en consolidacion
{
  type: "CHECKPOINT",
  data: {
    Operacion: "CONSUMED",
    Objeto: "##CAPM_Work_9925_9925_2",
    Registros: 2
  }
}
```

---

## Collation Case-Sensitive

Las tablas dimensionales usan `Latin1_General_CS_AS` (Case Sensitive). Las tablas temporales ##*_Work usan el default de la DB (`SQL_Latin1_General_CP1_CI_AS`).

**Solucion (sp_Homologate v2.1):** COLLATE explicito en JOINs:
```sql
LEFT JOIN dimensionales.HOMOL_Instrumentos hi
    ON t.InvestID COLLATE Latin1_General_CS_AS = hi.SourceInvestment
    AND hi.Source = @Source
```

---

## Documentacion

| Archivo | Contenido |
|---------|-----------|
| [DATABASE.md](DATABASE.md) | Pipeline completo, SPs, Service Broker, codigos de retorno |
| [BACKEND.md](BACKEND.md) | Endpoints REST, ServiceBrokerListener, WebSocket |
| [FRONTEND.md](FRONTEND.md) | Hooks WebSocket, componentes tiempo real |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Diagramas de arquitectura |
| [CONVENTIONS.md](CONVENTIONS.md) | Estandares de codigo |

## Skills Disponibles

| Skill | Proposito | Cuando Usar |
|-------|-----------|-------------|
| `/analyze-pipeline` | Analizar estado actual del pipeline en DB | Debugear SPs |
| `/create-sp-event` | Agregar emision de eventos a un SP existente | Agregar CHECKPOINT |
| `/debug-service-broker` | Diagnosticar problemas de mensajeria | Eventos no llegan |
| `/create-migration` | Crear migracion SQL numerada | Cambios de schema |
| `/create-component` | Crear componente React con soporte tiempo real | UI reactiva |
| `/plan-feature` | Planificar feature grande con metodologia | Features complejas |

## Endpoints REST

### Pipeline (Diagnostico Service Broker)
| Endpoint | Descripcion |
|----------|-------------|
| `GET /api/pipeline/broker/status` | Estado del Service Broker |
| `POST /api/pipeline/broker/test` | Enviar mensaje de prueba |

### WebSocket
```
URL: ws://localhost:3001/api/ws/pipeline

Mensajes Cliente → Servidor:
  { type: "SUBSCRIBE", data: { ID_Ejecucion: 502 } }
  { type: "UNSUBSCRIBE", data: { ID_Ejecucion: 502 } }
  { type: "PING" }
```

## MCP Servers Disponibles

| Server | Uso |
|--------|-----|
| **sqlserver-moneda** | Consultas directas a SQL Server |
| **filesystem** | Acceso a archivos del proyecto |
| **context7** | Documentacion de librerias |
| **playwright** | Testing E2E |
| **chrome-devtools** | Debugging de UI |
| **exa** | Busqueda web con contexto |

## Estructura del Proyecto

```
homologation/
├── server/
│   ├── database/Refactor/
│   │   ├── BROKER/              # Service Broker setup
│   │   │   └── 01_ServiceBroker_Setup.sql
│   │   ├── CORE/                # SPs auxiliares
│   │   │   ├── 01_sp_HandleError.sql
│   │   │   ├── 02_sp_CreateAdjustment.sql
│   │   │   └── 03_sp_Homologate.sql (v2.1 - collation fix)
│   │   ├── PIPELINE/            # SPs del pipeline
│   │   │   ├── 10_sp_Process_IPA.sql (v2.0 - CHECKPOINT)
│   │   │   ├── 11_sp_Process_CAPM.sql (v2.1 - CHECKPOINT + fix)
│   │   │   ├── 12_sp_Process_Derivados.sql (v2.0 - CHECKPOINT)
│   │   │   ├── 13_sp_Process_SONA.sql (v2.0 - CHECKPOINT)
│   │   │   ├── 14_sp_Process_PNL.sql (v2.0 - CHECKPOINT)
│   │   │   ├── 15_sp_ValidateFund.sql
│   │   │   ├── 16_sp_Consolidar_Cubo.sql (v2.0 - CHECKPOINT)
│   │   │   └── 20_sp_Process_Fund_Complete.sql
│   │   └── TEST/                # Scripts de prueba
│   │       ├── 05_Test_Generico_2Fondos.sql
│   │       ├── 06_Test_Pipeline_Checkpoints.sql
│   │       └── 07_Test_Checkpoint_Event.sql
│   ├── services/
│   │   ├── broker/
│   │   │   ├── ServiceBrokerListener.js
│   │   │   └── MessageProcessor.js (CHECKPOINT handling)
│   │   └── websocket/
│   │       └── WebSocketManager.js
│   ├── routes/
│   │   ├── pipeline.routes.js
│   │   └── sandboxQueues.routes.js
│   └── config/
│       ├── database.js
│       └── serviceBroker.config.js
├── src/
│   ├── components/
│   └── hooks/
├── test-websocket.html          # Cliente WebSocket de prueba
└── .claude/                     # Esta configuracion
```

## Testing

### Test WebSocket Manual
Abrir `test-websocket.html` en el navegador, suscribirse a una ejecucion.

### Emitir CHECKPOINT de Prueba
```sql
EXEC broker.sp_EmitirEvento
    @TipoEvento = 'CHECKPOINT',
    @ID_Ejecucion = 9999,
    @ID_Proceso = 9999,
    @ID_Fund = 1,
    @NombreSP = 'TEST.sp_Test',
    @Detalles = '{"operacion": "CREATED", "objeto": "##Test_Table", "registros": 100}';
```

### Test Pipeline Completo
```sql
-- Ejecutar pipeline para fondo de prueba
DECLARE @ReturnCode INT, @ErrorMessage NVARCHAR(500);
EXEC @ReturnCode = staging.sp_Process_Fund_Complete
    @ID_Ejecucion = 9999,
    @ID_Proceso = 9999,
    @ID_Fund = 2,
    @FechaReporte = '2025-12-25',
    @LimpiarTemporales = 0,
    @ReturnCode = @ReturnCode OUTPUT,
    @ErrorMessage = @ErrorMessage OUTPUT;
SELECT @ReturnCode AS Codigo, @ErrorMessage AS Mensaje;
```

---

## Historial de Cambios

### v2.1 (2026-01-09)
- CHECKPOINT events en todos los Process_* SPs
- sp_Homologate v2.1: fix collation conflict
- sp_Process_CAPM v2.1: fix columnas faltantes
- sp_Consolidar_Cubo v2.0: CHECKPOINT events
- MessageProcessor: handling de CHECKPOINT
- Codigo 4 (ASSERTION_FAILED) documentado

### v2.0 (2026-01-07)
- Arquitectura DB-Centric completa
- Service Broker para eventos en tiempo real
- WebSocket push desde backend
- Validaciones pre-flight en sp_ValidateFund
