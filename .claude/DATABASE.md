# Database Documentation - Pipeline DB-Centric

## Overview

La base de datos SQL Server (INTELIGENCIA_PRODUCTO_FULLSTACK) es el **orquestador completo** del pipeline de procesamiento de fondos. Toda la logica de flujo, validacion, transformacion y consolidacion vive en Stored Procedures.

## Arquitectura del Pipeline

### Fases de Procesamiento

```
FASE 0   → EXTRACCION (Batch grupal - todos los fondos)
FASE 0.5 → VALIDACION (Batch grupal)
FASE 1   → PROCESS_IPA (Paralelo por fondo)
FASE 2   → PROCESS_CAPM (Paralelo por fondo)
FASE 2b  → CONSOLIDAR_CAPM (Secuencial)
FASE 3   → PROCESS_DERIVADOS (Paralelo por fondo)
FASE 4   → PROCESS_PNL (Paralelo por fondo)
FASE 5   → PROCESS_UBS (Paralelo por fondo - Luxemburgo)
FASE 6   → CONCATENAR (Secuencial - final)
FASE 7   → GRAPH_SYNC (Opcional)
```

### Stored Procedures Principales

#### Entrada del Pipeline
| SP | Descripcion | Codigos Retorno |
|----|-------------|-----------------|
| `staging.sp_ValidateFund` | Punto de entrada, valida extracts | 0,1,2,3,5-18 |

#### Procesamiento por Fase
| SP | Fase | Descripcion |
|----|------|-------------|
| `extract.Extract_IPA` | 0 | Extrae posiciones Geneva |
| `extract.Extract_CAPM` | 0 | Extrae precios CAPM |
| `extract.Extract_Derivados` | 0 | Extrae derivados |
| `staging.sp_Process_IPA` | 1 | Homologa, separa Cash/MTM |
| `staging.sp_Process_CAPM` | 2 | Valida vs IPA Cash |
| `staging.sp_Process_Derivados` | 3 | Procesa posiciones larga/corta |
| `staging.sp_Process_PNL` | 4 | Agrega rentabilidad |
| `staging.sp_Process_UBS` | 5 | Luxemburgo |
| `staging.sp_Consolidar_Cubo` | 6 | Une todo en CUBO_Final |

#### Sub-Pipeline IPA (Fase 1)
| SP | Paso | Descripcion |
|----|------|-------------|
| `IPA_01_RescatarLocalPrice_v2` | 1 | Obtener precios locales |
| `IPA_02_AjusteSONA_v2` | 2 | Ajustar SONA |
| `IPA_03_RenombrarCxCCxP_v2` | 3 | Renombrar cuentas |
| `IPA_04_TratamientoSuciedades_v2` | 4 | Tratar suciedades |
| `IPA_05_EliminarCajasMTM_v2` | 5 | Eliminar cajas MTM |
| `IPA_06_CrearDimensiones_v2` | 6 | Crear dimensiones |
| `IPA_06B_PopulateIPACash_v2` | 6B | Popular cash |
| `IPA_07_AgruparRegistros_v2` | 7 | Agrupar registros finales |

## Codigos de Retorno

| Codigo | Constante | Descripcion | Accion |
|--------|-----------|-------------|--------|
| 0 | OK | Exito completo | Continuar |
| 1 | WARNING | Exito con advertencias | Continuar, loguear |
| 2 | RETRY | Deadlock/Timeout | Reintentar (max 3x) |
| 3 | ERROR_CRITICO | Falla fatal | Detener fondo |
| 5 | SUCIEDADES | Posiciones Qty ≈ 0 | Pausar, revisar |
| 6 | HOMOLOGACION_INSTRUMENTOS | Instrumentos sin mapear | Pausar, agregar mapeo |
| 7 | DESCUADRES_CAPM | Diferencia IPA vs CAPM | Pausar, revisar |
| 8 | DESCUADRES_DERIVADOS | Diferencia IPA vs Derivados | Pausar, revisar |
| 9 | DESCUADRES_NAV | Diferencia IPA vs SONA | Pausar, revisar |
| 10 | HOMOLOGACION_FONDOS | Fondo sin mapear | Pausar, agregar mapeo |
| 11 | HOMOLOGACION_MONEDAS | Moneda sin mapear | Pausar, agregar mapeo |
| 12 | HOMOLOGACION_BENCHMARKS | Benchmark sin mapear | Pausar, agregar mapeo |
| 13-18 | EXTRACT_*_FALTANTE | Reporte no cargado | Pausar, verificar fuente |

## Service Broker

### Componentes

```
broker.ETLEventQueue           - Cola de mensajes
broker.sp_EmitirEvento         - Helper para emitir eventos
broker.sp_CleanupConversations - Limpieza periodica
broker.ActiveConversations     - Tabla de conversaciones activas
broker.EventLog                - Auditoria de eventos
broker.ErrorLog                - Errores de Service Broker
```

### Emitir Eventos desde un SP

```sql
-- Al INICIO del SP:
EXEC broker.sp_EmitirEvento
    @TipoEvento = 'SP_INICIO',
    @ID_Ejecucion = @ID_Ejecucion,
    @ID_Proceso = @ID_Proceso,
    @ID_Fund = @ID_Fund,
    @NombreSP = 'sp_Process_IPA';

-- Al FINAL exitoso:
EXEC broker.sp_EmitirEvento
    @TipoEvento = 'SP_FIN',
    @ID_Ejecucion = @ID_Ejecucion,
    @ID_Proceso = @ID_Proceso,
    @ID_Fund = @ID_Fund,
    @NombreSP = 'sp_Process_IPA',
    @CodigoRetorno = 0,
    @DuracionMs = DATEDIFF(second, @StartTime, GETDATE()) * 1000,
    @RowsProcessed = @RowsProcessed;

-- En CATCH (error):
EXEC broker.sp_EmitirEvento
    @TipoEvento = 'ERROR',
    @ID_Ejecucion = @ID_Ejecucion,
    @ID_Proceso = @ID_Proceso,
    @ID_Fund = @ID_Fund,
    @NombreSP = 'sp_Process_IPA',
    @CodigoRetorno = 3,
    @Detalles = @ErrorJSON;

-- En STAND-BY:
EXEC broker.sp_EmitirEvento
    @TipoEvento = 'STANDBY',
    @ID_Ejecucion = @ID_Ejecucion,
    @ID_Proceso = @ID_Proceso,
    @ID_Fund = @ID_Fund,
    @NombreSP = 'sp_ValidateFund',
    @CodigoRetorno = 6,
    @Detalles = '{"Instrumentos": ["ABC", "XYZ"]}';
```

### Formato de Mensajes JSON

```json
{
  "MessageId": "GUID",
  "MessageType": "SP_INICIO|SP_FIN|ERROR|STANDBY",
  "Timestamp": "2026-01-08T10:30:00.123Z",
  "Version": "1.0",
  "Payload": {
    "ID_Ejecucion": 12345,
    "ID_Proceso": 100,
    "ID_Fund": 42,
    "NombreSP": "sp_Process_IPA",
    "CodigoRetorno": 0,
    "Estado": "OK",
    "DuracionMs": 5333,
    "RowsProcessed": 1500,
    "TipoProblema": null,
    "Detalles": {}
  }
}
```

## Tablas de Estado

### logs.Validaciones_Ejecucion
Auditoria de todas las validaciones ejecutadas.

```sql
SELECT * FROM logs.Validaciones_Ejecucion
WHERE ID_Ejecucion = @ID
ORDER BY FechaProceso;
```

### sandbox.Homologacion_*
Registros pendientes de homologacion.

```sql
-- Instrumentos sin mapear
SELECT * FROM sandbox.Homologacion_Instrumentos
WHERE ID_Ejecucion = @ID;

-- Fondos sin mapear
SELECT * FROM sandbox.Homologacion_Fondos
WHERE ID_Ejecucion = @ID;
```

### sandbox.Alertas_*
Alertas de descuadres y problemas.

```sql
-- Descuadres Cash (IPA vs CAPM)
SELECT * FROM sandbox.Alertas_Descuadre_Cash;

-- Suciedades (Qty ≈ 0)
SELECT * FROM sandbox.Alertas_Suciedades_IPA;
```

## Concurrencia

### Tablas Temporales con Suffix

Cada fondo crea tablas temporales con suffix unico:
```
##IPA_Work_{ID_Ejecucion}_{ID_Proceso}_{ID_Fund}
##CAPM_Work_{ID_Ejecucion}_{ID_Proceso}_{ID_Fund}
##Derivados_Work_{ID_Ejecucion}_{ID_Proceso}_{ID_Fund}
```

Esto permite hasta 999 fondos en paralelo sin colisiones.

### Indices para Concurrencia

```sql
INDEX IX_*_Concurrency (ID_Ejecucion, ID_Fund, FechaReporte)
    INCLUDE (Portfolio, InvestID, LocalCurrency, MVBook)
```

## Monitoreo

### Ver estado de Service Broker
```sql
SELECT * FROM broker.vw_ServiceBrokerStatus;
```

### Ver mensajes en cola
```sql
SELECT TOP 10
    CAST(message_body AS NVARCHAR(MAX)) AS Mensaje
FROM broker.ETLEventQueue;
```

### Ver eventos recientes
```sql
SELECT TOP 100 *
FROM broker.EventLog
ORDER BY FechaEnvio DESC;
```

### Ejecutar limpieza manual
```sql
EXEC broker.sp_CleanupConversations @MaxAgeHours = 2;
```
