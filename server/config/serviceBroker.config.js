/**
 * Service Broker Configuration
 * Version: v2.0 - Redesign DB-Centric
 *
 * Configuracion para la conexion persistente al Service Broker de SQL Server.
 * Esta conexion es DEDICADA y separada del pool principal para evitar bloqueos.
 *
 * Códigos de Retorno del Pipeline (v2.0):
 *   0 = OK
 *   1 = WARNING (continuar)
 *   2 = RETRY (reintentar)
 *   3 = ERROR_CRITICO (exception)
 *   4 = ASSERTION_FAILED (bug del sistema - prerequisitos no cumplidos)
 *   5 = STANDBY_SUCIEDADES
 *   6 = STANDBY_HOMOL_INSTRUMENTOS
 *   7 = STANDBY_DESCUADRE_CASH (ValidateFund FASE 4)
 *   8 = STANDBY_DESCUADRE_DERIVADOS (ValidateFund FASE 4)
 *   9 = STANDBY_DESCUADRE_NAV (ValidateFund FASE 4)
 *   10 = STANDBY_HOMOL_FONDOS
 *   11 = STANDBY_HOMOL_MONEDAS
 *   13-18 = STANDBY_EXTRACT_*_FALTANTE
 *
 * PRINCIPIO FUNDAMENTAL:
 *   Si sp_ValidateFund retorna 0, el fondo DEBE llegar al CUBO final.
 *   Los Process_* SPs NO deben fallar por validaciones de negocio.
 */

require('dotenv').config();

module.exports = {
  // Nombre de la cola de Service Broker
  queueName: '[broker].[ETLEventQueue]',

  // Timeout del WAITFOR RECEIVE en milisegundos
  // 5 segundos permite detectar desconexiones rapido sin consumir recursos
  receiveTimeout: 5000,

  // Intervalo de reconexion en caso de error (ms)
  // Backoff exponencial: 1s, 2s, 4s, 8s, 16s, 32s (max)
  reconnectIntervals: [1000, 2000, 4000, 8000, 16000, 32000],

  // Maximo numero de mensajes a recibir por batch
  maxMessages: 100,

  // Timeout de request para la conexion dedicada (ms)
  // Debe ser mayor que receiveTimeout
  requestTimeout: 30000,

  // Database que contiene el Service Broker (desde .env)
  database: process.env.DB_DATABASE,

  // Tipos de mensaje soportados
  messageTypes: {
    SP_INICIO: 'SP_INICIO',
    SP_FIN: 'SP_FIN',
    ERROR: 'ERROR',
    STANDBY: 'STANDBY',
    PROCESO_INICIO: 'PROCESO_INICIO',
    PROCESO_FIN: 'PROCESO_FIN',
    PIPELINE_INICIO: 'PIPELINE_INICIO',
    PIPELINE_PASO: 'PIPELINE_PASO',
    PIPELINE_FIN: 'PIPELINE_FIN',
    CHECKPOINT: 'CHECKPOINT',  // v2.0: Progreso operacional (temp tables, etc)
    TEST: 'TEST',
  },

  // Mapeo de MessageType a evento WebSocket
  wsEventMapping: {
    SP_INICIO: 'SP_START',
    SP_FIN: 'SP_END',
    ERROR: 'ERROR',
    STANDBY: 'STANDBY',
    PROCESO_INICIO: 'EXECUTION_START',
    PROCESO_FIN: 'EXECUTION_COMPLETE',
    PIPELINE_INICIO: 'PIPELINE_START',
    PIPELINE_PASO: 'PIPELINE_STEP',
    PIPELINE_FIN: 'PIPELINE_END',
    CHECKPOINT: 'CHECKPOINT',  // v2.0: Progreso operacional
    TEST: 'TEST',
  },
};
