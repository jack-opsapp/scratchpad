# Note Connections Feature - Design Doc

## Overview

Add Obsidian-style bidirectional note connections to Scratchpad. Notes can link to other notes across any page/section using `[[wikilink]]` syntax, with optional typed labels. Includes AI-suggested connections and both local + global graph visualizations.

## Data Layer

### New table: `note_connections`

```sql
CREATE TABLE note_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_note_id UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  target_note_id UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  connection_type TEXT DEFAULT 'related',
  label TEXT,
  created_by_user_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(source_note_id, target_note_id)
);
```

- Bidirectional: if A→B exists, querying from B returns A (no need for reverse row)
- `connection_type`: enum of `related`, `supports`, `contradicts`, `extends`, `source` + user-defined
- `label`: optional freeform display text
- RLS: user can access connections where they own/have permission on at least one of the connected notes' pages

### New RPC: `get_note_connections(p_note_id, p_user_id)`

Returns all connections for a note (both directions) with note content, section, and page info.

### New RPC: `get_page_connections(p_page_id, p_user_id)`

Returns all connections between notes on a given page (for local graph).

### New RPC: `get_all_connections(p_user_id)`

Returns all connections across all user's pages (for global graph).

## Interaction Model

### Creating connections

1. **Inline wikilink**: Type `[[` in note content to trigger autocomplete popover. Shows matching notes across all pages. Selecting one inserts `[[note-id|display text]]` and creates a `note_connections` row.

2. **Manual action**: Right-click note → "Connect to..." opens same autocomplete search.

3. **AI suggestions**: When a note is selected, a small popover appears adjacent to it showing 2-3 semantically similar notes (using existing `match_notes()` vector function). One-click to accept/dismiss.

### Connection types

- Untyped by default (`related`)
- Typed via syntax: `[[note-id|type:display text]]`
- Or assign type after creation via connection popover
- Default types: `related`, `supports`, `contradicts`, `extends`, `source`

### Rendering wikilinks

In note content, `[[note-id|display text]]` renders as a clickable chip/pill with the display text. Clicking navigates to that note's section. Hover shows preview tooltip.

### Backlinks

Each note shows a small "N connections" badge. Clicking reveals a popover listing:
- Outgoing links (notes this note links to)
- Incoming links (notes that link to this note)
- Grouped by connection type

## Graph Views

### Local graph (per-note popover)

- Small force-directed graph showing 1-2 hops from selected note
- Nodes colored by page
- Edge labels show connection type
- Click node to navigate to that note
- Appears in a popover/drawer adjacent to the note

### Global graph (full-screen view)

- New view mode alongside list/boxes/calendar/table
- All notes as nodes, connections as edges
- Force-directed layout using D3 or similar
- Filter by: connection type, page, tags
- Nodes colored by page, sized by connection count
- Click to navigate, hover for preview
- Zoom/pan controls

## AI Agent Integration

New agent functions:
- `get_connected_notes(note_id)` - List connections for a note
- `create_connection(source_note_id, target_note_id, type)` - Create connection
- `suggest_connections(note_id)` - Return AI-suggested connections via match_notes()

## Tech Decisions

- **Graph library**: D3.js force simulation (no additional dependency needed for basic force layout, or use a lightweight lib like `d3-force` standalone)
- **Wikilink parsing**: Regex-based inline parsing in NoteCard render
- **Autocomplete**: Reuse existing note search patterns
- **State**: Add `connections` array to MainApp.jsx state, loaded on mount
- **Persistence**: Optimistic UI + async Supabase persist (existing pattern)
