# 🏦 Moneda Homologation System

Sistema de homologación de instrumentos financieros y pipeline ETL para Patria Investimentos.

## 📋 Descripción

Aplicación full-stack que integra:
1. **Sistema de Homologación**: Gestión de instrumentos financieros, fondos, monedas y benchmarks
2. **Pipeline ETL Paralelo**: Procesamiento masivo de datos financieros con arquitectura paralela por fondo

### Características principales
- 📊 Dashboard de colas de pendientes (Mission Control)
- 🔧 CRUD de instrumentos financieros
- 🔄 Sistema de homologación con múltiples fuentes
- 📈 Visualizador de cubo IPA
- ⚙️ Gestión de catálogos
- 🚀 **Pipeline ETL con ejecución paralela (hasta 999 fondos simultáneos)**
- 📝 **Sistema de tracking y logging en tiempo real**
- 🔁 **Retry automático con exponential backoff**
- 🎯 **Manejo de transacciones SQL para integridad de datos**

## 🛠️ Tech Stack

| Capa | Tecnología |
|------|------------|
| Frontend | React 18, Material-UI |
| Backend | Node.js, Express |
| Base de Datos | SQL Server (Inteligencia_Producto_Dev) |
| Estado | React Query |
| Pipeline ETL | Node.js, mssql, YAML config |
| Logging | Bulk insert optimizado |

## 📁 Estructura del Proyecto

```
homologation/
├── src/                           # Frontend React
│   ├── components/                # Componentes reutilizables
│   ├── features/                  # Módulos por funcionalidad
│   ├── pages/                     # Páginas principales
│   ├── services/                  # Clientes API
│   └── utils/                     # Utilidades
├── server/                        # Backend Node.js
│   ├── config/                    # Configuración
│   │   ├── database.js            # Pool de conexiones SQL Server
│   │   └── pipeline.config.yaml   # Configuración del pipeline ETL
│   ├── routes/                    # Endpoints API REST
│   ├── services/                  # Servicios del pipeline ETL
│   │   ├── pipeline/              # Servicios de procesamiento
│   │   │   ├── BasePipelineService.js   # Clase base para servicios
│   │   │   ├── IPAService.js            #  Procesamiento IPA (7 SPs)
│   │   │   ├── CAPMService.js           #  Procesamiento CAPM (2 SPs)
│   │   │   ├── DerivadosService.js      #  Derivados (4 SPs)
│   │   │   ├── PNLService.js            #  PNL (5 SPs)
│   │   │   ├── UBSService.js            #  UBS (3 SPs)
│   │   │   └── examples/                # Tests unitarios
│   │   └── tracking/              # Sistema de tracking
│   │       ├── ExecutionTracker.js      # Estados de ejecución
│   │       └── LoggingService.js        # Logging con bulk insert
│   └── index.js                   # Entry point
├── public/                        # Assets estáticos
└── package.json
```

## 🚀 Instalación

### Prerrequisitos
- Node.js 18+
- SQL Server con base de datos:
  - `Inteligencia_Producto_Dev` (principal)
- Schemas requeridos:
  - `extract.*` - Tablas de extracción
  - `staging.*` - Tablas de staging y SPs de procesamiento
  - `logs.*` - Sistema de tracking y logging
  - `homol.*` - Homologaciones

### Setup

```bash
# 1. Clonar repositorio
git clone https://github.com/TU_USUARIO/moneda-homologation.git
cd moneda-homologation

# 2. Instalar dependencias del frontend
npm install

# 3. Instalar dependencias del backend
cd server
npm install
cd ..

# 4. Configurar variables de entorno
cp server/.env.example server/.env
# Editar server/.env con credenciales de BD

# 5. Iniciar en desarrollo
npm run dev          # Frontend (puerto 3000)
cd server && npm start  # Backend (puerto 3001)
```

## ⚙️ Configuración

### Variables de Entorno (server/.env)
```env
DB_SERVER=QAWS030
DB_DATABASE=Inteligencia_Producto_Dev
DB_USER=tu_usuario
DB_PASSWORD=tu_password
DB_PORT=1433
DB_ENCRYPT=false
DB_TRUST_SERVER_CERTIFICATE=true
DB_INSTANCE_NAME=nombre_instancia  # Opcional
PORT=3001
```

### Configuración del Pipeline (server/config/pipeline.config.yaml)

El pipeline se configura mediante un archivo YAML que define:
- **Servicios**: IPA, CAPM, Derivados, PNL, UBS
- **Dependencias**: Orden de ejecución
- **Concurrencia**: Máximo de fondos en paralelo
- **Timeouts**: Por servicio y por SP
- **Retry logic**: Intentos y delays
- **Tracking**: Campos de estado en BD

Ver `server/config/pipeline.config.yaml` para detalles.

## 📡 API Endpoints

### Health Check
```
GET /api/health
```

### Instrumentos
```
GET    /api/instrumentos
GET    /api/instrumentos/:id
POST   /api/instrumentos
PUT    /api/instrumentos/:id/:moneda
DELETE /api/instrumentos/:id/:moneda
```

### Catálogos
```
GET /api/catalogos
GET /api/catalogos/:catalogo
GET /api/catalogos/:catalogo/options
```

### Colas Sandbox
```
GET    /api/sandbox-queues/summary
GET    /api/sandbox-queues/:queueType
PATCH  /api/sandbox-queues/:queueType/:id
POST   /api/sandbox-queues/:queueType/resolve
DELETE /api/sandbox-queues/:queueType/:id
```

### Pipeline ETL (v2)
```
POST   /api/v2/procesos/ejecutar          # Iniciar ejecución del pipeline
GET    /api/v2/procesos/estado/:id         # Estado de ejecución
GET    /api/v2/procesos/logs/:id           # Logs de ejecución
GET    /api/v2/procesos/historial          # Historial de ejecuciones
```

## 🔄 Pipeline ETL - Arquitectura v2

### Flujo de Procesamiento

```
EXTRACCIÓN (Batch completo)
    ↓
VALIDACIÓN
    ↓
┌────────────────────────────────────────┐
│  PROCESAMIENTO PARALELO POR FONDO     │
├────────────────────────────────────────┤
│                                        │
│  IPA (7 SPs) ──→ CAPM (2 SPs)        │
│      ↓              ↓                  │
│  Derivados*     PNL (5 SPs)           │
│   (4 SPs)                              │
│                                        │
│  UBS** (3 SPs) [Independiente]        │
│                                        │
└────────────────────────────────────────┘
    ↓
CONSOLIDACIÓN CAPM
    ↓
CONCATENAR CUBO
    ↓
GRAPH SYNC (opcional)

* Derivados: Solo fondos con flag Requiere_Derivados
** UBS: Solo fondos Luxemburgo (independiente de IPA)
```

### Servicios Implementados

#### ✅ IPAService - Procesamiento IPA
Ejecuta 7 stored procedures en orden estricto:
1. `IPA_01_RescatarLocalPrice_v2` - Extracción de Geneva + PosModRF
2. `IPA_02_AjusteSONA_v2` - Ajuste con SONA
3. `IPA_03_RenombrarCxCCxP_v2` - Renombrar cuentas por cobrar/pagar
4. `IPA_04_TratamientoSuciedades_v2` - Limpieza de valores pequeños
5. `IPA_05_EliminarCajasMTM_v2` - Separación Cash vs MTM
6. `IPA_06_CrearDimensiones_v2` - Homologación dimensional
7. `IPA_07_AgruparRegistros_v2` - Agrupación final

**Características:**
- Usa transacciones SQL para mantener temp tables entre SPs
- Tracking granular por sub-paso
- Validación de prerequisitos (Portfolio_Geneva, datos extract.IPA)
- Genera: `staging.IPA_WorkTable`, `staging.IPA_Cash`

#### ✅ CAPMService - Procesamiento CAPM
Ejecuta 2 stored procedures:
1. `CAPM_01_Ajuste_CAPM_v2` - Calcula ajuste entre IPA_Cash y CAPM
2. `CAPM_02_Extract_Transform_v2` - Extrae y homologa datos CAPM

**Características:**
- Depende de IPA (requiere `staging.IPA_Cash`)
- Usa tablas de staging versionadas por `ID_Ejecucion` + `ID_Fund`
- Genera: `staging.CAPM_WorkTable`, `staging.Ajuste_CAPM`

#### ✅ DerivadosService - Procesamiento Derivados
Ejecuta 4 stored procedures para derivados:
1. `DERIV_01_Tratamiento_Posiciones_Larga_Corta_v2` - Extrae y trata posiciones largas/cortas
2. `DERIV_02_Homologar_Dimensiones_v2` - Homologación dimensional
3. `DERIV_03_Ajuste_Derivados_v2` - Ajustes específicos de derivados
4. `DERIV_04_Parity_Adjust_v2` - Ajuste de paridad

**Características:**
- Depende de IPA (requiere `staging.IPA_WorkTable`)
- Solo procesa fondos con `Requiere_Derivados = true`
- Usa UNPIVOT múltiple para separar posiciones
- Genera: `staging.Derivados_WorkTable`, `staging.Derivados`, `staging.Ajuste_Derivados`

#### ✅ PNLService - Procesamiento PNL
Ejecuta 5 stored procedures para PNL:
1. `PNL_01_Dimensiones_v2` - Homologación dimensional de PNL
2. `PNL_02_Ajuste_v2` - Ajustes específicos de PNL
3. `PNL_03_Agrupacion_v2` - Agrupación de registros PNL
4. `PNL_04_CrearRegistrosAjusteIPA_v2` - Crea ajustes contra IPA
5. `PNL_05_Consolidar_IPA_PNL_v2` - Consolidación final IPA + PNL

**Características:**
- Depende de IPA (requiere `staging.IPA` procesado)
- Consolida IPA + PNL en `staging.PNL_IPA`
- Copia datos finales a `process.TBL_PNL`
- Genera gains (PRgain, PUgain, FxRgain, etc.)

#### ✅ UBSService - Procesamiento UBS
Ejecuta 3 stored procedures para fondos Luxemburgo:
1. `UBS_01_Tratamiento_Fondos_Luxemburgo_v2` - Extracción y tratamiento UBS
2. `UBS_02_Tratamiento_Derivados_MLCCII_v2` - Derivados MLCCII (condicional)
3. `UBS_03_Creacion_Cartera_MLCCII_v2` - Crea cartera MLCCII (condicional)

**Características:**
- **Independiente de IPA** - Solo requiere extracción
- UBS_02 y UBS_03 solo ejecutan si `Es_MLCCII = true`
- Genera: `staging.UBS_WorkTable`, `staging.MLCCII_Derivados`, `staging.MLCCII`

### Características del Pipeline

#### 🚀 Ejecución Paralela Masiva
- **999 fondos simultáneos**: Sin límite práctico de paralelización
- **Aislamiento por fondo**: Cada fondo usa tablas staging versionadas
- **Pool de 200 conexiones**: Optimizado para alta concurrencia
- **Manejo de dependencias**: IPA → CAPM → PNL (respeta dependencias)

#### 📝 Sistema de Tracking
- **Estados granulares**: Por servicio y por sub-paso
- **Tracking en tiempo real**: `logs.Ejecucion_Fondos`
- **Métricas de rendimiento**: Duración, filas procesadas, errores
- **Histórico completo**: `logs.Ejecuciones`

#### 🔁 Retry Logic
- **Retry automático**: 3 intentos con exponential backoff (5s, 10s, 15s)
- **Errores retriables**: Deadlocks, timeouts, errores de conexión
- **Rollback automático**: En caso de error en transacción

#### 📊 Logging Optimizado
- **Bulk insert**: Batches de 100 logs
- **Flush automático**: Cada 5 segundos
- **Niveles**: DEBUG, INFO, WARNING, ERROR
- **Metadata contextual**: Etapa, fondo, servicio, stack traces

## 👥 Desarrollo en Equipo

Ver [GITHUB_GUIDE.md](./GITHUB_GUIDE.md) para guía completa de Git/GitHub.

### Flujo de trabajo
1. Crear rama desde `main`: `git checkout -b feature/mi-feature`
2. Desarrollar y hacer commits
3. Push y crear Pull Request
4. Code review por otro miembro
5. Merge a `main`

### Convención de commits
```
feat: nueva funcionalidad
fix: corrección de bug
docs: documentación
refactor: refactorización
test: tests
```

## 🧪 Testing

### Tests del Pipeline ETL v2

#### Quick Test - Verificación de SPs v2
```bash
cd server
npm run test:quick
```

Verifica que todos los 21 SPs v2 estén creados en SQL Server:
- ✅ 4 SPs Derivados
- ✅ 5 SPs PNL
- ✅ 3 SPs UBS
- ✅ 7 SPs IPA
- ✅ 2 SPs CAPM
- ⏱️ Duración: ~2 segundos

**Resultado esperado:**
```
✓ staging.DERIV_01_Tratamiento_Posiciones_Larga_Corta_v2
✓ staging.DERIV_02_Homologar_Dimensiones_v2
...
Total: 12 OK, 0 FAIL
✅ Todos los SPs v2 están creados!
```

#### Full Test Suite - Prueba Completa
```bash
cd server
npm run test:full
```

Ejecuta suite completa de pruebas:
- ✅ Migraciones aplicadas (18 tablas con ID_Ejecucion/ID_Fund)
- ✅ Stored Procedures v2 creados (21 SPs)
- ✅ Configuración de servicios (pipeline.config.yaml)
- ✅ Integración (ejecuta un SP de prueba)
- ⏱️ Duración: ~10 segundos

**Resultado esperado:**
```
================================================================================
RESUMEN FINAL DE PRUEBAS
================================================================================
  1. Migraciones:        18 OK, 0 FAIL
  2. Stored Procedures:  21 OK, 0 FAIL
  3. Servicios:          5 OK, 0 FAIL
  4. Integración:        1 OK, 0 FAIL

✓ TODAS LAS PRUEBAS PASARON (45/45)
El pipeline v2 está listo para producción! 🎉
```

#### Test Unitario - IPAService
```bash
node server/services/pipeline/examples/test_ipa_service.js
```

Ejecuta el procesamiento completo de IPA para 1 fondo:
- ✅ Inicializa ejecución en BD
- ✅ Ejecuta 7 SPs de IPA en transacción
- ✅ Valida resultados (46 registros extraídos, 24 agrupados)
- ✅ Verifica tracking y logging
- ⏱️ Duración: ~4-5 segundos

#### Test Unitario - CAPMService
```bash
node server/services/pipeline/examples/test_capm_service.js
```

Ejecuta IPA + CAPM para 1 fondo:
- ✅ Ejecuta IPA como prerequisito
- ✅ Ejecuta 2 SPs de CAPM en transacción
- ✅ Valida dependencia (staging.IPA_Cash)
- ✅ Obtiene métricas CAPM
- ⏱️ Duración: ~6 segundos total

#### Test Unitario - DerivadosService
```bash
node server/services/pipeline/examples/test_derivados_service.js
```

Ejecuta IPA + Derivados para 1 fondo:
- ✅ Ejecuta IPA como prerequisito
- ✅ Ejecuta 4 SPs de Derivados
- ✅ Valida posiciones largas/cortas
- ✅ Verifica homologación dimensional
- ⏱️ Duración: ~7 segundos total

#### Test Unitario - PNLService
```bash
node server/services/pipeline/examples/test_pnl_service.js
```

Ejecuta IPA + PNL para 1 fondo:
- ✅ Ejecuta IPA como prerequisito
- ✅ Ejecuta 5 SPs de PNL
- ✅ Valida consolidación IPA + PNL
- ✅ Verifica copia a process.TBL_PNL
- ⏱️ Duración: ~8 segundos total

#### Test Unitario - UBSService
```bash
node server/services/pipeline/examples/test_ubs_service.js
```

Ejecuta UBS (independiente) para 1 fondo MLCCII:
- ✅ Ejecuta 3 SPs de UBS
- ✅ Valida tratamiento de derivados MLCCII
- ✅ Verifica creación de cartera MLCCII
- ⏱️ Duración: ~5 segundos

### Tests del Frontend
```bash
# Unit tests
npm test

# E2E tests (si existen)
npm run test:e2e
```

## 📦 Build para Producción

```bash
# Build frontend
npm run build

# Los archivos estáticos quedan en /build
```

## 🔗 Base de Datos - Inteligencia_Producto_Dev

### Schemas y Tablas Principales

#### `extract.*` - Extracción de Fuentes
- `extract.IPA` - Datos de Geneva
- `extract.CAPM` - Datos de CAPM
- `extract.Derivados` - Datos de derivados
- `extract.UBS` - Datos de UBS
- `extract.SONA` - Datos de SONA

#### `staging.*` - Procesamiento
- **Tablas de trabajo**: `staging.IPA_WorkTable`, `staging.IPA_Cash`, etc.
- **Stored Procedures**: Todos los SPs `*_v2` del pipeline
- **Versionado**: Tablas incluyen `ID_Ejecucion` + `ID_Fund` para aislamiento

#### `logs.*` - Tracking y Logging
- `logs.Ejecuciones` - Estado general de cada ejecución
- `logs.Ejecucion_Fondos` - Estado detallado por fondo
- `logs.Ejecucion_Logs` - Logs estructurados con bulk insert

#### `homol.*` - Homologaciones
- `BD_Funds` - Catálogo de fondos
- `BD_Instrumentos` - Catálogo de instrumentos
- `HOMOL_*` - Tablas de homologación

### Migraciones y Cambios Recientes

#### ✅ Pipeline v2 Completado (Diciembre 2024)

**Migraciones Ejecutadas:**
- ✅ `001_add_execution_tracking_to_derivados_tables.sql` - 4 tablas Derivados
- ✅ `002_add_execution_tracking_to_pnl_tables.sql` - 5 tablas PNL
- ✅ `003_add_execution_tracking_to_ubs_tables.sql` - 3 tablas UBS
- ✅ `004_add_execution_tracking_to_ipa_tables.sql` - 5 tablas IPA
- ✅ `005_add_execution_tracking_to_process_tables.sql` - 1 tabla Process

**Total: 18 tablas actualizadas** con columnas `ID_Ejecucion` (BIGINT) e `ID_Fund` (INT)

**Stored Procedures v2 Creados:**
- ✅ 4 SPs Derivados (DERIV_01-04_v2)
- ✅ 5 SPs PNL (PNL_01-05_v2)
- ✅ 3 SPs UBS (UBS_01-03_v2)
- ✅ 7 SPs IPA (IPA_01-07_v2)
- ✅ 2 SPs CAPM (CAPM_01-02_v2)

**Total: 21 SPs v2 operativos** en producción

**Servicios Implementados:**
- ✅ IPAService - Procesamiento IPA completo
- ✅ CAPMService - Procesamiento CAPM completo
- ✅ DerivadosService - Procesamiento Derivados completo
- ✅ PNLService - Procesamiento PNL + consolidación
- ✅ UBSService - Procesamiento fondos Luxemburgo

**Sistema de Testing:**
- ✅ Quick test de verificación de SPs (`npm run test:quick`)
- ✅ Full test suite de integración (`npm run test:full`)
- ✅ Tests unitarios por servicio

Ver documentación completa en:
- `RESUMEN_FINAL_V2.md` - Resumen completo del proyecto v2
- `TEST_PIPELINE_V2_README.md` - Guía de testing
- `SOLUCION_SELECT_ASTERISCO.md` - Correcciones SQL aplicadas
- `FASE_2_COMPLETADA.md` - Resumen Fase 2 (IPA/CAPM)
- `INSTRUCCIONES_TESTING.md` - Guía de testing Fase 2

## 🔧 Troubleshooting

### Error: "Connection is closed"
**Causa**: El pool de conexiones se cerró prematuramente
**Solución**: Verificar que se usan transacciones (`sql.Transaction`) en lugar de `pool.connect()` para mantener el contexto de sesión

### Error: "Campo de estado 'Estado_XXX' no permitido"
**Causa**: El campo de tracking no está en la lista de allowedFields
**Solución**: Agregar el campo en `ExecutionTracker.js` línea 157-191

### Error: "Procedure expects parameter '@Portfolio_Geneva'"
**Causa**: Falta configurar inputFields en pipeline.config.yaml
**Solución**: Agregar `Portfolio_Geneva` en la lista de inputFields del SP

### IPA_05 procesa 0 registros Cash
**Causa**: El filtro está usando InvestDescription en lugar de LSDesc
**Solución**: El SP debe filtrar por `LSDesc IN ('Cash Long', 'Cash Short')`

### Tests unitarios fallan con datos viejos
**Causa**: Los datos de extract.* son de fechas antiguas
**Solución**: Actualizar `fechaReporte` en el test a una fecha con datos disponibles (ej: '2025-12-15')

## 📚 Mejores Prácticas

### Desarrollo de Servicios
1. **Heredar de BasePipelineService**: Todas las funcionalidades comunes están aquí
2. **Usar transacciones**: Para mantener temp tables entre SPs
3. **Validar prerequisites**: En el método `execute()` antes de procesar
4. **Logging granular**: INFO para pasos exitosos, ERROR con stack traces
5. **Cleanup**: Siempre limpiar temp tables al finalizar (exitoso o error)

### Configuración YAML
1. **inputFields**: Listar TODOS los parámetros que requiere el SP
2. **tracking.subStateField**: Usar nombre EXACTO de la columna en BD
3. **timeout**: Configurar según complejidad del SP (min 120000ms)
4. **dependencies**: Especificar claramente para respetar orden de ejecución

### Testing
1. **Usar fechas con datos**: Verificar que extract.* tenga datos antes de testear
2. **ID_Ejecucion único**: Usar `BigInt(Date.now())` para evitar colisiones
3. **Cleanup final**: Siempre cerrar pool y destruir logger
4. **Verificar logs**: Usar `logger.getExecutionLogs()` para debugging

## 🎯 Roadmap

### Corto Plazo (Q1 2025)
- [x] Implementar DerivadosService
- [x] Implementar PNLService
- [x] Implementar UBSService
- [x] Tests end-to-end del pipeline completo
- [x] Integración con frontend (PipelineExecution.jsx)

### Mediano Plazo (Q2 2025)
- [ ] Dashboard de monitoreo en tiempo real
- [ ] API REST completa para el pipeline
- [ ] Notificaciones por email/Slack
- [ ] Reportes automáticos de ejecución

### Largo Plazo (H2 2025)
- [ ] Migración a arquitectura de microservicios
- [ ] Implementación de cache distribuido (Redis)
- [ ] Orquestación con Kubernetes
- [ ] CI/CD completo

## 👤 Autores

- **Ignacio Fuentes** - Data & Analytics Lead - Patria Investimentos

## 📄 Licencia

Privado - Patria Investimentos © 2025
