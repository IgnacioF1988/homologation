/*
================================================================================
SP: staging.sp_ValidateFund
Descripcion: Validacion inicial del fondo ANTES de procesar.
             Retorna codigo de error para que el backend descarte fondos problematicos.

Validaciones:
  1. Parametros basicos (ID_Ejecucion, ID_Fund, FechaReporte)
  2. Fondo existe en dimensionales
  3. Reportes OBLIGATORIOS existen en extract.* (segun config.Requisitos_Extract)
  4. Suciedades (Qty cercano a 0)
  5. Homologacion de Instrumentos
  6. Homologacion de Monedas

Codigos de retorno:
  0  = OK - Continua pipeline
  1  = WARNING - Continua (tratado como OK)
  3  = ERROR_CRITICO - Falla inmediata
  5  = SUCIEDADES - Stand-by
  6  = HOMOLOGACION_INSTRUMENTOS - Stand-by
  10 = HOMOLOGACION_FONDOS - Stand-by
  11 = HOMOLOGACION_MONEDAS - Stand-by
  12 = HOMOLOGACION_BENCHMARKS - Stand-by
  -- Codigos de extraccion faltante (reporte OBLIGATORIO no disponible):
  13 = EXTRACT_IPA_FALTANTE - Stand-by
  14 = EXTRACT_CAPM_FALTANTE - Stand-by
  15 = EXTRACT_SONA_FALTANTE - Stand-by
  16 = EXTRACT_PNL_FALTANTE - Stand-by
  17 = EXTRACT_DERIVADOS_FALTANTE - Stand-by

Autor: Refactorizacion Pipeline IPA
Fecha: 2026-01-02
================================================================================
*/

CREATE OR ALTER PROCEDURE [staging].[sp_ValidateFund]
    @ID_Ejecucion BIGINT,
    @ID_Proceso BIGINT,
    @ID_Fund INT,
    @FechaReporte NVARCHAR(10),
    @Source NVARCHAR(50) = 'GENEVA',
    -- Outputs
    @ErrorMessage NVARCHAR(500) OUTPUT,
    @RegistrosIPA INT OUTPUT,
    @RegistrosCAPM INT OUTPUT,
    @RegistrosSONA INT OUTPUT,
    @RegistrosPNL INT OUTPUT,
    @RegistrosDerivados INT OUTPUT,
    @SuciedadesCount INT OUTPUT,
    @HomolFondosCount INT OUTPUT,
    @HomolInstrumentosCount INT OUTPUT,
    @HomolMonedasCount INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    -- Inicializar outputs
    SET @ErrorMessage = NULL;
    SET @RegistrosIPA = 0;
    SET @RegistrosCAPM = 0;
    SET @RegistrosSONA = 0;
    SET @RegistrosPNL = 0;
    SET @RegistrosDerivados = 0;
    SET @SuciedadesCount = 0;
    SET @HomolFondosCount = 0;
    SET @HomolInstrumentosCount = 0;
    SET @HomolMonedasCount = 0;

    DECLARE @ReturnCode INT = 0;
    DECLARE @Portfolio NVARCHAR(100);
    DECLARE @PortfolioDerivados NVARCHAR(100);
    DECLARE @UmbralSuciedad DECIMAL(18,4) = 0.01;
    DECLARE @WarningMessage NVARCHAR(500) = '';

    -- Variables para requisitos (desde config)
    DECLARE @Req_IPA BIT, @Req_CAPM BIT, @Req_SONA BIT;
    DECLARE @Req_PNL BIT, @Req_Derivados BIT, @Req_PosModRF BIT;
    DECLARE @UsaDefault BIT;

    BEGIN TRY
        -- =====================================================================
        -- VALIDACION 1: Parametros basicos
        -- =====================================================================

        IF @ID_Ejecucion IS NULL OR @ID_Ejecucion <= 0
        BEGIN
            SET @ErrorMessage = 'ID_Ejecucion invalido';
            RETURN 3;
        END

        IF @ID_Fund IS NULL OR @ID_Fund <= 0
        BEGIN
            SET @ErrorMessage = 'ID_Fund invalido';
            RETURN 3;
        END

        IF @FechaReporte IS NULL OR LEN(RTRIM(@FechaReporte)) = 0
        BEGIN
            SET @ErrorMessage = 'FechaReporte obligatorio';
            RETURN 3;
        END

        -- =====================================================================
        -- VALIDACION 2: Fondo existe en dimensionales
        -- =====================================================================

        IF NOT EXISTS (SELECT 1 FROM dimensionales.BD_Funds WHERE ID_Fund = @ID_Fund)
        BEGIN
            SET @ErrorMessage = 'Fondo no existe en dimensionales.BD_Funds';

            INSERT INTO sandbox.Homologacion_Fondos (ID_Ejecucion, FechaReporte, Fondo, Source, FechaProceso)
            VALUES (@ID_Ejecucion, @FechaReporte, CAST(@ID_Fund AS NVARCHAR(50)), @Source, GETDATE());

            RETURN 10;  -- HOMOLOGACION_FONDOS
        END

        -- Obtener Portfolio del fondo
        SELECT @Portfolio = Portfolio
        FROM dimensionales.HOMOL_Funds
        WHERE ID_Fund = @ID_Fund AND Source = @Source;

        IF @Portfolio IS NULL
        BEGIN
            SET @ErrorMessage = 'Fondo sin Portfolio mapeado para Source: ' + @Source;

            INSERT INTO sandbox.Homologacion_Fondos (ID_Ejecucion, FechaReporte, Fondo, Source, FechaProceso)
            VALUES (@ID_Ejecucion, @FechaReporte, CAST(@ID_Fund AS NVARCHAR(50)), @Source, GETDATE());

            RETURN 10;  -- HOMOLOGACION_FONDOS
        END

        -- =====================================================================
        -- OBTENER REQUISITOS DEL FONDO (desde config o defaults)
        -- =====================================================================

        SELECT
            @Req_IPA = Req_IPA,
            @Req_CAPM = Req_CAPM,
            @Req_SONA = Req_SONA,
            @Req_PNL = Req_PNL,
            @Req_Derivados = Req_Derivados,
            @Req_PosModRF = Req_PosModRF,
            @UsaDefault = UsaDefault
        FROM config.fn_GetRequisitosExtract(@ID_Fund);

        PRINT 'Requisitos del fondo ' + CAST(@ID_Fund AS NVARCHAR(10)) +
              CASE WHEN @UsaDefault = 1 THEN ' (usando defaults)' ELSE ' (config especifica)' END;
        PRINT '  Req_IPA=' + CAST(@Req_IPA AS CHAR(1)) +
              ' Req_CAPM=' + CAST(@Req_CAPM AS CHAR(1)) +
              ' Req_SONA=' + CAST(@Req_SONA AS CHAR(1)) +
              ' Req_PNL=' + CAST(@Req_PNL AS CHAR(1)) +
              ' Req_Derivados=' + CAST(@Req_Derivados AS CHAR(1));

        -- =====================================================================
        -- VALIDACION 3: Verificar reportes en extract.* segun requisitos
        -- =====================================================================

        PRINT 'Verificando reportes disponibles para Portfolio: ' + @Portfolio;

        -- 3.1: IPA (siempre obligatorio por diseño)
        SELECT @RegistrosIPA = COUNT(*)
        FROM extract.IPA WITH (NOLOCK)
        WHERE ID_Ejecucion = @ID_Ejecucion
          AND FechaReporte = @FechaReporte
          AND ID_Fund = @ID_Fund;

        IF @RegistrosIPA = 0
        BEGIN
            SET @ErrorMessage = 'EXTRACT_IPA_FALTANTE: Sin datos IPA para fondo ' + CAST(@ID_Fund AS NVARCHAR(10));

            INSERT INTO sandbox.Alertas_Extract_Faltante (ID_Ejecucion, ID_Fund, FechaReporte, TipoReporte, Obligatorio, FechaProceso)
            VALUES (@ID_Ejecucion, @ID_Fund, @FechaReporte, 'IPA', 1, GETDATE());

            RETURN 13;  -- EXTRACT_IPA_FALTANTE
        END
        PRINT '  IPA: ' + CAST(@RegistrosIPA AS NVARCHAR(10)) + ' registros [OK]';

        -- 3.2: CAPM
        SELECT @RegistrosCAPM = COUNT(*)
        FROM extract.CAPM WITH (NOLOCK)
        WHERE ID_Ejecucion = @ID_Ejecucion
          AND FechaReporte = @FechaReporte
          AND ID_Fund = @ID_Fund;

        IF @RegistrosCAPM = 0
        BEGIN
            IF @Req_CAPM = 1
            BEGIN
                SET @ErrorMessage = 'EXTRACT_CAPM_FALTANTE: CAPM obligatorio no disponible para fondo ' + CAST(@ID_Fund AS NVARCHAR(10));

                INSERT INTO sandbox.Alertas_Extract_Faltante (ID_Ejecucion, ID_Fund, FechaReporte, TipoReporte, Obligatorio, FechaProceso)
                VALUES (@ID_Ejecucion, @ID_Fund, @FechaReporte, 'CAPM', 1, GETDATE());

                RETURN 14;  -- EXTRACT_CAPM_FALTANTE
            END
            ELSE
            BEGIN
                SET @WarningMessage = @WarningMessage + 'CAPM no disponible (opcional). ';
                PRINT '  CAPM: Sin datos [OK - No obligatorio]';
            END
        END
        ELSE
            PRINT '  CAPM: ' + CAST(@RegistrosCAPM AS NVARCHAR(10)) + ' registros [OK]';

        -- 3.3: SONA
        SELECT @RegistrosSONA = COUNT(*)
        FROM extract.SONA WITH (NOLOCK)
        WHERE ID_Ejecucion = @ID_Ejecucion
          AND FechaReporte = @FechaReporte
          AND ID_Fund = @ID_Fund;

        IF @RegistrosSONA = 0
        BEGIN
            IF @Req_SONA = 1
            BEGIN
                SET @ErrorMessage = 'EXTRACT_SONA_FALTANTE: SONA obligatorio no disponible para fondo ' + CAST(@ID_Fund AS NVARCHAR(10));

                INSERT INTO sandbox.Alertas_Extract_Faltante (ID_Ejecucion, ID_Fund, FechaReporte, TipoReporte, Obligatorio, FechaProceso)
                VALUES (@ID_Ejecucion, @ID_Fund, @FechaReporte, 'SONA', 1, GETDATE());

                RETURN 15;  -- EXTRACT_SONA_FALTANTE
            END
            ELSE
            BEGIN
                SET @WarningMessage = @WarningMessage + 'SONA no disponible (opcional). ';
                PRINT '  SONA: Sin datos [OK - No obligatorio]';
            END
        END
        ELSE
            PRINT '  SONA: ' + CAST(@RegistrosSONA AS NVARCHAR(10)) + ' registros [OK]';

        -- 3.4: PNL
        SELECT @RegistrosPNL = COUNT(*)
        FROM extract.PNL WITH (NOLOCK)
        WHERE ID_Ejecucion = @ID_Ejecucion
          AND FechaReporte = @FechaReporte
          AND ID_Fund = @ID_Fund;

        IF @RegistrosPNL = 0
        BEGIN
            IF @Req_PNL = 1
            BEGIN
                SET @ErrorMessage = 'EXTRACT_PNL_FALTANTE: PNL obligatorio no disponible para fondo ' + CAST(@ID_Fund AS NVARCHAR(10));

                INSERT INTO sandbox.Alertas_Extract_Faltante (ID_Ejecucion, ID_Fund, FechaReporte, TipoReporte, Obligatorio, FechaProceso)
                VALUES (@ID_Ejecucion, @ID_Fund, @FechaReporte, 'PNL', 1, GETDATE());

                RETURN 16;  -- EXTRACT_PNL_FALTANTE
            END
            ELSE
                PRINT '  PNL: Sin datos [OK - No obligatorio]';
        END
        ELSE
            PRINT '  PNL: ' + CAST(@RegistrosPNL AS NVARCHAR(10)) + ' registros [OK]';

        -- 3.5: Derivados (la clave!)
        SELECT @RegistrosDerivados = COUNT(*)
        FROM extract.Derivados WITH (NOLOCK)
        WHERE ID_Ejecucion = @ID_Ejecucion
          AND FechaReporte = @FechaReporte
          AND ID_Fund = @ID_Fund;

        IF @RegistrosDerivados = 0
        BEGIN
            IF @Req_Derivados = 1
            BEGIN
                SET @ErrorMessage = 'EXTRACT_DERIVADOS_FALTANTE: Derivados obligatorios no disponibles para fondo ' + CAST(@ID_Fund AS NVARCHAR(10));

                INSERT INTO sandbox.Alertas_Extract_Faltante (ID_Ejecucion, ID_Fund, FechaReporte, TipoReporte, Obligatorio, FechaProceso)
                VALUES (@ID_Ejecucion, @ID_Fund, @FechaReporte, 'Derivados', 1, GETDATE());

                RETURN 17;  -- EXTRACT_DERIVADOS_FALTANTE
            END
            ELSE
                PRINT '  Derivados: Sin datos [OK - No obligatorio]';
        END
        ELSE
            PRINT '  Derivados: ' + CAST(@RegistrosDerivados AS NVARCHAR(10)) + ' registros [OK]';

        -- =====================================================================
        -- VALIDACION 3.6: PosModRF
        -- =====================================================================
        DECLARE @RegistrosPosModRF INT = 0;

        SELECT @RegistrosPosModRF = COUNT(*)
        FROM extract.PosModRF WITH (NOLOCK)
        WHERE ID_Ejecucion = @ID_Ejecucion
          AND FechaReporte = @FechaReporte
          AND ID_Fund = @ID_Fund;

        IF @RegistrosPosModRF = 0
        BEGIN
            IF @Req_PosModRF = 1
            BEGIN
                SET @ErrorMessage = 'EXTRACT_POSMODRF_FALTANTE: PosModRF obligatorio no disponible para fondo ' + CAST(@ID_Fund AS NVARCHAR(10));

                INSERT INTO sandbox.Alertas_Extract_Faltante (ID_Ejecucion, ID_Fund, FechaReporte, TipoReporte, Obligatorio, FechaProceso)
                VALUES (@ID_Ejecucion, @ID_Fund, @FechaReporte, 'PosModRF', 1, GETDATE());

                RETURN 18;  -- EXTRACT_POSMODRF_FALTANTE
            END
            ELSE
                PRINT '  PosModRF: Sin datos [OK - No obligatorio]';
        END
        ELSE
            PRINT '  PosModRF: ' + CAST(@RegistrosPosModRF AS NVARCHAR(10)) + ' registros [OK]';

        -- =====================================================================
        -- VALIDACION 4: Suciedades (Qty cercano a 0)
        -- =====================================================================

        SELECT @SuciedadesCount = COUNT(*)
        FROM extract.IPA WITH (NOLOCK)
        WHERE ID_Ejecucion = @ID_Ejecucion
          AND FechaReporte = @FechaReporte
          AND ID_Fund = @ID_Fund
          AND ABS(ISNULL(Qty, 0)) < @UmbralSuciedad
          AND ABS(ISNULL(Qty, 0)) > 0;

        IF @SuciedadesCount > 0
        BEGIN
            SET @ErrorMessage = 'Detectadas ' + CAST(@SuciedadesCount AS NVARCHAR(10)) + ' suciedades (Qty cercano a 0)';

            INSERT INTO sandbox.Alertas_Suciedades_IPA (ID_Ejecucion, ID_Fund, FechaReporte, InvestID, InvestDescription, Qty, MVBook, AI, FechaProceso)
            SELECT @ID_Ejecucion, @ID_Fund, @FechaReporte, InvestID, InvestDescription, Qty, MVBook, AI, GETDATE()
            FROM extract.IPA WITH (NOLOCK)
            WHERE ID_Ejecucion = @ID_Ejecucion
              AND FechaReporte = @FechaReporte
              AND ID_Fund = @ID_Fund
              AND ABS(ISNULL(Qty, 0)) < @UmbralSuciedad
              AND ABS(ISNULL(Qty, 0)) > 0;

            RETURN 5;  -- SUCIEDADES
        END

        -- =====================================================================
        -- VALIDACION 5: Homologacion de Instrumentos
        -- =====================================================================

        SELECT @HomolInstrumentosCount = COUNT(DISTINCT ipa.InvestID)
        FROM extract.IPA ipa WITH (NOLOCK)
        LEFT JOIN dimensionales.HOMOL_Instrumentos hi
            ON ipa.InvestID = hi.SourceInvestment
            AND hi.Source = @Source
        WHERE ipa.ID_Ejecucion = @ID_Ejecucion
          AND ipa.FechaReporte = @FechaReporte
          AND ipa.ID_Fund = @ID_Fund
          AND hi.ID_Instrumento IS NULL;

        IF @HomolInstrumentosCount > 0
        BEGIN
            SET @ErrorMessage = CAST(@HomolInstrumentosCount AS NVARCHAR(10)) + ' instrumentos sin homologar';

            INSERT INTO sandbox.Homologacion_Instrumentos (ID_Ejecucion, FechaReporte, Instrumento, Currency, Source, FechaProceso)
            SELECT DISTINCT @ID_Ejecucion, @FechaReporte, ipa.InvestID, ipa.LocalCurrency, @Source, GETDATE()
            FROM extract.IPA ipa WITH (NOLOCK)
            LEFT JOIN dimensionales.HOMOL_Instrumentos hi
                ON ipa.InvestID = hi.SourceInvestment
                AND hi.Source = @Source
            WHERE ipa.ID_Ejecucion = @ID_Ejecucion
              AND ipa.FechaReporte = @FechaReporte
              AND ipa.ID_Fund = @ID_Fund
              AND hi.ID_Instrumento IS NULL;

            RETURN 6;  -- HOMOLOGACION_INSTRUMENTOS
        END

        -- =====================================================================
        -- VALIDACION 6: Homologacion de Monedas
        -- =====================================================================

        SELECT @HomolMonedasCount = COUNT(DISTINCT ipa.LocalCurrency)
        FROM extract.IPA ipa WITH (NOLOCK)
        LEFT JOIN dimensionales.HOMOL_Monedas hm
            ON ipa.LocalCurrency = hm.Name
            AND hm.Source = @Source
        WHERE ipa.ID_Ejecucion = @ID_Ejecucion
          AND ipa.FechaReporte = @FechaReporte
          AND ipa.ID_Fund = @ID_Fund
          AND hm.id_CURR IS NULL;

        IF @HomolMonedasCount > 0
        BEGIN
            SET @ErrorMessage = CAST(@HomolMonedasCount AS NVARCHAR(10)) + ' monedas sin homologar';

            INSERT INTO sandbox.Homologacion_Monedas (ID_Ejecucion, FechaReporte, Moneda, Source, FechaProceso)
            SELECT DISTINCT @ID_Ejecucion, @FechaReporte, ipa.LocalCurrency, @Source, GETDATE()
            FROM extract.IPA ipa WITH (NOLOCK)
            LEFT JOIN dimensionales.HOMOL_Monedas hm
                ON ipa.LocalCurrency = hm.Name
                AND hm.Source = @Source
            WHERE ipa.ID_Ejecucion = @ID_Ejecucion
              AND ipa.FechaReporte = @FechaReporte
              AND ipa.ID_Fund = @ID_Fund
              AND hm.id_CURR IS NULL;

            RETURN 11;  -- HOMOLOGACION_MONEDAS
        END

        -- =====================================================================
        -- TODAS LAS VALIDACIONES PASARON
        -- =====================================================================

        IF LEN(@WarningMessage) > 0
        BEGIN
            SET @ErrorMessage = 'Warnings: ' + @WarningMessage;
            PRINT 'sp_ValidateFund: ' + @WarningMessage;
        END
        ELSE
            SET @ErrorMessage = NULL;

        PRINT '========================================';
        PRINT 'sp_ValidateFund: Fondo ' + CAST(@ID_Fund AS NVARCHAR(10)) + ' validado correctamente';
        PRINT 'Reportes disponibles:';
        PRINT '  IPA: ' + CAST(@RegistrosIPA AS NVARCHAR(10)) + CASE WHEN @Req_IPA = 1 THEN ' [REQ]' ELSE '' END;
        PRINT '  CAPM: ' + CAST(@RegistrosCAPM AS NVARCHAR(10)) + CASE WHEN @Req_CAPM = 1 THEN ' [REQ]' ELSE '' END;
        PRINT '  SONA: ' + CAST(@RegistrosSONA AS NVARCHAR(10)) + CASE WHEN @Req_SONA = 1 THEN ' [REQ]' ELSE '' END;
        PRINT '  PNL: ' + CAST(@RegistrosPNL AS NVARCHAR(10)) + CASE WHEN @Req_PNL = 1 THEN ' [REQ]' ELSE '' END;
        PRINT '  Derivados: ' + CAST(@RegistrosDerivados AS NVARCHAR(10)) + CASE WHEN @Req_Derivados = 1 THEN ' [REQ]' ELSE '' END;
        PRINT '========================================';

        RETURN 0;  -- OK

    END TRY
    BEGIN CATCH
        SET @ErrorMessage = 'Error en validacion: ' + ERROR_MESSAGE();
        PRINT 'sp_ValidateFund ERROR: ' + ERROR_MESSAGE();

        -- Deadlock/Timeout se manejan diferente (reintentar en backend)
        IF ERROR_NUMBER() IN (1205, -2, 1222)
            RETURN 3;  -- ERROR_CRITICO (backend decidira si reintenta)

        RETURN 3;  -- ERROR_CRITICO
    END CATCH
END;
GO
