/*
================================================================================
SP: staging.sp_Process_IPA
Descripción: Procesa datos de IPA (Investment Position Appraisal).
             - Carga extract.IPA → ##IPA_Work
             - Homologa instrumentos y monedas
             - Extrae Cash → ##IPA_Cash (LSDesc IN 'Cash Long', 'Cash Short')
             - Extrae MTM → ##IPA_MTM (LSDesc LIKE '%MTM%')
             - Marca registros Cash/MTM con Flag_Excluir = 1
             - Crea tabla ##Ajustes para acumular ajustes

Prerequisito: sp_ValidateFund debe haber retornado 0 o 1

Códigos de retorno:
  0  = OK
  1  = WARNING (sin datos, pero OK)
  2  = RETRY
  3  = ERROR_CRITICO
  6  = HOMOLOGACION_INSTRUMENTOS
  10 = HOMOLOGACION_FONDOS
  11 = HOMOLOGACION_MONEDAS

Autor: Refactorización Pipeline IPA
Fecha: 2026-01-02
================================================================================
*/

CREATE OR ALTER PROCEDURE [staging].[sp_Process_IPA]
    @ID_Ejecucion BIGINT,
    @ID_Proceso BIGINT,
    @ID_Fund INT,
    @FechaReporte NVARCHAR(10),
    @Portfolio_Geneva NVARCHAR(100) = NULL,
    -- Outputs
    @RowsProcessed INT OUTPUT,
    @RowsCash INT OUTPUT,
    @RowsMTM INT OUTPUT,
    @ErrorCount INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    -- Inicializar outputs
    SET @RowsProcessed = 0;
    SET @RowsCash = 0;
    SET @RowsMTM = 0;
    SET @ErrorCount = 0;

    -- Variables locales
    DECLARE @StartTime DATETIME = GETDATE();
    DECLARE @SQL NVARCHAR(MAX);
    DECLARE @ReturnCode INT = 0;
    DECLARE @ErrorMessage NVARCHAR(500);
    DECLARE @Source NVARCHAR(50);

    -- Obtener Source desde config (fuente de verdad)
    SELECT @Source = SourceName FROM config.Extract_Source WHERE ExtractTable = 'IPA';
    SET @Source = ISNULL(@Source, 'GENEVA');  -- Fallback por seguridad

    -- Nombres de tablas temporales
    DECLARE @Suffix NVARCHAR(100) = CAST(@ID_Ejecucion AS NVARCHAR(20)) + '_' +
                                    CAST(@ID_Proceso AS NVARCHAR(10)) + '_' +
                                    CAST(@ID_Fund AS NVARCHAR(10));
    DECLARE @TempWork NVARCHAR(200) = '##IPA_Work_' + @Suffix;
    DECLARE @TempCash NVARCHAR(200) = '##IPA_Cash_' + @Suffix;
    DECLARE @TempMTM NVARCHAR(200) = '##IPA_MTM_' + @Suffix;
    DECLARE @TempAjustes NVARCHAR(200) = '##Ajustes_' + @Suffix;

    -- Variables para homologación
    DECLARE @ProblemasFondo INT, @ProblemasInstrumento INT, @ProblemasMoneda INT;

    BEGIN TRY
        -- ═══════════════════════════════════════════════════════════════════
        -- PASO 0: Obtener Portfolio si no se proporcionó
        -- ═══════════════════════════════════════════════════════════════════

        IF @Portfolio_Geneva IS NULL
        BEGIN
            SELECT @Portfolio_Geneva = Portfolio
            FROM dimensionales.HOMOL_Funds
            WHERE ID_Fund = @ID_Fund AND Source = @Source;

            IF @Portfolio_Geneva IS NULL
            BEGIN
                SET @ErrorMessage = 'No se encontró Portfolio para ID_Fund: ' + CAST(@ID_Fund AS NVARCHAR(10));
                PRINT @ErrorMessage;
                RETURN 10;  -- HOMOLOGACION_FONDOS
            END
        END

        PRINT 'sp_Process_IPA: Iniciando para Fondo ' + CAST(@ID_Fund AS NVARCHAR(10)) +
              ' (' + @Portfolio_Geneva + ')';

        -- ═══════════════════════════════════════════════════════════════════
        -- PASO 1: Crear tabla temporal ##IPA_Work
        -- ═══════════════════════════════════════════════════════════════════

        SET @SQL = N'
        IF OBJECT_ID(''tempdb..' + @TempWork + ''', ''U'') IS NOT NULL
            DROP TABLE ' + @TempWork + ';

        CREATE TABLE ' + @TempWork + ' (
            RowID INT IDENTITY(1,1) PRIMARY KEY,
            ID_Ejecucion BIGINT NOT NULL,
            ID_Proceso BIGINT NOT NULL,
            ID_Fund INT NULL,
            PK2 NVARCHAR(50) NULL,
            ID_Instrumento INT NULL,
            id_CURR INT NULL,
            FechaReporte NVARCHAR(10) NOT NULL,
            FechaCartera NVARCHAR(10) NULL,
            Portfolio NVARCHAR(100) NOT NULL,
            InvestID NVARCHAR(255) NOT NULL,
            InvestDescription NVARCHAR(500) NULL,
            LocalCurrency NVARCHAR(50) NULL,
            LSDesc NVARCHAR(100) NULL,
            BalanceSheet NVARCHAR(20) NULL,
            Source NVARCHAR(50) NULL,
            LocalPrice DECIMAL(18,6) NULL,
            Qty DECIMAL(18,6) NULL,
            OriginalFace DECIMAL(18,4) NULL,
            Factor DECIMAL(18,6) NULL,
            AI DECIMAL(18,4) NULL,
            MVBook DECIMAL(18,4) NULL,
            TotalMVal DECIMAL(18,4) NULL,
            TotalMVal_Balance DECIMAL(18,4) NULL,
            Flag_Excluir BIT NOT NULL DEFAULT 0,
            TipoExclusion NVARCHAR(20) NULL,
            FechaProceso DATETIME NOT NULL DEFAULT GETDATE()
        );';
        EXEC sp_executesql @SQL;

        -- ═══════════════════════════════════════════════════════════════════
        -- PASO 2: Cargar datos desde extract.IPA
        -- ═══════════════════════════════════════════════════════════════════

        SET @SQL = N'
        INSERT INTO ' + @TempWork + ' (
            ID_Ejecucion, ID_Proceso, FechaReporte, FechaCartera,
            Portfolio, InvestID, InvestDescription, LocalCurrency, LSDesc,
            BalanceSheet, Source, LocalPrice, Qty, OriginalFace, Factor,
            AI, MVBook, TotalMVal, TotalMVal_Balance
        )
        SELECT
            @ID_Ejecucion,
            @ID_Proceso,
            ipa.FechaReporte,
            ipa.FechaReporte AS FechaCartera,
            ipa.Portfolio,
            ipa.InvestID,
            ipa.InvestDescription,
            ipa.LocalCurrency,
            ipa.LSDesc,
            CASE WHEN ISNULL(ipa.MVBook, 0) + ISNULL(ipa.AI, 0) >= 0 THEN ''Asset'' ELSE ''Liability'' END,
            ''GENEVA'',
            ipa.LocalPrice,
            ipa.Qty,
            pos.OriginalFace,
            pos.Factor,
            ipa.AI,
            ipa.MVBook,
            ISNULL(ipa.MVBook, 0) + ISNULL(ipa.AI, 0) AS TotalMVal,
            ISNULL(ipa.MVBook, 0) + ISNULL(ipa.AI, 0) AS TotalMVal_Balance
        FROM extract.IPA ipa
        LEFT JOIN extract.PosModRF pos
            ON ipa.InvestID = pos.InvestID
            AND ipa.ID_Ejecucion = pos.ID_Ejecucion
            AND ipa.FechaReporte = pos.FechaReporte
        WHERE ipa.ID_Ejecucion = @ID_Ejecucion
          AND ipa.FechaReporte = @FechaReporte
          AND ipa.Portfolio = @Portfolio_Geneva
          -- Excluir fondos con problema
          AND NOT EXISTS (
              SELECT 1 FROM sandbox.Fondos_Problema fp
              WHERE fp.FechaReporte = @FechaReporte
                AND fp.ID_Fund = CAST(@ID_Fund AS NVARCHAR(50))
                AND fp.Proceso = ''Orquestador''
          )';

        EXEC sp_executesql @SQL,
            N'@ID_Ejecucion BIGINT, @ID_Proceso BIGINT, @ID_Fund INT, @FechaReporte NVARCHAR(10), @Portfolio_Geneva NVARCHAR(100)',
            @ID_Ejecucion, @ID_Proceso, @ID_Fund, @FechaReporte, @Portfolio_Geneva;

        SET @RowsProcessed = @@ROWCOUNT;

        IF @RowsProcessed = 0
        BEGIN
            PRINT 'sp_Process_IPA: Sin datos para procesar';
            RETURN 1;  -- WARNING
        END

        PRINT 'sp_Process_IPA: ' + CAST(@RowsProcessed AS NVARCHAR(10)) + ' registros cargados';

        -- ═══════════════════════════════════════════════════════════════════
        -- PASO 3: Homologar instrumentos y monedas
        -- ═══════════════════════════════════════════════════════════════════

        EXEC @ReturnCode = staging.sp_Homologate
            @TempTableName = @TempWork,
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

        -- Actualizar ID_Fund en todos los registros
        SET @SQL = N'UPDATE ' + @TempWork + ' SET ID_Fund = @ID_Fund';
        EXEC sp_executesql @SQL, N'@ID_Fund INT', @ID_Fund;

        -- ═══════════════════════════════════════════════════════════════════
        -- PASO 4: Crear tabla ##IPA_Cash (extraer Cash)
        -- ═══════════════════════════════════════════════════════════════════

        SET @SQL = N'
        IF OBJECT_ID(''tempdb..' + @TempCash + ''', ''U'') IS NOT NULL
            DROP TABLE ' + @TempCash + ';

        SELECT *
        INTO ' + @TempCash + '
        FROM ' + @TempWork + '
        WHERE LSDesc IN (''Cash Long'', ''Cash Short'')';

        EXEC sp_executesql @SQL;
        SET @RowsCash = @@ROWCOUNT;

        -- Marcar registros Cash como excluidos
        SET @SQL = N'
        UPDATE ' + @TempWork + '
        SET Flag_Excluir = 1, TipoExclusion = ''CASH''
        WHERE LSDesc IN (''Cash Long'', ''Cash Short'')';
        EXEC sp_executesql @SQL;

        PRINT 'sp_Process_IPA: ' + CAST(@RowsCash AS NVARCHAR(10)) + ' registros Cash extraídos';

        -- ═══════════════════════════════════════════════════════════════════
        -- PASO 5: Crear tabla ##IPA_MTM (extraer MTM/Derivados)
        -- ═══════════════════════════════════════════════════════════════════

        SET @SQL = N'
        IF OBJECT_ID(''tempdb..' + @TempMTM + ''', ''U'') IS NOT NULL
            DROP TABLE ' + @TempMTM + ';

        SELECT *
        INTO ' + @TempMTM + '
        FROM ' + @TempWork + '
        WHERE LSDesc LIKE ''%MTM%''';

        EXEC sp_executesql @SQL;
        SET @RowsMTM = @@ROWCOUNT;

        -- Marcar registros MTM como excluidos
        SET @SQL = N'
        UPDATE ' + @TempWork + '
        SET Flag_Excluir = 1, TipoExclusion = ''MTM''
        WHERE LSDesc LIKE ''%MTM%''';
        EXEC sp_executesql @SQL;

        PRINT 'sp_Process_IPA: ' + CAST(@RowsMTM AS NVARCHAR(10)) + ' registros MTM extraídos';

        -- ═══════════════════════════════════════════════════════════════════
        -- PASO 6: Crear tabla ##Ajustes (vacía, para acumular ajustes)
        -- ═══════════════════════════════════════════════════════════════════

        SET @SQL = N'
        IF OBJECT_ID(''tempdb..' + @TempAjustes + ''', ''U'') IS NOT NULL
            DROP TABLE ' + @TempAjustes + ';

        CREATE TABLE ' + @TempAjustes + ' (
            RowID INT IDENTITY(1,1) PRIMARY KEY,
            ID_Ejecucion BIGINT NOT NULL,
            ID_Proceso BIGINT NOT NULL,
            ID_Fund INT NOT NULL,
            PK2 NVARCHAR(50) NOT NULL,
            ID_Instrumento INT NOT NULL,
            id_CURR INT NOT NULL,
            FechaReporte NVARCHAR(10) NOT NULL,
            FechaCartera NVARCHAR(10) NOT NULL,
            BalanceSheet NVARCHAR(20) NOT NULL,
            Source NVARCHAR(50) NOT NULL,
            TipoAjuste NVARCHAR(50) NOT NULL,
            LocalPrice DECIMAL(18,6) NULL,
            Qty DECIMAL(18,6) NULL,
            OriginalFace DECIMAL(18,4) NULL,
            Factor DECIMAL(18,6) NULL,
            AI DECIMAL(18,4) NULL,
            MVBook DECIMAL(18,4) NOT NULL,
            TotalMVal DECIMAL(18,4) NOT NULL,
            TotalMVal_Balance DECIMAL(18,4) NOT NULL,
            FechaProceso DATETIME NOT NULL DEFAULT GETDATE()
        );';
        EXEC sp_executesql @SQL;

        -- ═══════════════════════════════════════════════════════════════════
        -- RESUMEN
        -- ═══════════════════════════════════════════════════════════════════

        PRINT '========================================';
        PRINT 'sp_Process_IPA COMPLETADO';
        PRINT 'Fondo: ' + CAST(@ID_Fund AS NVARCHAR(10)) + ' (' + @Portfolio_Geneva + ')';
        PRINT 'Registros totales: ' + CAST(@RowsProcessed AS NVARCHAR(10));
        PRINT 'Registros Cash: ' + CAST(@RowsCash AS NVARCHAR(10));
        PRINT 'Registros MTM: ' + CAST(@RowsMTM AS NVARCHAR(10));
        PRINT 'Tiempo: ' + CAST(DATEDIFF(MILLISECOND, @StartTime, GETDATE()) AS NVARCHAR(10)) + ' ms';
        PRINT '========================================';

        RETURN 0;  -- OK

    END TRY
    BEGIN CATCH
        SET @ErrorCount = 1;

        -- Cleanup
        DECLARE @TablesToClean NVARCHAR(MAX) = @TempWork + ',' + @TempCash + ',' + @TempMTM + ',' + @TempAjustes;

        EXEC staging.sp_HandleError
            @ProcName = 'sp_Process_IPA',
            @ID_Ejecucion = @ID_Ejecucion,
            @ID_Proceso = @ID_Proceso,
            @ID_Fund = @ID_Fund,
            @TempTablesToClean = @TablesToClean,
            @ReturnCode = @ReturnCode OUTPUT,
            @ErrorMessage = @ErrorMessage OUTPUT;

        RETURN @ReturnCode;
    END CATCH
END;
GO
