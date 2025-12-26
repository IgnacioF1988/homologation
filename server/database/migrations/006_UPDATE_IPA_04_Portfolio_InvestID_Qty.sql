-- ============================================
-- Migration 006: UPDATE IPA_04 - JOIN por Portfolio+InvestID+Qty
-- ============================================
-- Descripción: Modifica IPA_04 para que el JOIN con stock.Suciedades y
--              dimensionales.Suciedades_IPA incluya Qty en la condición
--
-- Problema: Si la cantidad (Qty) cambia, el sistema debe volver a preguntar
--           al operador porque puede ser una suciedad diferente
--
-- Solución: JOIN por Portfolio+InvestID+ROUND(Qty, 2)
--           Si Qty cambia → Nueva suciedad → Nueva alerta
--
-- Fecha: 2025-12-23
-- ============================================

USE [Inteligencia_Producto_Dev];
GO

PRINT '============================================';
PRINT 'MIGRATION 006: UPDATE IPA_04 - Portfolio+InvestID+Qty';
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
        -- CAMBIO v6: JOIN por Portfolio+InvestID+ROUND(Qty,2)
        -- ============================================
        UPDATE ipa
        SET ipa.[CXC/CXP?] = stock.clasificacion
        FROM staging.IPA_WorkTable ipa WITH (ROWLOCK)
        INNER JOIN stock.Suciedades stock
            ON ipa.Portfolio = stock.portfolio
            AND ipa.InvestID = stock.investId
            AND ROUND(ipa.Qty, 2) = ROUND(stock.qty, 2)  -- NUEVO: Incluir Qty
        WHERE ipa.ID_Ejecucion = @ID_Ejecucion
          AND ipa.ID_Fund = @ID_Fund
          AND ipa.FechaReporte = @FechaReporte
          AND ipa.LSDesc IN ('Investments Long', 'Investments Short')
          AND stock.clasificacion IS NOT NULL
          AND stock.estado = 'Suciedad';

        DECLARE @AplicadasDesdeStock INT = @@ROWCOUNT;

        IF @DebugMode = 1 AND @AplicadasDesdeStock > 0
            PRINT 'IPA_04_v2: Aplicadas ' + CAST(@AplicadasDesdeStock AS NVARCHAR(10)) +
                  ' clasificaciones desde stock.Suciedades (sin alertar)';

        -- ============================================
        -- Paso 2b: MARCAR nuevas suciedades (dimensionales.Suciedades_IPA)
        -- CAMBIO v6: JOIN por Portfolio+InvestID+ROUND(Qty,2)
        -- ============================================
        UPDATE ipa
        SET ipa.[CXC/CXP?] = 'SI'
        FROM staging.IPA_WorkTable ipa WITH (ROWLOCK)
        INNER JOIN dimensionales.Suciedades_IPA dim
            ON ipa.Portfolio = dim.Portfolio
            AND ipa.InvestID = dim.InvestID
            AND ROUND(ipa.Qty, 2) = ROUND(dim.Qty, 2)  -- NUEVO: Incluir Qty
        WHERE ipa.ID_Ejecucion = @ID_Ejecucion
          AND ipa.ID_Fund = @ID_Fund
          AND ipa.FechaReporte = @FechaReporte
          AND ipa.LSDesc IN ('Investments Long', 'Investments Short')
          AND ipa.[CXC/CXP?] IS NULL
          AND NOT EXISTS (
              -- Excluir si ya está resuelto en stock (con misma Qty)
              SELECT 1
              FROM stock.Suciedades stock
              WHERE stock.portfolio = ipa.Portfolio
                AND stock.investId = ipa.InvestID
                AND ROUND(stock.qty, 2) = ROUND(ipa.Qty, 2)  -- NUEVO: Incluir Qty
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
          AND [CXC/CXP?] = 'SI';

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

PRINT '✓ Migration 006 COMPLETADA - IPA_04 ahora detecta por Portfolio+InvestID+Qty';
PRINT '  → Si la cantidad cambia, se considera una suciedad NUEVA';
PRINT '';

GO
