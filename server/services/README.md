# Pipeline ETL - Servicios Backend

Arquitectura de servicios para procesamiento paralelo del Pipeline ETL con soporte multiusuario.

## Estructura de Carpetas

```
server/services/
├── orchestration/          # Servicios de orquestación
│   ├── DependencyResolver.js   # Resolución de dependencias (topological sort)
│   ├── WorkerPool.js           # Pool de workers paralelos
│   ├── PipelineOrchestrator.js # [PENDIENTE] Orquestador principal
│   └── index.js
├── pipeline/               # Servicios del pipeline
│   ├── BasePipelineService.js  # Clase base para todos los servicios
│   ├── IPAService.js           # [PENDIENTE] Servicio IPA
│   ├── CAPMService.js          # [PENDIENTE] Servicio CAPM
│   ├── DerivadosService.js     # [PENDIENTE] Servicio Derivados
│   ├── PNLService.js           # [PENDIENTE] Servicio PNL
│   └── UBSService.js           # [PENDIENTE] Servicio UBS
└── tracking/               # Servicios de tracking y logging
    ├── ExecutionTracker.js     # Tracking de estados de ejecución
    ├── LoggingService.js       # Sistema de logging estructurado
    └── index.js
```

## Configuración

### pipeline.config.yaml

Archivo de configuración central que define:
- Servicios del pipeline y sus dependencias
- Límites de concurrencia (fondos y tareas)
- Stored procedures y su orden de ejecución
- Estrategias de retry y manejo de errores
- Tracking de estados

**Ubicación**: `server/config/pipeline.config.yaml`

### database.js

Configuración del connection pool ajustado para soportar procesamiento paralelo masivo:
- **Max connections**: 200 (antes: 10)
- **Min connections**: 20 (antes: 0)
- Soporta múltiples ejecuciones con 100+ fondos simultáneos cada una

## Servicios de Orquestación

### DependencyResolver

Calcula el orden de ejecución correcto usando algoritmo topológico (Kahn).

**Uso**:
```javascript
const resolver = new DependencyResolver(services);
const order = resolver.getExecutionOrder(); // ['EXTRACCION', 'VALIDACION', ...]
const canRun = resolver.canExecute('PROCESS_CAPM', completedServices);
```

### WorkerPool

Gestiona ejecución paralela con límite de concurrencia.

**Uso**:
```javascript
const pool = new WorkerPool(8); // Máximo 8 tareas concurrentes
const result = await pool.enqueue(() => myAsyncTask(), { fundId: 123 });
await pool.waitForCompletion();
```

## Servicios del Pipeline

### BasePipelineService

Clase base abstracta que proporciona:
- Ejecución de SPs con manejo de errores
- Retry logic con exponential backoff
- Logging estructurado
- Tracking de estado
- Validaciones

**Patrón de uso**:
```javascript
class IPAService extends BasePipelineService {
  async execute(context) {
    // Lógica específica o usar implementación base
    return super.execute(context);
  }
}
```

### Servicios Específicos [PENDIENTE]

- **IPAService**: Procesamiento IPA (7 SPs secuenciales)
- **CAPMService**: Procesamiento CAPM (3 SPs)
- **DerivadosService**: Procesamiento Derivados (4 SPs)
- **PNLService**: Procesamiento PNL (5 SPs)
- **UBSService**: Procesamiento UBS (3 SPs)

## Servicios de Tracking

### ExecutionTracker

Gestiona estados de ejecución en tablas `logs.Ejecuciones` y `logs.Ejecucion_Fondos`.

**Uso**:
```javascript
const tracker = new ExecutionTracker(pool);
await tracker.initializeExecution(idEjecucion, fechaReporte, fondos);
await tracker.updateFundState(idEjecucion, idFund, 'Estado_Process_IPA', 'EN_PROGRESO');
await tracker.markFundCompleted(idEjecucion, idFund, duration);
```

### LoggingService

Sistema de logging estructurado con bulk insert.

**Uso**:
```javascript
const logger = new LoggingService(pool, 'INFO');
await logger.info(idEjecucion, idFund, 'PROCESS_IPA', 'Iniciando procesamiento...');
await logger.error(idEjecucion, idFund, 'PROCESS_IPA', 'Error crítico', error);
await logger.flush(); // Forzar escritura
```

**Características**:
- Bulk insert (batch de 100 logs)
- Auto-flush cada 5 segundos
- Niveles: DEBUG, INFO, WARNING, ERROR
- Logging a consola configurable

## Scripts de Base de Datos

### 01_enable_read_committed_snapshot.sql

Habilita READ_COMMITTED_SNAPSHOT para reducir deadlocks en ~80%.

```sql
ALTER DATABASE Inteligencia_Producto_Dev
SET READ_COMMITTED_SNAPSHOT ON WITH ROLLBACK IMMEDIATE;
```

### 02_create_indexes_execution_logs.sql

Optimiza tabla de logs para INSERT y queries rápidos.

```sql
CREATE CLUSTERED INDEX IX_EjecucionLogs_Ejecucion_Timestamp
ON logs.Ejecucion_Logs (ID_Ejecucion, Timestamp);
```

## Estrategia de Aislamiento

### Tablas Temporales por Fondo

**Naming convention**:
```
#temp_[TABLA]_[ID_Ejecucion]_[ID_Fund]

Ejemplos:
#temp_IPA_WorkTable_12345_789
#temp_CAPM_WorkTable_12345_456
```

**Ventajas**:
- ✅ Aislamiento total entre fondos y ejecuciones
- ✅ Auto-cleanup al cerrar conexión
- ✅ Sin conflictos de escritura
- ✅ Paralelización máxima

## Estado de Implementación

### ✅ Fase 1 Completada (Semana 1)
- [x] Habilitar READ_COMMITTED_SNAPSHOT
- [x] Aumentar connection pool a 200 (paralelización masiva)
- [x] Crear índices en logs.Ejecucion_Logs
- [x] Implementar DependencyResolver
- [x] Implementar WorkerPool
- [x] Implementar BasePipelineService
- [x] Implementar ExecutionTracker
- [x] Implementar LoggingService
- [x] Crear pipeline.config.yaml (sin límites de concurrencia)

### 🔄 Próximos Pasos (Fase 2 - Semana 2)
- [ ] Refactorizar SPs del grupo IPA (7 SPs con sufijo _v2)
- [ ] Implementar IPAService.js
- [ ] Testing unitario de SPs
- [ ] Test de integración end-to-end

## Métricas de Éxito

**Objetivos**:
- Reducción de 70-80% en tiempo total de procesamiento (paralelización masiva)
- Soportar múltiples ejecuciones simultáneas sin degradación
- Procesar 100+ fondos en paralelo por ejecución (sin límite configurado)
- < 1 deadlock por día (gracias a READ_COMMITTED_SNAPSHOT)
- 99.9% uptime
- Capacidad: 200 conexiones SQL simultáneas, 2000 tareas en paralelo

## Referencias

- **Plan completo**: `~/.claude/plans/linked-mixing-karp.md`
- **Configuración**: `server/config/pipeline.config.yaml`
- **Scripts BD**: `database/scripts/`
