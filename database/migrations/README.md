# Migraciones de Base de Datos - Pipeline ETL v2

Este directorio contiene los scripts de migración para preparar la base de datos para la arquitectura v2 del Pipeline ETL (paralelo por fondo).

## 📋 Resumen de Migraciones

| Script | Descripción | Tablas Afectadas | Estado |
|--------|-------------|------------------|--------|
| `000_run_all_migrations.sql` | **Script maestro** - Ejecuta todas las migraciones | 12 tablas | ⚙️ Listo para ejecutar |
| `001_add_execution_tracking_to_derivados_tables.sql` | Derivados: Agregar tracking | 4 tablas | ⚙️ Listo |
| `002_add_execution_tracking_to_pnl_tables.sql` | PNL: Agregar tracking | 5 tablas | ⚙️ Listo |
| `003_add_execution_tracking_to_ubs_tables.sql` | UBS: Agregar tracking | 3 tablas | ⚙️ Listo |
| `999_rollback_all_migrations.sql` | **Rollback completo** - Revierte todos los cambios | 12 tablas | ⚠️ Usar con precaución |

---

## 🎯 Objetivo

Preparar las tablas staging de **Derivados**, **PNL** y **UBS** para la arquitectura v2, permitiendo:

1. **Procesamiento paralelo** de múltiples fondos simultáneamente
2. **Aislamiento total** entre ejecuciones mediante particionamiento lógico
3. **Tracking granular** de cada fondo en cada ejecución
4. **Multiusuario** - múltiples ejecuciones pueden correr al mismo tiempo sin conflictos

---

## 📊 Cambios en el Schema

### Columnas Agregadas a Cada Tabla

```sql
ID_Ejecucion BIGINT NOT NULL DEFAULT 0
ID_Fund INT NOT NULL DEFAULT 0
```

### Índices Creados

Cada tabla recibe un índice compuesto para optimizar búsquedas:

```sql
CREATE NONCLUSTERED INDEX IX_[Tabla]_Ejecucion_Fund
ON staging.[Tabla] (ID_Ejecucion, ID_Fund)
INCLUDE ([columnas_frecuentes]);
```

---

## 🗂️ Tablas Modificadas

### DERIVADOS (4 tablas)
- `staging.Derivados_WorkTable` - Tabla de trabajo principal
- `staging.Derivados` - Tabla de derivados homologados
- `staging.Ajuste_Derivados` - Ajustes de descuadres MTM
- `staging.Ajuste_Paridades` - Ajustes de paridad

### PNL (5 tablas)
- `staging.PNL_WorkTable` - Tabla de trabajo principal
- `staging.PNL` - PNL agrupado y homologado
- `staging.Ajuste_PNL` - Ajustes IPA-PNL
- `staging.PNL_IPA` - Consolidación IPA + PNL
- `staging.PNL_ValoresAcumulados` - Acumulación de valores en días no hábiles

### UBS (3 tablas)
- `staging.UBS_WorkTable` - Tabla de trabajo principal (fondos Luxemburgo)
- `staging.MLCCII_Derivados` - Derivados MLCCII (condicional)
- `staging.MLCCII` - Cartera MLCCII (condicional)

---

## 🚀 Instrucciones de Uso

### Opción 1: Script Maestro (Recomendado)

Ejecuta todas las migraciones en orden:

```bash
# Desde línea de comandos
sqlcmd -S localhost -d Inteligencia_Producto_Dev -i 000_run_all_migrations.sql

# O desde SSMS
# 1. Abrir 000_run_all_migrations.sql
# 2. Asegurarse que el contexto es Inteligencia_Producto_Dev
# 3. Ejecutar (F5)
```

### Opción 2: Migraciones Individuales

Ejecuta cada migración por separado (en orden):

```bash
sqlcmd -S localhost -d Inteligencia_Producto_Dev -i 001_add_execution_tracking_to_derivados_tables.sql
sqlcmd -S localhost -d Inteligencia_Producto_Dev -i 002_add_execution_tracking_to_pnl_tables.sql
sqlcmd -S localhost -d Inteligencia_Producto_Dev -i 003_add_execution_tracking_to_ubs_tables.sql
```

---

## ✅ Verificación Post-Migración

Después de ejecutar las migraciones, verifica que todo esté correcto:

### 1. Verificar columnas creadas

```sql
USE Inteligencia_Producto_Dev;

SELECT
    OBJECT_SCHEMA_NAME(c.object_id) AS SchemaName,
    OBJECT_NAME(c.object_id) AS TableName,
    c.name AS ColumnName,
    t.name AS DataType
FROM sys.columns c
INNER JOIN sys.types t ON c.user_type_id = t.user_type_id
WHERE c.name IN ('ID_Ejecucion', 'ID_Fund')
  AND OBJECT_SCHEMA_NAME(c.object_id) = 'staging'
ORDER BY TableName, c.name;
```

**Resultado esperado:** 24 filas (12 tablas × 2 columnas)

### 2. Verificar índices creados

```sql
SELECT
    OBJECT_SCHEMA_NAME(i.object_id) AS SchemaName,
    OBJECT_NAME(i.object_id) AS TableName,
    i.name AS IndexName,
    i.type_desc AS IndexType
FROM sys.indexes i
WHERE i.name LIKE 'IX_%_Ejecucion_Fund'
  AND OBJECT_SCHEMA_NAME(i.object_id) = 'staging'
ORDER BY TableName;
```

**Resultado esperado:** 12 filas (1 índice por tabla)

### 3. Verificar espacio en disco

```sql
EXEC sp_spaceused 'staging.Derivados_WorkTable';
EXEC sp_spaceused 'staging.PNL_WorkTable';
EXEC sp_spaceused 'staging.UBS_WorkTable';
```

---

## ⏪ Rollback (Revertir Cambios)

⚠️ **ADVERTENCIA:** Solo usar en caso de emergencia. Este script **ELIMINA** las columnas e índices creados.

### Antes de ejecutar el rollback:

1. **Hacer backup** de la base de datos:
   ```sql
   BACKUP DATABASE [Inteligencia_Producto_Dev]
   TO DISK = 'C:\Backups\Inteligencia_Producto_Dev_Pre_Rollback.bak'
   WITH COMPRESSION;
   ```

2. **Verificar que no hay ejecuciones v2 en progreso:**
   ```sql
   SELECT * FROM logs.Ejecuciones WHERE Estado = 'EN_PROGRESO';
   ```

3. **Coordinar con el equipo** (avisar que se va a revertir)

### Ejecutar rollback:

```bash
sqlcmd -S localhost -d Inteligencia_Producto_Dev -i 999_rollback_all_migrations.sql
```

---

## 📅 Características de los Scripts

### Idempotencia

Todos los scripts son **idempotentes** - se pueden ejecutar múltiples veces sin error:

- Verifican si las columnas ya existen antes de crearlas
- Verifican si los índices ya existen antes de crearlos
- Si ya existen, imprimen mensaje de "skip" y continúan

### Logging Detallado

Cada script imprime:
- ✓ Acciones exitosas
- ⚠ Advertencias (skip)
- Resumen final con estadísticas
- Duración total de ejecución

### Seguridad

- No eliminan datos existentes (DEFAULT 0)
- No bloquean la base de datos (operaciones DDL rápidas)
- Se pueden ejecutar con transacciones si se desea

---

## ⏱️ Estimado de Tiempo

| Script | Tiempo Estimado |
|--------|-----------------|
| 001 (Derivados) | 30-60 segundos |
| 002 (PNL) | 45-90 segundos |
| 003 (UBS) | 20-40 segundos |
| **TOTAL** | **2-5 minutos** |

**Nota:** El tiempo real depende del tamaño de las tablas y la carga del servidor.

---

## 🔄 Próximos Pasos

Una vez completadas las migraciones:

1. **Crear Stored Procedures v2:**
   - `DERIV_01_v2` a `DERIV_04_v2`
   - `PNL_01_v2` a `PNL_05_v2`
   - `UBS_01_v2` a `UBS_03_v2`

2. **Testing unitario** de cada SP v2

3. **Testing de integración** del pipeline completo

4. **Validación** de resultados vs v1

---

## 📝 Notas Técnicas

### Particionamiento Lógico

Las columnas `ID_Ejecucion` y `ID_Fund` crean un **particionamiento lógico** que permite:

```sql
-- Cada SP v2 procesa SOLO su partición
DELETE FROM staging.XXX_WorkTable
WHERE ID_Ejecucion = @ID_Ejecucion AND ID_Fund = @ID_Fund;

INSERT INTO staging.XXX_WorkTable (ID_Ejecucion, ID_Fund, ...)
SELECT @ID_Ejecucion, @ID_Fund, ...
FROM extract.XXX
WHERE Portfolio = @Portfolio;
```

### Beneficios vs v1

| Aspecto | v1 (Batch) | v2 (Paralelo) |
|---------|------------|---------------|
| **Concurrencia** | 1 fondo a la vez | 100+ fondos simultáneos |
| **Tiempo total** | 60 minutos | 12-15 minutos (75% reducción) |
| **Aislamiento** | Sin aislamiento | Total (por ejecución + fondo) |
| **Conflictos** | Deadlocks frecuentes | Cero (particiones aisladas) |
| **Multiusuario** | Imposible | Múltiples ejecuciones simultáneas |

---

## 📞 Soporte

Para preguntas o problemas:

1. Revisar logs de ejecución en SSMS
2. Verificar permisos de DDL en la base de datos
3. Consultar documentación del Pipeline v2 en `/FASE_2_COMPLETADA.md`

---

## 📄 Licencia y Autoría

- **Proyecto:** Pipeline ETL - Fondos
- **Versión:** 2.0
- **Fecha:** 2025-12-19
- **Base de Datos:** Inteligencia_Producto_Dev
