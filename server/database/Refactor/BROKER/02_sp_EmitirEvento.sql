/*
================================================================================
SP: broker.sp_EmitirEvento
Version: 1.0
Fecha: 2026-01-08

DESCRIPCION:
Helper centralizado para emitir eventos via Service Broker.
Todos los SPs del pipeline llaman a este procedimiento para notificar
al backend sobre inicio, fin, errores y cambios de estado.

PARAMETROS:
  @TipoEvento      - SP_INICIO, SP_FIN, ERROR, STANDBY, PROCESO_INICIO, PROCESO_FIN
  @ID_Ejecucion    - ID de la ejecucion global
  @ID_Proceso      - ID del proceso (para agrupar conversaciones)
  @ID_Fund         - ID del fondo (NULL para eventos de proceso)
  @NombreSP        - Nombre del SP que emite el evento
  @CodigoRetorno   - Codigo de retorno (0, 1, 2, 3, 5-18)
  @Detalles        - JSON con detalles adicionales (opcional)
  @DuracionMs      - Duracion en milisegundos (para SP_FIN)
  @RowsProcessed   - Filas procesadas (para SP_FIN)

NOTAS DE RENDIMIENTO:
  - Reutiliza conversation_handle por ID_Proceso
  - No bloquea el SP llamador (fire-and-forget)
  - En caso de error, registra en logs pero NO falla

EJEMPLO DE USO:
  -- Al inicio de un SP:
  EXEC broker.sp_EmitirEvento
      @TipoEvento = 'SP_INICIO',
      @ID_Ejecucion = @ID_Ejecucion,
      @ID_Proceso = @ID_Proceso,
      @ID_Fund = @ID_Fund,
      @NombreSP = 'sp_Process_IPA';

  -- Al final exitoso:
  EXEC broker.sp_EmitirEvento
      @TipoEvento = 'SP_FIN',
      @ID_Ejecucion = @ID_Ejecucion,
      @ID_Proceso = @ID_Proceso,
      @ID_Fund = @ID_Fund,
      @NombreSP = 'sp_Process_IPA',
      @CodigoRetorno = 0,
      @DuracionMs = 5333,
      @RowsProcessed = 1500;
================================================================================
*/

USE INTELIGENCIA_PRODUCTO_FULLSTACK;
GO

CREATE OR ALTER PROCEDURE [broker].[sp_EmitirEvento]
    @TipoEvento NVARCHAR(50),
    @ID_Ejecucion BIGINT,
    @ID_Proceso BIGINT,
    @ID_Fund INT = NULL,
    @NombreSP NVARCHAR(128),
    @CodigoRetorno INT = 0,
    @Detalles NVARCHAR(MAX) = NULL,
    @DuracionMs INT = NULL,
    @RowsProcessed INT = NULL
AS
BEGIN
    SET NOCOUNT ON;

    -- ========================================================================
    -- Variables locales
    -- ========================================================================
    DECLARE @ConversationHandle UNIQUEIDENTIFIER;
    DECLARE @MessageBody NVARCHAR(MAX);
    DECLARE @MessageId UNIQUEIDENTIFIER = NEWID();
    DECLARE @Timestamp NVARCHAR(30) = FORMAT(SYSUTCDATETIME(), 'yyyy-MM-ddTHH:mm:ss.fffZ');
    DECLARE @Estado NVARCHAR(30);
    DECLARE @TipoProblema NVARCHAR(50) = NULL;

    -- ========================================================================
    -- Determinar estado basado en codigo de retorno
    -- ========================================================================
    SET @Estado = CASE @CodigoRetorno
        WHEN 0 THEN 'OK'
        WHEN 1 THEN 'WARNING'
        WHEN 2 THEN 'RETRY'
        WHEN 3 THEN 'ERROR_CRITICO'
        WHEN 5 THEN 'STANDBY_SUCIEDADES'
        WHEN 6 THEN 'STANDBY_HOMOLOGACION_INSTRUMENTOS'
        WHEN 7 THEN 'STANDBY_DESCUADRE_CAPM'
        WHEN 8 THEN 'STANDBY_DESCUADRE_DERIVADOS'
        WHEN 9 THEN 'STANDBY_DESCUADRE_NAV'
        WHEN 10 THEN 'STANDBY_HOMOLOGACION_FONDOS'
        WHEN 11 THEN 'STANDBY_HOMOLOGACION_MONEDAS'
        WHEN 12 THEN 'STANDBY_HOMOLOGACION_BENCHMARKS'
        WHEN 13 THEN 'STANDBY_EXTRACT_IPA_FALTANTE'
        WHEN 14 THEN 'STANDBY_EXTRACT_CAPM_FALTANTE'
        WHEN 15 THEN 'STANDBY_EXTRACT_SONA_FALTANTE'
        WHEN 16 THEN 'STANDBY_EXTRACT_PNL_FALTANTE'
        WHEN 17 THEN 'STANDBY_EXTRACT_DERIVADOS_FALTANTE'
        WHEN 18 THEN 'STANDBY_EXTRACT_POSMODRF_FALTANTE'
        ELSE 'DESCONOCIDO'
    END;

    -- Tipo de problema para stand-by
    IF @CodigoRetorno BETWEEN 5 AND 18
        SET @TipoProblema = @Estado;

    BEGIN TRY
        -- ====================================================================
        -- Obtener o crear conversation handle para este proceso
        -- Patron: Una conversacion por ID_Proceso (reutilizable)
        -- ====================================================================
        SELECT @ConversationHandle = ConversationHandle
        FROM broker.ActiveConversations WITH (NOLOCK)
        WHERE ID_Proceso = @ID_Proceso
          AND Estado = 'ACTIVO';

        IF @ConversationHandle IS NULL
        BEGIN
            -- Crear nueva conversacion
            BEGIN DIALOG @ConversationHandle
                FROM SERVICE [//ETL/Pipeline/NotificationService]
                TO SERVICE '//ETL/Pipeline/NotificationService'
                ON CONTRACT [//ETL/Pipeline/EventContract]
                WITH ENCRYPTION = OFF, LIFETIME = 3600;  -- 1 hora

            -- Registrar conversacion activa
            INSERT INTO broker.ActiveConversations (ID_Proceso, ConversationHandle, Estado, FechaCreacion)
            VALUES (@ID_Proceso, @ConversationHandle, 'ACTIVO', GETDATE());
        END

        -- ====================================================================
        -- Construir mensaje JSON
        -- Estructura estandar para todos los eventos
        -- ====================================================================
        SET @MessageBody = (
            SELECT
                @MessageId AS MessageId,
                @TipoEvento AS MessageType,
                @Timestamp AS [Timestamp],
                '1.0' AS [Version],
                (
                    SELECT
                        @ID_Ejecucion AS ID_Ejecucion,
                        @ID_Proceso AS ID_Proceso,
                        @ID_Fund AS ID_Fund,
                        @NombreSP AS NombreSP,
                        @CodigoRetorno AS CodigoRetorno,
                        @Estado AS Estado,
                        @DuracionMs AS DuracionMs,
                        @RowsProcessed AS RowsProcessed,
                        @TipoProblema AS TipoProblema,
                        JSON_QUERY(ISNULL(@Detalles, '{}')) AS Detalles
                    FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
                ) AS Payload
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        );

        -- ====================================================================
        -- Enviar mensaje a la cola
        -- ====================================================================
        SEND ON CONVERSATION @ConversationHandle
            MESSAGE TYPE [//ETL/Pipeline/EventMessage]
            (@MessageBody);

        -- ====================================================================
        -- Actualizar estadisticas de la conversacion
        -- ====================================================================
        UPDATE broker.ActiveConversations
        SET FechaUltimoMensaje = GETDATE(),
            MensajesEnviados = MensajesEnviados + 1
        WHERE ConversationHandle = @ConversationHandle;

        -- ====================================================================
        -- Log de auditoria
        -- ====================================================================
        INSERT INTO broker.EventLog (
            MessageId, TipoEvento, ID_Ejecucion, ID_Proceso, ID_Fund, NombreSP, CodigoRetorno, FechaEnvio
        )
        VALUES (
            @MessageId, @TipoEvento, @ID_Ejecucion, @ID_Proceso, @ID_Fund, @NombreSP, @CodigoRetorno, GETDATE()
        );

    END TRY
    BEGIN CATCH
        -- ====================================================================
        -- NO lanzar error - logging silencioso
        -- El pipeline NO debe fallar por problemas de notificacion
        -- ====================================================================
        INSERT INTO broker.ErrorLog (
            Timestamp,
            Procedimiento,
            ErrorNumber,
            ErrorMessage,
            ID_Ejecucion,
            ID_Proceso,
            ID_Fund
        )
        VALUES (
            GETDATE(),
            'sp_EmitirEvento',
            ERROR_NUMBER(),
            ERROR_MESSAGE(),
            @ID_Ejecucion,
            @ID_Proceso,
            @ID_Fund
        );
    END CATCH
END;
GO

-- ============================================================================
-- SP auxiliar: Finalizar conversacion de un proceso
-- Llamar al terminar un proceso completo
-- ============================================================================
CREATE OR ALTER PROCEDURE [broker].[sp_FinalizarConversacionProceso]
    @ID_Proceso BIGINT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @ConversationHandle UNIQUEIDENTIFIER;

    SELECT @ConversationHandle = ConversationHandle
    FROM broker.ActiveConversations
    WHERE ID_Proceso = @ID_Proceso AND Estado = 'ACTIVO';

    IF @ConversationHandle IS NOT NULL
    BEGIN
        BEGIN TRY
            END CONVERSATION @ConversationHandle;

            UPDATE broker.ActiveConversations
            SET Estado = 'CERRADO'
            WHERE ConversationHandle = @ConversationHandle;
        END TRY
        BEGIN CATCH
            -- Forzar cleanup si hay error
            BEGIN TRY
                END CONVERSATION @ConversationHandle WITH CLEANUP;
            END TRY
            BEGIN CATCH
                -- Ignorar
            END CATCH

            UPDATE broker.ActiveConversations
            SET Estado = 'ERROR'
            WHERE ConversationHandle = @ConversationHandle;
        END CATCH
    END
END;
GO

PRINT '';
PRINT '========================================';
PRINT 'SP sp_EmitirEvento CREADO';
PRINT 'SP sp_FinalizarConversacionProceso CREADO';
PRINT '========================================';
PRINT '';
PRINT 'SIGUIENTE PASO: Ejecutar 03_sp_CleanupConversations.sql';
GO
