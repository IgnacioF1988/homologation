# Pipeline ETL de Fondos - Documentación para Frontend

**Versión**: 3.0
**Fecha**: Diciembre 2025
**Propósito**: Documentación técnica completa para implementar tracking en vivo del pipeline desde el frontend

---

## 📋 Tabla de Contenidos

1. [Resumen Ejecutivo](#resumen-ejecutivo)
2. [Arquitectura del Pipeline](#arquitectura-del-pipeline)
3. [Fases y Dependencias](#fases-y-dependencias)
4. [Modelo de Datos](#modelo-de-datos)
5. [API Reference](#api-reference)
6. [Estrategia de Polling](#estrategia-de-polling)
7. [Modelo de Datos para UI](#modelo-de-datos-para-ui)
8. [Animaciones y Visualización](#animaciones-y-visualización)
9. [Manejo de Errores](#manejo-de-errores)
10. [Ejemplos de Flujos](#ejemplos-de-flujos)
11. [Consideraciones Técnicas](#consideraciones-técnicas)

---

## 1. Resumen Ejecutivo

### 1.1 Propósito del Documento

Este documento provee toda la información necesaria para que el equipo de frontend implemente un sistema de tracking en vivo para el pipeline ETL de fondos. Incluye:

- Estructura completa del pipeline (7 fases con dependencias)
- Modelo de datos con 45+ campos de estado por fondo
- API endpoints documentados con ejemplos
- Estrategias de polling y optimización
- Ejemplos de código para parsing y visualización

### 1.2 Arquitectura General

El **Pipeline v2** es un sistema de procesamiento ETL que:

- **Procesa múltiples fondos en paralelo**: Hasta 999 fondos simultáneos
- **Ejecuta 7 fases secuenciales con dependencias**: EXTRACCION → VALIDACION → IPA → CAPM → DERIVADOS → PNL → UBS → CONCATENAR → GRAPH_SYNC
- **Tracking granular**: 45+ campos de estado por fondo, incluyendo sub-estados de cada SP
- **Retry automático**: Exponential backoff en errores recuperables
- **Estados inmutables**: Una vez OK, no cambia (except en reproceso)

### 1.3 Bases de Datos y Tablas

**Base de datos**: `Inteligencia_Producto_Dev`

**Schemas**:
- `logs`: Tracking de ejecuciones, fondos, logs y métricas
- `staging`: Tablas intermedias de transformación
- `process`: Tablas finales de resultados

**Tablas principales para tracking**:

| Tabla | Schema | Propósito |
|-------|--------|-----------|
| `Ejecuciones` | logs | Estado general de la ejecución |
| `Ejecucion_Fondos` | logs | Estado detallado por fondo (45+ campos) |
| `Ejecucion_Logs` | logs | Logs en tiempo real |
| `Ejecucion_Metricas` | logs | Métricas de validación |
| `TBL_IPA` | process | Resultado final IPA |
| `TBL_PNL` | process | Resultado final PNL |
| `TBL_PNL_IPA` | process | Consolidación PNL + IPA |

---

## 2. Arquitectura del Pipeline

### 2.1 Diagrama de Flujo

```
                        INICIO
                          │
                          ↓
                   ┌──────────────┐
                   │  EXTRACCION  │  (Batch - 8 SPs en paralelo)
                   │   (Batch)    │
                   └──────┬───────┘
                          │
                          ↓
                   ┌──────────────┐
                   │  VALIDACION  │  (Batch - 1 SP)
                   │   (Batch)    │
                   └──────┬───────┘
                          │
                ┌─────────┴─────────┐
                │                   │
                ↓                   ↓
         ┌──────────────┐    ┌─────────────┐
         │ PROCESS_IPA  │    │PROCESS_UBS  │  (Independiente)
         │ (7 SPs seq.) │    │ (3 SPs seq.)│
         └──────┬───────┘    └──────┬──────┘
                │                   │
                ├─────┬─────┬───────┤
                │     │     │       │
                ↓     ↓     ↓       │
            ┌─────┐ ┌────┐ ┌────┐  │
            │CAPM │ │DRV │ │PNL │  │
            │(2SP)│ │(4SP)│ │(5SP)│  │
            └──┬──┘ └──┬─┘ └──┬─┘  │
               │       │      │     │
               ↓       │      │     │
          ┌────────┐   │      │     │
          │CONSOL  │   │      │     │
          │ CAPM   │   │      │     │
          └───┬────┘   │      │     │
              │        │      │     │
              └────────┴──────┴─────┘
                       │
                       ↓
                ┌──────────────┐
                │  CONCATENAR  │  (Sequential - 1 SP)
                │ (Cubo final) │
                └──────┬───────┘
                       │
                       ↓
                ┌──────────────┐
                │  GRAPH_SYNC  │  (Opcional)
                │  (Opcional)  │
                └──────────────┘
                       │
                       ↓
                      FIN
```

### 2.2 Principios de Diseño

1. **Paralelización máxima**: Fondos se procesan en paralelo (hasta 999 simultáneos)
2. **Dependencias topológicas**: Kahn's algorithm calcula orden de ejecución
3. **Granularidad**: Tracking de sub-etapas (ej: IPA_01 hasta IPA_07)
4. **Independencia**: Algunos servicios (UBS) no dependen de IPA
5. **Condicionalidad**: Algunos servicios solo ejecutan si flags específicos (ej: Requiere_Derivados)

### 2.3 Tipos de Ejecución

| Tipo | Descripción | Paralelismo | Ejemplo |
|------|-------------|-------------|---------|
| **Batch** | Se ejecuta una sola vez por fecha (no por fondo) | Un solo worker | EXTRACCION, VALIDACION |
| **Parallel** | Se ejecuta por cada fondo en paralelo | Hasta 999 workers | PROCESS_IPA, PROCESS_CAPM, PROCESS_PNL |
| **Sequential** | Se ejecuta una sola vez al final (consolidación) | Un solo worker | CONCATENAR, CONSOLIDAR_CAPM |

---

## 3. Fases y Dependencias

### 3.1 Tabla de Fases

| Fase | ID | Tipo | Dependencias | Sub-etapas | Timeout | On Error |
|------|----|----- |--------------|------------|---------|----------|
| 0 | `EXTRACCION` | Batch | Ninguna | 8 SPs (6 paralelos + 2 seq.) | 3-5 min | STOP_ALL |
| 0.5 | `VALIDACION` | Batch | EXTRACCION | 1 SP | 2 min | LOG_WARNING |
| 1 | `PROCESS_IPA` | Parallel | VALIDACION | 7 SPs secuenciales | 2-3 min c/u | STOP_FUND |
| 2 | `PROCESS_CAPM` | Parallel | PROCESS_IPA | 2 SPs secuenciales | 2 min c/u | STOP_FUND |
| 2b | `CONSOLIDAR_CAPM` | Sequential | PROCESS_CAPM | 1 SP | 5 min | STOP_ALL |
| 3 | `PROCESS_DERIVADOS` | Parallel (condicional) | PROCESS_IPA | 4 SPs secuenciales | 2-3 min c/u | CONTINUE |
| 4 | `PROCESS_PNL` | Parallel | PROCESS_IPA | 5 SPs secuenciales | 2-3 min c/u | STOP_FUND |
| 5 | `PROCESS_UBS` | Parallel | EXTRACCION (independiente de IPA) | 3 SPs (2 condicionales) | 2-3 min c/u | CONTINUE |
| 6 | `CONCATENAR` | Sequential | PROCESS_CAPM, PROCESS_PNL, PROCESS_UBS | 1 SP | 10 min | STOP_ALL |
| 7 | `GRAPH_SYNC` | Sequential (condicional) | PROCESS_PNL, CONCATENAR | 1 SP | 10 min | LOG_WARNING |

### 3.2 Sub-etapas Detalladas

#### PROCESS_IPA (7 sub-etapas secuenciales)

| ID | Nombre | Descripción | Campo de Estado |
|----|--------|-------------|-----------------|
| IPA_01 | RescatarLocalPrice | Extrae datos de IPA y PosModRF | `Estado_IPA_01_RescatarLocalPrice` |
| IPA_02 | AjusteSONA | Calcula ajustes SONA vs IPA | `Estado_IPA_02_AjusteSONA` |
| IPA_03 | RenombrarCxCCxP | Renombra cuentas por cobrar/pagar | `Estado_IPA_03_RenombrarCxCCxP` |
| IPA_04 | TratamientoSuciedades | Trata suciedades (valores pequeños) | `Estado_IPA_04_TratamientoSuciedades` |
| IPA_05 | EliminarCajasMTM | Elimina cajas MTM duplicadas | `Estado_IPA_05_EliminarCajasMTM` |
| IPA_06 | CrearDimensiones | Homologa dimensiones (fondos, instrumentos, monedas) | `Estado_IPA_06_CrearDimensiones` |
| IPA_07 | AgruparRegistros | Agrupa registros finales | `Estado_IPA_07_AgruparRegistros` |

#### PROCESS_CAPM (3 sub-etapas)

| ID | Nombre | Descripción | Campo de Estado |
|----|--------|-------------|-----------------|
| CAPM_01 | Ajuste | Calcula ajuste entre IPA_Cash y CAPM | `Estado_CAPM_01_Ajuste` |
| CAPM_02 | ExtractTransform | Extrae y homologa datos CAPM | `Estado_CAPM_02_ExtractTransform` |
| CAPM_03 | CargaFinal | Consolidación CAPM (batch final - una sola vez) | `Estado_CAPM_03_CargaFinal` |

#### PROCESS_DERIVADOS (4 sub-etapas - condicional si `Requiere_Derivados = true`)

| ID | Nombre | Descripción | Campo de Estado |
|----|--------|-------------|-----------------|
| DERIV_01 | Posiciones | Extrae posiciones long/short de derivados | `Estado_DERIV_01_Posiciones` |
| DERIV_02 | Dimensiones | Homologa dimensiones | `Estado_DERIV_02_Dimensiones` |
| DERIV_03 | Ajuste | Ajustes específicos de derivados | `Estado_DERIV_03_Ajuste` |
| DERIV_04 | Paridad | Ajuste de paridad | `Estado_DERIV_04_Paridad` |

#### PROCESS_PNL (5 sub-etapas)

| ID | Nombre | Descripción | Campo de Estado |
|----|--------|-------------|-----------------|
| PNL_01 | Dimensiones | Homologación dimensional de PNL | `Estado_PNL_01_Dimensiones` |
| PNL_02 | Ajuste | Ajustes específicos de PNL | `Estado_PNL_02_Ajuste` |
| PNL_03 | Agrupacion | Agrupación de registros PNL | `Estado_PNL_03_Agrupacion` |
| PNL_04 | AjusteIPA | Crea ajustes contra IPA | `Estado_PNL_04_AjusteIPA` |
| PNL_05 | Consolidar | Consolidación final IPA + PNL | `Estado_PNL_05_Consolidar` |

#### PROCESS_UBS (3 sub-etapas - 2 condicionales si `Es_MLCCII = true`)

| ID | Nombre | Descripción | Campo de Estado | Condicional |
|----|--------|-------------|-----------------|-------------|
| UBS_01 | Tratamiento | Extrae y trata datos UBS | `Estado_UBS_01_Tratamiento` | - |
| UBS_02 | Derivados | Derivados MLCCII | `Estado_UBS_02_Derivados` | Es_MLCCII |
| UBS_03 | Cartera | Crea cartera MLCCII | `Estado_UBS_03_Cartera` | Es_MLCCII |

### 3.3 Grafo de Dependencias

```
EXTRACCION
    │
    ↓
VALIDACION
    │
    ├────────────────────┬─────────────────────┐
    │                    │                     │
    ↓                    ↓                     │
PROCESS_IPA      PROCESS_UBS                  │
    │                    │                     │
    ├───────┬────────┐   │                     │
    │       │        │   │                     │
    ↓       ↓        ↓   │                     │
PROCESS  PROCESS  PROCESS │                    │
 CAPM     DERIV    PNL    │                    │
    │       │        │    │                    │
    ↓       │        │    │                    │
CONSOLIDAR │        │    │                    │
  CAPM     │        │    │                    │
    │       │        │    │                    │
    └───────┴────────┴────┴────────────────────┘
                     │
                     ↓
                CONCATENAR
                     │
                     ↓
                GRAPH_SYNC
```

---

## 4. Modelo de Datos

### 4.1 Interface: `Ejecucion` (logs.Ejecuciones)

```typescript
interface Ejecucion {
  // Identificadores
  ID_Ejecucion: bigint;              // ID único de la ejecución (autoincremental)
  FechaReporte: string;              // Fecha a procesar (YYYY-MM-DD)

  // Timestamps
  FechaInicio: Date;                 // Timestamp de inicio
  FechaFin: Date | null;             // Timestamp de finalización (null si en progreso)
  FechaActualizacion: Date;          // Última actualización

  // Estado general
  Estado: EstadoEjecucion;           // EN_PROGRESO | COMPLETADO | ERROR | PARCIAL
  Etapa_Actual: string;              // Etapa en curso (ej: 'PROCESS_IPA')

  // Resumen de fondos
  TotalFondos: number;               // Total de fondos a procesar
  FondosExitosos: number;            // Fondos completados exitosamente
  FondosFallidos: number;            // Fondos con error
  FondosWarning: number;             // Fondos con warnings
  FondosOmitidos: number;            // Fondos omitidos (por condicionales)

  // Duración
  TiempoTotal_Segundos: number | null; // Duración total en segundos
  Duracion_Total_Ms: number | null;    // Duración total en milisegundos

  // Metadatos
  Usuario: string;                   // Usuario que inició la ejecución
  Process_Date: Date;                // Fecha de procesamiento
}

type EstadoEjecucion = 'INICIANDO' | 'EN_PROGRESO' | 'COMPLETADO' | 'FALLIDO' | 'PARCIAL';
```

### 4.2 Interface: `EjecucionFondo` (logs.Ejecucion_Fondos)

```typescript
interface EjecucionFondo {
  // Identificadores
  ID: number;                        // ID autoincremental
  ID_Ejecucion: bigint;              // FK a Ejecuciones
  ID_Fund: string;                   // ID del fondo (VARCHAR)
  FundShortName: string;             // Nombre corto del fondo (ej: 'MRCLP', 'MLAT')
  FundName: string;                  // Nombre completo (JOIN con BD_Funds)

  // Portfolios por fuente
  Portfolio_Geneva: string;          // Portfolio code principal
  Portfolio_CAPM: string | null;     // Portfolio code para CAPM
  Portfolio_Derivados: string | null; // Portfolio code para derivados
  Portfolio_UBS: string | null;      // Portfolio code para UBS

  // ============================================
  // ESTADOS PRINCIPALES (por etapa)
  // ============================================
  Estado_Extraccion: EstadoEtapa;
  Estado_Validacion: EstadoEtapa;
  Estado_Process_IPA: EstadoEtapa;
  Estado_Process_CAPM: EstadoEtapa;
  Estado_Process_Derivados: EstadoEtapa;
  Estado_Process_PNL: EstadoEtapa;
  Estado_Process_UBS: EstadoEtapa;
  Estado_Concatenar: EstadoEtapa;
  Estado_Graph_Sync: EstadoEtapa | null;
  Estado_Final: EstadoFinal;         // Resumen final del fondo

  // ============================================
  // SUB-ESTADOS IPA (7 campos)
  // ============================================
  Estado_IPA_01_RescatarLocalPrice: EstadoEtapa | null;
  Estado_IPA_02_AjusteSONA: EstadoEtapa | null;
  Estado_IPA_03_RenombrarCxCCxP: EstadoEtapa | null;
  Estado_IPA_04_TratamientoSuciedades: EstadoEtapa | null;
  Estado_IPA_05_EliminarCajasMTM: EstadoEtapa | null;
  Estado_IPA_06_CrearDimensiones: EstadoEtapa | null;
  Estado_IPA_07_AgruparRegistros: EstadoEtapa | null;

  // ============================================
  // SUB-ESTADOS CAPM (3 campos)
  // ============================================
  Estado_CAPM_01_Ajuste: EstadoEtapa | null;
  Estado_CAPM_02_ExtractTransform: EstadoEtapa | null;
  Estado_CAPM_03_CargaFinal: EstadoEtapa | null;

  // ============================================
  // SUB-ESTADOS DERIVADOS (4 campos)
  // ============================================
  Estado_DERIV_01_Posiciones: EstadoEtapa | null;
  Estado_DERIV_02_Dimensiones: EstadoEtapa | null;
  Estado_DERIV_03_Ajuste: EstadoEtapa | null;
  Estado_DERIV_04_Paridad: EstadoEtapa | null;

  // ============================================
  // SUB-ESTADOS PNL (5 campos)
  // ============================================
  Estado_PNL_01_Dimensiones: EstadoEtapa | null;
  Estado_PNL_02_Ajuste: EstadoEtapa | null;
  Estado_PNL_03_Agrupacion: EstadoEtapa | null;
  Estado_PNL_04_AjusteIPA: EstadoEtapa | null;
  Estado_PNL_05_Consolidar: EstadoEtapa | null;

  // ============================================
  // SUB-ESTADOS UBS (3 campos)
  // ============================================
  Estado_UBS_01_Tratamiento: EstadoEtapa | null;
  Estado_UBS_02_Derivados: EstadoEtapa | null;
  Estado_UBS_03_Cartera: EstadoEtapa | null;

  // ============================================
  // INFORMACIÓN DE ERROR
  // ============================================
  Ultimo_Paso_Exitoso: string | null;     // Último paso que completó exitosamente
  Paso_Con_Error: string | null;          // Etapa donde ocurrió el error
  Mensaje_Error: string | null;           // Mensaje de error (max 500 chars)

  // ============================================
  // FLAGS Y CONDICIONALES
  // ============================================
  Requiere_Derivados: boolean;       // Si requiere procesamiento de derivados
  Incluir_En_Cubo: boolean;          // Si debe incluirse en cubo final
  Elegible_Reproceso: boolean;       // Si puede ser reprocesado
  Es_MLCCII: boolean;                // Si es fondo MLCCII (para UBS_02 y UBS_03)
  Flag_UBS: boolean;                 // Si procesa por UBS
  Flag_Derivados: boolean;           // Si tiene derivados

  // ============================================
  // TIMESTAMPS Y DURACIÓN
  // ============================================
  Inicio_Procesamiento: Date;
  Fin_Procesamiento: Date | null;
  Duracion_Ms: number | null;        // Duración en milisegundos
  FechaActualizacion: Date;
}

// ============================================
// ENUMS DE ESTADOS
// ============================================

type EstadoEtapa =
  | 'PENDIENTE'     // No ha iniciado
  | 'EN_PROGRESO'   // Ejecutando actualmente
  | 'OK'            // Completado exitosamente
  | 'ERROR'         // Completado con error
  | 'WARNING'       // Completado con warnings
  | 'OMITIDO'       // Omitido por estrategia de error (ej: fondo con error en IPA)
  | 'N/A';          // No aplica (ej: fondo sin derivados)

type EstadoFinal =
  | 'PENDIENTE'     // Esperando inicio
  | 'EN_PROGRESO'   // Procesando
  | 'OK'            // Completado exitosamente
  | 'ERROR'         // Falló en alguna etapa
  | 'PARCIAL'       // Completó algunas etapas pero no todas
  | 'WARNING';      // Completó con warnings
```

### 4.3 Interface: `EjecucionLog` (logs.Ejecucion_Logs)

```typescript
interface EjecucionLog {
  ID: number;                        // ID autoincremental
  ID_Ejecucion: bigint;              // FK a Ejecuciones
  ID_Fund: string | null;            // ID del fondo (null para logs generales)
  Timestamp: Date;                   // Timestamp del evento
  Nivel: NivelLog;                   // DEBUG | INFO | WARNING | ERROR
  Categoria: string;                 // Categoría (ej: 'PIPELINE', 'SISTEMA')
  Etapa: string;                     // Etapa del pipeline (ej: 'PROCESS_IPA')
  SubEtapa: string | null;           // Sub-etapa (ej: 'IPA_01')
  Mensaje: string;                   // Mensaje descriptivo (max 2000 chars)
  Detalle: string | null;            // Detalle adicional (text)
  Datos_JSON: string | null;         // Metadata en JSON
  Stack_Trace: string | null;        // Stack trace de errores
}

type NivelLog = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR';
```

### 4.4 Interface: `EjecucionMetrica` (logs.Ejecucion_Metricas)

```typescript
interface EjecucionMetrica {
  ID: number;                        // ID autoincremental
  ID_Ejecucion: bigint;              // FK a Ejecuciones
  ID_Fund: string;                   // ID del fondo
  FundShortName: string;             // Nombre corto (JOIN)
  Etapa: string;                     // Etapa que generó la métrica
  Metrica_Nombre: string;            // Nombre de la métrica (ej: 'TotalRegistros')

  // Validación
  Valor_Esperado: number | null;    // Valor esperado
  Valor_Obtenido: number | null;    // Valor obtenido
  Diferencia: number | null;         // Diferencia absoluta
  Diferencia_Porcentual: number | null; // Diferencia %
  Validacion_OK: boolean;            // Si pasó la validación

  // Contadores
  Registros_Entrada: number | null;  // Registros que entraron
  Registros_Procesados: number | null; // Registros procesados
  Registros_Salida: number | null;   // Registros de salida
  Registros_Error: number | null;    // Registros con error

  // Valores financieros
  Suma_MVBook: number | null;        // Suma de MVBook (Market Value Book)
  Suma_AI: number | null;            // Suma de AI (Accrued Interest)
  Suma_TotalMVal: number | null;     // Suma total de valor de mercado

  // Timestamp
  Timestamp: Date;                   // Timestamp de medición
}
```

---

## 5. API Reference

### 5.1 POST `/api/procesos/v2/ejecutar`

**Descripción**: Inicia una nueva ejecución del pipeline para todos los fondos activos.

**Request**:
```typescript
POST /api/procesos/v2/ejecutar
Content-Type: application/json

{
  fechaReporte: string;  // YYYY-MM-DD (requerido)
  idFund?: string;       // NO SOPORTADO en la versión actual
}
```

**Response (200 OK)**:
```typescript
{
  success: true,
  data: {
    ID_Ejecucion: bigint;           // ID único de la ejecución
    FechaReporte: string;           // Fecha reportada (YYYY-MM-DD)
    ID_Fund: null;                  // Siempre null (procesa todos)
    Estado: "EN_PROGRESO",          // Estado inicial
    IniciadoEn: string;             // ISO timestamp
  }
}
```

**Response (400 Bad Request)**:
```typescript
{
  success: false,
  error: string  // Mensaje de error
}
```

**Comportamiento**:
1. Llama a `logs.sp_Inicializar_Ejecucion` para crear la ejecución
2. Registra todos los fondos activos en `logs.Ejecucion_Fondos`
3. Responde inmediatamente con el ID de ejecución
4. Ejecuta `process.Process_Funds` en background
5. La ejecución se almacena en memoria con TTL de 1 hora

**Ejemplo**:
```javascript
const response = await fetch('/api/procesos/v2/ejecutar', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ fechaReporte: '2025-10-24' })
});

const { data } = await response.json();
console.log(`Ejecución iniciada: ${data.ID_Ejecucion}`);
```

---

### 5.2 GET `/api/procesos/v2/ejecucion/:id`

**Descripción**: Obtiene estado completo de una ejecución con fondos, logs recientes y métricas.

**Request**:
```typescript
GET /api/procesos/v2/ejecucion/:id
```

**Response (200 OK)**:
```typescript
{
  success: true,
  data: {
    ejecucion: Ejecucion;            // Estado general
    fondos: EjecucionFondo[];        // Array de fondos con estado
    logs: EjecucionLog[];            // Últimos 100 logs (ordenados cronológicamente)
    metricas: EjecucionMetrica[];    // Métricas con error (Validacion_OK = 0)
  }
}
```

**Ordenamiento de fondos**:
```sql
ORDER BY
  CASE Estado_Final
    WHEN 'ERROR' THEN 1      -- Errores primero
    WHEN 'PARCIAL' THEN 2
    WHEN 'WARNING' THEN 3
    WHEN 'OK' THEN 4
    ELSE 5
  END,
  FundShortName              -- Luego alfabético
```

**Ejemplo de uso**:
```javascript
const response = await fetch(`/api/procesos/v2/ejecucion/${idEjecucion}`);
const { ejecucion, fondos, logs, metricas } = await response.json();

// Detectar fondos con error
const fondosConError = fondos.filter(f => f.Estado_Final === 'ERROR');

// Detectar fondos en progreso
const fondosEnProgreso = fondos.filter(f => f.Estado_Final === 'EN_PROGRESO');

// Calcular progreso general
const totalFondos = fondos.length;
const fondosCompletados = fondos.filter(f => f.Estado_Final === 'OK').length;
const progresoGeneral = (fondosCompletados / totalFondos) * 100;
```

---

### 5.3 GET `/api/procesos/v2/ejecucion/:id/fondos`

**Descripción**: Obtiene lista de fondos con filtros opcionales.

**Request**:
```typescript
GET /api/procesos/v2/ejecucion/:id/fondos?estado=ERROR&etapa=Process_IPA
```

**Query Parameters**:
- `estado` (opcional): Filtrar por `Estado_Final` (ej: `ERROR`, `OK`)
- `etapa` (opcional): Filtrar fondos con error en una etapa específica (ej: `Process_IPA`)

**Response (200 OK)**:
```typescript
{
  success: true,
  data: EjecucionFondo[];  // Array de fondos (incluye join con BD_Funds)
}
```

**Ejemplo**:
```javascript
// Fondos con error
const errorFondos = await fetch(`/api/procesos/v2/ejecucion/${id}/fondos?estado=ERROR`);

// Fondos con error en IPA
const ipaErrorFondos = await fetch(`/api/procesos/v2/ejecucion/${id}/fondos?etapa=Process_IPA`);
```

---

### 5.4 GET `/api/procesos/v2/ejecucion/:id/logs`

**Descripción**: Obtiene logs con filtros y paginación.

**Request**:
```typescript
GET /api/procesos/v2/ejecucion/:id/logs?idFund=20&nivel=ERROR&offset=0&limit=100
```

**Query Parameters**:
- `idFund` (opcional): Filtrar por fondo
- `nivel` (opcional): Filtrar por nivel (DEBUG, INFO, WARNING, ERROR)
- `etapa` (opcional): Filtrar por etapa
- `offset` (opcional, default: 0): Offset para paginación
- `limit` (opcional, default: 100): Límite de resultados

**Response (200 OK)**:
```typescript
{
  success: true,
  data: {
    logs: EjecucionLog[];     // Logs ordenados cronológicamente
    total: number;            // Total de logs disponibles
    offset: number;           // Offset actual
  }
}
```

**Ejemplo de paginación**:
```javascript
// Página 1 (primeros 100)
const page1 = await fetch(`/api/procesos/v2/ejecucion/${id}/logs?offset=0&limit=100`);

// Página 2 (siguientes 100)
const page2 = await fetch(`/api/procesos/v2/ejecucion/${id}/logs?offset=100&limit=100`);

// Solo errores del fondo MRCLP (ID_Fund = '20')
const errors = await fetch(`/api/procesos/v2/ejecucion/${id}/logs?idFund=20&nivel=ERROR`);
```

---

### 5.5 GET `/api/procesos/v2/ejecucion/:id/metricas`

**Descripción**: Obtiene métricas de validación.

**Request**:
```typescript
GET /api/procesos/v2/ejecucion/:id/metricas?idFund=20
```

**Query Parameters**:
- `idFund` (opcional): Filtrar por fondo

**Response (200 OK)**:
```typescript
{
  success: true,
  data: EjecucionMetrica[];  // Métricas ordenadas por etapa
}
```

**Ejemplo de uso**:
```javascript
const response = await fetch(`/api/procesos/v2/ejecucion/${id}/metricas`);
const metricas = await response.json();

// Detectar problemas de cuadratura
const metricasProblematicas = metricas.filter(m =>
  !m.Validacion_OK && m.Diferencia_Porcentual > 0.01
);

// Agrupar por fondo
const metricasPorFondo = metricas.reduce((acc, m) => {
  if (!acc[m.ID_Fund]) acc[m.ID_Fund] = [];
  acc[m.ID_Fund].push(m);
  return acc;
}, {});
```

---

### 5.6 GET `/api/procesos/v2/ejecucion/:id/diagnostico`

**Descripción**: Obtiene diagnóstico completo de errores (útil para troubleshooting).

**Request**:
```typescript
GET /api/procesos/v2/ejecucion/:id/diagnostico
```

**Response (200 OK)**:
```typescript
{
  success: true,
  data: {
    fondosConError: Array<{
      ID_Fund: string;
      FundShortName: string;
      Paso_Con_Error: string;
      Mensaje_Error: string;
      Valor_Esperado: number | null;
      Valor_Obtenido: number | null;
      Diferencia: number | null;
      Diferencia_Porcentual: number | null;
    }>;
    logsError: EjecucionLog[];  // Todos los logs con nivel ERROR
    resumenErrores: Array<{
      Paso_Con_Error: string;
      CantidadFondos: number;
      Fondos: string;           // Lista de fondos separados por comas
    }>;
  }
}
```

**Ejemplo de uso**:
```javascript
const { data } = await fetch(`/api/procesos/v2/ejecucion/${id}/diagnostico`);

// Identificar paso más problemático
const pasoMasProblematico = data.resumenErrores.reduce((prev, current) =>
  (current.CantidadFondos > prev.CantidadFondos) ? current : prev
);

console.log(`Paso con más errores: ${pasoMasProblematico.Paso_Con_Error}`);
console.log(`Fondos afectados: ${pasoMasProblematico.CantidadFondos}`);
```

---

### 5.7 POST `/api/procesos/v2/ejecucion/:id/reprocesar`

**Descripción**: Reprocesa un fondo específico que falló.

**Request**:
```typescript
POST /api/procesos/v2/ejecucion/:id/reprocesar
Content-Type: application/json

{
  idFund: string;  // ID del fondo a reprocesar (requerido)
}
```

**Response (200 OK)**:
```typescript
{
  success: true,
  message: string,
  data: {
    ID_Ejecucion: bigint;
    ID_Fund: string;
    FechaReporte: string;
  }
}
```

**Validaciones**:
- El fondo debe existir en la ejecución
- El fondo debe tener `Elegible_Reproceso = true`
- Solo fondos con `Estado_Final IN ('ERROR', 'PARCIAL', 'WARNING')` pueden reprocesarse

**Comportamiento**:
1. Resetea todos los estados del fondo a NULL
2. Marca `Elegible_Reproceso = false` (para evitar reprocesos duplicados)
3. Responde inmediatamente
4. Ejecuta el pipeline en background para ese fondo
5. Reutiliza el mismo `ID_Ejecucion` (no crea uno nuevo)

**Ejemplo**:
```javascript
const response = await fetch(`/api/procesos/v2/ejecucion/${id}/reprocesar`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ idFund: '20' })
});

if (response.ok) {
  console.log('Fondo reprocesado exitosamente');
  // Reiniciar polling para monitorear el progreso
}
```

---

## 6. Estrategia de Polling

### 6.1 Frecuencias Recomendadas

```javascript
const POLLING_CONFIG = {
  // Estado general de la ejecución
  ejecucionGeneral: {
    endpoint: '/api/procesos/v2/ejecucion/:id',
    interval: 2000,  // 2 segundos
    stopWhen: (data) => ['COMPLETADO', 'ERROR', 'PARCIAL'].includes(data.ejecucion.Estado)
  },

  // Logs en tiempo real (solo si panel de logs está visible)
  logs: {
    endpoint: '/api/procesos/v2/ejecucion/:id/logs',
    interval: 3000,  // 3 segundos
    stopWhen: () => false,  // Continuar mientras esté abierto
    params: { offset: 0, limit: 100 }
  },

  // Métricas (solo si hay errores detectados)
  metricas: {
    endpoint: '/api/procesos/v2/ejecucion/:id/metricas',
    interval: 5000,  // 5 segundos
    stopWhen: () => false,
    triggerWhen: (ejecucion) => ejecucion.FondosFallidos > 0
  }
};
```

### 6.2 Implementación de Polling Inteligente

```javascript
class PipelinePoller {
  constructor(idEjecucion) {
    this.idEjecucion = idEjecucion;
    this.interval = null;
    this.previousState = {};
  }

  // Iniciar polling
  start() {
    this.interval = setInterval(async () => {
      const response = await fetch(`/api/procesos/v2/ejecucion/${this.idEjecucion}`);
      const { ejecucion, fondos, logs } = await response.json();

      // Detectar cambios de estado
      if (this.hasStateChanged(fondos)) {
        this.onStateChange({ ejecucion, fondos, logs });
      }

      // Detener si ejecución completada
      if (['COMPLETADO', 'ERROR', 'PARCIAL'].includes(ejecucion.Estado)) {
        this.stop();
        this.onComplete({ ejecucion, fondos });
      }

      this.previousState = fondos;
    }, 2000);
  }

  // Detectar cambios de estado
  hasStateChanged(newFondos) {
    if (!this.previousState || this.previousState.length === 0) return true;

    return newFondos.some((newFondo, idx) => {
      const oldFondo = this.previousState[idx];
      if (!oldFondo) return true;

      // Comparar estados principales
      return (
        newFondo.Estado_Process_IPA !== oldFondo.Estado_Process_IPA ||
        newFondo.Estado_Process_CAPM !== oldFondo.Estado_Process_CAPM ||
        newFondo.Estado_Process_Derivados !== oldFondo.Estado_Process_Derivados ||
        newFondo.Estado_Process_PNL !== oldFondo.Estado_Process_PNL ||
        newFondo.Estado_Process_UBS !== oldFondo.Estado_Process_UBS ||
        newFondo.Estado_Final !== oldFondo.Estado_Final
      );
    });
  }

  // Detener polling
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  // Callbacks (implementar según necesidad)
  onStateChange(data) {
    // Actualizar UI
    console.log('Estado cambió:', data);
  }

  onComplete(data) {
    // Ejecución completada
    console.log('Ejecución completada:', data);
  }
}

// Uso
const poller = new PipelinePoller(12345);
poller.start();
```

### 6.3 Optimización: Detección de Cambios

```javascript
// Calcular checksum simple de estados para comparación rápida
function calculateStateChecksum(fondos) {
  return fondos.map(f =>
    `${f.ID_Fund}:${f.Estado_Final}:${f.Estado_Process_IPA}:${f.Estado_Process_CAPM}`
  ).join('|');
}

// Usar checksum para evitar procesamiento innecesario
class OptimizedPoller extends PipelinePoller {
  async poll() {
    const response = await fetch(`/api/procesos/v2/ejecucion/${this.idEjecucion}`);
    const data = await response.json();

    const newChecksum = calculateStateChecksum(data.fondos);

    if (newChecksum !== this.previousChecksum) {
      this.onStateChange(data);
      this.previousChecksum = newChecksum;
    }
  }
}
```

---

## 7. Modelo de Datos para UI

### 7.1 Estado Global de la Aplicación (React/Zustand/Redux)

```typescript
interface PipelineState {
  // Ejecución actual
  ejecucion: Ejecucion | null;
  fondos: Map<string, FondoUI>;  // Key: ID_Fund
  logs: EjecucionLog[];
  metricas: Map<string, EjecucionMetrica[]>;  // Key: ID_Fund

  // Filtros
  filters: {
    fondoSeleccionado: string | null;
    etapaSeleccionada: string | null;
    soloErrores: boolean;
  };

  // UI state
  ui: {
    isPolling: boolean;
    lastUpdate: Date;
    error: string | null;
  };
}
```

### 7.2 Modelo de Fondo para UI

```typescript
interface FondoUI {
  // Datos básicos
  idFund: string;
  fundShortName: string;
  fundName: string;

  // Progreso general
  estadoFinal: EstadoFinal;
  progresoGeneral: number;  // 0-100%

  // Progreso por etapa
  etapas: {
    [etapaId: string]: EtapaUI;
  };

  // Error info
  error: {
    paso: string | null;
    mensaje: string | null;
  };

  // Flags
  flags: {
    requiereDerivados: boolean;
    incluirEnCubo: boolean;
    elegibleReproceso: boolean;
    esMlccii: boolean;
  };

  // Métricas
  duracion: number | null;  // ms
  inicioTimestamp: Date;
  finTimestamp: Date | null;
}

interface EtapaUI {
  id: string;              // ej: 'PROCESS_IPA'
  nombre: string;          // ej: 'IPA'
  estado: EstadoEtapa;
  progreso: number;        // 0-100%
  subEtapas: SubEtapaUI[];
  animacion: 'idle' | 'loading' | 'success' | 'error' | 'warning';
}

interface SubEtapaUI {
  id: string;              // ej: 'IPA_01'
  nombre: string;          // ej: 'Rescatar Local Price'
  estado: EstadoEtapa;
  orden: number;           // 1-N
}
```

### 7.3 Parser de API a Modelo UI

```typescript
class FondoParser {
  static parseToUI(fondoAPI: EjecucionFondo): FondoUI {
    return {
      idFund: fondoAPI.ID_Fund,
      fundShortName: fondoAPI.FundShortName,
      fundName: fondoAPI.FundName,
      estadoFinal: fondoAPI.Estado_Final,
      progresoGeneral: this.calculateProgreso(fondoAPI),
      etapas: {
        EXTRACCION: this.parseEtapa('EXTRACCION', 'Extracción', fondoAPI.Estado_Extraccion, []),
        VALIDACION: this.parseEtapa('VALIDACION', 'Validación', fondoAPI.Estado_Validacion, []),
        PROCESS_IPA: this.parseEtapa('PROCESS_IPA', 'IPA', fondoAPI.Estado_Process_IPA, this.parseIPASubetapas(fondoAPI)),
        PROCESS_CAPM: this.parseEtapa('PROCESS_CAPM', 'CAPM', fondoAPI.Estado_Process_CAPM, this.parseCAPMSubetapas(fondoAPI)),
        PROCESS_DERIVADOS: this.parseEtapa('PROCESS_DERIVADOS', 'Derivados', fondoAPI.Estado_Process_Derivados, this.parseDerivadosSubetapas(fondoAPI)),
        PROCESS_PNL: this.parseEtapa('PROCESS_PNL', 'PNL', fondoAPI.Estado_Process_PNL, this.parsePNLSubetapas(fondoAPI)),
        PROCESS_UBS: this.parseEtapa('PROCESS_UBS', 'UBS', fondoAPI.Estado_Process_UBS, this.parseUBSSubetapas(fondoAPI)),
        CONCATENAR: this.parseEtapa('CONCATENAR', 'Cubo', fondoAPI.Estado_Concatenar, [])
      },
      error: {
        paso: fondoAPI.Paso_Con_Error,
        mensaje: fondoAPI.Mensaje_Error
      },
      flags: {
        requiereDerivados: fondoAPI.Requiere_Derivados,
        incluirEnCubo: fondoAPI.Incluir_En_Cubo,
        elegibleReproceso: fondoAPI.Elegible_Reproceso,
        esMlccii: fondoAPI.Es_MLCCII
      },
      duracion: fondoAPI.Duracion_Ms,
      inicioTimestamp: fondoAPI.Inicio_Procesamiento,
      finTimestamp: fondoAPI.Fin_Procesamiento
    };
  }

  // Calcular progreso general (0-100)
  static calculateProgreso(fondo: EjecucionFondo): number {
    const etapas = [
      fondo.Estado_Extraccion,
      fondo.Estado_Validacion,
      fondo.Estado_Process_IPA,
      fondo.Estado_Process_CAPM,
      fondo.Estado_Process_Derivados,
      fondo.Estado_Process_PNL,
      fondo.Estado_Process_UBS,
      fondo.Estado_Concatenar
    ];

    const completadas = etapas.filter(e =>
      e === 'OK' || e === 'N/A' || e === 'OMITIDO'
    ).length;

    return (completadas / etapas.length) * 100;
  }

  // Parsear una etapa
  static parseEtapa(id: string, nombre: string, estado: EstadoEtapa, subEtapas: SubEtapaUI[]): EtapaUI {
    const progreso = subEtapas.length > 0
      ? this.calculateSubEtapasProgreso(subEtapas)
      : this.getEstadoProgreso(estado);

    return {
      id,
      nombre,
      estado,
      progreso,
      subEtapas,
      animacion: this.getAnimacion(estado)
    };
  }

  // Parsear sub-etapas de IPA
  static parseIPASubetapas(fondo: EjecucionFondo): SubEtapaUI[] {
    return [
      { id: 'IPA_01', nombre: 'Rescatar Local Price', estado: fondo.Estado_IPA_01_RescatarLocalPrice, orden: 1 },
      { id: 'IPA_02', nombre: 'Ajuste SONA', estado: fondo.Estado_IPA_02_AjusteSONA, orden: 2 },
      { id: 'IPA_03', nombre: 'Renombrar CxC/CxP', estado: fondo.Estado_IPA_03_RenombrarCxCCxP, orden: 3 },
      { id: 'IPA_04', nombre: 'Tratamiento Suciedades', estado: fondo.Estado_IPA_04_TratamientoSuciedades, orden: 4 },
      { id: 'IPA_05', nombre: 'Eliminar Cajas MTM', estado: fondo.Estado_IPA_05_EliminarCajasMTM, orden: 5 },
      { id: 'IPA_06', nombre: 'Crear Dimensiones', estado: fondo.Estado_IPA_06_CrearDimensiones, orden: 6 },
      { id: 'IPA_07', nombre: 'Agrupar Registros', estado: fondo.Estado_IPA_07_AgruparRegistros, orden: 7 }
    ];
  }

  // Parsear sub-etapas de CAPM
  static parseCAPMSubetapas(fondo: EjecucionFondo): SubEtapaUI[] {
    return [
      { id: 'CAPM_01', nombre: 'Ajuste CAPM', estado: fondo.Estado_CAPM_01_Ajuste, orden: 1 },
      { id: 'CAPM_02', nombre: 'Extract Transform', estado: fondo.Estado_CAPM_02_ExtractTransform, orden: 2 },
      { id: 'CAPM_03', nombre: 'Carga Final', estado: fondo.Estado_CAPM_03_CargaFinal, orden: 3 }
    ];
  }

  // Parsear sub-etapas de Derivados
  static parseDerivadosSubetapas(fondo: EjecucionFondo): SubEtapaUI[] {
    return [
      { id: 'DERIV_01', nombre: 'Posiciones', estado: fondo.Estado_DERIV_01_Posiciones, orden: 1 },
      { id: 'DERIV_02', nombre: 'Dimensiones', estado: fondo.Estado_DERIV_02_Dimensiones, orden: 2 },
      { id: 'DERIV_03', nombre: 'Ajuste', estado: fondo.Estado_DERIV_03_Ajuste, orden: 3 },
      { id: 'DERIV_04', nombre: 'Paridad', estado: fondo.Estado_DERIV_04_Paridad, orden: 4 }
    ];
  }

  // Parsear sub-etapas de PNL
  static parsePNLSubetapas(fondo: EjecucionFondo): SubEtapaUI[] {
    return [
      { id: 'PNL_01', nombre: 'Dimensiones', estado: fondo.Estado_PNL_01_Dimensiones, orden: 1 },
      { id: 'PNL_02', nombre: 'Ajuste', estado: fondo.Estado_PNL_02_Ajuste, orden: 2 },
      { id: 'PNL_03', nombre: 'Agrupación', estado: fondo.Estado_PNL_03_Agrupacion, orden: 3 },
      { id: 'PNL_04', nombre: 'Ajuste IPA', estado: fondo.Estado_PNL_04_AjusteIPA, orden: 4 },
      { id: 'PNL_05', nombre: 'Consolidar', estado: fondo.Estado_PNL_05_Consolidar, orden: 5 }
    ];
  }

  // Parsear sub-etapas de UBS
  static parseUBSSubetapas(fondo: EjecucionFondo): SubEtapaUI[] {
    return [
      { id: 'UBS_01', nombre: 'Tratamiento', estado: fondo.Estado_UBS_01_Tratamiento, orden: 1 },
      { id: 'UBS_02', nombre: 'Derivados MLCCII', estado: fondo.Estado_UBS_02_Derivados, orden: 2 },
      { id: 'UBS_03', nombre: 'Cartera MLCCII', estado: fondo.Estado_UBS_03_Cartera, orden: 3 }
    ];
  }

  // Calcular progreso de sub-etapas
  static calculateSubEtapasProgreso(subEtapas: SubEtapaUI[]): number {
    const completadas = subEtapas.filter(s => s.estado === 'OK').length;
    return (completadas / subEtapas.length) * 100;
  }

  // Conversión de estado a progreso numérico
  static getEstadoProgreso(estado: EstadoEtapa): number {
    switch (estado) {
      case 'OK': return 100;
      case 'EN_PROGRESO': return 50;
      case 'ERROR': return 100;  // Completado con error
      case 'WARNING': return 100;  // Completado con warning
      case 'N/A': return 100;  // No aplica (completado)
      case 'OMITIDO': return 100;  // Omitido (completado)
      case 'PENDIENTE': return 0;
      default: return 0;
    }
  }

  // Conversión de estado a animación
  static getAnimacion(estado: EstadoEtapa): 'idle' | 'loading' | 'success' | 'error' | 'warning' {
    switch (estado) {
      case 'OK': return 'success';
      case 'EN_PROGRESO': return 'loading';
      case 'ERROR': return 'error';
      case 'WARNING': return 'warning';
      case 'N/A': return 'idle';
      case 'OMITIDO': return 'idle';
      case 'PENDIENTE': return 'idle';
      default: return 'idle';
    }
  }
}
```

---

## 8. Animaciones y Visualización

### 8.1 Paleta de Colores por Estado

```typescript
const ESTADO_COLORS = {
  PENDIENTE: '#6B7280',      // Gris
  EN_PROGRESO: '#3B82F6',    // Azul (animado)
  OK: '#10B981',             // Verde
  ERROR: '#EF4444',          // Rojo
  WARNING: '#F59E0B',        // Amarillo
  N_A: '#9CA3AF',            // Gris claro
  OMITIDO: '#D1D5DB'         // Gris muy claro
};

const ESTADO_ICONS = {
  PENDIENTE: 'clock',
  EN_PROGRESO: 'spinner',    // Spinning animation
  OK: 'check-circle',
  ERROR: 'x-circle',
  WARNING: 'alert-triangle',
  N_A: 'minus-circle',
  OMITIDO: 'skip-forward'
};
```

### 8.2 Componentes React de Ejemplo

```tsx
// Progress Bar por Etapa
interface ProgressBarProps {
  etapa: EtapaUI;
  showSubEtapas: boolean;
}

const EtapaProgressBar: React.FC<ProgressBarProps> = ({ etapa, showSubEtapas }) => {
  return (
    <div className="etapa-container">
      {/* Barra principal */}
      <div className="flex items-center gap-2">
        <StatusIcon estado={etapa.estado} animacion={etapa.animacion} />
        <span className="font-medium">{etapa.nombre}</span>
        <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ${getColorClass(etapa.estado)}`}
            style={{ width: `${etapa.progreso}%` }}
          />
        </div>
        <span className="text-sm">{Math.round(etapa.progreso)}%</span>
      </div>

      {/* Sub-etapas (collapsible) */}
      {showSubEtapas && etapa.subEtapas.length > 0 && (
        <div className="ml-8 mt-2 space-y-1">
          {etapa.subEtapas.map(subEtapa => (
            <div key={subEtapa.id} className="flex items-center gap-2 text-sm">
              <StatusIcon estado={subEtapa.estado} size="small" />
              <span>{subEtapa.nombre}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

function getColorClass(estado: EstadoEtapa): string {
  switch (estado) {
    case 'OK': return 'bg-green-500';
    case 'EN_PROGRESO': return 'bg-blue-500 animate-pulse';
    case 'ERROR': return 'bg-red-500';
    case 'WARNING': return 'bg-yellow-500';
    default: return 'bg-gray-300';
  }
}
```

### 8.3 CSS para Animaciones

```css
/* Spinner animado */
@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.spinner {
  animation: spin 1s linear infinite;
}

/* Animación de pulso para EN_PROGRESO */
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.animate-pulse {
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

/* Animación de success (checkmark) */
@keyframes checkmark {
  0% { transform: scale(0); opacity: 0; }
  50% { transform: scale(1.2); }
  100% { transform: scale(1); opacity: 1; }
}

.success-checkmark {
  animation: checkmark 0.5s ease-in-out;
}
```

---

## 9. Manejo de Errores

### 9.1 Clasificación de Errores

```typescript
enum ErrorType {
  CRITICAL = 'CRITICAL',        // Detiene procesamiento (SP returnValue = 3)
  RECOVERABLE = 'RECOVERABLE',  // Puede reintentarse (SP returnValue = 2)
  WARNING = 'WARNING',          // Completó con warnings (SP returnValue = 1)
  VALIDATION = 'VALIDATION'     // Error de validación (métricas)
}

interface ErrorContext {
  type: ErrorType;
  etapa: string;
  mensaje: string;
  detalles: {
    sp: string | null;          // Stored procedure que falló
    returnValue: number | null; // Return value del SP
    sqlError: string | null;    // Error SQL
    stackTrace: string | null;  // Stack trace
  };
  metrics: EjecucionMetrica[];  // Métricas relacionadas
}
```

### 9.2 Detección de Tipo de Error

```typescript
class ErrorDetector {
  static detectErrorType(fondo: EjecucionFondo, metricas: EjecucionMetrica[]): ErrorContext | null {
    if (fondo.Estado_Final !== 'ERROR' && fondo.Estado_Final !== 'WARNING') {
      return null;
    }

    // Error crítico (SP falló)
    if (fondo.Estado_Final === 'ERROR' && fondo.Paso_Con_Error) {
      return {
        type: ErrorType.CRITICAL,
        etapa: fondo.Paso_Con_Error,
        mensaje: fondo.Mensaje_Error || 'Error desconocido',
        detalles: {
          sp: this.extractSPName(fondo.Paso_Con_Error),
          returnValue: 3,
          sqlError: fondo.Mensaje_Error,
          stackTrace: null
        },
        metrics: metricas.filter(m => m.ID_Fund === fondo.ID_Fund && !m.Validacion_OK)
      };
    }

    // Warning (validación falló pero continuó)
    if (fondo.Estado_Final === 'WARNING') {
      return {
        type: ErrorType.WARNING,
        etapa: fondo.Paso_Con_Error || 'VALIDACION',
        mensaje: 'Completó con warnings',
        detalles: {
          sp: null,
          returnValue: 1,
          sqlError: null,
          stackTrace: null
        },
        metrics: metricas.filter(m => m.ID_Fund === fondo.ID_Fund && !m.Validacion_OK)
      };
    }

    return null;
  }

  static extractSPName(pasoConError: string): string {
    // Extraer nombre del SP desde el paso
    return pasoConError;
  }
}
```

---

## 10. Ejemplos de Flujos

### 10.1 Flujo Exitoso Completo

```typescript
// Timeline de estados para un fondo exitoso (MRCLP)
const timelineExitoso = [
  { tiempo: '00:00:00', etapa: 'INICIO', estado: 'EN_PROGRESO' },
  { tiempo: '00:00:05', etapa: 'EXTRACCION', estado: 'OK' },
  { tiempo: '00:00:10', etapa: 'VALIDACION', estado: 'OK' },
  { tiempo: '00:00:15', etapa: 'PROCESS_IPA', subEtapa: 'IPA_01', estado: 'EN_PROGRESO' },
  { tiempo: '00:00:20', etapa: 'PROCESS_IPA', subEtapa: 'IPA_01', estado: 'OK' },
  // ... sub-etapas IPA_02 a IPA_07
  { tiempo: '00:01:00', etapa: 'PROCESS_IPA', estado: 'OK' },
  { tiempo: '00:01:05', etapa: 'PROCESS_CAPM', subEtapa: 'CAPM_01', estado: 'EN_PROGRESO' },
  // ... sub-etapas CAPM
  { tiempo: '00:01:30', etapa: 'PROCESS_CAPM', estado: 'OK' },
  { tiempo: '00:01:32', etapa: 'PROCESS_DERIVADOS', estado: 'N/A' },  // No requiere derivados
  { tiempo: '00:01:35', etapa: 'PROCESS_PNL', subEtapa: 'PNL_01', estado: 'EN_PROGRESO' },
  // ... sub-etapas PNL
  { tiempo: '00:02:00', etapa: 'PROCESS_PNL', estado: 'OK' },
  { tiempo: '00:02:05', etapa: 'CONCATENAR', estado: 'EN_PROGRESO' },
  { tiempo: '00:02:15', etapa: 'CONCATENAR', estado: 'OK' },
  { tiempo: '00:02:25', etapa: 'FIN', estadoFinal: 'OK' }
];
```

### 10.2 Flujo con Errores Parciales

```typescript
// Escenario: 3 fondos, uno falla en IPA, otros completan
const ejecucionParcial = {
  ejecucion: {
    TotalFondos: 3,
    FondosExitosos: 2,
    FondosFallidos: 1,
    Estado: 'PARCIAL'
  },
  fondos: [
    // Fondo 1: Exitoso
    {
      ID_Fund: '20',
      FundShortName: 'MRCLP',
      Estado_Final: 'OK',
      Estado_Process_IPA: 'OK',
      Estado_Process_CAPM: 'OK',
      Estado_Process_PNL: 'OK'
    },

    // Fondo 2: Error en IPA_04
    {
      ID_Fund: '21',
      FundShortName: 'MDLAT',
      Estado_Final: 'ERROR',
      Estado_Process_IPA: 'ERROR',
      Estado_IPA_01_RescatarLocalPrice: 'OK',
      Estado_IPA_02_AjusteSONA: 'OK',
      Estado_IPA_03_RenombrarCxCCxP: 'OK',
      Estado_IPA_04_TratamientoSuciedades: 'ERROR',
      Paso_Con_Error: 'PROCESS_IPA',
      Mensaje_Error: 'Division by zero',
      Elegible_Reproceso: true
    },

    // Fondo 3: Exitoso (procesamiento paralelo continuó)
    {
      ID_Fund: '22',
      FundShortName: 'MLCCII',
      Estado_Final: 'OK',
      Estado_Process_UBS: 'OK'
    }
  ]
};
```

---

## 11. Consideraciones Técnicas

### 11.1 Performance

- **Polling**: Intervalo de 2-3 segundos, no más frecuente para evitar sobrecarga
- **Filtrado**: Implementar filtros client-side cuando sea posible
- **Paginación**: Logs y métricas deben paginarse (max 100 por request)
- **Cache**: Cachear configuración estática del pipeline
- **Debouncing**: Debounce de actualizaciones de UI (100-200ms)

### 11.2 Escalabilidad

- **TTL en memoria**: Ejecuciones se limpian después de 1 hora
- **Máximo en memoria**: 50 ejecuciones simultáneas
- **Cleanup automático**: Cada 10 minutos elimina ejecuciones antiguas
- **Paginación de fondos**: Si hay >100 fondos, paginar la lista

### 11.3 Seguridad

- **Autenticación**: Implementar JWT o session-based auth
- **Rate limiting**: Limitar requests por IP (ej: 100 req/min)
- **Validación de IDs**: Validar que `idEjecucion` sea BigInt válido
- **SQL Injection**: Backend usa parámetros preparados

### 11.4 Troubleshooting

#### Ejecución "colgada" (sin cambios de estado)

```typescript
function detectarEjecucionColgada(ejecucion: Ejecucion, fondos: EjecucionFondo[]): boolean {
  const tiempoTranscurrido = Date.now() - new Date(ejecucion.FechaInicio).getTime();
  const TIMEOUT_MS = 600000; // 10 minutos

  if (tiempoTranscurrido > TIMEOUT_MS && ejecucion.Estado === 'EN_PROGRESO') {
    const fondosEnProgreso = fondos.filter(f => f.Estado_Final === 'EN_PROGRESO');

    if (fondosEnProgreso.length === 0) {
      // No hay fondos en progreso pero la ejecución dice que sí
      return true;
    }
  }

  return false;
}
```

---

## 12. Estado de Implementación y Gaps Identificados

### 12.1 ⚠️ IMPORTANTE: Diferencia entre Datos Reales vs Simulados

Esta sección documenta qué partes del sistema están **completamente implementadas con datos reales de la base de datos** y cuáles aún están **en desarrollo o usando datos simulados/inventados**.

### 12.2 ✅ Implementado y Funcionando (Datos Reales)

#### Backend - API Endpoints
| Endpoint | Estado | Fuente de Datos |
|----------|--------|-----------------|
| `POST /api/procesos/v2/ejecutar` | ✅ Implementado | Ejecuta SPs reales, crea ejecución en BD |
| `GET /api/procesos/v2/ejecucion/:id` | ✅ Implementado | Lee de `logs.Ejecuciones` y `logs.Ejecucion_Fondos` |
| `GET /api/procesos/v2/ejecucion/:id/fondos` | ✅ Implementado | Lee de `logs.Ejecucion_Fondos` + JOIN con `BD_Funds` |
| `GET /api/procesos/v2/ejecucion/:id/logs` | ✅ Implementado | Lee de `logs.Ejecucion_Logs` (paginado) |

#### Backend - Tracking de Estados
| Componente | Estado | Descripción |
|------------|--------|-------------|
| Estados principales por etapa | ✅ Implementado | 9 campos de estado (`Estado_Extraccion`, `Estado_Process_IPA`, etc.) |
| Sub-estados IPA (7 campos) | ✅ Implementado | `Estado_IPA_01` hasta `Estado_IPA_07` |
| Sub-estados CAPM (3 campos) | ✅ Implementado | `Estado_CAPM_01` hasta `Estado_CAPM_03` |
| Sub-estados PNL (5 campos) | ✅ Implementado | `Estado_PNL_01` hasta `Estado_PNL_05` |
| Sub-estados Derivados (4 campos) | ✅ Implementado | `Estado_DERIV_01` hasta `Estado_DERIV_04` |
| Sub-estados UBS (3 campos) | ✅ Implementado | `Estado_UBS_01` hasta `Estado_UBS_03` |

#### Backend - Logging
| Componente | Estado | Descripción |
|------------|--------|-------------|
| Logging a BD | ✅ Implementado | Tabla `logs.Ejecucion_Logs` con 4 niveles |
| Bulk insert de logs | ✅ Implementado | Batch de 100 logs por insert |
| Filtrado por nivel/etapa | ✅ Implementado | Query con WHERE en API |

### 12.3 ⚠️ Parcialmente Implementado

#### Backend - Métricas de Validación
| Componente | Estado | Notas |
|------------|--------|-------|
| `GET /api/procesos/v2/ejecucion/:id/metricas` | ⚠️ Parcial | Endpoint existe pero puede retornar vacío |
| Tabla `logs.Ejecucion_Metricas` | ⚠️ Parcial | Tabla existe pero no todos los SPs la populan |
| Validación de row counts | ⚠️ Parcial | Solo algunos SPs validan (IPA_07, CAPM_03, etc.) |
| Validación de sumas/balances | ❌ No implementado | Los SPs no calculan ni comparan sumas |
| Validación de diferencias % | ❌ No implementado | No se calcula `Diferencia_Porcentual` |

**Impacto**: El frontend puede llamar al endpoint de métricas, pero:
- Puede retornar un array vacío
- No hay garantía de que haya métricas para todas las etapas
- Las validaciones financieras (sumas, diferencias %) no están implementadas

**Acción Requerida**:
1. Modificar SPs para insertar métricas en `logs.Ejecucion_Metricas`
2. Agregar validaciones de sumas (`Suma_MVBook`, `Suma_AI`, `Suma_TotalMVal`)
3. Implementar cálculo de diferencias porcentuales

---

#### Backend - Diagnóstico de Errores
| Componente | Estado | Notas |
|------------|--------|-------|
| `GET /api/procesos/v2/ejecucion/:id/diagnostico` | ❌ No implementado | Endpoint no existe en el código actual |
| Resumen de errores agrupado | ❌ No implementado | No hay query que agrupe errores por paso |
| Detección de tipo de error | ❌ No implementado | No se clasifica CRITICAL vs RECOVERABLE |

**Impacto**: El frontend NO puede llamar a este endpoint actualmente. Las funcionalidades documentadas en la sección 5.6 de este documento son una **propuesta de diseño**, no implementación real.

**Acción Requerida**:
1. Crear endpoint `/api/procesos/v2/ejecucion/:id/diagnostico`
2. Implementar queries de agregación de errores
3. Agregar lógica de clasificación de errores (CRITICAL, RECOVERABLE, WARNING, VALIDATION)

---

#### Backend - Reproceso de Fondos
| Componente | Estado | Notas |
|------------|--------|-------|
| `POST /api/procesos/v2/ejecucion/:id/reprocesar` | ❌ No implementado | Endpoint no existe en el código actual |
| Flag `Elegible_Reproceso` | ✅ Campo existe | Pero no hay lógica que lo use |
| Reset de estados para reproceso | ❌ No implementado | No hay SP que resetee estados |

**Impacto**: No es posible reprocesar fondos fallidos desde el frontend. La funcionalidad documentada en la sección 5.7 es **propuesta**, no real.

**Acción Requerida**:
1. Crear endpoint POST para reproceso
2. Crear SP que resetee estados de un fondo específico
3. Implementar lógica de re-ejecución para un fondo individual

---

#### Backend - Estadísticas por Etapa
| Componente | Estado | Notas |
|------------|--------|-------|
| `GET /api/procesos/v2/ejecucion/:id/estadisticas-etapas` | ❌ No implementado | Endpoint no existe |
| Agregación de estados por etapa | ❌ No implementado | No hay query de agregación |

**Impacto**: El frontend no puede obtener resúmenes como "12 fondos OK en IPA, 3 ERROR, 2 WARNING". Debe calcular client-side.

**Acción Requerida**:
1. Crear endpoint de estadísticas
2. Implementar query que cuente fondos por estado en cada etapa

---

### 12.4 ❌ No Implementado

#### Backend - Funcionalidades Faltantes

| Funcionalidad | Prioridad | Descripción |
|---------------|-----------|-------------|
| WebSocket para push updates | 🔴 Alta | Actualmente solo polling, no hay push real-time |
| Cancelación de ejecución | 🟡 Media | No hay forma de detener una ejecución en progreso |
| Procesamiento por fondo individual | 🔴 Alta | `POST /ejecutar` con `idFund` está bloqueado (líneas 102-106) |
| Historial de ejecuciones | 🟢 Baja | `GET /api/procesos/v2/historial` no existe |
| Configuración del pipeline | 🟢 Baja | `GET /api/procesos/v2/pipeline/config` no existe |
| Exportar reporte de ejecución | 🟢 Baja | No hay endpoint para descargar PDF/Excel |

#### Frontend - Componentes No Desarrollados

| Componente | Estado | Notas |
|------------|--------|-------|
| Dashboard de tracking en vivo | ❌ No existe | Solo hay documentación de diseño |
| Grid de fondos con progreso | ❌ No existe | Los componentes React son ejemplos |
| Panel de logs en tiempo real | ❌ No existe | Solo hay código de ejemplo |
| Vista de métricas | ❌ No existe | Depende de backend (parcialmente implementado) |
| Timeline de etapas | ❌ No existe | Los CSS están documentados pero no aplicados |

---

### 12.5 📝 Documentación vs Realidad

Esta tabla resume qué partes de este documento son **documentación de la implementación real** vs **propuestas de diseño**:

| Sección del Documento | Estado |
|-----------------------|--------|
| **1-3. Arquitectura, Fases, Modelo de Datos** | ✅ Real - Documentación precisa del sistema actual |
| **5.1 POST /ejecutar** | ✅ Real - Endpoint implementado y funcionando |
| **5.2 GET /ejecucion/:id** | ✅ Real - Endpoint implementado y funcionando |
| **5.3 GET /fondos** | ✅ Real - Endpoint implementado y funcionando |
| **5.4 GET /logs** | ✅ Real - Endpoint implementado y funcionando |
| **5.5 GET /metricas** | ⚠️ Parcial - Endpoint existe pero puede estar vacío |
| **5.6 GET /diagnostico** | ❌ Propuesta - NO IMPLEMENTADO |
| **5.7 POST /reprocesar** | ❌ Propuesta - NO IMPLEMENTADO |
| **5.8 GET /historial** | ❌ Propuesta - NO IMPLEMENTADO |
| **5.9 GET /pipeline/config** | ❌ Propuesta - NO IMPLEMENTADO |
| **6. Estrategia de Polling** | ✅ Real - Código funcional documentado |
| **7. Modelo de Datos para UI** | ✅ Real - Basado en respuestas reales del API |
| **8. Animaciones** | ⚠️ Propuesta - Ejemplos de código, no implementado |
| **9. Manejo de Errores** | ⚠️ Mixto - Detección existe, clasificación no |
| **10. Ejemplos de Flujos** | ✅ Real - Basados en comportamiento observado |

---

### 12.6 🔧 Test Script - Uso de MCP vs Simulación

El script de test `server/test_pipeline_execution.js` tiene **dos modos de operación**:

#### Modo 1: Simulación (Default para Node.js standalone)
```javascript
async function ejecutarQuerySQL(sql) {
  // Para ejecución standalone, simular:
  logWarning(`[Simulación] Query SQL ejecutada...`);
  return [];
}
```

**Limitaciones**:
- Conteos de registros son simulados (retorna 0 o -1)
- Métricas de validación no se obtienen
- Logs de error no se obtienen
- Solo verifica datos del API (que sí son reales)

#### Modo 2: MCP SQL Real (Para ejecución en Claude Code)
```javascript
async function ejecutarQuerySQL(sql) {
  // En Claude Code, usar directamente:
  return await mcp__sqlserver_moneda__query({ sql });
}
```

**Activar modo MCP**: Descomentar línea 200 en `test_pipeline_execution.js`:
```javascript
// Cambiar esto:
// return await mcp__sqlserver_moneda__query({ sql });

// Por esto:
return await mcp__sqlserver_moneda__query({ sql });
```

**Beneficios**:
- ✅ Conteos reales de registros en todas las tablas
- ✅ Verificación real de métricas de validación
- ✅ Logs de error directos de la BD
- ✅ Validación completa de datos depositados

---

### 12.7 🎯 Roadmap Sugerido

#### Fase 1: Completar Backend Básico (Alta Prioridad)
1. ✅ Implementar métricas de validación en todos los SPs
2. ✅ Crear endpoint `/diagnostico` para troubleshooting
3. ✅ Implementar endpoint `/reprocesar` para recovery
4. ✅ Habilitar procesamiento por fondo individual (`idFund` en POST /ejecutar)

#### Fase 2: Mejorar Experiencia (Media Prioridad)
5. ✅ Implementar WebSocket para push updates (eliminar polling)
6. ✅ Crear endpoint `/estadisticas-etapas` para dashboards
7. ✅ Implementar cancelación de ejecuciones
8. ✅ Agregar endpoint `/historial` para consultas históricas

#### Fase 3: Frontend (Depende de Fase 1-2)
9. ✅ Desarrollar dashboard de tracking en vivo
10. ✅ Implementar grid de fondos con progreso visual
11. ✅ Crear panel de logs en tiempo real
12. ✅ Implementar vista de métricas y validaciones

---

### 12.8 📌 Cómo Usar Esta Información

**Para Desarrolladores Frontend**:
- ✅ **Puedes usar**: Secciones 5.1-5.4 (endpoints implementados)
- ⚠️ **Usar con cuidado**: Sección 5.5 (puede estar vacío)
- ❌ **NO usar aún**: Secciones 5.6-5.9 (no implementados)
- 📖 **Referencia**: Secciones 6-10 (diseño propuesto)

**Para Desarrolladores Backend**:
- 📋 **Implementar primero**: Sección 12.7 Fase 1
- 🔍 **Revisar**: Sección 12.3 (gaps en métricas)
- 🚀 **Planificar**: Sección 12.7 Fases 2-3

**Para QA/Testing**:
- ✅ **Probar**: Endpoints 5.1-5.4
- ⚠️ **Verificar vacíos**: Endpoint 5.5 (métricas)
- 🧪 **Usar test script**: Activar modo MCP para verificaciones reales

---

## Conclusión

Este documento proporciona toda la información necesaria para implementar un sistema completo de tracking en vivo del pipeline ETL de fondos. Los desarrolladores frontend pueden usar esta referencia sin necesidad de explorar el código del backend.

**⚠️ NOTA IMPORTANTE**: Las secciones marcadas como "Propuesta" o "No Implementado" en la Sección 12 representan el diseño objetivo del sistema, pero requieren implementación adicional en el backend antes de poder ser usadas.

**Documentos Relacionados**:
- `server/config/pipeline.config.yaml` - Configuración del pipeline
- `server/routes/procesos.v2.routes.js` - Implementación de API
- `server/services/tracking/ExecutionTracker.js` - Sistema de tracking
- `server/test_pipeline_execution.js` - Script de test con MCP SQL

**Contacto**: Para preguntas o aclaraciones, contactar al equipo de backend.
