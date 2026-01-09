# Debug Service Broker

Diagnostica problemas de mensajeria Service Broker.

## Uso

```
/debug-service-broker
/debug-service-broker --fix-queue
/debug-service-broker --clear-stuck
```

## Proceso

### 1. Verificar configuracion basica

```sql
-- Service Broker habilitado?
SELECT
    name AS DatabaseName,
    is_broker_enabled AS BrokerEnabled
FROM sys.databases
WHERE name = DB_NAME();

-- Estado de la cola
SELECT
    name AS QueueName,
    is_receive_enabled AS ReceiveEnabled,
    is_enqueue_enabled AS EnqueueEnabled,
    is_activation_enabled AS ActivationEnabled
FROM sys.service_queues
WHERE name = 'ETLEventQueue';
```

### 2. Ver estado general

```sql
SELECT * FROM broker.vw_ServiceBrokerStatus;
```

Campos importantes:
- `ConversacionesActivas`: Deberia ser > 0 si hay procesos corriendo
- `MensajesEnCola`: Si es alto, el backend puede estar desconectado
- `ErroresUltimaHora`: Cualquier valor > 0 requiere investigacion

### 3. Ver conversaciones activas

```sql
SELECT
    ac.ID_Proceso,
    ac.ConversationHandle,
    ac.Estado,
    ac.FechaCreacion,
    ac.FechaUltimoMensaje,
    ac.MensajesEnviados
FROM broker.ActiveConversations ac
WHERE ac.Estado = 'ACTIVO'
ORDER BY ac.FechaCreacion DESC;
```

### 4. Ver mensajes pendientes en cola

```sql
SELECT TOP 20
    queuing_order,
    message_type_name,
    CAST(message_body AS NVARCHAR(MAX)) AS body
FROM [broker].[ETLEventQueue]
ORDER BY queuing_order;
```

### 5. Ver errores recientes

```sql
SELECT TOP 50
    Timestamp,
    Procedimiento,
    ErrorNumber,
    ErrorMessage,
    ID_Ejecucion,
    ID_Proceso,
    ID_Fund
FROM broker.ErrorLog
ORDER BY Timestamp DESC;
```

### 6. Ver eventos recientes

```sql
SELECT TOP 100
    FechaEnvio,
    TipoEvento,
    ID_Ejecucion,
    ID_Fund,
    NombreSP,
    CodigoRetorno
FROM broker.EventLog
ORDER BY FechaEnvio DESC;
```

## Problemas Comunes y Soluciones

### Queue deshabilitada

**Sintoma**: Mensajes no se envian
```sql
-- Verificar
SELECT is_receive_enabled FROM sys.service_queues WHERE name = 'ETLEventQueue';

-- Solucionar
ALTER QUEUE [broker].[ETLEventQueue] WITH STATUS = ON;
```

### Broker deshabilitado

**Sintoma**: Error al crear conversaciones
```sql
-- Solucionar (requiere single user)
ALTER DATABASE INTELIGENCIA_PRODUCTO_FULLSTACK SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
ALTER DATABASE INTELIGENCIA_PRODUCTO_FULLSTACK SET ENABLE_BROKER;
ALTER DATABASE INTELIGENCIA_PRODUCTO_FULLSTACK SET MULTI_USER;
```

### Conversaciones stuck en ERROR

**Sintoma**: Conversaciones no se cierran
```sql
-- Cerrar todas las conversaciones en error
DECLARE @handle UNIQUEIDENTIFIER;
DECLARE conv_cursor CURSOR FOR
    SELECT conversation_handle
    FROM sys.conversation_endpoints
    WHERE state_desc = 'ERROR';

OPEN conv_cursor;
FETCH NEXT FROM conv_cursor INTO @handle;
WHILE @@FETCH_STATUS = 0
BEGIN
    END CONVERSATION @handle WITH CLEANUP;
    FETCH NEXT FROM conv_cursor INTO @handle;
END;
CLOSE conv_cursor;
DEALLOCATE conv_cursor;

-- Actualizar tabla de tracking
UPDATE broker.ActiveConversations
SET Estado = 'LIMPIADO'
WHERE ConversationHandle IN (
    SELECT conversation_handle
    FROM sys.conversation_endpoints
    WHERE state_desc = 'CLOSED'
);
```

### Mensajes acumulados (backend desconectado)

**Sintoma**: MensajesEnCola crece sin parar
```sql
-- Verificar cantidad
SELECT COUNT(*) AS MensajesPendientes FROM [broker].[ETLEventQueue];

-- Purgar mensajes viejos (CUIDADO: se pierden eventos)
RECEIVE TOP(10000) * FROM [broker].[ETLEventQueue];
```

### Conversaciones viejas

**Sintoma**: Muchas conversaciones activas antiguas
```sql
-- Ejecutar limpieza
EXEC broker.sp_CleanupConversations @MaxAgeHours = 1;
```

## Test de Conectividad

### Enviar mensaje de prueba

```sql
EXEC broker.sp_EmitirEvento
    @TipoEvento = 'TEST',
    @ID_Ejecucion = 0,
    @ID_Proceso = 0,
    @ID_Fund = 0,
    @NombreSP = 'test_connectivity';
```

### Verificar que llego

```sql
-- Esperar unos segundos y verificar
SELECT TOP 1 *
FROM broker.EventLog
WHERE TipoEvento = 'TEST'
ORDER BY FechaEnvio DESC;
```

## Output Esperado

```markdown
## Service Broker Diagnostic Report

### Estado General
- Broker Habilitado: SI
- Queue Habilitada: SI
- Conversaciones Activas: 5
- Mensajes en Cola: 2
- Errores (ultima hora): 0

### Conversaciones
| ID_Proceso | Estado | Mensajes | Ultima Actividad |
|------------|--------|----------|------------------|
| 12345 | ACTIVO | 150 | hace 2 min |
| 12346 | ACTIVO | 89 | hace 5 min |

### Mensajes Pendientes
| Orden | Tipo | Payload |
|-------|------|---------|
| 1 | SP_FIN | {"ID_Fund": 42, ...} |
| 2 | SP_INICIO | {"ID_Fund": 43, ...} |

### Errores Recientes
Ninguno

### Diagnostico
Estado: OK - Service Broker funcionando correctamente
```

## Skills Relacionados

- service-broker
