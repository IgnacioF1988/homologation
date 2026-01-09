# Backend Documentation - Listener Pattern

## Rol del Backend

En la arquitectura DB-centric, el backend tiene un rol **pasivo**:

1. **Iniciar** - Exponer endpoints REST para iniciar/controlar pipeline
2. **Escuchar** - ServiceBrokerListener recibe eventos de DB
3. **Retransmitir** - WebSocketManager envia eventos a clientes

## Estructura de Archivos

```
server/
├── services/
│   ├── broker/
│   │   ├── ServiceBrokerListener.js  # Escucha Service Broker
│   │   ├── MessageProcessor.js       # Procesa mensajes
│   │   └── index.js
│   └── websocket/
│       └── WebSocketManager.js       # Gestiona conexiones WS
├── routes/
│   └── pipeline.routes.js            # Endpoints REST
├── config/
│   ├── database.js                   # Pool SQL Server
│   └── serviceBroker.config.js       # Config Service Broker
└── index.js                          # Entry point
```

## ServiceBrokerListener

### Patron de Escucha

```javascript
class ServiceBrokerListener {
  async _listenLoop() {
    while (this.isListening) {
      // WAITFOR RECEIVE con timeout
      const result = await this.connection.request().query(`
        WAITFOR (
          RECEIVE TOP(10)
            conversation_handle,
            message_type_name,
            message_body
          FROM [broker].[ETLEventQueue]
        ), TIMEOUT 5000;
      `);

      for (const row of result.recordset) {
        await this._processMessage(row);
      }
    }
  }
}
```

### Conexion Dedicada

- Pool separado del pool general
- `pool: { max: 1, min: 1 }` - Conexion unica
- `requestTimeout` mayor que WAITFOR timeout
- Auto-reconexion con backoff exponencial

## Endpoints REST

### POST /api/pipeline/iniciar
Inicia el pipeline completo.

```javascript
router.post('/iniciar', async (req, res) => {
  const { fechaReporte, fondos } = req.body;

  const result = await pool.request()
    .input('FechaReporte', sql.NVarChar(10), fechaReporte)
    .input('Fondos', sql.NVarChar(sql.MAX), JSON.stringify(fondos))
    .execute('pipeline.sp_Iniciar_Pipeline');

  res.json({
    success: true,
    idEjecucion: result.output.ID_Ejecucion,
    totalFondos: result.output.TotalFondos
  });
});
```

### POST /api/pipeline/:id/pausar
Pausa una ejecucion en curso.

```javascript
router.post('/:id/pausar', async (req, res) => {
  await pool.request()
    .input('ID_Ejecucion', sql.BigInt, req.params.id)
    .input('Motivo', sql.NVarChar(500), req.body.motivo)
    .execute('pipeline.sp_Pausar_Ejecucion');
});
```

### POST /api/pipeline/:id/resumir
Reanuda una ejecucion pausada.

### POST /api/pipeline/:id/cancelar
Cancela una ejecucion.

### POST /api/pipeline/:id/reprocesar/:idFund
Reprocesa un fondo especifico.

### GET /api/pipeline/:id/estado
Obtiene estado actual desde BD.

## WebSocket Protocol

### Conexion

```javascript
const ws = new WebSocket('ws://server:3001/api/ws/pipeline');
```

### Mensajes Cliente → Servidor

```json
// Suscribirse a ejecucion
{ "type": "SUBSCRIBE", "data": { "ID_Ejecucion": 12345 } }

// Desuscribirse
{ "type": "UNSUBSCRIBE", "data": { "ID_Ejecucion": 12345 } }

// Ping
{ "type": "PING" }
```

### Mensajes Servidor → Cliente

```json
// Confirmacion de conexion
{ "type": "CONNECTED", "data": { "clientId": 1 } }

// Confirmacion de suscripcion
{ "type": "SUBSCRIBED", "data": { "ID_Ejecucion": "12345" } }

// Actualizacion de fondo
{
  "type": "FUND_UPDATE",
  "data": {
    "ID_Ejecucion": 12345,
    "ID_Fund": 42,
    "NombreSP": "sp_Process_IPA",
    "Estado": "OK",
    "DuracionMs": 5333
  },
  "timestamp": "2026-01-08T10:30:00Z"
}

// Error en fondo
{
  "type": "FUND_ERROR",
  "data": {
    "ID_Ejecucion": 12345,
    "ID_Fund": 42,
    "NombreSP": "sp_Process_CAPM",
    "CodigoRetorno": 3,
    "Error": "Deadlock detected"
  }
}

// Stand-by activado
{
  "type": "STANDBY_ACTIVATED",
  "data": {
    "ID_Ejecucion": 12345,
    "ID_Fund": 42,
    "TipoProblema": "HOMOLOGACION_INSTRUMENTOS",
    "Cantidad": 5
  }
}

// Ejecucion completada
{
  "type": "EXECUTION_COMPLETE",
  "data": {
    "ID_Ejecucion": 12345,
    "Estado": "COMPLETADO",
    "FondosOK": 145,
    "FondosError": 3,
    "FondosStandBy": 2
  }
}
```

## Mapeo de Eventos

| Evento DB | Evento WebSocket |
|-----------|------------------|
| SP_INICIO | FUND_UPDATE |
| SP_FIN | FUND_UPDATE |
| ERROR | FUND_ERROR |
| STANDBY | STANDBY_ACTIVATED |
| PROCESO_INICIO | EXECUTION_STARTED |
| PROCESO_FIN | EXECUTION_COMPLETE |

## Configuracion

### serviceBroker.config.js

```javascript
module.exports = {
  queueName: 'broker.ETLEventQueue',
  waitTimeoutMs: 5000,
  maxReconnectAttempts: 10,
  reconnectDelayMs: 5000,
  database: {
    server: process.env.DB_SERVER,
    database: 'INTELIGENCIA_PRODUCTO_FULLSTACK',
    // ... credentials
  }
};
```

### Variables de Entorno

```env
DB_SERVER=localhost
DB_DATABASE=INTELIGENCIA_PRODUCTO_FULLSTACK
DB_USER=sa
DB_PASSWORD=xxx
SB_QUEUE_NAME=broker.ETLEventQueue
SB_WAIT_TIMEOUT=5000
```

## Health Check

```javascript
app.get('/api/health', async (req, res) => {
  res.json({
    status: 'healthy',
    database: 'connected',
    serviceBroker: brokerListener.isListening ? 'connected' : 'disconnected',
    websocket: 'active',
    clients: wsManager.getStats().totalClients
  });
});
```

## Debugging

### Ver estado del listener
```bash
curl http://localhost:3001/api/health
```

### Ver logs de Service Broker en DB
```sql
SELECT TOP 100 * FROM broker.EventLog ORDER BY FechaEnvio DESC;
SELECT TOP 100 * FROM broker.ErrorLog ORDER BY Timestamp DESC;
```

### Test de WebSocket
```javascript
const ws = new WebSocket('ws://localhost:3001/api/ws/pipeline');
ws.onmessage = (e) => console.log(JSON.parse(e.data));
ws.send(JSON.stringify({ type: 'SUBSCRIBE', data: { ID_Ejecucion: 12345 } }));
```
