USE INTELIGENCIA_PRODUCTO_FULLSTACK;
GO

/*
================================================================================
SP: staging.sp_Homologate
Version: v2.0 - Case Sensitive Collation
================================================================================
CAMBIOS v2.0:
  - BREAKING: Removido COLLATE DATABASE_DEFAULT de todos los JOINs
  - Las columnas ahora usan Latin1_General_CS_AS consistentemente
  - La tabla temporal #Homologacion usa collation CS_AS
  - REQUISITO: Ejecutar 99_Migracion_Collation_CS.sql antes de este SP

NOTA: Este SP tiene dos funciones:

1. HOMOLOGACIÓN DE TEMP TABLES (##*_Work) - ACTIVO Y NECESARIO
   - Actualiza ID_Fund, ID_Instrumento, id_CURR en tablas temporales
   - Usado por sp_Process_IPA, sp_Process_CAPM, sp_Process_Derivados, sp_Process_PNL

2. REGISTRO EN SANDBOX - OBSOLETO (usa estructura antigua)
   - Los INSERTs a sandbox.Homologacion_* usan ID_Ejecucion/FechaReporte
   - La estructura actual es N:M global (sin estos campos)
   - sp_ValidateFund v6.9+ ya maneja esto correctamente ANTES de llamar al pipeline

IMPORTANTE: Este SP DEBE existir para que el pipeline funcione.
            Los INSERTs a sandbox probablemente no se ejecutan si sp_ValidateFund
            ya detectó y registró los problemas de homologación.

Fecha revisión: 2026-01-07
================================================================================

Descripción:
  Homologación universal de datos.
  Actualiza tabla temporal con IDs homologados de dimensionales.

Parámetros:
  @TempTableName - Nombre de la tabla temporal a homologar (##XXX_Work_X_Y_Z)
  @Source - Fuente de homologación ('GENEVA', 'DERIVADOS', 'CASH APPRAISAL', 'UBS')
  @InvestIDColumn - Nombre de la columna con el InvestID (default: 'InvestID')
  @CurrencyColumn - Nombre de la columna con la moneda (default: 'LocalCurrency')

Retorna:
  0 = OK
  6 = HOMOLOGACION_INSTRUMENTOS
  10 = HOMOLOGACION_FONDOS
  11 = HOMOLOGACION_MONEDAS

Autor: Refactorización Pipeline IPA
Fecha: 2026-01-07
================================================================================
*/

CREATE OR ALTER PROCEDURE [staging].[sp_Homologate]
    @TempTableName NVARCHAR(200),
    @Source NVARCHAR(50),
    @ID_Ejecucion BIGINT,
    @ID_Proceso BIGINT,
    @ID_Fund INT,
    @FechaReporte NVARCHAR(10),
    @InvestIDColumn NVARCHAR(50) = 'InvestID',
    @CurrencyColumn NVARCHAR(50) = 'LocalCurrency',
    @PortfolioColumn NVARCHAR(50) = 'Portfolio',
    -- Outputs
    @ProblemasFondo INT OUTPUT,
    @ProblemasInstrumento INT OUTPUT,
    @ProblemasMoneda INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    -- Inicializar outputs
    SET @ProblemasFondo = 0;
    SET @ProblemasInstrumento = 0;
    SET @ProblemasMoneda = 0;

    DECLARE @SQL NVARCHAR(MAX);
    DECLARE @ReturnCode INT = 0;

    BEGIN TRY
        -- ═══════════════════════════════════════════════════════════════════
        -- PASO 1: Crear tabla temporal de homologación
        -- v2.0: Usar collation Case Sensitive para consistencia
        -- ═══════════════════════════════════════════════════════════════════

        IF OBJECT_ID('tempdb..#Homologacion') IS NOT NULL
            DROP TABLE #Homologacion;

        CREATE TABLE #Homologacion (
            RowID INT IDENTITY(1,1),
            InvestID NVARCHAR(255) COLLATE Latin1_General_CS_AS,
            Currency NVARCHAR(50) COLLATE Latin1_General_CS_AS,
            Portfolio NVARCHAR(100) COLLATE Latin1_General_CS_AS,
            ID_Fund_H INT,
            ID_Instrumento INT,
            id_CURR INT,
            TieneProblema BIT
        );

        -- ═══════════════════════════════════════════════════════════════════
        -- PASO 2: Extraer datos únicos y homologar con LEFT JOINs
        -- v2.0: Sin COLLATE DATABASE_DEFAULT (todas las columnas son CS_AS)
        -- ═══════════════════════════════════════════════════════════════════

        SET @SQL = N'
        INSERT INTO #Homologacion (InvestID, Currency, Portfolio, ID_Fund_H, ID_Instrumento, id_CURR, TieneProblema)
        SELECT DISTINCT
            t.' + QUOTENAME(@InvestIDColumn) + ',
            t.' + QUOTENAME(@CurrencyColumn) + ',
            t.' + QUOTENAME(@PortfolioColumn) + ',
            ISNULL(hf.ID_Fund, 0),
            ISNULL(hi.ID_Instrumento, 0),
            ISNULL(hm.id_CURR, 0),
            CASE
                WHEN ISNULL(hf.ID_Fund, 0) = 0 OR ISNULL(hi.ID_Instrumento, 0) = 0 OR ISNULL(hm.id_CURR, 0) = 0
                THEN 1 ELSE 0
            END
        FROM ' + @TempTableName + ' t
        LEFT JOIN dimensionales.HOMOL_Funds hf
            ON t.' + QUOTENAME(@PortfolioColumn) + ' = hf.Portfolio
            AND hf.Source = @Source
        LEFT JOIN dimensionales.HOMOL_Instrumentos hi
            ON t.' + QUOTENAME(@InvestIDColumn) + ' = hi.SourceInvestment
            AND hi.Source = @Source
        LEFT JOIN dimensionales.HOMOL_Monedas hm
            ON t.' + QUOTENAME(@CurrencyColumn) + ' = hm.Name
            AND hm.Source = @Source';

        EXEC sp_executesql @SQL,
            N'@Source NVARCHAR(50)',
            @Source;

        -- ═══════════════════════════════════════════════════════════════════
        -- PASO 3: Contar problemas por tipo
        -- ═══════════════════════════════════════════════════════════════════

        SELECT @ProblemasFondo = COUNT(DISTINCT Portfolio)
        FROM #Homologacion WHERE ID_Fund_H = 0;

        SELECT @ProblemasInstrumento = COUNT(DISTINCT InvestID)
        FROM #Homologacion WHERE ID_Instrumento = 0;

        SELECT @ProblemasMoneda = COUNT(DISTINCT Currency)
        FROM #Homologacion WHERE id_CURR = 0;

        -- ═══════════════════════════════════════════════════════════════════
        -- PASO 4: Registrar problemas en sandbox (si hay)
        -- ═══════════════════════════════════════════════════════════════════

        IF @ProblemasFondo > 0
        BEGIN
            INSERT INTO sandbox.Homologacion_Fondos (ID_Ejecucion, FechaReporte, Fondo, Source, FechaProceso)
            SELECT DISTINCT @ID_Ejecucion, @FechaReporte, Portfolio, @Source, GETDATE()
            FROM #Homologacion
            WHERE ID_Fund_H = 0;

            -- Retornar detalle de problemas
            SELECT 'FONDO' AS TipoHomologacion, Portfolio AS Item, NULL AS Currency, @Source AS Source
            FROM #Homologacion WHERE ID_Fund_H = 0
            GROUP BY Portfolio;

            SET @ReturnCode = 10;  -- HOMOLOGACION_FONDOS
        END

        IF @ProblemasInstrumento > 0 AND @ReturnCode = 0
        BEGIN
            INSERT INTO sandbox.Homologacion_Instrumentos (ID_Ejecucion, FechaReporte, Instrumento, Currency, Source, FechaProceso)
            SELECT DISTINCT @ID_Ejecucion, @FechaReporte, InvestID, Currency, @Source, GETDATE()
            FROM #Homologacion
            WHERE ID_Instrumento = 0;

            -- Retornar detalle de problemas
            SELECT 'INSTRUMENTO' AS TipoHomologacion, InvestID AS Item, Currency, @Source AS Source
            FROM #Homologacion WHERE ID_Instrumento = 0
            GROUP BY InvestID, Currency;

            SET @ReturnCode = 6;  -- HOMOLOGACION_INSTRUMENTOS
        END

        IF @ProblemasMoneda > 0 AND @ReturnCode = 0
        BEGIN
            INSERT INTO sandbox.Homologacion_Monedas (ID_Ejecucion, FechaReporte, Moneda, Source, FechaProceso)
            SELECT DISTINCT @ID_Ejecucion, @FechaReporte, Currency, @Source, GETDATE()
            FROM #Homologacion
            WHERE id_CURR = 0;

            -- Retornar detalle de problemas
            SELECT 'MONEDA' AS TipoHomologacion, Currency AS Item, NULL AS Currency, @Source AS Source
            FROM #Homologacion WHERE id_CURR = 0
            GROUP BY Currency;

            SET @ReturnCode = 11;  -- HOMOLOGACION_MONEDAS
        END

        -- ═══════════════════════════════════════════════════════════════════
        -- PASO 5: Actualizar tabla original con IDs homologados (si no hay errores)
        -- v2.0: Sin COLLATE DATABASE_DEFAULT
        -- ═══════════════════════════════════════════════════════════════════

        IF @ReturnCode = 0
        BEGIN
            SET @SQL = N'
            UPDATE t SET
                t.ID_Fund = h.ID_Fund_H,
                t.ID_Instrumento = h.ID_Instrumento,
                t.id_CURR = h.id_CURR,
                t.PK2 = CAST(h.ID_Instrumento AS VARCHAR(10)) + ''-'' + CAST(h.id_CURR AS VARCHAR(10))
            FROM ' + @TempTableName + ' t
            INNER JOIN #Homologacion h
                ON t.' + QUOTENAME(@InvestIDColumn) + ' = h.InvestID
                AND t.' + QUOTENAME(@CurrencyColumn) + ' = h.Currency';

            EXEC sp_executesql @SQL;

            PRINT 'sp_Homologate: Homologación completada para ' + @TempTableName;
        END
        ELSE
        BEGIN
            PRINT 'sp_Homologate: Problemas de homologación detectados. Fondos: ' +
                  CAST(@ProblemasFondo AS VARCHAR(10)) + ', Instrumentos: ' +
                  CAST(@ProblemasInstrumento AS VARCHAR(10)) + ', Monedas: ' +
                  CAST(@ProblemasMoneda AS VARCHAR(10));
        END

        DROP TABLE #Homologacion;

        RETURN @ReturnCode;

    END TRY
    BEGIN CATCH
        IF OBJECT_ID('tempdb..#Homologacion') IS NOT NULL
            DROP TABLE #Homologacion;

        PRINT 'sp_Homologate ERROR: ' + ERROR_MESSAGE();

        IF ERROR_NUMBER() IN (1205, -2, 1222)
            RETURN 2;  -- RETRY

        RETURN 3;  -- ERROR_CRITICO
    END CATCH
END;
GO
