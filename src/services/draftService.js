/**
 * Servicio para gestión de borradores (drafts) en localStorage
 * Permite guardar el progreso del formulario cuando el usuario cambia de item
 */

const DRAFT_PREFIX = 'homologacion_draft_';
const DRAFT_INDEX_KEY = 'homologacion_drafts_index';

export const draftService = {
  /**
   * Guarda un borrador para un item de la cola
   * @param {number} queueItemId - ID del item en la cola
   * @param {object} formData - Datos del formulario a guardar
   */
  saveDraft(queueItemId, formData) {
    if (!queueItemId) return;

    const key = `${DRAFT_PREFIX}${queueItemId}`;
    const draft = {
      queueItemId,
      formData,
      savedAt: new Date().toISOString(),
    };

    try {
      localStorage.setItem(key, JSON.stringify(draft));
      this._updateIndex(queueItemId, 'add');
    } catch (error) {
      console.error('Error guardando borrador:', error);
    }
  },

  /**
   * Obtiene un borrador guardado
   * @param {number} queueItemId - ID del item en la cola
   * @returns {object|null} - Datos del borrador o null si no existe
   */
  getDraft(queueItemId) {
    if (!queueItemId) return null;

    const key = `${DRAFT_PREFIX}${queueItemId}`;
    try {
      const data = localStorage.getItem(key);
      if (data) {
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('Error recuperando borrador:', error);
    }
    return null;
  },

  /**
   * Elimina un borrador
   * @param {number} queueItemId - ID del item en la cola
   */
  deleteDraft(queueItemId) {
    if (!queueItemId) return;

    const key = `${DRAFT_PREFIX}${queueItemId}`;
    try {
      localStorage.removeItem(key);
      this._updateIndex(queueItemId, 'remove');
    } catch (error) {
      console.error('Error eliminando borrador:', error);
    }
  },

  /**
   * Verifica si existe un borrador para un item
   * @param {number} queueItemId - ID del item en la cola
   * @returns {boolean}
   */
  hasDraft(queueItemId) {
    if (!queueItemId) return false;
    const key = `${DRAFT_PREFIX}${queueItemId}`;
    return localStorage.getItem(key) !== null;
  },

  /**
   * Obtiene todos los IDs de items que tienen borradores
   * @returns {number[]}
   */
  getAllDraftIds() {
    try {
      const index = localStorage.getItem(DRAFT_INDEX_KEY);
      if (index) {
        return JSON.parse(index);
      }
    } catch (error) {
      console.error('Error obteniendo índice de borradores:', error);
    }
    return [];
  },

  /**
   * Obtiene todos los borradores con sus datos
   * @returns {object[]}
   */
  getAllDrafts() {
    const ids = this.getAllDraftIds();
    return ids
      .map(id => this.getDraft(id))
      .filter(draft => draft !== null);
  },

  /**
   * Limpia todos los borradores
   */
  clearAllDrafts() {
    const ids = this.getAllDraftIds();
    ids.forEach(id => {
      const key = `${DRAFT_PREFIX}${id}`;
      localStorage.removeItem(key);
    });
    localStorage.removeItem(DRAFT_INDEX_KEY);
  },

  /**
   * Limpia borradores antiguos (más de 7 días)
   */
  cleanOldDrafts() {
    const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 días en milisegundos
    const now = new Date().getTime();
    const ids = this.getAllDraftIds();

    ids.forEach(id => {
      const draft = this.getDraft(id);
      if (draft && draft.savedAt) {
        const savedTime = new Date(draft.savedAt).getTime();
        if (now - savedTime > maxAge) {
          this.deleteDraft(id);
        }
      }
    });
  },

  /**
   * Actualiza el índice de borradores
   * @private
   */
  _updateIndex(queueItemId, action) {
    try {
      let index = this.getAllDraftIds();

      if (action === 'add' && !index.includes(queueItemId)) {
        index.push(queueItemId);
      } else if (action === 'remove') {
        index = index.filter(id => id !== queueItemId);
      }

      localStorage.setItem(DRAFT_INDEX_KEY, JSON.stringify(index));
    } catch (error) {
      console.error('Error actualizando índice de borradores:', error);
    }
  },
};

export default draftService;
