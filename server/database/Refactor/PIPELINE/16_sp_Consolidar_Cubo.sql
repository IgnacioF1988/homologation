/*
================================================================================
SP: staging.sp_Consolidar_Cubo
Version: v2.0 - Con CHECKPOINT events
================================================================================
Descripción: Consolida datos procesados de IPA, CAPM, Derivados y Ajustes
             en la tabla process.CUBO_Final para análisis.
             - Combina datos de todas las tablas temporales
             - Hace JOIN con PNL si existe
             - Inserta en CUBO_Final
             - Opcionalmente limpia tablas temporales

Prerequisito: sp_Process_IPA debe haber completado (mínimo)
              Opcionalmente: sp_Process_CAPM, sp_Process_Derivados, sp_Process_PNL, sp_Process_SONA

CHECKPOINT Events emitidos:
  - VERIFIED ##IPA_Work (prerequisito obligatorio)
  - CONSUMED ##IPA_Work, ##CAPM_Work, ##Derivados_Work, ##Ajustes (según existan)
  - CREATED ##IPA_Final (consolidación completada)

Códigos de retorno:
  0  = OK
  3  = ERROR_CRITICO
  4  = ASSERTION_FAILED (##IPA_Work no existe)

Autor: Refactorización Pipeline IPA
Fecha: 2026-01-02
Modificado: 2026-01-09 - v2.0 con CHECKPOINT events
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
        -- ═══════════════════════════════════════════════════════════════════
        -- EVENTO: SP_INICIO
        -- ═══════════════════════════════════════════════════════════════════
        EXEC broker.sp_EmitirEvento
            @TipoEvento = 'SP_INICIO',
            @ID_Ejecucion = @ID_Ejecucion,
            @ID_Proceso = @ID_Proceso,
            @ID_Fund = @ID_Fund,
            @NombreSP = 'staging.sp_Consolidar_Cubo';

        PRINT 'sp_Consolidar_Cubo: Iniciando para Fondo ' + CAST(@ID_Fund AS NVARCHAR(10));

        -- ═══════════════════════════════════════════════════════════════════
        -- PASO 0: ASSERTION - Verificar prerequisito ##IPA_Work
        -- ═══════════════════════════════════════════════════════════════════

        DECLARE @IPAWorkExists BIT = 0;
        SET @SQL = N'IF OBJECT_ID(''tempdb..' + @TempWork + ''', ''U'') IS NOT NULL SET @Exists = 1';
        EXEC sp_executesql @SQL, N'@Exists BIT OUTPUT', @IPAWorkExists OUTPUT;

        IF @IPAWorkExists = 0
        BEGIN
            DECLARE @AssertMsg NVARCHAR(500) = 'ASSERTION_FAILED: Tabla ' + @TempWork + ' no existe. sp_Process_IPA no completó.';
            EXEC broker.sp_EmitirEvento @TipoEvento = 'ERROR', @ID_Ejecucion = @ID_Ejecucion, @ID_Proceso = @ID_Proceso, @ID_Fund = @ID_Fund, @NombreSP = 'staging.sp_Consolidar_Cubo', @CodigoRetorno = 4, @Detalles = @AssertMsg;
            RETURN 4;
        END

        -- CHECKPOINT: ##IPA_Work verificada
        DECLARE @ChkVerified NVARCHAR(500) = '{"operacion": "VERIFIED", "objeto": "' + @TempWork + '", "mensaje": "Prerequisito IPA Work existe"}';
        EXEC broker.sp_EmitirEvento @TipoEvento = 'CHECKPOINT', @ID_Ejecucion = @ID_Ejecucion, @ID_Proceso = @ID_Proceso, @ID_Fund = @ID_Fund, @NombreSP = 'staging.sp_Consolidar_Cubo', @Detalles = @ChkVerified;

        -- ═══════════════════════════════════════════════════════════════════
        -- PASO 1: Crear tabla temporal ##IPA_Final
        -- ═══════════════════════════════════════════════════════════════════

        SET @SQL = N'
        IF OBJECT_ID(''tempdb..' + @TempFinal + ''') IS NOT NULL
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
        -- PASO 2: Insertar IPA (sin excluidos)
        -- ═══════════════════════════════════════════════════════════════════

        SET @SQL = N'
        INSERT INTO ' + @TempFinal + ' (
            ID_Ejecucion, ID_Proceso, ID_Fund, PK2, ID_Instrumento, id_CURR, FechaReporte,
            FechaCartera, BalanceSheet, Source, TipoRegistro, LocalPrice, Qty, OriginalFace,
            Factor, AI, MVBook, TotalMVal, TotalMVal_Balance
        )
        SELECT
            ID_Ejecucion, ID_Proceso, ID_Fund, PK2, ID_Instrumento, id_CURR, FechaReporte,
            FechaCartera, BalanceSheet, Source, ''IPA'',
            LocalPrice, Qty, OriginalFace, Factor, AI, MVBook, TotalMVal, TotalMVal_Balance
        FROM ' + @TempWork + '
        WHERE Flag_Excluir = 0
          AND ID_Instrumento IS NOT NULL
          AND id_CURR IS NOT NULL';
        EXEC sp_executesql @SQL;
        SET @RowsIPA = @@ROWCOUNT;

        -- CHECKPOINT: CONSUMED ##IPA_Work
        DECLARE @ChkIPA NVARCHAR(500) = '{"operacion": "CONSUMED", "objeto": "' + @TempWork + '", "registros": ' + CAST(@RowsIPA AS NVARCHAR(10)) + '}';
        EXEC broker.sp_EmitirEvento @TipoEvento = 'CHECKPOINT', @ID_Ejecucion = @ID_Ejecucion, @ID_Proceso = @ID_Proceso, @ID_Fund = @ID_Fund, @NombreSP = 'staging.sp_Consolidar_Cubo', @Detalles = @ChkIPA;

        PRINT 'sp_Consolidar_Cubo: ' + CAST(@RowsIPA AS NVARCHAR(10)) + ' registros IPA';

        -- ═══════════════════════════════════════════════════════════════════
        -- PASO 3: Insertar CAPM (si existe)
        -- ═══════════════════════════════════════════════════════════════════

        SET @SQL = N'
        IF OBJECT_ID(''tempdb..' + @TempCAPM + ''') IS NOT NULL
        BEGIN
            INSERT INTO ' + @TempFinal + ' (
                ID_Ejecucion, ID_Proceso, ID_Fund, PK2, ID_Instrumento, id_CURR, FechaReporte,
                FechaCartera, BalanceSheet, Source, TipoRegistro, LocalPrice, Qty, OriginalFace,
                Factor, AI, MVBook, TotalMVal, TotalMVal_Balance
            )
            SELECT
                ID_Ejecucion, ID_Proceso, ID_Fund, PK2, ID_Instrumento, id_CURR, FechaReporte,
                FechaCartera, BalanceSheet, Source, ''CAPM'',
                LocalPrice, Qty, OriginalFace, Factor, AI, MVBook, TotalMVal, TotalMVal_Balance
            FROM ' + @TempCAPM + '
            WHERE ID_Instrumento IS NOT NULL
              AND id_CURR IS NOT NULL
        END';
        EXEC sp_executesql @SQL;
        SET @RowsCAPM = @@ROWCOUNT;

        -- CHECKPOINT: CONSUMED ##CAPM_Work (si hubo datos)
        IF @RowsCAPM > 0
        BEGIN
            DECLARE @ChkCAPM NVARCHAR(500) = '{"operacion": "CONSUMED", "objeto": "' + @TempCAPM + '", "registros": ' + CAST(@RowsCAPM AS NVARCHAR(10)) + '}';
            EXEC broker.sp_EmitirEvento @TipoEvento = 'CHECKPOINT', @ID_Ejecucion = @ID_Ejecucion, @ID_Proceso = @ID_Proceso, @ID_Fund = @ID_Fund, @NombreSP = 'staging.sp_Consolidar_Cubo', @Detalles = @ChkCAPM;
        END

        PRINT 'sp_Consolidar_Cubo: ' + CAST(@RowsCAPM AS NVARCHAR(10)) + ' registros CAPM';

        -- ═══════════════════════════════════════════════════════════════════
        -- PASO 4: Insertar Derivados (si existe)
        -- ═══════════════════════════════════════════════════════════════════

        SET @SQL = N'
        IF OBJECT_ID(''tempdb..' + @TempDerivados + ''') IS NOT NULL
        BEGIN
            INSERT INTO ' + @TempFinal + ' (
                ID_Ejecucion, ID_Proceso, ID_Fund, PK2, ID_Instrumento, id_CURR, FechaReporte,
                FechaCartera, BalanceSheet, Source, TipoRegistro, LocalPrice, Qty, OriginalFace,
                Factor, AI, MVBook, TotalMVal, TotalMVal_Balance
            )
            SELECT
                ID_Ejecucion, ID_Proceso, ID_Fund, PK2, ID_Instrumento, id_CURR, FechaReporte,
                FechaCartera, BalanceSheet, Source, ''DERIVADOS'',
                LocalPrice, Qty, OriginalFace, Factor, AI, MVBook, TotalMVal, TotalMVal_Balance
            FROM ' + @TempDerivados + '
            WHERE ID_Instrumento IS NOT NULL
              AND id_CURR IS NOT NULL
        END';
        EXEC sp_executesql @SQL;
        SET @RowsDerivados = @@ROWCOUNT;

        -- CHECKPOINT: CONSUMED ##Derivados_Work (si hubo datos)
        IF @RowsDerivados > 0
        BEGIN
            DECLARE @ChkDeriv NVARCHAR(500) = '{"operacion": "CONSUMED", "objeto": "' + @TempDerivados + '", "registros": ' + CAST(@RowsDerivados AS NVARCHAR(10)) + '}';
            EXEC broker.sp_EmitirEvento @TipoEvento = 'CHECKPOINT', @ID_Ejecucion = @ID_Ejecucion, @ID_Proceso = @ID_Proceso, @ID_Fund = @ID_Fund, @NombreSP = 'staging.sp_Consolidar_Cubo', @Detalles = @ChkDeriv;
        END

        PRINT 'sp_Consolidar_Cubo: ' + CAST(@RowsDerivados AS NVARCHAR(10)) + ' registros Derivados';

        -- ═══════════════════════════════════════════════════════════════════
        -- PASO 5: Insertar Ajustes (si existe)
        -- ═══════════════════════════════════════════════════════════════════

        SET @SQL = N'
        IF OBJECT_ID(''tempdb..' + @TempAjustes + ''') IS NOT NULL
        BEGIN
            INSERT INTO ' + @TempFinal + ' (
                ID_Ejecucion, ID_Proceso, ID_Fund, PK2, ID_Instrumento, id_CURR, FechaReporte,
                FechaCartera, BalanceSheet, Source, TipoRegistro, LocalPrice, Qty, OriginalFace,
                Factor, AI, MVBook, TotalMVal, TotalMVal_Balance
            )
            SELECT
                ID_Ejecucion, ID_Proceso, ID_Fund, PK2, ID_Instrumento, id_CURR, FechaReporte,
                FechaCartera, BalanceSheet, Source,
                ''AJUSTE_'' + TipoAjuste,
                LocalPrice, Qty, OriginalFace, Factor, AI, MVBook, TotalMVal, TotalMVal_Balance
            FROM ' + @TempAjustes + '
        END';
        EXEC sp_executesql @SQL;
        SET @RowsAjustes = @@ROWCOUNT;

        -- CHECKPOINT: CONSUMED ##Ajustes (si hubo datos)
        IF @RowsAjustes > 0
        BEGIN
            DECLARE @ChkAjustes NVARCHAR(500) = '{"operacion": "CONSUMED", "objeto": "' + @TempAjustes + '", "registros": ' + CAST(@RowsAjustes AS NVARCHAR(10)) + '}';
            EXEC broker.sp_EmitirEvento @TipoEvento = 'CHECKPOINT', @ID_Ejecucion = @ID_Ejecucion, @ID_Proceso = @ID_Proceso, @ID_Fund = @ID_Fund, @NombreSP = 'staging.sp_Consolidar_Cubo', @Detalles = @ChkAjustes;
        END

        PRINT 'sp_Consolidar_Cubo: ' + CAST(@RowsAjustes AS NVARCHAR(10)) + ' registros Ajustes';

        -- ═══════════════════════════════════════════════════════════════════
        -- PASO 6: Calcular total final
        -- ═══════════════════════════════════════════════════════════════════

        SET @RowsFinal = @RowsIPA + @RowsCAPM + @RowsDerivados + @RowsAjustes;

        -- CHECKPOINT: CREATED ##IPA_Final (consolidación completada)
        DECLARE @ChkFinal NVARCHAR(500) = '{"operacion": "CREATED", "objeto": "' + @TempFinal + '", "registros": ' + CAST(@RowsFinal AS NVARCHAR(10)) + '}';
        EXEC broker.sp_EmitirEvento @TipoEvento = 'CHECKPOINT', @ID_Ejecucion = @ID_Ejecucion, @ID_Proceso = @ID_Proceso, @ID_Fund = @ID_Fund, @NombreSP = 'staging.sp_Consolidar_Cubo', @Detalles = @ChkFinal;

        PRINT 'sp_Consolidar_Cubo: ' + CAST(@RowsFinal AS NVARCHAR(10)) + ' registros totales en ##IPA_Final';

        -- ═══════════════════════════════════════════════════════════════════
        -- PASO 7: Eliminar datos anteriores del CUBO para este fondo/ejecución
        -- ═══════════════════════════════════════════════════════════════════

        DELETE FROM process.CUBO_Final
        WHERE ID_Ejecucion = @ID_Ejecucion
          AND ID_Proceso = @ID_Proceso
          AND ID_Fund = @ID_Fund
          AND FechaReporte = @FechaReporte;

        -- ═══════════════════════════════════════════════════════════════════
        -- PASO 8: Insertar en CUBO_Final (con JOIN a PNL si existe)
        -- ═══════════════════════════════════════════════════════════════════

        DECLARE @PNLExists BIT = 0;
        SET @SQL = N'IF OBJECT_ID(''tempdb..' + @TempPNL + ''') IS NOT NULL SET @Exists = 1 ELSE SET @Exists = 0';
        EXEC sp_executesql @SQL, N'@Exists BIT OUTPUT', @PNLExists OUTPUT;

        IF @PNLExists = 1
        BEGIN
            SET @SQL = N'
            INSERT INTO process.CUBO_Final (
                ID_Ejecucion, ID_Proceso, ID_Fund, PK2, ID_Instrumento, id_CURR, FechaReporte,
                FechaCartera, BalanceSheet, Source, TipoRegistro, LocalPrice, Qty, OriginalFace,
                Factor, AI, MVBook, TotalMVal, TotalMVal_Balance,
                PRgain, PUgain, FxRgain, FxUgain, Income, TotGL, PctGL, BasisPoint,
                FechaProceso
            )
            SELECT
                f.ID_Ejecucion, f.ID_Proceso, f.ID_Fund, f.PK2, f.ID_Instrumento, f.id_CURR, f.FechaReporte,
                f.FechaCartera, f.BalanceSheet, f.Source, f.TipoRegistro, f.LocalPrice, f.Qty, f.OriginalFace,
                f.Factor, f.AI, f.MVBook, f.TotalMVal, f.TotalMVal_Balance,
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
            SET @SQL = N'
            INSERT INTO process.CUBO_Final (
                ID_Ejecucion, ID_Proceso, ID_Fund, PK2, ID_Instrumento, id_CURR, FechaReporte,
                FechaCartera, BalanceSheet, Source, TipoRegistro, LocalPrice, Qty, OriginalFace,
                Factor, AI, MVBook, TotalMVal, TotalMVal_Balance, FechaProceso
            )
            SELECT
                ID_Ejecucion, ID_Proceso, ID_Fund, PK2, ID_Instrumento, id_CURR, FechaReporte,
                FechaCartera, BalanceSheet, Source, TipoRegistro, LocalPrice, Qty, OriginalFace,
                Factor, AI, MVBook, TotalMVal, TotalMVal_Balance, GETDATE()
            FROM ' + @TempFinal;
        END

        EXEC sp_executesql @SQL;
        SET @RowsCubo = @@ROWCOUNT;

        PRINT 'sp_Consolidar_Cubo: ' + CAST(@RowsCubo AS NVARCHAR(10)) + ' registros insertados en CUBO_Final';

        -- ═══════════════════════════════════════════════════════════════════
        -- PASO 9: Limpiar tablas temporales (si configurado)
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

        DECLARE @DuracionMs INT = DATEDIFF(second, @StartTime, GETDATE()) * 1000;

        PRINT '========================================';
        PRINT 'sp_Consolidar_Cubo COMPLETADO';
        PRINT 'Fondo: ' + CAST(@ID_Fund AS NVARCHAR(10));
        PRINT 'IPA: ' + CAST(@RowsIPA AS NVARCHAR(10));
        PRINT 'CAPM: ' + CAST(@RowsCAPM AS NVARCHAR(10));
        PRINT 'Derivados: ' + CAST(@RowsDerivados AS NVARCHAR(10));
        PRINT 'Ajustes: ' + CAST(@RowsAjustes AS NVARCHAR(10));
        PRINT 'Total Final: ' + CAST(@RowsFinal AS NVARCHAR(10));
        PRINT 'CUBO_Final: ' + CAST(@RowsCubo AS NVARCHAR(10));
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
            @NombreSP = 'staging.sp_Consolidar_Cubo',
            @CodigoRetorno = 0,
            @DuracionMs = @DuracionMs,
            @RowsProcessed = @RowsCubo;

        RETURN 0;  -- OK

    END TRY
    BEGIN CATCH
        SET @ErrorCount = 1;

        -- ═══════════════════════════════════════════════════════════════════
        -- EVENTO: ERROR
        -- ═══════════════════════════════════════════════════════════════════
        DECLARE @ErrorMsg NVARCHAR(4000) = ERROR_MESSAGE();
        EXEC broker.sp_EmitirEvento
            @TipoEvento = 'ERROR',
            @ID_Ejecucion = @ID_Ejecucion,
            @ID_Proceso = @ID_Proceso,
            @ID_Fund = @ID_Fund,
            @NombreSP = 'staging.sp_Consolidar_Cubo',
            @CodigoRetorno = 3,
            @Detalles = @ErrorMsg;

        EXEC staging.sp_HandleError
            @ProcName = 'sp_Consolidar_Cubo',
            @ID_Ejecucion = @ID_Ejecucion,
            @ID_Proceso = @ID_Proceso,
            @ID_Fund = @ID_Fund,
            @TempTablesToClean = @TempFinal,
            @ReturnCode = @ReturnCode OUTPUT,
            @ErrorMessage = @ErrorMessage OUTPUT;

        RETURN @ReturnCode;
    END CATCH
END;
GO
