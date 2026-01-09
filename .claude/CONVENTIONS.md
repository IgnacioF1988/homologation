# Convenciones de Codigo

Estandares y buenas practicas para el proyecto homologation.

## SQL Server

### Nomenclatura

| Elemento | Convencion | Ejemplo |
|----------|------------|---------|
| Schemas | minusculas | `staging`, `extract`, `broker`, `pipeline` |
| Tablas | PascalCase | `ActiveConversations`, `EventLog` |
| SPs | sp_PascalCase | `sp_Process_IPA`, `sp_EmitirEvento` |
| Vistas | vw_PascalCase | `vw_ServiceBrokerStatus` |
| Indices | IX_Tabla_Columnas | `IX_EventLog_Timestamp` |
| PKs | PK_Tabla | `PK_ActiveConversations` |
| FKs | FK_TablaHija_TablaPadre | `FK_EventLog_Ejecucion` |

### Stored Procedures

```sql
CREATE OR ALTER PROCEDURE schema.sp_NombreDescriptivo
    @Param1 TIPO,
    @Param2 TIPO = NULL  -- Valor default para opcionales
AS
BEGIN
    SET NOCOUNT ON;

    -- Variables al inicio
    DECLARE @StartTime DATETIME = GETDATE();
    DECLARE @RowsAffected INT = 0;

    BEGIN TRY
        -- Logica principal

    END TRY
    BEGIN CATCH
        -- Manejo de error estandarizado
        DECLARE @ErrorJSON NVARCHAR(MAX) = (
            SELECT
                ERROR_NUMBER() AS SqlErrorNumber,
                ERROR_MESSAGE() AS SqlErrorMessage,
                ERROR_LINE() AS SqlErrorLine
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        );

        -- Log error si aplica

        THROW;
    END CATCH
END;
```

### Codigos de Retorno del Pipeline

| Codigo | Constante | Significado |
|--------|-----------|-------------|
| 0 | OK | Exito |
| 1 | WARNING | Exito con advertencias |
| 2 | RETRY | Reintentar |
| 3 | ERROR | Error |
| 5-18 | STANDBY | Requiere intervencion |

### Comentarios en SQL

```sql
-- ============================================================================
-- SECCION: Descripcion de la seccion
-- ============================================================================

-- Comentario simple para una linea

/*
Comentario multilinea para explicaciones
mas extensas o documentacion de logica compleja
*/
```

### Migraciones

- Formato: `{numero}_v{version}_{descripcion}.sql`
- Siempre idempotentes (IF NOT EXISTS)
- Incluir instrucciones de rollback
- Usar transacciones donde sea posible

```sql
/*
================================================================================
Migracion: 001_v1.0_descripcion.sql
Fecha: YYYY-MM-DD
Autor: nombre

Descripcion:
[descripcion detallada]

Rollback:
[instrucciones]
================================================================================
*/
```

## JavaScript/Node.js

### Nomenclatura

| Elemento | Convencion | Ejemplo |
|----------|------------|---------|
| Variables | camelCase | `idEjecucion`, `fondosActivos` |
| Constantes | UPPER_SNAKE | `MAX_RETRIES`, `WS_TIMEOUT` |
| Funciones | camelCase | `processMessage()`, `emitEvent()` |
| Clases | PascalCase | `ServiceBrokerListener`, `WebSocketManager` |
| Archivos | kebab-case o camelCase | `pipeline.routes.js`, `WebSocketManager.js` |

### Estructura de Archivo

```javascript
// 1. Imports (ordenados: externos, internos, relativos)
const express = require('express');
const { Pool } = require('mssql');
const config = require('../config/database');

// 2. Constantes
const MAX_RETRIES = 3;
const TIMEOUT_MS = 5000;

// 3. Clase/Funciones principales
class MiClase {
  constructor(options) {
    this.options = options;
  }

  async metodoPublico() {
    // ...
  }

  _metodoPrivado() {
    // ...
  }
}

// 4. Exports
module.exports = MiClase;
```

### Async/Await

```javascript
// Preferir async/await sobre callbacks y .then()
async function procesarDatos(id) {
  try {
    const datos = await obtenerDatos(id);
    const resultado = await procesarConDatos(datos);
    return resultado;
  } catch (error) {
    logger.error('Error procesando datos:', { id, error: error.message });
    throw error;
  }
}
```

### Manejo de Errores

```javascript
// Errores custom para el dominio
class PipelineError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'PipelineError';
    this.code = code;
    this.details = details;
  }
}

// Uso
throw new PipelineError(
  'Fondo no encontrado',
  'FUND_NOT_FOUND',
  { idFund: 123 }
);
```

### Logging

```javascript
// Usar logger estructurado
const logger = require('./logger');

logger.info('Mensaje informativo', { contexto: 'valor' });
logger.warn('Advertencia', { detalle: 'algo' });
logger.error('Error', { error: err.message, stack: err.stack });

// NO usar console.log en produccion
```

## React

### Nomenclatura

| Elemento | Convencion | Ejemplo |
|----------|------------|---------|
| Componentes | PascalCase | `FundCard`, `PipelineContainer` |
| Hooks | useCamelCase | `usePipelineState`, `useWebSocket` |
| Handlers | handleNombre | `handleClick`, `handleSubmit` |
| Props | camelCase | `idEjecucion`, `onUpdate` |

### Estructura de Componente

```jsx
import React, { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { Box } from '@mui/material';

/**
 * NombreComponente - Descripcion breve
 */
const NombreComponente = ({ prop1, prop2, onAction }) => {
  // 1. Hooks de estado
  const [loading, setLoading] = useState(false);

  // 2. Hooks custom
  const { data } = useCustomHook();

  // 3. Callbacks memorizados
  const handleAction = useCallback(() => {
    onAction?.(data);
  }, [onAction, data]);

  // 4. Effects
  useEffect(() => {
    // ...
  }, [dependency]);

  // 5. Early returns (loading, error, empty states)
  if (loading) return <Loading />;

  // 6. Render principal
  return (
    <Box>
      {/* contenido */}
    </Box>
  );
};

NombreComponente.propTypes = {
  prop1: PropTypes.string.isRequired,
  prop2: PropTypes.number,
  onAction: PropTypes.func,
};

NombreComponente.defaultProps = {
  prop2: 0,
  onAction: null,
};

export default NombreComponente;
```

### Hooks Custom

```jsx
// Nombrar con prefijo "use"
// Retornar objeto con valores nombrados
export const usePipelineState = (idEjecucion) => {
  const [state, setState] = useState(initialState);
  const [isConnected, setIsConnected] = useState(false);

  // ... logica

  return {
    state,
    isConnected,
    actions: {
      reset: () => setState(initialState),
      update: (data) => setState(prev => ({ ...prev, ...data }))
    }
  };
};
```

### Estilos con MUI

```jsx
// Preferir sx prop para estilos inline simples
<Box sx={{ p: 2, mb: 1 }}>

// Usar styled para componentes reutilizables con estilos complejos
const StyledCard = styled(Card)(({ theme, status }) => ({
  borderLeft: `4px solid ${theme.palette[status].main}`,
  transition: 'all 0.3s ease',
}));
```

## Git

### Commits

```
tipo(scope): descripcion breve

[cuerpo opcional]

[footer opcional]
```

Tipos:
- `feat`: Nueva funcionalidad
- `fix`: Correccion de bug
- `docs`: Documentacion
- `refactor`: Refactorizacion
- `test`: Tests
- `chore`: Tareas de mantenimiento

```
feat(pipeline): agregar emision de eventos Service Broker

- Crear sp_EmitirEvento
- Modificar sp_Process_IPA para emitir eventos
- Agregar tablas de tracking

Closes #123
```

### Branches

- `master` / `main`: Produccion
- `develop`: Desarrollo
- `feature/nombre`: Nueva funcionalidad
- `fix/nombre`: Correccion
- `refactor/nombre`: Refactorizacion

## Archivos de Configuracion

### .env (ejemplo)

```env
# Database
DB_SERVER=localhost
DB_NAME=INTELIGENCIA_PRODUCTO_FULLSTACK
DB_USER=usuario
DB_PASSWORD=secreto

# Server
PORT=3001
NODE_ENV=development

# WebSocket
WS_PATH=/api/ws/pipeline
```

### Estructura de Carpetas Backend

```
server/
├── config/           # Configuraciones
├── routes/           # Rutas Express
├── services/         # Logica de negocio
│   ├── broker/       # Service Broker
│   └── websocket/    # WebSocket
├── middleware/       # Middlewares
├── utils/            # Utilidades
└── index.js          # Entry point
```

### Estructura de Carpetas Frontend

```
src/
├── components/       # Componentes React
│   ├── common/       # Reutilizables
│   ├── features/     # Por feature
│   └── layout/       # Layout
├── hooks/            # Custom hooks
├── contexts/         # React contexts
├── services/         # APIs
├── utils/            # Utilidades
└── App.jsx           # Entry point
```

## Testing

### SQL

```sql
-- Tests en carpeta TEST/
-- Nombrar: XX_Test_Descripcion.sql
-- Usar transacciones para rollback

BEGIN TRANSACTION;
-- Setup
-- Test
-- Assert
-- Cleanup
ROLLBACK;
```

### JavaScript

```javascript
// Usar Jest
describe('ServiceBrokerListener', () => {
  beforeEach(() => {
    // Setup
  });

  afterEach(() => {
    // Cleanup
  });

  it('should connect successfully', async () => {
    // Arrange
    // Act
    // Assert
  });
});
```

### React

```jsx
// Usar React Testing Library
import { render, screen, fireEvent } from '@testing-library/react';

describe('FundCard', () => {
  it('should display fund name', () => {
    render(<FundCard fund={{ NombreFondo: 'Test Fund' }} />);
    expect(screen.getByText('Test Fund')).toBeInTheDocument();
  });
});
```

## Documentacion

### SQL

```sql
/*
================================================================================
Nombre: sp_Nombre
Autor: nombre
Fecha: YYYY-MM-DD
Descripcion: Descripcion detallada del proposito

Parametros:
  @Param1 - Descripcion del parametro
  @Param2 - Descripcion del parametro (opcional, default: X)

Retorna:
  0 = Exito
  3 = Error

Ejemplo:
  EXEC schema.sp_Nombre @Param1 = 'valor';

Historial:
  YYYY-MM-DD - Autor - Cambio realizado
================================================================================
*/
```

### JavaScript

```javascript
/**
 * Descripcion breve de la funcion
 *
 * @param {number} idEjecucion - ID de la ejecucion
 * @param {Object} options - Opciones adicionales
 * @param {boolean} [options.verbose=false] - Mostrar logs detallados
 * @returns {Promise<Object>} Resultado de la operacion
 * @throws {PipelineError} Si la ejecucion no existe
 *
 * @example
 * const result = await procesarEjecucion(123, { verbose: true });
 */
async function procesarEjecucion(idEjecucion, options = {}) {
  // ...
}
```
