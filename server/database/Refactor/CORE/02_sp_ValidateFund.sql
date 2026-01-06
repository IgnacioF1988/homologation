USE INTELIGENCIA_PRODUCTO_FULLSTACK;
GO

/*
================================================================================
SP: staging.sp_ValidateFund
Version: v6.8 - Umbral de suciedad configurable

Descripcion: Ejecuta TODAS las validaciones y registra TODOS los problemas
             en sandbox (estructura N:M) y en logs.Validaciones_Ejecucion.

Cambios v6.8:
  - CONFIG: Umbral de suciedad ahora usa config.fn_GetUmbralSuciedad(@ID_Fund)
            Permite configurar umbrales por fondo via config.Umbrales_Suciedades
  - REQUISITO: Ejecutar 00_Config_Requisitos.sql para crear tabla y funcion

Cambios v6.7:
  - PERF: Cambiado de MIN_GRANT_PERCENT/MAX_GRANT_PERCENT a RECOMPILE
          RECOMPILE asegura que SQL Server use estadisticas actuales
          al compilar cada query (optimo con indices covering nuevos)
  - REQUISITO: Ejecutar 99_Optimizacion_Definitiva.sql antes

Cambios v6.6:
  - FIX: Parametro @FechaReporte cambiado de NVARCHAR(10) a DATE

Cambios v6.5:
  - PERF: Hints de memory grant (reemplazados en v6.7)

Cambios v6.4:
  - PERF: Hints iniciales solo en Instrumentos y Monedas

Cambios v6.3:
  - FIX: Deduplicar suciedades usando CAST a DECIMAL(28,10) + ROW_NUMBER
         para evitar duplicate key cuando FLOAT se convierte a la precision de destino

Cambios v6.1/v6.2:
  - Tablas sandbox globales sin ID_Ejecucion
  - Estructura N:M: tabla principal + tabla de relacion con fondos
  - MERGE para insertar items nuevos (o agregar relacion con fondo)
  - Items con Estado='Ok' no se reportan como pendientes
  - Conteo de pendientes especifico por fondo
  - FIX: ROW_NUMBER para eliminar duplicados (Instrumento,Source) con diferentes Currency

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
  10 = HOMOLOGACION_FONDOS
  11 = HOMOLOGACION_MONEDAS
  13-18 = EXTRACT_*_FALTANTE

Autor: Refactorizacion Pipeline IPA
Fecha: 2026-01-05
================================================================================
*/

CREATE OR ALTER PROCEDURE [staging].[sp_ValidateFund]
    @ID_Ejecucion BIGINT,
    @ID_Proceso BIGINT,
    @ID_Fund INT,
    @FechaReporte DATE,  -- v6.6: Cambiado de NVARCHAR(10) a DATE para evitar CONVERT implicito
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
    DECLARE @UmbralSuciedad DECIMAL(18,6) = config.fn_GetUmbralSuciedad(@ID_Fund);  -- v6.8: Configurable por fondo
    DECLARE @ErrorMessages NVARCHAR(MAX) = '';
    DECLARE @ErrorCount INT = 0;
    DECLARE @RegistrosPosModRF INT = 0;

    -- Variables para requisitos
    DECLARE @Req_IPA BIT, @Req_CAPM BIT, @Req_SONA BIT;
    DECLARE @Req_PNL BIT, @Req_Derivados BIT, @Req_PosModRF BIT;
    DECLARE @UsaDefault BIT;

    -- Variables para Sources (desde config)
    DECLARE @SourceGeneva NVARCHAR(50);
    DECLARE @SourceDerivados NVARCHAR(50);

    PRINT '════════════════════════════════════════════════════════════════';
    PRINT 'sp_ValidateFund v6.8: INICIO (Umbral configurable)';
    PRINT 'ID_Ejecucion: ' + CAST(@ID_Ejecucion AS NVARCHAR(20));
    PRINT 'ID_Fund: ' + CAST(@ID_Fund AS NVARCHAR(10));
    PRINT 'FechaReporte: ' + CONVERT(NVARCHAR(10), @FechaReporte, 120);
    PRINT 'UmbralSuciedad: ' + CAST(@UmbralSuciedad AS NVARCHAR(20));
    PRINT '════════════════════════════════════════════════════════════════';

    BEGIN TRY
        -- =====================================================================
        -- VALIDACION 0: Parametros basicos (fail-fast)
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

        IF @FechaReporte IS NULL
        BEGIN
            SET @ErrorMessage = 'FechaReporte obligatorio';
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

            INSERT INTO sandbox.Alertas_Extract_Faltante (ID_Ejecucion, ID_Fund, FechaReporte, TipoReporte, Obligatorio)
            VALUES (@ID_Ejecucion, @ID_Fund, @FechaReporte, 'IPA', 1);

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

            INSERT INTO sandbox.Alertas_Extract_Faltante (ID_Ejecucion, ID_Fund, FechaReporte, TipoReporte, Obligatorio)
            VALUES (@ID_Ejecucion, @ID_Fund, @FechaReporte, 'CAPM', 1);

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

            INSERT INTO sandbox.Alertas_Extract_Faltante (ID_Ejecucion, ID_Fund, FechaReporte, TipoReporte, Obligatorio)
            VALUES (@ID_Ejecucion, @ID_Fund, @FechaReporte, 'SONA', 1);

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

            INSERT INTO sandbox.Alertas_Extract_Faltante (ID_Ejecucion, ID_Fund, FechaReporte, TipoReporte, Obligatorio)
            VALUES (@ID_Ejecucion, @ID_Fund, @FechaReporte, 'PNL', 1);

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

            INSERT INTO sandbox.Alertas_Extract_Faltante (ID_Ejecucion, ID_Fund, FechaReporte, TipoReporte, Obligatorio)
            VALUES (@ID_Ejecucion, @ID_Fund, @FechaReporte, 'Derivados', 1);

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

            INSERT INTO sandbox.Alertas_Extract_Faltante (ID_Ejecucion, ID_Fund, FechaReporte, TipoReporte, Obligatorio)
            VALUES (@ID_Ejecucion, @ID_Fund, @FechaReporte, 'PosModRF', 1);

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
        -- Busca en HOMOL_Funds por (Portfolio, Source)
        -- Si no existe y Estado != 'Ok', registra en sandbox
        -- =====================================================================
        PRINT '';
        PRINT '  Validando homologacion de fondos...';

        -- Temp table para fondos sin homologar de esta ejecucion
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
        OPTION (RECOMPILE);  -- v6.7: Usa estadisticas actuales con indices covering

        -- Insertar en tabla principal (solo si no existe o Estado != 'Ok')
        MERGE sandbox.Homologacion_Fondos AS target
        USING #FondosSinHomologar AS source
        ON target.NombreFondo = source.NombreFondo AND target.Source = source.Source
        WHEN NOT MATCHED THEN
            INSERT (NombreFondo, Source, FechaDeteccion, Estado)
            VALUES (source.NombreFondo, source.Source, GETDATE(), 'Pendiente');

        -- Insertar relacion con fondo (solo si no existe)
        INSERT INTO sandbox.Homologacion_Fondos_Fondos (ID_Homologacion, ID_Fund)
        SELECT DISTINCT h.ID, @ID_Fund
        FROM sandbox.Homologacion_Fondos h
        INNER JOIN #FondosSinHomologar f ON h.NombreFondo = f.NombreFondo AND h.Source = f.Source
        WHERE h.Estado = 'Pendiente'
          AND NOT EXISTS (
              SELECT 1 FROM sandbox.Homologacion_Fondos_Fondos hf
              WHERE hf.ID_Homologacion = h.ID AND hf.ID_Fund = @ID_Fund
          );

        -- Contar PENDIENTES para este fondo especificamente
        SELECT @HomolFondosCount = COUNT(*)
        FROM sandbox.Homologacion_Fondos h
        INNER JOIN sandbox.Homologacion_Fondos_Fondos hf ON h.ID = hf.ID_Homologacion
        INNER JOIN #FondosSinHomologar f ON h.NombreFondo = f.NombreFondo AND h.Source = f.Source
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
        -- FIX v6.3: Deduplicar basado en DECIMAL(28,10) para evitar duplicate key
        --           ya que la tabla destino usa esa precision
        -- =====================================================================
        IF @RegistrosIPA > 0
        BEGIN
            -- Temp table para suciedades de esta ejecucion
            -- FIX v6.3: Convertir a DECIMAL(28,10) y deduplicar con ROW_NUMBER
            --           porque la tabla destino usa esa precision
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
            OPTION (RECOMPILE);  -- v6.7: Usa estadisticas actuales con indices covering

            IF EXISTS (SELECT 1 FROM #SuciedadesDetectadas)
            BEGIN
                -- Insertar en tabla principal (solo si no existe)
                -- FIX v6.3: Datos ya convertidos a DECIMAL(28,10) y deduplicados
                MERGE sandbox.Alertas_Suciedades_IPA AS target
                USING #SuciedadesDetectadas AS source
                ON target.InvestID = source.InvestID
                   AND target.Qty = source.Qty
                   AND target.MVBook = source.MVBook
                WHEN NOT MATCHED THEN
                    INSERT (InvestID, InvestDescription, Qty, MVBook, AI, FechaDeteccion, Estado)
                    VALUES (source.InvestID, source.InvestDescription, source.Qty, source.MVBook, source.AI, GETDATE(), 'Pendiente');

                -- Insertar relacion con fondo (solo si no existe)
                INSERT INTO sandbox.Alertas_Suciedades_IPA_Fondos (ID_Suciedad, ID_Fund)
                SELECT DISTINCT s.ID, @ID_Fund
                FROM sandbox.Alertas_Suciedades_IPA s
                INNER JOIN #SuciedadesDetectadas d
                    ON s.InvestID = d.InvestID
                    AND s.Qty = d.Qty
                    AND s.MVBook = d.MVBook
                WHERE s.Estado = 'Pendiente'
                  AND NOT EXISTS (
                      SELECT 1 FROM sandbox.Alertas_Suciedades_IPA_Fondos sf
                      WHERE sf.ID_Suciedad = s.ID AND sf.ID_Fund = @ID_Fund
                  );

                -- Contar PENDIENTES para este fondo
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
        -- Incluye IPA + PNL + CAPM + Derivados
        -- FIX v6.1: Use ROW_NUMBER to get unique Instrumento+Source
        -- =====================================================================
        IF @RegistrosIPA > 0 OR @RegistrosPNL > 0 OR @RegistrosCAPM > 0 OR @RegistrosDerivados > 0
        BEGIN
            DROP TABLE IF EXISTS #InstrumentosSinHomologar;

            -- Use CTE with ROW_NUMBER to eliminate duplicates per Instrumento+Source
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
            OPTION (RECOMPILE);  -- v6.7: Usa estadisticas actuales con indices covering

            IF EXISTS (SELECT 1 FROM #InstrumentosSinHomologar)
            BEGIN
                -- Insertar en tabla principal (solo si no existe)
                MERGE sandbox.Homologacion_Instrumentos AS target
                USING #InstrumentosSinHomologar AS source
                ON target.Instrumento = source.Instrumento AND target.Source = source.Source
                WHEN NOT MATCHED THEN
                    INSERT (Instrumento, Source, Currency, FechaDeteccion, Estado)
                    VALUES (source.Instrumento, source.Source, source.Currency, GETDATE(), 'Pendiente');

                -- Insertar relacion con fondo (solo si no existe)
                INSERT INTO sandbox.Homologacion_Instrumentos_Fondos (ID_Homologacion, ID_Fund)
                SELECT DISTINCT h.ID, @ID_Fund
                FROM sandbox.Homologacion_Instrumentos h
                INNER JOIN #InstrumentosSinHomologar i ON h.Instrumento = i.Instrumento AND h.Source = i.Source
                WHERE h.Estado = 'Pendiente'
                  AND NOT EXISTS (
                      SELECT 1 FROM sandbox.Homologacion_Instrumentos_Fondos hf
                      WHERE hf.ID_Homologacion = h.ID AND hf.ID_Fund = @ID_Fund
                  );

                -- Contar PENDIENTES para este fondo
                SELECT @HomolInstrumentosCount = COUNT(*)
                FROM sandbox.Homologacion_Instrumentos h
                INNER JOIN sandbox.Homologacion_Instrumentos_Fondos hf ON h.ID = hf.ID_Homologacion
                INNER JOIN #InstrumentosSinHomologar i ON h.Instrumento = i.Instrumento AND h.Source = i.Source
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
            -- Incluye IPA + PNL + CAPM + Derivados
            -- =====================================================================
            DROP TABLE IF EXISTS #MonedasSinHomologar;

            SELECT DISTINCT Moneda, Source
            INTO #MonedasSinHomologar
            FROM (
                -- De IPA (Source: GENEVA)
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

                -- De PNL (Source: GENEVA)
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

                -- De CAPM (Source: GENEVA)
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

                -- De Derivados - Pata Larga (Source: DERIVADOS)
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

                -- De Derivados - Pata Corta (Source: DERIVADOS)
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
            OPTION (RECOMPILE);  -- v6.7: Usa estadisticas actuales con indices covering

            IF EXISTS (SELECT 1 FROM #MonedasSinHomologar)
            BEGIN
                -- Insertar en tabla principal (solo si no existe)
                MERGE sandbox.Homologacion_Monedas AS target
                USING #MonedasSinHomologar AS source
                ON target.Moneda = source.Moneda AND target.Source = source.Source
                WHEN NOT MATCHED THEN
                    INSERT (Moneda, Source, FechaDeteccion, Estado)
                    VALUES (source.Moneda, source.Source, GETDATE(), 'Pendiente');

                -- Insertar relacion con fondo (solo si no existe)
                INSERT INTO sandbox.Homologacion_Monedas_Fondos (ID_Homologacion, ID_Fund)
                SELECT DISTINCT h.ID, @ID_Fund
                FROM sandbox.Homologacion_Monedas h
                INNER JOIN #MonedasSinHomologar m ON h.Moneda = m.Moneda AND h.Source = m.Source
                WHERE h.Estado = 'Pendiente'
                  AND NOT EXISTS (
                      SELECT 1 FROM sandbox.Homologacion_Monedas_Fondos hf
                      WHERE hf.ID_Homologacion = h.ID AND hf.ID_Fund = @ID_Fund
                  );

                -- Contar PENDIENTES para este fondo
                SELECT @HomolMonedasCount = COUNT(*)
                FROM sandbox.Homologacion_Monedas h
                INNER JOIN sandbox.Homologacion_Monedas_Fondos hf ON h.ID = hf.ID_Homologacion
                INNER JOIN #MonedasSinHomologar m ON h.Moneda = m.Moneda AND h.Source = m.Source
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
        -- RESUMEN Y RETORNO
        -- =====================================================================
        PRINT '════════════════════════════════════════════════════════════════';
        IF @ErrorCount = 0
        BEGIN
            PRINT 'sp_ValidateFund: OK - Sin errores';

            INSERT INTO logs.Validaciones_Ejecucion
                (ID_Ejecucion, ID_Proceso, ID_Fund, FechaReporte, CodigoValidacion, TipoValidacion, Categoria, Mensaje, Cantidad, EsCritico)
            VALUES (@ID_Ejecucion, @ID_Proceso, @ID_Fund, @FechaReporte, 0, 'VALIDACION_OK', 'SISTEMA',
                    'Todas las validaciones pasaron', 0, 0);

            SET @ErrorMessage = NULL;
            RETURN 0;
        END
        ELSE
        BEGIN
            PRINT 'sp_ValidateFund: ' + CAST(@ErrorCount AS NVARCHAR(10)) + ' errores';
            PRINT 'Errores: ' + @ErrorMessages;
            PRINT 'Codigo: ' + CAST(@MostCriticalCode AS NVARCHAR(10));
            PRINT '════════════════════════════════════════════════════════════════';

            SET @ErrorMessage = @ErrorMessages;
            RETURN @MostCriticalCode;
        END

    END TRY
    BEGIN CATCH
        SET @ErrorMessage = 'Error: ' + ERROR_MESSAGE();

        INSERT INTO logs.Validaciones_Ejecucion
            (ID_Ejecucion, ID_Proceso, ID_Fund, FechaReporte, CodigoValidacion, TipoValidacion, Categoria, Mensaje, Cantidad, EsCritico)
        VALUES (@ID_Ejecucion, @ID_Proceso, @ID_Fund, @FechaReporte, 3, 'ERROR_CRITICO', 'SISTEMA',
                @ErrorMessage, 0, 1);

        RETURN 3;
    END CATCH
END;
GO
