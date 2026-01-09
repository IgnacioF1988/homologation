/*
================================================================================
SP: staging.sp_Process_PNL
Version: v2.0 - Redesign DB-Centric con CHECKPOINT events
================================================================================
Descripción: Procesa datos de PNL (Profit & Loss).
             - Carga extract.PNL → ##PNL_Work
             - Homologa instrumentos y monedas
             - Prepara datos para JOIN con IPA en consolidación

PRINCIPIO FUNDAMENTAL:
  Si sp_ValidateFund pasó, este SP NO DEBE fallar por validaciones de negocio.
  Cualquier falla aquí es un BUG del sistema (ASSERTION_FAILED).

CHECKPOINT Events emitidos:
  - CREATED ##PNL_Work (después de cargar datos)

Prerequisito: sp_ValidateFund debe haber retornado 0

Códigos de retorno:
  0  = OK
  1  = WARNING (sin datos PNL, OK si fondo no requiere PNL)
  3  = ERROR_CRITICO (exception)
  4  = ASSERTION_FAILED (bug - homologación debió pasar en ValidateFund)

Autor: Refactorización Pipeline IPA
Fecha: 2026-01-02
Modificado: 2026-01-09 - Redesign v2.0 con CHECKPOINT events
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
    DECLARE @Source NVARCHAR(50);

    -- Obtener Source desde config (fuente de verdad)
    SELECT @Source = SourceName FROM config.Extract_Source WHERE ExtractTable = 'PNL';
    SET @Source = ISNULL(@Source, 'GENEVA');  -- Fallback por seguridad

    -- Nombres de tablas temporales
    DECLARE @Suffix NVARCHAR(100) = CAST(@ID_Ejecucion AS NVARCHAR(20)) + '_' +
                                    CAST(@ID_Proceso AS NVARCHAR(10)) + '_' +
                                    CAST(@ID_Fund AS NVARCHAR(10));
    DECLARE @TempPNL NVARCHAR(200) = '##PNL_Work_' + @Suffix;

    -- Variables para homologación
    DECLARE @ProblemasFondo INT, @ProblemasInstrumento INT, @ProblemasMoneda INT;

    BEGIN TRY
        -- ═══════════════════════════════════════════════════════════════════
        -- EVENTO: SP_INICIO
        -- ═══════════════════════════════════════════════════════════════════
        EXEC broker.sp_EmitirEvento
            @TipoEvento = 'SP_INICIO',
            @ID_Ejecucion = @ID_Ejecucion,
            @ID_Proceso = @ID_Proceso,
            @ID_Fund = @ID_Fund,
            @NombreSP = 'staging.sp_Process_PNL';

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

            -- EVENTO: SP_FIN (WARNING - sin datos PNL)
            EXEC broker.sp_EmitirEvento
                @TipoEvento = 'SP_FIN',
                @ID_Ejecucion = @ID_Ejecucion,
                @ID_Proceso = @ID_Proceso,
                @ID_Fund = @ID_Fund,
                @NombreSP = 'staging.sp_Process_PNL',
                @CodigoRetorno = 1,
                @Detalles = 'WARNING: Sin datos PNL para el fondo';

            RETURN 1;  -- WARNING
        END

        PRINT 'sp_Process_PNL: ' + CAST(@RowsProcessed AS NVARCHAR(10)) + ' registros PNL cargados';

        -- ═══════════════════════════════════════════════════════════════════
        -- CHECKPOINT: ##PNL_Work creada
        -- ═══════════════════════════════════════════════════════════════════
        DECLARE @ChkDetalles NVARCHAR(500) = '{"operacion": "CREATED", "objeto": "' + @TempPNL + '", "registros": ' + CAST(@RowsProcessed AS NVARCHAR(10)) + '}';
        EXEC broker.sp_EmitirEvento
            @TipoEvento = 'CHECKPOINT',
            @ID_Ejecucion = @ID_Ejecucion,
            @ID_Proceso = @ID_Proceso,
            @ID_Fund = @ID_Fund,
            @NombreSP = 'staging.sp_Process_PNL',
            @Detalles = @ChkDetalles;

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

            -- ASSERTION_FAILED: La homologación debió pasar en sp_ValidateFund
            -- Si llegamos aquí con errores de homologación, es un BUG del sistema
            DECLARE @AssertMsg NVARCHAR(500) = 'ASSERTION_FAILED: Homologación falló en sp_Process_PNL pero sp_ValidateFund retornó 0. ' +
                                               'Fondo:' + CAST(ISNULL(@ProblemasFondo,0) AS NVARCHAR) +
                                               ' Instrumento:' + CAST(ISNULL(@ProblemasInstrumento,0) AS NVARCHAR) +
                                               ' Moneda:' + CAST(ISNULL(@ProblemasMoneda,0) AS NVARCHAR);
            EXEC broker.sp_EmitirEvento
                @TipoEvento = 'ERROR',
                @ID_Ejecucion = @ID_Ejecucion,
                @ID_Proceso = @ID_Proceso,
                @ID_Fund = @ID_Fund,
                @NombreSP = 'staging.sp_Process_PNL',
                @CodigoRetorno = 4,  -- ASSERTION_FAILED
                @Detalles = @AssertMsg;

            RETURN 4;  -- ASSERTION_FAILED
        END

        -- Actualizar ID_Fund
        SET @SQL = N'UPDATE ' + @TempPNL + ' SET ID_Fund = @ID_Fund';
        EXEC sp_executesql @SQL, N'@ID_Fund INT', @ID_Fund;

        -- ═══════════════════════════════════════════════════════════════════
        -- RESUMEN
        -- ═══════════════════════════════════════════════════════════════════

        DECLARE @DuracionMs INT = DATEDIFF(second, @StartTime, GETDATE()) * 1000;

        PRINT '========================================';
        PRINT 'sp_Process_PNL COMPLETADO';
        PRINT 'Fondo: ' + CAST(@ID_Fund AS NVARCHAR(10));
        PRINT 'Registros PNL: ' + CAST(@RowsProcessed AS NVARCHAR(10));
        PRINT 'Tiempo: ' + CAST(@DuracionMs AS NVARCHAR(10)) + ' ms';
        PRINT '========================================';

        -- ═══════════════════════════════════════════════════════════════════
        -- EVENTO: SP_FIN (Exitoso)
        -- ═══════════════════════════════════════════════════════════════════
        EXEC broker.sp_EmitirEvento
            @TipoEvento = 'SP_FIN',
            @ID_Ejecucion = @ID_Ejecucion,
            @ID_Proceso = @ID_Proceso,
            @ID_Fund = @ID_Fund,
            @NombreSP = 'staging.sp_Process_PNL',
            @CodigoRetorno = 0,
            @DuracionMs = @DuracionMs,
            @RowsProcessed = @RowsProcessed;

        RETURN 0;  -- OK

    END TRY
    BEGIN CATCH
        SET @ErrorCount = 1;

        -- EVENTO: ERROR
        DECLARE @ErrorMsg NVARCHAR(4000) = ERROR_MESSAGE();
        EXEC broker.sp_EmitirEvento
            @TipoEvento = 'ERROR',
            @ID_Ejecucion = @ID_Ejecucion,
            @ID_Proceso = @ID_Proceso,
            @ID_Fund = @ID_Fund,
            @NombreSP = 'staging.sp_Process_PNL',
            @CodigoRetorno = 3,
            @Detalles = @ErrorMsg;

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
