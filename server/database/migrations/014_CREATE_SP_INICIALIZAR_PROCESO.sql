-- =============================================
-- Migration 014: Crear Stored Procedure sp_Inicializar_Proceso
-- Descripción: SP para inicializar proceso con múltiples ejecuciones (una por fondo)
-- Fecha: 2025-12-26
-- Autor: Claude Code
-- =============================================

USE Inteligencia_Producto_Dev;
GO

PRINT '================================================';
PRINT 'MIGRACIÓN 014: Crear sp_Inicializar_Proceso';
PRINT '================================================';
PRINT '';

-- Eliminar SP si existe
IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID('logs.sp_Inicializar_Proceso') AND type = 'P')
BEGIN
    PRINT '⚠ SP logs.sp_Inicializar_Proceso ya existe. Eliminando...';
    DROP PROCEDURE logs.sp_Inicializar_Proceso;
    PRINT '✓ SP eliminado';
END
GO

PRINT '✓ Creando sp_Inicializar_Proceso...';
GO

-- =============================================
-- Stored Procedure: logs.sp_Inicializar_Proceso
-- =============================================
CREATE PROCEDURE logs.sp_Inicializar_Proceso
    @FechaReporte NVARCHAR(10),
    @ID_Proceso BIGINT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @ErrorMessage NVARCHAR(4000);
    DECLARE @TotalFondos INT;
    DECLARE @FechaActual DATETIME2 = GETDATE();

    BEGIN TRY
        BEGIN TRANSACTION;

        -- =============================================
        -- PASO 1: Validar parámetros de entrada
        -- =============================================
        IF @FechaReporte IS NULL OR LEN(@FechaReporte) = 0
        BEGIN
            SET @ErrorMessage = 'El parámetro @FechaReporte no puede ser NULL o vacío';
            RAISERROR(@ErrorMessage, 16, 1);
            RETURN -1;
        END

        -- Validar formato YYYY-MM-DD
        IF @FechaReporte NOT LIKE '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
        BEGIN
            SET @ErrorMessage = 'El formato de @FechaReporte debe ser YYYY-MM-DD. Recibido: ' + @FechaReporte;
            RAISERROR(@ErrorMessage, 16, 1);
            RETURN -1;
        END

        -- Validar que la fecha sea válida
        IF ISDATE(@FechaReporte) = 0
        BEGIN
            SET @ErrorMessage = 'La fecha proporcionada no es válida: ' + @FechaReporte;
            RAISERROR(@ErrorMessage, 16, 1);
            RETURN -1;
        END

        -- =============================================
        -- PASO 2: Generar ID_Proceso único
        -- =============================================
        -- Usar timestamp en milisegundos para garantizar unicidad
        SET @ID_Proceso = CAST(
            DATEDIFF_BIG(MILLISECOND, '1970-01-01 00:00:00', @FechaActual)
            AS BIGINT
        );

        -- Verificar que no exista (extremadamente raro, pero defensivo)
        WHILE EXISTS (SELECT 1 FROM logs.Procesos WHERE ID_Proceso = @ID_Proceso)
        BEGIN
            WAITFOR DELAY '00:00:00.001'; -- Esperar 1ms
            SET @FechaActual = GETDATE();
            SET @ID_Proceso = CAST(
                DATEDIFF_BIG(MILLISECOND, '1970-01-01 00:00:00', @FechaActual)
                AS BIGINT
            );
        END

        -- =============================================
        -- PASO 3: Contar fondos activos
        -- =============================================
        SELECT @TotalFondos = COUNT(*)
        FROM dimensionales.BD_Funds
        WHERE Active = 1
          AND Incluir_En_Cubo = 1;

        IF @TotalFondos = 0
        BEGIN
            SET @ErrorMessage = 'No hay fondos activos para procesar (Active = 1 AND Incluir_En_Cubo = 1)';
            RAISERROR(@ErrorMessage, 16, 1);
            RETURN -1;
        END

        -- =============================================
        -- PASO 4: Crear registro en logs.Procesos
        -- =============================================
        INSERT INTO logs.Procesos (
            ID_Proceso,
            FechaReporte,
            Estado,
            Etapa_Actual,
            FechaInicio,
            TotalFondos,
            FondosExitosos,
            FondosFallidos,
            FondosOmitidos
        )
        VALUES (
            @ID_Proceso,
            @FechaReporte,
            'EN_PROGRESO',
            'INICIALIZACION',
            @FechaActual,
            @TotalFondos,
            0, -- Inicialmente sin fondos exitosos
            0, -- Inicialmente sin fondos fallidos
            0  -- Inicialmente sin fondos omitidos
        );

        -- =============================================
        -- PASO 5: Crear ejecuciones hijas (una por fondo)
        -- =============================================
        INSERT INTO logs.Ejecuciones (
            ID_Ejecucion,
            ID_Proceso,
            ID_Fund,
            FechaReporte,
            Estado,
            Etapa_Actual,
            FechaInicio
        )
        SELECT
            -- Generar ID_Ejecucion único: ID_Proceso + número secuencial
            @ID_Proceso + ROW_NUMBER() OVER (ORDER BY ID_Fund) AS ID_Ejecucion,
            @ID_Proceso,
            ID_Fund,
            @FechaReporte,
            'PENDIENTE',
            'INICIALIZADO',
            @FechaActual
        FROM dimensionales.BD_Funds
        WHERE Active = 1
          AND Incluir_En_Cubo = 1
        ORDER BY ID_Fund;

        DECLARE @EjecucionesCreadas INT = @@ROWCOUNT;

        -- Validar que se crearon todas las ejecuciones
        IF @EjecucionesCreadas <> @TotalFondos
        BEGIN
            SET @ErrorMessage = 'Error: Se esperaban ' + CAST(@TotalFondos AS NVARCHAR(10)) +
                               ' ejecuciones pero se crearon ' + CAST(@EjecucionesCreadas AS NVARCHAR(10));
            RAISERROR(@ErrorMessage, 16, 1);
            RETURN -1;
        END

        -- =============================================
        -- PASO 6: Inicializar registros en logs.Ejecucion_Fondos
        -- =============================================
        -- Esta tabla es la que usa el pipeline actual para trackear estados
        INSERT INTO logs.Ejecucion_Fondos (
            ID_Ejecucion,
            ID_Fund,
            FundShortName,
            Portfolio_Geneva,
            Portfolio_CAPM,
            Portfolio_Derivados,
            Portfolio_UBS,
            Flag_UBS,
            Flag_Derivados,
            Requiere_Derivados,
            Incluir_En_Cubo,
            Estado_Extraccion,
            Estado_Validacion,
            Estado_Process_IPA,
            Estado_Process_CAPM,
            Estado_Process_Derivados,
            Estado_Process_PNL,
            Estado_Process_UBS,
            Estado_Concatenar,
            Estado_Graph_Sync,
            Estado_Final
        )
        SELECT
            e.ID_Ejecucion,
            f.ID_Fund,
            f.FundShortName,
            f.Portfolio_Geneva,
            f.Portfolio_CAPM,
            f.Portfolio_Derivados,
            f.Portfolio_UBS,
            f.Flag_UBS,
            f.Flag_Derivados,
            f.Requiere_Derivados,
            f.Incluir_En_Cubo,
            'PENDIENTE' AS Estado_Extraccion,
            'PENDIENTE' AS Estado_Validacion,
            'PENDIENTE' AS Estado_Process_IPA,
            'PENDIENTE' AS Estado_Process_CAPM,
            'PENDIENTE' AS Estado_Process_Derivados,
            'PENDIENTE' AS Estado_Process_PNL,
            'PENDIENTE' AS Estado_Process_UBS,
            'PENDIENTE' AS Estado_Concatenar,
            'PENDIENTE' AS Estado_Graph_Sync,
            'PENDIENTE' AS Estado_Final
        FROM logs.Ejecuciones e
        INNER JOIN dimensionales.BD_Funds f ON e.ID_Fund = f.ID_Fund
        WHERE e.ID_Proceso = @ID_Proceso;

        COMMIT TRANSACTION;

        -- =============================================
        -- PASO 7: Log de éxito
        -- =============================================
        PRINT '✓ Proceso inicializado exitosamente:';
        PRINT '  ID_Proceso: ' + CAST(@ID_Proceso AS NVARCHAR(20));
        PRINT '  FechaReporte: ' + @FechaReporte;
        PRINT '  Total Fondos: ' + CAST(@TotalFondos AS NVARCHAR(10));
        PRINT '  Ejecuciones Creadas: ' + CAST(@EjecucionesCreadas AS NVARCHAR(10));

        RETURN 0; -- Éxito

    END TRY
    BEGIN CATCH
        -- Rollback en caso de error
        IF @@TRANCOUNT > 0
            ROLLBACK TRANSACTION;

        -- Capturar información del error
        SET @ErrorMessage = ERROR_MESSAGE();
        DECLARE @ErrorSeverity INT = ERROR_SEVERITY();
        DECLARE @ErrorState INT = ERROR_STATE();
        DECLARE @ErrorLine INT = ERROR_LINE();
        DECLARE @ErrorProcedure NVARCHAR(128) = ERROR_PROCEDURE();

        -- Log detallado del error
        PRINT '❌ ERROR en sp_Inicializar_Proceso:';
        PRINT '  Mensaje: ' + @ErrorMessage;
        PRINT '  Severity: ' + CAST(@ErrorSeverity AS NVARCHAR(10));
        PRINT '  State: ' + CAST(@ErrorState AS NVARCHAR(10));
        PRINT '  Línea: ' + CAST(@ErrorLine AS NVARCHAR(10));
        PRINT '  Procedimiento: ' + ISNULL(@ErrorProcedure, 'N/A');

        -- Re-lanzar error para que el llamador lo maneje
        RAISERROR(@ErrorMessage, @ErrorSeverity, @ErrorState);
        RETURN -1;
    END CATCH
END
GO

-- =============================================
-- Agregar descripción extendida
-- =============================================
IF NOT EXISTS (
    SELECT * FROM sys.extended_properties
    WHERE major_id = OBJECT_ID('logs.sp_Inicializar_Proceso')
    AND minor_id = 0
    AND name = 'MS_Description'
)
BEGIN
    EXEC sys.sp_addextendedproperty
        @name = N'MS_Description',
        @value = N'Inicializa un proceso de pipeline para una fecha específica. Crea 1 registro en logs.Procesos (padre) y N registros en logs.Ejecuciones (hijos, uno por fondo activo). Arquitectura jerárquica que permite paralelismo sin contención.',
        @level0type = N'SCHEMA', @level0name = N'logs',
        @level1type = N'PROCEDURE', @level1name = N'sp_Inicializar_Proceso';
END
GO

-- =============================================
-- Verificación final
-- =============================================
PRINT '';
PRINT '================================================';

IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID('logs.sp_Inicializar_Proceso') AND type = 'P')
BEGIN
    PRINT '✅ MIGRACIÓN 014 COMPLETADA EXITOSAMENTE';
    PRINT '================================================';
    PRINT 'Stored Procedure: logs.sp_Inicializar_Proceso';
    PRINT 'Parámetros:';
    PRINT '  @FechaReporte NVARCHAR(10) - Fecha a procesar (YYYY-MM-DD)';
    PRINT '  @ID_Proceso BIGINT OUTPUT - ID del proceso creado';
    PRINT '';
    PRINT 'Ejemplo de uso:';
    PRINT '  DECLARE @IDProceso BIGINT;';
    PRINT '  EXEC logs.sp_Inicializar_Proceso @FechaReporte = ''2025-12-26'', @ID_Proceso = @IDProceso OUTPUT;';
    PRINT '  SELECT @IDProceso AS ID_Proceso_Creado;';
    PRINT '';
END
ELSE
BEGIN
    PRINT '❌ ERROR EN MIGRACIÓN 014';
    PRINT '================================================';
    RAISERROR('El SP logs.sp_Inicializar_Proceso no se creó correctamente', 16, 1);
END
GO
