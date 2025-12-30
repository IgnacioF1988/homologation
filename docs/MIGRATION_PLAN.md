# PLAN DE MIGRACION - Tablas Temporales y Eliminacion de Schema Staging

**Fecha:** 2025-12-29
**Version:** 4.0

---

## RESUMEN DE FASES

| Fase | Estado | Descripcion |
|------|--------|-------------|
| FASE 1 | COMPLETADA | Migrar WorkTables a tablas temporales ## |
| FASE 2 | COMPLETADA | Eliminar tablas staging.*, mover a process.* |

---

# FASE 1: MIGRACION DE WORKTABLES - COMPLETADA

## Estado: COMPLETADO

Todos los pipelines principales migrados a tablas temporales globales (##).

### Migraciones Ejecutadas

| Migration | Fecha | Descripcion |
|-----------|-------|-------------|
| 006 | 2025-12-28 | Migrar IPA a tablas temporales |
| 007 | 2025-12-28 | Migrar CAPM, PNL, Derivados, UBS |
| 008 | 2025-12-29 | Cleanup WorkTables y backups obsoletos |

### Pipelines Migrados

- [x] IPA (IPA_01 a IPA_07) -> ##IPA_Work, ##IPA_Cash, ##IPA_Final
- [x] CAPM (CAPM_01 a CAPM_03) -> ##CAPM_Work
- [x] PNL (PNL_01 a PNL_05) -> ##PNL_Work (incluye fix COLLATE)
- [x] Derivados (DERIV_01 a DERIV_04) -> ##Derivados_Work
- [x] UBS (UBS_01 a UBS_03) -> ##UBS_Work

### Fix Aplicado: Collation

```sql
-- PNL_01_Dimensiones_v2: Agregado COLLATE DATABASE_DEFAULT
-- Para compatibilidad entre tempdb (CS) y base principal (CI)
CREATE TABLE ##PNL_Work_... (
    Portfolio NVARCHAR(50) COLLATE DATABASE_DEFAULT,
    Symb NVARCHAR(100) COLLATE DATABASE_DEFAULT,
    ...
)
```

---

# FASE 2: ELIMINAR TABLAS STAGING - COMPLETADA

## Estado: COMPLETADO (2025-12-29)

Todas las tablas staging intermedias migradas a temporales (##) y tablas finales redirigidas a process.*.

### Migraciones Ejecutadas

| Migration | Fecha | Descripcion |
|-----------|-------|-------------|
| 009 | 2025-12-29 | Crear tablas destino en process.* |
| 010 | 2025-12-29 | Crear Concatenar_Cubo_v2 y Cleanup_Ejecucion |

### SPs Modificados

| SP | Estado | Cambio |
|----|--------|--------|
| staging.CAPM_01_Ajuste_CAPM_v2 | COMPLETADO | staging.Ajuste_CAPM -> ##Ajuste_CAPM_{ID}_{Fund} |
| staging.CAPM_03_Carga_Final_v2 | COMPLETADO | Leer ##Ajuste, escribir process.TBL_CAPM |
| staging.PNL_03_Agrupacion_v2 | COMPLETADO | staging.PNL -> ##PNL_Final_{ID}_{Fund} |
| staging.PNL_04_CrearRegistrosAjusteIPA_v2 | COMPLETADO | staging.Ajuste_PNL -> ##Ajuste_PNL_{ID}_{Fund} |
| staging.PNL_05_Consolidar_IPA_PNL_v2 | COMPLETADO | Leer ##, escribir process.TBL_PNL_IPA |
| staging.DERIV_02_Homologar_Dimensiones_v2 | COMPLETADO | staging.Derivados -> process.TBL_Derivados |
| staging.DERIV_03_Ajuste_Derivados_v2 | COMPLETADO | staging.Ajuste_Derivados -> ##Ajuste_Derivados |
| staging.DERIV_04_Parity_Adjust_v2 | COMPLETADO | staging.Ajuste_Paridades -> ##Ajuste_Paridades |
| staging.UBS_02_Tratamiento_Derivados_MLCCII_v2 | COMPLETADO | staging -> process.TBL_MLCCII_Derivados |
| staging.UBS_03_Creacion_Cartera_MLCCII_v2 | COMPLETADO | staging -> process.TBL_MLCCII |
| staging.IPA_07_AgruparRegistros_v2 | COMPLETADO | + INSERT a process.TBL_IPA |
| staging.Concatenar_Cubo_v2 | CREADO | Lee de process.* con filtro ID_Ejecucion |
| process.Cleanup_Ejecucion | CREADO | Limpieza por ID_Ejecucion o retencion |

### Tablas Creadas en process.*

| Tabla | Descripcion |
|-------|-------------|
| process.TBL_CAPM | Destino final CAPM (con ID_Ejecucion, ID_Fund) |
| process.TBL_Derivados | Destino final Derivados |
| process.TBL_MLCCII | Destino final UBS MLCCII |
| process.TBL_MLCCII_Derivados | Destino final UBS Derivados |
| process.TBL_IPA | Ya existia, agregado ID_Ejecucion |
| process.TBL_PNL_IPA | Ya existia, agregado ID_Ejecucion |

### Config Actualizada

```sql
-- config.StagingSourcesCubo actualizado:
-- staging.IPA -> process.TBL_IPA
-- staging.CAPM -> process.TBL_CAPM
-- staging.Derivados -> process.TBL_Derivados
-- staging.MLCCII -> process.TBL_MLCCII
-- staging.MLCCII_Derivados -> process.TBL_MLCCII_Derivados
-- staging.Ajuste_* -> IsActive = 0 (ahora son ## temporales)
```

---

## Arquitectura Final

```
FLUJO ACTUALIZADO:

1. FundOrchestrator crea conexion dedicada por fondo
2. Cada pipeline escribe a:
   - ##Pipeline_Work_{ID}_{Fund} (tablas temporales de trabajo)
   - ##Ajuste_{Type}_{ID}_{Fund} (ajustes intermedios temporales)
   - process.TBL_* (persistencia final con ID_Ejecucion, ID_Fund)

3. Concatenar_Cubo_v2 lee de process.* WHERE ID_Ejecucion = @ID
4. Cleanup_Ejecucion limpia datos antiguos por retencion o ID

BENEFICIOS:
- Aislamiento: Cada fondo tiene sus propias tablas ##
- Sin conflictos: No hay contención entre fondos paralelos
- Limpieza automática: ## se eliminan al cerrar conexion
- Trazabilidad: ID_Ejecucion permite tracking granular
```

---

## CLASIFICACION FINAL DE TABLAS STAGING

### ELIMINADAS - Migradas a temporales (7 tablas)

| Tabla | Nuevo Destino |
|-------|---------------|
| staging.Ajuste_CAPM | ##Ajuste_CAPM_{ID}_{Fund} |
| staging.Ajuste_PNL | ##Ajuste_PNL_{ID}_{Fund} |
| staging.Ajuste_Derivados | ##Ajuste_Derivados_{ID}_{Fund} |
| staging.Ajuste_Paridades | ##Ajuste_Paridades_{ID}_{Fund} |
| staging.Ajuste_SONA | ##Ajuste_SONA_{ID}_{Fund} |
| staging.PNL | ##PNL_Final_{ID}_{Fund} |
| staging.PNL_IPA_Ajustes | ##PNL_IPA_Ajustes_{ID}_{Fund} |

### MOVIDAS - Redirigidas a process.* (6 tablas)

| Tabla Anterior | Nueva Ubicacion |
|----------------|-----------------|
| staging.IPA | process.TBL_IPA |
| staging.CAPM | process.TBL_CAPM |
| staging.PNL_IPA | process.TBL_PNL_IPA |
| staging.Derivados | process.TBL_Derivados |
| staging.MLCCII | process.TBL_MLCCII |
| staging.MLCCII_Derivados | process.TBL_MLCCII_Derivados |

### PRESERVADAS - Sin cambios (7 tablas)

| Tabla | Razon |
|-------|-------|
| staging.PNL_ValoresAcumulados | Acumulador persistente dias no habiles |
| staging.UAF_ValoresAcumulados | Acumulador persistente dias no habiles |
| staging.TBL_IPA_MDLAT_MLATHY | Consolidacion especial para reportes |
| staging.UAF | Pipeline UAF (fuera de alcance) |
| staging.BMS_Exp_WorkTable | Pipeline BMS (fuera de alcance) |
| staging.RISK_AMERICA_WorkTable | Pipeline RA (fuera de alcance) |
| staging.TH_WorkTable | Pipeline TH (fuera de alcance) |

---

## SIGUIENTE PASO: Validacion y Cleanup

### Pendiente: Migration 011

```sql
-- Solo ejecutar DESPUES de validar funcionamiento completo
DROP TABLE IF EXISTS staging.Ajuste_CAPM;
DROP TABLE IF EXISTS staging.Ajuste_PNL;
DROP TABLE IF EXISTS staging.Ajuste_Derivados;
DROP TABLE IF EXISTS staging.Ajuste_Paridades;
DROP TABLE IF EXISTS staging.Ajuste_SONA;
DROP TABLE IF EXISTS staging.CAPM;
DROP TABLE IF EXISTS staging.Derivados;
DROP TABLE IF EXISTS staging.MLCCII;
DROP TABLE IF EXISTS staging.MLCCII_Derivados;
DROP TABLE IF EXISTS staging.PNL_IPA;
DROP TABLE IF EXISTS staging.PNL;
DROP TABLE IF EXISTS staging.PNL_IPA_Ajustes;
DROP TABLE IF EXISTS staging.IPA;
```

---

## METRICAS FINALES

| Metrica | Valor |
|---------|-------|
| Tablas staging ELIMINADAS (logicamente) | 13 |
| Tablas staging PRESERVADAS | 7 |
| Tablas process.* NUEVAS/MODIFICADAS | 6 |
| SPs MODIFICADOS | 11 |
| SPs NUEVOS | 2 |

---

## BENEFICIOS LOGRADOS

- **Rendimiento**: Tablas temporales en tempdb son mas rapidas
- **Aislamiento**: Cada fondo tiene sus propias tablas (sin conflictos)
- **Limpieza automatica**: Tablas ## se eliminan al cerrar conexion
- **Mantenibilidad**: Menos tablas permanentes, menos complejidad
- **Trazabilidad**: ID_Ejecucion permite tracking granular por ejecucion
- **Espacio en disco**: Reduccion de ~13 tablas staging permanentes

---

*Plan de migracion actualizado - 2025-12-29*
*FASE 1: COMPLETADA*
*FASE 2: COMPLETADA*
