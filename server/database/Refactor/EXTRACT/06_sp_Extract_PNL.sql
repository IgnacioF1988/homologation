/*
================================================================================
SP: extract.Extract_PNL
Descripcion: Extrae datos PNL (Profit and Loss) para un fondo especifico.
             Version Per-Fund v2 con soporte para ejecucion paralela.

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

Autor: Refactorizacion Pipeline IPA
Fecha: 2026-01-02
================================================================================
*/

CREATE OR ALTER PROCEDURE [extract].[Extract_PNL]
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

    -- Variables de control
    DECLARE @RowsInserted INT = 0;
    DECLARE @SourceRows INT = 0;
    DECLARE @RowsUpdated INT = 0;
    DECLARE @StartTime DATETIME = GETDATE();
    DECLARE @ErrorMessage NVARCHAR(4000);
    DECLARE @PortfolioNormalizado NVARCHAR(100);
    DECLARE @ReturnCode INT;

    -- Log inicio
    PRINT '========================================';
    PRINT 'EXTRACT_PNL - INICIO (v2 - Per-Fund)';
    PRINT 'Fecha: ' + ISNULL(@FechaReporte, 'NULL');
    PRINT 'ID_Proceso: ' + CAST(@ID_Proceso AS NVARCHAR(20));
    PRINT 'ID_Ejecucion: ' + CAST(@ID_Ejecucion AS NVARCHAR(20));
    PRINT 'ID_Fund: ' + CAST(@ID_Fund AS NVARCHAR(10));
    PRINT 'Portfolio: ' + ISNULL(@Portfolio, 'NULL');
    PRINT 'Hora Inicio: ' + CONVERT(VARCHAR(23), @StartTime, 121);
    PRINT '========================================';

    BEGIN TRY
        -- =====================================================================
        -- VALIDACIONES
        -- =====================================================================
        EXEC @ReturnCode = extract.sp_ValidateExtractParams
            @SPName = 'Extract_PNL',
            @FechaReporte = @FechaReporte,
            @Portfolio = @Portfolio,
            @RequirePortfolio = 1;

        IF @ReturnCode != 0
            RETURN 3;  -- ERROR_CRITICO

        -- Normalizar portfolio
        SET @PortfolioNormalizado = extract.fn_NormalizePortfolio(@Portfolio);

        -- =====================================================================
        -- VERIFICAR DATOS EN ORIGEN
        -- =====================================================================
        SELECT @SourceRows = COUNT(*)
        FROM [GD_EG_001].[dbo].[GD_R_Profit_And_Lost_Investment] WITH (NOLOCK)
        WHERE CAST(Fecha AS DATE) = @FechaReporte
          AND Portfolio = @Portfolio
          AND extract.fn_IsExcludedPortfolio(Portfolio) = 0;

        PRINT 'VALIDACION: Registros encontrados para ' + @Portfolio + ' = ' + CAST(@SourceRows AS NVARCHAR(10));

        IF @SourceRows = 0
        BEGIN
            PRINT 'INFORMACION: No hay datos PNL para ' + @Portfolio;
            PRINT 'EXTRACT_PNL - FINALIZADO (Sin datos)';
            RETURN 1;
        END

        -- =====================================================================
        -- INSERTAR DATOS
        -- =====================================================================
        BEGIN TRANSACTION;

        ;WITH PNL_Data AS (
            SELECT
                @PortfolioNormalizado AS Portfolio,
                CAST(Fecha AS DATE) AS FechaReporte,
                CAST(Fecha AS DATE) AS FechaCartera,
                Group1,
                Symb,
                Invest,
                PRgain,
                PUgain,
                FxRgain,
                FxUgain,
                Income,
                TotGL,
                PctGL,
                BasisPoint,
                Currency
            FROM [GD_EG_001].[dbo].[GD_R_Profit_And_Lost_Investment] WITH (NOLOCK)
            WHERE CAST(Fecha AS DATE) = @FechaReporte
              AND Portfolio = @Portfolio
              AND Portfolio NOT IN ('MCCDF', 'Moneda GSI RER')
        )
        INSERT INTO [extract].[PNL] WITH (ROWLOCK)
        (
            ID_Proceso, ID_Ejecucion, ID_Fund,
            Portfolio, FechaReporte, FechaCartera,
            Group1, Symb, Invest,
            PRgain, PUgain, FxRgain, FxUgain, Income,
            TotGL, PctGL, BasisPoint, Currency
        )
        SELECT
            @ID_Proceso, @ID_Ejecucion, @ID_Fund,
            Portfolio, FechaReporte, FechaCartera,
            Group1, Symb, Invest,
            PRgain, PUgain, FxRgain, FxUgain, Income,
            TotGL, PctGL, BasisPoint, Currency
        FROM PNL_Data;

        SET @RowsInserted = @@ROWCOUNT;

        IF @RowsInserted <> @SourceRows
        BEGIN
            PRINT 'ADVERTENCIA: Discrepancia - Esperados: ' + CAST(@SourceRows AS NVARCHAR(10)) +
                  ', Insertados: ' + CAST(@RowsInserted AS NVARCHAR(10));
        END

        COMMIT TRANSACTION;

        -- =====================================================================
        -- ACTUALIZACION DESDE PNL_1 (Override)
        -- =====================================================================
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

        -- =====================================================================
        -- RESUMEN
        -- =====================================================================
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

        SET @ErrorMessage = ERROR_MESSAGE();

        PRINT '========================================';
        PRINT 'EXTRACT_PNL - ERROR';
        PRINT 'Mensaje: ' + @ErrorMessage;
        PRINT 'Linea: ' + CAST(ERROR_LINE() AS NVARCHAR(10));
        PRINT '========================================';

        PRINT 'Extract_PNL ERROR: ' + @ErrorMessage;
        RETURN 3;  -- ERROR_CRITICO
    END CATCH
END
GO
