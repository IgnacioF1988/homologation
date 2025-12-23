-- ============================================
-- Migration 002: UPDATE SPs FOR STAND-BY DETECTION
-- ============================================
-- Descripción: Modifica SPs v2 para detectar problemas y registrar stand-by
--
-- Códigos de retorno actualizados:
--   0 = Éxito / Skip válido
--   2 = Retry (deadlock/timeout)
--   3 = Error crítico (detiene fondo, registra en Fondos_Problema)
--   5 = Stand-by SUCIEDADES (pausa antes CAPM)
--   6 = Stand-by HOMOLOGACION (pausa inmediato)
--   7 = Stand-by DESCUADRES-CAPM (pausa antes PNL)
--   8 = Stand-by DESCUADRES-GENERAL (pausa post-proceso)
--
-- SPs modificados:
--   - IPA_04_TratamientoSuciedades_v2
--   - IPA_02_AjusteSONA_v2
--   - IPA_06_CrearDimensiones_v2
--   - IPA_07_AgruparRegistros_v2
--   - CAPM_01_Ajuste_CAPM_v2
--   - CAPM_02_Extract_Transform_v2
--   - CAPM_03_Carga_Final_v2
--   - (Adicionales: PNL_01, PNL_02, DERIV_02, DERIV_03, UBS_01)
--
-- Fecha: 2025-01-XX
-- Autor: Migration System
-- ============================================

USE [Inteligencia_Producto_Dev];
GO

PRINT '============================================';
PRINT 'MIGRATION 002: ACTUALIZACIÓN DE SPs';
PRINT '============================================';
PRINT '';

-- ============================================
-- TEMPLATE: Código de registro stand-by reutilizable
-- ============================================
-- Este código se usa en múltiples SPs para registrar stand-by
-- Ejemplo de uso al final de cada SP que detecta problemas
/*
TEMPLATE CODE:

-- Detectar problema
DECLARE @CantidadProblemas INT = ...;

IF @CantidadProblemas > 0
BEGIN
    -- Insertar en cola sandbox correspondiente
    INSERT INTO sandbox.colaAlertasXXX (...) VALUES (...);

    -- Registrar stand-by
    INSERT INTO logs.FondosEnStandBy (
        ID_Ejecucion, ID_Fund, TipoProblema, MotivoDetallado,
        PuntoBloqueo, ServicioSiguiente, CantidadProblemas, TablaColaReferencia
    )
    VALUES (
        @ID_Ejecucion, @ID_Fund, 'TIPO_PROBLEMA',
        CONCAT('Descripción detallada: ', @CantidadProblemas, ' items'),
        'PUNTO_BLOQUEO', 'SERVICIO_SIGUIENTE', @CantidadProblemas,
        'sandbox.colaAlertasXXX'
    );

    -- Actualizar flags en Ejecucion_Fondos
    UPDATE logs.Ejecucion_Fondos
    SET EstadoStandBy = 'PAUSADO',
        TieneSuciedades = 1,  -- o TieneProblemasHomologacion, TieneDescuadres según caso
        PuntoBloqueoActual = 'PUNTO_BLOQUEO',
        FechaUltimoPause = GETDATE(),
        ContadorPauses = ISNULL(ContadorPauses, 0) + 1
    WHERE ID_Ejecucion = @ID_Ejecucion AND ID_Fund = @ID_Fund;

    RETURN 5; -- o 6, 7, 8 según tipo de stand-by
END
*/

-- ============================================
-- SP 1: IPA_04_TratamientoSuciedades_v2
-- CÓDIGO 5: Stand-by SUCIEDADES
-- ============================================

PRINT 'Modificando IPA_04_TratamientoSuciedades_v2...';

-- Nota: Esta modificación se agrega AL FINAL del SP existente
-- Buscar la línea "RETURN 0;" y reemplazar con el siguiente código:

/*
ALTER PROCEDURE staging.IPA_04_TratamientoSuciedades_v2
    @ID_Ejecucion BIGINT,
    @FechaReporte NVARCHAR(10),
    @ID_Fund INT,
    @Portfolio_Geneva NVARCHAR(50)
AS
BEGIN
    SET NOCOUNT ON;

    -- [... código existente del SP ...]

    -- *** CAMBIO: Detectar suciedades y registrar stand-by ***
    DECLARE @CantidadSuciedades INT;

    SELECT @CantidadSuciedades = COUNT(*)
    FROM staging.IPA_WorkTable
    WHERE ID_Ejecucion = @ID_Ejecucion
      AND ID_Fund = @ID_Fund
      AND [CXC/CXP?] IS NOT NULL;

    IF @CantidadSuciedades > 0
    BEGIN
        -- Insertar en cola de suciedades
        INSERT INTO sandbox.colaAlertasSuciedades (
            investId, portfolio, qty, fechaReporte, estado,
            fechaIngreso, ID_Ejecucion, ID_Fund
        )
        SELECT InvestID, Portfolio, Qty, @FechaReporte, 'pendiente',
               GETDATE(), @ID_Ejecucion, @ID_Fund
        FROM staging.IPA_WorkTable
        WHERE ID_Ejecucion = @ID_Ejecucion
          AND ID_Fund = @ID_Fund
          AND [CXC/CXP?] IS NOT NULL;

        -- Registrar stand-by
        INSERT INTO logs.FondosEnStandBy (
            ID_Ejecucion, ID_Fund, TipoProblema, MotivoDetallado,
            PuntoBloqueo, ServicioSiguiente, CantidadProblemas, TablaColaReferencia
        )
        VALUES (
            @ID_Ejecucion, @ID_Fund, 'SUCIEDADES',
            CONCAT('Detectadas ', @CantidadSuciedades, ' posiciones con [CXC/CXP?]'),
            'ANTES_CAPM', 'PROCESS_CAPM', @CantidadSuciedades,
            'sandbox.colaAlertasSuciedades'
        );

        -- Actualizar flags en Ejecucion_Fondos
        UPDATE logs.Ejecucion_Fondos
        SET EstadoStandBy = 'PAUSADO',
            TieneSuciedades = 1,
            PuntoBloqueoActual = 'ANTES_CAPM',
            FechaUltimoPause = GETDATE(),
            ContadorPauses = ISNULL(ContadorPauses, 0) + 1
        WHERE ID_Ejecucion = @ID_Ejecucion AND ID_Fund = @ID_Fund;

        RETURN 5; -- Código stand-by SUCIEDADES
    END

    RETURN 0; -- Éxito sin problemas
END
*/

PRINT '  - IPA_04: Código 5 para suciedades detectadas';

-- ============================================
-- SP 2: IPA_02_AjusteSONA_v2
-- MÚLTIPLES CÓDIGOS: 3 (sin datos SONA), 6 (homologación), 7 (descuadre)
-- ============================================

PRINT 'Modificando IPA_02_AjusteSONA_v2...';

/*
ALTER PROCEDURE staging.IPA_02_AjusteSONA_v2
    @ID_Ejecucion BIGINT,
    @FechaReporte NVARCHAR(10),
    @ID_Fund INT,
    @Portfolio_Geneva NVARCHAR(50)
AS
BEGIN
    SET NOCOUNT ON;

    -- Variables existentes
    DECLARE @RegistrosSONA INT;
    DECLARE @ErrorCount INT = 0;
    DECLARE @RowsProcessed INT = 0;

    -- *** CAMBIO 1: Sin datos SONA → Código 3 (Error Crítico) ***
    SELECT @RegistrosSONA = COUNT(*)
    FROM extract.SONA WHERE Portfolio = @Portfolio_Geneva;

    IF @RegistrosSONA = 0
    BEGIN
        SET @ErrorCount = 1;

        -- NUEVO: Registrar en Fondos_Problema
        INSERT INTO sandbox.Fondos_Problema (FechaReporte, ID_Fund, Proceso, Tipo_Problema, FechaProceso)
        VALUES (@FechaReporte, @ID_Fund, 'IPA_02', 'Fondo sin datos en extract.SONA', CONVERT(NVARCHAR, GETDATE(), 120));

        RETURN 3; -- ERROR CRÍTICO (antes era código 1)
    END

    -- [... código de procesamiento existente ...]

    -- *** CAMBIO 2: Homologación de instrumento ADJ SONA-IPA → Código 6 ***
    -- Ubicación: Después de crear instrumento sintético ADJ SONA-IPA

    DECLARE @ID_Instrumento INT;

    SELECT @ID_Instrumento = ID_Instrumento
    FROM dimensionales.HOMOL_Instrumentos
    WHERE Codigo = 'ADJ SONA-IPA' AND Fuente = 'IPA';

    IF @ID_Instrumento IS NULL
    BEGIN
        -- Insertar en cola de homologación
        INSERT INTO sandbox.Homologacion_Instrumentos (
            Codigo, Fuente, FechaReporte, ID_Ejecucion, ID_Fund, Estado
        )
        VALUES (
            'ADJ SONA-IPA', 'IPA', @FechaReporte, @ID_Ejecucion, @ID_Fund, 'pendiente'
        );

        -- Registrar stand-by
        INSERT INTO logs.FondosEnStandBy (
            ID_Ejecucion, ID_Fund, TipoProblema, MotivoDetallado,
            PuntoBloqueo, ServicioSiguiente, CantidadProblemas, TablaColaReferencia
        )
        VALUES (
            @ID_Ejecucion, @ID_Fund, 'HOMOLOGACION',
            'Instrumento ADJ SONA-IPA sin homologar',
            'MID_IPA', NULL, 1, 'sandbox.Homologacion_Instrumentos'
        );

        UPDATE logs.Ejecucion_Fondos
        SET EstadoStandBy = 'PAUSADO',
            TieneProblemasHomologacion = 1,
            PuntoBloqueoActual = 'MID_IPA',
            FechaUltimoPause = GETDATE(),
            ContadorPauses = ISNULL(ContadorPauses, 0) + 1
        WHERE ID_Ejecucion = @ID_Ejecucion AND ID_Fund = @ID_Fund;

        RETURN 6; -- STAND-BY HOMOLOGACION (antes era código 1)
    END

    -- *** CAMBIO 3: Homologación de moneda → Código 6 ***
    -- Similar al anterior, para monedas

    DECLARE @id_CURR INT;

    SELECT @id_CURR = ID_Moneda
    FROM dimensionales.HOMOL_Monedas
    WHERE Codigo = @SonaCurrency AND Fuente = 'SONA';

    IF @id_CURR IS NULL
    BEGIN
        -- Insertar en cola de homologación
        INSERT INTO sandbox.Homologacion_Monedas (
            Codigo, Fuente, FechaReporte, ID_Ejecucion, ID_Fund, Estado
        )
        VALUES (
            @SonaCurrency, 'SONA', @FechaReporte, @ID_Ejecucion, @ID_Fund, 'pendiente'
        );

        -- Registrar stand-by
        INSERT INTO logs.FondosEnStandBy (
            ID_Ejecucion, ID_Fund, TipoProblema, MotivoDetallado,
            PuntoBloqueo, ServicioSiguiente, CantidadProblemas, TablaColaReferencia
        )
        VALUES (
            @ID_Ejecucion, @ID_Fund, 'HOMOLOGACION',
            CONCAT('Moneda sin homologar: ', @SonaCurrency),
            'MID_IPA', NULL, 1, 'sandbox.Homologacion_Monedas'
        );

        UPDATE logs.Ejecucion_Fondos
        SET EstadoStandBy = 'PAUSADO',
            TieneProblemasHomologacion = 1,
            PuntoBloqueoActual = 'MID_IPA',
            FechaUltimoPause = GETDATE(),
            ContadorPauses = ISNULL(ContadorPauses, 0) + 1
        WHERE ID_Ejecucion = @ID_Ejecucion AND ID_Fund = @ID_Fund;

        RETURN 6; -- STAND-BY HOMOLOGACION
    END

    -- *** CAMBIO 4: NUEVO - Validar descuadre IPA-SONA → Código 7 ***
    -- Ubicación: Al final del SP, después de procesamiento

    DECLARE @DiferenciaSONA DECIMAL(18,2);
    DECLARE @TotalIPA DECIMAL(18,2);
    DECLARE @TotalSONA DECIMAL(18,2);

    -- Calcular diferencia
    SELECT @TotalIPA = SUM(ISNULL(MVBook, 0))
    FROM staging.IPA_WorkTable
    WHERE ID_Ejecucion = @ID_Ejecucion AND ID_Fund = @ID_Fund;

    SELECT @TotalSONA = SUM(ISNULL(Qty, 0))
    FROM extract.SONA
    WHERE Portfolio = @Portfolio_Geneva;

    SET @DiferenciaSONA = ABS(ISNULL(@TotalIPA, 0) - ISNULL(@TotalSONA, 0));

    -- Umbral: $0.01
    IF @DiferenciaSONA >= 0.01
    BEGIN
        -- Insertar en cola de descuadres
        INSERT INTO sandbox.colaAlertasDescuadre (
            tipoDescuadre, portfolio, mvBookIPA, qtySona,
            diferencia, fechaReporte, estado, ID_Ejecucion, ID_Fund, fechaIngreso
        )
        VALUES (
            'IPA-SONA', @Portfolio_Geneva, @TotalIPA, @TotalSONA,
            @DiferenciaSONA, @FechaReporte, 'pendiente', @ID_Ejecucion, @ID_Fund, GETDATE()
        );

        -- Registrar stand-by
        INSERT INTO logs.FondosEnStandBy (
            ID_Ejecucion, ID_Fund, TipoProblema, MotivoDetallado,
            PuntoBloqueo, ServicioSiguiente, CantidadProblemas, TablaColaReferencia
        )
        VALUES (
            @ID_Ejecucion, @ID_Fund, 'DESCUADRES',
            CONCAT('Diferencia IPA-SONA: $', CAST(@DiferenciaSONA AS NVARCHAR(20))),
            'ANTES_CAPM', 'PROCESS_CAPM', 1, 'sandbox.colaAlertasDescuadre'
        );

        UPDATE logs.Ejecucion_Fondos
        SET EstadoStandBy = 'PAUSADO',
            TieneDescuadres = 1,
            PuntoBloqueoActual = 'ANTES_CAPM',
            FechaUltimoPause = GETDATE(),
            ContadorPauses = ISNULL(ContadorPauses, 0) + 1
        WHERE ID_Ejecucion = @ID_Ejecucion AND ID_Fund = @ID_Fund;

        RETURN 7; -- STAND-BY DESCUADRES-CAPM
    END

    -- Éxito
    RETURN 0;
END
*/

PRINT '  - IPA_02: Código 3 (sin SONA), 6 (homolog), 7 (descuadre)';

-- ============================================
-- SP 3: IPA_06_CrearDimensiones_v2
-- CÓDIGO 6: Stand-by HOMOLOGACION (Instrumentos)
-- ============================================

PRINT 'Modificando IPA_06_CrearDimensiones_v2...';

/*
ALTER PROCEDURE staging.IPA_06_CrearDimensiones_v2
    @ID_Ejecucion BIGINT,
    @FechaReporte NVARCHAR(10),
    @ID_Fund INT,
    @Portfolio_Geneva NVARCHAR(50)
AS
BEGIN
    SET NOCOUNT ON;

    -- [... código existente de homologación de instrumentos ...]

    -- *** CAMBIO: Instrumentos sin homologar → Código 6 (antes código 1) ***
    DECLARE @InstrumentosSinHomologar INT;

    -- Contar instrumentos sin homologar
    SELECT @InstrumentosSinHomologar = COUNT(*)
    FROM staging.IPA_WorkTable
    WHERE ID_Ejecucion = @ID_Ejecucion
      AND ID_Fund = @ID_Fund
      AND ID_Instrumento IS NULL;

    IF @InstrumentosSinHomologar > 0
    BEGIN
        -- Insertar en cola pendiente
        INSERT INTO sandbox.colaPendientes (
            investId, portfolio, qty, fechaReporte, estado,
            fechaIngreso, ID_Ejecucion, ID_Fund
        )
        SELECT InvestID, Portfolio, Qty, @FechaReporte, 'pendiente',
               GETDATE(), @ID_Ejecucion, @ID_Fund
        FROM staging.IPA_WorkTable
        WHERE ID_Ejecucion = @ID_Ejecucion
          AND ID_Fund = @ID_Fund
          AND ID_Instrumento IS NULL;

        -- Registrar stand-by
        INSERT INTO logs.FondosEnStandBy (
            ID_Ejecucion, ID_Fund, TipoProblema, MotivoDetallado,
            PuntoBloqueo, ServicioSiguiente, CantidadProblemas, TablaColaReferencia
        )
        VALUES (
            @ID_Ejecucion, @ID_Fund, 'HOMOLOGACION',
            CONCAT(@InstrumentosSinHomologar, ' instrumentos sin homologar'),
            'MID_IPA', NULL, @InstrumentosSinHomologar, 'sandbox.colaPendientes'
        );

        UPDATE logs.Ejecucion_Fondos
        SET EstadoStandBy = 'PAUSADO',
            TieneProblemasHomologacion = 1,
            PuntoBloqueoActual = 'MID_IPA',
            FechaUltimoPause = GETDATE(),
            ContadorPauses = ISNULL(ContadorPauses, 0) + 1
        WHERE ID_Ejecucion = @ID_Ejecucion AND ID_Fund = @ID_Fund;

        RETURN 6; -- STAND-BY HOMOLOGACION (antes era código 1)
    END

    RETURN 0;
END
*/

PRINT '  - IPA_06: Código 6 para instrumentos sin homologar';

-- ============================================
-- SP 4: IPA_07_AgruparRegistros_v2
-- CÓDIGO 3: Error crítico (sin registros)
-- ============================================

PRINT 'Modificando IPA_07_AgruparRegistros_v2...';

/*
ALTER PROCEDURE staging.IPA_07_AgruparRegistros_v2
    @ID_Ejecucion BIGINT,
    @FechaReporte NVARCHAR(10),
    @ID_Fund INT,
    @Portfolio_Geneva NVARCHAR(50)
AS
BEGIN
    SET NOCOUNT ON;

    -- [... código existente de agrupación ...]

    DECLARE @RowsProcessed INT;
    SET @RowsProcessed = @@ROWCOUNT;

    -- *** CAMBIO: Sin registros → Código 3 (Error Crítico, antes código 1) ***
    IF @RowsProcessed = 0
    BEGIN
        -- Registrar en Fondos_Problema
        INSERT INTO sandbox.Fondos_Problema (FechaReporte, ID_Fund, Proceso, Tipo_Problema, FechaProceso)
        VALUES (@FechaReporte, @ID_Fund, 'IPA_07',
                'Sin registros después de agrupar (todos < $0.01)',
                CONVERT(NVARCHAR, GETDATE(), 120));

        RETURN 3; -- ERROR CRÍTICO (antes era código 1)
    END

    RETURN 0;
END
*/

PRINT '  - IPA_07: Código 3 para sin registros';

-- ============================================
-- SP 5: CAPM_01_Ajuste_CAPM_v2
-- CÓDIGO 7: Stand-by DESCUADRES-CAPM
-- ============================================

PRINT 'Modificando CAPM_01_Ajuste_CAPM_v2...';

/*
ALTER PROCEDURE staging.CAPM_01_Ajuste_CAPM_v2
    @ID_Ejecucion BIGINT,
    @FechaReporte NVARCHAR(10),
    @ID_Fund INT,
    @Portfolio_Geneva NVARCHAR(50)
AS
BEGIN
    SET NOCOUNT ON;

    -- [... código existente de ajuste CAPM ...]

    -- *** CAMBIO: NUEVO - Validar descuadre IPA-CAPM → Código 7 ***
    DECLARE @DiferenciaCAPM DECIMAL(18,2);
    DECLARE @TotalIPA DECIMAL(18,2);
    DECLARE @TotalCAPM DECIMAL(18,2);

    -- Calcular totales
    SELECT @TotalIPA = SUM(ISNULL(MVBook, 0))
    FROM staging.IPA_Cash
    WHERE ID_Ejecucion = @ID_Ejecucion AND ID_Fund = @ID_Fund;

    SELECT @TotalCAPM = SUM(ISNULL(TotalMVal, 0))
    FROM extract.CAPM
    WHERE Portfolio = @Portfolio_Geneva AND FechaReporte = @FechaReporte;

    SET @DiferenciaCAPM = ABS(ISNULL(@TotalIPA, 0) - ISNULL(@TotalCAPM, 0));

    -- Umbral: $0.01
    IF @DiferenciaCAPM >= 0.01
    BEGIN
        -- Insertar en cola de descuadres
        INSERT INTO sandbox.colaAlertasDescuadre (
            tipoDescuadre, portfolio, mvBookIPA, totalMValCAPM,
            diferencia, fechaReporte, estado, ID_Ejecucion, ID_Fund, fechaIngreso
        )
        VALUES (
            'IPA-CAPM', @Portfolio_Geneva, @TotalIPA, @TotalCAPM,
            @DiferenciaCAPM, @FechaReporte, 'pendiente', @ID_Ejecucion, @ID_Fund, GETDATE()
        );

        -- Registrar stand-by
        INSERT INTO logs.FondosEnStandBy (
            ID_Ejecucion, ID_Fund, TipoProblema, MotivoDetallado,
            PuntoBloqueo, ServicioSiguiente, CantidadProblemas, TablaColaReferencia
        )
        VALUES (
            @ID_Ejecucion, @ID_Fund, 'DESCUADRES',
            CONCAT('Diferencia IPA-CAPM: $', CAST(@DiferenciaCAPM AS NVARCHAR(20))),
            'ANTES_PNL', 'PROCESS_PNL', 1, 'sandbox.colaAlertasDescuadre'
        );

        UPDATE logs.Ejecucion_Fondos
        SET EstadoStandBy = 'PAUSADO',
            TieneDescuadres = 1,
            PuntoBloqueoActual = 'ANTES_PNL',
            FechaUltimoPause = GETDATE(),
            ContadorPauses = ISNULL(ContadorPauses, 0) + 1
        WHERE ID_Ejecucion = @ID_Ejecucion AND ID_Fund = @ID_Fund;

        RETURN 7; -- STAND-BY DESCUADRES-CAPM
    END

    RETURN 0;
END
*/

PRINT '  - CAPM_01: Código 7 para descuadre IPA-CAPM';

-- ============================================
-- SP 6: CAPM_02_Extract_Transform_v2
-- CÓDIGO 6: Stand-by HOMOLOGACION (Fondos)
-- ============================================

PRINT 'Modificando CAPM_02_Extract_Transform_v2...';

/*
ALTER PROCEDURE staging.CAPM_02_Extract_Transform_v2
    @ID_Ejecucion BIGINT,
    @FechaReporte NVARCHAR(10),
    @ID_Fund INT,
    @Portfolio_Geneva NVARCHAR(50)
AS
BEGIN
    SET NOCOUNT ON;

    -- [... código existente ...]

    -- *** CAMBIO: Fondo sin homologar → Código 6 (Stand-by, antes código 3) ***
    DECLARE @ProblemasHomologacion INT;

    -- Verificar homologación del fondo
    IF NOT EXISTS (
        SELECT 1 FROM dimensionales.HOMOL_Funds
        WHERE Codigo = @Portfolio_Geneva AND Fuente = 'CASH APPRAISAL'
    )
    BEGIN
        SET @ProblemasHomologacion = 1;

        -- Insertar en cola de homologación de fondos
        INSERT INTO sandbox.Homologacion_Fondos (
            Portfolio, Fuente, FechaReporte, ID_Ejecucion, ID_Fund, Estado
        )
        VALUES (
            @Portfolio_Geneva, 'CASH APPRAISAL', @FechaReporte, @ID_Ejecucion, @ID_Fund, 'pendiente'
        );

        -- Registrar stand-by
        INSERT INTO logs.FondosEnStandBy (
            ID_Ejecucion, ID_Fund, TipoProblema, MotivoDetallado,
            PuntoBloqueo, ServicioSiguiente, CantidadProblemas, TablaColaReferencia
        )
        VALUES (
            @ID_Ejecucion, @ID_Fund, 'HOMOLOGACION',
            'Fondo sin homologación en CASH APPRAISAL',
            'MID_CAPM', NULL, 1, 'sandbox.Homologacion_Fondos'
        );

        UPDATE logs.Ejecucion_Fondos
        SET EstadoStandBy = 'PAUSADO',
            TieneProblemasHomologacion = 1,
            PuntoBloqueoActual = 'MID_CAPM',
            FechaUltimoPause = GETDATE(),
            ContadorPauses = ISNULL(ContadorPauses, 0) + 1
        WHERE ID_Ejecucion = @ID_Ejecucion AND ID_Fund = @ID_Fund;

        RETURN 6; -- STAND-BY HOMOLOGACION (antes era código 3)
    END

    RETURN 0;
END
*/

PRINT '  - CAPM_02: Código 6 para fondo sin homologar';

-- ============================================
-- SP 7: CAPM_03_Carga_Final_v2
-- CÓDIGO 7: Stand-by DESCUADRES-CAPM (Consolidación)
-- ============================================

PRINT 'Modificando CAPM_03_Carga_Final_v2...';

/*
ALTER PROCEDURE staging.CAPM_03_Carga_Final_v2
    @ID_Ejecucion BIGINT,
    @FechaReporte NVARCHAR(10)
AS
BEGIN
    SET NOCOUNT ON;

    -- [... código existente de consolidación ...]

    -- *** CAMBIO: Descuadre en consolidación → Código 7 (Stand-by, antes código 1) ***
    DECLARE @SumaTotalMValOrigen DECIMAL(18,2);
    DECLARE @SumaTotalMValFinal DECIMAL(18,2);
    DECLARE @ErrorCount INT = 0;

    -- Validar diferencia
    IF ABS(ISNULL(@SumaTotalMValOrigen, 0) - ISNULL(@SumaTotalMValFinal, 0)) > 0.01
    BEGIN
        SET @ErrorCount = 1;

        -- Insertar en cola de descuadres
        INSERT INTO sandbox.colaAlertasDescuadre (
            tipoDescuadre, portfolio, totalMValAntes, totalMValDespues,
            diferencia, fechaReporte, estado, ID_Ejecucion, fechaIngreso
        )
        VALUES (
            'CAPM-CONSOLIDACION', 'TODOS', @SumaTotalMValOrigen, @SumaTotalMValFinal,
            ABS(@SumaTotalMValOrigen - @SumaTotalMValFinal),
            @FechaReporte, 'pendiente', @ID_Ejecucion, GETDATE()
        );

        -- Registrar stand-by (nota: afecta a TODOS los fondos)
        -- Este es un caso especial - consolidación global
        INSERT INTO logs.FondosEnStandBy (
            ID_Ejecucion, ID_Fund, TipoProblema, MotivoDetallado,
            PuntoBloqueo, ServicioSiguiente, CantidadProblemas, TablaColaReferencia
        )
        SELECT
            @ID_Ejecucion, ID_Fund, 'DESCUADRES',
            'Diferencia en consolidación CAPM (posible pérdida de datos)',
            'ANTES_PNL', 'PROCESS_PNL', 1, 'sandbox.colaAlertasDescuadre'
        FROM logs.Ejecucion_Fondos
        WHERE ID_Ejecucion = @ID_Ejecucion
          AND Estado_Process_CAPM = 'OK';  -- Solo fondos que pasaron CAPM

        -- Actualizar flags
        UPDATE logs.Ejecucion_Fondos
        SET EstadoStandBy = 'PAUSADO',
            TieneDescuadres = 1,
            PuntoBloqueoActual = 'ANTES_PNL',
            FechaUltimoPause = GETDATE(),
            ContadorPauses = ISNULL(ContadorPauses, 0) + 1
        WHERE ID_Ejecucion = @ID_Ejecucion
          AND Estado_Process_CAPM = 'OK';

        DROP TABLE IF EXISTS #ConsolidadoCAPM;
        RETURN 7; -- STAND-BY DESCUADRES-CAPM (antes era código 1)
    END

    RETURN 0;
END
*/

PRINT '  - CAPM_03: Código 7 para descuadre consolidación';

-- ============================================
-- RESUMEN DE CAMBIOS ADICIONALES (No incluidos en detalle)
-- ============================================

PRINT '';
PRINT 'CAMBIOS ADICIONALES REQUERIDOS (implementar manualmente):';
PRINT '  - PNL_01_Dimensiones_v2: Validar Flag_Activo, código 3 o 6';
PRINT '  - PNL_02_Ajuste_v2: NUEVO validación transferencia, código 8';
PRINT '  - PNL_03, PNL_04, PNL_05: Código 3 para sin datos';
PRINT '  - DERIV_02_Homologar_Dimensiones_v2: Validar Flag_Derivados, códigos 0/3/6';
PRINT '  - DERIV_03_Ajuste_Derivados_v2: NUEVO validación descuadre, código 8';
PRINT '  - UBS_01_Tratamiento_Fondos_Luxemburgo_v2: Validar Flag_UBS + TotalMVal → 3';
PRINT '  - UBS_02, UBS_03: Validar Flag_UBS';

-- ============================================
-- INSTRUCCIONES DE IMPLEMENTACIÓN
-- ============================================

PRINT '';
PRINT '============================================';
PRINT 'INSTRUCCIONES DE IMPLEMENTACIÓN';
PRINT '============================================';
PRINT '';
PRINT '1. Este script contiene EJEMPLOS de las modificaciones requeridas';
PRINT '2. Cada SP debe ser modificado MANUALMENTE usando el patrón mostrado';
PRINT '3. Los cambios están comentados (/* ... */) para evitar ejecución directa';
PRINT '4. Pasos para cada SP:';
PRINT '   a. Leer el código de ejemplo completo';
PRINT '   b. Ubicar la sección del SP existente que requiere modificación';
PRINT '   c. Aplicar el patrón de registro stand-by correspondiente';
PRINT '   d. Probar con un fondo de prueba';
PRINT '   e. Validar que se registre correctamente en logs.FondosEnStandBy';
PRINT '';
PRINT '5. CRÍTICO: Validar flags (Activo_MantenerFondos, Flag_Derivados, Flag_UBS)';
PRINT '   ANTES de retornar código 3 por "sin datos"';
PRINT '';
PRINT '6. Orden de implementación recomendado:';
PRINT '   Semana 3: IPA_04, IPA_02, IPA_06, IPA_07, CAPM_01, CAPM_02, CAPM_03';
PRINT '   Semana 4: PNL_01, PNL_02, PNL_03, PNL_04, PNL_05';
PRINT '   Semana 5: DERIV_02, DERIV_03, UBS_01, UBS_02, UBS_03';
PRINT '';
PRINT '============================================';
PRINT 'MIGRATION 002: TEMPLATE COMPLETADO';
PRINT '============================================';
PRINT '';
PRINT 'Nota: Este es un TEMPLATE con ejemplos. Los SPs deben modificarse manualmente';
PRINT 'siguiendo los patrones mostrados.';
GO
