# Plan Feature

Planifica features grandes con metodologia estructurada de 6 fases.

## Uso

```
/plan-feature "Sistema de reintentos automaticos"
/plan-feature "Dashboard de metricas del pipeline"
```

## Fases

### Fase 1: Setup

Crear estructura de directorios para la feature:

```
.plans/
└── {feature-name}/
    ├── plan.md              # Plan maestro
    └── tasks/
        ├── T01.md
        ├── T02.md
        └── ...
```

### Fase 2: Research

1. **Explorar codebase** relacionado
2. **Identificar** componentes afectados
3. **Proponer** 2-3 estrategias de implementacion
4. **Documentar** trade-offs de cada estrategia

```markdown
## Estrategias

### Opcion A: [Nombre]
- Descripcion: ...
- Pros: ...
- Contras: ...
- Complejidad: Alta/Media/Baja

### Opcion B: [Nombre]
- Descripcion: ...
- Pros: ...
- Contras: ...
- Complejidad: Alta/Media/Baja
```

### Fase 3: Finalize Approach

1. **Seleccionar** estrategia con el usuario
2. **Documentar** arquitectura detallada
3. **Definir** interfaces y contratos

```markdown
## Arquitectura Seleccionada

### Diagrama
[Diagrama ASCII o descripcion]

### Componentes
1. [Componente 1]: [Responsabilidad]
2. [Componente 2]: [Responsabilidad]

### Interfaces
- [Interfaz 1]: [Descripcion]
- [Interfaz 2]: [Descripcion]
```

### Fase 4: Create Tasks

Dividir en tareas discretas:

```markdown
## Task T01: [Nombre]

### Status
Not Started | In Progress | Completed

### Description
[Descripcion detallada]

### Acceptance Criteria
- [ ] Criterio 1
- [ ] Criterio 2

### Dependencies
- T00 (si aplica)

### Files to Create/Modify
- `path/to/file1.js`
- `path/to/file2.sql`

### Testing Requirements
- [ ] Unit tests
- [ ] Integration test
```

### Fase 5: Implementation

1. **Ejecutar** tareas en orden
2. **Actualizar** progreso en plan.md
3. **Documentar** decisiones tomadas durante implementacion

```markdown
## Progress Summary

| Task | Status | Notes |
|------|--------|-------|
| T01 | Completed | |
| T02 | In Progress | Bloqueado por X |
| T03 | Not Started | |

### Total Progress
- Completed: 3/10 (30%)
- Hours Tracked: 8
```

### Fase 6: Review

1. **Documentar** lessons learned
2. **Registrar** metricas
3. **Proponer** mejoras futuras

```markdown
## Lessons Learned

### What Went Well
- ...

### What Could Be Improved
- ...

### Technical Decisions
- Decision 1: [Porque]
- Decision 2: [Porque]

### Metrics
- Tasks Completed: 10
- Hours Tracked: 24
- Lines of Code: ~500
```

## Template de plan.md

```markdown
# Feature: [Nombre de la Feature]

## Overview
[Descripcion breve de la feature]

## Requirements
1. [Requisito 1]
2. [Requisito 2]

## Architecture
[Diagrama y descripcion de arquitectura]

## Tasks
| ID | Description | Status | Assignee |
|----|-------------|--------|----------|
| T01 | ... | Not Started | |
| T02 | ... | Not Started | |

## Progress Summary
- Started: [Fecha]
- Target: [Fecha]
- Status: Planning | In Progress | Review | Completed

## Lessons Learned
(Completar al final)

## References
- [Link 1]
- [Link 2]
```

## Para Features DB-Centric

Considerar:
- Nuevos SPs necesarios
- Eventos Service Broker a emitir
- Cambios en endpoints backend
- Componentes React nuevos/modificados
- Migraciones SQL

## Skills Relacionados

- db-pipeline (para features de DB)
- service-broker (para features de comunicacion)
- realtime-frontend (para features de UI)
