/**
 * GET  /api/v1/sections?page_id=  → list sections (page_id optional; omit for all)
 * POST /api/v1/sections { name, page_id } → create section
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
    // Get user's page IDs for ownership checks
    const { data: pages, error: pagesError } = await supabase
      .from('pages')
      .select('id, name')
      .eq('user_id', userId);

    if (pagesError) {
      return res.status(500).json({ error: 'Failed to fetch pages' });
    }

    const userPageIds = (pages || []).map(p => p.id);
    const pageNameMap = Object.fromEntries((pages || []).map(p => [p.id, p.name]));

    if (req.method === 'GET') {
      const { page_id } = req.query;

      // If page_id provided, verify it belongs to user
      if (page_id && !userPageIds.includes(page_id)) {
        return res.status(403).json({ error: 'page_id not found or access denied' });
      }

      let query = supabase
        .from('sections')
        .select('id, name, page_id, position, created_at')
        .order('position');

      if (page_id) {
        query = query.eq('page_id', page_id);
      } else if (userPageIds.length > 0) {
        query = query.in('page_id', userPageIds);
      } else {
        return res.json({ sections: [] });
      }

      const { data, error } = await query;
      if (error) {
        return res.status(500).json({ error: 'Failed to fetch sections' });
      }

      const sections = (data || []).map(s => ({
        id: s.id,
        name: s.name,
        page_id: s.page_id,
        page_name: pageNameMap[s.page_id] || null,
        position: s.position,
        created_at: s.created_at
      }));

      return res.json({ sections });
    }

    // POST
    const { name, page_id } = req.body || {};
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }
    if (!page_id) {
      return res.status(400).json({ error: 'page_id is required' });
    }
    if (!userPageIds.includes(page_id)) {
      return res.status(403).json({ error: 'page_id not found or access denied' });
    }

    // Get max position for the target page
    const { data: existing } = await supabase
      .from('sections')
      .select('position')
      .eq('page_id', page_id)
      .order('position', { ascending: false })
      .limit(1);

    const position = (existing?.[0]?.position ?? -1) + 1;

    const { data, error } = await supabase
      .from('sections')
      .insert({ name: name.trim(), page_id, position })
      .select('id, name, page_id, position, created_at')
      .single();

    if (error) {
      return res.status(500).json({ error: 'Failed to create section' });
    }

    return res.status(201).json({
      section: {
        id: data.id,
        name: data.name,
        page_id: data.page_id,
        page_name: pageNameMap[data.page_id] || null,
        position: data.position,
        created_at: data.created_at
      }
    });
  } catch (err) {
    console.error('Sections handler error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
