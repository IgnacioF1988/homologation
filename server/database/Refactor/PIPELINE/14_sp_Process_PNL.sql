/*
================================================================================
SP: staging.sp_Process_PNL
Descripción: Procesa datos de PNL (Profit & Loss).
             - Carga extract.PNL → ##PNL_Work
             - Homologa instrumentos y monedas
             - Prepara datos para JOIN con IPA en consolidación

Prerequisito: sp_Process_IPA debe haber completado

Códigos de retorno:
  0  = OK
  1  = WARNING (sin datos PNL)
  2  = RETRY
  3  = ERROR_CRITICO
  6  = HOMOLOGACION_INSTRUMENTOS
  10 = HOMOLOGACION_FONDOS
  11 = HOMOLOGACION_MONEDAS

Autor: Refactorización Pipeline IPA
Fecha: 2026-01-02
================================================================================
*/

CREATE OR ALTER PROCEDURE [staging].[sp_Process_PNL]
    @ID_Ejecucion BIGINT,
    @ID_Proceso BIGINT,
    @ID_Fund INT,
    @FechaReporte NVARCHAR(10),
    @Portfolio NVARCHAR(100) = NULL,
    -- Outputs
    @RowsProcessed INT OUTPUT,
    @ErrorCount INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    -- Inicializar outputs
    SET @RowsProcessed = 0;
    SET @ErrorCount = 0;

    -- Variables locales
    DECLARE @StartTime DATETIME = GETDATE();
    DECLARE @SQL NVARCHAR(MAX);
    DECLARE @ReturnCode INT = 0;
    DECLARE @ErrorMessage NVARCHAR(500);
    DECLARE @Source NVARCHAR(50) = 'GENEVA';

    -- Nombres de tablas temporales
    DECLARE @Suffix NVARCHAR(100) = CAST(@ID_Ejecucion AS NVARCHAR(20)) + '_' +
                                    CAST(@ID_Proceso AS NVARCHAR(10)) + '_' +
                                    CAST(@ID_Fund AS NVARCHAR(10));
    DECLARE @TempPNL NVARCHAR(200) = '##PNL_Work_' + @Suffix;

    -- Variables para homologación
    DECLARE @ProblemasFondo INT, @ProblemasInstrumento INT, @ProblemasMoneda INT;

    BEGIN TRY
        -- ═══════════════════════════════════════════════════════════════════
        -- PASO 0: Obtener Portfolio si no se proporcionó
        -- ═══════════════════════════════════════════════════════════════════

        IF @Portfolio IS NULL
        BEGIN
            SELECT @Portfolio = Portfolio
            FROM dimensionales.HOMOL_Funds
            WHERE ID_Fund = @ID_Fund AND Source = @Source;
        END

        PRINT 'sp_Process_PNL: Iniciando para Fondo ' + CAST(@ID_Fund AS NVARCHAR(10)) +
              ' (' + ISNULL(@Portfolio, 'N/A') + ')';

        -- ═══════════════════════════════════════════════════════════════════
        -- PASO 1: Crear tabla temporal ##PNL_Work
        -- ═══════════════════════════════════════════════════════════════════

        SET @SQL = N'
        IF OBJECT_ID(''tempdb..' + @TempPNL + ''', ''U'') IS NOT NULL
            DROP TABLE ' + @TempPNL + ';

        CREATE TABLE ' + @TempPNL + ' (
            RowID INT IDENTITY(1,1) PRIMARY KEY,
            ID_Ejecucion BIGINT NOT NULL,
            ID_Proceso BIGINT NOT NULL,
            ID_Fund INT NULL,
            PK2 NVARCHAR(50) NULL,
            ID_Instrumento INT NULL,
            id_CURR INT NULL,
            FechaReporte NVARCHAR(10) NOT NULL,
            Portfolio NVARCHAR(100) NOT NULL,
            InvestID NVARCHAR(255) NOT NULL,
            LocalCurrency NVARCHAR(50) NULL,
            Source NVARCHAR(50) NULL,
            -- Campos específicos de PNL
            PRgain DECIMAL(18,4) NULL,
            PUgain DECIMAL(18,4) NULL,
            FxRgain DECIMAL(18,4) NULL,
            FxUgain DECIMAL(18,4) NULL,
            Income DECIMAL(18,4) NULL,
            TotGL DECIMAL(18,4) NULL,
            PctGL DECIMAL(18,6) NULL,
            BasisPoint DECIMAL(18,6) NULL,
            FechaProceso DATETIME NOT NULL DEFAULT GETDATE()
        );';
        EXEC sp_executesql @SQL;

        -- ═══════════════════════════════════════════════════════════════════
        -- PASO 2: Cargar datos desde extract.PNL
        -- ═══════════════════════════════════════════════════════════════════

        SET @SQL = N'
        INSERT INTO ' + @TempPNL + ' (
            ID_Ejecucion, ID_Proceso, FechaReporte,
            Portfolio, InvestID, LocalCurrency, Source,
            PRgain, PUgain, FxRgain, FxUgain, Income, TotGL, PctGL, BasisPoint
        )
        SELECT
            @ID_Ejecucion,
            @ID_Proceso,
            pnl.FechaReporte,
            pnl.Portfolio,
            pnl.Symb AS InvestID,
            pnl.Currency AS LocalCurrency,
            ''GENEVA'',
            pnl.PRgain,
            pnl.PUgain,
            pnl.FxRgain,
            pnl.FxUgain,
            pnl.Income,
            pnl.TotGL,
            pnl.PctGL,
            pnl.BasisPoint
        FROM extract.PNL pnl
        WHERE pnl.ID_Ejecucion = @ID_Ejecucion
          AND pnl.FechaReporte = @FechaReporte
          AND pnl.Portfolio = @Portfolio
          -- Excluir fondos con problema
          AND NOT EXISTS (
              SELECT 1 FROM sandbox.Fondos_Problema fp
              WHERE fp.FechaReporte = @FechaReporte
                AND fp.ID_Fund = CAST(@ID_Fund AS NVARCHAR(50))
                AND fp.Proceso = ''Orquestador''
          )';

        EXEC sp_executesql @SQL,
            N'@ID_Ejecucion BIGINT, @ID_Proceso BIGINT, @ID_Fund INT, @FechaReporte NVARCHAR(10), @Portfolio NVARCHAR(100)',
            @ID_Ejecucion, @ID_Proceso, @ID_Fund, @FechaReporte, @Portfolio;

        SET @RowsProcessed = @@ROWCOUNT;

        IF @RowsProcessed = 0
        BEGIN
            PRINT 'sp_Process_PNL: Sin datos PNL para el fondo';
            RETURN 1;  -- WARNING
        END

        PRINT 'sp_Process_PNL: ' + CAST(@RowsProcessed AS NVARCHAR(10)) + ' registros PNL cargados';

        -- ═══════════════════════════════════════════════════════════════════
        -- PASO 3: Homologar instrumentos y monedas
        -- ═══════════════════════════════════════════════════════════════════

        EXEC @ReturnCode = staging.sp_Homologate
            @TempTableName = @TempPNL,
            @Source = @Source,
            @ID_Ejecucion = @ID_Ejecucion,
            @ID_Proceso = @ID_Proceso,
            @ID_Fund = @ID_Fund,
            @FechaReporte = @FechaReporte,
            @InvestIDColumn = 'InvestID',
            @CurrencyColumn = 'LocalCurrency',
            @PortfolioColumn = 'Portfolio',
            @ProblemasFondo = @ProblemasFondo OUTPUT,
            @ProblemasInstrumento = @ProblemasInstrumento OUTPUT,
            @ProblemasMoneda = @ProblemasMoneda OUTPUT;

        IF @ReturnCode != 0
        BEGIN
            SET @ErrorCount = 1;
            RETURN @ReturnCode;
        END

        -- Actualizar ID_Fund
        SET @SQL = N'UPDATE ' + @TempPNL + ' SET ID_Fund = @ID_Fund';
        EXEC sp_executesql @SQL, N'@ID_Fund INT', @ID_Fund;

        -- ═══════════════════════════════════════════════════════════════════
        -- RESUMEN
        -- ═══════════════════════════════════════════════════════════════════

        PRINT '========================================';
        PRINT 'sp_Process_PNL COMPLETADO';
        PRINT 'Fondo: ' + CAST(@ID_Fund AS NVARCHAR(10));
        PRINT 'Registros PNL: ' + CAST(@RowsProcessed AS NVARCHAR(10));
        PRINT 'Tiempo: ' + CAST(DATEDIFF(MILLISECOND, @StartTime, GETDATE()) AS NVARCHAR(10)) + ' ms';
        PRINT '========================================';

        RETURN 0;  -- OK

    END TRY
    BEGIN CATCH
        SET @ErrorCount = 1;

        EXEC staging.sp_HandleError
            @ProcName = 'sp_Process_PNL',
            @ID_Ejecucion = @ID_Ejecucion,
            @ID_Proceso = @ID_Proceso,
            @ID_Fund = @ID_Fund,
            @TempTablesToClean = @TempPNL,
            @ReturnCode = @ReturnCode OUTPUT,
            @ErrorMessage = @ErrorMessage OUTPUT;

        RETURN @ReturnCode;
    END CATCH
END;
GO
