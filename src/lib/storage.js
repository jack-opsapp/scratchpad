/**
 * Storage abstraction layer
 *
 * Currently uses Claude's network storage (window.storage).
 * Can be swapped for a custom backend without changing component code.
 *
 * Storage keys:
 * - scratchpad-pages: Page hierarchy with sections
 * - scratchpad-tags: Global tag list
 * - scratchpad-notes: All notes
 * - scratchpad-box-configs: View configuration per context
 */

const STORAGE_KEYS = {
  PAGES: 'scratchpad-pages',
  TAGS: 'scratchpad-tags',
  NOTES: 'scratchpad-notes',
  BOX_CONFIGS: 'scratchpad-box-configs',
};

/**
 * Generic storage operations
 */
export const storage = {
  /**
   * Get a value from storage
   * @param {string} key - Storage key
   * @returns {Promise<any|null>} Parsed value or null
   */
  async get(key) {
    try {
      const result = await window.storage.get(key);
      return result ? JSON.parse(result.value) : null;
    } catch (error) {
      console.error(`Storage get error for key "${key}":`, error);
      return null;
    }
  },

  /**
   * Set a value in storage
   * @param {string} key - Storage key
   * @param {any} value - Value to store (will be JSON stringified)
   * @returns {Promise<boolean>} Success status
   */
  async set(key, value) {
    try {
      await window.storage.set(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error(`Storage set error for key "${key}":`, error);
      return false;
    }
  },

  /**
   * Remove a value from storage
   * @param {string} key - Storage key
   * @returns {Promise<boolean>} Success status
   */
  async remove(key) {
    try {
      await window.storage.remove(key);
      return true;
    } catch (error) {
      console.error(`Storage remove error for key "${key}":`, error);
      return false;
    }
  },
};

/**
 * Domain-specific storage operations
 */
export const dataStore = {
  // Pages
  async getPages() {
    return storage.get(STORAGE_KEYS.PAGES);
  },
  async setPages(pages) {
    return storage.set(STORAGE_KEYS.PAGES, pages);
  },

  // Tags
  async getTags() {
    return storage.get(STORAGE_KEYS.TAGS);
  },
  async setTags(tags) {
    return storage.set(STORAGE_KEYS.TAGS, tags);
  },

  // Notes
  async getNotes() {
    return storage.get(STORAGE_KEYS.NOTES);
  },
  async setNotes(notes) {
    return storage.set(STORAGE_KEYS.NOTES, notes);
  },

  // Box configs (view settings)
  async getBoxConfigs() {
    return storage.get(STORAGE_KEYS.BOX_CONFIGS);
  },
  async setBoxConfigs(configs) {
    return storage.set(STORAGE_KEYS.BOX_CONFIGS, configs);
  },

  // Load all data at once
  async loadAll() {
    const [pages, tags, notes, boxConfigs] = await Promise.all([
      this.getPages(),
      this.getTags(),
      this.getNotes(),
      this.getBoxConfigs(),
    ]);
    return { pages, tags, notes, boxConfigs };
  },

  // Save all data at once
  async saveAll({ pages, tags, notes, boxConfigs }) {
    await Promise.all([
      pages !== undefined && this.setPages(pages),
      tags !== undefined && this.setTags(tags),
      notes !== undefined && this.setNotes(notes),
      boxConfigs !== undefined && this.setBoxConfigs(boxConfigs),
    ]);
  },
};

export { STORAGE_KEYS };
export default storage;
