/*
================================================================================
SP: staging.sp_ValidateFund
Version: v7.0 - Case Sensitive Collation Compatible
================================================================================
CAMBIOS v7.0:
  - Compatible con Latin1_General_CS_AS en todas las tablas
  - Los JOINs ahora son Case Sensitive (no requieren COLLATE explícito)
  - REQUISITO: Ejecutar 99_Migracion_Collation_CS.sql antes de este SP

Cambios v6.9:
  - FIX: Cambiar INSERT a MERGE en sandbox.Alertas_Extract_Faltante
         para evitar fallas por UNIQUE constraint en re-ejecuciones
  - FIX: Cambiar INSERT a MERGE en tablas *_Fondos (N:M) para evitar
         race conditions en procesamiento paralelo

Cambios v6.8:
  - CONFIG: Umbral de suciedad ahora usa config.fn_GetUmbralSuciedad(@ID_Fund)
            Permite configurar umbrales por fondo via config.Umbrales_Suciedades

Cambios v6.7:
  - PERF: Cambiado de MIN_GRANT_PERCENT/MAX_GRANT_PERCENT a RECOMPILE

Cambios v6.6:
  - FIX: Parametro @FechaReporte cambiado de NVARCHAR(10) a DATE

Cambios v6.3:
  - FIX: Deduplicar suciedades usando CAST a DECIMAL(28,10) + ROW_NUMBER

Arquitectura Sandbox:
  - Homologacion_Instrumentos (unico por Instrumento+Source)
  - Homologacion_Instrumentos_Fondos (relacion con fondos)
  - Homologacion_Monedas (unico por Moneda+Source)
  - Homologacion_Monedas_Fondos (relacion con fondos)
  - Homologacion_Fondos (unico por NombreFondo+Source)
  - Homologacion_Fondos_Fondos (relacion con fondos)
  - Alertas_Suciedades_IPA (unico por InvestID+Qty+MVBook)
  - Alertas_Suciedades_IPA_Fondos (relacion con fondos)

Codigos de retorno:
  0  = OK (sin errores)
  1  = WARNING (advertencias no bloqueantes)
  3  = ERROR_CRITICO (parametros invalidos)
  5  = SUCIEDADES_IPA
  6  = HOMOLOGACION_INSTRUMENTOS
  7  = DESCUADRE_CASH_PREFLIGHT (IPA Cash vs CAPM)
  8  = DESCUADRE_DERIVADOS_PREFLIGHT (IPA MTM vs Derivados)
  9  = DESCUADRE_NAV_PREFLIGHT (Total calculado vs SONA)
  10 = HOMOLOGACION_FONDOS
  11 = HOMOLOGACION_MONEDAS
  13-18 = EXTRACT_*_FALTANTE

PRINCIPIO FUNDAMENTAL:
  Si este SP retorna 0, el fondo DEBE llegar al CUBO final sin fallar.
  Los Process_* SPs NO deben tener validaciones de negocio redundantes.

Autor: Refactorizacion Pipeline IPA
Fecha: 2026-01-07
================================================================================
*/

CREATE OR ALTER PROCEDURE [staging].[sp_ValidateFund]
    @ID_Ejecucion BIGINT,
    @ID_Proceso BIGINT,
    @ID_Fund INT,
    @FechaReporte DATE,
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

    DECLARE @MostCriticalCode INT = 0;
    DECLARE @UmbralSuciedad DECIMAL(18,6) = config.fn_GetUmbralSuciedad(@ID_Fund);
    DECLARE @ErrorMessages NVARCHAR(MAX) = '';
    DECLARE @ErrorCount INT = 0;
    DECLARE @RegistrosPosModRF INT = 0;
    DECLARE @StartTime DATETIME = GETDATE();

    -- Variables para requisitos
    DECLARE @Req_IPA BIT, @Req_CAPM BIT, @Req_SONA BIT;
    DECLARE @Req_PNL BIT, @Req_Derivados BIT, @Req_PosModRF BIT;
    DECLARE @UsaDefault BIT;

    -- Variables para Sources (desde config)
    DECLARE @SourceGeneva NVARCHAR(50);
    DECLARE @SourceDerivados NVARCHAR(50);

    PRINT '════════════════════════════════════════════════════════════════';
    PRINT 'sp_ValidateFund v7.0: INICIO (Case Sensitive)';
    PRINT 'ID_Ejecucion: ' + CAST(@ID_Ejecucion AS NVARCHAR(20));
    PRINT 'ID_Fund: ' + CAST(@ID_Fund AS NVARCHAR(10));
    PRINT 'FechaReporte: ' + CONVERT(NVARCHAR(10), @FechaReporte, 120);
    PRINT 'UmbralSuciedad: ' + CAST(@UmbralSuciedad AS NVARCHAR(20));
    PRINT '════════════════════════════════════════════════════════════════';

    BEGIN TRY
        -- ═══════════════════════════════════════════════════════════════════
        -- EVENTO: SP_INICIO
        -- ═══════════════════════════════════════════════════════════════════
        EXEC broker.sp_EmitirEvento
            @TipoEvento = 'SP_INICIO',
            @ID_Ejecucion = @ID_Ejecucion,
            @ID_Proceso = @ID_Proceso,
            @ID_Fund = @ID_Fund,
            @NombreSP = 'staging.sp_ValidateFund';

        -- =====================================================================
        -- VALIDACION 0: Parametros basicos (fail-fast)
        -- =====================================================================
        IF @ID_Ejecucion IS NULL OR @ID_Ejecucion <= 0
        BEGIN
            SET @ErrorMessage = 'ID_Ejecucion invalido';

            -- EVENTO: SP_FIN (ERROR_CRITICO)
            EXEC broker.sp_EmitirEvento
                @TipoEvento = 'SP_FIN',
                @ID_Ejecucion = @ID_Ejecucion,
                @ID_Proceso = @ID_Proceso,
                @ID_Fund = @ID_Fund,
                @NombreSP = 'staging.sp_ValidateFund',
                @CodigoRetorno = 3,
                @Detalles = 'ERROR_CRITICO: ID_Ejecucion invalido';

            RETURN 3;
        END

        IF @ID_Fund IS NULL OR @ID_Fund <= 0
        BEGIN
            SET @ErrorMessage = 'ID_Fund invalido';

            -- EVENTO: SP_FIN (ERROR_CRITICO)
            EXEC broker.sp_EmitirEvento
                @TipoEvento = 'SP_FIN',
                @ID_Ejecucion = @ID_Ejecucion,
                @ID_Proceso = @ID_Proceso,
                @ID_Fund = @ID_Fund,
                @NombreSP = 'staging.sp_ValidateFund',
                @CodigoRetorno = 3,
                @Detalles = 'ERROR_CRITICO: ID_Fund invalido';

            RETURN 3;
        END

        IF @FechaReporte IS NULL
        BEGIN
            SET @ErrorMessage = 'FechaReporte obligatorio';

            -- EVENTO: SP_FIN (ERROR_CRITICO)
            EXEC broker.sp_EmitirEvento
                @TipoEvento = 'SP_FIN',
                @ID_Ejecucion = @ID_Ejecucion,
                @ID_Proceso = @ID_Proceso,
                @ID_Fund = @ID_Fund,
                @NombreSP = 'staging.sp_ValidateFund',
                @CodigoRetorno = 3,
                @Detalles = 'ERROR_CRITICO: FechaReporte obligatorio';

            RETURN 3;
        END

        -- Obtener Sources desde config.Extract_Source
        SELECT @SourceGeneva = SourceName FROM config.Extract_Source WHERE ExtractTable = 'IPA';
        SELECT @SourceDerivados = SourceName FROM config.Extract_Source WHERE ExtractTable = 'Derivados';

        SET @SourceGeneva = ISNULL(@SourceGeneva, 'GENEVA');
        SET @SourceDerivados = ISNULL(@SourceDerivados, 'DERIVADOS');

        -- =====================================================================
        -- OBTENER REQUISITOS DEL FONDO
        -- =====================================================================
        SELECT
            @Req_IPA = Req_IPA, @Req_CAPM = Req_CAPM, @Req_SONA = Req_SONA,
            @Req_PNL = Req_PNL, @Req_Derivados = Req_Derivados, @Req_PosModRF = Req_PosModRF,
            @UsaDefault = UsaDefault
        FROM config.fn_GetRequisitosExtract(@ID_Fund);

        PRINT 'Requisitos: IPA=' + CAST(@Req_IPA AS CHAR(1)) +
              ' CAPM=' + CAST(@Req_CAPM AS CHAR(1)) +
              ' SONA=' + CAST(@Req_SONA AS CHAR(1)) +
              ' PNL=' + CAST(@Req_PNL AS CHAR(1)) +
              ' Derivados=' + CAST(@Req_Derivados AS CHAR(1)) +
              ' PosModRF=' + CAST(@Req_PosModRF AS CHAR(1));
        PRINT 'Sources: Geneva=' + @SourceGeneva + ', Derivados=' + @SourceDerivados;

        -- =====================================================================
        -- VALIDACION 1: Extracts requeridos (conteo)
        -- =====================================================================
        SELECT @RegistrosIPA = COUNT(*) FROM extract.IPA WITH (NOLOCK)
        WHERE ID_Ejecucion = @ID_Ejecucion AND FechaReporte = @FechaReporte AND ID_Fund = @ID_Fund;

        IF @RegistrosIPA = 0
        BEGIN
            SET @ErrorCount = @ErrorCount + 1;
            SET @ErrorMessages = @ErrorMessages + 'IPA_FALTANTE; ';
            IF @MostCriticalCode = 0 SET @MostCriticalCode = 13;

            MERGE sandbox.Alertas_Extract_Faltante AS target
            USING (SELECT @ID_Ejecucion AS ID_Ejecucion, @ID_Fund AS ID_Fund, @FechaReporte AS FechaReporte, 'IPA' AS TipoReporte) AS source
            ON target.ID_Ejecucion = source.ID_Ejecucion AND target.ID_Fund = source.ID_Fund
               AND target.FechaReporte = source.FechaReporte AND target.TipoReporte = source.TipoReporte
            WHEN NOT MATCHED THEN
                INSERT (ID_Ejecucion, ID_Fund, FechaReporte, TipoReporte, Obligatorio)
                VALUES (source.ID_Ejecucion, source.ID_Fund, source.FechaReporte, source.TipoReporte, 1);

            INSERT INTO logs.Validaciones_Ejecucion
                (ID_Ejecucion, ID_Proceso, ID_Fund, FechaReporte, CodigoValidacion, TipoValidacion, Categoria, Mensaje, Cantidad, EsCritico)
            VALUES (@ID_Ejecucion, @ID_Proceso, @ID_Fund, @FechaReporte, 13, 'EXTRACT_IPA_FALTANTE', 'EXTRACT',
                    'No hay registros IPA para esta ejecucion', 0, 1);

            PRINT '  [ERROR] Extract IPA faltante';
        END
        ELSE
            PRINT '  [OK] IPA: ' + CAST(@RegistrosIPA AS NVARCHAR(10)) + ' registros';

        -- CAPM
        SELECT @RegistrosCAPM = COUNT(*) FROM extract.CAPM WITH (NOLOCK)
        WHERE ID_Ejecucion = @ID_Ejecucion AND FechaReporte = @FechaReporte AND ID_Fund = @ID_Fund;

        IF @RegistrosCAPM = 0 AND @Req_CAPM = 1
        BEGIN
            SET @ErrorCount = @ErrorCount + 1;
            SET @ErrorMessages = @ErrorMessages + 'CAPM_FALTANTE; ';
            IF @MostCriticalCode = 0 SET @MostCriticalCode = 14;

            MERGE sandbox.Alertas_Extract_Faltante AS target
            USING (SELECT @ID_Ejecucion AS ID_Ejecucion, @ID_Fund AS ID_Fund, @FechaReporte AS FechaReporte, 'CAPM' AS TipoReporte) AS source
            ON target.ID_Ejecucion = source.ID_Ejecucion AND target.ID_Fund = source.ID_Fund
               AND target.FechaReporte = source.FechaReporte AND target.TipoReporte = source.TipoReporte
            WHEN NOT MATCHED THEN
                INSERT (ID_Ejecucion, ID_Fund, FechaReporte, TipoReporte, Obligatorio)
                VALUES (source.ID_Ejecucion, source.ID_Fund, source.FechaReporte, source.TipoReporte, 1);

            INSERT INTO logs.Validaciones_Ejecucion
                (ID_Ejecucion, ID_Proceso, ID_Fund, FechaReporte, CodigoValidacion, TipoValidacion, Categoria, Mensaje, Cantidad, EsCritico)
            VALUES (@ID_Ejecucion, @ID_Proceso, @ID_Fund, @FechaReporte, 14, 'EXTRACT_CAPM_FALTANTE', 'EXTRACT',
                    'No hay registros CAPM (requerido)', 0, 1);

            PRINT '  [ERROR] Extract CAPM faltante';
        END
        ELSE
            PRINT '  [OK] CAPM: ' + CAST(@RegistrosCAPM AS NVARCHAR(10)) + ' registros';

        -- SONA
        SELECT @RegistrosSONA = COUNT(*) FROM extract.SONA WITH (NOLOCK)
        WHERE ID_Ejecucion = @ID_Ejecucion AND FechaReporte = @FechaReporte AND ID_Fund = @ID_Fund;

        IF @RegistrosSONA = 0 AND @Req_SONA = 1
        BEGIN
            SET @ErrorCount = @ErrorCount + 1;
            SET @ErrorMessages = @ErrorMessages + 'SONA_FALTANTE; ';
            IF @MostCriticalCode = 0 SET @MostCriticalCode = 15;

            MERGE sandbox.Alertas_Extract_Faltante AS target
            USING (SELECT @ID_Ejecucion AS ID_Ejecucion, @ID_Fund AS ID_Fund, @FechaReporte AS FechaReporte, 'SONA' AS TipoReporte) AS source
            ON target.ID_Ejecucion = source.ID_Ejecucion AND target.ID_Fund = source.ID_Fund
               AND target.FechaReporte = source.FechaReporte AND target.TipoReporte = source.TipoReporte
            WHEN NOT MATCHED THEN
                INSERT (ID_Ejecucion, ID_Fund, FechaReporte, TipoReporte, Obligatorio)
                VALUES (source.ID_Ejecucion, source.ID_Fund, source.FechaReporte, source.TipoReporte, 1);

            INSERT INTO logs.Validaciones_Ejecucion
                (ID_Ejecucion, ID_Proceso, ID_Fund, FechaReporte, CodigoValidacion, TipoValidacion, Categoria, Mensaje, Cantidad, EsCritico)
            VALUES (@ID_Ejecucion, @ID_Proceso, @ID_Fund, @FechaReporte, 15, 'EXTRACT_SONA_FALTANTE', 'EXTRACT',
                    'No hay registros SONA (requerido)', 0, 1);

            PRINT '  [ERROR] Extract SONA faltante';
        END
        ELSE
            PRINT '  [OK] SONA: ' + CAST(@RegistrosSONA AS NVARCHAR(10)) + ' registros';

        -- PNL
        SELECT @RegistrosPNL = COUNT(*) FROM extract.PNL WITH (NOLOCK)
        WHERE ID_Ejecucion = @ID_Ejecucion AND FechaReporte = @FechaReporte AND ID_Fund = @ID_Fund;

        IF @RegistrosPNL = 0 AND @Req_PNL = 1
        BEGIN
            SET @ErrorCount = @ErrorCount + 1;
            SET @ErrorMessages = @ErrorMessages + 'PNL_FALTANTE; ';
            IF @MostCriticalCode = 0 SET @MostCriticalCode = 16;

            MERGE sandbox.Alertas_Extract_Faltante AS target
            USING (SELECT @ID_Ejecucion AS ID_Ejecucion, @ID_Fund AS ID_Fund, @FechaReporte AS FechaReporte, 'PNL' AS TipoReporte) AS source
            ON target.ID_Ejecucion = source.ID_Ejecucion AND target.ID_Fund = source.ID_Fund
               AND target.FechaReporte = source.FechaReporte AND target.TipoReporte = source.TipoReporte
            WHEN NOT MATCHED THEN
                INSERT (ID_Ejecucion, ID_Fund, FechaReporte, TipoReporte, Obligatorio)
                VALUES (source.ID_Ejecucion, source.ID_Fund, source.FechaReporte, source.TipoReporte, 1);

            INSERT INTO logs.Validaciones_Ejecucion
                (ID_Ejecucion, ID_Proceso, ID_Fund, FechaReporte, CodigoValidacion, TipoValidacion, Categoria, Mensaje, Cantidad, EsCritico)
            VALUES (@ID_Ejecucion, @ID_Proceso, @ID_Fund, @FechaReporte, 16, 'EXTRACT_PNL_FALTANTE', 'EXTRACT',
                    'No hay registros PNL (requerido)', 0, 1);

            PRINT '  [ERROR] Extract PNL faltante';
        END
        ELSE
            PRINT '  [OK] PNL: ' + CAST(@RegistrosPNL AS NVARCHAR(10)) + ' registros';

        -- Derivados
        SELECT @RegistrosDerivados = COUNT(*) FROM extract.Derivados WITH (NOLOCK)
        WHERE ID_Ejecucion = @ID_Ejecucion AND FechaReporte = @FechaReporte AND ID_Fund = @ID_Fund;

        IF @RegistrosDerivados = 0 AND @Req_Derivados = 1
        BEGIN
            SET @ErrorCount = @ErrorCount + 1;
            SET @ErrorMessages = @ErrorMessages + 'DERIVADOS_FALTANTE; ';
            IF @MostCriticalCode = 0 SET @MostCriticalCode = 17;

            MERGE sandbox.Alertas_Extract_Faltante AS target
            USING (SELECT @ID_Ejecucion AS ID_Ejecucion, @ID_Fund AS ID_Fund, @FechaReporte AS FechaReporte, 'Derivados' AS TipoReporte) AS source
            ON target.ID_Ejecucion = source.ID_Ejecucion AND target.ID_Fund = source.ID_Fund
               AND target.FechaReporte = source.FechaReporte AND target.TipoReporte = source.TipoReporte
            WHEN NOT MATCHED THEN
                INSERT (ID_Ejecucion, ID_Fund, FechaReporte, TipoReporte, Obligatorio)
                VALUES (source.ID_Ejecucion, source.ID_Fund, source.FechaReporte, source.TipoReporte, 1);

            INSERT INTO logs.Validaciones_Ejecucion
                (ID_Ejecucion, ID_Proceso, ID_Fund, FechaReporte, CodigoValidacion, TipoValidacion, Categoria, Mensaje, Cantidad, EsCritico)
            VALUES (@ID_Ejecucion, @ID_Proceso, @ID_Fund, @FechaReporte, 17, 'EXTRACT_DERIVADOS_FALTANTE', 'EXTRACT',
                    'No hay registros Derivados (requerido)', 0, 1);

            PRINT '  [ERROR] Extract Derivados faltante';
        END
        ELSE
            PRINT '  [OK] Derivados: ' + CAST(@RegistrosDerivados AS NVARCHAR(10)) + ' registros';

        -- PosModRF
        SELECT @RegistrosPosModRF = COUNT(*) FROM extract.PosModRF WITH (NOLOCK)
        WHERE ID_Ejecucion = @ID_Ejecucion AND FechaReporte = @FechaReporte AND ID_Fund = @ID_Fund;

        IF @RegistrosPosModRF = 0 AND @Req_PosModRF = 1
        BEGIN
            SET @ErrorCount = @ErrorCount + 1;
            SET @ErrorMessages = @ErrorMessages + 'POSMODRF_FALTANTE; ';
            IF @MostCriticalCode = 0 SET @MostCriticalCode = 18;

            MERGE sandbox.Alertas_Extract_Faltante AS target
            USING (SELECT @ID_Ejecucion AS ID_Ejecucion, @ID_Fund AS ID_Fund, @FechaReporte AS FechaReporte, 'PosModRF' AS TipoReporte) AS source
            ON target.ID_Ejecucion = source.ID_Ejecucion AND target.ID_Fund = source.ID_Fund
               AND target.FechaReporte = source.FechaReporte AND target.TipoReporte = source.TipoReporte
            WHEN NOT MATCHED THEN
                INSERT (ID_Ejecucion, ID_Fund, FechaReporte, TipoReporte, Obligatorio)
                VALUES (source.ID_Ejecucion, source.ID_Fund, source.FechaReporte, source.TipoReporte, 1);

            INSERT INTO logs.Validaciones_Ejecucion
                (ID_Ejecucion, ID_Proceso, ID_Fund, FechaReporte, CodigoValidacion, TipoValidacion, Categoria, Mensaje, Cantidad, EsCritico)
            VALUES (@ID_Ejecucion, @ID_Proceso, @ID_Fund, @FechaReporte, 18, 'EXTRACT_POSMODRF_FALTANTE', 'EXTRACT',
                    'No hay registros PosModRF (requerido)', 0, 1);

            PRINT '  [ERROR] Extract PosModRF faltante';
        END
        ELSE
            PRINT '  [OK] PosModRF: ' + CAST(@RegistrosPosModRF AS NVARCHAR(10)) + ' registros';

        -- =====================================================================
        -- VALIDACION 2: Homologacion de Fondos (N:M Global)
        -- v7.0: JOINs son Case Sensitive nativamente
        -- =====================================================================
        PRINT '';
        PRINT '  Validando homologacion de fondos...';

        DROP TABLE IF EXISTS #FondosSinHomologar;

        SELECT DISTINCT
            ipa.Portfolio AS NombreFondo,
            @SourceGeneva AS Source
        INTO #FondosSinHomologar
        FROM extract.IPA ipa WITH (NOLOCK)
        LEFT JOIN dimensionales.HOMOL_Funds hf
            ON ipa.Portfolio = hf.Portfolio AND hf.Source = @SourceGeneva
        WHERE ipa.ID_Ejecucion = @ID_Ejecucion
          AND ipa.FechaReporte = @FechaReporte
          AND ipa.ID_Fund = @ID_Fund
          AND hf.HOMOL_Fund_ID IS NULL

        UNION

        SELECT DISTINCT
            d.Portfolio AS NombreFondo,
            @SourceDerivados AS Source
        FROM extract.Derivados d WITH (NOLOCK)
        LEFT JOIN dimensionales.HOMOL_Funds hf
            ON d.Portfolio = hf.Portfolio AND hf.Source = @SourceDerivados
        WHERE d.ID_Ejecucion = @ID_Ejecucion
          AND d.FechaReporte = @FechaReporte
          AND d.ID_Fund = @ID_Fund
          AND hf.HOMOL_Fund_ID IS NULL
        OPTION (RECOMPILE);

        -- v7.0: COLLATE necesario porque temp tables heredan CI_AS de tempdb
        MERGE sandbox.Homologacion_Fondos AS target
        USING #FondosSinHomologar AS source
        ON target.NombreFondo = source.NombreFondo COLLATE Latin1_General_CS_AS
           AND target.Source = source.Source COLLATE Latin1_General_CS_AS
        WHEN NOT MATCHED THEN
            INSERT (NombreFondo, Source, FechaDeteccion, Estado)
            VALUES (source.NombreFondo, source.Source, GETDATE(), 'Pendiente');

        MERGE sandbox.Homologacion_Fondos_Fondos AS target
        USING (
            SELECT DISTINCT h.ID AS ID_Homologacion, @ID_Fund AS ID_Fund
            FROM sandbox.Homologacion_Fondos h
            INNER JOIN #FondosSinHomologar f
                ON h.NombreFondo = f.NombreFondo COLLATE Latin1_General_CS_AS
                AND h.Source = f.Source COLLATE Latin1_General_CS_AS
            WHERE h.Estado = 'Pendiente'
        ) AS source
        ON target.ID_Homologacion = source.ID_Homologacion AND target.ID_Fund = source.ID_Fund
        WHEN NOT MATCHED THEN
            INSERT (ID_Homologacion, ID_Fund)
            VALUES (source.ID_Homologacion, source.ID_Fund);

        SELECT @HomolFondosCount = COUNT(*)
        FROM sandbox.Homologacion_Fondos h
        INNER JOIN sandbox.Homologacion_Fondos_Fondos hf ON h.ID = hf.ID_Homologacion
        INNER JOIN #FondosSinHomologar f
            ON h.NombreFondo = f.NombreFondo COLLATE Latin1_General_CS_AS
            AND h.Source = f.Source COLLATE Latin1_General_CS_AS
        WHERE hf.ID_Fund = @ID_Fund AND h.Estado = 'Pendiente';

        DROP TABLE #FondosSinHomologar;

        IF @HomolFondosCount > 0
        BEGIN
            SET @ErrorCount = @ErrorCount + 1;
            SET @ErrorMessages = @ErrorMessages + 'FONDOS(' + CAST(@HomolFondosCount AS NVARCHAR(10)) + '); ';
            IF @MostCriticalCode = 0 SET @MostCriticalCode = 10;

            INSERT INTO logs.Validaciones_Ejecucion
                (ID_Ejecucion, ID_Proceso, ID_Fund, FechaReporte, CodigoValidacion, TipoValidacion, Categoria, Mensaje, Cantidad, EsCritico)
            VALUES (@ID_Ejecucion, @ID_Proceso, @ID_Fund, @FechaReporte, 10, 'HOMOLOGACION_FONDOS', 'HOMOLOGACION',
                    'Portfolios sin homologar en HOMOL_Funds', @HomolFondosCount, 1);

            PRINT '  [ERROR] Fondos sin homologar: ' + CAST(@HomolFondosCount AS NVARCHAR(10));
        END
        ELSE
            PRINT '  [OK] Todos los fondos homologados';

        -- =====================================================================
        -- VALIDACION 3: Calidad de datos IPA - Suciedades (N:M Global)
        -- =====================================================================
        IF @RegistrosIPA > 0
        BEGIN
            DROP TABLE IF EXISTS #SuciedadesDetectadas;

            ;WITH SuciedadesRaw AS (
                SELECT
                    InvestID,
                    InvestDescription,
                    CAST(Qty AS DECIMAL(28,10)) AS Qty,
                    CAST(MVBook AS DECIMAL(28,10)) AS MVBook,
                    AI,
                    ROW_NUMBER() OVER (
                        PARTITION BY InvestID, CAST(Qty AS DECIMAL(28,10)), CAST(MVBook AS DECIMAL(28,10))
                        ORDER BY InvestDescription
                    ) AS rn
                FROM extract.IPA WITH (NOLOCK)
                WHERE ID_Ejecucion = @ID_Ejecucion
                  AND FechaReporte = @FechaReporte
                  AND ID_Fund = @ID_Fund
                  AND ABS(ISNULL(Qty, 0)) < @UmbralSuciedad
                  AND ABS(ISNULL(Qty, 0)) > 0
            )
            SELECT InvestID, InvestDescription, Qty, MVBook, AI
            INTO #SuciedadesDetectadas
            FROM SuciedadesRaw
            WHERE rn = 1
            OPTION (RECOMPILE);

            IF EXISTS (SELECT 1 FROM #SuciedadesDetectadas)
            BEGIN
                MERGE sandbox.Alertas_Suciedades_IPA AS target
                USING #SuciedadesDetectadas AS source
                ON target.InvestID = source.InvestID
                   AND target.Qty = source.Qty
                   AND target.MVBook = source.MVBook
                WHEN NOT MATCHED THEN
                    INSERT (InvestID, InvestDescription, Qty, MVBook, AI, FechaDeteccion, Estado)
                    VALUES (source.InvestID, source.InvestDescription, source.Qty, source.MVBook, source.AI, GETDATE(), 'Pendiente');

                MERGE sandbox.Alertas_Suciedades_IPA_Fondos AS target
                USING (
                    SELECT DISTINCT s.ID AS ID_Suciedad, @ID_Fund AS ID_Fund
                    FROM sandbox.Alertas_Suciedades_IPA s
                    INNER JOIN #SuciedadesDetectadas d
                        ON s.InvestID = d.InvestID
                        AND s.Qty = d.Qty
                        AND s.MVBook = d.MVBook
                    WHERE s.Estado = 'Pendiente'
                ) AS source
                ON target.ID_Suciedad = source.ID_Suciedad AND target.ID_Fund = source.ID_Fund
                WHEN NOT MATCHED THEN
                    INSERT (ID_Suciedad, ID_Fund)
                    VALUES (source.ID_Suciedad, source.ID_Fund);

                SELECT @SuciedadesCount = COUNT(*)
                FROM sandbox.Alertas_Suciedades_IPA s
                INNER JOIN sandbox.Alertas_Suciedades_IPA_Fondos sf ON s.ID = sf.ID_Suciedad
                INNER JOIN #SuciedadesDetectadas d
                    ON s.InvestID = d.InvestID
                    AND s.Qty = d.Qty
                    AND s.MVBook = d.MVBook
                WHERE sf.ID_Fund = @ID_Fund AND s.Estado = 'Pendiente';

                IF @SuciedadesCount > 0
                BEGIN
                    SET @ErrorCount = @ErrorCount + 1;
                    SET @ErrorMessages = @ErrorMessages + 'SUCIEDADES(' + CAST(@SuciedadesCount AS NVARCHAR(10)) + '); ';
                    IF @MostCriticalCode = 0 SET @MostCriticalCode = 5;

                    INSERT INTO logs.Validaciones_Ejecucion
                        (ID_Ejecucion, ID_Proceso, ID_Fund, FechaReporte, CodigoValidacion, TipoValidacion, Categoria, Mensaje, Cantidad, EsCritico)
                    VALUES (@ID_Ejecucion, @ID_Proceso, @ID_Fund, @FechaReporte, 5, 'SUCIEDADES_IPA', 'CALIDAD',
                            'Posiciones con Qty casi cero', @SuciedadesCount, 1);

                    PRINT '  [ERROR] Suciedades: ' + CAST(@SuciedadesCount AS NVARCHAR(10));
                END
                ELSE
                    PRINT '  [OK] Sin suciedades pendientes';
            END
            ELSE
                PRINT '  [OK] Sin suciedades';

            DROP TABLE IF EXISTS #SuciedadesDetectadas;
        END

        -- =====================================================================
        -- VALIDACION 4: Homologacion Instrumentos (N:M Global)
        -- v7.0: JOINs son Case Sensitive nativamente
        -- =====================================================================
        IF @RegistrosIPA > 0 OR @RegistrosPNL > 0 OR @RegistrosCAPM > 0 OR @RegistrosDerivados > 0
        BEGIN
            DROP TABLE IF EXISTS #InstrumentosSinHomologar;

            ;WITH InstrumentosRaw AS (
                -- De IPA (Source: GENEVA)
                SELECT ipa.InvestID AS Instrumento, ipa.LocalCurrency AS Currency, @SourceGeneva AS Source
                FROM extract.IPA ipa WITH (NOLOCK)
                LEFT JOIN dimensionales.HOMOL_Instrumentos hi
                    ON ipa.InvestID = hi.SourceInvestment AND hi.Source = @SourceGeneva
                WHERE ipa.ID_Ejecucion = @ID_Ejecucion
                  AND ipa.FechaReporte = @FechaReporte
                  AND ipa.ID_Fund = @ID_Fund
                  AND hi.ID_Instrumento IS NULL
                  AND ipa.InvestID IS NOT NULL

                UNION ALL

                -- De PNL (Source: GENEVA)
                SELECT pnl.Symb AS Instrumento, pnl.Currency AS Currency, @SourceGeneva AS Source
                FROM extract.PNL pnl WITH (NOLOCK)
                LEFT JOIN dimensionales.HOMOL_Instrumentos hi
                    ON pnl.Symb = hi.SourceInvestment AND hi.Source = @SourceGeneva
                WHERE pnl.ID_Ejecucion = @ID_Ejecucion
                  AND pnl.FechaReporte = @FechaReporte
                  AND pnl.ID_Fund = @ID_Fund
                  AND hi.ID_Instrumento IS NULL
                  AND pnl.Symb IS NOT NULL

                UNION ALL

                -- De CAPM (Source: GENEVA)
                SELECT capm.InvestID AS Instrumento, capm.LocalCurrency AS Currency, @SourceGeneva AS Source
                FROM extract.CAPM capm WITH (NOLOCK)
                LEFT JOIN dimensionales.HOMOL_Instrumentos hi
                    ON capm.InvestID = hi.SourceInvestment AND hi.Source = @SourceGeneva
                WHERE capm.ID_Ejecucion = @ID_Ejecucion
                  AND capm.FechaReporte = @FechaReporte
                  AND capm.ID_Fund = @ID_Fund
                  AND hi.ID_Instrumento IS NULL
                  AND capm.InvestID IS NOT NULL

                UNION ALL

                -- De Derivados (Source: DERIVADOS)
                SELECT deriv.InvestID AS Instrumento, deriv.Moneda_PLarga AS Currency, @SourceDerivados AS Source
                FROM extract.Derivados deriv WITH (NOLOCK)
                LEFT JOIN dimensionales.HOMOL_Instrumentos hi
                    ON deriv.InvestID = hi.SourceInvestment AND hi.Source = @SourceDerivados
                WHERE deriv.ID_Ejecucion = @ID_Ejecucion
                  AND deriv.FechaReporte = @FechaReporte
                  AND deriv.ID_Fund = @ID_Fund
                  AND hi.ID_Instrumento IS NULL
                  AND deriv.InvestID IS NOT NULL
            ),
            InstrumentosRanked AS (
                SELECT Instrumento, Currency, Source,
                       ROW_NUMBER() OVER (PARTITION BY Instrumento, Source ORDER BY Currency) AS rn
                FROM InstrumentosRaw
            )
            SELECT Instrumento, Currency, Source
            INTO #InstrumentosSinHomologar
            FROM InstrumentosRanked
            WHERE rn = 1
            OPTION (RECOMPILE);

            IF EXISTS (SELECT 1 FROM #InstrumentosSinHomologar)
            BEGIN
                -- v7.0: COLLATE necesario porque temp tables heredan CI_AS de tempdb
                MERGE sandbox.Homologacion_Instrumentos AS target
                USING #InstrumentosSinHomologar AS source
                ON target.Instrumento = source.Instrumento COLLATE Latin1_General_CS_AS
                   AND target.Source = source.Source COLLATE Latin1_General_CS_AS
                WHEN NOT MATCHED THEN
                    INSERT (Instrumento, Source, Currency, FechaDeteccion, Estado)
                    VALUES (source.Instrumento, source.Source, source.Currency, GETDATE(), 'Pendiente');

                MERGE sandbox.Homologacion_Instrumentos_Fondos AS target
                USING (
                    SELECT DISTINCT h.ID AS ID_Homologacion, @ID_Fund AS ID_Fund
                    FROM sandbox.Homologacion_Instrumentos h
                    INNER JOIN #InstrumentosSinHomologar i
                        ON h.Instrumento = i.Instrumento COLLATE Latin1_General_CS_AS
                        AND h.Source = i.Source COLLATE Latin1_General_CS_AS
                    WHERE h.Estado = 'Pendiente'
                ) AS source
                ON target.ID_Homologacion = source.ID_Homologacion AND target.ID_Fund = source.ID_Fund
                WHEN NOT MATCHED THEN
                    INSERT (ID_Homologacion, ID_Fund)
                    VALUES (source.ID_Homologacion, source.ID_Fund);

                SELECT @HomolInstrumentosCount = COUNT(*)
                FROM sandbox.Homologacion_Instrumentos h
                INNER JOIN sandbox.Homologacion_Instrumentos_Fondos hf ON h.ID = hf.ID_Homologacion
                INNER JOIN #InstrumentosSinHomologar i
                    ON h.Instrumento = i.Instrumento COLLATE Latin1_General_CS_AS
                    AND h.Source = i.Source COLLATE Latin1_General_CS_AS
                WHERE hf.ID_Fund = @ID_Fund AND h.Estado = 'Pendiente';
            END

            DROP TABLE IF EXISTS #InstrumentosSinHomologar;

            IF @HomolInstrumentosCount > 0
            BEGIN
                SET @ErrorCount = @ErrorCount + 1;
                SET @ErrorMessages = @ErrorMessages + 'INSTRUMENTOS(' + CAST(@HomolInstrumentosCount AS NVARCHAR(10)) + '); ';
                IF @MostCriticalCode = 0 SET @MostCriticalCode = 6;

                INSERT INTO logs.Validaciones_Ejecucion
                    (ID_Ejecucion, ID_Proceso, ID_Fund, FechaReporte, CodigoValidacion, TipoValidacion, Categoria, Mensaje, Cantidad, EsCritico)
                VALUES (@ID_Ejecucion, @ID_Proceso, @ID_Fund, @FechaReporte, 6, 'HOMOLOGACION_INSTRUMENTOS', 'HOMOLOGACION',
                        'Instrumentos sin homologar (IPA+PNL+CAPM+Derivados)', @HomolInstrumentosCount, 1);

                PRINT '  [ERROR] Instrumentos sin homologar: ' + CAST(@HomolInstrumentosCount AS NVARCHAR(10));
            END
            ELSE
                PRINT '  [OK] Instrumentos homologados';

            -- =====================================================================
            -- VALIDACION 5: Homologacion Monedas (N:M Global)
            -- v7.0: JOINs son Case Sensitive nativamente
            -- =====================================================================
            DROP TABLE IF EXISTS #MonedasSinHomologar;

            SELECT DISTINCT Moneda, Source
            INTO #MonedasSinHomologar
            FROM (
                SELECT ipa.LocalCurrency AS Moneda, @SourceGeneva AS Source
                FROM extract.IPA ipa WITH (NOLOCK)
                LEFT JOIN dimensionales.HOMOL_Monedas hm
                    ON ipa.LocalCurrency = hm.Name AND hm.Source = @SourceGeneva
                WHERE ipa.ID_Ejecucion = @ID_Ejecucion
                  AND ipa.FechaReporte = @FechaReporte
                  AND ipa.ID_Fund = @ID_Fund
                  AND hm.id_CURR IS NULL
                  AND ipa.LocalCurrency IS NOT NULL

                UNION

                SELECT pnl.Currency AS Moneda, @SourceGeneva AS Source
                FROM extract.PNL pnl WITH (NOLOCK)
                LEFT JOIN dimensionales.HOMOL_Monedas hm
                    ON pnl.Currency = hm.Name AND hm.Source = @SourceGeneva
                WHERE pnl.ID_Ejecucion = @ID_Ejecucion
                  AND pnl.FechaReporte = @FechaReporte
                  AND pnl.ID_Fund = @ID_Fund
                  AND hm.id_CURR IS NULL
                  AND pnl.Currency IS NOT NULL

                UNION

                SELECT capm.LocalCurrency AS Moneda, @SourceGeneva AS Source
                FROM extract.CAPM capm WITH (NOLOCK)
                LEFT JOIN dimensionales.HOMOL_Monedas hm
                    ON capm.LocalCurrency = hm.Name AND hm.Source = @SourceGeneva
                WHERE capm.ID_Ejecucion = @ID_Ejecucion
                  AND capm.FechaReporte = @FechaReporte
                  AND capm.ID_Fund = @ID_Fund
                  AND hm.id_CURR IS NULL
                  AND capm.LocalCurrency IS NOT NULL

                UNION

                SELECT deriv.Moneda_PLarga AS Moneda, @SourceDerivados AS Source
                FROM extract.Derivados deriv WITH (NOLOCK)
                LEFT JOIN dimensionales.HOMOL_Monedas hm
                    ON deriv.Moneda_PLarga = hm.Name AND hm.Source = @SourceDerivados
                WHERE deriv.ID_Ejecucion = @ID_Ejecucion
                  AND deriv.FechaReporte = @FechaReporte
                  AND deriv.ID_Fund = @ID_Fund
                  AND hm.id_CURR IS NULL
                  AND deriv.Moneda_PLarga IS NOT NULL

                UNION

                SELECT deriv.Moneda_PCorta AS Moneda, @SourceDerivados AS Source
                FROM extract.Derivados deriv WITH (NOLOCK)
                LEFT JOIN dimensionales.HOMOL_Monedas hm
                    ON deriv.Moneda_PCorta = hm.Name AND hm.Source = @SourceDerivados
                WHERE deriv.ID_Ejecucion = @ID_Ejecucion
                  AND deriv.FechaReporte = @FechaReporte
                  AND deriv.ID_Fund = @ID_Fund
                  AND hm.id_CURR IS NULL
                  AND deriv.Moneda_PCorta IS NOT NULL
            ) src
            OPTION (RECOMPILE);

            IF EXISTS (SELECT 1 FROM #MonedasSinHomologar)
            BEGIN
                -- v7.0: COLLATE necesario porque temp tables heredan CI_AS de tempdb
                MERGE sandbox.Homologacion_Monedas AS target
                USING #MonedasSinHomologar AS source
                ON target.Moneda = source.Moneda COLLATE Latin1_General_CS_AS
                   AND target.Source = source.Source COLLATE Latin1_General_CS_AS
                WHEN NOT MATCHED THEN
                    INSERT (Moneda, Source, FechaDeteccion, Estado)
                    VALUES (source.Moneda, source.Source, GETDATE(), 'Pendiente');

                MERGE sandbox.Homologacion_Monedas_Fondos AS target
                USING (
                    SELECT DISTINCT h.ID AS ID_Homologacion, @ID_Fund AS ID_Fund
                    FROM sandbox.Homologacion_Monedas h
                    INNER JOIN #MonedasSinHomologar m
                        ON h.Moneda = m.Moneda COLLATE Latin1_General_CS_AS
                        AND h.Source = m.Source COLLATE Latin1_General_CS_AS
                    WHERE h.Estado = 'Pendiente'
                ) AS source
                ON target.ID_Homologacion = source.ID_Homologacion AND target.ID_Fund = source.ID_Fund
                WHEN NOT MATCHED THEN
                    INSERT (ID_Homologacion, ID_Fund)
                    VALUES (source.ID_Homologacion, source.ID_Fund);

                SELECT @HomolMonedasCount = COUNT(*)
                FROM sandbox.Homologacion_Monedas h
                INNER JOIN sandbox.Homologacion_Monedas_Fondos hf ON h.ID = hf.ID_Homologacion
                INNER JOIN #MonedasSinHomologar m
                    ON h.Moneda = m.Moneda COLLATE Latin1_General_CS_AS
                    AND h.Source = m.Source COLLATE Latin1_General_CS_AS
                WHERE hf.ID_Fund = @ID_Fund AND h.Estado = 'Pendiente';
            END

            DROP TABLE IF EXISTS #MonedasSinHomologar;

            IF @HomolMonedasCount > 0
            BEGIN
                SET @ErrorCount = @ErrorCount + 1;
                SET @ErrorMessages = @ErrorMessages + 'MONEDAS(' + CAST(@HomolMonedasCount AS NVARCHAR(10)) + '); ';
                IF @MostCriticalCode = 0 SET @MostCriticalCode = 11;

                INSERT INTO logs.Validaciones_Ejecucion
                    (ID_Ejecucion, ID_Proceso, ID_Fund, FechaReporte, CodigoValidacion, TipoValidacion, Categoria, Mensaje, Cantidad, EsCritico)
                VALUES (@ID_Ejecucion, @ID_Proceso, @ID_Fund, @FechaReporte, 11, 'HOMOLOGACION_MONEDAS', 'HOMOLOGACION',
                        'Monedas sin homologar (IPA+PNL+CAPM+Derivados)', @HomolMonedasCount, 1);

                PRINT '  [ERROR] Monedas sin homologar: ' + CAST(@HomolMonedasCount AS NVARCHAR(10));
            END
            ELSE
                PRINT '  [OK] Monedas homologadas';
        END

        -- =====================================================================
        -- FASE 4: PRE-FLIGHT CONSISTENCY CHECKS (si no hay errores previos)
        -- PRINCIPIO: Si esta fase pasa, el fondo DEBE llegar al CUBO final
        -- =====================================================================
        IF @MostCriticalCode = 0
        BEGIN
            PRINT '';
            PRINT '  ══════════════════════════════════════════════════════════════';
            PRINT '  FASE 4: Pre-flight Consistency Checks';
            PRINT '  ══════════════════════════════════════════════════════════════';

            DECLARE @TotalIPA_Cash DECIMAL(18,4) = 0;
            DECLARE @TotalCAPM DECIMAL(18,4) = 0;
            DECLARE @TotalIPA_MTM DECIMAL(18,4) = 0;
            DECLARE @TotalDerivados_MTM DECIMAL(18,4) = 0;
            DECLARE @TotalIPA_Posiciones DECIMAL(18,4) = 0;
            DECLARE @TotalCalculado DECIMAL(18,4) = 0;
            DECLARE @TotalSONA DECIMAL(18,4) = 0;
            DECLARE @Diferencia DECIMAL(18,4) = 0;
            DECLARE @UmbralCAPM DECIMAL(18,4) = staging.fn_GetUmbral(@ID_Fund, 'CAPM');
            DECLARE @UmbralDerivados DECIMAL(18,4) = staging.fn_GetUmbral(@ID_Fund, 'DERIVADOS');
            DECLARE @UmbralSONA DECIMAL(18,4) = staging.fn_GetUmbral(@ID_Fund, 'SONA');
            DECLARE @Portfolio NVARCHAR(100);

            -- Obtener Portfolio para JOINs
            SELECT @Portfolio = Portfolio FROM dimensionales.HOMOL_Funds
            WHERE ID_Fund = @ID_Fund AND Source = @SourceGeneva;

            -- ═══════════════════════════════════════════════════════════════
            -- FASE 4A: Calcular IPA Cash (LSDesc IN 'Cash Long', 'Cash Short')
            -- ═══════════════════════════════════════════════════════════════
            SELECT @TotalIPA_Cash = ISNULL(SUM(ISNULL(MVBook, 0) + ISNULL(AI, 0)), 0)
            FROM extract.IPA WITH (NOLOCK)
            WHERE ID_Ejecucion = @ID_Ejecucion
              AND FechaReporte = @FechaReporte
              AND ID_Fund = @ID_Fund
              AND LSDesc IN ('Cash Long', 'Cash Short');

            PRINT '    IPA Cash: ' + CAST(@TotalIPA_Cash AS NVARCHAR(20));

            -- ═══════════════════════════════════════════════════════════════
            -- FASE 4B: Calcular total CAPM (si hay registros)
            -- NOTA: extract.CAPM no tiene columna AI, solo MVBook
            -- ═══════════════════════════════════════════════════════════════
            IF @RegistrosCAPM > 0
            BEGIN
                SELECT @TotalCAPM = ISNULL(SUM(ISNULL(MVBook, 0)), 0)
                FROM extract.CAPM capm WITH (NOLOCK)
                INNER JOIN dimensionales.HOMOL_Funds hf ON capm.Portfolio = hf.Portfolio AND hf.Source = 'CASH APPRAISAL'
                WHERE capm.ID_Ejecucion = @ID_Ejecucion
                  AND capm.FechaReporte = @FechaReporte
                  AND hf.ID_Fund = @ID_Fund;

                PRINT '    CAPM Total: ' + CAST(@TotalCAPM AS NVARCHAR(20));

                -- ═══════════════════════════════════════════════════════════
                -- FASE 4C: Validar IPA Cash vs CAPM
                -- ═══════════════════════════════════════════════════════════
                SET @Diferencia = ABS(@TotalIPA_Cash - @TotalCAPM);
                IF @Diferencia > @UmbralCAPM
                BEGIN
                    SET @ErrorCount = @ErrorCount + 1;
                    SET @ErrorMessages = @ErrorMessages + 'DESCUADRE_CASH(' + CAST(@Diferencia AS NVARCHAR(20)) + '); ';
                    IF @MostCriticalCode = 0 SET @MostCriticalCode = 7;

                    -- Registrar alerta
                    MERGE sandbox.Alertas_Descuadre_Cash AS target
                    USING (SELECT @ID_Ejecucion AS ID_Ejecucion, @ID_Fund AS ID_Fund, @FechaReporte AS FechaReporte) AS source
                    ON target.ID_Ejecucion = source.ID_Ejecucion AND target.ID_Fund = source.ID_Fund AND target.FechaReporte = source.FechaReporte
                    WHEN MATCHED THEN
                        UPDATE SET Total_IPA_Cash = @TotalIPA_Cash, Total_CAPM = @TotalCAPM, Diferencia = @TotalIPA_Cash - @TotalCAPM,
                                   UmbralAplicado = @UmbralCAPM, FechaProceso = GETDATE()
                    WHEN NOT MATCHED THEN
                        INSERT (ID_Ejecucion, ID_Fund, FechaReporte, Portfolio, Total_IPA_Cash, Total_CAPM, Diferencia, UmbralAplicado, FechaProceso)
                        VALUES (@ID_Ejecucion, @ID_Fund, @FechaReporte, @Portfolio, @TotalIPA_Cash, @TotalCAPM, @TotalIPA_Cash - @TotalCAPM, @UmbralCAPM, GETDATE());

                    INSERT INTO logs.Validaciones_Ejecucion
                        (ID_Ejecucion, ID_Proceso, ID_Fund, FechaReporte, CodigoValidacion, TipoValidacion, Categoria, Mensaje, Cantidad, EsCritico)
                    VALUES (@ID_Ejecucion, @ID_Proceso, @ID_Fund, @FechaReporte, 7, 'DESCUADRE_CASH_PREFLIGHT', 'CONSISTENCIA',
                            'Descuadre IPA Cash vs CAPM excede umbral', @Diferencia, 1);

                    PRINT '    [ERROR] Descuadre Cash: IPA=' + CAST(@TotalIPA_Cash AS NVARCHAR(20)) + ' CAPM=' + CAST(@TotalCAPM AS NVARCHAR(20)) + ' Dif=' + CAST(@Diferencia AS NVARCHAR(20)) + ' Umbral=' + CAST(@UmbralCAPM AS NVARCHAR(10));
                END
                ELSE
                    PRINT '    [OK] Cash: Diferencia ' + CAST(@Diferencia AS NVARCHAR(20)) + ' dentro de umbral ' + CAST(@UmbralCAPM AS NVARCHAR(10));
            END

            -- ═══════════════════════════════════════════════════════════════
            -- FASE 4D: Calcular IPA MTM (LSDesc LIKE '%MTM%')
            -- ═══════════════════════════════════════════════════════════════
            SELECT @TotalIPA_MTM = ISNULL(SUM(ISNULL(MVBook, 0)), 0)
            FROM extract.IPA WITH (NOLOCK)
            WHERE ID_Ejecucion = @ID_Ejecucion
              AND FechaReporte = @FechaReporte
              AND ID_Fund = @ID_Fund
              AND LSDesc LIKE '%MTM%';

            PRINT '    IPA MTM: ' + CAST(@TotalIPA_MTM AS NVARCHAR(20));

            -- ═══════════════════════════════════════════════════════════════
            -- FASE 4E: Calcular total Derivados (si hay registros)
            -- ═══════════════════════════════════════════════════════════════
            IF @RegistrosDerivados > 0
            BEGIN
                SELECT @TotalDerivados_MTM = ISNULL(SUM(MTM_Sistema), 0)
                FROM extract.Derivados deriv WITH (NOLOCK)
                INNER JOIN dimensionales.HOMOL_Funds hf ON deriv.Portfolio = hf.Portfolio AND hf.Source = @SourceDerivados
                WHERE deriv.ID_Ejecucion = @ID_Ejecucion
                  AND deriv.FechaReporte = @FechaReporte
                  AND hf.ID_Fund = @ID_Fund;

                PRINT '    Derivados MTM: ' + CAST(@TotalDerivados_MTM AS NVARCHAR(20));

                -- ═══════════════════════════════════════════════════════════
                -- FASE 4F: Validar IPA MTM vs Derivados
                -- ═══════════════════════════════════════════════════════════
                SET @Diferencia = ABS(@TotalIPA_MTM - @TotalDerivados_MTM);
                IF @Diferencia > @UmbralDerivados
                BEGIN
                    SET @ErrorCount = @ErrorCount + 1;
                    SET @ErrorMessages = @ErrorMessages + 'DESCUADRE_DERIVADOS(' + CAST(@Diferencia AS NVARCHAR(20)) + '); ';
                    IF @MostCriticalCode = 0 SET @MostCriticalCode = 8;

                    -- Registrar alerta
                    MERGE sandbox.Alertas_Descuadre_Derivados AS target
                    USING (SELECT @ID_Ejecucion AS ID_Ejecucion, @ID_Fund AS ID_Fund, @FechaReporte AS FechaReporte) AS source
                    ON target.ID_Ejecucion = source.ID_Ejecucion AND target.ID_Fund = source.ID_Fund AND target.FechaReporte = source.FechaReporte
                    WHEN MATCHED THEN
                        UPDATE SET MVBook_IPA = @TotalIPA_MTM, MTM_Derivados = @TotalDerivados_MTM, Diferencia = @TotalIPA_MTM - @TotalDerivados_MTM,
                                   UmbralAplicado = @UmbralDerivados, FechaProceso = GETDATE()
                    WHEN NOT MATCHED THEN
                        INSERT (ID_Ejecucion, ID_Fund, FechaReporte, Portfolio, MVBook_IPA, MTM_Derivados, Diferencia, UmbralAplicado, FechaProceso)
                        VALUES (@ID_Ejecucion, @ID_Fund, @FechaReporte, @Portfolio, @TotalIPA_MTM, @TotalDerivados_MTM, @TotalIPA_MTM - @TotalDerivados_MTM, @UmbralDerivados, GETDATE());

                    INSERT INTO logs.Validaciones_Ejecucion
                        (ID_Ejecucion, ID_Proceso, ID_Fund, FechaReporte, CodigoValidacion, TipoValidacion, Categoria, Mensaje, Cantidad, EsCritico)
                    VALUES (@ID_Ejecucion, @ID_Proceso, @ID_Fund, @FechaReporte, 8, 'DESCUADRE_DERIVADOS_PREFLIGHT', 'CONSISTENCIA',
                            'Descuadre IPA MTM vs Derivados excede umbral', @Diferencia, 1);

                    PRINT '    [ERROR] Descuadre Derivados: IPA=' + CAST(@TotalIPA_MTM AS NVARCHAR(20)) + ' Derivados=' + CAST(@TotalDerivados_MTM AS NVARCHAR(20)) + ' Dif=' + CAST(@Diferencia AS NVARCHAR(20)) + ' Umbral=' + CAST(@UmbralDerivados AS NVARCHAR(10));
                END
                ELSE
                    PRINT '    [OK] Derivados: Diferencia ' + CAST(@Diferencia AS NVARCHAR(20)) + ' dentro de umbral ' + CAST(@UmbralDerivados AS NVARCHAR(10));
            END

            -- ═══════════════════════════════════════════════════════════════
            -- FASE 4G: Calcular IPA Posiciones (sin Cash ni MTM)
            -- ═══════════════════════════════════════════════════════════════
            SELECT @TotalIPA_Posiciones = ISNULL(SUM(ISNULL(MVBook, 0) + ISNULL(AI, 0)), 0)
            FROM extract.IPA WITH (NOLOCK)
            WHERE ID_Ejecucion = @ID_Ejecucion
              AND FechaReporte = @FechaReporte
              AND ID_Fund = @ID_Fund
              AND LSDesc NOT IN ('Cash Long', 'Cash Short')
              AND LSDesc NOT LIKE '%MTM%';

            PRINT '    IPA Posiciones: ' + CAST(@TotalIPA_Posiciones AS NVARCHAR(20));

            -- ═══════════════════════════════════════════════════════════════
            -- FASE 4H: Calcular total esperado y comparar con SONA
            -- ═══════════════════════════════════════════════════════════════
            IF @RegistrosSONA > 0
            BEGIN
                -- Total calculado = Posiciones IPA + CAPM + Derivados (sin doble conteo)
                SET @TotalCalculado = @TotalIPA_Posiciones + @TotalCAPM + @TotalDerivados_MTM;

                SELECT @TotalSONA = ISNULL(SUM(Bal), 0)
                FROM extract.SONA WITH (NOLOCK)
                WHERE ID_Ejecucion = @ID_Ejecucion
                  AND FechaReporte = @FechaReporte
                  AND ID_Fund = @ID_Fund;

                -- Si no encontró por ID_Fund, buscar por Portfolio
                IF @TotalSONA = 0
                BEGIN
                    SELECT @TotalSONA = ISNULL(SUM(s.Bal), 0)
                    FROM extract.SONA s WITH (NOLOCK)
                    INNER JOIN dimensionales.HOMOL_Funds hf ON s.Portfolio = hf.Portfolio AND hf.Source = @SourceGeneva
                    WHERE s.ID_Ejecucion = @ID_Ejecucion
                      AND s.FechaReporte = @FechaReporte
                      AND hf.ID_Fund = @ID_Fund;
                END

                PRINT '    Total Calculado: ' + CAST(@TotalCalculado AS NVARCHAR(20));
                PRINT '    SONA (NAV): ' + CAST(@TotalSONA AS NVARCHAR(20));

                -- ═══════════════════════════════════════════════════════════
                -- FASE 4I: Validar Total Calculado vs SONA
                -- ═══════════════════════════════════════════════════════════
                IF @TotalSONA > 0
                BEGIN
                    SET @Diferencia = ABS(@TotalSONA - @TotalCalculado);
                    IF @Diferencia > @UmbralSONA
                    BEGIN
                        SET @ErrorCount = @ErrorCount + 1;
                        SET @ErrorMessages = @ErrorMessages + 'DESCUADRE_NAV(' + CAST(@Diferencia AS NVARCHAR(20)) + '); ';
                        IF @MostCriticalCode = 0 SET @MostCriticalCode = 9;

                        -- Registrar alerta
                        MERGE sandbox.Alertas_Descuadre_NAV AS target
                        USING (SELECT @ID_Ejecucion AS ID_Ejecucion, @ID_Fund AS ID_Fund, @FechaReporte AS FechaReporte) AS source
                        ON target.ID_Ejecucion = source.ID_Ejecucion AND target.ID_Fund = source.ID_Fund AND target.FechaReporte = source.FechaReporte
                        WHEN MATCHED THEN
                            UPDATE SET Total_IPA = @TotalCalculado, Total_SONA = @TotalSONA, Diferencia = @TotalSONA - @TotalCalculado,
                                       UmbralAplicado = @UmbralSONA, FechaProceso = GETDATE()
                        WHEN NOT MATCHED THEN
                            INSERT (ID_Ejecucion, ID_Fund, FechaReporte, Portfolio, Total_IPA, Total_SONA, Diferencia, UmbralAplicado, FechaProceso)
                            VALUES (@ID_Ejecucion, @ID_Fund, @FechaReporte, @Portfolio, @TotalCalculado, @TotalSONA, @TotalSONA - @TotalCalculado, @UmbralSONA, GETDATE());

                        INSERT INTO logs.Validaciones_Ejecucion
                            (ID_Ejecucion, ID_Proceso, ID_Fund, FechaReporte, CodigoValidacion, TipoValidacion, Categoria, Mensaje, Cantidad, EsCritico)
                        VALUES (@ID_Ejecucion, @ID_Proceso, @ID_Fund, @FechaReporte, 9, 'DESCUADRE_NAV_PREFLIGHT', 'CONSISTENCIA',
                                'Descuadre Total Calculado vs SONA excede umbral', @Diferencia, 1);

                        PRINT '    [ERROR] Descuadre NAV: Calc=' + CAST(@TotalCalculado AS NVARCHAR(20)) + ' SONA=' + CAST(@TotalSONA AS NVARCHAR(20)) + ' Dif=' + CAST(@Diferencia AS NVARCHAR(20)) + ' Umbral=' + CAST(@UmbralSONA AS NVARCHAR(10));
                    END
                    ELSE
                        PRINT '    [OK] NAV: Diferencia ' + CAST(@Diferencia AS NVARCHAR(20)) + ' dentro de umbral ' + CAST(@UmbralSONA AS NVARCHAR(10));
                END
            END

            PRINT '  ══════════════════════════════════════════════════════════════';
        END

        -- =====================================================================
        -- RESUMEN Y RETORNO
        -- =====================================================================
        DECLARE @DuracionMs INT = DATEDIFF(second, @StartTime, GETDATE()) * 1000;

        PRINT '════════════════════════════════════════════════════════════════';
        IF @ErrorCount = 0
        BEGIN
            PRINT 'sp_ValidateFund: OK - Sin errores';

            INSERT INTO logs.Validaciones_Ejecucion
                (ID_Ejecucion, ID_Proceso, ID_Fund, FechaReporte, CodigoValidacion, TipoValidacion, Categoria, Mensaje, Cantidad, EsCritico)
            VALUES (@ID_Ejecucion, @ID_Proceso, @ID_Fund, @FechaReporte, 0, 'VALIDACION_OK', 'SISTEMA',
                    'Todas las validaciones pasaron', 0, 0);

            SET @ErrorMessage = NULL;

            -- ═══════════════════════════════════════════════════════════════════
            -- EVENTO: SP_FIN (Exitoso)
            -- ═══════════════════════════════════════════════════════════════════
            EXEC broker.sp_EmitirEvento
                @TipoEvento = 'SP_FIN',
                @ID_Ejecucion = @ID_Ejecucion,
                @ID_Proceso = @ID_Proceso,
                @ID_Fund = @ID_Fund,
                @NombreSP = 'staging.sp_ValidateFund',
                @CodigoRetorno = 0,
                @DuracionMs = @DuracionMs;

            RETURN 0;
        END
        ELSE
        BEGIN
            PRINT 'sp_ValidateFund: ' + CAST(@ErrorCount AS NVARCHAR(10)) + ' errores';
            PRINT 'Errores: ' + @ErrorMessages;
            PRINT 'Codigo: ' + CAST(@MostCriticalCode AS NVARCHAR(10));
            PRINT '════════════════════════════════════════════════════════════════';

            SET @ErrorMessage = @ErrorMessages;

            -- ═══════════════════════════════════════════════════════════════════
            -- EVENTO: STANDBY (Problemas de validación)
            -- ═══════════════════════════════════════════════════════════════════
            DECLARE @MsgStandby NVARCHAR(500) = 'Validacion fallida - Codigo:' + CAST(@MostCriticalCode AS NVARCHAR(10)) +
                                                 ' Errores:' + @ErrorMessages;
            EXEC broker.sp_EmitirEvento
                @TipoEvento = 'STANDBY',
                @ID_Ejecucion = @ID_Ejecucion,
                @ID_Proceso = @ID_Proceso,
                @ID_Fund = @ID_Fund,
                @NombreSP = 'staging.sp_ValidateFund',
                @CodigoRetorno = @MostCriticalCode,
                @Detalles = @MsgStandby;

            RETURN @MostCriticalCode;
        END

    END TRY
    BEGIN CATCH
        SET @ErrorMessage = 'Error: ' + ERROR_MESSAGE();

        INSERT INTO logs.Validaciones_Ejecucion
            (ID_Ejecucion, ID_Proceso, ID_Fund, FechaReporte, CodigoValidacion, TipoValidacion, Categoria, Mensaje, Cantidad, EsCritico)
        VALUES (@ID_Ejecucion, @ID_Proceso, @ID_Fund, @FechaReporte, 3, 'ERROR_CRITICO', 'SISTEMA',
                @ErrorMessage, 0, 1);

        -- ═══════════════════════════════════════════════════════════════════
        -- EVENTO: ERROR
        -- ═══════════════════════════════════════════════════════════════════
        EXEC broker.sp_EmitirEvento
            @TipoEvento = 'ERROR',
            @ID_Ejecucion = @ID_Ejecucion,
            @ID_Proceso = @ID_Proceso,
            @ID_Fund = @ID_Fund,
            @NombreSP = 'staging.sp_ValidateFund',
            @CodigoRetorno = 3,
            @Detalles = @ErrorMessage;

        RETURN 3;
    END CATCH
END;
GO
