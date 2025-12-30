-- ============================================================================
-- MIGRACIÓN 102: Limpiar SPs - Eliminar escrituras a tablas de logs
-- ============================================================================
-- ARQUITECTURA EVENT-DRIVEN:
-- Los SPs solo deben procesar datos y retornar códigos:
--   0 = OK
--   1 = OK sin datos (skip válido)
--   2 = Error recuperable (retry)
--   3 = Error crítico
--   6 = STAND_BY_HOMOLOGACION
--   8 = STAND_BY_DESCUADRES
--
-- El sistema de eventos (PipelineEventEmitter → TrackingService) se encarga de:
-- - Actualizar estados en logs.Ejecuciones
-- - Registrar en logs.StandBy
-- - Registrar en logs.EventosDetallados
-- - Notificar vía WebSocket
-- ============================================================================

SET NOCOUNT ON;
GO

PRINT '================================================';
PRINT 'MIGRACIÓN 102: Limpieza de SPs';
PRINT 'Fecha: ' + CONVERT(VARCHAR, GETDATE(), 120);
PRINT '================================================';
GO

-- ============================================================================
-- 1. staging.PNL_02_Ajuste_v2
-- Remover: INSERT INTO logs.FondosEnStandBy, UPDATE logs.Ejecucion_Fondos
-- ============================================================================
PRINT '';
PRINT '>> Limpiando staging.PNL_02_Ajuste_v2...';
GO

ALTER PROCEDURE [staging].[PNL_02_Ajuste_v2]
    @ID_Ejecucion BIGINT,
    @FechaReporte NVARCHAR(10),
    @ID_Fund INT,
    @Portfolio_PNL NVARCHAR(50),
    @Ticker NVARCHAR(50) = NULL,
    @DebugMode BIT = 0,
    @RowsProcessed INT OUTPUT,
    @ErrorCount INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @StartTime DATETIME = GETDATE();
    DECLARE @EsDiaHabil BIT;
    DECLARE @TotalAcumulado FLOAT = 0;
    DECLARE @TotalTransferido FLOAT = 0;
    DECLARE @TotalDestinoAntes FLOAT = 0;
    DECLARE @TotalDestinoDespues FLOAT = 0;
    DECLARE @DiferenciaValidacion FLOAT = 0;
    DECLARE @RegistrosInsertados INT = 0;
    DECLARE @ProcName NVARCHAR(100) = 'PNL_02_v2';

    DECLARE @TempTableName NVARCHAR(128) = '##PNL_Work_' + CAST(@ID_Ejecucion AS NVARCHAR(20)) + '_' + CAST(@ID_Fund AS NVARCHAR(10));
    DECLARE @SQL NVARCHAR(MAX);

    SET @RowsProcessed = 0;
    SET @ErrorCount = 0;

    BEGIN TRY
        IF @ID_Ejecucion IS NULL OR @ID_Ejecucion <= 0
        BEGIN
            SET @ErrorCount = 1;
            PRINT 'PNL_02_v2 ERROR: ID_Ejecucion inválido';
            RETURN 3;
        END

        IF @ID_Fund IS NULL OR @ID_Fund <= 0
        BEGIN
            SET @ErrorCount = 1;
            PRINT 'PNL_02_v2 ERROR: ID_Fund inválido';
            RETURN 3;
        END

        IF @Portfolio_PNL IS NULL OR LEN(@Portfolio_PNL) = 0
        BEGIN
            SET @ErrorCount = 1;
            PRINT 'PNL_02_v2 ERROR: Portfolio_PNL es requerido';
            RETURN 3;
        END

        SET @SQL = 'IF OBJECT_ID(''tempdb..' + @TempTableName + ''') IS NULL
                    BEGIN RAISERROR(''Tabla temporal ' + @TempTableName + ' no existe'', 16, 1) END';
        EXEC sp_executesql @SQL;

        SET @EsDiaHabil = CASE
            WHEN @Ticker IS NULL THEN 1
            WHEN EXISTS(
                SELECT 1 FROM [DW_MONEDA].[dbo].[TBL_RENTABILIDADES_DW]
                WHERE daydate = @FechaReporte
                AND instrumentcode = @Ticker COLLATE SQL_Latin1_General_CP1_CS_AS
                AND ABS(dailyreturn) > 0
            ) THEN 1
            ELSE 0
        END;

        IF @EsDiaHabil = 0
        BEGIN
            -- DÍA NO HÁBIL: Acumular valores
            SET @SQL = '
            INSERT INTO [staging].[PNL_ValoresAcumulados]
            (ID_Ejecucion, ID_Fund, Portfolio, FechaOrigen, FechaCartera, Group1, Symb, PRgain, PUgain, FxRgain,
             FxUgain, Income, TotGL, PctGL, BasisPoint, Source, ID_Instrumento,
             id_CURR, PK2, LocalCurrency, Estado)
            SELECT ID_Ejecucion, ID_Fund, Portfolio, @p_FechaReporte, FechaCartera, Group1, Symb,
                PRgain, PUgain, FxRgain, FxUgain, Income, TotGL, PctGL, BasisPoint, Source, ID_Instrumento,
                id_CURR, PK2, LocalCurrency, ''PENDIENTE''
            FROM ' + @TempTableName + '
            WHERE ID_Ejecucion = @p_ID_Ejecucion AND ID_Fund = @p_ID_Fund
              AND Portfolio = @p_Portfolio_PNL AND FechaReporte = @p_FechaReporte
              AND ISNULL(TotGL, 0) <> 0';
            EXEC sp_executesql @SQL,
                N'@p_ID_Ejecucion BIGINT, @p_ID_Fund INT, @p_Portfolio_PNL NVARCHAR(50), @p_FechaReporte NVARCHAR(10)',
                @ID_Ejecucion, @ID_Fund, @Portfolio_PNL, @FechaReporte;
            SET @RegistrosInsertados = @@ROWCOUNT;

            SELECT @TotalAcumulado = ISNULL(SUM(TotGL), 0)
            FROM [staging].[PNL_ValoresAcumulados]
            WHERE ID_Ejecucion = @ID_Ejecucion AND ID_Fund = @ID_Fund
              AND Portfolio = @Portfolio_PNL AND FechaOrigen = @FechaReporte AND Estado = 'PENDIENTE';

            SET @SQL = '
            UPDATE ' + @TempTableName + '
            SET PRgain = 0, PUgain = 0, FxRgain = 0, FxUgain = 0,
                Income = 0, TotGL = 0, PctGL = 0, BasisPoint = 0
            WHERE ID_Ejecucion = @p_ID_Ejecucion AND ID_Fund = @p_ID_Fund
              AND Portfolio = @p_Portfolio_PNL AND FechaReporte = @p_FechaReporte';
            EXEC sp_executesql @SQL,
                N'@p_ID_Ejecucion BIGINT, @p_ID_Fund INT, @p_Portfolio_PNL NVARCHAR(50), @p_FechaReporte NVARCHAR(10)',
                @ID_Ejecucion, @ID_Fund, @Portfolio_PNL, @FechaReporte;
            SET @RowsProcessed = @@ROWCOUNT;
        END
        ELSE
        BEGIN
            -- DÍA HÁBIL: Transferir valores pendientes
            SELECT @TotalTransferido = ISNULL(SUM(TotGL), 0)
            FROM [staging].[PNL_ValoresAcumulados]
            WHERE ID_Ejecucion = @ID_Ejecucion AND ID_Fund = @ID_Fund
              AND Portfolio = @Portfolio_PNL AND Estado = 'PENDIENTE' AND FechaOrigen < @FechaReporte;

            SET @SQL = 'SELECT @cnt = ISNULL(SUM(TotGL), 0) FROM ' + @TempTableName + '
                WHERE ID_Ejecucion = @p_ID_Ejecucion AND ID_Fund = @p_ID_Fund
                  AND Portfolio = @p_Portfolio_PNL AND FechaReporte = @p_FechaReporte';
            EXEC sp_executesql @SQL,
                N'@p_ID_Ejecucion BIGINT, @p_ID_Fund INT, @p_Portfolio_PNL NVARCHAR(50), @p_FechaReporte NVARCHAR(10), @cnt FLOAT OUTPUT',
                @ID_Ejecucion, @ID_Fund, @Portfolio_PNL, @FechaReporte, @TotalDestinoAntes OUTPUT;

            -- Actualizar símbolos existentes
            SET @SQL = '
            ;WITH ValoresTransferir AS (
                SELECT Symb, SUM(PRgain) AS PRgain, SUM(PUgain) AS PUgain, SUM(FxRgain) AS FxRgain,
                    SUM(FxUgain) AS FxUgain, SUM(Income) AS Income, SUM(TotGL) AS TotGL,
                    SUM(PctGL) AS PctGL, SUM(BasisPoint) AS BasisPoint
                FROM [staging].[PNL_ValoresAcumulados]
                WHERE ID_Ejecucion = @p_ID_Ejecucion AND ID_Fund = @p_ID_Fund
                  AND Portfolio = @p_Portfolio_PNL AND Estado = ''PENDIENTE'' AND FechaOrigen < @p_FechaReporte
                GROUP BY Symb
            )
            UPDATE p SET
                p.PRgain = p.PRgain + ISNULL(v.PRgain, 0), p.PUgain = p.PUgain + ISNULL(v.PUgain, 0),
                p.FxRgain = p.FxRgain + ISNULL(v.FxRgain, 0), p.FxUgain = p.FxUgain + ISNULL(v.FxUgain, 0),
                p.Income = p.Income + ISNULL(v.Income, 0), p.TotGL = p.TotGL + ISNULL(v.TotGL, 0),
                p.PctGL = p.PctGL + ISNULL(v.PctGL, 0), p.BasisPoint = p.BasisPoint + ISNULL(v.BasisPoint, 0)
            FROM ' + @TempTableName + ' p
            INNER JOIN ValoresTransferir v ON p.Symb = v.Symb
            WHERE p.ID_Ejecucion = @p_ID_Ejecucion AND p.ID_Fund = @p_ID_Fund
              AND p.Portfolio = @p_Portfolio_PNL AND p.FechaReporte = @p_FechaReporte';
            EXEC sp_executesql @SQL,
                N'@p_ID_Ejecucion BIGINT, @p_ID_Fund INT, @p_Portfolio_PNL NVARCHAR(50), @p_FechaReporte NVARCHAR(10)',
                @ID_Ejecucion, @ID_Fund, @Portfolio_PNL, @FechaReporte;

            -- Insertar símbolos nuevos
            SET @SQL = '
            ;WITH ValoresNuevos AS (
                SELECT Portfolio, Symb, MAX(Group1) AS Group1, MAX(Source) AS Source,
                    MAX(ID_Instrumento) AS ID_Instrumento, MAX(id_CURR) AS id_CURR, MAX(PK2) AS PK2,
                    MAX(LocalCurrency) AS LocalCurrency, SUM(PRgain) AS PRgain, SUM(PUgain) AS PUgain,
                    SUM(FxRgain) AS FxRgain, SUM(FxUgain) AS FxUgain, SUM(Income) AS Income,
                    SUM(TotGL) AS TotGL, SUM(PctGL) AS PctGL, SUM(BasisPoint) AS BasisPoint
                FROM [staging].[PNL_ValoresAcumulados]
                WHERE ID_Ejecucion = @p_ID_Ejecucion AND ID_Fund = @p_ID_Fund
                  AND Portfolio = @p_Portfolio_PNL AND Estado = ''PENDIENTE'' AND FechaOrigen < @p_FechaReporte
                GROUP BY Portfolio, Symb
            )
            INSERT INTO ' + @TempTableName + '
            (ID_Ejecucion, ID_Fund, Portfolio, FechaReporte, FechaCartera, Group1, Symb, PRgain, PUgain,
             FxRgain, FxUgain, Income, TotGL, PctGL, BasisPoint, Source, ID_Instrumento, id_CURR, PK2, LocalCurrency)
            SELECT @p_ID_Ejecucion, @p_ID_Fund, v.Portfolio, @p_FechaReporte, @p_FechaReporte,
                v.Group1, v.Symb, v.PRgain, v.PUgain, v.FxRgain, v.FxUgain, v.Income, v.TotGL,
                v.PctGL, v.BasisPoint, v.Source, v.ID_Instrumento, v.id_CURR, v.PK2, v.LocalCurrency
            FROM ValoresNuevos v
            WHERE NOT EXISTS (
                SELECT 1 FROM ' + @TempTableName + ' p
                WHERE p.ID_Ejecucion = @p_ID_Ejecucion AND p.ID_Fund = @p_ID_Fund
                  AND p.Portfolio = v.Portfolio AND p.Symb = v.Symb AND p.FechaReporte = @p_FechaReporte
            )';
            EXEC sp_executesql @SQL,
                N'@p_ID_Ejecucion BIGINT, @p_ID_Fund INT, @p_Portfolio_PNL NVARCHAR(50), @p_FechaReporte NVARCHAR(10)',
                @ID_Ejecucion, @ID_Fund, @Portfolio_PNL, @FechaReporte;
            SET @RegistrosInsertados = @@ROWCOUNT;

            UPDATE [staging].[PNL_ValoresAcumulados]
            SET Estado = 'TRANSFERIDO', FechaDestino = @FechaReporte, FechaTransferencia = GETDATE()
            WHERE ID_Ejecucion = @ID_Ejecucion AND ID_Fund = @ID_Fund
              AND Portfolio = @Portfolio_PNL AND Estado = 'PENDIENTE' AND FechaOrigen < @FechaReporte;

            SET @SQL = 'SELECT @cnt = ISNULL(SUM(TotGL), 0) FROM ' + @TempTableName + '
                WHERE ID_Ejecucion = @p_ID_Ejecucion AND ID_Fund = @p_ID_Fund
                  AND Portfolio = @p_Portfolio_PNL AND FechaReporte = @p_FechaReporte';
            EXEC sp_executesql @SQL,
                N'@p_ID_Ejecucion BIGINT, @p_ID_Fund INT, @p_Portfolio_PNL NVARCHAR(50), @p_FechaReporte NVARCHAR(10), @cnt FLOAT OUTPUT',
                @ID_Ejecucion, @ID_Fund, @Portfolio_PNL, @FechaReporte, @TotalDestinoDespues OUTPUT;

            SET @DiferenciaValidacion = ABS((@TotalDestinoDespues - @TotalDestinoAntes) - @TotalTransferido);

            -- Validar descuadre en transferencia
            IF @DiferenciaValidacion > 0.01
            BEGIN
                SET @ErrorCount = 1;
                -- ELIMINADO: INSERT INTO logs.FondosEnStandBy - El evento lo maneja
                -- ELIMINADO: UPDATE logs.Ejecucion_Fondos - El evento lo maneja
                PRINT @ProcName + ' STAND-BY: Descuadre transferencia PNL $' + FORMAT(@DiferenciaValidacion, 'N2');
                RETURN 8; -- STAND_BY_DESCUADRES - El evento system se encarga del resto
            END

            SET @RowsProcessed = @RegistrosInsertados;
        END

        PRINT @ProcName + ' OK: ' + CASE WHEN @EsDiaHabil = 1 THEN 'Transferido' ELSE 'Acumulado' END;
        RETURN 0;

    END TRY
    BEGIN CATCH
        SET @ErrorCount = 1;
        DECLARE @ErrorNumber INT = ERROR_NUMBER();
        PRINT @ProcName + ' ERROR: ' + ERROR_MESSAGE();
        IF @ErrorNumber = 1205 RETURN 2;
        IF @ErrorNumber IN (-2, 1222) RETURN 2;
        RETURN 3;
    END CATCH
END;
GO

PRINT '   ✓ staging.PNL_02_Ajuste_v2 limpio';
GO

-- ============================================================================
-- 2. staging.CAPM_02_Extract_Transform_v2
-- Remover: INSERT INTO logs.FondosEnStandBy
-- ============================================================================
PRINT '';
PRINT '>> Limpiando staging.CAPM_02_Extract_Transform_v2...';
GO

ALTER PROCEDURE [staging].[CAPM_02_Extract_Transform_v2]
    @ID_Ejecucion BIGINT,
    @FechaReporte NVARCHAR(10),
    @ID_Fund INT,
    @Portfolio_Geneva NVARCHAR(50),
    @DebugMode BIT = 0,
    @RowsProcessed INT OUTPUT,
    @ErrorCount INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @StartTime DATETIME = GETDATE();
    DECLARE @RegistrosOrigen INT = 0;
    DECLARE @ProblemasHomologacion INT = 0;
    DECLARE @TempTableName NVARCHAR(200);
    DECLARE @SQL NVARCHAR(MAX);

    SET @RowsProcessed = 0;
    SET @ErrorCount = 0;

    IF @ID_Ejecucion IS NULL OR @ID_Ejecucion <= 0
    BEGIN
        PRINT 'CAPM_02_v2 ERROR: ID_Ejecucion inválido';
        SET @ErrorCount = 1;
        RETURN 3;
    END

    IF @ID_Fund IS NULL OR @ID_Fund <= 0
    BEGIN
        PRINT 'CAPM_02_v2 ERROR: ID_Fund inválido';
        SET @ErrorCount = 1;
        RETURN 3;
    END

    BEGIN TRY
        SET @TempTableName = '##CAPM_Work_' + CAST(@ID_Ejecucion AS NVARCHAR(20)) + '_' + CAST(@ID_Fund AS NVARCHAR(10));

        SELECT @RegistrosOrigen = COUNT(*)
        FROM extract.CAPM
        WHERE FechaReporte = @FechaReporte AND Portfolio = @Portfolio_Geneva;

        IF @RegistrosOrigen = 0
        BEGIN
            PRINT 'CAPM_02_v2 OK: Sin datos CAPM para Portfolio ' + @Portfolio_Geneva + ' (skip válido)';
            SET @RowsProcessed = 0;
            RETURN 0;
        END

        SET @SQL = N'IF OBJECT_ID(''tempdb..' + @TempTableName + ''', ''U'') IS NOT NULL DROP TABLE ' + @TempTableName;
        EXEC sp_executesql @SQL;

        SET @SQL = N'
        CREATE TABLE ' + @TempTableName + ' (
            ID_Ejecucion BIGINT NOT NULL, ID_Fund INT NOT NULL,
            Portfolio NVARCHAR(50), FechaReporte NVARCHAR(10), FechaCartera NVARCHAR(10),
            InvestID NVARCHAR(50), LocalCurrency NVARCHAR(50),
            Qty DECIMAL(18,6), LocalPrice DECIMAL(18,6), OriginalFace DECIMAL(18,6), Factor DECIMAL(18,6),
            AI DECIMAL(18,2), MVBook DECIMAL(18,2), TotalMVal DECIMAL(18,2), TotalMVal_Balance DECIMAL(18,2),
            BalanceSheet NVARCHAR(100), Source NVARCHAR(50), ID_Instrumento INT, id_CURR INT, PK2 NVARCHAR(100)
        );
        CREATE CLUSTERED INDEX IX_CAPM_Work ON ' + @TempTableName + ' (ID_Ejecucion, ID_Fund, ID_Instrumento, id_CURR);';
        EXEC sp_executesql @SQL;

        CREATE TABLE #DatosHomologados (
            Portfolio NVARCHAR(50), FechaReporte NVARCHAR(10), FechaCartera NVARCHAR(10),
            InvestID NVARCHAR(50), LocalCurrency NVARCHAR(50),
            Qty DECIMAL(18,6), MVBook DECIMAL(18,2),
            ID_Fund_Homol INT, ID_Instrumento INT, id_CURR INT, TieneProblemaHomologacion BIT
        );

        INSERT INTO #DatosHomologados
        SELECT c.Portfolio, c.FechaReporte, c.FechaCartera, c.InvestID, c.LocalCurrency, c.Qty, c.MVBook,
            ISNULL(hf.ID_Fund, 0), ISNULL(hi.ID_Instrumento, 0), ISNULL(hm.id_CURR, 0),
            CASE WHEN ISNULL(hf.ID_Fund, 0) = 0 OR ISNULL(hi.ID_Instrumento, 0) = 0 OR ISNULL(hm.id_CURR, 0) = 0 THEN 1 ELSE 0 END
        FROM extract.CAPM c
        LEFT JOIN dimensionales.HOMOL_Funds hf ON c.Portfolio = hf.Portfolio AND hf.Source = 'CASH APPRAISAL'
        LEFT JOIN dimensionales.HOMOL_Instrumentos hi ON c.InvestID = hi.SourceInvestment AND hi.Source = 'CASH APPRAISAL'
        LEFT JOIN dimensionales.HOMOL_Monedas hm ON c.LocalCurrency = hm.Name AND hm.Source = 'CASH APPRAISAL'
        WHERE c.FechaReporte = @FechaReporte AND c.Portfolio = @Portfolio_Geneva;

        SELECT @ProblemasHomologacion = COUNT(*) FROM #DatosHomologados WHERE TieneProblemaHomologacion = 1;

        IF @ProblemasHomologacion > 0
        BEGIN
            -- Registrar en sandbox (cola de problemas)
            INSERT INTO sandbox.Homologacion_Fondos (FechaReporte, Fondo, Source, FechaProceso)
            SELECT DISTINCT @FechaReporte, Portfolio, 'CASH APPRAISAL', CAST(GETDATE() AS NVARCHAR(MAX))
            FROM #DatosHomologados WHERE ID_Fund_Homol = 0
              AND NOT EXISTS (SELECT 1 FROM sandbox.Homologacion_Fondos hf WHERE hf.FechaReporte = @FechaReporte AND hf.Fondo = Portfolio AND hf.Source = 'CASH APPRAISAL');

            INSERT INTO sandbox.Homologacion_Instrumentos (FechaReporte, Instrumento, Currency, Source, FechaProceso)
            SELECT DISTINCT @FechaReporte, InvestID, LocalCurrency, 'CASH APPRAISAL', CAST(GETDATE() AS NVARCHAR(MAX))
            FROM #DatosHomologados WHERE ID_Instrumento = 0
              AND NOT EXISTS (SELECT 1 FROM sandbox.Homologacion_Instrumentos hi WHERE hi.FechaReporte = @FechaReporte AND hi.Instrumento = InvestID AND hi.Source = 'CASH APPRAISAL');

            INSERT INTO sandbox.Homologacion_Monedas (FechaReporte, Moneda, Source, FechaProceso)
            SELECT DISTINCT @FechaReporte, LocalCurrency, 'CASH APPRAISAL', CAST(GETDATE() AS NVARCHAR(MAX))
            FROM #DatosHomologados WHERE id_CURR = 0
              AND NOT EXISTS (SELECT 1 FROM sandbox.Homologacion_Monedas hm WHERE hm.FechaReporte = @FechaReporte AND hm.Moneda = LocalCurrency AND hm.Source = 'CASH APPRAISAL');

            -- ELIMINADO: INSERT INTO logs.FondosEnStandBy - El evento lo maneja

            SET @ErrorCount = @ProblemasHomologacion;
            DROP TABLE IF EXISTS #DatosHomologados;
            PRINT 'CAPM_02_v2 STAND-BY: ' + CAST(@ProblemasHomologacion AS VARCHAR(10)) + ' elementos sin homologar';
            RETURN 6; -- STAND_BY_HOMOLOGACION
        END

        -- Insertar en tabla temporal global
        SET @SQL = N'
        INSERT INTO ' + @TempTableName + ' (
            ID_Ejecucion, ID_Fund, Portfolio, FechaReporte, FechaCartera, InvestID, LocalCurrency,
            Qty, LocalPrice, OriginalFace, Factor, AI, MVBook, TotalMVal, TotalMVal_Balance,
            BalanceSheet, Source, ID_Instrumento, id_CURR, PK2
        )
        SELECT @ID_Ejecucion, @ID_Fund, Portfolio, FechaReporte, FechaCartera, InvestID, LocalCurrency,
            Qty, 1, NULL, NULL, 0, MVBook, MVBook, MVBook,
            CASE WHEN MVBook >= 0 THEN ''Asset'' ELSE ''Liability'' END, ''CASH APPRAISAL'',
            ID_Instrumento, id_CURR, CAST(ID_Instrumento AS VARCHAR(10)) + ''-'' + CAST(id_CURR AS VARCHAR(10))
        FROM #DatosHomologados WHERE TieneProblemaHomologacion = 0;';
        EXEC sp_executesql @SQL, N'@ID_Ejecucion BIGINT, @ID_Fund INT', @ID_Ejecucion, @ID_Fund;
        SET @RowsProcessed = @@ROWCOUNT;

        -- Escribir a process.TBL_CAPM
        DELETE FROM process.TBL_CAPM WHERE ID_Ejecucion = @ID_Ejecucion AND ID_Fund = @ID_Fund;

        INSERT INTO process.TBL_CAPM (
            ID_Ejecucion, ID_Fund, PK2, ID_Instrumento, id_CURR, FechaReporte, FechaCartera,
            BalanceSheet, Source, LocalPrice, Qty, OriginalFace, Factor, AI, MVBook, TotalMVal,
            TotalMVal_Balance, FechaProceso
        )
        SELECT @ID_Ejecucion, @ID_Fund,
            CAST(ID_Instrumento AS VARCHAR(10)) + '-' + CAST(id_CURR AS VARCHAR(10)),
            ID_Instrumento, id_CURR, FechaReporte, MAX(FechaCartera),
            CASE WHEN SUM(MVBook) >= 0 THEN 'Asset' ELSE 'Liability' END, 'CASH APPRAISAL',
            MAX(1), SUM(Qty), SUM(ISNULL(Qty, 0)), MAX(1), 0, SUM(MVBook), SUM(MVBook), SUM(MVBook),
            CONVERT(VARCHAR(MAX), GETDATE(), 120)
        FROM #DatosHomologados WHERE TieneProblemaHomologacion = 0
        GROUP BY ID_Instrumento, id_CURR, FechaReporte;

        DROP TABLE IF EXISTS #DatosHomologados;
        PRINT 'CAPM_02_v2 OK: ' + CAST(@RowsProcessed AS VARCHAR(10)) + ' registros';
        RETURN 0;

    END TRY
    BEGIN CATCH
        SET @ErrorCount = 1;
        DROP TABLE IF EXISTS #DatosHomologados;
        DECLARE @ErrorNumber INT = ERROR_NUMBER();
        PRINT 'CAPM_02_v2 ERROR: ' + ERROR_MESSAGE();
        IF @ErrorNumber = 1205 RETURN 2;
        IF @ErrorNumber IN (-2, 1222) RETURN 2;
        RETURN 3;
    END CATCH
END;
GO

PRINT '   ✓ staging.CAPM_02_Extract_Transform_v2 limpio';
GO

-- ============================================================================
-- 3. staging.IPA_01_RescatarLocalPrice_v2
-- Remover: INSERT INTO logs.SP_Errors
-- ============================================================================
PRINT '';
PRINT '>> Limpiando staging.IPA_01_RescatarLocalPrice_v2...';
GO

ALTER PROCEDURE [staging].[IPA_01_RescatarLocalPrice_v2]
    @ID_Ejecucion BIGINT,
    @FechaReporte NVARCHAR(10),
    @ID_Fund INT,
    @Portfolio_Geneva NVARCHAR(50),
    @DebugMode BIT = 0,
    @RowsProcessed INT OUTPUT,
    @ErrorCount INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @RegistrosIPA INT = 0, @RegistrosPosModRF INT = 0;
    DECLARE @TempTableName NVARCHAR(200);
    DECLARE @SQL NVARCHAR(MAX);

    SET @RowsProcessed = 0;
    SET @ErrorCount = 0;

    IF @ID_Ejecucion IS NULL OR @ID_Ejecucion <= 0
    BEGIN
        PRINT 'IPA_01_v2 ERROR: ID_Ejecucion inválido';
        SET @ErrorCount = 1;
        RETURN 3;
    END

    IF @ID_Fund IS NULL OR @ID_Fund <= 0
    BEGIN
        PRINT 'IPA_01_v2 ERROR: ID_Fund inválido';
        SET @ErrorCount = 1;
        RETURN 3;
    END

    IF @FechaReporte IS NULL OR LEN(RTRIM(@FechaReporte)) = 0
    BEGIN
        PRINT 'IPA_01_v2 ERROR: FechaReporte obligatorio';
        SET @ErrorCount = 1;
        RETURN 3;
    END

    IF @Portfolio_Geneva IS NULL OR LEN(RTRIM(@Portfolio_Geneva)) = 0
    BEGIN
        PRINT 'IPA_01_v2 ERROR: Portfolio_Geneva obligatorio';
        SET @ErrorCount = 1;
        RETURN 3;
    END

    BEGIN TRY
        SELECT @RegistrosIPA = COUNT(*)
        FROM [extract].[IPA]
        WHERE ID_Ejecucion = @ID_Ejecucion AND FechaReporte = @FechaReporte;

        IF @RegistrosIPA = 0
        BEGIN
            PRINT 'IPA_01_v2 ERROR: Sin datos en extract.IPA';
            SET @ErrorCount = 1;
            RETURN 3;
        END

        SELECT @RegistrosPosModRF = COUNT(*)
        FROM [extract].[PosModRF]
        WHERE ID_Ejecucion = @ID_Ejecucion AND FechaReporte = @FechaReporte;

        SET @TempTableName = 'tempdb..##IPA_Work_' + CAST(@ID_Ejecucion AS NVARCHAR(20)) + '_' + CAST(@ID_Fund AS NVARCHAR(10));

        SET @SQL = N'IF OBJECT_ID(''' + @TempTableName + ''', ''U'') IS NOT NULL DROP TABLE ' + @TempTableName + ';';
        EXEC sp_executesql @SQL;

        SET @SQL = N'
        CREATE TABLE ' + @TempTableName + ' (
            ID_Ejecucion BIGINT NOT NULL, ID_Fund INT NOT NULL,
            Portfolio NVARCHAR(255), FechaReporte NVARCHAR(10), FechaCartera NVARCHAR(10),
            TotalText NVARCHAR(50), ReportMode NVARCHAR(50), LSDesc NVARCHAR(50), SortKey NVARCHAR(50),
            LocalCurrency NVARCHAR(50), BasketInvestDesc NVARCHAR(255), InvestID NVARCHAR(255),
            InvestDescription NVARCHAR(500), Qty FLOAT, LocalPrice FLOAT, CostLocal FLOAT, CostBook FLOAT,
            UnRealGL FLOAT, AI FLOAT, MVBook FLOAT, PercentInvest FLOAT, PercentSign NVARCHAR(10),
            IsSwap NVARCHAR(10), BasketInvID NVARCHAR(255), OriginalFace FLOAT, Factor FLOAT,
            Source NVARCHAR(50), ID_Instrumento INT, id_CURR INT, BalanceSheet NVARCHAR(50),
            PK2 NVARCHAR(50), [CXC/CXP?] NVARCHAR(50),
            INDEX IX_Temp_IPA CLUSTERED (ID_Ejecucion, ID_Fund, InvestID)
        );';
        EXEC sp_executesql @SQL;

        SET @SQL = N'
        INSERT INTO ' + @TempTableName + ' (
            ID_Ejecucion, ID_Fund, Portfolio, FechaReporte, FechaCartera, TotalText, ReportMode, LSDesc,
            SortKey, LocalCurrency, BasketInvestDesc, InvestID, InvestDescription, Qty, LocalPrice,
            CostLocal, CostBook, UnRealGL, AI, MVBook, PercentInvest, PercentSign, IsSwap, BasketInvID,
            OriginalFace, Factor, Source, ID_Instrumento, id_CURR, BalanceSheet, PK2, [CXC/CXP?]
        )
        SELECT @ID_Ejecucion, @ID_Fund, ipa.Portfolio, ipa.FechaReporte, ipa.FechaCartera,
            ipa.TotalText, ipa.ReportMode, ipa.LSDesc, ipa.SortKey, ipa.LocalCurrency,
            ipa.BasketInvestDesc, ipa.InvestID, ipa.InvestDescription, ipa.Qty, ipa.LocalPrice,
            ipa.CostLocal, ipa.CostBook, ipa.UnRealGL, ipa.AI, ipa.MVBook, ipa.PercentInvest,
            ipa.PercentSign, ipa.IsSwap, ipa.BasketInvID, ISNULL(pos.OriginalFace, 0), ISNULL(pos.Factor, 1),
            NULL, NULL, NULL, NULL, NULL, NULL
        FROM [extract].[IPA] ipa
        LEFT JOIN [extract].[PosModRF] pos ON ipa.InvestID = pos.InvestID AND ipa.ID_Ejecucion = pos.ID_Ejecucion
        WHERE ipa.ID_Ejecucion = @ID_Ejecucion AND ipa.FechaReporte = @FechaReporte
          AND NOT EXISTS (SELECT 1 FROM sandbox.Fondos_Problema fp
              WHERE fp.ID_Fund = CAST(@ID_Fund AS NVARCHAR(50)) AND fp.FechaReporte = @FechaReporte AND fp.Proceso = ''Orquestador'');';
        EXEC sp_executesql @SQL, N'@ID_Ejecucion BIGINT, @ID_Fund INT, @FechaReporte NVARCHAR(10)',
            @ID_Ejecucion, @ID_Fund, @FechaReporte;
        SET @RowsProcessed = @@ROWCOUNT;

        PRINT 'IPA_01_v2 OK: ' + CAST(@RowsProcessed AS VARCHAR(10)) + ' registros';
        RETURN 0;

    END TRY
    BEGIN CATCH
        SET @ErrorCount = 1;
        PRINT 'IPA_01_v2 ERROR: ' + ERROR_MESSAGE();
        -- ELIMINADO: INSERT INTO logs.SP_Errors - El evento system lo maneja
        IF ERROR_NUMBER() = 1205 RETURN 2;
        RETURN 3;
    END CATCH
END;
GO

PRINT '   ✓ staging.IPA_01_RescatarLocalPrice_v2 limpio';
GO

-- ============================================================================
-- 4. staging.DERIV_02_Homologar_Dimensiones_v2
-- Remover: INSERT INTO logs.FondosEnStandBy, UPDATE logs.Ejecucion_Fondos
-- ============================================================================
PRINT '';
PRINT '>> Limpiando staging.DERIV_02_Homologar_Dimensiones_v2...';
GO

ALTER PROCEDURE [staging].[DERIV_02_Homologar_Dimensiones_v2]
    @ID_Ejecucion BIGINT,
    @FechaReporte NVARCHAR(10),
    @ID_Fund INT,
    @Portfolio_Derivados NVARCHAR(50),
    @DebugMode BIT = 0,
    @RowsProcessed INT OUTPUT,
    @ErrorCount INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @StartTime DATETIME = GETDATE();
    DECLARE @RegistrosOrigen INT = 0;
    DECLARE @SumaTotalMVal DECIMAL(18,2);
    DECLARE @SubIDDer_Positivo INT = 10000;
    DECLARE @SubIDDer_Negativo INT = 20000;
    DECLARE @ProcName NVARCHAR(100) = 'DERIV_02_v2';

    DECLARE @TempTableName NVARCHAR(128) = '##Derivados_Work_' + CAST(@ID_Ejecucion AS NVARCHAR(20)) + '_' + CAST(@ID_Fund AS NVARCHAR(10));
    DECLARE @SQL NVARCHAR(MAX);

    SET @RowsProcessed = 0;
    SET @ErrorCount = 0;

    BEGIN TRY
        IF @ID_Ejecucion IS NULL OR @ID_Ejecucion <= 0
        BEGIN
            SET @ErrorCount = 1;
            PRINT 'DERIV_02_v2 ERROR: ID_Ejecucion inválido';
            RETURN 3;
        END

        IF @ID_Fund IS NULL OR @ID_Fund <= 0
        BEGIN
            SET @ErrorCount = 1;
            PRINT 'DERIV_02_v2 ERROR: ID_Fund inválido';
            RETURN 3;
        END

        IF @Portfolio_Derivados IS NULL OR LEN(@Portfolio_Derivados) = 0
        BEGIN
            SET @ErrorCount = 1;
            PRINT 'DERIV_02_v2 ERROR: Portfolio_Derivados es requerido';
            RETURN 3;
        END

        SET @SQL = 'IF OBJECT_ID(''tempdb..' + @TempTableName + ''') IS NULL
                    BEGIN RAISERROR(''Tabla temporal ' + @TempTableName + ' no existe'', 16, 1) END';
        EXEC sp_executesql @SQL;

        DECLARE @RequiereDerivados BIT;
        SELECT @RequiereDerivados = Flag_Derivados FROM dimensionales.BD_Funds WHERE ID_Fund = @ID_Fund;

        IF @RequiereDerivados IS NULL
        BEGIN
            SET @ErrorCount = 1;
            PRINT 'DERIV_02_v2 ERROR: Fondo no encontrado en BD_Funds';
            RETURN 3;
        END

        SET @SQL = 'SELECT @cnt = COUNT(*) FROM ' + @TempTableName +
                   ' WHERE ID_Ejecucion = @p_ID_Ejecucion AND ID_Fund = @p_ID_Fund AND FechaReporte = @p_FechaReporte';
        EXEC sp_executesql @SQL,
            N'@p_ID_Ejecucion BIGINT, @p_ID_Fund INT, @p_FechaReporte NVARCHAR(10), @cnt INT OUTPUT',
            @ID_Ejecucion, @ID_Fund, @FechaReporte, @RegistrosOrigen OUTPUT;

        IF @RegistrosOrigen = 0
        BEGIN
            IF @RequiereDerivados = 1
            BEGIN
                SET @ErrorCount = 1;
                INSERT INTO sandbox.Fondos_Problema (FechaReporte, ID_Fund, Proceso, Tipo_Problema, FechaProceso)
                VALUES (@FechaReporte, @ID_Fund, 'DERIV_02',
                    CONCAT('Fondo requiere derivados sin datos en ##Derivados_Work para Portfolio ', @Portfolio_Derivados),
                    CONVERT(NVARCHAR, GETDATE(), 120));
                PRINT @ProcName + ' ERROR: Fondo requiere derivados sin datos (código 3)';
                RETURN 3;
            END
            ELSE
            BEGIN
                PRINT @ProcName + ' OK: Fondo no requiere derivados sin datos (skip válido)';
                RETURN 0;
            END
        END

        SET @SQL = '
        UPDATE ' + @TempTableName + '
        SET BalanceSheet = CASE WHEN TotalMVal >= 0 THEN ''Asset'' ELSE ''Liability'' END,
            MVBook = TotalMVal, LocalPrice = 0, AI = 0, FechaCartera = @p_FechaReporte, Source = ''DERIVADOS''
        WHERE ID_Ejecucion = @p_ID_Ejecucion AND ID_Fund = @p_ID_Fund AND FechaReporte = @p_FechaReporte';
        EXEC sp_executesql @SQL,
            N'@p_ID_Ejecucion BIGINT, @p_ID_Fund INT, @p_FechaReporte NVARCHAR(10)',
            @ID_Ejecucion, @ID_Fund, @FechaReporte;

        DELETE FROM process.TBL_Derivados WHERE ID_Ejecucion = @ID_Ejecucion AND ID_Fund = @ID_Fund;

        SET @SQL = '
        SELECT d.*, ISNULL(hf.ID_Fund, 0) AS ID_Fund_Homologado, ISNULL(hi.ID_Instrumento, 0) AS ID_Instrumento_Homologado,
            ISNULL(hm.id_CURR, 0) AS id_CURR_Homologado,
            CASE WHEN d.TotalMVal >= 0 THEN ' + CAST(@SubIDDer_Positivo AS VARCHAR) + ' ELSE ' + CAST(@SubIDDer_Negativo AS VARCHAR) + ' END AS SubIDDer_Calc,
            CASE WHEN ISNULL(hf.ID_Fund, 0) = 0 OR ISNULL(hi.ID_Instrumento, 0) = 0 OR ISNULL(hm.id_CURR, 0) = 0 THEN 1 ELSE 0 END AS TieneProblemaHomologacion
        INTO #DatosHomologados
        FROM ' + @TempTableName + ' d
        LEFT JOIN dimensionales.HOMOL_Funds hf ON d.Portfolio = hf.Portfolio AND hf.Source = d.Source
        LEFT JOIN dimensionales.HOMOL_Instrumentos hi ON d.InvestID = hi.SourceInvestment AND hi.Source = d.Source
        LEFT JOIN dimensionales.HOMOL_Monedas hm ON d.Code = hm.Name AND hm.Source = d.Source
        WHERE d.ID_Ejecucion = @p_ID_Ejecucion AND d.ID_Fund = @p_ID_Fund AND d.FechaReporte = @p_FechaReporte';
        EXEC sp_executesql @SQL,
            N'@p_ID_Ejecucion BIGINT, @p_ID_Fund INT, @p_FechaReporte NVARCHAR(10)',
            @ID_Ejecucion, @ID_Fund, @FechaReporte;

        DECLARE @ProblemasHomologacion INT = 0;
        SELECT @ProblemasHomologacion = COUNT(*) FROM #DatosHomologados WHERE TieneProblemaHomologacion = 1;

        IF @ProblemasHomologacion > 0
        BEGIN
            INSERT INTO sandbox.Homologacion_Fondos (FechaReporte, Fondo, Source, FechaProceso)
            SELECT DISTINCT @FechaReporte, Portfolio, 'DERIVADOS', GETDATE()
            FROM #DatosHomologados WHERE ID_Fund_Homologado = 0
              AND NOT EXISTS (SELECT 1 FROM sandbox.Homologacion_Fondos hf WHERE hf.FechaReporte = @FechaReporte AND hf.Fondo = Portfolio AND hf.Source = 'DERIVADOS');

            INSERT INTO sandbox.Homologacion_Instrumentos (FechaReporte, Instrumento, Currency, Source, FechaProceso)
            SELECT DISTINCT @FechaReporte, InvestID, Code, 'DERIVADOS', GETDATE()
            FROM #DatosHomologados WHERE ID_Instrumento_Homologado = 0
              AND NOT EXISTS (SELECT 1 FROM sandbox.Homologacion_Instrumentos hi WHERE hi.FechaReporte = @FechaReporte AND hi.Instrumento = InvestID AND hi.Source = 'DERIVADOS');

            INSERT INTO sandbox.Homologacion_Monedas (FechaReporte, Moneda, Source, FechaProceso)
            SELECT DISTINCT @FechaReporte, Code, 'DERIVADOS', GETDATE()
            FROM #DatosHomologados WHERE id_CURR_Homologado = 0
              AND NOT EXISTS (SELECT 1 FROM sandbox.Homologacion_Monedas hm WHERE hm.FechaReporte = @FechaReporte AND hm.Moneda = Code AND hm.Source = 'DERIVADOS');

            -- ELIMINADO: INSERT INTO logs.FondosEnStandBy - El evento lo maneja
            -- ELIMINADO: UPDATE logs.Ejecucion_Fondos - El evento lo maneja

            SET @ErrorCount = @ProblemasHomologacion;
            DROP TABLE IF EXISTS #DatosHomologados;
            PRINT @ProcName + ' STAND-BY: ' + CAST(@ProblemasHomologacion AS VARCHAR(10)) + ' elementos sin homologar';
            RETURN 6; -- STAND_BY_HOMOLOGACION
        END

        INSERT INTO process.TBL_Derivados (ID_Ejecucion, ID_Fund, PK2, ID_Instrumento, id_CURR, FechaReporte, FechaCartera,
            BalanceSheet, Source, LocalPrice, Qty, OriginalFace, Factor, AI, MVBook, TotalMVal, TotalMVal_Balance, FechaProceso)
        SELECT @ID_Ejecucion, @ID_Fund,
            CAST(ID_Instrumento_Homologado AS VARCHAR(10)) + '-' + CAST(SubIDDer_Calc AS VARCHAR(10)),
            ID_Instrumento_Homologado, id_CURR_Homologado, FechaReporte, FechaCartera,
            BalanceSheet, Source, LocalPrice, Qty, NULL, NULL, AI, MVBook, TotalMVal,
            ISNULL(MTM, TotalMVal), CONVERT(VARCHAR(MAX), GETDATE(), 120)
        FROM #DatosHomologados;
        SET @RowsProcessed = @@ROWCOUNT;

        SELECT @SumaTotalMVal = ISNULL(SUM(TotalMVal), 0)
        FROM process.TBL_Derivados WHERE ID_Ejecucion = @ID_Ejecucion AND ID_Fund = @ID_Fund;

        DROP TABLE IF EXISTS #DatosHomologados;
        PRINT @ProcName + ' OK: ' + CAST(@RowsProcessed AS VARCHAR(10)) + ' registros';
        RETURN 0;

    END TRY
    BEGIN CATCH
        DROP TABLE IF EXISTS #DatosHomologados;
        SET @ErrorCount = 1;
        DECLARE @ErrorNumber INT = ERROR_NUMBER();
        PRINT @ProcName + ' ERROR: ' + ERROR_MESSAGE();
        IF @ErrorNumber = 1205 RETURN 2;
        IF @ErrorNumber IN (-2, 1222) RETURN 2;
        RETURN 3;
    END CATCH
END;
GO

PRINT '   ✓ staging.DERIV_02_Homologar_Dimensiones_v2 limpio';
GO

-- ============================================================================
-- 5. staging.DERIV_03_Ajuste_Derivados_v2
-- Remover: INSERT INTO logs.FondosEnStandBy, UPDATE logs.Ejecucion_Fondos
-- ============================================================================
PRINT '';
PRINT '>> Limpiando staging.DERIV_03_Ajuste_Derivados_v2...';
GO

ALTER PROCEDURE [staging].[DERIV_03_Ajuste_Derivados_v2]
    @ID_Ejecucion BIGINT,
    @FechaReporte NVARCHAR(10),
    @ID_Fund INT,
    @Portfolio_Derivados NVARCHAR(50),
    @DebugMode BIT = 0,
    @RowsProcessed INT OUTPUT,
    @ErrorCount INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @StartTime DATETIME = GETDATE();
    DECLARE @RegistrosDerivados INT = 0;
    DECLARE @RegistrosMTM INT = 0;
    DECLARE @SumaTotalMVal FLOAT = 0;
    DECLARE @MaxDiferencia FLOAT;
    DECLARE @ProcName NVARCHAR(100) = 'DERIV_03_v2';

    DECLARE @UmbralAjusteAutomatico FLOAT = 1.0;
    DECLARE @ID_Instrumento_Ajuste INT = 1507;

    DECLARE @TempTableName NVARCHAR(128) = '##Derivados_Work_' + CAST(@ID_Ejecucion AS NVARCHAR(20)) + '_' + CAST(@ID_Fund AS NVARCHAR(10));
    DECLARE @TempAjusteTable NVARCHAR(128) = '##Ajuste_Derivados_' + CAST(@ID_Ejecucion AS NVARCHAR(20)) + '_' + CAST(@ID_Fund AS NVARCHAR(10));
    DECLARE @SQL NVARCHAR(MAX);

    SET @RowsProcessed = 0;
    SET @ErrorCount = 0;

    BEGIN TRY
        IF @ID_Ejecucion IS NULL OR @ID_Ejecucion <= 0
        BEGIN
            SET @ErrorCount = 1;
            PRINT 'DERIV_03_v2 ERROR: ID_Ejecucion inválido';
            RETURN 3;
        END

        IF @ID_Fund IS NULL OR @ID_Fund <= 0
        BEGIN
            SET @ErrorCount = 1;
            PRINT 'DERIV_03_v2 ERROR: ID_Fund inválido';
            RETURN 3;
        END

        IF @Portfolio_Derivados IS NULL OR LEN(@Portfolio_Derivados) = 0
        BEGIN
            SET @ErrorCount = 1;
            PRINT 'DERIV_03_v2 ERROR: Portfolio_Derivados es requerido';
            RETURN 3;
        END

        SET @SQL = 'IF OBJECT_ID(''tempdb..' + @TempTableName + ''') IS NULL
                    BEGIN RAISERROR(''Tabla temporal ' + @TempTableName + ' no existe'', 16, 1) END';
        EXEC sp_executesql @SQL;

        SET @SQL = 'SELECT @cnt = COUNT(*) FROM ' + @TempTableName +
                   ' WHERE ID_Ejecucion = @p_ID_Ejecucion AND ID_Fund = @p_ID_Fund AND FechaReporte = @p_FechaReporte';
        EXEC sp_executesql @SQL,
            N'@p_ID_Ejecucion BIGINT, @p_ID_Fund INT, @p_FechaReporte NVARCHAR(10), @cnt INT OUTPUT',
            @ID_Ejecucion, @ID_Fund, @FechaReporte, @RegistrosDerivados OUTPUT;

        SELECT @RegistrosMTM = COUNT(*)
        FROM staging.IPA_MTM
        WHERE FechaReporte = @FechaReporte AND Portfolio = @Portfolio_Derivados;

        IF @RegistrosDerivados = 0 OR @RegistrosMTM = 0
        BEGIN
            PRINT @ProcName + ': No hay datos suficientes para Portfolio ' + @Portfolio_Derivados;
            RETURN 1;
        END

        CREATE TABLE #Descuadre (Portfolio VARCHAR(100), MVBook_Sistema FLOAT, MTM_Derivados FLOAT, Diferencias FLOAT);

        SET @SQL = '
        INSERT INTO #Descuadre
        SELECT @p_Portfolio_Derivados AS Portfolio,
            ISNULL(m.MVBook, 0) AS MVBook_IPA, ISNULL(d.MTM, 0) AS MTM_Derivados,
            ISNULL(m.MVBook, 0) - ISNULL(d.MTM, 0) AS Diferencias
        FROM (SELECT SUM(ISNULL(MTM, 0)) AS MTM FROM ' + @TempTableName + '
              WHERE ID_Ejecucion = @p_ID_Ejecucion AND ID_Fund = @p_ID_Fund AND FechaReporte = @p_FechaReporte) d
        FULL OUTER JOIN (SELECT SUM(ISNULL(MVBook, 0)) AS MVBook FROM staging.IPA_MTM
              WHERE FechaReporte = @p_FechaReporte AND Portfolio = @p_Portfolio_Derivados) m ON 1=1';
        EXEC sp_executesql @SQL,
            N'@p_ID_Ejecucion BIGINT, @p_ID_Fund INT, @p_FechaReporte NVARCHAR(10), @p_Portfolio_Derivados NVARCHAR(50)',
            @ID_Ejecucion, @ID_Fund, @FechaReporte, @Portfolio_Derivados;

        SELECT @MaxDiferencia = MAX(ABS(Diferencias)) FROM #Descuadre;

        IF @MaxDiferencia > @UmbralAjusteAutomatico
        BEGIN
            INSERT INTO sandbox.Alertas_Descuadre_Derivados (FechaReporte, Portfolio, MVBook_IPA, MTM_Derivados, Diferencia, FechaProceso)
            SELECT @FechaReporte, Portfolio, MVBook_Sistema, MTM_Derivados, Diferencias, GETDATE()
            FROM #Descuadre WHERE ABS(Diferencias) > @UmbralAjusteAutomatico
              AND NOT EXISTS (SELECT 1 FROM sandbox.Alertas_Descuadre_Derivados a
                              WHERE a.FechaReporte = @FechaReporte AND a.Portfolio = @Portfolio_Derivados);

            -- ELIMINADO: INSERT INTO logs.FondosEnStandBy - El evento lo maneja
            -- ELIMINADO: UPDATE logs.Ejecucion_Fondos - El evento lo maneja

            PRINT @ProcName + ' STAND-BY: Descuadre crítico $' + FORMAT(@MaxDiferencia, 'N2');
            SET @ErrorCount = 1;
            DROP TABLE IF EXISTS #Descuadre;
            RETURN 8; -- STAND_BY_DESCUADRES
        END

        -- Crear tabla temporal ##Ajuste_Derivados
        SET @SQL = '
        IF OBJECT_ID(''tempdb..' + @TempAjusteTable + ''', ''U'') IS NULL
        BEGIN
            CREATE TABLE ' + @TempAjusteTable + ' (
                ID_Ejecucion BIGINT NOT NULL, ID_Fund INT NOT NULL, PK2 VARCHAR(50) NOT NULL,
                ID_Instrumento INT NOT NULL, id_CURR INT NOT NULL, FechaReporte VARCHAR(20) NOT NULL,
                FechaCartera VARCHAR(20) NOT NULL, BalanceSheet VARCHAR(50) NOT NULL, Source VARCHAR(50) NOT NULL,
                LocalPrice FLOAT NULL, Qty FLOAT NULL, OriginalFace FLOAT NULL, Factor FLOAT NULL,
                AI FLOAT NULL, MVBook FLOAT NULL, TotalMVal FLOAT NULL, TotalMVal_Balance FLOAT NULL,
                FechaProceso DATETIME NOT NULL
            );
        END
        ELSE
            DELETE FROM ' + @TempAjusteTable + ' WHERE ID_Ejecucion = @p_ID_Ejecucion AND ID_Fund = @p_ID_Fund';
        EXEC sp_executesql @SQL, N'@p_ID_Ejecucion BIGINT, @p_ID_Fund INT', @ID_Ejecucion, @ID_Fund;

        -- Insertar ajuste en tabla temporal
        SET @SQL = '
        INSERT INTO ' + @TempAjusteTable + ' (ID_Ejecucion, ID_Fund, PK2, ID_Instrumento, id_CURR, FechaReporte, FechaCartera,
            BalanceSheet, Source, LocalPrice, Qty, OriginalFace, Factor, AI, MVBook, TotalMVal, TotalMVal_Balance, FechaProceso)
        SELECT @p_ID_Ejecucion, @p_ID_Fund,
            CAST(' + CAST(@ID_Instrumento_Ajuste AS VARCHAR) + ' AS VARCHAR(10)) + ''-'' + CAST(ISNULL(bf.id_CURR, 0) AS VARCHAR(10)),
            ' + CAST(@ID_Instrumento_Ajuste AS VARCHAR) + ', ISNULL(bf.id_CURR, 0), @p_FechaReporte, @p_FechaReporte,
            CASE WHEN d.Diferencias >= 0 THEN ''Asset'' ELSE ''Liability'' END, ''DERIVADOS'',
            0, 0, NULL, NULL, 0, d.Diferencias, d.Diferencias, d.Diferencias, GETDATE()
        FROM #Descuadre d
        LEFT JOIN dimensionales.HOMOL_Funds hf ON d.Portfolio = hf.Portfolio AND hf.Source = ''DERIVADOS''
        LEFT JOIN dimensionales.BD_Funds bf ON hf.ID_Fund = bf.ID_Fund
        WHERE d.Diferencias != 0 AND ABS(d.Diferencias) <= ' + CAST(@UmbralAjusteAutomatico AS VARCHAR);
        EXEC sp_executesql @SQL,
            N'@p_ID_Ejecucion BIGINT, @p_ID_Fund INT, @p_FechaReporte NVARCHAR(10)',
            @ID_Ejecucion, @ID_Fund, @FechaReporte;
        SET @RowsProcessed = @@ROWCOUNT;

        DROP TABLE IF EXISTS #Descuadre;
        PRINT @ProcName + ' OK: ' + CAST(@RowsProcessed AS VARCHAR(10)) + ' ajustes';
        RETURN 0;

    END TRY
    BEGIN CATCH
        DROP TABLE IF EXISTS #Descuadre;
        SET @ErrorCount = 1;
        DECLARE @ErrorNumber INT = ERROR_NUMBER();
        PRINT @ProcName + ' ERROR: ' + ERROR_MESSAGE();
        IF @ErrorNumber = 1205 RETURN 2;
        IF @ErrorNumber IN (-2, 1222) RETURN 2;
        RETURN 3;
    END CATCH
END;
GO

PRINT '   ✓ staging.DERIV_03_Ajuste_Derivados_v2 limpio';
GO

-- ============================================================================
-- 6. staging.Concatenar_Cubo_v3
-- Remover: INSERT INTO logs.Ejecucion_Logs
-- ============================================================================
PRINT '';
PRINT '>> Limpiando staging.Concatenar_Cubo_v3...';
GO

ALTER PROCEDURE staging.Concatenar_Cubo_v3
    @ID_Ejecucion BIGINT,
    @FechaReporte VARCHAR(10) = NULL,
    @Debug BIT = 0
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @StartTime DATETIME = GETDATE();
    DECLARE @TotalRows INT = 0, @FundsProcessed INT = 0;
    DECLARE @Count_IPA INT = 0, @Count_CAPM INT = 0, @Count_PNL INT = 0;
    DECLARE @Count_Derivados INT = 0, @Count_MLCCII INT = 0;

    BEGIN TRY
        IF @ID_Ejecucion IS NULL OR @ID_Ejecucion <= 0
        BEGIN
            RAISERROR('ID_Ejecucion invalido', 16, 1);
            RETURN 3;
        END

        SELECT @Count_IPA = COUNT(*) FROM process.CUBO_Final WHERE ID_Ejecucion = @ID_Ejecucion AND TipoRegistro = 'IPA';
        SELECT @Count_CAPM = COUNT(*) FROM process.CUBO_Final WHERE ID_Ejecucion = @ID_Ejecucion AND TipoRegistro = 'CAPM';
        SELECT @Count_PNL = COUNT(*) FROM process.CUBO_Final WHERE ID_Ejecucion = @ID_Ejecucion AND TipoRegistro = 'PNL';
        SELECT @Count_Derivados = COUNT(*) FROM process.CUBO_Final WHERE ID_Ejecucion = @ID_Ejecucion AND TipoRegistro = 'DERIVADOS';
        SELECT @Count_MLCCII = COUNT(*) FROM process.CUBO_Final WHERE ID_Ejecucion = @ID_Ejecucion AND TipoRegistro IN ('MLCCII', 'MLCCII_DERIV');

        SET @TotalRows = @Count_IPA + @Count_CAPM + @Count_PNL + @Count_Derivados + @Count_MLCCII;
        SELECT @FundsProcessed = COUNT(DISTINCT ID_Fund) FROM process.CUBO_Final WHERE ID_Ejecucion = @ID_Ejecucion;

        IF @TotalRows = 0
        BEGIN
            -- ELIMINADO: INSERT INTO logs.Ejecucion_Logs - El evento lo maneja
            SELECT @ID_Ejecucion AS ID_Ejecucion, 0 AS TotalRows, 0 AS FundsProcessed,
                0 AS Rows_IPA, 0 AS Rows_CAPM, 0 AS Rows_PNL, 0 AS Rows_Derivados, 0 AS Rows_MLCCII,
                DATEDIFF(MILLISECOND, @StartTime, GETDATE()) AS DurationMs, 3 AS ReturnCode, 'No hay datos para ID_Ejecucion' AS Status;
            RETURN 3;
        END

        -- ELIMINADO: INSERT INTO logs.Ejecucion_Logs - El evento lo maneja

        SELECT @ID_Ejecucion AS ID_Ejecucion, @TotalRows AS TotalRows, @FundsProcessed AS FundsProcessed,
            @Count_IPA AS Rows_IPA, @Count_CAPM AS Rows_CAPM, @Count_PNL AS Rows_PNL,
            @Count_Derivados AS Rows_Derivados, @Count_MLCCII AS Rows_MLCCII,
            DATEDIFF(MILLISECOND, @StartTime, GETDATE()) AS DurationMs, 0 AS ReturnCode, 'OK' AS Status;

        PRINT 'Concatenar_Cubo_v3 OK: ' + CAST(@TotalRows AS VARCHAR) + ' registros, ' + CAST(@FundsProcessed AS VARCHAR) + ' fondos';
        RETURN 0;
    END TRY
    BEGIN CATCH
        -- ELIMINADO: INSERT INTO logs.Ejecucion_Logs - El evento lo maneja
        DECLARE @Err NVARCHAR(MAX) = ERROR_MESSAGE();
        SELECT @ID_Ejecucion AS ID_Ejecucion, 0 AS TotalRows, 0 AS FundsProcessed,
            0 AS Rows_IPA, 0 AS Rows_CAPM, 0 AS Rows_PNL, 0 AS Rows_Derivados, 0 AS Rows_MLCCII,
            DATEDIFF(MILLISECOND, @StartTime, GETDATE()) AS DurationMs, 3 AS ReturnCode, @Err AS Status;
        RETURN 3;
    END CATCH
END;
GO

PRINT '   ✓ staging.Concatenar_Cubo_v3 limpio';
GO

-- ============================================================================
-- 7. staging.Consolidar_Fondo_A_Cubo_v3
-- Remover: INSERT INTO logs.Ejecucion_Logs
-- ============================================================================
PRINT '';
PRINT '>> Limpiando staging.Consolidar_Fondo_A_Cubo_v3...';
GO

ALTER PROCEDURE staging.Consolidar_Fondo_A_Cubo_v3
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
            FROM ' + @TempIPAFinal + ' WHERE ID_Ejecucion = @p_ID_Ejecucion AND ID_Fund = @p_ID_Fund';
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
            FROM ' + @TempCAPMWork + ' WHERE ID_Ejecucion = @p_ID_Ejecucion AND ID_Fund = @p_ID_Fund';
            EXEC sp_executesql @SQL,
                N'@p_ID_Ejecucion BIGINT, @p_ID_Fund INT, @p_ID_Proceso BIGINT, @p_FechaProceso NVARCHAR(50)',
                @ID_Ejecucion, @ID_Fund, @ID_Proceso, @FechaProceso;
            SET @Rows_CAPM = @@ROWCOUNT;
        END

        -- PNL
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
                ipa.FechaReporte, ipa.FechaCartera, ipa.BalanceSheet, ipa.Source, ipa.LocalPrice, ipa.Qty,
                ipa.OriginalFace, ipa.Factor, ipa.AI, ipa.MVBook, ipa.TotalMVal, ipa.TotalMVal_Balance,
                ISNULL(pnl.PRgain, 0), ISNULL(pnl.PUgain, 0), ISNULL(pnl.FxRgain, 0), ISNULL(pnl.FxUgain, 0),
                ISNULL(pnl.Income, 0), ISNULL(pnl.TotGL, 0), ISNULL(pnl.PctGL, 0), ISNULL(pnl.BasisPoint, 0), @p_FechaProceso
            FROM ' + @TempIPAFinal + ' ipa
            LEFT JOIN ' + @TempPNLFinal + ' pnl ON ipa.ID_Instrumento = pnl.ID_Instrumento AND ipa.id_CURR = pnl.id_CURR
                AND ipa.ID_Ejecucion = pnl.ID_Ejecucion AND ipa.ID_Fund = pnl.ID_Fund
            WHERE ipa.ID_Ejecucion = @p_ID_Ejecucion AND ipa.ID_Fund = @p_ID_Fund';
            EXEC sp_executesql @SQL,
                N'@p_ID_Ejecucion BIGINT, @p_ID_Fund INT, @p_ID_Proceso BIGINT, @p_FechaProceso NVARCHAR(50)',
                @ID_Ejecucion, @ID_Fund, @ID_Proceso, @FechaProceso;
            SET @Rows_PNL = @@ROWCOUNT;
        END

        SET @TotalRows = @Rows_IPA + @Rows_CAPM + @Rows_PNL;

        -- ELIMINADO: INSERT INTO logs.Ejecucion_Logs - El evento lo maneja

        SELECT @ID_Ejecucion AS ID_Ejecucion, @ID_Fund AS ID_Fund, @TotalRows AS TotalRows,
            @Rows_IPA AS Rows_IPA, @Rows_CAPM AS Rows_CAPM, @Rows_PNL AS Rows_PNL,
            0 AS ReturnCode, 'OK' AS Status;

        RETURN 0;

    END TRY
    BEGIN CATCH
        SET @ErrorMsg = ERROR_MESSAGE();
        -- ELIMINADO: INSERT INTO logs.Ejecucion_Logs - El evento lo maneja
        SELECT @ID_Ejecucion AS ID_Ejecucion, @ID_Fund AS ID_Fund, 0 AS TotalRows,
            0 AS Rows_IPA, 0 AS Rows_CAPM, 0 AS Rows_PNL, 3 AS ReturnCode, @ErrorMsg AS Status;
        RETURN 3;
    END CATCH
END;
GO

PRINT '   ✓ staging.Consolidar_Fondo_A_Cubo_v3 limpio';
GO

-- ============================================================================
-- 8. process.Sync_PNL_To_Graph_v2
-- Remover: UPDATE logs.Ejecucion_Fondos (Graph_Sync_Status)
-- NOTA: Este SP es especial, maneja sincronización con Graph DB
--       Lo limpiamos pero dejamos un comentario explicativo
-- ============================================================================
PRINT '';
PRINT '>> Limpiando process.Sync_PNL_To_Graph_v2...';
GO

ALTER PROCEDURE [process].[Sync_PNL_To_Graph_v2]
    @ID_Ejecucion INT,
    @batch_size INT = 100
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @ProcessDate DATE;
    DECLARE @FundCount INT;
    DECLARE @ErrorMsg NVARCHAR(4000);
    DECLARE @MissingInstrumentsList NVARCHAR(MAX) = NULL;

    SELECT @ProcessDate = Process_Date
    FROM logs.Ejecuciones
    WHERE ID_Ejecucion = @ID_Ejecucion;

    IF @ProcessDate IS NULL
    BEGIN
        PRINT 'No process date found for execution ' + CAST(@ID_Ejecucion AS VARCHAR);
        RETURN 0;
    END

    -- NOTA: Ya no verificamos Graph_Sync_Status porque fue eliminado del schema
    -- El control de sincronización se maneja desde el backend

    PRINT '========================================';
    PRINT 'GRAPH DATABASE SYNCHRONIZATION';
    PRINT 'Execution: ' + CAST(@ID_Ejecucion AS VARCHAR);
    PRINT 'Date: ' + CAST(@ProcessDate AS VARCHAR);
    PRINT '========================================';

    BEGIN TRY
        EXEC process.usp_Update_Instruments_Bitemporal;
        PRINT 'Instrument update completed';
    END TRY
    BEGIN CATCH
        PRINT 'WARNING: Instrument update failed: ' + ERROR_MESSAGE();
    END CATCH

    BEGIN TRY
        EXEC process.usp_Update_Instrument_Evolutions;
        PRINT 'Evolution update completed';
    END TRY
    BEGIN CATCH
        PRINT 'WARNING: Evolution update failed: ' + ERROR_MESSAGE();
    END CATCH

    BEGIN TRY
        EXEC process.usp_Load_Fund_Position
            @start_date = @ProcessDate,
            @end_date = @ProcessDate,
            @batch_size = @batch_size,
            @MissingInstruments = @MissingInstrumentsList OUTPUT;

        IF @MissingInstrumentsList IS NOT NULL AND LEN(@MissingInstrumentsList) > 0
        BEGIN
            PRINT 'WARNING: Some instruments were skipped: ' + @MissingInstrumentsList;
        END

        -- ELIMINADO: UPDATE logs.Ejecucion_Fondos - El evento lo maneja
        PRINT 'Graph sync completed successfully';
        RETURN 0;

    END TRY
    BEGIN CATCH
        SET @ErrorMsg = ERROR_MESSAGE();
        -- ELIMINADO: UPDATE logs.Ejecucion_Fondos - El evento lo maneja
        PRINT 'Graph sync ERROR: ' + @ErrorMsg;
        RETURN -1;
    END CATCH
END;
GO

PRINT '   ✓ process.Sync_PNL_To_Graph_v2 limpio';
GO

-- ============================================================================
-- 9. Eliminar trigger temporal de compatibilidad
-- ============================================================================
PRINT '';
PRINT '>> Eliminando trigger TR_Ejecucion_Fondos_Update...';
GO

IF EXISTS (SELECT 1 FROM sys.triggers WHERE name = 'TR_Ejecucion_Fondos_Update' AND parent_id = OBJECT_ID('logs.Ejecucion_Fondos'))
BEGIN
    DROP TRIGGER logs.TR_Ejecucion_Fondos_Update;
    PRINT '   ✓ Trigger eliminado';
END
ELSE
BEGIN
    PRINT '   (trigger no existía)';
END
GO

-- ============================================================================
-- RESUMEN
-- ============================================================================
PRINT '';
PRINT '================================================';
PRINT 'MIGRACIÓN 102 COMPLETADA';
PRINT '================================================';
PRINT '';
PRINT 'SPs limpiados:';
PRINT '  ✓ staging.PNL_02_Ajuste_v2';
PRINT '  ✓ staging.CAPM_02_Extract_Transform_v2';
PRINT '  ✓ staging.IPA_01_RescatarLocalPrice_v2';
PRINT '  ✓ staging.DERIV_02_Homologar_Dimensiones_v2';
PRINT '  ✓ staging.DERIV_03_Ajuste_Derivados_v2';
PRINT '  ✓ staging.Concatenar_Cubo_v3';
PRINT '  ✓ staging.Consolidar_Fondo_A_Cubo_v3';
PRINT '  ✓ process.Sync_PNL_To_Graph_v2';
PRINT '';
PRINT 'Trigger eliminado:';
PRINT '  ✓ logs.TR_Ejecucion_Fondos_Update';
PRINT '';
PRINT 'ARQUITECTURA EVENT-DRIVEN:';
PRINT '  - SPs solo procesan datos y retornan códigos';
PRINT '  - TrackingService escucha eventos y actualiza estados';
PRINT '  - logs.StandBy y logs.EventosDetallados se llenan via eventos';
PRINT '';
GO
