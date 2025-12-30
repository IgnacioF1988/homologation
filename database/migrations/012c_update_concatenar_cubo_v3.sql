-- =====================================================
-- MIGRATION 012c: Create staging.Concatenar_Cubo_v3
-- Date: 2025-12-29
-- Description: SP de validación final del CUBO
--              Ya no mueve datos (están en CUBO_Final)
--              Solo valida y retorna estadísticas
-- =====================================================

SET NOCOUNT ON;

PRINT '=== Migration 012c: Create Concatenar_Cubo_v3 ==='
PRINT 'Fecha: ' + CONVERT(VARCHAR, GETDATE(), 120);
PRINT '';

-- =====================================================
-- Crear staging.Concatenar_Cubo_v3
-- =====================================================
PRINT '>>> Creando staging.Concatenar_Cubo_v3...';

IF OBJECT_ID('staging.Concatenar_Cubo_v3', 'P') IS NOT NULL
    DROP PROCEDURE staging.Concatenar_Cubo_v3;
GO

CREATE PROCEDURE staging.Concatenar_Cubo_v3
    @ID_Ejecucion BIGINT,
    @FechaReporte VARCHAR(10) = NULL,
    @Debug BIT = 0
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @StartTime DATETIME = GETDATE();
    DECLARE @TotalRows INT = 0;
    DECLARE @FundsProcessed INT = 0;
    DECLARE @ErrorMsg NVARCHAR(MAX);

    -- Contadores por tipo
    DECLARE @Count_IPA INT = 0;
    DECLARE @Count_CAPM INT = 0;
    DECLARE @Count_PNL INT = 0;
    DECLARE @Count_Derivados INT = 0;
    DECLARE @Count_MLCCII INT = 0;

    BEGIN TRY
        IF @ID_Ejecucion IS NULL OR @ID_Ejecucion <= 0
        BEGIN
            SET @ErrorMsg = 'ID_Ejecucion inválido';
            RAISERROR(@ErrorMsg, 16, 1);
            RETURN 3;
        END

        IF @Debug = 1 PRINT 'Concatenar_Cubo_v3: Validando ID_Ejecucion = ' + CAST(@ID_Ejecucion AS VARCHAR);

        -- =====================================================
        -- PASO 1: Contar registros por tipo
        -- =====================================================
        SELECT @Count_IPA = COUNT(*) FROM process.CUBO_Final
        WHERE ID_Ejecucion = @ID_Ejecucion AND TipoRegistro = 'IPA';

        SELECT @Count_CAPM = COUNT(*) FROM process.CUBO_Final
        WHERE ID_Ejecucion = @ID_Ejecucion AND TipoRegistro = 'CAPM';

        SELECT @Count_PNL = COUNT(*) FROM process.CUBO_Final
        WHERE ID_Ejecucion = @ID_Ejecucion AND TipoRegistro = 'PNL';

        SELECT @Count_Derivados = COUNT(*) FROM process.CUBO_Final
        WHERE ID_Ejecucion = @ID_Ejecucion AND TipoRegistro = 'DERIVADOS';

        SELECT @Count_MLCCII = COUNT(*) FROM process.CUBO_Final
        WHERE ID_Ejecucion = @ID_Ejecucion AND TipoRegistro IN ('MLCCII', 'MLCCII_DERIV');

        SET @TotalRows = @Count_IPA + @Count_CAPM + @Count_PNL + @Count_Derivados + @Count_MLCCII;

        -- =====================================================
        -- PASO 2: Contar fondos procesados
        -- =====================================================
        SELECT @FundsProcessed = COUNT(DISTINCT ID_Fund)
        FROM process.CUBO_Final
        WHERE ID_Ejecucion = @ID_Ejecucion;

        IF @Debug = 1
        BEGIN
            PRINT '  Registros por tipo:';
            PRINT '    - IPA: ' + CAST(@Count_IPA AS VARCHAR);
            PRINT '    - CAPM: ' + CAST(@Count_CAPM AS VARCHAR);
            PRINT '    - PNL: ' + CAST(@Count_PNL AS VARCHAR);
            PRINT '    - DERIVADOS: ' + CAST(@Count_Derivados AS VARCHAR);
            PRINT '    - MLCCII: ' + CAST(@Count_MLCCII AS VARCHAR);
            PRINT '  Total: ' + CAST(@TotalRows AS VARCHAR);
            PRINT '  Fondos: ' + CAST(@FundsProcessed AS VARCHAR);
        END

        -- =====================================================
        -- PASO 3: Validar mínimos
        -- =====================================================
        IF @TotalRows = 0
        BEGIN
            SET @ErrorMsg = 'No se encontraron datos para ID_Ejecucion = ' + CAST(@ID_Ejecucion AS VARCHAR);

            INSERT INTO logs.Ejecucion_Logs (ID_Ejecucion, ID_Fund, Timestamp, Nivel, Categoria, Etapa, Mensaje)
            VALUES (@ID_Ejecucion, 0, GETDATE(), 'ERROR', 'PIPELINE', 'CONCATENAR_V3', @ErrorMsg);

            SELECT
                @ID_Ejecucion AS ID_Ejecucion,
                0 AS TotalRows,
                0 AS FundsProcessed,
                0 AS Rows_IPA,
                0 AS Rows_CAPM,
                0 AS Rows_PNL,
                0 AS Rows_Derivados,
                0 AS Rows_MLCCII,
                DATEDIFF(MILLISECOND, @StartTime, GETDATE()) AS DurationMs,
                3 AS ReturnCode,
                @ErrorMsg AS Status;

            RETURN 3;
        END

        -- =====================================================
        -- PASO 4: Log de validación exitosa
        -- =====================================================
        INSERT INTO logs.Ejecucion_Logs (ID_Ejecucion, ID_Fund, Timestamp, Nivel, Categoria, Etapa, Mensaje)
        VALUES (@ID_Ejecucion, 0, GETDATE(), 'INFO', 'PIPELINE', 'CONCATENAR_V3',
            'Validacion CUBO_Final: ' + CAST(@TotalRows AS VARCHAR) + ' registros, ' +
            CAST(@FundsProcessed AS VARCHAR) + ' fondos | ' +
            'IPA:' + CAST(@Count_IPA AS VARCHAR) + ', CAPM:' + CAST(@Count_CAPM AS VARCHAR) +
            ', PNL:' + CAST(@Count_PNL AS VARCHAR) + ', DERIV:' + CAST(@Count_Derivados AS VARCHAR) +
            ', UBS:' + CAST(@Count_MLCCII AS VARCHAR));

        -- =====================================================
        -- PASO 5: Retornar resultado
        -- =====================================================
        SELECT
            @ID_Ejecucion AS ID_Ejecucion,
            @TotalRows AS TotalRows,
            @FundsProcessed AS FundsProcessed,
            @Count_IPA AS Rows_IPA,
            @Count_CAPM AS Rows_CAPM,
            @Count_PNL AS Rows_PNL,
            @Count_Derivados AS Rows_Derivados,
            @Count_MLCCII AS Rows_MLCCII,
            DATEDIFF(MILLISECOND, @StartTime, GETDATE()) AS DurationMs,
            0 AS ReturnCode,
            'OK' AS Status;

        PRINT 'Concatenar_Cubo_v3 OK: ' + CAST(@TotalRows AS VARCHAR) + ' registros, ' +
              CAST(@FundsProcessed AS VARCHAR) + ' fondos | ' +
              CAST(DATEDIFF(MILLISECOND, @StartTime, GETDATE()) AS VARCHAR) + 'ms';

        RETURN 0;

    END TRY
    BEGIN CATCH
        SET @ErrorMsg = ERROR_MESSAGE();

        INSERT INTO logs.Ejecucion_Logs (ID_Ejecucion, ID_Fund, Timestamp, Nivel, Categoria, Etapa, Mensaje)
        VALUES (@ID_Ejecucion, 0, GETDATE(), 'ERROR', 'PIPELINE', 'CONCATENAR_V3', 'ERROR: ' + @ErrorMsg);

        SELECT
            @ID_Ejecucion AS ID_Ejecucion,
            0 AS TotalRows,
            0 AS FundsProcessed,
            0 AS Rows_IPA,
            0 AS Rows_CAPM,
            0 AS Rows_PNL,
            0 AS Rows_Derivados,
            0 AS Rows_MLCCII,
            DATEDIFF(MILLISECOND, @StartTime, GETDATE()) AS DurationMs,
            3 AS ReturnCode,
            @ErrorMsg AS Status;

        PRINT 'Concatenar_Cubo_v3 ERROR: ' + @ErrorMsg;
        RETURN 3;
    END CATCH
END;
GO

PRINT '    CREATED staging.Concatenar_Cubo_v3';
PRINT '';
PRINT '=== Migration 012c completada ===';
PRINT '';

-- =====================================================
-- Verificación
-- =====================================================
PRINT '>>> Verificación:';

SELECT name AS SP_Name, create_date, modify_date
FROM sys.procedures
WHERE name IN ('Concatenar_Cubo_v2', 'Concatenar_Cubo_v3')
AND SCHEMA_NAME(schema_id) = 'staging'
ORDER BY name;
