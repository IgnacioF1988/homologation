# 🏦 Moneda Homologation System

Sistema de homologación de instrumentos financieros para Patria Investimentos.

## 📋 Descripción

Aplicación full-stack para gestionar la homologación de instrumentos financieros, fondos, monedas y benchmarks entre diferentes fuentes de datos (Geneva, UBS, Derivados, etc.).

### Características principales
- 📊 Dashboard de colas de pendientes (Mission Control)
- 🔧 CRUD de instrumentos financieros
- 🔄 Sistema de homologación con múltiples fuentes
- 📈 Visualizador de cubo IPA
- ⚙️ Gestión de catálogos

## 🛠️ Tech Stack

| Capa | Tecnología |
|------|------------|
| Frontend | React 18, Material-UI |
| Backend | Node.js, Express |
| Base de Datos | SQL Server |
| Estado | React Query |

## 📁 Estructura del Proyecto

```
homologation/
├── src/                    # Frontend React
│   ├── components/         # Componentes reutilizables
│   ├── features/          # Módulos por funcionalidad
│   ├── pages/             # Páginas principales
│   ├── services/          # Clientes API
│   └── utils/             # Utilidades
├── server/                 # Backend Node.js
│   ├── config/            # Configuración BD
│   ├── routes/            # Endpoints API
│   └── index.js           # Entry point
├── public/                 # Assets estáticos
└── package.json
```

## 🚀 Instalación

### Prerrequisitos
- Node.js 18+
- SQL Server con bases de datos:
  - `MonedaHomologacion`
  - `Inteligencia_Producto_Dev`

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
DB_SERVER=localhost
DB_DATABASE=MonedaHomologacion
DB_USER=sa
DB_PASSWORD=tu_password
DB_PORT=1433
DB_ENCRYPT=false
DB_TRUST_SERVER_CERTIFICATE=true
PORT=3001
```

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

```bash
# Frontend tests
npm test

# Backend tests (si existen)
cd server && npm test
```

## 📦 Build para Producción

```bash
# Build frontend
npm run build

# Los archivos estáticos quedan en /build
```

## 🔗 Integración con Inteligencia_Producto_Dev

Este sistema se integra con la base de datos legacy `Inteligencia_Producto_Dev` para:
- Lectura de tablas dimensionales (`BD_Funds`, `BD_Instrumentos`)
- Sincronización de homologaciones (`HOMOL_*`)
- Escritura de pendientes en colas sandbox

Ver [PLAN_REINTEGRACION.md](./docs/PLAN_REINTEGRACION.md) para detalles.

## 👤 Autores

- **Ignacio Fuentes** - Data & Analytics Lead - Patria Investimentos

## 📄 Licencia

Privado - Patria Investimentos © 2025
