# Create SP Event

Agrega emision de eventos Service Broker a un Stored Procedure existente.

## Uso

```
/create-sp-event staging.sp_Process_XXX
/create-sp-event staging.IPA_07_AgruparRegistros_v2
```

## Proceso

### 1. Obtener definicion actual del SP

```sql
EXEC sp_helptext 'staging.sp_Process_XXX';
```

### 2. Identificar puntos de emision

- **Inicio del SP**: Despues de declarar variables
- **Fin exitoso**: Antes de cada `RETURN 0` o `RETURN 1`
- **Error (CATCH)**: Dentro del bloque CATCH
- **Stand-by**: Cuando se retorna codigos 5-18

### 3. Agregar evento SP_INICIO

```sql
-- Agregar despues de las declaraciones de variables
DECLARE @StartTime DATETIME = GETDATE();

-- EVENTO: SP_INICIO
EXEC broker.sp_EmitirEvento
    @TipoEvento = 'SP_INICIO',
    @ID_Ejecucion = @ID_Ejecucion,
    @ID_Proceso = @ID_Proceso,
    @ID_Fund = @ID_Fund,
    @NombreSP = 'sp_Process_XXX';
```

### 4. Agregar evento SP_FIN (exito)

```sql
-- Agregar antes de cada RETURN 0 o RETURN 1
EXEC broker.sp_EmitirEvento
    @TipoEvento = 'SP_FIN',
    @ID_Ejecucion = @ID_Ejecucion,
    @ID_Proceso = @ID_Proceso,
    @ID_Fund = @ID_Fund,
    @NombreSP = 'sp_Process_XXX',
    @CodigoRetorno = 0,  -- o 1 para WARNING
    @DuracionMs = DATEDIFF(MILLISECOND, @StartTime, GETDATE()),
    @RowsProcessed = @RowsProcessed,
    @Detalles = @DetallesToJSON;  -- opcional

RETURN 0;
```

### 5. Agregar evento ERROR (en CATCH)

```sql
BEGIN CATCH
    DECLARE @ErrorJSON NVARCHAR(MAX) = (
        SELECT
            ERROR_NUMBER() AS SqlErrorNumber,
            ERROR_MESSAGE() AS SqlErrorMessage,
            ERROR_LINE() AS SqlErrorLine,
            ERROR_PROCEDURE() AS SqlErrorProcedure
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
    );

    EXEC broker.sp_EmitirEvento
        @TipoEvento = 'ERROR',
        @ID_Ejecucion = @ID_Ejecucion,
        @ID_Proceso = @ID_Proceso,
        @ID_Fund = @ID_Fund,
        @NombreSP = 'sp_Process_XXX',
        @CodigoRetorno = 3,
        @Detalles = @ErrorJSON,
        @DuracionMs = DATEDIFF(MILLISECOND, @StartTime, GETDATE());

    -- ... cleanup y manejo de error existente ...

    RETURN 3;
END CATCH
```

### 6. Agregar evento STANDBY (codigos 5-18)

```sql
-- Cuando se detecta necesidad de homologacion
IF @RequiereHomologacion = 1
BEGIN
    DECLARE @StandbyJSON NVARCHAR(MAX) = (
        SELECT Item, Source
        FROM sandbox.Homologacion_Instrumentos
        WHERE ID_Ejecucion = @ID_Ejecucion AND ID_Fund = @ID_Fund
        FOR JSON PATH
    );

    EXEC broker.sp_EmitirEvento
        @TipoEvento = 'STANDBY',
        @ID_Ejecucion = @ID_Ejecucion,
        @ID_Proceso = @ID_Proceso,
        @ID_Fund = @ID_Fund,
        @NombreSP = 'sp_Process_XXX',
        @CodigoRetorno = 6,  -- HOMOLOGACION_INSTRUMENTOS
        @Detalles = @StandbyJSON,
        @DuracionMs = DATEDIFF(MILLISECOND, @StartTime, GETDATE());

    RETURN 6;
END
```

### 7. Generar script de migracion

Crear archivo `XXX_v1.X_agregar_eventos_sp_Process_XXX.sql` con el SP modificado.

## Checklist

- [ ] Variable @StartTime agregada al inicio
- [ ] Evento SP_INICIO despues de declaraciones
- [ ] Evento SP_FIN antes de cada RETURN 0/1
- [ ] Evento ERROR en CATCH
- [ ] Evento STANDBY para codigos 5-18
- [ ] JSON de detalles bien formateado
- [ ] DuracionMs calculado correctamente
- [ ] RowsProcessed incluido si aplica
- [ ] Script de migracion generado

## Skills Relacionados

- db-pipeline
- service-broker
