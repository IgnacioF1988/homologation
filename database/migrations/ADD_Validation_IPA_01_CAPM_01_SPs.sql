-- ============================================
-- Script: Agregar Validación Defensiva a SPs sin Protección
-- Fecha: 2025-12-23
-- Propósito: Agregar validación de parámetros a IPA_01 y CAPM_01
--            para prevenir procesamiento con ID_Fund=0 o ID_Ejecucion=0
-- ============================================
-- IMPORTANTE: Ejecutar DESPUÉS de agregar CHECK constraints.
--             Esto es una capa adicional de protección a nivel SP.
-- ============================================

USE Inteligencia_Producto_Dev;
GO

PRINT '============================================';
PRINT 'INICIO - AGREGAR VALIDACIÓN DEFENSIVA A SPs';
PRINT 'Fecha: ' + CONVERT(VARCHAR, GETDATE(), 120);
PRINT '============================================';
PRINT '';

-- ============================================
-- SP 1: IPA_01_RescatarLocalPrice_v2
-- ============================================
PRINT 'Actualizando staging.IPA_01_RescatarLocalPrice_v2...';

ALTER PROCEDURE [staging].[IPA_01_RescatarLocalPrice_v2]
    @ID_Ejecucion BIGINT,
    @FechaReporte NVARCHAR(10),
    @ID_Fund INT,
    @Portfolio_Geneva NVARCHAR(50),
    @DebugMode BIT = 0,
    @RowsProcessed INT OUTPUT,
    @ErrorCount INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @RegistrosIPA INT = 0, @RegistrosPosModRF INT = 0;
    SET @RowsProcessed = 0;
    SET @ErrorCount = 0;

    -- ============================================
    -- VALIDACIÓN DEFENSIVA (NUEVO - 2025-12-23)
    -- ============================================
    -- Validar que ID_Ejecucion e ID_Fund sean valores válidos (> 0)
    -- Esto previene race conditions y deadlocks en ejecuciones paralelas
    IF @ID_Ejecucion IS NULL OR @ID_Ejecucion <= 0
    BEGIN
        RAISERROR('ID_Ejecucion inválido o no proporcionado. Debe ser > 0 para garantizar aislamiento en ejecuciones paralelas.', 16, 1);
        SET @ErrorCount = 1;
        RETURN 3;  -- Error crítico
    END

    IF @ID_Fund IS NULL OR @ID_Fund <= 0
    BEGIN
        RAISERROR('ID_Fund inválido o no proporcionado. Debe ser > 0 para garantizar aislamiento en ejecuciones paralelas.', 16, 1);
        SET @ErrorCount = 1;
        RETURN 3;  -- Error crítico
    END

    IF @FechaReporte IS NULL OR LEN(RTRIM(@FechaReporte)) = 0
    BEGIN
        RAISERROR('FechaReporte es obligatorio', 16, 1);
        SET @ErrorCount = 1;
        RETURN 3;
    END

    IF @Portfolio_Geneva IS NULL OR LEN(RTRIM(@Portfolio_Geneva)) = 0
    BEGIN
        RAISERROR('Portfolio_Geneva es obligatorio', 16, 1);
        SET @ErrorCount = 1;
        RETURN 3;
    END
    -- ============================================
    -- FIN VALIDACIÓN DEFENSIVA
    -- ============================================

    BEGIN TRY
        -- Validar que existan datos en extract.IPA
        SELECT @RegistrosIPA = COUNT(*)
        FROM [extract].[IPA]
        WHERE FechaReporte = @FechaReporte AND Portfolio = @Portfolio_Geneva;

        IF @RegistrosIPA = 0
        BEGIN
            SET @ErrorCount = 1;
            RETURN 3;  -- No hay datos de IPA para procesar
        END

        -- Validar que existan datos en extract.PosModRF
        SELECT @RegistrosPosModRF = COUNT(*)
        FROM [extract].[PosModRF]
        WHERE FechaReporte = @FechaReporte;

        IF @RegistrosPosModRF = 0
        BEGIN
            SET @ErrorCount = 1;
            RETURN 3;  -- No hay datos de PosModRF para procesar
        END

        -- DELETE con doble filtro (ID_Ejecucion, ID_Fund) para aislamiento
        DELETE FROM staging.IPA_WorkTable
        WHERE ID_Ejecucion = @ID_Ejecucion AND ID_Fund = @ID_Fund;

        -- INSERT con valores validados
        INSERT INTO staging.IPA_WorkTable (
            ID_Ejecucion, ID_Fund, Portfolio, FechaReporte, FechaCartera,
            TotalText, ReportMode, LSDesc, SortKey, LocalCurrency,
            BasketInvestDesc, InvestID, InvestDescription, Qty, LocalPrice,
            CostLocal, CostBook, UnRealGL, AI, MVBook, PercentInvest,
            PercentSign, IsSwap, BasketInvID, OriginalFace, Factor, Source,
            ID_Instrumento, id_CURR, BalanceSheet, PK2, [CXC/CXP?]
        )
        SELECT
            @ID_Ejecucion, @ID_Fund,
            ipa.Portfolio, ipa.FechaReporte, ipa.FechaCartera,
            ipa.TotalText, ipa.ReportMode, ipa.LSDesc, ipa.SortKey, ipa.LocalCurrency,
            ipa.BasketInvestDesc, ipa.InvestID, ipa.InvestDescription, ipa.Qty, ipa.LocalPrice,
            ipa.CostLocal, ipa.CostBook, ipa.UnRealGL, ipa.AI, ipa.MVBook, ipa.PercentInvest,
            ipa.PercentSign, ipa.IsSwap, ipa.BasketInvID,
            ISNULL(pos.OriginalFace, 0),
            ISNULL(pos.Factor, 1),
            NULL, NULL, NULL, NULL, NULL, NULL
        FROM [extract].[IPA] ipa
        LEFT JOIN [extract].[PosModRF] pos
            ON ipa.Portfolio = pos.Portfolio
           AND ipa.InvestID = pos.InvestID
           AND ipa.FechaReporte = pos.FechaReporte
        WHERE ipa.FechaReporte = @FechaReporte
          AND ipa.Portfolio = @Portfolio_Geneva
          AND NOT EXISTS (
              SELECT 1
              FROM sandbox.Fondos_Problema fp
              WHERE fp.ID_Fund = CAST(@ID_Fund AS NVARCHAR(50))
                AND fp.FechaReporte = @FechaReporte
                AND fp.Proceso = 'Orquestador'
          );

        SET @RowsProcessed = @@ROWCOUNT;
        RETURN 0;  -- Éxito

    END TRY
    BEGIN CATCH
        SET @ErrorCount = 1;

        -- Log error para debugging (sin THROW para no romper transacción externa)
        BEGIN TRY
            INSERT INTO logs.SP_Errors (
                ID_Ejecucion, ID_Fund, SP_Name,
                ErrorNumber, ErrorMessage, ErrorSeverity, ErrorState, ErrorLine
            )
            VALUES (
                @ID_Ejecucion, @ID_Fund, OBJECT_NAME(@@PROCID),
                ERROR_NUMBER(), ERROR_MESSAGE(), ERROR_SEVERITY(), ERROR_STATE(), ERROR_LINE()
            );
        END TRY
        BEGIN CATCH
            -- Ignorar errores de logging
        END CATCH

        -- Retornar código según tipo de error
        IF ERROR_NUMBER() = 1205 RETURN 2;  -- Deadlock (retriable)
        RETURN 3;  -- Error crítico
    END CATCH
END;
GO

PRINT '✓ staging.IPA_01_RescatarLocalPrice_v2 actualizado con validación defensiva';
PRINT '';

-- ============================================
-- SP 2: CAPM_01_Ajuste_CAPM_v2
-- ============================================
PRINT 'Actualizando staging.CAPM_01_Ajuste_CAPM_v2...';

ALTER PROCEDURE [staging].[CAPM_01_Ajuste_CAPM_v2]
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
    DECLARE @StartTime DATETIME = GETDATE();
    DECLARE @TotalMVal_IPA DECIMAL(18,2) = 0;
    DECLARE @TotalMVal_CAPM DECIMAL(18,2) = 0;
    DECLARE @Diferencia DECIMAL(18,2) = 0;
    DECLARE @ID_Instrumento_Ajuste INT;
    DECLARE @id_CURR_Base INT;
    SET @RowsProcessed = 0;
    SET @ErrorCount = 0;

    -- ============================================
    -- VALIDACIÓN DEFENSIVA (NUEVO - 2025-12-23)
    -- ============================================
    -- Validar que ID_Ejecucion e ID_Fund sean valores válidos (> 0)
    -- Esto previene race conditions y deadlocks en ejecuciones paralelas
    IF @ID_Ejecucion IS NULL OR @ID_Ejecucion <= 0
    BEGIN
        RAISERROR('ID_Ejecucion inválido o no proporcionado. Debe ser > 0 para garantizar aislamiento en ejecuciones paralelas.', 16, 1);
        SET @ErrorCount = 1;
        RETURN 3;  -- Error crítico
    END

    IF @ID_Fund IS NULL OR @ID_Fund <= 0
    BEGIN
        RAISERROR('ID_Fund inválido o no proporcionado. Debe ser > 0 para garantizar aislamiento en ejecuciones paralelas.', 16, 1);
        SET @ErrorCount = 1;
        RETURN 3;  -- Error crítico
    END

    IF @FechaReporte IS NULL OR LEN(RTRIM(@FechaReporte)) = 0
    BEGIN
        RAISERROR('FechaReporte es obligatorio', 16, 1);
        SET @ErrorCount = 1;
        RETURN 3;
    END
    -- ============================================
    -- FIN VALIDACIÓN DEFENSIVA
    -- ============================================

    BEGIN TRY
        -- Si no se proporciona Portfolio_Geneva, obtenerlo de IPA_Cash
        IF @Portfolio_Geneva IS NULL
        BEGIN
            SELECT TOP 1 @Portfolio_Geneva = Portfolio
            FROM staging.IPA_Cash
            WHERE ID_Ejecucion = @ID_Ejecucion AND ID_Fund = @ID_Fund;

            IF @Portfolio_Geneva IS NULL
            BEGIN
                RAISERROR('No se encontró Portfolio_Geneva para el fondo en staging.IPA_Cash', 16, 1);
                RETURN 3;
            END
        END

        -- Validar que existan datos de IPA_Cash para esta ejecución/fondo
        IF NOT EXISTS (
            SELECT 1
            FROM staging.IPA_Cash
            WHERE ID_Ejecucion = @ID_Ejecucion AND ID_Fund = @ID_Fund
        )
        BEGIN
            RAISERROR('Tabla staging.IPA_Cash no contiene datos para esta ejecución/fondo', 16, 1);
            RETURN 3;
        END

        -- Calcular totales
        SELECT @TotalMVal_IPA = SUM(ISNULL(AI, 0) + ISNULL(MVBook, 0))
        FROM staging.IPA_Cash
        WHERE ID_Ejecucion = @ID_Ejecucion AND ID_Fund = @ID_Fund;

        SET @TotalMVal_IPA = ISNULL(@TotalMVal_IPA, 0);

        SELECT @TotalMVal_CAPM = SUM(ISNULL(MVBook, 0))
        FROM extract.CAPM
        WHERE FechaReporte = @FechaReporte AND Portfolio = @Portfolio_Geneva;

        SET @TotalMVal_CAPM = ISNULL(@TotalMVal_CAPM, 0);
        SET @Diferencia = @TotalMVal_IPA - @TotalMVal_CAPM;

        -- Si la diferencia es insignificante, no crear ajuste
        IF ABS(@Diferencia) < 0.01
        BEGIN
            SET @RowsProcessed = 0;
            RETURN 0;  -- Éxito sin ajuste necesario
        END

        -- Obtener ID del instrumento de ajuste
        SELECT @ID_Instrumento_Ajuste = ID_Instrumento
        FROM dimensionales.HOMOL_Instrumentos
        WHERE SourceInvestment = 'ADJ IPA-CASHAPP' AND Source = 'GENEVA';

        IF @ID_Instrumento_Ajuste IS NULL
        BEGIN
            -- Registrar falta de homologación
            INSERT INTO sandbox.Homologacion_Instrumentos (
                FechaReporte, Instrumento, Source, FechaProceso
            )
            VALUES (
                @FechaReporte, 'ADJ IPA-CASHAPP', 'GENEVA', GETDATE()
            );

            SET @ErrorCount = 1;
            RETURN 3;
        END

        -- Obtener moneda base del fondo
        SELECT @id_CURR_Base = id_CURR
        FROM dimensionales.BD_Funds
        WHERE ID_Fund = @ID_Fund;

        IF @id_CURR_Base IS NULL
        BEGIN
            SET @ErrorCount = 1;
            RETURN 3;
        END

        -- DELETE con doble filtro (ID_Ejecucion, ID_Fund) para aislamiento
        DELETE FROM staging.Ajuste_CAPM
        WHERE ID_Ejecucion = @ID_Ejecucion AND ID_Fund = @ID_Fund;

        -- INSERT del ajuste
        INSERT INTO staging.Ajuste_CAPM (
            ID_Ejecucion, PK2, ID_Fund, ID_Instrumento, id_CURR,
            FechaReporte, FechaCartera, BalanceSheet, Source,
            LocalPrice, Qty, OriginalFace, Factor, AI, MVBook,
            TotalMVal, TotalMVal_Balance, FechaProceso
        )
        VALUES (
            @ID_Ejecucion,
            CAST(@ID_Instrumento_Ajuste AS VARCHAR(10)) + '-' + CAST(@id_CURR_Base AS VARCHAR(10)),
            @ID_Fund,
            @ID_Instrumento_Ajuste,
            @id_CURR_Base,
            @FechaReporte,
            @FechaReporte,
            CASE WHEN @Diferencia >= 0 THEN 'Asset' ELSE 'Liability' END,
            'GENEVA',
            1,  -- LocalPrice
            0,  -- Qty
            NULL,  -- OriginalFace
            NULL,  -- Factor
            0,  -- AI
            @Diferencia,  -- MVBook
            @Diferencia,  -- TotalMVal
            @Diferencia,  -- TotalMVal_Balance
            GETDATE()  -- FechaProceso
        );

        SET @RowsProcessed = 1;
        RETURN 0;  -- Éxito

    END TRY
    BEGIN CATCH
        SET @ErrorCount = 1;

        -- Log error para debugging
        BEGIN TRY
            INSERT INTO logs.SP_Errors (
                ID_Ejecucion, ID_Fund, SP_Name,
                ErrorNumber, ErrorMessage, ErrorSeverity, ErrorState, ErrorLine
            )
            VALUES (
                @ID_Ejecucion, @ID_Fund, OBJECT_NAME(@@PROCID),
                ERROR_NUMBER(), ERROR_MESSAGE(), ERROR_SEVERITY(), ERROR_STATE(), ERROR_LINE()
            );
        END TRY
        BEGIN CATCH
            -- Ignorar errores de logging
        END CATCH

        -- Retornar código según tipo de error
        IF ERROR_NUMBER() = 1205 RETURN 2;  -- Deadlock (retriable)
        RETURN 3;  -- Error crítico
    END CATCH
END;
GO

PRINT '✓ staging.CAPM_01_Ajuste_CAPM_v2 actualizado con validación defensiva';
PRINT '';

-- ============================================
-- VERIFICACIÓN
-- ============================================
PRINT 'Verificando SPs actualizados...';
PRINT '';

-- Verificar que los SPs existen y fueron modificados recientemente
SELECT
    ROUTINE_NAME AS SP_Name,
    CREATED AS FechaCreacion,
    LAST_ALTERED AS UltimaModificacion,
    CASE
        WHEN LAST_ALTERED >= DATEADD(MINUTE, -5, GETDATE()) THEN '✓ Actualizado'
        ELSE '⚠ No modificado recientemente'
    END AS Estado
FROM INFORMATION_SCHEMA.ROUTINES
WHERE ROUTINE_SCHEMA = 'staging'
  AND ROUTINE_NAME IN ('IPA_01_RescatarLocalPrice_v2', 'CAPM_01_Ajuste_CAPM_v2')
ORDER BY ROUTINE_NAME;

PRINT '';
PRINT '============================================';
PRINT 'VALIDACIÓN DEFENSIVA AGREGADA EXITOSAMENTE';
PRINT 'Fecha: ' + CONVERT(VARCHAR, GETDATE(), 120);
PRINT '============================================';
PRINT '';
PRINT 'PROTECCIONES ACTIVAS:';
PRINT '✓ IPA_01_RescatarLocalPrice_v2: Validación de parámetros agregada';
PRINT '✓ CAPM_01_Ajuste_CAPM_v2: Validación de parámetros agregada';
PRINT '✓ Ambos SPs ahora rechazan ejecución con ID_Fund <= 0';
PRINT '✓ Ambos SPs ahora rechazan ejecución con ID_Ejecucion <= 0';
PRINT '';
PRINT 'RESUMEN DE PROTECCIONES (5/5 SPs protegidos):';
PRINT '1. PNL_01_Dimensiones_v2 - ✓ Ya tenía validación';
PRINT '2. PNL_02_Ajuste_v2 - ✓ Ya tenía validación';
PRINT '3. UBS_01_Tratamiento_Fondos_Luxemburgo_v2 - ✓ Ya tenía validación';
PRINT '4. IPA_01_RescatarLocalPrice_v2 - ✓ AGREGADA AHORA';
PRINT '5. CAPM_01_Ajuste_CAPM_v2 - ✓ AGREGADA AHORA';
PRINT '';
PRINT 'SIGUIENTES PASOS:';
PRINT '1. Agregar validación en BasePipelineService.js (Node.js) - opcional';
PRINT '2. Ejecutar script de limpieza de staging (CLEANUP_Staging_Tables_Complete_Wipe.sql)';
PRINT '3. Ejecutar script de constraints (ADD_Constraints_Staging_Tables.sql)';
PRINT '4. Aumentar concurrencia a 3 en FundOrchestrator.js';
PRINT '5. Ejecutar battery testing para validar estabilidad';
PRINT '';

GO
