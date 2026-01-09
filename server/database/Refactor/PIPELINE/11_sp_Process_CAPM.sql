/*
================================================================================
SP: staging.sp_Process_CAPM
Version: v2.0 - Redesign DB-Centric (descuadres validados en ValidateFund)
================================================================================
Descripción: Procesa datos de CAPM (Cash Appraisal).
             - Carga extract.CAPM → ##CAPM_Work
             - Homologa instrumentos y monedas
             - Crea ajuste automático si hay diferencia (dentro de umbral pre-validado)

PRINCIPIO FUNDAMENTAL:
  Si sp_ValidateFund pasó, este SP NO DEBE fallar por validaciones de negocio.
  Cualquier falla aquí es un BUG del sistema (ASSERTION_FAILED).

Prerequisito: sp_Process_IPA debe haber completado

Códigos de retorno:
  0  = OK
  1  = WARNING (sin datos CAPM, OK si fondo no requiere CAPM)
  3  = ERROR_CRITICO (exception no esperada)
  4  = ASSERTION_FAILED (bug del sistema - prerequisitos no cumplidos)

NOTA: El código 7 (DESCUADRES_CAPM) fue movido a sp_ValidateFund FASE 4.

CHECKPOINT Events emitidos:
  - VERIFIED ##IPA_Cash (prerequisito validado)
  - CREATED ##CAPM_Work (después de cargar datos)

Autor: Refactorización Pipeline IPA
Fecha: 2026-01-02
Modificado: 2026-01-09 - Redesign v2.0 con CHECKPOINT events
================================================================================
*/

CREATE OR ALTER PROCEDURE [staging].[sp_Process_CAPM]
    @ID_Ejecucion BIGINT,
    @ID_Proceso BIGINT,
    @ID_Fund INT,
    @FechaReporte NVARCHAR(10),
    @Portfolio NVARCHAR(100) = NULL,
    -- Outputs
    @RowsProcessed INT OUTPUT,
    @TotalIPA_Cash DECIMAL(18,4) OUTPUT,
    @TotalCAPM DECIMAL(18,4) OUTPUT,
    @Diferencia DECIMAL(18,4) OUTPUT,
    @AjusteCreado BIT OUTPUT,
    @ErrorCount INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    -- Inicializar outputs
    SET @RowsProcessed = 0;
    SET @TotalIPA_Cash = 0;
    SET @TotalCAPM = 0;
    SET @Diferencia = 0;
    SET @AjusteCreado = 0;
    SET @ErrorCount = 0;

    -- Variables locales
    DECLARE @StartTime DATETIME = GETDATE();
    DECLARE @SQL NVARCHAR(MAX);
    DECLARE @ReturnCode INT = 0;
    DECLARE @ErrorMessage NVARCHAR(500);
    DECLARE @Source NVARCHAR(50);
    DECLARE @Umbral DECIMAL(18,4);
    DECLARE @id_CURR_Fondo INT;

    -- Obtener Source desde config (fuente de verdad)
    SELECT @Source = SourceName FROM config.Extract_Source WHERE ExtractTable = 'CAPM';
    SET @Source = ISNULL(@Source, 'GENEVA');  -- Fallback por seguridad

    -- Nombres de tablas temporales
    DECLARE @Suffix NVARCHAR(100) = CAST(@ID_Ejecucion AS NVARCHAR(20)) + '_' +
                                    CAST(@ID_Proceso AS NVARCHAR(10)) + '_' +
                                    CAST(@ID_Fund AS NVARCHAR(10));
    DECLARE @TempCAPM NVARCHAR(200) = '##CAPM_Work_' + @Suffix;
    DECLARE @TempIPACash NVARCHAR(200) = '##IPA_Cash_' + @Suffix;
    DECLARE @TempAjustes NVARCHAR(200) = '##Ajustes_' + @Suffix;

    -- Variables para homologación
    DECLARE @ProblemasFondo INT, @ProblemasInstrumento INT, @ProblemasMoneda INT;

    BEGIN TRY
        -- ═══════════════════════════════════════════════════════════════════
        -- EVENTO: SP_INICIO
        -- ═══════════════════════════════════════════════════════════════════
        EXEC broker.sp_EmitirEvento
            @TipoEvento = 'SP_INICIO',
            @ID_Ejecucion = @ID_Ejecucion,
            @ID_Proceso = @ID_Proceso,
            @ID_Fund = @ID_Fund,
            @NombreSP = 'staging.sp_Process_CAPM';

        -- ═══════════════════════════════════════════════════════════════════
        -- PASO 0: ASSERTION - Verificar prerequisitos
        -- Si ValidateFund pasó, ##IPA_Cash DEBE existir. Si no existe, es un BUG.
        -- ═══════════════════════════════════════════════════════════════════

        DECLARE @IPACashExists BIT = 0;
        SET @SQL = N'IF OBJECT_ID(''tempdb..' + @TempIPACash + ''', ''U'') IS NOT NULL SET @Exists = 1';
        EXEC sp_executesql @SQL, N'@Exists BIT OUTPUT', @IPACashExists OUTPUT;

        IF @IPACashExists = 0
        BEGIN
            -- ASSERTION_FAILED: Esto es un BUG, no debería pasar si ValidateFund pasó
            DECLARE @AssertMsg NVARCHAR(500) = 'ASSERTION_FAILED: Tabla ' + @TempIPACash + ' no existe. Bug en orquestador o sp_Process_IPA falló silenciosamente.';
            PRINT @AssertMsg;

            EXEC broker.sp_EmitirEvento
                @TipoEvento = 'ERROR',
                @ID_Ejecucion = @ID_Ejecucion,
                @ID_Proceso = @ID_Proceso,
                @ID_Fund = @ID_Fund,
                @NombreSP = 'staging.sp_Process_CAPM',
                @CodigoRetorno = 4,
                @Detalles = @AssertMsg;

            RETURN 4;  -- ASSERTION_FAILED
        END

        -- ═══════════════════════════════════════════════════════════════════
        -- CHECKPOINT: ##IPA_Cash verificada (prerequisito OK)
        -- ═══════════════════════════════════════════════════════════════════
        DECLARE @ChkVerified NVARCHAR(500) = '{"operacion": "VERIFIED", "objeto": "' + @TempIPACash + '", "mensaje": "Prerequisito IPA Cash existe"}';
        EXEC broker.sp_EmitirEvento
            @TipoEvento = 'CHECKPOINT',
            @ID_Ejecucion = @ID_Ejecucion,
            @ID_Proceso = @ID_Proceso,
            @ID_Fund = @ID_Fund,
            @NombreSP = 'staging.sp_Process_CAPM',
            @Detalles = @ChkVerified;

        -- Obtener umbral configurado
        SET @Umbral = staging.fn_GetUmbral(@ID_Fund, 'CAPM');

        -- Obtener moneda del fondo
        SELECT @id_CURR_Fondo = id_CURR
        FROM dimensionales.BD_Funds
        WHERE ID_Fund = @ID_Fund;

        -- Obtener Portfolio si no se proporcionó
        IF @Portfolio IS NULL
        BEGIN
            SELECT @Portfolio = Portfolio
            FROM dimensionales.HOMOL_Funds
            WHERE ID_Fund = @ID_Fund AND Source = @Source;
        END

        PRINT 'sp_Process_CAPM: Iniciando para Fondo ' + CAST(@ID_Fund AS NVARCHAR(10)) +
              ' | Umbral: ' + CAST(@Umbral AS NVARCHAR(10));

        -- ═══════════════════════════════════════════════════════════════════
        -- PASO 1: Calcular total de Cash en IPA
        -- ═══════════════════════════════════════════════════════════════════

        SET @SQL = N'SELECT @Total = ISNULL(SUM(ISNULL(MVBook, 0) + ISNULL(AI, 0)), 0)
                     FROM ' + @TempIPACash;
        EXEC sp_executesql @SQL, N'@Total DECIMAL(18,4) OUTPUT', @TotalIPA_Cash OUTPUT;

        PRINT 'sp_Process_CAPM: Total IPA Cash = ' + CAST(@TotalIPA_Cash AS NVARCHAR(20));

        -- ═══════════════════════════════════════════════════════════════════
        -- PASO 2: Crear tabla temporal ##CAPM_Work
        -- ═══════════════════════════════════════════════════════════════════

        SET @SQL = N'
        IF OBJECT_ID(''tempdb..' + @TempCAPM + ''', ''U'') IS NOT NULL
            DROP TABLE ' + @TempCAPM + ';

        CREATE TABLE ' + @TempCAPM + ' (
            RowID INT IDENTITY(1,1) PRIMARY KEY,
            ID_Ejecucion BIGINT NOT NULL,
            ID_Proceso BIGINT NOT NULL,
            ID_Fund INT NULL,
            PK2 NVARCHAR(50) NULL,
            ID_Instrumento INT NULL,
            id_CURR INT NULL,
            FechaReporte NVARCHAR(10) NOT NULL,
            FechaCartera NVARCHAR(10) NULL,
            Portfolio NVARCHAR(100) NOT NULL,
            InvestID NVARCHAR(255) NOT NULL,
            InvestDescription NVARCHAR(500) NULL,
            LocalCurrency NVARCHAR(50) NULL,
            BalanceSheet NVARCHAR(20) NULL,
            Source NVARCHAR(50) NULL,
            LocalPrice DECIMAL(18,6) NULL,
            Qty DECIMAL(18,6) NULL,
            OriginalFace DECIMAL(18,4) NULL,
            Factor DECIMAL(18,6) NULL,
            AI DECIMAL(18,4) NULL,
            MVBook DECIMAL(18,4) NULL,
            TotalMVal DECIMAL(18,4) NULL,
            TotalMVal_Balance DECIMAL(18,4) NULL,
            FechaProceso DATETIME NOT NULL DEFAULT GETDATE()
        );';
        EXEC sp_executesql @SQL;

        -- ═══════════════════════════════════════════════════════════════════
        -- PASO 3: Cargar datos desde extract.CAPM
        -- ═══════════════════════════════════════════════════════════════════

        SET @SQL = N'
        INSERT INTO ' + @TempCAPM + ' (
            ID_Ejecucion, ID_Proceso, FechaReporte, FechaCartera,
            Portfolio, InvestID, InvestDescription, LocalCurrency,
            BalanceSheet, Source, LocalPrice, Qty, AI, MVBook, TotalMVal, TotalMVal_Balance
        )
        SELECT
            @ID_Ejecucion,
            @ID_Proceso,
            capm.FechaReporte,
            capm.FechaReporte AS FechaCartera,
            capm.Portfolio,
            capm.InvestID,
            NULL AS InvestDescription,  -- No existe en extract.CAPM
            capm.LocalCurrency,
            CASE WHEN ISNULL(capm.MVBook, 0) >= 0 THEN ''Asset'' ELSE ''Liability'' END,
            ''CASH APPRAISAL'',
            0 AS LocalPrice,  -- No existe en extract.CAPM
            capm.Qty,
            0 AS AI,  -- No existe en extract.CAPM
            capm.MVBook,
            ISNULL(capm.MVBook, 0) AS TotalMVal,
            ISNULL(capm.MVBook, 0) AS TotalMVal_Balance
        FROM extract.CAPM capm
        INNER JOIN dimensionales.HOMOL_Funds hf
            ON capm.Portfolio = hf.Portfolio AND hf.Source = ''CASH APPRAISAL''
        WHERE capm.ID_Ejecucion = @ID_Ejecucion
          AND capm.FechaReporte = @FechaReporte
          AND hf.ID_Fund = @ID_Fund';

        EXEC sp_executesql @SQL,
            N'@ID_Ejecucion BIGINT, @ID_Proceso BIGINT, @ID_Fund INT, @FechaReporte NVARCHAR(10)',
            @ID_Ejecucion, @ID_Proceso, @ID_Fund, @FechaReporte;

        SET @RowsProcessed = @@ROWCOUNT;

        IF @RowsProcessed = 0
        BEGIN
            PRINT 'sp_Process_CAPM: Sin datos CAPM para el fondo';
            -- Si no hay CAPM pero hay Cash en IPA, es un warning
            IF @TotalIPA_Cash != 0
                PRINT 'WARNING: Hay Cash en IPA pero no hay datos CAPM';

            -- EVENTO: SP_FIN (WARNING - sin datos CAPM)
            EXEC broker.sp_EmitirEvento
                @TipoEvento = 'SP_FIN',
                @ID_Ejecucion = @ID_Ejecucion,
                @ID_Proceso = @ID_Proceso,
                @ID_Fund = @ID_Fund,
                @NombreSP = 'staging.sp_Process_CAPM',
                @CodigoRetorno = 1,
                @Detalles = '{"mensaje": "WARNING: Sin datos CAPM para el fondo"}';

            RETURN 1;  -- WARNING
        END

        PRINT 'sp_Process_CAPM: ' + CAST(@RowsProcessed AS NVARCHAR(10)) + ' registros CAPM cargados';

        -- ═══════════════════════════════════════════════════════════════════
        -- CHECKPOINT: ##CAPM_Work creada
        -- ═══════════════════════════════════════════════════════════════════
        DECLARE @ChkCreated NVARCHAR(500) = '{"operacion": "CREATED", "objeto": "' + @TempCAPM + '", "registros": ' + CAST(@RowsProcessed AS NVARCHAR(10)) + '}';
        EXEC broker.sp_EmitirEvento
            @TipoEvento = 'CHECKPOINT',
            @ID_Ejecucion = @ID_Ejecucion,
            @ID_Proceso = @ID_Proceso,
            @ID_Fund = @ID_Fund,
            @NombreSP = 'staging.sp_Process_CAPM',
            @Detalles = @ChkCreated;

        -- ═══════════════════════════════════════════════════════════════════
        -- PASO 4: Homologar instrumentos y monedas
        -- ═══════════════════════════════════════════════════════════════════

        EXEC @ReturnCode = staging.sp_Homologate
            @TempTableName = @TempCAPM,
            @Source = @Source,
            @ID_Ejecucion = @ID_Ejecucion,
            @ID_Proceso = @ID_Proceso,
            @ID_Fund = @ID_Fund,
            @FechaReporte = @FechaReporte,
            @InvestIDColumn = 'InvestID',
            @CurrencyColumn = 'LocalCurrency',
            @PortfolioColumn = 'Portfolio',
            @ProblemasFondo = @ProblemasFondo OUTPUT,
            @ProblemasInstrumento = @ProblemasInstrumento OUTPUT,
            @ProblemasMoneda = @ProblemasMoneda OUTPUT;

        IF @ReturnCode != 0
        BEGIN
            SET @ErrorCount = 1;

            -- ASSERTION_FAILED: La homologación debió pasar en sp_ValidateFund
            -- Si llegamos aquí con errores de homologación, es un BUG del sistema
            DECLARE @AssertMsgHomol NVARCHAR(500) = 'ASSERTION_FAILED: Homologación falló en sp_Process_CAPM pero sp_ValidateFund retornó 0. ' +
                                                     'Fondo:' + CAST(ISNULL(@ProblemasFondo,0) AS NVARCHAR) +
                                                     ' Instrumento:' + CAST(ISNULL(@ProblemasInstrumento,0) AS NVARCHAR) +
                                                     ' Moneda:' + CAST(ISNULL(@ProblemasMoneda,0) AS NVARCHAR);
            EXEC broker.sp_EmitirEvento
                @TipoEvento = 'ERROR',
                @ID_Ejecucion = @ID_Ejecucion,
                @ID_Proceso = @ID_Proceso,
                @ID_Fund = @ID_Fund,
                @NombreSP = 'staging.sp_Process_CAPM',
                @CodigoRetorno = 4,  -- ASSERTION_FAILED
                @Detalles = @AssertMsgHomol;

            RETURN 4;  -- ASSERTION_FAILED
        END

        -- Actualizar ID_Fund
        SET @SQL = N'UPDATE ' + @TempCAPM + ' SET ID_Fund = @ID_Fund';
        EXEC sp_executesql @SQL, N'@ID_Fund INT', @ID_Fund;

        -- ═══════════════════════════════════════════════════════════════════
        -- PASO 5: Calcular total CAPM y diferencia
        -- ═══════════════════════════════════════════════════════════════════

        SET @SQL = N'SELECT @Total = ISNULL(SUM(TotalMVal), 0) FROM ' + @TempCAPM;
        EXEC sp_executesql @SQL, N'@Total DECIMAL(18,4) OUTPUT', @TotalCAPM OUTPUT;

        SET @Diferencia = @TotalIPA_Cash - @TotalCAPM;

        PRINT 'sp_Process_CAPM: Total CAPM = ' + CAST(@TotalCAPM AS NVARCHAR(20));
        PRINT 'sp_Process_CAPM: Diferencia = ' + CAST(@Diferencia AS NVARCHAR(20));

        -- ═══════════════════════════════════════════════════════════════════
        -- NOTA: La validación de descuadre vs umbral fue movida a sp_ValidateFund FASE 4.
        -- Si llegamos aquí, ValidateFund ya validó que la diferencia está dentro del umbral.
        -- ═══════════════════════════════════════════════════════════════════

        -- ═══════════════════════════════════════════════════════════════════
        -- PASO 6: Crear ajuste si hay diferencia (ya validada dentro del umbral)
        -- ═══════════════════════════════════════════════════════════════════

        IF ABS(@Diferencia) > 0.01  -- Tolerancia mínima
        BEGIN
            EXEC staging.sp_CreateAdjustment
                @ID_Ejecucion = @ID_Ejecucion,
                @ID_Proceso = @ID_Proceso,
                @ID_Fund = @ID_Fund,
                @FechaReporte = @FechaReporte,
                @TipoAjuste = 'CAPM',
                @id_CURR = @id_CURR_Fondo,
                @Diferencia = @Diferencia,
                @ValorOriginal = @TotalIPA_Cash,
                @ValorComparado = @TotalCAPM,
                @UmbralAplicado = @Umbral,
                @TempTableAjustes = @TempAjustes,
                @AjusteCreado = @AjusteCreado OUTPUT;
        END

        -- ═══════════════════════════════════════════════════════════════════
        -- RESUMEN
        -- ═══════════════════════════════════════════════════════════════════

        DECLARE @DuracionMs INT = DATEDIFF(second, @StartTime, GETDATE()) * 1000;

        PRINT '========================================';
        PRINT 'sp_Process_CAPM COMPLETADO';
        PRINT 'Fondo: ' + CAST(@ID_Fund AS NVARCHAR(10));
        PRINT 'Registros CAPM: ' + CAST(@RowsProcessed AS NVARCHAR(10));
        PRINT 'Total IPA Cash: ' + CAST(@TotalIPA_Cash AS NVARCHAR(20));
        PRINT 'Total CAPM: ' + CAST(@TotalCAPM AS NVARCHAR(20));
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
            @NombreSP = 'staging.sp_Process_CAPM',
            @CodigoRetorno = 0,
            @DuracionMs = @DuracionMs,
            @RowsProcessed = @RowsProcessed;

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
            @NombreSP = 'staging.sp_Process_CAPM',
            @CodigoRetorno = 3,
            @Detalles = @ErrorMsg;

        EXEC staging.sp_HandleError
            @ProcName = 'sp_Process_CAPM',
            @ID_Ejecucion = @ID_Ejecucion,
            @ID_Proceso = @ID_Proceso,
            @ID_Fund = @ID_Fund,
            @TempTablesToClean = @TempCAPM,
            @ReturnCode = @ReturnCode OUTPUT,
            @ErrorMessage = @ErrorMessage OUTPUT;

        RETURN @ReturnCode;
    END CATCH
END;
GO
