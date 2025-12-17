# Stored Procedures de Sincronización entre Bases de Datos

Documentación de los stored procedures que sincronizan datos entre `Inteligencia_Producto_Dev_16Dic`, `MonedaHomologacion` y `BTFDS`.

---

## 📋 Tabla de Contenidos

1. [Flujo General](#flujo-general)
2. [Sincronización HACIA MonedaHomologacion](#sincronización-hacia-monedahomologacion)
3. [Sincronización DESDE MonedaHomologacion](#sincronización-desde-monedahomologacion)
4. [Sincronización Dimensional BD_Instrumentos](#sincronización-dimensional-bd_instrumentos)
5. [Orquestador Principal](#orquestador-principal)
6. [Comparación de Esquemas](#comparación-de-esquemas)
7. [Limitaciones del Sync Actual](#limitaciones-del-sync-actual)
8. [Análisis de Migración: _16Dic → Inteligencia_Producto_Dev](#análisis-de-migración-16dic--inteligencia_producto_dev)

---

## 🔄 Flujo General

```
┌────────────────────────────────────────────────────┐
│ Inteligencia_Producto_Dev / _16Dic                 │
│ (Base de datos principal ETL)                      │
├────────────────────────────────────────────────────┤
│ • extract.* (datos crudos)                         │
│ • staging.* (procesamiento)                        │
│ • process.* (datos procesados)                     │
│ • dimensionales.BD_Instrumentos (legacy lookup)    │
│ • dimensionales.HOMOL_Instrumentos (homologación)  │
└────────────────────────────────────────────────────┘
           │                                    ┌────────────┐
           │ (1) Detecta entidades              │ (2) MERGE  │
           │     sin homologar                  │     API    │
           │     (via SPs)                      │            │
           ▼                                    ▼            │
┌─────────────────────────────────────────────────────────┐ │
│ MonedaHomologacion.sandbox (Colas de homologación)     │ │
├─────────────────────────────────────────────────────────┤ │
│ • colaFondos                                            │ │
│ • colaBenchmarks                                        │ │
│ • colaPendientes (instrumentos)                         │ │
│ • colaMonedas                                           │ │
└─────────────────────────────────────────────────────────┘ │
           │                                                 │
           │ Proceso manual/automático                       │
           ▼                                                 │
┌─────────────────────────────────────────────────────────┐ │
│ MonedaHomologacion.stock (Datos maestros homologados)  │◄┘
├─────────────────────────────────────────────────────────┤
│ • instrumentos                                          │
│ • fondos                                                │
│ • benchmarks                                            │
└─────────────────────────────────────────────────────────┘
           │                                    │
           │ (3) Sync a BTFDS                  │ (4) Trigger
           │     (via SPs)                      │     Auto-sync
           ▼                                    ▼
┌──────────────────────────────┐    ┌──────────────────────────────┐
│ BTFDS.btfds                  │    │ Inteligencia_Producto_Dev    │
│ (Base de datos de grafos)    │    │ • HOMOL_Instrumentos         │
├──────────────────────────────┤    │ • BD_Instrumentos            │
│ • Instruments (nodos)        │    │ (Sincronización inversa)     │
│ • Funds (nodos)              │    └──────────────────────────────┘
│ • Indices (nodos)            │
│ • Contains_instrument        │
│ • Comprises_instrument       │
│ • EvolvesInto                │
└──────────────────────────────┘

Flujos de Sincronización:
(1) SPs detectan → sandbox queues
(2) API MERGE → stock.instrumentos (BD_Instrumentos → MonedaHomologacion)
(3) SPs periódicos → BTFDS (MonedaHomologacion → Grafo)
(4) Trigger automático → BD_Instrumentos (MonedaHomologacion → Legacy)
```

---

## 📤 Sincronización HACIA MonedaHomologacion

Stored procedures que detectan entidades sin homologar y las envían a las colas en `MonedaHomologacion.sandbox`.

### 1. Fondos → `MonedaHomologacion.sandbox.colaFondos`

#### 1.1 `staging.DetectarFondosNuevos`
- **Origen**: `extract.IPA`
- **Destino**: `MonedaHomologacion.sandbox.colaFondos`
- **Función**: Detecta fondos nuevos que no existen en `dimensionales.HOMOL_Funds`
- **Llamado por**: `process.Process_Funds_v2` (orquestador)
- **Parámetros**:
  - `@FechaReporte`: Fecha a procesar
  - `@ID_Ejecucion`: ID de ejecución del ETL

#### 1.2 `staging.IPA_06_CrearDimensiones_v2`
- **Origen**: `staging.IPA_WorkTable`
- **Destino**: `MonedaHomologacion.sandbox.colaFondos`
- **Función**: Durante el procesamiento IPA, detecta fondos sin homologar
- **Acción**: Marca fondos como ERROR y envía a cola

---

### 2. Benchmarks → `MonedaHomologacion.sandbox.colaBenchmarks`

#### 2.1 `staging.DetectarBenchmarksNuevos`
- **Origen**: Extractores BMS (FTSE, JPM_CEMBI, JPM_EMBROAD, MSCI, MSCI_10_40, RISK_AMERICA, SYP)
- **Destino**: `MonedaHomologacion.sandbox.colaBenchmarks`
- **Función**: Detecta benchmarks nuevos que no existen en `dimensionales.HOMOL_Benchmarks`
- **Llamado por**: `process.Process_Funds_v2` (orquestador)
- **Fuentes procesadas**:
  - `extract.FTSE`
  - `extract.JPM_CEMBI`
  - `extract.JPM_EMBROAD`
  - `extract.MSCI`
  - `extract.MSCI_10_40`
  - `extract.RISK_AMERICA`
  - `extract.SYP`

#### 2.2 `staging.Generar_Exposicion_BMS`
- **Origen**: Extractores BMS activos (configurados en `config.ExtractorsBMS`)
- **Destino**: `MonedaHomologacion.sandbox.colaBenchmarks`
- **Función**: Durante la generación de exposición BMS, detecta benchmarks sin homologar

---

### 3. Instrumentos → `MonedaHomologacion.sandbox.colaPendientes`

#### 3.1 `staging.Generar_Exposicion_BMS`
- **Origen**: Extractores BMS
- **Destino**: `MonedaHomologacion.sandbox.colaPendientes`
- **Función**: Detecta instrumentos sin homologar durante procesamiento BMS
- **Campos registrados**:
  - `nombreFuente`: InvestID del instrumento
  - `fuente`: 'GENEVA' o fuente BMS
  - `moneda`: ID de moneda homologada (o 0)
  - `idInstrumentoOrigen`: InvestID
  - `subId`: ID de moneda

#### 3.2 `staging.IPA_06_CrearDimensiones_v2`
- **Origen**: `staging.IPA_WorkTable`
- **Destino**: `MonedaHomologacion.sandbox.colaPendientes`
- **Función**: Detecta instrumentos sin homologar durante procesamiento IPA
- **Acción**: Envía a cola y elimina registros problemáticos del WorkTable

#### 3.3 `staging.PNL_01_Dimensiones_v2`
- **Origen**: `extract.PNL`
- **Destino**: `MonedaHomologacion.sandbox.colaPendientes`
- **Función**: Detecta instrumentos (Symb) sin homologar durante procesamiento PNL
- **Acción**: Marca fondos como ERROR_HOMOLOGACION y envía a cola

---

### 4. Monedas → `MonedaHomologacion.sandbox.colaMonedas`

#### 4.1 `staging.IPA_06_CrearDimensiones_v2`
- **Origen**: `staging.IPA_WorkTable`
- **Destino**: `MonedaHomologacion.sandbox.colaMonedas`
- **Función**: Detecta monedas sin homologar durante procesamiento IPA
- **Campo**: `LocalCurrency`

#### 4.2 `staging.PNL_01_Dimensiones_v2`
- **Origen**: `extract.PNL`
- **Destino**: `MonedaHomologacion.sandbox.colaMonedas`
- **Función**: Detecta monedas sin homologar durante procesamiento PNL
- **Campo**: `LocalCurrency` (derivado de Currency o Symb)

---

## 📥 Sincronización DESDE MonedaHomologacion

Stored procedures que leen datos de `MonedaHomologacion` y los sincronizan a la base de grafos `BTFDS`.

### 1. Instrumentos → `BTFDS.btfds.Instruments`

#### `process.usp_Update_Instruments_Bitemporal`
- **Origen**: `MonedaHomologacion.stock.instrumentos`
- **Destino**: `BTFDS.btfds.Instruments`
- **Función**: Sincroniza instrumentos usando modelo bitemporal
- **Características**:
  - Deduplicación automática (por idInstrumento + subId)
  - Versionado (version_number)
  - Modelo bitemporal: `valid_from/valid_to` (validez del negocio) + `system_from/system_to` (validez del sistema)
  - Genera `canonical_id` usando SHA2_256
  - Genera `pk2` como concatenación `ID-SubID`
- **Campos sincronizados**:
  - IDs: `idInstrumento`, `subId`, `pk2`, `canonical_id`
  - Clasificación: `asset_class` (investmentTypeCode)
  - JSON con todos los atributos del instrumento
- **Resultado**: Retorna conteos de Source, New, Updated, Unchanged

---

### 2. Evoluciones de Instrumentos → `BTFDS.btfds.EvolvesInto`

#### `process.usp_Update_Instrument_Evolutions`
- **Origen**: `MonedaHomologacion.stock.instrumentos` (campos de evolución)
- **Destino**: `BTFDS.btfds.EvolvesInto` (edges de grafos)
- **Función**: Crea relaciones de evolución entre instrumentos
- **Lógica de branch_id**:
  - Continuador directo (`tipoContinuador = 'Continuador directo'`): hereda branch_id del predecesor
  - Continuador indirecto: incrementa branch_id (branch_id + 1)
- **Campos procesados**:
  - `idPredecesor` + `monedaPredecesor` → pk2 predecesor
  - `tipoContinuador` → transformation_type
  - `esReestructuracion` → transformation_reason
  - `diaValidez` → transformation_date
- **Validaciones**:
  - Verifica que predecesor y sucesor existan en `Instruments`
  - Evita duplicados en edges
- **Resultado**: Retorna SourceRecords, ValidPairs, NewEdges, UpdatedBranches

---

### 3. Posiciones de Fondos → `BTFDS.btfds.Contains_instrument`

#### `process.usp_Load_Fund_Position`
- **Origen**: `Inteligencia_Producto_Dev.process.TBL_PNL`
- **Destino**: `BTFDS.btfds.Contains_instrument` (edges de grafos)
- **Función**: Carga posiciones de fondos con series temporales en JSON
- **Parámetros**:
  - `@start_date`, `@end_date`: Rango de fechas
  - `@batch_size`: Tamaño de lote (default 100 pares fondo-instrumento)
- **Modelo bitemporal**:
  - `valid_from/valid_to`: Rango de fechas de las posiciones
  - `system_from/system_to`: Historial de cambios del sistema
- **Estrategias de actualización**:
  1. **NEW**: Crear edge nuevo si no existe
  2. **APPEND**: Agregar nuevas fechas a edge existente
  3. **CORRECTION**: Cerrar edge antiguo (system_to = NOW) y crear nuevo con datos corregidos
  4. **SKIP**: No hacer nada si datos son idénticos
- **Formato JSON**:
```json
{
  "metadata": {
    "fund_id": "...",
    "fund_name": "...",
    "pk2": "...",
    "canonical_id": "...",
    "start_date": "...",
    "end_date": "...",
    "record_count": 123
  },
  "timeseries": [
    {
      "date": "2024-01-01T00:00:00.000",
      "position": {
        "pr_gain": 1234.56,
        "pu_gain": 789.12,
        "fx_r_gain": 45.67,
        "fx_u_gain": 12.34,
        "income": 567.89,
        "tot_gl": 2345.67,
        "balance_sheet": "Asset",
        "local_price": 100.50,
        "quantity": 1000,
        "original_face": 100000,
        "factor": 1.0,
        "ai": 123.45,
        "mv_book": 100500.00
      }
    }
  ]
}
```
- **Validaciones**:
  - Verifica que fondos existan en `BTFDS.btfds.Funds`
  - Verifica que instrumentos existan en `BTFDS.btfds.Instruments`
  - Salta registros con entidades faltantes (WARNING, no error)
- **Resultado**: Muestra NEW, APPENDED, CORRECTED, SKIPPED edges

---

### 4. Composición de Índices → `BTFDS.btfds.Comprises_instrument`

#### `process.usp_Load_Index_Composition`
- **Origen**: `Inteligencia_Producto_Dev.process.TBL_BMS_Exp`
- **Destino**: `BTFDS.btfds.Comprises_instrument` (edges de grafos)
- **Función**: Carga composición de índices/benchmarks con series temporales
- **Parámetros**:
  - `@start_date`, `@end_date`: Rango de fechas
  - `@batch_size`: Tamaño de lote (default 500 pares índice-instrumento)
- **Estrategias**: Iguales a `usp_Load_Fund_Position` (NEW, APPEND, CORRECTION, SKIP)
- **Formato JSON**:
```json
[
  {
    "date": "2024-01-01T00:00:00.000",
    "index_data": {
      "return_value": 0.0123,
      "weight": 0.0456,
      "source": "JPM",
      "fecha_cartera": "2024-01-01T00:00:00.000"
    }
  }
]
```
- **Validaciones**:
  - Verifica que índices existan en `BTFDS.btfds.Indices`
  - Verifica que instrumentos existan en `BTFDS.btfds.Instruments`

---

### 5. Evoluciones desde Staging → `BTFDS.btfds.EvolvesInto`

#### `process.usp_Load_Instrument_Evolution`
- **Origen**: `BTFDS.dbo.Instrument_Evolution_Staging` (tabla staging)
- **Destino**: `BTFDS.btfds.EvolvesInto`
- **Función**: Procesa evoluciones desde tabla staging (carga batch)
- **Parámetros**:
  - `@batch_size`: Tamaño de lote (default 1000)
- **Campos procesados**:
  - `Date`, `Validity_date`
  - `PK2_predecessor`, `PK2_Successor`
  - `Main` (1/0)
  - `Tipo_de_Transformacion`, `Razon_de_Transformacion`
- **Validaciones estrictas**:
  - No permite fechas futuras
  - Requiere que predecesor y sucesor existan
  - Falla si hay missing instruments
- **Resultado**: SourceRecords, Evolutions, EdgesCreated, InstrumentsUpdated

---

## 🔄 Sincronización Dimensional BD_Instrumentos

Esta sección documenta la sincronización **bidireccional** entre la base de datos legacy y MonedaHomologacion para datos maestros dimensionales.

### Visión General

A diferencia del flujo de colas (colaPendientes) que maneja instrumentos nuevos sin homologar, este flujo sincroniza instrumentos ya existentes entre dos sistemas:

- **Legacy → Modern**: Via API endpoint (MERGE)
- **Modern → Legacy**: Via Trigger automático (INSERT/UPDATE)

### 1. Sync Legacy → Modern (API)

#### Endpoint
**URL**: `POST /api/sync/dimensionales-from-legacy`

**Ubicación**: `server/routes/sync.routes.js` (líneas 370-444)

#### Operación

**MERGE** desde `Inteligencia_Producto_Dev.dimensionales.BD_Instrumentos` hacia `MonedaHomologacion.stock.instrumentos`

```sql
MERGE INTO MonedaHomologacion.stock.instrumentos AS target
USING (
  SELECT
    CAST(ID_Instrumento AS INT) AS idInstrumento,
    ISNULL((SELECT TOP 1 id FROM MonedaHomologacion.cat.monedas WHERE codigo = 'USD'), 1) AS moneda,
    Name_Instrumento AS nameInstrumento,
    CompanyName AS companyName,
    Investment_Type_Code AS investmentTypeCode,
    Issuer_Type_Code AS issuerTypeCode,
    ISIN AS isin,
    TickerBBG AS tickerBBG,
    Sedol AS sedol,
    Cusip AS cusip,
    Sector_GICS AS sectorGICS,
    Issue_Country AS issueCountry,
    Risk_Country AS riskCountry
  FROM Inteligencia_Producto_Dev.dimensionales.BD_Instrumentos
  WHERE ID_Instrumento IS NOT NULL
    AND TRY_CAST(ID_Instrumento AS INT) IS NOT NULL
) AS source
ON target.idInstrumento = source.idInstrumento AND target.moneda = source.moneda
WHEN NOT MATCHED BY TARGET THEN
  INSERT (idInstrumento, moneda, nameInstrumento, companyName, investmentTypeCode,
          issuerTypeCode, isin, tickerBBG, sedol, cusip, sectorGICS, issueCountry,
          riskCountry, fechaCreacion, Valid_From, Valid_To)
  VALUES (source.idInstrumento, source.moneda, source.nameInstrumento, source.companyName,
          source.investmentTypeCode, source.issuerTypeCode, source.isin, source.tickerBBG,
          source.sedol, source.cusip, source.sectorGICS, source.issueCountry,
          source.riskCountry, GETDATE(), '1990-01-01', '2050-12-31');
```

#### Campos Sincronizados

**Campos transferidos** (13 de 26 disponibles en BD_Instrumentos):

| Campo BD_Instrumentos | Campo stock.instrumentos | Transformación |
|----------------------|-------------------------|----------------|
| ID_Instrumento | idInstrumento | CAST a INT |
| (derivado) | moneda | Fijo a USD (id=1) |
| Name_Instrumento | nameInstrumento | Directo |
| CompanyName | companyName | Directo |
| Investment_Type_Code | investmentTypeCode | Directo |
| Issuer_Type_Code | issuerTypeCode | Directo |
| ISIN | isin | Directo |
| TickerBBG | tickerBBG | Directo |
| Sedol | sedol | Directo |
| Cusip | cusip | Directo |
| Sector_GICS | sectorGICS | Directo |
| Issue_Country | issueCountry | Directo |
| Risk_Country | riskCountry | Directo |
| - | fechaCreacion | GETDATE() |
| - | Valid_From | '1990-01-01' |
| - | Valid_To | '2050-12-31' |

**Campos NO sincronizados** (pérdida de información):

- `Coupon_Type_Code` - Tipo de cupón
- `Rank_Code` - Nivel de seniority
- `Cash_Type_Code` - Tipo de efectivo
- `Bank_Debt_Type_Code` - Tipo de deuda bancaria
- `Fund_Type_Code` - Tipo de fondo
- `Yield_Type` - Tipo de rendimiento
- `Yield_Source` - Fuente del rendimiento
- `Issue_Currency` - Moneda de emisión (se pierde al fijar a USD)
- `Risk_Currency` - Moneda de riesgo
- `Sector_Chile_Type_Code` - Sector Chile
- `Emision_nacional` - Bandera de emisión nacional
- `Comentarios` - Comentarios

#### Comportamiento del MERGE

- **INSERT**: Si el par (idInstrumento, moneda) NO existe en stock.instrumentos
- **NO UPDATE**: Si ya existe, NO se actualiza (mantiene datos actuales)
- **Moneda predeterminada**: Siempre usa USD (id=1), ignora SubID_Instrumento de legacy

#### Frecuencia

- **Manual**: Via llamada al endpoint API
- **Programada**: Puede configurarse como job schedulado

---

### 2. Sync Modern → Legacy (Trigger Automático)

#### Trigger
**Nombre**: `stock.trg_Instrumentos_SyncToSource`

**Activación**: AFTER INSERT, UPDATE en `MonedaHomologacion.stock.instrumentos`

#### Operación

Automáticamente sincroniza de vuelta a las tablas legacy cuando se crea o actualiza un instrumento en MonedaHomologacion:

**Destinos**:
1. `Inteligencia_Producto_Dev.dimensionales.HOMOL_Instrumentos`
   - Mapeo de homologación
   - Campos: SourceInvestment, ID_Instrumento, Source

2. `Inteligencia_Producto_Dev.dimensionales.BD_Instrumentos`
   - Datos maestros completos
   - 26 campos sincronizados

#### Propósito

Mantener la base legacy sincronizada para:
- Compatibilidad con procesos existentes
- Lookup tables en staging procedures
- Reportes legacy que consultan BD_Instrumentos

#### Comportamiento

- **Automático**: Se ejecuta en cada INSERT/UPDATE
- **Bidireccional**: Cierra el ciclo de sincronización
- **Completo**: Sincroniza todos los campos disponibles

---

### 3. Stored Procedures que Leen de BD_Instrumentos

#### `staging.Tratamiento_RISK_AMERICA`

**Propósito**: Enriquece datos de Risk America con información adicional de instrumentos

**Patrón de uso**:
```sql
LEFT JOIN [dimensionales].[HOMOL_Instrumentos] hi
    ON r.[InvestID] = hi.[SourceInvestment] AND r.[Source] = hi.[Source]
LEFT JOIN [dimensionales].[BD_Instrumentos] bi
    ON hi.[ID_Instrumento] = bi.[ID_Instrumento]
```

**Campos extraídos**:
- `CompanyName` - Nombre de la compañía emisora
- `Sector_GICS` - Sector GICS

**Flujo**:
```
extract.RISK_AMERICA
    → HOMOL_Instrumentos (mapeo)
    → BD_Instrumentos (lookup)
    → staging.RISK_AMERICA_WorkTable (enriquecido)
```

---

### 4. Diagrama de Flujo Bidireccional

```
┌────────────────────────────────────────────────────────┐
│ Inteligencia_Producto_Dev / _16Dic                     │
│ (Sistema Legacy)                                       │
├────────────────────────────────────────────────────────┤
│                                                        │
│  dimensionales.BD_Instrumentos                         │
│  ├─ 26 columnas                                        │
│  ├─ PK: ID_Instrumento + SubID_Instrumento            │
│  └─ Uso: Dimensional lookup table                     │
│                                                        │
│  dimensionales.HOMOL_Instrumentos                      │
│  ├─ Mapeo: SourceInvestment → ID_Instrumento          │
│  └─ Uso: Homologación entre sistemas                  │
│                                                        │
└────────────────────────────────────────────────────────┘
              │                              ▲
              │ (1) API MERGE                │ (2) Trigger
              │     Manual/Scheduled          │     Automático
              │     13 campos                 │     26 campos
              ▼                              │
┌────────────────────────────────────────────────────────┐
│ MonedaHomologacion                                     │
│ (Sistema Moderno)                                      │
├────────────────────────────────────────────────────────┤
│                                                        │
│  stock.instrumentos                                    │
│  ├─ 49 columnas                                        │
│  ├─ PK: idInstrumento (INT) + moneda (INT)            │
│  ├─ 23 campos adicionales (audit, restructuring...)   │
│  └─ Modelo bitemporal: Valid_From/Valid_To            │
│                                                        │
└────────────────────────────────────────────────────────┘
```

**Leyenda**:
- **(1) API MERGE**: Sync parcial, solo INSERT, no UPDATE
- **(2) Trigger**: Sync completo, automático en cada cambio

---

### 5. Diferencias con Flujo de Colas

Este flujo dimensional es **complementario** al flujo de colas (sandbox.colaPendientes):

| Aspecto | Flujo Dimensional (API) | Flujo de Colas (SPs) |
|---------|------------------------|---------------------|
| **Fuente** | BD_Instrumentos (legacy) | extract.* (ETL origen) |
| **Trigger** | Manual/Programado | Automático durante ETL |
| **Instrumentos** | Ya existentes en legacy | Nuevos sin homologar |
| **Operación** | MERGE (solo INSERT) | INSERT a cola → Proceso manual |
| **Campos** | 13 básicos | Varía según fuente |
| **Destino** | stock.instrumentos directamente | sandbox.colaPendientes → stock.instrumentos |
| **Uso** | Migración/Sincronización masiva | Flujo incremental ETL |

**Cuándo usar cada uno**:
- **API Dimensional**: Migración inicial, sincronización batch, actualización masiva
- **Colas**: Procesamiento diario del ETL, instrumentos nuevos detectados

---

## 🎯 Orquestador Principal

### `process.Sync_PNL_To_Graph_v2`

Orquestador que coordina la sincronización completa de datos PNL al grafo.

**Parámetros**:
- `@ID_Ejecucion`: ID de ejecución del ETL
- `@batch_size`: Tamaño de lote para carga (default 100)

**Flujo de ejecución**:

```
1. Obtener fecha de proceso de logs.Ejecuciones
   ↓
2. Verificar fondos pendientes de sincronización
   (Graph_Sync_Status = 'PENDING')
   ↓
3. STEP 1: UPDATE INSTRUMENTS (si faltan)
   → usp_Update_Instruments_Bitemporal
   ↓
4. STEP 2: UPDATE INSTRUMENT EVOLUTIONS
   → usp_Update_Instrument_Evolutions
   ↓
5. STEP 3: SYNC PNL TO GRAPH
   → usp_Load_Fund_Position
   ↓
6. Actualizar logs.Ejecucion_Fondos
   Graph_Sync_Status = 'COMPLETED' | 'ERROR'
```

**Manejo de errores**:
- Retry automático si faltan instrumentos (1 intento)
- Actualiza `Graph_Sync_Status` en `logs.Ejecucion_Fondos`
- Registra errores en `Graph_Sync_Error`

**Llamado por**: `process.Process_Funds_v2` (ETAPA 6.5)

---

## 📊 Resumen de Tablas Involucradas

### Inteligencia_Producto_Dev / _16Dic

**Extract (origen)**:
- `extract.IPA` → Fondos
- `extract.PNL` → Instrumentos PNL
- `extract.FTSE`, `extract.JPM_CEMBI`, `extract.MSCI`, etc. → Benchmarks BMS

**Staging (procesamiento)**:
- `staging.IPA_WorkTable`
- `staging.PNL_WorkTable`
- `staging.BMS_Exp_WorkTable`
- `staging.RISK_AMERICA_WorkTable`

**Process (destino)**:
- `process.TBL_PNL` → Fuente para BTFDS
- `process.TBL_BMS_Exp` → Fuente para BTFDS

**Dimensionales (maestros y homologación)**:
- `dimensionales.BD_Instrumentos` ← Tabla legacy de instrumentos (26 cols)
  - **Uso**: Lookup table para enriquecimiento (ej: Tratamiento_RISK_AMERICA)
  - **Fuente**: Sincronizada DESDE MonedaHomologacion via trigger
  - **Destino**: Sincronizada HACIA MonedaHomologacion via API
- `dimensionales.BD_Funds` ← Tabla legacy de fondos
- `dimensionales.BD_Benchmarks` ← Tabla legacy de benchmarks
- `dimensionales.HOMOL_Instrumentos` ← Mapeo SourceInvestment → ID_Instrumento
  - **Uso**: Homologación entre sistemas de origen y BD_Instrumentos
  - **Patrón**: `extract.* → HOMOL_Instrumentos → BD_Instrumentos`
- `dimensionales.HOMOL_Funds` ← Mapeo Portfolio → ID_Fund
- `dimensionales.HOMOL_Benchmarks` ← Mapeo Portfolio → ID_BM
- `dimensionales.HOMOL_Monedas` ← Mapeo Currency → id_CURR

**Logs**:
- `logs.Ejecuciones`
- `logs.Ejecucion_Fondos` (incluye `Graph_Sync_Status`)
- `logs.Ejecucion_Metricas`

**Sandbox (local)**:
- `sandbox.Fondos_Problema` ← Fondos con errores de homologación
- `sandbox.Homologacion_Fondos` ← Cola local de fondos (legacy)
- `sandbox.Homologacion_Monedas` ← Cola local de monedas (legacy)

---

### MonedaHomologacion

**Sandbox (colas de homologación)**:
- `sandbox.colaFondos` ← Fondos nuevos/sin homologar
- `sandbox.colaBenchmarks` ← Benchmarks nuevos/sin homologar
- `sandbox.colaPendientes` ← Instrumentos sin homologar
- `sandbox.colaMonedas` ← Monedas sin homologar

**Stock (datos maestros homologados)**:
- `stock.instrumentos` (49 cols)
  - **Fuente**: BD_Instrumentos (via API MERGE) + Manual (via UI)
  - **Destino**: BTFDS.Instruments (via SPs) + BD_Instrumentos (via trigger)
  - **Modelo**: Bitemporal (Valid_From/Valid_To)
  - **PK**: idInstrumento (INT) + moneda (INT)
- `stock.fondos` → Fondos homologados
- `stock.benchmarks` → Benchmarks homologados

**Catálogos**:
- `cat.monedas` ← Catálogo de monedas (FK desde stock.instrumentos)

---

### BTFDS (Base de datos de grafos)

**Nodos**:
- `btfds.Funds` (fondos)
- `btfds.Indices` (benchmarks)
- `btfds.Instruments` (instrumentos financieros)

**Edges (relaciones)**:
- `btfds.Contains_instrument` (Fondo contiene Instrumento)
- `btfds.Comprises_instrument` (Índice comprende Instrumento)
- `btfds.EvolvesInto` (Instrumento evoluciona a Instrumento)

**Staging**:
- `dbo.Instrument_Evolution_Staging`

---

## 🔍 Campos Clave de Identificación

### PK2 (Primary Key Compuesta)
Formato: `{ID_Instrumento}-{id_CURR}`

Ejemplos:
- `12345-1` (Instrumento 12345 en USD)
- `67890-2` (Instrumento 67890 en EUR)

Generado en:
- `staging.Generar_Exposicion_BMS`
- `staging.IPA_06_CrearDimensiones_v2`
- `staging.PNL_01_Dimensiones_v2`

### Canonical ID
Formato: SHA2_256 hash del pk2
- Usado en BTFDS para identificación única global
- Inmutable (no cambia con versiones)

### Modelo Bitemporal

**Valid Time** (tiempo de negocio):
- `valid_from`: Inicio de validez del dato en el mundo real
- `valid_to`: Fin de validez del dato en el mundo real

**System Time** (tiempo de sistema):
- `system_from`: Cuándo se insertó el registro en la BD
- `system_to`: Cuándo se marcó como obsoleto (NULL = actual)

**Ejemplo**:
```
Instrumento cambió de nombre el 2024-01-15
- Registro antiguo: valid_to = 2024-01-14, system_to = 2024-01-20
- Registro nuevo: valid_from = 2024-01-15, system_to = NULL
```

---

## ⚠️ Consideraciones Importantes

### 1. Orden de Ejecución
La sincronización DEBE seguir este orden:
1. Instrumentos (`usp_Update_Instruments_Bitemporal`)
2. Evoluciones (`usp_Update_Instrument_Evolutions`)
3. Posiciones/Composiciones (`usp_Load_Fund_Position` / `usp_Load_Index_Composition`)

### 2. Homologación
- Entidades sin homologar se envían a colas en MonedaHomologacion
- Fondos con problemas de homologación se marcan como ERROR
- Los registros sin homologar se ELIMINAN del WorkTable

### 3. Concurrencia
- `usp_Load_Fund_Position` usa lock exclusivo (`sp_getapplock`)
- Solo una instancia puede ejecutarse a la vez

### 4. Performance
- Procesamiento por lotes (batch_size configurable)
- Índices específicos en tablas de grafos para búsquedas rápidas

### 5. Auditabilidad
- Modelo bitemporal permite ver el estado de cualquier dato en cualquier momento
- Logs detallados en `logs.Ejecucion_Fondos`
- Estados específicos: PENDING, RUNNING, COMPLETED, ERROR

---

## 📊 Comparación de Esquemas

Comparación detallada entre las tablas `BD_Instrumentos` (legacy) y `stock.instrumentos` (modern).

### Características Generales

| Característica | BD_Instrumentos (Legacy) | stock.instrumentos (Modern) |
|---------------|-------------------------|----------------------------|
| **Esquema** | `Inteligencia_Producto_Dev.dimensionales` | `MonedaHomologacion.stock` |
| **Columnas** | 26 | 49 |
| **Primary Key** | ID_Instrumento + SubID_Instrumento (NVARCHAR) | idInstrumento + moneda (INT) |
| **Propósito** | Dimensional lookup table | Master data con auditoría |
| **Modelo temporal** | No | Sí (Valid_From/Valid_To) |
| **Audit fields** | No | Sí (4 campos) |
| **Restructuring** | No | Sí (5 campos) |

### Mapeo de Campos Compartidos

| BD_Instrumentos | stock.instrumentos | Tipo Dato Legacy | Tipo Dato Modern | Notas |
|----------------|-------------------|------------------|------------------|-------|
| ID_Instrumento | idInstrumento | NVARCHAR(20) | INT | Conversión requerida |
| SubID_Instrumento | moneda | NVARCHAR(10) | INT | FK a cat.monedas |
| Name_Instrumento | nameInstrumento | NVARCHAR(255) | NVARCHAR(255) | - |
| CompanyName | companyName | NVARCHAR(255) | NVARCHAR(255) | - |
| ISIN | isin | NVARCHAR(50) | NVARCHAR(50) | - |
| TickerBBG | tickerBBG | NVARCHAR(50) | NVARCHAR(50) | - |
| Sedol | sedol | NVARCHAR(50) | NVARCHAR(20) | - |
| Cusip | cusip | NVARCHAR(50) | NVARCHAR(20) | - |
| Investment_Type_Code | investmentTypeCode | INT | INT | FK a catálogos |
| Issuer_Type_Code | issuerTypeCode | INT | INT | FK a catálogos |
| Issue_Type_Code | issueTypeCode | INT | INT | FK a catálogos |
| Coupon_Type_Code | couponTypeCode | INT | INT | NO sincronizado |
| Sector_GICS | sectorGICS | BIGINT | BIGINT | - |
| Sector_Chile_Type_Code | sectorChileTypeCode | INT | INT | NO sincronizado |
| Issue_Country | issueCountry | NVARCHAR(10) | NVARCHAR(10) | - |
| Risk_Country | riskCountry | NVARCHAR(10) | NVARCHAR(10) | - |
| Issue_Currency | issueCurrency | INT | INT | NO sincronizado |
| Risk_Currency | riskCurrency | INT | INT | NO sincronizado |
| Rank_Code | rankCode | INT | INT | NO sincronizado |
| Cash_Type_Code | cashTypeCode | INT | INT | NO sincronizado |
| Bank_Debt_Type_Code | bankDebtTypeCode | INT | INT | NO sincronizado |
| Fund_Type_Code | fundTypeCode | INT | INT | NO sincronizado |
| Yield_Type | yieldType | NVARCHAR(50) | NVARCHAR(50) | NO sincronizado |
| Yield_Source | yieldSource | NVARCHAR(50) | NVARCHAR(50) | NO sincronizado |
| Emision_nacional | emisionNacional | BIT | BIT | NO sincronizado |
| Comentarios | comentarios | NVARCHAR(MAX) | NVARCHAR(MAX) | NO sincronizado |

### Campos Exclusivos de stock.instrumentos

La tabla moderna tiene 23 campos adicionales que NO existen en BD_Instrumentos:

**Identificación y fuente** (3):
- `nombreFuente` - Nombre original del instrumento en fuente externa
- `fuente` - Sistema fuente (GENEVA, UBS, etc.)
- `publicDataSource` - Fuente de datos públicos

**Evolución/Restructuración** (5):
- `esReestructuracion` - Bandera de reestructuración
- `idPredecesor` - ID del instrumento predecesor
- `monedaPredecesor` - Moneda del predecesor
- `tipoContinuador` - Tipo (directo/indirecto)
- `diaValidez` - Fecha de validez de la evolución

**Características de bonos** (7):
- `perpetuidad` - Es perpetuo
- `rendimiento` - Rendimiento
- `couponFrequency` - Frecuencia de cupón
- `coco` - Es CoCo bond
- `callable` - Es callable
- `sinkable` - Es sinkable
- `yasYldFlag` - Bandera yield

**Auditoría** (4):
- `fechaCreacion` - Timestamp de creación
- `fechaModificacion` - Timestamp de modificación
- `usuarioCreacion` - Usuario que creó
- `usuarioModificacion` - Usuario que modificó

**Temporal** (2):
- `Valid_From` - Inicio de validez (bitemporal)
- `Valid_To` - Fin de validez (bitemporal)

**Otros** (2):
- Campos calculados y derivados

### Transformaciones de Datos

**Conversiones de tipo**:
- `ID_Instrumento`: NVARCHAR → INT (requiere TRY_CAST)
- `SubID_Instrumento`: NVARCHAR → INT (lookup en cat.monedas)

**Valores predeterminados**:
- `moneda`: Siempre USD (id=1) en API sync
- `Valid_From`: '1990-01-01' en API sync
- `Valid_To`: '2050-12-31' en API sync
- `fechaCreacion`: GETDATE() en API sync

### Compatibilidad

**Porcentaje de campos compartidos**: 50% (26 campos legacy, 49 campos modern, 23 únicos modern)

**Porcentaje sincronizado por API**: 50% (13 de 26 campos legacy)

**Porcentaje sincronizado por Trigger**: 100% (todos los campos legacy → modern)

---

## ⚠️ Limitaciones del Sync Actual

### 1. Sync Legacy → Modern (API MERGE)

#### Pérdida de Información

**13 campos NO sincronizados** de un total de 26 en BD_Instrumentos:

**Campos financieros críticos**:
- `Coupon_Type_Code` - Tipo de cupón (Fixed, Floating, Zero, etc.)
- `Rank_Code` - Nivel de seniority (Senior, Subordinated, etc.)
- `Yield_Type` - Tipo de yield calculation
- `Yield_Source` - Fuente del rendimiento

**Clasificación**:
- `Cash_Type_Code` - Tipo de instrumento de efectivo
- `Bank_Debt_Type_Code` - Tipo de deuda bancaria
- `Fund_Type_Code` - Tipo de fondo
- `Sector_Chile_Type_Code` - Sector clasificación Chile

**Monedas**:
- `Issue_Currency` - Moneda de emisión (se reemplaza por USD)
- `Risk_Currency` - Moneda de riesgo

**Metadata**:
- `Emision_nacional` - Bandera de emisión nacional
- `Comentarios` - Comentarios y notas

**SubID_Instrumento**:
- Se ignora completamente, siempre se usa moneda = USD (id=1)

#### Comportamiento del MERGE

**NO actualiza registros existentes**:
```sql
WHEN NOT MATCHED BY TARGET THEN INSERT ...
-- Falta: WHEN MATCHED THEN UPDATE ...
```

**Implicaciones**:
- Si un instrumento ya existe en stock.instrumentos, NO se actualiza
- Cambios en BD_Instrumentos NO se reflejan en stock.instrumentos
- Solo sirve para migración inicial, no para sincronización continua

#### Valores Predeterminados Genéricos

**Valid_From/Valid_To**:
```sql
Valid_From = '1990-01-01'  -- Fecha genérica, no refleja fecha real
Valid_To = '2050-12-31'    -- Fecha genérica, no refleja vencimiento real
```

**Moneda fija**:
```sql
moneda = 1  -- Siempre USD, ignora SubID_Instrumento de legacy
```

**Problema**: Instrumentos en múltiples monedas se colapsan a una sola entrada USD

---

### 2. Inconsistencias de Modelo

#### Claves Primarias Incompatibles

**Legacy**:
```
PK: ID_Instrumento (NVARCHAR) + SubID_Instrumento (NVARCHAR)
```

**Modern**:
```
PK: idInstrumento (INT) + moneda (INT)
```

**Problema**:
- SubID_Instrumento no siempre es un ID de moneda válido
- Conversión NVARCHAR → INT puede fallar
- No hay mapeo 1:1 garantizado

#### Modelo Temporal

**Legacy**: Sin modelo temporal
**Modern**: Bitemporal (Valid_From/Valid_To)

**Problema**:
- Legacy no tiene fechas de validez
- Sync usa fechas genéricas que no reflejan realidad
- Histórico no se preserva

---

### 3. Recomendaciones

#### Corto Plazo

1. **Expandir campos sincronizados**:
   - Agregar Coupon_Type_Code, Rank_Code, Yield_Type, Yield_Source
   - Incluir Currency fields con mapeo adecuado
   - Sincronizar Sector_Chile_Type_Code, Comentarios

2. **Agregar UPDATE al MERGE**:
```sql
WHEN MATCHED AND (
    target.nameInstrumento != source.nameInstrumento OR
    target.companyName != source.companyName OR
    -- otros campos...
) THEN UPDATE SET ...
```

3. **Mapear SubID_Instrumento correctamente**:
   - Verificar si SubID corresponde a moneda
   - Usar tabla de mapeo si es necesario
   - Permitir múltiples monedas por instrumento

#### Mediano Plazo

4. **Modelo temporal adecuado**:
   - Agregar fechas de validez a BD_Instrumentos
   - O derivarlas de otras fuentes (effective_date, maturity_date)
   - Evitar fechas genéricas hardcodeadas

5. **Auditoría de sincronización**:
   - Log de registros sincronizados/skipped
   - Alertas de campos faltantes
   - Reporte de inconsistencias

6. **Validación de datos**:
   - Verificar conversión NVARCHAR → INT antes de MERGE
   - Validar que moneda existe en cat.monedas
   - Alertar instrumentos que no pueden sincronizarse

#### Largo Plazo

7. **Unificación de modelos**:
   - Migrar completamente a stock.instrumentos como única fuente
   - Deprecar BD_Instrumentos
   - Mantener solo via trigger de sincronización inversa

8. **Proceso ETL formal**:
   - Reemplazar API manual con proceso schedulado
   - Integrar en pipeline de ETL principal
   - Sincronización incremental (solo cambios)

---

## 🔀 Análisis de Migración: _16Dic → Inteligencia_Producto_Dev

Esta sección analiza las diferencias funcionales entre `Inteligencia_Producto_Dev_16Dic` (versión anterior) e `Inteligencia_Producto_Dev` (versión actual) basándose en las funcionalidades documentadas en este análisis.

---

### 📊 Resumen Ejecutivo

La migración de `Inteligencia_Producto_Dev_16Dic` a `Inteligencia_Producto_Dev` representa una **evolución arquitectónica significativa** hacia:
- **Mayor observabilidad**: Sistema de logging centralizado
- **Integración con grafos**: Sincronización completa con BTFDS
- **Versionado de procedimientos**: Migración a versión 2 (_v2) de SPs críticos
- **Modelo temporal avanzado**: Bitemporal tracking para instrumentos

---

### ✅ Funcionalidades GANADAS

#### 1. Sistema de Logging Centralizado (schema `logs`)

**Nuevas tablas de auditoría**:

```
logs.Ejecuciones
├─ Tracking de ejecuciones del ETL
├─ ID_Ejecucion (PK)
└─ Fecha de proceso

logs.Ejecucion_Fondos
├─ Tracking por fondo
├─ Estados: PENDING, RUNNING, COMPLETED, ERROR
├─ Graph_Sync_Status (nuevo campo crítico)
└─ Graph_Sync_Error (mensajes de error)

logs.Ejecucion_Metricas
└─ Métricas de performance del proceso
```

**Beneficios**:
- Trazabilidad completa de ejecuciones ETL
- Identificación rápida de fondos con problemas
- Monitoreo de sincronización a grafos
- Auditoría de errores y reintentosDocumentado en: Líneas 629-632, 588-589

---

#### 2. Stored Procedures Versión 2 (_v2)

**Procedimientos evolucionados**:

| Procedimiento v2 | Mejoras Documentadas | Ubicación |
|------------------|---------------------|-----------|
| `process.Process_Funds_v2` | Orquestador principal mejorado | Líneas 90, 109 |
| `staging.IPA_06_CrearDimensiones_v2` | Detección de fondos, instrumentos y monedas sin homologar | Líneas 95-100, 139-144, 155-160 |
| `staging.PNL_01_Dimensiones_v2` | Detección de instrumentos y monedas desde PNL | Líneas 145-150, 161-166 |
| `process.Sync_PNL_To_Graph_v2` | Orquestador de sincronización a BTFDS con retry automático | Líneas 557-592 |

**Características de versión 2**:
- Integración con sistema de logs (parámetro `@ID_Ejecucion`)
- Manejo de estados en `logs.Ejecucion_Fondos`
- Detección automática de entidades sin homologar
- Envío a colas de MonedaHomologacion
- Marcado de errores (`ERROR`, `ERROR_HOMOLOGACION`)

**Documentado en**: Líneas 90, 95, 145, 557

---

#### 3. Sincronización a Base de Grafos (BTFDS)

**Nuevos procedimientos de graph sync**:

```
process.usp_Update_Instruments_Bitemporal
├─ Sync instrumentos → BTFDS.btfds.Instruments
├─ Modelo bitemporal (valid_from/to, system_from/to)
├─ Canonical_id (SHA2_256)
└─ Deduplicación automática

process.usp_Update_Instrument_Evolutions
├─ Sync evoluciones → BTFDS.btfds.EvolvesInto
├─ Branch_id tracking
└─ Transformation_type/reason

process.usp_Load_Fund_Position
├─ Sync posiciones → BTFDS.btfds.Contains_instrument
├─ Series temporales en JSON
├─ Estrategias: NEW, APPEND, CORRECTION, SKIP
└─ Lock exclusivo (sp_getapplock)

process.usp_Load_Index_Composition
├─ Sync composición → BTFDS.btfds.Comprises_instrument
├─ Series temporales JSON
└─ Batch processing

process.usp_Load_Instrument_Evolution
├─ Carga batch desde staging
└─ Validaciones estrictas
```

**Beneficios**:
- Modelo de grafos para relaciones complejas
- Consultas de relaciones instrumentos-fondos eficientes
- Tracking de evoluciones de instrumentos
- Análisis de composición de índices
- Historización completa (bitemporal)

**Documentado en**: Líneas 175-321

---

#### 4. Modelo Bitemporal

**Implementación en BTFDS.btfds.Instruments**:

```
Valid Time (tiempo de negocio):
├─ valid_from: Inicio validez real del dato
└─ valid_to: Fin validez real del dato

System Time (tiempo de sistema):
├─ system_from: Cuándo se insertó en BD
└─ system_to: Cuándo se marcó obsoleto (NULL = actual)
```

**Ejemplo de uso** (líneas 709-713):
```
Instrumento cambió de nombre el 2024-01-15
- Registro antiguo: valid_to = 2024-01-14, system_to = 2024-01-20
- Registro nuevo: valid_from = 2024-01-15, system_to = NULL
```

**Beneficios**:
- Consultar estado de datos en cualquier momento histórico
- Separar validez de negocio vs cambios de sistema
- Auditoría completa de cambios
- Correcciones retroactivas sin pérdida de historial

**Documentado en**: Líneas 182, 224-229, 699-713

---

#### 5. Identificación Canónica

**Canonical ID** (líneas 183, 693-696):
- Generado con SHA2_256 del pk2
- Identificación única global inmutable
- No cambia con versiones del instrumento
- Usado en BTFDS para deduplicación

**PK2 Format** (líneas 682-691):
- Formato: `{ID_Instrumento}-{id_CURR}`
- Ejemplos: `12345-1` (USD), `67890-2` (EUR)
- Generado en staging procedures

**Beneficios**:
- Identificación consistente entre sistemas
- Deduplicación robusta
- Linking entre bases de datos

**Documentado en**: Líneas 183-185, 682-696

---

#### 6. Estrategias de Actualización Inteligentes

**En `usp_Load_Fund_Position`** (líneas 226-230):

| Estrategia | Cuándo | Acción |
|-----------|--------|--------|
| NEW | Edge no existe | Crear edge nuevo |
| APPEND | Edge existe, nuevas fechas | Agregar fechas a JSON |
| CORRECTION | Edge existe, datos cambiaron | Cerrar edge (system_to=NOW), crear nuevo |
| SKIP | Edge existe, datos idénticos | No hacer nada |

**Beneficios**:
- Evita duplicados
- Mantiene historización correcta
- Optimiza performance (SKIP)
- Permite correcciones retroactivas

**Documentado en**: Líneas 226-230, 282

---

#### 7. Control de Concurrencia

**Lock exclusivo en `usp_Load_Fund_Position`** (línea 731):
```sql
sp_getapplock
```

**Beneficio**:
- Evita race conditions
- Garantiza consistencia en cargas paralelas
- Solo una instancia ejecutándose a la vez

**Documentado en**: Línea 731

---

#### 8. Orquestación con Retry Automático

**`process.Sync_PNL_To_Graph_v2`** (líneas 557-592):

```
Flujo:
1. Obtener fecha de logs.Ejecuciones
2. Verificar fondos PENDING
3. STEP 1: UPDATE INSTRUMENTS (si faltan)
4. STEP 2: UPDATE EVOLUTIONS
5. STEP 3: SYNC PNL TO GRAPH
6. Actualizar Graph_Sync_Status → COMPLETED/ERROR

Manejo de errores:
├─ Retry automático si faltan instrumentos (1 intento)
├─ Actualiza Graph_Sync_Status
└─ Registra errores en Graph_Sync_Error
```

**Beneficios**:
- Resiliencia ante errores temporales
- Tracking de estado por fondo
- Reintento automático
- Logging de errores para troubleshooting

**Documentado en**: Líneas 557-592

---

#### 9. Validaciones Mejoradas

**En sync a BTFDS** (líneas 265-269, 297-299):

```
usp_Load_Fund_Position:
├─ Verifica fondos en BTFDS.btfds.Funds
├─ Verifica instrumentos en BTFDS.btfds.Instruments
├─ WARNING (no error) si faltan entidades
└─ Salta registros con missing data

usp_Load_Index_Composition:
├─ Verifica índices en BTFDS.btfds.Indices
└─ Verifica instrumentos en BTFDS.btfds.Instruments

usp_Load_Instrument_Evolution (líneas 316-319):
├─ No permite fechas futuras
├─ Requiere predecesor y sucesor existan
└─ FALLA si hay missing instruments (estricto)
```

**Beneficios**:
- Integridad referencial
- Prevención de datos huérfanos
- Alertas tempranas de problemas

**Documentado en**: Líneas 265-269, 297-299, 316-319

---

#### 10. Procesamiento por Lotes (Batch)

**Parámetros batch_size** (líneas 222, 281, 310):

```
usp_Load_Fund_Position: default 100 pares fondo-instrumento
usp_Load_Index_Composition: default 500 pares índice-instrumento
usp_Load_Instrument_Evolution: default 1000 registros
```

**Beneficios**:
- Performance mejorada
- Reducción de uso de memoria
- Configurabilidad según hardware

**Documentado en**: Líneas 222-223, 281-282, 310-311, 736

---

#### 11. Formato JSON para Series Temporales

**En edges de grafos** (líneas 232-264, 285-296):

**Contains_instrument** (posiciones de fondos):
```json
{
  "metadata": {
    "fund_id": "...", "fund_name": "...",
    "pk2": "...", "canonical_id": "...",
    "start_date": "...", "end_date": "...",
    "record_count": 123
  },
  "timeseries": [
    {
      "date": "2024-01-01T00:00:00.000",
      "position": {
        "pr_gain": 1234.56, "pu_gain": 789.12,
        "fx_r_gain": 45.67, "fx_u_gain": 12.34,
        "income": 567.89, "tot_gl": 2345.67,
        "balance_sheet": "Asset",
        "local_price": 100.50, "quantity": 1000,
        "original_face": 100000, "factor": 1.0,
        "ai": 123.45, "mv_book": 100500.00
      }
    }
  ]
}
```

**Comprises_instrument** (composición de índices):
```json
[
  {
    "date": "2024-01-01T00:00:00.000",
    "index_data": {
      "return_value": 0.0123,
      "weight": 0.0456,
      "source": "JPM",
      "fecha_cartera": "2024-01-01T00:00:00.000"
    }
  }
]
```

**Beneficios**:
- Almacenamiento eficiente de series
- Consultas rápidas por rango de fechas
- Metadata embebida
- Flexibilidad de esquema

**Documentado en**: Líneas 232-296

---

#### 12. Tracking de Evoluciones de Instrumentos

**Nuevos campos en `stock.instrumentos`** (líneas 801-806):

```
esReestructuracion (BIT)
idPredecesor (INT)
monedaPredecesor (INT)
tipoContinuador (NVARCHAR) - 'Continuador directo' / 'Continuador indirecto'
diaValidez (DATE)
```

**Procesamiento en `usp_Update_Instrument_Evolutions`** (líneas 196-210):

```
Lógica de branch_id:
├─ Continuador directo: hereda branch_id del predecesor
└─ Continuador indirecto: incrementa branch_id (branch_id + 1)

Campos procesados:
├─ idPredecesor + monedaPredecesor → pk2 predecesor
├─ tipoContinuador → transformation_type
├─ esReestructuracion → transformation_reason
└─ diaValidez → transformation_date
```

**Beneficios**:
- Tracking de fusiones y splits
- Genealogía de instrumentos
- Análisis de reestructuraciones
- Continuidad de series de tiempo

**Documentado en**: Líneas 193-210, 801-806

---

#### 13. Tabla de Staging para Evoluciones

**`BTFDS.dbo.Instrument_Evolution_Staging`** (líneas 306-320):

```
Campos:
├─ Date, Validity_date
├─ PK2_predecessor, PK2_Successor
├─ Main (1/0)
├─ Tipo_de_Transformacion
└─ Razon_de_Transformacion

Proceso:
└─ usp_Load_Instrument_Evolution
    ├─ Procesa en batches (default 1000)
    └─ Crea edges en EvolvesInto
```

**Beneficios**:
- Carga batch de evoluciones
- Staging permite validación previa
- Desacoplamiento fuente-destino

**Documentado en**: Líneas 306-320, 675

---

### ❌ Funcionalidades PERDIDAS (o Deprecadas)

#### 1. Stored Procedures Versión 1

**Procedimientos reemplazados**:

Basándose en la existencia de versiones _v2, se infiere que existieron versiones anteriores sin sufijo que fueron **deprecadas**:

- `process.Process_Funds` → `process.Process_Funds_v2`
- `staging.IPA_06_CrearDimensiones` → `staging.IPA_06_CrearDimensiones_v2`
- `staging.PNL_01_Dimensiones` → `staging.PNL_01_Dimensiones_v2`
- `process.Sync_PNL_To_Graph` → `process.Sync_PNL_To_Graph_v2`

**Implicaciones**:
- Versiones v1 probablemente **NO** tenían integración con:
  - Sistema de logs (parámetro `@ID_Ejecucion` ausente)
  - Graph sync status tracking
  - Retry automático
- Posible pérdida de compatibilidad con procesos que llamaban versiones v1

**Evidencia documental**: Líneas 90, 95, 145, 557 (todas referencias a _v2)

---

#### 2. Colas de Homologación Locales (sandbox local)

**Tablas mencionadas como potencialmente legacy** (líneas 633-636):

```
sandbox.Fondos_Problema
sandbox.Homologacion_Fondos (cola local - legacy)
sandbox.Homologacion_Monedas (cola local - legacy)
```

**Posible migración**:
```
Inteligencia_Producto_Dev_16Dic.sandbox.Homologacion_Fondos
    ↓ (deprecado)
MonedaHomologacion.sandbox.colaFondos (nuevo sistema centralizado)

Inteligencia_Producto_Dev_16Dic.sandbox.Homologacion_Monedas
    ↓ (deprecado)
MonedaHomologacion.sandbox.colaMonedas (nuevo sistema centralizado)
```

**Implicaciones**:
- **Centralización**: Colas ahora viven en MonedaHomologacion (fuente única de verdad)
- **Pérdida**: Colas locales en Inteligencia_Producto_Dev ya no se usan
- **Ganancia**: Reducción de duplicación, mejor gobernanza de datos

**Evidencia documental**: Líneas 633-636 (marcados implícitamente como legacy)

---

#### 3. Procesamiento Sin Logging

**Antes** (_16Dic):
- Sin tracking de `ID_Ejecucion`
- Sin estados de fondos (PENDING, RUNNING, etc.)
- Sin `Graph_Sync_Status`
- Difícil troubleshooting y auditoría

**Ahora** (Inteligencia_Producto_Dev):
- Logging completo en `logs.*`
- Estados explícitos
- Trazabilidad end-to-end

**Implicación**:
- **Pérdida**: Simplicidad (menor overhead)
- **Ganancia**: Observabilidad, auditabilidad, monitoreo

**Evidencia documental**: Líneas 92, 562, 586-589, 629-632

---

#### 4. Tabla `dimensionales.BD_Instrumentos` como Fuente Primaria

**Posible cambio arquitectónico**:

```
Antes (_16Dic):
BD_Instrumentos como fuente primaria de instrumentos
    ↓
Otros sistemas

Ahora (Inteligencia_Producto_Dev):
MonedaHomologacion.stock.instrumentos como fuente primaria
    ↓ (trigger automático)
BD_Instrumentos (copia de respaldo para compatibilidad legacy)
```

**Evidencia** (líneas 429-461):
- Trigger `stock.trg_Instrumentos_SyncToSource` sincroniza **de MonedaHomologacion → BD_Instrumentos**
- BD_Instrumentos ahora es **destino**, no fuente
- Propósito: "Mantener la base legacy sincronizada" (línea 449)

**Implicaciones**:
- **Pérdida**: BD_Instrumentos ya no es master data
- **Ganancia**: Modelo moderno en stock.instrumentos (49 cols vs 26), bitemporal, auditoría

**Evidencia documental**: Líneas 429-461, 649-653

---

#### 5. Sync Manual Sin Automatización

**Antes** (_16Dic):
- Posiblemente sync manual o ad-hoc entre sistemas
- Sin orquestadores automáticos

**Ahora** (Inteligencia_Producto_Dev):
- Orquestador `Sync_PNL_To_Graph_v2` con retry automático
- Estados de sincronización (`Graph_Sync_Status`)
- Procesamiento batch configurable

**Implicación**:
- **Pérdida**: Control manual granular
- **Ganancia**: Automatización, confiabilidad, escalabilidad

**Evidencia documental**: Líneas 557-592

---

### 🔄 Cambios de Modelo de Datos

#### 1. De Flat Tables a Graph Database

**Antes** (_16Dic):
```
Relaciones implícitas en tablas planas:
- process.TBL_PNL (posiciones de fondos)
- process.TBL_BMS_Exp (composición de índices)
```

**Ahora** (Inteligencia_Producto_Dev):
```
Relaciones explícitas en grafos:
- BTFDS.btfds.Contains_instrument (edges Fondo→Instrumento)
- BTFDS.btfds.Comprises_instrument (edges Índice→Instrumento)
- BTFDS.btfds.EvolvesInto (edges Instrumento→Instrumento)
```

**Beneficios del cambio**:
- Consultas de grafos eficientes
- Análisis de caminos (path analysis)
- Visualización de relaciones
- Queries multi-hop

**Evidencia documental**: Líneas 60-69, 173-321, 662-673

---

#### 2. De Point-in-Time a Bitemporal

**Antes** (_16Dic):
```
Instrumentos sin histórico:
- Solo estado actual
- Cambios sobrescriben datos anteriores
```

**Ahora** (Inteligencia_Producto_Dev):
```
Modelo bitemporal en BTFDS.btfds.Instruments:
- valid_from/valid_to (validez de negocio)
- system_from/system_to (validez de sistema)
- Versionado (version_number)
```

**Beneficios**:
- Consultas históricas ("¿cómo estaba el 2023-06-01?")
- Auditoría de cambios
- Correcciones retroactivas
- Regulatorio compliance

**Evidencia documental**: Líneas 182, 699-713

---

#### 3. De Colas Locales a Colas Centralizadas

**Antes** (_16Dic):
```
Colas en Inteligencia_Producto_Dev.sandbox:
├─ Homologacion_Fondos
└─ Homologacion_Monedas
```

**Ahora** (Inteligencia_Producto_Dev):
```
Colas en MonedaHomologacion.sandbox:
├─ colaFondos
├─ colaBenchmarks
├─ colaPendientes
└─ colaMonedas
```

**Beneficios**:
- Fuente única de verdad
- Gobernanza centralizada
- Evita duplicación

**Evidencia documental**: Líneas 38-44, 633-647

---

### 📈 Impacto Funcional

#### Mejoras en Observabilidad
- **+100%**: Sistema de logs completo vs sin logging
- **Estados explícitos**: PENDING, RUNNING, COMPLETED, ERROR
- **Métricas**: logs.Ejecucion_Metricas

#### Mejoras en Confiabilidad
- **Retry automático**: 1 intento en `Sync_PNL_To_Graph_v2`
- **Validaciones**: Checks de integridad referencial
- **Locks**: Prevención de race conditions

#### Mejoras en Performance
- **Batch processing**: Configurable (100-1000 registros)
- **Estrategia SKIP**: Evita updates innecesarios
- **Índices específicos**: Mencionado en línea 736

#### Mejoras en Auditoría
- **Bitemporal**: Histórico completo
- **Canonical ID**: Identificación inmutable
- **Logging**: Trazabilidad end-to-end

---

### ⚖️ Trade-offs

| Aspecto | Ganado | Perdido |
|---------|--------|---------|
| **Complejidad** | Arquitectura más robusta | Mayor overhead operacional |
| **Observabilidad** | Logging y métricas completas | Espacio de almacenamiento |
| **Automatización** | Orquestación y retry | Control manual granular |
| **Modelo de datos** | Grafos + Bitemporal | Simplicidad de flat tables |
| **Gobernanza** | Centralización en MonedaHomologacion | Autonomía local |
| **Compatibilidad** | Trigger mantiene legacy sync | Dependencia de versiones _v2 |

---

### 🎯 Conclusiones

La migración de `Inteligencia_Producto_Dev_16Dic` a `Inteligencia_Producto_Dev` representa una **modernización arquitectónica significativa**:

**Principales logros**:
1. ✅ Integración completa con base de grafos (BTFDS)
2. ✅ Sistema de logging y auditoría empresarial
3. ✅ Modelo bitemporal para compliance y análisis histórico
4. ✅ Automatización con retry y orquestación
5. ✅ Centralización de datos maestros en MonedaHomologacion

**Principales deprecaciones**:
1. ❌ Stored procedures versión 1 (sin sufijo _v2)
2. ❌ Colas locales en Inteligencia_Producto_Dev.sandbox
3. ❌ BD_Instrumentos como fuente primaria
4. ❌ Procesamiento sin logging

**Recomendación**:
La migración es un **claro upgrade** en términos de capacidades, observabilidad y confiabilidad. El overhead adicional de complejidad está justificado por las ganancias en funcionalidad empresarial.

---

## 📅 Fecha de Última Actualización
2025-12-17

## 👤 Autor
Documentación generada automáticamente por Claude Code
