-- ============================================================================
-- CÁLCULO DE MÉTRICAS DE RENTA FIJA - V4
-- ============================================================================
-- Versión: 4.0
-- Database: Inteligencia_Producto_Dev
-- Changes from V3:
--   * Processes ALL (PK2, ID_Fund) combinations instead of single fund
--   * Removes @ID_Fund parameter
--   * Saves to metrics.Metrics table with versioning
--   * Composite key throughout: (PK2, ID_Fund)
-- ============================================================================

USE [Inteligencia_Producto_Dev];
GO

-- ============================================================================
-- PART 1: CREATE SCHEMA AND TABLE
-- ============================================================================

-- Create metrics schema if not exists
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'metrics')
BEGIN
    EXEC('CREATE SCHEMA metrics');
    PRINT 'Created schema: metrics';
END
GO

-- Create metrics.Metrics table if not exists
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[metrics].[Metrics]') AND type = 'U')
BEGIN
    CREATE TABLE [metrics].[Metrics] (
        -- Primary Key (identity for versioning)
        id INT IDENTITY(1,1) PRIMARY KEY,

        -- Business Key
        PK2 VARCHAR(100) NOT NULL,
        ID_Fund VARCHAR(50) NOT NULL,
        FechaReporte DATE NOT NULL,

        -- Instrument Info
        BalanceSheet VARCHAR(50),
        ipa_currency VARCHAR(10),
        cashflow_currency VARCHAR(10),
        fx_to_usd FLOAT,

        -- Market Values
        TotalMVal_Original FLOAT,
        TotalMVal_Normalized FLOAT,
        Qty FLOAT,

        -- Cashflow Info
        total_flujos INT,
        cpn_freq FLOAT,
        payment_pattern VARCHAR(20),

        -- Yield Metrics
        yield_rate_EAR FLOAT,       -- Effective Annual Rate (IRR)
        yield_EAR_pct FLOAT,        -- EAR as percentage
        periodic_rate FLOAT,         -- Per-period rate: (1+EAR)^(1/freq)-1
        BEY FLOAT,                   -- Bond Equivalent Yield: 2*[(1+EAR)^0.5-1]
        yield_BEY_pct FLOAT,        -- BEY as percentage (industry standard)

        -- Duration Metrics (in years)
        macaulay_duration FLOAT,
        modified_duration FLOAT,
        present_value FLOAT,

        -- Optimization Info
        optimization_method VARCHAR(20),
        convergence_status VARCHAR(50),
        iterations INT,

        -- Metadata & Versioning
        source VARCHAR(10) DEFAULT 'BBG',
        processed_date DATETIME DEFAULT GETDATE(),
        validity VARCHAR(3) DEFAULT 'Yes'
    );

    -- Indexes
    CREATE INDEX IX_Metrics_BusinessKey ON [metrics].[Metrics](PK2, ID_Fund, FechaReporte);
    CREATE INDEX IX_Metrics_Fund ON [metrics].[Metrics](ID_Fund, FechaReporte);
    CREATE INDEX IX_Metrics_Date ON [metrics].[Metrics](FechaReporte);
    CREATE INDEX IX_Metrics_Valid ON [metrics].[Metrics](validity) WHERE validity = 'Yes';

    PRINT 'Created table: metrics.Metrics';
END
GO

-- ============================================================================
-- PART 2: CREATE STORED PROCEDURE
-- ============================================================================

IF EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[metrics].[sp_CalculateMetrics]') AND type = 'P')
BEGIN
    DROP PROCEDURE [metrics].[sp_CalculateMetrics];
END
GO

CREATE PROCEDURE [metrics].[sp_CalculateMetrics]
    @FechaReporte DATE,
    -- Optimization parameters (with defaults)
    @epsilon FLOAT = 0.00001,
    @max_iterations INT = 300,
    @initial_guess FLOAT = 0.08,
    @derivative_threshold FLOAT = 0.000000001,
    @change_epsilon FLOAT = 0.0001  -- For change detection
AS
BEGIN
    SET NOCOUNT ON;

    -- ========================================================================
    -- CONFIGURATION
    -- ========================================================================
    DECLARE @lower_bound_initial FLOAT = -0.9999999999999;
    DECLARE @upper_bound_initial FLOAT = 10000.0;
    DECLARE @bisection_tolerance FLOAT = 0.001;
    DECLARE @min_cash_flows INT = 1;
    DECLARE @max_newton_attempts INT = 50;
    DECLARE @npv_tolerance FLOAT = 5000;

    PRINT '========================================';
    PRINT 'CÁLCULO DE YIELD - V4';
    PRINT '========================================';
    PRINT 'Configuración:';
    PRINT '  * Data Source: metrics.Cashflows (MonedaHomologacion)';
    PRINT '  * Market Value Source: TBL_IPA (Inteligencia_Producto_Dev_16Dic)';
    PRINT '  * Processing: ALL (PK2, ID_Fund) combinations';
    PRINT '  * FX Normalization: Enabled';
    PRINT '  * Fecha Reporte: ' + CAST(@FechaReporte AS VARCHAR);
    PRINT '';

    -- ========================================================================
    -- PASO 0: FX RATE LOOKUP
    -- ========================================================================
    PRINT '========================================';
    PRINT 'CALCULANDO FX RATES';
    PRINT '========================================';

    IF OBJECT_ID('tempdb..#currency_fx') IS NOT NULL DROP TABLE #currency_fx;

    ;WITH DistinctCurrencies AS (
        SELECT DISTINCT moneda_local COLLATE SQL_Latin1_General_CP1_CI_AS AS moneda_local
        FROM [MonedaHomologacion].[metrics].[Cashflows]
        WHERE moneda_local IS NOT NULL
    ),
    CurrencyFXRates AS (
        SELECT
            dc.moneda_local,
            (SELECT TOP 1 flujo_usd / NULLIF(flujo_moneda_local, 0)
             FROM [MonedaHomologacion].[metrics].[Cashflows] cf
             WHERE cf.moneda_local COLLATE SQL_Latin1_General_CP1_CI_AS = dc.moneda_local
               AND cf.flujo_moneda_local != 0
               AND cf.flujo_usd != 0) AS fx_to_usd
        FROM DistinctCurrencies dc
    )
    SELECT
        moneda_local,
        ISNULL(fx_to_usd, 1.0) AS fx_to_usd
    INTO #currency_fx
    FROM CurrencyFXRates;

    CREATE CLUSTERED INDEX IX_currency_fx ON #currency_fx(moneda_local);

    -- Get instrument currency mapping (by PK2 only - cashflows shared)
    IF OBJECT_ID('tempdb..#instrument_currency') IS NOT NULL DROP TABLE #instrument_currency;

    SELECT DISTINCT
        pk2 COLLATE SQL_Latin1_General_CP1_CI_AS AS pk2,
        moneda_local COLLATE SQL_Latin1_General_CP1_CI_AS AS cashflow_currency
    INTO #instrument_currency
    FROM [MonedaHomologacion].[metrics].[Cashflows];

    CREATE CLUSTERED INDEX IX_instrument_currency ON #instrument_currency(pk2);

    DECLARE @total_currencies INT = (SELECT COUNT(*) FROM #currency_fx);
    PRINT 'Currencies found: ' + CAST(@total_currencies AS VARCHAR);

    -- ========================================================================
    -- PASO 1: GET PK2s WITH FUTURE CASHFLOWS
    -- ========================================================================
    IF OBJECT_ID('tempdb..#pk2_flujos') IS NOT NULL DROP TABLE #pk2_flujos;

    SELECT
        cf.pk2 COLLATE SQL_Latin1_General_CP1_CI_AS AS PK2,
        COUNT(*) AS total_flujos,
        MIN(cf.fecha) AS fecha_primer_flujo,
        MAX(cf.fecha) AS fecha_ultimo_flujo,
        SUM(cf.flujo_moneda_local) AS suma_flujos
    INTO #pk2_flujos
    FROM [MonedaHomologacion].[metrics].[Cashflows] cf
    WHERE cf.pk2 IS NOT NULL
      AND cf.flujo_moneda_local IS NOT NULL
      AND cf.flujo_moneda_local > 0
      AND cf.fecha IS NOT NULL
      AND cf.fecha > @FechaReporte
    GROUP BY cf.pk2
    HAVING COUNT(*) >= @min_cash_flows
       AND SUM(cf.flujo_moneda_local) > 0;

    CREATE CLUSTERED INDEX IX_pk2_flujos ON #pk2_flujos(PK2);

    DECLARE @total_pk2_flujos INT = (SELECT COUNT(*) FROM #pk2_flujos);
    PRINT 'PK2 with future cashflows: ' + CAST(@total_pk2_flujos AS VARCHAR);

    IF @total_pk2_flujos = 0
    BEGIN
        PRINT 'ERROR: No future cashflows found in metrics.Cashflows';
        RETURN;
    END;

    -- ========================================================================
    -- PASO 2: GET ALL (PK2, ID_Fund) COMBINATIONS FROM TBL_IPA
    -- ========================================================================
    PRINT '========================================';
    PRINT 'GETTING ALL FUND/INSTRUMENT PAIRS';
    PRINT '========================================';

    IF OBJECT_ID('tempdb..#ipa_data') IS NOT NULL DROP TABLE #ipa_data;

    SELECT
        ipa.PK2 COLLATE SQL_Latin1_General_CP1_CI_AS AS PK2,
        ipa.ID_Fund COLLATE SQL_Latin1_General_CP1_CI_AS AS ID_Fund,
        ipa.FechaReporte,
        ipa.BalanceSheet COLLATE SQL_Latin1_General_CP1_CI_AS AS BalanceSheet,
        ipa.TotalMVal,
        ipa.Qty,
        ipa.id_CURR,
        mon.Code_Supramoneda COLLATE SQL_Latin1_General_CP1_CI_AS AS ipa_currency,
        ic.cashflow_currency,
        cfx.fx_to_usd,
        -- NORMALIZED TotalMVal
        CASE
            WHEN mon.Code_Supramoneda COLLATE SQL_Latin1_General_CP1_CI_AS = ic.cashflow_currency THEN ipa.TotalMVal
            WHEN mon.Code_Supramoneda COLLATE SQL_Latin1_General_CP1_CI_AS = 'USD' AND ic.cashflow_currency != 'USD'
                THEN ipa.TotalMVal / NULLIF(cfx.fx_to_usd, 0)
            WHEN mon.Code_Supramoneda COLLATE SQL_Latin1_General_CP1_CI_AS != 'USD' AND ic.cashflow_currency = 'USD'
                THEN ipa.TotalMVal * cfx.fx_to_usd
            ELSE ipa.TotalMVal
        END AS TotalMVal_Normalized
    INTO #ipa_data
    FROM [Inteligencia_Producto_Dev_16Dic].[process].[TBL_IPA] ipa
    INNER JOIN #pk2_flujos pf ON pf.PK2 = ipa.PK2 COLLATE SQL_Latin1_General_CP1_CI_AS
    LEFT JOIN [MonedaHomologacion].[cat].[monedas] mon ON mon.id = ipa.id_CURR
    LEFT JOIN #instrument_currency ic ON ic.pk2 = ipa.PK2 COLLATE SQL_Latin1_General_CP1_CI_AS
    LEFT JOIN #currency_fx cfx ON cfx.moneda_local = ic.cashflow_currency
    WHERE ipa.PK2 IS NOT NULL
      AND ipa.TotalMVal IS NOT NULL
      AND ipa.TotalMVal > 0
      AND ipa.FechaReporte = @FechaReporte;

    CREATE CLUSTERED INDEX IX_ipa_data ON #ipa_data(PK2, ID_Fund);

    DECLARE @total_pairs INT = (SELECT COUNT(*) FROM #ipa_data);
    DECLARE @distinct_funds INT = (SELECT COUNT(DISTINCT ID_Fund) FROM #ipa_data);
    DECLARE @distinct_pk2 INT = (SELECT COUNT(DISTINCT PK2) FROM #ipa_data);
    PRINT 'Total (PK2, ID_Fund) pairs: ' + CAST(@total_pairs AS VARCHAR);
    PRINT '  Distinct funds: ' + CAST(@distinct_funds AS VARCHAR);
    PRINT '  Distinct PK2s: ' + CAST(@distinct_pk2 AS VARCHAR);

    IF @total_pairs = 0
    BEGIN
        PRINT 'ERROR: No matching records in TBL_IPA for this date';
        RETURN;
    END;

    -- ========================================================================
    -- PASO 3: BUILD INSTRUMENTS TABLE (composite key)
    -- ========================================================================
    IF OBJECT_ID('tempdb..#instrumentos') IS NOT NULL DROP TABLE #instrumentos;

    SELECT
        ipa.PK2,
        ipa.ID_Fund,
        ipa.FechaReporte,
        ipa.BalanceSheet,
        ipa.TotalMVal AS TotalMVal_Original,
        ipa.TotalMVal_Normalized AS TotalMVal,
        ipa.ipa_currency,
        ipa.cashflow_currency,
        ipa.fx_to_usd,
        ipa.Qty,
        pf.total_flujos,
        pf.suma_flujos,
        pf.fecha_primer_flujo,
        pf.fecha_ultimo_flujo,
        ipa.Qty / 1000000.0 AS normalization_factor
    INTO #instrumentos
    FROM #ipa_data ipa
    INNER JOIN #pk2_flujos pf ON pf.PK2 = ipa.PK2;

    CREATE CLUSTERED INDEX IX_inst ON #instrumentos(PK2, ID_Fund);

    DECLARE @total_instrumentos INT = (SELECT COUNT(*) FROM #instrumentos);
    PRINT 'Instruments to process: ' + CAST(@total_instrumentos AS VARCHAR);

    -- ========================================================================
    -- PASO 4: BUILD CASH FLOWS (composite key)
    -- ========================================================================
    IF OBJECT_ID('tempdb..#cash_flows') IS NOT NULL DROP TABLE #cash_flows;

    -- Investment at t=0: VARIES BY FUND (uses TotalMVal)
    SELECT
        inst.PK2,
        inst.ID_Fund,
        @FechaReporte AS Fecha,
        -inst.TotalMVal AS Flujo,
        0.0 AS time_years
    INTO #cash_flows
    FROM #instrumentos inst

    UNION ALL

    -- Future flows: SAME FOR ALL FUNDS (joined by PK2 only)
    SELECT
        inst.PK2,
        inst.ID_Fund,
        cf.fecha,
        cf.flujo_moneda_local * inst.normalization_factor AS Flujo,
        DATEDIFF(DAY, @FechaReporte, cf.fecha) / 365.0 AS time_years
    FROM [MonedaHomologacion].[metrics].[Cashflows] cf
    INNER JOIN #instrumentos inst ON inst.PK2 = cf.pk2 COLLATE SQL_Latin1_General_CP1_CI_AS
    WHERE cf.fecha > @FechaReporte
      AND cf.flujo_moneda_local IS NOT NULL
      AND cf.flujo_moneda_local > 0
      AND DATEDIFF(DAY, @FechaReporte, cf.fecha) / 365.0 <= 50;

    CREATE CLUSTERED INDEX IX_cf ON #cash_flows(PK2, ID_Fund);

    DECLARE @total_flujos INT = (SELECT COUNT(*) FROM #cash_flows);
    PRINT 'Cash flows created: ' + CAST(@total_flujos AS VARCHAR);

    -- ========================================================================
    -- PASO 4.3: DETECT LOSS POSITIONS
    -- ========================================================================
    IF OBJECT_ID('tempdb..#loss_positions') IS NOT NULL DROP TABLE #loss_positions;

    SELECT
        PK2,
        ID_Fund,
        SUM(Flujo) AS npv_at_zero
    INTO #loss_positions
    FROM #cash_flows
    GROUP BY PK2, ID_Fund
    HAVING SUM(Flujo) < 0;

    CREATE CLUSTERED INDEX IX_loss ON #loss_positions(PK2, ID_Fund);

    DECLARE @loss_count INT = (SELECT COUNT(*) FROM #loss_positions);
    PRINT 'Loss positions detected: ' + CAST(@loss_count AS VARCHAR);

    -- ========================================================================
    -- PASO 4.5: INFER PAYMENT FREQUENCY
    -- ========================================================================
    IF OBJECT_ID('tempdb..#coupon_frequency') IS NOT NULL DROP TABLE #coupon_frequency;

    ;WITH PaymentIntervals AS (
        SELECT
            cf.PK2,
            cf.ID_Fund,
            cf.Fecha,
            DATEDIFF(DAY,
                LAG(cf.Fecha) OVER (PARTITION BY cf.PK2, cf.ID_Fund ORDER BY cf.Fecha),
                cf.Fecha
            ) AS days_between_payments
        FROM #cash_flows cf
        WHERE cf.time_years > 0
    ),
    FrequencyCalc AS (
        SELECT
            PK2,
            ID_Fund,
            CASE
                WHEN AVG(CAST(days_between_payments AS FLOAT)) BETWEEN 80 AND 100 THEN 4.0
                WHEN AVG(CAST(days_between_payments AS FLOAT)) BETWEEN 160 AND 200 THEN 2.0
                WHEN AVG(CAST(days_between_payments AS FLOAT)) BETWEEN 350 AND 380 THEN 1.0
                WHEN AVG(CAST(days_between_payments AS FLOAT)) BETWEEN 25 AND 35 THEN 12.0
                WHEN AVG(CAST(days_between_payments AS FLOAT)) IS NULL THEN 1.0
                ELSE 2.0
            END AS cpn_freq,
            AVG(CAST(days_between_payments AS FLOAT)) AS avg_days_between,
            STDEV(CAST(days_between_payments AS FLOAT)) AS stdev_days_between
        FROM PaymentIntervals
        WHERE days_between_payments IS NOT NULL
        GROUP BY PK2, ID_Fund
    )
    SELECT
        COALESCE(fc.PK2, inst.PK2) AS PK2,
        COALESCE(fc.ID_Fund, inst.ID_Fund) AS ID_Fund,
        COALESCE(fc.cpn_freq, 1.0) AS cpn_freq,
        CASE
            WHEN fc.stdev_days_between IS NULL THEN 'Zero-Coupon'
            WHEN fc.stdev_days_between < 5 THEN 'Regular'
            WHEN fc.stdev_days_between < 15 THEN 'Mostly Regular'
            ELSE 'Irregular'
        END AS payment_pattern
    INTO #coupon_frequency
    FROM #instrumentos inst
    LEFT JOIN FrequencyCalc fc ON fc.PK2 = inst.PK2 AND fc.ID_Fund = inst.ID_Fund;

    CREATE CLUSTERED INDEX IX_freq ON #coupon_frequency(PK2, ID_Fund);

    -- ========================================================================
    -- PASO 5: YIELD OPTIMIZATION - IRR/EAR (Newton-Raphson with Bisection)
    -- ========================================================================
    -- Calculates EAR (Effective Annual Rate) where:
    --   NPV = Σ [Flujo / (1 + EAR)^time_years] = 0
    -- ========================================================================
    PRINT '========================================';
    PRINT 'YIELD OPTIMIZATION (EAR)';
    PRINT '========================================';

    IF OBJECT_ID('tempdb..#yield_results') IS NOT NULL DROP TABLE #yield_results;

    CREATE TABLE #yield_results (
        PK2 VARCHAR(100) NOT NULL,
        ID_Fund VARCHAR(50) NOT NULL,
        yield_rate_EAR FLOAT NULL,  -- Effective Annual Rate
        iterations INT NULL,
        method VARCHAR(20) NULL,
        convergence_status VARCHAR(50) NULL,
        final_npv FLOAT NULL,
        cpn_freq FLOAT NULL,
        PRIMARY KEY (PK2, ID_Fund)
    );

    -- Cursor variables
    DECLARE @pk2_cursor VARCHAR(100), @fund_cursor VARCHAR(50);
    DECLARE @yield FLOAT, @npv FLOAT, @derivative FLOAT;
    DECLARE @iter INT, @converged BIT;
    DECLARE @cpn_freq FLOAT;
    DECLARE @lower FLOAT, @upper FLOAT, @mid FLOAT;
    DECLARE @npv_lower FLOAT, @npv_mid FLOAT;
    DECLARE @method VARCHAR(20);
    DECLARE @is_loss_position BIT;

    DECLARE yield_cursor CURSOR LOCAL FAST_FORWARD FOR
        SELECT PK2, ID_Fund FROM #instrumentos;

    OPEN yield_cursor;
    FETCH NEXT FROM yield_cursor INTO @pk2_cursor, @fund_cursor;

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Get coupon frequency
        SELECT @cpn_freq = cpn_freq FROM #coupon_frequency
        WHERE PK2 = @pk2_cursor AND ID_Fund = @fund_cursor;
        SET @cpn_freq = ISNULL(@cpn_freq, 1.0);

        -- Check if loss position
        SET @is_loss_position = CASE
            WHEN EXISTS (SELECT 1 FROM #loss_positions WHERE PK2 = @pk2_cursor AND ID_Fund = @fund_cursor)
            THEN 1 ELSE 0 END;

        -- Initial guess
        SET @yield = CASE WHEN @is_loss_position = 1 THEN -0.05 ELSE @initial_guess END;
        SET @iter = 0;
        SET @converged = 0;
        SET @method = 'Newton';

        -- Newton-Raphson iteration for EAR
        -- NPV = Σ [CF / (1 + EAR)^t]
        -- dNPV/dEAR = Σ [-t × CF / (1 + EAR)^(t+1)]
        WHILE @iter < @max_newton_attempts AND @converged = 0
        BEGIN
            SELECT
                @npv = SUM(Flujo / POWER(1.0 + @yield, time_years)),
                @derivative = SUM(-time_years * Flujo / POWER(1.0 + @yield, time_years + 1.0))
            FROM #cash_flows
            WHERE PK2 = @pk2_cursor AND ID_Fund = @fund_cursor;

            IF ABS(@npv) < @epsilon OR ABS(@derivative) < @derivative_threshold
            BEGIN
                SET @converged = 1;
            END
            ELSE
            BEGIN
                SET @yield = @yield - @npv / @derivative;
                IF @yield < @lower_bound_initial OR @yield > @upper_bound_initial
                BEGIN
                    SET @converged = 0;
                    BREAK;
                END
            END
            SET @iter = @iter + 1;
        END

        -- Fallback to Bisection
        IF @converged = 0
        BEGIN
            SET @method = 'Bisection';
            SET @lower = @lower_bound_initial;
            SET @upper = @upper_bound_initial;
            SET @iter = 0;

            WHILE @iter < @max_iterations AND (@upper - @lower) > @bisection_tolerance
            BEGIN
                SET @mid = (@lower + @upper) / 2.0;

                SELECT @npv_mid = SUM(Flujo / POWER(1.0 + @mid, time_years))
                FROM #cash_flows
                WHERE PK2 = @pk2_cursor AND ID_Fund = @fund_cursor;

                IF @iter = 0
                BEGIN
                    SELECT @npv_lower = SUM(Flujo / POWER(1.0 + @lower, time_years))
                    FROM #cash_flows
                    WHERE PK2 = @pk2_cursor AND ID_Fund = @fund_cursor;
                END

                IF ABS(@npv_mid) < @npv_tolerance
                BEGIN
                    SET @yield = @mid;
                    SET @converged = 1;
                    BREAK;
                END

                IF (@npv_lower * @npv_mid) < 0
                    SET @upper = @mid;
                ELSE
                BEGIN
                    SET @lower = @mid;
                    SET @npv_lower = @npv_mid;
                END

                SET @iter = @iter + 1;
            END

            SET @yield = @mid;
            IF (@upper - @lower) <= @bisection_tolerance
                SET @converged = 1;
        END

        -- Store EAR result
        INSERT INTO #yield_results (PK2, ID_Fund, yield_rate_EAR, iterations, method, convergence_status, final_npv, cpn_freq)
        VALUES (
            @pk2_cursor,
            @fund_cursor,
            @yield,
            @iter,
            @method,
            CASE WHEN @converged = 1 THEN 'Converged' ELSE 'Max Iterations' END,
            @npv,
            @cpn_freq
        );

        FETCH NEXT FROM yield_cursor INTO @pk2_cursor, @fund_cursor;
    END

    CLOSE yield_cursor;
    DEALLOCATE yield_cursor;

    DECLARE @converged_count INT = (SELECT COUNT(*) FROM #yield_results WHERE convergence_status = 'Converged');
    PRINT 'EAR optimization complete: ' + CAST(@converged_count AS VARCHAR) + '/' + CAST(@total_instrumentos AS VARCHAR) + ' converged';

    -- ========================================================================
    -- PASO 6: CONVERT EAR TO PERIODIC RATE AND BEY
    -- ========================================================================
    -- periodic_rate = (1 + EAR)^(1/freq) - 1
    -- BEY = 2 × [(1 + EAR)^0.5 - 1]  (semi-annual convention)
    -- ========================================================================
    PRINT '========================================';
    PRINT 'CONVERTING TO PERIODIC RATE AND BEY';
    PRINT '========================================';

    IF OBJECT_ID('tempdb..#periodic_rates') IS NOT NULL DROP TABLE #periodic_rates;

    SELECT
        yr.PK2,
        yr.ID_Fund,
        yr.yield_rate_EAR,
        yr.cpn_freq,
        yr.convergence_status,
        yr.method,
        yr.iterations,
        -- Periodic rate: r_periodic = (1 + EAR)^(1/freq) - 1
        CASE
            WHEN yr.yield_rate_EAR > -1
            THEN POWER(1.0 + yr.yield_rate_EAR, 1.0 / yr.cpn_freq) - 1.0
            ELSE NULL
        END AS periodic_rate,
        -- BEY: Bond Equivalent Yield = 2 × [(1 + EAR)^0.5 - 1]
        CASE
            WHEN yr.yield_rate_EAR > -1
            THEN 2.0 * (POWER(1.0 + yr.yield_rate_EAR, 0.5) - 1.0)
            ELSE NULL
        END AS BEY
    INTO #periodic_rates
    FROM #yield_results yr
    WHERE yr.convergence_status = 'Converged';

    CREATE CLUSTERED INDEX IX_per_rates ON #periodic_rates(PK2, ID_Fund);

    DECLARE @periodic_count INT = (SELECT COUNT(*) FROM #periodic_rates WHERE periodic_rate IS NOT NULL);
    PRINT 'Periodic rates calculated: ' + CAST(@periodic_count AS VARCHAR);

    -- ========================================================================
    -- PASO 7: DURATION CALCULATION (using periodic rate)
    -- ========================================================================
    -- Discount with periodic rate: PV = CF / (1 + r_periodic)^(t × freq)
    -- Macaulay Duration (periods) = Σ(t_periods × PV) / Σ(PV)
    -- Macaulay Duration (years) = Mac_Dur_periods / freq
    -- Modified Duration = Mac_Dur_periods / (1 + r_periodic) / freq
    -- ========================================================================
    PRINT '========================================';
    PRINT 'DURATION CALCULATION (PERIODIC)';
    PRINT '========================================';

    -- First, calculate discounted cash flows using periodic rate
    IF OBJECT_ID('tempdb..#cash_flows_discounted') IS NOT NULL DROP TABLE #cash_flows_discounted;

    SELECT
        cf.PK2,
        cf.ID_Fund,
        cf.Fecha,
        cf.Flujo,
        cf.time_years,
        pr.cpn_freq,
        pr.periodic_rate,
        -- Time in periods
        cf.time_years * pr.cpn_freq AS time_periods,
        -- PV using periodic rate: PV = CF / (1 + r_periodic)^(t × freq)
        CASE
            WHEN (1.0 + pr.periodic_rate) > 0
            THEN cf.Flujo / POWER(1.0 + pr.periodic_rate, cf.time_years * pr.cpn_freq)
            ELSE NULL
        END AS pv_periodic
    INTO #cash_flows_discounted
    FROM #cash_flows cf
    INNER JOIN #periodic_rates pr ON pr.PK2 = cf.PK2 AND pr.ID_Fund = cf.ID_Fund
    WHERE cf.time_years > 0  -- Only future flows (exclude t=0 investment)
      AND pr.periodic_rate IS NOT NULL;

    CREATE CLUSTERED INDEX IX_cf_disc ON #cash_flows_discounted(PK2, ID_Fund);

    -- Calculate Duration
    IF OBJECT_ID('tempdb..#duration_results') IS NOT NULL DROP TABLE #duration_results;

    SELECT
        cfd.PK2,
        cfd.ID_Fund,
        cfd.cpn_freq,
        cfd.periodic_rate,
        -- Macaulay Duration in PERIODS
        SUM(cfd.time_periods * cfd.pv_periodic) / NULLIF(SUM(cfd.pv_periodic), 0) AS macaulay_duration_periods,
        -- Macaulay Duration in YEARS
        (SUM(cfd.time_periods * cfd.pv_periodic) / NULLIF(SUM(cfd.pv_periodic), 0)) / cfd.cpn_freq AS macaulay_duration_years,
        -- Modified Duration in PERIODS: Mac_Dur_periods / (1 + r_periodic)
        (SUM(cfd.time_periods * cfd.pv_periodic) / NULLIF(SUM(cfd.pv_periodic), 0))
            / NULLIF(1.0 + cfd.periodic_rate, 0) AS modified_duration_periods,
        -- Modified Duration in YEARS
        ((SUM(cfd.time_periods * cfd.pv_periodic) / NULLIF(SUM(cfd.pv_periodic), 0))
            / NULLIF(1.0 + cfd.periodic_rate, 0)) / cfd.cpn_freq AS modified_duration_years,
        -- Present Value (sum of discounted cash flows)
        SUM(cfd.pv_periodic) AS present_value
    INTO #duration_results
    FROM #cash_flows_discounted cfd
    GROUP BY cfd.PK2, cfd.ID_Fund, cfd.cpn_freq, cfd.periodic_rate
    HAVING SUM(cfd.pv_periodic) IS NOT NULL AND SUM(cfd.pv_periodic) != 0;

    CREATE CLUSTERED INDEX IX_dur ON #duration_results(PK2, ID_Fund);

    DECLARE @duration_count INT = (SELECT COUNT(*) FROM #duration_results);
    PRINT 'Duration calculated: ' + CAST(@duration_count AS VARCHAR);

    -- ========================================================================
    -- PASO 8: FINAL RESULTS
    -- ========================================================================
    IF OBJECT_ID('tempdb..#final_results') IS NOT NULL DROP TABLE #final_results;

    SELECT
        i.PK2,
        i.ID_Fund,
        i.FechaReporte,
        i.BalanceSheet,
        i.ipa_currency,
        i.cashflow_currency,
        i.fx_to_usd,
        i.TotalMVal_Original,
        i.TotalMVal AS TotalMVal_Normalized,
        i.Qty,
        i.total_flujos,
        freq.cpn_freq,
        freq.payment_pattern,
        -- Yield metrics
        pr.yield_rate_EAR,                          -- EAR (Effective Annual Rate)
        pr.yield_rate_EAR * 100 AS yield_EAR_pct,   -- EAR as percentage
        pr.periodic_rate,                            -- Periodic rate
        pr.BEY,                                      -- Bond Equivalent Yield
        pr.BEY * 100 AS yield_BEY_pct,              -- BEY as percentage (industry standard)
        -- Duration metrics (in years)
        dr.macaulay_duration_years AS macaulay_duration,
        dr.modified_duration_years AS modified_duration,
        dr.present_value,
        -- Optimization info
        pr.method AS optimization_method,
        pr.convergence_status,
        pr.iterations,
        'BBG' AS source
    INTO #final_results
    FROM #instrumentos i
    LEFT JOIN #coupon_frequency freq ON freq.PK2 = i.PK2 AND freq.ID_Fund = i.ID_Fund
    LEFT JOIN #periodic_rates pr ON pr.PK2 = i.PK2 AND pr.ID_Fund = i.ID_Fund
    LEFT JOIN #duration_results dr ON dr.PK2 = i.PK2 AND dr.ID_Fund = i.ID_Fund;

    CREATE CLUSTERED INDEX IX_final ON #final_results(PK2, ID_Fund);

    DECLARE @final_count INT = (SELECT COUNT(*) FROM #final_results);
    PRINT 'Final results: ' + CAST(@final_count AS VARCHAR) + ' records';

    -- ========================================================================
    -- PASO 8: SAVE TO metrics.Metrics WITH VERSIONING
    -- ========================================================================
    PRINT '========================================';
    PRINT 'SAVING TO metrics.Metrics';
    PRINT '========================================';

    DECLARE @inserted INT = 0, @updated INT = 0, @skipped INT = 0;

    -- Mark changed records as invalid (compare BEY as primary yield metric)
    UPDATE m
    SET m.validity = 'No'
    FROM [metrics].[Metrics] m
    INNER JOIN #final_results n
        ON n.PK2 COLLATE SQL_Latin1_General_CP1_CI_AS = m.PK2 COLLATE SQL_Latin1_General_CP1_CI_AS
        AND n.ID_Fund COLLATE SQL_Latin1_General_CP1_CI_AS = m.ID_Fund COLLATE SQL_Latin1_General_CP1_CI_AS
        AND n.FechaReporte = m.FechaReporte
    WHERE m.validity = 'Yes'
      AND (
          ABS(ISNULL(n.BEY, 0) - ISNULL(m.BEY, 0)) > @change_epsilon
          OR ABS(ISNULL(n.modified_duration, 0) - ISNULL(m.modified_duration, 0)) > @change_epsilon
          OR ABS(ISNULL(n.TotalMVal_Normalized, 0) - ISNULL(m.TotalMVal_Normalized, 0)) > 0.01
      );

    SET @updated = @@ROWCOUNT;

    -- Insert new records (including changed ones that were just invalidated)
    INSERT INTO [metrics].[Metrics] (
        PK2, ID_Fund, FechaReporte, BalanceSheet, ipa_currency, cashflow_currency, fx_to_usd,
        TotalMVal_Original, TotalMVal_Normalized, Qty, total_flujos, cpn_freq, payment_pattern,
        yield_rate_EAR, yield_EAR_pct, periodic_rate, BEY, yield_BEY_pct,
        macaulay_duration, modified_duration, present_value,
        optimization_method, convergence_status, iterations, source, processed_date, validity
    )
    SELECT
        n.PK2, n.ID_Fund, n.FechaReporte, n.BalanceSheet, n.ipa_currency, n.cashflow_currency, n.fx_to_usd,
        n.TotalMVal_Original, n.TotalMVal_Normalized, n.Qty, n.total_flujos, n.cpn_freq, n.payment_pattern,
        n.yield_rate_EAR, n.yield_EAR_pct, n.periodic_rate, n.BEY, n.yield_BEY_pct,
        n.macaulay_duration, n.modified_duration, n.present_value,
        n.optimization_method, n.convergence_status, n.iterations, n.source, GETDATE(), 'Yes'
    FROM #final_results n
    WHERE NOT EXISTS (
        SELECT 1 FROM [metrics].[Metrics] m
        WHERE m.PK2 COLLATE SQL_Latin1_General_CP1_CI_AS = n.PK2 COLLATE SQL_Latin1_General_CP1_CI_AS
          AND m.ID_Fund COLLATE SQL_Latin1_General_CP1_CI_AS = n.ID_Fund COLLATE SQL_Latin1_General_CP1_CI_AS
          AND m.FechaReporte = n.FechaReporte
          AND m.validity = 'Yes'
    );

    SET @inserted = @@ROWCOUNT;
    SET @skipped = @final_count - @inserted;

    PRINT 'Inserted: ' + CAST(@inserted AS VARCHAR);
    PRINT 'Updated (invalidated old): ' + CAST(@updated AS VARCHAR);
    PRINT 'Skipped (unchanged): ' + CAST(@skipped AS VARCHAR);

    -- ========================================================================
    -- CLEANUP
    -- ========================================================================
    DROP TABLE IF EXISTS #currency_fx;
    DROP TABLE IF EXISTS #instrument_currency;
    DROP TABLE IF EXISTS #pk2_flujos;
    DROP TABLE IF EXISTS #ipa_data;
    DROP TABLE IF EXISTS #instrumentos;
    DROP TABLE IF EXISTS #cash_flows;
    DROP TABLE IF EXISTS #loss_positions;
    DROP TABLE IF EXISTS #coupon_frequency;
    DROP TABLE IF EXISTS #yield_results;
    DROP TABLE IF EXISTS #periodic_rates;
    DROP TABLE IF EXISTS #cash_flows_discounted;
    DROP TABLE IF EXISTS #duration_results;
    DROP TABLE IF EXISTS #final_results;

    PRINT '';
    PRINT '========================================';
    PRINT 'CALCULATION COMPLETE';
    PRINT '========================================';

END
GO

PRINT 'Stored procedure created: metrics.sp_CalculateMetrics';
PRINT '';
PRINT 'Usage:';
PRINT '  EXEC [metrics].[sp_CalculateMetrics] @FechaReporte = ''2025-09-30'';';
PRINT '';
PRINT 'Check results:';
PRINT '  SELECT * FROM [metrics].[Metrics] WHERE FechaReporte = ''2025-09-30'' AND validity = ''Yes'';';
GO
