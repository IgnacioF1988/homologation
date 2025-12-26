/**
 * DependencyResolver - Resolver de Dependencias para Pipeline
 *
 * Calcula el orden de ejecución correcto de servicios basado en sus dependencias,
 * usando un algoritmo de ordenamiento topológico (Kahn's algorithm).
 *
 * RECIBE:
 * - services: Array de configuración de servicios desde pipeline.config.yaml
 *   Cada servicio tiene: {id, name, dependencies, errorPolicy, conditional, etc.}
 *
 * PROCESA:
 * 1. Construye grafo de dependencias (Map de serviceId → {dependencies, config})
 * 2. Valida que todas las dependencias existan en la configuración
 * 3. Calcula orden de ejecución con algoritmo de Kahn (ordenamiento topológico):
 *    a. Calcula in-degree (número de dependencias) para cada nodo
 *    b. Agrega a cola los nodos con in-degree 0 (sin dependencias)
 *    c. Procesa cola: toma nodo, lo agrega al resultado, reduce in-degree de dependientes
 *    d. Repite hasta que la cola esté vacía
 *    e. Si quedan nodos sin procesar, detecta ciclo
 * 4. Detecta dependencias cíclicas (error fatal si existen)
 * 5. Proporciona métodos para verificar pre-requisitos en runtime
 *
 * ENVIA:
 * - Orden de ejecución a: FundOrchestrator (array de serviceIds ordenado)
 * - Validaciones a: FundOrchestrator.canExecute() → verifica si servicio puede ejecutarse
 * - Ready list a: FundOrchestrator.getReadyServices() → lista de servicios ejecutables
 *
 * DEPENDENCIAS:
 * - Requiere: pipeline.config.yaml cargado por FundOrchestrator
 * - Requerido por: FundOrchestrator (resuelve orden antes de ejecutar servicios)
 *
 * CONTEXTO PARALELO:
 * - Servicio DETERMINÍSTICO: mismo input → mismo output (sin side effects)
 * - Cada FundOrchestrator crea su propia instancia (no compartida entre fondos)
 * - Sin estado compartido: cada instancia tiene su propio grafo y cache
 * - Cache de orden de ejecución: se calcula una vez, se reutiliza para todas las verificaciones
 */

class DependencyResolver {
  /**
   * Constructor
   * @param {Array<Object>} services - Array de configuración de servicios del pipeline
   */
  constructor(services) {
    if (!Array.isArray(services) || services.length === 0) {
      throw new Error('DependencyResolver requiere un array de servicios no vacío');
    }

    this.services = services;
    this.dependencyGraph = this.buildGraph();
    this.executionOrder = null; // Cache del orden calculado
  }

  /**
   * Construir grafo de dependencias
   * @private
   * @returns {Map} - Mapa de serviceId → {dependencies, config}
   */
  buildGraph() {
    const graph = new Map();

    this.services.forEach(service => {
      if (!service.id) {
        throw new Error('Servicio sin ID detectado en configuración');
      }

      graph.set(service.id, {
        dependencies: service.dependencies || [],
        config: service,
      });
    });

    // Validar que todas las dependencias existan
    graph.forEach((node, serviceId) => {
      node.dependencies.forEach(depId => {
        if (!graph.has(depId)) {
          throw new Error(
            `Servicio '${serviceId}' depende de '${depId}' que no existe en la configuración`
          );
        }
      });
    });

    return graph;
  }

  /**
   * Obtener orden de ejecución usando algoritmo topológico (Kahn)
   *
   * Algoritmo:
   * 1. Calcular in-degree (número de dependencias) para cada nodo
   * 2. Agregar a cola los nodos con in-degree 0 (sin dependencias)
   * 3. Procesar cola: tomar nodo, agregarlo al resultado, reducir in-degree de sus dependientes
   * 4. Repetir hasta que la cola esté vacía
   * 5. Si quedan nodos sin procesar, hay un ciclo
   *
   * @returns {Array<String>} - IDs de servicios en orden de ejecución
   * @throws {Error} - Si hay dependencias cíclicas
   */
  getExecutionOrder() {
    // Retornar cache si ya fue calculado
    if (this.executionOrder) {
      return this.executionOrder;
    }

    const graph = new Map(this.dependencyGraph);
    const inDegree = new Map();
    const queue = [];
    const result = [];

    // Paso 1: Calcular in-degree (número de dependencias) para cada nodo
    graph.forEach((node, id) => {
      inDegree.set(id, node.dependencies.length);

      // Agregar a cola si no tiene dependencias
      if (node.dependencies.length === 0) {
        queue.push(id);
      }
    });

    // Paso 2: Algoritmo de Kahn (ordenamiento topológico)
    while (queue.length > 0) {
      const current = queue.shift();
      result.push(current);

      // Para cada servicio que dependa del actual, reducir in-degree
      graph.forEach((node, id) => {
        if (node.dependencies.includes(current)) {
          const newDegree = inDegree.get(id) - 1;
          inDegree.set(id, newDegree);

          // Si in-degree llega a 0, agregar a cola
          if (newDegree === 0) {
            queue.push(id);
          }
        }
      });
    }

    // Paso 3: Verificar ciclos
    if (result.length !== graph.size) {
      const unprocessed = [];
      graph.forEach((_, id) => {
        if (!result.includes(id)) {
          unprocessed.push(id);
        }
      });

      throw new Error(
        `Dependencias cíclicas detectadas en la configuración del pipeline. ` +
        `Servicios no procesables: ${unprocessed.join(', ')}`
      );
    }

    // Cachear resultado
    this.executionOrder = result;

    console.log('[DependencyResolver] Orden de ejecución calculado:', result);
    return result;
  }

  /**
   * Obtener dependencias directas de un servicio
   * @param {String} serviceId - ID del servicio
   * @returns {Array<String>} - IDs de servicios de los que depende
   */
  getDependencies(serviceId) {
    const node = this.dependencyGraph.get(serviceId);
    if (!node) {
      throw new Error(`Servicio '${serviceId}' no existe en el grafo de dependencias`);
    }
    return node.dependencies || [];
  }

  /**
   * Obtener configuración completa de un servicio
   * @param {String} serviceId - ID del servicio
   * @returns {Object} - Configuración del servicio
   */
  getServiceConfig(serviceId) {
    const node = this.dependencyGraph.get(serviceId);
    if (!node) {
      throw new Error(`Servicio '${serviceId}' no existe en el grafo de dependencias`);
    }
    return node.config;
  }

  /**
   * Verificar si un servicio puede ejecutarse
   * (todas sus dependencias están completas)
   *
   * @param {String} serviceId - ID del servicio a verificar
   * @param {Set<String>} completedServices - Set de IDs de servicios completados
   * @returns {Boolean} - true si puede ejecutarse
   */
  canExecute(serviceId, completedServices) {
    const dependencies = this.getDependencies(serviceId);

    // Verificar que todas las dependencias estén en completedServices
    return dependencies.every(dep => completedServices.has(dep));
  }

  /**
   * Obtener servicios que están listos para ejecutarse
   * (todas sus dependencias están completas)
   *
   * @param {Set<String>} completedServices - Set de IDs de servicios completados
   * @param {Set<String>} runningServices - Set de IDs de servicios en ejecución
   * @returns {Array<String>} - IDs de servicios listos para ejecutar
   */
  getReadyServices(completedServices, runningServices = new Set()) {
    const ready = [];

    this.dependencyGraph.forEach((node, serviceId) => {
      // Saltar si ya está completado o en ejecución
      if (completedServices.has(serviceId) || runningServices.has(serviceId)) {
        return;
      }

      // Verificar si puede ejecutarse
      if (this.canExecute(serviceId, completedServices)) {
        ready.push(serviceId);
      }
    });

    return ready;
  }

  /**
   * Obtener todas las dependencias transitivas de un servicio
   * (dependencias de dependencias recursivamente)
   *
   * @param {String} serviceId - ID del servicio
   * @returns {Set<String>} - Set de todos los IDs de servicios de los que depende (directo e indirecto)
   */
  getAllDependencies(serviceId) {
    const allDeps = new Set();
    const visited = new Set();

    const traverse = (id) => {
      if (visited.has(id)) return;
      visited.add(id);

      const deps = this.getDependencies(id);
      deps.forEach(depId => {
        allDeps.add(depId);
        traverse(depId);
      });
    };

    traverse(serviceId);
    return allDeps;
  }

  /**
   * Obtener servicios que dependen de un servicio dado
   * (dependientes directos)
   *
   * @param {String} serviceId - ID del servicio
   * @returns {Array<String>} - IDs de servicios que dependen de este
   */
  getDependents(serviceId) {
    const dependents = [];

    this.dependencyGraph.forEach((node, id) => {
      if (node.dependencies.includes(serviceId)) {
        dependents.push(id);
      }
    });

    return dependents;
  }

  /**
   * Validar integridad del grafo de dependencias
   * @returns {Object} - Resultado de validación {valid, errors}
   */
  validate() {
    const errors = [];

    try {
      // Intentar calcular orden de ejecución (detecta ciclos)
      this.getExecutionOrder();
    } catch (error) {
      errors.push(error.message);
    }

    // Verificar que todos los servicios sean alcanzables
    const reachable = new Set();
    const order = this.executionOrder || [];
    order.forEach(id => reachable.add(id));

    this.dependencyGraph.forEach((_, id) => {
      if (!reachable.has(id)) {
        errors.push(`Servicio '${id}' no es alcanzable (posible isla en el grafo)`);
      }
    });

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Generar visualización del grafo en formato DOT (Graphviz)
   * Útil para debugging y documentación
   *
   * @returns {String} - Representación del grafo en formato DOT
   */
  toDot() {
    let dot = 'digraph PipelineDependencies {\n';
    dot += '  rankdir=LR;\n';
    dot += '  node [shape=box];\n\n';

    this.dependencyGraph.forEach((node, id) => {
      const label = node.config.name || id;
      dot += `  "${id}" [label="${label}"];\n`;

      node.dependencies.forEach(depId => {
        dot += `  "${depId}" -> "${id}";\n`;
      });
    });

    dot += '}\n';
    return dot;
  }

  /**
   * Resetear cache del orden de ejecución
   * (Útil si se modifica la configuración dinámicamente)
   */
  resetCache() {
    this.executionOrder = null;
  }
}

module.exports = DependencyResolver;
