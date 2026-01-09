# Realtime Frontend Skill

## Proposito

Guiar el desarrollo de componentes React con actualizaciones en tiempo real via WebSocket, estado reactivo y patrones de UI optimista.

## Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│                    REACT FRONTEND                            │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                 usePipelineWebSocket                  │   │
│  │  - Conexion WebSocket                                │   │
│  │  - Auto-reconexion                                   │   │
│  │  - Suscripciones por ID_Ejecucion                    │   │
│  └──────────────────┬───────────────────────────────────┘   │
│                     │                                        │
│                     ▼                                        │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                   usePipelineState                    │   │
│  │  - Estado reactivo de ejecucion                      │   │
│  │  - Procesa eventos entrantes                         │   │
│  │  - Actualiza fondos en tiempo real                   │   │
│  └──────────────────┬───────────────────────────────────┘   │
│                     │                                        │
│                     ▼                                        │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              PipelineExecutionContainer               │   │
│  │  - Visualiza progreso                                │   │
│  │  - Lista de fondos                                   │   │
│  │  - Indicadores de estado                             │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Hooks Principales

### usePipelineWebSocket

```jsx
/**
 * Hook para conectar a WebSocket del pipeline
 */
export const usePipelineWebSocket = (idEjecucion) => {
  const [isConnected, setIsConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState(null);
  const wsRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);

  useEffect(() => {
    if (!idEjecucion) return;

    const connect = () => {
      const ws = new WebSocket(`ws://${API_HOST}/api/ws/pipeline`);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        reconnectAttemptsRef.current = 0;

        // Suscribirse a la ejecucion
        ws.send(JSON.stringify({
          type: 'SUBSCRIBE',
          data: { ID_Ejecucion: idEjecucion }
        }));
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        setLastEvent(data);
      };

      ws.onclose = () => {
        setIsConnected(false);
        // Reconexion con backoff exponencial
        const delay = Math.min(
          1000 * Math.pow(2, reconnectAttemptsRef.current),
          30000
        );
        reconnectAttemptsRef.current++;
        setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [idEjecucion]);

  return { isConnected, lastEvent };
};
```

### usePipelineState

```jsx
/**
 * Hook para manejar estado del pipeline con actualizaciones reactivas
 */
export const usePipelineState = (idEjecucion) => {
  const [ejecucion, setEjecucion] = useState(null);
  const [fondos, setFondos] = useState([]);
  const { isConnected, lastEvent } = usePipelineWebSocket(idEjecucion);

  // Procesar eventos entrantes
  useEffect(() => {
    if (!lastEvent) return;

    switch (lastEvent.type) {
      case 'INITIAL_STATE':
        setEjecucion(lastEvent.data.ejecucion);
        setFondos(lastEvent.data.fondos);
        break;

      case 'FUND_UPDATE':
        setFondos(prev => prev.map(f =>
          f.ID_Fund === lastEvent.data.ID_Fund
            ? { ...f, ...lastEvent.data }
            : f
        ));
        break;

      case 'FUND_ERROR':
        setFondos(prev => prev.map(f =>
          f.ID_Fund === lastEvent.data.ID_Fund
            ? { ...f, Estado: 'ERROR', Error: lastEvent.data.Error }
            : f
        ));
        break;

      case 'STANDBY_ACTIVATED':
        setFondos(prev => prev.map(f =>
          f.ID_Fund === lastEvent.data.ID_Fund
            ? { ...f, Estado: 'STANDBY', TipoProblema: lastEvent.data.TipoProblema }
            : f
        ));
        break;

      case 'EXECUTION_COMPLETE':
        setEjecucion(prev => ({
          ...prev,
          Estado: lastEvent.data.Estado,
          FondosOK: lastEvent.data.FondosOK,
          FondosError: lastEvent.data.FondosError
        }));
        break;
    }
  }, [lastEvent]);

  return { ejecucion, fondos, isConnected };
};
```

## Componentes

### PipelineExecutionContainer

```jsx
const PipelineExecutionContainer = ({ idEjecucion }) => {
  const { ejecucion, fondos, isConnected } = usePipelineState(idEjecucion);

  if (!ejecucion) {
    return <LoadingState />;
  }

  return (
    <Box>
      <PipelineHeader
        ejecucion={ejecucion}
        isConnected={isConnected}
      />

      <ConnectionStatus connected={isConnected} />

      <FundsList fondos={fondos} />
    </Box>
  );
};
```

### ConnectionStatus

```jsx
const ConnectionStatus = ({ connected }) => (
  <Chip
    icon={connected ? <WifiIcon /> : <WifiOffIcon />}
    label={connected ? 'Conectado' : 'Reconectando...'}
    color={connected ? 'success' : 'warning'}
    size="small"
  />
);
```

### FundCard con Animaciones

```jsx
const FundCard = ({ fund }) => {
  return (
    <Card
      sx={{
        transition: 'all 0.3s ease',
        borderLeft: fund.Estado === 'ERROR' ? '4px solid red' :
                   fund.Estado === 'PROCESSING' ? '4px solid blue' :
                   fund.Estado === 'STANDBY' ? '4px solid orange' :
                   fund.Estado === 'COMPLETED' ? '4px solid green' :
                   'none'
      }}
    >
      <CardContent>
        <Typography variant="h6">{fund.FundShortName}</Typography>
        <Typography color="textSecondary">{fund.Estado}</Typography>

        {fund.Estado === 'PROCESSING' && (
          <LinearProgress />
        )}

        {fund.Estado === 'ERROR' && (
          <Alert severity="error">{fund.Error}</Alert>
        )}

        {fund.Estado === 'STANDBY' && (
          <Alert severity="warning">
            {fund.TipoProblema}: {fund.Cantidad} items pendientes
          </Alert>
        )}
      </CardContent>
    </Card>
  );
};
```

## Patrones

### Optimistic Updates

```jsx
const useOptimisticAction = () => {
  const handlePause = async (idEjecucion, idFund) => {
    // 1. Optimistic update
    setFondos(prev => prev.map(f =>
      f.ID_Fund === idFund ? { ...f, Estado: 'PAUSING' } : f
    ));

    try {
      // 2. API call
      await pipelineApi.pauseFund(idEjecucion, idFund);
      // 3. Real update vendra via WebSocket
    } catch (error) {
      // 4. Rollback on error
      setFondos(prev => prev.map(f =>
        f.ID_Fund === idFund ? { ...f, Estado: 'RUNNING' } : f
      ));
    }
  };

  return { handlePause };
};
```

### Reconexion con Backoff

```jsx
const reconnect = () => {
  const delay = Math.min(
    1000 * Math.pow(2, attempts),
    30000  // Max 30 segundos
  );
  setTimeout(connect, delay);
};
```

### Evitar Stale Closures

```jsx
// CORRECTO: Usar functional updates
setFondos(prev => prev.map(f => ...));

// INCORRECTO: Captura estado viejo
setFondos(fondos.map(f => ...));
```

## WebSocket Events

| Evento | Accion UI |
|--------|-----------|
| FUND_UPDATE | Actualizar fondo en lista |
| FUND_ERROR | Mostrar error en card |
| STANDBY_ACTIVATED | Mostrar alerta en card |
| EXECUTION_STARTED | Iniciar animaciones |
| EXECUTION_COMPLETE | Mostrar resumen final |

## Checklist de Componente

- [ ] Hook de WebSocket con cleanup
- [ ] Manejo de reconexion con backoff
- [ ] Indicador de estado de conexion
- [ ] Functional updates para evitar stale closures
- [ ] Optimistic updates donde aplique
- [ ] Animaciones de transicion (CSS transitions)
- [ ] Estados de loading/error
- [ ] Accesibilidad (aria-live para updates)
