/**
 * Server-side function implementations for Slate Agent
 * Each function queries or modifies Supabase
 */

import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client (called per-request for serverless)
function getSupabase() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error('Supabase not configured');
  }

  return createClient(url, key);
}

/**
 * Main function executor - routes to specific implementations
 */
export async function executeFunction(name, args, userId) {
  let supabase;
  try {
    supabase = getSupabase();
  } catch (err) {
    console.error('Failed to initialize Supabase:', err);
    return { error: 'Database connection failed: ' + err.message };
  }

  try {
    switch (name) {
      // Data Queries
      case 'get_pages':
        return await getPages(supabase, userId);
      case 'get_sections':
        return await getSections(supabase, userId, args);
      case 'get_notes':
        return await getNotes(supabase, userId, args);
      case 'count_notes':
        return await countNotes(supabase, userId, args);

      // Page Operations
      case 'create_page':
        return await createPage(supabase, userId, args);
      case 'rename_page':
        return await renamePage(supabase, userId, args);
      case 'delete_page':
        return await deletePage(supabase, userId, args);

      // Section Operations
      case 'create_section':
        return await createSection(supabase, userId, args);
      case 'rename_section':
        return await renameSection(supabase, userId, args);
      case 'delete_section':
        return await deleteSection(supabase, userId, args);
      case 'move_section':
        return await moveSection(supabase, userId, args);

      // Note Operations
      case 'create_note':
        return await createNote(supabase, userId, args);
      case 'update_note':
        return await updateNote(supabase, userId, args);
      case 'delete_note':
        return await deleteNote(supabase, userId, args);
      case 'move_note':
        return await moveNote(supabase, userId, args);

      // Sort
      case 'sort_notes':
        return await sortNotes(supabase, userId, args);

      // Bulk Operations
      case 'bulk_update_notes':
        return await bulkUpdateNotes(supabase, userId, args);
      case 'bulk_delete_notes':
        return await bulkDeleteNotes(supabase, userId, args);

      // Trash / Recovery
      case 'get_deleted_items':
        return await getDeletedItems(supabase, userId);
      case 'restore_items':
        return await restoreItems(supabase, userId, args);

      // Connection Operations
      case 'get_connected_notes':
        return await getConnectedNotes(supabase, userId, args);
      case 'create_connection':
        return await createConnectionAgent(supabase, userId, args);
      case 'delete_connection':
        return await deleteConnectionAgent(supabase, userId, args);

      default:
        return { error: `Unknown function: ${name}` };
    }
  } catch (error) {
    console.error(`Function ${name} error:`, error);
    return {
      error: error.message,
      function: name,
      details: error.code || error.hint || 'Unknown error'
    };
  }
}

// ============ HELPER FUNCTIONS ============

async function resolvePageId(supabase, userId, { page_id, page_name }) {
  if (page_id) return page_id;
  if (!page_name) return null;

  const pageIds = await getUserPageIds(supabase, userId);
  if (!pageIds.length) return null;

  const { data } = await supabase
    .from('pages')
    .select('id')
    .in('id', pageIds)
    .ilike('name', page_name)
    .single();

  return data?.id;
}

async function resolveSectionId(supabase, userId, { section_id, section_name, page_name }) {
  if (section_id) return section_id;
  if (!section_name) return null;

  // Get user's page IDs (owned + shared)
  const pageIds = await getUserPageIds(supabase, userId);
  if (!pageIds.length) return null;

  let query = supabase
    .from('sections')
    .select('id, page_id')
    .in('page_id', pageIds)
    .ilike('name', section_name);

  // If page_name provided, filter further
  if (page_name) {
    const pageId = await resolvePageId(supabase, userId, { page_name });
    if (pageId) {
      query = query.eq('page_id', pageId);
    }
  }

  const { data } = await query.limit(1).single();
  return data?.id;
}

async function getUserPageIds(supabase, userId) {
  console.log('getUserPageIds called with userId:', userId);

  // Get owned pages
  const { data: ownedPages, error: ownedErr } = await supabase
    .from('pages')
    .select('id')
    .eq('user_id', userId);

  // Get shared pages (via page_permissions)
  const { data: sharedPerms, error: sharedErr } = await supabase
    .from('page_permissions')
    .select('page_id')
    .eq('user_id', userId);

  const ownedIds = (ownedPages || []).map(p => p.id);
  const sharedIds = (sharedPerms || []).map(p => p.page_id);

  // Deduplicate
  const allIds = [...new Set([...ownedIds, ...sharedIds])];
  console.log('getUserPageIds result:', { owned: ownedIds.length, shared: sharedIds.length, total: allIds.length, ownedErr, sharedErr });
  return allIds;
}

async function getUserSectionIds(supabase, userId, pageIds = null) {
  if (!pageIds) {
    pageIds = await getUserPageIds(supabase, userId);
  }
  console.log('getUserSectionIds pageIds:', pageIds);
  if (!pageIds.length) return [];

  const { data: sections, error } = await supabase
    .from('sections')
    .select('id')
    .in('page_id', pageIds);

  console.log('getUserSectionIds result:', { sections, error, count: sections?.length });
  return sections?.map(s => s.id) || [];
}

// ============ DATA QUERIES ============

async function getPages(supabase, userId) {
  console.log('getPages called with userId:', userId);

  const pageIds = await getUserPageIds(supabase, userId);
  if (!pageIds.length) return [];

  const { data, error } = await supabase
    .from('pages')
    .select('id, name, starred')
    .in('id', pageIds)
    .is('deleted_at', null)
    .order('position');

  console.log('getPages result:', { data, error, count: data?.length });

  if (error) throw error;
  return data || [];
}

async function getSections(supabase, userId, args) {
  const pageIds = await getUserPageIds(supabase, userId);
  if (!pageIds.length) return [];

  let query = supabase
    .from('sections')
    .select('id, name, page_id, pages(name)')
    .in('page_id', pageIds)
    .is('deleted_at', null)
    .order('position');

  if (args.page_id) {
    query = query.eq('page_id', args.page_id);
  } else if (args.page_name) {
    const pageId = await resolvePageId(supabase, userId, { page_name: args.page_name });
    if (pageId) {
      query = query.eq('page_id', pageId);
    }
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data || []).map(s => ({
    id: s.id,
    name: s.name,
    page_id: s.page_id,
    page_name: s.pages?.name
  }));
}

async function getNotes(supabase, userId, args) {
  console.log('getNotes called with userId:', userId, 'args:', JSON.stringify(args));

  // Get user's pages (owned + shared)
  const pageIds = await getUserPageIds(supabase, userId);
  console.log('getNotes pageIds:', pageIds.length);
  if (!pageIds.length) return [];

  // Then get sections for those pages
  const { data: sections, error: sectionsErr } = await supabase
    .from('sections')
    .select('id')
    .in('page_id', pageIds);

  console.log('getNotes sections:', sections?.length, 'error:', sectionsErr?.message);
  if (sectionsErr) throw sectionsErr;
  if (!sections?.length) return [];

  const sectionIds = sections.map(s => s.id);

  // Now get notes - simplified query first (exclude soft-deleted)
  let query = supabase
    .from('notes')
    .select('id, content, tags, date, completed, created_at, section_id')
    .in('section_id', sectionIds)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  // Apply limit: default 50 for normal queries, skip limit when explicitly set to 0
  const limit = args.limit === 0 ? 0 : (args.limit || 50);
  if (limit > 0) {
    query = query.limit(limit);
  }

  // Apply filters
  if (args.section_id) {
    query = query.eq('section_id', args.section_id);
  } else if (args.section_name) {
    const sectionId = await resolveSectionId(supabase, userId, {
      section_name: args.section_name,
      page_name: args.page_name
    });
    if (sectionId) {
      query = query.eq('section_id', sectionId);
    }
  } else if (args.page_name) {
    const pageId = await resolvePageId(supabase, userId, { page_name: args.page_name });
    if (pageId) {
      const { data: sections } = await supabase
        .from('sections')
        .select('id')
        .eq('page_id', pageId);
      if (sections?.length) {
        query = query.in('section_id', sections.map(s => s.id));
      }
    }
  }

  if (args.tags?.length) {
    query = query.overlaps('tags', args.tags);
  }

  if (args.has_no_tags) {
    query = query.or('tags.is.null,tags.eq.{}');
  }

  if (args.completed !== undefined) {
    query = query.eq('completed', args.completed);
  }

  if (args.search) {
    query = query.ilike('content', `%${args.search}%`);
  }

  if (args.created_after) {
    query = query.gte('created_at', args.created_after);
  }

  if (args.created_before) {
    query = query.lte('created_at', args.created_before);
  }

  const { data, error } = await query;
  console.log('getNotes query result:', 'error:', error?.message, 'count:', data?.length);
  if (error) {
    console.error('getNotes error:', error);
    throw error;
  }

  // Build section/page name lookup
  const sectionMap = {};
  for (const section of sections) {
    sectionMap[section.id] = section;
  }

  return (data || []).map(note => ({
    id: note.id,
    content: note.content,
    tags: note.tags || [],
    date: note.date,
    completed: note.completed,
    section_id: note.section_id,
    created_at: note.created_at
  }));
}

async function countNotes(supabase, userId, args) {
  const sectionIds = await getUserSectionIds(supabase, userId);
  if (!sectionIds.length) return { count: 0 };

  let query = supabase
    .from('notes')
    .select('id', { count: 'exact', head: true })
    .in('section_id', sectionIds)
    .is('deleted_at', null);

  // Apply same filters as getNotes
  if (args.section_id) {
    query = query.eq('section_id', args.section_id);
  } else if (args.section_name) {
    const sectionId = await resolveSectionId(supabase, userId, {
      section_name: args.section_name,
      page_name: args.page_name
    });
    if (sectionId) {
      query = query.eq('section_id', sectionId);
    }
  }

  if (args.tags?.length) {
    query = query.overlaps('tags', args.tags);
  }

  if (args.has_no_tags) {
    query = query.or('tags.is.null,tags.eq.{}');
  }

  if (args.completed !== undefined) {
    query = query.eq('completed', args.completed);
  }

  if (args.search) {
    query = query.ilike('content', `%${args.search}%`);
  }

  const { count, error } = await query;
  if (error) throw error;

  return { count: count || 0 };
}

// ============ PAGE OPERATIONS ============

async function createPage(supabase, userId, args) {
  // Get max position
  const { data: existing } = await supabase
    .from('pages')
    .select('position')
    .eq('user_id', userId)
    .order('position', { ascending: false })
    .limit(1);

  const position = (existing?.[0]?.position ?? -1) + 1;

  const { data, error } = await supabase
    .from('pages')
    .insert({ name: args.name, user_id: userId, position })
    .select()
    .single();

  if (error) throw error;
  return { id: data.id, name: data.name };
}

async function renamePage(supabase, userId, args) {
  const pageId = await resolvePageId(supabase, userId, args);
  if (!pageId) return { error: 'Page not found' };

  const { error } = await supabase
    .from('pages')
    .update({ name: args.new_name })
    .eq('id', pageId)
    .eq('user_id', userId);

  if (error) throw error;
  return { success: true };
}

async function deletePage(supabase, userId, args) {
  const pageId = await resolvePageId(supabase, userId, args);
  if (!pageId) return { error: 'Page not found' };

  const now = new Date().toISOString();

  // Soft-delete the page
  const { error } = await supabase
    .from('pages')
    .update({ deleted_at: now })
    .eq('id', pageId)
    .eq('user_id', userId);

  if (error) throw error;

  // Soft-delete child sections
  const { data: sections } = await supabase
    .from('sections')
    .select('id')
    .eq('page_id', pageId)
    .is('deleted_at', null);

  if (sections?.length) {
    const sectionIds = sections.map(s => s.id);
    await supabase.from('sections').update({ deleted_at: now }).in('id', sectionIds);
    // Soft-delete child notes
    await supabase.from('notes').update({ deleted_at: now }).in('section_id', sectionIds).is('deleted_at', null);
  }

  return { success: true };
}

// ============ SECTION OPERATIONS ============

async function createSection(supabase, userId, args) {
  const pageId = await resolvePageId(supabase, userId, {
    page_id: args.page_id,
    page_name: args.page_name
  });
  if (!pageId) return { error: 'Page not found' };

  // Get max position
  const { data: existing } = await supabase
    .from('sections')
    .select('position')
    .eq('page_id', pageId)
    .order('position', { ascending: false })
    .limit(1);

  const position = (existing?.[0]?.position ?? -1) + 1;

  const { data, error } = await supabase
    .from('sections')
    .insert({ name: args.name, page_id: pageId, position })
    .select()
    .single();

  if (error) throw error;
  return { id: data.id, name: data.name, page_id: pageId };
}

async function renameSection(supabase, userId, args) {
  const sectionId = await resolveSectionId(supabase, userId, args);
  if (!sectionId) return { error: 'Section not found' };

  const { error } = await supabase
    .from('sections')
    .update({ name: args.new_name })
    .eq('id', sectionId);

  if (error) throw error;
  return { success: true };
}

async function deleteSection(supabase, userId, args) {
  const sectionId = await resolveSectionId(supabase, userId, args);
  if (!sectionId) return { error: 'Section not found' };

  const now = new Date().toISOString();

  // Soft-delete the section
  const { error } = await supabase
    .from('sections')
    .update({ deleted_at: now })
    .eq('id', sectionId);

  if (error) throw error;

  // Soft-delete child notes
  await supabase.from('notes').update({ deleted_at: now }).eq('section_id', sectionId).is('deleted_at', null);

  return { success: true };
}

async function moveSection(supabase, userId, args) {
  const sectionId = await resolveSectionId(supabase, userId, args);
  if (!sectionId) return { error: 'Section not found' };

  const toPageId = await resolvePageId(supabase, userId, {
    page_id: args.to_page_id,
    page_name: args.to_page_name
  });
  if (!toPageId) return { error: 'Destination page not found' };

  const { error } = await supabase
    .from('sections')
    .update({ page_id: toPageId })
    .eq('id', sectionId);

  if (error) throw error;
  return { success: true };
}

// ============ NOTE OPERATIONS ============

async function createNote(supabase, userId, args) {
  const sectionId = await resolveSectionId(supabase, userId, {
    section_id: args.section_id,
    section_name: args.section_name,
    page_name: args.page_name
  });
  if (!sectionId) return { error: 'Section not found' };

  const noteData = {
    content: args.content,
    section_id: sectionId,
    tags: args.tags || [],
    date: args.date || null,
    completed: false
  };

  const { data, error } = await supabase
    .from('notes')
    .insert(noteData)
    .select()
    .single();

  if (error) throw error;

  // If additional shared sections were specified, insert into note_sections junction table
  if (args.shared_section_names && args.shared_section_names.length > 0) {
    const sharedIds = [];
    for (const name of args.shared_section_names) {
      const sid = await resolveSectionId(supabase, userId, { section_name: name });
      if (sid && sid !== sectionId) sharedIds.push(sid);
    }
    if (sharedIds.length > 0) {
      const rows = sharedIds.map(sid => ({ note_id: data.id, section_id: sid }));
      await supabase.from('note_sections').insert(rows);
    }
  }

  return { id: data.id, content: data.content, shared_sections: args.shared_section_names || [] };
}

async function updateNote(supabase, userId, args) {
  // Verify note belongs to user
  const sectionIds = await getUserSectionIds(supabase, userId);

  const { data: note } = await supabase
    .from('notes')
    .select('id, tags, section_id')
    .eq('id', args.note_id)
    .in('section_id', sectionIds)
    .single();

  if (!note) return { error: 'Note not found' };

  const updates = {};

  if (args.content !== undefined) updates.content = args.content;
  if (args.date !== undefined) updates.date = args.date;
  if (args.completed !== undefined) updates.completed = args.completed;

  // Handle tags
  if (args.tags !== undefined) {
    updates.tags = args.tags;
  } else if (args.add_tags || args.remove_tags) {
    let newTags = [...(note.tags || [])];
    if (args.add_tags) {
      newTags = [...new Set([...newTags, ...args.add_tags])];
    }
    if (args.remove_tags) {
      newTags = newTags.filter(t => !args.remove_tags.includes(t));
    }
    updates.tags = newTags;
  }

  if (Object.keys(updates).length === 0) {
    return { success: true, message: 'No updates to apply' };
  }

  const { error } = await supabase
    .from('notes')
    .update(updates)
    .eq('id', args.note_id);

  if (error) throw error;
  return { success: true };
}

async function deleteNote(supabase, userId, args) {
  const sectionIds = await getUserSectionIds(supabase, userId);

  const { error } = await supabase
    .from('notes')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', args.note_id)
    .in('section_id', sectionIds);

  if (error) throw error;
  return { success: true };
}

async function moveNote(supabase, userId, args) {
  const sectionIds = await getUserSectionIds(supabase, userId);

  // Verify note exists and belongs to user
  const { data: note } = await supabase
    .from('notes')
    .select('id')
    .eq('id', args.note_id)
    .in('section_id', sectionIds)
    .single();

  if (!note) return { error: 'Note not found' };

  const toSectionId = await resolveSectionId(supabase, userId, {
    section_id: args.to_section_id,
    section_name: args.to_section_name,
    page_name: args.to_page_name
  });
  if (!toSectionId) return { error: 'Destination section not found' };

  const { error } = await supabase
    .from('notes')
    .update({ section_id: toSectionId })
    .eq('id', args.note_id);

  if (error) throw error;
  return { success: true };
}

// ============ BULK OPERATIONS ============

async function bulkUpdateNotes(supabase, userId, args) {
  const { filter, updates } = args;

  // Get ALL notes matching filter (limit: 0 removes the default cap)
  const notes = await getNotes(supabase, userId, { ...filter, limit: 0 });

  if (!notes.length) {
    return { success: true, updated: 0, failed: 0, total: 0, message: 'No notes matched the filter' };
  }

  // If specific note_ids provided, filter to those
  let targetNotes = notes;
  if (filter.note_ids?.length) {
    targetNotes = notes.filter(n => filter.note_ids.includes(n.id));
  }

  if (!targetNotes.length) {
    return { success: true, updated: 0, failed: 0, total: 0, message: 'No notes matched the filter' };
  }

  // Build update object
  const updateObj = {};

  if (updates.completed !== undefined) {
    updateObj.completed = updates.completed;
  }

  if (updates.set_tags !== undefined) {
    updateObj.tags = updates.set_tags;
  }

  // Handle move
  if (updates.move_to_section_id || updates.move_to_section_name) {
    const toSectionId = await resolveSectionId(supabase, userId, {
      section_id: updates.move_to_section_id,
      section_name: updates.move_to_section_name
    });
    if (toSectionId) {
      updateObj.section_id = toSectionId;
    }
  }

  // For add_tags/remove_tags, we need to update each note individually (sequential)
  if (updates.add_tags || updates.remove_tags) {
    let updated = 0;
    let failed = 0;

    for (const note of targetNotes) {
      let newTags = [...(note.tags || [])];
      if (updates.add_tags) {
        newTags = [...new Set([...newTags, ...updates.add_tags])];
      }
      if (updates.remove_tags) {
        newTags = newTags.filter(t => !updates.remove_tags.includes(t));
      }

      const noteUpdate = { ...updateObj, tags: newTags };

      const { error } = await supabase
        .from('notes')
        .update(noteUpdate)
        .eq('id', note.id);

      if (error) {
        failed++;
      } else {
        updated++;
      }
    }

    return { success: failed === 0, updated, failed, total: targetNotes.length };
  }

  // Bulk update if no tag manipulation needed — process sequentially for reliability
  if (Object.keys(updateObj).length > 0) {
    let updated = 0;
    let failed = 0;

    for (const note of targetNotes) {
      const { error } = await supabase
        .from('notes')
        .update(updateObj)
        .eq('id', note.id);

      if (error) {
        failed++;
      } else {
        updated++;
      }
    }

    return { success: failed === 0, updated, failed, total: targetNotes.length };
  }

  return { success: true, updated: 0, failed: 0, total: targetNotes.length, message: 'No updates to apply' };
}

async function bulkDeleteNotes(supabase, userId, args) {
  const { filter } = args;

  // Get ALL notes matching filter (limit: 0 removes the default cap)
  const notes = await getNotes(supabase, userId, { ...filter, limit: 0 });

  if (!notes.length) {
    return { success: true, deleted: 0, failed: 0, total: 0, message: 'No notes matched the filter' };
  }

  let targetNotes = notes;
  if (filter.note_ids?.length) {
    targetNotes = notes.filter(n => filter.note_ids.includes(n.id));
  }

  if (!targetNotes.length) {
    return { success: true, deleted: 0, failed: 0, total: 0, message: 'No notes matched the filter' };
  }

  // Delete sequentially for reliability and accurate counting
  const now = new Date().toISOString();
  let deleted = 0;
  let failed = 0;

  for (const note of targetNotes) {
    const { error } = await supabase
      .from('notes')
      .update({ deleted_at: now })
      .eq('id', note.id);

    if (error) {
      failed++;
    } else {
      deleted++;
    }
  }

  return { success: failed === 0, deleted, failed, total: targetNotes.length };
}

// ============ SORT OPERATIONS ============

async function sortNotes(supabase, userId, args) {
  // Fetch notes matching the criteria - the AI will receive these and return ordered IDs
  const fetchArgs = {};
  if (args.section_id) fetchArgs.section_id = args.section_id;
  if (args.section_name) fetchArgs.section_name = args.section_name;
  if (args.page_name) fetchArgs.page_name = args.page_name;
  fetchArgs.limit = 200;

  const notes = await getNotes(supabase, userId, fetchArgs);

  // Filter to specific note IDs if provided
  let targetNotes = notes;
  if (args.note_ids?.length) {
    targetNotes = notes.filter(n => args.note_ids.includes(n.id));
  }

  if (!targetNotes.length) {
    return { error: 'No notes found to sort', notes: [] };
  }

  // Return notes with content so the AI can analyze and return sorted IDs
  return {
    criteria: args.criteria,
    notes: targetNotes.map(n => ({
      id: n.id,
      content: n.content,
      tags: n.tags || [],
      date: n.date,
      completed: n.completed,
      created_at: n.created_at
    })),
    instruction: `Sort these ${targetNotes.length} notes by "${args.criteria}". Return the note IDs in the desired order as a sorted_ids array.`
  };
}

// ============ TRASH / RECOVERY ============

async function getDeletedItems(supabase, userId) {
  const pageIds = await getUserPageIds(supabase, userId);
  if (!pageIds.length) return { pages: [], sections: [], notes: [] };

  // Get deleted pages
  const { data: deletedPages } = await supabase
    .from('pages')
    .select('id, name, deleted_at')
    .in('id', pageIds)
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false });

  // Get sections for all pages (including deleted ones)
  const { data: allSections } = await supabase
    .from('sections')
    .select('id, name, page_id, deleted_at, pages(name)')
    .in('page_id', pageIds);

  const deletedPageIds = new Set((deletedPages || []).map(p => p.id));

  // Deleted sections whose parent page is NOT deleted
  const deletedSections = (allSections || []).filter(s =>
    s.deleted_at && !deletedPageIds.has(s.page_id)
  );

  const deletedSectionIds = new Set((allSections || []).filter(s => s.deleted_at).map(s => s.id));
  const allSectionIds = (allSections || []).map(s => s.id);

  // Get deleted notes whose parent section/page are NOT deleted
  let deletedNotes = [];
  if (allSectionIds.length) {
    const { data } = await supabase
      .from('notes')
      .select('id, content, section_id, deleted_at')
      .in('section_id', allSectionIds)
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false });

    const sectionLookup = new Map((allSections || []).map(s => [s.id, s]));
    deletedNotes = (data || []).filter(n => {
      const sec = sectionLookup.get(n.section_id);
      return !deletedSectionIds.has(n.section_id) && !deletedPageIds.has(sec?.page_id);
    }).map(n => {
      const sec = sectionLookup.get(n.section_id);
      return {
        id: n.id,
        content: (n.content || '').substring(0, 100),
        section_name: sec?.name || 'Unknown',
        page_name: sec?.pages?.name || 'Unknown',
        deleted_at: n.deleted_at
      };
    });
  }

  return {
    pages: (deletedPages || []).map(p => ({ id: p.id, name: p.name, deleted_at: p.deleted_at })),
    sections: deletedSections.map(s => ({
      id: s.id,
      name: s.name,
      page_name: s.pages?.name || 'Unknown',
      deleted_at: s.deleted_at
    })),
    notes: deletedNotes
  };
}

async function restoreItems(supabase, userId, args) {
  const results = [];

  for (const item of args.items) {
    const { type, id } = item;
    let success = false;

    if (type === 'page') {
      const { error } = await supabase
        .from('pages')
        .update({ deleted_at: null })
        .eq('id', id);
      if (!error) {
        // Restore child sections and notes
        const { data: sections } = await supabase
          .from('sections')
          .select('id')
          .eq('page_id', id)
          .not('deleted_at', 'is', null);
        if (sections?.length) {
          const sids = sections.map(s => s.id);
          await supabase.from('sections').update({ deleted_at: null }).in('id', sids);
          await supabase.from('notes').update({ deleted_at: null }).in('section_id', sids).not('deleted_at', 'is', null);
        }
        success = true;
      }
    } else if (type === 'section') {
      const { error } = await supabase
        .from('sections')
        .update({ deleted_at: null })
        .eq('id', id);
      if (!error) {
        await supabase.from('notes').update({ deleted_at: null }).eq('section_id', id).not('deleted_at', 'is', null);
        success = true;
      }
    } else if (type === 'note') {
      const { error } = await supabase
        .from('notes')
        .update({ deleted_at: null })
        .eq('id', id);
      success = !error;
    }

    results.push({ type, id, restored: success });
  }

  return { restored: results.filter(r => r.restored).length, results };
}

// ============ CONNECTION OPERATIONS ============

async function getConnectedNotes(supabase, userId, { note_id }) {
  const { data, error } = await supabase.rpc('get_note_connections', { p_note_id: note_id });
  if (error) return { error: error.message };
  return { connections: data || [], count: data?.length || 0 };
}

async function createConnectionAgent(supabase, userId, { source_note_id, target_note_id, connection_type = 'related', label = null }) {
  const { data, error } = await supabase
    .from('note_connections')
    .insert({
      source_note_id,
      target_note_id,
      connection_type,
      label,
      created_by_user_id: userId,
    })
    .select()
    .single();

  if (error) return { error: error.message };
  return { success: true, connection_id: data.id, action: 'refresh_connections' };
}

async function deleteConnectionAgent(supabase, userId, { connection_id }) {
  const { error } = await supabase
    .from('note_connections')
    .delete()
    .eq('id', connection_id)
    .eq('created_by_user_id', userId);

  if (error) return { error: error.message };
  return { success: true, action: 'refresh_connections' };
}
