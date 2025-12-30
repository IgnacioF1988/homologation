-- =====================================================
-- MIGRATION 014: Fix PNL_05 and Consolidar_Fondo_A_Cubo_v3
-- Date: 2025-12-29
-- Description:
--   1. PNL_05: Quitar DROP ##temp tables y escritura a process.TBL_PNL_IPA
--   2. Consolidar_Fondo_A_Cubo_v3: Incluir ID_Proceso, corregir columnas
-- =====================================================

SET NOCOUNT ON;

PRINT '=== Migration 014: Fix PNL_05 and Consolidation ==='
PRINT 'Fecha: ' + CONVERT(VARCHAR, GETDATE(), 120);
PRINT '';

-- =====================================================
-- PARTE 1: Recrear PNL_05_Consolidar_IPA_PNL_v2
-- =====================================================
PRINT '>>> PARTE 1: Recreando staging.PNL_05_Consolidar_IPA_PNL_v2...';

IF OBJECT_ID('staging.PNL_05_Consolidar_IPA_PNL_v2', 'P') IS NOT NULL
    DROP PROCEDURE staging.PNL_05_Consolidar_IPA_PNL_v2;
GO

CREATE PROCEDURE [staging].[PNL_05_Consolidar_IPA_PNL_v2]
    @ID_Ejecucion BIGINT,
    @FechaReporte NVARCHAR(10),
    @ID_Fund INT,
    @Portfolio_PNL NVARCHAR(50),
    @DebugMode BIT = 0,
    @RowsProcessed INT OUTPUT,
    @ErrorCount INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @StartTime DATETIME = GETDATE();
    DECLARE @IPACount INT, @PNLCount INT, @AjusteCount INT;
    DECLARE @TotalMValIPA FLOAT;
    DECLARE @ProcName NVARCHAR(100) = 'PNL_05_v2';

    DECLARE @TempIPAFinal NVARCHAR(200) = '##IPA_Final_' + CAST(@ID_Ejecucion AS NVARCHAR(20)) + '_' + CAST(@ID_Fund AS NVARCHAR(10));
    DECLARE @TempPNLFinal NVARCHAR(200) = '##PNL_Final_' + CAST(@ID_Ejecucion AS NVARCHAR(20)) + '_' + CAST(@ID_Fund AS NVARCHAR(10));
    DECLARE @TempAjustePNL NVARCHAR(200) = '##Ajuste_PNL_' + CAST(@ID_Ejecucion AS NVARCHAR(20)) + '_' + CAST(@ID_Fund AS NVARCHAR(10));
    DECLARE @SQL NVARCHAR(MAX);

    SET @RowsProcessed = 0;
    SET @ErrorCount = 0;

    BEGIN TRY
        IF @ID_Ejecucion IS NULL OR @ID_Ejecucion <= 0
        BEGIN
            SET @ErrorCount = 1;
            PRINT 'PNL_05_v2 ERROR: ID_Ejecucion inválido';
            RETURN 3;
        END

        IF @ID_Fund IS NULL OR @ID_Fund <= 0
        BEGIN
            SET @ErrorCount = 1;
            PRINT 'PNL_05_v2 ERROR: ID_Fund inválido';
            RETURN 3;
        END

        -- Verificar ##IPA_Final
        IF OBJECT_ID('tempdb..' + @TempIPAFinal, 'U') IS NULL
        BEGIN
            SET @ErrorCount = 1;
            PRINT @ProcName + ': ##IPA_Final no existe';
            RETURN 3;
        END

        SET @SQL = 'SELECT @IPACount = COUNT(*) FROM ' + @TempIPAFinal +
                   ' WHERE ID_Ejecucion = @p_ID_Ejecucion AND ID_Fund = @p_ID_Fund';
        EXEC sp_executesql @SQL,
            N'@p_ID_Ejecucion BIGINT, @p_ID_Fund INT, @IPACount INT OUTPUT',
            @ID_Ejecucion, @ID_Fund, @IPACount OUTPUT;

        IF @IPACount = 0
        BEGIN
            SET @ErrorCount = 1;
            PRINT @ProcName + ': Sin datos en ##IPA_Final';
            RETURN 3;
        END

        -- Verificar ##PNL_Final
        IF OBJECT_ID('tempdb..' + @TempPNLFinal, 'U') IS NULL
        BEGIN
            SET @ErrorCount = 1;
            PRINT @ProcName + ': ##PNL_Final no existe';
            RETURN 3;
        END

        SET @SQL = 'SELECT @PNLCount = COUNT(*) FROM ' + @TempPNLFinal +
                   ' WHERE ID_Ejecucion = @p_ID_Ejecucion AND ID_Fund = @p_ID_Fund';
        EXEC sp_executesql @SQL,
            N'@p_ID_Ejecucion BIGINT, @p_ID_Fund INT, @PNLCount INT OUTPUT',
            @ID_Ejecucion, @ID_Fund, @PNLCount OUTPUT;

        IF @PNLCount = 0
        BEGIN
            SET @ErrorCount = 1;
            PRINT @ProcName + ': Sin datos en ##PNL_Final';
            RETURN 3;
        END

        -- Verificar ##Ajuste_PNL (opcional)
        SET @AjusteCount = 0;
        IF OBJECT_ID('tempdb..' + @TempAjustePNL, 'U') IS NOT NULL
        BEGIN
            SET @SQL = 'SELECT @AjusteCount = COUNT(*) FROM ' + @TempAjustePNL +
                       ' WHERE ID_Ejecucion = @p_ID_Ejecucion AND ID_Fund = @p_ID_Fund';
            EXEC sp_executesql @SQL,
                N'@p_ID_Ejecucion BIGINT, @p_ID_Fund INT, @AjusteCount INT OUTPUT',
                @ID_Ejecucion, @ID_Fund, @AjusteCount OUTPUT;
        END

        -- TotalMVal para validación
        SET @SQL = 'SELECT @TotalMValIPA = ISNULL(SUM(TotalMVal), 0) FROM ' + @TempIPAFinal +
                   ' WHERE ID_Ejecucion = @p_ID_Ejecucion AND ID_Fund = @p_ID_Fund';
        EXEC sp_executesql @SQL,
            N'@p_ID_Ejecucion BIGINT, @p_ID_Fund INT, @TotalMValIPA FLOAT OUTPUT',
            @ID_Ejecucion, @ID_Fund, @TotalMValIPA OUTPUT;

        SET @RowsProcessed = @IPACount + @AjusteCount;

        -- =====================================================
        -- NOTA: NO escribimos a process.TBL_PNL_IPA
        -- NOTA: NO hacemos DROP de ##temp tables
        -- Consolidar_Fondo_A_Cubo_v3 las usará después
        -- =====================================================

        PRINT @ProcName + ' OK: IPA=' + CAST(@IPACount AS VARCHAR(10)) +
              ', PNL=' + CAST(@PNLCount AS VARCHAR(10)) +
              ', Ajuste=' + CAST(@AjusteCount AS VARCHAR(10)) +
              ' | TotalMVal: ' + FORMAT(@TotalMValIPA, 'N2') +
              ' | ' + CAST(DATEDIFF(MILLISECOND, @StartTime, GETDATE()) AS VARCHAR) + 'ms';
        RETURN 0;

    END TRY
    BEGIN CATCH
        SET @ErrorCount = 1;
        PRINT @ProcName + ' ERROR: ' + ERROR_MESSAGE();

        IF ERROR_NUMBER() = 1205 RETURN 2;
        IF ERROR_NUMBER() IN (-2, 1222) RETURN 2;
        RETURN 3;
    END CATCH
END;
GO

PRINT '    CREATED staging.PNL_05_Consolidar_IPA_PNL_v2';
PRINT '';

-- =====================================================
-- PARTE 2: Recrear Consolidar_Fondo_A_Cubo_v3
-- Incluye ID_Proceso
-- =====================================================
PRINT '>>> PARTE 2: Recreando staging.Consolidar_Fondo_A_Cubo_v3...';

IF OBJECT_ID('staging.Consolidar_Fondo_A_Cubo_v3', 'P') IS NOT NULL
    DROP PROCEDURE staging.Consolidar_Fondo_A_Cubo_v3;
GO

CREATE PROCEDURE staging.Consolidar_Fondo_A_Cubo_v3
    @ID_Ejecucion BIGINT,
    @ID_Fund INT,
    @ID_Proceso BIGINT = NULL,
    @FechaReporte VARCHAR(10) = NULL,
    @Debug BIT = 0
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @StartTime DATETIME = GETDATE();
    DECLARE @SQL NVARCHAR(MAX);
    DECLARE @ErrorMsg NVARCHAR(MAX);
    DECLARE @FechaProceso NVARCHAR(50) = CONVERT(NVARCHAR(50), GETDATE(), 120);

    DECLARE @TempIPAFinal NVARCHAR(200) = '##IPA_Final_' + CAST(@ID_Ejecucion AS NVARCHAR(20)) + '_' + CAST(@ID_Fund AS NVARCHAR(10));
    DECLARE @TempCAPMWork NVARCHAR(200) = '##CAPM_Work_' + CAST(@ID_Ejecucion AS NVARCHAR(20)) + '_' + CAST(@ID_Fund AS NVARCHAR(10));
    DECLARE @TempPNLFinal NVARCHAR(200) = '##PNL_Final_' + CAST(@ID_Ejecucion AS NVARCHAR(20)) + '_' + CAST(@ID_Fund AS NVARCHAR(10));

    DECLARE @Rows_IPA INT = 0, @Rows_CAPM INT = 0, @Rows_PNL INT = 0;
    DECLARE @Rows_Derivados INT = 0, @Rows_UBS INT = 0, @TotalRows INT = 0;

    BEGIN TRY
        IF @ID_Ejecucion IS NULL OR @ID_Ejecucion <= 0 OR @ID_Fund IS NULL OR @ID_Fund <= 0
        BEGIN
            RAISERROR('Parámetros inválidos', 16, 1);
            RETURN 3;
        END

        DELETE FROM process.CUBO_Final WHERE ID_Ejecucion = @ID_Ejecucion AND ID_Fund = @ID_Fund;

        -- IPA
        IF OBJECT_ID('tempdb..' + @TempIPAFinal, 'U') IS NOT NULL
        BEGIN
            SET @SQL = '
            INSERT INTO process.CUBO_Final
            (ID_Ejecucion, ID_Fund, ID_Proceso, TipoRegistro, PK2, ID_Instrumento, id_CURR,
             FechaReporte, FechaCartera, BalanceSheet, Source, LocalPrice, Qty,
             OriginalFace, Factor, AI, MVBook, TotalMVal, TotalMVal_Balance, FechaProceso)
            SELECT @p_ID_Ejecucion, @p_ID_Fund, @p_ID_Proceso, ''IPA'', PK2, ID_Instrumento, id_CURR,
                FechaReporte, FechaCartera, BalanceSheet, Source, LocalPrice, Qty,
                OriginalFace, Factor, AI, MVBook, TotalMVal, TotalMVal_Balance, @p_FechaProceso
            FROM ' + @TempIPAFinal + '
            WHERE ID_Ejecucion = @p_ID_Ejecucion AND ID_Fund = @p_ID_Fund';
            EXEC sp_executesql @SQL,
                N'@p_ID_Ejecucion BIGINT, @p_ID_Fund INT, @p_ID_Proceso BIGINT, @p_FechaProceso NVARCHAR(50)',
                @ID_Ejecucion, @ID_Fund, @ID_Proceso, @FechaProceso;
            SET @Rows_IPA = @@ROWCOUNT;
        END

        -- CAPM
        IF OBJECT_ID('tempdb..' + @TempCAPMWork, 'U') IS NOT NULL
        BEGIN
            SET @SQL = '
            INSERT INTO process.CUBO_Final
            (ID_Ejecucion, ID_Fund, ID_Proceso, TipoRegistro, PK2, ID_Instrumento, id_CURR,
             FechaReporte, FechaCartera, BalanceSheet, Source, LocalPrice, Qty,
             OriginalFace, Factor, AI, MVBook, TotalMVal, TotalMVal_Balance, FechaProceso)
            SELECT @p_ID_Ejecucion, @p_ID_Fund, @p_ID_Proceso, ''CAPM'', PK2, ID_Instrumento, id_CURR,
                FechaReporte, FechaCartera, BalanceSheet, Source, LocalPrice, Qty,
                OriginalFace, Factor, AI, MVBook, TotalMVal, TotalMVal_Balance, @p_FechaProceso
            FROM ' + @TempCAPMWork + '
            WHERE ID_Ejecucion = @p_ID_Ejecucion AND ID_Fund = @p_ID_Fund';
            EXEC sp_executesql @SQL,
                N'@p_ID_Ejecucion BIGINT, @p_ID_Fund INT, @p_ID_Proceso BIGINT, @p_FechaProceso NVARCHAR(50)',
                @ID_Ejecucion, @ID_Fund, @ID_Proceso, @FechaProceso;
            SET @Rows_CAPM = @@ROWCOUNT;
        END

        -- PNL: JOIN IPA + PNL
        IF OBJECT_ID('tempdb..' + @TempIPAFinal, 'U') IS NOT NULL
           AND OBJECT_ID('tempdb..' + @TempPNLFinal, 'U') IS NOT NULL
        BEGIN
            SET @SQL = '
            INSERT INTO process.CUBO_Final
            (ID_Ejecucion, ID_Fund, ID_Proceso, TipoRegistro, PK2, ID_Instrumento, id_CURR,
             FechaReporte, FechaCartera, BalanceSheet, Source, LocalPrice, Qty,
             OriginalFace, Factor, AI, MVBook, TotalMVal, TotalMVal_Balance,
             PRgain, PUgain, FxRgain, FxUgain, Income, TotGL, PctGL, BasisPoint, FechaProceso)
            SELECT ipa.ID_Ejecucion, ipa.ID_Fund, @p_ID_Proceso, ''PNL'', ipa.PK2, ipa.ID_Instrumento, ipa.id_CURR,
                ipa.FechaReporte, ipa.FechaCartera, ipa.BalanceSheet, ipa.Source,
                ipa.LocalPrice, ipa.Qty, ipa.OriginalFace, ipa.Factor,
                ipa.AI, ipa.MVBook, ipa.TotalMVal, ipa.TotalMVal_Balance,
                ISNULL(pnl.PRgain, 0), ISNULL(pnl.PUgain, 0),
                ISNULL(pnl.FxRgain, 0), ISNULL(pnl.FxUgain, 0),
                ISNULL(pnl.Income, 0), ISNULL(pnl.TotGL, 0),
                ISNULL(pnl.PctGL, 0), ISNULL(pnl.BasisPoint, 0), @p_FechaProceso
            FROM ' + @TempIPAFinal + ' ipa
            LEFT JOIN ' + @TempPNLFinal + ' pnl
                ON ipa.ID_Instrumento = pnl.ID_Instrumento
                AND ipa.id_CURR = pnl.id_CURR
                AND ipa.ID_Ejecucion = pnl.ID_Ejecucion
                AND ipa.ID_Fund = pnl.ID_Fund
            WHERE ipa.ID_Ejecucion = @p_ID_Ejecucion AND ipa.ID_Fund = @p_ID_Fund';
            EXEC sp_executesql @SQL,
                N'@p_ID_Ejecucion BIGINT, @p_ID_Fund INT, @p_ID_Proceso BIGINT, @p_FechaProceso NVARCHAR(50)',
                @ID_Ejecucion, @ID_Fund, @ID_Proceso, @FechaProceso;
            SET @Rows_PNL = @@ROWCOUNT;
        END

        SET @TotalRows = @Rows_IPA + @Rows_CAPM + @Rows_PNL;

        INSERT INTO logs.Ejecucion_Logs (ID_Ejecucion, ID_Fund, Timestamp, Nivel, Categoria, Etapa, Mensaje)
        VALUES (@ID_Ejecucion, @ID_Fund, GETDATE(), 'INFO', 'PIPELINE', 'CONSOLIDAR_CUBO',
            'Fondo ' + CAST(@ID_Fund AS VARCHAR) + ': ' + CAST(@TotalRows AS VARCHAR) +
            ' regs (IPA:' + CAST(@Rows_IPA AS VARCHAR) +
            ', CAPM:' + CAST(@Rows_CAPM AS VARCHAR) +
            ', PNL:' + CAST(@Rows_PNL AS VARCHAR) + ')');

        SELECT @ID_Ejecucion AS ID_Ejecucion, @ID_Fund AS ID_Fund, @TotalRows AS TotalRows,
            @Rows_IPA AS Rows_IPA, @Rows_CAPM AS Rows_CAPM, @Rows_PNL AS Rows_PNL,
            0 AS ReturnCode, 'OK' AS Status;

        RETURN 0;

    END TRY
    BEGIN CATCH
        SET @ErrorMsg = ERROR_MESSAGE();
        INSERT INTO logs.Ejecucion_Logs (ID_Ejecucion, ID_Fund, Timestamp, Nivel, Categoria, Etapa, Mensaje)
        VALUES (@ID_Ejecucion, @ID_Fund, GETDATE(), 'ERROR', 'PIPELINE', 'CONSOLIDAR_CUBO', 'ERROR: ' + @ErrorMsg);
        SELECT @ID_Ejecucion AS ID_Ejecucion, @ID_Fund AS ID_Fund, 0 AS TotalRows,
            0 AS Rows_IPA, 0 AS Rows_CAPM, 0 AS Rows_PNL, 3 AS ReturnCode, @ErrorMsg AS Status;
        RETURN 3;
    END CATCH
END;
GO

PRINT '    CREATED staging.Consolidar_Fondo_A_Cubo_v3';
PRINT '';
PRINT '=== Migration 014 completada ==='
