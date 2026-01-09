# DB Pipeline Skill

## Proposito

Guiar el desarrollo, debugging y mantenimiento del pipeline DB-centric de procesamiento de fondos.

## Arquitectura del Pipeline

### Fases de Ejecucion

```
FASE 0   → EXTRACCION     (Batch - todos los fondos)
FASE 0.5 → VALIDACION     (Batch)
FASE 1   → PROCESS_IPA    (Paralelo por fondo)
FASE 2   → PROCESS_CAPM   (Paralelo por fondo)
FASE 3   → PROCESS_DERIV  (Paralelo por fondo)
FASE 4   → PROCESS_PNL    (Paralelo por fondo)
FASE 5   → PROCESS_UBS    (Paralelo por fondo)
FASE 6   → CONCATENAR     (Secuencial - final)
```

### Stored Procedures Principales

| SP | Fase | Descripcion |
|----|------|-------------|
| `staging.sp_ValidateFund` | 0.5 | Punto de entrada, valida extracts |
| `staging.sp_Process_IPA` | 1 | Homologa, separa Cash/MTM |
| `staging.sp_Process_CAPM` | 2 | Valida vs IPA Cash |
| `staging.sp_Process_Derivados` | 3 | Posiciones larga/corta |
| `staging.sp_Process_PNL` | 4 | Rentabilidad |
| `staging.sp_Consolidar_Cubo` | 6 | Resultado final |

## Codigos de Retorno

| Codigo | Tipo | Accion |
|--------|------|--------|
| 0 | OK | Continuar |
| 1 | WARNING | Continuar, loguear |
| 2 | RETRY | Reintentar (max 3x) |
| 3 | ERROR_CRITICO | Detener fondo |
| 5 | SUCIEDADES | Pausar, revisar Qty ≈ 0 |
| 6 | HOMOLOG_INSTR | Pausar, agregar mapeo instrumentos |
| 10 | HOMOLOG_FONDO | Pausar, agregar mapeo fondo |
| 11 | HOMOLOG_MONEDA | Pausar, agregar mapeo moneda |
| 13-18 | EXTRACT_FALTANTE | Pausar, verificar fuente |

## Patron de SP con Eventos

```sql
CREATE OR ALTER PROCEDURE [staging].[sp_Process_XXX]
    @ID_Ejecucion BIGINT,
    @ID_Proceso BIGINT,
    @ID_Fund INT,
    @FechaReporte NVARCHAR(10)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @StartTime DATETIME = GETDATE();
    DECLARE @ReturnCode INT = 0;
    DECLARE @RowsProcessed INT = 0;

    -- ═══════════════════════════════════════════════════════════
    -- EVENTO: SP_INICIO
    -- ═══════════════════════════════════════════════════════════
    EXEC broker.sp_EmitirEvento
        @TipoEvento = 'SP_INICIO',
        @ID_Ejecucion = @ID_Ejecucion,
        @ID_Proceso = @ID_Proceso,
        @ID_Fund = @ID_Fund,
        @NombreSP = 'sp_Process_XXX';

    BEGIN TRY
        -- ═══════════════════════════════════════════════════════
        -- LOGICA DEL SP
        -- ═══════════════════════════════════════════════════════

        -- ... procesamiento ...

        SET @RowsProcessed = @@ROWCOUNT;

        -- ═══════════════════════════════════════════════════════
        -- EVENTO: SP_FIN (exito)
        -- ═══════════════════════════════════════════════════════
        EXEC broker.sp_EmitirEvento
            @TipoEvento = 'SP_FIN',
            @ID_Ejecucion = @ID_Ejecucion,
            @ID_Proceso = @ID_Proceso,
            @ID_Fund = @ID_Fund,
            @NombreSP = 'sp_Process_XXX',
            @CodigoRetorno = 0,
            @DuracionMs = DATEDIFF(MILLISECOND, @StartTime, GETDATE()),
            @RowsProcessed = @RowsProcessed;

        RETURN 0;

    END TRY
    BEGIN CATCH
        -- ═══════════════════════════════════════════════════════
        -- EVENTO: ERROR
        -- ═══════════════════════════════════════════════════════
        DECLARE @ErrorJSON NVARCHAR(MAX) = (
            SELECT
                ERROR_NUMBER() AS SqlErrorNumber,
                ERROR_MESSAGE() AS SqlErrorMessage,
                ERROR_LINE() AS SqlErrorLine
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

        -- Cleanup temp tables si es necesario
        -- ...

        RETURN 3;
    END CATCH
END;
```

## Concurrencia

### Tablas Temporales con Suffix
```sql
-- Patron de nombre para evitar colisiones
DECLARE @TempTableName NVARCHAR(100) = CONCAT(
    '##IPA_Work_',
    @ID_Ejecucion, '_',
    @ID_Proceso, '_',
    @ID_Fund
);
```

### Cleanup de Temp Tables
```sql
-- En caso de error, limpiar temp tables
IF OBJECT_ID('tempdb..' + @TempTableName) IS NOT NULL
    EXEC('DROP TABLE ' + @TempTableName);
```

## Debugging

### Ver estado de ejecucion
```sql
SELECT * FROM logs.Ejecuciones WHERE ID_Ejecucion = @ID;
SELECT * FROM logs.Ejecucion_Fondos WHERE ID_Ejecucion = @ID;
```

### Ver validaciones
```sql
SELECT * FROM logs.Validaciones_Ejecucion
WHERE ID_Ejecucion = @ID
ORDER BY ID_Fund, FechaProceso;
```

### Ver homologaciones pendientes
```sql
SELECT * FROM sandbox.Homologacion_Instrumentos WHERE ID_Ejecucion = @ID;
SELECT * FROM sandbox.Homologacion_Fondos WHERE ID_Ejecucion = @ID;
SELECT * FROM sandbox.Homologacion_Monedas WHERE ID_Ejecucion = @ID;
```

### Ver alertas
```sql
SELECT * FROM sandbox.Alertas_Descuadre_Cash;
SELECT * FROM sandbox.Alertas_Suciedades_IPA;
```

## Checklist de SP

- [ ] SET NOCOUNT ON al inicio
- [ ] SET XACT_ABORT ON para transacciones
- [ ] Variables de tracking (@StartTime)
- [ ] Evento SP_INICIO al inicio
- [ ] Evento SP_FIN al terminar exitosamente
- [ ] Evento ERROR en CATCH
- [ ] Evento STANDBY para codigos 5-18
- [ ] Return codes consistentes
- [ ] Cleanup de temp tables en error
- [ ] Logging a logs.* tables
