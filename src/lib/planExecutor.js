import { supabase } from '../config/supabase';
import { executeBulkOperation, getMatchingCount } from './bulkOperations.js';

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
  console.log('executeGroup called with actions:', actions);

  const results = [];
  const updatedContext = { ...context };

  for (const action of actions) {
    console.log('Processing action:', action.type, action);
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

        case 'delete_page':
          result = await executeDeletePage(action, allPages, setPages, setNotes);
          break;

        case 'delete_section':
          result = await executeDeleteSection(action, allPages, setPages, setNotes);
          break;

        case 'delete_notes':
          result = await executeDeleteNotes(action, setNotes);
          break;

        // Bulk operations for plan mode
        case 'bulk_add_tag':
          result = await executeBulkTagOperation(action, 'add_tag', context, setNotes);
          break;

        case 'bulk_remove_tag':
          result = await executeBulkTagOperation(action, 'remove_tag', context, setNotes);
          break;

        case 'bulk_move_to_section':
          result = await executeBulkMoveOperation(action, context, allPages, setNotes);
          break;

        case 'bulk_mark_complete':
          result = await executeBulkStatusOperation(action, 'mark_complete', context, setNotes);
          break;

        case 'bulk_mark_incomplete':
          result = await executeBulkStatusOperation(action, 'mark_incomplete', context, setNotes);
          break;

        case 'add_tag_to_note':
          result = await executeAddTagToNote(action, setNotes);
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
 * Generate embedding for note and store it (async, non-blocking)
 */
async function embedNote(noteId, content) {
  try {
    await fetch('/api/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'embed_note',
        noteId,
        content
      })
    });
  } catch (error) {
    console.error('Failed to embed note:', error);
  }
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

  // Generate embedding for RAG (async, don't block)
  embedNote(newNote.id, action.content).catch(() => {});

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
 * Delete a page and all its sections/notes
 */
async function executeDeletePage(action, allPages, setPages, setNotes) {
  // Find the page by name
  const page = allPages.find(p =>
    p.name.toLowerCase() === action.name.toLowerCase()
  );

  if (!page) {
    throw new Error(`Page "${action.name}" not found`);
  }

  // Get all section IDs for this page
  const sectionIds = (page.sections || []).map(s => s.id);

  // Delete notes in these sections from Supabase
  if (sectionIds.length > 0) {
    const { error: notesError } = await supabase
      .from('notes')
      .delete()
      .in('section_id', sectionIds);

    if (notesError) throw notesError;
  }

  // Delete sections from Supabase
  const { error: sectionsError } = await supabase
    .from('sections')
    .delete()
    .eq('page_id', page.id);

  if (sectionsError) throw sectionsError;

  // Delete the page from Supabase
  const { error: pageError } = await supabase
    .from('pages')
    .delete()
    .eq('id', page.id);

  if (pageError) throw pageError;

  // Update local state - remove notes
  if (sectionIds.length > 0) {
    setNotes(prev => prev.filter(n => !sectionIds.includes(n.sectionId)));
  }

  // Update local state - remove page
  setPages(prev => prev.filter(p => p.id !== page.id));

  return {
    action: 'delete_page',
    name: action.name,
    success: true,
    id: page.id
  };
}

/**
 * Delete a section and all its notes
 */
async function executeDeleteSection(action, allPages, setPages, setNotes) {
  let section = null;
  let pageId = null;

  // Find the section
  for (const page of allPages) {
    if (action.pageName && page.name.toLowerCase() !== action.pageName.toLowerCase()) {
      continue;
    }
    const found = (page.sections || []).find(s =>
      s.name.toLowerCase() === action.name.toLowerCase()
    );
    if (found) {
      section = found;
      pageId = page.id;
      break;
    }
  }

  if (!section) {
    throw new Error(`Section "${action.name}" not found`);
  }

  // Delete notes in this section from Supabase
  const { error: notesError } = await supabase
    .from('notes')
    .delete()
    .eq('section_id', section.id);

  if (notesError) throw notesError;

  // Delete the section from Supabase
  const { error: sectionError } = await supabase
    .from('sections')
    .delete()
    .eq('id', section.id);

  if (sectionError) throw sectionError;

  // Update local state - remove notes
  setNotes(prev => prev.filter(n => n.sectionId !== section.id));

  // Update local state - remove section from page
  setPages(prev => prev.map(page => {
    if (page.id === pageId) {
      return {
        ...page,
        sections: (page.sections || []).filter(s => s.id !== section.id)
      };
    }
    return page;
  }));

  return {
    action: 'delete_section',
    name: action.name,
    success: true,
    id: section.id
  };
}

/**
 * Delete notes matching a filter
 */
async function executeDeleteNotes(action, setNotes) {
  const filter = action.filter || {};

  // We need to get current notes to filter them
  // This is a bit tricky since we don't have direct access to notes state
  // The filter should have been resolved to specific note IDs by the caller

  if (action.noteIds && action.noteIds.length > 0) {
    // Delete specific notes by ID
    const { error } = await supabase
      .from('notes')
      .delete()
      .in('id', action.noteIds);

    if (error) throw error;

    // Update local state
    const idsToDelete = new Set(action.noteIds);
    setNotes(prev => prev.filter(n => !idsToDelete.has(n.id)));

    return {
      action: 'delete_notes',
      name: action.description || `${action.noteIds.length} notes`,
      success: true,
      count: action.noteIds.length
    };
  }

  throw new Error('No notes specified for deletion');
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

/**
 * Execute bulk tag operation (add_tag or remove_tag)
 */
async function executeBulkTagOperation(action, operation, context, setNotes) {
  console.log('executeBulkTagOperation called:', { action, operation });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Get current notes from Supabase
  const { data: notes, error: fetchError } = await supabase
    .from('notes')
    .select('*');

  if (fetchError) {
    console.error('Failed to fetch notes:', fetchError);
    throw fetchError;
  }

  console.log('Fetched notes count:', notes?.length);

  // Filter notes based on action.filter
  const filter = action.filter || {};
  console.log('Filter:', filter);

  const targetNotes = filterNotesForBulk(notes, filter);
  console.log('Target notes count:', targetNotes.length);

  if (targetNotes.length === 0) {
    return {
      action: operation,
      name: `${action.tag} tag`,
      success: true,
      count: 0,
      message: 'No matching notes found'
    };
  }

  // Update notes in Supabase - batch update for efficiency
  const noteIds = targetNotes.map(n => n.id);
  let updateErrors = [];

  for (const note of targetNotes) {
    let newTags;
    if (operation === 'add_tag') {
      newTags = [...new Set([...(note.tags || []), action.tag])];
    } else {
      newTags = (note.tags || []).filter(t => t !== action.tag);
    }

    const { error: updateError } = await supabase
      .from('notes')
      .update({ tags: newTags })
      .eq('id', note.id);

    if (updateError) {
      console.error('Failed to update note:', note.id, updateError);
      updateErrors.push({ noteId: note.id, error: updateError });
    }
  }

  if (updateErrors.length > 0) {
    console.error('Some updates failed:', updateErrors);
  }

  // Update local state
  setNotes(prev => prev.map(n => {
    if (!noteIds.includes(n.id)) return n;

    if (operation === 'add_tag') {
      return { ...n, tags: [...new Set([...(n.tags || []), action.tag])] };
    } else {
      return { ...n, tags: (n.tags || []).filter(t => t !== action.tag) };
    }
  }));

  console.log('Bulk tag operation complete:', {
    operation,
    tag: action.tag,
    count: targetNotes.length,
    errors: updateErrors.length
  });

  return {
    action: operation,
    name: `${action.tag} tag to ${targetNotes.length} notes`,
    success: updateErrors.length === 0,
    count: targetNotes.length,
    errors: updateErrors.length
  };
}

/**
 * Execute bulk move to section operation
 */
async function executeBulkMoveOperation(action, context, allPages, setNotes) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Resolve section ID
  let sectionId = action.sectionId;
  if (!sectionId && action.sectionName) {
    for (const page of allPages) {
      const section = page.sections?.find(s =>
        s.name.toLowerCase() === action.sectionName.toLowerCase()
      );
      if (section) {
        sectionId = section.id;
        break;
      }
    }
  }

  if (!sectionId) throw new Error('Target section not found');

  // Get current notes from Supabase
  const { data: notes, error: fetchError } = await supabase
    .from('notes')
    .select('*');

  if (fetchError) throw fetchError;

  // Filter notes based on action.filter
  const filter = action.filter || {};
  const targetNotes = filterNotesForBulk(notes, filter);

  if (targetNotes.length === 0) {
    return {
      action: 'move_to_section',
      name: action.sectionName || sectionId,
      success: true,
      count: 0,
      message: 'No matching notes found'
    };
  }

  // Update notes in Supabase
  const noteIds = targetNotes.map(n => n.id);
  await supabase
    .from('notes')
    .update({ section_id: sectionId })
    .in('id', noteIds);

  // Update local state
  setNotes(prev => prev.map(n =>
    noteIds.includes(n.id) ? { ...n, sectionId: sectionId } : n
  ));

  return {
    action: 'move_to_section',
    name: `${targetNotes.length} notes to ${action.sectionName || 'section'}`,
    success: true,
    count: targetNotes.length
  };
}

/**
 * Execute bulk status operation (mark_complete or mark_incomplete)
 */
async function executeBulkStatusOperation(action, operation, context, setNotes) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Get current notes from Supabase
  const { data: notes, error: fetchError } = await supabase
    .from('notes')
    .select('*');

  if (fetchError) throw fetchError;

  // Filter notes
  const filter = action.filter || {};
  const targetNotes = filterNotesForBulk(notes, filter);

  if (targetNotes.length === 0) {
    return {
      action: operation,
      name: operation,
      success: true,
      count: 0,
      message: 'No matching notes found'
    };
  }

  const isComplete = operation === 'mark_complete';
  const noteIds = targetNotes.map(n => n.id);

  await supabase
    .from('notes')
    .update({
      completed: isComplete,
      completed_by_user_id: isComplete ? user.id : null,
      completed_at: isComplete ? new Date().toISOString() : null
    })
    .in('id', noteIds);

  // Update local state
  setNotes(prev => prev.map(n => {
    if (!noteIds.includes(n.id)) return n;
    return {
      ...n,
      completed: isComplete,
      completed_by_user_id: isComplete ? user.id : null,
      completed_at: isComplete ? new Date().toISOString() : null
    };
  }));

  return {
    action: operation,
    name: `${targetNotes.length} notes`,
    success: true,
    count: targetNotes.length
  };
}

/**
 * Filter notes for bulk operations (mirrors bulkOperations.js logic)
 */
function filterNotesForBulk(notes, filters) {
  console.log('filterNotesForBulk called with', notes?.length, 'notes and filters:', filters);
  console.log('Note contents:', notes?.map(n => ({ id: n.id.slice(0,8), content: n.content?.slice(0,50), tags: n.tags })));

  const results = notes.filter(note => {
    // Tag filter
    if (filters.tags && filters.tags.length > 0) {
      const noteTags = (note.tags || []).map(t => t.toLowerCase());
      const hasTag = filters.tags.some(tag => noteTags.includes(tag.toLowerCase()));
      if (!hasTag) return false;
    }

    // Completion filter
    if (filters.completed !== undefined) {
      if (filters.completed && !note.completed) return false;
      if (!filters.completed && note.completed) return false;
    }

    // Incomplete filter
    if (filters.incomplete) {
      if (note.completed) return false;
    }

    // Section filter
    if (filters.sectionId) {
      if (note.section_id !== filters.sectionId) return false;
    }

    // Untagged filter - check if note has no tags or empty tags array
    if (filters.untagged) {
      const hasTags = note.tags && Array.isArray(note.tags) && note.tags.length > 0;
      if (hasTags) return false;
    }

    // Content contains filter
    if (filters.contentContains) {
      const content = (note.content || '').toLowerCase();
      const keywords = Array.isArray(filters.contentContains)
        ? filters.contentContains
        : [filters.contentContains];
      const hasKeyword = keywords.some(kw => content.includes(kw.toLowerCase()));
      if (!hasKeyword) return false;
    }

    return true;
  });

  console.log('filterNotesForBulk returning', results.length, 'matching notes');
  return results;
}

/**
 * Add a tag to a specific note by ID
 */
async function executeAddTagToNote(action, setNotes) {
  const { noteId, tag } = action;

  if (!noteId || !tag) {
    throw new Error('noteId and tag are required');
  }

  // Get current note from Supabase
  const { data: note, error: fetchError } = await supabase
    .from('notes')
    .select('*')
    .eq('id', noteId)
    .single();

  if (fetchError) {
    console.error('Failed to fetch note:', fetchError);
    throw fetchError;
  }

  if (!note) {
    throw new Error(`Note ${noteId} not found`);
  }

  // Add tag
  const newTags = [...new Set([...(note.tags || []), tag])];

  const { error: updateError } = await supabase
    .from('notes')
    .update({ tags: newTags })
    .eq('id', noteId);

  if (updateError) {
    console.error('Failed to update note:', updateError);
    throw updateError;
  }

  // Update local state
  setNotes(prev => prev.map(n =>
    n.id === noteId
      ? { ...n, tags: [...new Set([...(n.tags || []), tag])] }
      : n
  ));

  return {
    action: 'add_tag_to_note',
    name: `"${tag}" tag`,
    success: true,
    noteId
  };
}
