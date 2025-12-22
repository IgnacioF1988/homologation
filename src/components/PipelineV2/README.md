# PipelineV2 - Refactorización Completa del Pipeline ETL

**Fecha de Creación:** 2025-12-22
**Versión:** 2.0.0
**Arquitectura:** Modular con Context API + Custom Hooks

---

## 📋 Resumen

Refactorización completa del componente monolítico `PipelineExecution.jsx` (1124 líneas) en una arquitectura modular con:

- ✅ **34 archivos modulares** (<300 líneas cada uno)
- ✅ **Roadmap visual por fondo** (cada fondo con pipeline de 8 etapas)
- ✅ **22 sub-etapas colapsables** (IPA:7, CAPM:3, Derivados:4, PNL:5, UBS:3)
- ✅ **Virtual scrolling** para 50-100+ fondos simultáneos
- ✅ **Hash-based change detection** para optimizar re-renders
- ✅ **Polling automático** con retry logic y auto-stop

---

## 🏗️ Estructura de Archivos

```
src/components/PipelineV2/
├── index.js                                    # Exportador principal ✅
├── PipelineExecutionContainer.jsx              # Orquestador (~150 líneas) ✅
├── README.md                                   # Esta documentación ✅
│
├── components/
│   ├── layout/
│   │   ├── PipelineHeader.jsx                  # Header + botón ejecutar ✅
│   │   ├── ExecutionSummary.jsx                # Métricas agregadas ✅
│   │   └── FundsList.jsx                       # Lista virtualizada ✅
│   │
│   ├── roadmap/
│   │   ├── StageNode.jsx                       # Nodo de etapa ✅
│   │   ├── StageConnector.jsx                  # Conector animado ✅
│   │   └── PipelineRoadmap.jsx                 # Roadmap completo ✅
│   │
│   ├── funds/
│   │   ├── FundCard.jsx                        # Card de fondo ✅
│   │   ├── FundCardHeader.jsx                  # Header del card ✅
│   │   ├── FundRoadmap.jsx                     # Pipeline por fondo ✅
│   │   ├── FundSubStages.jsx                   # Sub-etapas colapsables ✅
│   │   ├── FundErrorPanel.jsx                  # Panel de error ✅
│   │   └── FundFilters.jsx                     # Filtros ✅
│   │
│   ├── modals/
│   │   └── NewExecutionModal.jsx               # Modal nueva ejecución ✅
│   │
│   └── shared/
│       ├── StatusBadge.jsx                     # Badge reutilizable ✅
│       ├── LoadingState.jsx                    # Estados de carga ✅
│       └── EmptyState.jsx                      # Estados vacíos ✅
│
├── hooks/
│   ├── useExecutionState.js                    # Hook central de estado ✅
│   ├── useExecutionPolling.js                  # Polling con cleanup ✅
│   ├── useExecutionActions.js                  # Acciones ✅
│   ├── useFondoParser.js                       # Parser con cache ✅
│   ├── useFondoFilters.js                      # Filtros ✅
│   ├── useStageStats.js                        # Estadísticas ✅
│   └── useSubEtapasExpansion.js                # Expansión ✅
│
├── contexts/
│   ├── PipelineExecutionContext.js             # Context ejecución ✅
│   ├── PipelineFondosContext.js                # Context fondos ✅
│   ├── PipelineUIContext.js                    # Context UI ✅
│   └── PipelineProvider.js                     # Provider wrapper ✅
│
└── utils/
    ├── pipelineConfig.js                       # Config etapas ✅
    ├── stageCalculator.js                      # Cálculo estados ✅
    ├── animationKeyframes.js                   # Animaciones ✅
    ├── formatters.js                           # Formateo ✅
    ├── pipelineParser.js                       # Parsing ✅
    ├── pipelineChangeDetector.js               # Detección cambios ✅
    └── constants.js                            # Constantes ✅
```

**Total: 34 archivos creados**

---

## 🚀 Integración con HomologacionPage.jsx

### Paso 1: Instalar Dependencia (si es necesario)

```bash
npm install @tanstack/react-virtual
```

### Paso 2: Modificar HomologacionPage.jsx

**Antes:**
```javascript
import PipelineExecution from '../components/PipelineExecution';

// Dentro del componente
<TabPanel value={selectedTab} index={2}>
  <PipelineExecution />
</TabPanel>
```

**Después:**
```javascript
import PipelineExecution from '../components/PipelineV2';

// Dentro del componente (sin cambios)
<TabPanel value={selectedTab} index={2}>
  <PipelineExecution />
</TabPanel>
```

### Paso 3: Renombrar Componente Antiguo (Backup)

```bash
# En la terminal
cd src/components
mv PipelineExecution.jsx PipelineExecution.OLD.jsx
```

### Paso 4: Verificar Funcionamiento

1. ✅ Navegar a la pestaña "Pipeline ETL"
2. ✅ Hacer click en "Nueva Ejecución"
3. ✅ Seleccionar fecha y ejecutar
4. ✅ Verificar polling automático cada 2s
5. ✅ Verificar visualización de fondos con roadmaps
6. ✅ Expandir fondos para ver sub-etapas
7. ✅ Probar filtros por estado

---

## 📊 Endpoints Backend Utilizados

**Base URL:** `/api/procesos/v2`

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/ejecutar` | POST | Ejecutar pipeline |
| `/ejecucion/:id` | GET | Obtener estado completo (polling) |
| `/ejecucion/:id/fondos` | GET | Obtener fondos con filtros |
| `/ejecucion/:id/logs` | GET | Obtener logs |
| `/ejecucion/:id/reprocesar` | POST | Reprocesar fondo |

---

## 🎯 Características Implementadas

### 1. Arquitectura Modular
- ✅ 34 archivos <300 líneas cada uno
- ✅ Separación de responsabilidades clara
- ✅ Fácil mantenimiento y testing

### 2. Gestión de Estado
- ✅ 3 Contexts separados (Execution, Fondos, UI)
- ✅ Map-based storage para O(1) lookups
- ✅ Hash-based change detection

### 3. Optimizaciones de Performance
- ✅ Virtual scrolling (@tanstack/react-virtual)
- ✅ React.memo con custom comparators
- ✅ Lazy loading de sub-etapas
- ✅ Cache de parsing con hash

### 4. Visualización
- ✅ Roadmap general de 8 etapas
- ✅ Roadmap individual por fondo
- ✅ 22 sub-etapas colapsables
- ✅ Animaciones fluidas (shimmer, pulse, flow)

### 5. Funcionalidades
- ✅ Polling automático con auto-stop
- ✅ Filtrado por estado (Todos, Error, Warning, OK, En Progreso)
- ✅ Búsqueda por nombre/código
- ✅ Reprocesar fondos con error
- ✅ Panel de errores con recomendaciones

---

## 🔧 Configuración de Sub-Etapas

Definidas en `utils/pipelineConfig.js`:

```javascript
export const SUB_STAGE_CONFIG = {
  PROCESS_IPA: [
    // 7 sub-etapas: RescatarLocalPrice, AjusteSONA, etc.
  ],
  PROCESS_CAPM: [
    // 3 sub-etapas: Ajuste, ExtractTransform, CargaFinal
  ],
  PROCESS_DERIVADOS: [
    // 4 sub-etapas: Posiciones, Dimensiones, Ajuste, Paridad
  ],
  PROCESS_PNL: [
    // 5 sub-etapas: Dimensiones, Ajuste, Agrupacion, AjusteIPA, Consolidar
  ],
  PROCESS_UBS: [
    // 3 sub-etapas: Tratamiento, Derivados, Cartera
  ],
};
```

---

## ⚙️ Hooks Disponibles

### Hook Central
```javascript
import { useExecutionState } from './hooks/useExecutionState';

const state = useExecutionState();
// state.ejecucion, state.fondosMap, state.generalStats, etc.
```

### Polling Automático
```javascript
import { useExecutionPolling } from './hooks/useExecutionPolling';

const polling = useExecutionPolling(idEjecucion, {
  interval: 2000,
  enabled: true,
  onUpdate: (data) => { ... },
  onComplete: (data) => { ... }
});
```

### Acciones
```javascript
import { useExecutionActions } from './hooks/useExecutionActions';

const actions = useExecutionActions({
  onExecuteSuccess: (response) => { ... },
  onReprocessSuccess: (response) => { ... }
});

// actions.executeProcess(fechaReporte)
// actions.reprocesarFondo(idEjecucion, idFund)
```

---

## 📝 Modelo de Datos

### ParsedFondo (Optimizado)
```typescript
interface ParsedFondo {
  id: string;
  shortName: string;
  fullName: string;
  status: number;              // Enum 0-6 para sort rápido
  hasError: boolean;
  hasWarning: boolean;
  isProcessing: boolean;
  stages: StageStatus[];       // 8 etapas
  subStages?: {                // Lazy loading
    ipa?: SubStageStatus[],    // 7 sub-etapas
    capm?: SubStageStatus[],   // 3 sub-etapas
    derivados?: SubStageStatus[], // 4 sub-etapas
    pnl?: SubStageStatus[],    // 5 sub-etapas
    ubs?: SubStageStatus[]     // 3 sub-etapas
  };
  errorInfo?: { step: string, message: string };
  flags: number;               // Bitmask
  startTime?: number;
  endTime?: number;
  duration?: number;
  _hash: string;               // Para change detection
}
```

---

## 🎨 Tema y Estilos

- **Tema:** Ocean Blue + Slate (existente en `src/styles/theme.js`)
- **Colores principales:**
  - Primary: `#2196f3` (Azul)
  - Success: `#4caf50` (Verde)
  - Error: `#f44336` (Rojo)
  - Warning: `#ff9800` (Naranja)
- **Animaciones:** shimmer, flowRight, pulse, blink
- **Bordes redondeados:** 12px-16px
- **Sombras:** Elevaciones 1-4

---

## 🧪 Testing Recomendado

### Unit Tests
- ✅ Hooks: useExecutionState, useFondoParser, useFondoFilters
- ✅ Parsers: parseFondo, parseSubStages
- ✅ Calculators: getStageStatus, calculateProgreso

### Integration Tests
- ✅ Flujo completo: ejecutar → polling → visualizar → reprocesar
- ✅ Filtrado y búsqueda
- ✅ Expansión de sub-etapas

### Performance Tests
- ✅ 100 fondos simultáneos
- ✅ Virtual scrolling
- ✅ Re-renders minimizados

---

## 🐛 Troubleshooting

### Error: "@tanstack/react-virtual no encontrado"
```bash
npm install @tanstack/react-virtual
```

### Polling no se detiene automáticamente
- Verificar que el estado de ejecución incluya: `COMPLETADO`, `ERROR`, o `PARCIAL`
- Revisar configuración en `utils/constants.js` → `POLLING_CONFIG`

### Sub-etapas no se muestran
- Verificar que `fondoBackend` (raw) se pase al componente `FundCard`
- Verificar que los campos `Estado_IPA_01_*` existan en el backend

### Performance lenta con muchos fondos
- Verificar que virtual scrolling esté habilitado
- Revisar que `React.memo` esté funcionando en `FundCard`
- Verificar que hash-based change detection esté activo

---

## 📚 Próximos Pasos

### Mejoras Futuras
- [ ] Modal de detalles de fondo (logs específicos)
- [ ] Comparación de ejecuciones
- [ ] Exportar reportes (PDF, Excel)
- [ ] Cancelación de ejecución en progreso
- [ ] Gráficos de progreso histórico
- [ ] Notificaciones en tiempo real (WebSockets)

### Endpoints Pendientes (Backend)
- [ ] `/api/procesos/v2/ejecucion/:id/cancelar` (Cancelar ejecución)
- [ ] `/api/procesos/v2/ejecucion/:id/reporte` (Descargar reporte)
- [ ] `/api/procesos/v2/ejecucion/:id/fondo/:fondoId/logs` (Logs por fondo)

---

## 👥 Créditos

**Desarrollado por:** Claude Sonnet 4.5
**Fecha:** 2025-12-22
**Basado en:** Pipeline ETL v1 (PipelineExecution.jsx)
**Documentación Backend:** Pipeline_info.md

---

## 📄 Licencia

Este código es parte del proyecto de Homologación interna.

---

**¿Preguntas o problemas?** Revisa el código en `src/components/PipelineV2/` o consulta este README.
