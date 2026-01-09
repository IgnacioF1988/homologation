/*
================================================================================
SP: staging.sp_Process_Fund_Complete
Descripcion: Orquestador del pipeline ETL para un fondo.
             Ejecuta secuencialmente todos los SPs del pipeline y emite
             eventos Service Broker para monitoreo en tiempo real.

Flujo:
  1. sp_ValidateFund      - Validar datos y homologaciones
  2. sp_Process_IPA       - Procesar Investment Position Appraisal
  3. sp_Process_CAPM      - Procesar Cash Appraisal (si requerido)
  4. sp_Process_Derivados - Procesar Derivados (si requerido)
  5. sp_Process_SONA      - Validar vs NAV (si requerido)
  6. sp_Process_PNL       - Procesar Profit & Loss (si requerido)
  7. sp_Consolidar_Cubo   - Consolidar en CUBO_Final

Eventos Service Broker:
  - PIPELINE_INICIO: Al iniciar el pipeline
  - PIPELINE_PASO: Al iniciar cada paso del pipeline
  - PIPELINE_FIN: Al completar exitosamente
  - STANDBY: Cuando un SP retorna codigo de standby
  - ERROR: En caso de error critico

Codigos de retorno:
  0  = OK (pipeline completo)
  1  = WARNING (completo con advertencias)
  2+ = STANDBY/ERROR (codigo del SP que fallo)

Autor: Refactorizacion Pipeline IPA
Fecha: 2026-01-09
================================================================================
*/

CREATE OR ALTER PROCEDURE [staging].[sp_Process_Fund_Complete]
    @ID_Ejecucion BIGINT,
    @ID_Proceso BIGINT,
    @ID_Fund INT,
    @FechaReporte NVARCHAR(10),
    @Portfolio NVARCHAR(100) = NULL,
    @LimpiarTemporales BIT = 1,
    -- Outputs
    @ReturnCode INT OUTPUT,
    @ErrorMessage NVARCHAR(500) OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @RC INT;
    DECLARE @StartTime DATETIME = GETDATE();
    DECLARE @PasoActual NVARCHAR(50);
    DECLARE @DuracionMs INT;

    -- Variables para requisitos (desde config - FUENTE UNICA DE VERDAD)
    DECLARE @Req_IPA BIT, @Req_CAPM BIT, @Req_SONA BIT;
    DECLARE @Req_PNL BIT, @Req_Derivados BIT, @Req_PosModRF BIT;
    DECLARE @UsaDefault BIT;

    -- Variables para outputs de cada SP
    DECLARE @RowsProcessed INT, @RowsCash INT, @RowsMTM INT, @ErrorCount INT;
    DECLARE @TotalIPA_Cash DECIMAL(18,4), @TotalCAPM DECIMAL(18,4), @DiferenciaCAPM DECIMAL(18,4);
    DECLARE @TotalIPA_MTM DECIMAL(18,4), @TotalDeriv_MTM DECIMAL(18,4), @DiferenciaDeriv DECIMAL(18,4);
    DECLARE @TotalIPA DECIMAL(18,4), @TotalCAPM2 DECIMAL(18,4), @TotalDeriv DECIMAL(18,4);
    DECLARE @TotalAjustes DECIMAL(18,4), @TotalCalc DECIMAL(18,4), @TotalSONA DECIMAL(18,4), @DiferenciaSONA DECIMAL(18,4);
    DECLARE @AjusteCreado BIT, @AjustesCreados INT;
    DECLARE @RowsIPA INT, @RowsCAPM INT, @RowsDerivados INT, @RowsAjustes INT, @RowsFinal INT, @RowsCubo INT;

    -- Variables para sp_ValidateFund
    DECLARE @RegistrosIPA INT, @RegistrosCAPM INT, @RegistrosSONA INT;
    DECLARE @RegistrosPNL INT, @RegistrosDerivados INT;
    DECLARE @SuciedadesCount INT, @HomolFondosCount INT;
    DECLARE @HomolInstrumentosCount INT, @HomolMonedasCount INT;

    SET @ReturnCode = 0;
    SET @ErrorMessage = NULL;

    BEGIN TRY
        -- ═══════════════════════════════════════════════════════════════════
        -- EVENTO: PIPELINE_INICIO
        -- ═══════════════════════════════════════════════════════════════════
        EXEC broker.sp_EmitirEvento
            @TipoEvento = 'PIPELINE_INICIO',
            @ID_Ejecucion = @ID_Ejecucion,
            @ID_Proceso = @ID_Proceso,
            @ID_Fund = @ID_Fund,
            @NombreSP = 'staging.sp_Process_Fund_Complete';

        -- PASO 0: Obtener requisitos del fondo desde config
        SELECT
            @Req_IPA = Req_IPA,
            @Req_CAPM = Req_CAPM,
            @Req_SONA = Req_SONA,
            @Req_PNL = Req_PNL,
            @Req_Derivados = Req_Derivados,
            @Req_PosModRF = Req_PosModRF,
            @UsaDefault = UsaDefault
        FROM config.fn_GetRequisitosExtract(@ID_Fund);

        PRINT '════════════════════════════════════════════════════════════════';
        PRINT 'sp_Process_Fund_Complete: INICIO';
        PRINT 'ID_Ejecucion: ' + CAST(@ID_Ejecucion AS NVARCHAR(20));
        PRINT 'ID_Proceso: ' + CAST(@ID_Proceso AS NVARCHAR(10));
        PRINT 'ID_Fund: ' + CAST(@ID_Fund AS NVARCHAR(10));
        PRINT 'FechaReporte: ' + @FechaReporte;
        PRINT 'Configuracion' + CASE WHEN @UsaDefault = 1 THEN ' (defaults)' ELSE ' (custom)' END + ':';
        PRINT '  Req_IPA=' + CAST(@Req_IPA AS CHAR(1)) +
              ' Req_CAPM=' + CAST(@Req_CAPM AS CHAR(1)) +
              ' Req_SONA=' + CAST(@Req_SONA AS CHAR(1)) +
              ' Req_PNL=' + CAST(@Req_PNL AS CHAR(1)) +
              ' Req_Derivados=' + CAST(@Req_Derivados AS CHAR(1));
        PRINT '════════════════════════════════════════════════════════════════';

        -- ═══════════════════════════════════════════════════════════════════
        -- PASO 1: Validar fondo
        -- ═══════════════════════════════════════════════════════════════════
        SET @PasoActual = 'sp_ValidateFund';
        EXEC broker.sp_EmitirEvento
            @TipoEvento = 'PIPELINE_PASO',
            @ID_Ejecucion = @ID_Ejecucion,
            @ID_Proceso = @ID_Proceso,
            @ID_Fund = @ID_Fund,
            @NombreSP = 'staging.sp_Process_Fund_Complete',
            @Detalles = '{"paso": 1, "sp": "sp_ValidateFund", "estado": "iniciando"}';

        EXEC @RC = staging.sp_ValidateFund
            @ID_Ejecucion = @ID_Ejecucion,
            @ID_Proceso = @ID_Proceso,
            @ID_Fund = @ID_Fund,
            @FechaReporte = @FechaReporte,
            @ErrorMessage = @ErrorMessage OUTPUT,
            @RegistrosIPA = @RegistrosIPA OUTPUT,
            @RegistrosCAPM = @RegistrosCAPM OUTPUT,
            @RegistrosSONA = @RegistrosSONA OUTPUT,
            @RegistrosPNL = @RegistrosPNL OUTPUT,
            @RegistrosDerivados = @RegistrosDerivados OUTPUT,
            @SuciedadesCount = @SuciedadesCount OUTPUT,
            @HomolFondosCount = @HomolFondosCount OUTPUT,
            @HomolInstrumentosCount = @HomolInstrumentosCount OUTPUT,
            @HomolMonedasCount = @HomolMonedasCount OUTPUT;

        IF @RC NOT IN (0, 1)
        BEGIN
            SET @ReturnCode = @RC;
            -- El SP hijo ya emitio STANDBY, solo registramos en el orquestador
            EXEC broker.sp_EmitirEvento
                @TipoEvento = 'PIPELINE_FIN',
                @ID_Ejecucion = @ID_Ejecucion,
                @ID_Proceso = @ID_Proceso,
                @ID_Fund = @ID_Fund,
                @NombreSP = 'staging.sp_Process_Fund_Complete',
                @CodigoRetorno = @RC,
                @Detalles = '{"pasoFallido": "sp_ValidateFund", "motivo": "validacion"}';
            RETURN @RC;
        END

        -- ═══════════════════════════════════════════════════════════════════
        -- PASO 2: Procesar IPA (siempre requerido)
        -- ═══════════════════════════════════════════════════════════════════
        SET @PasoActual = 'sp_Process_IPA';
        EXEC broker.sp_EmitirEvento
            @TipoEvento = 'PIPELINE_PASO',
            @ID_Ejecucion = @ID_Ejecucion,
            @ID_Proceso = @ID_Proceso,
            @ID_Fund = @ID_Fund,
            @NombreSP = 'staging.sp_Process_Fund_Complete',
            @Detalles = '{"paso": 2, "sp": "sp_Process_IPA", "estado": "iniciando"}';

        EXEC @RC = staging.sp_Process_IPA
            @ID_Ejecucion = @ID_Ejecucion,
            @ID_Proceso = @ID_Proceso,
            @ID_Fund = @ID_Fund,
            @FechaReporte = @FechaReporte,
            @Portfolio_Geneva = @Portfolio,
            @RowsProcessed = @RowsProcessed OUTPUT,
            @RowsCash = @RowsCash OUTPUT,
            @RowsMTM = @RowsMTM OUTPUT,
            @ErrorCount = @ErrorCount OUTPUT;

        IF @RC NOT IN (0, 1)
        BEGIN
            SET @ReturnCode = @RC;
            SET @ErrorMessage = 'Detenido en sp_Process_IPA (codigo ' + CAST(@RC AS NVARCHAR(10)) + ')';
            EXEC broker.sp_EmitirEvento
                @TipoEvento = 'PIPELINE_FIN',
                @ID_Ejecucion = @ID_Ejecucion,
                @ID_Proceso = @ID_Proceso,
                @ID_Fund = @ID_Fund,
                @NombreSP = 'staging.sp_Process_Fund_Complete',
                @CodigoRetorno = @RC,
                @Detalles = '{"pasoFallido": "sp_Process_IPA", "motivo": "standby/error"}';
            RETURN @RC;
        END

        -- ═══════════════════════════════════════════════════════════════════
        -- PASO 3: Procesar CAPM (segun config)
        -- ═══════════════════════════════════════════════════════════════════
        IF @Req_CAPM = 1
        BEGIN
            SET @PasoActual = 'sp_Process_CAPM';
            EXEC broker.sp_EmitirEvento
                @TipoEvento = 'PIPELINE_PASO',
                @ID_Ejecucion = @ID_Ejecucion,
                @ID_Proceso = @ID_Proceso,
                @ID_Fund = @ID_Fund,
                @NombreSP = 'staging.sp_Process_Fund_Complete',
                @Detalles = '{"paso": 3, "sp": "sp_Process_CAPM", "estado": "iniciando"}';

            EXEC @RC = staging.sp_Process_CAPM
                @ID_Ejecucion = @ID_Ejecucion,
                @ID_Proceso = @ID_Proceso,
                @ID_Fund = @ID_Fund,
                @FechaReporte = @FechaReporte,
                @RowsProcessed = @RowsProcessed OUTPUT,
                @TotalIPA_Cash = @TotalIPA_Cash OUTPUT,
                @TotalCAPM = @TotalCAPM OUTPUT,
                @Diferencia = @DiferenciaCAPM OUTPUT,
                @AjusteCreado = @AjusteCreado OUTPUT,
                @ErrorCount = @ErrorCount OUTPUT;

            IF @RC NOT IN (0, 1)
            BEGIN
                SET @ReturnCode = @RC;
                SET @ErrorMessage = 'Detenido en sp_Process_CAPM (codigo ' + CAST(@RC AS NVARCHAR(10)) + ')';
                EXEC broker.sp_EmitirEvento
                    @TipoEvento = 'PIPELINE_FIN',
                    @ID_Ejecucion = @ID_Ejecucion,
                    @ID_Proceso = @ID_Proceso,
                    @ID_Fund = @ID_Fund,
                    @NombreSP = 'staging.sp_Process_Fund_Complete',
                    @CodigoRetorno = @RC,
                    @Detalles = '{"pasoFallido": "sp_Process_CAPM", "motivo": "standby/error"}';
                RETURN @RC;
            END
        END
        ELSE
        BEGIN
            PRINT 'sp_Process_CAPM: OMITIDO (Req_CAPM=0)';
            EXEC broker.sp_EmitirEvento
                @TipoEvento = 'PIPELINE_PASO',
                @ID_Ejecucion = @ID_Ejecucion,
                @ID_Proceso = @ID_Proceso,
                @ID_Fund = @ID_Fund,
                @NombreSP = 'staging.sp_Process_Fund_Complete',
                @Detalles = '{"paso": 3, "sp": "sp_Process_CAPM", "estado": "omitido"}';
        END

        -- ═══════════════════════════════════════════════════════════════════
        -- PASO 4: Procesar Derivados (segun config)
        -- ═══════════════════════════════════════════════════════════════════
        IF @Req_Derivados = 1
        BEGIN
            SET @PasoActual = 'sp_Process_Derivados';
            EXEC broker.sp_EmitirEvento
                @TipoEvento = 'PIPELINE_PASO',
                @ID_Ejecucion = @ID_Ejecucion,
                @ID_Proceso = @ID_Proceso,
                @ID_Fund = @ID_Fund,
                @NombreSP = 'staging.sp_Process_Fund_Complete',
                @Detalles = '{"paso": 4, "sp": "sp_Process_Derivados", "estado": "iniciando"}';

            EXEC @RC = staging.sp_Process_Derivados
                @ID_Ejecucion = @ID_Ejecucion,
                @ID_Proceso = @ID_Proceso,
                @ID_Fund = @ID_Fund,
                @FechaReporte = @FechaReporte,
                @RowsProcessed = @RowsProcessed OUTPUT,
                @TotalIPA_MTM = @TotalIPA_MTM OUTPUT,
                @TotalDerivados_MTM = @TotalDeriv_MTM OUTPUT,
                @DiferenciaDescuadre = @DiferenciaDeriv OUTPUT,
                @AjustesCreados = @AjustesCreados OUTPUT,
                @ErrorCount = @ErrorCount OUTPUT;

            IF @RC NOT IN (0, 1)
            BEGIN
                SET @ReturnCode = @RC;
                SET @ErrorMessage = 'Detenido en sp_Process_Derivados (codigo ' + CAST(@RC AS NVARCHAR(10)) + ')';
                EXEC broker.sp_EmitirEvento
                    @TipoEvento = 'PIPELINE_FIN',
                    @ID_Ejecucion = @ID_Ejecucion,
                    @ID_Proceso = @ID_Proceso,
                    @ID_Fund = @ID_Fund,
                    @NombreSP = 'staging.sp_Process_Fund_Complete',
                    @CodigoRetorno = @RC,
                    @Detalles = '{"pasoFallido": "sp_Process_Derivados", "motivo": "standby/error"}';
                RETURN @RC;
            END
        END
        ELSE
        BEGIN
            PRINT 'sp_Process_Derivados: OMITIDO (Req_Derivados=0)';
            EXEC broker.sp_EmitirEvento
                @TipoEvento = 'PIPELINE_PASO',
                @ID_Ejecucion = @ID_Ejecucion,
                @ID_Proceso = @ID_Proceso,
                @ID_Fund = @ID_Fund,
                @NombreSP = 'staging.sp_Process_Fund_Complete',
                @Detalles = '{"paso": 4, "sp": "sp_Process_Derivados", "estado": "omitido"}';
        END

        -- ═══════════════════════════════════════════════════════════════════
        -- PASO 5: Procesar SONA (segun config)
        -- ═══════════════════════════════════════════════════════════════════
        IF @Req_SONA = 1
        BEGIN
            SET @PasoActual = 'sp_Process_SONA';
            EXEC broker.sp_EmitirEvento
                @TipoEvento = 'PIPELINE_PASO',
                @ID_Ejecucion = @ID_Ejecucion,
                @ID_Proceso = @ID_Proceso,
                @ID_Fund = @ID_Fund,
                @NombreSP = 'staging.sp_Process_Fund_Complete',
                @Detalles = '{"paso": 5, "sp": "sp_Process_SONA", "estado": "iniciando"}';

            EXEC @RC = staging.sp_Process_SONA
                @ID_Ejecucion = @ID_Ejecucion,
                @ID_Proceso = @ID_Proceso,
                @ID_Fund = @ID_Fund,
                @FechaReporte = @FechaReporte,
                @TotalIPA = @TotalIPA OUTPUT,
                @TotalCAPM = @TotalCAPM2 OUTPUT,
                @TotalDerivados = @TotalDeriv OUTPUT,
                @TotalAjustes = @TotalAjustes OUTPUT,
                @TotalCalculado = @TotalCalc OUTPUT,
                @TotalSONA = @TotalSONA OUTPUT,
                @Diferencia = @DiferenciaSONA OUTPUT,
                @AjusteCreado = @AjusteCreado OUTPUT,
                @ErrorCount = @ErrorCount OUTPUT;

            IF @RC NOT IN (0, 1)
            BEGIN
                SET @ReturnCode = @RC;
                SET @ErrorMessage = 'Detenido en sp_Process_SONA (codigo ' + CAST(@RC AS NVARCHAR(10)) + ')';
                EXEC broker.sp_EmitirEvento
                    @TipoEvento = 'PIPELINE_FIN',
                    @ID_Ejecucion = @ID_Ejecucion,
                    @ID_Proceso = @ID_Proceso,
                    @ID_Fund = @ID_Fund,
                    @NombreSP = 'staging.sp_Process_Fund_Complete',
                    @CodigoRetorno = @RC,
                    @Detalles = '{"pasoFallido": "sp_Process_SONA", "motivo": "standby/error"}';
                RETURN @RC;
            END
        END
        ELSE
        BEGIN
            PRINT 'sp_Process_SONA: OMITIDO (Req_SONA=0)';
            EXEC broker.sp_EmitirEvento
                @TipoEvento = 'PIPELINE_PASO',
                @ID_Ejecucion = @ID_Ejecucion,
                @ID_Proceso = @ID_Proceso,
                @ID_Fund = @ID_Fund,
                @NombreSP = 'staging.sp_Process_Fund_Complete',
                @Detalles = '{"paso": 5, "sp": "sp_Process_SONA", "estado": "omitido"}';
        END

        -- ═══════════════════════════════════════════════════════════════════
        -- PASO 6: Procesar PNL (segun config) - WARNING no detiene
        -- ═══════════════════════════════════════════════════════════════════
        IF @Req_PNL = 1
        BEGIN
            SET @PasoActual = 'sp_Process_PNL';
            EXEC broker.sp_EmitirEvento
                @TipoEvento = 'PIPELINE_PASO',
                @ID_Ejecucion = @ID_Ejecucion,
                @ID_Proceso = @ID_Proceso,
                @ID_Fund = @ID_Fund,
                @NombreSP = 'staging.sp_Process_Fund_Complete',
                @Detalles = '{"paso": 6, "sp": "sp_Process_PNL", "estado": "iniciando"}';

            EXEC @RC = staging.sp_Process_PNL
                @ID_Ejecucion = @ID_Ejecucion,
                @ID_Proceso = @ID_Proceso,
                @ID_Fund = @ID_Fund,
                @FechaReporte = @FechaReporte,
                @Portfolio = @Portfolio,
                @RowsProcessed = @RowsProcessed OUTPUT,
                @ErrorCount = @ErrorCount OUTPUT;

            -- PNL no detiene el pipeline, solo warning
            IF @RC NOT IN (0, 1)
            BEGIN
                PRINT 'WARNING: sp_Process_PNL retorno ' + CAST(@RC AS NVARCHAR(10)) + ' (no detiene pipeline)';
                EXEC broker.sp_EmitirEvento
                    @TipoEvento = 'PIPELINE_PASO',
                    @ID_Ejecucion = @ID_Ejecucion,
                    @ID_Proceso = @ID_Proceso,
                    @ID_Fund = @ID_Fund,
                    @NombreSP = 'staging.sp_Process_Fund_Complete',
                    @CodigoRetorno = @RC,
                    @Detalles = '{"paso": 6, "sp": "sp_Process_PNL", "estado": "warning", "codigo": ' + CAST(@RC AS NVARCHAR(10)) + '}';
            END
        END
        ELSE
        BEGIN
            PRINT 'sp_Process_PNL: OMITIDO (Req_PNL=0)';
            EXEC broker.sp_EmitirEvento
                @TipoEvento = 'PIPELINE_PASO',
                @ID_Ejecucion = @ID_Ejecucion,
                @ID_Proceso = @ID_Proceso,
                @ID_Fund = @ID_Fund,
                @NombreSP = 'staging.sp_Process_Fund_Complete',
                @Detalles = '{"paso": 6, "sp": "sp_Process_PNL", "estado": "omitido"}';
        END

        -- ═══════════════════════════════════════════════════════════════════
        -- PASO 7: Consolidar a CUBO_Final
        -- ═══════════════════════════════════════════════════════════════════
        SET @PasoActual = 'sp_Consolidar_Cubo';
        EXEC broker.sp_EmitirEvento
            @TipoEvento = 'PIPELINE_PASO',
            @ID_Ejecucion = @ID_Ejecucion,
            @ID_Proceso = @ID_Proceso,
            @ID_Fund = @ID_Fund,
            @NombreSP = 'staging.sp_Process_Fund_Complete',
            @Detalles = '{"paso": 7, "sp": "sp_Consolidar_Cubo", "estado": "iniciando"}';

        EXEC @RC = staging.sp_Consolidar_Cubo
            @ID_Ejecucion = @ID_Ejecucion,
            @ID_Proceso = @ID_Proceso,
            @ID_Fund = @ID_Fund,
            @FechaReporte = @FechaReporte,
            @LimpiarTemporales = @LimpiarTemporales,
            @RowsIPA = @RowsIPA OUTPUT,
            @RowsCAPM = @RowsCAPM OUTPUT,
            @RowsDerivados = @RowsDerivados OUTPUT,
            @RowsAjustes = @RowsAjustes OUTPUT,
            @RowsFinal = @RowsFinal OUTPUT,
            @RowsCubo = @RowsCubo OUTPUT,
            @ErrorCount = @ErrorCount OUTPUT;

        IF @RC != 0
        BEGIN
            SET @ReturnCode = @RC;
            SET @ErrorMessage = 'Error en sp_Consolidar_Cubo';
            EXEC broker.sp_EmitirEvento
                @TipoEvento = 'PIPELINE_FIN',
                @ID_Ejecucion = @ID_Ejecucion,
                @ID_Proceso = @ID_Proceso,
                @ID_Fund = @ID_Fund,
                @NombreSP = 'staging.sp_Process_Fund_Complete',
                @CodigoRetorno = @RC,
                @Detalles = '{"pasoFallido": "sp_Consolidar_Cubo", "motivo": "error"}';
            RETURN @RC;
        END

        -- ═══════════════════════════════════════════════════════════════════
        -- PIPELINE COMPLETADO EXITOSAMENTE
        -- ═══════════════════════════════════════════════════════════════════
        SET @DuracionMs = DATEDIFF(MILLISECOND, @StartTime, GETDATE());

        PRINT '════════════════════════════════════════════════════════════════';
        PRINT 'sp_Process_Fund_Complete: COMPLETADO';
        PRINT 'Registros en CUBO_Final: ' + CAST(@RowsCubo AS NVARCHAR(10));
        PRINT 'Tiempo total: ' + CAST(@DuracionMs AS NVARCHAR(10)) + ' ms';
        PRINT '════════════════════════════════════════════════════════════════';

        -- EVENTO: PIPELINE_FIN (Exitoso)
        EXEC broker.sp_EmitirEvento
            @TipoEvento = 'PIPELINE_FIN',
            @ID_Ejecucion = @ID_Ejecucion,
            @ID_Proceso = @ID_Proceso,
            @ID_Fund = @ID_Fund,
            @NombreSP = 'staging.sp_Process_Fund_Complete',
            @CodigoRetorno = 0,
            @DuracionMs = @DuracionMs,
            @RowsProcessed = @RowsCubo,
            @Detalles = '{"estado": "completado", "rowsCubo": ' + CAST(@RowsCubo AS NVARCHAR(10)) + '}';

        SET @ReturnCode = 0;
        RETURN 0;

    END TRY
    BEGIN CATCH
        -- ═══════════════════════════════════════════════════════════════════
        -- EVENTO: ERROR (Excepcion no controlada)
        -- ═══════════════════════════════════════════════════════════════════
        DECLARE @ErrorMsg NVARCHAR(4000) = ERROR_MESSAGE();
        SET @ErrorMessage = 'Error en ' + ISNULL(@PasoActual, 'desconocido') + ': ' + @ErrorMsg;
        SET @ReturnCode = 3;

        EXEC broker.sp_EmitirEvento
            @TipoEvento = 'ERROR',
            @ID_Ejecucion = @ID_Ejecucion,
            @ID_Proceso = @ID_Proceso,
            @ID_Fund = @ID_Fund,
            @NombreSP = 'staging.sp_Process_Fund_Complete',
            @CodigoRetorno = 3,
            @Detalles = @ErrorMessage;

        RETURN 3;
    END CATCH
END;
GO
