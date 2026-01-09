/*
================================================================================
TEST: Emitir CHECKPOINT Event de Prueba
================================================================================
Descripcion: Emite un evento CHECKPOINT de prueba para verificar que el
             Service Broker y el backend lo procesan correctamente.

Uso:
  1. Asegurar que el backend Node.js esta corriendo
  2. Ejecutar este script
  3. Verificar en los logs del backend que el evento fue recibido

Autor: Refactorizacion Pipeline IPA
Fecha: 2026-01-09
================================================================================
*/

USE INTELIGENCIA_PRODUCTO_FULLSTACK;
GO

SET NOCOUNT ON;

PRINT '================================================================================'
PRINT '  TEST: CHECKPOINT EVENT'
PRINT '================================================================================'
PRINT ''

-- ============================================================================
-- Test 1: Emitir CHECKPOINT con operacion CREATED
-- ============================================================================
PRINT '  Emitiendo CHECKPOINT: CREATED ##Test_Table...'

EXEC broker.sp_EmitirEvento
    @TipoEvento = 'CHECKPOINT',
    @ID_Ejecucion = 9999,
    @ID_Proceso = 9999,
    @ID_Fund = 1,
    @NombreSP = 'TEST.sp_Test_Checkpoint',
    @Detalles = '{"operacion": "CREATED", "objeto": "##Test_Table_9999_9999_1", "registros": 500}';

PRINT '  [OK] Evento emitido'
PRINT ''

-- ============================================================================
-- Test 2: Emitir CHECKPOINT con operacion VERIFIED
-- ============================================================================
PRINT '  Emitiendo CHECKPOINT: VERIFIED ##IPA_Cash...'

EXEC broker.sp_EmitirEvento
    @TipoEvento = 'CHECKPOINT',
    @ID_Ejecucion = 9999,
    @ID_Proceso = 9999,
    @ID_Fund = 1,
    @NombreSP = 'TEST.sp_Test_Checkpoint',
    @Detalles = '{"operacion": "VERIFIED", "objeto": "##IPA_Cash_9999_9999_1", "mensaje": "Prerequisito OK"}';

PRINT '  [OK] Evento emitido'
PRINT ''

-- ============================================================================
-- Test 3: Emitir varios CHECKPOINTs en secuencia (simular pipeline)
-- ============================================================================
PRINT '  Simulando secuencia de CHECKPOINT del pipeline...'
PRINT ''

-- Simular sp_Process_IPA
EXEC broker.sp_EmitirEvento
    @TipoEvento = 'SP_INICIO',
    @ID_Ejecucion = 9999,
    @ID_Proceso = 9999,
    @ID_Fund = 1,
    @NombreSP = 'staging.sp_Process_IPA';

WAITFOR DELAY '00:00:00.100';

EXEC broker.sp_EmitirEvento
    @TipoEvento = 'CHECKPOINT',
    @ID_Ejecucion = 9999,
    @ID_Proceso = 9999,
    @ID_Fund = 1,
    @NombreSP = 'staging.sp_Process_IPA',
    @Detalles = '{"operacion": "CREATED", "objeto": "##IPA_Work_9999_9999_1", "registros": 1234}';

PRINT '    CHECKPOINT: CREATED ##IPA_Work (1234 rows)'

WAITFOR DELAY '00:00:00.100';

EXEC broker.sp_EmitirEvento
    @TipoEvento = 'CHECKPOINT',
    @ID_Ejecucion = 9999,
    @ID_Proceso = 9999,
    @ID_Fund = 1,
    @NombreSP = 'staging.sp_Process_IPA',
    @Detalles = '{"operacion": "CREATED", "objeto": "##IPA_Cash_9999_9999_1", "registros": 89}';

PRINT '    CHECKPOINT: CREATED ##IPA_Cash (89 rows)'

WAITFOR DELAY '00:00:00.100';

EXEC broker.sp_EmitirEvento
    @TipoEvento = 'CHECKPOINT',
    @ID_Ejecucion = 9999,
    @ID_Proceso = 9999,
    @ID_Fund = 1,
    @NombreSP = 'staging.sp_Process_IPA',
    @Detalles = '{"operacion": "CREATED", "objeto": "##IPA_MTM_9999_9999_1", "registros": 45}';

PRINT '    CHECKPOINT: CREATED ##IPA_MTM (45 rows)'

WAITFOR DELAY '00:00:00.100';

EXEC broker.sp_EmitirEvento
    @TipoEvento = 'CHECKPOINT',
    @ID_Ejecucion = 9999,
    @ID_Proceso = 9999,
    @ID_Fund = 1,
    @NombreSP = 'staging.sp_Process_IPA',
    @Detalles = '{"operacion": "CREATED", "objeto": "##Ajustes_9999_9999_1", "registros": 0}';

PRINT '    CHECKPOINT: CREATED ##Ajustes (0 rows)'

WAITFOR DELAY '00:00:00.100';

EXEC broker.sp_EmitirEvento
    @TipoEvento = 'SP_FIN',
    @ID_Ejecucion = 9999,
    @ID_Proceso = 9999,
    @ID_Fund = 1,
    @NombreSP = 'staging.sp_Process_IPA',
    @CodigoRetorno = 0,
    @DuracionMs = 250,
    @RowsProcessed = 1234;

PRINT ''
PRINT '  [OK] Secuencia completada'
PRINT ''

-- Simular sp_Process_CAPM
PRINT '  Simulando sp_Process_CAPM...'

EXEC broker.sp_EmitirEvento
    @TipoEvento = 'SP_INICIO',
    @ID_Ejecucion = 9999,
    @ID_Proceso = 9999,
    @ID_Fund = 1,
    @NombreSP = 'staging.sp_Process_CAPM';

WAITFOR DELAY '00:00:00.100';

EXEC broker.sp_EmitirEvento
    @TipoEvento = 'CHECKPOINT',
    @ID_Ejecucion = 9999,
    @ID_Proceso = 9999,
    @ID_Fund = 1,
    @NombreSP = 'staging.sp_Process_CAPM',
    @Detalles = '{"operacion": "VERIFIED", "objeto": "##IPA_Cash_9999_9999_1", "mensaje": "Prerequisito IPA Cash existe"}';

PRINT '    CHECKPOINT: VERIFIED ##IPA_Cash'

WAITFOR DELAY '00:00:00.100';

EXEC broker.sp_EmitirEvento
    @TipoEvento = 'CHECKPOINT',
    @ID_Ejecucion = 9999,
    @ID_Proceso = 9999,
    @ID_Fund = 1,
    @NombreSP = 'staging.sp_Process_CAPM',
    @Detalles = '{"operacion": "CREATED", "objeto": "##CAPM_Work_9999_9999_1", "registros": 78}';

PRINT '    CHECKPOINT: CREATED ##CAPM_Work (78 rows)'

WAITFOR DELAY '00:00:00.100';

EXEC broker.sp_EmitirEvento
    @TipoEvento = 'SP_FIN',
    @ID_Ejecucion = 9999,
    @ID_Proceso = 9999,
    @ID_Fund = 1,
    @NombreSP = 'staging.sp_Process_CAPM',
    @CodigoRetorno = 0,
    @DuracionMs = 180,
    @RowsProcessed = 78;

PRINT ''
PRINT '  [OK] Secuencia CAPM completada'
PRINT ''

PRINT '================================================================================'
PRINT '  TEST COMPLETADO'
PRINT ''
PRINT '  Verifica los logs del backend para confirmar recepcion:'
PRINT '    [MessageProcessor] CHECKPOINT | Ejecucion: 9999 | Fund: 1 | SP: ...'
PRINT ''
PRINT '  Si el frontend esta suscrito a ejecucion 9999, deberia mostrar los eventos.'
PRINT '================================================================================'
GO
