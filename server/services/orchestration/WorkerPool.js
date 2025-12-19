/**
 * WorkerPool - Pool de Workers para Ejecución Paralela Controlada
 *
 * Maneja la ejecución de tareas en paralelo con límite de concurrencia,
 * evitando sobrecarga del sistema (CPU, conexiones BD, memoria).
 *
 * Características:
 * - Límite configurable de workers concurrentes
 * - Cola FIFO para tareas pendientes
 * - Auto-procesamiento de cola
 * - Métricas de utilización
 *
 * Uso:
 * ```javascript
 * const pool = new WorkerPool(5); // Máximo 5 tareas concurrentes
 * const result = await pool.enqueue(() => myAsyncTask());
 * ```
 */

class WorkerPool {
  /**
   * Constructor
   * @param {number} maxConcurrent - Máximo de workers concurrentes (default: 5)
   */
  constructor(maxConcurrent = 5) {
    this.maxConcurrent = maxConcurrent;
    this.activeWorkers = 0;
    this.queue = [];
    this.stats = {
      totalEnqueued: 0,
      totalCompleted: 0,
      totalFailed: 0,
      peakConcurrency: 0,
    };
  }

  /**
   * Encolar una tarea para ejecución
   *
   * @param {Function} task - Función async a ejecutar
   * @param {Object} metadata - Metadata opcional para logging
   * @returns {Promise} - Promesa que se resuelve cuando la tarea completa
   */
  enqueue(task, metadata = {}) {
    return new Promise((resolve, reject) => {
      const taskWrapper = {
        task,
        metadata,
        resolve,
        reject,
        enqueuedAt: Date.now(),
      };

      this.queue.push(taskWrapper);
      this.stats.totalEnqueued++;

      // Iniciar procesamiento de cola
      this.processQueue();
    });
  }

  /**
   * Procesar cola de tareas respetando límite de concurrencia
   * @private
   */
  async processQueue() {
    // Si ya estamos al máximo de workers o no hay tareas, salir
    if (this.activeWorkers >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    // Tomar siguiente tarea de la cola
    const taskWrapper = this.queue.shift();
    if (!taskWrapper) return;

    // Incrementar workers activos
    this.activeWorkers++;
    if (this.activeWorkers > this.stats.peakConcurrency) {
      this.stats.peakConcurrency = this.activeWorkers;
    }

    // Ejecutar tarea
    try {
      const startTime = Date.now();
      const result = await taskWrapper.task();
      const duration = Date.now() - startTime;

      // Logging opcional
      if (taskWrapper.metadata.fundId) {
        console.log(
          `[WorkerPool] Tarea completada - Fondo: ${taskWrapper.metadata.fundId}, ` +
          `Duración: ${duration}ms, Workers activos: ${this.activeWorkers}`
        );
      }

      taskWrapper.resolve(result);
      this.stats.totalCompleted++;
    } catch (error) {
      console.error(
        `[WorkerPool] Tarea fallida - Metadata: ${JSON.stringify(taskWrapper.metadata)}`,
        error
      );
      taskWrapper.reject(error);
      this.stats.totalFailed++;
    } finally {
      // Decrementar workers activos
      this.activeWorkers--;

      // Procesar siguiente tarea en la cola
      this.processQueue();
    }
  }

  /**
   * Obtener estado actual del pool
   * @returns {Object} - Estado con workers activos, tareas en cola, stats
   */
  getStatus() {
    return {
      activeWorkers: this.activeWorkers,
      queuedTasks: this.queue.length,
      maxConcurrent: this.maxConcurrent,
      utilization: ((this.activeWorkers / this.maxConcurrent) * 100).toFixed(1) + '%',
      stats: {
        ...this.stats,
        pending: this.queue.length,
      },
    };
  }

  /**
   * Esperar a que todas las tareas activas completen
   * (No procesa nuevas tareas de la cola)
   * @param {number} timeoutMs - Timeout en ms (default: 600000 = 10 min)
   * @returns {Promise<void>}
   */
  async waitForCompletion(timeoutMs = 600000) {
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const checkCompletion = setInterval(() => {
        // Verificar timeout
        if (Date.now() - startTime > timeoutMs) {
          clearInterval(checkCompletion);
          reject(new Error(
            `WorkerPool timeout: ${this.activeWorkers} workers aún activos después de ${timeoutMs}ms`
          ));
          return;
        }

        // Verificar si todas las tareas completaron
        if (this.activeWorkers === 0 && this.queue.length === 0) {
          clearInterval(checkCompletion);
          console.log('[WorkerPool] Todas las tareas completadas:', this.stats);
          resolve();
        }
      }, 500); // Verificar cada 500ms
    });
  }

  /**
   * Cambiar límite de concurrencia dinámicamente
   * (Útil para throttling adaptativo basado en carga del sistema)
   * @param {number} newLimit - Nuevo límite de concurrencia
   */
  setMaxConcurrent(newLimit) {
    if (newLimit < 1) {
      throw new Error('maxConcurrent debe ser al menos 1');
    }

    const oldLimit = this.maxConcurrent;
    this.maxConcurrent = newLimit;

    console.log(`[WorkerPool] Límite de concurrencia cambiado: ${oldLimit} → ${newLimit}`);

    // Si aumentamos el límite, procesar más tareas
    if (newLimit > oldLimit) {
      for (let i = 0; i < newLimit - oldLimit; i++) {
        this.processQueue();
      }
    }
  }

  /**
   * Resetear estadísticas
   */
  resetStats() {
    this.stats = {
      totalEnqueued: 0,
      totalCompleted: 0,
      totalFailed: 0,
      peakConcurrency: 0,
    };
  }

  /**
   * Limpiar cola (cancelar tareas pendientes)
   * ADVERTENCIA: Tareas activas NO se cancelan, solo las en cola
   * @returns {number} - Número de tareas canceladas
   */
  clearQueue() {
    const canceledCount = this.queue.length;

    // Rechazar todas las tareas en cola
    this.queue.forEach(taskWrapper => {
      taskWrapper.reject(new Error('Tarea cancelada - Cola limpiada'));
    });

    this.queue = [];

    console.log(`[WorkerPool] Cola limpiada: ${canceledCount} tareas canceladas`);
    return canceledCount;
  }
}

module.exports = WorkerPool;
