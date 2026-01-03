/*
================================================================================
SP: staging.sp_Consolidar_Cubo
Descripción: Consolida todos los datos procesados en ##IPA_Final y luego
             los inserta en process.CUBO_Final con JOIN a PNL.

             Consolida:
             - IPA (sin Cash ni MTM excluidos)
             - CAPM (cash desagregado)
             - Derivados (derivados desagregados)
             - Ajustes (CAPM, DERIVADOS, PARIDADES, SONA)

             Luego hace LEFT JOIN con PNL para agregar campos de rentabilidad.

Prerequisito: Todos los sp_Process_* deben haber completado

Códigos de retorno:
  0  = OK
  1  = WARNING
  2  = RETRY
  3  = ERROR_CRITICO

Autor: Refactorización Pipeline IPA
Fecha: 2026-01-02
================================================================================
*/

CREATE OR ALTER PROCEDURE [staging].[sp_Consolidar_Cubo]
    @ID_Ejecucion BIGINT,
    @ID_Proceso BIGINT,
    @ID_Fund INT,
    @FechaReporte NVARCHAR(10),
    @LimpiarTemporales BIT = 1,
    -- Outputs
    @RowsIPA INT OUTPUT,
    @RowsCAPM INT OUTPUT,
    @RowsDerivados INT OUTPUT,
    @RowsAjustes INT OUTPUT,
    @RowsFinal INT OUTPUT,
    @RowsCubo INT OUTPUT,
    @ErrorCount INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    -- Inicializar outputs
    SET @RowsIPA = 0;
    SET @RowsCAPM = 0;
    SET @RowsDerivados = 0;
    SET @RowsAjustes = 0;
    SET @RowsFinal = 0;
    SET @RowsCubo = 0;
    SET @ErrorCount = 0;

    -- Variables locales
    DECLARE @StartTime DATETIME = GETDATE();
    DECLARE @SQL NVARCHAR(MAX);
    DECLARE @ReturnCode INT = 0;
    DECLARE @ErrorMessage NVARCHAR(500);

    -- Nombres de tablas temporales
    DECLARE @Suffix NVARCHAR(100) = CAST(@ID_Ejecucion AS NVARCHAR(20)) + '_' +
                                    CAST(@ID_Proceso AS NVARCHAR(10)) + '_' +
                                    CAST(@ID_Fund AS NVARCHAR(10));
    DECLARE @TempWork NVARCHAR(200) = '##IPA_Work_' + @Suffix;
    DECLARE @TempCAPM NVARCHAR(200) = '##CAPM_Work_' + @Suffix;
    DECLARE @TempDerivados NVARCHAR(200) = '##Derivados_Work_' + @Suffix;
    DECLARE @TempAjustes NVARCHAR(200) = '##Ajustes_' + @Suffix;
    DECLARE @TempPNL NVARCHAR(200) = '##PNL_Work_' + @Suffix;
    DECLARE @TempFinal NVARCHAR(200) = '##IPA_Final_' + @Suffix;

    BEGIN TRY
        PRINT 'sp_Consolidar_Cubo: Iniciando para Fondo ' + CAST(@ID_Fund AS NVARCHAR(10));

        -- ═══════════════════════════════════════════════════════════════════
        -- PASO 1: Crear tabla ##IPA_Final
        -- ═══════════════════════════════════════════════════════════════════

        SET @SQL = N'
        IF OBJECT_ID(''tempdb..' + @TempFinal + ''', ''U'') IS NOT NULL
            DROP TABLE ' + @TempFinal + ';

        CREATE TABLE ' + @TempFinal + ' (
            RowID INT IDENTITY(1,1) PRIMARY KEY,
            ID_Ejecucion BIGINT NOT NULL,
            ID_Proceso BIGINT NOT NULL,
            ID_Fund INT NOT NULL,
            PK2 NVARCHAR(50) NOT NULL,
            ID_Instrumento INT NOT NULL,
            id_CURR INT NOT NULL,
            FechaReporte NVARCHAR(10) NOT NULL,
            FechaCartera NVARCHAR(10) NOT NULL,
            BalanceSheet NVARCHAR(20) NOT NULL,
            Source NVARCHAR(50) NOT NULL,
            TipoRegistro NVARCHAR(50) NOT NULL,
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
        -- PASO 2: Insertar registros IPA (sin excluidos)
        -- ═══════════════════════════════════════════════════════════════════

        SET @SQL = N'
        INSERT INTO ' + @TempFinal + ' (
            ID_Ejecucion, ID_Proceso, ID_Fund, PK2, ID_Instrumento, id_CURR,
            FechaReporte, FechaCartera, BalanceSheet, Source, TipoRegistro,
            LocalPrice, Qty, OriginalFace, Factor, AI, MVBook, TotalMVal, TotalMVal_Balance
        )
        SELECT
            ID_Ejecucion, ID_Proceso, ID_Fund, PK2, ID_Instrumento, id_CURR,
            FechaReporte, FechaCartera, BalanceSheet, Source, ''IPA'',
            LocalPrice, Qty, OriginalFace, Factor, AI, MVBook, TotalMVal, TotalMVal_Balance
        FROM ' + @TempWork + '
        WHERE Flag_Excluir = 0
          AND ID_Instrumento IS NOT NULL
          AND id_CURR IS NOT NULL';

        EXEC sp_executesql @SQL;
        SET @RowsIPA = @@ROWCOUNT;
        PRINT 'sp_Consolidar_Cubo: ' + CAST(@RowsIPA AS NVARCHAR(10)) + ' registros IPA';

        -- ═══════════════════════════════════════════════════════════════════
        -- PASO 3: Insertar registros CAPM (si existe)
        -- ═══════════════════════════════════════════════════════════════════

        SET @SQL = N'
        IF OBJECT_ID(''tempdb..' + @TempCAPM + ''', ''U'') IS NOT NULL
        BEGIN
            INSERT INTO ' + @TempFinal + ' (
                ID_Ejecucion, ID_Proceso, ID_Fund, PK2, ID_Instrumento, id_CURR,
                FechaReporte, FechaCartera, BalanceSheet, Source, TipoRegistro,
                LocalPrice, Qty, OriginalFace, Factor, AI, MVBook, TotalMVal, TotalMVal_Balance
            )
            SELECT
                ID_Ejecucion, ID_Proceso, ID_Fund, PK2, ID_Instrumento, id_CURR,
                FechaReporte, FechaCartera, BalanceSheet, Source, ''CAPM'',
                LocalPrice, Qty, OriginalFace, Factor, AI, MVBook, TotalMVal, TotalMVal_Balance
            FROM ' + @TempCAPM + '
            WHERE ID_Instrumento IS NOT NULL
              AND id_CURR IS NOT NULL
        END';

        EXEC sp_executesql @SQL;
        SET @RowsCAPM = @@ROWCOUNT;
        PRINT 'sp_Consolidar_Cubo: ' + CAST(@RowsCAPM AS NVARCHAR(10)) + ' registros CAPM';

        -- ═══════════════════════════════════════════════════════════════════
        -- PASO 4: Insertar registros Derivados (si existe)
        -- ═══════════════════════════════════════════════════════════════════

        SET @SQL = N'
        IF OBJECT_ID(''tempdb..' + @TempDerivados + ''', ''U'') IS NOT NULL
        BEGIN
            INSERT INTO ' + @TempFinal + ' (
                ID_Ejecucion, ID_Proceso, ID_Fund, PK2, ID_Instrumento, id_CURR,
                FechaReporte, FechaCartera, BalanceSheet, Source, TipoRegistro,
                LocalPrice, Qty, OriginalFace, Factor, AI, MVBook, TotalMVal, TotalMVal_Balance
            )
            SELECT
                ID_Ejecucion, ID_Proceso, ID_Fund, PK2, ID_Instrumento, id_CURR,
                FechaReporte, FechaCartera, BalanceSheet, Source, ''DERIVADOS'',
                LocalPrice, Qty, OriginalFace, Factor, AI, MVBook, TotalMVal, TotalMVal_Balance
            FROM ' + @TempDerivados + '
            WHERE ID_Instrumento IS NOT NULL
              AND id_CURR IS NOT NULL
        END';

        EXEC sp_executesql @SQL;
        SET @RowsDerivados = @@ROWCOUNT;
        PRINT 'sp_Consolidar_Cubo: ' + CAST(@RowsDerivados AS NVARCHAR(10)) + ' registros Derivados';

        -- ═══════════════════════════════════════════════════════════════════
        -- PASO 5: Insertar registros de Ajustes (si existe)
        -- ═══════════════════════════════════════════════════════════════════

        SET @SQL = N'
        IF OBJECT_ID(''tempdb..' + @TempAjustes + ''', ''U'') IS NOT NULL
        BEGIN
            INSERT INTO ' + @TempFinal + ' (
                ID_Ejecucion, ID_Proceso, ID_Fund, PK2, ID_Instrumento, id_CURR,
                FechaReporte, FechaCartera, BalanceSheet, Source, TipoRegistro,
                LocalPrice, Qty, OriginalFace, Factor, AI, MVBook, TotalMVal, TotalMVal_Balance
            )
            SELECT
                ID_Ejecucion, ID_Proceso, ID_Fund, PK2, ID_Instrumento, id_CURR,
                FechaReporte, FechaCartera, BalanceSheet, Source,
                ''AJUSTE_'' + TipoAjuste AS TipoRegistro,
                LocalPrice, Qty, OriginalFace, Factor, AI, MVBook, TotalMVal, TotalMVal_Balance
            FROM ' + @TempAjustes + '
        END';

        EXEC sp_executesql @SQL;
        SET @RowsAjustes = @@ROWCOUNT;
        PRINT 'sp_Consolidar_Cubo: ' + CAST(@RowsAjustes AS NVARCHAR(10)) + ' registros Ajustes';

        -- ═══════════════════════════════════════════════════════════════════
        -- PASO 6: Calcular total de registros consolidados
        -- ═══════════════════════════════════════════════════════════════════

        SET @RowsFinal = @RowsIPA + @RowsCAPM + @RowsDerivados + @RowsAjustes;
        PRINT 'sp_Consolidar_Cubo: ' + CAST(@RowsFinal AS NVARCHAR(10)) + ' registros totales en ##IPA_Final';

        -- ═══════════════════════════════════════════════════════════════════
        -- PASO 7: Insertar en process.CUBO_Final con JOIN a PNL
        -- ═══════════════════════════════════════════════════════════════════

        -- Primero, eliminar registros anteriores del mismo fondo/fecha
        DELETE FROM process.CUBO_Final
        WHERE ID_Ejecucion = @ID_Ejecucion
          AND ID_Proceso = @ID_Proceso
          AND ID_Fund = @ID_Fund
          AND FechaReporte = @FechaReporte;

        SET @SQL = N'
        INSERT INTO process.CUBO_Final (
            ID_Ejecucion, ID_Proceso, ID_Fund, PK2, ID_Instrumento, id_CURR,
            FechaReporte, FechaCartera, BalanceSheet, Source, TipoRegistro,
            LocalPrice, Qty, OriginalFace, Factor, AI, MVBook, TotalMVal, TotalMVal_Balance,
            PRgain, PUgain, FxRgain, FxUgain, Income, TotGL, PctGL, BasisPoint,
            FechaProceso
        )
        SELECT
            f.ID_Ejecucion, f.ID_Proceso, f.ID_Fund, f.PK2, f.ID_Instrumento, f.id_CURR,
            f.FechaReporte, f.FechaCartera, f.BalanceSheet, f.Source, f.TipoRegistro,
            f.LocalPrice, f.Qty, f.OriginalFace, f.Factor, f.AI, f.MVBook, f.TotalMVal, f.TotalMVal_Balance,
            p.PRgain, p.PUgain, p.FxRgain, p.FxUgain, p.Income, p.TotGL, p.PctGL, p.BasisPoint,
            GETDATE()
        FROM ' + @TempFinal + ' f
        LEFT JOIN ' + @TempPNL + ' p
            ON f.ID_Instrumento = p.ID_Instrumento
            AND f.id_CURR = p.id_CURR
            AND f.ID_Fund = p.ID_Fund';

        -- Verificar si existe ##PNL_Work
        DECLARE @PNLExists BIT = 0;
        SET @SQL = N'IF OBJECT_ID(''tempdb..' + @TempPNL + ''', ''U'') IS NOT NULL SET @Exists = 1 ELSE SET @Exists = 0';
        EXEC sp_executesql @SQL, N'@Exists BIT OUTPUT', @PNLExists OUTPUT;

        IF @PNLExists = 1
        BEGIN
            -- Con JOIN a PNL
            SET @SQL = N'
            INSERT INTO process.CUBO_Final (
                ID_Ejecucion, ID_Proceso, ID_Fund, PK2, ID_Instrumento, id_CURR,
                FechaReporte, FechaCartera, BalanceSheet, Source, TipoRegistro,
                LocalPrice, Qty, OriginalFace, Factor, AI, MVBook, TotalMVal, TotalMVal_Balance,
                PRgain, PUgain, FxRgain, FxUgain, Income, TotGL, PctGL, BasisPoint,
                FechaProceso
            )
            SELECT
                f.ID_Ejecucion, f.ID_Proceso, f.ID_Fund, f.PK2, f.ID_Instrumento, f.id_CURR,
                f.FechaReporte, f.FechaCartera, f.BalanceSheet, f.Source, f.TipoRegistro,
                f.LocalPrice, f.Qty, f.OriginalFace, f.Factor, f.AI, f.MVBook, f.TotalMVal, f.TotalMVal_Balance,
                p.PRgain, p.PUgain, p.FxRgain, p.FxUgain, p.Income, p.TotGL, p.PctGL, p.BasisPoint,
                GETDATE()
            FROM ' + @TempFinal + ' f
            LEFT JOIN ' + @TempPNL + ' p
                ON f.ID_Instrumento = p.ID_Instrumento
                AND f.id_CURR = p.id_CURR
                AND f.ID_Fund = p.ID_Fund';
        END
        ELSE
        BEGIN
            -- Sin PNL
            SET @SQL = N'
            INSERT INTO process.CUBO_Final (
                ID_Ejecucion, ID_Proceso, ID_Fund, PK2, ID_Instrumento, id_CURR,
                FechaReporte, FechaCartera, BalanceSheet, Source, TipoRegistro,
                LocalPrice, Qty, OriginalFace, Factor, AI, MVBook, TotalMVal, TotalMVal_Balance,
                FechaProceso
            )
            SELECT
                ID_Ejecucion, ID_Proceso, ID_Fund, PK2, ID_Instrumento, id_CURR,
                FechaReporte, FechaCartera, BalanceSheet, Source, TipoRegistro,
                LocalPrice, Qty, OriginalFace, Factor, AI, MVBook, TotalMVal, TotalMVal_Balance,
                GETDATE()
            FROM ' + @TempFinal;
        END

        EXEC sp_executesql @SQL;
        SET @RowsCubo = @@ROWCOUNT;

        PRINT 'sp_Consolidar_Cubo: ' + CAST(@RowsCubo AS NVARCHAR(10)) + ' registros insertados en CUBO_Final';

        -- ═══════════════════════════════════════════════════════════════════
        -- PASO 8: Limpiar tablas temporales (si se solicitó)
        -- ═══════════════════════════════════════════════════════════════════

        IF @LimpiarTemporales = 1
        BEGIN
            EXEC staging.sp_CleanupTempTables
                @ID_Ejecucion = @ID_Ejecucion,
                @ID_Proceso = @ID_Proceso,
                @ID_Fund = @ID_Fund;
        END

        -- ═══════════════════════════════════════════════════════════════════
        -- RESUMEN
        -- ═══════════════════════════════════════════════════════════════════

        PRINT '========================================';
        PRINT 'sp_Consolidar_Cubo COMPLETADO';
        PRINT 'Fondo: ' + CAST(@ID_Fund AS NVARCHAR(10));
        PRINT 'Registros IPA: ' + CAST(@RowsIPA AS NVARCHAR(10));
        PRINT 'Registros CAPM: ' + CAST(@RowsCAPM AS NVARCHAR(10));
        PRINT 'Registros Derivados: ' + CAST(@RowsDerivados AS NVARCHAR(10));
        PRINT 'Registros Ajustes: ' + CAST(@RowsAjustes AS NVARCHAR(10));
        PRINT 'Total ##IPA_Final: ' + CAST(@RowsFinal AS NVARCHAR(10));
        PRINT 'Total CUBO_Final: ' + CAST(@RowsCubo AS NVARCHAR(10));
        PRINT 'Tiempo: ' + CAST(DATEDIFF(MILLISECOND, @StartTime, GETDATE()) AS NVARCHAR(10)) + ' ms';
        PRINT '========================================';

        RETURN 0;  -- OK

    END TRY
    BEGIN CATCH
        SET @ErrorCount = 1;

        -- Cleanup
        DECLARE @TablesToClean NVARCHAR(MAX) = @TempFinal;

        EXEC staging.sp_HandleError
            @ProcName = 'sp_Consolidar_Cubo',
            @ID_Ejecucion = @ID_Ejecucion,
            @ID_Proceso = @ID_Proceso,
            @ID_Fund = @ID_Fund,
            @TempTablesToClean = @TablesToClean,
            @ReturnCode = @ReturnCode OUTPUT,
            @ErrorMessage = @ErrorMessage OUTPUT;

        RETURN @ReturnCode;
    END CATCH
END;
GO

/*
================================================================================
SP: staging.sp_Process_Fund_Complete
Descripcion: Orquestador que ejecuta todo el pipeline para un fondo.
             Llama a todos los sp_Process_* en orden y luego consolida.

             Lee la configuracion de config.Requisitos_Extract para determinar
             que reportes procesar. NO usa flags manuales de skip.

Uso: Para ejecutar desde backend en una sola llamada.

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

    -- ═══════════════════════════════════════════════════════════════════
    -- PASO 0: Obtener requisitos del fondo desde config
    -- ═══════════════════════════════════════════════════════════════════

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
        PRINT 'ERROR en validacion: ' + ISNULL(@ErrorMessage, 'Codigo ' + CAST(@RC AS NVARCHAR(10)));
        RETURN @RC;
    END

    -- ═══════════════════════════════════════════════════════════════════
    -- PASO 2: Procesar IPA (siempre requerido)
    -- ═══════════════════════════════════════════════════════════════════

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
        SET @ErrorMessage = 'Error en sp_Process_IPA';
        RETURN @RC;
    END

    -- ═══════════════════════════════════════════════════════════════════
    -- PASO 3: Procesar CAPM (segun config)
    -- ═══════════════════════════════════════════════════════════════════

    IF @Req_CAPM = 1
    BEGIN
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
            SET @ErrorMessage = 'Error en sp_Process_CAPM';
            RETURN @RC;
        END
    END
    ELSE
        PRINT 'sp_Process_CAPM: OMITIDO (Req_CAPM=0)';

    -- ═══════════════════════════════════════════════════════════════════
    -- PASO 4: Procesar Derivados (segun config)
    -- ═══════════════════════════════════════════════════════════════════

    IF @Req_Derivados = 1
    BEGIN
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
            SET @ErrorMessage = 'Error en sp_Process_Derivados';
            RETURN @RC;
        END
    END
    ELSE
        PRINT 'sp_Process_Derivados: OMITIDO (Req_Derivados=0)';

    -- ═══════════════════════════════════════════════════════════════════
    -- PASO 5: Procesar SONA (segun config)
    -- ═══════════════════════════════════════════════════════════════════

    IF @Req_SONA = 1
    BEGIN
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
            SET @ErrorMessage = 'Error en sp_Process_SONA';
            RETURN @RC;
        END
    END
    ELSE
        PRINT 'sp_Process_SONA: OMITIDO (Req_SONA=0)';

    -- ═══════════════════════════════════════════════════════════════════
    -- PASO 6: Procesar PNL (segun config)
    -- ═══════════════════════════════════════════════════════════════════

    IF @Req_PNL = 1
    BEGIN
        EXEC @RC = staging.sp_Process_PNL
            @ID_Ejecucion = @ID_Ejecucion,
            @ID_Proceso = @ID_Proceso,
            @ID_Fund = @ID_Fund,
            @FechaReporte = @FechaReporte,
            @Portfolio = @Portfolio,
            @RowsProcessed = @RowsProcessed OUTPUT,
            @ErrorCount = @ErrorCount OUTPUT;

        -- PNL es opcional en el sentido que no falla el pipeline
        IF @RC NOT IN (0, 1)
        BEGIN
            PRINT 'WARNING: sp_Process_PNL retorno ' + CAST(@RC AS NVARCHAR(10));
        END
    END
    ELSE
        PRINT 'sp_Process_PNL: OMITIDO (Req_PNL=0)';

    -- ═══════════════════════════════════════════════════════════════════
    -- PASO 7: Consolidar a CUBO_Final
    -- ═══════════════════════════════════════════════════════════════════

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
        RETURN @RC;
    END

    -- ═══════════════════════════════════════════════════════════════════
    -- RESUMEN FINAL
    -- ═══════════════════════════════════════════════════════════════════

    PRINT '════════════════════════════════════════════════════════════════';
    PRINT 'sp_Process_Fund_Complete: COMPLETADO';
    PRINT 'Registros en CUBO_Final: ' + CAST(@RowsCubo AS NVARCHAR(10));
    PRINT 'Tiempo total: ' + CAST(DATEDIFF(MILLISECOND, @StartTime, GETDATE()) AS NVARCHAR(10)) + ' ms';
    PRINT '════════════════════════════════════════════════════════════════';

    SET @ReturnCode = 0;
    RETURN 0;
END;
GO
