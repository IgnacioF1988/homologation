# Create Migration

Crea migraciones SQL numeradas para el pipeline DB-centric.

## Uso

```
/create-migration "Agregar evento SP_INICIO a sp_Process_CAPM"
/create-migration "Crear indice para concurrencia en extract.IPA"
```

## Proceso

### 1. Identificar ultimo numero de migracion

```bash
ls server/database/Refactor/*/[0-9]*.sql | sort -t_ -k1 -n | tail -1
```

### 2. Generar siguiente numero

- Formato: `{numero}_v{version}_{descripcion}.sql`
- Padding: 3 digitos (001, 002, ...)
- Descripcion: snake_case, sin caracteres especiales

### 3. Seleccionar carpeta

| Tipo de Cambio | Carpeta |
|----------------|---------|
| Service Broker | `BROKER/` |
| SPs principales | `CORE/` |
| SPs del pipeline | `PIPELINE/` |
| Tablas de extract | `EXTRACT/` |
| Tablas dimensionales | `DIMENSIONALES/` |

### 4. Crear archivo con plantilla

```sql
/*
================================================================================
Migracion: {numero}_v{version}_{descripcion}.sql
Fecha: {fecha}
Autor: {autor}

Descripcion:
{descripcion_larga}

Dependencias:
- {dependencia_1}
- {dependencia_2}

Rollback:
{instrucciones_rollback}
================================================================================
*/

USE INTELIGENCIA_PRODUCTO_FULLSTACK;
GO

PRINT '========================================';
PRINT 'Ejecutando: {descripcion}';
PRINT '========================================';

BEGIN TRY
    BEGIN TRANSACTION;

    -- ========================================================================
    -- CAMBIOS
    -- ========================================================================

    -- ... SQL aqui ...

    COMMIT TRANSACTION;
    PRINT 'Migracion completada exitosamente';
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;

    PRINT 'ERROR: ' + ERROR_MESSAGE();
    THROW;
END CATCH
GO
```

## Tipos de Migracion

### ADD - Agregar nuevo objeto

```sql
-- Crear tabla
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'NuevaTabla')
BEGIN
    CREATE TABLE schema.NuevaTabla (...);
END

-- Crear SP
CREATE OR ALTER PROCEDURE schema.sp_Nuevo ...

-- Crear indice
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Nuevo')
BEGIN
    CREATE INDEX IX_Nuevo ON tabla(columna);
END
```

### MODIFY - Modificar objeto existente

```sql
-- Modificar SP (siempre usar CREATE OR ALTER)
CREATE OR ALTER PROCEDURE schema.sp_Existente
    -- nueva definicion
...

-- Agregar columna
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE name = 'NuevaColumna' AND object_id = OBJECT_ID('tabla'))
BEGIN
    ALTER TABLE tabla ADD NuevaColumna TIPO;
END
```

### FIX - Corregir bug

```sql
-- Descripcion del bug y solucion
-- Bug: [descripcion]
-- Solucion: [descripcion]

CREATE OR ALTER PROCEDURE schema.sp_Corregido
    -- version corregida
...
```

### REFACTOR - Reestructurar

```sql
-- Motivo del refactor
-- Antes: [descripcion]
-- Ahora: [descripcion]

-- Paso 1: Crear nuevo
CREATE OR ALTER PROCEDURE schema.sp_Nuevo ...

-- Paso 2: Marcar viejo como deprecado (no eliminar inmediatamente)
-- El SP viejo se eliminara en migracion posterior
```

## Consideraciones

### Idempotencia

Siempre verificar existencia antes de crear:
```sql
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'X')
    CREATE TABLE X ...
```

### Performance

Para indices grandes:
```sql
CREATE INDEX IX_Nombre ON tabla(col)
    WITH (ONLINE = ON, FILLFACTOR = 80);
```

### Transacciones

- Usar transacciones para cambios que deben ser atomicos
- Para DDL que no soporta transacciones, usar TRY/CATCH

### Documentar Rollback

Siempre incluir instrucciones de rollback:
```sql
-- Rollback:
-- DROP INDEX IX_Nombre ON tabla;
-- o
-- EXEC sp_rename 'tabla.NuevaColumna', 'ViejaColumna', 'COLUMN';
```

## Skills Relacionados

- db-pipeline
