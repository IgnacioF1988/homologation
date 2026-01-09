/*
================================================================================
SP: staging.sp_Process_SONA
Version: v2.0 - Redesign DB-Centric (descuadres validados en ValidateFund)
================================================================================
Descripción: Valida patrimonio total del fondo contra SONA (NAV).
             - Calcula total IPA (sin excluidos) + CAPM + Derivados + Ajustes
             - Crea ajuste final de cuadre si hay diferencia (dentro de umbral pre-validado)

PRINCIPIO FUNDAMENTAL:
  Si sp_ValidateFund pasó, este SP NO DEBE fallar por validaciones de negocio.
  Cualquier falla aquí es un BUG del sistema (ASSERTION_FAILED).

Prerequisito: sp_Process_IPA, sp_Process_CAPM, sp_Process_Derivados deben haber completado

Códigos de retorno:
  0  = OK
  1  = WARNING (sin datos SONA, OK si fondo no requiere SONA)
  3  = ERROR_CRITICO (exception no esperada)
  4  = ASSERTION_FAILED (bug del sistema - prerequisitos no cumplidos)

NOTA: El código 9 (DESCUADRES_NAV) fue movido a sp_ValidateFund FASE 4.

CHECKPOINT Events emitidos:
  - VERIFIED ##IPA_Work (prerequisito validado)

Autor: Refactorización Pipeline IPA
Fecha: 2026-01-02
Modificado: 2026-01-09 - Redesign v2.0 con CHECKPOINT events
================================================================================
*/

CREATE OR ALTER PROCEDURE [staging].[sp_Process_SONA]
    @ID_Ejecucion BIGINT,
    @ID_Proceso BIGINT,
    @ID_Fund INT,
    @FechaReporte NVARCHAR(10),
    -- Outputs
    @TotalIPA DECIMAL(18,4) OUTPUT,
    @TotalCAPM DECIMAL(18,4) OUTPUT,
    @TotalDerivados DECIMAL(18,4) OUTPUT,
    @TotalAjustes DECIMAL(18,4) OUTPUT,
    @TotalCalculado DECIMAL(18,4) OUTPUT,
    @TotalSONA DECIMAL(18,4) OUTPUT,
    @Diferencia DECIMAL(18,4) OUTPUT,
    @AjusteCreado BIT OUTPUT,
    @ErrorCount INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    -- Inicializar outputs
    SET @TotalIPA = 0;
    SET @TotalCAPM = 0;
    SET @TotalDerivados = 0;
    SET @TotalAjustes = 0;
    SET @TotalCalculado = 0;
    SET @TotalSONA = 0;
    SET @Diferencia = 0;
    SET @AjusteCreado = 0;
    SET @ErrorCount = 0;

    -- Variables locales
    DECLARE @StartTime DATETIME = GETDATE();
    DECLARE @SQL NVARCHAR(MAX);
    DECLARE @ReturnCode INT = 0;
    DECLARE @ErrorMessage NVARCHAR(500);
    DECLARE @Umbral DECIMAL(18,4);
    DECLARE @id_CURR_Fondo INT;
    DECLARE @Portfolio NVARCHAR(100);

    -- Nombres de tablas temporales
    DECLARE @Suffix NVARCHAR(100) = CAST(@ID_Ejecucion AS NVARCHAR(20)) + '_' +
                                    CAST(@ID_Proceso AS NVARCHAR(10)) + '_' +
                                    CAST(@ID_Fund AS NVARCHAR(10));
    DECLARE @TempWork NVARCHAR(200) = '##IPA_Work_' + @Suffix;
    DECLARE @TempCAPM NVARCHAR(200) = '##CAPM_Work_' + @Suffix;
    DECLARE @TempDerivados NVARCHAR(200) = '##Derivados_Work_' + @Suffix;
    DECLARE @TempAjustes NVARCHAR(200) = '##Ajustes_' + @Suffix;

    BEGIN TRY
        -- ═══════════════════════════════════════════════════════════════════
        -- EVENTO: SP_INICIO
        -- ═══════════════════════════════════════════════════════════════════
        EXEC broker.sp_EmitirEvento
            @TipoEvento = 'SP_INICIO',
            @ID_Ejecucion = @ID_Ejecucion,
            @ID_Proceso = @ID_Proceso,
            @ID_Fund = @ID_Fund,
            @NombreSP = 'staging.sp_Process_SONA';

        -- ═══════════════════════════════════════════════════════════════════
        -- PASO 0: ASSERTION - Verificar prerequisitos
        -- Si ValidateFund pasó, ##IPA_Work DEBE existir. Si no existe, es un BUG.
        -- ═══════════════════════════════════════════════════════════════════

        DECLARE @IPAWorkExists BIT = 0;
        SET @SQL = N'IF OBJECT_ID(''tempdb..' + @TempWork + ''', ''U'') IS NOT NULL SET @Exists = 1';
        EXEC sp_executesql @SQL, N'@Exists BIT OUTPUT', @IPAWorkExists OUTPUT;

        IF @IPAWorkExists = 0
        BEGIN
            -- ASSERTION_FAILED: Esto es un BUG, no debería pasar si ValidateFund pasó
            DECLARE @AssertMsg NVARCHAR(500) = 'ASSERTION_FAILED: Tabla ' + @TempWork + ' no existe. Bug en orquestador o sp_Process_IPA falló silenciosamente.';
            PRINT @AssertMsg;

            EXEC broker.sp_EmitirEvento
                @TipoEvento = 'ERROR',
                @ID_Ejecucion = @ID_Ejecucion,
                @ID_Proceso = @ID_Proceso,
                @ID_Fund = @ID_Fund,
                @NombreSP = 'staging.sp_Process_SONA',
                @CodigoRetorno = 4,
                @Detalles = @AssertMsg;

            RETURN 4;  -- ASSERTION_FAILED
        END

        -- ═══════════════════════════════════════════════════════════════════
        -- CHECKPOINT: ##IPA_Work verificada (prerequisito OK)
        -- ═══════════════════════════════════════════════════════════════════
        DECLARE @ChkVerified NVARCHAR(500) = '{"operacion": "VERIFIED", "objeto": "' + @TempWork + '", "mensaje": "Prerequisito IPA Work existe"}';
        EXEC broker.sp_EmitirEvento
            @TipoEvento = 'CHECKPOINT',
            @ID_Ejecucion = @ID_Ejecucion,
            @ID_Proceso = @ID_Proceso,
            @ID_Fund = @ID_Fund,
            @NombreSP = 'staging.sp_Process_SONA',
            @Detalles = @ChkVerified;

        -- Obtener umbral configurado
        SET @Umbral = staging.fn_GetUmbral(@ID_Fund, 'SONA');

        -- Obtener moneda del fondo
        SELECT @id_CURR_Fondo = id_CURR
        FROM dimensionales.BD_Funds
        WHERE ID_Fund = @ID_Fund;

        -- Obtener Portfolio
        SELECT @Portfolio = Portfolio
        FROM dimensionales.HOMOL_Funds
        WHERE ID_Fund = @ID_Fund AND Source = 'GENEVA';

        PRINT 'sp_Process_SONA: Iniciando para Fondo ' + CAST(@ID_Fund AS NVARCHAR(10)) +
              ' | Umbral: ' + CAST(@Umbral AS NVARCHAR(10));

        -- ═══════════════════════════════════════════════════════════════════
        -- PASO 1: Calcular total IPA (sin excluidos)
        -- ═══════════════════════════════════════════════════════════════════

        SET @SQL = N'SELECT @Total = ISNULL(SUM(TotalMVal), 0)
                     FROM ' + @TempWork + '
                     WHERE Flag_Excluir = 0';
        EXEC sp_executesql @SQL, N'@Total DECIMAL(18,4) OUTPUT', @TotalIPA OUTPUT;

        PRINT 'sp_Process_SONA: Total IPA (sin excluidos) = ' + CAST(@TotalIPA AS NVARCHAR(20));

        -- ═══════════════════════════════════════════════════════════════════
        -- PASO 2: Calcular total CAPM (si existe)
        -- ═══════════════════════════════════════════════════════════════════

        SET @SQL = N'
        IF OBJECT_ID(''tempdb..' + @TempCAPM + ''', ''U'') IS NOT NULL
        BEGIN
            SELECT @Total = ISNULL(SUM(TotalMVal), 0) FROM ' + @TempCAPM + '
        END
        ELSE
            SET @Total = 0';
        EXEC sp_executesql @SQL, N'@Total DECIMAL(18,4) OUTPUT', @TotalCAPM OUTPUT;

        PRINT 'sp_Process_SONA: Total CAPM = ' + CAST(@TotalCAPM AS NVARCHAR(20));

        -- ═══════════════════════════════════════════════════════════════════
        -- PASO 3: Calcular total Derivados (si existe)
        -- ═══════════════════════════════════════════════════════════════════

        SET @SQL = N'
        IF OBJECT_ID(''tempdb..' + @TempDerivados + ''', ''U'') IS NOT NULL
        BEGIN
            SELECT @Total = ISNULL(SUM(TotalMVal), 0) FROM ' + @TempDerivados + '
        END
        ELSE
            SET @Total = 0';
        EXEC sp_executesql @SQL, N'@Total DECIMAL(18,4) OUTPUT', @TotalDerivados OUTPUT;

        PRINT 'sp_Process_SONA: Total Derivados = ' + CAST(@TotalDerivados AS NVARCHAR(20));

        -- ═══════════════════════════════════════════════════════════════════
        -- PASO 4: Calcular total Ajustes previos (si existe)
        -- ═══════════════════════════════════════════════════════════════════

        SET @SQL = N'
        IF OBJECT_ID(''tempdb..' + @TempAjustes + ''', ''U'') IS NOT NULL
        BEGIN
            SELECT @Total = ISNULL(SUM(MVBook), 0) FROM ' + @TempAjustes + '
        END
        ELSE
            SET @Total = 0';
        EXEC sp_executesql @SQL, N'@Total DECIMAL(18,4) OUTPUT', @TotalAjustes OUTPUT;

        PRINT 'sp_Process_SONA: Total Ajustes previos = ' + CAST(@TotalAjustes AS NVARCHAR(20));

        -- ═══════════════════════════════════════════════════════════════════
        -- PASO 5: Calcular total calculado
        -- ═══════════════════════════════════════════════════════════════════

        SET @TotalCalculado = @TotalIPA + @TotalCAPM + @TotalDerivados + @TotalAjustes;

        PRINT 'sp_Process_SONA: Total Calculado = ' + CAST(@TotalCalculado AS NVARCHAR(20));

        -- ═══════════════════════════════════════════════════════════════════
        -- PASO 6: Obtener total SONA
        -- ═══════════════════════════════════════════════════════════════════

        SELECT @TotalSONA = ISNULL(SUM(Bal), 0)
        FROM extract.SONA
        WHERE ID_Ejecucion = @ID_Ejecucion
          AND FechaReporte = @FechaReporte
          AND ID_Fund = @ID_Fund;

        IF @TotalSONA = 0
        BEGIN
            -- Intentar buscar por Portfolio
            SELECT @TotalSONA = ISNULL(SUM(s.Bal), 0)
            FROM extract.SONA s
            INNER JOIN dimensionales.HOMOL_Funds hf ON s.Portfolio = hf.Portfolio AND hf.Source = 'GENEVA'
            WHERE s.ID_Ejecucion = @ID_Ejecucion
              AND s.FechaReporte = @FechaReporte
              AND hf.ID_Fund = @ID_Fund;
        END

        IF @TotalSONA = 0
        BEGIN
            PRINT 'sp_Process_SONA: Sin datos SONA para el fondo';

            -- EVENTO: SP_FIN (WARNING - sin datos SONA)
            EXEC broker.sp_EmitirEvento
                @TipoEvento = 'SP_FIN',
                @ID_Ejecucion = @ID_Ejecucion,
                @ID_Proceso = @ID_Proceso,
                @ID_Fund = @ID_Fund,
                @NombreSP = 'staging.sp_Process_SONA',
                @CodigoRetorno = 1,
                @Detalles = 'WARNING: Sin datos SONA para el fondo';

            RETURN 1;  -- WARNING - No hay SONA para validar
        END

        PRINT 'sp_Process_SONA: Total SONA = ' + CAST(@TotalSONA AS NVARCHAR(20));

        -- ═══════════════════════════════════════════════════════════════════
        -- PASO 7: Calcular diferencia (descuadre ya validado en ValidateFund FASE 4)
        -- ═══════════════════════════════════════════════════════════════════

        SET @Diferencia = @TotalSONA - @TotalCalculado;

        PRINT 'sp_Process_SONA: Diferencia (SONA - Calculado) = ' + CAST(@Diferencia AS NVARCHAR(20));

        -- NOTA: La validación de descuadre vs umbral fue movida a sp_ValidateFund FASE 4.
        -- Si llegamos aquí, ValidateFund ya validó que la diferencia está dentro del umbral.

        -- ═══════════════════════════════════════════════════════════════════
        -- PASO 8: Crear ajuste si hay diferencia (ya validada dentro del umbral)
        -- ═══════════════════════════════════════════════════════════════════

        IF ABS(@Diferencia) > 0.01  -- Tolerancia mínima
        BEGIN
            EXEC staging.sp_CreateAdjustment
                @ID_Ejecucion = @ID_Ejecucion,
                @ID_Proceso = @ID_Proceso,
                @ID_Fund = @ID_Fund,
                @FechaReporte = @FechaReporte,
                @TipoAjuste = 'SONA',
                @id_CURR = @id_CURR_Fondo,
                @Diferencia = @Diferencia,
                @ValorOriginal = @TotalCalculado,
                @ValorComparado = @TotalSONA,
                @UmbralAplicado = @Umbral,
                @TempTableAjustes = @TempAjustes,
                @AjusteCreado = @AjusteCreado OUTPUT;
        END

        -- ═══════════════════════════════════════════════════════════════════
        -- RESUMEN
        -- ═══════════════════════════════════════════════════════════════════

        DECLARE @DuracionMs INT = DATEDIFF(second, @StartTime, GETDATE()) * 1000;

        PRINT '========================================';
        PRINT 'sp_Process_SONA COMPLETADO';
        PRINT 'Fondo: ' + CAST(@ID_Fund AS NVARCHAR(10));
        PRINT 'Total IPA (sin excluidos): ' + CAST(@TotalIPA AS NVARCHAR(20));
        PRINT 'Total CAPM: ' + CAST(@TotalCAPM AS NVARCHAR(20));
        PRINT 'Total Derivados: ' + CAST(@TotalDerivados AS NVARCHAR(20));
        PRINT 'Total Ajustes previos: ' + CAST(@TotalAjustes AS NVARCHAR(20));
        PRINT 'Total Calculado: ' + CAST(@TotalCalculado AS NVARCHAR(20));
        PRINT 'Total SONA: ' + CAST(@TotalSONA AS NVARCHAR(20));
        PRINT 'Diferencia: ' + CAST(@Diferencia AS NVARCHAR(20));
        PRINT 'Ajuste creado: ' + CASE WHEN @AjusteCreado = 1 THEN 'SI' ELSE 'NO' END;
        PRINT 'Tiempo: ' + CAST(@DuracionMs AS NVARCHAR(10)) + ' ms';
        PRINT '========================================';

        -- ═══════════════════════════════════════════════════════════════════
        -- EVENTO: SP_FIN (Exitoso)
        -- ═══════════════════════════════════════════════════════════════════
        EXEC broker.sp_EmitirEvento
            @TipoEvento = 'SP_FIN',
            @ID_Ejecucion = @ID_Ejecucion,
            @ID_Proceso = @ID_Proceso,
            @ID_Fund = @ID_Fund,
            @NombreSP = 'staging.sp_Process_SONA',
            @CodigoRetorno = 0,
            @DuracionMs = @DuracionMs;

        RETURN 0;  -- OK

    END TRY
    BEGIN CATCH
        SET @ErrorCount = 1;

        -- EVENTO: ERROR
        DECLARE @ErrorMsg NVARCHAR(4000) = ERROR_MESSAGE();
        EXEC broker.sp_EmitirEvento
            @TipoEvento = 'ERROR',
            @ID_Ejecucion = @ID_Ejecucion,
            @ID_Proceso = @ID_Proceso,
            @ID_Fund = @ID_Fund,
            @NombreSP = 'staging.sp_Process_SONA',
            @CodigoRetorno = 3,
            @Detalles = @ErrorMsg;

        EXEC staging.sp_HandleError
            @ProcName = 'sp_Process_SONA',
            @ID_Ejecucion = @ID_Ejecucion,
            @ID_Proceso = @ID_Proceso,
            @ID_Fund = @ID_Fund,
            @TempTablesToClean = NULL,
            @ReturnCode = @ReturnCode OUTPUT,
            @ErrorMessage = @ErrorMessage OUTPUT;

        RETURN @ReturnCode;
    END CATCH
END;
GO
