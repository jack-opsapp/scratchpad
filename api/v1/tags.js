/**
 * GET /api/v1/tags → sorted array of all unique tags across user's notes
 *
 * Auth: X-API-Key header
 */

import { authenticateApiKey } from './auth.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await authenticateApiKey(req, res);
  if (!auth) return;

  const { userId, supabase } = auth;

  try {
    // Get user's pages
    const { data: pages, error: pagesError } = await supabase
      .from('pages')
      .select('id')
      .eq('user_id', userId);

    if (pagesError) {
      return res.status(500).json({ error: 'Failed to fetch pages' });
    }

    const userPageIds = (pages || []).map(p => p.id);
    if (!userPageIds.length) return res.json({ tags: [] });

    // Get user's sections
    const { data: sections, error: sectionsError } = await supabase
      .from('sections')
      .select('id')
      .in('page_id', userPageIds);

    if (sectionsError) {
      return res.status(500).json({ error: 'Failed to fetch sections' });
    }

    const userSectionIds = (sections || []).map(s => s.id);
    if (!userSectionIds.length) return res.json({ tags: [] });

    // Get all tags from user's notes
    const { data: notes, error: notesError } = await supabase
      .from('notes')
      .select('tags')
      .in('section_id', userSectionIds)
      .not('tags', 'is', null);

    if (notesError) {
      return res.status(500).json({ error: 'Failed to fetch tags' });
    }

    const allTags = [...new Set(
      (notes || [])
        .flatMap(n => n.tags || [])
        .filter(Boolean)
    )].sort();

    return res.json({ tags: allTags });
  } catch (err) {
    console.error('Tags handler error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
