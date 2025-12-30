-- ============================================================================
-- MIGRACIÓN 103: SPs retornan datos de homologación como recordset
-- ============================================================================
-- ARQUITECTURA EVENT-DRIVEN:
-- Los SPs NO escriben a sandbox.*, solo retornan los datos como recordset.
-- TrackingService recibe los datos via evento y escribe a sandbox.
-- ============================================================================

SET NOCOUNT ON;
GO

PRINT '================================================';
PRINT 'MIGRACIÓN 103: SPs retornan datos homologación';
PRINT 'Fecha: ' + CONVERT(VARCHAR, GETDATE(), 120);
PRINT '================================================';
GO

-- ============================================================================
-- 1. staging.PNL_01_Dimensiones_v2
-- ============================================================================
PRINT '';
PRINT '>> Modificando staging.PNL_01_Dimensiones_v2...';
GO

ALTER PROCEDURE [staging].[PNL_01_Dimensiones_v2]
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
    DECLARE @RowsInserted INT = 0;
    DECLARE @ProcName NVARCHAR(100) = 'PNL_01_v2';
    DECLARE @TempTableName NVARCHAR(128) = '##PNL_Work_' + CAST(@ID_Ejecucion AS NVARCHAR(20)) + '_' + CAST(@ID_Fund AS NVARCHAR(10));

    SET @RowsProcessed = 0;
    SET @ErrorCount = 0;

    BEGIN TRY
        IF @ID_Ejecucion IS NULL OR @ID_Ejecucion <= 0
        BEGIN
            SET @ErrorCount = 1;
            PRINT 'PNL_01_v2 ERROR: ID_Ejecucion inválido';
            RETURN 3;
        END

        IF @ID_Fund IS NULL OR @ID_Fund <= 0
        BEGIN
            SET @ErrorCount = 1;
            PRINT 'PNL_01_v2 ERROR: ID_Fund inválido';
            RETURN 3;
        END

        IF @Portfolio_PNL IS NULL OR LEN(@Portfolio_PNL) = 0
        BEGIN
            SET @ErrorCount = 1;
            PRINT 'PNL_01_v2 ERROR: Portfolio_PNL es requerido';
            RETURN 3;
        END

        DECLARE @FondoActivo BIT;
        SELECT @FondoActivo = Activo_MantenedorFondos FROM dimensionales.BD_Funds WHERE ID_Fund = @ID_Fund;

        IF @FondoActivo IS NULL
        BEGIN
            SET @ErrorCount = 1;
            PRINT 'PNL_01_v2 ERROR: Fondo no encontrado en BD_Funds';
            RETURN 3;
        END

        IF NOT EXISTS (SELECT 1 FROM extract.PNL WHERE FechaReporte = @FechaReporte AND Portfolio = @Portfolio_PNL COLLATE DATABASE_DEFAULT)
        BEGIN
            IF @FondoActivo = 1
            BEGIN
                SET @ErrorCount = 1;
                -- Retornar problema como recordset
                SELECT 'FONDO_PROBLEMA' AS TipoHomologacion,
                       CAST(@ID_Fund AS NVARCHAR(50)) AS Item,
                       NULL AS Currency,
                       'GENEVA' AS Source,
                       CONCAT('Fondo activo sin datos en extract.PNL para Portfolio ', @Portfolio_PNL) AS Detalle;
                PRINT @ProcName + ' ERROR: Fondo activo sin datos PNL (código 3)';
                RETURN 3;
            END
            ELSE
            BEGIN
                PRINT @ProcName + ' OK: Fondo inactivo sin datos PNL (skip válido)';
                RETURN 0;
            END
        END

        DECLARE @SQL NVARCHAR(MAX);

        SET @SQL = 'IF OBJECT_ID(''tempdb..' + @TempTableName + ''') IS NOT NULL DROP TABLE ' + @TempTableName;
        EXEC sp_executesql @SQL;

        SET @SQL = '
        CREATE TABLE ' + @TempTableName + ' (
            ID_Ejecucion BIGINT NOT NULL, ID_Fund INT NOT NULL,
            Portfolio NVARCHAR(50) COLLATE DATABASE_DEFAULT, FechaReporte NVARCHAR(10) COLLATE DATABASE_DEFAULT,
            FechaCartera NVARCHAR(10) COLLATE DATABASE_DEFAULT, Group1 NVARCHAR(100) COLLATE DATABASE_DEFAULT,
            Symb NVARCHAR(100) COLLATE DATABASE_DEFAULT, PRgain DECIMAL(28,8), PUgain DECIMAL(28,8),
            FxRgain DECIMAL(28,8), FxUgain DECIMAL(28,8), Income DECIMAL(28,8), TotGL DECIMAL(28,8),
            PctGL DECIMAL(28,8), BasisPoint DECIMAL(28,8), LocalCurrency NVARCHAR(50) COLLATE DATABASE_DEFAULT,
            Source NVARCHAR(20) COLLATE DATABASE_DEFAULT, ID_Instrumento INT, id_CURR INT, PK2 NVARCHAR(50) COLLATE DATABASE_DEFAULT
        )';
        EXEC sp_executesql @SQL;

        SET @SQL = '
        INSERT INTO ' + @TempTableName + '
        (ID_Ejecucion, ID_Fund, Portfolio, FechaReporte, FechaCartera, Group1, Symb, PRgain, PUgain, FxRgain, FxUgain, Income, TotGL, PctGL, BasisPoint, LocalCurrency)
        SELECT @p_ID_Ejecucion, @p_ID_Fund, Portfolio, FechaReporte, FechaCartera, Group1, Symb, PRgain, PUgain, FxRgain, FxUgain, Income, TotGL, PctGL, BasisPoint, Currency
        FROM extract.PNL WHERE FechaReporte = @p_FechaReporte AND Portfolio = @p_Portfolio_PNL COLLATE DATABASE_DEFAULT';
        EXEC sp_executesql @SQL, N'@p_ID_Ejecucion BIGINT, @p_ID_Fund INT, @p_FechaReporte NVARCHAR(10), @p_Portfolio_PNL NVARCHAR(50)', @ID_Ejecucion, @ID_Fund, @FechaReporte, @Portfolio_PNL;
        SET @RowsInserted = @@ROWCOUNT;

        SET @SQL = 'CREATE CLUSTERED INDEX IX_PNL_Work ON ' + @TempTableName + ' (ID_Ejecucion, ID_Fund, Symb, LocalCurrency)';
        EXEC sp_executesql @SQL;

        CREATE TABLE #DatosHomologados (
            Symb NVARCHAR(100) COLLATE DATABASE_DEFAULT, LocalCurrency NVARCHAR(50) COLLATE DATABASE_DEFAULT,
            Portfolio NVARCHAR(50) COLLATE DATABASE_DEFAULT, ID_Fund_Homologado INT, ID_Instrumento_Homologado INT,
            id_CURR_Homologado INT, TieneProblemaHomologacion BIT
        );

        SET @SQL = '
        INSERT INTO #DatosHomologados
        SELECT pnl.Symb, pnl.LocalCurrency, pnl.Portfolio,
            ISNULL(hf.ID_Fund, 0), ISNULL(hi.ID_Instrumento, 0), ISNULL(hm.id_CURR, 0),
            CASE WHEN ISNULL(hf.ID_Fund, 0) = 0 OR ISNULL(hi.ID_Instrumento, 0) = 0 OR ISNULL(hm.id_CURR, 0) = 0 THEN 1 ELSE 0 END
        FROM ' + @TempTableName + ' pnl
        LEFT JOIN dimensionales.HOMOL_Funds hf ON pnl.Portfolio COLLATE DATABASE_DEFAULT = hf.Portfolio COLLATE DATABASE_DEFAULT AND hf.Source = ''GENEVA''
        LEFT JOIN dimensionales.HOMOL_Instrumentos hi ON pnl.Symb COLLATE DATABASE_DEFAULT = hi.SourceInvestment COLLATE DATABASE_DEFAULT AND hi.Source = ''GENEVA''
        LEFT JOIN dimensionales.HOMOL_Monedas hm ON pnl.LocalCurrency COLLATE DATABASE_DEFAULT = hm.Name COLLATE DATABASE_DEFAULT AND hm.Source = ''GENEVA''
        WHERE pnl.ID_Ejecucion = @p_ID_Ejecucion AND pnl.ID_Fund = @p_ID_Fund';
        EXEC sp_executesql @SQL, N'@p_ID_Ejecucion BIGINT, @p_ID_Fund INT', @ID_Ejecucion, @ID_Fund;

        DECLARE @ProblemasHomologacion INT = 0;
        SELECT @ProblemasHomologacion = COUNT(*) FROM #DatosHomologados WHERE TieneProblemaHomologacion = 1;

        IF @ProblemasHomologacion > 0
        BEGIN
            -- RETORNAR datos de homologación como recordset (NO INSERT a sandbox)
            -- TrackingService recibirá estos datos y escribirá a sandbox
            SELECT 'FONDO' AS TipoHomologacion, Portfolio AS Item, NULL AS Currency, 'GENEVA' AS Source, NULL AS Detalle
            FROM #DatosHomologados WHERE ID_Fund_Homologado = 0
            GROUP BY Portfolio
            UNION ALL
            SELECT 'INSTRUMENTO', Symb, LocalCurrency, 'GENEVA', NULL
            FROM #DatosHomologados WHERE ID_Instrumento_Homologado = 0
            GROUP BY Symb, LocalCurrency
            UNION ALL
            SELECT 'MONEDA', LocalCurrency, NULL, 'GENEVA', NULL
            FROM #DatosHomologados WHERE id_CURR_Homologado = 0
            GROUP BY LocalCurrency;

            SET @ErrorCount = @ProblemasHomologacion;
            DROP TABLE IF EXISTS #DatosHomologados;
            PRINT 'PNL_01_v2 STAND-BY: ' + CAST(@ProblemasHomologacion AS VARCHAR(10)) + ' elementos sin homologar';
            RETURN 6; -- STAND_BY_HOMOLOGACION
        END

        SET @SQL = '
        UPDATE pnl SET pnl.Source = ''GENEVA'', pnl.ID_Instrumento = hi.ID_Instrumento, pnl.id_CURR = hm.id_CURR,
            pnl.PK2 = CONCAT(CAST(ISNULL(hi.ID_Instrumento, 0) AS NVARCHAR(10)), ''-'', CAST(ISNULL(hm.id_CURR, 0) AS NVARCHAR(10)))
        FROM ' + @TempTableName + ' pnl
        LEFT JOIN dimensionales.HOMOL_Funds hf ON pnl.Portfolio COLLATE DATABASE_DEFAULT = hf.Portfolio COLLATE DATABASE_DEFAULT AND hf.Source = ''GENEVA''
        LEFT JOIN dimensionales.HOMOL_Instrumentos hi ON pnl.Symb COLLATE DATABASE_DEFAULT = hi.SourceInvestment COLLATE DATABASE_DEFAULT AND hi.Source = ''GENEVA''
        LEFT JOIN dimensionales.HOMOL_Monedas hm ON pnl.LocalCurrency COLLATE DATABASE_DEFAULT = hm.Name COLLATE DATABASE_DEFAULT AND hm.Source = ''GENEVA''
        WHERE pnl.ID_Ejecucion = @p_ID_Ejecucion AND pnl.ID_Fund = @p_ID_Fund';
        EXEC sp_executesql @SQL, N'@p_ID_Ejecucion BIGINT, @p_ID_Fund INT', @ID_Ejecucion, @ID_Fund;

        SET @SQL = 'SELECT @cnt = COUNT(*) FROM ' + @TempTableName + ' WHERE ID_Ejecucion = @p_ID_Ejecucion AND ID_Fund = @p_ID_Fund';
        EXEC sp_executesql @SQL, N'@p_ID_Ejecucion BIGINT, @p_ID_Fund INT, @cnt INT OUTPUT', @ID_Ejecucion, @ID_Fund, @RowsProcessed OUTPUT;

        DROP TABLE IF EXISTS #DatosHomologados;
        PRINT 'PNL_01_v2 OK: ' + CAST(@RowsProcessed AS VARCHAR(10)) + ' registros';
        RETURN 0;

    END TRY
    BEGIN CATCH
        DROP TABLE IF EXISTS #DatosHomologados;
        BEGIN TRY SET @SQL = 'DROP TABLE IF EXISTS ' + @TempTableName; EXEC sp_executesql @SQL; END TRY BEGIN CATCH END CATCH
        SET @ErrorCount = 1;
        DECLARE @ErrorNumber INT = ERROR_NUMBER();
        PRINT 'PNL_01_v2 ERROR: ' + ERROR_MESSAGE();
        IF @ErrorNumber = 1205 RETURN 2;
        IF @ErrorNumber IN (-2, 1222) RETURN 2;
        RETURN 3;
    END CATCH
END;
GO

PRINT '   ✓ staging.PNL_01_Dimensiones_v2 modificado';
GO

-- ============================================================================
-- 2. staging.CAPM_02_Extract_Transform_v2
-- ============================================================================
PRINT '';
PRINT '>> Modificando staging.CAPM_02_Extract_Transform_v2...';
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
            -- RETORNAR datos como recordset (NO INSERT a sandbox)
            SELECT 'FONDO' AS TipoHomologacion, Portfolio AS Item, NULL AS Currency, 'CASH APPRAISAL' AS Source, NULL AS Detalle
            FROM #DatosHomologados WHERE ID_Fund_Homol = 0
            GROUP BY Portfolio
            UNION ALL
            SELECT 'INSTRUMENTO', InvestID, LocalCurrency, 'CASH APPRAISAL', NULL
            FROM #DatosHomologados WHERE ID_Instrumento = 0
            GROUP BY InvestID, LocalCurrency
            UNION ALL
            SELECT 'MONEDA', LocalCurrency, NULL, 'CASH APPRAISAL', NULL
            FROM #DatosHomologados WHERE id_CURR = 0
            GROUP BY LocalCurrency;

            SET @ErrorCount = @ProblemasHomologacion;
            DROP TABLE IF EXISTS #DatosHomologados;
            PRINT 'CAPM_02_v2 STAND-BY: ' + CAST(@ProblemasHomologacion AS VARCHAR(10)) + ' elementos sin homologar';
            RETURN 6; -- STAND_BY_HOMOLOGACION
        END

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

PRINT '   ✓ staging.CAPM_02_Extract_Transform_v2 modificado';
GO

-- ============================================================================
-- 3. staging.DERIV_02_Homologar_Dimensiones_v2
-- ============================================================================
PRINT '';
PRINT '>> Modificando staging.DERIV_02_Homologar_Dimensiones_v2...';
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
                SELECT 'FONDO_PROBLEMA' AS TipoHomologacion,
                       CAST(@ID_Fund AS NVARCHAR(50)) AS Item,
                       NULL AS Currency,
                       'DERIVADOS' AS Source,
                       CONCAT('Fondo requiere derivados sin datos para Portfolio ', @Portfolio_Derivados) AS Detalle;
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
            -- RETORNAR datos como recordset (NO INSERT a sandbox)
            SELECT 'FONDO' AS TipoHomologacion, Portfolio AS Item, NULL AS Currency, 'DERIVADOS' AS Source, NULL AS Detalle
            FROM #DatosHomologados WHERE ID_Fund_Homologado = 0
            GROUP BY Portfolio
            UNION ALL
            SELECT 'INSTRUMENTO', InvestID, Code, 'DERIVADOS', NULL
            FROM #DatosHomologados WHERE ID_Instrumento_Homologado = 0
            GROUP BY InvestID, Code
            UNION ALL
            SELECT 'MONEDA', Code, NULL, 'DERIVADOS', NULL
            FROM #DatosHomologados WHERE id_CURR_Homologado = 0
            GROUP BY Code;

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

PRINT '   ✓ staging.DERIV_02_Homologar_Dimensiones_v2 modificado';
GO

-- ============================================================================
-- 4. staging.DERIV_03_Ajuste_Derivados_v2 (para DESCUADRES)
-- ============================================================================
PRINT '';
PRINT '>> Modificando staging.DERIV_03_Ajuste_Derivados_v2...';
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
            -- RETORNAR descuadre como recordset (NO INSERT a sandbox)
            SELECT 'DESCUADRE' AS TipoHomologacion,
                   Portfolio AS Item,
                   NULL AS Currency,
                   'DERIVADOS' AS Source,
                   CONCAT('Descuadre IPA-Derivados: MVBook=', FORMAT(MVBook_Sistema, 'N2'),
                          ', MTM=', FORMAT(MTM_Derivados, 'N2'),
                          ', Diferencia=', FORMAT(Diferencias, 'N2')) AS Detalle
            FROM #Descuadre
            WHERE ABS(Diferencias) > @UmbralAjusteAutomatico;

            PRINT @ProcName + ' STAND-BY: Descuadre crítico $' + FORMAT(@MaxDiferencia, 'N2');
            SET @ErrorCount = 1;
            DROP TABLE IF EXISTS #Descuadre;
            RETURN 8; -- STAND_BY_DESCUADRES
        END

        -- Crear y llenar tabla de ajuste...
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

PRINT '   ✓ staging.DERIV_03_Ajuste_Derivados_v2 modificado';
GO

-- ============================================================================
-- 5. staging.PNL_02_Ajuste_v2 (para DESCUADRES PNL)
-- ============================================================================
PRINT '';
PRINT '>> Modificando staging.PNL_02_Ajuste_v2...';
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
            -- DÍA NO HÁBIL: Acumular
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
            -- DÍA HÁBIL: Transferir
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

            IF @DiferenciaValidacion > 0.01
            BEGIN
                SET @ErrorCount = 1;
                -- RETORNAR descuadre como recordset (NO INSERT a sandbox)
                SELECT 'DESCUADRE' AS TipoHomologacion,
                       @Portfolio_PNL AS Item,
                       NULL AS Currency,
                       'GENEVA' AS Source,
                       CONCAT('Descuadre transferencia PNL: Transferido=', FORMAT(@TotalTransferido, 'N2'),
                              ', Recibido=', FORMAT(@TotalDestinoDespues - @TotalDestinoAntes, 'N2'),
                              ', Diferencia=', FORMAT(@DiferenciaValidacion, 'N2')) AS Detalle;

                PRINT @ProcName + ' STAND-BY: Descuadre transferencia PNL $' + FORMAT(@DiferenciaValidacion, 'N2');
                RETURN 8; -- STAND_BY_DESCUADRES
            END

            SET @RowsProcessed = @RegistrosInsertados;
        END

        PRINT @ProcName + ' OK';
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

PRINT '   ✓ staging.PNL_02_Ajuste_v2 modificado';
GO

-- ============================================================================
-- RESUMEN
-- ============================================================================
PRINT '';
PRINT '================================================';
PRINT 'MIGRACIÓN 103 COMPLETADA';
PRINT '================================================';
PRINT '';
PRINT 'SPs modificados para retornar datos como recordset:';
PRINT '  ✓ staging.PNL_01_Dimensiones_v2';
PRINT '  ✓ staging.CAPM_02_Extract_Transform_v2';
PRINT '  ✓ staging.DERIV_02_Homologar_Dimensiones_v2';
PRINT '  ✓ staging.DERIV_03_Ajuste_Derivados_v2';
PRINT '  ✓ staging.PNL_02_Ajuste_v2';
PRINT '';
PRINT 'Formato recordset retornado:';
PRINT '  TipoHomologacion: FONDO|INSTRUMENTO|MONEDA|DESCUADRE';
PRINT '  Item: nombre del item';
PRINT '  Currency: moneda (para instrumentos)';
PRINT '  Source: GENEVA|CASH APPRAISAL|DERIVADOS';
PRINT '  Detalle: descripción adicional (para descuadres)';
PRINT '';
GO
