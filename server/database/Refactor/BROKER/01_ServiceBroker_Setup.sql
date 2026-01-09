/*
================================================================================
SCRIPT: Instalacion de Service Broker para Pipeline ETL
Base de datos: INTELIGENCIA_PRODUCTO_FULLSTACK
Version: 1.0
Fecha: 2026-01-08

DESCRIPCION:
Este script configura Service Broker para comunicacion push desde la DB
hacia el backend Node.js. Cada SP del pipeline emitira eventos que el
backend recibira via WAITFOR RECEIVE en tiempo real.

ARQUITECTURA:
  DB (SPs) --> Service Broker Queue --> Backend (WAITFOR RECEIVE) --> WebSocket --> Frontend

EJECUCION:
  Ejecutar en INTELIGENCIA_PRODUCTO_FULLSTACK con permisos de sysadmin
================================================================================
*/

USE INTELIGENCIA_PRODUCTO_FULLSTACK;
GO

PRINT '========================================';
PRINT 'INSTALACION SERVICE BROKER - INICIO';
PRINT '========================================';
PRINT '';

-- ============================================================================
-- PASO 1: Habilitar Service Broker en la base de datos
-- ============================================================================
PRINT 'Paso 1: Verificando Service Broker...';

IF NOT EXISTS (SELECT 1 FROM sys.databases WHERE name = DB_NAME() AND is_broker_enabled = 1)
BEGIN
    PRINT '  -> Service Broker NO habilitado. Habilitando...';

    -- Requiere modo single user temporalmente
    ALTER DATABASE INTELIGENCIA_PRODUCTO_FULLSTACK SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
    ALTER DATABASE INTELIGENCIA_PRODUCTO_FULLSTACK SET ENABLE_BROKER WITH ROLLBACK IMMEDIATE;
    ALTER DATABASE INTELIGENCIA_PRODUCTO_FULLSTACK SET MULTI_USER;

    PRINT '  -> Service Broker HABILITADO exitosamente';
END
ELSE
BEGIN
    PRINT '  -> Service Broker ya estaba habilitado';
END
GO

-- ============================================================================
-- PASO 2: Crear esquema [broker] para objetos de Service Broker
-- ============================================================================
PRINT '';
PRINT 'Paso 2: Creando esquema [broker]...';

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'broker')
BEGIN
    EXEC('CREATE SCHEMA broker');
    PRINT '  -> Esquema [broker] creado';
END
ELSE
BEGIN
    PRINT '  -> Esquema [broker] ya existe';
END
GO

-- ============================================================================
-- PASO 3: Crear MESSAGE TYPE
-- Validacion NONE porque validamos JSON en la aplicacion
-- ============================================================================
PRINT '';
PRINT 'Paso 3: Creando MESSAGE TYPE...';

IF NOT EXISTS (SELECT 1 FROM sys.service_message_types WHERE name = '//ETL/Pipeline/EventMessage')
BEGIN
    CREATE MESSAGE TYPE [//ETL/Pipeline/EventMessage]
        VALIDATION = NONE;
    PRINT '  -> MESSAGE TYPE [//ETL/Pipeline/EventMessage] creado';
END
ELSE
BEGIN
    PRINT '  -> MESSAGE TYPE ya existe';
END
GO

-- ============================================================================
-- PASO 4: Crear CONTRACT
-- Define que el iniciador (SPs) puede enviar mensajes
-- ============================================================================
PRINT '';
PRINT 'Paso 4: Creando CONTRACT...';

IF NOT EXISTS (SELECT 1 FROM sys.service_contracts WHERE name = '//ETL/Pipeline/EventContract')
BEGIN
    CREATE CONTRACT [//ETL/Pipeline/EventContract]
    (
        [//ETL/Pipeline/EventMessage] SENT BY INITIATOR
    );
    PRINT '  -> CONTRACT [//ETL/Pipeline/EventContract] creado';
END
ELSE
BEGIN
    PRINT '  -> CONTRACT ya existe';
END
GO

-- ============================================================================
-- PASO 5: Crear QUEUE
-- Cola donde se acumulan los mensajes para el backend
-- ACTIVATION OFF: el backend hace polling con WAITFOR RECEIVE
-- RETENTION OFF: mensajes se eliminan despues de ser recibidos
-- ============================================================================
PRINT '';
PRINT 'Paso 5: Creando QUEUE...';

IF NOT EXISTS (SELECT 1 FROM sys.service_queues WHERE name = 'ETLEventQueue' AND schema_id = SCHEMA_ID('broker'))
BEGIN
    CREATE QUEUE [broker].[ETLEventQueue]
        WITH
            STATUS = ON,
            RETENTION = OFF,
            ACTIVATION (STATUS = OFF),
            POISON_MESSAGE_HANDLING (STATUS = OFF);
    PRINT '  -> QUEUE [broker].[ETLEventQueue] creada';
END
ELSE
BEGIN
    -- Asegurar que la cola esta activa
    ALTER QUEUE [broker].[ETLEventQueue] WITH STATUS = ON;
    PRINT '  -> QUEUE ya existe, status verificado';
END
GO

-- ============================================================================
-- PASO 6: Crear SERVICE
-- Endpoint para enviar/recibir mensajes
-- ============================================================================
PRINT '';
PRINT 'Paso 6: Creando SERVICE...';

IF NOT EXISTS (SELECT 1 FROM sys.services WHERE name = '//ETL/Pipeline/NotificationService')
BEGIN
    CREATE SERVICE [//ETL/Pipeline/NotificationService]
        ON QUEUE [broker].[ETLEventQueue]
        ([//ETL/Pipeline/EventContract]);
    PRINT '  -> SERVICE [//ETL/Pipeline/NotificationService] creado';
END
ELSE
BEGIN
    PRINT '  -> SERVICE ya existe';
END
GO

-- ============================================================================
-- PASO 7: Crear tablas de soporte
-- ============================================================================
PRINT '';
PRINT 'Paso 7: Creando tablas de soporte...';

-- 7.1 Tabla de conversaciones activas
-- Una conversacion por ID_Proceso para reutilizar dialogos
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'ActiveConversations' AND schema_id = SCHEMA_ID('broker'))
BEGIN
    CREATE TABLE broker.ActiveConversations (
        ID INT IDENTITY(1,1) PRIMARY KEY,
        ID_Proceso BIGINT NOT NULL,
        ConversationHandle UNIQUEIDENTIFIER NOT NULL,
        Estado NVARCHAR(20) NOT NULL DEFAULT 'ACTIVO',
        FechaCreacion DATETIME NOT NULL DEFAULT GETDATE(),
        FechaUltimoMensaje DATETIME NULL,
        MensajesEnviados INT NOT NULL DEFAULT 0,

        CONSTRAINT UQ_ActiveConv_Handle UNIQUE (ConversationHandle),
        INDEX IX_ActiveConv_Proceso (ID_Proceso) WHERE Estado = 'ACTIVO',
        INDEX IX_ActiveConv_Fecha (FechaCreacion)
    );
    PRINT '  -> Tabla [broker].[ActiveConversations] creada';
END
ELSE
BEGIN
    PRINT '  -> Tabla ActiveConversations ya existe';
END
GO

-- 7.2 Tabla de log de eventos (auditoria)
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'EventLog' AND schema_id = SCHEMA_ID('broker'))
BEGIN
    CREATE TABLE broker.EventLog (
        ID BIGINT IDENTITY(1,1) PRIMARY KEY,
        MessageId UNIQUEIDENTIFIER NOT NULL,
        TipoEvento NVARCHAR(50) NOT NULL,
        ID_Ejecucion BIGINT NULL,
        ID_Proceso BIGINT NULL,
        ID_Fund INT NULL,
        NombreSP NVARCHAR(128) NULL,
        CodigoRetorno INT NULL,
        FechaEnvio DATETIME NOT NULL DEFAULT GETDATE(),

        INDEX IX_EventLog_Ejecucion (ID_Ejecucion, FechaEnvio DESC),
        INDEX IX_EventLog_Proceso (ID_Proceso, FechaEnvio DESC),
        INDEX IX_EventLog_Fecha (FechaEnvio DESC)
    );
    PRINT '  -> Tabla [broker].[EventLog] creada';
END
ELSE
BEGIN
    PRINT '  -> Tabla EventLog ya existe';
END
GO

-- 7.3 Tabla de errores de Service Broker
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'ErrorLog' AND schema_id = SCHEMA_ID('broker'))
BEGIN
    CREATE TABLE broker.ErrorLog (
        ID BIGINT IDENTITY(1,1) PRIMARY KEY,
        Timestamp DATETIME NOT NULL DEFAULT GETDATE(),
        Procedimiento NVARCHAR(128) NULL,
        ErrorNumber INT NULL,
        ErrorMessage NVARCHAR(MAX) NULL,
        ID_Ejecucion BIGINT NULL,
        ID_Proceso BIGINT NULL,
        ID_Fund INT NULL,

        INDEX IX_ErrorLog_Fecha (Timestamp DESC)
    );
    PRINT '  -> Tabla [broker].[ErrorLog] creada';
END
ELSE
BEGIN
    PRINT '  -> Tabla ErrorLog ya existe';
END
GO

-- ============================================================================
-- PASO 8: Verificacion final
-- ============================================================================
PRINT '';
PRINT '========================================';
PRINT 'VERIFICACION DE INSTALACION';
PRINT '========================================';
PRINT '';

-- Verificar Service Broker habilitado
SELECT
    'Service Broker Habilitado' AS Verificacion,
    CASE WHEN is_broker_enabled = 1 THEN 'SI' ELSE 'NO' END AS Estado
FROM sys.databases
WHERE name = DB_NAME();

-- Listar objetos creados
SELECT 'MESSAGE TYPE' AS TipoObjeto, name AS Nombre, NULL AS Esquema
FROM sys.service_message_types
WHERE name LIKE '%ETL%'
UNION ALL
SELECT 'CONTRACT', name, NULL
FROM sys.service_contracts
WHERE name LIKE '%ETL%'
UNION ALL
SELECT 'QUEUE', name, SCHEMA_NAME(schema_id)
FROM sys.service_queues
WHERE name LIKE '%ETL%'
UNION ALL
SELECT 'SERVICE', name, NULL
FROM sys.services
WHERE name LIKE '%ETL%';

-- Listar tablas creadas
SELECT 'TABLA' AS TipoObjeto, s.name + '.' + t.name AS Nombre
FROM sys.tables t
INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
WHERE s.name = 'broker';

PRINT '';
PRINT '========================================';
PRINT 'INSTALACION SERVICE BROKER - COMPLETADA';
PRINT '========================================';
PRINT '';
PRINT 'SIGUIENTE PASO: Ejecutar 02_sp_EmitirEvento.sql';
GO
