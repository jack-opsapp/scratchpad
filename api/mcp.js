/**
 * Slate MCP Server
 * MCP Streamable HTTP transport (spec 2025-03-26)
 * Single endpoint: POST /api/mcp
 */

import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';

// ============ SUPABASE ============

function createSupabaseServiceClient() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase not configured');
  return createClient(url, key);
}

// Returns { userId, supabase } or null (and writes error response)
async function authenticateApiKey(apiKey, res, id = null) {
  if (!apiKey) {
    jsonRpcError(res, id, -32001, 'Unauthorized: missing X-API-Key header');
    return null;
  }

  const keyHash = createHash('sha256').update(apiKey).digest('hex');
  let supabase;
  try { supabase = createSupabaseServiceClient(); }
  catch { jsonRpcError(res, id, -32603, 'Internal error: database not configured'); return null; }

  const { data: keyRecord, error } = await supabase
    .from('api_keys')
    .select('id, user_id, revoked_at')
    .eq('key_hash', keyHash)
    .single();

  if (error || !keyRecord) {
    jsonRpcError(res, id, -32001, 'Unauthorized: invalid API key');
    return null;
  }
  if (keyRecord.revoked_at) {
    jsonRpcError(res, id, -32001, 'Unauthorized: API key has been revoked');
    return null;
  }

  // Non-blocking last_used_at update
  supabase.from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', keyRecord.id).then(() => {});

  return { userId: keyRecord.user_id, supabase };
}

// ============ JSON-RPC HELPERS ============

function jsonRpcResult(res, id, result) {
  res.status(200).json({ jsonrpc: '2.0', id, result });
}

function jsonRpcError(res, id, code, message) {
  res.status(200).json({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
}

// ============ METHOD HANDLERS ============

function handleInitialize(res, body) {
  jsonRpcResult(res, body.id, {
    protocolVersion: '2025-03-26',
    capabilities: { tools: {} },
    serverInfo: { name: 'Slate', version: '1.0.0' }
  });
}

// ============ MAIN HANDLER ============

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return jsonRpcError(res, null, -32700, 'Parse error');
  }

  if (!body || body.jsonrpc !== '2.0' || !body.method) {
    return jsonRpcError(res, body?.id ?? null, -32600, 'Invalid request');
  }

  const { method, id } = body;

  // Notification: no response needed
  if (method === 'notifications/initialized') {
    return res.status(204).end();
  }

  // initialize — auth required
  if (method === 'initialize') {
    const apiKey = req.headers['x-api-key'];
    const auth = await authenticateApiKey(apiKey, res, body.id);
    if (!auth) return;
    return handleInitialize(res, body);
  }

  // All other methods require auth
  const apiKey = req.headers['x-api-key'];
  const auth = await authenticateApiKey(apiKey, res, body.id);
  if (!auth) return;

  if (method === 'tools/list') return handleToolsList(res, body);
  if (method === 'tools/call') return handleToolsCall(res, body, auth);

  return jsonRpcError(res, id, -32601, `Method not found: ${method}`);
}

// Stubs — filled in subsequent tasks
function handleToolsList(res, body) {
  jsonRpcResult(res, body.id, { tools: [] });
}

async function handleToolsCall(res, body, auth) {
  jsonRpcError(res, body.id, -32601, 'No tools implemented yet');
}
