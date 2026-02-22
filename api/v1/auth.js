/**
 * Shared auth helpers for Slate REST API v1
 */

import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';

export function createSupabaseServiceClient() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error('Supabase not configured');
  }

  return createClient(url, key);
}

/**
 * Authenticates a request using the X-API-Key header.
 * On success, returns { userId, supabase }.
 * On failure, sends a 401 and returns null.
 */
export async function authenticateApiKey(req, res) {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey) {
    res.status(401).json({ error: 'Missing X-API-Key header' });
    return null;
  }

  const keyHash = createHash('sha256').update(apiKey).digest('hex');

  let supabase;
  try {
    supabase = createSupabaseServiceClient();
  } catch (err) {
    res.status(500).json({ error: 'Database not configured' });
    return null;
  }

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
  supabase
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', keyRecord.id)
    .then(() => {});

  return { userId: keyRecord.user_id, supabase };
}
