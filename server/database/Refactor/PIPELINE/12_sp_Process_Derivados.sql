/*
================================================================================
SP: staging.sp_Process_Derivados
Version: v2.0 - Redesign DB-Centric (descuadres validados en ValidateFund)
================================================================================
Descripción: Procesa datos de Derivados.
             - Carga extract.Derivados con UNPIVOT posiciones larga/corta
             - Homologa instrumentos y monedas
             - Valida PARIDAD: SUM(MTM) vs SUM(TotalMVal) por moneda
             - Crea ajustes en ##Ajustes

PRINCIPIO FUNDAMENTAL:
  Si sp_ValidateFund pasó, este SP NO DEBE fallar por validaciones de negocio.
  Cualquier falla aquí es un BUG del sistema (ASSERTION_FAILED).

Prerequisito: sp_Process_IPA debe haber completado

Códigos de retorno:
  0  = OK
  1  = WARNING (sin datos Derivados, OK si fondo no requiere Derivados)
  3  = ERROR_CRITICO (exception no esperada)
  4  = ASSERTION_FAILED (bug del sistema - prerequisitos no cumplidos)

NOTA: El código 8 (DESCUADRES_DERIVADOS) fue movido a sp_ValidateFund FASE 4.

CHECKPOINT Events emitidos:
  - VERIFIED ##IPA_MTM (prerequisito validado)
  - CREATED ##Derivados_Work (después de cargar datos)

Autor: Refactorización Pipeline IPA
Fecha: 2026-01-02
Modificado: 2026-01-09 - Redesign v2.0 con CHECKPOINT events
================================================================================
*/

CREATE OR ALTER PROCEDURE [staging].[sp_Process_Derivados]
    @ID_Ejecucion BIGINT,
    @ID_Proceso BIGINT,
    @ID_Fund INT,
    @FechaReporte NVARCHAR(10),
    -- Outputs
    @RowsProcessed INT OUTPUT,
    @TotalIPA_MTM DECIMAL(18,4) OUTPUT,
    @TotalDerivados_MTM DECIMAL(18,4) OUTPUT,
    @DiferenciaDescuadre DECIMAL(18,4) OUTPUT,
    @AjustesCreados INT OUTPUT,
    @ErrorCount INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    -- Inicializar outputs
    SET @RowsProcessed = 0;
    SET @TotalIPA_MTM = 0;
    SET @TotalDerivados_MTM = 0;
    SET @DiferenciaDescuadre = 0;
    SET @AjustesCreados = 0;
    SET @ErrorCount = 0;

    -- Variables locales
    DECLARE @StartTime DATETIME = GETDATE();
    DECLARE @SQL NVARCHAR(MAX);
    DECLARE @ReturnCode INT = 0;
    DECLARE @ErrorMessage NVARCHAR(500);
    DECLARE @Source NVARCHAR(50);
    DECLARE @UmbralDescuadre DECIMAL(18,4);
    DECLARE @UmbralParidad DECIMAL(18,4);
    DECLARE @id_CURR_Fondo INT;
    DECLARE @Portfolio NVARCHAR(100);
    DECLARE @AjusteCreado BIT;

    -- Obtener Source desde config (fuente de verdad)
    SELECT @Source = SourceName FROM config.Extract_Source WHERE ExtractTable = 'Derivados';
    SET @Source = ISNULL(@Source, 'DERIVADOS');  -- Fallback por seguridad

    -- IDs de instrumentos de ajuste
    DECLARE @ID_Instrumento_Ajuste INT = 1507;
    DECLARE @ID_Instrumento_Paridad INT = 1508;

    -- Nombres de tablas temporales
    DECLARE @Suffix NVARCHAR(100) = CAST(@ID_Ejecucion AS NVARCHAR(20)) + '_' +
                                    CAST(@ID_Proceso AS NVARCHAR(10)) + '_' +
                                    CAST(@ID_Fund AS NVARCHAR(10));
    DECLARE @TempDerivados NVARCHAR(200) = '##Derivados_Work_' + @Suffix;
    DECLARE @TempIPA_MTM NVARCHAR(200) = '##IPA_MTM_' + @Suffix;
    DECLARE @TempAjustes NVARCHAR(200) = '##Ajustes_' + @Suffix;

    -- Variables para homologación
    DECLARE @ProblemasFondo INT, @ProblemasInstrumento INT, @ProblemasMoneda INT;

    BEGIN TRY
        -- ═══════════════════════════════════════════════════════════════════
        -- EVENTO: SP_INICIO
        -- ═══════════════════════════════════════════════════════════════════
        EXEC broker.sp_EmitirEvento
            @TipoEvento = 'SP_INICIO',
            @ID_Ejecucion = @ID_Ejecucion,
            @ID_Proceso = @ID_Proceso,
            @ID_Fund = @ID_Fund,
            @NombreSP = 'staging.sp_Process_Derivados';

        -- ═══════════════════════════════════════════════════════════════════
        -- PASO 0: ASSERTION - Verificar prerequisitos
        -- Si ValidateFund pasó, ##IPA_MTM DEBE existir. Si no existe, es un BUG.
        -- ═══════════════════════════════════════════════════════════════════

        DECLARE @IPAMTMExists BIT = 0;
        SET @SQL = N'IF OBJECT_ID(''tempdb..' + @TempIPA_MTM + ''', ''U'') IS NOT NULL SET @Exists = 1';
        EXEC sp_executesql @SQL, N'@Exists BIT OUTPUT', @IPAMTMExists OUTPUT;

        IF @IPAMTMExists = 0
        BEGIN
            -- ASSERTION_FAILED: Esto es un BUG, no debería pasar si ValidateFund pasó
            DECLARE @AssertMsg NVARCHAR(500) = 'ASSERTION_FAILED: Tabla ' + @TempIPA_MTM + ' no existe. Bug en orquestador o sp_Process_IPA falló silenciosamente.';
            PRINT @AssertMsg;

            EXEC broker.sp_EmitirEvento
                @TipoEvento = 'ERROR',
                @ID_Ejecucion = @ID_Ejecucion,
                @ID_Proceso = @ID_Proceso,
                @ID_Fund = @ID_Fund,
                @NombreSP = 'staging.sp_Process_Derivados',
                @CodigoRetorno = 4,
                @Detalles = @AssertMsg;

            RETURN 4;  -- ASSERTION_FAILED
        END

        -- ═══════════════════════════════════════════════════════════════════
        -- CHECKPOINT: ##IPA_MTM verificada (prerequisito OK)
        -- ═══════════════════════════════════════════════════════════════════
        DECLARE @ChkVerified NVARCHAR(500) = '{"operacion": "VERIFIED", "objeto": "' + @TempIPA_MTM + '", "mensaje": "Prerequisito IPA MTM existe"}';
        EXEC broker.sp_EmitirEvento
            @TipoEvento = 'CHECKPOINT',
            @ID_Ejecucion = @ID_Ejecucion,
            @ID_Proceso = @ID_Proceso,
            @ID_Fund = @ID_Fund,
            @NombreSP = 'staging.sp_Process_Derivados',
            @Detalles = @ChkVerified;

        -- Obtener umbrales configurados
        SET @UmbralDescuadre = staging.fn_GetUmbral(@ID_Fund, 'DERIVADOS');
        SET @UmbralParidad = staging.fn_GetUmbral(@ID_Fund, 'PARIDADES');

        -- Obtener moneda del fondo
        SELECT @id_CURR_Fondo = id_CURR
        FROM dimensionales.BD_Funds
        WHERE ID_Fund = @ID_Fund;

        -- Obtener Portfolio
        SELECT @Portfolio = Portfolio
        FROM dimensionales.HOMOL_Funds
        WHERE ID_Fund = @ID_Fund AND Source = @Source;

        PRINT 'sp_Process_Derivados: Iniciando para Fondo ' + CAST(@ID_Fund AS NVARCHAR(10)) +
              ' | Umbral Descuadre: ' + CAST(@UmbralDescuadre AS NVARCHAR(10)) +
              ' | Umbral Paridad: ' + CAST(@UmbralParidad AS NVARCHAR(10));

        -- ═══════════════════════════════════════════════════════════════════
        -- PASO 1: Calcular total MTM en IPA
        -- ═══════════════════════════════════════════════════════════════════

        SET @SQL = N'SELECT @Total = ISNULL(SUM(ISNULL(MVBook, 0)), 0) FROM ' + @TempIPA_MTM;
        EXEC sp_executesql @SQL, N'@Total DECIMAL(18,4) OUTPUT', @TotalIPA_MTM OUTPUT;

        PRINT 'sp_Process_Derivados: Total IPA MTM = ' + CAST(@TotalIPA_MTM AS NVARCHAR(20));

        -- ═══════════════════════════════════════════════════════════════════
        -- PASO 2: Crear tabla temporal ##Derivados_Work
        -- ═══════════════════════════════════════════════════════════════════

        SET @SQL = N'
        IF OBJECT_ID(''tempdb..' + @TempDerivados + ''', ''U'') IS NOT NULL
            DROP TABLE ' + @TempDerivados + ';

        CREATE TABLE ' + @TempDerivados + ' (
            RowID INT IDENTITY(1,1) PRIMARY KEY,
            ID_Ejecucion BIGINT NOT NULL,
            ID_Proceso BIGINT NOT NULL,
            ID_Fund INT NULL,
            PK2 NVARCHAR(50) NULL,
            ID_Instrumento INT NULL,
            id_CURR INT NULL,
            FechaReporte NVARCHAR(10) NOT NULL,
            FechaCartera NVARCHAR(10) NULL,
            Portfolio NVARCHAR(100) NOT NULL,
            InvestID NVARCHAR(255) NOT NULL,
            Tipo_Derivado NVARCHAR(100) NULL,
            LocalCurrency NVARCHAR(50) NULL,
            BalanceSheet NVARCHAR(20) NULL,
            Source NVARCHAR(50) NULL,
            LocalPrice DECIMAL(18,6) NULL,
            Qty DECIMAL(18,6) NULL,
            OriginalFace DECIMAL(18,4) NULL,
            Factor DECIMAL(18,6) NULL,
            AI DECIMAL(18,4) NULL,
            MVBook DECIMAL(18,4) NULL,
            TotalMVal DECIMAL(18,4) NULL,
            TotalMVal_Balance DECIMAL(18,4) NULL,
            MTM DECIMAL(18,4) NULL,
            FechaProceso DATETIME NOT NULL DEFAULT GETDATE()
        );';
        EXEC sp_executesql @SQL;

        -- ═══════════════════════════════════════════════════════════════════
        -- PASO 3: Cargar datos con UNPIVOT (posiciones larga/corta)
        -- ═══════════════════════════════════════════════════════════════════

        SET @SQL = N'
        WITH CTE_Monedas AS (
            SELECT
                d.FechaReporte, d.Portfolio, d.Tipo_Derivado, d.InvestID,
                d.Notional_Vig_PLarga_Local, d.Notional_Vig_PCorta_Local,
                d.VP_PLarga_Base, d.VP_PCorta_Base, d.MTM_Sistema,
                unpvt.Atributo, unpvt.Code
            FROM extract.Derivados d
            CROSS APPLY (
                SELECT ''Moneda_PLarga'' AS Atributo, d.Moneda_PLarga AS Code
                UNION ALL
                SELECT ''Moneda_PCorta'', d.Moneda_PCorta
            ) unpvt
            WHERE d.FechaReporte = @FechaReporte
              AND d.ID_Ejecucion = @ID_Ejecucion
        ),
        CTE_ValoresPresentes AS (
            SELECT
                m.FechaReporte, m.Portfolio, m.Tipo_Derivado, m.InvestID,
                m.Notional_Vig_PLarga_Local, m.Notional_Vig_PCorta_Local,
                m.MTM_Sistema, m.Atributo, m.Code,
                unpvt2.Atributo1, unpvt2.TotalMVal
            FROM CTE_Monedas m
            CROSS APPLY (
                SELECT ''VP_PLarga_Base'' AS Atributo1, m.VP_PLarga_Base AS TotalMVal
                UNION ALL
                SELECT ''VP_PCorta_Base'', m.VP_PCorta_Base
            ) unpvt2
        ),
        CTE_Nocionales AS (
            SELECT
                vp.FechaReporte, vp.Portfolio, vp.Tipo_Derivado, vp.InvestID,
                vp.MTM_Sistema, vp.Atributo, vp.Code, vp.Atributo1, vp.TotalMVal,
                unpvt3.Atributo2, unpvt3.Qty
            FROM CTE_ValoresPresentes vp
            CROSS APPLY (
                SELECT ''Notional_Vig_PLarga_Local'' AS Atributo2, vp.Notional_Vig_PLarga_Local AS Qty
                UNION ALL
                SELECT ''Notional_Vig_PCorta_Local'', vp.Notional_Vig_PCorta_Local
            ) unpvt3
        ),
        CTE_Filtrado AS (
            SELECT
                FechaReporte, Portfolio, Tipo_Derivado, InvestID,
                MTM_Sistema, Code, TotalMVal, Qty,
                CASE WHEN Atributo = ''Moneda_PLarga'' THEN 1 ELSE 0 END +
                CASE WHEN Atributo1 = ''VP_PLarga_Base'' THEN 1 ELSE 0 END +
                CASE WHEN Atributo2 = ''Notional_Vig_PLarga_Local'' THEN 1 ELSE 0 END AS Prueba_Logica
            FROM CTE_Nocionales
        ),
        CTE_MTM AS (
            SELECT
                FechaReporte, Portfolio, Tipo_Derivado, InvestID,
                Code, TotalMVal, Qty,
                CASE
                    WHEN MAX(ABS(TotalMVal)) OVER (PARTITION BY InvestID) = ABS(TotalMVal)
                    THEN MTM_Sistema
                    ELSE 0
                END AS MTM
            FROM CTE_Filtrado
            WHERE Prueba_Logica IN (0, 3)
        )
        INSERT INTO ' + @TempDerivados + ' (
            ID_Ejecucion, ID_Proceso, FechaReporte, FechaCartera,
            Portfolio, InvestID, Tipo_Derivado, LocalCurrency,
            BalanceSheet, Source, LocalPrice, Qty, AI, MVBook, TotalMVal, TotalMVal_Balance, MTM
        )
        SELECT
            @ID_Ejecucion,
            @ID_Proceso,
            FechaReporte,
            FechaReporte AS FechaCartera,
            Portfolio,
            InvestID,
            Tipo_Derivado,
            Code AS LocalCurrency,
            CASE WHEN TotalMVal >= 0 THEN ''Asset'' ELSE ''Liability'' END,
            ''DERIVADOS'',
            0 AS LocalPrice,
            Qty,
            0 AS AI,
            TotalMVal AS MVBook,
            TotalMVal,
            ISNULL(MTM, TotalMVal) AS TotalMVal_Balance,
            MTM
        FROM CTE_MTM
        WHERE EXISTS (
            SELECT 1 FROM dimensionales.HOMOL_Funds hf
            WHERE hf.Portfolio = CTE_MTM.Portfolio AND hf.Source = ''DERIVADOS'' AND hf.ID_Fund = @ID_Fund
        )';

        EXEC sp_executesql @SQL,
            N'@ID_Ejecucion BIGINT, @ID_Proceso BIGINT, @ID_Fund INT, @FechaReporte NVARCHAR(10)',
            @ID_Ejecucion, @ID_Proceso, @ID_Fund, @FechaReporte;

        SET @RowsProcessed = @@ROWCOUNT;

        IF @RowsProcessed = 0
        BEGIN
            PRINT 'sp_Process_Derivados: Sin datos de Derivados para el fondo';
            IF @TotalIPA_MTM != 0
                PRINT 'WARNING: Hay MTM en IPA pero no hay datos de Derivados';

            -- EVENTO: SP_FIN (WARNING - sin datos Derivados)
            EXEC broker.sp_EmitirEvento
                @TipoEvento = 'SP_FIN',
                @ID_Ejecucion = @ID_Ejecucion,
                @ID_Proceso = @ID_Proceso,
                @ID_Fund = @ID_Fund,
                @NombreSP = 'staging.sp_Process_Derivados',
                @CodigoRetorno = 1,
                @Detalles = 'WARNING: Sin datos de Derivados para el fondo';

            RETURN 1;  -- WARNING
        END

        PRINT 'sp_Process_Derivados: ' + CAST(@RowsProcessed AS NVARCHAR(10)) + ' registros Derivados cargados';

        -- ═══════════════════════════════════════════════════════════════════
        -- CHECKPOINT: ##Derivados_Work creada
        -- ═══════════════════════════════════════════════════════════════════
        DECLARE @ChkCreated NVARCHAR(500) = '{"operacion": "CREATED", "objeto": "' + @TempDerivados + '", "registros": ' + CAST(@RowsProcessed AS NVARCHAR(10)) + '}';
        EXEC broker.sp_EmitirEvento
            @TipoEvento = 'CHECKPOINT',
            @ID_Ejecucion = @ID_Ejecucion,
            @ID_Proceso = @ID_Proceso,
            @ID_Fund = @ID_Fund,
            @NombreSP = 'staging.sp_Process_Derivados',
            @Detalles = @ChkCreated;

        -- ═══════════════════════════════════════════════════════════════════
        -- PASO 4: Homologar instrumentos y monedas
        -- ═══════════════════════════════════════════════════════════════════

        EXEC @ReturnCode = staging.sp_Homologate
            @TempTableName = @TempDerivados,
            @Source = @Source,
            @ID_Ejecucion = @ID_Ejecucion,
            @ID_Proceso = @ID_Proceso,
            @ID_Fund = @ID_Fund,
            @FechaReporte = @FechaReporte,
            @InvestIDColumn = 'InvestID',
            @CurrencyColumn = 'LocalCurrency',
            @PortfolioColumn = 'Portfolio',
            @ProblemasFondo = @ProblemasFondo OUTPUT,
            @ProblemasInstrumento = @ProblemasInstrumento OUTPUT,
            @ProblemasMoneda = @ProblemasMoneda OUTPUT;

        IF @ReturnCode != 0
        BEGIN
            SET @ErrorCount = 1;

            -- ASSERTION_FAILED: La homologación debió pasar en sp_ValidateFund
            -- Si llegamos aquí con errores de homologación, es un BUG del sistema
            DECLARE @AssertMsgHomol NVARCHAR(500) = 'ASSERTION_FAILED: Homologación falló en sp_Process_Derivados pero sp_ValidateFund retornó 0. ' +
                                                     'Fondo:' + CAST(ISNULL(@ProblemasFondo,0) AS NVARCHAR) +
                                                     ' Instrumento:' + CAST(ISNULL(@ProblemasInstrumento,0) AS NVARCHAR) +
                                                     ' Moneda:' + CAST(ISNULL(@ProblemasMoneda,0) AS NVARCHAR);
            EXEC broker.sp_EmitirEvento
                @TipoEvento = 'ERROR',
                @ID_Ejecucion = @ID_Ejecucion,
                @ID_Proceso = @ID_Proceso,
                @ID_Fund = @ID_Fund,
                @NombreSP = 'staging.sp_Process_Derivados',
                @CodigoRetorno = 4,  -- ASSERTION_FAILED
                @Detalles = @AssertMsgHomol;

            RETURN 4;  -- ASSERTION_FAILED
        END

        -- Actualizar ID_Fund
        SET @SQL = N'UPDATE ' + @TempDerivados + ' SET ID_Fund = @ID_Fund';
        EXEC sp_executesql @SQL, N'@ID_Fund INT', @ID_Fund;

        -- ═══════════════════════════════════════════════════════════════════
        -- PASO 5: Calcular totales (descuadre ya validado en ValidateFund FASE 4)
        -- ═══════════════════════════════════════════════════════════════════

        SET @SQL = N'SELECT @Total = ISNULL(SUM(MTM), 0) FROM ' + @TempDerivados;
        EXEC sp_executesql @SQL, N'@Total DECIMAL(18,4) OUTPUT', @TotalDerivados_MTM OUTPUT;

        SET @DiferenciaDescuadre = @TotalIPA_MTM - @TotalDerivados_MTM;

        PRINT 'sp_Process_Derivados: Total Derivados MTM = ' + CAST(@TotalDerivados_MTM AS NVARCHAR(20));
        PRINT 'sp_Process_Derivados: Diferencia Descuadre = ' + CAST(@DiferenciaDescuadre AS NVARCHAR(20));

        -- NOTA: La validación de descuadre vs umbral fue movida a sp_ValidateFund FASE 4.
        -- Si llegamos aquí, ValidateFund ya validó que la diferencia está dentro del umbral.

        -- Crear ajuste de descuadre si hay diferencia (ya validada dentro del umbral)
        IF ABS(@DiferenciaDescuadre) > 0.01
        BEGIN
            EXEC staging.sp_CreateAdjustment
                @ID_Ejecucion = @ID_Ejecucion,
                @ID_Proceso = @ID_Proceso,
                @ID_Fund = @ID_Fund,
                @FechaReporte = @FechaReporte,
                @TipoAjuste = 'DERIVADOS',
                @id_CURR = @id_CURR_Fondo,
                @Diferencia = @DiferenciaDescuadre,
                @ValorOriginal = @TotalIPA_MTM,
                @ValorComparado = @TotalDerivados_MTM,
                @UmbralAplicado = @UmbralDescuadre,
                @TempTableAjustes = @TempAjustes,
                @AjusteCreado = @AjusteCreado OUTPUT;

            IF @AjusteCreado = 1 SET @AjustesCreados = @AjustesCreados + 1;
        END

        -- ═══════════════════════════════════════════════════════════════════
        -- PASO 6: Validar PARIDAD (MTM vs TotalMVal por moneda)
        -- ═══════════════════════════════════════════════════════════════════

        -- Crear ajustes de paridad para cada moneda con diferencia
        DECLARE @ParidadCursor CURSOR;
        DECLARE @MonedaParidad INT;
        DECLARE @SumMTM DECIMAL(18,4);
        DECLARE @SumTotalMVal DECIMAL(18,4);
        DECLARE @DiferenciaParidad DECIMAL(18,4);

        SET @SQL = N'
        DECLARE paridad_cursor CURSOR LOCAL FAST_FORWARD FOR
        SELECT
            id_CURR,
            SUM(ISNULL(MTM, 0)) AS SumMTM,
            SUM(ISNULL(TotalMVal, 0)) AS SumTotalMVal,
            SUM(ISNULL(MTM, 0)) - SUM(ISNULL(TotalMVal, 0)) AS Diferencia
        FROM ' + @TempDerivados + '
        GROUP BY id_CURR
        HAVING ABS(SUM(ISNULL(MTM, 0)) - SUM(ISNULL(TotalMVal, 0))) > @UmbralParidad;

        OPEN paridad_cursor;
        FETCH NEXT FROM paridad_cursor INTO @MonedaParidad, @SumMTM, @SumTotalMVal, @DiferenciaParidad;

        WHILE @@FETCH_STATUS = 0
        BEGIN
            EXEC staging.sp_CreateAdjustment
                @ID_Ejecucion = @ID_Ejecucion,
                @ID_Proceso = @ID_Proceso,
                @ID_Fund = @ID_Fund,
                @FechaReporte = @FechaReporte,
                @TipoAjuste = ''PARIDADES'',
                @id_CURR = @MonedaParidad,
                @Diferencia = @DiferenciaParidad,
                @ValorOriginal = @SumMTM,
                @ValorComparado = @SumTotalMVal,
                @UmbralAplicado = @UmbralParidad,
                @TempTableAjustes = @TempAjustes,
                @AjusteCreado = @AjusteCreado OUTPUT;

            IF @AjusteCreado = 1 SET @AjustesCreados = @AjustesCreados + 1;

            FETCH NEXT FROM paridad_cursor INTO @MonedaParidad, @SumMTM, @SumTotalMVal, @DiferenciaParidad;
        END

        CLOSE paridad_cursor;
        DEALLOCATE paridad_cursor;';

        EXEC sp_executesql @SQL,
            N'@ID_Ejecucion BIGINT, @ID_Proceso BIGINT, @ID_Fund INT, @FechaReporte NVARCHAR(10),
              @TempAjustes NVARCHAR(200), @UmbralParidad DECIMAL(18,4), @AjustesCreados INT OUTPUT, @AjusteCreado BIT OUTPUT',
            @ID_Ejecucion, @ID_Proceso, @ID_Fund, @FechaReporte,
            @TempAjustes, @UmbralParidad, @AjustesCreados OUTPUT, @AjusteCreado OUTPUT;

        -- ═══════════════════════════════════════════════════════════════════
        -- RESUMEN
        -- ═══════════════════════════════════════════════════════════════════

        DECLARE @DuracionMs INT = DATEDIFF(second, @StartTime, GETDATE()) * 1000;

        PRINT '========================================';
        PRINT 'sp_Process_Derivados COMPLETADO';
        PRINT 'Fondo: ' + CAST(@ID_Fund AS NVARCHAR(10));
        PRINT 'Registros Derivados: ' + CAST(@RowsProcessed AS NVARCHAR(10));
        PRINT 'Total IPA MTM: ' + CAST(@TotalIPA_MTM AS NVARCHAR(20));
        PRINT 'Total Derivados MTM: ' + CAST(@TotalDerivados_MTM AS NVARCHAR(20));
        PRINT 'Diferencia Descuadre: ' + CAST(@DiferenciaDescuadre AS NVARCHAR(20));
        PRINT 'Ajustes creados: ' + CAST(@AjustesCreados AS NVARCHAR(10));
        PRINT 'Tiempo: ' + CAST(@DuracionMs AS NVARCHAR(10)) + ' ms';
        PRINT '========================================';

        -- ═══════════════════════════════════════════════════════════════════
        -- EVENTO: SP_FIN (Exitoso)
        -- ═══════════════════════════════════════════════════════════════════
        EXEC broker.sp_EmitirEvento
            @TipoEvento = 'SP_FIN',
            @ID_Ejecucion = @ID_Ejecucion,
            @ID_Proceso = @ID_Proceso,
            @ID_Fund = @ID_Fund,
            @NombreSP = 'staging.sp_Process_Derivados',
            @CodigoRetorno = 0,
            @DuracionMs = @DuracionMs,
            @RowsProcessed = @RowsProcessed;

        RETURN 0;  -- OK

    END TRY
    BEGIN CATCH
        SET @ErrorCount = 1;

        -- EVENTO: ERROR
        DECLARE @ErrorMsg NVARCHAR(4000) = ERROR_MESSAGE();
        EXEC broker.sp_EmitirEvento
            @TipoEvento = 'ERROR',
            @ID_Ejecucion = @ID_Ejecucion,
            @ID_Proceso = @ID_Proceso,
            @ID_Fund = @ID_Fund,
            @NombreSP = 'staging.sp_Process_Derivados',
            @CodigoRetorno = 3,
            @Detalles = @ErrorMsg;

        EXEC staging.sp_HandleError
            @ProcName = 'sp_Process_Derivados',
            @ID_Ejecucion = @ID_Ejecucion,
            @ID_Proceso = @ID_Proceso,
            @ID_Fund = @ID_Fund,
            @TempTablesToClean = @TempDerivados,
            @ReturnCode = @ReturnCode OUTPUT,
            @ErrorMessage = @ErrorMessage OUTPUT;

        RETURN @ReturnCode;
    END CATCH
END;
GO
