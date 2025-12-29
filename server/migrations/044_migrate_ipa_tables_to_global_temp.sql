-- =============================================
-- Migration 044: Migrar tablas staging.IPA* a temporales globales ##temp
-- =============================================
-- OBJETIVO: Convertir staging.IPA_Cash, staging.IPA_Final, staging.IPA_MTM, staging.IPA
--           a tablas temporales globales con patrón ##TableName_{ID_Ejecucion}_{ID_Fund}
--
-- BENEFICIOS:
-- - Auto-cleanup cuando se cierra la conexión dedicada
-- - No requiere DELETE manual
-- - Aislamiento por fondo sin contención
-- - Las temp tables persisten entre servicios en la misma conexión
--
-- PATRÓN DE NOMBRES:
-- - ##IPA_Cash_{ID_Ejecucion}_{ID_Fund}
-- - ##IPA_Final_{ID_Ejecucion}_{ID_Fund}
-- - ##IPA_MTM_{ID_Ejecucion}_{ID_Fund}
-- - ##IPA_{ID_Ejecucion}_{ID_Fund}
--
-- SCHEMA DE TABLAS TEMPORALES:
-- =============================================

-- ##IPA_Cash_{ID_Ejecucion}_{ID_Fund}
-- Creada por: IPA_06B_PopulateIPACash_v2
-- Leída por: CAPM_01_Ajuste_CAPM_v2
-- Schema:
/*
CREATE TABLE ##IPA_Cash_{ID_Ejecucion}_{ID_Fund} (
    ID bigint IDENTITY(1,1) PRIMARY KEY,
    ID_Ejecucion bigint NOT NULL,
    ID_Fund int NOT NULL,
    Portfolio nvarchar(50),
    FechaReporte nvarchar(10),
    InvestID nvarchar(50),
    InvestDescription nvarchar(500),
    AI decimal(18,2),
    MVBook decimal(18,2),
    ID_Instrumento int,
    id_CURR int,
    BalanceSheet nvarchar(100),
    FechaCreacion datetime DEFAULT GETDATE()
);
*/

-- ##IPA_Final_{ID_Ejecucion}_{ID_Fund}
-- Creada por: IPA_07_AgruparRegistros_v2
-- Leída por: PNL_04_CrearRegistrosAjusteIPA_v2
-- Schema: Similar a staging.IPA_Final

-- ##IPA_MTM_{ID_Ejecucion}_{ID_Fund}
-- Creada por: IPA (proceso)
-- Leída por: DERIV_03_Ajuste_Derivados_v2
-- Schema: Similar a staging.IPA_MTM

-- =============================================
-- PROCEDIMIENTOS A MODIFICAR:
-- =============================================
-- 1. staging.IPA_06B_PopulateIPACash_v2 - Crear y poblar ##IPA_Cash
-- 2. staging.CAPM_01_Ajuste_CAPM_v2 - Leer ##IPA_Cash
-- 3. staging.IPA_07_AgruparRegistros_v2 - Crear y poblar ##IPA_Final
-- 4. staging.PNL_04_CrearRegistrosAjusteIPA_v2 - Leer ##IPA_Final
-- 5. staging.DERIV_03_Ajuste_Derivados_v2 - Leer ##IPA_MTM
-- =============================================

USE [Inteligencia_Producto_Dev];
GO

PRINT '🚀 Migration 044: Iniciando migración a tablas temporales globales';
PRINT '📋 Se modificarán 5 stored procedures para usar ##temp tables';
GO

-- =============================================
-- PASO 1: Modificar IPA_06B para crear ##IPA_Cash
-- =============================================
PRINT '1️⃣ Modificando IPA_06B_PopulateIPACash_v2...';
GO

DROP PROCEDURE IF EXISTS [staging].[IPA_06B_PopulateIPACash_v2];
GO

CREATE PROCEDURE [staging].[IPA_06B_PopulateIPACash_v2]
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
    DECLARE @TempTableWork NVARCHAR(200);
    DECLARE @TempTableCash NVARCHAR(200);
    DECLARE @SQL NVARCHAR(MAX);
    SET @RowsProcessed = 0;
    SET @ErrorCount = 0;

    IF @ID_Ejecucion IS NULL OR @ID_Ejecucion <= 0 OR @ID_Fund IS NULL OR @ID_Fund <= 0
    BEGIN
        PRINT 'IPA_06B_v2 ERROR: Parámetros inválidos';
        SET @ErrorCount = 1;
        RETURN 3;
    END

    BEGIN TRY
        SET @TempTableWork = 'tempdb..##IPA_Work_' + CAST(@ID_Ejecucion AS NVARCHAR(20)) + '_' + CAST(@ID_Fund AS NVARCHAR(10));
        SET @TempTableCash = 'tempdb..##IPA_Cash_' + CAST(@ID_Ejecucion AS NVARCHAR(20)) + '_' + CAST(@ID_Fund AS NVARCHAR(10));

        -- Verificar tabla work existe
        IF OBJECT_ID(@TempTableWork, 'U') IS NULL
        BEGIN
            PRINT 'IPA_06B_v2 ERROR: Tabla temporal work no existe';
            SET @ErrorCount = 1;
            RETURN 3;
        END

        -- Crear ##IPA_Cash si no existe
        SET @SQL = N'
        IF OBJECT_ID(''' + @TempTableCash + ''', ''U'') IS NULL
        BEGIN
            CREATE TABLE ' + @TempTableCash + ' (
                ID bigint IDENTITY(1,1) PRIMARY KEY,
                ID_Ejecucion bigint NOT NULL,
                ID_Fund int NOT NULL,
                Portfolio nvarchar(50),
                FechaReporte nvarchar(10),
                InvestID nvarchar(50),
                InvestDescription nvarchar(500),
                AI decimal(18,2),
                MVBook decimal(18,2),
                ID_Instrumento int,
                id_CURR int,
                BalanceSheet nvarchar(100),
                FechaCreacion datetime DEFAULT GETDATE()
            );
        END
        ELSE
        BEGIN
            DELETE FROM ' + @TempTableCash + '
            WHERE ID_Ejecucion = @ID_Ejecucion AND ID_Fund = @ID_Fund;
        END';

        EXEC sp_executesql @SQL,
            N'@ID_Ejecucion BIGINT, @ID_Fund INT',
            @ID_Ejecucion, @ID_Fund;

        -- Insertar registros individuales de Cash
        SET @SQL = N'
        INSERT INTO ' + @TempTableCash + ' (
            ID_Ejecucion,
            ID_Fund,
            Portfolio,
            FechaReporte,
            InvestID,
            InvestDescription,
            AI,
            MVBook,
            ID_Instrumento,
            id_CURR,
            BalanceSheet,
            FechaCreacion
        )
        SELECT
            @ID_Ejecucion AS ID_Ejecucion,
            @ID_Fund AS ID_Fund,
            Portfolio,
            @FechaReporte AS FechaReporte,
            InvestID,
            InvestDescription,
            ISNULL(AI, 0) AS AI,
            ISNULL(MVBook, 0) AS MVBook,
            ID_Instrumento,
            id_CURR,
            BalanceSheet,
            GETDATE() AS FechaCreacion
        FROM ' + @TempTableWork + '
        WHERE (
            InvestID LIKE ''%CASH%''
            OR InvestID LIKE ''%FX%''
            OR InvestDescription LIKE ''%CASH%''
            OR InvestDescription LIKE ''%FX%''
            OR InvestDescription LIKE ''%BANK%''
            OR InvestDescription LIKE ''%CUENTA%''
            OR InvestDescription LIKE ''%HSBC%''
            OR InvestDescription LIKE ''%JPMCC%''
            OR InvestDescription LIKE ''%SCOTIA%''
            OR InvestDescription LIKE ''%BCI%''
        );';

        EXEC sp_executesql @SQL,
            N'@ID_Ejecucion BIGINT, @ID_Fund INT, @FechaReporte NVARCHAR(10)',
            @ID_Ejecucion, @ID_Fund, @FechaReporte;

        SET @RowsProcessed = @@ROWCOUNT;

        IF @RowsProcessed = 0
        BEGIN
            PRINT 'IPA_06B_v2 WARNING: No se encontraron registros de Cash';
        END
        ELSE
        BEGIN
            PRINT 'IPA_06B_v2 OK: ' + CAST(@RowsProcessed AS VARCHAR(10)) + ' registros insertados en ##IPA_Cash';
        END

        RETURN 0;

    END TRY
    BEGIN CATCH
        SET @ErrorCount = 1;
        PRINT 'IPA_06B_v2 ERROR: ' + ERROR_MESSAGE();
        IF ERROR_NUMBER() = 1205 RETURN 2;
        RETURN 3;
    END CATCH
END;
GO

PRINT '✅ IPA_06B_PopulateIPACash_v2 modificado - Ahora usa ##IPA_Cash_{ID_Ejecucion}_{ID_Fund}';
GO

PRINT '✅ Migration 044 completada - Fase 1/5 (IPA_06B)';
GO
