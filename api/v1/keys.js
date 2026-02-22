/**
 * POST /api/v1/keys
 *
 * Generates a new API key for the authenticated user.
 * Auth: Authorization: Bearer <supabase_jwt>
 * Body: { name: string }
 * Returns: { id, name, key, created_at }  ← key shown once, never retrievable again
 */

import { createClient } from '@supabase/supabase-js';
import { createHash, randomBytes } from 'crypto';
import { createSupabaseServiceClient } from './auth.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Authenticate via Supabase JWT (not API key — can't use an API key to create an API key)
  const authHeader = req.headers['authorization'];
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing Authorization header' });
  }

  const token = authHeader.slice(7);

  let supabase;
  try {
    supabase = createSupabaseServiceClient();
  } catch (err) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return res.status(401).json({ error: 'Invalid or expired session token' });
  }

  const { name } = req.body || {};
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }

  try {
    // Generate key: sk_live_ + 64 hex chars = 72 chars total
    const rawKey = 'sk_live_' + randomBytes(32).toString('hex');
    const keyHash = createHash('sha256').update(rawKey).digest('hex');

    const { data, error } = await supabase
      .from('api_keys')
      .insert({
        user_id: user.id,
        key_hash: keyHash,
        name: name.trim()
      })
      .select('id, name, created_at')
      .single();

    if (error) {
      console.error('Failed to store API key:', error);
      return res.status(500).json({ error: 'Failed to create API key' });
    }

    return res.status(201).json({
      id: data.id,
      name: data.name,
      key: rawKey,
      created_at: data.created_at
    });
  } catch (err) {
    console.error('Key generation error:', err);
    return res.status(500).json({ error: 'Failed to generate API key' });
  }
}
