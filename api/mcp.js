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
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
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

const TOOLS = [
  // ── Pages ──────────────────────────────────────────────
  {
    name: 'list_pages',
    description: 'List all pages in the workspace.',
    inputSchema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'create_page',
    description: 'Create a new page.',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Page name' } },
      required: ['name']
    }
  },
  {
    name: 'update_page',
    description: 'Rename a page or toggle its starred status.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Page ID' },
        name: { type: 'string', description: 'New name' },
        starred: { type: 'boolean', description: 'Starred status' }
      },
      required: ['id']
    }
  },
  {
    name: 'delete_page',
    description: 'Soft-delete a page.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Page ID' } },
      required: ['id']
    }
  },
  // ── Sections ───────────────────────────────────────────
  {
    name: 'list_sections',
    description: 'List sections, optionally filtered by page.',
    inputSchema: {
      type: 'object',
      properties: { page_id: { type: 'string', description: 'Filter by page ID' } },
      required: []
    }
  },
  {
    name: 'create_section',
    description: 'Create a new section inside a page.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Section name' },
        page_id: { type: 'string', description: 'Parent page ID' }
      },
      required: ['name', 'page_id']
    }
  },
  {
    name: 'update_section',
    description: 'Rename a section.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Section ID' },
        name: { type: 'string', description: 'New name' }
      },
      required: ['id', 'name']
    }
  },
  {
    name: 'delete_section',
    description: 'Soft-delete a section.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Section ID' } },
      required: ['id']
    }
  },
  // ── Notes ──────────────────────────────────────────────
  {
    name: 'list_notes',
    description: 'List notes with optional filters.',
    inputSchema: {
      type: 'object',
      properties: {
        page_id: { type: 'string', description: 'Filter by page ID' },
        section_id: { type: 'string', description: 'Filter by section ID' },
        completed: { type: 'boolean', description: 'Filter by completion status' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Filter by tags (any match)' },
        search: { type: 'string', description: 'Text search in note content' },
        limit: { type: 'number', description: 'Max results (default 50, max 200)' },
        date_from: { type: 'string', description: 'ISO date lower bound on created_at' },
        date_to: { type: 'string', description: 'ISO date upper bound on created_at' }
      },
      required: []
    }
  },
  {
    name: 'create_note',
    description: 'Create a new note.',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'Note text' },
        section_id: { type: 'string', description: 'Parent section ID' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Tags to apply' },
        date: { type: 'string', description: 'Optional date (ISO string)' }
      },
      required: ['content', 'section_id']
    }
  },
  {
    name: 'update_note',
    description: 'Update a note. Pass section_id to move it to a different section.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Note ID' },
        content: { type: 'string', description: 'New content' },
        tags: { type: 'array', items: { type: 'string' }, description: 'New tags (replaces existing)' },
        completed: { type: 'boolean', description: 'Completion status' },
        date: { type: 'string', description: 'Date (ISO string or null)' },
        section_id: { type: 'string', description: 'Move note to this section ID' }
      },
      required: ['id']
    }
  },
  {
    name: 'delete_note',
    description: 'Soft-delete a note.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Note ID' } },
      required: ['id']
    }
  },
  // ── Tags ───────────────────────────────────────────────
  {
    name: 'list_tags',
    description: 'List all distinct tags used across active notes.',
    inputSchema: { type: 'object', properties: {}, required: [] }
  },
  // ── Connections ────────────────────────────────────────
  {
    name: 'list_connections',
    description: 'List note connections. Pass note_id to filter to a specific note.',
    inputSchema: {
      type: 'object',
      properties: { note_id: { type: 'string', description: 'Filter by note ID' } },
      required: []
    }
  },
  {
    name: 'create_connection',
    description: 'Create a connection between two notes.',
    inputSchema: {
      type: 'object',
      properties: {
        source_note_id: { type: 'string', description: 'Source note ID' },
        target_note_id: { type: 'string', description: 'Target note ID' },
        connection_type: {
          type: 'string',
          enum: ['related', 'supports', 'contradicts', 'extends', 'source'],
          description: 'Relationship type (default: related)'
        },
        label: { type: 'string', description: 'Optional label' }
      },
      required: ['source_note_id', 'target_note_id']
    }
  },
  {
    name: 'delete_connection',
    description: 'Delete a connection between notes.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Connection ID' } },
      required: ['id']
    }
  }
];

function handleToolsList(res, body) {
  jsonRpcResult(res, body.id, { tools: TOOLS });
}

// Stub — replaced in subsequent tasks
async function handleToolsCall(res, body, auth) {
  jsonRpcError(res, body.id, -32601, 'No tools implemented yet');
}
