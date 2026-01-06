/*
================================================================================
INDICES DE RENDIMIENTO - BASE FUENTE [GD_EG_001]
================================================================================
Descripcion: Indices covering para optimizar las consultas de los Extract SPs.
             Estos indices deben crearse en la base de datos fuente Geneva
             [GD_EG_001] para mejorar el rendimiento de extraccion.

IMPORTANTE: Este script debe ejecutarse en [GD_EG_001], NO en fullstack.

Tipo de indices:
  - Covering indexes con INCLUDE para evitar key lookups
  - Keys: (Portfolio, Fecha) para filtrado eficiente
  - Include: todas las columnas proyectadas por cada SP

Impacto estimado:
  - GD_R_InvestmentPosition          : 66.9%
  - GD_R_Profit_And_Lost_Investment  : 65.8%
  - GD_R_Cash_Appraisal_Moneda       : ~65%
  - GD_R_StateOfNetAsset             : ~65%
  - GD_R_Positions_Mod_RF            : ~65%

Autor: Refactorizacion Pipeline IPA
Fecha: 2026-01-05
================================================================================
*/

USE [GD_EG_001];
GO

PRINT '========================================';
PRINT 'CREACION DE INDICES COVERING - GD_EG_001';
PRINT CONVERT(VARCHAR(23), GETDATE(), 121);
PRINT '========================================';

-- ============================================================================
-- INDICE 1: GD_R_InvestmentPosition (para Extract_IPA)
-- ============================================================================
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_GD_R_InvestmentPosition_Portfolio_Fecha'
      AND object_id = OBJECT_ID('dbo.GD_R_InvestmentPosition')
)
BEGIN
    PRINT 'Creando: IX_GD_R_InvestmentPosition_Portfolio_Fecha...';

    CREATE NONCLUSTERED INDEX [IX_GD_R_InvestmentPosition_Portfolio_Fecha]
    ON [dbo].[GD_R_InvestmentPosition] ([Portfolio], [Fecha])
    INCLUDE (
        [TotalText], [ReportMode], [LSDesc], [SortKey], [LocalCurrency],
        [BasketInvestDesc], [InvestDescription], [InvestID], [Qty], [LocalPrice],
        [CostLocal], [CostBook], [UnRealGL], [AI], [MVBook], [PercentInvest],
        [PercentSign], [IsSwap], [BasketInvID]
    );

    PRINT '  [OK] Indice creado';
END
ELSE
    PRINT '  [SKIP] IX_GD_R_InvestmentPosition_Portfolio_Fecha ya existe';
GO

-- ============================================================================
-- INDICE 2: GD_R_Profit_And_Lost_Investment (para Extract_PNL)
-- ============================================================================
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_GD_R_Profit_And_Lost_Investment_Portfolio_Fecha'
      AND object_id = OBJECT_ID('dbo.GD_R_Profit_And_Lost_Investment')
)
BEGIN
    PRINT 'Creando: IX_GD_R_Profit_And_Lost_Investment_Portfolio_Fecha...';

    CREATE NONCLUSTERED INDEX [IX_GD_R_Profit_And_Lost_Investment_Portfolio_Fecha]
    ON [dbo].[GD_R_Profit_And_Lost_Investment] ([Portfolio], [Fecha])
    INCLUDE (
        [Group1], [Group2], [Symb], [Invest], [PRgain], [PUgain],
        [FxRgain], [FxUgain], [Income], [TotGL], [PctGL], [BasisPoint]
    );

    PRINT '  [OK] Indice creado';
END
ELSE
    PRINT '  [SKIP] IX_GD_R_Profit_And_Lost_Investment_Portfolio_Fecha ya existe';
GO

-- ============================================================================
-- INDICE 3: GD_R_Cash_Appraisal_Moneda (para Extract_CAPM)
-- ============================================================================
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_GD_R_Cash_Appraisal_Moneda_Portfolio_Fecha'
      AND object_id = OBJECT_ID('dbo.GD_R_Cash_Appraisal_Moneda')
)
BEGIN
    PRINT 'Creando: IX_GD_R_Cash_Appraisal_Moneda_Portfolio_Fecha...';

    CREATE NONCLUSTERED INDEX [IX_GD_R_Cash_Appraisal_Moneda_Portfolio_Fecha]
    ON [dbo].[GD_R_Cash_Appraisal_Moneda] ([Portfolio], [Fecha])
    INCLUDE (
        [LocationAcct], [InvestDescription], [TotalText], [LSDesc],
        [Qty], [FXRate], [CostBook], [MVBook], [UnRealGL],
        [percentInvest], [percentSign], [sumStatement]
    );

    PRINT '  [OK] Indice creado';
END
ELSE
    PRINT '  [SKIP] IX_GD_R_Cash_Appraisal_Moneda_Portfolio_Fecha ya existe';
GO

-- ============================================================================
-- INDICE 4: GD_R_StateOfNetAsset (para Extract_SONA)
-- ============================================================================
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_GD_R_StateOfNetAsset_Portfolio_Fecha'
      AND object_id = OBJECT_ID('dbo.GD_R_StateOfNetAsset')
)
BEGIN
    PRINT 'Creando: IX_GD_R_StateOfNetAsset_Portfolio_Fecha...';

    CREATE NONCLUSTERED INDEX [IX_GD_R_StateOfNetAsset_Portfolio_Fecha]
    ON [dbo].[GD_R_StateOfNetAsset] ([Portfolio], [Fecha])
    INCLUDE (
        [TotalText], [Sect], [Cat], [SubCat], [Bal]
    );

    PRINT '  [OK] Indice creado';
END
ELSE
    PRINT '  [SKIP] IX_GD_R_StateOfNetAsset_Portfolio_Fecha ya existe';
GO

-- ============================================================================
-- INDICE 5: GD_R_Positions_Mod_RF (para Extract_PosModRF)
-- ============================================================================
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_GD_R_Positions_Mod_RF_Portfolio_Fecha'
      AND object_id = OBJECT_ID('dbo.GD_R_Positions_Mod_RF')
)
BEGIN
    PRINT 'Creando: IX_GD_R_Positions_Mod_RF_Portfolio_Fecha...';

    CREATE NONCLUSTERED INDEX [IX_GD_R_Positions_Mod_RF_Portfolio_Fecha]
    ON [dbo].[GD_R_Positions_Mod_RF] ([Portfolio], [Fecha])
    INCLUDE (
        [Investment_Code], [OriginalFace], [Factor], [TotalMkt],
        [Investment_BifurcationCurrency_Code]
    );

    PRINT '  [OK] Indice creado';
END
ELSE
    PRINT '  [SKIP] IX_GD_R_Positions_Mod_RF_Portfolio_Fecha ya existe';
GO

-- ============================================================================
-- VERIFICACION
-- ============================================================================
PRINT '';
PRINT '========================================';
PRINT 'VERIFICACION DE INDICES';
PRINT '========================================';

SELECT
    OBJECT_NAME(i.object_id) AS Tabla,
    i.name AS Indice,
    (
        SELECT COUNT(*)
        FROM sys.index_columns ic
        WHERE ic.object_id = i.object_id
          AND ic.index_id = i.index_id
          AND ic.is_included_column = 1
    ) AS ColumnasIncluidas
FROM sys.indexes i
WHERE i.name LIKE 'IX_GD_R_%_Portfolio_Fecha'
ORDER BY OBJECT_NAME(i.object_id);

PRINT '';
PRINT '========================================';
PRINT 'INDICES GD_EG_001 - COMPLETADO';
PRINT CONVERT(VARCHAR(23), GETDATE(), 121);
PRINT '========================================';
GO
