# Reporte de Prueba - Pipeline ETL v2 (24 Octubre 2025)

**Fecha de Prueba:** 22 de diciembre de 2025, 19:42
**Fecha de Reporte:** 2025-10-24
**ID de Ejecución:** 1766174087331
**Método de Prueba:** Playwright Browser Automation

---

## Resumen Ejecutivo

✅ **ÉXITO:** La etapa EXTRACCIÓN ahora se ejecuta correctamente (todos los 8 SPs completados con returnValue: 0 o 1)
⚠️ **PROBLEMA CRÍTICO:** EXTRACCIÓN se ejecuta múltiples veces (una por fondo) en lugar de una sola vez
❌ **FALLO:** Múltiples fondos fallan en IPA/CAPM con timeouts y errores críticos
⚠️ **FRONTEND:** Muestra "Cargando fondos..." con NaN% (FondosExitosos: 0, FondosFallidos: 0)

---

## Estado de la Ejecución

**Estado General:**
- Estado: EN_PROGRESO
- Total Fondos: 43
- Fondos Exitosos: 0
- Fondos Fallidos: 0 (contador no actualizado correctamente)
- Fondos con ERROR real: 7
- Fondos EN_PROGRESO: 3
- Fondos sin iniciar: 33

**Duración:** ~5 minutos (y continúa ejecutándose)

---

## Análisis de EXTRACCIÓN

### ✅ Logros

La etapa EXTRACCIÓN ahora ejecuta correctamente los 8 stored procedures:

1. **extract.Extract_IPA** - ReturnValue: 0 ✓
2. **extract.Extract_CAPM** - ReturnValue: 0 ✓
3. **extract.Extract_PosModRF** - ReturnValue: 0 ✓
4. **extract.Extract_SONA** - ReturnValue: 0 ✓
5. **extract.Extract_Derivados** - ReturnValue: 1 (sin datos - esperado) ✓
6. **extract.Extract_UBS** - ReturnValue: 0 ✓
7. **extract.Extract_UBS_MonedaDerivados** - ReturnValue: 0 ✓
8. **extract.Extract_UBS_Patrimonio** - ReturnValue: 0 ✓

**Tiempo de Ejecución:** ~13-16 segundos por ejecución

### ❌ Problema Crítico: EXTRACCIÓN Ejecutándose Múltiples Veces

La etapa EXTRACCIÓN se está ejecutando **una vez por cada fondo** en lugar de **una sola vez** al inicio:

```
[ExtractionService 1766174087331] Iniciando extracción para fecha 2025-10-24  (Fondo 2)
[ExtractionService 1766174087331] Iniciando extracción para fecha 2025-10-24  (Fondo 8)
[ExtractionService 1766174087331] Iniciando extracción para fecha 2025-10-24  (Fondo 13)
[ExtractionService 1766174087331] Iniciando extracción para fecha 2025-10-24  (Fondo 14)
...
```

**Impacto:**
- 43 fondos × 13-16 segundos = ~9-11 minutos de overhead innecesario
- Carga excesiva en SQL Server (ejecutando los mismos SPs 43 veces)
- Los datos extraídos son los mismos en todas las ejecuciones (operación batch)

**Causa Raíz:**
EXTRACCIÓN está configurada como servicio en `pipeline.config.yaml` pero FundOrchestrator la está ejecutando **por fondo** en lugar de **una sola vez** al inicio de la ejecución.

---

## Fondos Fallidos (7 total)

### Patrón de Fallo Común

Todos los fondos fallidos siguen el mismo patrón:

1. **IPA falla** - Timeout (15000ms) o datos faltantes
2. **CAPM falla** - staging.CAPM_01_Ajuste_CAPM_v2 returnValue: 3 (error crítico)
3. **PNL se omite** - Requiere IPA exitoso

| ID | Fondo | Estado IPA | Estado CAPM | Mensaje Error |
|----|-------|------------|-------------|---------------|
| 2 | ALTURAS II | ERROR | ERROR | PNL requiere que IPA haya completado exitosamente |
| 8 | GLORY | ERROR | ERROR | PNL requiere que IPA haya completado exitosamente |
| 13 | MDLAT | ERROR | ERROR | PNL requiere que IPA haya completado exitosamente |
| 14 | MDLIG | ERROR | ERROR | PNL requiere que IPA haya completado exitosamente |
| 15 | MERCER | ERROR | ERROR | PNL requiere que IPA haya completado exitosamente |
| 16 | MLCD | ERROR | ERROR | PNL requiere que IPA haya completado exitosamente |
| 19 | MRV | ERROR | ERROR | PNL requiere que IPA haya completado exitosamente |

### Error Logs - Fondo ALTURAS II (ID: 2)

```
[2025-12-22T22:44:42.477Z][ERROR] Timeout: Request failed to complete in 15000ms
  Estado_Process_IPA: ERROR

[2025-12-22T22:44:44.243Z][ERROR] staging.CAPM_01_Ajuste_CAPM_v2 falló críticamente (returnValue: 3)
  Estado_Process_CAPM: ERROR

[2025-12-22T22:44:44.907Z][ERROR] PNL requiere que IPA haya completado exitosamente para el fondo ALTURAS II
  Estado IPA actual: ERROR
```

---

## Fondos en Progreso (3 total)

Estos fondos están actualmente procesando IPA:

| ID | Fondo | Estado |
|----|-------|--------|
| 23 | MRFIIG | Estado_Process_IPA: EN_PROGRESO |
| 25 | MRVE | Estado_Process_IPA: EN_PROGRESO |
| 26 | MRVI | Estado_Process_IPA: EN_PROGRESO |

---

## Problemas Identificados

### 1. Timeouts de IPA (15 segundos)

Múltiples fondos experimentan timeouts al ejecutar stored procedures de IPA:

```
[PROCESS_IPA] Error retriable en intento 1/3.
Reintentando en 5000ms...
Error: Timeout: Request failed to complete in 15000ms
```

**Causa Probable:**
- SPs de IPA toman más de 15 segundos en ejecutar
- Posible problema de rendimiento en SQL Server
- Locks/deadlocks en tablas staging

**Solución Recomendada:**
- Aumentar timeout de IPA de 15s a 30-60s
- Investigar queries lentos en staging.IPA_01_RescatarLocalPrice_v2
- Verificar índices en tablas staging

### 2. CAPM returnValue: 3 (Error Crítico)

staging.CAPM_01_Ajuste_CAPM_v2 retorna 3 para varios fondos:

```
staging.CAPM_01_Ajuste_CAPM_v2 completado - ReturnValue: 3, Filas: 0, Errores: 1
```

**Significado de ReturnValue: 3:**
- Error crítico no recuperable
- El SP no procesó ninguna fila (Filas: 0)
- Reportó 1 error (Errores: 1)

**Causa Probable:**
- Datos de CAPM faltantes para la fecha 2025-10-24
- Validaciones dentro del SP fallando
- Dependencias de datos no satisfechas

**Solución Recomendada:**
- Ejecutar manualmente: `EXEC staging.CAPM_01_Ajuste_CAPM_v2 @IdEjecucion=1766174087331, @IdFondo=2, @FechaReporte='2025-10-24'`
- Revisar mensajes de error del SP (tabla de errores o RAISERROR)
- Verificar datos en extract.CAPM para la fecha 2025-10-24

### 3. Portfolio_UBS Faltante

Varios fondos no tienen Portfolio_UBS definido:

```
Error: Fondo 15 (MERCER) no tiene Portfolio_UBS definido.
UBS requiere este campo.
```

**Fondos Afectados:**
- MERCER (ID: 15)
- MLCD (ID: 16)
- MRV (ID: 19)
- GLORY (ID: 8)

**Solución:**
- Actualizar tabla logs.Fondos con Portfolio_UBS para estos fondos
- O marcar estos fondos como "no requiere UBS"

### 4. Frontend NaN%

El frontend muestra "Cargando fondos..." con NaN% de progreso:

**Causa:**
```json
"FondosExitosos": 0,
"FondosFallidos": 0
```

División por cero: `0 / (0 + 0) = NaN`

**Solución:**
- El contador de fondos fallidos no se está actualizando correctamente
- ExecutionTracker no está incrementando FondosFallidos cuando fondos tienen Estado_Final: ERROR
- Verificar lógica en FundOrchestrator._updateExecutionStats()

---

## Logs de EXTRACCIÓN (Múltiples Ejecuciones)

### Primera Ejecución (Líneas 811-1075)
```
[ExtractionService 1766174087330] Iniciando extracción para fecha 2025-10-24
[ExtractionService 1766174087330] Ejecutando grupo orden 1 (6 SPs)
...
[ExtractionService 1766174087330] Extracción completada en 13615ms - 8 fuentes extraídas
```

### Segunda Ejecución (Líneas 828-1134)
```
[ExtractionService 1766174087330] Iniciando extracción para fecha 2025-10-24
[ExtractionService 1766174087330] Ejecutando grupo orden 1 (6 SPs)
...
[ExtractionService 1766174087330] Extracción completada en 14729ms - 8 fuentes extraídas
```

### Tercera Ejecución (Líneas 917-1160)
```
[ExtractionService 1766174087330] Iniciando extracción para fecha 2025-10-24
...
[ExtractionService 1766174087330] Extracción completada en 15805ms - 8 fuentes extraídas
```

**Total de Ejecuciones Observadas:** ~20+ (una por cada fondo procesado)

---

## Comparación: Antes vs Después

| Aspecto | Antes del Fix | Después del Fix |
|---------|---------------|-----------------|
| EXTRACCIÓN ejecuta | ❌ No ejecuta | ✅ Ejecuta correctamente |
| Fondos fallan con | "No hay datos extraídos de IPA" | Timeouts de IPA, CAPM returnValue: 3 |
| Eficiencia EXTRACCIÓN | N/A | ❌ Ejecuta 43 veces (debería ser 1) |
| Frontend muestra | "Cargando fondos..." NaN% | "Cargando fondos..." NaN% |

---

## Próximos Pasos Recomendados

### Alta Prioridad

1. **Corregir EXTRACCIÓN múltiple** ⚠️ CRÍTICO
   - Modificar FundOrchestrator para ejecutar servicios batch (tipo: batch) UNA SOLA VEZ antes del procesamiento de fondos
   - No ejecutar EXTRACCIÓN en el loop per-fondo

2. **Aumentar timeout de IPA**
   - Cambiar de 15000ms a 30000ms o 60000ms
   - Archivo: `server/config/pipeline.config.yaml`

3. **Investigar CAPM returnValue: 3**
   - Ejecutar SP manualmente con parámetros de prueba
   - Revisar logs de SQL Server
   - Verificar datos en extract.CAPM

4. **Corregir contador de fondos fallidos**
   - Revisar FundOrchestrator._updateExecutionStats()
   - Asegurar que FondosFallidos se incremente cuando Estado_Final = ERROR

### Media Prioridad

5. **Actualizar Portfolio_UBS**
   - Agregar Portfolio_UBS para fondos que lo requieren
   - O desactivar validación UBS para fondos Luxemburgo sin portfolio

6. **Optimizar rendimiento de IPA**
   - Analizar query plan de staging.IPA_01_RescatarLocalPrice_v2
   - Agregar índices si es necesario
   - Verificar locks en tablas staging

---

## Conclusión

**Resultado de la Prueba:** ⚠️ **PARCIALMENTE EXITOSO**

La implementación de ExtractionService corrigió el problema principal (EXTRACCIÓN no ejecutaba), pero reveló nuevos problemas:

1. ✅ EXTRACCIÓN ahora ejecuta y completa todos los SPs
2. ❌ EXTRACCIÓN se ejecuta múltiples veces (ineficiencia crítica)
3. ❌ Múltiples fondos fallan en IPA/CAPM
4. ❌ Frontend no muestra progreso correctamente

**Prioridad Máxima:** Corregir la ejecución múltiple de EXTRACCIÓN antes de continuar con más pruebas.

---

**Generado:** 2025-12-22 22:50:00
**Autor:** Claude Code Pipeline Testing
**Archivo:** server/PLAYWRIGHT_TEST_OCT24_RESULTS.md
