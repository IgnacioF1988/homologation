/*
================================================================================
SP: extract.Extract_CAPM
Descripcion: Extrae datos CAPM (Cash Appraisal por Moneda) para un fondo.
             Version v4 - TempTable Stats para cardinalidad exacta.

Fuente: GD_EG_001.dbo.GD_R_Cash_Appraisal_Moneda

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
  - Temp table #CAPM_Stage para estadisticas exactas
  - SQL Server conoce cardinalidad real antes del INSERT
  - Elimina sobreestimacion de memory grants
  - VARCHAR(50) para evitar conversiones implicitas
  - Variables para exclusiones (evita literales NVARCHAR)
  - Rango de fecha sargable

Autor: Refactorizacion Pipeline IPA
Fecha: 2026-01-05
================================================================================
*/

CREATE OR ALTER PROCEDURE [extract].[Extract_CAPM]
    @FechaReporte DATE,                -- DATE para evitar conversiones
    @ID_Proceso BIGINT,
    @ID_Ejecucion BIGINT,
    @ID_Fund INT,
    @Portfolio VARCHAR(50)             -- VARCHAR(50) para coincidir con GD_EG_001
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
    DECLARE @PortfolioNormalizado VARCHAR(100);
    DECLARE @ReturnCode INT;
    -- Variables para rango de fecha sargable
    DECLARE @FechaInicio DATETIME = CAST(@FechaReporte AS DATETIME);
    DECLARE @FechaFin DATETIME = DATEADD(DAY, 1, @FechaInicio);
    -- Variables VARCHAR para exclusiones (evita conversion implicita de literales)
    DECLARE @ExcludedPortfolio1 VARCHAR(50) = 'MCCDF';
    DECLARE @ExcludedPortfolio2 VARCHAR(50) = 'Moneda GSI RER';

    PRINT '========================================';
    PRINT 'EXTRACT_CAPM - INICIO (v4 - TempTable Stats)';
    PRINT 'Fecha: ' + CONVERT(VARCHAR(10), @FechaReporte, 120);
    PRINT 'ID_Proceso: ' + CAST(@ID_Proceso AS NVARCHAR(20));
    PRINT 'ID_Ejecucion: ' + CAST(@ID_Ejecucion AS NVARCHAR(20));
    PRINT 'ID_Fund: ' + CAST(@ID_Fund AS NVARCHAR(10));
    PRINT 'Portfolio: ' + ISNULL(@Portfolio, 'NULL');
    PRINT 'Hora Inicio: ' + CONVERT(VARCHAR(23), @StartTime, 121);
    PRINT '========================================';

    BEGIN TRY
        -- Validaciones
        EXEC @ReturnCode = extract.sp_ValidateExtractParams
            @SPName = 'Extract_CAPM',
            @FechaReporte = @FechaReporte,
            @Portfolio = @Portfolio,
            @RequirePortfolio = 1;

        IF @ReturnCode != 0
            RETURN 3;  -- ERROR_CRITICO

        SET @PortfolioNormalizado = CAST(extract.fn_NormalizePortfolio(@Portfolio) AS VARCHAR(50));

        -- FASE 1: Cargar datos en temp table (SQL Server crea estadisticas automaticamente)
        DROP TABLE IF EXISTS #CAPM_Stage;

        SELECT
            @PortfolioNormalizado AS Portfolio,
            @FechaReporte AS FechaReporte,
            @FechaReporte AS FechaCartera,
            LocationAcct AS InvestID,
            InvestDescription AS LocalCurrency,
            TotalText, LSDesc, Qty, FXRate, CostBook, MVBook,
            UnRealGL, percentInvest, percentSign, sumStatement
        INTO #CAPM_Stage
        FROM [GD_EG_001].[dbo].[GD_R_Cash_Appraisal_Moneda] WITH (NOLOCK)
        WHERE Fecha >= @FechaInicio AND Fecha < @FechaFin
          AND Portfolio = @Portfolio
          AND Portfolio NOT IN (@ExcludedPortfolio1, @ExcludedPortfolio2);

        SET @SourceRows = @@ROWCOUNT;

        PRINT 'VALIDACION: Registros en staging para ' + @Portfolio + ' = ' + CAST(@SourceRows AS NVARCHAR(10));

        IF @SourceRows = 0
        BEGIN
            DROP TABLE IF EXISTS #CAPM_Stage;
            PRINT 'INFORMACION: No hay datos CAPM para ' + @Portfolio;
            PRINT 'EXTRACT_CAPM - FINALIZADO (Sin datos)';
            RETURN 1;
        END

        BEGIN TRANSACTION;

        -- FASE 2: INSERT desde temp table (cardinalidad exacta conocida = @SourceRows)
        INSERT INTO [extract].[CAPM] WITH (ROWLOCK)
        (
            ID_Proceso, ID_Ejecucion, ID_Fund,
            Portfolio, FechaReporte, FechaCartera, InvestID, LocalCurrency,
            TotalText, LSDesc, Qty, FXRate, CostBook, MVBook,
            UnRealGL, percentInvest, percentSign, sumStatement
        )
        SELECT
            @ID_Proceso, @ID_Ejecucion, @ID_Fund,
            Portfolio, FechaReporte, FechaCartera, InvestID, LocalCurrency,
            TotalText, LSDesc, Qty, FXRate, CostBook, MVBook,
            UnRealGL, percentInvest, percentSign, sumStatement
        FROM #CAPM_Stage;

        SET @RowsInserted = @@ROWCOUNT;

        DROP TABLE IF EXISTS #CAPM_Stage;

        IF @RowsInserted <> @SourceRows
        BEGIN
            PRINT 'ADVERTENCIA: Discrepancia - Esperados: ' + CAST(@SourceRows AS NVARCHAR(10)) +
                  ', Insertados: ' + CAST(@RowsInserted AS NVARCHAR(10));
        END

        COMMIT TRANSACTION;

        -- Actualizacion desde CAPM_1
        DECLARE @CAPM1Rows INT = 0;

        SELECT @CAPM1Rows = COUNT(*)
        FROM [extract].[CAPM_1] WITH (NOLOCK)
        WHERE FechaReporte = @FechaReporte AND Portfolio = @PortfolioNormalizado;

        IF @CAPM1Rows > 0
        BEGIN
            UPDATE capm WITH (ROWLOCK)
            SET
                capm.Portfolio = capm1.Portfolio,
                capm.InvestID = capm1.InvestID,
                capm.LocalCurrency = capm1.LocalCurrency,
                capm.Qty = capm1.Qty,
                capm.FXRate = capm1.FXRate,
                capm.CostBook = capm1.CostBook,
                capm.MVBook = capm1.MVBook,
                capm.UnRealGL = capm1.UnRealGL,
                capm.percentInvest = capm1.percentInvest
            FROM [extract].[CAPM] capm
            INNER JOIN [extract].[CAPM_1] capm1 WITH (NOLOCK)
                ON capm.[CA_IDREG] = capm1.[CA_IDREG]
            WHERE capm.FechaReporte = @FechaReporte
              AND capm.ID_Ejecucion = @ID_Ejecucion
              AND capm.ID_Fund = @ID_Fund;

            SET @RowsUpdated = @@ROWCOUNT;
            PRINT 'ACTUALIZACION: Registros actualizados desde CAPM_1 = ' + CAST(@RowsUpdated AS NVARCHAR(10));
        END

        PRINT '========================================';
        PRINT 'EXTRACT_CAPM - COMPLETADO';
        PRINT 'Insertados: ' + CAST(@RowsInserted AS NVARCHAR(10));
        PRINT 'Actualizados: ' + CAST(@RowsUpdated AS NVARCHAR(10));
        PRINT 'Tiempo: ' + CAST(DATEDIFF(SECOND, @StartTime, GETDATE()) AS NVARCHAR(10)) + 's';
        PRINT '========================================';

        RETURN 0;

    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
            ROLLBACK TRANSACTION;

        DROP TABLE IF EXISTS #CAPM_Stage;

        SET @ErrorMessage = ERROR_MESSAGE();

        PRINT '========================================';
        PRINT 'EXTRACT_CAPM - ERROR';
        PRINT 'Mensaje: ' + @ErrorMessage;
        PRINT 'Linea: ' + CAST(ERROR_LINE() AS NVARCHAR(10));
        PRINT '========================================';

        RETURN 3;  -- ERROR_CRITICO
    END CATCH
END
GO
