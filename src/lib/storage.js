/**
 * Storage abstraction layer
 *
 * Uses Supabase for data persistence.
 * Maintains the same public API as the previous window.storage implementation.
 *
 * Data mapping:
 * - slate-pages → pages table (with nested sections)
 * - slate-notes → notes table
 * - slate-tags → derived from notes.tags (unique values)
 * - slate-box-configs → box_configs table
 */

import { supabase } from '../config/supabase.js';

// =============================================================================
// Storage Keys (kept for reference/compatibility)
// =============================================================================

const STORAGE_KEYS = {
  PAGES: 'slate-pages',
  TAGS: 'slate-tags',
  NOTES: 'slate-notes',
  BOX_CONFIGS: 'slate-box-configs',
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get the current authenticated user's ID
 * @returns {Promise<string|null>}
 */
async function getCurrentUserId() {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id || null;
}

/**
 * Extract unique tags from an array of notes
 * @param {Array} notes - Array of note objects
 * @returns {Array<string>} Unique tags sorted alphabetically
 */
function extractTagsFromNotes(notes) {
  if (!notes || !Array.isArray(notes)) return [];

  const tagSet = new Set();
  notes.forEach(note => {
    if (note.tags && Array.isArray(note.tags)) {
      note.tags.forEach(tag => {
        if (tag) tagSet.add(tag.toLowerCase());
      });
    }
  });

  return Array.from(tagSet).sort();
}

/**
 * Transform Supabase pages (with sections) to app format
 * @param {Array} supabasePages - Pages from Supabase with nested sections
 * @returns {Array} Pages in app format
 */
function transformPagesToAppFormat(supabasePages) {
  if (!supabasePages) return null;

  return supabasePages.map(page => ({
    id: page.id,
    name: page.name,
    starred: page.starred || false,
    sections: (page.sections || [])
      .sort((a, b) => (a.position || 0) - (b.position || 0))
      .map(section => ({
        id: section.id,
        name: section.name,
      })),
  }));
}

/**
 * Transform Supabase notes to app format
 * @param {Array} supabaseNotes - Notes from Supabase
 * @returns {Array} Notes in app format
 */
function transformNotesToAppFormat(supabaseNotes) {
  if (!supabaseNotes) return null;

  return supabaseNotes.map(note => ({
    id: note.id,
    sectionId: note.section_id,
    content: note.content,
    completed: note.completed || false,
    completed_by_user_id: note.completed_by_user_id || null,
    completed_at: note.completed_at || null,
    date: note.date || null,
    tags: note.tags || [],
    createdAt: note.created_at,
    created_by_user_id: note.created_by_user_id || null,
  }));
}

/**
 * Transform Supabase box_configs to app format (object keyed by context_id)
 * @param {Array} supabaseConfigs - Box configs from Supabase
 * @returns {Object} Configs as object keyed by context_id
 */
function transformBoxConfigsToAppFormat(supabaseConfigs) {
  if (!supabaseConfigs) return null;

  const configs = {};
  supabaseConfigs.forEach(config => {
    configs[config.context_id] = config.config || {};
  });
  return configs;
}

// =============================================================================
// Generic Storage Operations
// =============================================================================

/**
 * Generic storage operations (for backwards compatibility)
 * Note: These now route to dataStore methods internally
 */
export const storage = {
  /**
   * Get a value from storage
   * @param {string} key - Storage key
   * @returns {Promise<any|null>} Parsed value or null
   */
  async get(key) {
    try {
      switch (key) {
        case STORAGE_KEYS.PAGES:
          return dataStore.getPages();
        case STORAGE_KEYS.TAGS:
          return dataStore.getTags();
        case STORAGE_KEYS.NOTES:
          return dataStore.getNotes();
        case STORAGE_KEYS.BOX_CONFIGS:
          return dataStore.getBoxConfigs();
        default:
          console.warn(`Unknown storage key: ${key}`);
          return null;
      }
    } catch (error) {
      console.error(`Storage get error for key "${key}":`, error);
      return null;
    }
  },

  /**
   * Set a value in storage
   * @param {string} key - Storage key
   * @param {any} value - Value to store
   * @returns {Promise<boolean>} Success status
   */
  async set(key, value) {
    try {
      switch (key) {
        case STORAGE_KEYS.PAGES:
          return dataStore.setPages(value);
        case STORAGE_KEYS.TAGS:
          return dataStore.setTags(value);
        case STORAGE_KEYS.NOTES:
          return dataStore.setNotes(value);
        case STORAGE_KEYS.BOX_CONFIGS:
          return dataStore.setBoxConfigs(value);
        default:
          console.warn(`Unknown storage key: ${key}`);
          return false;
      }
    } catch (error) {
      console.error(`Storage set error for key "${key}":`, error);
      return false;
    }
  },

  /**
   * Remove a value from storage (clears data for key)
   * @param {string} key - Storage key
   * @returns {Promise<boolean>} Success status
   */
  async remove(key) {
    try {
      // For Supabase, we don't typically "remove" all data
      // This would delete all user data for that type
      console.warn(`Storage remove called for key "${key}" - operation limited in Supabase mode`);
      return true;
    } catch (error) {
      console.error(`Storage remove error for key "${key}":`, error);
      return false;
    }
  },
};

// =============================================================================
// Domain-Specific Storage Operations
// =============================================================================

export const dataStore = {
  // -------------------------------------------------------------------------
  // Pages (with nested sections)
  // -------------------------------------------------------------------------

  /**
   * Get pages owned by the current user
   * @returns {Promise<Array>}
   */
  async getOwnedPages() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data } = await supabase
      .from('pages')
      .select('*, sections(*)')
      .eq('user_id', user.id)
      .order('position');

    return transformPagesToAppFormat(data) || [];
  },

  /**
   * Get pages shared with the current user (not owned by them)
   * @returns {Promise<Array>}
   */
  async getSharedPages() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    // First get page IDs where user has permissions but doesn't own
    const { data: permissions, error: permError } = await supabase
      .from('page_permissions')
      .select('page_id, role')
      .eq('user_id', user.id);

    if (permError || !permissions) {
      console.error('getSharedPages permissions error:', permError);
      return [];
    }

    // Get the pages the user owns
    const { data: ownedPages } = await supabase
      .from('pages')
      .select('id')
      .eq('user_id', user.id);

    const ownedIds = new Set((ownedPages || []).map(p => p.id));

    // Filter to only pages user doesn't own
    const sharedPermissions = permissions.filter(p => !ownedIds.has(p.page_id));

    if (sharedPermissions.length === 0) return [];

    const sharedPageIds = sharedPermissions.map(p => p.page_id);
    const roleMap = {};
    sharedPermissions.forEach(p => { roleMap[p.page_id] = p.role; });

    // Fetch the actual pages with sections
    const { data: pages, error: pagesError } = await supabase
      .from('pages')
      .select('*, sections(*)')
      .in('id', sharedPageIds)
      .order('name');

    if (pagesError || !pages) {
      console.error('getSharedPages pages error:', pagesError);
      return [];
    }

    return pages.map(p => ({
      ...transformPagesToAppFormat([p])[0],
      myRole: roleMap[p.id]
    }));
  },

  /**
   * Get all pages with their sections for the current user
   * @returns {Promise<Array|null>}
   */
  async getPages() {
    try {
      const userId = await getCurrentUserId();
      if (!userId) {
        console.warn('getPages: No authenticated user');
        return null;
      }

      const { data, error } = await supabase
        .from('pages')
        .select('*, sections(*)')
        .eq('user_id', userId)
        .order('position', { ascending: true });

      if (error) {
        console.error('getPages error:', error);
        return null;
      }

      return transformPagesToAppFormat(data);
    } catch (error) {
      console.error('getPages error:', error);
      return null;
    }
  },

  /**
   * Save pages and sections for the current user
   * Performs full sync: creates, updates, and deletes as needed
   * @param {Array} pages - Pages array in app format
   * @returns {Promise<boolean>}
   */
  async setPages(pages) {
    try {
      const userId = await getCurrentUserId();
      if (!userId) {
        console.warn('setPages: No authenticated user');
        return false;
      }

      if (!pages || !Array.isArray(pages)) {
        return false;
      }

      // Get existing pages OWNED by this user (not shared pages)
      const { data: existingPages } = await supabase
        .from('pages')
        .select('id')
        .eq('user_id', userId);

      const existingPageIds = new Set((existingPages || []).map(p => p.id));

      // Filter to only pages the user owns (pages in existingPageIds or new pages)
      // This prevents trying to save shared pages
      const ownedPages = pages.filter(p => existingPageIds.has(p.id) || !p.myRole || p.myRole === 'owner');
      const ownedPageIds = new Set(ownedPages.map(p => p.id));

      // Delete pages that no longer exist (only from owned pages)
      const pagesToDelete = [...existingPageIds].filter(id => !ownedPageIds.has(id));
      if (pagesToDelete.length > 0) {
        await supabase.from('pages').delete().in('id', pagesToDelete);
      }

      // Upsert only owned pages
      for (let i = 0; i < ownedPages.length; i++) {
        const page = ownedPages[i];
        const pageData = {
          id: page.id,
          user_id: userId,
          name: page.name,
          starred: page.starred || false,
          position: i,
        };

        const { error: pageError } = await supabase
          .from('pages')
          .upsert(pageData, { onConflict: 'id' });

        if (pageError) {
          console.error('setPages upsert error:', pageError);
          continue;
        }

        // Handle sections for this page
        if (page.sections && Array.isArray(page.sections)) {
          // Get existing sections for this page
          const { data: existingSections } = await supabase
            .from('sections')
            .select('id')
            .eq('page_id', page.id);

          const existingSectionIds = new Set((existingSections || []).map(s => s.id));
          const newSectionIds = new Set(page.sections.map(s => s.id));

          // Delete sections that no longer exist
          const sectionsToDelete = [...existingSectionIds].filter(id => !newSectionIds.has(id));
          if (sectionsToDelete.length > 0) {
            await supabase.from('sections').delete().in('id', sectionsToDelete);
          }

          // Upsert sections
          for (let j = 0; j < page.sections.length; j++) {
            const section = page.sections[j];
            const sectionData = {
              id: section.id,
              page_id: page.id,
              name: section.name,
              position: j,
            };

            const { error: sectionError } = await supabase
              .from('sections')
              .upsert(sectionData, { onConflict: 'id' });

            if (sectionError) {
              console.error('setPages section upsert error:', sectionError);
            }
          }
        }
      }

      return true;
    } catch (error) {
      console.error('setPages error:', error);
      return false;
    }
  },

  // -------------------------------------------------------------------------
  // Tags (derived from notes)
  // -------------------------------------------------------------------------

  /**
   * Get all unique tags from user's notes
   * @returns {Promise<Array|null>}
   */
  async getTags() {
    try {
      // Tags are derived from notes, so we fetch notes and extract tags
      const notes = await this.getNotes();
      if (!notes) return null;

      return extractTagsFromNotes(notes);
    } catch (error) {
      console.error('getTags error:', error);
      return null;
    }
  },

  /**
   * Set tags - This is a no-op since tags are derived from notes
   * Tags are automatically maintained when notes are updated
   * @param {Array} tags - Tags array (ignored)
   * @returns {Promise<boolean>}
   */
  async setTags(tags) {
    // Tags are derived from notes, no separate storage needed
    // This is kept for API compatibility
    return true;
  },

  // -------------------------------------------------------------------------
  // Notes
  // -------------------------------------------------------------------------

  /**
   * Get all notes for the current user
   * @returns {Promise<Array|null>}
   */
  async getNotes() {
    try {
      const userId = await getCurrentUserId();
      if (!userId) {
        console.warn('getNotes: No authenticated user');
        return null;
      }

      // Get all section IDs that belong to user's pages
      const { data: pages } = await supabase
        .from('pages')
        .select('sections(id)')
        .eq('user_id', userId);

      if (!pages) return [];

      const sectionIds = pages.flatMap(p => (p.sections || []).map(s => s.id));
      if (sectionIds.length === 0) return [];

      const { data, error } = await supabase
        .from('notes')
        .select('*')
        .in('section_id', sectionIds)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('getNotes error:', error);
        return null;
      }

      return transformNotesToAppFormat(data);
    } catch (error) {
      console.error('getNotes error:', error);
      return null;
    }
  },

  /**
   * Save notes for the current user
   * Performs full sync: creates, updates, and deletes as needed
   * Includes completion tracking with user attribution
   * Generates embeddings for new/updated notes for RAG search
   * @param {Array} notes - Notes array in app format
   * @returns {Promise<boolean>}
   */
  async setNotes(notes) {
    try {
      const userId = await getCurrentUserId();
      if (!userId) {
        console.warn('setNotes: No authenticated user');
        return false;
      }

      if (!notes || !Array.isArray(notes)) {
        return false;
      }

      // Get all section IDs user has access to (owned + shared)
      const { data: userPages } = await supabase
        .from('pages')
        .select('id, sections(id)')
        .or(`user_id.eq.${userId}`);

      // Also get shared pages
      const { data: sharedPages } = await supabase
        .from('page_permissions')
        .select('page_id, pages:page_id(sections(id))')
        .eq('user_id', userId);

      const ownedSectionIds = (userPages || []).flatMap(p => (p.sections || []).map(s => s.id));
      const sharedSectionIds = (sharedPages || []).flatMap(p => p.pages?.sections?.map(s => s.id) || []);
      const allSectionIds = [...new Set([...ownedSectionIds, ...sharedSectionIds])];

      if (allSectionIds.length === 0) return true;

      // Get existing notes with content (to detect changes)
      const { data: existingNotes } = await supabase
        .from('notes')
        .select('id, content')
        .in('section_id', allSectionIds);

      const existingNoteMap = new Map((existingNotes || []).map(n => [n.id, n.content]));
      const existingNoteIds = new Set((existingNotes || []).map(n => n.id));
      const newNoteIds = new Set(notes.map(n => n.id));

      // Track notes that need embedding (new or content changed)
      const notesNeedingEmbedding = [];

      // Delete notes that no longer exist
      const notesToDelete = [...existingNoteIds].filter(id => !newNoteIds.has(id));
      if (notesToDelete.length > 0) {
        await supabase.from('notes').delete().in('id', notesToDelete);
      }

      // Upsert notes
      for (const note of notes) {
        // Only save notes that belong to accessible sections
        if (!allSectionIds.includes(note.sectionId)) {
          console.warn(`setNotes: Skipping note ${note.id} - section ${note.sectionId} not accessible`);
          continue;
        }

        // Check if this is a new note or content has changed
        const existingContent = existingNoteMap.get(note.id);
        const needsEmbedding = !existingContent || existingContent !== note.content;

        const noteData = {
          id: note.id,
          section_id: note.sectionId,
          content: note.content,
          completed: note.completed || false,
          completed_by_user_id: note.completed ? (note.completed_by_user_id || userId) : null,
          completed_at: note.completed ? (note.completed_at || new Date().toISOString()) : null,
          date: note.date || null,
          tags: note.tags || [],
          created_by_user_id: note.created_by_user_id || userId,
        };

        const { error } = await supabase
          .from('notes')
          .upsert(noteData, { onConflict: 'id' });

        if (error) {
          console.error('setNotes upsert error:', error);
        } else if (needsEmbedding) {
          notesNeedingEmbedding.push({ id: note.id, content: note.content });
        }
      }

      // Generate embeddings for new/updated notes (async, non-blocking)
      if (notesNeedingEmbedding.length > 0) {
        this.generateEmbeddingsForNotes(notesNeedingEmbedding).catch(() => {});
      }

      return true;
    } catch (error) {
      console.error('setNotes error:', error);
      return false;
    }
  },

  /**
   * Generate embeddings for notes (called async, non-blocking)
   * @param {Array<{id: string, content: string}>} notes
   */
  async generateEmbeddingsForNotes(notes) {
    for (const note of notes) {
      try {
        await fetch('/api/embeddings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'embed_note',
            noteId: note.id,
            content: note.content
          })
        });
      } catch (error) {
        console.error(`Failed to embed note ${note.id}:`, error);
      }
    }
  },

  // -------------------------------------------------------------------------
  // Box Configs (view preferences)
  // -------------------------------------------------------------------------

  /**
   * Get all box configs for the current user
   * @returns {Promise<Object|null>}
   */
  async getBoxConfigs() {
    try {
      const userId = await getCurrentUserId();
      if (!userId) {
        console.warn('getBoxConfigs: No authenticated user');
        return null;
      }

      const { data, error } = await supabase
        .from('box_configs')
        .select('*')
        .eq('user_id', userId);

      if (error) {
        console.error('getBoxConfigs error:', error);
        return null;
      }

      return transformBoxConfigsToAppFormat(data);
    } catch (error) {
      console.error('getBoxConfigs error:', error);
      return null;
    }
  },

  /**
   * Save box configs for the current user
   * @param {Object} configs - Configs object keyed by context_id
   * @returns {Promise<boolean>}
   */
  async setBoxConfigs(configs) {
    try {
      const userId = await getCurrentUserId();
      if (!userId) {
        console.warn('setBoxConfigs: No authenticated user');
        return false;
      }

      if (!configs || typeof configs !== 'object') {
        return false;
      }

      // Upsert each config
      for (const [contextId, config] of Object.entries(configs)) {
        const configData = {
          user_id: userId,
          context_id: contextId,
          config: config,
        };

        const { error } = await supabase
          .from('box_configs')
          .upsert(configData, {
            onConflict: 'user_id,context_id',
          });

        if (error) {
          console.error('setBoxConfigs upsert error:', error);
        }
      }

      return true;
    } catch (error) {
      console.error('setBoxConfigs error:', error);
      return false;
    }
  },

  // -------------------------------------------------------------------------
  // Bulk Operations
  // -------------------------------------------------------------------------

  /**
   * Load all data at once
   * @returns {Promise<{pages, tags, notes, boxConfigs}>}
   */
  async loadAll() {
    const [pages, notes, boxConfigs] = await Promise.all([
      this.getPages(),
      this.getNotes(),
      this.getBoxConfigs(),
    ]);

    // Tags are derived from notes
    const tags = extractTagsFromNotes(notes);

    return { pages, tags, notes, boxConfigs };
  },

  /**
   * Save all data at once
   * @param {{pages?, tags?, notes?, boxConfigs?}} data
   */
  async saveAll({ pages, tags, notes, boxConfigs }) {
    const promises = [];

    if (pages !== undefined) {
      promises.push(this.setPages(pages));
    }
    // Tags are derived from notes, no need to save separately
    if (notes !== undefined) {
      promises.push(this.setNotes(notes));
    }
    if (boxConfigs !== undefined) {
      promises.push(this.setBoxConfigs(boxConfigs));
    }

    await Promise.all(promises);
  },
};

// =============================================================================
// Exports
// =============================================================================

export { STORAGE_KEYS };
export default storage;
