/*
================================================================================
SP: extract.Extract_Derivados
Descripcion: Extrae datos de Derivados para un fondo especifico.
             Version Per-Fund v2 con soporte para ejecucion paralela.

Fuente: Inteligencia_Producto.dbo.TBL_DERIVADOS_INTELIGENCIA

Parametros:
  @FechaReporte  - Fecha de los datos (YYYY-MM-DD)
  @ID_Proceso    - ID del proceso
  @ID_Ejecucion  - ID de la ejecucion
  @ID_Fund       - ID del fondo
  @Portfolio     - Portfolio Geneva

Codigos de retorno:
  0  = OK (exito con datos)
  1  = WARNING (sin datos o sin IPA previo, pero OK)
  3  = ERROR_CRITICO

Autor: Refactorizacion Pipeline IPA
Fecha: 2026-01-02
================================================================================
*/

CREATE OR ALTER PROCEDURE [extract].[Extract_Derivados]
    @FechaReporte DATE,                -- DATE para consistencia con otros Extract SPs
    @ID_Proceso BIGINT,
    @ID_Ejecucion BIGINT,
    @ID_Fund INT,
    @Portfolio VARCHAR(50)             -- VARCHAR para evitar conversiones
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    SET TRANSACTION ISOLATION LEVEL READ COMMITTED;

    DECLARE @RowsInserted INT = 0;
    DECLARE @SourceRows INT = 0;
    DECLARE @RowsTransformed INT = 0;
    DECLARE @StartTime DATETIME = GETDATE();
    DECLARE @ErrorMessage NVARCHAR(4000);
    DECLARE @PortfolioNormalizado VARCHAR(100);
    DECLARE @PortfolioSource VARCHAR(100);
    DECLARE @ExisteEnIPA INT = 0;
    DECLARE @ReturnCode INT;
    -- FechaReporte como VARCHAR para comparar con TBL_DERIVADOS_INTELIGENCIA (varchar)
    DECLARE @FechaReporteStr VARCHAR(10) = CONVERT(VARCHAR(10), @FechaReporte, 120);

    PRINT '========================================';
    PRINT 'EXTRACT_DERIVADOS - INICIO (v2 - Per-Fund)';
    PRINT 'Fecha: ' + @FechaReporteStr;
    PRINT 'ID_Proceso: ' + CAST(@ID_Proceso AS NVARCHAR(20));
    PRINT 'ID_Ejecucion: ' + CAST(@ID_Ejecucion AS NVARCHAR(20));
    PRINT 'ID_Fund: ' + CAST(@ID_Fund AS NVARCHAR(10));
    PRINT 'Portfolio: ' + ISNULL(@Portfolio, 'NULL');
    PRINT 'Hora Inicio: ' + CONVERT(VARCHAR(23), @StartTime, 121);
    PRINT '========================================';

    BEGIN TRY
        -- Validaciones
        EXEC @ReturnCode = extract.sp_ValidateExtractParams
            @SPName = 'Extract_Derivados',
            @FechaReporte = @FechaReporte,
            @Portfolio = @Portfolio,
            @RequirePortfolio = 1;

        IF @ReturnCode != 0
            RETURN 3;  -- ERROR_CRITICO

        -- Normalizar portfolios
        SET @PortfolioNormalizado = extract.fn_NormalizePortfolio(@Portfolio);
        SET @PortfolioSource = extract.fn_GetDerivadosPortfolio(@Portfolio);

        -- Verificar datos en origen (buscar en multiples variantes del portfolio)
        -- Usar @FechaReporteStr porque TBL_DERIVADOS_INTELIGENCIA.FechaReporte es VARCHAR
        SELECT @SourceRows = COUNT(*)
        FROM [Inteligencia_Producto].[dbo].[TBL_DERIVADOS_INTELIGENCIA] WITH (NOLOCK)
        WHERE FechaReporte = @FechaReporteStr
          AND Portfolio IN (@PortfolioSource, @Portfolio, @PortfolioNormalizado);

        PRINT 'VALIDACION: Registros encontrados para ' + @Portfolio + ' = ' + CAST(@SourceRows AS NVARCHAR(10));

        IF @SourceRows = 0
        BEGIN
            PRINT 'INFORMACION: No hay datos de Derivados para ' + @Portfolio;
            PRINT 'EXTRACT_DERIVADOS - FINALIZADO (Sin datos)';
            RETURN 1;
        END

        -- Validar que el portfolio existe en IPA (prerequisito)
        SELECT @ExisteEnIPA = COUNT(*)
        FROM [extract].[IPA] WITH (NOLOCK)
        WHERE Portfolio = @PortfolioNormalizado
          AND FechaReporte = @FechaReporte
          AND ID_Ejecucion = @ID_Ejecucion
          AND ID_Fund = @ID_Fund;

        PRINT 'VALIDACION IPA: ' + @PortfolioNormalizado + ' - ' +
              CASE WHEN @ExisteEnIPA > 0 THEN '[OK] ' + CAST(@ExisteEnIPA AS VARCHAR(10)) + ' registros'
                   ELSE '[NO ENCONTRADO - Derivados no se procesaran]' END;

        IF @ExisteEnIPA = 0
        BEGIN
            PRINT 'INFORMACION: Portfolio ' + @PortfolioNormalizado + ' no existe en IPA. Derivados omitidos.';
            PRINT 'EXTRACT_DERIVADOS - FINALIZADO (Sin validacion IPA)';
            RETURN 1;
        END

        BEGIN TRANSACTION;

        -- Tabla temporal para transformaciones
        -- Usar temp table mejora estimacion de cardinalidad vs CTE
        DROP TABLE IF EXISTS #TempDerivados;

        SELECT *
        INTO #TempDerivados
        FROM [Inteligencia_Producto].[dbo].[TBL_DERIVADOS_INTELIGENCIA] WITH (NOLOCK)
        WHERE FechaReporte = @FechaReporteStr
          AND Portfolio IN (@PortfolioSource, @Portfolio, @PortfolioNormalizado)
        OPTION (RECOMPILE);

        -- Transformacion: normalizar portfolio
        UPDATE #TempDerivados
        SET Portfolio = @PortfolioNormalizado
        WHERE Portfolio != @PortfolioNormalizado;

        SET @RowsTransformed = @@ROWCOUNT;
        IF @RowsTransformed > 0
            PRINT 'TRANSFORMACION: Portfolio normalizado = ' + CAST(@RowsTransformed AS NVARCHAR(10));

        -- Insertar datos
        INSERT INTO [extract].[Derivados] WITH (ROWLOCK)
        (
            ID_Proceso, ID_Ejecucion, ID_Fund,
            FechaReporte, Portfolio, InvestID, Tipo_Derivado,
            Moneda_PLarga, Moneda_PCorta, Notional_Vig_PLarga_Local,
            Notional_Vig_PCorta_Local, VP_PLarga_Base, VP_PCorta_Base, MTM_Sistema
        )
        SELECT
            @ID_Proceso, @ID_Ejecucion, @ID_Fund,
            FechaReporte, Portfolio, ID_Derivado, Tipo_Derivado,
            Moneda_PLarga, Moneda_PCorta, Notional_Vig_PLarga_Local,
            Notional_Vig_PCorta_Local, VP_PLarga_Base, VP_PCorta_Base, MTM_Sistema
        FROM #TempDerivados;

        SET @RowsInserted = @@ROWCOUNT;

        DROP TABLE IF EXISTS #TempDerivados;

        COMMIT TRANSACTION;

        PRINT '========================================';
        PRINT 'EXTRACT_DERIVADOS - COMPLETADO';
        PRINT 'Origen: ' + CAST(@SourceRows AS NVARCHAR(10));
        PRINT 'Transformados: ' + CAST(@RowsTransformed AS NVARCHAR(10));
        PRINT 'Insertados: ' + CAST(@RowsInserted AS NVARCHAR(10));
        PRINT 'Tiempo: ' + CAST(DATEDIFF(SECOND, @StartTime, GETDATE()) AS NVARCHAR(10)) + 's';
        PRINT '========================================';

        RETURN 0;

    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
            ROLLBACK TRANSACTION;

        DROP TABLE IF EXISTS #TempDerivados;

        SET @ErrorMessage = ERROR_MESSAGE();

        PRINT '========================================';
        PRINT 'EXTRACT_DERIVADOS - ERROR';
        PRINT 'Mensaje: ' + @ErrorMessage;
        PRINT 'Linea: ' + CAST(ERROR_LINE() AS NVARCHAR(10));
        PRINT '========================================';

        PRINT 'Extract_Derivados ERROR: ' + @ErrorMessage;
        RETURN 3;  -- ERROR_CRITICO
    END CATCH
END
GO
