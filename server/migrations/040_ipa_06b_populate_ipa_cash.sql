-- =============================================
-- Migration 040: Crear IPA_06B para poblar staging.IPA_Cash
-- Extrae registros de Cash de la temp table para que CAPM pueda usarlos
-- =============================================

USE [Inteligencia_Producto_Dev];
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
    DECLARE @TempTableName NVARCHAR(200);
    DECLARE @SQL NVARCHAR(MAX);
    DECLARE @RegistrosTotal INT = 0;
    SET @RowsProcessed = 0;
    SET @ErrorCount = 0;

    IF @ID_Ejecucion IS NULL OR @ID_Ejecucion <= 0 OR @ID_Fund IS NULL OR @ID_Fund <= 0
    BEGIN
        PRINT 'IPA_06B_v2 ERROR: Parámetros inválidos';
        SET @ErrorCount = 1;
        RETURN 3;
    END

    BEGIN TRY
        SET @TempTableName = 'tempdb..##IPA_Work_' + CAST(@ID_Ejecucion AS NVARCHAR(20)) + '_' + CAST(@ID_Fund AS NVARCHAR(10));

        -- Verificar tabla temporal existe
        IF OBJECT_ID(@TempTableName, 'U') IS NULL
        BEGIN
            PRINT 'IPA_06B_v2 ERROR: Tabla temporal no existe';
            SET @ErrorCount = 1;
            RETURN 3;
        END

        -- Eliminar datos previos de este fondo en staging.IPA_Cash
        DELETE FROM staging.IPA_Cash
        WHERE ID_Ejecucion = @ID_Ejecucion
          AND ID_Fund = @ID_Fund;

        -- Insertar registros de Cash desde temp table a staging.IPA_Cash
        -- Cash = registros con InvestID o InvestDescription que contengan 'CASH', 'FX', o cuentas bancarias
        -- O registros que tengan ID_Instrumento en rango de efectivo (basado en homologación)
        SET @SQL = N'
        INSERT INTO staging.IPA_Cash (
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
            GETDATE()
        FROM ' + @TempTableName + '
        WHERE ID_Instrumento IS NOT NULL
          AND id_CURR IS NOT NULL
          AND (
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

        EXEC sp_executesql @SQL;

        SET @RowsProcessed = @@ROWCOUNT;

        IF @RowsProcessed = 0
        BEGIN
            PRINT 'IPA_06B_v2 WARNING: No se encontraron registros de Cash';
        END
        ELSE
        BEGIN
            PRINT 'IPA_06B_v2 OK: ' + CAST(@RowsProcessed AS VARCHAR(10)) + ' registros de Cash insertados en staging.IPA_Cash';
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

PRINT '✅ Migration 040 completada - IPA_06B creado para poblar staging.IPA_Cash';
GO
