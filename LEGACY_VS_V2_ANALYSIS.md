# Análisis Comparativo: Pipeline Legacy vs V2

**Versión**: 1.0
**Fecha**: Enero 2025
**Propósito**: Documentación permanente de la transición del sistema legacy monolítico al sistema V2 multiusuario paralelo

---

## Tabla de Contenidos

1. [Resumen Ejecutivo](#resumen-ejecutivo)
2. [Diferencias Arquitectónicas](#diferencias-arquitectónicas)
3. [Funcionalidades Perdidas y Restauradas](#funcionalidades-perdidas-y-restauradas)
4. [Sistema de Stand-by](#sistema-de-stand-by)
5. [Sistema de Homologación](#sistema-de-homologación)
6. [Códigos de Retorno](#códigos-de-retorno)
7. [Comparación por Stored Procedure](#comparación-por-stored-procedure)
8. [Plan de Implementación](#plan-de-implementación)

---

## Resumen Ejecutivo

### Contexto

El sistema legacy (`Process_Funds` y SPs orquestadores) procesaba fondos en modo **batch** (todos los fondos por paso, secuencial). El sistema V2 introduce procesamiento **paralelo por fondo** con orquestación en Node.js (`FundOrchestrator`).

### Hallazgos Clave

**✅ Funcionando en V2:**
- Detección de problemas (suciedades, homologación, descuadres)
- Infraestructura de colas (sandbox.colaAlertas*, sandbox.Homologacion_*)
- Logging detallado (logs.Ejecucion_Fondos, logs.Ejecuciones)
- Mission Control UI

**❌ Perdido en Migración:**
1. **Stand-by Logic**: Pausas de pipeline que requieren aprobación de usuario
2. **Validaciones Globales**: Validaciones POST-EXTRACCIÓN de existencia de datos
3. **Registro de Problemas**: Persistencia en `sandbox.Fondos_Problema`
4. **Exclusión Automática**: Fondos con problemas no se reintentaban

### Resultado

Pipeline V2 **detecta** problemas pero **NO bloquea** ejecución ni requiere aprobación. Fondos con problemas continúan procesándose o fallan sin registro persistente.

---

## Diferencias Arquitectónicas

### Procesamiento

| Aspecto | Legacy | V2 |
|---------|--------|-----|
| **Modelo** | Batch (todos los fondos por paso) | Paralelo (1 fondo a la vez, múltiples fondos simultáneos) |
| **Orquestación** | SPs SQL (`Process_Funds`, `Process_IPA`, etc.) | Node.js (`FundOrchestrator.js`) |
| **Concurrencia** | Secuencial (1 paso a la vez) | Paralelo (hasta 999 fondos simultáneos) |
| **Transacciones** | 1 transacción global por paso | 1 transacción por fondo (mantiene temp tables) |
| **Manejo de Errores** | SP retorna código, legacy continúa o detiene | Backend intercepta código, orquestador decide |

### Responsabilidades

| Responsabilidad | Legacy | V2 |
|----------------|--------|-----|
| **Detección de Problemas** | SPs (validaciones dentro del SP) | SPs (validaciones dentro del SP) ✅ |
| **Registro de Problemas** | SPs (INSERT en sandbox.Fondos_Problema) | SPs (INSERT en sandbox.Fondos_Problema) ❌ PERDIDO |
| **Bloqueo de Pipeline** | SP retorna código, legacy evalúa | Backend intercepta código ❌ NO IMPLEMENTADO |
| **Exclusión de Fondos** | WHERE NOT EXISTS en SPs legacy | FundOrchestrator consulta antes de ejecutar ❌ NO IMPLEMENTADO |
| **Tracking de Estado** | Campos en logs.Ejecucion_Fondos | ExecutionTracker.js ✅ |
| **Logging** | INSERT directo en logs.Logs | LoggingService.js ✅ |

### Decisión Arquitectónica Clave

**Legacy**: Responsabilidad 100% en SPs (detección + registro + bloqueo)
**V2**: Responsabilidad dividida (detección en SPs, bloqueo en Backend)
**Problema**: Backend NO completó su parte del contrato → funcionalidad perdida

---

## Funcionalidades Perdidas y Restauradas

### 1. Stand-by Logic (CRÍTICO)

#### Estado Legacy
- SPs detectaban problemas (suciedades, homologación, descuadres)
- Registraban en colas sandbox (colaAlertasSuciedades, Homologacion_*)
- Retornaban código de error
- `Process_Funds` evaluaba código y **DETENÍA** procesamiento del fondo
- Operador revisaba en Mission Control
- Operador resolvía problemas manualmente
- **NO HABÍA RESUME AUTOMÁTICO** - se re-ejecutaba todo el fondo manualmente

#### Estado V2 (ANTES de restauración)
- SPs detectan problemas ✅
- Registran en colas sandbox ✅
- Retornan código de error ✅
- Backend recibe código ❌ **IGNORA EL CÓDIGO**
- Pipeline **CONTINÚA** aunque haya problemas
- **RESULTADO**: Fondos con suciedades/descuadres se procesan sin aprobación

#### Estado V2 (DESPUÉS de restauración)
- SPs detectan problemas ✅
- Registran en colas sandbox ✅
- Registran en `logs.FondosEnStandBy` (NUEVO)
- Retornan código 5-8 según tipo de problema
- `BasePipelineService` intercepta código → `throw StandByRequiredError`
- `FundOrchestrator` marca fondo como **PAUSADO** (no ERROR)
- Operador revisa en Mission Control
- Operador resuelve problemas
- Endpoint `POST /v2/:idEjecucion/resume/:idFund` **REANUDA** desde punto de pausa
- **MEJORA**: Resume automático desde punto de bloqueo (no re-ejecutar todo)

### 2. Validaciones Globales (CRÍTICO)

#### Estado Legacy
- `Process_Funds` validaba existencia de datos **GLOBALMENTE** (toda la fecha):
  - PosModRF (tablas extract.PosModRF_*)
  - SONA (extract.SONA)
  - IPA (extract.IPA)
- Si faltaban datos, TODO el batch fallaba (STOP_ALL)
- Fondos activos sin datos se registraban en `sandbox.Fondos_Problema`

#### Estado V2 (ANTES de restauración)
- Validaciones solo a nivel **portfolio específico** en SPs
- No hay validación global POST-EXTRACCIÓN
- Fondos pueden fallar silenciosamente si faltan datos complementarios
- **RESULTADO**: Fondos se intentan procesar sin validar existencia de datos

#### Estado V2 (DESPUÉS de restauración)
- Nuevo servicio `ValidationService` (POST-EXTRACCIÓN)
- Valida existencia de datos **globalmente**
- Identifica fondos activos sin datos
- Registra en `sandbox.Fondos_Problema`
- `FundOrchestrator._shouldExecuteFund()` consulta antes de ejecutar
- Fondos con problemas se **OMITEN** automáticamente

### 3. Registro de Problemas (IMPORTANTE)

#### Estado Legacy
- SPs registraban problemas en `sandbox.Fondos_Problema` DENTRO del SP
- Formato: `(FechaReporte, ID_Fund, Proceso, Tipo_Problema, FechaProceso)`
- Ejemplos:
  - "Sin datos en extract.SONA"
  - "Instrumento sin homologar"
  - "Diferencia TotalMVal > $0.01"

#### Estado V2 (ANTES de restauración)
- SPs retornan código de error
- Backend recibe código pero **NO REGISTRA**
- `sandbox.Fondos_Problema` queda **VACÍA**
- **RESULTADO**: No hay historial persistente de problemas

#### Estado V2 (DESPUÉS de restauración)
- SPs registran problemas (algunos ya lo hacen, otros se agregan)
- `BasePipelineService.registerFundProblem()` registra desde backend
- Registro al detectar código 3 (error crítico)
- Registro al detectar uncommittable transactions
- **MEJORA**: Registro dual (SP + Backend) garantiza persistencia

### 4. Exclusión Automática (IMPORTANTE)

#### Estado Legacy
- SPs tenían cláusula `WHERE NOT EXISTS (SELECT 1 FROM sandbox.Fondos_Problema ...)`
- Fondos con problemas **NO SE REINTENTABAN** en ejecuciones subsecuentes
- Operador debía limpiar `Fondos_Problema` manualmente después de fix

#### Estado V2 (ANTES de restauración)
- Cláusula `NOT EXISTS` existe en SPs v2
- PERO `sandbox.Fondos_Problema` está vacía (no se registra)
- **RESULTADO**: Fondos problemáticos se reintentan infinitamente

#### Estado V2 (DESPUÉS de restauración)
- `FundOrchestrator._shouldExecuteFund()` consulta `Fondos_Problema`
- Si hay problemas, fondo se **OMITE** completamente
- Estado final: `OMITIDO`
- Log: "Fondo OMITIDO por problemas: IPA_02: Sin datos SONA; IPA_06: Instrumento sin homologar"
- **MEJORA**: Bloqueo desde orquestador (más eficiente que WHERE en SP)

---

## Sistema de Stand-by

### Concepto Fundamental

**Stand-by NO es un error** - es un **estado válido que espera interacción del usuario** para decidir si continuar o no.

**Diferencia clave**:
- **Error (código 3)**: "Algo salió MAL" → Requiere fix técnico → Fondo sale del pipeline
- **Stand-by (códigos 5-8)**: "Requiere DECISIÓN" → Requiere aprobación usuario → Fondo se PAUSA y puede resumir

### Arquitectura

```
DETECCIÓN (SPs v2) → REGISTRO (logs.FondosEnStandBy) → BLOQUEO (FundOrchestrator)
                                                               ↓
                                                    REVISIÓN (Mission Control)
                                                               ↓
                                                    APROBACIÓN (Operador)
                                                               ↓
                                                    RESUME (API + Orquestador)
```

### Tipos de Stand-by

| Código | Tipo | Detectado en | Punto de Pausa | Severidad | Tabla Sandbox |
|--------|------|--------------|----------------|-----------|---------------|
| **5** | SUCIEDADES | IPA_04_TratamientoSuciedades_v2 | ANTES_CAPM | Media | sandbox.colaAlertasSuciedades |
| **6** | HOMOLOGACION (Fondos) | CAPM_02, PNL_01, DERIV_02 | Inmediato | Crítica | sandbox.Homologacion_Fondos |
| **6** | HOMOLOGACION (Instrumentos) | IPA_02, IPA_06, DERIV_02 | Inmediato | Crítica | sandbox.Homologacion_Instrumentos, sandbox.colaPendientes |
| **6** | HOMOLOGACION (Monedas) | IPA_02, PNL_01 | Inmediato | Crítica | sandbox.Homologacion_Monedas |
| **7** | DESCUADRES IPA-SONA | IPA_02_AjusteSONA_v2 | ANTES_CAPM | Media | sandbox.colaAlertasDescuadre |
| **7** | DESCUADRES IPA-CAPM | CAPM_01_Ajuste_CAPM_v2 | ANTES_PNL | Media | sandbox.colaAlertasDescuadre |
| **7** | DESCUADRES CAPM Consolidación | CAPM_03_Carga_Final_v2 | ANTES_PNL | Alta | sandbox.colaAlertasDescuadre |
| **8** | DESCUADRES IPA-Derivados | DERIV_03_Ajuste_Derivados_v2 | POST_DERIVADOS | Baja | sandbox.colaAlertasDescuadre |
| **8** | DESCUADRES PNL Transferencia | PNL_02_Ajuste_v2 (NUEVO) | POST_PNL | Media | sandbox.colaAlertasDescuadre |

### Puntos de Bloqueo

**ANTES_CAPM**:
- Detectado: Suciedades, Descuadres IPA-SONA
- Bloquea: PROCESS_CAPM, PROCESS_PNL, PROCESS_UBS
- Permite: PROCESS_DERIVADOS (independiente de CAPM)
- Razón: Datos IPA deben estar limpios antes de validar contra CAPM

**MID_IPA**:
- Detectado: Homologación Instrumentos/Monedas en IPA_02, IPA_06
- Bloquea: TODO (CAPM, PNL, UBS, Derivados)
- Razón: IPA incompleto → No se puede continuar
- **CRÍTICO**: Requiere re-ejecución manual del fondo (resume NO aplica)

**ANTES_PNL**:
- Detectado: Descuadres IPA-CAPM, CAPM consolidación
- Bloquea: PROCESS_PNL
- Permite: PROCESS_UBS (independiente)
- Razón: CAPM debe cuadrar antes de iniciar PNL

**POST_DERIVADOS**:
- Detectado: Descuadres IPA-Derivados
- Bloquea: Nada (fondo ya completó)
- Razón: Warning post-proceso, no bloquea flujo crítico

### Flujo de Resume

1. **Detección**: SP retorna código 5-8
2. **Registro**: SP inserta en `logs.FondosEnStandBy`, actualiza `logs.Ejecucion_Fondos`
3. **Bloqueo**: `FundOrchestrator._checkFundStandByStatus()` consulta antes de cada servicio
4. **Revisión**: Operador ve en Mission Control UI (`GET /v2/fondos-en-standby`)
5. **Resolución**: Operador resuelve items en sandbox.colaAlertas* o sandbox.Homologacion_*
6. **Actualización**: Al resolver, `_actualizarContadorStandBy()` incrementa `ProblemasResueltos`
7. **Aprobación**: Cuando `ProblemasResueltos >= CantidadProblemas`, marca `Estado = 'APROBADO'`
8. **Resume**: `POST /v2/:idEjecucion/resume/:idFund` re-ejecuta servicios pendientes desde punto de pausa
9. **Limpieza**: Actualiza `EstadoStandBy = NULL`, `FechaResume = GETDATE()`

---

## Sistema de Homologación

El sistema de homologación mapea códigos externos (GENEVA, CAPM, DERIVADOS, etc.) a dimensiones internas (instrumentos, fondos, monedas).

### 1. Homologación de FONDOS

#### Tablas

**Maestro**: `dimensionales.HOMOL_Funds`
```sql
CREATE TABLE dimensionales.HOMOL_Funds (
    ID_Fund INT,
    Codigo NVARCHAR(50),      -- Código externo (ej: "MLICCVG" en GENEVA)
    Fuente NVARCHAR(50),       -- 'GENEVA', 'CASH APPRAISAL', 'DERIVADOS'
    -- ...
);
```

**Cola Sandbox**: `sandbox.Homologacion_Fondos`
```sql
CREATE TABLE sandbox.Homologacion_Fondos (
    Portfolio NVARCHAR(50),    -- Código sin homologar
    Fuente NVARCHAR(50),       -- 'GENEVA', 'CASH APPRAISAL', 'DERIVADOS'
    FechaReporte NVARCHAR(10),
    ID_Ejecucion BIGINT,
    ID_Fund INT,
    Estado NVARCHAR(20),       -- 'pendiente', 'resuelto'
    FechaResolucion DATETIME2
);
```

#### Flujo

1. **Extracción**: Datos vienen con código Portfolio específico de fuente
   - GENEVA: `Portfolio_Geneva` (ej: "MLICCVG")
   - CASH APPRAISAL: `Portfolio_Geneva` (mismo código que GENEVA)
   - DERIVADOS: `Portfolio_Derivados` (ej: "MLIDEUSA")

2. **Lookup**: SP consulta `HOMOL_Funds` para mapear `Codigo + Fuente → ID_Fund`
   ```sql
   SELECT @ID_Fund = ID_Fund
   FROM dimensionales.HOMOL_Funds
   WHERE Codigo = @Portfolio_Geneva AND Fuente = 'GENEVA';
   ```

3. **Homologación Faltante**: Si `@ID_Fund IS NULL`
   - SP inserta en `sandbox.Homologacion_Fondos`
   - SP retorna código **6** (Stand-by HOMOLOGACION)
   - Pipeline se PAUSA

4. **Resolución Manual**: Operador en Mission Control
   - Identifica fondo correcto en `dimensionales.BD_Funds`
   - Inserta mapeo en `dimensionales.HOMOL_Funds`
   - Marca item en `sandbox.Homologacion_Fondos` como 'resuelto'

5. **Resume**: Pipeline reanuda después de resolver todos los fondos sin homologar

#### Dónde se Usa

- **CAPM_02_Extract_Transform_v2**: Portfolio CASH APPRAISAL → ID_Fund
- **PNL_01_Dimensiones_v2**: Portfolio PNL (GENEVA) → ID_Fund
- **DERIV_02_Homologar_Dimensiones_v2**: Portfolio DERIVADOS → ID_Fund

### 2. Homologación de INSTRUMENTOS

#### Tablas

**Maestro**: `dimensionales.HOMOL_Instrumentos`
```sql
CREATE TABLE dimensionales.HOMOL_Instrumentos (
    ID_Instrumento INT,
    Codigo NVARCHAR(50),       -- Código externo (ej: "ADJ SONA-IPA", "USD", "CASH USD")
    Fuente NVARCHAR(50),       -- 'IPA', 'CAPM', 'DERIVADOS'
    -- ...
);
```

**Colas Sandbox**:
- `sandbox.Homologacion_Instrumentos`: Homologaciones genéricas
- `sandbox.colaPendientes`: Homologaciones desde IPA_06 (legacy queue)

#### Flujo

Similar a fondos, pero mapea `Codigo + Fuente → ID_Instrumento`.

**Casos especiales**:
- **ADJ SONA-IPA**: Ajuste sintético creado en IPA_02 para cuadrar diferencias
- **CASH USD/CLP/etc**: Instrumentos de caja por moneda
- **Derivados**: Códigos específicos de fuente DERIVADOS

#### Dónde se Usa

- **IPA_02_AjusteSONA_v2**: ADJ SONA-IPA → ID_Instrumento
- **IPA_06_CrearDimensiones_v2**: Múltiples instrumentos de IPA → ID_Instrumento
- **CAPM_01_Ajuste_CAPM_v2**: ADJ IPA-CASHAPP → ID_Instrumento
- **DERIV_02_Homologar_Dimensiones_v2**: Instrumentos derivados → ID_Instrumento

### 3. Homologación de MONEDAS

#### Tablas

**Maestro**: `dimensionales.HOMOL_Monedas`
```sql
CREATE TABLE dimensionales.HOMOL_Monedas (
    ID_Moneda INT,
    Codigo NVARCHAR(10),       -- ISO code (ej: "USD", "CLP", "EUR")
    Fuente NVARCHAR(50),       -- 'IPA', 'GENEVA', 'CAPM'
    -- ...
);
```

**Cola Sandbox**: `sandbox.Homologacion_Monedas`

#### Flujo

Similar a fondos/instrumentos, mapea `Codigo + Fuente → ID_Moneda`.

**Validación especial**: Monedas deben existir en `dimensionales.BD_Monedas` (maestro de monedas).

#### Dónde se Usa

- **IPA_02_AjusteSONA_v2**: Moneda de ajuste SONA → ID_Moneda
- **PNL_01_Dimensiones_v2**: Monedas en PNL → ID_Moneda

---

## Códigos de Retorno

### Tabla de Referencia Completa

| Código | Nombre | Acción Backend | Acción Orquestador | Registra en | Ejemplo |
|--------|--------|----------------|-------------------|-------------|---------|
| **0** | Éxito / Skip válido | Continúa | Continúa con siguiente SP | - | Fondo no requiere UBS (Flag_UBS=0) |
| **2** | Retry (deadlock/timeout) | Reintenta (max 3x, exponential backoff) | Retry automático | logs.SP_Errors | SQL deadlock (error 1205) |
| **3** | Error crítico | THROW error | Detiene fondo, marca ERROR | sandbox.Fondos_Problema | Sin datos en extract.SONA, fondo activo sin PNL |
| **5** | Stand-by SUCIEDADES | THROW StandByRequiredError | Pausa ANTES_CAPM | logs.FondosEnStandBy + sandbox.colaAlertasSuciedades | Detectadas 3 posiciones con [CXC/CXP?] |
| **6** | Stand-by HOMOLOGACION | THROW StandByRequiredError | Pausa inmediato (MID_IPA o servicio actual) | logs.FondosEnStandBy + sandbox.Homologacion_* | Instrumento ADJ SONA-IPA sin homologar |
| **7** | Stand-by DESCUADRES-CAPM | THROW StandByRequiredError | Pausa ANTES_PNL | logs.FondosEnStandBy + sandbox.colaAlertasDescuadre | Diferencia IPA-CAPM: $15.75 |
| **8** | Stand-by DESCUADRES-GENERAL | THROW StandByRequiredError | Pausa POST (no bloquea) | logs.FondosEnStandBy + sandbox.colaAlertasDescuadre | Diferencia IPA-Derivados: $8,500 |

### Códigos ELIMINADOS

- ~~**1**~~: Warning general (sin sentido - pipeline nunca debe continuar con warnings)
- ~~**4**~~: Error crítico alternativo (sin uso, consolidado en código 3)

### Decisión Tree: ¿Cuándo usar cada código?

```
¿El SP completó su lógica?
├─ NO → ¿Por qué?
│  ├─ Deadlock SQL (error 1205) → Código 2 (retry)
│  ├─ Timeout (error -2, 1222) → Código 2 (retry)
│  ├─ Datos faltantes críticos → Validar FLAG
│  │  ├─ Flag indica que NO requiere → Código 0 (skip válido)
│  │  └─ Flag indica que SÍ requiere → Código 3 (error crítico)
│  ├─ Constraint violation → Código 3 (error crítico)
│  └─ Error de lógica interna → Código 3 (error crítico)
│
└─ SÍ → ¿Hay problemas detectados?
   ├─ NO → Código 0 (éxito)
   │
   └─ SÍ → ¿Qué tipo?
      ├─ Suciedades ([CXC/CXP?]) → Código 5 (stand-by)
      ├─ Homologación faltante (fondos, instrumentos, monedas) → Código 6 (stand-by)
      ├─ Descuadre IPA-SONA → Código 7 (stand-by)
      ├─ Descuadre IPA-CAPM → Código 7 (stand-by)
      ├─ Descuadre CAPM consolidación → Código 7 (stand-by)
      ├─ Descuadre IPA-Derivados → Código 8 (stand-by)
      ├─ Descuadre PNL transferencia → Código 8 (stand-by)
      └─ Validación TotalMVal UBS → Código 3 (error crítico)
```

### Validación de FLAGS

Antes de retornar código 3 por "sin datos", **SIEMPRE** validar flags:

```sql
-- Ejemplo: DERIV_02_Homologar_Dimensiones_v2
DECLARE @RequiereDerivados BIT;
SELECT @RequiereDerivados = Flag_Derivados
FROM dimensionales.BD_Funds
WHERE ID_Fund = @ID_Fund;

IF @RegistrosOrigen = 0
BEGIN
    IF @RequiereDerivados = 1
        RETURN 3;  -- ERROR: Fondo SÍ requiere derivados pero sin datos
    ELSE
        RETURN 0;  -- OK: Fondo NO requiere derivados
END
```

**FLAGS importantes**:
- `Activo_MantenerFondos`: Fondo activo en sistema (1) o inactivo (0)
- `Flag_Derivados`: Fondo requiere procesamiento de derivados (1) o no (0)
- `Flag_UBS`: Fondo es de Luxemburgo/UBS (1) o no (0)

---

## Comparación por Stored Procedure

### IPA (7 SPs)

#### IPA_01_RescatarLocalPrice_v2

**Propósito**: Rescata precios locales de tablas extract.IPA y extract.PosModRF_*

**Legacy vs V2**:
- **Arquitectura**: Sin cambios significativos
- **Códigos de retorno**: 0 (éxito), 2 (retry), 3 (error crítico)
- **Validaciones**: Mantiene validaciones legacy
- **CAMBIOS EN RESTAURACIÓN**: Ninguno (funciona correctamente)

#### IPA_02_AjusteSONA_v2

**Propósito**: Ajusta posiciones IPA vs SONA, crea instrumento sintético ADJ SONA-IPA

**Legacy vs V2**:
| Aspecto | Legacy | V2 (Antes) | V2 (Después Restauración) |
|---------|--------|-----------|---------------------------|
| Sin datos SONA | Código 1 (warning) | Código 1 (warning) | **Código 3** (error crítico) + registro en Fondos_Problema |
| Instrumento sin homologar | Código 1, continúa | Código 1, continúa | **Código 6** (stand-by HOMOLOGACION) + registro en logs.FondosEnStandBy |
| Moneda sin homologar | Código 1, continúa | Código 1, continúa | **Código 6** (stand-by HOMOLOGACION) + registro en logs.FondosEnStandBy |
| Descuadre IPA-SONA | No validaba | No validaba | **Código 7** (stand-by DESCUADRES-CAPM) + registro en colaAlertasDescuadre |

**NUEVAS VALIDACIONES**:
1. **Descuadre IPA-SONA**: Umbral $0.01
2. **Registro de problemas**: sandbox.Fondos_Problema para errores críticos

#### IPA_04_TratamientoSuciedades_v2

**Propósito**: Detecta y marca posiciones [CXC/CXP?] (cuentas por cobrar/pagar ambiguas)

**Legacy vs V2**:
| Aspecto | Legacy | V2 (Antes) | V2 (Después Restauración) |
|---------|--------|-----------|---------------------------|
| Suciedades detectadas | Registra en colaAlertasSuciedades, código 1 (warning) | Registra en colaAlertasSuciedades, código 1 (warning) | **Código 5** (stand-by SUCIEDADES) + registro en logs.FondosEnStandBy |
| Bloqueo de pipeline | Process_Funds evalúa código 1, detiene fondo | Backend ignora código 1, continúa | Backend intercepta código 5, **PAUSA fondo** antes de CAPM |

**CAMBIO CRÍTICO**: Suciedades ahora bloquean CAPM/PNL hasta aprobación de usuario.

#### IPA_06_CrearDimensiones_v2

**Propósito**: Homologa instrumentos de IPA y crea dimensiones finales

**Legacy vs V2**:
| Aspecto | Legacy | V2 (Antes) | V2 (Después Restauración) |
|---------|--------|-----------|---------------------------|
| Instrumentos sin homologar | Registra en colaPendientes, código 1 (warning) | Registra en colaPendientes, código 1 (warning) | **Código 6** (stand-by HOMOLOGACION) + registro en logs.FondosEnStandBy |

**CAMBIO**: Homologación faltante ahora bloquea TODO el pipeline (MID_IPA) hasta mapeo manual.

#### IPA_07_AgruparRegistros_v2

**Propósito**: Agrupa registros finales de IPA, elimina posiciones < $0.01

**Legacy vs V2**:
| Aspecto | Legacy | V2 (Antes) | V2 (Después Restauración) |
|---------|--------|-----------|---------------------------|
| Sin registros después de agrupar | Código 1 (warning) | Código 1 (warning) | **Código 3** (error crítico) + registro en Fondos_Problema |

**CAMBIO**: Fondo sin registros IPA es error crítico (sale del pipeline).

### CAPM (3 SPs)

#### CAPM_01_Ajuste_CAPM_v2

**Propósito**: Calcula ajuste entre IPA_Cash y CAPM, crea instrumento sintético ADJ IPA-CASHAPP

**Legacy vs V2**:
| Aspecto | Legacy | V2 (Antes) | V2 (Después Restauración) |
|---------|--------|-----------|---------------------------|
| Instrumento ADJ sin homologar | Código 1 (warning) | Código 1 (warning) | **Código 6** (stand-by HOMOLOGACION) |
| Descuadre IPA-CAPM | No validaba | No validaba | **Código 7** (stand-by DESCUADRES-CAPM) + registro en colaAlertasDescuadre |

**NUEVA VALIDACIÓN**: Descuadre IPA-CAPM (umbral $0.01) ahora bloquea PNL hasta aprobación.

#### CAPM_02_Extract_Transform_v2

**Propósito**: Extrae y homologa datos de CASH APPRAISAL

**Legacy vs V2**:
| Aspecto | Legacy | V2 (Antes) | V2 (Después Restauración) |
|---------|--------|-----------|---------------------------|
| Fondo sin homologar | Código 3 (error crítico) | Código 3 (error crítico) | **Código 6** (stand-by HOMOLOGACION) + registro en Homologacion_Fondos |

**CAMBIO**: Homologación de fondo pasa de error crítico a stand-by (permite resolver y resumir).

#### CAPM_03_Carga_Final_v2

**Propósito**: Consolida CAPM final de todos los fondos procesados

**Legacy vs V2**:
| Aspecto | Legacy | V2 (Antes) | V2 (Después Restauración) |
|---------|--------|-----------|---------------------------|
| Diferencia en consolidación | Código 1 (warning) | Código 1 (warning) | **Código 7** (stand-by DESCUADRES-CAPM) + registro en colaAlertasDescuadre |

**CAMBIO**: Descuadre en consolidación CAPM ahora bloquea PNL (posible pérdida de datos).

### PNL (5 SPs)

#### PNL_01_Dimensiones_v2

**Propósito**: Homologa dimensiones de PNL (fondos, monedas)

**Legacy vs V2**:
| Aspecto | Legacy | V2 (Antes) | V2 (Después Restauración) |
|---------|--------|-----------|---------------------------|
| Sin datos PNL | Código 1 (warning) | Código 1 (warning) | Validar `Activo_MantenerFondos`: Si activo → **Código 3**, si inactivo → **Código 0** |
| Fondo sin homologar | Elimina registros, código 1 | Elimina registros, código 1 | **Código 6** (stand-by HOMOLOGACION) + registro en Homologacion_Fondos |
| Moneda sin homologar | Elimina registros, código 1 | Elimina registros, código 1 | **Código 6** (stand-by HOMOLOGACION) + registro en Homologacion_Monedas |

**CAMBIO CRÍTICO**: Homologación faltante ahora bloquea (antes eliminaba registros silenciosamente).

#### PNL_02_Ajuste_v2

**Propósito**: Ajusta PNL según día hábil (transferencia o acumulación)

**Legacy vs V2**:
| Aspecto | Legacy | V2 (Antes) | V2 (Después Restauración) |
|---------|--------|-----------|---------------------------|
| Validación de transferencia | No validaba monto final | No validaba monto final | **NUEVO**: Valida monto final = 0 en días hábiles, **Código 8** si falla |

**NUEVA VALIDACIÓN**: Monto PNL transferido debe ser cero después de día hábil.

### Derivados (4 SPs)

#### DERIV_02_Homologar_Dimensiones_v2

**Propósito**: Homologa fondos e instrumentos de derivados

**Legacy vs V2**:
| Aspecto | Legacy | V2 (Antes) | V2 (Después Restauración) |
|---------|--------|-----------|---------------------------|
| Sin datos derivados | Código 1 (warning) | Código 1 (warning) | Validar `Flag_Derivados`: Si requiere → **Código 3**, si no → **Código 0** |
| Instrumentos sin homologar | Excluye registros, código 1 | Excluye registros, código 1 | **Código 6** (stand-by HOMOLOGACION) |
| Fondos sin homologar | Excluye registros, código 1 | Excluye registros, código 1 | **Código 6** (stand-by HOMOLOGACION) |

**CAMBIO**: Validación de Flag_Derivados + homologación bloquea (antes excluía).

#### DERIV_03_Ajuste_Derivados_v2

**Propósito**: Ajusta derivados contra IPA_Cash

**Legacy vs V2**:
| Aspecto | Legacy | V2 (Antes) | V2 (Después Restauración) |
|---------|--------|-----------|---------------------------|
| Descuadre IPA-Derivados | No validaba | No validaba | **NUEVO**: Valida diferencia > $5,000, **Código 8** (stand-by) |

**NUEVA VALIDACIÓN**: Descuadre IPA-Derivados ahora se registra (antes no se detectaba).

### UBS (3 SPs)

#### UBS_01_Tratamiento_Fondos_Luxemburgo_v2

**Propósito**: Procesa fondos de Luxemburgo (fuente UBS)

**Legacy vs V2**:
| Aspecto | Legacy | V2 (Antes) | V2 (Después Restauración) |
|---------|--------|-----------|---------------------------|
| Sin datos UBS | Código 1 (warning) | Código 1 (warning) | Validar `Flag_UBS`: Si requiere → **Código 3**, si no → **Código 0** |
| Validación TotalMVal | PRINT (solo log) | PRINT (solo log) | **Código 3** (error crítico) + registro en Fondos_Problema |

**CAMBIO CRÍTICO**: Diferencia TotalMVal > $0.01 es error crítico (antes solo PRINT).

---

## Plan de Implementación

### FASE 1: Infraestructura y Códigos (Semanas 1-2)

**Semana 1: Base de Datos**
- ✅ Migration 001: Crear tabla `logs.FondosEnStandBy`
- ✅ Migration 002: Agregar campos a `logs.Ejecucion_Fondos`
- ✅ Crear `LEGACY_VS_V2_ANALYSIS.md`
- Testing de esquema

**Semana 2: Backend - Manejo de Códigos**
- Modificar `BasePipelineService.js`:
  - Clase `StandByRequiredError`
  - Método `_handleStandByCode()`
  - Método `registerFundProblem()`
  - Manejo de códigos 5-8
- Modificar `FundOrchestrator.js`:
  - Método `_checkFundStandByStatus()`
  - Método `_shouldExecuteFund()`
  - Manejo de `StandByRequiredError`
- Testing unitario de códigos

### FASE 2: SPs - Detección y Registro (Semanas 3-5)

**Semana 3: Core SPs (IPA, CAPM)**
- IPA_02_AjusteSONA_v2: 3 cambios (sin datos → 3, homolog → 6, descuadre → 7)
- IPA_04_TratamientoSuciedades_v2: Código 5 (suciedades)
- IPA_06_CrearDimensiones_v2: Código 6 (homolog instrumentos)
- IPA_07_AgruparRegistros_v2: Código 3 (sin registros)
- CAPM_01_Ajuste_CAPM_v2: Código 7 (descuadre IPA-CAPM)
- CAPM_02_Extract_Transform_v2: Cambio 3 → 6 (homolog fondos)
- CAPM_03_Carga_Final_v2: Cambio 1 → 7 (descuadre consolidación)

**Semana 4: PNL SPs**
- PNL_01_Dimensiones_v2: Validar Flag_Activo, código 3 o 6
- PNL_02_Ajuste_v2: NUEVO - Validación transferencia, código 8
- PNL_03, PNL_04, PNL_05: Código 3 (sin datos)

**Semana 5: Derivados y UBS SPs**
- DERIV_02_Homologar_Dimensiones_v2: Validar Flag_Derivados, códigos 0/3/6
- DERIV_03_Ajuste_Derivados_v2: NUEVO - Validación descuadre, código 8
- UBS_01_Tratamiento_Fondos_Luxemburgo_v2: Validar Flag_UBS + TotalMVal → 3
- UBS_02, UBS_03: Validar Flag_UBS

### FASE 3: Orquestación y Resume (Semanas 6-7)

**Semana 6: Flujo Stand-by**
- `sandboxQueues.routes.js`: Actualizar contadores stand-by
- `procesos.v2.routes.js`: Endpoints resume y fondos-en-standby
- Testing flujo completo: Detección → Pausa → Resolución → Resume

**Semana 7: ValidationService y Exclusión**
- Crear `ValidationService.js` (validaciones POST-EXTRACCIÓN)
- Modificar `FundOrchestrator._shouldExecuteFund()` (exclusión automática)
- Modificar `pipeline.config.yaml` (VALIDACION onError: STOP_ALL)
- Testing validaciones y exclusión

### FASE 4: Validación y Documentación (Semana 8)

**Semana 8: Testing Integral**
- Testing con 43 fondos completos
- Validación de cada código de retorno
- Validación de cada tipo de stand-by
- Testing de resume después de aprobación
- Validación de exclusión automática
- Performance testing

**Semana 8: Documentación**
- Finalizar `LEGACY_VS_V2_ANALYSIS.md` (este documento)
- Guía de operador para Mission Control
- Runbook de troubleshooting
- Casos de uso documentados

### BACKLOG: Deprecación Legacy (Semanas 9-13)

**Semana 9**: Marcar Process_* SPs como DEPRECATED
**Semanas 10-12**: Migrar dependencias a API REST
**Semana 13**: DROP legacy SPs

---

## Conclusión

La transición del sistema legacy monolítico al sistema V2 paralelo fue **técnicamente exitosa** en términos de arquitectura y performance, pero **funcionalmente incompleta** en términos de validaciones y controles de calidad.

**Funcionalidades críticas perdidas**:
1. Stand-by logic (pausas para aprobación)
2. Validaciones globales POST-EXTRACCIÓN
3. Registro persistente de problemas
4. Exclusión automática de fondos problemáticos

**Causa raíz**: División de responsabilidades (SPs → Backend) sin completar la implementación del lado del backend.

**Solución**: Plan de 8 semanas para restaurar TODAS las funcionalidades perdidas con mejoras arquitectónicas:
- Stand-by como estado válido (no error)
- Resume desde punto de pausa (no re-ejecutar todo)
- Tracking granular de problemas
- API REST para integración con UI

**Estado actual**: FASE 1 Semana 1 en progreso.

---

**Última actualización**: Enero 2025
**Versión**: 1.0
**Autor**: Migration Team
