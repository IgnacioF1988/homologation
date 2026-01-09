# Frontend - Pipeline Real-Time

Documentacion del frontend React con actualizaciones en tiempo real via WebSocket.

## Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│                     REACT FRONTEND                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐     ┌──────────────┐    ┌──────────────┐  │
│  │  WebSocket   │────▶│    Estado    │───▶│ Componentes  │  │
│  │   Context    │     │   Reactivo   │    │     UI       │  │
│  └──────────────┘     └──────────────┘    └──────────────┘  │
│         │                    │                   │          │
│         │                    ▼                   │          │
│         │            ┌──────────────┐            │          │
│         └───────────▶│   Actions    │◀───────────┘          │
│                      │  (API calls) │                       │
│                      └──────────────┘                       │
└─────────────────────────────────────────────────────────────┘
```

## Estructura de Carpetas

```
src/
├── components/
│   ├── common/
│   │   ├── StatusBadge/
│   │   ├── ProgressBar/
│   │   └── ConnectionStatus/
│   ├── features/
│   │   └── Pipeline/
│   │       ├── PipelineExecutionContainer.jsx
│   │       ├── FundCard.jsx
│   │       ├── StageProgress.jsx
│   │       ├── ExecutionTimeline.jsx
│   │       └── index.js
│   └── layout/
├── hooks/
│   ├── usePipelineWebSocket.js
│   ├── usePipelineState.js
│   └── useOptimisticAction.js
├── contexts/
│   └── WebSocketContext.js
├── services/
│   └── api/
│       └── pipeline.api.js
└── utils/
    └── pipelineHelpers.js
```

## WebSocket Connection

### Hook: usePipelineWebSocket

```jsx
import { useState, useEffect, useCallback, useRef } from 'react';

const WS_URL = process.env.REACT_APP_WS_URL || 'ws://localhost:3001/api/ws/pipeline';

export const usePipelineWebSocket = (idEjecucion) => {
  const [isConnected, setIsConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState(null);
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    wsRef.current = new WebSocket(WS_URL);

    wsRef.current.onopen = () => {
      setIsConnected(true);
      // Suscribirse a la ejecucion
      if (idEjecucion) {
        wsRef.current.send(JSON.stringify({
          type: 'SUBSCRIBE',
          data: { ID_Ejecucion: idEjecucion }
        }));
      }
    };

    wsRef.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setLastEvent(data);
    };

    wsRef.current.onclose = () => {
      setIsConnected(false);
      // Auto-reconexion con backoff
      reconnectTimeoutRef.current = setTimeout(connect, 3000);
    };

    wsRef.current.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }, [idEjecucion]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  const subscribe = useCallback((newIdEjecucion) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'SUBSCRIBE',
        data: { ID_Ejecucion: newIdEjecucion }
      }));
    }
  }, []);

  const unsubscribe = useCallback((idEjecucionToUnsub) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'UNSUBSCRIBE',
        data: { ID_Ejecucion: idEjecucionToUnsub }
      }));
    }
  }, []);

  return {
    isConnected,
    lastEvent,
    subscribe,
    unsubscribe
  };
};
```

### Hook: usePipelineState

```jsx
import { useState, useEffect, useReducer } from 'react';
import { usePipelineWebSocket } from './usePipelineWebSocket';

const initialState = {
  fondos: {},
  stages: {},
  status: 'IDLE',
  startTime: null,
  endTime: null
};

function pipelineReducer(state, action) {
  switch (action.type) {
    case 'FUND_UPDATE':
      return {
        ...state,
        fondos: {
          ...state.fondos,
          [action.payload.ID_Fund]: {
            ...state.fondos[action.payload.ID_Fund],
            ...action.payload
          }
        }
      };

    case 'STAGE_UPDATE':
      return {
        ...state,
        stages: {
          ...state.stages,
          [action.payload.stage]: action.payload
        }
      };

    case 'EXECUTION_START':
      return {
        ...state,
        status: 'RUNNING',
        startTime: action.payload.timestamp
      };

    case 'EXECUTION_COMPLETE':
      return {
        ...state,
        status: action.payload.status,
        endTime: action.payload.timestamp
      };

    case 'RESET':
      return initialState;

    default:
      return state;
  }
}

export const usePipelineState = (idEjecucion) => {
  const [state, dispatch] = useReducer(pipelineReducer, initialState);
  const { isConnected, lastEvent } = usePipelineWebSocket(idEjecucion);

  useEffect(() => {
    if (lastEvent) {
      dispatch({ type: lastEvent.type, payload: lastEvent.data });
    }
  }, [lastEvent]);

  return {
    ...state,
    isConnected,
    dispatch
  };
};
```

## Componentes Principales

### PipelineExecutionContainer

```jsx
import React from 'react';
import { Box, Paper, Typography, Alert } from '@mui/material';
import { usePipelineState } from '../../hooks/usePipelineState';
import ConnectionStatus from '../common/ConnectionStatus';
import FundCard from './FundCard';
import StageProgress from './StageProgress';

const PipelineExecutionContainer = ({ idEjecucion }) => {
  const { fondos, stages, status, isConnected } = usePipelineState(idEjecucion);

  return (
    <Box>
      <Paper sx={{ p: 2, mb: 2 }}>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Typography variant="h6">
            Ejecucion #{idEjecucion}
          </Typography>
          <ConnectionStatus connected={isConnected} />
        </Box>
      </Paper>

      {!isConnected && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Reconectando al servidor...
        </Alert>
      )}

      <StageProgress stages={stages} />

      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 2 }}>
        {Object.values(fondos).map(fund => (
          <FundCard
            key={fund.ID_Fund}
            fund={fund}
            idEjecucion={idEjecucion}
          />
        ))}
      </Box>
    </Box>
  );
};

export default PipelineExecutionContainer;
```

### FundCard

```jsx
import React from 'react';
import { Card, CardContent, Typography, LinearProgress, Chip, Box } from '@mui/material';

const statusColors = {
  PENDING: 'default',
  PROCESSING: 'primary',
  COMPLETED: 'success',
  WARNING: 'warning',
  ERROR: 'error',
  STANDBY: 'info'
};

const FundCard = ({ fund }) => {
  const {
    ID_Fund,
    NombreFondo,
    Estado,
    FaseActual,
    Progreso,
    UltimoSP,
    DuracionMs,
    CodigoRetorno
  } = fund;

  return (
    <Card
      sx={{
        transition: 'all 0.3s ease',
        borderLeft: `4px solid`,
        borderLeftColor: `${statusColors[Estado]}.main`,
        transform: Estado === 'PROCESSING' ? 'scale(1.02)' : 'scale(1)',
      }}
    >
      <CardContent>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
          <Typography variant="subtitle1" fontWeight="bold">
            {NombreFondo}
          </Typography>
          <Chip
            label={Estado}
            color={statusColors[Estado]}
            size="small"
          />
        </Box>

        <Typography variant="body2" color="textSecondary" gutterBottom>
          Fase: {FaseActual}
        </Typography>

        {Estado === 'PROCESSING' && (
          <LinearProgress
            variant="indeterminate"
            sx={{ my: 1 }}
          />
        )}

        {Progreso !== undefined && (
          <Box mt={1}>
            <LinearProgress
              variant="determinate"
              value={Progreso}
              color={statusColors[Estado]}
            />
            <Typography variant="caption" color="textSecondary">
              {Progreso}% completado
            </Typography>
          </Box>
        )}

        {UltimoSP && (
          <Typography variant="caption" display="block" mt={1}>
            Ultimo SP: {UltimoSP} ({DuracionMs}ms)
          </Typography>
        )}

        {CodigoRetorno !== undefined && CodigoRetorno !== 0 && (
          <Typography variant="caption" color="error">
            Codigo: {CodigoRetorno}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
};

export default FundCard;
```

### ConnectionStatus

```jsx
import React from 'react';
import { Chip } from '@mui/material';
import WifiIcon from '@mui/icons-material/Wifi';
import WifiOffIcon from '@mui/icons-material/WifiOff';

const ConnectionStatus = ({ connected }) => (
  <Chip
    icon={connected ? <WifiIcon /> : <WifiOffIcon />}
    label={connected ? 'Conectado' : 'Desconectado'}
    color={connected ? 'success' : 'error'}
    size="small"
    variant="outlined"
  />
);

export default ConnectionStatus;
```

## Optimistic Updates

### Hook: useOptimisticAction

```jsx
import { useState, useCallback } from 'react';

export const useOptimisticAction = () => {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState(null);

  const execute = useCallback(async ({
    optimisticUpdate,
    apiCall,
    rollback
  }) => {
    setIsPending(true);
    setError(null);

    // 1. Aplicar update optimista
    optimisticUpdate();

    try {
      // 2. Llamar API
      await apiCall();
      // 3. Update real viene via WebSocket
    } catch (err) {
      // 4. Rollback si falla
      rollback();
      setError(err.message);
    } finally {
      setIsPending(false);
    }
  }, []);

  return { execute, isPending, error };
};
```

### Ejemplo de uso

```jsx
const PauseButton = ({ idEjecucion, fund, onOptimisticUpdate }) => {
  const { execute, isPending } = useOptimisticAction();

  const handlePause = () => {
    execute({
      optimisticUpdate: () => {
        onOptimisticUpdate(fund.ID_Fund, { Estado: 'PAUSING' });
      },
      apiCall: () => api.pausarFondo(idEjecucion, fund.ID_Fund),
      rollback: () => {
        onOptimisticUpdate(fund.ID_Fund, { Estado: fund.Estado });
      }
    });
  };

  return (
    <Button
      onClick={handlePause}
      disabled={isPending || fund.Estado !== 'PROCESSING'}
    >
      {isPending ? 'Pausando...' : 'Pausar'}
    </Button>
  );
};
```

## API Service

### pipeline.api.js

```javascript
const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

export const pipelineApi = {
  iniciar: async (params) => {
    const response = await fetch(`${API_BASE}/pipeline/iniciar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    if (!response.ok) throw new Error('Error al iniciar pipeline');
    return response.json();
  },

  pausar: async (idEjecucion) => {
    const response = await fetch(`${API_BASE}/pipeline/${idEjecucion}/pausar`, {
      method: 'POST'
    });
    if (!response.ok) throw new Error('Error al pausar');
    return response.json();
  },

  resumir: async (idEjecucion) => {
    const response = await fetch(`${API_BASE}/pipeline/${idEjecucion}/resumir`, {
      method: 'POST'
    });
    if (!response.ok) throw new Error('Error al resumir');
    return response.json();
  },

  cancelar: async (idEjecucion) => {
    const response = await fetch(`${API_BASE}/pipeline/${idEjecucion}/cancelar`, {
      method: 'POST'
    });
    if (!response.ok) throw new Error('Error al cancelar');
    return response.json();
  },

  reprocesar: async (idEjecucion, idFund) => {
    const response = await fetch(`${API_BASE}/pipeline/${idEjecucion}/reprocesar/${idFund}`, {
      method: 'POST'
    });
    if (!response.ok) throw new Error('Error al reprocesar');
    return response.json();
  },

  obtenerEstado: async (idEjecucion) => {
    const response = await fetch(`${API_BASE}/pipeline/${idEjecucion}/estado`);
    if (!response.ok) throw new Error('Error al obtener estado');
    return response.json();
  }
};
```

## Eventos WebSocket

### Tipos de eventos recibidos

| Evento | Descripcion | Payload |
|--------|-------------|---------|
| `FUND_UPDATE` | Actualizacion de estado de fondo | `{ ID_Fund, Estado, FaseActual, ... }` |
| `STAGE_UPDATE` | Actualizacion de etapa | `{ stage, status, progress }` |
| `SP_INICIO` | SP inicio ejecucion | `{ NombreSP, ID_Fund }` |
| `SP_FIN` | SP termino ejecucion | `{ NombreSP, CodigoRetorno, DuracionMs }` |
| `EXECUTION_START` | Ejecucion iniciada | `{ ID_Ejecucion, timestamp }` |
| `EXECUTION_COMPLETE` | Ejecucion terminada | `{ status, timestamp }` |
| `ERROR` | Error en pipeline | `{ message, ID_Fund, NombreSP }` |
| `STANDBY` | Fondo en espera | `{ ID_Fund, CodigoRetorno, Detalles }` |

### Mensajes enviados

| Mensaje | Descripcion | Payload |
|---------|-------------|---------|
| `SUBSCRIBE` | Suscribirse a ejecucion | `{ ID_Ejecucion }` |
| `UNSUBSCRIBE` | Desuscribirse | `{ ID_Ejecucion }` |
| `PING` | Keep-alive | `{}` |

## Animaciones y Transiciones

### CSS Transitions

```jsx
// Transition suave en cambios de estado
<Card
  sx={{
    transition: 'all 0.3s ease',
    transform: isUpdating ? 'scale(1.02)' : 'scale(1)',
    boxShadow: isUpdating ? 6 : 1,
  }}
>
```

### Pulse Animation para procesando

```jsx
const pulseAnimation = {
  '@keyframes pulse': {
    '0%': { opacity: 1 },
    '50%': { opacity: 0.6 },
    '100%': { opacity: 1 },
  },
  animation: 'pulse 2s infinite',
};

// Uso
<Box sx={fund.Estado === 'PROCESSING' ? pulseAnimation : {}}>
  {/* contenido */}
</Box>
```

## Skills Relacionados

- realtime-frontend
- service-broker (para entender eventos)
