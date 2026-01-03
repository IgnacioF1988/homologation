/*
================================================================================
SP: staging.sp_EnsureSchema
================================================================================
Descripcion: Verifica y crea schemas y tablas fisicas necesarias para el pipeline.
             Ejecutar UNA VEZ al deployar o para verificar integridad.

IMPORTANTE: Las definiciones aqui deben ser IDENTICAS a los scripts DDL:
            - CORE/00_Tables_Sandbox.sql
            - CORE/00_Tables_Process.sql
            - CORE/00_Tables_Staging.sql

Autor: Refactorizacion Pipeline IPA
Fecha: 2026-01-02
================================================================================
*/

CREATE OR ALTER PROCEDURE [staging].[sp_EnsureSchema]
AS
BEGIN
    SET NOCOUNT ON;

    BEGIN TRY
        -- =====================================================================
        -- CREAR SCHEMAS SI NO EXISTEN
        -- =====================================================================

        IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'config')
            EXEC('CREATE SCHEMA config');

        IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'staging')
            EXEC('CREATE SCHEMA staging');

        IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'process')
            EXEC('CREATE SCHEMA process');

        IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'extract')
            EXEC('CREATE SCHEMA extract');

        IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'sandbox')
            EXEC('CREATE SCHEMA sandbox');

        IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'dimensionales')
            EXEC('CREATE SCHEMA dimensionales');

        PRINT 'Schemas verificados/creados correctamente';

        -- =====================================================================
        -- CONFIG: Umbrales_Ajuste
        -- =====================================================================
        IF OBJECT_ID('config.Umbrales_Ajuste', 'U') IS NULL
        BEGIN
            CREATE TABLE config.Umbrales_Ajuste (
                ID INT IDENTITY(1,1) PRIMARY KEY,
                ID_Fund INT NULL,
                Fuente NVARCHAR(50) NOT NULL,
                Umbral DECIMAL(18,4) NOT NULL DEFAULT 1.0,
                FechaVigencia DATE NOT NULL DEFAULT GETDATE(),
                Activo BIT NOT NULL DEFAULT 1,
                FechaCreacion DATETIME NOT NULL DEFAULT GETDATE(),
                CONSTRAINT UQ_Umbral_Fund_Fuente UNIQUE (ID_Fund, Fuente, FechaVigencia)
            );

            INSERT INTO config.Umbrales_Ajuste (ID_Fund, Fuente, Umbral)
            VALUES
                (NULL, 'CAPM', 1.0),
                (NULL, 'DERIVADOS', 1.0),
                (NULL, 'PARIDADES', 0.01),
                (NULL, 'SONA', 1.0);

            PRINT 'Tabla config.Umbrales_Ajuste creada con valores por defecto';
        END

        -- =====================================================================
        -- STAGING: Log_Ajustes
        -- =====================================================================
        IF OBJECT_ID('staging.Log_Ajustes', 'U') IS NULL
        BEGIN
            CREATE TABLE staging.Log_Ajustes (
                ID BIGINT IDENTITY(1,1) PRIMARY KEY,
                ID_Ejecucion BIGINT NOT NULL,
                ID_Proceso BIGINT NOT NULL,
                ID_Fund INT NOT NULL,
                FechaReporte NVARCHAR(10) NOT NULL,
                TipoAjuste NVARCHAR(50) NOT NULL,
                PK2 NVARCHAR(50) NOT NULL,
                ID_Instrumento INT NOT NULL,
                id_CURR INT NOT NULL,
                BalanceSheet NVARCHAR(20) NOT NULL,
                Source NVARCHAR(50) NOT NULL,
                MVBook DECIMAL(18,4) NOT NULL,
                TotalMVal DECIMAL(18,4) NOT NULL,
                TotalMVal_Balance DECIMAL(18,4) NOT NULL,
                ValorOriginal DECIMAL(18,4) NULL,
                ValorComparado DECIMAL(18,4) NULL,
                Diferencia DECIMAL(18,4) NULL,
                UmbralAplicado DECIMAL(18,4) NULL,
                FechaProceso DATETIME NOT NULL DEFAULT GETDATE(),
                INDEX IX_Log_Ajustes_Ejecucion (ID_Ejecucion, ID_Fund),
                INDEX IX_Log_Ajustes_Fecha (FechaReporte, TipoAjuste)
            );
            PRINT 'Tabla staging.Log_Ajustes creada';
        END

        -- =====================================================================
        -- SANDBOX: Homologacion_Fondos
        -- =====================================================================
        IF OBJECT_ID('sandbox.Homologacion_Fondos', 'U') IS NULL
        BEGIN
            CREATE TABLE sandbox.Homologacion_Fondos (
                ID BIGINT IDENTITY(1,1) PRIMARY KEY,
                ID_Ejecucion BIGINT NULL,
                FechaReporte NVARCHAR(10) NOT NULL,
                Fondo NVARCHAR(100) NOT NULL,
                Source NVARCHAR(50) NOT NULL,
                FechaProceso DATETIME NOT NULL DEFAULT GETDATE(),
                INDEX IX_Homologacion_Fondos_Ejecucion (ID_Ejecucion, FechaReporte, Fondo, Source),
                INDEX IX_Homologacion_Fondos_Fecha (FechaReporte, Source),
                CONSTRAINT UQ_Homologacion_Fondos UNIQUE (ID_Ejecucion, FechaReporte, Fondo, Source)
            );
            PRINT 'Tabla sandbox.Homologacion_Fondos creada';
        END

        -- =====================================================================
        -- SANDBOX: Homologacion_Instrumentos
        -- =====================================================================
        IF OBJECT_ID('sandbox.Homologacion_Instrumentos', 'U') IS NULL
        BEGIN
            CREATE TABLE sandbox.Homologacion_Instrumentos (
                ID BIGINT IDENTITY(1,1) PRIMARY KEY,
                ID_Ejecucion BIGINT NULL,
                FechaReporte NVARCHAR(10) NOT NULL,
                Instrumento NVARCHAR(255) NOT NULL,
                Currency NVARCHAR(50) NULL,
                Source NVARCHAR(50) NOT NULL,
                FechaProceso DATETIME NOT NULL DEFAULT GETDATE(),
                INDEX IX_Homologacion_Instrumentos_Ejecucion (ID_Ejecucion, FechaReporte, Instrumento, Source),
                INDEX IX_Homologacion_Instrumentos_Fecha (FechaReporte, Source),
                CONSTRAINT UQ_Homologacion_Instrumentos UNIQUE (ID_Ejecucion, FechaReporte, Instrumento, Source)
            );
            PRINT 'Tabla sandbox.Homologacion_Instrumentos creada';
        END

        -- =====================================================================
        -- SANDBOX: Homologacion_Monedas
        -- =====================================================================
        IF OBJECT_ID('sandbox.Homologacion_Monedas', 'U') IS NULL
        BEGIN
            CREATE TABLE sandbox.Homologacion_Monedas (
                ID BIGINT IDENTITY(1,1) PRIMARY KEY,
                ID_Ejecucion BIGINT NULL,
                FechaReporte NVARCHAR(10) NOT NULL,
                Moneda NVARCHAR(50) NOT NULL,
                Source NVARCHAR(50) NOT NULL,
                FechaProceso DATETIME NOT NULL DEFAULT GETDATE(),
                INDEX IX_Homologacion_Monedas_Ejecucion (ID_Ejecucion, FechaReporte, Moneda, Source),
                INDEX IX_Homologacion_Monedas_Fecha (FechaReporte, Source),
                CONSTRAINT UQ_Homologacion_Monedas UNIQUE (ID_Ejecucion, FechaReporte, Moneda, Source)
            );
            PRINT 'Tabla sandbox.Homologacion_Monedas creada';
        END

        -- =====================================================================
        -- SANDBOX: Homologacion_Benchmarks
        -- =====================================================================
        IF OBJECT_ID('sandbox.Homologacion_Benchmarks', 'U') IS NULL
        BEGIN
            CREATE TABLE sandbox.Homologacion_Benchmarks (
                ID BIGINT IDENTITY(1,1) PRIMARY KEY,
                ID_Ejecucion BIGINT NULL,
                FechaReporte NVARCHAR(10) NOT NULL,
                Benchmark NVARCHAR(100) NOT NULL,
                Source NVARCHAR(50) NOT NULL,
                FechaProceso DATETIME NOT NULL DEFAULT GETDATE(),
                INDEX IX_Homologacion_Benchmarks_Fecha (FechaReporte, Source)
            );
            PRINT 'Tabla sandbox.Homologacion_Benchmarks creada';
        END

        -- =====================================================================
        -- SANDBOX: Fondos_Problema
        -- =====================================================================
        IF OBJECT_ID('sandbox.Fondos_Problema', 'U') IS NULL
        BEGIN
            CREATE TABLE sandbox.Fondos_Problema (
                ID BIGINT IDENTITY(1,1) PRIMARY KEY,
                FechaReporte NVARCHAR(10) NOT NULL,
                ID_Fund NVARCHAR(50) NOT NULL,
                Proceso NVARCHAR(50) NOT NULL,
                Tipo_Problema NVARCHAR(100) NOT NULL,
                Detalle NVARCHAR(MAX) NULL,
                FechaProceso DATETIME NOT NULL DEFAULT GETDATE(),
                INDEX IX_Fondos_Problema_Fecha (FechaReporte, Proceso)
            );
            PRINT 'Tabla sandbox.Fondos_Problema creada';
        END

        -- =====================================================================
        -- SANDBOX: Alertas_Descuadre_Cash
        -- =====================================================================
        IF OBJECT_ID('sandbox.Alertas_Descuadre_Cash', 'U') IS NULL
        BEGIN
            CREATE TABLE sandbox.Alertas_Descuadre_Cash (
                ID BIGINT IDENTITY(1,1) PRIMARY KEY,
                ID_Ejecucion BIGINT NOT NULL,
                ID_Fund INT NOT NULL,
                FechaReporte NVARCHAR(10) NOT NULL,
                Portfolio NVARCHAR(100) NOT NULL,
                Total_IPA_Cash DECIMAL(18,4) NOT NULL,
                Total_CAPM DECIMAL(18,4) NOT NULL,
                Diferencia DECIMAL(18,4) NOT NULL,
                UmbralAplicado DECIMAL(18,4) NOT NULL,
                FechaProceso DATETIME NOT NULL DEFAULT GETDATE(),
                INDEX IX_Alertas_Descuadre_Cash_Fecha (FechaReporte, ID_Fund),
                CONSTRAINT UQ_Alertas_Descuadre_Cash UNIQUE (ID_Ejecucion, ID_Fund, FechaReporte)
            );
            PRINT 'Tabla sandbox.Alertas_Descuadre_Cash creada';
        END

        -- =====================================================================
        -- SANDBOX: Alertas_Descuadre_Derivados
        -- =====================================================================
        IF OBJECT_ID('sandbox.Alertas_Descuadre_Derivados', 'U') IS NULL
        BEGIN
            CREATE TABLE sandbox.Alertas_Descuadre_Derivados (
                ID BIGINT IDENTITY(1,1) PRIMARY KEY,
                ID_Ejecucion BIGINT NOT NULL,
                ID_Fund INT NOT NULL,
                FechaReporte NVARCHAR(10) NOT NULL,
                Portfolio NVARCHAR(100) NOT NULL,
                MVBook_IPA DECIMAL(18,4) NOT NULL,
                MTM_Derivados DECIMAL(18,4) NOT NULL,
                Diferencia DECIMAL(18,4) NOT NULL,
                UmbralAplicado DECIMAL(18,4) NOT NULL,
                FechaProceso DATETIME NOT NULL DEFAULT GETDATE(),
                INDEX IX_Alertas_Descuadre_Derivados_Fecha (FechaReporte, ID_Fund),
                CONSTRAINT UQ_Alertas_Descuadre_Derivados UNIQUE (ID_Ejecucion, ID_Fund, FechaReporte)
            );
            PRINT 'Tabla sandbox.Alertas_Descuadre_Derivados creada';
        END

        -- =====================================================================
        -- SANDBOX: Alertas_Descuadre_NAV
        -- =====================================================================
        IF OBJECT_ID('sandbox.Alertas_Descuadre_NAV', 'U') IS NULL
        BEGIN
            CREATE TABLE sandbox.Alertas_Descuadre_NAV (
                ID BIGINT IDENTITY(1,1) PRIMARY KEY,
                ID_Ejecucion BIGINT NOT NULL,
                ID_Fund INT NOT NULL,
                FechaReporte NVARCHAR(10) NOT NULL,
                Portfolio NVARCHAR(100) NOT NULL,
                Total_IPA DECIMAL(18,4) NOT NULL,
                Total_SONA DECIMAL(18,4) NOT NULL,
                Diferencia DECIMAL(18,4) NOT NULL,
                UmbralAplicado DECIMAL(18,4) NOT NULL,
                FechaProceso DATETIME NOT NULL DEFAULT GETDATE(),
                INDEX IX_Alertas_Descuadre_NAV_Fecha (FechaReporte, ID_Fund),
                CONSTRAINT UQ_Alertas_Descuadre_NAV UNIQUE (ID_Ejecucion, ID_Fund, FechaReporte)
            );
            PRINT 'Tabla sandbox.Alertas_Descuadre_NAV creada';
        END

        -- =====================================================================
        -- SANDBOX: Alertas_Extract_Faltante
        -- =====================================================================
        IF OBJECT_ID('sandbox.Alertas_Extract_Faltante', 'U') IS NULL
        BEGIN
            CREATE TABLE sandbox.Alertas_Extract_Faltante (
                ID BIGINT IDENTITY(1,1) PRIMARY KEY,
                ID_Ejecucion BIGINT NOT NULL,
                ID_Fund INT NOT NULL,
                FechaReporte NVARCHAR(10) NOT NULL,
                TipoReporte NVARCHAR(50) NOT NULL,
                Obligatorio BIT NOT NULL DEFAULT 1,
                FechaProceso DATETIME NOT NULL DEFAULT GETDATE(),
                INDEX IX_Alertas_Extract_Faltante_Fecha (FechaReporte, ID_Fund),
                INDEX IX_Alertas_Extract_Faltante_Tipo (TipoReporte, FechaReporte),
                CONSTRAINT UQ_Alertas_Extract_Faltante UNIQUE (ID_Ejecucion, ID_Fund, FechaReporte, TipoReporte)
            );
            PRINT 'Tabla sandbox.Alertas_Extract_Faltante creada';
        END

        -- =====================================================================
        -- SANDBOX: Alertas_Suciedades_IPA
        -- =====================================================================
        IF OBJECT_ID('sandbox.Alertas_Suciedades_IPA', 'U') IS NULL
        BEGIN
            CREATE TABLE sandbox.Alertas_Suciedades_IPA (
                ID BIGINT IDENTITY(1,1) PRIMARY KEY,
                ID_Ejecucion BIGINT NOT NULL,
                ID_Fund INT NOT NULL,
                FechaReporte NVARCHAR(10) NOT NULL,
                InvestID NVARCHAR(255) NOT NULL,
                InvestDescription NVARCHAR(500) NULL,
                Qty DECIMAL(18,6) NULL,
                MVBook DECIMAL(18,4) NULL,
                AI DECIMAL(18,4) NULL,
                FechaProceso DATETIME NOT NULL DEFAULT GETDATE(),
                INDEX IX_Alertas_Suciedades_IPA_Fecha (FechaReporte, ID_Fund),
                CONSTRAINT UQ_Alertas_Suciedades_IPA UNIQUE (ID_Ejecucion, ID_Fund, FechaReporte, InvestID)
            );
            PRINT 'Tabla sandbox.Alertas_Suciedades_IPA creada';
        END

        -- =====================================================================
        -- PROCESS: CUBO_Final
        -- =====================================================================
        IF OBJECT_ID('process.CUBO_Final', 'U') IS NULL
        BEGIN
            CREATE TABLE process.CUBO_Final (
                ID BIGINT IDENTITY(1,1) PRIMARY KEY,
                ID_Ejecucion BIGINT NOT NULL,
                ID_Proceso BIGINT NOT NULL,
                ID_Fund INT NOT NULL,
                PK2 NVARCHAR(50) NOT NULL,
                ID_Instrumento INT NOT NULL,
                id_CURR INT NOT NULL,
                FechaReporte NVARCHAR(10) NOT NULL,
                FechaCartera NVARCHAR(10) NOT NULL,
                BalanceSheet NVARCHAR(20) NOT NULL,
                Source NVARCHAR(50) NOT NULL,
                TipoRegistro NVARCHAR(50) NOT NULL,
                LocalPrice DECIMAL(18,6) NULL,
                Qty DECIMAL(18,6) NULL,
                OriginalFace DECIMAL(18,4) NULL,
                Factor DECIMAL(18,6) NULL,
                AI DECIMAL(18,4) NULL,
                MVBook DECIMAL(18,4) NULL,
                TotalMVal DECIMAL(18,4) NULL,
                TotalMVal_Balance DECIMAL(18,4) NULL,
                PRgain DECIMAL(18,4) NULL,
                PUgain DECIMAL(18,4) NULL,
                FxRgain DECIMAL(18,4) NULL,
                FxUgain DECIMAL(18,4) NULL,
                Income DECIMAL(18,4) NULL,
                TotGL DECIMAL(18,4) NULL,
                PctGL DECIMAL(18,6) NULL,
                BasisPoint DECIMAL(18,6) NULL,
                FechaProceso DATETIME NOT NULL DEFAULT GETDATE(),
                INDEX IX_CUBO_Final_Ejecucion (ID_Ejecucion),
                INDEX IX_CUBO_Final_Fund (ID_Fund, FechaReporte),
                INDEX IX_CUBO_Final_PK2 (PK2),
                INDEX IX_CUBO_Final_Fecha (FechaReporte, ID_Fund),
                INDEX IX_CUBO_Final_Concurrency (ID_Ejecucion, ID_Proceso, ID_Fund, FechaReporte)
            );
            PRINT 'Tabla process.CUBO_Final creada';
        END

        PRINT '========================================';
        PRINT 'sp_EnsureSchema: COMPLETADO';
        PRINT '========================================';

        RETURN 0;

    END TRY
    BEGIN CATCH
        PRINT 'ERROR en sp_EnsureSchema: ' + ERROR_MESSAGE();
        RETURN 3;
    END CATCH
END;
GO
