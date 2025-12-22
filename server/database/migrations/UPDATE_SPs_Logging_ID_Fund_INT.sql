/*
================================================================================
UPDATE STORED PROCEDURES: Actualizar parámetro @ID_Fund a INT
Fecha: 2025-12-22
Propósito: Actualizar SPs de logging después de migración de ID_Fund a INT
================================================================================

REQUISITO PREVIO: Ejecutar MIGRATION_ID_Fund_To_INT.sql primero

SPs a actualizar:
1. logs.sp_Actualizar_Estado_Fondo
2. logs.sp_Registrar_Metrica
3. logs.sp_Inicializar_Ejecucion

================================================================================
*/

SET NOCOUNT ON;
GO

PRINT '================================================================================'
PRINT 'ACTUALIZANDO STORED PROCEDURES DE LOGGING'
PRINT 'Fecha: ' + CONVERT(VARCHAR, GETDATE(), 120)
PRINT '================================================================================'
GO

-- ============================================================================
-- 1. logs.sp_Actualizar_Estado_Fondo
-- ============================================================================
PRINT ''
PRINT 'Actualizando logs.sp_Actualizar_Estado_Fondo...'
GO

ALTER PROCEDURE logs.sp_Actualizar_Estado_Fondo
    @ID_Ejecucion BIGINT,
    @ID_Fund INT,  -- CAMBIO: VARCHAR(50) → INT
    @Etapa VARCHAR(50),
    @Estado VARCHAR(20),
    @Mensaje_Error NVARCHAR(500) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @ColumnaEstado NVARCHAR(100);
    DECLARE @SQL NVARCHAR(MAX);

    -- Mapear etapa a columna
    SET @ColumnaEstado = CASE @Etapa
        WHEN 'Extraccion' THEN 'Estado_Extraccion'
        WHEN 'Process_IPA' THEN 'Estado_Process_IPA'
        WHEN 'IPA_01_RescatarLocalPrice' THEN 'Estado_IPA_01_RescatarLocalPrice'
        WHEN 'IPA_02_AjusteSONA' THEN 'Estado_IPA_02_AjusteSONA'
        WHEN 'IPA_03_RenombrarCxCCxP' THEN 'Estado_IPA_03_RenombrarCxCCxP'
        WHEN 'IPA_04_TratamientoSuciedades' THEN 'Estado_IPA_04_TratamientoSuciedades'
        WHEN 'IPA_05_EliminarCajasMTM' THEN 'Estado_IPA_05_EliminarCajasMTM'
        WHEN 'IPA_06_CrearDimensiones' THEN 'Estado_IPA_06_CrearDimensiones'
        WHEN 'IPA_07_AgruparRegistros' THEN 'Estado_IPA_07_AgruparRegistros'
        WHEN 'Process_CAPM' THEN 'Estado_Process_CAPM'
        WHEN 'CAPM_01_Ajuste' THEN 'Estado_CAPM_01_Ajuste'
        WHEN 'CAPM_02_ExtractTransform' THEN 'Estado_CAPM_02_ExtractTransform'
        WHEN 'CAPM_03_CargaFinal' THEN 'Estado_CAPM_03_CargaFinal'
        WHEN 'Process_Derivados' THEN 'Estado_Process_Derivados'
        WHEN 'DERIV_01_Posiciones' THEN 'Estado_DERIV_01_Posiciones'
        WHEN 'DERIV_02_Dimensiones' THEN 'Estado_DERIV_02_Dimensiones'
        WHEN 'DERIV_03_Ajuste' THEN 'Estado_DERIV_03_Ajuste'
        WHEN 'DERIV_04_Paridad' THEN 'Estado_DERIV_04_Paridad'
        WHEN 'Process_PNL' THEN 'Estado_Process_PNL'
        WHEN 'PNL_01_Dimensiones' THEN 'Estado_PNL_01_Dimensiones'
        WHEN 'PNL_02_Ajuste' THEN 'Estado_PNL_02_Ajuste'
        WHEN 'PNL_03_Agrupacion' THEN 'Estado_PNL_03_Agrupacion'
        WHEN 'PNL_04_AjusteIPA' THEN 'Estado_PNL_04_AjusteIPA'
        WHEN 'PNL_05_Consolidar' THEN 'Estado_PNL_05_Consolidar'
        WHEN 'Process_UBS' THEN 'Estado_Process_UBS'
        WHEN 'Concatenar' THEN 'Estado_Concatenar'
        WHEN 'Validacion' THEN 'Estado_Validacion'
        ELSE NULL
    END;

    IF @ColumnaEstado IS NULL
    BEGIN
        RAISERROR('Etapa desconocida: %s', 16, 1, @Etapa);
        RETURN -1;
    END

    -- Actualizar columna específica
    SET @SQL = N'UPDATE logs.Ejecucion_Fondos SET ' + QUOTENAME(@ColumnaEstado) + ' = @Estado';

    -- Si es ERROR o WARNING, también actualizar campos de error
    IF @Estado IN ('ERROR', 'WARNING', 'ERROR_HOMOLOGACION')
    BEGIN
        SET @SQL = @SQL + N', Paso_Con_Error = @Etapa, Mensaje_Error = @Mensaje_Error, Incluir_En_Cubo = 0';
    END
    -- Si es OK, actualizar último paso exitoso y timestamp de inicio si es el primero
    ELSE IF @Estado = 'OK'
    BEGIN
        SET @SQL = @SQL + N', Ultimo_Paso_Exitoso = @Etapa';
        IF @Etapa = 'Extraccion'
            SET @SQL = @SQL + N', Inicio_Procesamiento = GETDATE()';
    END

    SET @SQL = @SQL + N' WHERE ID_Ejecucion = @ID_Ejecucion AND ID_Fund = @ID_Fund';

    -- CAMBIO: @ID_Fund ahora es INT
    EXEC sp_executesql @SQL,
        N'@Estado VARCHAR(20), @Etapa VARCHAR(50), @Mensaje_Error NVARCHAR(500), @ID_Ejecucion BIGINT, @ID_Fund INT',
        @Estado, @Etapa, @Mensaje_Error, @ID_Ejecucion, @ID_Fund;

    RETURN 0;
END
GO

PRINT 'logs.sp_Actualizar_Estado_Fondo actualizado exitosamente ✓'
GO

-- ============================================================================
-- 2. logs.sp_Registrar_Metrica
-- ============================================================================
PRINT ''
PRINT 'Actualizando logs.sp_Registrar_Metrica...'
GO

ALTER PROCEDURE logs.sp_Registrar_Metrica
    @ID_Ejecucion BIGINT,
    @ID_Fund INT,  -- CAMBIO: VARCHAR(50) → INT
    @Etapa VARCHAR(50),
    @Registros_Entrada INT = NULL,
    @Registros_Procesados INT = NULL,
    @Registros_Salida INT = NULL,
    @Suma_TotalMVal DECIMAL(22,2) = NULL,
    @Valor_Esperado DECIMAL(22,2) = NULL,
    @Valor_Obtenido DECIMAL(22,2) = NULL,
    @Umbral_Tolerancia DECIMAL(22,2) = 0.01
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Diferencia DECIMAL(22,2) = NULL;
    DECLARE @Diferencia_Pct DECIMAL(10,4) = NULL;
    DECLARE @Validacion_OK BIT = NULL;

    -- Calcular diferencia si hay valores para comparar
    IF @Valor_Esperado IS NOT NULL AND @Valor_Obtenido IS NOT NULL
    BEGIN
        SET @Diferencia = ABS(@Valor_Esperado - @Valor_Obtenido);
        SET @Diferencia_Pct = CASE
            WHEN @Valor_Esperado <> 0 THEN (@Diferencia / ABS(@Valor_Esperado)) * 100
            ELSE NULL
        END;
        SET @Validacion_OK = CASE WHEN @Diferencia <= @Umbral_Tolerancia THEN 1 ELSE 0 END;
    END

    INSERT INTO logs.Ejecucion_Metricas (
        ID_Ejecucion, ID_Fund, Etapa,
        Registros_Entrada, Registros_Procesados, Registros_Salida,
        Suma_TotalMVal, Valor_Esperado, Valor_Obtenido,
        Diferencia, Diferencia_Porcentual, Validacion_OK, Umbral_Tolerancia
    )
    VALUES (
        @ID_Ejecucion, @ID_Fund, @Etapa,
        @Registros_Entrada, @Registros_Procesados, @Registros_Salida,
        @Suma_TotalMVal, @Valor_Esperado, @Valor_Obtenido,
        @Diferencia, @Diferencia_Pct, @Validacion_OK, @Umbral_Tolerancia
    );

    -- Retornar si la validación pasó
    RETURN ISNULL(@Validacion_OK, 1);
END
GO

PRINT 'logs.sp_Registrar_Metrica actualizado exitosamente ✓'
GO

-- ============================================================================
-- 3. logs.sp_Inicializar_Ejecucion
-- ============================================================================
PRINT ''
PRINT 'Actualizando logs.sp_Inicializar_Ejecucion...'
GO

ALTER PROCEDURE [logs].[sp_Inicializar_Ejecucion]
    @FechaReporte NVARCHAR(10),
    @ID_Ejecucion BIGINT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    -- Crear ejecución
    INSERT INTO logs.Ejecuciones (FechaReporte, FechaInicio, Estado)
    VALUES (@FechaReporte, GETDATE(), 'EN_PROGRESO');

    SET @ID_Ejecucion = SCOPE_IDENTITY();

    -- Crear tabla temporal con portfolios pivotados
    -- CAMBIO: ID_Fund ahora es INT (no VARCHAR(50))
    CREATE TABLE #FundPortfolios (
        ID_Fund INT,
        Portfolio_Geneva VARCHAR(100),
        Portfolio_CAPM VARCHAR(100),
        Portfolio_Derivados VARCHAR(100),
        Portfolio_UBS VARCHAR(100)
    );

    -- OPTIMIZADO: Usar PIVOT nativo + sin CAST innecesario
    INSERT INTO #FundPortfolios (ID_Fund, Portfolio_Geneva, Portfolio_CAPM, Portfolio_Derivados, Portfolio_UBS)
    SELECT ID_Fund, [GENEVA], [CASH APPRAISAL], [DERIVADOS], [UBS]
    FROM (
        SELECT
            ID_Fund,  -- Ya es INT después de migración
            Source,
            Portfolio
        FROM dimensionales.HOMOL_Funds WITH (INDEX(idx_HOMOL_Funds_Source))
    ) AS SourceTable
    PIVOT (
        MAX(Portfolio)
        FOR Source IN ([GENEVA], [CASH APPRAISAL], [DERIVADOS], [UBS])
    ) AS PivotTable;

    -- Insertar fondos activos con sus portfolios
    -- CAMBIO: ID_Fund ahora es INT directamente (sin CAST)
    INSERT INTO logs.Ejecucion_Fondos (
        ID_Ejecucion, ID_Fund, FundShortName,
        Portfolio_Geneva, Portfolio_CAPM, Portfolio_Derivados, Portfolio_UBS,
        Flag_UBS, Flag_Derivados, Requiere_Derivados, Incluir_En_Cubo
    )
    SELECT
        @ID_Ejecucion,
        bf.ID_Fund,  -- Usar directamente (ya es INT)
        bf.FundShortName,
        COALESCE(fp.Portfolio_Geneva, fp.Portfolio_UBS),
        fp.Portfolio_CAPM,
        fp.Portfolio_Derivados,
        fp.Portfolio_UBS,
        ISNULL(bf.Flag_UBS, 0),
        ISNULL(bf.Flag_Derivados, 0),
        ISNULL(bf.Flag_Derivados, 0),
        1
    FROM dimensionales.BD_Funds bf
    LEFT JOIN #FundPortfolios fp
        ON bf.ID_Fund = fp.ID_Fund  -- JOIN directo (ambos INT)
    WHERE bf.Activo_MantenedorFondos = 1;

    DROP TABLE #FundPortfolios;

    -- Actualizar total de fondos
    UPDATE logs.Ejecuciones
    SET TotalFondos = (SELECT COUNT(*) FROM logs.Ejecucion_Fondos WHERE ID_Ejecucion = @ID_Ejecucion)
    WHERE ID_Ejecucion = @ID_Ejecucion;

    PRINT 'Ejecución inicializada: ' + CAST(@ID_Ejecucion AS VARCHAR(20));
    RETURN 0;
END
GO

PRINT 'logs.sp_Inicializar_Ejecucion actualizado exitosamente ✓'
GO

-- ============================================================================
-- VERIFICACIÓN FINAL
-- ============================================================================
PRINT ''
PRINT '--- VERIFICACIÓN DE PARÁMETROS ---'
GO

-- Verificar firma de SPs
SELECT
    OBJECT_SCHEMA_NAME(p.object_id) AS Schema_Name,
    OBJECT_NAME(p.object_id) AS Procedure_Name,
    pm.name AS Parameter_Name,
    TYPE_NAME(pm.user_type_id) AS Data_Type,
    pm.max_length,
    pm.is_output
FROM sys.parameters pm
INNER JOIN sys.procedures p ON pm.object_id = p.object_id
WHERE OBJECT_NAME(p.object_id) IN ('sp_Actualizar_Estado_Fondo', 'sp_Registrar_Metrica', 'sp_Inicializar_Ejecucion')
  AND OBJECT_SCHEMA_NAME(p.object_id) = 'logs'
  AND pm.name = '@ID_Fund'
ORDER BY OBJECT_NAME(p.object_id);

PRINT ''
PRINT '================================================================================'
PRINT 'ACTUALIZACIÓN DE SPs COMPLETADA'
PRINT 'Fecha fin: ' + CONVERT(VARCHAR, GETDATE(), 120)
PRINT '================================================================================'
PRINT ''
PRINT '3 Stored Procedures actualizados:'
PRINT '  ✓ logs.sp_Actualizar_Estado_Fondo (@ID_Fund INT)'
PRINT '  ✓ logs.sp_Registrar_Metrica (@ID_Fund INT)'
PRINT '  ✓ logs.sp_Inicializar_Ejecucion (temp table ID_Fund INT + sin CAST)'
PRINT ''
PRINT 'PRÓXIMOS PASOS:'
PRINT '1. Actualizar código Node.js (BasePipelineService, ExecutionTracker, LoggingService)'
PRINT '2. Crear FundOrchestrator.js'
PRINT '3. Modificar procesos.v2.routes.js para usar V2'
GO
