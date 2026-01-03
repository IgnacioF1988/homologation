/*
================================================================================
SP: staging.sp_HandleError
Descripción: Manejo centralizado de errores y limpieza de tablas temporales.

Códigos de retorno:
  2 = RETRY (deadlock, timeout)
  3 = ERROR_CRITICO (otros errores)

Autor: Refactorización Pipeline IPA
Fecha: 2026-01-02
================================================================================
*/

CREATE OR ALTER PROCEDURE [staging].[sp_HandleError]
    @ProcName NVARCHAR(100),
    @ID_Ejecucion BIGINT = NULL,
    @ID_Proceso BIGINT = NULL,
    @ID_Fund INT = NULL,
    @TempTablesToClean NVARCHAR(MAX) = NULL,  -- Lista separada por coma
    -- Output
    @ReturnCode INT OUTPUT,
    @ErrorMessage NVARCHAR(500) OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    -- Capturar información del error
    DECLARE @ErrorNum INT = ERROR_NUMBER();
    DECLARE @ErrorSev INT = ERROR_SEVERITY();
    DECLARE @ErrorState INT = ERROR_STATE();
    DECLARE @ErrorLine INT = ERROR_LINE();
    DECLARE @ErrorMsg NVARCHAR(4000) = ERROR_MESSAGE();

    -- Construir mensaje de error completo
    SET @ErrorMessage = @ProcName + ' ERROR [' + CAST(@ErrorNum AS VARCHAR(10)) + ']: ' +
                        @ErrorMsg + ' (Línea ' + CAST(@ErrorLine AS VARCHAR(10)) + ')';

    -- Determinar código de retorno según tipo de error
    SET @ReturnCode = CASE
        WHEN @ErrorNum = 1205 THEN 2      -- Deadlock
        WHEN @ErrorNum IN (-2, 1222) THEN 2  -- Timeout
        WHEN @ErrorNum = 547 THEN 3       -- FK violation
        WHEN @ErrorNum = 2627 THEN 3      -- PK violation
        WHEN @ErrorNum = 8152 THEN 3      -- String truncation
        ELSE 3                            -- Otros = ERROR_CRITICO
    END;

    -- Log del error
    PRINT '========================================';
    PRINT @ErrorMessage;
    PRINT 'Severidad: ' + CAST(@ErrorSev AS VARCHAR(10));
    PRINT 'Estado: ' + CAST(@ErrorState AS VARCHAR(10));
    IF @ID_Ejecucion IS NOT NULL
        PRINT 'ID_Ejecucion: ' + CAST(@ID_Ejecucion AS VARCHAR(20));
    IF @ID_Proceso IS NOT NULL
        PRINT 'ID_Proceso: ' + CAST(@ID_Proceso AS VARCHAR(10));
    IF @ID_Fund IS NOT NULL
        PRINT 'ID_Fund: ' + CAST(@ID_Fund AS VARCHAR(10));
    PRINT 'Código retorno: ' + CAST(@ReturnCode AS VARCHAR(10)) +
          CASE @ReturnCode WHEN 2 THEN ' (RETRY)' ELSE ' (ERROR_CRITICO)' END;
    PRINT '========================================';

    -- ═══════════════════════════════════════════════════════════════════
    -- Limpiar tablas temporales si se especificaron
    -- ═══════════════════════════════════════════════════════════════════

    IF @TempTablesToClean IS NOT NULL AND LEN(@TempTablesToClean) > 0
    BEGIN
        DECLARE @SQL NVARCHAR(MAX);
        DECLARE @TableName NVARCHAR(200);
        DECLARE @Pos INT;
        DECLARE @CleanList NVARCHAR(MAX) = @TempTablesToClean;

        PRINT 'Limpiando tablas temporales...';

        WHILE LEN(@CleanList) > 0
        BEGIN
            SET @Pos = CHARINDEX(',', @CleanList);

            IF @Pos = 0
            BEGIN
                SET @TableName = LTRIM(RTRIM(@CleanList));
                SET @CleanList = '';
            END
            ELSE
            BEGIN
                SET @TableName = LTRIM(RTRIM(LEFT(@CleanList, @Pos - 1)));
                SET @CleanList = SUBSTRING(@CleanList, @Pos + 1, LEN(@CleanList));
            END

            IF LEN(@TableName) > 0
            BEGIN
                BEGIN TRY
                    -- Verificar si la tabla existe antes de intentar eliminarla
                    IF @TableName LIKE '##%'
                    BEGIN
                        SET @SQL = 'IF OBJECT_ID(''tempdb..' + @TableName + ''', ''U'') IS NOT NULL DROP TABLE ' + @TableName;
                    END
                    ELSE IF @TableName LIKE '#%'
                    BEGIN
                        SET @SQL = 'IF OBJECT_ID(''tempdb..' + @TableName + ''', ''U'') IS NOT NULL DROP TABLE ' + @TableName;
                    END
                    ELSE
                    BEGIN
                        SET @SQL = 'IF OBJECT_ID(''' + @TableName + ''', ''U'') IS NOT NULL DROP TABLE ' + @TableName;
                    END

                    EXEC sp_executesql @SQL;
                    PRINT '  - Eliminada: ' + @TableName;
                END TRY
                BEGIN CATCH
                    PRINT '  - No se pudo eliminar: ' + @TableName + ' (' + ERROR_MESSAGE() + ')';
                END CATCH
            END
        END
    END

    -- ═══════════════════════════════════════════════════════════════════
    -- Registrar en sandbox.Fondos_Problema (si hay datos de contexto)
    -- ═══════════════════════════════════════════════════════════════════

    IF @ID_Fund IS NOT NULL
    BEGIN
        BEGIN TRY
            INSERT INTO sandbox.Fondos_Problema (
                FechaReporte,
                ID_Fund,
                Proceso,
                Tipo_Problema,
                Detalle,
                FechaProceso
            )
            VALUES (
                CONVERT(NVARCHAR(10), GETDATE(), 120),
                CAST(@ID_Fund AS NVARCHAR(50)),
                @ProcName,
                CASE @ReturnCode WHEN 2 THEN 'Error recuperable (RETRY)' ELSE 'Error crítico' END,
                @ErrorMessage,
                GETDATE()
            );
        END TRY
        BEGIN CATCH
            -- Silenciar error de registro
        END CATCH
    END

END;
GO

/*
================================================================================
SP: staging.sp_CleanupTempTables
Descripción: Limpia todas las tablas temporales de una ejecución/proceso/fondo.
             Llamar al final del pipeline o en caso de error.
================================================================================
*/

CREATE OR ALTER PROCEDURE [staging].[sp_CleanupTempTables]
    @ID_Ejecucion BIGINT,
    @ID_Proceso BIGINT,
    @ID_Fund INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Suffix NVARCHAR(100) = CAST(@ID_Ejecucion AS NVARCHAR(20)) + '_' +
                                    CAST(@ID_Proceso AS NVARCHAR(10)) + '_' +
                                    CAST(@ID_Fund AS NVARCHAR(10));
    DECLARE @SQL NVARCHAR(MAX);

    -- Lista de prefijos de tablas temporales del pipeline
    DECLARE @Prefixes TABLE (Prefix NVARCHAR(50));
    INSERT INTO @Prefixes VALUES
        ('##IPA_Work_'),
        ('##IPA_Cash_'),
        ('##IPA_MTM_'),
        ('##IPA_Final_'),
        ('##CAPM_Work_'),
        ('##Derivados_Work_'),
        ('##PNL_Work_'),
        ('##Ajustes_');

    DECLARE @Prefix NVARCHAR(50);
    DECLARE @TableName NVARCHAR(200);

    DECLARE cur CURSOR LOCAL FAST_FORWARD FOR
        SELECT Prefix FROM @Prefixes;

    OPEN cur;
    FETCH NEXT FROM cur INTO @Prefix;

    WHILE @@FETCH_STATUS = 0
    BEGIN
        SET @TableName = @Prefix + @Suffix;

        BEGIN TRY
            SET @SQL = 'IF OBJECT_ID(''tempdb..' + @TableName + ''', ''U'') IS NOT NULL DROP TABLE ' + @TableName;
            EXEC sp_executesql @SQL;
            PRINT 'Cleanup: ' + @TableName;
        END TRY
        BEGIN CATCH
            -- Silenciar errores
        END CATCH

        FETCH NEXT FROM cur INTO @Prefix;
    END

    CLOSE cur;
    DEALLOCATE cur;

    PRINT 'sp_CleanupTempTables: Limpieza completada para ' + @Suffix;
END;
GO

/*
================================================================================
FUNCIÓN: staging.fn_TempTableName
Descripción: Genera el nombre de una tabla temporal con el sufijo estándar.
================================================================================
*/

CREATE OR ALTER FUNCTION [staging].[fn_TempTableName](
    @Prefix NVARCHAR(50),        -- 'IPA_Work', 'IPA_Cash', 'Ajustes', etc.
    @ID_Ejecucion BIGINT,
    @ID_Proceso BIGINT,
    @ID_Fund INT
)
RETURNS NVARCHAR(200)
AS
BEGIN
    RETURN '##' + @Prefix + '_' +
           CAST(@ID_Ejecucion AS NVARCHAR(20)) + '_' +
           CAST(@ID_Proceso AS NVARCHAR(10)) + '_' +
           CAST(@ID_Fund AS NVARCHAR(10));
END;
GO
