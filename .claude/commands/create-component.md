# Create Component

Crea componentes React con soporte para actualizaciones en tiempo real via WebSocket.

## Uso

```
/create-component PipelineStatus
/create-component FundProgressCard
/create-component ExecutionTimeline
```

## Proceso

### 1. Determinar ubicacion

| Tipo | Ubicacion |
|------|-----------|
| Comun/reutilizable | `src/components/common/` |
| Feature especifica | `src/components/features/{Feature}/` |
| Layout | `src/components/layout/` |

### 2. Crear estructura de archivos

```
ComponentName/
├── ComponentName.jsx       # Componente principal
├── ComponentName.styles.js # Estilos (opcional)
├── index.js               # Re-export
└── ComponentName.test.jsx # Tests (opcional)
```

### 3. Plantilla de componente con tiempo real

```jsx
import React, { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { Box, Card, Typography, CircularProgress, Alert } from '@mui/material';

/**
 * ComponentName - [Descripcion breve]
 *
 * @param {Object} props
 * @param {number} props.idEjecucion - ID de la ejecucion a monitorear
 * @param {Function} props.onUpdate - Callback cuando hay actualizacion
 */
const ComponentName = ({ idEjecucion, onUpdate }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Callback para procesar eventos WebSocket
  const handleWebSocketEvent = useCallback((event) => {
    if (event.type === 'FUND_UPDATE' && event.data.ID_Ejecucion === idEjecucion) {
      setData(prev => ({
        ...prev,
        ...event.data
      }));
      onUpdate?.(event.data);
    }
  }, [idEjecucion, onUpdate]);

  // Efecto para suscribirse a WebSocket
  useEffect(() => {
    // Suscripcion se maneja en el contexto padre
    // Este componente solo procesa los eventos
  }, [idEjecucion]);

  // Loading state
  if (loading) {
    return (
      <Box display="flex" justifyContent="center" p={3}>
        <CircularProgress />
      </Box>
    );
  }

  // Error state
  if (error) {
    return (
      <Alert severity="error">
        {error}
      </Alert>
    );
  }

  // Empty state
  if (!data) {
    return (
      <Typography color="textSecondary">
        No hay datos disponibles
      </Typography>
    );
  }

  // Render
  return (
    <Card
      sx={{
        transition: 'all 0.3s ease',
        // Estilos dinamicos basados en estado
      }}
    >
      {/* Contenido del componente */}
    </Card>
  );
};

ComponentName.propTypes = {
  idEjecucion: PropTypes.number.isRequired,
  onUpdate: PropTypes.func,
};

ComponentName.defaultProps = {
  onUpdate: null,
};

export default ComponentName;
```

### 4. Crear index.js

```jsx
export { default } from './ComponentName';
```

### 5. Estilos (si es necesario)

```jsx
// ComponentName.styles.js
import { styled } from '@mui/material/styles';
import { Card } from '@mui/material';

export const StyledCard = styled(Card)(({ theme, status }) => ({
  transition: 'all 0.3s ease',
  borderLeft: `4px solid ${
    status === 'ERROR' ? theme.palette.error.main :
    status === 'PROCESSING' ? theme.palette.primary.main :
    status === 'COMPLETED' ? theme.palette.success.main :
    'transparent'
  }`,
}));

export const AnimatedProgress = styled('div')({
  '@keyframes pulse': {
    '0%': { opacity: 1 },
    '50%': { opacity: 0.5 },
    '100%': { opacity: 1 },
  },
  animation: 'pulse 2s infinite',
});
```

## Tipos de Componentes

### Display (solo visualizacion)

```jsx
const StatusBadge = ({ status }) => (
  <Chip
    label={status}
    color={statusColorMap[status]}
    size="small"
  />
);
```

### Interactive (con acciones)

```jsx
const FundActionCard = ({ fund, onPause, onResume }) => (
  <Card>
    <CardContent>
      <Typography>{fund.name}</Typography>
    </CardContent>
    <CardActions>
      {fund.estado === 'RUNNING' && (
        <Button onClick={() => onPause(fund.id)}>Pausar</Button>
      )}
      {fund.estado === 'PAUSED' && (
        <Button onClick={() => onResume(fund.id)}>Reanudar</Button>
      )}
    </CardActions>
  </Card>
);
```

### Container (con logica)

```jsx
const PipelineContainer = ({ idEjecucion }) => {
  const { data, isConnected } = usePipelineState(idEjecucion);

  return (
    <Box>
      <ConnectionStatus connected={isConnected} />
      <FundsList fondos={data?.fondos || []} />
    </Box>
  );
};
```

## Patrones de Tiempo Real

### Optimistic Updates

```jsx
const handleAction = async () => {
  // 1. Update UI inmediatamente
  setOptimisticState(newValue);

  try {
    // 2. Llamar API
    await api.action();
    // 3. Real update viene via WebSocket
  } catch (error) {
    // 4. Rollback si falla
    setOptimisticState(previousValue);
    showError(error);
  }
};
```

### Animaciones de Transicion

```jsx
<Card
  sx={{
    transition: 'all 0.3s ease',
    transform: isUpdating ? 'scale(1.02)' : 'scale(1)',
  }}
>
```

### Estados de Carga

```jsx
{loading && <Skeleton variant="rectangular" height={100} />}
{!loading && data && <ActualContent data={data} />}
```

## Checklist

- [ ] PropTypes definidos
- [ ] Estados de loading/error/empty
- [ ] Callback para eventos WebSocket
- [ ] Transiciones CSS para cambios de estado
- [ ] Accesibilidad (aria-labels, roles)
- [ ] Responsive design
- [ ] Memoization donde aplique

## Skills Relacionados

- realtime-frontend
