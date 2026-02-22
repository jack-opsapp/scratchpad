# Slate Claude Code Plugin — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Claude Code plugin that gives Claude automatic, bidirectional integration with Slate — reading todos at session start, writing back progress and testing checkpoints as it works.

**Architecture:** Three layers — (1) REST API enhancements adding PATCH/DELETE to the existing Vercel catch-all handler, (2) an MCP server (Node.js stdio) wrapping the REST API with 16 tools, (3) a Claude Code plugin with hooks and a skill for automatic tracking.

**Tech Stack:** Node.js, `@modelcontextprotocol/sdk` (TypeScript SDK for MCP), Zod for tool schemas, `node-fetch` for HTTP calls to the REST API, Vercel serverless functions.

---

## Task 1: Update URL parser to extract resource IDs

The existing router in `[...path].js` only parses the resource name (e.g. `notes`). We need it to also extract an optional ID from paths like `/api/v1/notes/uuid-here`, and to allow PATCH and DELETE methods.

**Files:**
- Modify: `/Users/jacksonsweet/Projects/slate-web/api/v1/[...path].js` (lines 67-88, the `handler` function)

**Step 1: Update the CORS header and URL parser**

Change the `Access-Control-Allow-Methods` header and URL regex in the `handler` function:

```js
// In handler function, replace:
res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

// With:
res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');

// Replace the URL parsing block (lines 74-77):
const urlPath = req.url.split('?')[0];
const match = urlPath.match(/\/api\/v1\/([^/]+)/);
const resource = match?.[1] || (req.query.path?.[0]) || '';

// With:
const urlPath = req.url.split('?')[0];
const match = urlPath.match(/\/api\/v1\/([^/]+)(?:\/([^/]+))?/);
const resource = match?.[1] || (req.query.path?.[0]) || '';
const resourceId = match?.[2] || req.query.path?.[1] || null;
```

**Step 2: Pass resourceId to handlers**

Update the switch statement to pass `resourceId`:

```js
switch (resource) {
  case 'keys':     return handleKeys(req, res);
  case 'pages':    return handlePages(req, res, resourceId);
  case 'sections': return handleSections(req, res, resourceId);
  case 'notes':    return handleNotes(req, res, resourceId);
  case 'tags':     return handleTags(req, res);
  default:
    return res.status(404).json({ error: `Unknown resource: ${resource || '(empty)'}` });
}
```

**Step 3: Update handler signatures**

Add `resourceId` parameter to the three handler function signatures (don't change behavior yet):

```js
async function handlePages(req, res, resourceId) {
  // existing: allow GET, POST
  // add: PATCH, DELETE when resourceId is present
  if (!resourceId && req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (resourceId && req.method !== 'PATCH' && req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' });
  // ... rest of existing code
```

Apply the same pattern to `handleSections` and `handleNotes`.

**Step 4: Test the routing change doesn't break existing endpoints**

```bash
# Test existing GET still works
curl -s -H "X-API-Key: $SLATE_KEY" https://slate.opsapp.co/api/v1/pages | head -c 200

# Test that PATCH without ID returns 405
curl -s -X PATCH -H "X-API-Key: $SLATE_KEY" https://slate.opsapp.co/api/v1/pages
# Expected: {"error":"Method not allowed"}
```

**Step 5: Commit**

```bash
git add api/v1/[...path].js
git commit -m "feat(api): add URL parser for resource IDs, allow PATCH/DELETE methods"
```

---

## Task 2: Add PATCH/DELETE for pages

**Files:**
- Modify: `/Users/jacksonsweet/Projects/slate-web/api/v1/[...path].js` (inside `handlePages`)

**Step 1: Add PATCH handler for pages**

After the existing POST block in `handlePages`, add:

```js
if (req.method === 'PATCH') {
  const { name, starred } = req.body || {};
  if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
    return res.status(400).json({ error: 'name must be a non-empty string' });
  }

  const updates = {};
  if (name !== undefined) updates.name = name.trim();
  if (starred !== undefined) updates.starred = Boolean(starred);

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }

  const { data, error } = await supabase
    .from('pages')
    .update(updates)
    .eq('id', resourceId)
    .eq('user_id', userId)
    .select('id, name, starred, position, created_at, deleted_at')
    .single();

  if (error || !data) return res.status(404).json({ error: 'Page not found or access denied' });
  return res.json({ page: data });
}
```

**Step 2: Add DELETE handler for pages**

```js
if (req.method === 'DELETE') {
  const { data, error } = await supabase
    .from('pages')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', resourceId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .select('id')
    .single();

  if (error || !data) return res.status(404).json({ error: 'Page not found or access denied' });
  return res.json({ deleted: true, id: data.id });
}
```

**Step 3: Test with curl**

```bash
# Create a test page
curl -s -X POST -H "X-API-Key: $SLATE_KEY" -H "Content-Type: application/json" \
  -d '{"name":"API Test Page"}' https://slate.opsapp.co/api/v1/pages
# Note the returned id

# PATCH it
curl -s -X PATCH -H "X-API-Key: $SLATE_KEY" -H "Content-Type: application/json" \
  -d '{"name":"Renamed Page","starred":true}' https://slate.opsapp.co/api/v1/pages/<id>
# Expected: {"page":{"id":"...","name":"Renamed Page","starred":true,...}}

# DELETE it
curl -s -X DELETE -H "X-API-Key: $SLATE_KEY" https://slate.opsapp.co/api/v1/pages/<id>
# Expected: {"deleted":true,"id":"..."}
```

**Step 4: Commit**

```bash
git add api/v1/[...path].js
git commit -m "feat(api): add PATCH and DELETE for pages"
```

---

## Task 3: Add PATCH/DELETE for sections

**Files:**
- Modify: `/Users/jacksonsweet/Projects/slate-web/api/v1/[...path].js` (inside `handleSections`)

**Step 1: Add PATCH handler for sections**

After the existing POST block in `handleSections`, add:

```js
if (req.method === 'PATCH') {
  const { name } = req.body || {};
  if (name === undefined || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'name is required and must be a non-empty string' });
  }

  // Verify ownership: section must belong to one of the user's pages
  const { data: section, error: fetchError } = await supabase
    .from('sections')
    .select('id, page_id')
    .eq('id', resourceId)
    .single();

  if (fetchError || !section || !userPageIds.includes(section.page_id)) {
    return res.status(404).json({ error: 'Section not found or access denied' });
  }

  const { data, error } = await supabase
    .from('sections')
    .update({ name: name.trim() })
    .eq('id', resourceId)
    .select('id, name, page_id, position, created_at, deleted_at')
    .single();

  if (error) return res.status(500).json({ error: 'Failed to update section' });
  return res.json({ section: { ...data, page_name: pageNameMap[data.page_id] || null } });
}
```

**Step 2: Add DELETE handler for sections**

```js
if (req.method === 'DELETE') {
  const { data: section, error: fetchError } = await supabase
    .from('sections')
    .select('id, page_id')
    .eq('id', resourceId)
    .single();

  if (fetchError || !section || !userPageIds.includes(section.page_id)) {
    return res.status(404).json({ error: 'Section not found or access denied' });
  }

  const { data, error } = await supabase
    .from('sections')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', resourceId)
    .is('deleted_at', null)
    .select('id')
    .single();

  if (error || !data) return res.status(404).json({ error: 'Section not found or already deleted' });
  return res.json({ deleted: true, id: data.id });
}
```

**Step 3: Test with curl**

```bash
# Get a section ID from an existing page
curl -s -H "X-API-Key: $SLATE_KEY" "https://slate.opsapp.co/api/v1/sections?page_id=<page_id>" | head -c 300

# PATCH it
curl -s -X PATCH -H "X-API-Key: $SLATE_KEY" -H "Content-Type: application/json" \
  -d '{"name":"Renamed Section"}' https://slate.opsapp.co/api/v1/sections/<id>

# DELETE it
curl -s -X DELETE -H "X-API-Key: $SLATE_KEY" https://slate.opsapp.co/api/v1/sections/<id>
```

**Step 4: Commit**

```bash
git add api/v1/[...path].js
git commit -m "feat(api): add PATCH and DELETE for sections"
```

---

## Task 4: Add PATCH/DELETE for notes

**Files:**
- Modify: `/Users/jacksonsweet/Projects/slate-web/api/v1/[...path].js` (inside `handleNotes`)

**Step 1: Add PATCH handler for notes**

After the existing POST block in `handleNotes`, add:

```js
if (req.method === 'PATCH') {
  const { content, tags, completed, date } = req.body || {};

  // Verify ownership: note must belong to one of the user's sections
  const { data: note, error: fetchError } = await supabase
    .from('notes')
    .select('id, section_id, completed')
    .eq('id', resourceId)
    .single();

  if (fetchError || !note || !userSectionIds.includes(note.section_id)) {
    return res.status(404).json({ error: 'Note not found or access denied' });
  }

  const updates = {};
  if (content !== undefined) {
    if (typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ error: 'content must be a non-empty string' });
    }
    updates.content = content.trim();
  }
  if (tags !== undefined) {
    if (!Array.isArray(tags)) return res.status(400).json({ error: 'tags must be an array' });
    updates.tags = tags;
  }
  if (completed !== undefined) {
    updates.completed = Boolean(completed);
    // Auto-set completed_at when marking complete, clear when uncompleting
    if (Boolean(completed) && !note.completed) {
      updates.completed_at = new Date().toISOString();
    } else if (!Boolean(completed) && note.completed) {
      updates.completed_at = null;
    }
  }
  if (date !== undefined) updates.date = date;

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }

  const { data, error } = await supabase
    .from('notes')
    .update(updates)
    .eq('id', resourceId)
    .select('id, content, tags, date, completed, created_at, deleted_at, section_id')
    .single();

  if (error) return res.status(500).json({ error: 'Failed to update note' });

  const section = sectionMap[data.section_id];
  return res.json({
    note: {
      id: data.id, content: data.content, tags: data.tags || [],
      date: data.date, completed: data.completed, created_at: data.created_at,
      deleted_at: data.deleted_at,
      section_id: data.section_id, section_name: section?.name || null,
      page_id: section?.page_id || null,
      page_name: section ? (pageNameMap[section.page_id] || null) : null
    }
  });
}
```

**Step 2: Add DELETE handler for notes**

```js
if (req.method === 'DELETE') {
  const { data: note, error: fetchError } = await supabase
    .from('notes')
    .select('id, section_id')
    .eq('id', resourceId)
    .single();

  if (fetchError || !note || !userSectionIds.includes(note.section_id)) {
    return res.status(404).json({ error: 'Note not found or access denied' });
  }

  const { data, error } = await supabase
    .from('notes')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', resourceId)
    .is('deleted_at', null)
    .select('id')
    .single();

  if (error || !data) return res.status(404).json({ error: 'Note not found or already deleted' });
  return res.json({ deleted: true, id: data.id });
}
```

**Step 3: Test with curl**

```bash
# Get a note ID
curl -s -H "X-API-Key: $SLATE_KEY" "https://slate.opsapp.co/api/v1/notes?limit=1" | head -c 300

# PATCH — mark complete
curl -s -X PATCH -H "X-API-Key: $SLATE_KEY" -H "Content-Type: application/json" \
  -d '{"completed":true}' https://slate.opsapp.co/api/v1/notes/<id>

# PATCH — add tags
curl -s -X PATCH -H "X-API-Key: $SLATE_KEY" -H "Content-Type: application/json" \
  -d '{"tags":["BUG","URGENT"]}' https://slate.opsapp.co/api/v1/notes/<id>

# DELETE
curl -s -X DELETE -H "X-API-Key: $SLATE_KEY" https://slate.opsapp.co/api/v1/notes/<id>
```

**Step 4: Commit**

```bash
git add api/v1/[...path].js
git commit -m "feat(api): add PATCH and DELETE for notes with auto completed_at"
```

---

## Task 5: Update API docs page

**Files:**
- Modify: `/Users/jacksonsweet/Projects/slate-web/src/pages/ApiDocsPage.jsx`

**Step 1: Add PATCH/DELETE documentation for each resource**

Add new endpoint sections in `ApiDocsPage.jsx` for:
- `PATCH /api/v1/pages/:id` — document `name` and `starred` fields
- `DELETE /api/v1/pages/:id` — document soft-delete behavior
- `PATCH /api/v1/sections/:id` — document `name` field
- `DELETE /api/v1/sections/:id` — document soft-delete behavior
- `PATCH /api/v1/notes/:id` — document `content`, `tags`, `completed`, `date` fields, mention `completed_at` auto-set
- `DELETE /api/v1/notes/:id` — document soft-delete behavior

Include curl examples and JSON response samples following the existing pattern in the file.

**Step 2: Add PATCH/DELETE to the sidebar navigation**

Add entries for the new endpoint sections in the sidebar's `allSectionIds` array.

**Step 3: Verify the docs page renders correctly**

```bash
# Run local dev server
cd /Users/jacksonsweet/Projects/slate-web && npm run dev
# Visit http://localhost:5173/docs and verify new sections appear
```

**Step 4: Commit**

```bash
git add src/pages/ApiDocsPage.jsx
git commit -m "docs: add PATCH/DELETE endpoints to API reference page"
```

---

## Task 6: Push REST API changes and verify on Vercel

**Step 1: Push to remote**

```bash
cd /Users/jacksonsweet/Projects/slate-web && git push origin main
```

**Step 2: Wait for Vercel deployment and test live endpoints**

```bash
# Test PATCH pages
curl -s -X PATCH -H "X-API-Key: $SLATE_KEY" -H "Content-Type: application/json" \
  -d '{"starred":true}' https://slate.opsapp.co/api/v1/pages/<id>

# Test PATCH notes (mark complete)
curl -s -X PATCH -H "X-API-Key: $SLATE_KEY" -H "Content-Type: application/json" \
  -d '{"completed":true}' https://slate.opsapp.co/api/v1/notes/<id>
```

---

## Task 7: Scaffold MCP server project

**Files:**
- Create: `/Users/jacksonsweet/Projects/slate-plugin/mcp-server/package.json`
- Create: `/Users/jacksonsweet/Projects/slate-plugin/mcp-server/index.js`

**Step 1: Create the plugin directory structure**

```bash
mkdir -p /Users/jacksonsweet/Projects/slate-plugin/mcp-server
mkdir -p /Users/jacksonsweet/Projects/slate-plugin/hooks
mkdir -p /Users/jacksonsweet/Projects/slate-plugin/skills/slate-tracking
mkdir -p /Users/jacksonsweet/Projects/slate-plugin/.claude-plugin
```

**Step 2: Initialize git repo**

```bash
cd /Users/jacksonsweet/Projects/slate-plugin && git init
```

**Step 3: Create package.json**

```json
{
  "name": "slate-mcp-server",
  "version": "1.0.0",
  "type": "module",
  "private": true,
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.12.0",
    "zod": "^3.25.0"
  }
}
```

**Step 4: Install dependencies**

```bash
cd /Users/jacksonsweet/Projects/slate-plugin/mcp-server && npm install
```

**Step 5: Create index.js with server skeleton and API helper**

```js
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// ============ CONFIG ============

function getApiKey() {
  // 1. Environment variable
  if (process.env.SLATE_API_KEY) return process.env.SLATE_API_KEY;
  // 2. Config file
  const configPath = join(process.env.HOME || '', '.slate', 'config.json');
  if (existsSync(configPath)) {
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    if (config.api_key) return config.api_key;
  }
  throw new Error('No Slate API key found. Set SLATE_API_KEY env var or create ~/.slate/config.json with {"api_key":"YOUR_KEY"}');
}

const BASE_URL = process.env.SLATE_API_URL || 'https://slate.opsapp.co/api/v1';

// ============ HTTP HELPER ============

async function slateApi(method, path, body = null, queryParams = {}) {
  const url = new URL(`${BASE_URL}${path}`);
  for (const [k, v] of Object.entries(queryParams)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }
  const opts = {
    method,
    headers: { 'X-API-Key': getApiKey(), 'Content-Type': 'application/json' },
  };
  if (body && (method === 'POST' || method === 'PATCH')) {
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url.toString(), opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `API error ${res.status}`);
  return data;
}

// ============ MCP SERVER ============

const server = new McpServer({ name: 'slate', version: '1.0.0' });

// Tools will be registered here (Tasks 8-10)

// ============ START ============

const transport = new StdioServerTransport();
await server.connect(transport);
```

**Step 6: Commit**

```bash
cd /Users/jacksonsweet/Projects/slate-plugin && git add -A && git commit -m "feat: scaffold MCP server with API helper and config loading"
```

---

## Task 8: Register CRUD tools on the MCP server

**Files:**
- Modify: `/Users/jacksonsweet/Projects/slate-plugin/mcp-server/index.js`

**Step 1: Add list tools**

Register these tools between the `// Tools will be registered here` comment and the `// START` section:

```js
// ---- LIST TOOLS ----

server.tool('slate_list_pages', { deleted: z.enum(['include', 'only']).optional() },
  async ({ deleted }) => {
    const data = await slateApi('GET', '/pages', null, { deleted });
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool('slate_list_sections',
  { page_id: z.string(), deleted: z.enum(['include', 'only']).optional() },
  async ({ page_id, deleted }) => {
    const data = await slateApi('GET', '/sections', null, { page_id, deleted });
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool('slate_list_notes', {
    page_id: z.string().optional(),
    section_id: z.string().optional(),
    tags: z.string().optional().describe('Comma-separated tag names'),
    completed: z.enum(['true', 'false']).optional(),
    search: z.string().optional(),
    date_from: z.string().optional(),
    date_to: z.string().optional(),
    limit: z.number().optional(),
    deleted: z.enum(['include', 'only']).optional(),
  },
  async (params) => {
    const data = await slateApi('GET', '/notes', null, params);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool('slate_list_tags', {},
  async () => {
    const data = await slateApi('GET', '/tags');
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);
```

**Step 2: Add create tools**

```js
// ---- CREATE TOOLS ----

server.tool('slate_create_page', { name: z.string() },
  async ({ name }) => {
    const data = await slateApi('POST', '/pages', { name });
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool('slate_create_section',
  { name: z.string(), page_id: z.string() },
  async ({ name, page_id }) => {
    const data = await slateApi('POST', '/sections', { name, page_id });
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool('slate_create_note', {
    content: z.string(),
    section_id: z.string(),
    tags: z.array(z.string()).optional(),
    date: z.string().optional(),
  },
  async ({ content, section_id, tags, date }) => {
    const data = await slateApi('POST', '/notes', { content, section_id, tags, date });
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);
```

**Step 3: Add update tools**

```js
// ---- UPDATE TOOLS ----

server.tool('slate_update_page', {
    id: z.string(),
    name: z.string().optional(),
    starred: z.boolean().optional(),
  },
  async ({ id, ...updates }) => {
    const data = await slateApi('PATCH', `/pages/${id}`, updates);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool('slate_update_section',
  { id: z.string(), name: z.string() },
  async ({ id, name }) => {
    const data = await slateApi('PATCH', `/sections/${id}`, { name });
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool('slate_update_note', {
    id: z.string(),
    content: z.string().optional(),
    tags: z.array(z.string()).optional(),
    completed: z.boolean().optional(),
    date: z.string().optional(),
  },
  async ({ id, ...updates }) => {
    const data = await slateApi('PATCH', `/notes/${id}`, updates);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);
```

**Step 4: Add delete tools**

```js
// ---- DELETE TOOLS ----

server.tool('slate_delete_page', { id: z.string() },
  async ({ id }) => {
    const data = await slateApi('DELETE', `/pages/${id}`);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool('slate_delete_section', { id: z.string() },
  async ({ id }) => {
    const data = await slateApi('DELETE', `/sections/${id}`);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool('slate_delete_note', { id: z.string() },
  async ({ id }) => {
    const data = await slateApi('DELETE', `/notes/${id}`);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);
```

**Step 5: Commit**

```bash
cd /Users/jacksonsweet/Projects/slate-plugin && git add mcp-server/index.js && git commit -m "feat(mcp): register 13 CRUD tools"
```

---

## Task 9: Register high-level tools on the MCP server

**Files:**
- Modify: `/Users/jacksonsweet/Projects/slate-plugin/mcp-server/index.js`

**Step 1: Add slate_sync tool**

```js
// ---- HIGH-LEVEL TOOLS ----

server.tool('slate_sync',
  { page_id: z.string().optional().describe('Scope to a specific page. Omit for all pages.') },
  async ({ page_id }) => {
    // Get pages
    const pagesData = await slateApi('GET', '/pages');
    const pages = page_id
      ? pagesData.pages.filter(p => p.id === page_id)
      : pagesData.pages;

    if (!pages.length) {
      return { content: [{ type: 'text', text: 'No pages found.' }] };
    }

    const result = [];
    for (const page of pages) {
      const sectionsData = await slateApi('GET', '/sections', null, { page_id: page.id });
      const notesData = await slateApi('GET', '/notes', null, {
        page_id: page.id,
        completed: 'false',
      });

      if (notesData.notes.length === 0) continue;

      const pageBlock = {
        page: page.name,
        page_id: page.id,
        sections: [],
      };

      for (const section of sectionsData.sections) {
        const sectionNotes = notesData.notes.filter(n => n.section_id === section.id);
        if (sectionNotes.length === 0) continue;
        pageBlock.sections.push({
          section: section.name,
          section_id: section.id,
          notes: sectionNotes.map(n => ({
            id: n.id,
            content: n.content,
            tags: n.tags,
            date: n.date,
            created_at: n.created_at,
          })),
        });
      }

      if (pageBlock.sections.length > 0) result.push(pageBlock);
    }

    if (result.length === 0) {
      return { content: [{ type: 'text', text: 'No open items found.' }] };
    }

    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);
```

**Step 2: Add slate_search tool**

```js
server.tool('slate_search', {
    query: z.string().describe('Search keyword for note content'),
    tags: z.string().optional().describe('Comma-separated tag filter'),
    completed: z.enum(['true', 'false']).optional(),
    date_from: z.string().optional(),
    date_to: z.string().optional(),
  },
  async ({ query, tags, completed, date_from, date_to }) => {
    const data = await slateApi('GET', '/notes', null, {
      search: query, tags, completed, date_from, date_to, limit: 50,
    });
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);
```

**Step 3: Add slate_create_checklist tool**

```js
server.tool('slate_create_checklist', {
    section_id: z.string().optional().describe('Existing section ID. Omit if creating a new section.'),
    page_id: z.string().optional().describe('Page ID for new section. Required if section_id is omitted.'),
    section_name: z.string().optional().describe('Name for new section. Required if section_id is omitted.'),
    items: z.array(z.object({
      content: z.string(),
      tags: z.array(z.string()).optional(),
    })).describe('Array of checklist items to create'),
  },
  async ({ section_id, page_id, section_name, items }) => {
    let targetSectionId = section_id;

    // Create section if needed
    if (!targetSectionId) {
      if (!page_id || !section_name) {
        throw new Error('Either section_id OR page_id + section_name is required');
      }
      const sectionData = await slateApi('POST', '/sections', {
        name: section_name, page_id,
      });
      targetSectionId = sectionData.section.id;
    }

    // Create all notes
    const created = [];
    for (const item of items) {
      const noteData = await slateApi('POST', '/notes', {
        content: item.content,
        section_id: targetSectionId,
        tags: item.tags || [],
      });
      created.push(noteData.note);
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ section_id: targetSectionId, created_count: created.length, notes: created }, null, 2),
      }],
    };
  }
);
```

**Step 4: Commit**

```bash
cd /Users/jacksonsweet/Projects/slate-plugin && git add mcp-server/index.js && git commit -m "feat(mcp): register sync, search, and create_checklist high-level tools"
```

---

## Task 10: Test MCP server locally

**Step 1: Create a test config file**

```bash
mkdir -p ~/.slate
echo '{"api_key":"YOUR_SLATE_API_KEY_HERE"}' > ~/.slate/config.json
```

**Step 2: Test the server starts without errors**

```bash
cd /Users/jacksonsweet/Projects/slate-plugin/mcp-server
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}' | node index.js
# Expected: JSON response with server capabilities (tools listed)
```

**Step 3: Test listing tools**

```bash
echo -e '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}\n{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' | node index.js
# Expected: JSON listing all 16 tools with their schemas
```

**Step 4: Fix any issues found during testing**

If errors occur, fix them and re-test before proceeding.

**Step 5: Commit any fixes**

```bash
cd /Users/jacksonsweet/Projects/slate-plugin && git add -A && git commit -m "fix(mcp): address issues found during local testing"
```

---

## Task 11: Create plugin manifest and MCP config

**Files:**
- Create: `/Users/jacksonsweet/Projects/slate-plugin/.claude-plugin/plugin.json`
- Create: `/Users/jacksonsweet/Projects/slate-plugin/.mcp.json`

**Step 1: Create plugin.json**

```json
{
  "name": "slate",
  "version": "1.0.0",
  "description": "Bidirectional Slate integration — automatic todo sync, progress tracking, and testing checkpoints",
  "author": {
    "name": "Jackson Sweet"
  },
  "license": "MIT",
  "keywords": ["slate", "notes", "todos", "tracking", "testing"]
}
```

**Step 2: Create .mcp.json**

```json
{
  "slate": {
    "command": "node",
    "args": ["${CLAUDE_PLUGIN_ROOT}/mcp-server/index.js"]
  }
}
```

**Step 3: Commit**

```bash
cd /Users/jacksonsweet/Projects/slate-plugin && git add -A && git commit -m "feat: add plugin manifest and MCP server config"
```

---

## Task 12: Create SessionStart hook

**Files:**
- Create: `/Users/jacksonsweet/Projects/slate-plugin/hooks/hooks.json`
- Create: `/Users/jacksonsweet/Projects/slate-plugin/hooks/session-start.sh`

**Step 1: Create hooks.json**

```json
{
  "description": "Slate integration hooks for automatic syncing and progress tracking",
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|resume",
        "hooks": [
          {
            "type": "prompt",
            "prompt": "Check if a .claude/slate.local.md file exists in the current project directory. If it does, read the page_id from its YAML frontmatter and call the slate_sync MCP tool with that page_id to load open items. Present a brief summary of open items to the user (e.g. '3 open bugs, 2 items need testing'). If the file does not exist, ask the user: 'Would you like to connect a Slate page to this project for task tracking? I can list your pages with slate_list_pages.' If the user chooses a page, create .claude/slate.local.md with the page_id and page_name in YAML frontmatter."
          }
        ]
      }
    ]
  }
}
```

Note: The `session-start.sh` script is not needed — we use a prompt-based hook which is handled entirely by the LLM. No bash script required.

**Step 2: Commit**

```bash
cd /Users/jacksonsweet/Projects/slate-plugin && git add -A && git commit -m "feat: add SessionStart prompt hook for auto-sync"
```

---

## Task 13: Create Stop hook

**Files:**
- Modify: `/Users/jacksonsweet/Projects/slate-plugin/hooks/hooks.json`

**Step 1: Add Stop hook to hooks.json**

Add a `Stop` entry to the `hooks` object:

```json
"Stop": [
  {
    "matcher": "*",
    "hooks": [
      {
        "type": "prompt",
        "prompt": "Before finishing, check if .claude/slate.local.md exists. If it does and you completed meaningful work this session (implemented a feature, fixed a bug, or made progress on a task), use the Slate MCP tools to update your progress: (1) If any Slate notes correspond to completed work, call slate_update_note to mark them completed=true. (2) If you implemented something that needs user testing, call slate_create_checklist or slate_create_note with tags ['NEEDS-TESTING'] describing what to test and expected behavior. (3) If work is partially done, call slate_update_note to add the tag 'IN-PROGRESS'. (4) If you encountered blockers, call slate_create_note with tags ['BLOCKED'] describing the issue. Be concise — only update Slate if real progress was made. Do not create noise."
      }
    ]
  }
]
```

**Step 2: Commit**

```bash
cd /Users/jacksonsweet/Projects/slate-plugin && git add hooks/hooks.json && git commit -m "feat: add Stop prompt hook for auto progress tracking"
```

---

## Task 14: Create slate-tracking skill

**Files:**
- Create: `/Users/jacksonsweet/Projects/slate-plugin/skills/slate-tracking/SKILL.md`

**Step 1: Write the skill file**

```markdown
---
name: slate-tracking
description: "Conventions for using Slate as a task tracker with Claude Code. Use when managing todos, bugs, plans, or testing checkpoints in Slate."
---

# Slate Task Tracking Conventions

## Tag Vocabulary

Use these standard tags when creating or updating notes in Slate:

| Tag | Meaning |
|-----|---------|
| `BUG` | Bug report captured by user |
| `PLAN` | Implementation plan step |
| `NEEDS-TESTING` | Testing checkpoint — user must verify |
| `IN-PROGRESS` | Currently being worked on |
| `BLOCKED` | Cannot proceed — content describes why |
| `URGENT` | Time-sensitive, prioritize |
| `TODAY` | Should be done today |
| `THIS-WEEK` | Should be done this week |

## When to Create Sections vs Tagged Notes

- **Small fixes (1-3 items):** Add tagged notes to an existing section (e.g. "Bugs", "Tasks")
- **Larger features (4+ items):** Create a dedicated section named after the feature
- **Testing checklists:** Always create a dedicated section named "[Feature] - Testing"

## Testing Checkpoint Format

When creating testing checkpoints after implementing a feature:
- **Content:** Describe what to test and the expected behavior in one clear sentence
- **Tags:** Always include `NEEDS-TESTING`
- **Example:** "Login with Google redirects to dashboard within 2 seconds" tagged `NEEDS-TESTING`

## Session Workflow

1. **Session start:** Check Slate sync results for open items. Prioritize by tags: `URGENT` > `TODAY` > `BUG` > `THIS-WEEK` > others
2. **During work:** When starting on a Slate item, tag it `IN-PROGRESS`
3. **After completing work:** Mark the note `completed=true`. Create testing checkpoints if the work needs user verification.
4. **When blocked:** Tag the item `BLOCKED` and update content with the reason

## Project Config

Each project links to a Slate page via `.claude/slate.local.md`:

```yaml
---
page_id: "uuid-of-the-slate-page"
page_name: "Project Name"
---
```

To set up: Call `slate_list_pages` to find the right page, then create this file.
```

**Step 2: Commit**

```bash
cd /Users/jacksonsweet/Projects/slate-plugin && git add -A && git commit -m "feat: add slate-tracking skill with tag conventions and workflow guide"
```

---

## Task 15: Install and test the plugin end-to-end

**Step 1: Install the plugin locally**

```bash
claude plugins add /Users/jacksonsweet/Projects/slate-plugin --local
```

If that CLI command doesn't exist, manually add to `~/.claude/settings.json`:

```json
"enabledPlugins": {
  "slate@local": true
}
```

And add to `~/.claude/plugins/installed_plugins.json` following the existing format.

**Step 2: Start a new Claude Code session in a test project**

Open a new Claude Code session. The SessionStart hook should fire and either:
- Ask if you want to link a Slate page (if no `.claude/slate.local.md` exists)
- Sync and display open items (if config exists)

**Step 3: Test the MCP tools manually**

Ask Claude Code to:
- "List my Slate pages" — should call `slate_list_pages`
- "Create a note 'Test from Claude Code' in section X" — should call `slate_create_note`
- "Mark note Y as completed" — should call `slate_update_note`
- "Create a testing checklist for the auth feature" — should call `slate_create_checklist`

**Step 4: Test the Stop hook**

Complete a small task, then end the session. Check Slate to see if any progress was written back.

**Step 5: Fix any issues found**

If anything doesn't work, fix and commit.

**Step 6: Commit final state**

```bash
cd /Users/jacksonsweet/Projects/slate-plugin && git add -A && git commit -m "chore: finalize plugin after end-to-end testing"
```

---

## Summary

| Task | What | Files |
|------|------|-------|
| 1 | URL parser for resource IDs | `api/v1/[...path].js` |
| 2 | PATCH/DELETE pages | `api/v1/[...path].js` |
| 3 | PATCH/DELETE sections | `api/v1/[...path].js` |
| 4 | PATCH/DELETE notes | `api/v1/[...path].js` |
| 5 | Update API docs page | `src/pages/ApiDocsPage.jsx` |
| 6 | Push and verify on Vercel | — |
| 7 | Scaffold MCP server | `slate-plugin/mcp-server/*` |
| 8 | Register CRUD tools | `slate-plugin/mcp-server/index.js` |
| 9 | Register high-level tools | `slate-plugin/mcp-server/index.js` |
| 10 | Test MCP server locally | — |
| 11 | Plugin manifest + MCP config | `slate-plugin/.claude-plugin/plugin.json`, `.mcp.json` |
| 12 | SessionStart hook | `slate-plugin/hooks/hooks.json` |
| 13 | Stop hook | `slate-plugin/hooks/hooks.json` |
| 14 | Slate-tracking skill | `slate-plugin/skills/slate-tracking/SKILL.md` |
| 15 | Install and test end-to-end | — |
