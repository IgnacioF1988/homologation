/*
================================================================================
SP: broker.sp_CleanupConversations
Version: 1.0
Fecha: 2026-01-08

DESCRIPCION:
Limpia conversaciones de Service Broker que han expirado o quedaron huerfanas.
Debe ejecutarse periodicamente via SQL Agent Job (recomendado: cada hora).

PARAMETROS:
  @MaxAgeHours - Antigüedad maxima en horas para conversaciones activas (default: 2)

PROCESO:
  1. Cierra conversaciones activas mas antiguas que @MaxAgeHours
  2. Limpia mensajes huerfanos de la cola
  3. Reporta cantidad de conversaciones limpiadas
================================================================================
*/

USE INTELIGENCIA_PRODUCTO_FULLSTACK;
GO

CREATE OR ALTER PROCEDURE [broker].[sp_CleanupConversations]
    @MaxAgeHours INT = 2
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @ConversationHandle UNIQUEIDENTIFIER;
    DECLARE @CleanupCount INT = 0;
    DECLARE @OrphanCount INT = 0;

    PRINT 'Iniciando limpieza de conversaciones Service Broker...';
    PRINT 'Antigüedad maxima: ' + CAST(@MaxAgeHours AS NVARCHAR(10)) + ' horas';

    -- ========================================================================
    -- PASO 1: Cerrar conversaciones viejas
    -- ========================================================================
    DECLARE cleanup_cursor CURSOR LOCAL FAST_FORWARD FOR
        SELECT ConversationHandle
        FROM broker.ActiveConversations
        WHERE Estado = 'ACTIVO'
          AND FechaCreacion < DATEADD(HOUR, -@MaxAgeHours, GETDATE());

    OPEN cleanup_cursor;
    FETCH NEXT FROM cleanup_cursor INTO @ConversationHandle;

    WHILE @@FETCH_STATUS = 0
    BEGIN
        BEGIN TRY
            END CONVERSATION @ConversationHandle WITH CLEANUP;

            UPDATE broker.ActiveConversations
            SET Estado = 'LIMPIADO'
            WHERE ConversationHandle = @ConversationHandle;

            SET @CleanupCount = @CleanupCount + 1;
        END TRY
        BEGIN CATCH
            -- Si falla, marcar como error pero continuar
            UPDATE broker.ActiveConversations
            SET Estado = 'ERROR_CLEANUP'
            WHERE ConversationHandle = @ConversationHandle;
        END CATCH

        FETCH NEXT FROM cleanup_cursor INTO @ConversationHandle;
    END

    CLOSE cleanup_cursor;
    DEALLOCATE cleanup_cursor;

    PRINT 'Conversaciones cerradas: ' + CAST(@CleanupCount AS NVARCHAR(10));

    -- ========================================================================
    -- PASO 2: Limpiar mensajes huerfanos de la cola
    -- Mensajes cuya conversacion ya no existe en ActiveConversations
    -- ========================================================================
    DECLARE @EmptyConversation UNIQUEIDENTIFIER;
    DECLARE @MessageBody VARBINARY(MAX);

    -- Recibir hasta 1000 mensajes huerfanos
    WHILE @OrphanCount < 1000
    BEGIN
        BEGIN TRY
            WAITFOR (
                RECEIVE TOP(1)
                    @EmptyConversation = conversation_handle,
                    @MessageBody = message_body
                FROM [broker].[ETLEventQueue]
            ), TIMEOUT 100;  -- 100ms timeout

            IF @EmptyConversation IS NULL
                BREAK;  -- No hay mas mensajes

            -- Verificar si la conversacion existe
            IF NOT EXISTS (
                SELECT 1 FROM broker.ActiveConversations
                WHERE ConversationHandle = @EmptyConversation AND Estado = 'ACTIVO'
            )
            BEGIN
                -- Cerrar conversacion huerfana
                BEGIN TRY
                    END CONVERSATION @EmptyConversation WITH CLEANUP;
                END TRY
                BEGIN CATCH
                    -- Ignorar errores de cierre
                END CATCH

                SET @OrphanCount = @OrphanCount + 1;
            END
        END TRY
        BEGIN CATCH
            BREAK;  -- Salir del loop si hay error
        END CATCH
    END

    IF @OrphanCount > 0
        PRINT 'Mensajes huerfanos limpiados: ' + CAST(@OrphanCount AS NVARCHAR(10));

    -- ========================================================================
    -- PASO 3: Limpiar registros antiguos de EventLog (opcional)
    -- Mantener solo ultimos 7 dias
    -- ========================================================================
    DECLARE @EventLogDeleted INT;

    DELETE FROM broker.EventLog
    WHERE FechaEnvio < DATEADD(DAY, -7, GETDATE());

    SET @EventLogDeleted = @@ROWCOUNT;

    IF @EventLogDeleted > 0
        PRINT 'Registros de EventLog eliminados (>7 dias): ' + CAST(@EventLogDeleted AS NVARCHAR(10));

    -- ========================================================================
    -- PASO 4: Limpiar registros antiguos de ErrorLog
    -- Mantener solo ultimos 30 dias
    -- ========================================================================
    DECLARE @ErrorLogDeleted INT;

    DELETE FROM broker.ErrorLog
    WHERE Timestamp < DATEADD(DAY, -30, GETDATE());

    SET @ErrorLogDeleted = @@ROWCOUNT;

    IF @ErrorLogDeleted > 0
        PRINT 'Registros de ErrorLog eliminados (>30 dias): ' + CAST(@ErrorLogDeleted AS NVARCHAR(10));

    -- ========================================================================
    -- Resumen final
    -- ========================================================================
    PRINT '';
    PRINT '========================================';
    PRINT 'RESUMEN DE LIMPIEZA';
    PRINT '========================================';
    PRINT 'Conversaciones cerradas: ' + CAST(@CleanupCount AS NVARCHAR(10));
    PRINT 'Mensajes huerfanos: ' + CAST(@OrphanCount AS NVARCHAR(10));
    PRINT 'EventLog eliminados: ' + CAST(@EventLogDeleted AS NVARCHAR(10));
    PRINT 'ErrorLog eliminados: ' + CAST(@ErrorLogDeleted AS NVARCHAR(10));
    PRINT '========================================';
END;
GO

-- ============================================================================
-- Vista para monitorear estado de Service Broker
-- ============================================================================
CREATE OR ALTER VIEW [broker].[vw_ServiceBrokerStatus]
AS
SELECT
    (SELECT COUNT(*) FROM broker.ActiveConversations WHERE Estado = 'ACTIVO') AS ConversacionesActivas,
    (SELECT COUNT(*) FROM broker.ActiveConversations WHERE Estado = 'CERRADO') AS ConversacionesCerradas,
    (SELECT COUNT(*) FROM broker.ActiveConversations WHERE Estado LIKE 'ERROR%') AS ConversacionesError,
    (SELECT COUNT(*) FROM [broker].[ETLEventQueue]) AS MensajesEnCola,
    (SELECT COUNT(*) FROM broker.EventLog WHERE FechaEnvio >= DATEADD(HOUR, -1, GETDATE())) AS EventosUltimaHora,
    (SELECT COUNT(*) FROM broker.ErrorLog WHERE Timestamp >= DATEADD(HOUR, -1, GETDATE())) AS ErroresUltimaHora,
    (SELECT MAX(FechaEnvio) FROM broker.EventLog) AS UltimoEvento,
    (SELECT is_receive_enabled FROM sys.service_queues WHERE name = 'ETLEventQueue') AS ColaHabilitada;
GO

PRINT '';
PRINT '========================================';
PRINT 'SP sp_CleanupConversations CREADO';
PRINT 'Vista vw_ServiceBrokerStatus CREADA';
PRINT '========================================';
PRINT '';
PRINT 'Para monitorear Service Broker:';
PRINT '  SELECT * FROM broker.vw_ServiceBrokerStatus;';
PRINT '';
PRINT 'Para ejecutar limpieza manual:';
PRINT '  EXEC broker.sp_CleanupConversations @MaxAgeHours = 2;';
GO
