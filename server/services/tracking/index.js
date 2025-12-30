/**
 * Tracking Services - Exportaciones Centralizadas
 *
 * ARQUITECTURA EVENT-DRIVEN (v3.0):
 * - TrackingService: Servicio unificado que escucha eventos del pipeline
 * - PipelineEventEmitter: Singleton para emitir eventos
 *
 * SERVICIOS OBSOLETOS (eliminados):
 * - ExecutionTracker → Reemplazado por TrackingService
 * - LoggingService → Reemplazado por TrackingService
 * - TraceService → Eliminado (no se usaba)
 */

const { TrackingService, getInstance, resetInstance } = require('./TrackingService');

module.exports = {
  TrackingService,
  getInstance,
  resetInstance,
};
