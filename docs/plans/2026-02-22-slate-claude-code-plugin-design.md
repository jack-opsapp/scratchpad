# Slate Claude Code Plugin — Design Doc

**Date:** 2026-02-22
**Status:** Approved

## Purpose

Give Claude Code automatic, bidirectional integration with Slate so that:
- Claude automatically knows the user's open bugs, todos, and plans at session start
- Claude writes back progress updates, testing checkpoints, and plans as it works
- The user captures context on mobile throughout the day; Claude acts on it at the keyboard

## Architecture

Three layers:

```
Claude Code
    |
    v
[Plugin: hooks + skills]
    |
    v
[MCP Server: stdio Node.js process]
    |
    v
[REST API: slate.opsapp.co/api/v1/*]
    |
    v
[Supabase]
```

---

## Layer 1: REST API Enhancements

### New endpoints (added to `api/v1/[...path].js`)

| Method | Endpoint | Body fields | Behavior |
|--------|----------|-------------|----------|
| PATCH | `/api/v1/pages/:id` | `name`, `starred` | Partial update. Ownership via user_id. |
| DELETE | `/api/v1/pages/:id` | — | Soft-delete: sets `deleted_at = now()`. |
| PATCH | `/api/v1/sections/:id` | `name` | Partial update. Ownership via page → user_id. |
| DELETE | `/api/v1/sections/:id` | — | Soft-delete. |
| PATCH | `/api/v1/notes/:id` | `content`, `tags`, `completed`, `date` | Partial update. Auto-sets `completed_at` when `completed` changes to true. Ownership via section → page → user_id. |
| DELETE | `/api/v1/notes/:id` | — | Soft-delete. |

### Routing change

The URL parser extracts an optional ID from paths like `/api/v1/notes/uuid-here`:
- `resource` = `notes`
- `resourceId` = `uuid-here`

Existing GET/POST handlers continue to work. PATCH/DELETE handlers receive the ID from the URL.

---

## Layer 2: MCP Server

### Overview

- **Runtime:** Node.js, stdio transport
- **Auth:** API key from `~/.slate/config.json` or `SLATE_API_KEY` env var
- **Base URL:** `https://slate.opsapp.co/api/v1`

### Tools (16 total)

#### CRUD tools

| Tool | Params | Description |
|------|--------|-------------|
| `slate_list_pages` | `deleted?` | List all pages. Optional deleted filter. |
| `slate_list_sections` | `page_id`, `deleted?` | List sections for a page. |
| `slate_list_notes` | `page_id?`, `section_id?`, `tags?`, `completed?`, `search?`, `date_from?`, `date_to?`, `limit?`, `deleted?` | List notes with filters. |
| `slate_list_tags` | — | List all unique tags. |
| `slate_create_page` | `name` | Create a page. |
| `slate_create_section` | `name`, `page_id` | Create a section. |
| `slate_create_note` | `content`, `section_id`, `tags?`, `date?` | Create a note. |
| `slate_update_note` | `id`, `content?`, `tags?`, `completed?`, `date?` | Update a note (partial). |
| `slate_update_section` | `id`, `name` | Rename a section. |
| `slate_update_page` | `id`, `name?`, `starred?` | Update a page. |
| `slate_delete_note` | `id` | Soft-delete a note. |
| `slate_delete_section` | `id` | Soft-delete a section. |
| `slate_delete_page` | `id` | Soft-delete a page. |

#### High-level tools

| Tool | Params | Description |
|------|--------|-------------|
| `slate_sync` | `page_id?` | Pull all incomplete notes, grouped by page/section. Designed for session-start context loading. If `page_id` is given, scopes to that page. |
| `slate_search` | `query`, `tags?`, `completed?`, `date_from?`, `date_to?` | Search notes by content keyword and/or filters. Returns results with full page/section context. |
| `slate_create_checklist` | `section_id` OR `page_id` + `section_name`, `items[]` (each: `content`, `tags?`) | Batch-create multiple notes. If `section_name` is given, creates a new section first. Used for testing checkpoints and plan steps. |

---

## Layer 3: Claude Code Plugin

### Plugin structure

```
slate-plugin/
  plugin.json
  .mcp.json
  mcp-server/
    index.js
    package.json
  hooks/
    session-start.md
    stop.md
  skills/
    slate-tracking.md
```

### `plugin.json`

Registers the plugin name, description, and component discovery.

### `.mcp.json`

Registers the MCP server:
```json
{
  "mcpServers": {
    "slate": {
      "command": "node",
      "args": ["${CLAUDE_PLUGIN_ROOT}/mcp-server/index.js"],
      "env": {}
    }
  }
}
```

### `SessionStart` hook

**Event:** `SessionStart`
**Behavior:**
1. Check if `.claude/slate.local.md` exists in the project directory
2. If yes: read the configured page ID, call `slate_sync` with that page, present summary of open items
3. If no: ask user "Do you have a Slate page for this project? Want to link one?"
4. If user links a page: store the page ID in `.claude/slate.local.md`

### `Stop` hook

**Event:** `Stop`
**Behavior (prompt-based):**
Check if meaningful work was completed in this response. If so:
- Mark relevant Slate notes as completed
- Create testing checkpoints for features just implemented
- Tag items as `IN-PROGRESS` or `BLOCKED` as appropriate
- Only fire if the plugin config shows an active Slate page

### `slate-tracking` skill

Defines conventions for Claude:

**Tag vocabulary:**
- `BUG` — Bug report
- `PLAN` — Implementation plan step
- `NEEDS-TESTING` — Testing checkpoint awaiting user verification
- `IN-PROGRESS` — Currently being worked on
- `BLOCKED` — Cannot proceed, reason in content
- `URGENT` — Time-sensitive, prioritize
- `TODAY` — Should be done today
- `THIS-WEEK` — Should be done this week

**Section vs tagged notes:**
- Small fixes (1-3 items): tagged notes in existing section
- Larger features (4+ items, or testing checklists): dedicated section

**Testing checkpoint format:**
- Content describes what to test and expected behavior
- Tagged `NEEDS-TESTING`
- Optional: date field for when testing should happen

### Project config: `.claude/slate.local.md`

```yaml
---
page_id: "uuid-of-the-slate-page"
page_name: "Slate Web App"
---
```

Stored per-project in `.claude/`. Links a local directory to a Slate page.

---

## Data Flow Examples

### Session start (existing project)
```
SessionStart hook fires
  -> reads .claude/slate.local.md -> page_id = abc123
  -> calls slate_sync(page_id=abc123)
  -> returns: 3 open bugs, 2 unchecked test items, 1 blocked task
  -> Claude starts session with context
```

### After implementing a feature
```
Stop hook fires
  -> Claude completed auth refactor
  -> calls slate_update_note(id=xyz, completed=true) for the "refactor auth" todo
  -> calls slate_create_checklist(
       page_id=abc123, section_name="Auth Refactor - Testing",
       items=[
         {content: "Login with Google still works", tags: ["NEEDS-TESTING"]},
         {content: "Expired tokens redirect to login", tags: ["NEEDS-TESTING"]},
         {content: "API key auth unchanged", tags: ["NEEDS-TESTING"]}
       ])
  -> User sees test items in Slate on their phone
```

### User captures bug on mobile
```
User opens Slate on phone
  -> Adds note: "Calendar view crashes when no events" in "Bugs" section
  -> Tags: BUG, URGENT

Next Claude Code session:
  -> SessionStart sync picks up the new bug
  -> Claude: "I see a new urgent bug: Calendar view crashes when no events. Want me to look into it?"
```
