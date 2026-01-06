/*
================================================================================
STORED PROCEDURES: Marcar Items como Ok
================================================================================
Descripcion: SPs para que el operador marque items como resueltos.
             Cuando se marca Ok, el item deja de aparecer en validaciones
             para TODOS los fondos que lo compartian.

SPs:
  - sp_MarcarInstrumentoOk: Marca un instrumento como resuelto
  - sp_MarcarMonedaOk: Marca una moneda como resuelta
  - sp_MarcarFondoOk: Marca un fondo como resuelto
  - sp_MarcarSuciedadOk: Marca una suciedad como resuelta
  - sp_MarcarTodosOk: Marca multiples items de un tipo como Ok

Autor: Refactorizacion Pipeline IPA
Fecha: 2026-01-05
================================================================================
*/

-- ============================================================================
-- SP: sp_MarcarInstrumentoOk
-- Marca un instrumento como resuelto por (Instrumento + Source)
-- ============================================================================
CREATE OR ALTER PROCEDURE sandbox.sp_MarcarInstrumentoOk
    @Instrumento NVARCHAR(100),
    @Source NVARCHAR(50),
    @Usuario NVARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @AffectedRows INT;
    DECLARE @UsuarioFinal NVARCHAR(100) = ISNULL(@Usuario, SYSTEM_USER);

    UPDATE sandbox.Homologacion_Instrumentos
    SET Estado = 'Ok',
        Usuario = @UsuarioFinal,
        FechaOk = GETDATE()
    WHERE Instrumento = @Instrumento
      AND Source = @Source
      AND Estado = 'Pendiente';

    SET @AffectedRows = @@ROWCOUNT;

    IF @AffectedRows = 0
    BEGIN
        PRINT 'ADVERTENCIA: No se encontro instrumento pendiente: ' + @Instrumento + ' (Source: ' + @Source + ')';
        RETURN 1;
    END

    PRINT 'OK: Instrumento marcado como resuelto: ' + @Instrumento + ' (Source: ' + @Source + ') por ' + @UsuarioFinal;
    RETURN 0;
END
GO

PRINT 'SP [sandbox].[sp_MarcarInstrumentoOk] creado';
GO

-- ============================================================================
-- SP: sp_MarcarMonedaOk
-- Marca una moneda como resuelta por (Moneda + Source)
-- ============================================================================
CREATE OR ALTER PROCEDURE sandbox.sp_MarcarMonedaOk
    @Moneda NVARCHAR(50),
    @Source NVARCHAR(50),
    @Usuario NVARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @AffectedRows INT;
    DECLARE @UsuarioFinal NVARCHAR(100) = ISNULL(@Usuario, SYSTEM_USER);

    UPDATE sandbox.Homologacion_Monedas
    SET Estado = 'Ok',
        Usuario = @UsuarioFinal,
        FechaOk = GETDATE()
    WHERE Moneda = @Moneda
      AND Source = @Source
      AND Estado = 'Pendiente';

    SET @AffectedRows = @@ROWCOUNT;

    IF @AffectedRows = 0
    BEGIN
        PRINT 'ADVERTENCIA: No se encontro moneda pendiente: ' + @Moneda + ' (Source: ' + @Source + ')';
        RETURN 1;
    END

    PRINT 'OK: Moneda marcada como resuelta: ' + @Moneda + ' (Source: ' + @Source + ') por ' + @UsuarioFinal;
    RETURN 0;
END
GO

PRINT 'SP [sandbox].[sp_MarcarMonedaOk] creado';
GO

-- ============================================================================
-- SP: sp_MarcarFondoOk
-- Marca un fondo (portfolio) como resuelto por (NombreFondo + Source)
-- ============================================================================
CREATE OR ALTER PROCEDURE sandbox.sp_MarcarFondoOk
    @NombreFondo NVARCHAR(100),
    @Source NVARCHAR(50),
    @Usuario NVARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @AffectedRows INT;
    DECLARE @UsuarioFinal NVARCHAR(100) = ISNULL(@Usuario, SYSTEM_USER);

    UPDATE sandbox.Homologacion_Fondos
    SET Estado = 'Ok',
        Usuario = @UsuarioFinal,
        FechaOk = GETDATE()
    WHERE NombreFondo = @NombreFondo
      AND Source = @Source
      AND Estado = 'Pendiente';

    SET @AffectedRows = @@ROWCOUNT;

    IF @AffectedRows = 0
    BEGIN
        PRINT 'ADVERTENCIA: No se encontro fondo pendiente: ' + @NombreFondo + ' (Source: ' + @Source + ')';
        RETURN 1;
    END

    PRINT 'OK: Fondo marcado como resuelto: ' + @NombreFondo + ' (Source: ' + @Source + ') por ' + @UsuarioFinal;
    RETURN 0;
END
GO

PRINT 'SP [sandbox].[sp_MarcarFondoOk] creado';
GO

-- ============================================================================
-- SP: sp_MarcarSuciedadOk
-- Marca una suciedad como resuelta por ID
-- ============================================================================
CREATE OR ALTER PROCEDURE sandbox.sp_MarcarSuciedadOk
    @ID_Suciedad BIGINT,
    @Usuario NVARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @AffectedRows INT;
    DECLARE @UsuarioFinal NVARCHAR(100) = ISNULL(@Usuario, SYSTEM_USER);
    DECLARE @InvestID NVARCHAR(100);

    SELECT @InvestID = InvestID FROM sandbox.Alertas_Suciedades_IPA WHERE ID = @ID_Suciedad;

    UPDATE sandbox.Alertas_Suciedades_IPA
    SET Estado = 'Ok',
        Usuario = @UsuarioFinal,
        FechaOk = GETDATE()
    WHERE ID = @ID_Suciedad
      AND Estado = 'Pendiente';

    SET @AffectedRows = @@ROWCOUNT;

    IF @AffectedRows = 0
    BEGIN
        PRINT 'ADVERTENCIA: No se encontro suciedad pendiente con ID: ' + CAST(@ID_Suciedad AS NVARCHAR(20));
        RETURN 1;
    END

    PRINT 'OK: Suciedad marcada como resuelta: ' + ISNULL(@InvestID, 'N/A') + ' (ID: ' + CAST(@ID_Suciedad AS NVARCHAR(20)) + ') por ' + @UsuarioFinal;
    RETURN 0;
END
GO

PRINT 'SP [sandbox].[sp_MarcarSuciedadOk] creado';
GO

-- ============================================================================
-- SP: sp_MarcarSuciedadOkPorInvestID
-- Marca una suciedad como resuelta por InvestID (marca todas las que coincidan)
-- ============================================================================
CREATE OR ALTER PROCEDURE sandbox.sp_MarcarSuciedadOkPorInvestID
    @InvestID NVARCHAR(100),
    @Usuario NVARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @AffectedRows INT;
    DECLARE @UsuarioFinal NVARCHAR(100) = ISNULL(@Usuario, SYSTEM_USER);

    UPDATE sandbox.Alertas_Suciedades_IPA
    SET Estado = 'Ok',
        Usuario = @UsuarioFinal,
        FechaOk = GETDATE()
    WHERE InvestID = @InvestID
      AND Estado = 'Pendiente';

    SET @AffectedRows = @@ROWCOUNT;

    IF @AffectedRows = 0
    BEGIN
        PRINT 'ADVERTENCIA: No se encontraron suciedades pendientes para: ' + @InvestID;
        RETURN 1;
    END

    PRINT 'OK: ' + CAST(@AffectedRows AS NVARCHAR(10)) + ' suciedad(es) marcada(s) como resuelta(s) para: ' + @InvestID + ' por ' + @UsuarioFinal;
    RETURN 0;
END
GO

PRINT 'SP [sandbox].[sp_MarcarSuciedadOkPorInvestID] creado';
GO

-- ============================================================================
-- SP: sp_MarcarMultiplesInstrumentosOk
-- Marca multiples instrumentos como resueltos (para operaciones masivas)
-- Recibe una tabla de instrumentos via TVP
-- ============================================================================

-- Primero crear el tipo de tabla
IF TYPE_ID('sandbox.TVP_Instrumentos') IS NOT NULL
    DROP TYPE sandbox.TVP_Instrumentos;
GO

CREATE TYPE sandbox.TVP_Instrumentos AS TABLE (
    Instrumento NVARCHAR(100) NOT NULL,
    Source NVARCHAR(50) NOT NULL
);
GO

CREATE OR ALTER PROCEDURE sandbox.sp_MarcarMultiplesInstrumentosOk
    @Instrumentos sandbox.TVP_Instrumentos READONLY,
    @Usuario NVARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @AffectedRows INT;
    DECLARE @UsuarioFinal NVARCHAR(100) = ISNULL(@Usuario, SYSTEM_USER);

    UPDATE h
    SET h.Estado = 'Ok',
        h.Usuario = @UsuarioFinal,
        h.FechaOk = GETDATE()
    FROM sandbox.Homologacion_Instrumentos h
    INNER JOIN @Instrumentos i ON h.Instrumento = i.Instrumento AND h.Source = i.Source
    WHERE h.Estado = 'Pendiente';

    SET @AffectedRows = @@ROWCOUNT;

    PRINT 'OK: ' + CAST(@AffectedRows AS NVARCHAR(10)) + ' instrumento(s) marcado(s) como resuelto(s) por ' + @UsuarioFinal;
    RETURN 0;
END
GO

PRINT 'SP [sandbox].[sp_MarcarMultiplesInstrumentosOk] creado';
GO

-- ============================================================================
-- SP: sp_MarcarTodosPendientesOkPorFondo
-- Marca TODOS los items pendientes de un fondo como Ok
-- USAR CON CUIDADO - solo para casos excepcionales
-- ============================================================================
CREATE OR ALTER PROCEDURE sandbox.sp_MarcarTodosPendientesOkPorFondo
    @ID_Fund INT,
    @Tipo NVARCHAR(20),  -- INSTRUMENTOS, MONEDAS, FONDOS, SUCIEDADES
    @Usuario NVARCHAR(100) = NULL,
    @Confirmar BIT = 0   -- Requiere confirmacion explicita
AS
BEGIN
    SET NOCOUNT ON;

    IF @Confirmar = 0
    BEGIN
        PRINT 'ERROR: Debe confirmar la operacion con @Confirmar = 1';
        PRINT 'Esta operacion marcara TODOS los ' + @Tipo + ' pendientes del fondo ' + CAST(@ID_Fund AS NVARCHAR(10)) + ' como Ok';
        RETURN 1;
    END

    DECLARE @AffectedRows INT = 0;
    DECLARE @UsuarioFinal NVARCHAR(100) = ISNULL(@Usuario, SYSTEM_USER);

    IF @Tipo = 'INSTRUMENTOS'
    BEGIN
        UPDATE h
        SET h.Estado = 'Ok', h.Usuario = @UsuarioFinal, h.FechaOk = GETDATE()
        FROM sandbox.Homologacion_Instrumentos h
        INNER JOIN sandbox.Homologacion_Instrumentos_Fondos hf ON h.ID = hf.ID_Homologacion
        WHERE hf.ID_Fund = @ID_Fund AND h.Estado = 'Pendiente';
        SET @AffectedRows = @@ROWCOUNT;
    END
    ELSE IF @Tipo = 'MONEDAS'
    BEGIN
        UPDATE h
        SET h.Estado = 'Ok', h.Usuario = @UsuarioFinal, h.FechaOk = GETDATE()
        FROM sandbox.Homologacion_Monedas h
        INNER JOIN sandbox.Homologacion_Monedas_Fondos hf ON h.ID = hf.ID_Homologacion
        WHERE hf.ID_Fund = @ID_Fund AND h.Estado = 'Pendiente';
        SET @AffectedRows = @@ROWCOUNT;
    END
    ELSE IF @Tipo = 'FONDOS'
    BEGIN
        UPDATE h
        SET h.Estado = 'Ok', h.Usuario = @UsuarioFinal, h.FechaOk = GETDATE()
        FROM sandbox.Homologacion_Fondos h
        INNER JOIN sandbox.Homologacion_Fondos_Fondos hf ON h.ID = hf.ID_Homologacion
        WHERE hf.ID_Fund = @ID_Fund AND h.Estado = 'Pendiente';
        SET @AffectedRows = @@ROWCOUNT;
    END
    ELSE IF @Tipo = 'SUCIEDADES'
    BEGIN
        UPDATE s
        SET s.Estado = 'Ok', s.Usuario = @UsuarioFinal, s.FechaOk = GETDATE()
        FROM sandbox.Alertas_Suciedades_IPA s
        INNER JOIN sandbox.Alertas_Suciedades_IPA_Fondos sf ON s.ID = sf.ID_Suciedad
        WHERE sf.ID_Fund = @ID_Fund AND s.Estado = 'Pendiente';
        SET @AffectedRows = @@ROWCOUNT;
    END
    ELSE
    BEGIN
        PRINT 'ERROR: Tipo no valido. Use: INSTRUMENTOS, MONEDAS, FONDOS, SUCIEDADES';
        RETURN 1;
    END

    PRINT 'OK: ' + CAST(@AffectedRows AS NVARCHAR(10)) + ' ' + @Tipo + ' marcado(s) como Ok para fondo ' + CAST(@ID_Fund AS NVARCHAR(10)) + ' por ' + @UsuarioFinal;
    RETURN 0;
END
GO

PRINT 'SP [sandbox].[sp_MarcarTodosPendientesOkPorFondo] creado';
GO

-- ============================================================================
-- EJEMPLOS DE USO
-- ============================================================================
/*
-- Marcar un instrumento especifico como resuelto:
EXEC sandbox.sp_MarcarInstrumentoOk
    @Instrumento = 'ABC123',
    @Source = 'GENEVA',
    @Usuario = 'jperez';

-- Marcar una moneda como resuelta:
EXEC sandbox.sp_MarcarMonedaOk
    @Moneda = 'U.S. Dollars',
    @Source = 'GENEVA',
    @Usuario = 'jperez';

-- Marcar multiples instrumentos (usando TVP):
DECLARE @Instrumentos sandbox.TVP_Instrumentos;
INSERT INTO @Instrumentos VALUES ('ABC123', 'GENEVA'), ('DEF456', 'GENEVA');
EXEC sandbox.sp_MarcarMultiplesInstrumentosOk @Instrumentos = @Instrumentos, @Usuario = 'jperez';

-- Marcar TODOS los pendientes de un fondo (requiere confirmacion):
EXEC sandbox.sp_MarcarTodosPendientesOkPorFondo
    @ID_Fund = 2,
    @Tipo = 'INSTRUMENTOS',
    @Usuario = 'admin',
    @Confirmar = 1;
*/

PRINT '';
PRINT '========================================'
PRINT 'SPs MARCAR OK CREADOS'
PRINT '========================================'
GO
