/*
================================================================================
SP: extract.Extract_CAPM
Descripcion: Extrae datos CAPM (Cash Appraisal por Moneda) para un fondo.
             Version Per-Fund v2 con soporte para ejecucion paralela.

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

Autor: Refactorizacion Pipeline IPA
Fecha: 2026-01-02
================================================================================
*/

CREATE OR ALTER PROCEDURE [extract].[Extract_CAPM]
    @FechaReporte NVARCHAR(10),
    @ID_Proceso BIGINT,
    @ID_Ejecucion BIGINT,
    @ID_Fund INT,
    @Portfolio NVARCHAR(100)
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
    DECLARE @PortfolioNormalizado NVARCHAR(100);
    DECLARE @ReturnCode INT;

    PRINT '========================================';
    PRINT 'EXTRACT_CAPM - INICIO (v2 - Per-Fund)';
    PRINT 'Fecha: ' + ISNULL(@FechaReporte, 'NULL');
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

        SET @PortfolioNormalizado = extract.fn_NormalizePortfolio(@Portfolio);

        -- Verificar datos en origen
        SELECT @SourceRows = COUNT(*)
        FROM [GD_EG_001].[dbo].[GD_R_Cash_Appraisal_Moneda] WITH (NOLOCK)
        WHERE CAST(Fecha AS DATE) = @FechaReporte
          AND Portfolio = @Portfolio
          AND Portfolio NOT IN ('MCCDF', 'Moneda GSI RER');

        PRINT 'VALIDACION: Registros encontrados para ' + @Portfolio + ' = ' + CAST(@SourceRows AS NVARCHAR(10));

        IF @SourceRows = 0
        BEGIN
            PRINT 'INFORMACION: No hay datos CAPM para ' + @Portfolio;
            PRINT 'EXTRACT_CAPM - FINALIZADO (Sin datos)';
            RETURN 1;
        END

        BEGIN TRANSACTION;

        ;WITH CAPM_Data AS (
            SELECT
                @PortfolioNormalizado AS Portfolio,
                CAST(Fecha AS DATE) AS FechaReporte,
                CAST(Fecha AS DATE) AS FechaCartera,
                LocationAcct AS InvestID,
                InvestDescription AS LocalCurrency,
                TotalText, LSDesc, Qty, FXRate, CostBook, MVBook,
                UnRealGL, percentInvest, percentSign, sumStatement
            FROM [GD_EG_001].[dbo].[GD_R_Cash_Appraisal_Moneda] WITH (NOLOCK)
            WHERE CAST(Fecha AS DATE) = @FechaReporte
              AND Portfolio = @Portfolio
              AND Portfolio NOT IN ('MCCDF', 'Moneda GSI RER')
        )
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
        FROM CAPM_Data;

        SET @RowsInserted = @@ROWCOUNT;

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

        SET @ErrorMessage = ERROR_MESSAGE();

        PRINT '========================================';
        PRINT 'EXTRACT_CAPM - ERROR';
        PRINT 'Mensaje: ' + @ErrorMessage;
        PRINT 'Linea: ' + CAST(ERROR_LINE() AS NVARCHAR(10));
        PRINT '========================================';

        PRINT 'Extract_CAPM ERROR: ' + @ErrorMessage;
        RETURN 3;  -- ERROR_CRITICO
    END CATCH
END
GO
