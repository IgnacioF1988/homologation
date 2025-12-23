# Pipeline V2: Complete migration with enhanced tracking and critical bug fixes

## 🚀 Pipeline V2 - Migración Completa y Fixes Críticos

Esta PR migra completamente el sistema de Pipeline V1 a V2 con arquitectura mejorada, sistema de tracking en tiempo real, y resuelve bugs críticos de transacciones que causaban pérdida de datos.

---

## 📋 Resumen de Cambios

### ✨ Nuevas Características

**1. Pipeline V2 Architecture**
- Sistema de orquestación modular con `FundOrchestrator`, `DependencyResolver`, `WorkerPool`
- Servicios especializados: `IPAService`, `CAPMService`, `PNLService`, `UBSService`, `DerivadosService`
- `BasePipelineService` con manejo centralizado de transacciones, retry logic, y logging
- Configuración declarativa en `pipeline.config.yaml`

**2. Enhanced Tracking System**
- `ExecutionTracker`: Actualización de estados en tiempo real
- `LoggingService`: Logging estructurado con batch writes y auto-flush
- Tracking granular de sub-estados (IPA_01 a IPA_07, CAPM_01-02, PNL_01-05, etc.)

**3. New UI Components (React)**
- `PipelineExecutionContainer`: Container principal con polling automático
- `FundCard`: Visualización detallada del estado de cada fondo
- `PipelineRoadmap`: Roadmap visual del progreso de ejecución
- Sistema de filtros por estado, búsqueda, y expansión de sub-etapas

**4. Database Enhancements**
- RCSI (Read Committed Snapshot Isolation) habilitado
- Migración `ID_Fund` de `VARCHAR(10)` a `INT`
- Stored Procedures v2 con manejo de transacciones externas
- Índices optimizados para consultas de tracking

---

## 🐛 Bugs Críticos Resueltos

### **Bug #1: PROCESS_UBS Conditional Missing** ✅
**Síntoma:** 11 fondos fallando con "uncommittable transaction detected"

**Causa Raíz:**
- `PROCESS_UBS` se ejecutaba para TODOS los fondos (no solo Luxembourg)
- Fondos sin `Portfolio_UBS` generaban error dentro de transacción activa
- Error hacía la transacción uncommittable → rollback de data IPA

**Fix:**
```yaml
# server/config/pipeline.config.yaml:353
conditional: Flag_UBS  # Solo fondos con Flag_UBS=1
```

**Impacto:** Eliminó 11/12 errores de uncommittable transaction

---

### **Bug #2: Transaction Commit Bug** ✅
**Síntoma:** Data IPA no persistía, CAPM fallaba con "No data in staging.IPA_Cash"

**Causa Raíz:**
```javascript
// INCORRECTO: Validación fuera del contexto de transacción
const xactStateResult = await this.pool.request()
  .query('SELECT XACT_STATE() as XactState');
```

**Fix:**
```javascript
// server/services/pipeline/BasePipelineService.js:96
const xactStateResult = await transaction.request()
  .query('SELECT XACT_STATE() as XactState');
```

**Impacto:** Data ahora persiste correctamente en staging tables

---

### **Bug #3: Concurrency Transaction Conflicts** ⚠️
**Síntoma:** Con concurrency=3, fondos generaban uncommittable transactions durante IPA_03

**Workaround Temporal:**
```javascript
// server/services/orchestration/FundOrchestrator.js:257
const concurrencyLimit = Math.min(this.fondos.length, 1);  // era: 3
```

**Trade-off:**
- ✅ 100% estabilidad (0 uncommittable errors)
- ❌ Performance reducida (~6 min vs ~2 min para 43 fondos)

**Próximo Paso:** Investigar root cause para recuperar paralelismo

---

## 🧪 Validación y Testing

### **Ejecuciones de Prueba:**

| Ejecución | Fecha | Fondos OK | Errores | Uncommittable | Resultado |
|-----------|-------|-----------|---------|---------------|-----------|
| 1766174087338 | 2024-10-24 | 31/43 (72%) | 12 | ⚠️ 9 | FAIL (bugs activos) |
| 1766174087341 | 2024-10-24 | **38/43 (88%)** | 5 | ✅ 0 | **SUCCESS** |
| 1766174087343 | 2025-12-15 | **38/43 (88%)** | 5 | ✅ 0 | **SUCCESS** |

### **Métricas Clave:**
- ✅ **88.4% tasa de éxito** (errores solo por falta de datos en fuente)
- ✅ **0 uncommittable transaction errors** (antes: 9)
- ✅ **100% data persistence** (IPA → CAPM → PNL flow)
- ✅ **Consistencia entre fechas**

### **Fondos con Error (Esperado):**
5 fondos sin datos en extract.IPA para fechas de prueba:
- MLEQ (18), MDELA (12), Moneda GSI (51), Moneda GSI RER (54), MCCDF (63)

---

## 📁 Archivos Principales Modificados

### Backend (Node.js)
- `server/services/orchestration/FundOrchestrator.js` - Orquestador principal
- `server/services/pipeline/BasePipelineService.js` - Clase base con transaction management
- `server/services/pipeline/*Service.js` - Servicios especializados (IPA, CAPM, PNL, UBS, Derivados)
- `server/services/tracking/*` - ExecutionTracker y LoggingService
- `server/config/pipeline.config.yaml` - Configuración declarativa del pipeline
- `server/routes/procesos.v2.routes.js` - Endpoints API para Pipeline V2

### Frontend (React)
- `src/components/PipelineV2/*` - Componentes UI completos
- `src/components/PipelineV2/hooks/*` - Custom hooks (polling, filters, parsing)
- `src/components/PipelineV2/contexts/*` - Context providers
- `src/components/PipelineV2/utils/*` - Utilidades (parsers, formatters, constants)

### Database
- `server/database/migrations/MIGRATION_ID_Fund_To_INT.sql` - Migración ID_Fund
- `server/database/migrations/REMOVE_THROW_FROM_SPs_v2.sql` - SPs v2
- `server/database/migrations/REMOVE_TICKER_FROM_PNL_02_v2.sql` - Ticker opcional
- `database/scripts/01_enable_read_committed_snapshot.sql` - RCSI config

### Documentation
- `Pipeline_info.md` - Documentación completa Pipeline V2
- `server/VERIFICATION_REPORT_2025-12-22.md` - Reporte de validación
- `docs/TRACING_GUIDE.md` - Guía del sistema de tracing

---

## 🔄 Migration Path

**V1 → V2 Coexistence:**
- V1 endpoint: `POST /api/procesos/ejecutar` (legacy, sin cambios)
- V2 endpoint: `POST /api/procesos/v2/ejecutar` (nuevo)
- Ambos comparten mismas tablas SQL, diferente orquestación

**Breaking Changes:**
- None - V1 sigue funcionando sin cambios

---

## 📊 Performance

**Current (Concurrency=1):**
- 43 fondos: ~6 minutos
- Memory: ~450MB peak
- Database connections: ~20 concurrent

**Future (Concurrency=3+ cuando se resuelva root cause):**
- 43 fondos: ~2 minutos (estimado)
- Mejor utilización de RCSI

---

## 🚧 Known Limitations

1. **Concurrency=1 (Temporal):** Performance reducida hasta resolver uncommittable transaction root cause
2. **Frontend Polling:** Intervalo fijo de 2s (mejorar a WebSocket en futuro)
3. **VALIDACION Phase:** Definida en config pero sin implementación Node.js (usa SPs directamente)

---

## 🔮 Next Steps

**Prioridad Alta:**
1. Investigar root cause de uncommittable transactions con concurrency > 1
2. Probar con transacciones más cortas (commit por SP vs por servicio)
3. Monitoreo en producción con fechas actuales

**Prioridad Media:**
1. Implementar WebSocket para updates en tiempo real
2. Dashboard de métricas de performance
3. Alertas automáticas para fondos con error

**Backlog:**
1. Deduplicar logging (3 mensajes por error → 1)
2. Agregar métricas por servicio
3. Cleanup de archivos legacy

---

## 📸 Screenshots

Ver UI components en: `src/components/PipelineV2/README.md`

---

## ✅ Checklist

- [x] Tests passed (integration test: `server/test_v2_integration.js`)
- [x] Database migrations executed successfully
- [x] RCSI enabled on database
- [x] Documentation updated
- [x] Validation with multiple dates (2024-10-24, 2025-12-15)
- [x] 0 uncommittable transaction errors confirmed
- [x] Backward compatibility maintained (V1 unchanged)

---

## 👥 Co-Authors

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
