# 📚 Guía Completa de GitHub para Desarrollo en Equipo

## Índice
1. [Conceptos Fundamentales](#1-conceptos-fundamentales)
2. [Setup Inicial](#2-setup-inicial)
3. [Flujo de Trabajo Diario](#3-flujo-de-trabajo-diario)
4. [Trabajando en Equipo (2+ personas)](#4-trabajando-en-equipo)
5. [Ramas (Branches)](#5-ramas-branches)
6. [Pull Requests](#6-pull-requests)
7. [Resolución de Conflictos](#7-resolución-de-conflictos)
8. [Buenas Prácticas](#8-buenas-prácticas)
9. [Comandos de Emergencia](#9-comandos-de-emergencia)
10. [Flujo Recomendado para 2 Personas](#10-flujo-recomendado-para-2-personas)

---

## 1. Conceptos Fundamentales

### ¿Qué es Git vs GitHub?
```
Git     = Sistema de control de versiones (local en tu PC)
GitHub  = Plataforma en la nube que hospeda repositorios Git
```

### Anatomía de un Repositorio
```
┌─────────────────────────────────────────────────────────┐
│                      GITHUB (remoto)                     │
│                    origin/main                           │
└─────────────────────────────────────────────────────────┘
                          ↑ push
                          ↓ pull/fetch
┌─────────────────────────────────────────────────────────┐
│                    TU PC (local)                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │
│  │  Working    │→ │   Staging   │→ │    Local    │      │
│  │  Directory  │  │    Area     │  │    Repo     │      │
│  │  (archivos) │  │  (git add)  │  │ (git commit)│      │
│  └─────────────┘  └─────────────┘  └─────────────┘      │
└─────────────────────────────────────────────────────────┘
```

### Estados de un Archivo
```
Untracked  → Git no lo conoce (archivo nuevo)
Modified   → Cambiaste algo desde el último commit
Staged     → Marcado para incluir en el próximo commit
Committed  → Guardado en el historial local
Pushed     → Subido a GitHub
```

---

## 2. Setup Inicial

### 2.1 Instalar Git
```bash
# Windows: Descargar de https://git-scm.com/download/win
# Verificar instalación:
git --version
```

### 2.2 Configurar Identidad (una sola vez)
```bash
git config --global user.name "Ignacio Fuentes"
git config --global user.email "ifuentes@patria.com"

# Ver configuración
git config --list
```

### 2.3 Crear Repositorio en GitHub
1. Ir a github.com → "New Repository"
2. Nombre: `moneda-homologation`
3. Privado o Público
4. **NO** inicializar con README (lo haremos local)

### 2.4 Conectar tu Proyecto Local con GitHub
```bash
# Ir a la carpeta del proyecto
cd C:\Users\ifuentes\homologation

# Inicializar Git (si no existe .git)
git init

# Agregar el repositorio remoto
git remote add origin https://github.com/TU_USUARIO/moneda-homologation.git

# Verificar conexión
git remote -v
```

### 2.5 Primer Push (subir todo por primera vez)
```bash
# Agregar todos los archivos
git add .

# Crear el primer commit
git commit -m "feat: initial commit - sistema de homologación"

# Subir a GitHub (primera vez necesita -u)
git push -u origin main
```

---

## 3. Flujo de Trabajo Diario

### El Ciclo Básico
```bash
# 1. SIEMPRE empezar el día actualizando
git pull origin main

# 2. Trabajar en tus archivos...
#    (editar código, crear archivos, etc.)

# 3. Ver qué cambió
git status

# 4. Ver diferencias específicas
git diff

# 5. Agregar cambios al staging
git add archivo.js           # Un archivo específico
git add src/                  # Una carpeta completa
git add .                     # Todo lo modificado

# 6. Crear commit con mensaje descriptivo
git commit -m "fix: corregir validación de monedas en formulario"

# 7. Subir a GitHub
git push origin main
```

### Ver Historial
```bash
# Historial completo
git log

# Historial compacto (una línea por commit)
git log --oneline

# Historial con gráfico de ramas
git log --oneline --graph --all

# Últimos 5 commits
git log -5
```

---

## 4. Trabajando en Equipo

### Escenario: Tú y un Colega
```
         GitHub (origin/main)
              ↑↓
    ┌─────────┴─────────┐
    ↓                   ↓
 Tu PC              PC Colega
(clone)             (clone)
```

### 4.1 Tu Colega Clona el Repositorio
```bash
# El colega ejecuta (una sola vez):
git clone https://github.com/TU_USUARIO/moneda-homologation.git
cd moneda-homologation
```

### 4.2 Sincronización Constante
```bash
# REGLA DE ORO: Siempre pull antes de push
git pull origin main
# ... trabajar ...
git add .
git commit -m "mensaje"
git push origin main
```

### 4.3 Cuando el Push Falla
```
! [rejected] main -> main (fetch first)
```
Significa que tu colega subió cambios que tú no tienes:
```bash
# Solución:
git pull origin main    # Bajar sus cambios
# Git intentará fusionar automáticamente
git push origin main    # Ahora sí puedes subir
```

---

## 5. Ramas (Branches)

### ¿Por qué usar ramas?
```
main (producción estable)
  │
  ├── feature/nueva-cola-monedas     ← Tú trabajas aquí
  │
  └── feature/mejora-dashboard       ← Tu colega trabaja aquí
```

### Comandos de Ramas
```bash
# Ver ramas existentes
git branch              # Locales
git branch -a           # Todas (incluye remotas)

# Crear rama nueva
git branch feature/mi-feature

# Cambiar a otra rama
git checkout feature/mi-feature

# Crear Y cambiar en un solo comando (recomendado)
git checkout -b feature/mi-feature

# Subir rama nueva a GitHub
git push -u origin feature/mi-feature

# Volver a main
git checkout main

# Eliminar rama local (después de merge)
git branch -d feature/mi-feature

# Eliminar rama remota
git push origin --delete feature/mi-feature
```

### Flujo con Ramas
```bash
# 1. Estar en main actualizado
git checkout main
git pull origin main

# 2. Crear rama para tu tarea
git checkout -b feature/validacion-instrumentos

# 3. Trabajar y hacer commits
git add .
git commit -m "feat: agregar validación de ISIN"
git commit -m "feat: agregar validación de CUSIP"

# 4. Subir tu rama
git push -u origin feature/validacion-instrumentos

# 5. Crear Pull Request en GitHub (ver sección 6)

# 6. Después del merge, limpiar
git checkout main
git pull origin main
git branch -d feature/validacion-instrumentos
```

---

## 6. Pull Requests (PR)

### ¿Qué es un Pull Request?
Es una solicitud para fusionar tu rama con main. Permite:
- Revisión de código por tu colega
- Discusión sobre los cambios
- Pruebas automáticas (CI/CD)
- Historial de por qué se hizo cada cambio

### Crear un Pull Request
1. Subir tu rama: `git push -u origin feature/mi-feature`
2. Ir a GitHub → aparece botón "Compare & pull request"
3. Llenar:
   - **Título**: Descripción corta
   - **Descripción**: Qué cambia y por qué
   - **Reviewers**: Asignar a tu colega
4. Click "Create pull request"

### Revisar un Pull Request
1. Ir a la pestaña "Pull requests"
2. Click en el PR a revisar
3. Pestaña "Files changed" → ver código
4. Puedes comentar líneas específicas
5. Aprobar o pedir cambios
6. Si está bien → "Merge pull request"

### Ejemplo de Descripción de PR
```markdown
## Descripción
Agrega validación de códigos ISIN y CUSIP en el formulario de instrumentos.

## Cambios
- Nuevo validador en `src/utils/validators.js`
- Integración en `InstrumentoForm.jsx`
- Tests unitarios

## Testing
- [x] Probado localmente
- [x] ISIN válidos pasan
- [x] ISIN inválidos muestran error

## Screenshots
(si aplica)
```

---

## 7. Resolución de Conflictos

### ¿Cuándo ocurren?
Cuando tú y tu colega modifican **la misma línea** del mismo archivo.

### Cómo se ven
```
<<<<<<< HEAD
const API_URL = 'http://localhost:3001';
=======
const API_URL = 'http://localhost:3000';
>>>>>>> feature/otra-rama
```

### Cómo resolverlos
```bash
# 1. Git te avisa del conflicto después de pull/merge
git pull origin main
# CONFLICT (content): Merge conflict in src/config.js

# 2. Abrir el archivo y editarlo manualmente
#    Decidir qué código queda (o combinar ambos)

# 3. Quitar los marcadores <<<<, ====, >>>>
#    Dejar solo el código final:
const API_URL = 'http://localhost:3001';

# 4. Marcar como resuelto
git add src/config.js

# 5. Completar el merge
git commit -m "fix: resolver conflicto en config.js"

# 6. Subir
git push origin main
```

### Herramientas Visuales
VS Code tiene excelente soporte para conflictos:
- Muestra botones "Accept Current", "Accept Incoming", "Accept Both"
- También puedes usar `git mergetool`

---

## 8. Buenas Prácticas

### 8.1 Mensajes de Commit (Conventional Commits)
```bash
# Formato: tipo(alcance): descripción

# Tipos comunes:
feat:     Nueva funcionalidad
fix:      Corrección de bug
docs:     Documentación
style:    Formato (no afecta lógica)
refactor: Refactorización
test:     Tests
chore:    Mantenimiento

# Ejemplos buenos:
git commit -m "feat(instrumentos): agregar búsqueda por ISIN"
git commit -m "fix(api): corregir timeout en conexión SQL"
git commit -m "docs: actualizar README con instrucciones de setup"
git commit -m "refactor(forms): extraer validadores a módulo separado"

# Ejemplos MALOS:
git commit -m "cambios"
git commit -m "fix"
git commit -m "asdfasdf"
git commit -m "WIP"
```

### 8.2 Commits Atómicos
```bash
# MAL: Un commit gigante con todo
git commit -m "agregar feature, corregir bugs, cambiar estilos"

# BIEN: Commits pequeños y específicos
git commit -m "feat: agregar modelo de datos para monedas"
git commit -m "feat: crear endpoint GET /api/monedas"
git commit -m "feat: crear componente MonedaSelector"
git commit -m "test: agregar tests para MonedaSelector"
```

### 8.3 Nombres de Ramas
```bash
# Formato: tipo/descripcion-corta

# Buenos ejemplos:
feature/cola-instrumentos
feature/dashboard-metricas
fix/validacion-monedas
hotfix/conexion-db
refactor/limpiar-api

# Malos ejemplos:
mi-rama
cambios
test
nueva
```

### 8.4 Reglas de Oro
```
1. NUNCA hacer push directo a main (usar PRs)
2. SIEMPRE pull antes de empezar a trabajar
3. Commits pequeños y frecuentes
4. Mensajes descriptivos
5. Una rama por feature/fix
6. Code review obligatorio antes de merge
7. No commitear archivos sensibles (.env, credenciales)
8. Mantener .gitignore actualizado
```

### 8.5 Proteger la Rama Main (en GitHub)
1. Settings → Branches → Add rule
2. Branch name pattern: `main`
3. Marcar:
   - ☑ Require pull request before merging
   - ☑ Require approvals: 1
   - ☑ Dismiss stale PR approvals when new commits are pushed

---

## 9. Comandos de Emergencia

### Deshacer cambios NO commiteados
```bash
# Descartar cambios en un archivo
git checkout -- archivo.js

# Descartar TODOS los cambios (peligroso)
git checkout -- .

# Quitar archivo del staging (después de git add)
git reset HEAD archivo.js
```

### Deshacer el último commit (local, no pusheado)
```bash
# Mantener los cambios en staging
git reset --soft HEAD~1

# Mantener los cambios en working directory
git reset --mixed HEAD~1

# ELIMINAR todo (peligroso)
git reset --hard HEAD~1
```

### Modificar el último commit
```bash
# Cambiar mensaje
git commit --amend -m "nuevo mensaje"

# Agregar archivos olvidados
git add archivo_olvidado.js
git commit --amend --no-edit
```

### Revertir un commit YA pusheado
```bash
# Crea un nuevo commit que deshace los cambios
git revert abc1234
git push origin main
```

### Recuperar archivo eliminado
```bash
# Ver en qué commit existía
git log --all --full-history -- archivo.js

# Recuperarlo
git checkout abc1234 -- archivo.js
```

### Guardar cambios temporalmente (Stash)
```bash
# Guardar cambios sin commitear
git stash

# Ver stashes guardados
git stash list

# Recuperar último stash
git stash pop

# Recuperar stash específico
git stash apply stash@{2}
```

---

## 10. Flujo Recomendado para 2 Personas

### Configuración Inicial (una vez)
```
GitHub Settings → Branches → Protect main
- Require PR with 1 approval
- No direct pushes to main
```

### Flujo Diario
```
┌─────────────────────────────────────────────────────────────────┐
│                     FLUJO DE TRABAJO DIARIO                      │
└─────────────────────────────────────────────────────────────────┘

PERSONA A                              PERSONA B
─────────                              ─────────
1. git checkout main                   1. git checkout main
2. git pull origin main                2. git pull origin main
3. git checkout -b feature/X          3. git checkout -b feature/Y
4. ... trabajar ...                    4. ... trabajar ...
5. git add .                           5. git add .
6. git commit -m "feat: X"             6. git commit -m "feat: Y"
7. git push origin feature/X           7. git push origin feature/Y
8. Crear PR en GitHub                  8. Crear PR en GitHub
         │                                      │
         └──────────┐          ┌────────────────┘
                    ↓          ↓
              ┌─────────────────────┐
              │   CODE REVIEW       │
              │  (revisar PR del    │
              │   compañero)        │
              └─────────────────────┘
                        │
                        ↓
              ┌─────────────────────┐
              │   MERGE A MAIN      │
              │  (después de        │
              │   aprobación)       │
              └─────────────────────┘
                        │
                        ↓
              Repetir desde paso 1
```

### Checklist Diario
```markdown
## Al empezar el día
- [ ] git checkout main
- [ ] git pull origin main
- [ ] Revisar PRs pendientes de mi colega

## Al trabajar
- [ ] Crear rama con nombre descriptivo
- [ ] Commits pequeños y frecuentes
- [ ] Mensajes de commit claros

## Al terminar una tarea
- [ ] git push origin mi-rama
- [ ] Crear PR con descripción
- [ ] Asignar reviewer
- [ ] Responder comentarios del review

## Al final del día
- [ ] Asegurar que no hay trabajo sin push
- [ ] git stash si hay WIP
```

### Comunicación
```
- Avisar cuando creas un PR para review
- Avisar si vas a trabajar en un archivo "sensible"
- Discutir antes de refactorizar código compartido
- Usar comentarios en PRs, no mensajes externos
```

---

## Recursos Adicionales

### Herramientas Visuales
- **GitHub Desktop**: GUI oficial de GitHub
- **GitKraken**: GUI avanzada
- **VS Code**: Integración Git excelente (Source Control panel)

### Documentación
- [Pro Git Book](https://git-scm.com/book/es/v2) (gratis, en español)
- [GitHub Docs](https://docs.github.com/es)
- [Conventional Commits](https://www.conventionalcommits.org/es/)

### Cheat Sheet Rápido
```bash
# Setup
git clone URL                    # Clonar repo
git remote add origin URL        # Conectar remoto

# Diario
git pull origin main             # Actualizar
git checkout -b rama             # Nueva rama
git add .                        # Preparar cambios
git commit -m "mensaje"          # Guardar cambios
git push origin rama             # Subir

# Ramas
git branch                       # Ver ramas
git checkout rama                # Cambiar rama
git merge rama                   # Fusionar

# Información
git status                       # Estado actual
git log --oneline               # Historial
git diff                        # Ver cambios

# Emergencias
git stash                       # Guardar temporal
git reset --soft HEAD~1         # Deshacer commit
git revert SHA                  # Revertir commit
```

---

*Guía creada para el equipo de Homologación - Patria Investimentos*
*Versión 1.0 - Diciembre 2025*
