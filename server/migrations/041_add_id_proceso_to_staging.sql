-- =============================================
-- Migration 041: Agregar ID_Proceso a tablas staging
-- =============================================

USE [Inteligencia_Producto_Dev];
GO

-- Ajuste_CAPM
ALTER TABLE staging.Ajuste_CAPM ADD ID_Proceso NVARCHAR(50) NULL;
GO

-- Ajuste_Derivados
ALTER TABLE staging.Ajuste_Derivados ADD ID_Proceso NVARCHAR(50) NULL;
GO

-- Ajuste_Paridades
ALTER TABLE staging.Ajuste_Paridades ADD ID_Proceso NVARCHAR(50) NULL;
GO

-- Ajuste_PNL
ALTER TABLE staging.Ajuste_PNL ADD ID_Proceso NVARCHAR(50) NULL;
GO

-- Ajuste_SONA
ALTER TABLE staging.Ajuste_SONA ADD ID_Proceso NVARCHAR(50) NULL;
GO

-- CAPM_WorkTable
ALTER TABLE staging.CAPM_WorkTable ADD ID_Proceso NVARCHAR(50) NULL;
GO

-- Derivados
ALTER TABLE staging.Derivados ADD ID_Proceso NVARCHAR(50) NULL;
GO

-- Derivados_WorkTable
ALTER TABLE staging.Derivados_WorkTable ADD ID_Proceso NVARCHAR(50) NULL;
GO

-- IPA
ALTER TABLE staging.IPA ADD ID_Proceso NVARCHAR(50) NULL;
GO

-- IPA_Cash
ALTER TABLE staging.IPA_Cash ADD ID_Proceso NVARCHAR(50) NULL;
GO

-- IPA_Final
ALTER TABLE staging.IPA_Final ADD ID_Proceso NVARCHAR(50) NULL;
GO

-- IPA_MTM
ALTER TABLE staging.IPA_MTM ADD ID_Proceso NVARCHAR(50) NULL;
GO

-- IPA_WorkTable
ALTER TABLE staging.IPA_WorkTable ADD ID_Proceso NVARCHAR(50) NULL;
GO

-- MLCCII
ALTER TABLE staging.MLCCII ADD ID_Proceso NVARCHAR(50) NULL;
GO

-- MLCCII_Derivados
ALTER TABLE staging.MLCCII_Derivados ADD ID_Proceso NVARCHAR(50) NULL;
GO

-- PNL
ALTER TABLE staging.PNL ADD ID_Proceso NVARCHAR(50) NULL;
GO

-- PNL_IPA
ALTER TABLE staging.PNL_IPA ADD ID_Proceso NVARCHAR(50) NULL;
GO

-- PNL_ValoresAcumulados
ALTER TABLE staging.PNL_ValoresAcumulados ADD ID_Proceso NVARCHAR(50) NULL;
GO

-- PNL_WorkTable
ALTER TABLE staging.PNL_WorkTable ADD ID_Proceso NVARCHAR(50) NULL;
GO

-- UBS_WorkTable
ALTER TABLE staging.UBS_WorkTable ADD ID_Proceso NVARCHAR(50) NULL;
GO

PRINT '✅ Migration 041 completada - ID_Proceso agregado a 20 tablas staging';
GO
