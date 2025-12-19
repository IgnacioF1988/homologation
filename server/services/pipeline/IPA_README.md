# IPAService - Servicio de Procesamiento IPA

Servicio completo para procesamiento del pipeline IPA (Investment Position Analysis) con soporte para paralelización masiva por fondo.

## Arquitectura

### Pipeline IPA (7 Pasos Secuenciales por Fondo)

```
┌─────────────────────────────────────────────────────────────┐
│                    IPAService.execute()                     │
│                                                             │
│  Para cada fondo individual (paralelizado):                │
│                                                             │
│  1. IPA_01_RescatarLocalPrice_v2                           │
│     └─> Extrae datos IPA + PosModRF                        │
│     └─> Crea: #temp_IPA_WorkTable_[ID_Ejecucion]_[ID_Fund]│
│                                                             │
│  2. IPA_02_AjusteSONA_v2                                   │
│     └─> Calcula diferencia SONA vs IPA                     │
│     └─> Crea: #temp_Ajuste_SONA_[ID_Ejecucion]_[ID_Fund]  │
│                                                             │
│  3. IPA_03_RenombrarCxCCxP_v2                              │
│     └─> Renombra cuentas por cobrar/pagar                  │
│     └─> Modifica: #temp_IPA_WorkTable                      │
│                                                             │
│  4. IPA_04_TratamientoSuciedades_v2 [PENDIENTE]            │
│     └─> Trata suciedades (valores pequeños)                │
│     └─> Modifica: #temp_IPA_WorkTable                      │
│                                                             │
│  5. IPA_05_EliminarCajasMTM_v2 [PENDIENTE]                 │
│     └─> Elimina cajas MTM duplicadas                       │
│     └─> Modifica: #temp_IPA_WorkTable                      │
│                                                             │
│  6. IPA_06_CrearDimensiones_v2 [PENDIENTE]                 │
│     └─> Homologa fondos, instrumentos, monedas             │
│     └─> Modifica: #temp_IPA_WorkTable                      │
│                                                             │
│  7. IPA_07_AgruparRegistros_v2 [PENDIENTE]                 │
│     └─> Agrupa registros finales                           │
│     └─> Crea: #temp_IPA_Final_[ID_Ejecucion]_[ID_Fund]    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Estados de Implementación

### ✅ Completado (Fase 2 Parcial)

- [x] **BasePipelineService.js** - Clase base con lógica común
- [x] **IPAService.js** - Servicio IPA con ejecución de pipeline completo
- [x] **IPA_01_RescatarLocalPrice_v2.sql** - Extracción IPA + PosModRF
- [x] **IPA_02_AjusteSONA_v2.sql** - Ajuste SONA vs IPA
- [x] **IPA_03_RenombrarCxCCxP_v2.sql** - Renombrar CxC/CxP
- [x] **test_ipa_service.js** - Script de testing unitario

### 🔄 Pendiente (Fase 2 Restante)

- [ ] **IPA_04_TratamientoSuciedades_v2.sql** - Tratamiento de suciedades
- [ ] **IPA_05_EliminarCajasMTM_v2.sql** - Eliminar cajas MTM
- [ ] **IPA_06_CrearDimensiones_v2.sql** - Homologación de dimensiones
- [ ] **IPA_07_AgruparRegistros_v2.sql** - Agrupación final

**Nota**: Los SPs pendientes seguirán el mismo patrón de refactorización:
- Aceptar parámetros por fondo (`@ID_Fund`, `@Portfolio_Geneva`)
- Usar tablas temporales por fondo
- Retornar códigos estándar (0=OK, 1=WARNING, 2=RETRY, 3=CRITICAL)
- Parámetros OUTPUT (`@RowsProcessed`, `@ErrorCount`)

## Uso

### Opción 1: Testing Unitario (Manual)

```javascript
const { IPAService } = require('./server/services/pipeline');
const { getPool } = require('./server/config/database');
const { ExecutionTracker, LoggingService } = require('./server/services/tracking');

// 1. Setup
const pool = await getPool();
const tracker = new ExecutionTracker(pool);
const logger = new LoggingService(pool, 'INFO');

// 2. Configuración del servicio (desde pipeline.config.yaml)
const ipaConfig = {
  id: 'PROCESS_IPA',
  name: 'Procesamiento IPA',
  spList: [
    { name: 'staging.IPA_01_RescatarLocalPrice_v2', order: 1 },
    { name: 'staging.IPA_02_AjusteSONA_v2', order: 2 },
    { name: 'staging.IPA_03_RenombrarCxCCxP_v2', order: 3 },
    // ... resto de SPs
  ],
  tracking: {
    stateField: 'Estado_Process_IPA',
  },
};

// 3. Crear servicio
const ipaService = new IPAService(ipaConfig, pool, tracker, logger);

// 4. Ejecutar para un fondo
const context = {
  idEjecucion: 12345n,
  fechaReporte: '2025-12-19',
  fund: {
    ID_Fund: 789,
    FundShortName: 'MLAT',
    Portfolio_Geneva: 'MLAT',
  },
};

const result = await ipaService.execute(context);

// 5. Cleanup
await ipaService.cleanup(context);
```

### Opción 2: Desde PipelineOrchestrator (Producción)

```javascript
// El orquestador se encargará de crear y ejecutar servicios automáticamente
const orchestrator = new PipelineOrchestrator(config, pool);
await orchestrator.startExecution(idEjecucion, fechaReporte, fondos);
```

### Opción 3: Script de Testing

```bash
# Ejecutar script de testing unitario
node server/services/pipeline/examples/test_ipa_service.js
```

## Configuración

### pipeline.config.yaml

```yaml
services:
  - id: PROCESS_IPA
    name: "Procesamiento IPA"
    type: parallel                   # Paralelo por fondo individual
    dependencies: [VALIDACION]       # Requiere validación exitosa
    maxConcurrent: 999               # Sin límite - máxima paralelización
    spList:
      - name: staging.IPA_01_RescatarLocalPrice_v2
        order: 1
        parallel: false
        timeout: 180000
        inputFields:
          - ID_Ejecucion
          - FechaReporte
          - ID_Fund
          - Portfolio_Geneva
        tracking:
          subStateField: Estado_IPA_01_RescatarLocalPrice

      - name: staging.IPA_02_AjusteSONA_v2
        order: 2
        parallel: false
        timeout: 120000
        tracking:
          subStateField: Estado_IPA_02_AjusteSONA

      # ... resto de SPs (IPA_03 a IPA_07)

    onError: STOP_FUND               # Error detiene procesamiento de este fondo
    tracking:
      stateField: Estado_Process_IPA
      metricsEnabled: true
      errorField: Paso_Con_Error
```

## Características

### 1. Procesamiento Paralelo por Fondo

- ✅ Cada fondo se procesa independientemente
- ✅ Tablas temporales aisladas por ejecución y fondo
- ✅ Sin conflictos de escritura entre fondos
- ✅ Escalable a 100+ fondos simultáneos

### 2. Tracking Granular

El servicio actualiza estados en múltiples niveles:

```sql
-- Estado general del servicio
Estado_Process_IPA: 'PENDIENTE' | 'EN_PROGRESO' | 'OK' | 'ERROR' | 'N/A'

-- Estados por sub-paso
Estado_IPA_01_RescatarLocalPrice: 'PENDIENTE' | 'EN_PROGRESO' | 'OK' | 'ERROR'
Estado_IPA_02_AjusteSONA: 'PENDIENTE' | 'EN_PROGRESO' | 'OK' | 'ERROR'
Estado_IPA_03_RenombrarCxCCxP: 'PENDIENTE' | 'EN_PROGRESO' | 'OK' | 'ERROR'
-- ... hasta IPA_07
```

### 3. Retry Automático

BasePipelineService incluye retry logic con exponential backoff:

```javascript
// Configuración de retry (en BasePipelineService)
const maxRetries = 3;
const retriableErrors = [
  1205,  // SQL deadlock
  'ETIMEOUT',  // Connection timeout
  'ECONNRESET',  // Connection reset
];

// Exponential backoff: 5s, 10s, 15s
const delay = 5000 * attempt;
```

### 4. Logging Estructurado

```javascript
// Niveles de logging
await ipaService.logDebug(idEjecucion, idFund, 'Mensaje debug');
await ipaService.logInfo(idEjecucion, idFund, 'Mensaje info');
await ipaService.logWarning(idEjecucion, idFund, 'Mensaje warning');
await ipaService.logError(idEjecucion, idFund, 'Mensaje error');
```

### 5. Validaciones Pre y Post

```javascript
// Pre-validaciones
- Portfolio_Geneva definido
- Datos IPA extraídos para la fecha
- Connection pool disponible

// Post-validaciones
- Registros finales generados
- Suma total MVal consistente
- Sin fondos con problemas críticos
```

## Códigos de Retorno de SPs

Todos los SPs v2 retornan códigos estándar:

| Código | Significado | Acción |
|--------|-------------|--------|
| **0** | Éxito | Continuar con siguiente paso |
| **1** | Warning | Continuar pero loguear advertencia |
| **2** | Error recuperable | Reintentar (deadlock, timeout) |
| **3** | Error crítico | Detener procesamiento del fondo |

## Métricas

### Métricas de Ejecución

```javascript
const result = await ipaService.execute(context);

// result = {
//   success: true,
//   duration: 45230,  // ms
//   skipped: false,
//   metrics: { ... }
// }
```

### Métricas IPA Específicas

```javascript
const metrics = await ipaService.getIPAMetrics(context);

// metrics = {
//   TotalRegistros: 1250,
//   TotalInstrumentos: 342,
//   TotalMVal: 125000000.50,
//   TotalAssets: 980,
//   TotalLiabilities: 270
// }
```

## Tablas Temporales

### Convención de Nombres

```
#temp_[TABLA]_[ID_Ejecucion]_[ID_Fund]

Ejemplos:
#temp_IPA_WorkTable_12345_789
#temp_Ajuste_SONA_12345_789
#temp_IPA_Final_12345_789
```

### Cleanup Automático

```javascript
// Cleanup al finalizar (exitoso o con error)
await ipaService.cleanup(context);

// Tablas limpiadas:
// - #temp_IPA_WorkTable_[ID_Ejecucion]_[ID_Fund]
// - #temp_Ajuste_SONA_[ID_Ejecucion]_[ID_Fund]
// - #temp_IPA_Final_[ID_Ejecucion]_[ID_Fund]
```

## Debugging

### Modo Debug en SPs

```javascript
// Ejecutar SPs con @DebugMode=1 para NO limpiar tablas temporales
// Esto permite inspeccionar los datos intermedios después de la ejecución

// En IPAService, agregar opción debug:
const context = {
  idEjecucion,
  fechaReporte,
  fund,
  debugMode: true,  // No limpiar temps
};
```

### Consultar Tablas Temporales

```sql
-- Ver datos en tabla temporal (mientras esté activa la sesión)
SELECT TOP 100 *
FROM #temp_IPA_WorkTable_12345_789
ORDER BY InvestID;

-- Ver ajustes SONA
SELECT *
FROM #temp_Ajuste_SONA_12345_789;

-- Ver resultado final
SELECT *
FROM #temp_IPA_Final_12345_789;
```

### Logs de Ejecución

```sql
-- Ver logs de una ejecución específica
SELECT *
FROM logs.Ejecucion_Logs
WHERE ID_Ejecucion = 12345
  AND ID_Fund = 789
  AND Etapa LIKE 'PROCESS_IPA%'
ORDER BY Timestamp DESC;

-- Ver estados por sub-paso
SELECT
    ID_Fund,
    FundShortName,
    Estado_IPA_01_RescatarLocalPrice,
    Estado_IPA_02_AjusteSONA,
    Estado_IPA_03_RenombrarCxCCxP,
    -- ... resto de estados
    Estado_Final
FROM logs.Ejecucion_Fondos
WHERE ID_Ejecucion = 12345;
```

## Próximos Pasos

### Completar Fase 2

1. **Refactorizar SPs restantes** (IPA_04 a IPA_07):
   - Seguir patrón de IPA_01 a IPA_03
   - Usar tablas temporales por fondo
   - Parámetros estándar INPUT/OUTPUT
   - Códigos de retorno estándar

2. **Testing unitario completo**:
   - Ejecutar test_ipa_service.js con datos reales
   - Validar resultados vs versión v1
   - Probar con múltiples fondos en paralelo

3. **Integración con PipelineOrchestrator**:
   - Crear orquestador que use IPAService
   - Implementar paralelización de fondos
   - Manejo de dependencias entre servicios

### Fase 3: Servicios Restantes

- [ ] CAPMService (3 SPs)
- [ ] DerivadosService (4 SPs)
- [ ] PNLService (5 SPs)
- [ ] UBSService (3 SPs)

## Referencias

- **Clase base**: `BasePipelineService.js`
- **Configuración**: `pipeline.config.yaml`
- **Tracking**: `ExecutionTracker.js`, `LoggingService.js`
- **Scripts SQL**: `database/procedures/staging.IPA_*_v2.sql`
- **Testing**: `examples/test_ipa_service.js`
