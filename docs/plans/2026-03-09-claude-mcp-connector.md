# Slate Claude MCP Connector — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `api/mcp.js` — a remote MCP server exposing Slate's full CRUD to Claude.ai (web + mobile) via a single Vercel serverless function.

**Architecture:** Single `POST /api/mcp` endpoint implementing the MCP Streamable HTTP transport (spec 2025-03-26). Stateless JSON-RPC 2.0 — every request is auth'd via `X-API-Key`, routed to one of 17 tool handlers, and responds with a JSON-RPC result. Queries Supabase directly using the service role client (same pattern as `api/v1/[...path].js`).

**Tech Stack:** Vercel serverless (ESM), `@supabase/supabase-js`, Node.js `crypto`. No new dependencies.

**No tests framework exists.** Each task is verified with `curl` commands against `vercel dev` locally.

---

## Local Dev Setup (one-time)

Run the local Vercel dev server before any curl testing:

```bash
cd /Users/jacksonsweet/Projects/slate-web
npx vercel dev
# Runs on http://localhost:3000
```

Get a real API key from Slate settings to use in curl tests.

---

## Task 1: Scaffold + `initialize` + CORS

**Files:**
- Create: `api/mcp.js`

**Step 1: Create the file with CORS, routing scaffold, and `initialize` handler**

```javascript
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
async function authenticateApiKey(apiKey, res) {
  if (!apiKey) {
    jsonRpcError(res, null, -32001, 'Unauthorized: missing X-API-Key header');
    return null;
  }

  const keyHash = createHash('sha256').update(apiKey).digest('hex');
  let supabase;
  try { supabase = createSupabaseServiceClient(); }
  catch { jsonRpcError(res, null, -32603, 'Internal error: database not configured'); return null; }

  const { data: keyRecord, error } = await supabase
    .from('api_keys')
    .select('id, user_id, revoked_at')
    .eq('key_hash', keyHash)
    .single();

  if (error || !keyRecord) {
    jsonRpcError(res, null, -32001, 'Unauthorized: invalid API key');
    return null;
  }
  if (keyRecord.revoked_at) {
    jsonRpcError(res, null, -32001, 'Unauthorized: API key has been revoked');
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
    const auth = await authenticateApiKey(apiKey, res);
    if (!auth) return;
    return handleInitialize(res, body);
  }

  // All other methods require auth
  const apiKey = req.headers['x-api-key'];
  const auth = await authenticateApiKey(apiKey, res);
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
```

**Step 2: Test initialize**

```bash
curl -s -X POST http://localhost:3000/api/mcp \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}' | jq
```

Expected:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": "2025-03-26",
    "capabilities": { "tools": {} },
    "serverInfo": { "name": "Slate", "version": "1.0.0" }
  }
}
```

**Step 3: Test bad API key**

```bash
curl -s -X POST http://localhost:3000/api/mcp \
  -H "Content-Type: application/json" \
  -H "X-API-Key: bad-key" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' | jq
```

Expected: `"error": { "code": -32001, "message": "Unauthorized: invalid API key" }`

**Step 4: Commit**

```bash
git add api/mcp.js
git commit -m "feat: add MCP server scaffold with initialize handler"
```

---

## Task 2: Tool Definitions (`tools/list`)

**Files:**
- Modify: `api/mcp.js`

Replace the stub `handleToolsList` function, and add the `TOOLS` array above `handleToolsList`.

**Step 1: Add the TOOLS constant (place above `handleToolsList`)**

```javascript
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
```

**Step 2: Replace the stub `handleToolsList`**

```javascript
function handleToolsList(res, body) {
  jsonRpcResult(res, body.id, { tools: TOOLS });
}
```

**Step 3: Test tools/list**

```bash
curl -s -X POST http://localhost:3000/api/mcp \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' | jq '.result.tools | length'
```

Expected: `16`

**Step 4: Commit**

```bash
git add api/mcp.js
git commit -m "feat: add MCP tool definitions (tools/list)"
```

---

## Task 3: Page Tools

**Files:**
- Modify: `api/mcp.js`

**Step 1: Add the four page tool handler functions (place before `handleToolsCall`)**

```javascript
// ── Page Handlers ───────────────────────────────────────

async function toolListPages({ userId, supabase }) {
  const { data, error } = await supabase
    .from('pages')
    .select('id, name, starred, position, created_at')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('position');
  if (error) throw new Error('Failed to fetch pages');
  return { pages: data || [] };
}

async function toolCreatePage({ userId, supabase }, args) {
  const { name } = args;
  if (!name?.trim()) throw new Error('name is required');

  const { data: existing } = await supabase
    .from('pages').select('position').eq('user_id', userId)
    .order('position', { ascending: false }).limit(1);
  const position = (existing?.[0]?.position ?? -1) + 1;

  const { data, error } = await supabase
    .from('pages')
    .insert({ name: name.trim(), user_id: userId, position })
    .select('id, name, starred, position, created_at')
    .single();
  if (error) throw new Error('Failed to create page');
  return { page: data };
}

async function toolUpdatePage({ userId, supabase }, args) {
  const { id, name, starred } = args;
  if (!id) throw new Error('id is required');

  const updates = {};
  if (name !== undefined) {
    if (!name?.trim()) throw new Error('name must be a non-empty string');
    updates.name = name.trim();
  }
  if (starred !== undefined) {
    if (typeof starred !== 'boolean') throw new Error('starred must be a boolean');
    updates.starred = starred;
  }
  if (Object.keys(updates).length === 0) throw new Error('Provide at least one of: name, starred');

  const { data, error } = await supabase
    .from('pages')
    .update(updates)
    .eq('id', id)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .select('id, name, starred, position, created_at')
    .single();
  if (error || !data) throw new Error('Page not found');
  return { page: data };
}

async function toolDeletePage({ userId, supabase }, args) {
  const { id } = args;
  if (!id) throw new Error('id is required');

  const { data, error } = await supabase
    .from('pages')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .select('id')
    .single();
  if (error || !data) throw new Error('Page not found');
  return { deleted: true, id: data.id };
}
```

**Step 2: Replace the stub `handleToolsCall` with a router + the page tools wired in**

```javascript
const TOOL_HANDLERS = {
  list_pages: toolListPages,
  create_page: toolCreatePage,
  update_page: toolUpdatePage,
  delete_page: toolDeletePage,
};

async function handleToolsCall(res, body, auth) {
  const { id, params } = body;
  const toolName = params?.name;
  const args = params?.arguments || {};

  if (!toolName) return jsonRpcError(res, id, -32602, 'params.name is required');

  const handler = TOOL_HANDLERS[toolName];
  if (!handler) return jsonRpcError(res, id, -32601, `Unknown tool: ${toolName}`);

  try {
    const result = await handler(auth, args);
    jsonRpcResult(res, id, {
      content: [{ type: 'text', text: JSON.stringify(result) }]
    });
  } catch (err) {
    jsonRpcError(res, id, -32603, err.message || 'Internal error');
  }
}
```

**Step 3: Test list_pages**

```bash
curl -s -X POST http://localhost:3000/api/mcp \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"list_pages","arguments":{}}}' | jq '.result.content[0].text | fromjson'
```

Expected: `{ "pages": [ ... ] }`

**Step 4: Test create_page**

```bash
curl -s -X POST http://localhost:3000/api/mcp \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"create_page","arguments":{"name":"MCP Test Page"}}}' | jq '.result.content[0].text | fromjson'
```

Expected: `{ "page": { "id": "...", "name": "MCP Test Page", ... } }`

**Step 5: Commit**

```bash
git add api/mcp.js
git commit -m "feat: add MCP page tools (list, create, update, delete)"
```

---

## Task 4: Section Tools

**Files:**
- Modify: `api/mcp.js`

**Step 1: Add a shared helper to fetch user's pages + build maps (used by sections, notes)**

Place this before the section handlers:

```javascript
// ── Shared helpers ──────────────────────────────────────

async function fetchUserPages(userId, supabase) {
  const { data: pages, error } = await supabase
    .from('pages').select('id, name').eq('user_id', userId);
  if (error) throw new Error('Failed to fetch pages');
  const userPageIds = (pages || []).map(p => p.id);
  const pageNameMap = Object.fromEntries((pages || []).map(p => [p.id, p.name]));
  return { userPageIds, pageNameMap };
}

async function fetchUserSections(userPageIds, supabase) {
  if (!userPageIds.length) return { userSectionIds: [], sectionMap: {} };
  const { data: sections, error } = await supabase
    .from('sections').select('id, name, page_id')
    .in('page_id', userPageIds);
  if (error) throw new Error('Failed to fetch sections');
  const userSectionIds = (sections || []).map(s => s.id);
  const sectionMap = Object.fromEntries((sections || []).map(s => [s.id, s]));
  return { userSectionIds, sectionMap };
}
```

**Step 2: Add section handler functions**

```javascript
// ── Section Handlers ────────────────────────────────────

async function toolListSections({ userId, supabase }, args) {
  const { page_id } = args;
  const { userPageIds, pageNameMap } = await fetchUserPages(userId, supabase);
  if (!userPageIds.length) return { sections: [] };

  if (page_id && !userPageIds.includes(page_id)) throw new Error('page_id not found or access denied');

  let query = supabase.from('sections')
    .select('id, name, page_id, position, created_at')
    .is('deleted_at', null)
    .order('position');

  if (page_id) query = query.eq('page_id', page_id);
  else query = query.in('page_id', userPageIds);

  const { data, error } = await query;
  if (error) throw new Error('Failed to fetch sections');

  return {
    sections: (data || []).map(s => ({
      id: s.id, name: s.name, page_id: s.page_id,
      page_name: pageNameMap[s.page_id] || null,
      position: s.position, created_at: s.created_at
    }))
  };
}

async function toolCreateSection({ userId, supabase }, args) {
  const { name, page_id } = args;
  if (!name?.trim()) throw new Error('name is required');
  if (!page_id) throw new Error('page_id is required');

  const { userPageIds, pageNameMap } = await fetchUserPages(userId, supabase);
  if (!userPageIds.includes(page_id)) throw new Error('page_id not found or access denied');

  const { data: existing } = await supabase
    .from('sections').select('position').eq('page_id', page_id)
    .order('position', { ascending: false }).limit(1);
  const position = (existing?.[0]?.position ?? -1) + 1;

  const { data, error } = await supabase
    .from('sections')
    .insert({ name: name.trim(), page_id, position })
    .select('id, name, page_id, position, created_at')
    .single();
  if (error) throw new Error('Failed to create section');
  return { section: { ...data, page_name: pageNameMap[data.page_id] || null } };
}

async function toolUpdateSection({ userId, supabase }, args) {
  const { id, name } = args;
  if (!id) throw new Error('id is required');
  if (!name?.trim()) throw new Error('name must be a non-empty string');

  const { userPageIds, pageNameMap } = await fetchUserPages(userId, supabase);

  const { data: section, error: fetchErr } = await supabase
    .from('sections').select('id, page_id').eq('id', id).is('deleted_at', null).single();
  if (fetchErr || !section || !userPageIds.includes(section.page_id)) throw new Error('Section not found');

  const { data, error } = await supabase
    .from('sections').update({ name: name.trim() }).eq('id', id)
    .select('id, name, page_id, position, created_at').single();
  if (error || !data) throw new Error('Failed to update section');
  return { section: { ...data, page_name: pageNameMap[data.page_id] || null } };
}

async function toolDeleteSection({ userId, supabase }, args) {
  const { id } = args;
  if (!id) throw new Error('id is required');

  const { userPageIds } = await fetchUserPages(userId, supabase);

  const { data: section, error: fetchErr } = await supabase
    .from('sections').select('id, page_id').eq('id', id).is('deleted_at', null).single();
  if (fetchErr || !section || !userPageIds.includes(section.page_id)) throw new Error('Section not found');

  const { data, error } = await supabase
    .from('sections').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    .is('deleted_at', null).select('id').single();
  if (error || !data) throw new Error('Failed to delete section');
  return { deleted: true, id: data.id };
}
```

**Step 3: Register in TOOL_HANDLERS**

Add to the `TOOL_HANDLERS` object:

```javascript
  list_sections: toolListSections,
  create_section: toolCreateSection,
  update_section: toolUpdateSection,
  delete_section: toolDeleteSection,
```

**Step 4: Test list_sections**

```bash
curl -s -X POST http://localhost:3000/api/mcp \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"list_sections","arguments":{}}}' | jq '.result.content[0].text | fromjson.sections | length'
```

Expected: a number > 0.

**Step 5: Commit**

```bash
git add api/mcp.js
git commit -m "feat: add MCP section tools (list, create, update, delete)"
```

---

## Task 5: Note Tools

**Files:**
- Modify: `api/mcp.js`

**Step 1: Add note handler functions**

```javascript
// ── Note Handlers ───────────────────────────────────────

async function toolListNotes({ userId, supabase }, args) {
  const { page_id, section_id, completed, tags, search,
          limit: limitArg, date_from, date_to } = args;
  const limit = Math.min(Number(limitArg) || 50, 200);

  const { userPageIds, pageNameMap } = await fetchUserPages(userId, supabase);
  if (!userPageIds.length) return { notes: [], total: 0 };

  const { userSectionIds, sectionMap } = await fetchUserSections(userPageIds, supabase);
  if (!userSectionIds.length) return { notes: [], total: 0 };

  if (page_id && !userPageIds.includes(page_id)) throw new Error('page_id not found or access denied');
  if (section_id && !userSectionIds.includes(section_id)) throw new Error('section_id not found or access denied');

  let query = supabase.from('notes')
    .select('id, content, tags, date, completed, created_at, section_id')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (section_id) {
    query = query.eq('section_id', section_id);
  } else if (page_id) {
    const pageSectionIds = Object.values(sectionMap)
      .filter(s => s.page_id === page_id).map(s => s.id);
    if (!pageSectionIds.length) return { notes: [], total: 0 };
    query = query.in('section_id', pageSectionIds);
  } else {
    query = query.in('section_id', userSectionIds);
  }

  if (completed !== undefined) query = query.eq('completed', completed);
  if (tags?.length) query = query.overlaps('tags', tags);
  if (search) query = query.ilike('content', `%${search}%`);
  if (date_from) query = query.gte('created_at', date_from);
  if (date_to) query = query.lte('created_at', date_to);

  const { data, error } = await query;
  if (error) throw new Error('Failed to fetch notes');

  const notes = (data || []).map(note => {
    const section = sectionMap[note.section_id];
    return {
      id: note.id, content: note.content, tags: note.tags || [],
      date: note.date, completed: note.completed, created_at: note.created_at,
      section_id: note.section_id, section_name: section?.name || null,
      page_id: section?.page_id || null,
      page_name: section ? (pageNameMap[section.page_id] || null) : null
    };
  });

  return { notes, total: notes.length };
}

async function toolCreateNote({ userId, supabase }, args) {
  const { content, section_id, tags, date } = args;
  if (!content?.trim()) throw new Error('content is required');
  if (!section_id) throw new Error('section_id is required');

  const { userPageIds } = await fetchUserPages(userId, supabase);
  const { userSectionIds } = await fetchUserSections(userPageIds, supabase);
  if (!userSectionIds.includes(section_id)) throw new Error('section_id not found or access denied');

  const { data, error } = await supabase.from('notes')
    .insert({
      content: content.trim(), section_id,
      tags: Array.isArray(tags) ? tags : [],
      date: date || null, completed: false
    })
    .select('id, content, tags, date, completed, created_at, section_id')
    .single();
  if (error) throw new Error('Failed to create note');
  return { note: data };
}

async function toolUpdateNote({ userId, supabase }, args) {
  const { id, content, tags, completed, date, section_id: newSectionId } = args;
  if (!id) throw new Error('id is required');

  const { userPageIds, pageNameMap } = await fetchUserPages(userId, supabase);
  const { userSectionIds, sectionMap } = await fetchUserSections(userPageIds, supabase);

  // Fetch existing note and verify ownership
  const { data: note, error: fetchErr } = await supabase
    .from('notes')
    .select('id, content, tags, date, completed, section_id')
    .eq('id', id).is('deleted_at', null).single();
  if (fetchErr || !note || !userSectionIds.includes(note.section_id)) throw new Error('Note not found');

  // Validate target section if moving
  if (newSectionId !== undefined && !userSectionIds.includes(newSectionId)) {
    throw new Error('section_id not found or access denied');
  }

  const updates = {};
  if (content !== undefined) {
    if (!content?.trim()) throw new Error('content must be a non-empty string');
    updates.content = content.trim();
  }
  if (tags !== undefined) {
    if (!Array.isArray(tags)) throw new Error('tags must be an array');
    updates.tags = tags;
  }
  if (completed !== undefined) {
    if (typeof completed !== 'boolean') throw new Error('completed must be a boolean');
    updates.completed = completed;
    if (completed === true && note.completed === false) updates.completed_at = new Date().toISOString();
    if (completed === false && note.completed === true) updates.completed_at = null;
  }
  if (date !== undefined) updates.date = date;
  if (newSectionId !== undefined) updates.section_id = newSectionId;

  if (Object.keys(updates).length === 0) throw new Error('Provide at least one field to update');

  const { data, error } = await supabase
    .from('notes').update(updates).eq('id', id)
    .select('id, content, tags, date, completed, created_at, section_id').single();
  if (error || !data) throw new Error('Failed to update note');

  const section = sectionMap[data.section_id];
  return {
    note: {
      id: data.id, content: data.content, tags: data.tags || [],
      date: data.date, completed: data.completed, created_at: data.created_at,
      section_id: data.section_id, section_name: section?.name || null,
      page_id: section?.page_id || null,
      page_name: section ? (pageNameMap[section.page_id] || null) : null
    }
  };
}

async function toolDeleteNote({ userId, supabase }, args) {
  const { id } = args;
  if (!id) throw new Error('id is required');

  const { userPageIds } = await fetchUserPages(userId, supabase);
  const { userSectionIds } = await fetchUserSections(userPageIds, supabase);

  const { data: note, error: fetchErr } = await supabase
    .from('notes').select('id, section_id').eq('id', id).is('deleted_at', null).single();
  if (fetchErr || !note || !userSectionIds.includes(note.section_id)) throw new Error('Note not found');

  const { data, error } = await supabase
    .from('notes').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    .is('deleted_at', null).select('id').single();
  if (error || !data) throw new Error('Failed to delete note');
  return { deleted: true, id: data.id };
}
```

**Step 2: Register in TOOL_HANDLERS**

```javascript
  list_notes: toolListNotes,
  create_note: toolCreateNote,
  update_note: toolUpdateNote,
  delete_note: toolDeleteNote,
```

**Step 3: Test create_note (use a real section_id from your workspace)**

```bash
curl -s -X POST http://localhost:3000/api/mcp \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"create_note","arguments":{"content":"Test note from MCP","section_id":"YOUR_SECTION_ID"}}}' | jq '.result.content[0].text | fromjson'
```

Expected: `{ "note": { "id": "...", "content": "Test note from MCP", ... } }`

**Step 4: Test update_note (move)**

```bash
curl -s -X POST http://localhost:3000/api/mcp \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"update_note","arguments":{"id":"NOTE_ID","content":"Updated content","completed":true}}}' | jq '.result.content[0].text | fromjson'
```

Expected: note object with updated fields.

**Step 5: Commit**

```bash
git add api/mcp.js
git commit -m "feat: add MCP note tools (list, create, update with move, delete)"
```

---

## Task 6: Tags + Connection Tools

**Files:**
- Modify: `api/mcp.js`

**Step 1: Add tag and connection handler functions**

```javascript
// ── Tag Handler ─────────────────────────────────────────

async function toolListTags({ userId, supabase }) {
  const { userPageIds } = await fetchUserPages(userId, supabase);
  if (!userPageIds.length) return { tags: [] };

  const { userSectionIds } = await fetchUserSections(userPageIds, supabase);
  if (!userSectionIds.length) return { tags: [] };

  const { data, error } = await supabase.from('notes')
    .select('tags').in('section_id', userSectionIds).is('deleted_at', null).not('tags', 'is', null);
  if (error) throw new Error('Failed to fetch tags');

  const allTags = [...new Set((data || []).flatMap(n => n.tags || []).filter(Boolean))].sort();
  return { tags: allTags };
}

// ── Connection Handlers ─────────────────────────────────

const VALID_CONNECTION_TYPES = ['related', 'supports', 'contradicts', 'extends', 'source'];

async function toolListConnections({ userId, supabase }, args) {
  const { note_id } = args;

  if (note_id) {
    const { data, error } = await supabase.rpc('get_note_connections', { p_note_id: note_id });
    if (error) throw new Error('Failed to fetch connections');
    return { connections: data || [] };
  } else {
    const { data, error } = await supabase.rpc('get_all_connections', { p_user_id: userId });
    if (error) throw new Error('Failed to fetch connections');
    return { connections: data || [] };
  }
}

async function toolCreateConnection({ userId, supabase }, args) {
  const { source_note_id, target_note_id, connection_type, label } = args;
  if (!source_note_id) throw new Error('source_note_id is required');
  if (!target_note_id) throw new Error('target_note_id is required');

  const connType = connection_type || 'related';
  if (!VALID_CONNECTION_TYPES.includes(connType)) {
    throw new Error(`connection_type must be one of: ${VALID_CONNECTION_TYPES.join(', ')}`);
  }

  const row = { source_note_id, target_note_id, connection_type: connType, created_by_user_id: userId };
  if (label) row.label = label;

  const { data, error } = await supabase
    .from('note_connections').insert(row).select('*').single();
  if (error) throw new Error('Failed to create connection');
  return { connection: data };
}

async function toolDeleteConnection({ userId, supabase }, args) {
  const { id } = args;
  if (!id) throw new Error('id is required');

  const { data, error } = await supabase
    .from('note_connections').delete()
    .eq('id', id).eq('created_by_user_id', userId).select('id').single();
  if (error || !data) throw new Error('Connection not found');
  return { deleted: true, id: data.id };
}
```

**Step 2: Register in TOOL_HANDLERS**

```javascript
  list_tags: toolListTags,
  list_connections: toolListConnections,
  create_connection: toolCreateConnection,
  delete_connection: toolDeleteConnection,
```

**Step 3: Test list_tags**

```bash
curl -s -X POST http://localhost:3000/api/mcp \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{"jsonrpc":"2.0","id":8,"method":"tools/call","params":{"name":"list_tags","arguments":{}}}' | jq '.result.content[0].text | fromjson'
```

Expected: `{ "tags": ["tag1", "tag2", ...] }`

**Step 4: Commit**

```bash
git add api/mcp.js
git commit -m "feat: add MCP tag and connection tools"
```

---

## Task 7: Deploy + Claude.ai Connector Setup

**Step 1: Deploy to Vercel**

```bash
cd /Users/jacksonsweet/Projects/slate-web
npx vercel --prod
```

Wait for the deployment to complete.

**Step 2: Smoke test the production endpoint**

```bash
curl -s -X POST https://slate.app/api/mcp \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"1"}}}' | jq
```

Expected: initialize result with `"protocolVersion": "2025-03-26"`.

**Step 3: Connect to Claude.ai**

1. Open Claude.ai → Settings → Connectors (or Integrations → MCP)
2. Add new connector:
   - URL: `https://slate.app/api/mcp`
   - Custom header: `X-API-Key` = `<your key>`
3. Save. Claude should show "Slate" connected with 17 tools.

**Step 4: Test end-to-end in Claude**

Ask Claude: "List my Slate pages" — it should call `list_pages` and return your pages.

**Step 5: Final commit**

```bash
git add -A
git commit -m "feat: deploy Slate MCP connector for Claude.ai"
```

---

## Summary

| File | Action |
|---|---|
| `api/mcp.js` | Create (~370 lines) |

**17 tools across 5 resource types:** pages (4), sections (4), notes (4), tags (1), connections (3) + 1 bonus note-move capability.

**No vercel.json changes needed** — the existing `"source": "/api/(.*)"` rewrite handles `/api/mcp`.
