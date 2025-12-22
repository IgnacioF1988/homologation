# Plan de Implementación: Sistema de Formularios Multiusuario

**Proyecto:** Refactorización Formularios con Arquitectura Multiusuario
**Base:** Patrón exitoso del Pipeline ETL
**Rama:** feature/habilitacion-formulario-multiusuario
**Fecha:** 2025-12-22

---

## Índice

1. [Visión General](#visión-general)
2. [Principios de Implementación](#principios-de-implementación)
3. [Fase 1: Infraestructura Base](#fase-1-infraestructura-base)
4. [Fase 2: Sistema de Configuración](#fase-2-sistema-de-configuración)
5. [Fase 3: Motor de Validaciones](#fase-3-motor-de-validaciones)
6. [Fase 4: Componentes Dinámicos](#fase-4-componentes-dinámicos)
7. [Fase 5: Integración y Migración](#fase-5-integración-y-migración)
8. [Estrategia de Testing](#estrategia-de-testing)
9. [Rollout y Deployment](#rollout-y-deployment)

---

## 1. Visión General

### 1.1 Objetivos del Proyecto

**Objetivo Principal:**
Implementar un sistema de formularios configurable, con tracking multiusuario completo, inspirado en la arquitectura exitosa del pipeline ETL.

**Objetivos Específicos:**
1. Externalizar configuración de formularios a YAML
2. Implementar tracking de sesiones y cambios
3. Crear motor de validaciones genérico y reusable
4. Desarrollar componentes de formulario dinámicos
5. Mantener compatibilidad con sistema actual (migración gradual)

### 1.2 Alcance

**En Scope:**
- Sistema de tracking (sesiones, cambios, validaciones)
- Configuración YAML para formularios
- Motor de validaciones genérico
- Componentes React dinámicos
- API REST extendida
- Migración de formulario de Instrumentos
- Migración de formulario de Compañías

**Out of Scope (Futuro):**
- Sistema de autenticación/autorización
- Workflow de aprobaciones multi-nivel
- Versionado de registros (temporal tables)
- Integración con Graph Database
- Notificaciones en tiempo real

### 1.3 Dependencias Técnicas

**Backend:**
- Node.js 16+
- Express 4.x
- mssql (node-mssql) 9.x
- js-yaml (para parsing YAML)

**Frontend:**
- React 18+
- Axios
- Custom hooks para form state

**Base de Datos:**
- SQL Server 2019+
- MonedaHomologacion (existente)

---

## 2. Principios de Implementación

### 2.1 Desarrollo Incremental

**Regla:** Cada incremento debe ser:
- **Deployable** - Funcional independientemente
- **Testeable** - Con tests automatizados
- **Reversible** - Sin romper funcionalidad existente

### 2.2 Compatibilidad Retroactiva

**Regla:** Durante migración:
- Sistema viejo y nuevo coexisten
- Mismo backend soporta ambos
- Migración por formulario, no big bang

### 2.3 Test-Driven Development (TDD)

**Regla:** Para cada funcionalidad:
1. Escribir tests primero
2. Implementar código
3. Validar con tests
4. Refactorizar si es necesario

---

## 3. Fase 1: Infraestructura Base

### 3.1 Sprint 1.1: Tablas de Tracking (Base de Datos)

**Duración:** 3-4 días

**Objetivo:** Crear esquema de tracking en MonedaHomologacion.

#### Tareas:

**1.1.1: Crear esquema `logs` en MonedaHomologacion**

```sql
-- Script: database/migrations/001_create_logs_schema.sql
USE MonedaHomologacion;
GO

-- Crear esquema si no existe
IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = 'logs')
BEGIN
    EXEC('CREATE SCHEMA logs');
END
GO
```

**Test:**
```sql
-- Verificar esquema creado
SELECT * FROM sys.schemas WHERE name = 'logs';
```

**1.1.2: Crear tabla `logs.Sesiones_Formulario`**

```sql
-- Script: database/migrations/002_create_sesiones_formulario.sql
CREATE TABLE logs.Sesiones_Formulario (
    ID_Sesion BIGINT PRIMARY KEY IDENTITY(1,1),
    Usuario VARCHAR(100) NOT NULL DEFAULT 'SYSTEM',  -- Placeholder hasta auth
    Entidad VARCHAR(50) NOT NULL,                    -- 'instrumentos', 'companias'
    ID_Entidad VARCHAR(200),                         -- Clave compuesta serializada
    Accion VARCHAR(20) NOT NULL,                     -- 'CREATE', 'UPDATE', 'DELETE', 'VIEW'
    FechaInicio DATETIME NOT NULL DEFAULT GETDATE(),
    FechaFin DATETIME NULL,
    Estado VARCHAR(20) NOT NULL DEFAULT 'EN_PROGRESO',  -- 'EN_PROGRESO', 'COMPLETADO', 'CANCELADO', 'ERROR'
    IP_Cliente VARCHAR(50) NULL,
    UserAgent VARCHAR(500) NULL,
    Duracion_Ms INT NULL,
    Datos_Iniciales NVARCHAR(MAX) NULL,              -- JSON del estado inicial
    Datos_Finales NVARCHAR(MAX) NULL,                -- JSON del estado final
    Error_Mensaje NVARCHAR(MAX) NULL,
    Metadata JSON NULL,                               -- Información adicional
    CONSTRAINT CK_Sesion_Estado CHECK (Estado IN ('EN_PROGRESO', 'COMPLETADO', 'CANCELADO', 'ERROR')),
    CONSTRAINT CK_Sesion_Accion CHECK (Accion IN ('CREATE', 'UPDATE', 'DELETE', 'VIEW'))
);

CREATE INDEX IX_Sesiones_Usuario ON logs.Sesiones_Formulario(Usuario);
CREATE INDEX IX_Sesiones_Entidad ON logs.Sesiones_Formulario(Entidad);
CREATE INDEX IX_Sesiones_FechaInicio ON logs.Sesiones_Formulario(FechaInicio DESC);
CREATE INDEX IX_Sesiones_Estado ON logs.Sesiones_Formulario(Estado);
GO
```

**Test:**
```sql
-- Test 1: Insertar sesión de prueba
DECLARE @ID_Sesion BIGINT;

INSERT INTO logs.Sesiones_Formulario (Usuario, Entidad, Accion)
VALUES ('test_user', 'instrumentos', 'CREATE');

SET @ID_Sesion = SCOPE_IDENTITY();

-- Verificar
SELECT * FROM logs.Sesiones_Formulario WHERE ID_Sesion = @ID_Sesion;

-- Cleanup
DELETE FROM logs.Sesiones_Formulario WHERE ID_Sesion = @ID_Sesion;

-- Test 2: Constraint de Estado
BEGIN TRY
    INSERT INTO logs.Sesiones_Formulario (Usuario, Entidad, Accion, Estado)
    VALUES ('test', 'instrumentos', 'CREATE', 'INVALID_STATE');
    PRINT 'ERROR: Constraint no funcionó';
END TRY
BEGIN CATCH
    PRINT 'OK: Constraint de Estado funcionando';
END CATCH
```

**1.1.3: Crear tabla `logs.Cambios_Campo`**

```sql
-- Script: database/migrations/003_create_cambios_campo.sql
CREATE TABLE logs.Cambios_Campo (
    ID BIGINT PRIMARY KEY IDENTITY(1,1),
    ID_Sesion BIGINT NOT NULL,
    Campo VARCHAR(100) NOT NULL,
    Tipo_Dato VARCHAR(50),                           -- 'string', 'number', 'boolean', 'date'
    Valor_Anterior NVARCHAR(MAX) NULL,
    Valor_Nuevo NVARCHAR(MAX) NULL,
    Es_Cambio_Significativo BIT DEFAULT 1,           -- Flag para filtrar cambios triviales
    Timestamp DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT FK_Cambios_Sesion FOREIGN KEY (ID_Sesion)
        REFERENCES logs.Sesiones_Formulario(ID_Sesion)
        ON DELETE CASCADE
);

CREATE INDEX IX_Cambios_Sesion ON logs.Cambios_Campo(ID_Sesion);
CREATE INDEX IX_Cambios_Campo ON logs.Cambios_Campo(Campo);
CREATE INDEX IX_Cambios_Timestamp ON logs.Cambios_Campo(Timestamp DESC);
GO
```

**Test:**
```sql
-- Test: Insertar cambio y verificar FK
DECLARE @ID_Sesion BIGINT;

INSERT INTO logs.Sesiones_Formulario (Usuario, Entidad, Accion)
VALUES ('test_user', 'instrumentos', 'UPDATE');

SET @ID_Sesion = SCOPE_IDENTITY();

INSERT INTO logs.Cambios_Campo (ID_Sesion, Campo, Valor_Anterior, Valor_Nuevo)
VALUES (@ID_Sesion, 'companyName', 'Old Corp', 'New Corp');

-- Verificar
SELECT s.*, c.*
FROM logs.Sesiones_Formulario s
LEFT JOIN logs.Cambios_Campo c ON s.ID_Sesion = c.ID_Sesion
WHERE s.ID_Sesion = @ID_Sesion;

-- Test CASCADE DELETE
DELETE FROM logs.Sesiones_Formulario WHERE ID_Sesion = @ID_Sesion;

SELECT COUNT(*) as DeberiaSer0 FROM logs.Cambios_Campo WHERE ID_Sesion = @ID_Sesion;
```

**1.1.4: Crear tabla `logs.Validaciones_Ejecutadas`**

```sql
-- Script: database/migrations/004_create_validaciones_ejecutadas.sql
CREATE TABLE logs.Validaciones_Ejecutadas (
    ID INT PRIMARY KEY IDENTITY(1,1),
    ID_Sesion BIGINT NOT NULL,
    Tipo_Validacion VARCHAR(50) NOT NULL,            -- 'required', 'duplicate', 'pattern', 'custom'
    Ambito VARCHAR(20) NOT NULL,                     -- 'campo', 'formulario'
    Campo VARCHAR(100) NULL,
    Valor_Validado NVARCHAR(MAX) NULL,
    Resultado BIT NOT NULL,                          -- 0 = Fallo, 1 = OK
    Mensaje NVARCHAR(500) NULL,
    Detalles JSON NULL,                              -- Info adicional de validación
    Duracion_Ms INT NULL,
    Timestamp DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT FK_Validaciones_Sesion FOREIGN KEY (ID_Sesion)
        REFERENCES logs.Sesiones_Formulario(ID_Sesion)
        ON DELETE CASCADE,
    CONSTRAINT CK_Validacion_Ambito CHECK (Ambito IN ('campo', 'formulario'))
);

CREATE INDEX IX_Validaciones_Sesion ON logs.Validaciones_Ejecutadas(ID_Sesion);
CREATE INDEX IX_Validaciones_Tipo ON logs.Validaciones_Ejecutadas(Tipo_Validacion);
CREATE INDEX IX_Validaciones_Resultado ON logs.Validaciones_Ejecutadas(Resultado);
GO
```

**Test:**
```sql
-- Test: Registrar validaciones
DECLARE @ID_Sesion BIGINT;

INSERT INTO logs.Sesiones_Formulario (Usuario, Entidad, Accion)
VALUES ('test_user', 'instrumentos', 'CREATE');

SET @ID_Sesion = SCOPE_IDENTITY();

-- Validación exitosa
INSERT INTO logs.Validaciones_Ejecutadas (ID_Sesion, Tipo_Validacion, Ambito, Campo, Resultado)
VALUES (@ID_Sesion, 'required', 'campo', 'companyName', 1);

-- Validación fallida
INSERT INTO logs.Validaciones_Ejecutadas (ID_Sesion, Tipo_Validacion, Ambito, Campo, Resultado, Mensaje)
VALUES (@ID_Sesion, 'duplicate', 'campo', 'nombreFuente', 0, 'Ya existe instrumento con este nombre');

-- Verificar
SELECT * FROM logs.Validaciones_Ejecutadas WHERE ID_Sesion = @ID_Sesion;

-- Cleanup
DELETE FROM logs.Sesiones_Formulario WHERE ID_Sesion = @ID_Sesion;
```

**1.1.5: Crear Stored Procedures de utilidad**

```sql
-- Script: database/migrations/005_create_sp_logging.sql

-- SP: Crear sesión
CREATE PROCEDURE logs.sp_Crear_Sesion_Formulario
    @Usuario VARCHAR(100),
    @Entidad VARCHAR(50),
    @Accion VARCHAR(20),
    @ID_Entidad VARCHAR(200) = NULL,
    @IP_Cliente VARCHAR(50) = NULL,
    @UserAgent VARCHAR(500) = NULL,
    @Datos_Iniciales NVARCHAR(MAX) = NULL,
    @ID_Sesion BIGINT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    INSERT INTO logs.Sesiones_Formulario (
        Usuario, Entidad, Accion, ID_Entidad,
        IP_Cliente, UserAgent, Datos_Iniciales
    )
    VALUES (
        @Usuario, @Entidad, @Accion, @ID_Entidad,
        @IP_Cliente, @UserAgent, @Datos_Iniciales
    );

    SET @ID_Sesion = SCOPE_IDENTITY();
END
GO

-- SP: Finalizar sesión
CREATE PROCEDURE logs.sp_Finalizar_Sesion_Formulario
    @ID_Sesion BIGINT,
    @Estado VARCHAR(20),
    @Datos_Finales NVARCHAR(MAX) = NULL,
    @Error_Mensaje NVARCHAR(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE logs.Sesiones_Formulario
    SET
        FechaFin = GETDATE(),
        Estado = @Estado,
        Datos_Finales = @Datos_Finales,
        Error_Mensaje = @Error_Mensaje,
        Duracion_Ms = DATEDIFF(MILLISECOND, FechaInicio, GETDATE())
    WHERE ID_Sesion = @ID_Sesion;
END
GO

-- SP: Registrar cambio
CREATE PROCEDURE logs.sp_Registrar_Cambio_Campo
    @ID_Sesion BIGINT,
    @Campo VARCHAR(100),
    @Valor_Anterior NVARCHAR(MAX),
    @Valor_Nuevo NVARCHAR(MAX),
    @Tipo_Dato VARCHAR(50) = 'string'
AS
BEGIN
    SET NOCOUNT ON;

    INSERT INTO logs.Cambios_Campo (
        ID_Sesion, Campo, Valor_Anterior, Valor_Nuevo, Tipo_Dato
    )
    VALUES (
        @ID_Sesion, @Campo, @Valor_Anterior, @Valor_Nuevo, @Tipo_Dato
    );
END
GO

-- SP: Registrar validación
CREATE PROCEDURE logs.sp_Registrar_Validacion
    @ID_Sesion BIGINT,
    @Tipo_Validacion VARCHAR(50),
    @Ambito VARCHAR(20),
    @Campo VARCHAR(100) = NULL,
    @Resultado BIT,
    @Mensaje NVARCHAR(500) = NULL,
    @Valor_Validado NVARCHAR(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    INSERT INTO logs.Validaciones_Ejecutadas (
        ID_Sesion, Tipo_Validacion, Ambito, Campo,
        Resultado, Mensaje, Valor_Validado
    )
    VALUES (
        @ID_Sesion, @Tipo_Validacion, @Ambito, @Campo,
        @Resultado, @Mensaje, @Valor_Validado
    );
END
GO
```

**Test:**
```sql
-- Test: Workflow completo
DECLARE @ID_Sesion BIGINT;

-- 1. Crear sesión
EXEC logs.sp_Crear_Sesion_Formulario
    @Usuario = 'test_user',
    @Entidad = 'instrumentos',
    @Accion = 'UPDATE',
    @ID_Entidad = '1|1',  -- idInstrumento=1, moneda=1
    @Datos_Iniciales = '{"companyName": "Old Corp"}',
    @ID_Sesion = @ID_Sesion OUTPUT;

PRINT 'Sesión creada: ' + CAST(@ID_Sesion AS VARCHAR);

-- 2. Registrar cambios
EXEC logs.sp_Registrar_Cambio_Campo
    @ID_Sesion = @ID_Sesion,
    @Campo = 'companyName',
    @Valor_Anterior = 'Old Corp',
    @Valor_Nuevo = 'New Corp';

-- 3. Registrar validaciones
EXEC logs.sp_Registrar_Validacion
    @ID_Sesion = @ID_Sesion,
    @Tipo_Validacion = 'duplicate',
    @Ambito = 'campo',
    @Campo = 'companyName',
    @Resultado = 1,
    @Mensaje = NULL;

-- 4. Finalizar sesión
EXEC logs.sp_Finalizar_Sesion_Formulario
    @ID_Sesion = @ID_Sesion,
    @Estado = 'COMPLETADO',
    @Datos_Finales = '{"companyName": "New Corp"}';

-- 5. Verificar todo
SELECT
    s.ID_Sesion,
    s.Usuario,
    s.Entidad,
    s.Accion,
    s.Estado,
    s.Duracion_Ms,
    c.Campo,
    c.Valor_Anterior,
    c.Valor_Nuevo,
    v.Tipo_Validacion,
    v.Resultado
FROM logs.Sesiones_Formulario s
LEFT JOIN logs.Cambios_Campo c ON s.ID_Sesion = c.ID_Sesion
LEFT JOIN logs.Validaciones_Ejecutadas v ON s.ID_Sesion = v.ID_Sesion
WHERE s.ID_Sesion = @ID_Sesion;

-- Cleanup
DELETE FROM logs.Sesiones_Formulario WHERE ID_Sesion = @ID_Sesion;
```

#### Criterios de Aceptación Sprint 1.1

- [ ] Esquema `logs` creado en MonedaHomologacion
- [ ] Tabla `Sesiones_Formulario` creada con índices
- [ ] Tabla `Cambios_Campo` creada con FK CASCADE
- [ ] Tabla `Validaciones_Ejecutadas` creada
- [ ] 4 Stored Procedures creados
- [ ] Todos los tests SQL pasan
- [ ] Script de migración completo documentado

---

### 3.2 Sprint 1.2: API de Sesiones (Backend)

**Duración:** 3-4 días

**Objetivo:** Crear endpoints REST para gestión de sesiones de formulario.

#### Tareas:

**1.2.1: Crear servicio de sesiones**

```javascript
// server/services/formSessionService.js
const { getPool, sql } = require('../config/database');

class FormSessionService {
  /**
   * Crear nueva sesión de formulario
   */
  async createSession({
    usuario = 'SYSTEM',
    entidad,
    accion,
    idEntidad = null,
    ipCliente = null,
    userAgent = null,
    datosIniciales = null
  }) {
    const pool = await getPool();

    const result = await pool.request()
      .input('usuario', sql.VarChar, usuario)
      .input('entidad', sql.VarChar, entidad)
      .input('accion', sql.VarChar, accion)
      .input('idEntidad', sql.VarChar, idEntidad)
      .input('ipCliente', sql.VarChar, ipCliente)
      .input('userAgent', sql.VarChar, userAgent)
      .input('datosIniciales', sql.NVarChar, datosIniciales ? JSON.stringify(datosIniciales) : null)
      .output('idSesion', sql.BigInt)
      .execute('logs.sp_Crear_Sesion_Formulario');

    return {
      ID_Sesion: result.output.idSesion,
      Usuario: usuario,
      Entidad: entidad,
      Accion: accion
    };
  }

  /**
   * Finalizar sesión
   */
  async finalizeSession(idSesion, estado, datosFinales = null, errorMensaje = null) {
    const pool = await getPool();

    await pool.request()
      .input('idSesion', sql.BigInt, idSesion)
      .input('estado', sql.VarChar, estado)
      .input('datosFinales', sql.NVarChar, datosFinales ? JSON.stringify(datosFinales) : null)
      .input('errorMensaje', sql.NVarChar, errorMensaje)
      .execute('logs.sp_Finalizar_Sesion_Formulario');
  }

  /**
   * Registrar cambio de campo
   */
  async logChange(idSesion, campo, valorAnterior, valorNuevo, tipoDato = 'string') {
    const pool = await getPool();

    await pool.request()
      .input('idSesion', sql.BigInt, idSesion)
      .input('campo', sql.VarChar, campo)
      .input('valorAnterior', sql.NVarChar, this.serializeValue(valorAnterior))
      .input('valorNuevo', sql.NVarChar, this.serializeValue(valorNuevo))
      .input('tipoDato', sql.VarChar, tipoDato)
      .execute('logs.sp_Registrar_Cambio_Campo');
  }

  /**
   * Registrar validación
   */
  async logValidation(idSesion, tipoValidacion, ambito, campo, resultado, mensaje = null, valorValidado = null) {
    const pool = await getPool();

    await pool.request()
      .input('idSesion', sql.BigInt, idSesion)
      .input('tipoValidacion', sql.VarChar, tipoValidacion)
      .input('ambito', sql.VarChar, ambito)
      .input('campo', sql.VarChar, campo)
      .input('resultado', sql.Bit, resultado ? 1 : 0)
      .input('mensaje', sql.NVarChar, mensaje)
      .input('valorValidado', sql.NVarChar, this.serializeValue(valorValidado))
      .execute('logs.sp_Registrar_Validacion');
  }

  /**
   * Obtener sesión completa
   */
  async getSession(idSesion) {
    const pool = await getPool();

    const [sesionResult, cambiosResult, validacionesResult] = await Promise.all([
      pool.request()
        .input('idSesion', sql.BigInt, idSesion)
        .query('SELECT * FROM logs.Sesiones_Formulario WHERE ID_Sesion = @idSesion'),
      pool.request()
        .input('idSesion', sql.BigInt, idSesion)
        .query('SELECT * FROM logs.Cambios_Campo WHERE ID_Sesion = @idSesion ORDER BY Timestamp'),
      pool.request()
        .input('idSesion', sql.BigInt, idSesion)
        .query('SELECT * FROM logs.Validaciones_Ejecutadas WHERE ID_Sesion = @idSesion ORDER BY Timestamp')
    ]);

    if (sesionResult.recordset.length === 0) {
      throw new Error(`Sesión ${idSesion} no encontrada`);
    }

    return {
      sesion: sesionResult.recordset[0],
      cambios: cambiosResult.recordset,
      validaciones: validacionesResult.recordset
    };
  }

  /**
   * Listar sesiones con filtros
   */
  async listSessions({ usuario, entidad, accion, estado, fechaDesde, fechaHasta, limit = 50, offset = 0 }) {
    const pool = await getPool();

    let query = 'SELECT * FROM logs.Sesiones_Formulario WHERE 1=1';
    const request = pool.request();

    if (usuario) {
      query += ' AND Usuario = @usuario';
      request.input('usuario', sql.VarChar, usuario);
    }

    if (entidad) {
      query += ' AND Entidad = @entidad';
      request.input('entidad', sql.VarChar, entidad);
    }

    if (accion) {
      query += ' AND Accion = @accion';
      request.input('accion', sql.VarChar, accion);
    }

    if (estado) {
      query += ' AND Estado = @estado';
      request.input('estado', sql.VarChar, estado);
    }

    if (fechaDesde) {
      query += ' AND FechaInicio >= @fechaDesde';
      request.input('fechaDesde', sql.DateTime, fechaDesde);
    }

    if (fechaHasta) {
      query += ' AND FechaInicio <= @fechaHasta';
      request.input('fechaHasta', sql.DateTime, fechaHasta);
    }

    query += ' ORDER BY FechaInicio DESC OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY';
    request.input('offset', sql.Int, offset);
    request.input('limit', sql.Int, limit);

    const result = await request.query(query);

    return {
      sesiones: result.recordset,
      total: result.recordset.length,
      offset,
      limit
    };
  }

  /**
   * Helper: Serializar valor
   */
  serializeValue(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }
}

module.exports = new FormSessionService();
```

**Test:**
```javascript
// server/services/__tests__/formSessionService.test.js
const formSessionService = require('../formSessionService');

describe('FormSessionService', () => {
  let sessionId;

  test('createSession should create a new session', async () => {
    const session = await formSessionService.createSession({
      entidad: 'instrumentos',
      accion: 'CREATE',
      datosIniciales: { companyName: 'Test Corp' }
    });

    expect(session.ID_Sesion).toBeDefined();
    expect(session.Entidad).toBe('instrumentos');

    sessionId = session.ID_Sesion;
  });

  test('logChange should log a field change', async () => {
    await formSessionService.logChange(
      sessionId,
      'companyName',
      'Test Corp',
      'Updated Corp'
    );

    const session = await formSessionService.getSession(sessionId);
    expect(session.cambios).toHaveLength(1);
    expect(session.cambios[0].Campo).toBe('companyName');
  });

  test('logValidation should log a validation', async () => {
    await formSessionService.logValidation(
      sessionId,
      'duplicate',
      'campo',
      'companyName',
      true
    );

    const session = await formSessionService.getSession(sessionId);
    expect(session.validaciones).toHaveLength(1);
    expect(session.validaciones[0].Tipo_Validacion).toBe('duplicate');
  });

  test('finalizeSession should close session', async () => {
    await formSessionService.finalizeSession(
      sessionId,
      'COMPLETADO',
      { companyName: 'Updated Corp' }
    );

    const session = await formSessionService.getSession(sessionId);
    expect(session.sesion.Estado).toBe('COMPLETADO');
    expect(session.sesion.FechaFin).toBeDefined();
  });

  afterAll(async () => {
    // Cleanup
    const { getPool, sql } = require('../../config/database');
    const pool = await getPool();
    await pool.request()
      .input('idSesion', sql.BigInt, sessionId)
      .query('DELETE FROM logs.Sesiones_Formulario WHERE ID_Sesion = @idSesion');
  });
});
```

**1.2.2: Crear rutas de sesiones**

```javascript
// server/routes/formSessions.routes.js
const express = require('express');
const router = express.Router();
const formSessionService = require('../services/formSessionService');

// POST /api/form-sessions - Crear sesión
router.post('/', async (req, res) => {
  try {
    const { usuario, entidad, accion, idEntidad, datosIniciales } = req.body;

    const session = await formSessionService.createSession({
      usuario,
      entidad,
      accion,
      idEntidad,
      ipCliente: req.ip,
      userAgent: req.get('User-Agent'),
      datosIniciales
    });

    res.status(201).json({
      success: true,
      data: session
    });
  } catch (err) {
    console.error('Error creating session:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// PATCH /api/form-sessions/:id/finalize - Finalizar sesión
router.patch('/:id/finalize', async (req, res) => {
  try {
    const { id } = req.params;
    const { estado, datosFinales, errorMensaje } = req.body;

    await formSessionService.finalizeSession(
      parseInt(id),
      estado,
      datosFinales,
      errorMensaje
    );

    res.json({
      success: true,
      message: 'Sesión finalizada'
    });
  } catch (err) {
    console.error('Error finalizing session:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// POST /api/form-sessions/:id/changes - Registrar cambio
router.post('/:id/changes', async (req, res) => {
  try {
    const { id } = req.params;
    const { campo, valorAnterior, valorNuevo, tipoDato } = req.body;

    await formSessionService.logChange(
      parseInt(id),
      campo,
      valorAnterior,
      valorNuevo,
      tipoDato
    );

    res.json({
      success: true,
      message: 'Cambio registrado'
    });
  } catch (err) {
    console.error('Error logging change:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// POST /api/form-sessions/:id/validations - Registrar validación
router.post('/:id/validations', async (req, res) => {
  try {
    const { id } = req.params;
    const { tipoValidacion, ambito, campo, resultado, mensaje, valorValidado } = req.body;

    await formSessionService.logValidation(
      parseInt(id),
      tipoValidacion,
      ambito,
      campo,
      resultado,
      mensaje,
      valorValidado
    );

    res.json({
      success: true,
      message: 'Validación registrada'
    });
  } catch (err) {
    console.error('Error logging validation:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// GET /api/form-sessions/:id - Obtener sesión completa
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const session = await formSessionService.getSession(parseInt(id));

    res.json({
      success: true,
      data: session
    });
  } catch (err) {
    console.error('Error getting session:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// GET /api/form-sessions - Listar sesiones
router.get('/', async (req, res) => {
  try {
    const { usuario, entidad, accion, estado, fechaDesde, fechaHasta, limit, offset } = req.query;

    const result = await formSessionService.listSessions({
      usuario,
      entidad,
      accion,
      estado,
      fechaDesde,
      fechaHasta,
      limit: parseInt(limit) || 50,
      offset: parseInt(offset) || 0
    });

    res.json({
      success: true,
      data: result.sesiones,
      pagination: {
        offset: result.offset,
        limit: result.limit,
        count: result.total
      }
    });
  } catch (err) {
    console.error('Error listing sessions:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

module.exports = router;
```

**1.2.3: Registrar rutas en servidor**

```javascript
// server/index.js
const formSessionsRoutes = require('./routes/formSessions.routes');

// ... otras rutas ...

app.use('/api/form-sessions', formSessionsRoutes);
```

**Test:**
```javascript
// server/routes/__tests__/formSessions.routes.test.js
const request = require('supertest');
const app = require('../../index');

describe('Form Sessions API', () => {
  let sessionId;

  test('POST /api/form-sessions should create session', async () => {
    const res = await request(app)
      .post('/api/form-sessions')
      .send({
        usuario: 'test_user',
        entidad: 'instrumentos',
        accion: 'CREATE',
        datosIniciales: { test: 'data' }
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.ID_Sesion).toBeDefined();

    sessionId = res.body.data.ID_Sesion;
  });

  test('POST /api/form-sessions/:id/changes should log change', async () => {
    const res = await request(app)
      .post(`/api/form-sessions/${sessionId}/changes`)
      .send({
        campo: 'companyName',
        valorAnterior: 'Old',
        valorNuevo: 'New'
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('GET /api/form-sessions/:id should get session', async () => {
    const res = await request(app)
      .get(`/api/form-sessions/${sessionId}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.cambios).toHaveLength(1);
  });

  test('PATCH /api/form-sessions/:id/finalize should finalize', async () => {
    const res = await request(app)
      .patch(`/api/form-sessions/${sessionId}/finalize`)
      .send({
        estado: 'COMPLETADO',
        datosFinales: { test: 'final' }
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  // Cleanup después de todos los tests
  afterAll(async () => {
    const { getPool, sql } = require('../../config/database');
    const pool = await getPool();
    await pool.request()
      .input('idSesion', sql.BigInt, sessionId)
      .query('DELETE FROM logs.Sesiones_Formulario WHERE ID_Sesion = @idSesion');
  });
});
```

#### Criterios de Aceptación Sprint 1.2

- [ ] Servicio `formSessionService` creado
- [ ] 5 endpoints REST implementados
- [ ] Tests unitarios para servicio pasan
- [ ] Tests de integración para API pasan
- [ ] Rutas registradas en servidor
- [ ] Documentación de API generada

---

## 4. Fase 2: Sistema de Configuración

### 4.1 Sprint 2.1: Configuración YAML (Schemas)

**Duración:** 3-4 días

**Objetivo:** Crear sistema de configuración basado en YAML para definir formularios.

#### Tareas:

**2.1.1: Instalar dependencias**

```bash
# En directorio del proyecto
npm install js-yaml joi --save
```

**2.1.2: Crear schema de configuración**

```javascript
// server/config/formConfigSchema.js
const Joi = require('joi');

// Schema para validación de campo
const validationRuleSchema = Joi.object({
  type: Joi.string().valid(
    'required',
    'minLength',
    'maxLength',
    'pattern',
    'email',
    'number',
    'range',
    'duplicate',
    'custom'
  ).required(),
  message: Joi.string().required(),
  params: Joi.object().optional(),  // Parámetros específicos de validación
  async: Joi.boolean().default(false),  // Si requiere API call
  triggerOn: Joi.string().valid('blur', 'change', 'submit').default('blur')
});

// Schema para campo de formulario
const fieldSchema = Joi.object({
  name: Joi.string().required(),
  label: Joi.string().required(),
  type: Joi.string().valid(
    'text',
    'number',
    'select',
    'autocomplete',
    'date',
    'checkbox',
    'textarea',
    'custom'
  ).required(),
  placeholder: Joi.string().optional(),
  defaultValue: Joi.any().optional(),
  required: Joi.boolean().default(false),
  disabled: Joi.boolean().default(false),
  visible: Joi.boolean().default(true),
  validations: Joi.array().items(validationRuleSchema).default([]),
  // Para select/autocomplete
  options: Joi.object({
    source: Joi.string().valid('static', 'api', 'catalog').required(),
    endpoint: Joi.string().when('source', {
      is: 'api',
      then: Joi.required()
    }),
    catalogType: Joi.string().when('source', {
      is: 'catalog',
      then: Joi.required()
    }),
    staticValues: Joi.array().when('source', {
      is: 'static',
      then: Joi.required()
    }),
    labelField: Joi.string().default('label'),
    valueField: Joi.string().default('value')
  }).when('type', {
    is: Joi.valid('select', 'autocomplete'),
    then: Joi.required()
  }),
  // Dependencias condicionales
  dependsOn: Joi.array().items(
    Joi.object({
      field: Joi.string().required(),
      condition: Joi.string().required(),  // 'equals', 'notEquals', 'contains', etc.
      value: Joi.any().required(),
      action: Joi.string().valid('show', 'hide', 'enable', 'disable').required()
    })
  ).optional()
});

// Schema para sección de formulario
const sectionSchema = Joi.object({
  id: Joi.string().required(),
  title: Joi.string().required(),
  description: Joi.string().optional(),
  collapsible: Joi.boolean().default(true),
  defaultExpanded: Joi.boolean().default(true),
  fields: Joi.array().items(fieldSchema).min(1).required(),
  layout: Joi.object({
    columns: Joi.number().min(1).max(4).default(2),
    gap: Joi.string().default('1rem')
  }).optional()
});

// Schema principal de configuración de formulario
const formConfigSchema = Joi.object({
  formId: Joi.string().required(),
  entity: Joi.string().required(),
  title: Joi.string().required(),
  description: Joi.string().optional(),
  version: Joi.string().default('1.0.0'),
  sections: Joi.array().items(sectionSchema).min(1).required(),
  // Validaciones a nivel de formulario (cross-field)
  formValidations: Joi.array().items(
    Joi.object({
      type: Joi.string().required(),
      fields: Joi.array().items(Joi.string()).required(),
      message: Joi.string().required(),
      validator: Joi.string().optional()  // Nombre de función custom
    })
  ).optional(),
  // Comportamiento del formulario
  behavior: Joi.object({
    autoSave: Joi.boolean().default(false),
    autoSaveInterval: Joi.number().default(30000),  // ms
    trackChanges: Joi.boolean().default(true),
    confirmOnLeave: Joi.boolean().default(true),
    resetOnSubmit: Joi.boolean().default(false)
  }).default()
});

module.exports = {
  formConfigSchema,
  sectionSchema,
  fieldSchema,
  validationRuleSchema
};
```

**2.1.3: Crear archivo YAML de ejemplo (Instrumentos)**

```yaml
# config/forms/instrumentos.form.yaml
formId: instrumentos-form
entity: instrumentos
title: Formulario de Instrumentos Financieros
description: Gestión de instrumentos financieros y sus datos maestros
version: 1.0.0

sections:
  # ========================================
  # IDENTIFICACIÓN
  # ========================================
  - id: identificacion
    title: Identificación del Instrumento
    description: Datos básicos de identificación
    collapsible: true
    defaultExpanded: true
    layout:
      columns: 2
      gap: 1.5rem
    fields:
      - name: idInstrumento
        label: ID Instrumento
        type: number
        placeholder: Auto-generado
        disabled: true
        validations:
          - type: required
            message: ID es requerido
            triggerOn: submit

      - name: subId
        label: Moneda
        type: select
        required: true
        options:
          source: catalog
          catalogType: monedas
          labelField: nombre
          valueField: id
        validations:
          - type: required
            message: Moneda es requerida
            triggerOn: blur

      - name: nombreFuente
        label: Nombre Fuente
        type: text
        required: true
        placeholder: Nombre original del instrumento
        validations:
          - type: required
            message: Nombre fuente es requerido
            triggerOn: blur
          - type: minLength
            params:
              min: 3
            message: Mínimo 3 caracteres
            triggerOn: blur
          - type: duplicate
            message: Ya existe un instrumento con este nombre
            async: true
            triggerOn: blur

      - name: nombreNormalizado
        label: Nombre Normalizado
        type: text
        placeholder: Se genera automáticamente
        validations:
          - type: maxLength
            params:
              max: 200
            message: Máximo 200 caracteres
            triggerOn: blur

  # ========================================
  # INFORMACIÓN COMPAÑÍA
  # ========================================
  - id: compania
    title: Información de Compañía
    description: Datos de la compañía emisora
    collapsible: true
    defaultExpanded: true
    layout:
      columns: 2
      gap: 1.5rem
    fields:
      - name: companyName
        label: Compañía
        type: autocomplete
        required: true
        placeholder: Buscar compañía...
        options:
          source: api
          endpoint: /api/companias/search
          labelField: companyName
          valueField: companyName
        validations:
          - type: required
            message: Compañía es requerida
            triggerOn: blur
          - type: duplicate
            message: Ya existe un instrumento con esta compañía
            async: true
            triggerOn: blur

      - name: companyTickerSymbol
        label: Ticker Symbol
        type: text
        placeholder: AAPL, TSLA, etc.
        validations:
          - type: pattern
            params:
              regex: '^[A-Z]{1,5}$'
            message: Formato inválido (1-5 letras mayúsculas)
            triggerOn: blur

      - name: companyCUSIP
        label: CUSIP
        type: text
        placeholder: Código CUSIP de 9 caracteres
        validations:
          - type: pattern
            params:
              regex: '^[0-9A-Z]{9}$'
            message: CUSIP debe tener 9 caracteres alfanuméricos
            triggerOn: blur

      - name: companyISIN
        label: ISIN
        type: text
        placeholder: Código ISIN de 12 caracteres
        validations:
          - type: pattern
            params:
              regex: '^[A-Z]{2}[0-9A-Z]{10}$'
            message: ISIN debe tener 12 caracteres (2 letras + 10 alfanuméricos)
            triggerOn: blur

  # ========================================
  # CLASIFICACIÓN
  # ========================================
  - id: clasificacion
    title: Clasificación
    description: Categorización del instrumento
    collapsible: true
    defaultExpanded: false
    layout:
      columns: 2
      gap: 1.5rem
    fields:
      - name: instrumentType
        label: Tipo de Instrumento
        type: select
        required: true
        options:
          source: catalog
          catalogType: tiposInstrumento
          labelField: nombre
          valueField: id
        validations:
          - type: required
            message: Tipo de instrumento es requerido
            triggerOn: blur

      - name: securityType
        label: Tipo de Seguridad
        type: select
        options:
          source: catalog
          catalogType: tiposSeguridad
          labelField: nombre
          valueField: id

      - name: assetClass
        label: Clase de Activo
        type: select
        options:
          source: catalog
          catalogType: clasesActivo
          labelField: nombre
          valueField: id

      - name: sector
        label: Sector
        type: select
        options:
          source: catalog
          catalogType: sectores
          labelField: nombre
          valueField: id

  # ========================================
  # DETALLES ADICIONALES
  # ========================================
  - id: detalles
    title: Detalles Adicionales
    description: Información complementaria
    collapsible: true
    defaultExpanded: false
    layout:
      columns: 1
      gap: 1rem
    fields:
      - name: descripcion
        label: Descripción
        type: textarea
        placeholder: Descripción detallada del instrumento...
        validations:
          - type: maxLength
            params:
              max: 1000
            message: Máximo 1000 caracteres
            triggerOn: blur

      - name: observaciones
        label: Observaciones
        type: textarea
        placeholder: Observaciones adicionales...
        validations:
          - type: maxLength
            params:
              max: 500
            message: Máximo 500 caracteres
            triggerOn: blur

# Validaciones a nivel de formulario (cross-field)
formValidations:
  - type: uniqueCombination
    fields: [idInstrumento, subId]
    message: Ya existe un instrumento con este ID y moneda

  - type: conditionalRequired
    fields: [companyTickerSymbol, companyCUSIP, companyISIN]
    message: Debe proporcionar al menos uno de los siguientes: Ticker, CUSIP o ISIN
    validator: atLeastOneRequired

# Comportamiento del formulario
behavior:
  autoSave: false
  autoSaveInterval: 30000
  trackChanges: true
  confirmOnLeave: true
  resetOnSubmit: false
```

**2.1.4: Crear servicio de carga de configuración**

```javascript
// server/services/formConfigService.js
const fs = require('fs').promises;
const path = require('path');
const yaml = require('js-yaml');
const { formConfigSchema } = require('../config/formConfigSchema');

class FormConfigService {
  constructor() {
    this.configCache = new Map();
    this.configDir = path.join(__dirname, '../../config/forms');
  }

  /**
   * Cargar configuración de formulario desde YAML
   */
  async loadFormConfig(formId) {
    // Verificar cache
    if (this.configCache.has(formId)) {
      return this.configCache.get(formId);
    }

    const filePath = path.join(this.configDir, `${formId}.form.yaml`);

    try {
      // Leer archivo YAML
      const fileContent = await fs.readFile(filePath, 'utf8');
      const config = yaml.load(fileContent);

      // Validar contra schema
      const { error, value } = formConfigSchema.validate(config, {
        abortEarly: false,
        allowUnknown: false
      });

      if (error) {
        throw new Error(`Configuración inválida: ${error.details.map(d => d.message).join(', ')}`);
      }

      // Cachear configuración válida
      this.configCache.set(formId, value);

      return value;
    } catch (err) {
      if (err.code === 'ENOENT') {
        throw new Error(`Configuración no encontrada para formulario: ${formId}`);
      }
      throw err;
    }
  }

  /**
   * Listar todos los formularios disponibles
   */
  async listAvailableForms() {
    try {
      const files = await fs.readdir(this.configDir);
      const formFiles = files.filter(f => f.endsWith('.form.yaml'));

      const forms = await Promise.all(
        formFiles.map(async (file) => {
          const formId = file.replace('.form.yaml', '');
          const config = await this.loadFormConfig(formId);

          return {
            formId: config.formId,
            entity: config.entity,
            title: config.title,
            description: config.description,
            version: config.version
          };
        })
      );

      return forms;
    } catch (err) {
      console.error('Error listing forms:', err);
      return [];
    }
  }

  /**
   * Obtener solo la estructura de secciones (sin detalles de validación)
   */
  async getFormStructure(formId) {
    const config = await this.loadFormConfig(formId);

    return {
      formId: config.formId,
      entity: config.entity,
      title: config.title,
      sections: config.sections.map(section => ({
        id: section.id,
        title: section.title,
        description: section.description,
        fields: section.fields.map(field => ({
          name: field.name,
          label: field.label,
          type: field.type,
          required: field.required
        }))
      }))
    };
  }

  /**
   * Obtener configuración completa de un campo
   */
  async getFieldConfig(formId, fieldName) {
    const config = await this.loadFormConfig(formId);

    for (const section of config.sections) {
      const field = section.fields.find(f => f.name === fieldName);
      if (field) {
        return field;
      }
    }

    throw new Error(`Campo ${fieldName} no encontrado en formulario ${formId}`);
  }

  /**
   * Invalidar cache (útil para desarrollo)
   */
  clearCache(formId = null) {
    if (formId) {
      this.configCache.delete(formId);
    } else {
      this.configCache.clear();
    }
  }

  /**
   * Recargar configuración desde disco
   */
  async reloadConfig(formId) {
    this.clearCache(formId);
    return await this.loadFormConfig(formId);
  }
}

module.exports = new FormConfigService();
```

**Test:**
```javascript
// server/services/__tests__/formConfigService.test.js
const formConfigService = require('../formConfigService');

describe('FormConfigService', () => {
  beforeEach(() => {
    formConfigService.clearCache();
  });

  test('loadFormConfig should load and validate instrumentos config', async () => {
    const config = await formConfigService.loadFormConfig('instrumentos');

    expect(config.formId).toBe('instrumentos-form');
    expect(config.entity).toBe('instrumentos');
    expect(config.sections).toHaveLength(4);
    expect(config.sections[0].id).toBe('identificacion');
  });

  test('loadFormConfig should cache configuration', async () => {
    const config1 = await formConfigService.loadFormConfig('instrumentos');
    const config2 = await formConfigService.loadFormConfig('instrumentos');

    expect(config1).toBe(config2);  // Same reference = cached
  });

  test('loadFormConfig should throw on invalid config', async () => {
    await expect(
      formConfigService.loadFormConfig('invalid-form')
    ).rejects.toThrow();
  });

  test('listAvailableForms should return all forms', async () => {
    const forms = await formConfigService.listAvailableForms();

    expect(Array.isArray(forms)).toBe(true);
    expect(forms.length).toBeGreaterThan(0);
    expect(forms[0]).toHaveProperty('formId');
    expect(forms[0]).toHaveProperty('title');
  });

  test('getFieldConfig should return field configuration', async () => {
    const field = await formConfigService.getFieldConfig('instrumentos', 'nombreFuente');

    expect(field.name).toBe('nombreFuente');
    expect(field.type).toBe('text');
    expect(field.required).toBe(true);
    expect(field.validations.length).toBeGreaterThan(0);
  });

  test('getFieldConfig should throw for non-existent field', async () => {
    await expect(
      formConfigService.getFieldConfig('instrumentos', 'nonExistentField')
    ).rejects.toThrow();
  });
});
```

**2.1.5: Crear endpoints para configuración**

```javascript
// server/routes/formConfig.routes.js
const express = require('express');
const router = express.Router();
const formConfigService = require('../services/formConfigService');

// GET /api/form-config - Listar formularios disponibles
router.get('/', async (req, res) => {
  try {
    const forms = await formConfigService.listAvailableForms();

    res.json({
      success: true,
      data: forms
    });
  } catch (err) {
    console.error('Error listing forms:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// GET /api/form-config/:formId - Obtener configuración completa
router.get('/:formId', async (req, res) => {
  try {
    const { formId } = req.params;
    const config = await formConfigService.loadFormConfig(formId);

    res.json({
      success: true,
      data: config
    });
  } catch (err) {
    console.error('Error loading form config:', err);
    res.status(404).json({
      success: false,
      error: err.message
    });
  }
});

// GET /api/form-config/:formId/structure - Obtener solo estructura
router.get('/:formId/structure', async (req, res) => {
  try {
    const { formId } = req.params;
    const structure = await formConfigService.getFormStructure(formId);

    res.json({
      success: true,
      data: structure
    });
  } catch (err) {
    console.error('Error getting form structure:', err);
    res.status(404).json({
      success: false,
      error: err.message
    });
  }
});

// GET /api/form-config/:formId/fields/:fieldName - Obtener config de campo
router.get('/:formId/fields/:fieldName', async (req, res) => {
  try {
    const { formId, fieldName } = req.params;
    const field = await formConfigService.getFieldConfig(formId, fieldName);

    res.json({
      success: true,
      data: field
    });
  } catch (err) {
    console.error('Error getting field config:', err);
    res.status(404).json({
      success: false,
      error: err.message
    });
  }
});

// POST /api/form-config/:formId/reload - Recargar configuración (dev only)
router.post('/:formId/reload', async (req, res) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({
        success: false,
        error: 'Reload only available in development'
      });
    }

    const { formId } = req.params;
    const config = await formConfigService.reloadConfig(formId);

    res.json({
      success: true,
      message: 'Configuración recargada',
      data: config
    });
  } catch (err) {
    console.error('Error reloading config:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

module.exports = router;
```

#### Criterios de Aceptación Sprint 2.1

- [ ] Schema Joi completo y documentado
- [ ] Archivo YAML de instrumentos creado
- [ ] Servicio de carga de configuración implementado
- [ ] Cache de configuración funcionando
- [ ] 5 endpoints REST implementados
- [ ] Tests unitarios pasan
- [ ] Validación de schema funciona correctamente

---

## 5. Fase 3: Motor de Validaciones

### 5.1 Sprint 3.1: Validadores Genéricos (Backend)

**Duración:** 4-5 días

**Objetivo:** Implementar motor de validaciones reutilizable y extensible.

#### Tareas:

**3.1.1: Crear clase base de validador**

```javascript
// server/validators/BaseValidator.js
class BaseValidator {
  constructor(config) {
    this.config = config;
    this.type = config.type;
    this.message = config.message;
    this.params = config.params || {};
  }

  /**
   * Método principal de validación (debe ser implementado por subclases)
   * @param {any} value - Valor a validar
   * @param {Object} context - Contexto completo del formulario
   * @returns {Promise<{valid: boolean, message?: string}>}
   */
  async validate(value, context = {}) {
    throw new Error('validate() debe ser implementado por subclases');
  }

  /**
   * Helper: Verificar si el valor está vacío
   */
  isEmpty(value) {
    return value === null || value === undefined || value === '';
  }

  /**
   * Helper: Obtener mensaje de error personalizado
   */
  getMessage(customMessage = null) {
    return customMessage || this.message;
  }
}

module.exports = BaseValidator;
```

**3.1.2: Implementar validadores síncronos**

```javascript
// server/validators/syncValidators.js
const BaseValidator = require('./BaseValidator');

/**
 * Validador: Campo requerido
 */
class RequiredValidator extends BaseValidator {
  async validate(value) {
    const valid = !this.isEmpty(value) && String(value).trim() !== '';

    return {
      valid,
      message: valid ? null : this.getMessage()
    };
  }
}

/**
 * Validador: Longitud mínima
 */
class MinLengthValidator extends BaseValidator {
  async validate(value) {
    if (this.isEmpty(value)) {
      return { valid: true };  // No validar si está vacío (usar required para eso)
    }

    const min = this.params.min || 0;
    const valid = String(value).length >= min;

    return {
      valid,
      message: valid ? null : this.getMessage(`Mínimo ${min} caracteres`)
    };
  }
}

/**
 * Validador: Longitud máxima
 */
class MaxLengthValidator extends BaseValidator {
  async validate(value) {
    if (this.isEmpty(value)) {
      return { valid: true };
    }

    const max = this.params.max || Infinity;
    const valid = String(value).length <= max;

    return {
      valid,
      message: valid ? null : this.getMessage(`Máximo ${max} caracteres`)
    };
  }
}

/**
 * Validador: Patrón regex
 */
class PatternValidator extends BaseValidator {
  async validate(value) {
    if (this.isEmpty(value)) {
      return { valid: true };
    }

    const pattern = new RegExp(this.params.regex);
    const valid = pattern.test(String(value));

    return {
      valid,
      message: valid ? null : this.getMessage()
    };
  }
}

/**
 * Validador: Email
 */
class EmailValidator extends BaseValidator {
  async validate(value) {
    if (this.isEmpty(value)) {
      return { valid: true };
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const valid = emailRegex.test(String(value));

    return {
      valid,
      message: valid ? null : this.getMessage('Email inválido')
    };
  }
}

/**
 * Validador: Número
 */
class NumberValidator extends BaseValidator {
  async validate(value) {
    if (this.isEmpty(value)) {
      return { valid: true };
    }

    const valid = !isNaN(parseFloat(value)) && isFinite(value);

    return {
      valid,
      message: valid ? null : this.getMessage('Debe ser un número válido')
    };
  }
}

/**
 * Validador: Rango numérico
 */
class RangeValidator extends BaseValidator {
  async validate(value) {
    if (this.isEmpty(value)) {
      return { valid: true };
    }

    const numValue = parseFloat(value);
    const min = this.params.min ?? -Infinity;
    const max = this.params.max ?? Infinity;

    const valid = numValue >= min && numValue <= max;

    return {
      valid,
      message: valid ? null : this.getMessage(`Debe estar entre ${min} y ${max}`)
    };
  }
}

module.exports = {
  RequiredValidator,
  MinLengthValidator,
  MaxLengthValidator,
  PatternValidator,
  EmailValidator,
  NumberValidator,
  RangeValidator
};
```

**3.1.3: Implementar validadores asíncronos (API)**

```javascript
// server/validators/asyncValidators.js
const BaseValidator = require('./BaseValidator');
const { getPool, sql } = require('../config/database');

/**
 * Validador: Duplicados (base de datos)
 */
class DuplicateValidator extends BaseValidator {
  async validate(value, context = {}) {
    if (this.isEmpty(value)) {
      return { valid: true };
    }

    const { entity, fieldName, excludeId, excludeMoneda } = context;

    if (!entity || !fieldName) {
      console.warn('DuplicateValidator requiere entity y fieldName en context');
      return { valid: true };
    }

    try {
      const pool = await getPool();

      // Construir query dinámicamente
      let query = `
        SELECT COUNT(*) as count
        FROM stock.${entity}
        WHERE ${fieldName} = @value
      `;

      const request = pool.request()
        .input('value', sql.NVarChar, value);

      // Excluir el registro actual en modo edición
      if (excludeId) {
        query += ' AND idInstrumento <> @excludeId';
        request.input('excludeId', sql.Int, excludeId);
      }

      if (excludeMoneda) {
        query += ' AND subId <> @excludeMoneda';
        request.input('excludeMoneda', sql.Int, excludeMoneda);
      }

      const result = await request.query(query);
      const count = result.recordset[0].count;

      const valid = count === 0;

      return {
        valid,
        message: valid ? null : this.getMessage(`Ya existe un ${entity} con este valor`)
      };
    } catch (err) {
      console.error('Error en DuplicateValidator:', err);
      // En caso de error, permitir continuar (no bloquear el formulario)
      return { valid: true };
    }
  }
}

/**
 * Validador: Existencia de registro relacionado
 */
class ExistsValidator extends BaseValidator {
  async validate(value, context = {}) {
    if (this.isEmpty(value)) {
      return { valid: true };
    }

    const { table, field } = this.params;

    if (!table || !field) {
      console.warn('ExistsValidator requiere table y field en params');
      return { valid: true };
    }

    try {
      const pool = await getPool();

      const result = await pool.request()
        .input('value', sql.NVarChar, value)
        .query(`SELECT COUNT(*) as count FROM ${table} WHERE ${field} = @value`);

      const count = result.recordset[0].count;
      const valid = count > 0;

      return {
        valid,
        message: valid ? null : this.getMessage(`No existe registro con este valor`)
      };
    } catch (err) {
      console.error('Error en ExistsValidator:', err);
      return { valid: true };
    }
  }
}

module.exports = {
  DuplicateValidator,
  ExistsValidator
};
```

**3.1.4: Crear factory de validadores**

```javascript
// server/validators/ValidatorFactory.js
const {
  RequiredValidator,
  MinLengthValidator,
  MaxLengthValidator,
  PatternValidator,
  EmailValidator,
  NumberValidator,
  RangeValidator
} = require('./syncValidators');

const {
  DuplicateValidator,
  ExistsValidator
} = require('./asyncValidators');

class ValidatorFactory {
  constructor() {
    this.validators = new Map([
      ['required', RequiredValidator],
      ['minLength', MinLengthValidator],
      ['maxLength', MaxLengthValidator],
      ['pattern', PatternValidator],
      ['email', EmailValidator],
      ['number', NumberValidator],
      ['range', RangeValidator],
      ['duplicate', DuplicateValidator],
      ['exists', ExistsValidator]
    ]);
  }

  /**
   * Registrar validador custom
   */
  register(type, ValidatorClass) {
    this.validators.set(type, ValidatorClass);
  }

  /**
   * Crear instancia de validador
   */
  create(config) {
    const ValidatorClass = this.validators.get(config.type);

    if (!ValidatorClass) {
      throw new Error(`Validador desconocido: ${config.type}`);
    }

    return new ValidatorClass(config);
  }

  /**
   * Crear múltiples validadores desde configuración
   */
  createFromConfig(validationsConfig) {
    return validationsConfig.map(config => this.create(config));
  }
}

module.exports = new ValidatorFactory();
```

**3.1.5: Crear servicio de validación**

```javascript
// server/services/validationService.js
const validatorFactory = require('../validators/ValidatorFactory');
const formConfigService = require('./formConfigService');
const formSessionService = require('./formSessionService');

class ValidationService {
  /**
   * Validar un campo específico
   */
  async validateField(formId, fieldName, value, context = {}) {
    // Obtener configuración del campo
    const fieldConfig = await formConfigService.getFieldConfig(formId, fieldName);

    if (!fieldConfig.validations || fieldConfig.validations.length === 0) {
      return { valid: true, errors: [] };
    }

    // Crear validadores
    const validators = validatorFactory.createFromConfig(fieldConfig.validations);

    // Ejecutar validaciones
    const results = await Promise.all(
      validators.map(validator =>
        validator.validate(value, {
          ...context,
          fieldName,
          fieldConfig
        })
      )
    );

    // Recopilar errores
    const errors = results
      .filter(result => !result.valid)
      .map(result => result.message);

    const valid = errors.length === 0;

    // Log de validación si hay sesión activa
    if (context.sessionId) {
      for (let i = 0; i < results.length; i++) {
        await formSessionService.logValidation(
          context.sessionId,
          fieldConfig.validations[i].type,
          'campo',
          fieldName,
          results[i].valid,
          results[i].message,
          value
        );
      }
    }

    return { valid, errors };
  }

  /**
   * Validar múltiples campos
   */
  async validateFields(formId, fieldsData, context = {}) {
    const results = {};

    for (const [fieldName, value] of Object.entries(fieldsData)) {
      results[fieldName] = await this.validateField(
        formId,
        fieldName,
        value,
        context
      );
    }

    const valid = Object.values(results).every(r => r.valid);

    return { valid, results };
  }

  /**
   * Validar formulario completo
   */
  async validateForm(formId, formData, context = {}) {
    const config = await formConfigService.loadFormConfig(formId);

    // 1. Validar todos los campos
    const fieldResults = await this.validateFields(formId, formData, context);

    // 2. Validar a nivel de formulario (cross-field)
    const formValidationResults = [];

    if (config.formValidations) {
      for (const validation of config.formValidations) {
        const result = await this.validateFormLevel(
          validation,
          formData,
          context
        );
        formValidationResults.push(result);
      }
    }

    const formValid = formValidationResults.every(r => r.valid);
    const valid = fieldResults.valid && formValid;

    return {
      valid,
      fieldResults: fieldResults.results,
      formResults: formValidationResults
    };
  }

  /**
   * Validaciones a nivel de formulario (cross-field)
   */
  async validateFormLevel(validation, formData, context) {
    // Implementar validadores custom para nivel de formulario
    switch (validation.type) {
      case 'uniqueCombination':
        return await this.validateUniqueCombination(
          validation,
          formData,
          context
        );

      case 'conditionalRequired':
        return await this.validateConditionalRequired(
          validation,
          formData
        );

      default:
        console.warn(`Validación de formulario desconocida: ${validation.type}`);
        return { valid: true };
    }
  }

  /**
   * Validador: Combinación única de campos
   */
  async validateUniqueCombination(validation, formData, context) {
    const { fields, message } = validation;
    const { entity, excludeId, excludeMoneda } = context;

    const values = fields.map(field => formData[field]);

    if (values.some(v => v === null || v === undefined || v === '')) {
      return { valid: true };
    }

    try {
      const { getPool, sql } = require('../config/database');
      const pool = await getPool();

      let query = `SELECT COUNT(*) as count FROM stock.${entity} WHERE 1=1`;
      const request = pool.request();

      fields.forEach((field, index) => {
        query += ` AND ${field} = @value${index}`;
        request.input(`value${index}`, sql.NVarChar, values[index]);
      });

      if (excludeId) {
        query += ' AND idInstrumento <> @excludeId';
        request.input('excludeId', sql.Int, excludeId);
      }

      if (excludeMoneda) {
        query += ' AND subId <> @excludeMoneda';
        request.input('excludeMoneda', sql.Int, excludeMoneda);
      }

      const result = await request.query(query);
      const count = result.recordset[0].count;

      const valid = count === 0;

      return {
        valid,
        message: valid ? null : message,
        type: validation.type
      };
    } catch (err) {
      console.error('Error en validateUniqueCombination:', err);
      return { valid: true };
    }
  }

  /**
   * Validador: Al menos uno requerido
   */
  async validateConditionalRequired(validation, formData) {
    const { fields, message } = validation;

    const hasAtLeastOne = fields.some(field => {
      const value = formData[field];
      return value !== null && value !== undefined && value !== '';
    });

    return {
      valid: hasAtLeastOne,
      message: hasAtLeastOne ? null : message,
      type: validation.type
    };
  }
}

module.exports = new ValidationService();
```

**Test:**
```javascript
// server/services/__tests__/validationService.test.js
const validationService = require('../validationService');

describe('ValidationService', () => {
  const mockFormData = {
    nombreFuente: 'Test Instrument',
    subId: 1,
    companyName: 'Test Corp'
  };

  test('validateField should validate required field', async () => {
    const result = await validationService.validateField(
      'instrumentos',
      'nombreFuente',
      '',
      { entity: 'instrumentos' }
    );

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test('validateField should pass valid data', async () => {
    const result = await validationService.validateField(
      'instrumentos',
      'nombreFuente',
      'Valid Name',
      { entity: 'instrumentos' }
    );

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('validateFields should validate multiple fields', async () => {
    const result = await validationService.validateFields(
      'instrumentos',
      { nombreFuente: '', subId: 1 },
      { entity: 'instrumentos' }
    );

    expect(result.valid).toBe(false);
    expect(result.results.nombreFuente.valid).toBe(false);
    expect(result.results.subId.valid).toBe(true);
  });

  test('validateForm should validate entire form', async () => {
    const result = await validationService.validateForm(
      'instrumentos',
      mockFormData,
      { entity: 'instrumentos' }
    );

    expect(result).toHaveProperty('valid');
    expect(result).toHaveProperty('fieldResults');
    expect(result).toHaveProperty('formResults');
  });
});
```

**3.1.6: Crear endpoint de validación**

```javascript
// server/routes/validation.routes.js
const express = require('express');
const router = express.Router();
const validationService = require('../services/validationService');

// POST /api/validation/field - Validar campo individual
router.post('/field', async (req, res) => {
  try {
    const { formId, fieldName, value, context } = req.body;

    const result = await validationService.validateField(
      formId,
      fieldName,
      value,
      context
    );

    res.json({
      success: true,
      data: result
    });
  } catch (err) {
    console.error('Error validating field:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// POST /api/validation/fields - Validar múltiples campos
router.post('/fields', async (req, res) => {
  try {
    const { formId, fields, context } = req.body;

    const result = await validationService.validateFields(
      formId,
      fields,
      context
    );

    res.json({
      success: true,
      data: result
    });
  } catch (err) {
    console.error('Error validating fields:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// POST /api/validation/form - Validar formulario completo
router.post('/form', async (req, res) => {
  try {
    const { formId, formData, context } = req.body;

    const result = await validationService.validateForm(
      formId,
      formData,
      context
    );

    res.json({
      success: true,
      data: result
    });
  } catch (err) {
    console.error('Error validating form:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

module.exports = router;
```

#### Criterios de Aceptación Sprint 3.1

- [ ] Clase BaseValidator implementada
- [ ] 7 validadores síncronos implementados
- [ ] 2 validadores asíncronos implementados
- [ ] ValidatorFactory creado
- [ ] ValidationService completo
- [ ] 3 endpoints REST de validación
- [ ] Tests unitarios pasan (>90% coverage)
- [ ] Validaciones cross-field funcionan

---

## 6. Fase 4: Componentes Dinámicos (Frontend)

### 6.1 Sprint 4.1: Componentes React Base

**Duración:** 5-6 días

**Objetivo:** Crear componentes React dinámicos que rendericen formularios desde configuración.

#### Tareas:

**4.1.1: Crear servicio frontend de configuración**

```javascript
// src/services/formConfigFrontendService.js
import { apiClient } from './apiClient';

export const formConfigService = {
  /**
   * Obtener lista de formularios disponibles
   */
  getAvailableForms: () =>
    apiClient.get('/form-config'),

  /**
   * Obtener configuración completa de un formulario
   */
  getFormConfig: (formId) =>
    apiClient.get(`/form-config/${formId}`),

  /**
   * Obtener solo estructura del formulario
   */
  getFormStructure: (formId) =>
    apiClient.get(`/form-config/${formId}/structure`),

  /**
   * Obtener configuración de un campo específico
   */
  getFieldConfig: (formId, fieldName) =>
    apiClient.get(`/form-config/${formId}/fields/${fieldName}`),

  /**
   * Recargar configuración (dev only)
   */
  reloadConfig: (formId) =>
    apiClient.post(`/form-config/${formId}/reload`)
};

export default formConfigService;
```

**4.1.2: Crear hook para gestión de formulario dinámico**

```javascript
// src/hooks/useDynamicForm.js
import { useState, useEffect, useCallback, useRef } from 'react';
import { formConfigService } from '../services/formConfigFrontendService';
import { formSessionService } from '../services/formSessionService';
import { validationService } from '../services/validationService';

export const useDynamicForm = (formId, initialData = {}, options = {}) => {
  const [config, setConfig] = useState(null);
  const [formData, setFormData] = useState(initialData);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [sessionId, setSessionId] = useState(null);

  const initialDataRef = useRef(initialData);

  // Cargar configuración del formulario
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const response = await formConfigService.getFormConfig(formId);
        if (response.success) {
          setConfig(response.data);
        }
      } catch (err) {
        console.error('Error loading form config:', err);
      }
    };

    loadConfig();
  }, [formId]);

  // Crear sesión al montar el componente
  useEffect(() => {
    if (!config) return;

    const createSession = async () => {
      try {
        const response = await formSessionService.createSession({
          entidad: config.entity,
          accion: options.mode === 'edit' ? 'UPDATE' : 'CREATE',
          idEntidad: options.entityId || null,
          datosIniciales: initialData
        });

        if (response.success) {
          setSessionId(response.data.ID_Sesion);
        }
      } catch (err) {
        console.error('Error creating session:', err);
      }
    };

    createSession();

    // Finalizar sesión al desmontar
    return () => {
      if (sessionId) {
        formSessionService.finalizeSession(sessionId, 'CANCELADO', formData);
      }
    };
  }, [config]); // eslint-disable-line react-hooks/exhaustive-deps

  // Detectar cambios
  useEffect(() => {
    const hasChanges = JSON.stringify(formData) !== JSON.stringify(initialDataRef.current);
    setIsDirty(hasChanges);
  }, [formData]);

  /**
   * Actualizar valor de campo
   */
  const setFieldValue = useCallback(async (fieldName, value) => {
    const oldValue = formData[fieldName];

    setFormData(prev => ({
      ...prev,
      [fieldName]: value
    }));

    // Log de cambio
    if (sessionId && oldValue !== value) {
      try {
        await formSessionService.logChange(
          sessionId,
          fieldName,
          oldValue,
          value
        );
      } catch (err) {
        console.error('Error logging change:', err);
      }
    }
  }, [formData, sessionId]);

  /**
   * Validar campo individual
   */
  const validateField = useCallback(async (fieldName) => {
    if (!config) return;

    try {
      const response = await validationService.validateField(
        formId,
        fieldName,
        formData[fieldName],
        {
          entity: config.entity,
          sessionId,
          ...options.validationContext
        }
      );

      if (response.success) {
        setErrors(prev => ({
          ...prev,
          [fieldName]: response.data.valid ? null : response.data.errors
        }));

        return response.data.valid;
      }
    } catch (err) {
      console.error('Error validating field:', err);
    }

    return true;
  }, [config, formId, formData, sessionId, options.validationContext]);

  /**
   * Marcar campo como tocado
   */
  const setFieldTouched = useCallback((fieldName, isTouched = true) => {
    setTouched(prev => ({
      ...prev,
      [fieldName]: isTouched
    }));
  }, []);

  /**
   * Handler de blur de campo
   */
  const handleFieldBlur = useCallback(async (fieldName) => {
    setFieldTouched(fieldName, true);
    await validateField(fieldName);
  }, [setFieldTouched, validateField]);

  /**
   * Validar formulario completo
   */
  const validateForm = useCallback(async () => {
    if (!config) return false;

    try {
      const response = await validationService.validateForm(
        formId,
        formData,
        {
          entity: config.entity,
          sessionId,
          ...options.validationContext
        }
      );

      if (response.success) {
        // Mapear errores de campos
        const fieldErrors = {};
        Object.entries(response.data.fieldResults).forEach(([field, result]) => {
          if (!result.valid) {
            fieldErrors[field] = result.errors;
          }
        });

        // Agregar errores de formulario
        if (response.data.formResults) {
          response.data.formResults.forEach(result => {
            if (!result.valid) {
              fieldErrors._form = fieldErrors._form || [];
              fieldErrors._form.push(result.message);
            }
          });
        }

        setErrors(fieldErrors);

        // Marcar todos los campos como tocados
        const allTouched = {};
        Object.keys(formData).forEach(key => {
          allTouched[key] = true;
        });
        setTouched(allTouched);

        return response.data.valid;
      }
    } catch (err) {
      console.error('Error validating form:', err);
    }

    return false;
  }, [config, formId, formData, sessionId, options.validationContext]);

  /**
   * Submit del formulario
   */
  const handleSubmit = useCallback(async (onSubmit) => {
    setIsSubmitting(true);

    try {
      // Validar formulario
      const isValid = await validateForm();

      if (!isValid) {
        setIsSubmitting(false);
        return { success: false, errors };
      }

      // Ejecutar callback de submit
      const result = await onSubmit(formData);

      // Finalizar sesión
      if (sessionId) {
        await formSessionService.finalizeSession(
          sessionId,
          result.success ? 'COMPLETADO' : 'ERROR',
          formData,
          result.error || null
        );
      }

      setIsSubmitting(false);
      return result;
    } catch (err) {
      console.error('Error submitting form:', err);

      if (sessionId) {
        await formSessionService.finalizeSession(
          sessionId,
          'ERROR',
          formData,
          err.message
        );
      }

      setIsSubmitting(false);
      return { success: false, error: err.message };
    }
  }, [validateForm, errors, formData, sessionId]);

  /**
   * Reset formulario
   */
  const resetForm = useCallback(() => {
    setFormData(initialDataRef.current);
    setErrors({});
    setTouched({});
    setIsDirty(false);
  }, []);

  return {
    config,
    formData,
    errors,
    touched,
    isSubmitting,
    isDirty,
    sessionId,
    setFieldValue,
    setFieldTouched,
    validateField,
    validateForm,
    handleFieldBlur,
    handleSubmit,
    resetForm
  };
};

export default useDynamicForm;
```

**4.1.3: Crear componente DynamicField**

```javascript
// src/components/DynamicForm/DynamicField.jsx
import React from 'react';
import PropTypes from 'prop-types';
import {
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  FormHelperText,
  Checkbox,
  FormControlLabel,
  Autocomplete
} from '@mui/material';

const DynamicField = ({
  fieldConfig,
  value,
  error,
  touched,
  onChange,
  onBlur,
  disabled
}) => {
  const {
    name,
    label,
    type,
    placeholder,
    required,
    options
  } = fieldConfig;

  const showError = touched && error;
  const helperText = showError ? (Array.isArray(error) ? error[0] : error) : '';

  // Renderizar según tipo de campo
  switch (type) {
    case 'text':
    case 'number':
      return (
        <TextField
          fullWidth
          name={name}
          label={label}
          type={type}
          value={value || ''}
          onChange={(e) => onChange(name, e.target.value)}
          onBlur={() => onBlur(name)}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          error={showError}
          helperText={helperText}
          variant="outlined"
        />
      );

    case 'textarea':
      return (
        <TextField
          fullWidth
          multiline
          rows={4}
          name={name}
          label={label}
          value={value || ''}
          onChange={(e) => onChange(name, e.target.value)}
          onBlur={() => onBlur(name)}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          error={showError}
          helperText={helperText}
          variant="outlined"
        />
      );

    case 'select':
      return (
        <FormControl fullWidth error={showError} disabled={disabled}>
          <InputLabel>{label} {required && '*'}</InputLabel>
          <Select
            name={name}
            value={value || ''}
            onChange={(e) => onChange(name, e.target.value)}
            onBlur={() => onBlur(name)}
            label={label}
          >
            {options?.staticValues?.map(option => (
              <MenuItem key={option.value} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
          </Select>
          {helperText && <FormHelperText>{helperText}</FormHelperText>}
        </FormControl>
      );

    case 'autocomplete':
      return (
        <Autocomplete
          fullWidth
          name={name}
          value={value || null}
          onChange={(e, newValue) => onChange(name, newValue)}
          onBlur={() => onBlur(name)}
          options={options?.staticValues || []}
          getOptionLabel={(option) => option[options?.labelField || 'label'] || ''}
          isOptionEqualToValue={(option, value) =>
            option[options?.valueField || 'value'] === value
          }
          disabled={disabled}
          renderInput={(params) => (
            <TextField
              {...params}
              label={label}
              placeholder={placeholder}
              required={required}
              error={showError}
              helperText={helperText}
              variant="outlined"
            />
          )}
        />
      );

    case 'checkbox':
      return (
        <FormControlLabel
          control={
            <Checkbox
              name={name}
              checked={value || false}
              onChange={(e) => onChange(name, e.target.checked)}
              onBlur={() => onBlur(name)}
              disabled={disabled}
            />
          }
          label={label}
        />
      );

    case 'date':
      return (
        <TextField
          fullWidth
          name={name}
          label={label}
          type="date"
          value={value || ''}
          onChange={(e) => onChange(name, e.target.value)}
          onBlur={() => onBlur(name)}
          required={required}
          disabled={disabled}
          error={showError}
          helperText={helperText}
          variant="outlined"
          InputLabelProps={{ shrink: true }}
        />
      );

    default:
      console.warn(`Tipo de campo desconocido: ${type}`);
      return null;
  }
};

DynamicField.propTypes = {
  fieldConfig: PropTypes.object.isRequired,
  value: PropTypes.any,
  error: PropTypes.oneOfType([PropTypes.string, PropTypes.array]),
  touched: PropTypes.bool,
  onChange: PropTypes.func.isRequired,
  onBlur: PropTypes.func.isRequired,
  disabled: PropTypes.bool
};

export default DynamicField;
```

**4.1.4: Crear componente DynamicSection**

```javascript
// src/components/DynamicForm/DynamicSection.jsx
import React, { useState } from 'react';
import PropTypes from 'prop-types';
import {
  Box,
  Typography,
  Collapse,
  IconButton,
  Paper,
  Grid
} from '@mui/material';
import { ExpandMore, ExpandLess } from '@mui/icons-material';
import DynamicField from './DynamicField';

const DynamicSection = ({
  sectionConfig,
  formData,
  errors,
  touched,
  onFieldChange,
  onFieldBlur,
  disabled
}) => {
  const {
    id,
    title,
    description,
    collapsible,
    defaultExpanded,
    fields,
    layout
  } = sectionConfig;

  const [expanded, setExpanded] = useState(defaultExpanded !== false);

  const handleToggle = () => {
    if (collapsible) {
      setExpanded(!expanded);
    }
  };

  const columns = layout?.columns || 2;
  const gap = layout?.gap || '1rem';

  return (
    <Paper elevation={1} sx={{ mb: 2, overflow: 'hidden' }}>
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          p: 2,
          bgcolor: 'grey.50',
          cursor: collapsible ? 'pointer' : 'default',
          '&:hover': collapsible ? { bgcolor: 'grey.100' } : {}
        }}
        onClick={handleToggle}
      >
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            {title}
          </Typography>
          {description && (
            <Typography variant="body2" color="text.secondary">
              {description}
            </Typography>
          )}
        </Box>
        {collapsible && (
          <IconButton size="small">
            {expanded ? <ExpandLess /> : <ExpandMore />}
          </IconButton>
        )}
      </Box>

      {/* Contenido */}
      <Collapse in={expanded}>
        <Box sx={{ p: 3 }}>
          <Grid container spacing={gap}>
            {fields.map(field => (
              <Grid
                item
                xs={12}
                md={12 / columns}
                key={field.name}
              >
                <DynamicField
                  fieldConfig={field}
                  value={formData[field.name]}
                  error={errors[field.name]}
                  touched={touched[field.name]}
                  onChange={onFieldChange}
                  onBlur={onFieldBlur}
                  disabled={disabled || field.disabled}
                />
              </Grid>
            ))}
          </Grid>
        </Box>
      </Collapse>
    </Paper>
  );
};

DynamicSection.propTypes = {
  sectionConfig: PropTypes.object.isRequired,
  formData: PropTypes.object.isRequired,
  errors: PropTypes.object.isRequired,
  touched: PropTypes.object.isRequired,
  onFieldChange: PropTypes.func.isRequired,
  onFieldBlur: PropTypes.func.isRequired,
  disabled: PropTypes.bool
};

export default DynamicSection;
```

**4.1.5: Crear componente DynamicForm (principal)**

```javascript
// src/components/DynamicForm/DynamicForm.jsx
import React from 'react';
import PropTypes from 'prop-types';
import {
  Box,
  Button,
  CircularProgress,
  Alert,
  AlertTitle
} from '@mui/material';
import { Save, Cancel } from '@mui/icons-material';
import DynamicSection from './DynamicSection';
import { useDynamicForm } from '../../hooks/useDynamicForm';

const DynamicForm = ({
  formId,
  initialData,
  mode,
  onSubmit,
  onCancel,
  validationContext
}) => {
  const {
    config,
    formData,
    errors,
    touched,
    isSubmitting,
    isDirty,
    setFieldValue,
    handleFieldBlur,
    handleSubmit,
    resetForm
  } = useDynamicForm(formId, initialData, {
    mode,
    validationContext
  });

  // Loading state
  if (!config) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  const handleFormSubmit = async (e) => {
    e.preventDefault();

    const result = await handleSubmit(onSubmit);

    if (!result.success) {
      console.error('Form submission failed:', result.error);
    }
  };

  const handleCancel = () => {
    if (isDirty) {
      const confirmed = window.confirm('Hay cambios sin guardar. ¿Desea continuar?');
      if (!confirmed) return;
    }

    resetForm();
    if (onCancel) onCancel();
  };

  return (
    <Box component="form" onSubmit={handleFormSubmit} noValidate>
      {/* Título */}
      <Box sx={{ mb: 3 }}>
        <h2>{config.title}</h2>
        {config.description && (
          <p style={{ color: '#666' }}>{config.description}</p>
        )}
      </Box>

      {/* Errores de formulario */}
      {errors._form && (
        <Alert severity="error" sx={{ mb: 2 }}>
          <AlertTitle>Errores de validación</AlertTitle>
          {Array.isArray(errors._form) ? (
            <ul>
              {errors._form.map((error, index) => (
                <li key={index}>{error}</li>
              ))}
            </ul>
          ) : (
            errors._form
          )}
        </Alert>
      )}

      {/* Secciones */}
      {config.sections.map(section => (
        <DynamicSection
          key={section.id}
          sectionConfig={section}
          formData={formData}
          errors={errors}
          touched={touched}
          onFieldChange={setFieldValue}
          onFieldBlur={handleFieldBlur}
          disabled={isSubmitting}
        />
      ))}

      {/* Botones de acción */}
      <Box sx={{ display: 'flex', gap: 2, mt: 3 }}>
        <Button
          type="submit"
          variant="contained"
          startIcon={isSubmitting ? <CircularProgress size={20} /> : <Save />}
          disabled={isSubmitting || !isDirty}
        >
          {isSubmitting ? 'Guardando...' : 'Guardar'}
        </Button>

        <Button
          variant="outlined"
          startIcon={<Cancel />}
          onClick={handleCancel}
          disabled={isSubmitting}
        >
          Cancelar
        </Button>
      </Box>
    </Box>
  );
};

DynamicForm.propTypes = {
  formId: PropTypes.string.isRequired,
  initialData: PropTypes.object,
  mode: PropTypes.oneOf(['create', 'edit', 'view']),
  onSubmit: PropTypes.func.isRequired,
  onCancel: PropTypes.func,
  validationContext: PropTypes.object
};

DynamicForm.defaultProps = {
  initialData: {},
  mode: 'create',
  validationContext: {}
};

export default DynamicForm;
```

**Test:**
```javascript
// src/components/DynamicForm/__tests__/DynamicForm.test.jsx
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import DynamicForm from '../DynamicForm';
import * as formConfigService from '../../../services/formConfigFrontendService';

jest.mock('../../../services/formConfigFrontendService');

describe('DynamicForm', () => {
  const mockConfig = {
    formId: 'test-form',
    entity: 'test',
    title: 'Test Form',
    sections: [
      {
        id: 'section1',
        title: 'Section 1',
        fields: [
          {
            name: 'field1',
            label: 'Field 1',
            type: 'text',
            required: true,
            validations: []
          }
        ]
      }
    ],
    behavior: {}
  };

  beforeEach(() => {
    formConfigService.formConfigService.getFormConfig.mockResolvedValue({
      success: true,
      data: mockConfig
    });
  });

  test('renders form with title', async () => {
    render(
      <DynamicForm
        formId="test-form"
        onSubmit={jest.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Test Form')).toBeInTheDocument();
    });
  });

  test('renders sections and fields', async () => {
    render(
      <DynamicForm
        formId="test-form"
        onSubmit={jest.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Section 1')).toBeInTheDocument();
      expect(screen.getByLabelText(/Field 1/i)).toBeInTheDocument();
    });
  });

  test('calls onSubmit when form is submitted', async () => {
    const onSubmit = jest.fn().mockResolvedValue({ success: true });

    render(
      <DynamicForm
        formId="test-form"
        onSubmit={onSubmit}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Test Form')).toBeInTheDocument();
    });

    const submitButton = screen.getByRole('button', { name: /Guardar/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalled();
    });
  });
});
```

#### Criterios de Aceptación Sprint 4.1

- [ ] Hook useDynamicForm completamente funcional
- [ ] Componente DynamicField soporta todos los tipos
- [ ] Componente DynamicSection con expand/collapse
- [ ] Componente DynamicForm integrado
- [ ] Servicios frontend de sesiones y validación
- [ ] Tests unitarios de componentes pasan
- [ ] Formulario se renderiza desde configuración YAML

---

## 7. Fase 5: Integración y Migración

### 7.1 Sprint 5.1: Migración Formulario de Instrumentos

**Duración:** 3-4 días

**Objetivo:** Migrar formulario existente de instrumentos al sistema dinámico.

#### Tareas:

**5.1.1: Crear página de formulario dinámico**

```javascript
// src/pages/InstrumentosFormPage.jsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Container, Paper, Alert } from '@mui/material';
import DynamicForm from '../components/DynamicForm/DynamicForm';
import { instrumentosService } from '../services';

const InstrumentosFormPage = () => {
  const { id, moneda } = useParams();
  const navigate = useNavigate();
  const [initialData, setInitialData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const mode = id && moneda ? 'edit' : 'create';

  // Cargar datos iniciales en modo edición
  useEffect(() => {
    const loadData = async () => {
      if (mode === 'edit') {
        try {
          const response = await instrumentosService.getByPK(id, moneda);
          if (response.success) {
            setInitialData(response.data);
          } else {
            setError('No se pudo cargar el instrumento');
          }
        } catch (err) {
          setError(err.message);
        }
      } else {
        // Modo creación: obtener siguiente ID
        try {
          const response = await instrumentosService.getNextId();
          if (response.success) {
            setInitialData({ idInstrumento: response.data.nextId });
          }
        } catch (err) {
          console.error('Error getting next ID:', err);
          setInitialData({});
        }
      }

      setLoading(false);
    };

    loadData();
  }, [id, moneda, mode]);

  const handleSubmit = async (formData) => {
    try {
      let response;

      if (mode === 'create') {
        response = await instrumentosService.create(formData);
      } else {
        response = await instrumentosService.update(id, moneda, formData);
      }

      if (response.success) {
        navigate('/instrumentos', {
          state: { message: `Instrumento ${mode === 'create' ? 'creado' : 'actualizado'} exitosamente` }
        });
        return { success: true };
      } else {
        return { success: false, error: response.error };
      }
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  const handleCancel = () => {
    navigate('/instrumentos');
  };

  if (loading) {
    return <div>Cargando...</div>;
  }

  if (error) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4 }}>
        <Alert severity="error">{error}</Alert>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Paper sx={{ p: 3 }}>
        <DynamicForm
          formId="instrumentos"
          initialData={initialData || {}}
          mode={mode}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          validationContext={{
            entity: 'instrumentos',
            excludeId: mode === 'edit' ? id : null,
            excludeMoneda: mode === 'edit' ? moneda : null
          }}
        />
      </Paper>
    </Container>
  );
};

export default InstrumentosFormPage;
```

**5.1.2: Actualizar rutas**

```javascript
// src/App.jsx (o router config)
import InstrumentosFormPage from './pages/InstrumentosFormPage';

// ... en las rutas:
<Route path="/instrumentos/nuevo" element={<InstrumentosFormPage />} />
<Route path="/instrumentos/:id/:moneda/editar" element={<InstrumentosFormPage />} />
```

**5.1.3: Crear tests de integración**

```javascript
// src/pages/__tests__/InstrumentosFormPage.integration.test.jsx
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import InstrumentosFormPage from '../InstrumentosFormPage';
import * as instrumentosService from '../../services/instrumentosService';

jest.mock('../../services/instrumentosService');

describe('InstrumentosFormPage Integration', () => {
  test('creates new instrument successfully', async () => {
    instrumentosService.instrumentosService.getNextId.mockResolvedValue({
      success: true,
      data: { nextId: 999 }
    });

    instrumentosService.instrumentosService.create.mockResolvedValue({
      success: true
    });

    render(
      <BrowserRouter>
        <InstrumentosFormPage />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Formulario de Instrumentos/i)).toBeInTheDocument();
    });

    // Llenar campos
    const nombreField = screen.getByLabelText(/Nombre Fuente/i);
    fireEvent.change(nombreField, { target: { value: 'Test Instrument' } });

    // Submit
    const submitButton = screen.getByRole('button', { name: /Guardar/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(instrumentosService.instrumentosService.create).toHaveBeenCalled();
    });
  });
});
```

#### Criterios de Aceptación Sprint 5.1

- [ ] Formulario de instrumentos funciona en modo creación
- [ ] Formulario de instrumentos funciona en modo edición
- [ ] Validaciones se ejecutan correctamente
- [ ] Sesiones de formulario se crean y finalizan
- [ ] Cambios se logean en base de datos
- [ ] Tests de integración pasan
- [ ] Formulario antiguo mantiene compatibilidad (no se elimina aún)

---

### 7.2 Sprint 5.2: Rollout y Capacitación

**Duración:** 2-3 días

**Objetivo:** Desplegar sistema y capacitar usuarios.

#### Tareas:

**5.2.1: Documentación de usuario**

```markdown
# Guía de Usuario: Sistema de Formularios Dinámicos

## Introducción

El nuevo sistema de formularios ofrece:
- Validaciones en tiempo real
- Tracking de cambios
- Interfaz mejorada
- Mejor rendimiento

## Crear Nuevo Instrumento

1. Ir a **Instrumentos** > **Nuevo**
2. Completar secciones:
   - Identificación (obligatorio)
   - Información de Compañía (obligatorio)
   - Clasificación (opcional)
   - Detalles Adicionales (opcional)
3. Las validaciones se ejecutan automáticamente
4. Clic en **Guardar**

## Editar Instrumento Existente

1. Buscar instrumento en lista
2. Clic en botón **Editar**
3. Modificar campos necesarios
4. Los cambios se guardan automáticamente
5. Clic en **Guardar** para confirmar

## Validaciones

- **Campos rojos**: Error de validación
- **Mensaje bajo el campo**: Descripción del error
- **Submit bloqueado**: Si hay errores pendientes

## FAQs

**¿Qué pasa si salgo sin guardar?**
Se mostrará una alerta de confirmación.

**¿Puedo ver el historial de cambios?**
Sí, próximamente en la sección de auditoría.
```

**5.2.2: Plan de rollout**

```markdown
# Plan de Rollout: Formularios Dinámicos

## Fase 1: Beta Interno (Semana 1)
- Desplegar en entorno de staging
- Pruebas con usuarios beta (3-5 usuarios)
- Recopilar feedback
- Ajustes menores

## Fase 2: Rollout Gradual (Semana 2)
- 25% de usuarios (formulario nuevo por defecto)
- 75% de usuarios (formulario antiguo, con opción de probar nuevo)
- Monitorear métricas:
  - Tasa de error
  - Tiempo de completación
  - Satisfacción del usuario

## Fase 3: Rollout Completo (Semana 3)
- 100% de usuarios migrados
- Formulario antiguo disponible como fallback
- Monitoring 24/7

## Fase 4: Deprecación Formulario Antiguo (Semana 4)
- Remover código antiguo
- Cleanup de dependencias
- Documentación final
```

**5.2.3: Métricas de éxito**

```javascript
// server/services/metricsService.js
const { getPool, sql } = require('../config/database');

class MetricsService {
  /**
   * Métricas de adopción
   */
  async getAdoptionMetrics(fechaDesde, fechaHasta) {
    const pool = await getPool();

    const result = await pool.request()
      .input('fechaDesde', sql.DateTime, fechaDesde)
      .input('fechaHasta', sql.DateTime, fechaHasta)
      .query(`
        SELECT
          COUNT(DISTINCT ID_Sesion) as totalSesiones,
          COUNT(DISTINCT Usuario) as usuariosUnicos,
          AVG(CAST(Duracion_Ms AS FLOAT) / 1000) as duracionPromedio,
          SUM(CASE WHEN Estado = 'COMPLETADO' THEN 1 ELSE 0 END) as sesionesExitosas,
          SUM(CASE WHEN Estado = 'ERROR' THEN 1 ELSE 0 END) as sesionesConError
        FROM logs.Sesiones_Formulario
        WHERE FechaInicio >= @fechaDesde AND FechaInicio <= @fechaHasta
      `);

    return result.recordset[0];
  }

  /**
   * Errores más comunes
   */
  async getCommonErrors(limit = 10) {
    const pool = await getPool();

    const result = await pool.request()
      .input('limit', sql.Int, limit)
      .query(`
        SELECT TOP (@limit)
          Tipo_Validacion,
          Campo,
          COUNT(*) as frecuencia
        FROM logs.Validaciones_Ejecutadas
        WHERE Resultado = 0
        GROUP BY Tipo_Validacion, Campo
        ORDER BY COUNT(*) DESC
      `);

    return result.recordset;
  }
}

module.exports = new MetricsService();
```

#### Criterios de Aceptación Sprint 5.2

- [ ] Documentación de usuario completa
- [ ] Plan de rollout definido y aprobado
- [ ] Métricas de éxito implementadas
- [ ] Dashboard de monitoreo creado
- [ ] Capacitación realizada
- [ ] Sistema desplegado en producción
- [ ] Feedback inicial recopilado

---

## 8. Estrategia de Testing

### 8.1 Tests Unitarios

**Cobertura objetivo:** >90%

**Herramientas:**
- Backend: Jest + Supertest
- Frontend: Jest + React Testing Library

**Áreas críticas:**
- Validadores (cada uno con suite completa)
- FormConfigService (carga y cache)
- ValidationService (todos los escenarios)
- useDynamicForm hook (estados y transiciones)
- Componentes React (rendering y eventos)

### 8.2 Tests de Integración

**Escenarios:**
1. Flujo completo de creación de instrumento
2. Flujo completo de edición de instrumento
3. Validaciones asíncronas (duplicados)
4. Tracking de sesión completo
5. Manejo de errores y rollback

### 8.3 Tests End-to-End (E2E)

**Herramienta:** Playwright

```javascript
// e2e/instrumentos-form.spec.js
import { test, expect } from '@playwright/test';

test('crear instrumento completo', async ({ page }) => {
  await page.goto('/instrumentos/nuevo');

  // Llenar identificación
  await page.fill('[name="nombreFuente"]', 'Test Instrument E2E');
  await page.selectOption('[name="subId"]', '1');

  // Llenar compañía
  await page.fill('[name="companyName"]', 'Test Corp E2E');
  await page.fill('[name="companyTickerSymbol"]', 'TEST');

  // Submit
  await page.click('button:has-text("Guardar")');

  // Verificar redirección y mensaje
  await expect(page).toHaveURL('/instrumentos');
  await expect(page.locator('.success-message')).toContainText('creado exitosamente');
});
```

---

## 9. Rollout y Deployment

### 9.1 Checklist Pre-Deployment

- [ ] Todas las migraciones de BD ejecutadas
- [ ] Tests unitarios >90% coverage
- [ ] Tests de integración pasando
- [ ] Tests E2E pasando
- [ ] Documentación completa
- [ ] Configuración YAML validada
- [ ] Backup de BD realizado
- [ ] Plan de rollback preparado

### 9.2 Deployment Steps

```bash
# 1. Backup de BD
sqlcmd -S server -d MonedaHomologacion -Q "BACKUP DATABASE..."

# 2. Ejecutar migraciones
npm run migrate:up

# 3. Desplegar backend
npm run build
pm2 reload app

# 4. Desplegar frontend
npm run build:frontend
# Copiar a servidor web

# 5. Verificar health checks
curl https://api.domain.com/health
```

### 9.3 Monitoreo Post-Deployment

**Métricas a monitorear (primeras 48h):**
- Tasa de error de API (<1%)
- Tiempo de respuesta (<500ms p95)
- Tasa de éxito de formularios (>95%)
- Errores de validación (baseline)
- Quejas de usuarios (0 críticas)

---

## 10. Resumen y Próximos Pasos

### 10.1 Resumen del Plan

**Total estimado:** 20-25 días de desarrollo

**Fases:**
1. ✅ Infraestructura Base (6-8 días)
2. ✅ Sistema de Configuración (3-4 días)
3. ✅ Motor de Validaciones (4-5 días)
4. ✅ Componentes Dinámicos (5-6 días)
5. ✅ Integración y Migración (5-6 días)

### 10.2 Próximos Pasos (Futuro)

**V2.0 - Sistema de Autenticación**
- Integrar con Active Directory / OAuth
- Roles y permisos por formulario
- Audit trail completo

**V2.1 - Workflow de Aprobaciones**
- Multi-nivel de aprobación
- Notificaciones automáticas
- Dashboard de aprobadores

**V2.2 - Versionado de Registros**
- SQL Server Temporal Tables
- Historial completo de cambios
- Restauración de versiones anteriores

**V2.3 - Integraciones Avanzadas**
- Export a Excel/PDF
- Import masivo desde CSV
- API pública para integraciones

---

## Fin del Plan de Implementación

**Fecha de creación:** 2025-12-22
**Última actualización:** 2025-12-22
**Versión:** 1.0.0
**Estado:** Completo y listo para ejecución
