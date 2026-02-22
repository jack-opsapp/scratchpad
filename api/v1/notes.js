/**
 * GET  /api/v1/notes  query params: page_id, section_id, completed, tags, date_from, date_to, search, limit
 * POST /api/v1/notes  { content, section_id, tags?, date? }
 *
 * Auth: X-API-Key header
 */

import { authenticateApiKey } from './auth.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await authenticateApiKey(req, res);
  if (!auth) return;

  const { userId, supabase } = auth;

  try {
    // Step 1: Get user's pages
    const { data: pages, error: pagesError } = await supabase
      .from('pages')
      .select('id, name')
      .eq('user_id', userId);

    if (pagesError) {
      return res.status(500).json({ error: 'Failed to fetch pages' });
    }

    const userPageIds = (pages || []).map(p => p.id);
    const pageNameMap = Object.fromEntries((pages || []).map(p => [p.id, p.name]));

    if (!userPageIds.length) {
      if (req.method === 'GET') return res.json({ notes: [], total: 0 });
    }

    // Step 2: Get user's sections
    const { data: sections, error: sectionsError } = await supabase
      .from('sections')
      .select('id, name, page_id')
      .in('page_id', userPageIds.length ? userPageIds : ['00000000-0000-0000-0000-000000000000']);

    if (sectionsError) {
      return res.status(500).json({ error: 'Failed to fetch sections' });
    }

    const userSectionIds = (sections || []).map(s => s.id);
    const sectionMap = Object.fromEntries((sections || []).map(s => [s.id, s]));

    if (req.method === 'GET') {
      const {
        page_id,
        section_id,
        completed,
        tags,
        date_from,
        date_to,
        search,
        limit: limitParam
      } = req.query;

      const limit = Math.min(parseInt(limitParam) || 50, 200);

      // Validate filters against user's data
      if (page_id && !userPageIds.includes(page_id)) {
        return res.status(403).json({ error: 'page_id not found or access denied' });
      }
      if (section_id && !userSectionIds.includes(section_id)) {
        return res.status(403).json({ error: 'section_id not found or access denied' });
      }

      if (!userSectionIds.length) {
        return res.json({ notes: [], total: 0 });
      }

      let query = supabase
        .from('notes')
        .select('id, content, tags, date, completed, created_at, section_id')
        .in('section_id', userSectionIds)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (section_id) {
        query = query.eq('section_id', section_id);
      } else if (page_id) {
        // Filter to sections in that page
        const pageSectionIds = (sections || [])
          .filter(s => s.page_id === page_id)
          .map(s => s.id);
        if (!pageSectionIds.length) return res.json({ notes: [], total: 0 });
        query = query.in('section_id', pageSectionIds);
      }

      if (completed !== undefined) {
        query = query.eq('completed', completed === 'true');
      }

      if (tags) {
        const tagList = tags.split(',').map(t => t.trim()).filter(Boolean);
        if (tagList.length) query = query.overlaps('tags', tagList);
      }

      if (date_from) {
        query = query.gte('created_at', date_from);
      }

      if (date_to) {
        query = query.lte('created_at', date_to);
      }

      if (search) {
        query = query.ilike('content', `%${search}%`);
      }

      const { data, error } = await query;
      if (error) {
        return res.status(500).json({ error: 'Failed to fetch notes' });
      }

      const notes = (data || []).map(note => {
        const section = sectionMap[note.section_id];
        return {
          id: note.id,
          content: note.content,
          tags: note.tags || [],
          date: note.date,
          completed: note.completed,
          created_at: note.created_at,
          section_id: note.section_id,
          section_name: section?.name || null,
          page_id: section?.page_id || null,
          page_name: section ? (pageNameMap[section.page_id] || null) : null
        };
      });

      return res.json({ notes, total: notes.length });
    }

    // POST
    const { content, section_id, tags, date } = req.body || {};

    if (!content || typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ error: 'content is required' });
    }
    if (!section_id) {
      return res.status(400).json({ error: 'section_id is required' });
    }
    if (!userSectionIds.includes(section_id)) {
      return res.status(403).json({ error: 'section_id not found or access denied' });
    }

    const noteData = {
      content: content.trim(),
      section_id,
      tags: Array.isArray(tags) ? tags : [],
      date: date || null,
      completed: false
    };

    const { data, error } = await supabase
      .from('notes')
      .insert(noteData)
      .select('id, content, tags, date, completed, created_at, section_id')
      .single();

    if (error) {
      return res.status(500).json({ error: 'Failed to create note' });
    }

    return res.status(201).json({ note: data });
  } catch (err) {
    console.error('Notes handler error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
