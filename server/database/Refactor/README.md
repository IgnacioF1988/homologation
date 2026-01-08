# Pipeline IPA - Refactorizado

## Estructura del Proyecto

```
Refactor/
├── CORE/                    # Infraestructura base y SPs principales
│   ├── 00_Config_Requisitos.sql
│   ├── 00_Tables_Dimensionales.sql
│   ├── 00_Tables_Logs.sql
│   ├── 00_Tables_Process.sql
│   ├── 00_Tables_Sandbox.sql
│   ├── 00_Tables_Staging.sql
│   ├── 01_sp_EnsureSchema.sql
│   ├── 02_sp_ValidateFund.sql          # v7.0 - Case Sensitive
│   ├── 03_sp_Homologate.sql            # v2.0 - Case Sensitive
│   ├── 04_sp_CreateAdjustment.sql
│   ├── 05_sp_HandleError.sql
│   ├── 99_Fix_Collation_Sandbox.sql    # Migración: fix collation sandbox
│   ├── 99_Migracion_Collation_CS.sql   # Migración: collation CS_AS
│   ├── 99_Optimizacion_Definitiva.sql  # Índices y estadísticas
│   └── 99_Optimizacion_Indices_Estadisticas.sql
│
├── EXTRACT/                 # Extracción desde GD_EG_001
│   ├── 00_Indices_Source_GD_EG_001.sql # Ejecutar en GD_EG_001
│   ├── 00_Tables_Extract.sql
│   ├── 00_Update_Statistics.sql
│   ├── 01_Common_Functions.sql
│   ├── 02_sp_Extract_IPA.sql
│   ├── 03_sp_Extract_CAPM.sql
│   ├── 04_sp_Extract_Derivados.sql
│   ├── 05_sp_Extract_SONA.sql
│   ├── 06_sp_Extract_PNL.sql
│   └── 07_sp_Extract_PosModRF.sql
│
├── PIPELINE/                # Procesamiento de datos
│   ├── 10_sp_Process_IPA.sql
│   ├── 11_sp_Process_CAPM.sql
│   ├── 12_sp_Process_Derivados.sql
│   ├── 13_sp_Process_SONA.sql
│   └── 14_sp_Process_PNL.sql
│
├── SANDBOX/                 # Tablas globales N:M y vistas
│   ├── 00_Tables_Sandbox_Global.sql    # Tablas con collation CS_AS
│   ├── 01_Views_Sandbox_Pendientes.sql
│   └── 02_SP_Marcar_Ok.sql
│
├── CONSOLIDATION/           # Consolidación de cubos
│   └── 20_sp_Consolidar_Cubo.sql
│
└── TEST/                    # Scripts de prueba
    └── 05_Test_Generico_2Fondos.sql
```

---

## Prerequisitos

- SQL Server 2016 o superior
- Base de datos: `INTELIGENCIA_PRODUCTO_FULLSTACK`
- Acceso a base fuente: `GD_EG_001`
- Collation de BD: `Latin1_General_CI_AS` (default)

---

## Deploy Nuevo (BD desde cero)

Ejecutar en **SSMS** conectado a `INTELIGENCIA_PRODUCTO_FULLSTACK`, en el siguiente orden:

### Fase 1: Índices en Base Fuente
```
-- Conectar a GD_EG_001
EXTRACT/00_Indices_Source_GD_EG_001.sql
```

### Fase 2: Infraestructura Base
```
CORE/00_Tables_Staging.sql
CORE/00_Tables_Sandbox.sql
CORE/00_Tables_Process.sql
CORE/00_Tables_Dimensionales.sql
CORE/00_Tables_Logs.sql
CORE/00_Config_Requisitos.sql
```

### Fase 3: Tablas Sandbox Globales (con collation CS_AS)
```
SANDBOX/00_Tables_Sandbox_Global.sql
```

### Fase 4: Extract (Tablas y Funciones)
```
EXTRACT/00_Tables_Extract.sql
EXTRACT/01_Common_Functions.sql
```

### Fase 5: Core SPs
```
CORE/01_sp_EnsureSchema.sql
CORE/02_sp_ValidateFund.sql
CORE/03_sp_Homologate.sql
CORE/04_sp_CreateAdjustment.sql
CORE/05_sp_HandleError.sql
```

### Fase 6: Extract SPs
```
EXTRACT/02_sp_Extract_IPA.sql
EXTRACT/03_sp_Extract_CAPM.sql
EXTRACT/04_sp_Extract_Derivados.sql
EXTRACT/05_sp_Extract_SONA.sql
EXTRACT/06_sp_Extract_PNL.sql
EXTRACT/07_sp_Extract_PosModRF.sql
```

### Fase 7: Pipeline SPs
```
PIPELINE/10_sp_Process_IPA.sql
PIPELINE/11_sp_Process_CAPM.sql
PIPELINE/12_sp_Process_Derivados.sql
PIPELINE/13_sp_Process_SONA.sql
PIPELINE/14_sp_Process_PNL.sql
```

### Fase 8: Consolidation
```
CONSOLIDATION/20_sp_Consolidar_Cubo.sql
```

### Fase 9: Sandbox (Vistas y SPs)
```
SANDBOX/01_Views_Sandbox_Pendientes.sql
SANDBOX/02_SP_Marcar_Ok.sql
```

### Fase 10: Optimizaciones
```
CORE/99_Optimizacion_Definitiva.sql
```

---

## Migración de BD Existente

Si la BD ya existe y necesita actualizarse a la versión con **Case Sensitive Collation**:

### Paso 1: Migración de Collation (tablas dimensionales y extract)
```
CORE/99_Migracion_Collation_CS.sql
```

**Importante:** Este script:
- Limpia duplicados en `HOMOL_Instrumentos` y `BD_Instrumentos`
- Cambia collation a `Latin1_General_CS_AS` en tablas extract
- Reestructura `HOMOL_Instrumentos` con PK natural

### Paso 2: Fix Collation en Sandbox
```
CORE/99_Fix_Collation_Sandbox.sql
```

### Paso 3: Actualizar SPs
```
CORE/02_sp_ValidateFund.sql      -- v7.0
CORE/03_sp_Homologate.sql        -- v2.0
```

### Paso 4: Aplicar Optimizaciones
```
CORE/99_Optimizacion_Definitiva.sql
```

---

## Notas Técnicas

### Case Sensitive Collation
- Las tablas dimensionales y extract usan `Latin1_General_CS_AS`
- Las tablas temporales (`tempdb`) heredan `CI_AS` por defecto
- Los SPs v7.0/v2.0 manejan esto con `COLLATE Latin1_General_CS_AS` explícito

### Arquitectura Sandbox N:M
- Tablas principales: Un registro único por `(Item + Source)`
- Tablas de relación `*_Fondos`: Vínculo con fondos que detectaron el item
- Estado: `Pendiente` (default) o `Ok` (resuelto)

### Índices de Performance
El script `99_Optimizacion_Definitiva.sql` crea:
- Índices covering en tablas extract
- Índices en tablas HOMOL_* para lookups
- Estadísticas con FULLSCAN en todas las tablas

---

## Ejecución del Pipeline

```sql
-- Ejemplo: Procesar fondo 123 para fecha 2026-01-08
EXEC staging.sp_ValidateFund
    @ID_Fund = 123,
    @FechaReporte = '2026-01-08';
```

---

## Changelog

### 2026-01-08
- **sp_ValidateFund v7.0**: Soporte Case Sensitive Collation
- **sp_Homologate v2.0**: Temp tables con collation CS_AS
- Nuevos índices en tablas HOMOL_* para optimización
- Tablas sandbox con collation CS_AS en CREATE TABLE

### 2026-01-07
- Migración a `Latin1_General_CS_AS`
- PK natural en `HOMOL_Instrumentos`
- Estructura N:M para tablas sandbox globales
