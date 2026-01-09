# Analyze Pipeline

Analiza el estado actual del pipeline en la base de datos.

## Uso

```
/analyze-pipeline
/analyze-pipeline --id 12345
/analyze-pipeline --fecha 2026-01-08
```

## Proceso

### 1. Obtener ejecuciones activas

```sql
-- Ejecuciones en curso
SELECT
    ID_Ejecucion,
    FechaReporte,
    Estado,
    FechaInicio,
    DATEDIFF(MINUTE, FechaInicio, GETDATE()) AS Duracion_Min,
    TotalFondos,
    FondosCompletados,
    FondosError,
    FondosStandBy
FROM logs.Ejecuciones
WHERE Estado = 'EN_PROGRESO'
   OR ID_Ejecucion = @ID_Ejecucion;
```

### 2. Analizar fondos por estado

```sql
SELECT
    Estado,
    COUNT(*) AS Cantidad,
    AVG(DATEDIFF(SECOND, FechaInicio, ISNULL(FechaFin, GETDATE()))) AS Promedio_Seg
FROM logs.Ejecucion_Fondos
WHERE ID_Ejecucion = @ID_Ejecucion
GROUP BY Estado;
```

### 3. Identificar fondos con problemas

```sql
-- Fondos en error
SELECT
    ID_Fund,
    FundShortName,
    Estado,
    Paso_Con_Error,
    Mensaje_Error,
    Duracion_Ms
FROM logs.Ejecucion_Fondos
WHERE ID_Ejecucion = @ID_Ejecucion
  AND Estado IN ('ERROR', 'STANDBY')
ORDER BY Estado, ID_Fund;
```

### 4. Ver homologaciones pendientes

```sql
-- Instrumentos
SELECT COUNT(*) AS Pendientes, 'Instrumentos' AS Tipo
FROM sandbox.Homologacion_Instrumentos WHERE ID_Ejecucion = @ID_Ejecucion
UNION ALL
SELECT COUNT(*), 'Fondos'
FROM sandbox.Homologacion_Fondos WHERE ID_Ejecucion = @ID_Ejecucion
UNION ALL
SELECT COUNT(*), 'Monedas'
FROM sandbox.Homologacion_Monedas WHERE ID_Ejecucion = @ID_Ejecucion;
```

### 5. Verificar Service Broker

```sql
SELECT * FROM broker.vw_ServiceBrokerStatus;
```

## Output Esperado

```markdown
## Pipeline Status Report

### Ejecucion Activa
- ID: 12345
- Fecha: 2026-01-08
- Estado: EN_PROGRESO
- Inicio: 10:30:00
- Duracion: 15 min

### Fondos por Estado
| Estado | Cantidad | Promedio |
|--------|----------|----------|
| COMPLETADO | 145 | 2.3 min |
| EN_PROGRESO | 3 | 4.1 min |
| ERROR | 2 | N/A |
| STANDBY | 1 | N/A |

### Fondos con Problemas
| Fund | Estado | Paso | Error |
|------|--------|------|-------|
| MLCCII | ERROR | sp_Process_CAPM | Deadlock |
| MDLAT | STANDBY | sp_ValidateFund | Homologacion |

### Homologaciones Pendientes
| Tipo | Cantidad |
|------|----------|
| Instrumentos | 5 |
| Fondos | 0 |
| Monedas | 1 |

### Service Broker
- Conversaciones activas: 150
- Mensajes en cola: 3
- Errores ultima hora: 0
- Estado: OK
```

## Skills Relacionados

- db-pipeline
- service-broker
