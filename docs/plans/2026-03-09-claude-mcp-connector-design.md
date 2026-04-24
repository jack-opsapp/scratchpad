# Slate Claude MCP Connector — Design

**Date:** 2026-03-09
**Status:** Approved

---

## Overview

Add a remote MCP (Model Context Protocol) server at `POST /api/mcp` so users can connect their Slate workspace directly inside Claude.ai (web and mobile). Claude gets full read/write access to the user's pages, sections, notes, tags, and connections.

---

## Architecture

**Single new file:** `api/mcp.js` (Vercel serverless function)

**Transport:** MCP Streamable HTTP (spec 2025-03-26) — stateless JSON-RPC 2.0 over HTTP. No SSE sessions required; all tool calls are synchronous request/response.

**Auth:** Every request (including `initialize`) must include `X-API-Key: <key>`. The handler duplicates `authenticateApiKey()` logic from `api/v1/[...path].js` — same SHA-256 hash lookup against the `api_keys` table, same `last_used_at` update.

**Data access:** The handler calls Supabase directly using the service role client (same pattern as the v1 handler). It does NOT proxy through the REST API to avoid the extra HTTP round-trip.

**Claude.ai connector config (what users set up):**
- URL: `https://slate.app/api/mcp`
- Custom header: `X-API-Key: <their-slate-api-key>`

---

## MCP Protocol Handling

| JSON-RPC method | Behavior |
|---|---|
| `initialize` | Requires auth. Returns `serverInfo` and `capabilities: { tools: {} }`. Protocol version: `2025-03-26`. |
| `notifications/initialized` | Notification (no `id`). Return `204 No Content`. |
| `tools/list` | Requires auth. Returns all 16 tool definitions. |
| `tools/call` | Requires auth. Executes the named tool, returns `{ content: [{ type: "text", text: "<json>" }] }`. |
| Anything else | Return JSON-RPC error `-32601 Method not found`. |

**Error codes used:**
- `-32700` Parse error (malformed JSON body)
- `-32600` Invalid request (missing `method` or `jsonrpc`)
- `-32601` Method not found
- `-32602` Invalid params (missing required tool arg)
- `-32001` Unauthorized (bad/missing/revoked API key)
- `-32603` Internal error (Supabase failure)

**Success response shape for `tools/call`:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [{ "type": "text", "text": "{\"notes\": [...], \"total\": 5}" }]
  }
}
```
Tool results are serialized as JSON strings inside a text content block.

**CORS:** `Access-Control-Allow-Origin: *` on all responses. Handle `OPTIONS` preflight with `200`.

---

## Tools (17 total)

### Pages
| Tool | Required params | Optional params |
|---|---|---|
| `list_pages` | — | — |
| `create_page` | `name` | — |
| `update_page` | `id` | `name`, `starred` |
| `delete_page` | `id` | — |

### Sections
| Tool | Required params | Optional params |
|---|---|---|
| `list_sections` | — | `page_id` |
| `create_section` | `name`, `page_id` | — |
| `update_section` | `id`, `name` | — |
| `delete_section` | `id` | — |

### Notes
| Tool | Required params | Optional params |
|---|---|---|
| `list_notes` | — | `page_id`, `section_id`, `completed`, `tags` (array), `search`, `limit` (max 200), `date_from`, `date_to` |
| `create_note` | `content`, `section_id` | `tags` (array), `date` |
| `update_note` | `id` | `content`, `tags`, `completed`, `date`, `section_id` (move note) |
| `delete_note` | `id` | — |

Note: `update_note` supports `section_id` to move a note between sections — this is not in the REST API but the MCP handler implements it directly via Supabase.

### Tags
| Tool | Required params | Optional params |
|---|---|---|
| `list_tags` | — | — |

### Connections
| Tool | Required params | Optional params |
|---|---|---|
| `list_connections` | — | `note_id` |
| `create_connection` | `source_note_id`, `target_note_id` | `connection_type` (related/supports/contradicts/extends/source), `label` |
| `delete_connection` | `id` | — |

---

## Ownership & Security

- All queries scope to the authenticated `user_id` via the API key.
- Section and note ownership is verified through the `pages → sections → notes` chain (same logic as v1).
- Deleted records (soft-delete via `deleted_at`) are excluded from all results by default.
- The `move_note` path (setting `section_id` on PATCH) verifies the target section belongs to the user before updating.

---

## File to Create

```
api/mcp.js        — ~350 lines, single Vercel serverless function
```

No other files are created or modified.

---

## Out of Scope

- OAuth / token exchange (API key auth only)
- SSE streaming responses
- MCP resources or prompts endpoints (tools only)
- Exposing the `/api/v1/keys` endpoint through MCP
