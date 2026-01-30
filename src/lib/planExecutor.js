import { supabase } from '../config/supabase';

/**
 * Execute a group of actions
 * @param {Array} actions - Array of action objects
 * @param {Object} context - Current execution context (IDs, etc)
 * @param {Object} allPages - All pages for lookup
 * @param {Function} setPages - Update pages state
 * @param {Function} setNotes - Update notes state
 * @returns {Object} { results, updatedContext }
 */
export async function executeGroup(actions, context, allPages, setPages, setNotes) {
  const results = [];
  const updatedContext = { ...context };

  for (const action of actions) {
    try {
      let result = null;

      switch (action.type) {
        case 'create_page':
          result = await executeCreatePage(action, updatedContext, setPages);
          if (result.success) {
            updatedContext.lastPageId = result.id;
            updatedContext.lastPageName = result.name;
            updatedContext.createdPages.push(result);
          }
          break;

        case 'create_section':
          result = await executeCreateSection(action, updatedContext, allPages, setPages);
          if (result.success) {
            updatedContext.lastSectionId = result.id;
            updatedContext.lastSectionName = result.name;
            updatedContext.createdSections.push(result);
          }
          break;

        case 'create_note':
          result = await executeCreateNote(action, updatedContext, allPages, setNotes);
          if (result.success) {
            updatedContext.createdNotes.push(result);
          }
          break;

        default:
          throw new Error(`Unknown action type: ${action.type}`);
      }

      results.push(result);

    } catch (error) {
      console.error(`Action failed:`, action, error);
      results.push({
        action: action.type,
        name: action.name || action.content,
        success: false,
        error: error.message
      });
      // Continue with remaining actions (Phase 1 decision: Option C)
    }
  }

  return { results, updatedContext };
}

/**
 * Create a new page
 */
async function executeCreatePage(action, context, setPages) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const newPage = {
    id: crypto.randomUUID(),
    name: action.name,
    user_id: user.id,
    starred: false,
    sections: [],
    position: 999,
    created_at: new Date().toISOString()
  };

  const { error } = await supabase
    .from('pages')
    .insert({
      id: newPage.id,
      name: newPage.name,
      user_id: newPage.user_id,
      starred: newPage.starred,
      position: newPage.position
    });

  if (error) throw error;

  // Update local state
  setPages(prev => [...prev, newPage]);

  return {
    action: 'create_page',
    name: action.name,
    success: true,
    id: newPage.id
  };
}

/**
 * Create a new section
 */
async function executeCreateSection(action, context, allPages, setPages) {
  // Resolve page ID
  let pageId = action.pageId;

  if (!pageId) {
    if (action.pageName) {
      // Check both existing pages and newly created pages in context
      const page = allPages.find(p =>
        p.name.toLowerCase() === action.pageName.toLowerCase()
      );
      if (page) {
        pageId = page.id;
      } else {
        // Check context for newly created pages
        const createdPage = context.createdPages.find(p =>
          p.name.toLowerCase() === action.pageName.toLowerCase()
        );
        if (createdPage) {
          pageId = createdPage.id;
        } else {
          throw new Error(`Page "${action.pageName}" not found`);
        }
      }
    } else if (context.lastPageId) {
      pageId = context.lastPageId;
    } else {
      throw new Error('No page specified for section');
    }
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const newSection = {
    id: crypto.randomUUID(),
    name: action.name,
    page_id: pageId,
    position: 999,
    created_by_user_id: user.id,
    created_at: new Date().toISOString()
  };

  const { error } = await supabase
    .from('sections')
    .insert({
      id: newSection.id,
      name: newSection.name,
      page_id: newSection.page_id,
      position: newSection.position,
      created_by_user_id: newSection.created_by_user_id
    });

  if (error) throw error;

  // Update local state
  setPages(prev => prev.map(page => {
    if (page.id === pageId) {
      return {
        ...page,
        sections: [...(page.sections || []), {
          id: newSection.id,
          name: newSection.name,
          page_id: pageId
        }]
      };
    }
    return page;
  }));

  return {
    action: 'create_section',
    name: action.name,
    success: true,
    id: newSection.id,
    pageId: pageId
  };
}

/**
 * Create a new note
 */
async function executeCreateNote(action, context, allPages, setNotes) {
  // Resolve section ID
  let sectionId = action.sectionId;

  if (!sectionId) {
    if (action.sectionName) {
      // Search through all pages for the section
      for (const page of allPages) {
        const section = page.sections?.find(s =>
          s.name.toLowerCase() === action.sectionName.toLowerCase()
        );
        if (section) {
          sectionId = section.id;
          break;
        }
      }

      // Also check context for newly created sections
      if (!sectionId) {
        const createdSection = context.createdSections.find(s =>
          s.name.toLowerCase() === action.sectionName.toLowerCase()
        );
        if (createdSection) {
          sectionId = createdSection.id;
        }
      }

      if (!sectionId) {
        throw new Error(`Section "${action.sectionName}" not found`);
      }
    } else if (context.lastSectionId) {
      sectionId = context.lastSectionId;
    } else {
      throw new Error('No section specified for note');
    }
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const newNote = {
    id: crypto.randomUUID(),
    section_id: sectionId,
    content: action.content,
    tags: action.tags || [],
    date: action.date || null,
    completed: false,
    completed_by_user_id: null,
    completed_at: null,
    created_by_user_id: user.id,
    created_at: new Date().toISOString()
  };

  const { error } = await supabase
    .from('notes')
    .insert(newNote);

  if (error) throw error;

  // Update local state
  setNotes(prev => [...prev, {
    id: newNote.id,
    sectionId: sectionId,
    content: newNote.content,
    tags: newNote.tags,
    date: newNote.date,
    completed: false,
    created_by_user_id: user.id,
    createdAt: Date.now()
  }]);

  return {
    action: 'create_note',
    name: action.content.substring(0, 50),
    success: true,
    id: newNote.id,
    sectionId: sectionId
  };
}

/**
 * Get summary statistics from results
 */
export function summarizeResults(results) {
  const total = results.length;
  const succeeded = results.filter(r => r.success).length;
  const failed = total - succeeded;

  return { total, succeeded, failed };
}
