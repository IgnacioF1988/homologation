/*
================================================================================
SP: extract.Extract_PosModRF
Descripcion: Extrae datos de Posiciones Mod RF para un fondo especifico.
             Version Per-Fund v2 con soporte para ejecucion paralela.

Fuente: GD_EG_001.dbo.GD_R_Positions_Mod_RF

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

CREATE OR ALTER PROCEDURE [extract].[Extract_PosModRF]
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
    PRINT 'EXTRACT_POSMODRF - INICIO (v2 - Per-Fund)';
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
            @SPName = 'Extract_PosModRF',
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
        FROM [GD_EG_001].[dbo].[GD_R_Positions_Mod_RF] WITH (NOLOCK)
        WHERE CAST(Fecha AS DATE) = @FechaReporte
          AND Portfolio = @Portfolio
          AND extract.fn_IsExcludedPortfolio(Portfolio) = 0;

        PRINT 'VALIDACION: Registros encontrados para ' + @Portfolio + ' = ' + CAST(@SourceRows AS NVARCHAR(10));

        IF @SourceRows = 0
        BEGIN
            PRINT 'INFORMACION: No hay datos PosModRF para ' + @Portfolio;
            PRINT 'EXTRACT_POSMODRF - FINALIZADO (Sin datos)';
            RETURN 1;  -- WARNING
        END

        -- =====================================================================
        -- INSERTAR DATOS
        -- =====================================================================
        BEGIN TRANSACTION;

        ;WITH PosModRF_Data AS (
            SELECT
                @PortfolioNormalizado AS Portfolio,
                CAST(Fecha AS DATE) AS FechaReporte,
                CAST(Fecha AS DATE) AS FechaCartera,
                Investment_Code AS InvestID,
                OriginalFace,
                Factor,
                TotalMkt,
                Investment_BifurcationCurrency_Code AS Code
            FROM [GD_EG_001].[dbo].[GD_R_Positions_Mod_RF] WITH (NOLOCK)
            WHERE CAST(Fecha AS DATE) = @FechaReporte
              AND Portfolio = @Portfolio
              AND Portfolio NOT IN ('MCCDF', 'Moneda GSI RER')
        )
        INSERT INTO [extract].[PosModRF] WITH (ROWLOCK)
        (
            ID_Proceso, ID_Ejecucion, ID_Fund,
            Portfolio, FechaReporte, FechaCartera, InvestID,
            OriginalFace, Factor, TotalMkt, Code
        )
        SELECT
            @ID_Proceso, @ID_Ejecucion, @ID_Fund,
            Portfolio, FechaReporte, FechaCartera, InvestID,
            OriginalFace, Factor, TotalMkt, Code
        FROM PosModRF_Data;

        SET @RowsInserted = @@ROWCOUNT;

        IF @RowsInserted <> @SourceRows
        BEGIN
            PRINT 'ADVERTENCIA: Discrepancia - Esperados: ' + CAST(@SourceRows AS NVARCHAR(10)) +
                  ', Insertados: ' + CAST(@RowsInserted AS NVARCHAR(10));
        END

        COMMIT TRANSACTION;

        -- =====================================================================
        -- ACTUALIZACION DESDE PosModRF_1 (Override)
        -- =====================================================================
        DECLARE @PosModRF1Rows INT = 0;

        SELECT @PosModRF1Rows = COUNT(*)
        FROM [extract].[PosModRF_1] WITH (NOLOCK)
        WHERE FechaReporte = @FechaReporte AND Portfolio = @PortfolioNormalizado;

        IF @PosModRF1Rows > 0
        BEGIN
            UPDATE pmrf WITH (ROWLOCK)
            SET
                pmrf.Portfolio = pmrf1.Portfolio,
                pmrf.InvestID = pmrf1.InvestID,
                pmrf.Code = pmrf1.Code,
                pmrf.OriginalFace = pmrf1.OriginalFace,
                pmrf.Factor = pmrf1.Factor,
                pmrf.TotalMkt = pmrf1.TotalMkt
            FROM [extract].[PosModRF] pmrf
            INNER JOIN [extract].[PosModRF_1] pmrf1 WITH (NOLOCK)
                ON pmrf.[PM_IDREG] = pmrf1.[PM_IDREG]
            WHERE pmrf.FechaReporte = @FechaReporte
              AND pmrf.ID_Ejecucion = @ID_Ejecucion
              AND pmrf.ID_Fund = @ID_Fund;

            SET @RowsUpdated = @@ROWCOUNT;
            PRINT 'ACTUALIZACION: Registros actualizados desde PosModRF_1 = ' + CAST(@RowsUpdated AS NVARCHAR(10));
        END

        -- =====================================================================
        -- RESUMEN
        -- =====================================================================
        PRINT '========================================';
        PRINT 'EXTRACT_POSMODRF - COMPLETADO';
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
        PRINT 'EXTRACT_POSMODRF - ERROR';
        PRINT 'Mensaje: ' + @ErrorMessage;
        PRINT 'Linea: ' + CAST(ERROR_LINE() AS NVARCHAR(10));
        PRINT '========================================';

        PRINT 'Extract_PosModRF ERROR: ' + @ErrorMessage;
        RETURN 3;  -- ERROR_CRITICO
    END CATCH
END
GO
