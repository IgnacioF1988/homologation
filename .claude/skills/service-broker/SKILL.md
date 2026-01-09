# Service Broker Skill

## Proposito

Guiar la implementacion, configuracion y debugging de mensajeria Service Broker para comunicacion push desde la DB hacia el backend.

## Conceptos Clave

### Componentes de Service Broker

| Componente | Descripcion |
|------------|-------------|
| **Message Type** | Define formato del mensaje (NONE = validacion en app) |
| **Contract** | Define quien puede enviar que (INITIATOR = SPs) |
| **Queue** | Almacena mensajes hasta ser recibidos |
| **Service** | Endpoint de comunicacion |
| **Conversation** | Canal bidireccional entre servicios |

### Arquitectura en Homologation

```
┌─────────────────────────────────────────────────────────────┐
│                    SQL SERVER                                │
│                                                              │
│  ┌──────────────────┐      ┌────────────────────────────┐   │
│  │ sp_Process_IPA   │──┐   │  broker.sp_EmitirEvento    │   │
│  │ sp_Process_CAPM  │──┼──>│  (helper centralizado)     │   │
│  │ sp_ValidateFund  │──┘   └────────────┬───────────────┘   │
│  └──────────────────┘                   │                    │
│                                         │ SEND ON CONV       │
│                                         ▼                    │
│                        ┌──────────────────────────────┐     │
│                        │  broker.ETLEventQueue        │     │
│                        │  (mensajes JSON)             │     │
│                        └──────────────┬───────────────┘     │
└───────────────────────────────────────┼─────────────────────┘
                                        │
                                        │ WAITFOR RECEIVE
                                        ▼
┌─────────────────────────────────────────────────────────────┐
│                    NODE.JS BACKEND                           │
│                                                              │
│                 ┌──────────────────────────┐                 │
│                 │  ServiceBrokerListener   │                 │
│                 │  (conexion persistente)  │                 │
│                 └──────────────────────────┘                 │
└─────────────────────────────────────────────────────────────┘
```

## Emitir Eventos

### Usar sp_EmitirEvento

```sql
-- Al inicio de un SP
EXEC broker.sp_EmitirEvento
    @TipoEvento = 'SP_INICIO',
    @ID_Ejecucion = @ID_Ejecucion,
    @ID_Proceso = @ID_Proceso,
    @ID_Fund = @ID_Fund,
    @NombreSP = 'sp_Process_IPA';

-- Al terminar exitosamente
EXEC broker.sp_EmitirEvento
    @TipoEvento = 'SP_FIN',
    @ID_Ejecucion = @ID_Ejecucion,
    @ID_Proceso = @ID_Proceso,
    @ID_Fund = @ID_Fund,
    @NombreSP = 'sp_Process_IPA',
    @CodigoRetorno = 0,
    @DuracionMs = 5333,
    @RowsProcessed = 1500,
    @Detalles = '{"TotalIPA": 150000000}';

-- En error
EXEC broker.sp_EmitirEvento
    @TipoEvento = 'ERROR',
    @ID_Ejecucion = @ID_Ejecucion,
    @ID_Proceso = @ID_Proceso,
    @ID_Fund = @ID_Fund,
    @NombreSP = 'sp_Process_IPA',
    @CodigoRetorno = 3,
    @Detalles = '{"error": "Deadlock"}';

-- En stand-by
EXEC broker.sp_EmitirEvento
    @TipoEvento = 'STANDBY',
    @ID_Ejecucion = @ID_Ejecucion,
    @ID_Proceso = @ID_Proceso,
    @ID_Fund = @ID_Fund,
    @NombreSP = 'sp_ValidateFund',
    @CodigoRetorno = 6,
    @Detalles = '{"Instrumentos": ["ABC", "XYZ"]}';
```

### Formato de Mensaje JSON

```json
{
  "MessageId": "A1B2C3D4-E5F6-7890-ABCD-EF1234567890",
  "MessageType": "SP_FIN",
  "Timestamp": "2026-01-08T10:30:05.456Z",
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
    "Detalles": { "TotalIPA": 150000000 }
  }
}
```

## Recibir Eventos (Backend)

### Patron WAITFOR RECEIVE

```javascript
async _receiveMessages() {
  const result = await this.connection.request().query(`
    WAITFOR (
      RECEIVE TOP(10)
        conversation_handle,
        message_type_name,
        message_body
      FROM [broker].[ETLEventQueue]
    ), TIMEOUT 5000;
  `);

  return result.recordset;
}
```

## Debugging

### Ver estado de Service Broker

```sql
-- Vista de estado
SELECT * FROM broker.vw_ServiceBrokerStatus;

-- Broker habilitado?
SELECT is_broker_enabled FROM sys.databases WHERE name = DB_NAME();

-- Queues activas?
SELECT name, is_receive_enabled, is_enqueue_enabled
FROM sys.service_queues;
```

### Ver mensajes en cola

```sql
SELECT TOP 10
    queuing_order,
    message_type_name,
    CAST(message_body AS NVARCHAR(MAX)) AS body
FROM [broker].[ETLEventQueue]
ORDER BY queuing_order;
```

### Ver conversaciones

```sql
SELECT
    conversation_handle,
    state_desc,
    far_service,
    lifetime
FROM sys.conversation_endpoints
WHERE state_desc != 'CLOSED';
```

### Ver eventos recientes

```sql
SELECT TOP 100 *
FROM broker.EventLog
ORDER BY FechaEnvio DESC;
```

### Ver errores

```sql
SELECT TOP 100 *
FROM broker.ErrorLog
ORDER BY Timestamp DESC;
```

### Ejecutar limpieza manual

```sql
EXEC broker.sp_CleanupConversations @MaxAgeHours = 2;
```

## Problemas Comunes

### Queue Deshabilitada

```sql
-- Verificar
SELECT is_receive_enabled FROM sys.service_queues WHERE name = 'ETLEventQueue';

-- Solucionar
ALTER QUEUE [broker].[ETLEventQueue] WITH STATUS = ON;
```

### Broker Deshabilitado

```sql
-- Verificar
SELECT is_broker_enabled FROM sys.databases WHERE name = DB_NAME();

-- Solucionar (requiere single user)
ALTER DATABASE INTELIGENCIA_PRODUCTO_FULLSTACK SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
ALTER DATABASE INTELIGENCIA_PRODUCTO_FULLSTACK SET ENABLE_BROKER;
ALTER DATABASE INTELIGENCIA_PRODUCTO_FULLSTACK SET MULTI_USER;
```

### Conversaciones Stuck

```sql
-- Cerrar conversaciones en error
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
```

### Mensajes Acumulados

```sql
-- Purgar mensajes (si backend esta down)
RECEIVE TOP(1000) * FROM [broker].[ETLEventQueue];
```

## Checklist

- [ ] Service Broker habilitado en DB
- [ ] MESSAGE TYPE creado
- [ ] CONTRACT definido
- [ ] QUEUE creada y activa (STATUS = ON)
- [ ] SERVICE creado
- [ ] sp_EmitirEvento disponible
- [ ] Backend listener conectado
- [ ] Job de cleanup programado
