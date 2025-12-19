/**
 * Orchestration Services - Exportaciones Centralizadas
 *
 * Punto de entrada único para los servicios de orquestación del pipeline.
 */

const DependencyResolver = require('./DependencyResolver');
const WorkerPool = require('./WorkerPool');

module.exports = {
  DependencyResolver,
  WorkerPool,
};
