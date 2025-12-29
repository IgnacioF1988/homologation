-- =============================================
-- Migration 039: Fix IPA_02 - Implementar ajuste SONA real
-- =============================================

USE [Inteligencia_Producto_Dev];
GO

DROP PROCEDURE IF EXISTS [staging].[IPA_02_AjusteSONA_v2];
GO

CREATE PROCEDURE [staging].[IPA_02_AjusteSONA_v2]
    @ID_Ejecucion BIGINT,
    @FechaReporte NVARCHAR(10),
    @ID_Fund INT,
    @Portfolio_Geneva NVARCHAR(50) = NULL,
    @DebugMode BIT = 0,
    @RowsProcessed INT OUTPUT,
    @ErrorCount INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @TempTableName NVARCHAR(200);
    DECLARE @SQL NVARCHAR(MAX);
    DECLARE @CheckSQL NVARCHAR(MAX);
    DECLARE @TableExists INT;
    DECLARE @TotalBal_SONA FLOAT = 0;
    DECLARE @TotalMVal_IPA FLOAT = 0;
    DECLARE @Diferencia FLOAT = 0;
    DECLARE @RegistrosSONA INT = 0;
    DECLARE @MonedaFondo NVARCHAR(50);

    SET @RowsProcessed = 0;
    SET @ErrorCount = 0;

    IF @ID_Ejecucion IS NULL OR @ID_Ejecucion <= 0 OR @ID_Fund IS NULL OR @ID_Fund <= 0
    BEGIN
        SET @ErrorCount = 1;
        PRINT 'IPA_02_v2 ERROR: Parámetros inválidos';
        RETURN 3;
    END

    BEGIN TRY
        SET @TempTableName = 'tempdb..##IPA_Work_' + CAST(@ID_Ejecucion AS NVARCHAR(20)) + '_' + CAST(@ID_Fund AS NVARCHAR(10));

        -- Verificar tabla temporal existe usando sys.tables
        SET @CheckSQL = N'SELECT @Exists = COUNT(*) FROM tempdb.sys.tables WHERE name = ''##IPA_Work_' + CAST(@ID_Ejecucion AS NVARCHAR(20)) + '_' + CAST(@ID_Fund AS NVARCHAR(10)) + '''';
        EXEC sp_executesql @CheckSQL, N'@Exists INT OUTPUT', @TableExists OUTPUT;

        IF @TableExists = 0
        BEGIN
            PRINT 'IPA_02_v2 ERROR: Tabla temporal no existe';
            SET @ErrorCount = 1;
            RETURN 3;
        END

        IF @DebugMode = 1
            PRINT 'IPA_02_v2 DEBUG: Tabla temporal verificada OK';

        -- Obtener moneda base del fondo
        SELECT @MonedaFondo = FundBaseCurrency
        FROM dimensionales.BD_Funds
        WHERE ID_Fund = @ID_Fund;

        IF @MonedaFondo IS NULL
        BEGIN
            PRINT 'IPA_02_v2 ERROR: No se encontró moneda para fondo ' + CAST(@ID_Fund AS VARCHAR(10));
            SET @ErrorCount = 1;
            RETURN 3;
        END

        -- Verificar si hay datos en SONA para este fondo
        SELECT @RegistrosSONA = COUNT(*)
        FROM extract.SONA
        WHERE ID_Ejecucion = @ID_Ejecucion
          AND FechaReporte = @FechaReporte
          AND ID_Fund = @ID_Fund;

        IF @RegistrosSONA = 0
        BEGIN
            -- No hay datos SONA para este fondo, no hacer ajuste
            PRINT 'IPA_02_v2 INFO: Sin datos SONA para fondo ' + CAST(@ID_Fund AS VARCHAR(10)) + ' - sin ajuste';
            SET @RowsProcessed = 0;
            RETURN 0;
        END

        -- Calcular total SONA (suma de balances)
        SELECT @TotalBal_SONA = SUM(ISNULL(Bal, 0))
        FROM extract.SONA
        WHERE ID_Ejecucion = @ID_Ejecucion
          AND FechaReporte = @FechaReporte
          AND ID_Fund = @ID_Fund;

        -- Calcular total IPA desde temp table (suma AI + MVBook)
        SET @SQL = N'SELECT @Total = SUM(ISNULL(AI, 0) + ISNULL(MVBook, 0)) FROM ' + @TempTableName + ';';
        EXEC sp_executesql @SQL, N'@Total FLOAT OUTPUT', @TotalMVal_IPA OUTPUT;

        -- Calcular diferencia
        SET @Diferencia = ISNULL(@TotalBal_SONA, 0) - ISNULL(@TotalMVal_IPA, 0);

        IF @DebugMode = 1
        BEGIN
            PRINT 'IPA_02_v2 DEBUG: TotalBal_SONA=' + CAST(@TotalBal_SONA AS VARCHAR(20));
            PRINT 'IPA_02_v2 DEBUG: TotalMVal_IPA=' + CAST(@TotalMVal_IPA AS VARCHAR(20));
            PRINT 'IPA_02_v2 DEBUG: Diferencia=' + CAST(@Diferencia AS VARCHAR(20));
        END

        -- Si la diferencia es insignificante (< 0.01), no hacer ajuste
        IF ABS(@Diferencia) < 0.01
        BEGIN
            PRINT 'IPA_02_v2 OK: Diferencia SONA-IPA insignificante (' + CAST(@Diferencia AS VARCHAR(20)) + ') - sin ajuste';
            SET @RowsProcessed = 0;
            RETURN 0;
        END

        -- Insertar registro de ajuste en temp table CON LA MONEDA DEL FONDO
        SET @SQL = N'
        INSERT INTO ' + @TempTableName + ' (
            ID_Ejecucion,
            ID_Fund,
            Portfolio,
            FechaReporte,
            FechaCartera,
            LocalCurrency,
            InvestID,
            InvestDescription,
            Qty,
            LocalPrice,
            CostLocal,
            CostBook,
            UnRealGL,
            AI,
            MVBook,
            Source,
            BalanceSheet
        )
        VALUES (
            @ID_Ejecucion,
            @ID_Fund,
            @Portfolio_Geneva,
            @FechaReporte,
            @FechaReporte,
            @MonedaFondo,
            ''ADJ SONA-IPA'',
            ''Ajuste SONA-IPA'',
            0,
            0,
            0,
            0,
            0,
            0,
            @Diferencia,
            ''GENEVA'',
            CASE WHEN @Diferencia >= 0 THEN ''Asset'' ELSE ''Liability'' END
        );';

        EXEC sp_executesql @SQL,
            N'@ID_Ejecucion BIGINT, @ID_Fund INT, @Portfolio_Geneva NVARCHAR(50), @FechaReporte NVARCHAR(10), @Diferencia FLOAT, @MonedaFondo NVARCHAR(50)',
            @ID_Ejecucion, @ID_Fund, @Portfolio_Geneva, @FechaReporte, @Diferencia, @MonedaFondo;

        SET @RowsProcessed = 1;
        PRINT 'IPA_02_v2 OK: Ajuste SONA insertado - Diferencia=' + CAST(@Diferencia AS VARCHAR(20)) + ', Moneda=' + @MonedaFondo;
        RETURN 0;

    END TRY
    BEGIN CATCH
        SET @ErrorCount = 1;
        PRINT 'IPA_02_v2 ERROR: ' + ERROR_MESSAGE();
        IF ERROR_NUMBER() = 1205 RETURN 2;
        RETURN 3;
    END CATCH
END;
GO

PRINT '✅ Migration 039 completada - IPA_02 con ajuste SONA real implementado';
GO
