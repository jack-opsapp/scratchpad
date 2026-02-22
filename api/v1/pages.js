/**
 * GET  /api/v1/pages         → list all pages for authenticated user
 * POST /api/v1/pages { name } → create page
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
  if (!auth) return; // authenticateApiKey already sent the response

  const { userId, supabase } = auth;

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('pages')
        .select('id, name, starred, position, created_at')
        .eq('user_id', userId)
        .order('position');

      if (error) {
        console.error('Failed to fetch pages:', error);
        return res.status(500).json({ error: 'Failed to fetch pages' });
      }

      return res.json({ pages: data || [] });
    }

    // POST
    const { name } = req.body || {};
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }

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
      .insert({ name: name.trim(), user_id: userId, position })
      .select('id, name, starred, position, created_at')
      .single();

    if (error) {
      console.error('Failed to create page:', error);
      return res.status(500).json({ error: 'Failed to create page' });
    }

    return res.status(201).json({ page: data });
  } catch (err) {
    console.error('Pages handler error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
