-- =============================================
-- Migration 035: IPA_01 - Usar tabla temporal global por fondo
-- Cada fondo trabaja en su propia ##IPA_Work_[ID_Ejecucion]_[ID_Fund]
-- =============================================

USE [Inteligencia_Producto_Dev];
GO

DROP PROCEDURE IF EXISTS [staging].[IPA_01_RescatarLocalPrice_v2];
GO

CREATE PROCEDURE [staging].[IPA_01_RescatarLocalPrice_v2]
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

    -- VALIDACIÓN DEFENSIVA
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
        -- Validar datos en extract
        SELECT @RegistrosIPA = COUNT(*)
        FROM [extract].[IPA]
        WHERE ID_Ejecucion = @ID_Ejecucion
          AND FechaReporte = @FechaReporte;

        IF @RegistrosIPA = 0
        BEGIN
            PRINT 'IPA_01_v2 ERROR: Sin datos en extract.IPA para ID_Ejecucion=' + CAST(@ID_Ejecucion AS VARCHAR(20));
            SET @ErrorCount = 1;
            RETURN 3;
        END

        SELECT @RegistrosPosModRF = COUNT(*)
        FROM [extract].[PosModRF]
        WHERE ID_Ejecucion = @ID_Ejecucion
          AND FechaReporte = @FechaReporte;

        -- Construir nombre de tabla temporal global único por fondo
        SET @TempTableName = 'tempdb..##IPA_Work_' + CAST(@ID_Ejecucion AS NVARCHAR(20)) + '_' + CAST(@ID_Fund AS NVARCHAR(10));

        -- Limpiar tabla temporal si existe (por si quedó de ejecución previa fallida)
        SET @SQL = N'
        IF OBJECT_ID(''' + @TempTableName + ''', ''U'') IS NOT NULL
            DROP TABLE ' + @TempTableName + ';';
        EXEC sp_executesql @SQL;

        -- Crear tabla temporal global
        SET @SQL = N'
        CREATE TABLE ' + @TempTableName + ' (
            ID_Ejecucion BIGINT NOT NULL,
            ID_Fund INT NOT NULL,
            Portfolio NVARCHAR(255),
            FechaReporte NVARCHAR(10),
            FechaCartera NVARCHAR(10),
            TotalText NVARCHAR(50),
            ReportMode NVARCHAR(50),
            LSDesc NVARCHAR(50),
            SortKey NVARCHAR(50),
            LocalCurrency NVARCHAR(50),
            BasketInvestDesc NVARCHAR(255),
            InvestID NVARCHAR(255),
            InvestDescription NVARCHAR(500),
            Qty FLOAT,
            LocalPrice FLOAT,
            CostLocal FLOAT,
            CostBook FLOAT,
            UnRealGL FLOAT,
            AI FLOAT,
            MVBook FLOAT,
            PercentInvest FLOAT,
            PercentSign NVARCHAR(10),
            IsSwap NVARCHAR(10),
            BasketInvID NVARCHAR(255),
            OriginalFace FLOAT,
            Factor FLOAT,
            Source NVARCHAR(50),
            ID_Instrumento INT,
            id_CURR INT,
            BalanceSheet NVARCHAR(50),
            PK2 NVARCHAR(50),
            [CXC/CXP?] NVARCHAR(50),
            INDEX IX_Temp_IPA CLUSTERED (ID_Ejecucion, ID_Fund, InvestID)
        );';

        EXEC sp_executesql @SQL;

        -- Insertar datos desde extract.IPA (filtrado por ID_Ejecucion)
        SET @SQL = N'
        INSERT INTO ' + @TempTableName + ' (
            ID_Ejecucion, ID_Fund, Portfolio, FechaReporte, FechaCartera,
            TotalText, ReportMode, LSDesc, SortKey, LocalCurrency,
            BasketInvestDesc, InvestID, InvestDescription, Qty, LocalPrice,
            CostLocal, CostBook, UnRealGL, AI, MVBook,
            PercentInvest, PercentSign, IsSwap, BasketInvID,
            OriginalFace, Factor, Source, ID_Instrumento, id_CURR,
            BalanceSheet, PK2, [CXC/CXP?]
        )
        SELECT
            @ID_Ejecucion,
            @ID_Fund,
            ipa.Portfolio,
            ipa.FechaReporte,
            ipa.FechaCartera,
            ipa.TotalText,
            ipa.ReportMode,
            ipa.LSDesc,
            ipa.SortKey,
            ipa.LocalCurrency,
            ipa.BasketInvestDesc,
            ipa.InvestID,
            ipa.InvestDescription,
            ipa.Qty,
            ipa.LocalPrice,
            ipa.CostLocal,
            ipa.CostBook,
            ipa.UnRealGL,
            ipa.AI,
            ipa.MVBook,
            ipa.PercentInvest,
            ipa.PercentSign,
            ipa.IsSwap,
            ipa.BasketInvID,
            ISNULL(pos.OriginalFace, 0),
            ISNULL(pos.Factor, 1),
            NULL,
            NULL,
            NULL,
            NULL,
            NULL,
            NULL
        FROM [extract].[IPA] ipa
        LEFT JOIN [extract].[PosModRF] pos
            ON ipa.InvestID = pos.InvestID
            AND ipa.ID_Ejecucion = pos.ID_Ejecucion
        WHERE ipa.ID_Ejecucion = @ID_Ejecucion
          AND ipa.FechaReporte = @FechaReporte
          AND NOT EXISTS (
              SELECT 1 FROM sandbox.Fondos_Problema fp
              WHERE fp.ID_Fund = CAST(@ID_Fund AS NVARCHAR(50))
                AND fp.FechaReporte = @FechaReporte
                AND fp.Proceso = ''Orquestador''
          );';

        EXEC sp_executesql @SQL,
            N'@ID_Ejecucion BIGINT, @ID_Fund INT, @FechaReporte NVARCHAR(10)',
            @ID_Ejecucion, @ID_Fund, @FechaReporte;

        SET @RowsProcessed = @@ROWCOUNT;

        PRINT 'IPA_01_v2 OK: ' + CAST(@RowsProcessed AS VARCHAR(10)) + ' registros insertados en ' + @TempTableName;

        RETURN 0;

    END TRY
    BEGIN CATCH
        SET @ErrorCount = 1;
        PRINT 'IPA_01_v2 ERROR: ' + ERROR_MESSAGE();

        BEGIN TRY
            INSERT INTO logs.SP_Errors (ID_Ejecucion, ID_Fund, SP_Name, ErrorNumber, ErrorMessage, ErrorSeverity, ErrorState, ErrorLine)
            VALUES (@ID_Ejecucion, @ID_Fund, OBJECT_NAME(@@PROCID), ERROR_NUMBER(), ERROR_MESSAGE(), ERROR_SEVERITY(), ERROR_STATE(), ERROR_LINE());
        END TRY
        BEGIN CATCH END CATCH

        IF ERROR_NUMBER() = 1205 RETURN 2;
        RETURN 3;
    END CATCH
END;
GO

PRINT '✅ Migration 035 completada - IPA_01 usando tablas temporales globales';
GO
