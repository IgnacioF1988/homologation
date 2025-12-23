-- ============================================
-- Migration 005: UPDATE IPA_04 - Check stock.Suciedades first
-- ============================================
-- Descripción: Modifica IPA_04 para consultar stock.Suciedades ANTES de alertar
--
-- Flujo anterior:
--   1. JOIN con dimensionales.Suciedades_IPA → Marca [CXC/CXP?] = 'SI'
--   2. Detecta marcados → Alerta en sandbox
--   3. Stand-by código 5
--
-- Problema: Sin consultar stock, vuelve a alertar en cada ejecución
--
-- Flujo nuevo:
--   1. JOIN con stock.Suciedades → Si ya resuelto, aplicar clasificación y skip alerta
--   2. JOIN con dimensionales.Suciedades_IPA → Nuevos sin resolver
--   3. Marca [CXC/CXP?] = 'SI' solo para nuevos
--   4. Detecta nuevos → Alerta en sandbox
--   5. Stand-by código 5 solo si hay nuevos
--
-- Fecha: 2025-12-23
-- ============================================

USE [Inteligencia_Producto_Dev];
GO

PRINT '============================================';
PRINT 'MIGRATION 005: UPDATE IPA_04 - Check stock first';
PRINT '============================================';

GO

ALTER PROCEDURE [staging].[IPA_04_TratamientoSuciedades_v2]
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
    SET @RowsProcessed = 0;
    SET @ErrorCount = 0;

    BEGIN TRY
        -- Paso 1: DELETE posiciones pequeñas
        DELETE FROM staging.IPA_WorkTable WITH (ROWLOCK)
        WHERE ID_Ejecucion = @ID_Ejecucion
          AND ID_Fund = @ID_Fund
          AND ABS(ISNULL(AI, 0)) < 0.01
          AND ABS(ISNULL(MVBook, 0)) < 0.01
          AND InvestDescription NOT LIKE '%Cash%'
          AND InvestDescription NOT LIKE '%Efectivo%';

        SET @RowsProcessed = @@ROWCOUNT;

        -- ============================================
        -- Paso 2a: APLICAR clasificaciones ya resueltas (stock.Suciedades)
        -- ============================================
        -- Si Portfolio+InvestID ya está en stock, aplicar clasificación directamente
        -- NO alertar, NO stand-by
        UPDATE ipa
        SET ipa.[CXC/CXP?] = stock.clasificacion
        FROM staging.IPA_WorkTable ipa WITH (ROWLOCK)
        INNER JOIN stock.Suciedades stock
            ON ipa.Portfolio = stock.portfolio
            AND ipa.InvestID = stock.investId
        WHERE ipa.ID_Ejecucion = @ID_Ejecucion
          AND ipa.ID_Fund = @ID_Fund
          AND ipa.FechaReporte = @FechaReporte
          AND ipa.LSDesc IN ('Investments Long', 'Investments Short')
          AND stock.clasificacion IS NOT NULL  -- Ya clasificado
          AND stock.estado = 'Suciedad';

        DECLARE @AplicadasDesdeStock INT = @@ROWCOUNT;

        IF @DebugMode = 1 AND @AplicadasDesdeStock > 0
            PRINT 'IPA_04_v2: Aplicadas ' + CAST(@AplicadasDesdeStock AS NVARCHAR(10)) +
                  ' clasificaciones desde stock.Suciedades (sin alertar)';

        -- ============================================
        -- Paso 2b: MARCAR nuevas suciedades (dimensionales.Suciedades_IPA)
        -- ============================================
        -- Solo marcar las que NO están ya en stock
        UPDATE ipa
        SET ipa.[CXC/CXP?] = 'SI'
        FROM staging.IPA_WorkTable ipa WITH (ROWLOCK)
        INNER JOIN dimensionales.Suciedades_IPA dim
            ON ipa.Portfolio = dim.Portfolio
            AND ipa.InvestID = dim.InvestID
        WHERE ipa.ID_Ejecucion = @ID_Ejecucion
          AND ipa.ID_Fund = @ID_Fund
          AND ipa.FechaReporte = @FechaReporte
          AND ipa.LSDesc IN ('Investments Long', 'Investments Short')
          AND ipa.[CXC/CXP?] IS NULL  -- NO clasificado aún (ni desde stock ni explícitamente)
          AND NOT EXISTS (
              -- Excluir si ya está resuelto en stock
              SELECT 1
              FROM stock.Suciedades stock
              WHERE stock.portfolio = ipa.Portfolio
                AND stock.investId = ipa.InvestID
                AND stock.clasificacion IS NOT NULL
          );

        -- ============================================
        -- Paso 3: DETECTAR nuevas suciedades (solo sin clasificar)
        -- ============================================
        DECLARE @CantidadSuciedadesNuevas INT;

        SELECT @CantidadSuciedadesNuevas = COUNT(*)
        FROM staging.IPA_WorkTable
        WHERE ID_Ejecucion = @ID_Ejecucion
          AND ID_Fund = @ID_Fund
          AND [CXC/CXP?] = 'SI';  -- Solo las marcadas como nuevas

        IF @CantidadSuciedadesNuevas > 0
        BEGIN
            -- 1. Insertar en cola de alertas de suciedades (solo nuevas)
            INSERT INTO sandbox.Alertas_Suciedades_IPA (
                FechaReporte, InvestID, Qty, Portfolio, FechaProceso
            )
            SELECT
                @FechaReporte,
                InvestID,
                Qty,
                Portfolio,
                CONVERT(NVARCHAR, GETDATE(), 120)
            FROM staging.IPA_WorkTable
            WHERE ID_Ejecucion = @ID_Ejecucion
              AND ID_Fund = @ID_Fund
              AND [CXC/CXP?] = 'SI';

            -- 2. Registrar stand-by
            INSERT INTO logs.FondosEnStandBy (
                ID_Ejecucion, ID_Fund, TipoProblema, MotivoDetallado,
                PuntoBloqueo, ServicioSiguiente, CantidadProblemas, TablaColaReferencia
            )
            VALUES (
                @ID_Ejecucion,
                @ID_Fund,
                'SUCIEDADES',
                CONCAT('Detectadas ', @CantidadSuciedadesNuevas, ' posiciones NUEVAS con [CXC/CXP?] en portfolio ', @Portfolio_Geneva,
                       ' (', @AplicadasDesdeStock, ' ya clasificadas desde stock)'),
                'ANTES_CAPM',
                'PROCESS_CAPM',
                @CantidadSuciedadesNuevas,
                'sandbox.Alertas_Suciedades_IPA'
            );

            -- 3. Actualizar flags en Ejecucion_Fondos
            UPDATE logs.Ejecucion_Fondos
            SET EstadoStandBy = 'PAUSADO',
                TieneSuciedades = 1,
                PuntoBloqueoActual = 'ANTES_CAPM',
                FechaUltimoPause = GETDATE(),
                ContadorPauses = ISNULL(ContadorPauses, 0) + 1
            WHERE ID_Ejecucion = @ID_Ejecucion
              AND ID_Fund = @ID_Fund;

            -- 4. Log informativo
            IF @DebugMode = 1
                PRINT 'IPA_04_v2: Detectadas ' + CAST(@CantidadSuciedadesNuevas AS NVARCHAR(10)) +
                      ' suciedades NUEVAS - Stand-by activado (código 5)';

            -- 5. Retornar código stand-by SUCIEDADES
            RETURN 5;
        END

        -- Sin suciedades nuevas - éxito normal
        IF @DebugMode = 1 AND @AplicadasDesdeStock > 0
            PRINT 'IPA_04_v2: Sin suciedades nuevas, todas ya resueltas desde stock';

        RETURN 0;

    END TRY
    BEGIN CATCH
        SET @ErrorCount = 1;

        BEGIN TRY
            INSERT INTO logs.SP_Errors (ID_Ejecucion, ID_Fund, SP_Name, ErrorNumber, ErrorMessage, ErrorSeverity, ErrorState, ErrorLine)
            VALUES (@ID_Ejecucion, @ID_Fund, OBJECT_NAME(@@PROCID), ERROR_NUMBER(), ERROR_MESSAGE(), ERROR_SEVERITY(), ERROR_STATE(), ERROR_LINE());
        END TRY
        BEGIN CATCH END CATCH

        IF ERROR_NUMBER() = 1205 RETURN 2; -- Deadlock

        RETURN 3; -- Error crítico
    END CATCH
END;
GO

PRINT '✓ Migration 005 COMPLETADA - IPA_04 ahora consulta stock.Suciedades primero';
PRINT '  → Suciedades ya clasificadas: Se aplica automáticamente, NO alerta';
PRINT '  → Suciedades nuevas: Se marca, alerta en sandbox, stand-by código 5';
PRINT '';

GO
