# Análisis Exhaustivo: Arquitectura Multiusuario del Sistema Pipeline

**Proyecto:** Homologación Instrumentos Financieros
**Fecha:** 2025-12-22
**Rama:** feature/habilitacion-formulario-multiusuario
**Bases de Datos:** MonedaHomologacion, Inteligencia_Producto_Dev

---

## Tabla de Contenido

1. [Resumen Ejecutivo](#resumen-ejecutivo)
2. [Arquitectura del Sistema Pipeline](#arquitectura-del-sistema-pipeline)
3. [Sistema de Logging y Tracking Multiusuario](#sistema-de-logging-y-tracking-multiusuario)
4. [Flujo de Ejecución del Pipeline](#flujo-de-ejecución-del-pipeline)
5. [Orquestación y Configuración](#orquestación-y-configuración)
6. [API REST y Servicios](#api-rest-y-servicios)
7. [Gestión de Formularios (Estado Actual)](#gestión-de-formularios-estado-actual)
8. [Oportunidades de Refactorización](#oportunidades-de-refactorización)

---

## 1. Resumen Ejecutivo

### 1.1 Descripción del Sistema

El sistema actual implementa una **arquitectura multiusuario madura y robusta** para el procesamiento batch de fondos financieros mediante un pipeline ETL orquestado. El diseño permite:

- **Ejecuciones concurrentes** de múltiples procesos independientes
- **Tracking detallado** de estado por fondo y por etapa
- **Logging estructurado** con niveles, categorías y contexto
- **Métricas de validación** para garantizar integridad de datos
- **Reprocesamiento selectivo** de fondos fallidos

### 1.2 Stack Tecnológico

**Backend:**
- **Base de datos:** SQL Server (MonedaHomologacion, Inteligencia_Producto_Dev)
- **Servidor:** Node.js + Express
- **ORM/Driver:** mssql (node-mssql)
- **Pool de conexiones:** Configurado con max=10, timeout=600000ms

**Frontend:**
- **Framework:** React
- **Estado:** Local state + custom hooks
- **API Client:** Axios con manejo centralizado de errores
- **Storage:** localStorage para drafts

---

## 2. Arquitectura del Sistema Pipeline

### 2.1 Bases de Datos y Esquemas

#### MonedaHomologacion
Base de datos para gestión de homologación de instrumentos y compañías.

**Esquemas:**
- `stock` - Datos de producción
  - `companias` - Compañías emisoras
  - `instrumentos` - Instrumentos financieros homologados
  - `benchmarks` - Índices de referencia
  - `Suciedades` - Anomalías detectadas
  - `descuadresHistorial` - Histórico de descuadres

- `sandbox` - Colas de trabajo
  - `colaPendientes` - Items pendientes de homologación
  - `colaFondos` - Fondos por procesar
  - `colaMonedas` - Monedas por homologar
  - `colaBenchmarks` - Benchmarks pendientes

- `cat` - Catálogos de valores
  - 20 tablas de catálogos (tipos, monedas, países, etc.)

- `bbg` - Integración Bloomberg
  - `Cashflows` - Flujos de caja de Bloomberg

- `logs` - Auditoría
  - `BBG_Log` - Logs de integración Bloomberg

#### Inteligencia_Producto_Dev
Base de datos principal para procesamiento batch de fondos.

**Esquemas:**

1. **extract** - Datos extraídos de fuentes
   - `IPA`, `CAPM`, `Derivados`, `PNL`, `UBS` (por cada fuente, con versiones _1)
   - `FTSE`, `MSCI`, `JPM_CEMBI`, `RISK_AMERICA` (benchmarks)

2. **staging** - Área de transformación
   - `IPA_WorkTable`, `CAPM_WorkTable`, `Derivados_WorkTable`, etc.
   - `Ajuste_*` (tablas de ajustes por fuente)

3. **process** - Datos procesados
   - `TBL_IPA`, `TBL_PNL`, `TBL_BMS_Exp`

4. **dimensionales** - Dimensiones maestras
   - `BD_Funds`, `BD_Instrumentos`, `BD_Monedas_Dimensiones`
   - `HOMOL_*` - Tablas de homologación

5. **config** - Configuración del pipeline
   - `ProcessFundsFlow` - Orden de ejecución de etapas
   - `ExtractorsFunds`, `ExtractorsBMS` - Configuración de extractores
   - `TiposCambio` - Tipos de cambio
   - `UBS_CONFIG_PORTFOLIOS` - Configuración UBS

6. **logs** - Sistema de tracking multiusuario ⭐
   - `Ejecuciones` - Ejecuciones de pipeline
   - `Ejecucion_Fondos` - Estado por fondo
   - `Ejecucion_Logs` - Logs estructurados
   - `Ejecucion_Metricas` - Métricas de validación

7. **metrics** - Métricas de benchmarks
   - `TBL_JPM_CEMBI_METRICS`, `TBL_RISK_AMERICA_AGG_METRICS`

8. **sandbox** - Colas de alertas
   - `Alertas_Descuadre_Derivados`
   - `Alertas_Suciedades_IPA`
   - `Fondos_Problema`
   - `Homologacion_*` - Pendientes de homologación

---

## 3. Sistema de Logging y Tracking Multiusuario

### 3.1 Tabla: logs.Ejecuciones

**Propósito:** Tabla maestra de ejecuciones del pipeline. Cada registro representa una ejecución independiente del proceso ETL.

**Estructura:**

```sql
CREATE TABLE logs.Ejecuciones (
    ID_Ejecucion BIGINT PRIMARY KEY IDENTITY,  -- Auto-generado o manual con IDENTITY_INSERT
    FechaReporte DATE NOT NULL,                 -- Fecha de datos a procesar
    FechaInicio DATETIME NOT NULL,              -- Timestamp de inicio
    FechaFin DATETIME NULL,                     -- Timestamp de finalización
    Estado VARCHAR(20) NOT NULL,                -- EN_PROGRESO, COMPLETADO, PARCIAL, ERROR
    TotalFondos INT,                            -- Cantidad total de fondos procesados
    FondosExitosos INT,                         -- Fondos completados OK
    FondosFallidos INT,                         -- Fondos con error
    FondosOmitidos INT,                         -- Fondos saltados por dependencias
    FondosWarning INT,                          -- Fondos con warnings
    TiempoTotal_Segundos INT,                   -- Duración total en segundos
    Usuario VARCHAR(100),                       -- Usuario que ejecutó (futuro)
    Hostname VARCHAR(100),                      -- Máquina ejecutora (futuro)
    Etapa_Actual VARCHAR(50),                   -- Etapa en ejecución
    Process_Date DATE,                          -- Fecha efectiva del proceso
    Duracion_Total_Ms INT,                      -- Duración en milisegundos
    FechaActualizacion DATETIME                 -- Última actualización
)
```

**Características clave:**
- **ID_Ejecucion** puede ser auto-generado o asignado manualmente (timestamp)
- **Estado** evoluciona durante el proceso
- **Campos de métricas agregadas** actualizados al finalizar
- **Permite tracking de progreso en tiempo real**

### 3.2 Tabla: logs.Ejecucion_Fondos

**Propósito:** Tracking granular del estado de cada fondo en una ejecución. Permite reprocesamiento selectivo y diagnóstico detallado.

**Estructura:**

```sql
CREATE TABLE logs.Ejecucion_Fondos (
    ID INT PRIMARY KEY IDENTITY,
    ID_Ejecucion BIGINT NOT NULL,              -- FK a Ejecuciones
    ID_Fund VARCHAR(50) NOT NULL,               -- Identificador del fondo
    FundShortName VARCHAR(100),                 -- Nombre corto del fondo

    -- Portfolios por fuente
    Portfolio_Geneva VARCHAR(100),
    Portfolio_CAPM VARCHAR(100),
    Portfolio_Derivados VARCHAR(100),
    Portfolio_UBS VARCHAR(100),

    -- Estado por etapa principal
    Estado_Extraccion VARCHAR(20),              -- OK, ERROR, WARNING, EN_PROGRESO
    Estado_Process_IPA VARCHAR(20),
    Estado_Process_CAPM VARCHAR(20),
    Estado_Process_Derivados VARCHAR(20),
    Estado_Process_PNL VARCHAR(20),
    Estado_Process_UBS VARCHAR(20),
    Estado_Concatenar VARCHAR(20),
    Estado_Final VARCHAR(20),
    Estado_Validacion VARCHAR(20),

    -- Sub-etapas de IPA (7 pasos)
    Estado_IPA_01_RescatarLocalPrice VARCHAR(20),
    Estado_IPA_02_AjusteSONA VARCHAR(20),
    Estado_IPA_03_RenombrarCxCCxP VARCHAR(20),
    Estado_IPA_04_TratamientoSuciedades VARCHAR(20),
    Estado_IPA_05_EliminarCajasMTM VARCHAR(20),
    Estado_IPA_06_CrearDimensiones VARCHAR(20),
    Estado_IPA_07_AgruparRegistros VARCHAR(20),

    -- Sub-etapas de CAPM (3 pasos)
    Estado_CAPM_01_Ajuste VARCHAR(20),
    Estado_CAPM_02_ExtractTransform VARCHAR(20),
    Estado_CAPM_03_CargaFinal VARCHAR(20),

    -- Sub-etapas de Derivados (4 pasos)
    Estado_DERIV_01_Posiciones VARCHAR(20),
    Estado_DERIV_02_Dimensiones VARCHAR(20),
    Estado_DERIV_03_Ajuste VARCHAR(20),
    Estado_DERIV_04_Paridad VARCHAR(20),

    -- Sub-etapas de PNL (5 pasos)
    Estado_PNL_01_Dimensiones VARCHAR(20),
    Estado_PNL_02_Ajuste VARCHAR(20),
    Estado_PNL_03_Agrupacion VARCHAR(20),
    Estado_PNL_04_AjusteIPA VARCHAR(20),
    Estado_PNL_05_Consolidar VARCHAR(20),

    -- Información de error
    Ultimo_Paso_Exitoso VARCHAR(50),
    Paso_Con_Error VARCHAR(50),
    Mensaje_Error NVARCHAR(500),

    -- Timing
    Inicio_Procesamiento DATETIME,
    Fin_Procesamiento DATETIME,
    Duracion_Ms INT,

    -- Flags de configuración
    Requiere_Derivados BIT,
    Incluir_En_Cubo BIT,
    Flag_UBS BIT,
    Flag_Derivados BIT,
    Elegible_Reproceso BIT,

    -- Graph sync
    Graph_Sync_Status VARCHAR(20),              -- PENDING, COMPLETED, ERROR
    Graph_Sync_Timestamp DATETIME,
    Graph_Sync_Error NVARCHAR(MAX),

    -- PNL específico
    PNL_Date DATE,

    -- Auditoría
    FechaActualizacion DATETIME
)
```

**Características clave:**
- **52 columnas de estado** que permiten tracking granular
- **Jerarquía de etapas:** Principal > Sub-etapas
- **Reprocesamiento:** Flag `Elegible_Reproceso` permite retry
- **Integración Graph DB:** Campos para sincronización

### 3.3 Tabla: logs.Ejecucion_Logs

**Propósito:** Log estructurado de eventos durante la ejecución. Permite auditoría, debugging y análisis de problemas.

**Estructura:**

```sql
CREATE TABLE logs.Ejecucion_Logs (
    ID BIGINT PRIMARY KEY IDENTITY,
    ID_Ejecucion BIGINT NOT NULL,               -- FK a Ejecuciones
    ID_Fund VARCHAR(50),                        -- NULL para logs globales
    Timestamp DATETIME DEFAULT GETDATE(),

    -- Clasificación del log
    Nivel VARCHAR(10) NOT NULL,                 -- INFO, DEBUG, WARNING, ERROR
    Categoria VARCHAR(30) NOT NULL,             -- SISTEMA, EXTRACCION, VALIDACION, etc.
    Etapa VARCHAR(50) NOT NULL,                 -- IPA, CAPM, DERIVADOS, etc.
    SubEtapa VARCHAR(50),                       -- Paso específico

    -- Contenido
    Mensaje NVARCHAR(1000) NOT NULL,            -- Mensaje principal
    Detalle NVARCHAR(MAX),                      -- Información adicional
    Datos_JSON NVARCHAR(MAX),                   -- Datos estructurados
    Stack_Trace NVARCHAR(MAX)                   -- Stack trace en caso de error
)
```

**Características clave:**
- **Indexado por ID_Ejecucion + Timestamp** para queries rápidas
- **Niveles jerárquicos:** INFO < DEBUG < WARNING < ERROR
- **Datos JSON:** Permite almacenar contexto estructurado
- **Filtrado avanzado:** Por fondo, etapa, nivel, categoría

### 3.4 Tabla: logs.Ejecucion_Metricas

**Propósito:** Métricas de validación por etapa. Detecta descuadres y problemas de integridad de datos.

**Estructura:**

```sql
CREATE TABLE logs.Ejecucion_Metricas (
    ID INT PRIMARY KEY IDENTITY,
    ID_Ejecucion BIGINT NOT NULL,
    ID_Fund VARCHAR(50) NOT NULL,
    Etapa VARCHAR(50) NOT NULL,

    -- Contadores
    Registros_Entrada INT,
    Registros_Procesados INT,
    Registros_Salida INT,
    Registros_Error INT,

    -- Sumas de validación
    Suma_MVBook DECIMAL(18,2),
    Suma_AI DECIMAL(18,2),
    Suma_TotalMVal DECIMAL(18,2),

    -- Validación de descuadres
    Valor_Esperado DECIMAL(18,2),
    Valor_Obtenido DECIMAL(18,2),
    Diferencia DECIMAL(18,2),
    Diferencia_Porcentual DECIMAL(10,4),
    Validacion_OK BIT,
    Umbral_Tolerancia DECIMAL(10,4),

    Timestamp DATETIME DEFAULT GETDATE()
)
```

**Uso:**
- **Detección automática de descuadres** comparando entrada vs salida
- **Alertas** cuando `Validacion_OK = 0`
- **Análisis de calidad** por fondo y etapa

### 3.5 Stored Procedures de Logging

#### logs.sp_Inicializar_Ejecucion
```sql
CREATE PROCEDURE logs.sp_Inicializar_Ejecucion
    @FechaReporte DATE,
    @ID_Ejecucion BIGINT OUTPUT
AS
BEGIN
    -- Crear registro de ejecución
    INSERT INTO logs.Ejecuciones (FechaReporte, FechaInicio, Estado, Etapa_Actual)
    VALUES (@FechaReporte, GETDATE(), 'EN_PROGRESO', 'INICIANDO');

    SET @ID_Ejecucion = SCOPE_IDENTITY();
END
```

#### logs.sp_Log
```sql
CREATE PROCEDURE logs.sp_Log
    @ID_Ejecucion BIGINT,
    @Nivel VARCHAR(10),
    @Mensaje NVARCHAR(1000),
    @ID_Fund VARCHAR(50) = NULL,
    @Categoria VARCHAR(30) = 'SISTEMA',
    @Etapa VARCHAR(50) = NULL,
    @Detalle NVARCHAR(MAX) = NULL
AS
BEGIN
    INSERT INTO logs.Ejecucion_Logs (ID_Ejecucion, ID_Fund, Nivel, Categoria, Etapa, Mensaje, Detalle)
    VALUES (@ID_Ejecucion, @ID_Fund, @Nivel, @Categoria, @Etapa, @Mensaje, @Detalle);
END
```

#### logs.sp_Actualizar_Estado_Fondo
```sql
CREATE PROCEDURE logs.sp_Actualizar_Estado_Fondo
    @ID_Ejecucion BIGINT,
    @ID_Fund VARCHAR(50),
    @Campo VARCHAR(100),    -- Nombre del campo a actualizar
    @Valor VARCHAR(20)      -- Nuevo valor
AS
BEGIN
    -- Actualización dinámica del estado
    DECLARE @sql NVARCHAR(MAX);
    SET @sql = N'UPDATE logs.Ejecucion_Fondos
                 SET ' + QUOTENAME(@Campo) + ' = @valor,
                     FechaActualizacion = GETDATE()
                 WHERE ID_Ejecucion = @idEjec AND ID_Fund = @idFund';

    EXEC sp_executesql @sql,
        N'@valor VARCHAR(20), @idEjec BIGINT, @idFund VARCHAR(50)',
        @Valor, @ID_Ejecucion, @ID_Fund;
END
```

#### logs.sp_Registrar_Metrica
```sql
CREATE PROCEDURE logs.sp_Registrar_Metrica
    @ID_Ejecucion BIGINT,
    @ID_Fund VARCHAR(50),
    @Etapa VARCHAR(50),
    @Registros_Entrada INT,
    @Registros_Salida INT,
    @Suma_MVBook DECIMAL(18,2) = NULL,
    @Valor_Esperado DECIMAL(18,2) = NULL,
    @Valor_Obtenido DECIMAL(18,2) = NULL
AS
BEGIN
    DECLARE @Diferencia DECIMAL(18,2);
    DECLARE @Diferencia_Porcentual DECIMAL(10,4);
    DECLARE @Validacion_OK BIT;

    -- Calcular métricas
    IF @Valor_Esperado IS NOT NULL AND @Valor_Obtenido IS NOT NULL
    BEGIN
        SET @Diferencia = @Valor_Obtenido - @Valor_Esperado;
        SET @Diferencia_Porcentual =
            CASE WHEN @Valor_Esperado <> 0
            THEN (@Diferencia / @Valor_Esperado) * 100
            ELSE 0 END;

        -- Tolerancia del 0.01%
        SET @Validacion_OK = CASE WHEN ABS(@Diferencia_Porcentual) <= 0.01 THEN 1 ELSE 0 END;
    END

    INSERT INTO logs.Ejecucion_Metricas (...)
    VALUES (...);
END
```

#### logs.sp_Finalizar_Ejecucion
```sql
CREATE PROCEDURE logs.sp_Finalizar_Ejecucion
    @ID_Ejecucion BIGINT,
    @Estado VARCHAR(20),
    @Mensaje_Error NVARCHAR(500) = NULL
AS
BEGIN
    -- Agregar métricas de fondos
    UPDATE logs.Ejecuciones
    SET
        Estado = @Estado,
        FechaFin = GETDATE(),
        TotalFondos = (SELECT COUNT(*) FROM logs.Ejecucion_Fondos WHERE ID_Ejecucion = @ID_Ejecucion),
        FondosExitosos = (SELECT COUNT(*) FROM logs.Ejecucion_Fondos
                         WHERE ID_Ejecucion = @ID_Ejecucion AND Estado_Final = 'OK'),
        FondosFallidos = (SELECT COUNT(*) FROM logs.Ejecucion_Fondos
                         WHERE ID_Ejecucion = @ID_Ejecucion AND Estado_Final = 'ERROR'),
        TiempoTotal_Segundos = DATEDIFF(SECOND, FechaInicio, GETDATE()),
        Etapa_Actual = 'FINALIZADO'
    WHERE ID_Ejecucion = @ID_Ejecucion;
END
```

---

## 4. Flujo de Ejecución del Pipeline

### 4.1 Proceso Principal: process.Process_Funds

**Parámetros:**
- `@FechaReporte NVARCHAR(10)` - Fecha de datos a procesar (YYYY-MM-DD)
- `@ID_Ejecucion BIGINT = NULL` - Opcional, para continuar ejecución existente

**Retorno:**
- `0` - Éxito total
- `1` - Éxito parcial (algunos fondos fallaron)
- `-1` - Error crítico

**Etapas:**

#### PASO 0: EXTRACCIÓN (Paralela)

**Grupos de extractores:**

1. **Grupo IPA**
   ```
   extract.Extract_IPA
   extract.Extract_PosModRF
   extract.Extract_SONA
   ```
   Secuencial dentro del grupo.

2. **Grupo CAPM**
   ```
   extract.Extract_CAPM
   ```

3. **Grupo Derivados**
   ```
   extract.Extract_Derivados
   ```

4. **Grupo UBS**
   ```
   extract.Extract_UBS
   extract.Extract_UBS_MonedaDerivados
   extract.Extract_UBS_Patrimonio
   ```
   Secuencial dentro del grupo.

**Características:**
- Cada grupo puede fallar independientemente
- Los fallos se trackean en variables `@*_EXTRACT_OK`
- NO bloquea ejecución, permite continuar con lo disponible

#### PASO 0.5: VALIDACIÓN DE FONDOS ACTIVOS

```sql
process.Validar_FondosActivos @FechaReporte
```

**Función:**
- Identifica fondos activos sin datos en fuentes
- Marca fondos problemáticos en `sandbox.Fondos_Problema`
- Retorna warning si encuentra problemas
- NO bloquea ejecución

#### PASO 1: PROCESS_IPA

```sql
process.Process_IPA @FechaReporte
```

**Dependencias:**
- Requiere: `@IPA_EXTRACT_OK = 1`

**Sub-etapas (7 pasos):**
1. `IPA_01_RescatarLocalPrice` - Recuperar precios locales
2. `IPA_02_AjusteSONA` - Ajustes de SONA
3. `IPA_03_RenombrarCxCCxP` - Renombrar cuentas por cobrar/pagar
4. `IPA_04_TratamientoSuciedades` - Limpiar anomalías
5. `IPA_05_EliminarCajasMTM` - Eliminar cajas MTM
6. `IPA_06_CrearDimensiones` - Generar dimensiones
7. `IPA_07_AgruparRegistros` - Agrupar registros finales

**Output:** `staging.IPA_Final`

#### PASO 2: PROCESS_CAPM

```sql
process.Process_CAPM @FechaReporte
```

**Dependencias:**
- Requiere: `@CAPM_EXTRACT_OK = 1` AND `@IPA_OK = 1`

**Sub-etapas (3 pasos):**
1. `CAPM_01_Ajuste` - Ajustar datos CAPM
2. `CAPM_02_ExtractTransform` - Transformar y extraer
3. `CAPM_03_CargaFinal` - Carga final a staging

**Output:** `staging.CAPM`

#### PASO 3: PROCESS_DERIVADOS

```sql
process.Process_Derivados @FechaReporte
```

**Dependencias:**
- Requiere: `@DERIVADOS_EXTRACT_OK = 1` AND `@IPA_OK = 1`

**Sub-etapas (4 pasos):**
1. `DERIV_01_Posiciones` - Tratamiento posiciones larga/corta
2. `DERIV_02_Dimensiones` - Homologar dimensiones
3. `DERIV_03_Ajuste` - Ajustes de derivados
4. `DERIV_04_Paridad` - Ajuste de paridad

**Output:** `staging.Derivados`

#### PASO 4: PROCESS_PNL

```sql
process.Process_PNL @FechaReporte
```

**Dependencias:**
- Requiere: `@PNL_EXTRACT_OK = 1` AND `@IPA_OK = 1`

**Sub-etapas (5 pasos):**
1. `PNL_01_Dimensiones` - Crear dimensiones
2. `PNL_02_Ajuste` - Ajustes PNL
3. `PNL_03_Agrupacion` - Agrupar registros
4. `PNL_04_AjusteIPA` - Crear ajustes IPA
5. `PNL_05_Consolidar` - Consolidar IPA + PNL

**Output:** `staging.PNL_IPA`

#### PASO 5: PROCESS_UBS (INDEPENDIENTE)

```sql
process.Process_UBS @FechaReporte
```

**Dependencias:**
- Requiere SOLO: `@UBS_EXTRACT_OK = 1`
- NO depende de otros procesos

**Sub-etapas (3 pasos):**
1. `UBS_01_Luxemburgo` - Procesar fondos Luxemburgo
2. `UBS_02_Derivados_MLCCII` - Derivados MLCCII
3. `UBS_03_Cartera_MLCCII` - Crear cartera consolidada

**Output:** `staging.UBS_WorkTable`

#### PASO 6: CONCATENAR_CUBO

```sql
staging.Concatenar_Cubo @FechaReporte
```

**Dependencias:**
- Requiere: AL MENOS UNO de {IPA, CAPM, Derivados, PNL, UBS} exitoso

**Función:**
- Consolida todas las fuentes procesadas en cubo final
- Aplica homologaciones desde `dimensionales.HOMOL_*`
- Genera `process.TBL_IPA` (tabla final)

#### PASO 7: SYNC TO GRAPH DATABASE

```sql
process.Sync_PNL_To_Graph_v2
    @ID_Ejecucion,
    @batch_size = 100
```

**Dependencias:**
- Requiere: `@PNL_OK = 1`

**Función:**
- Sincroniza datos PNL a base de datos Graph
- Tracking en `logs.Ejecucion_Fondos.Graph_Sync_*`
- Proceso batch con lotes de 100 registros

### 4.2 Gestión de Estado y Flags

**Estados posibles:**
- `EN_PROGRESO` - Ejecutándose
- `OK` - Completado exitosamente
- `WARNING` - Completado con advertencias
- `PARCIAL` - Parcialmente exitoso
- `ERROR` - Fallido
- `OMITIDO` - Saltado por dependencias
- `N/A` - No aplica

**Flags de control:**
- `Elegible_Reproceso` - Permite retry del fondo
- `Incluir_En_Cubo` - Incluir en cubo final
- `Requiere_Derivados` - Fondo tiene derivados
- `Flag_UBS` - Procesado por UBS
- `Flag_Derivados` - Procesado por Derivados

### 4.3 Configuración del Pipeline

**Tabla: config.ProcessFundsFlow**

```sql
ProcessName          ProcedureName              ExecutionOrder  IsActive
-------------------  -------------------------  --------------  --------
Process_IPA          process.Process_IPA        1               true
Process_CAPM         process.Process_CAPM       2               true
Process_Derivados    process.Process_Derivados  3               true
Process_PNL          process.Process_PNL        4               true
Process_UBS          process.Process_UBS        5               true
Concatenar_Cubo      staging.Concatenar_Cubo    6               true
Process_UAF          process.Process_UAF        7               true
Process_TH           process.Process_TH         8               true
```

**Nota:** Actualmente el SP `Process_Funds` tiene la lógica hardcodeada. Esta tabla es referencial pero NO se usa dinámicamente (oportunidad de mejora).

---

## 5. Orquestación y Configuración

### 5.1 Arquitectura de Capas

```
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND (React)                         │
│  - Formularios de homologación                              │
│  - Dashboard de ejecuciones                                 │
│  - Servicios: procesosService, instrumentosService, etc.    │
└─────────────────────────────────────────────────────────────┘
                            │ HTTP/REST
┌─────────────────────────────────────────────────────────────┐
│              BACKEND API (Node.js + Express)                │
│  Routes:                                                    │
│    - /api/procesos/v2/ejecutar                             │
│    - /api/procesos/v2/ejecucion/:id                        │
│    - /api/instrumentos                                      │
│    - /api/companias                                         │
└─────────────────────────────────────────────────────────────┘
                            │ SQL
┌─────────────────────────────────────────────────────────────┐
│                SQL SERVER DATABASES                         │
│  ┌──────────────────────┐  ┌───────────────────────────┐  │
│  │ MonedaHomologacion   │  │ Inteligencia_Producto_Dev │  │
│  │  - stock.*           │  │  - extract.*              │  │
│  │  - sandbox.*         │  │  - staging.*              │  │
│  │  - cat.*             │  │  - process.*              │  │
│  └──────────────────────┘  │  - logs.* (TRACKING)      │  │
│                             │  - config.*               │  │
│                             │  - dimensionales.*        │  │
│                             └───────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 API REST - Rutas del Pipeline

**Base URL:** `/api/procesos/v2`

#### POST /ejecutar
Inicia nueva ejecución.

**Request:**
```json
{
  "fechaReporte": "2025-12-20",
  "idFund": null  // Opcional, actualmente no soportado
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "ID_Ejecucion": 1734883200000,
    "FechaReporte": "2025-12-20",
    "ID_Fund": null,
    "Estado": "EN_PROGRESO",
    "IniciadoEn": "2025-12-22T10:00:00.000Z"
  }
}
```

**Características:**
- Respuesta inmediata (no espera finalización)
- Ejecución en background
- ID basado en timestamp

#### GET /ejecucion/:id
Obtiene estado completo de ejecución.

**Response:**
```json
{
  "success": true,
  "data": {
    "ejecucion": {
      "ID_Ejecucion": 1734883200000,
      "FechaReporte": "2025-12-20",
      "Estado": "EN_PROGRESO",
      "Etapa_Actual": "PROCESS_CAPM",
      "TotalFondos": 150,
      "FondosExitosos": 80,
      "FondosFallidos": 2
    },
    "fondos": [...],    // Detalle por fondo
    "logs": [...],      // Logs recientes
    "metricas": [...]   // Métricas con errores
  }
}
```

#### GET /historial
Lista ejecuciones recientes.

**Query params:**
- `fechaDesde` - Filtro fecha desde
- `fechaHasta` - Filtro fecha hasta
- `limit` - Cantidad máxima (default: 20)

#### GET /ejecucion/:id/fondos
Fondos de una ejecución con filtros.

**Query params:**
- `estado` - Filtrar por estado (OK, ERROR, WARNING)
- `etapa` - Filtrar por etapa con problemas

#### GET /ejecucion/:id/logs
Logs de ejecución con paginación.

**Query params:**
- `idFund` - Filtrar por fondo
- `nivel` - Filtrar por nivel (INFO, ERROR, etc.)
- `etapa` - Filtrar por etapa
- `offset` - Offset de paginación
- `limit` - Límite de registros (default: 100)

#### GET /ejecucion/:id/metricas
Métricas de validación.

**Query params:**
- `idFund` - Filtrar por fondo específico

#### POST /ejecucion/:id/reprocesar
Reprocesar fondo fallido.

**Request:**
```json
{
  "idFund": "123"
}
```

**Validaciones:**
- Verifica `Elegible_Reproceso = 1`
- Resetea estados del fondo
- Inicia reproceso en background

#### GET /ejecucion/:id/diagnostico
Diagnóstico completo de errores.

**Response:**
```json
{
  "fondosConError": [...],
  "logsError": [...],
  "resumenErrores": [...]
}
```

#### GET /pipeline/config
Configuración del pipeline (estática).

**Response:**
```json
{
  "success": true,
  "data": [
    {"id": "EXTRACCION", "nombre": "Extracción", "orden": 1},
    {"id": "VALIDACION", "nombre": "Validación", "orden": 2},
    ...
  ]
}
```

### 5.3 Servicios Frontend

**Archivo:** `src/services/procesosService.js`

```javascript
export const procesosService = {
  // Ejecutar pipeline
  ejecutar: (params) => apiClient.post('/procesos/v2/ejecutar', params),

  // Obtener estado
  getEjecucionEstado: (idEjecucion) =>
    apiClient.get(`/procesos/v2/ejecucion/${idEjecucion}`),

  // Historial
  getHistorialEjecuciones: (params = {}) =>
    apiClient.get('/procesos/v2/historial', params),

  // Fondos
  getEjecucionFondos: (idEjecucion, params = {}) =>
    apiClient.get(`/procesos/v2/ejecucion/${idEjecucion}/fondos`, params),

  // Logs
  getEjecucionLogs: (idEjecucion, params = {}) =>
    apiClient.get(`/procesos/v2/ejecucion/${idEjecucion}/logs`, params),

  // Métricas
  getEjecucionMetricas: (idEjecucion, idFund = null) => {
    const params = idFund ? { idFund } : {};
    return apiClient.get(`/procesos/v2/ejecucion/${idEjecucion}/metricas`, params);
  },

  // Reprocesar
  reprocesarFondo: (idEjecucion, idFund) =>
    apiClient.post(`/procesos/v2/ejecucion/${idEjecucion}/reprocesar`, { idFund }),

  // Diagnóstico
  getDiagnosticoEjecucion: (idEjecucion) =>
    apiClient.get(`/procesos/v2/ejecucion/${idEjecucion}/diagnostico`),

  // Config
  getPipelineConfig: () =>
    apiClient.get('/procesos/v2/pipeline/config'),
};
```

---

## 6. API REST y Servicios

### 6.1 Cliente API Centralizado

**Archivo:** `src/services/apiClient.js`

```javascript
import axios from 'axios';
import { config } from './config';

// Configuración base
const apiClient = axios.create({
  baseURL: config.API_BASE_URL,
  timeout: config.REQUEST_TIMEOUT,
});

// Interceptor de errores
apiClient.interceptors.response.use(
  (response) => response.data,  // Retornar solo data
  async (error) => {
    // Manejo centralizado de errores
    const apiError = new ApiError(
      error.response?.data?.error || error.message,
      error.response?.status,
      error.response?.data
    );

    // Retry logic
    if (shouldRetry(error)) {
      return retryRequest(error.config);
    }

    throw apiError;
  }
);

// Helper para GET
apiClient.get = (url, params = {}) => {
  return instance.get(url, { params });
};

export { apiClient };
```

### 6.2 Gestión de Formularios (Estado Actual)

#### instrumentosService

**Operaciones:**
- `getAll(options)` - Paginación server-side
- `search(query, limit, page)` - Búsqueda con paginación
- `getById(id)` - Por ID simple
- `getByPK(id, moneda)` - Por clave compuesta
- `create(data)` - Crear nuevo
- `update(id, moneda, data)` - Actualizar
- `delete(id, moneda)` - Eliminar
- `checkDuplicate(field, value, excludeId, excludeMoneda)` - Validación
- `checkAllDuplicates(fields, excludeId, excludeMoneda)` - Validación múltiple
- `getAllComplete(options)` - Carga completa con deduplicación

**Características:**
- Paginación con límite máximo de 500 por página
- Deduplicación por `idInstrumento + subId`
- Validación de duplicados antes de crear/actualizar
- Manejo de clave compuesta (id, moneda)

#### companiasService

**Operaciones:**
- `getAll()` - Todas las compañías
- `search(query, limit)` - Búsqueda fuzzy
- `getById(id)` - Por ID
- `getByNombre(nombre)` - Búsqueda exacta case-insensitive
- `create(data)` - Crear con validación de duplicados
- `update(id, data)` - Actualizar
- `delete(id)` - Eliminar con validación de uso

**Características:**
- Validación de duplicados por nombre
- Check de uso antes de eliminar
- Búsqueda case-insensitive

#### draftService (localStorage)

**Operaciones:**
- `saveDraft(queueItemId, formData)` - Guardar borrador
- `getDraft(queueItemId)` - Recuperar borrador
- `deleteDraft(queueItemId)` - Eliminar borrador
- `hasDraft(queueItemId)` - Verificar existencia
- `getAllDrafts()` - Listar todos
- `clearAllDrafts()` - Limpiar todos
- `cleanOldDrafts()` - Limpiar > 7 días

**Características:**
- Almacenamiento local en navegador
- Auto-cleanup de borradores antiguos
- Índice centralizado de drafts

### 6.3 Rutas Backend de Formularios

#### /api/instrumentos

**GET /**
- Query params: `page`, `limit`, `orderBy`, `order`
- Paginación server-side
- Retorna: `{ success, data, count, pagination }`

**GET /search**
- Query params: `q`, `limit`, `page`
- Búsqueda LIKE sobre múltiples campos

**GET /check-duplicate**
- Query params: `field`, `value`, `excludeId`, `excludeMoneda`
- Validación de unicidad

**GET /:id**
- Retorna múltiples registros si hay diferentes monedas

**GET /:id/moneda/:moneda**
- Retorna registro específico por clave compuesta

**POST /**
- Crear nuevo instrumento
- Validaciones: campos requeridos, unicidad

**PUT /:id/:moneda**
- Actualizar instrumento existente
- Actualización parcial (solo campos provistos)

**DELETE /:id/:moneda**
- Eliminar instrumento

#### /api/companias

**GET /**
- Todas las compañías ordenadas por nombre

**GET /search**
- Query params: `q`, `limit`
- Búsqueda LIKE con prioridad por prefijo

**GET /exacta/:nombre**
- Búsqueda exacta case-insensitive

**GET /:id**
- Compañía por ID

**POST /**
- Crear compañía
- Validación de duplicados por nombre

**PUT /:id**
- Actualizar compañía
- Actualización parcial

**DELETE /:id**
- Eliminar compañía
- Validación de uso en instrumentos

---

## 7. Gestión de Formularios (Estado Actual)

### 7.1 Arquitectura de Formularios

**Patrón actual:**
- **Un servicio por entidad** (instrumentosService, companiasService)
- **Rutas RESTful estándar** en backend
- **Validaciones en dos capas:** Frontend + Backend
- **Draft local** en localStorage
- **Sin configuración centralizada**

### 7.2 Flujo de Datos

```
┌─────────────────┐
│  Componente     │
│  Formulario     │
└────────┬────────┘
         │
         │ useState/useEffect
         │
┌────────▼────────┐
│  Service Layer  │
│  (XxxService)   │
└────────┬────────┘
         │
         │ apiClient.post/get/put
         │
┌────────▼────────┐
│  API Routes     │
│  /api/xxx       │
└────────┬────────┘
         │
         │ SQL queries
         │
┌────────▼────────┐
│  SQL Server     │
│  stock.*        │
└─────────────────┘
```

### 7.3 Limitaciones Actuales

1. **No hay configuración centralizada**
   - Validaciones hardcodeadas
   - Reglas de negocio dispersas
   - Sin YAML de configuración

2. **Sin sistema de versionado**
   - No tracking de cambios
   - Sin auditoría de modificaciones

3. **Sin sistema de permisos**
   - No hay control de acceso
   - No hay roles/usuarios

4. **Sin workflow de aprobación**
   - Cambios directos a BD
   - Sin flujo de revisión

5. **Validaciones limitadas**
   - Solo duplicados básicos
   - Sin validaciones de negocio complejas

6. **Sin tracking multiusuario**
   - No hay logs de quién modificó qué
   - No hay `usuarioCreacion`/`usuarioModificacion` funcionales

---

## 8. Oportunidades de Refactorización

### 8.1 Aplicar Patrón Pipeline a Formularios

**Inspiración del pipeline:**
- Sistema de tracking detallado
- Estados bien definidos
- Logging estructurado
- Configuración externalizada
- Métricas de validación

**Aplicación a formularios:**

#### A. Sistema de Tracking de Cambios

Crear tablas equivalentes en MonedaHomologacion:

```sql
-- Tabla de sesiones de edición
CREATE TABLE logs.Sesiones_Formulario (
    ID_Sesion BIGINT PRIMARY KEY IDENTITY,
    Usuario VARCHAR(100) NOT NULL,
    Entidad VARCHAR(50) NOT NULL,        -- 'instrumento', 'compania', etc.
    Accion VARCHAR(20) NOT NULL,         -- 'CREATE', 'UPDATE', 'DELETE'
    FechaInicio DATETIME NOT NULL,
    FechaFin DATETIME,
    Estado VARCHAR(20) NOT NULL,         -- 'EN_PROGRESO', 'COMPLETADO', 'CANCELADO'
    IP_Cliente VARCHAR(50),
    UserAgent VARCHAR(500)
);

-- Tabla de cambios de campos
CREATE TABLE logs.Cambios_Campo (
    ID BIGINT PRIMARY KEY IDENTITY,
    ID_Sesion BIGINT NOT NULL,
    Campo VARCHAR(100) NOT NULL,
    Valor_Anterior NVARCHAR(MAX),
    Valor_Nuevo NVARCHAR(MAX),
    Timestamp DATETIME DEFAULT GETDATE(),
    FOREIGN KEY (ID_Sesion) REFERENCES logs.Sesiones_Formulario(ID_Sesion)
);

-- Tabla de validaciones ejecutadas
CREATE TABLE logs.Validaciones_Ejecutadas (
    ID INT PRIMARY KEY IDENTITY,
    ID_Sesion BIGINT NOT NULL,
    Tipo_Validacion VARCHAR(50) NOT NULL,
    Campo VARCHAR(100),
    Resultado BIT NOT NULL,              -- 0 = Fallo, 1 = OK
    Mensaje NVARCHAR(500),
    Timestamp DATETIME DEFAULT GETDATE(),
    FOREIGN KEY (ID_Sesion) REFERENCES logs.Sesiones_Formulario(ID_Sesion)
);
```

#### B. Configuración YAML para Formularios

Crear archivo `form-config.yaml`:

```yaml
forms:
  instrumentos:
    entity: stock.instrumentos
    primaryKey:
      - idInstrumento
      - moneda

    sections:
      - id: identificacion
        title: "Identificación"
        order: 1
        fields:
          - name: idInstrumento
            type: integer
            label: "ID Instrumento"
            required: true
            readonly: true  # En modo edición
            autoGenerate: true  # En modo creación

          - name: moneda
            type: select
            label: "Moneda"
            required: true
            catalog: cat.monedas
            catalogKey: id
            catalogDisplay: nombre

          - name: nombreFuente
            type: text
            label: "Nombre Fuente"
            maxLength: 200
            required: true
            validations:
              - type: duplicate
                message: "Ya existe un instrumento con este nombre de fuente"

          - name: nameInstrumento
            type: text
            label: "Nombre Instrumento"
            maxLength: 200

      - id: clasificacion
        title: "Clasificación"
        order: 2
        dependencies:
          - identificacion  # Requiere completar sección anterior
        fields:
          - name: investmentTypeCode
            type: select
            label: "Tipo de Inversión"
            catalog: cat.investmentTypes
            required: true
            onChange:
              - action: updateFieldVisibility
                target: fundTypeCode
                condition: "value == 10"  # Si es fondo

      - id: emisor
        title: "Información del Emisor"
        order: 3
        fields:
          - name: companyName
            type: autocomplete
            label: "Compañía"
            source: /api/companias/search
            allowCreate: true
            createModal: compania-modal

    validations:
      # Validaciones a nivel de formulario
      - name: restructuring_validation
        description: "Validar reestructuración requiere predecesor"
        condition: "esReestructuracion == 'S'"
        requires:
          - idPredecesor
          - monedaPredecesor
        message: "Debe especificar el instrumento predecesor"

      - name: perpetuity_validation
        description: "Perpetuidad no compatible con fecha vencimiento"
        condition: "perpetuidad == 'S'"
        excludes:
          - fechaVencimiento
        message: "Instrumentos perpetuos no tienen fecha de vencimiento"

    workflows:
      create:
        steps:
          - validate_required_fields
          - check_duplicates
          - generate_id  # Si autoGenerate
          - insert_record
          - log_creation

      update:
        steps:
          - validate_required_fields
          - check_duplicates_excluding_current
          - track_changes
          - update_record
          - log_modification

      delete:
        steps:
          - check_dependencies
          - soft_delete  # Marcar activo=false
          - log_deletion

  companias:
    entity: stock.companias
    primaryKey:
      - id

    sections:
      - id: basico
        title: "Información Básica"
        order: 1
        fields:
          - name: companyName
            type: text
            label: "Nombre"
            required: true
            maxLength: 200
            validations:
              - type: duplicate
                caseInsensitive: true

          - name: issuerTypeCode
            type: select
            label: "Tipo de Emisor"
            catalog: cat.issuerTypes

          - name: sectorGICS
            type: select
            label: "Sector GICS"
            catalog: cat.sectoresGICS

          - name: activo
            type: boolean
            label: "Activo"
            default: true
```

#### C. Motor de Validaciones

```javascript
// src/services/formValidator.js
class FormValidator {
  constructor(formConfig) {
    this.config = formConfig;
  }

  async validateField(fieldName, value, excludeKeys = {}) {
    const fieldConfig = this.config.getField(fieldName);
    const results = [];

    // Validaciones del campo
    for (const validation of fieldConfig.validations || []) {
      const result = await this.runValidation(
        validation,
        fieldName,
        value,
        excludeKeys
      );
      results.push(result);
    }

    // Validaciones de formulario que involucran este campo
    const formValidations = this.config.getValidationsForField(fieldName);
    for (const validation of formValidations) {
      const result = await this.runFormValidation(validation);
      results.push(result);
    }

    return {
      isValid: results.every(r => r.valid),
      errors: results.filter(r => !r.valid).map(r => r.message)
    };
  }

  async runValidation(validation, fieldName, value, excludeKeys) {
    switch (validation.type) {
      case 'duplicate':
        return await this.checkDuplicate(fieldName, value, excludeKeys);
      case 'required':
        return this.checkRequired(value);
      case 'maxLength':
        return this.checkMaxLength(value, validation.max);
      case 'pattern':
        return this.checkPattern(value, validation.regex);
      case 'custom':
        return await this.checkCustom(validation.function, value);
      default:
        return { valid: true };
    }
  }

  async checkDuplicate(fieldName, value, excludeKeys) {
    const response = await apiClient.get(
      `/${this.config.entity}/check-duplicate`,
      {
        field: fieldName,
        value,
        ...excludeKeys
      }
    );

    return {
      valid: !response.isDuplicate,
      message: response.isDuplicate
        ? `Ya existe un registro con ${fieldName} = '${value}'`
        : null
    };
  }
}
```

#### D. Sistema de Secciones Dinámicas

```javascript
// src/components/DynamicForm.jsx
const DynamicForm = ({ formConfig, mode, initialData, onSave }) => {
  const [formData, setFormData] = useState(initialData || {});
  const [currentSection, setCurrentSection] = useState(0);
  const [validationErrors, setValidationErrors] = useState({});
  const [sessionId, setSessionId] = useState(null);

  const validator = useMemo(
    () => new FormValidator(formConfig),
    [formConfig]
  );

  // Inicializar sesión de edición
  useEffect(() => {
    const initSession = async () => {
      const session = await formSessionService.createSession({
        entidad: formConfig.entity,
        accion: mode,
        datosIniciales: initialData
      });
      setSessionId(session.ID_Sesion);
    };
    initSession();
  }, []);

  // Tracking de cambios
  const handleFieldChange = async (fieldName, newValue) => {
    const oldValue = formData[fieldName];

    // Actualizar estado
    setFormData(prev => ({ ...prev, [fieldName]: newValue }));

    // Registrar cambio en sesión
    await formSessionService.logChange(sessionId, {
      campo: fieldName,
      valorAnterior: oldValue,
      valorNuevo: newValue
    });

    // Validar campo
    const validation = await validator.validateField(
      fieldName,
      newValue,
      mode === 'update' ? formConfig.getPrimaryKeyValues(formData) : {}
    );

    // Registrar validación
    await formSessionService.logValidation(sessionId, {
      tipoValidacion: 'field',
      campo: fieldName,
      resultado: validation.isValid,
      mensaje: validation.errors.join(', ')
    });

    // Actualizar errores
    setValidationErrors(prev => ({
      ...prev,
      [fieldName]: validation.errors
    }));
  };

  // Renderizar sección
  const renderSection = (section) => {
    return (
      <FormSection key={section.id} title={section.title}>
        {section.fields.map(field => (
          <DynamicField
            key={field.name}
            config={field}
            value={formData[field.name]}
            onChange={(value) => handleFieldChange(field.name, value)}
            errors={validationErrors[field.name]}
            mode={mode}
          />
        ))}
      </FormSection>
    );
  };

  // Guardar formulario
  const handleSave = async () => {
    // Validar formulario completo
    const validation = await validator.validateForm(formData);

    if (!validation.isValid) {
      setValidationErrors(validation.errors);
      return;
    }

    // Ejecutar workflow
    const workflow = formConfig.workflows[mode];
    await executeWorkflow(workflow, formData, sessionId);

    // Finalizar sesión
    await formSessionService.completeSession(sessionId);

    // Callback
    onSave(formData);
  };

  return (
    <FormContainer>
      <SectionTabs
        sections={formConfig.sections}
        current={currentSection}
        onChange={setCurrentSection}
      />

      {renderSection(formConfig.sections[currentSection])}

      <FormActions>
        <Button onClick={handleSave}>Guardar</Button>
        <Button variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
      </FormActions>
    </FormContainer>
  );
};
```

### 8.2 Ventajas de la Refactorización

1. **Configuración centralizada**
   - Un solo YAML define todo el formulario
   - Fácil de mantener y actualizar
   - Versionable en git

2. **Tracking completo**
   - Quién hizo qué cambio y cuándo
   - Auditoría completa
   - Troubleshooting facilitado

3. **Validaciones consistentes**
   - Mismas reglas en frontend y backend
   - Definidas una vez
   - Fácil agregar nuevas

4. **Secciones dinámicas**
   - Formularios adaptativos
   - Dependencias entre campos
   - Visibilidad condicional

5. **Workflows configurables**
   - Flujo de aprobación
   - Pasos personalizables
   - Extensible

6. **Reusabilidad**
   - Componentes genéricos
   - Motor de validaciones compartido
   - Menos código duplicado

---

## Conclusión

El sistema actual de pipeline implementa una **arquitectura multiusuario robusta y madura** con:
- Tracking detallado por ejecución y por fondo
- Logging estructurado multinivel
- Métricas de validación automática
- Reprocesamiento selectivo
- API REST completa

La gestión de formularios, por otro lado, tiene un **diseño más tradicional** sin configuración centralizada.

La **refactorización propuesta** busca aplicar los patrones exitosos del pipeline a los formularios, creando un sistema unificado, configurable y con tracking completo.

---

**Próximo paso:** Plan de implementación secuencial con tests incrementales.
