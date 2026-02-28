/**
 * Slate REST API v1 — catch-all router
 *
 * Routes:
 *   POST   /api/v1/keys              (Bearer JWT auth)
 *   GET    /api/v1/pages
 *   POST   /api/v1/pages
 *   PATCH  /api/v1/pages/:id
 *   DELETE /api/v1/pages/:id
 *   GET    /api/v1/sections?page_id=
 *   POST   /api/v1/sections
 *   PATCH  /api/v1/sections/:id
 *   DELETE /api/v1/sections/:id
 *   GET    /api/v1/notes?...filters
 *   POST   /api/v1/notes
 *   PATCH  /api/v1/notes/:id
 *   DELETE /api/v1/notes/:id
 *   GET    /api/v1/tags
 *   GET    /api/v1/connections
 *   GET    /api/v1/connections?note_id=
 *   POST   /api/v1/connections
 *   DELETE /api/v1/connections/:id
 *
 * All data endpoints use X-API-Key header auth.
 */

import { createClient } from '@supabase/supabase-js';
import { createHash, randomBytes } from 'crypto';

// ============ AUTH HELPERS ============

function createSupabaseServiceClient() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase not configured');
  return createClient(url, key);
}

async function authenticateApiKey(req, res) {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) {
    res.status(401).json({ error: 'Missing X-API-Key header' });
    return null;
  }

  const keyHash = createHash('sha256').update(apiKey).digest('hex');

  let supabase;
  try { supabase = createSupabaseServiceClient(); }
  catch { res.status(500).json({ error: 'Database not configured' }); return null; }

  const { data: keyRecord, error } = await supabase
    .from('api_keys')
    .select('id, user_id, revoked_at')
    .eq('key_hash', keyHash)
    .single();

  if (error || !keyRecord) {
    res.status(401).json({ error: 'Invalid API key' });
    return null;
  }
  if (keyRecord.revoked_at) {
    res.status(401).json({ error: 'API key has been revoked' });
    return null;
  }

  // Update last_used_at non-blocking
  supabase.from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', keyRecord.id).then(() => {});

  return { userId: keyRecord.user_id, supabase };
}

// ============ MAIN HANDLER ============

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Extract resource and optional ID from URL path
  const urlPath = req.url.split('?')[0];
  const match = urlPath.match(/\/api\/v1\/([^/]+)(?:\/([^/]+))?/);
  const pathSegments = Array.isArray(req.query.path) ? req.query.path : [];
  const resource = match?.[1] || pathSegments[0] || '';
  const resourceId = match?.[2] || pathSegments[1] || null;

  switch (resource) {
    case 'keys':     return handleKeys(req, res);
    case 'pages':    return handlePages(req, res, resourceId);
    case 'sections': return handleSections(req, res, resourceId);
    case 'notes':    return handleNotes(req, res, resourceId);
    case 'tags':     return handleTags(req, res);
    case 'connections': return handleConnections(req, res, resourceId);
    default:
      return res.status(404).json({ error: `Unknown resource: ${resource || '(empty)'}` });
  }
}

// ============ /keys ============

async function handleKeys(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers['authorization'];
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing Authorization header' });
  }

  let supabase;
  try { supabase = createSupabaseServiceClient(); }
  catch { return res.status(500).json({ error: 'Database not configured' }); }

  const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.slice(7));
  if (authError || !user) {
    return res.status(401).json({ error: 'Invalid or expired session token' });
  }

  const { name } = req.body || {};
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }

  try {
    const rawKey = 'sk_live_' + randomBytes(32).toString('hex');
    const keyHash = createHash('sha256').update(rawKey).digest('hex');

    const { data, error } = await supabase
      .from('api_keys')
      .insert({ user_id: user.id, key_hash: keyHash, key_raw: rawKey, name: name.trim() })
      .select('id, name, created_at')
      .single();

    if (error) return res.status(500).json({ error: 'Failed to create API key' });

    return res.status(201).json({ id: data.id, name: data.name, key: rawKey, created_at: data.created_at });
  } catch (err) {
    console.error('Key generation error:', err);
    return res.status(500).json({ error: 'Failed to generate API key' });
  }
}

// ============ /pages ============

async function handlePages(req, res, resourceId) {
  // Method guard: PATCH/DELETE require resourceId; GET/POST must not have one
  if (resourceId) {
    if (req.method !== 'PATCH' && req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' });
  } else {
    if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await authenticateApiKey(req, res);
  if (!auth) return;
  const { userId, supabase } = auth;

  try {
    if (req.method === 'GET') {
      const { deleted } = req.query;
      if (deleted && deleted !== 'include' && deleted !== 'only') {
        return res.status(400).json({ error: 'deleted must be "include" or "only"' });
      }

      let query = supabase
        .from('pages')
        .select('id, name, starred, position, created_at, deleted_at')
        .eq('user_id', userId)
        .order('position');

      if (deleted === 'only') query = query.not('deleted_at', 'is', null);
      else if (deleted !== 'include') query = query.is('deleted_at', null);

      const { data, error } = await query;
      if (error) return res.status(500).json({ error: 'Failed to fetch pages' });
      return res.json({ pages: data || [] });
    }

    if (req.method === 'POST') {
      const { name } = req.body || {};
      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: 'name is required' });
      }

      const { data: existing } = await supabase
        .from('pages').select('position').eq('user_id', userId)
        .order('position', { ascending: false }).limit(1);
      const position = (existing?.[0]?.position ?? -1) + 1;

      const { data, error } = await supabase
        .from('pages')
        .insert({ name: name.trim(), user_id: userId, position })
        .select('id, name, starred, position, created_at, deleted_at')
        .single();

      if (error) return res.status(500).json({ error: 'Failed to create page' });
      return res.status(201).json({ page: data });
    }

    if (req.method === 'PATCH') {
      const { name, starred } = req.body || {};
      const updates = {};

      if (name !== undefined) {
        if (typeof name !== 'string' || !name.trim()) {
          return res.status(400).json({ error: 'name must be a non-empty string' });
        }
        updates.name = name.trim();
      }
      if (starred !== undefined) {
        if (typeof starred !== 'boolean') {
          return res.status(400).json({ error: 'starred must be a boolean' });
        }
        updates.starred = starred;
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'No valid fields to update (name, starred)' });
      }

      const { data, error } = await supabase
        .from('pages')
        .update(updates)
        .eq('id', resourceId)
        .eq('user_id', userId)
        .is('deleted_at', null)
        .select('id, name, starred, position, created_at, deleted_at')
        .single();

      if (error || !data) return res.status(404).json({ error: 'Page not found' });
      return res.json({ page: data });
    }

    if (req.method === 'DELETE') {
      const { data, error } = await supabase
        .from('pages')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', resourceId)
        .eq('user_id', userId)
        .is('deleted_at', null)
        .select('id')
        .single();

      if (error || !data) return res.status(404).json({ error: 'Page not found' });
      return res.json({ deleted: true, id: data.id });
    }
  } catch (err) {
    console.error('Pages error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// ============ /sections ============

async function handleSections(req, res, resourceId) {
  // Method guard: PATCH/DELETE require resourceId; GET/POST must not have one
  if (resourceId) {
    if (req.method !== 'PATCH' && req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' });
  } else {
    if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await authenticateApiKey(req, res);
  if (!auth) return;
  const { userId, supabase } = auth;

  try {
    // Ownership check — always fetch all pages regardless of deleted status
    const { data: pages, error: pagesError } = await supabase
      .from('pages').select('id, name').eq('user_id', userId);
    if (pagesError) return res.status(500).json({ error: 'Failed to fetch pages' });

    const userPageIds = (pages || []).map(p => p.id);
    const pageNameMap = Object.fromEntries((pages || []).map(p => [p.id, p.name]));

    if (req.method === 'GET') {
      const { page_id, deleted } = req.query;
      if (deleted && deleted !== 'include' && deleted !== 'only') {
        return res.status(400).json({ error: 'deleted must be "include" or "only"' });
      }
      if (page_id && !userPageIds.includes(page_id)) {
        return res.status(403).json({ error: 'page_id not found or access denied' });
      }

      let query = supabase.from('sections')
        .select('id, name, page_id, position, created_at, deleted_at').order('position');

      if (deleted === 'only') query = query.not('deleted_at', 'is', null);
      else if (deleted !== 'include') query = query.is('deleted_at', null);

      if (page_id) query = query.eq('page_id', page_id);
      else if (userPageIds.length > 0) query = query.in('page_id', userPageIds);
      else return res.json({ sections: [] });

      const { data, error } = await query;
      if (error) return res.status(500).json({ error: 'Failed to fetch sections' });

      return res.json({
        sections: (data || []).map(s => ({
          id: s.id, name: s.name, page_id: s.page_id,
          page_name: pageNameMap[s.page_id] || null,
          position: s.position, created_at: s.created_at,
          deleted_at: s.deleted_at
        }))
      });
    }

    if (req.method === 'POST') {
      const { name, page_id } = req.body || {};
      if (!name || typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'name is required' });
      if (!page_id) return res.status(400).json({ error: 'page_id is required' });
      if (!userPageIds.includes(page_id)) return res.status(403).json({ error: 'page_id not found or access denied' });

      const { data: existing } = await supabase
        .from('sections').select('position').eq('page_id', page_id)
        .order('position', { ascending: false }).limit(1);
      const position = (existing?.[0]?.position ?? -1) + 1;

      const { data, error } = await supabase
        .from('sections')
        .insert({ name: name.trim(), page_id, position })
        .select('id, name, page_id, position, created_at, deleted_at')
        .single();

      if (error) return res.status(500).json({ error: 'Failed to create section' });

      return res.status(201).json({
        section: { ...data, page_name: pageNameMap[data.page_id] || null }
      });
    }

    if (req.method === 'PATCH') {
      // Fetch section to verify ownership via page_id
      const { data: section, error: fetchError } = await supabase
        .from('sections')
        .select('id, page_id')
        .eq('id', resourceId)
        .is('deleted_at', null)
        .single();

      if (fetchError || !section || !userPageIds.includes(section.page_id)) {
        return res.status(404).json({ error: 'Section not found' });
      }

      const { name } = req.body || {};
      if (name === undefined) {
        return res.status(400).json({ error: 'No valid fields to update (name)' });
      }
      if (typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: 'name must be a non-empty string' });
      }

      const { data, error } = await supabase
        .from('sections')
        .update({ name: name.trim() })
        .eq('id', resourceId)
        .select('id, name, page_id, position, created_at, deleted_at')
        .single();

      if (error || !data) return res.status(500).json({ error: 'Failed to update section' });

      return res.json({
        section: { ...data, page_name: pageNameMap[data.page_id] || null }
      });
    }

    if (req.method === 'DELETE') {
      // Fetch section to verify ownership via page_id
      const { data: section, error: fetchError } = await supabase
        .from('sections')
        .select('id, page_id')
        .eq('id', resourceId)
        .is('deleted_at', null)
        .single();

      if (fetchError || !section || !userPageIds.includes(section.page_id)) {
        return res.status(404).json({ error: 'Section not found' });
      }

      const { data, error } = await supabase
        .from('sections')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', resourceId)
        .is('deleted_at', null)
        .select('id')
        .single();

      if (error || !data) return res.status(500).json({ error: 'Failed to delete section' });
      return res.json({ deleted: true, id: data.id });
    }
  } catch (err) {
    console.error('Sections error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// ============ /notes ============

async function handleNotes(req, res, resourceId) {
  // Method guard: PATCH/DELETE require resourceId; GET/POST must not have one
  if (resourceId) {
    if (req.method !== 'PATCH' && req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' });
  } else {
    if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await authenticateApiKey(req, res);
  if (!auth) return;
  const { userId, supabase } = auth;

  try {
    // Ownership checks — always include all pages/sections regardless of deleted status
    const { data: pages, error: pagesError } = await supabase
      .from('pages').select('id, name').eq('user_id', userId);
    if (pagesError) return res.status(500).json({ error: 'Failed to fetch pages' });

    const userPageIds = (pages || []).map(p => p.id);
    const pageNameMap = Object.fromEntries((pages || []).map(p => [p.id, p.name]));

    if (!userPageIds.length && req.method === 'GET') return res.json({ notes: [], total: 0 });

    const { data: sections, error: sectionsError } = await supabase
      .from('sections').select('id, name, page_id')
      .in('page_id', userPageIds.length ? userPageIds : ['00000000-0000-0000-0000-000000000000']);
    if (sectionsError) return res.status(500).json({ error: 'Failed to fetch sections' });

    const userSectionIds = (sections || []).map(s => s.id);
    const sectionMap = Object.fromEntries((sections || []).map(s => [s.id, s]));

    if (req.method === 'GET') {
      const { page_id, section_id, completed, tags, date_from, date_to, search, limit: limitParam, deleted } = req.query;
      if (deleted && deleted !== 'include' && deleted !== 'only') {
        return res.status(400).json({ error: 'deleted must be "include" or "only"' });
      }
      const limit = Math.min(parseInt(limitParam) || 50, 200);

      if (page_id && !userPageIds.includes(page_id)) return res.status(403).json({ error: 'page_id not found or access denied' });
      if (section_id && !userSectionIds.includes(section_id)) return res.status(403).json({ error: 'section_id not found or access denied' });
      if (!userSectionIds.length) return res.json({ notes: [], total: 0 });

      let query = supabase.from('notes')
        .select('id, content, tags, date, completed, created_at, deleted_at, section_id')
        .in('section_id', userSectionIds)
        .order('created_at', { ascending: false }).limit(limit);

      if (deleted === 'only') query = query.not('deleted_at', 'is', null);
      else if (deleted !== 'include') query = query.is('deleted_at', null);

      if (section_id) {
        query = query.eq('section_id', section_id);
      } else if (page_id) {
        const pageSectionIds = (sections || []).filter(s => s.page_id === page_id).map(s => s.id);
        if (!pageSectionIds.length) return res.json({ notes: [], total: 0 });
        query = query.in('section_id', pageSectionIds);
      }

      if (completed !== undefined) query = query.eq('completed', completed === 'true');
      if (tags) {
        const tagList = tags.split(',').map(t => t.trim()).filter(Boolean);
        if (tagList.length) query = query.overlaps('tags', tagList);
      }
      if (date_from) query = query.gte('created_at', date_from);
      if (date_to) query = query.lte('created_at', date_to);
      if (search) query = query.ilike('content', `%${search}%`);

      const { data, error } = await query;
      if (error) return res.status(500).json({ error: 'Failed to fetch notes' });

      const notes = (data || []).map(note => {
        const section = sectionMap[note.section_id];
        return {
          id: note.id, content: note.content, tags: note.tags || [],
          date: note.date, completed: note.completed, created_at: note.created_at,
          deleted_at: note.deleted_at,
          section_id: note.section_id, section_name: section?.name || null,
          page_id: section?.page_id || null,
          page_name: section ? (pageNameMap[section.page_id] || null) : null
        };
      });

      return res.json({ notes, total: notes.length });
    }

    if (req.method === 'POST') {
      const { content, section_id, tags, date } = req.body || {};
      if (!content || typeof content !== 'string' || !content.trim()) return res.status(400).json({ error: 'content is required' });
      if (!section_id) return res.status(400).json({ error: 'section_id is required' });
      if (!userSectionIds.includes(section_id)) return res.status(403).json({ error: 'section_id not found or access denied' });

      const { data, error } = await supabase.from('notes')
        .insert({ content: content.trim(), section_id, tags: Array.isArray(tags) ? tags : [], date: date || null, completed: false })
        .select('id, content, tags, date, completed, created_at, deleted_at, section_id')
        .single();

      if (error) return res.status(500).json({ error: 'Failed to create note' });
      return res.status(201).json({ note: data });
    }

    if (req.method === 'PATCH') {
      // Fetch note to verify ownership via section_id chain
      const { data: note, error: fetchError } = await supabase
        .from('notes')
        .select('id, content, tags, date, completed, completed_at, created_at, deleted_at, section_id')
        .eq('id', resourceId)
        .is('deleted_at', null)
        .single();

      if (fetchError || !note || !userSectionIds.includes(note.section_id)) {
        return res.status(404).json({ error: 'Note not found' });
      }

      const { content, tags, completed, date } = req.body || {};
      const updates = {};

      if (content !== undefined) {
        if (typeof content !== 'string' || !content.trim()) {
          return res.status(400).json({ error: 'content must be a non-empty string' });
        }
        updates.content = content.trim();
      }
      if (tags !== undefined) {
        if (!Array.isArray(tags)) {
          return res.status(400).json({ error: 'tags must be an array' });
        }
        updates.tags = tags;
      }
      if (completed !== undefined) {
        if (typeof completed !== 'boolean') {
          return res.status(400).json({ error: 'completed must be a boolean' });
        }
        updates.completed = completed;
        // Auto-manage completed_at based on transition
        if (completed === true && note.completed === false) {
          updates.completed_at = new Date().toISOString();
        } else if (completed === false && note.completed === true) {
          updates.completed_at = null;
        }
      }
      if (date !== undefined) {
        updates.date = date;
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'No valid fields to update (content, tags, completed, date)' });
      }

      const { data, error } = await supabase
        .from('notes')
        .update(updates)
        .eq('id', resourceId)
        .select('id, content, tags, date, completed, completed_at, created_at, deleted_at, section_id')
        .single();

      if (error || !data) return res.status(500).json({ error: 'Failed to update note' });

      const section = sectionMap[data.section_id];
      return res.json({
        note: {
          id: data.id, content: data.content, tags: data.tags || [],
          date: data.date, completed: data.completed, completed_at: data.completed_at,
          created_at: data.created_at, deleted_at: data.deleted_at,
          section_id: data.section_id, section_name: section?.name || null,
          page_id: section?.page_id || null,
          page_name: section ? (pageNameMap[section.page_id] || null) : null
        }
      });
    }

    if (req.method === 'DELETE') {
      // Fetch note to verify ownership via section_id chain
      const { data: note, error: fetchError } = await supabase
        .from('notes')
        .select('id, section_id')
        .eq('id', resourceId)
        .is('deleted_at', null)
        .single();

      if (fetchError || !note || !userSectionIds.includes(note.section_id)) {
        return res.status(404).json({ error: 'Note not found' });
      }

      const { data, error } = await supabase
        .from('notes')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', resourceId)
        .is('deleted_at', null)
        .select('id')
        .single();

      if (error || !data) return res.status(500).json({ error: 'Failed to delete note' });
      return res.json({ deleted: true, id: data.id });
    }
  } catch (err) {
    console.error('Notes error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// ============ /tags ============

async function handleTags(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await authenticateApiKey(req, res);
  if (!auth) return;
  const { userId, supabase } = auth;

  try {
    // Only aggregate tags from non-deleted pages, sections, and notes
    const { data: pages } = await supabase.from('pages').select('id').eq('user_id', userId).is('deleted_at', null);
    const userPageIds = (pages || []).map(p => p.id);
    if (!userPageIds.length) return res.json({ tags: [] });

    const { data: sections } = await supabase.from('sections').select('id').in('page_id', userPageIds).is('deleted_at', null);
    const userSectionIds = (sections || []).map(s => s.id);
    if (!userSectionIds.length) return res.json({ tags: [] });

    const { data: notes, error } = await supabase.from('notes')
      .select('tags').in('section_id', userSectionIds).is('deleted_at', null).not('tags', 'is', null);
    if (error) return res.status(500).json({ error: 'Failed to fetch tags' });

    const allTags = [...new Set((notes || []).flatMap(n => n.tags || []).filter(Boolean))].sort();
    return res.json({ tags: allTags });
  } catch (err) {
    console.error('Tags error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// ============ /connections ============

const VALID_CONNECTION_TYPES = ['related', 'supports', 'contradicts', 'extends', 'source'];

async function handleConnections(req, res, resourceId) {
  // Method guard: DELETE requires resourceId; GET/POST must not have one
  if (resourceId) {
    if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' });
  } else {
    if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await authenticateApiKey(req, res);
  if (!auth) return;
  const { userId, supabase } = auth;

  try {
    if (req.method === 'GET') {
      const { note_id } = req.query;

      if (note_id) {
        // Get connections for a specific note
        const { data, error } = await supabase.rpc('get_note_connections', { p_note_id: note_id });
        if (error) return res.status(500).json({ error: 'Failed to fetch connections' });
        return res.json({ connections: data || [] });
      } else {
        // Get all connections for the user
        const { data, error } = await supabase.rpc('get_all_connections', { p_user_id: userId });
        if (error) return res.status(500).json({ error: 'Failed to fetch connections' });
        return res.json({ connections: data || [] });
      }
    }

    if (req.method === 'POST') {
      const { source_note_id, target_note_id, connection_type, label } = req.body || {};

      if (!source_note_id) return res.status(400).json({ error: 'source_note_id is required' });
      if (!target_note_id) return res.status(400).json({ error: 'target_note_id is required' });

      const connType = connection_type || 'related';
      if (!VALID_CONNECTION_TYPES.includes(connType)) {
        return res.status(400).json({ error: `connection_type must be one of: ${VALID_CONNECTION_TYPES.join(', ')}` });
      }

      const row = {
        source_note_id,
        target_note_id,
        connection_type: connType,
        created_by_user_id: userId,
      };
      if (label) row.label = label;

      const { data, error } = await supabase
        .from('note_connections')
        .insert(row)
        .select('*')
        .single();

      if (error) return res.status(500).json({ error: 'Failed to create connection' });
      return res.status(201).json({ connection: data });
    }

    if (req.method === 'DELETE') {
      const { data, error } = await supabase
        .from('note_connections')
        .delete()
        .eq('id', resourceId)
        .eq('created_by_user_id', userId)
        .select('id')
        .single();

      if (error || !data) return res.status(404).json({ error: 'Connection not found' });
      return res.json({ deleted: true, id: data.id });
    }
  } catch (err) {
    console.error('Connections error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
