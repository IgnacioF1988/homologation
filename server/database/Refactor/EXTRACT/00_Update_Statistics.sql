/*
================================================================================
SCRIPT: Update Statistics for Extract Pipeline
================================================================================
Descripcion: Actualiza estadisticas de tablas fuente y destino para mejorar
             estimaciones de cardinalidad y grants de memoria.

Ejecutar este script:
  - Periodicamente (diario o semanal)
  - Despues de cargas masivas
  - Si se observan warnings de ExcessiveGrant

Autor: Refactorizacion Pipeline IPA
Fecha: 2026-01-05
================================================================================
*/

-- ============================================================================
-- SECCION 1: TABLAS FUENTE (GD_EG_001)
-- ============================================================================
USE [GD_EG_001];
GO

PRINT '========================================';
PRINT 'ESTADISTICAS - TABLAS FUENTE (GD_EG_001)';
PRINT CONVERT(VARCHAR(23), GETDATE(), 121);
PRINT '========================================';

PRINT 'Actualizando: GD_R_InvestmentPosition...';
UPDATE STATISTICS [dbo].[GD_R_InvestmentPosition] WITH FULLSCAN;
GO

PRINT 'Actualizando: GD_R_Cash_Appraisal_Moneda...';
UPDATE STATISTICS [dbo].[GD_R_Cash_Appraisal_Moneda] WITH FULLSCAN;
GO

PRINT 'Actualizando: GD_R_StateOfNetAsset...';
UPDATE STATISTICS [dbo].[GD_R_StateOfNetAsset] WITH FULLSCAN;
GO

PRINT 'Actualizando: GD_R_Profit_And_Lost_Investment...';
UPDATE STATISTICS [dbo].[GD_R_Profit_And_Lost_Investment] WITH FULLSCAN;
GO

PRINT 'Actualizando: GD_R_Positions_Mod_RF...';
UPDATE STATISTICS [dbo].[GD_R_Positions_Mod_RF] WITH FULLSCAN;
GO

-- ============================================================================
-- SECCION 2: TABLAS FUENTE (Inteligencia_Producto)
-- ============================================================================
USE [Inteligencia_Producto];
GO

PRINT '========================================';
PRINT 'ESTADISTICAS - Inteligencia_Producto';
PRINT '========================================';

PRINT 'Actualizando: TBL_DERIVADOS_INTELIGENCIA...';
UPDATE STATISTICS [dbo].[TBL_DERIVADOS_INTELIGENCIA] WITH FULLSCAN;
GO

-- ============================================================================
-- SECCION 3: TABLAS DESTINO (extract schema)
-- Importante para estimaciones correctas en INSERT operations
-- ============================================================================
USE [IPA_Homologation];  -- Ajustar nombre de BD si es diferente
GO

PRINT '========================================';
PRINT 'ESTADISTICAS - TABLAS EXTRACT (destino)';
PRINT '========================================';

PRINT 'Actualizando: extract.IPA...';
UPDATE STATISTICS [extract].[IPA] WITH FULLSCAN;
GO

PRINT 'Actualizando: extract.CAPM...';
UPDATE STATISTICS [extract].[CAPM] WITH FULLSCAN;
GO

PRINT 'Actualizando: extract.SONA...';
UPDATE STATISTICS [extract].[SONA] WITH FULLSCAN;
GO

PRINT 'Actualizando: extract.PNL...';
UPDATE STATISTICS [extract].[PNL] WITH FULLSCAN;
GO

PRINT 'Actualizando: extract.PosModRF...';
UPDATE STATISTICS [extract].[PosModRF] WITH FULLSCAN;
GO

PRINT 'Actualizando: extract.Derivados...';
UPDATE STATISTICS [extract].[Derivados] WITH FULLSCAN;
GO

PRINT '========================================';
PRINT 'ESTADISTICAS ACTUALIZADAS EXITOSAMENTE';
PRINT CONVERT(VARCHAR(23), GETDATE(), 121);
PRINT '========================================';
GO
