-- =====================================================
-- MIGRATION 012b: Create staging.Consolidar_Fondo_A_Cubo_v3
-- Date: 2025-12-29
-- Description: SP que consolida todas las ##temp tables
--              de un fondo y las escribe al CUBO_Final
--              Ejecutar AL FINAL del pipeline de cada fondo
-- =====================================================

SET NOCOUNT ON;

PRINT '=== Migration 012b: Create Consolidar_Fondo_A_Cubo_v3 ==='
PRINT 'Fecha: ' + CONVERT(VARCHAR, GETDATE(), 120);
PRINT '';

-- =====================================================
-- Crear staging.Consolidar_Fondo_A_Cubo_v3
-- =====================================================
PRINT '>>> Creando staging.Consolidar_Fondo_A_Cubo_v3...';

IF OBJECT_ID('staging.Consolidar_Fondo_A_Cubo_v3', 'P') IS NOT NULL
    DROP PROCEDURE staging.Consolidar_Fondo_A_Cubo_v3;
GO

CREATE PROCEDURE staging.Consolidar_Fondo_A_Cubo_v3
    @ID_Ejecucion BIGINT,
    @ID_Fund INT,
    @FechaReporte NVARCHAR(10) = NULL,
    @Debug BIT = 0
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @StartTime DATETIME = GETDATE();
    DECLARE @SQL NVARCHAR(MAX);
    DECLARE @FechaProceso NVARCHAR(50) = CONVERT(NVARCHAR(50), GETDATE(), 120);

    -- Contadores por tipo
    DECLARE @Count_IPA INT = 0;
    DECLARE @Count_CAPM INT = 0;
    DECLARE @Count_PNL INT = 0;
    DECLARE @Count_Derivados INT = 0;
    DECLARE @Count_MLCCII INT = 0;
    DECLARE @Count_MLCCII_Deriv INT = 0;
    DECLARE @TotalInserted INT = 0;

    -- Nombres de tablas temporales
    DECLARE @TempIPA NVARCHAR(200) = '##IPA_Final_' + CAST(@ID_Ejecucion AS NVARCHAR(20)) + '_' + CAST(@ID_Fund AS NVARCHAR(10));
    DECLARE @TempCAPM NVARCHAR(200) = '##CAPM_Work_' + CAST(@ID_Ejecucion AS NVARCHAR(20)) + '_' + CAST(@ID_Fund AS NVARCHAR(10));
    DECLARE @TempAjusteCAPM NVARCHAR(200) = '##Ajuste_CAPM_' + CAST(@ID_Ejecucion AS NVARCHAR(20)) + '_' + CAST(@ID_Fund AS NVARCHAR(10));
    DECLARE @TempPNL NVARCHAR(200) = '##PNL_Final_' + CAST(@ID_Ejecucion AS NVARCHAR(20)) + '_' + CAST(@ID_Fund AS NVARCHAR(10));
    DECLARE @TempAjustePNL NVARCHAR(200) = '##Ajuste_PNL_' + CAST(@ID_Ejecucion AS NVARCHAR(20)) + '_' + CAST(@ID_Fund AS NVARCHAR(10));
    DECLARE @TempDerivados NVARCHAR(200) = '##Derivados_Work_' + CAST(@ID_Ejecucion AS NVARCHAR(20)) + '_' + CAST(@ID_Fund AS NVARCHAR(10));
    DECLARE @TempAjusteDerivados NVARCHAR(200) = '##Ajuste_Derivados_' + CAST(@ID_Ejecucion AS NVARCHAR(20)) + '_' + CAST(@ID_Fund AS NVARCHAR(10));
    DECLARE @TempUBS NVARCHAR(200) = '##UBS_Work_' + CAST(@ID_Ejecucion AS NVARCHAR(20)) + '_' + CAST(@ID_Fund AS NVARCHAR(10));

    BEGIN TRY
        IF @ID_Ejecucion IS NULL OR @ID_Ejecucion <= 0 OR @ID_Fund IS NULL OR @ID_Fund <= 0
        BEGIN
            PRINT 'Consolidar_Fondo_A_Cubo_v3 ERROR: Parámetros inválidos';
            RETURN 3;
        END

        IF @Debug = 1 PRINT 'Consolidar_Fondo_A_Cubo_v3: ID_Ejecucion=' + CAST(@ID_Ejecucion AS VARCHAR) + ', ID_Fund=' + CAST(@ID_Fund AS VARCHAR);

        -- PASO 1: Limpiar datos previos de este fondo (idempotencia)
        DELETE FROM process.CUBO_Final
        WHERE ID_Ejecucion = @ID_Ejecucion AND ID_Fund = @ID_Fund;

        IF @Debug = 1 PRINT '  Datos previos eliminados: ' + CAST(@@ROWCOUNT AS VARCHAR);

        -- =====================================================
        -- PASO 2: Insertar IPA desde ##IPA_Final
        -- =====================================================
        IF OBJECT_ID('tempdb..' + @TempIPA, 'U') IS NOT NULL
        BEGIN
            SET @SQL = N'
            INSERT INTO process.CUBO_Final (
                ID_Ejecucion, ID_Fund, TipoRegistro,
                PK2, ID_Instrumento, id_CURR, FechaReporte, FechaCartera,
                BalanceSheet, Source, LocalPrice, Qty, OriginalFace, Factor,
                AI, MVBook, TotalMVal, TotalMVal_Balance, FechaProceso
            )
            SELECT
                @p_ID_Ejecucion, @p_ID_Fund, ''IPA'',
                PK2, CAST(ID_Instrumento AS NVARCHAR(MAX)), CAST(id_CURR AS NVARCHAR(MAX)),
                FechaReporte, FechaCartera,
                BalanceSheet, Source, LocalPrice, Qty, OriginalFace, Factor,
                AI, MVBook, TotalMVal, TotalMVal_Balance, @p_FechaProceso
            FROM ' + @TempIPA + '
            WHERE ID_Ejecucion = @p_ID_Ejecucion AND ID_Fund = @p_ID_Fund;';

            EXEC sp_executesql @SQL,
                N'@p_ID_Ejecucion BIGINT, @p_ID_Fund INT, @p_FechaProceso NVARCHAR(50)',
                @ID_Ejecucion, @ID_Fund, @FechaProceso;

            SET @Count_IPA = @@ROWCOUNT;
            IF @Debug = 1 PRINT '  IPA insertados: ' + CAST(@Count_IPA AS VARCHAR);
        END

        -- =====================================================
        -- PASO 3: Insertar CAPM desde ##CAPM_Work + ##Ajuste_CAPM
        -- =====================================================
        IF OBJECT_ID('tempdb..' + @TempCAPM, 'U') IS NOT NULL
        BEGIN
            SET @SQL = N'
            INSERT INTO process.CUBO_Final (
                ID_Ejecucion, ID_Fund, TipoRegistro,
                PK2, ID_Instrumento, id_CURR, FechaReporte, FechaCartera,
                BalanceSheet, Source, LocalPrice, Qty, OriginalFace, Factor,
                AI, MVBook, TotalMVal, TotalMVal_Balance, FechaProceso
            )
            SELECT
                @p_ID_Ejecucion, @p_ID_Fund, ''CAPM'',
                PK2, CAST(ID_Instrumento AS NVARCHAR(MAX)), CAST(id_CURR AS NVARCHAR(MAX)),
                FechaReporte, FechaCartera,
                BalanceSheet, Source, LocalPrice, Qty, OriginalFace, Factor,
                AI, MVBook, TotalMVal, TotalMVal_Balance, @p_FechaProceso
            FROM ' + @TempCAPM + '
            WHERE ID_Fund = @p_ID_Fund;';

            EXEC sp_executesql @SQL,
                N'@p_ID_Ejecucion BIGINT, @p_ID_Fund INT, @p_FechaProceso NVARCHAR(50)',
                @ID_Ejecucion, @ID_Fund, @FechaProceso;

            SET @Count_CAPM = @@ROWCOUNT;
            IF @Debug = 1 PRINT '  CAPM insertados: ' + CAST(@Count_CAPM AS VARCHAR);
        END

        -- Ajustes CAPM
        IF OBJECT_ID('tempdb..' + @TempAjusteCAPM, 'U') IS NOT NULL
        BEGIN
            SET @SQL = N'
            INSERT INTO process.CUBO_Final (
                ID_Ejecucion, ID_Fund, TipoRegistro,
                PK2, ID_Instrumento, id_CURR, FechaReporte, FechaCartera,
                BalanceSheet, Source, LocalPrice, Qty, OriginalFace, Factor,
                AI, MVBook, TotalMVal, TotalMVal_Balance, FechaProceso
            )
            SELECT
                ID_Ejecucion, ID_Fund, ''CAPM'',
                PK2, CAST(ID_Instrumento AS NVARCHAR(MAX)), CAST(id_CURR AS NVARCHAR(MAX)),
                FechaReporte, FechaCartera,
                BalanceSheet, Source, LocalPrice, Qty, OriginalFace, Factor,
                AI, MVBook, TotalMVal, TotalMVal_Balance, @p_FechaProceso
            FROM ' + @TempAjusteCAPM + '
            WHERE ID_Ejecucion = @p_ID_Ejecucion AND ID_Fund = @p_ID_Fund;';

            EXEC sp_executesql @SQL,
                N'@p_ID_Ejecucion BIGINT, @p_ID_Fund INT, @p_FechaProceso NVARCHAR(50)',
                @ID_Ejecucion, @ID_Fund, @FechaProceso;

            SET @Count_CAPM = @Count_CAPM + @@ROWCOUNT;
        END

        -- =====================================================
        -- PASO 4: Insertar PNL desde ##IPA_Final + ##PNL_Final (cruzados)
        -- =====================================================
        IF OBJECT_ID('tempdb..' + @TempIPA, 'U') IS NOT NULL AND OBJECT_ID('tempdb..' + @TempPNL, 'U') IS NOT NULL
        BEGIN
            SET @SQL = N'
            INSERT INTO process.CUBO_Final (
                ID_Ejecucion, ID_Fund, TipoRegistro,
                PK2, ID_Instrumento, id_CURR, FechaReporte, FechaCartera,
                BalanceSheet, Source, LocalPrice, Qty, OriginalFace, Factor,
                AI, MVBook, TotalMVal, TotalMVal_Balance,
                PRgain, PUgain, FxRgain, FxUgain, Income, TotGL, PctGL, BasisPoint,
                FechaProceso
            )
            SELECT
                @p_ID_Ejecucion, @p_ID_Fund, ''PNL'',
                ipa.PK2, CAST(ipa.ID_Instrumento AS NVARCHAR(MAX)), CAST(ipa.id_CURR AS NVARCHAR(MAX)),
                ipa.FechaReporte, ipa.FechaCartera,
                ipa.BalanceSheet, ipa.Source, ipa.LocalPrice, ipa.Qty, ipa.OriginalFace, ipa.Factor,
                ipa.AI, ipa.MVBook, ipa.TotalMVal, ipa.TotalMVal_Balance,
                ISNULL(pnl.PRgain, 0), ISNULL(pnl.PUgain, 0), ISNULL(pnl.FxRgain, 0), ISNULL(pnl.FxUgain, 0),
                ISNULL(pnl.Income, 0), ISNULL(pnl.TotGL, 0), ISNULL(pnl.PctGL, 0), ISNULL(pnl.BasisPoint, 0),
                @p_FechaProceso
            FROM ' + @TempIPA + ' ipa
            LEFT JOIN ' + @TempPNL + ' pnl
                ON ipa.ID_Instrumento = pnl.ID_Instrumento
                AND ipa.id_CURR = pnl.id_CURR
                AND ipa.ID_Ejecucion = pnl.ID_Ejecucion
                AND ipa.ID_Fund = pnl.ID_Fund
            WHERE ipa.ID_Ejecucion = @p_ID_Ejecucion AND ipa.ID_Fund = @p_ID_Fund;';

            EXEC sp_executesql @SQL,
                N'@p_ID_Ejecucion BIGINT, @p_ID_Fund INT, @p_FechaProceso NVARCHAR(50)',
                @ID_Ejecucion, @ID_Fund, @FechaProceso;

            SET @Count_PNL = @@ROWCOUNT;
            IF @Debug = 1 PRINT '  PNL insertados: ' + CAST(@Count_PNL AS VARCHAR);
        END

        -- Ajustes PNL
        IF OBJECT_ID('tempdb..' + @TempAjustePNL, 'U') IS NOT NULL
        BEGIN
            SET @SQL = N'
            INSERT INTO process.CUBO_Final (
                ID_Ejecucion, ID_Fund, TipoRegistro,
                PK2, ID_Instrumento, id_CURR, FechaReporte, FechaCartera,
                BalanceSheet, Source, LocalPrice, Qty, OriginalFace, Factor,
                AI, MVBook, TotalMVal, TotalMVal_Balance,
                FechaProceso, EsAjuste
            )
            SELECT
                ID_Ejecucion, ID_Fund, ''PNL'',
                PK2, CAST(ID_Instrumento AS NVARCHAR(MAX)), CAST(id_CURR AS NVARCHAR(MAX)),
                FechaReporte, FechaCartera,
                BalanceSheet, Source, LocalPrice, Qty, OriginalFace, Factor,
                AI, MVBook, TotalMVal, TotalMVal_Balance,
                @p_FechaProceso, ''SI''
            FROM ' + @TempAjustePNL + '
            WHERE ID_Ejecucion = @p_ID_Ejecucion AND ID_Fund = @p_ID_Fund;';

            EXEC sp_executesql @SQL,
                N'@p_ID_Ejecucion BIGINT, @p_ID_Fund INT, @p_FechaProceso NVARCHAR(50)',
                @ID_Ejecucion, @ID_Fund, @FechaProceso;

            SET @Count_PNL = @Count_PNL + @@ROWCOUNT;
        END

        -- =====================================================
        -- PASO 5: Insertar Derivados desde ##Derivados_Work + ##Ajuste_Derivados
        -- =====================================================
        IF OBJECT_ID('tempdb..' + @TempDerivados, 'U') IS NOT NULL
        BEGIN
            SET @SQL = N'
            INSERT INTO process.CUBO_Final (
                ID_Ejecucion, ID_Fund, TipoRegistro,
                PK2, ID_Instrumento, id_CURR, FechaReporte, FechaCartera,
                BalanceSheet, Source, LocalPrice, Qty, OriginalFace, Factor,
                AI, MVBook, TotalMVal, TotalMVal_Balance, FechaProceso
            )
            SELECT
                @p_ID_Ejecucion, @p_ID_Fund, ''DERIVADOS'',
                PK2, CAST(ID_Instrumento AS NVARCHAR(MAX)), CAST(id_CURR AS NVARCHAR(MAX)),
                FechaReporte, FechaCartera,
                BalanceSheet, Source, LocalPrice, Qty, OriginalFace, Factor,
                AI, MVBook, TotalMVal, TotalMVal_Balance, @p_FechaProceso
            FROM ' + @TempDerivados + '
            WHERE ID_Fund = @p_ID_Fund;';

            EXEC sp_executesql @SQL,
                N'@p_ID_Ejecucion BIGINT, @p_ID_Fund INT, @p_FechaProceso NVARCHAR(50)',
                @ID_Ejecucion, @ID_Fund, @FechaProceso;

            SET @Count_Derivados = @@ROWCOUNT;
            IF @Debug = 1 PRINT '  Derivados insertados: ' + CAST(@Count_Derivados AS VARCHAR);
        END

        -- Ajustes Derivados
        IF OBJECT_ID('tempdb..' + @TempAjusteDerivados, 'U') IS NOT NULL
        BEGIN
            SET @SQL = N'
            INSERT INTO process.CUBO_Final (
                ID_Ejecucion, ID_Fund, TipoRegistro,
                PK2, ID_Instrumento, id_CURR, FechaReporte, FechaCartera,
                BalanceSheet, Source, LocalPrice, Qty, OriginalFace, Factor,
                AI, MVBook, TotalMVal, TotalMVal_Balance, FechaProceso
            )
            SELECT
                ID_Ejecucion, ID_Fund, ''DERIVADOS'',
                PK2, CAST(ID_Instrumento AS NVARCHAR(MAX)), CAST(id_CURR AS NVARCHAR(MAX)),
                FechaReporte, FechaCartera,
                BalanceSheet, Source, LocalPrice, Qty, OriginalFace, Factor,
                AI, MVBook, TotalMVal, TotalMVal_Balance, @p_FechaProceso
            FROM ' + @TempAjusteDerivados + '
            WHERE ID_Ejecucion = @p_ID_Ejecucion AND ID_Fund = @p_ID_Fund;';

            EXEC sp_executesql @SQL,
                N'@p_ID_Ejecucion BIGINT, @p_ID_Fund INT, @p_FechaProceso NVARCHAR(50)',
                @ID_Ejecucion, @ID_Fund, @FechaProceso;

            SET @Count_Derivados = @Count_Derivados + @@ROWCOUNT;
        END

        -- =====================================================
        -- PASO 6: Insertar UBS (MLCCII) desde ##UBS_Work
        -- =====================================================
        IF OBJECT_ID('tempdb..' + @TempUBS, 'U') IS NOT NULL
        BEGIN
            SET @SQL = N'
            INSERT INTO process.CUBO_Final (
                ID_Ejecucion, ID_Fund, TipoRegistro,
                PK2, ID_Instrumento, id_CURR, FechaReporte, FechaCartera,
                BalanceSheet, Source, LocalPrice, Qty, OriginalFace, Factor,
                AI, MVBook, TotalMVal, TotalMVal_Balance, FechaProceso
            )
            SELECT
                @p_ID_Ejecucion, @p_ID_Fund, ''MLCCII'',
                PK2, CAST(ID_Instrumento AS NVARCHAR(MAX)), CAST(id_CURR AS NVARCHAR(MAX)),
                FechaReporte, FechaCartera,
                BalanceSheet, Source, LocalPrice, Qty, OriginalFace, Factor,
                AI, MVBook, TotalMVal, TotalMVal_Balance, @p_FechaProceso
            FROM ' + @TempUBS + '
            WHERE ID_Fund = @p_ID_Fund;';

            EXEC sp_executesql @SQL,
                N'@p_ID_Ejecucion BIGINT, @p_ID_Fund INT, @p_FechaProceso NVARCHAR(50)',
                @ID_Ejecucion, @ID_Fund, @FechaProceso;

            SET @Count_MLCCII = @@ROWCOUNT;
            IF @Debug = 1 PRINT '  MLCCII insertados: ' + CAST(@Count_MLCCII AS VARCHAR);
        END

        -- =====================================================
        -- PASO 7: Calcular totales y retornar
        -- =====================================================
        SET @TotalInserted = @Count_IPA + @Count_CAPM + @Count_PNL + @Count_Derivados + @Count_MLCCII + @Count_MLCCII_Deriv;

        -- Log
        INSERT INTO logs.Ejecucion_Logs (ID_Ejecucion, ID_Fund, Timestamp, Nivel, Categoria, Etapa, Mensaje)
        VALUES (@ID_Ejecucion, @ID_Fund, GETDATE(), 'INFO', 'PIPELINE', 'CONSOLIDAR_CUBO',
            'Consolidado: ' + CAST(@TotalInserted AS VARCHAR) + ' registros (IPA:' + CAST(@Count_IPA AS VARCHAR) +
            ', CAPM:' + CAST(@Count_CAPM AS VARCHAR) + ', PNL:' + CAST(@Count_PNL AS VARCHAR) +
            ', DERIV:' + CAST(@Count_Derivados AS VARCHAR) + ', UBS:' + CAST(@Count_MLCCII AS VARCHAR) + ')');

        -- Resultado
        SELECT
            @ID_Ejecucion AS ID_Ejecucion,
            @ID_Fund AS ID_Fund,
            @TotalInserted AS TotalInserted,
            @Count_IPA AS Count_IPA,
            @Count_CAPM AS Count_CAPM,
            @Count_PNL AS Count_PNL,
            @Count_Derivados AS Count_Derivados,
            @Count_MLCCII AS Count_MLCCII,
            DATEDIFF(MILLISECOND, @StartTime, GETDATE()) AS DurationMs,
            0 AS ReturnCode,
            'OK' AS Status;

        PRINT 'Consolidar_Fondo_A_Cubo_v3 OK: ' + CAST(@TotalInserted AS VARCHAR) + ' registros -> CUBO_Final | ' +
              CAST(DATEDIFF(MILLISECOND, @StartTime, GETDATE()) AS VARCHAR) + 'ms';

        RETURN 0;

    END TRY
    BEGIN CATCH
        DECLARE @ErrorMsg NVARCHAR(MAX) = ERROR_MESSAGE();

        INSERT INTO logs.Ejecucion_Logs (ID_Ejecucion, ID_Fund, Timestamp, Nivel, Categoria, Etapa, Mensaje)
        VALUES (@ID_Ejecucion, @ID_Fund, GETDATE(), 'ERROR', 'PIPELINE', 'CONSOLIDAR_CUBO', 'ERROR: ' + @ErrorMsg);

        SELECT
            @ID_Ejecucion AS ID_Ejecucion,
            @ID_Fund AS ID_Fund,
            0 AS TotalInserted,
            0 AS Count_IPA, 0 AS Count_CAPM, 0 AS Count_PNL,
            0 AS Count_Derivados, 0 AS Count_MLCCII,
            DATEDIFF(MILLISECOND, @StartTime, GETDATE()) AS DurationMs,
            3 AS ReturnCode,
            @ErrorMsg AS Status;

        PRINT 'Consolidar_Fondo_A_Cubo_v3 ERROR: ' + @ErrorMsg;

        IF ERROR_NUMBER() = 1205 RETURN 2;
        RETURN 3;
    END CATCH
END;
GO

PRINT '    CREATED staging.Consolidar_Fondo_A_Cubo_v3';
PRINT '';
PRINT '=== Migration 012b completada ===';
PRINT '';

-- =====================================================
-- Verificación
-- =====================================================
PRINT '>>> Verificación:';

SELECT name AS SP_Name, create_date, modify_date
FROM sys.procedures
WHERE name = 'Consolidar_Fondo_A_Cubo_v3'
AND SCHEMA_NAME(schema_id) = 'staging';
