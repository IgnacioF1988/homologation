/*
================================================================================
SP: extract.Extract_PNL
Descripcion: Extrae datos PNL (Profit and Loss) para un fondo especifico.
             Version v4 - TempTable Stats para cardinalidad exacta.

Fuente: GD_EG_001.dbo.GD_R_Profit_And_Lost_Investment

Parametros:
  @FechaReporte  - Fecha de los datos (YYYY-MM-DD)
  @ID_Proceso    - ID del proceso
  @ID_Ejecucion  - ID de la ejecucion
  @ID_Fund       - ID del fondo
  @Portfolio     - Portfolio Geneva

Codigos de retorno:
  0  = OK (exito con datos)
  1  = WARNING (sin datos, pero OK)
  3  = ERROR_CRITICO

Optimizaciones v4:
  - Temp table #PNL_Stage para estadisticas exactas
  - SQL Server conoce cardinalidad real antes del INSERT
  - Elimina sobreestimacion de memory grants
  - VARCHAR(50) para evitar conversiones implicitas
  - Variables para exclusiones (evita literales NVARCHAR)
  - Rango de fecha sargable

Autor: Refactorizacion Pipeline IPA
Fecha: 2026-01-05
================================================================================
*/

CREATE OR ALTER PROCEDURE [extract].[Extract_PNL]
    @FechaReporte DATE,
    @ID_Proceso BIGINT,
    @ID_Ejecucion BIGINT,
    @ID_Fund INT,
    @Portfolio VARCHAR(50)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    SET TRANSACTION ISOLATION LEVEL READ COMMITTED;

    DECLARE @RowsInserted INT = 0;
    DECLARE @SourceRows INT = 0;
    DECLARE @RowsUpdated INT = 0;
    DECLARE @StartTime DATETIME = GETDATE();
    DECLARE @ErrorMessage NVARCHAR(4000);
    DECLARE @PortfolioNormalizado VARCHAR(50);
    DECLARE @ReturnCode INT;
    DECLARE @FechaInicio DATETIME = CAST(@FechaReporte AS DATETIME);
    DECLARE @FechaFin DATETIME = DATEADD(DAY, 1, @FechaInicio);
    DECLARE @ExcludedPortfolio1 VARCHAR(50) = 'MCCDF';
    DECLARE @ExcludedPortfolio2 VARCHAR(50) = 'Moneda GSI RER';

    PRINT '========================================';
    PRINT 'EXTRACT_PNL - INICIO (v4 - TempTable Stats)';
    PRINT 'Fecha: ' + CONVERT(VARCHAR(10), @FechaReporte, 120);
    PRINT 'ID_Proceso: ' + CAST(@ID_Proceso AS NVARCHAR(20));
    PRINT 'ID_Ejecucion: ' + CAST(@ID_Ejecucion AS NVARCHAR(20));
    PRINT 'ID_Fund: ' + CAST(@ID_Fund AS NVARCHAR(10));
    PRINT 'Portfolio: ' + ISNULL(@Portfolio, 'NULL');
    PRINT 'Hora Inicio: ' + CONVERT(VARCHAR(23), @StartTime, 121);
    PRINT '========================================';

    BEGIN TRY
        EXEC @ReturnCode = extract.sp_ValidateExtractParams
            @SPName = 'Extract_PNL',
            @FechaReporte = @FechaReporte,
            @Portfolio = @Portfolio,
            @RequirePortfolio = 1;

        IF @ReturnCode != 0
            RETURN 3;

        SET @PortfolioNormalizado = CAST(extract.fn_NormalizePortfolio(@Portfolio) AS VARCHAR(50));

        -- FASE 1: Cargar datos en temp table (SQL Server crea estadisticas automaticamente)
        -- NOTA: Group2 contiene la moneda (ej: "U.S. Dollars"), se mapea a Currency
        DROP TABLE IF EXISTS #PNL_Stage;

        SELECT
            @PortfolioNormalizado AS Portfolio,
            @FechaReporte AS FechaReporte,
            @FechaReporte AS FechaCartera,
            Group1, Group2, Symb, Invest,
            Group2 AS Currency,  -- Group2 contiene la moneda
            PRgain, PUgain, FxRgain, FxUgain, Income,
            TotGL, PctGL, BasisPoint
        INTO #PNL_Stage
        FROM [GD_EG_001].[dbo].[GD_R_Profit_And_Lost_Investment] WITH (NOLOCK)
        WHERE Fecha >= @FechaInicio AND Fecha < @FechaFin
          AND Portfolio = @Portfolio
          AND Portfolio NOT IN (@ExcludedPortfolio1, @ExcludedPortfolio2);

        SET @SourceRows = @@ROWCOUNT;

        PRINT 'VALIDACION: Registros en staging para ' + @Portfolio + ' = ' + CAST(@SourceRows AS NVARCHAR(10));

        IF @SourceRows = 0
        BEGIN
            DROP TABLE IF EXISTS #PNL_Stage;
            PRINT 'INFORMACION: No hay datos PNL para ' + @Portfolio;
            PRINT 'EXTRACT_PNL - FINALIZADO (Sin datos)';
            RETURN 1;
        END

        BEGIN TRANSACTION;

        -- FASE 2: INSERT desde temp table (cardinalidad exacta conocida = @SourceRows)
        INSERT INTO [extract].[PNL] WITH (ROWLOCK)
        (
            ID_Proceso, ID_Ejecucion, ID_Fund,
            Portfolio, FechaReporte, FechaCartera,
            Group1, Group2, Symb, Invest, Currency,
            PRgain, PUgain, FxRgain, FxUgain, Income,
            TotGL, PctGL, BasisPoint
        )
        SELECT
            @ID_Proceso, @ID_Ejecucion, @ID_Fund,
            Portfolio, FechaReporte, FechaCartera,
            Group1, Group2, Symb, Invest, Currency,
            PRgain, PUgain, FxRgain, FxUgain, Income,
            TotGL, PctGL, BasisPoint
        FROM #PNL_Stage;

        SET @RowsInserted = @@ROWCOUNT;

        DROP TABLE IF EXISTS #PNL_Stage;

        IF @RowsInserted <> @SourceRows
        BEGIN
            PRINT 'ADVERTENCIA: Discrepancia - Esperados: ' + CAST(@SourceRows AS NVARCHAR(10)) +
                  ', Insertados: ' + CAST(@RowsInserted AS NVARCHAR(10));
        END

        COMMIT TRANSACTION;

        DECLARE @PNL1Rows INT = 0;

        SELECT @PNL1Rows = COUNT(*)
        FROM [extract].[PNL_1] WITH (NOLOCK)
        WHERE FechaReporte = @FechaReporte AND Portfolio = @PortfolioNormalizado;

        IF @PNL1Rows > 0
        BEGIN
            UPDATE pnl WITH (ROWLOCK)
            SET
                pnl.Portfolio = pnl1.Portfolio,
                pnl.Symb = pnl1.Symb,
                pnl.FechaReporte = pnl1.FechaReporte,
                pnl.FechaCartera = pnl1.FechaCartera,
                pnl.Group1 = pnl1.Group1,
                pnl.PRgain = pnl1.PRgain,
                pnl.PUgain = pnl1.PUgain,
                pnl.FxRgain = pnl1.FxRgain,
                pnl.FxUgain = pnl1.FxUgain,
                pnl.Income = pnl1.Income,
                pnl.TotGL = pnl1.TotGL,
                pnl.PctGL = pnl1.PctGL,
                pnl.BasisPoint = pnl1.BasisPoint
            FROM [extract].[PNL] pnl
            INNER JOIN [extract].[PNL_1] pnl1 WITH (NOLOCK)
                ON pnl.[PL_IDREG] = pnl1.[PL_IDREG]
            WHERE pnl.FechaReporte = @FechaReporte
              AND pnl.ID_Ejecucion = @ID_Ejecucion
              AND pnl.ID_Fund = @ID_Fund;

            SET @RowsUpdated = @@ROWCOUNT;
            PRINT 'ACTUALIZACION: Registros actualizados desde PNL_1 = ' + CAST(@RowsUpdated AS NVARCHAR(10));
        END

        PRINT '========================================';
        PRINT 'EXTRACT_PNL - COMPLETADO';
        PRINT 'Insertados: ' + CAST(@RowsInserted AS NVARCHAR(10));
        PRINT 'Actualizados: ' + CAST(@RowsUpdated AS NVARCHAR(10));
        PRINT 'Tiempo: ' + CAST(DATEDIFF(SECOND, @StartTime, GETDATE()) AS NVARCHAR(10)) + 's';
        PRINT '========================================';

        RETURN 0;

    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
            ROLLBACK TRANSACTION;

        DROP TABLE IF EXISTS #PNL_Stage;

        SET @ErrorMessage = ERROR_MESSAGE();

        PRINT '========================================';
        PRINT 'EXTRACT_PNL - ERROR';
        PRINT 'Mensaje: ' + @ErrorMessage;
        PRINT 'Linea: ' + CAST(ERROR_LINE() AS NVARCHAR(10));
        PRINT '========================================';

        RETURN 3;
    END CATCH
END
GO
