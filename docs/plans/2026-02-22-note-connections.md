# Note Connections Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Obsidian-style bidirectional note connections with `[[wikilink]]` syntax, connection badges, AI suggestions popover, and both local + global graph visualizations.

**Architecture:** Junction table `note_connections` stores bidirectional links between notes. Notes render `[[id|text]]` as clickable chips. A new `GraphView` component uses D3 force simulation for the global graph. Connections load on mount alongside existing data and use optimistic UI + Supabase persist.

**Tech Stack:** Supabase (table + RPC + RLS), D3 force simulation (new dep), React inline rendering for wikilink chips, existing `match_notes()` RPC for AI suggestions.

---

## Task 1: Database — Create `note_connections` table + RLS + RPCs

**Files:**
- Supabase migration (applied via MCP `apply_migration`)

**Step 1: Apply the migration**

Use the Supabase MCP tool `apply_migration` with project_id `lepksnpkrnkokiwxfcsj`:

```sql
-- Table
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

-- Indexes
CREATE INDEX idx_note_connections_source ON note_connections(source_note_id);
CREATE INDEX idx_note_connections_target ON note_connections(target_note_id);

-- RLS
ALTER TABLE note_connections ENABLE ROW LEVEL SECURITY;

-- Policy: users can see connections where they have access to at least one note's page
CREATE POLICY "Users can view own connections"
  ON note_connections FOR SELECT
  USING (
    created_by_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM notes n
      JOIN sections s ON s.id = n.section_id
      JOIN pages p ON p.id = s.page_id
      LEFT JOIN page_permissions pp ON pp.page_id = p.id AND pp.user_id = auth.uid()
      WHERE (n.id = source_note_id OR n.id = target_note_id)
        AND (p.user_id = auth.uid() OR pp.user_id = auth.uid())
    )
  );

CREATE POLICY "Users can create connections on accessible notes"
  ON note_connections FOR INSERT
  WITH CHECK (
    created_by_user_id = auth.uid()
  );

CREATE POLICY "Users can delete own connections"
  ON note_connections FOR DELETE
  USING (
    created_by_user_id = auth.uid()
  );

-- RPC: Get all connections for a specific note (both directions)
CREATE OR REPLACE FUNCTION get_note_connections(p_note_id UUID)
RETURNS TABLE (
  connection_id UUID,
  connected_note_id UUID,
  connected_note_content TEXT,
  connected_note_section_id UUID,
  connected_section_name TEXT,
  connected_page_id UUID,
  connected_page_name TEXT,
  connection_type TEXT,
  label TEXT,
  direction TEXT,
  created_at TIMESTAMPTZ
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  -- Outgoing connections (this note is source)
  SELECT
    nc.id AS connection_id,
    nc.target_note_id AS connected_note_id,
    n.content AS connected_note_content,
    n.section_id AS connected_note_section_id,
    s.name AS connected_section_name,
    p.id AS connected_page_id,
    p.name AS connected_page_name,
    nc.connection_type,
    nc.label,
    'outgoing'::TEXT AS direction,
    nc.created_at
  FROM note_connections nc
  JOIN notes n ON n.id = nc.target_note_id
  JOIN sections s ON s.id = n.section_id
  JOIN pages p ON p.id = s.page_id
  WHERE nc.source_note_id = p_note_id
    AND n.deleted_at IS NULL
  UNION ALL
  -- Incoming connections (this note is target)
  SELECT
    nc.id AS connection_id,
    nc.source_note_id AS connected_note_id,
    n.content AS connected_note_content,
    n.section_id AS connected_note_section_id,
    s.name AS connected_section_name,
    p.id AS connected_page_id,
    p.name AS connected_page_name,
    nc.connection_type,
    nc.label,
    'incoming'::TEXT AS direction,
    nc.created_at
  FROM note_connections nc
  JOIN notes n ON n.id = nc.source_note_id
  JOIN sections s ON s.id = n.section_id
  JOIN pages p ON p.id = s.page_id
  WHERE nc.target_note_id = p_note_id
    AND n.deleted_at IS NULL;
END;
$$;

-- RPC: Get all connections for all notes accessible to user (for global graph)
CREATE OR REPLACE FUNCTION get_all_connections(p_user_id UUID)
RETURNS TABLE (
  connection_id UUID,
  source_note_id UUID,
  source_content TEXT,
  source_section_name TEXT,
  source_page_id UUID,
  source_page_name TEXT,
  target_note_id UUID,
  target_content TEXT,
  target_section_name TEXT,
  target_page_id UUID,
  target_page_name TEXT,
  connection_type TEXT,
  label TEXT
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    nc.id AS connection_id,
    nc.source_note_id,
    sn.content AS source_content,
    ss.name AS source_section_name,
    sp.id AS source_page_id,
    sp.name AS source_page_name,
    nc.target_note_id,
    tn.content AS target_content,
    ts.name AS target_section_name,
    tp.id AS target_page_id,
    tp.name AS target_page_name,
    nc.connection_type,
    nc.label
  FROM note_connections nc
  JOIN notes sn ON sn.id = nc.source_note_id
  JOIN sections ss ON ss.id = sn.section_id
  JOIN pages sp ON sp.id = ss.page_id
  JOIN notes tn ON tn.id = nc.target_note_id
  JOIN sections ts ON ts.id = tn.section_id
  JOIN pages tp ON tp.id = ts.page_id
  WHERE sn.deleted_at IS NULL
    AND tn.deleted_at IS NULL
    AND (
      sp.user_id = p_user_id
      OR EXISTS (SELECT 1 FROM page_permissions pp WHERE pp.page_id = sp.id AND pp.user_id = p_user_id)
      OR tp.user_id = p_user_id
      OR EXISTS (SELECT 1 FROM page_permissions pp WHERE pp.page_id = tp.id AND pp.user_id = p_user_id)
    );
END;
$$;
```

Migration name: `create_note_connections`

**Step 2: Verify migration**

Use `list_tables` MCP tool to confirm `note_connections` table exists with correct columns.

**Step 3: Commit** (no local files changed for this task — migration is server-side)

---

## Task 2: Storage layer — Add connection CRUD to storage.js

**Files:**
- Modify: `src/lib/storage.js` (add at bottom, before final export)

**Step 1: Add connection methods to storage.js**

Add these functions at the bottom of `src/lib/storage.js`, just above the final `export`:

```javascript
// =============================================================================
// Note Connections
// =============================================================================

/**
 * Get all connections for the current user (for graph view)
 */
async function getConnections() {
  const userId = await getCurrentUserId();
  if (!userId) return [];

  const { data, error } = await supabase.rpc('get_all_connections', { p_user_id: userId });
  if (error) {
    console.error('Failed to fetch connections:', error);
    return [];
  }
  return data || [];
}

/**
 * Get connections for a specific note
 */
async function getNoteConnections(noteId) {
  const { data, error } = await supabase.rpc('get_note_connections', { p_note_id: noteId });
  if (error) {
    console.error('Failed to fetch note connections:', error);
    return [];
  }
  return data || [];
}

/**
 * Create a connection between two notes
 */
async function createConnection(sourceNoteId, targetNoteId, connectionType = 'related', label = null) {
  const userId = await getCurrentUserId();
  if (!userId) return null;

  const { data, error } = await supabase
    .from('note_connections')
    .insert({
      source_note_id: sourceNoteId,
      target_note_id: targetNoteId,
      connection_type: connectionType,
      label,
      created_by_user_id: userId,
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to create connection:', error);
    return null;
  }
  return data;
}

/**
 * Delete a connection
 */
async function deleteConnection(connectionId) {
  const { error } = await supabase
    .from('note_connections')
    .delete()
    .eq('id', connectionId);

  if (error) {
    console.error('Failed to delete connection:', error);
    return false;
  }
  return true;
}
```

Then add `getConnections`, `getNoteConnections`, `createConnection`, `deleteConnection` to the `dataStore` export object.

**Step 2: Commit**

```
feat: add note connections CRUD to storage layer
```

---

## Task 3: State management — Load connections in MainApp.jsx

**Files:**
- Modify: `src/screens/MainApp.jsx`

**Step 1: Add connections state**

Near line 195 (after the `boxConfigs` state), add:

```javascript
const [connections, setConnections] = useState([]);
```

**Step 2: Load connections on mount**

In the `load` function (line 318), add `dataStore.getConnections()` to the Promise.all:

```javascript
const [owned, shared, notesData, boxConfigsData, connectionsData] = await Promise.all([
  dataStore.getOwnedPages(),
  dataStore.getSharedPages(),
  dataStore.getNotes(),
  dataStore.getBoxConfigs(),
  dataStore.getConnections(),
]);
```

And after `setBoxConfigs`:

```javascript
setConnections(connectionsData || []);
```

**Step 3: Add connection helper functions**

After the existing note handler functions, add:

```javascript
// Connection handlers
const handleCreateConnection = async (sourceNoteId, targetNoteId, type = 'related', label = null) => {
  // Optimistic: add to local state
  const tempId = generateId();
  const sourceNote = notes.find(n => n.id === sourceNoteId);
  const targetNote = notes.find(n => n.id === targetNoteId);
  if (!sourceNote || !targetNote) return;

  const optimistic = {
    connection_id: tempId,
    source_note_id: sourceNoteId,
    source_content: sourceNote.content,
    target_note_id: targetNoteId,
    target_content: targetNote.content,
    connection_type: type,
    label,
  };
  setConnections(prev => [...prev, optimistic]);

  // Persist
  const result = await dataStore.createConnection(sourceNoteId, targetNoteId, type, label);
  if (result) {
    // Replace temp with real
    setConnections(prev => prev.map(c => c.connection_id === tempId ? { ...c, connection_id: result.id } : c));
  } else {
    // Rollback
    setConnections(prev => prev.filter(c => c.connection_id !== tempId));
  }
};

const handleDeleteConnection = async (connectionId) => {
  setConnections(prev => prev.filter(c => c.connection_id !== connectionId));
  const ok = await dataStore.deleteConnection(connectionId);
  if (!ok) {
    // Reload connections on failure
    const fresh = await dataStore.getConnections();
    setConnections(fresh || []);
  }
};
```

**Step 4: Commit**

```
feat: add connections state management to MainApp
```

---

## Task 4: Wikilink rendering — Parse `[[id|text]]` in NoteCard

**Files:**
- Create: `src/lib/wikilinks.js`
- Modify: `src/components/NoteCard.jsx`

**Step 1: Create wikilink parser utility**

Create `src/lib/wikilinks.js`:

```javascript
/**
 * Wikilink parser for note connections
 *
 * Syntax: [[note-id|display text]] or [[note-id|type:display text]]
 * Renders as clickable chips in note content.
 */

// Regex to match [[id|text]] or [[id|type:text]]
const WIKILINK_REGEX = /\[\[([a-f0-9-]+)\|(?:([a-z]+):)?([^\]]+)\]\]/g;

/**
 * Parse note content and split into text segments and wikilink segments
 * @param {string} content - Raw note content
 * @returns {Array<{type: 'text'|'link', value: string, noteId?: string, linkType?: string, displayText?: string}>}
 */
export function parseWikilinks(content) {
  if (!content) return [{ type: 'text', value: '' }];

  const segments = [];
  let lastIndex = 0;

  for (const match of content.matchAll(WIKILINK_REGEX)) {
    // Text before this match
    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: content.slice(lastIndex, match.index) });
    }

    segments.push({
      type: 'link',
      value: match[0],
      noteId: match[1],
      linkType: match[2] || null,
      displayText: match[3],
    });

    lastIndex = match.index + match[0].length;
  }

  // Remaining text after last match
  if (lastIndex < content.length) {
    segments.push({ type: 'text', value: content.slice(lastIndex) });
  }

  if (segments.length === 0) {
    segments.push({ type: 'text', value: content });
  }

  return segments;
}

/**
 * Strip wikilinks from content, keeping only display text
 * Useful for previews and search
 */
export function stripWikilinks(content) {
  if (!content) return '';
  return content.replace(WIKILINK_REGEX, '$3');
}

/**
 * Build a wikilink string
 */
export function buildWikilink(noteId, displayText, type = null) {
  if (type) {
    return `[[${noteId}|${type}:${displayText}]]`;
  }
  return `[[${noteId}|${displayText}]]`;
}
```

**Step 2: Modify NoteCard.jsx to render wikilinks**

In `src/components/NoteCard.jsx`, add import at top:

```javascript
import { parseWikilinks } from '../lib/wikilinks.js';
```

Replace the plain text `<p>` rendering (around line 148-164) with a version that renders wikilink chips. The existing block:

```jsx
<p ...>
  {isNew ? typewriter.displayed : note.content}
  ...
</p>
```

Replace with:

```jsx
<p
  onClick={() => canEdit && setEditing(true)}
  style={{
    color: note.completed ? colors.textMuted : colors.textPrimary,
    fontSize: 14,
    fontFamily: "'Inter', sans-serif",
    textDecoration: note.completed ? 'line-through' : 'none',
    cursor: canEdit ? 'text' : 'default',
    margin: 0,
    lineHeight: 1.5,
  }}
>
  {isNew ? typewriter.displayed : (
    parseWikilinks(note.content).map((seg, i) =>
      seg.type === 'text' ? (
        <span key={i}>{seg.value}</span>
      ) : (
        <span
          key={i}
          onClick={(e) => {
            e.stopPropagation();
            onLinkClick?.(seg.noteId);
          }}
          title={seg.linkType ? `${seg.linkType}: ${seg.displayText}` : seg.displayText}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '1px 8px',
            margin: '0 2px',
            background: 'rgba(148, 139, 114, 0.15)',
            border: `1px solid ${colors.primary}`,
            borderRadius: 3,
            color: colors.primary,
            fontSize: 12,
            cursor: 'pointer',
            verticalAlign: 'baseline',
          }}
        >
          {seg.displayText}
        </span>
      )
    )
  )}
  {isNew && !typewriter.done && (
    <span style={{ color: colors.primary }}>_</span>
  )}
</p>
```

Add `onLinkClick` to the component props:

```javascript
export function NoteCard({
  note,
  onToggle,
  onEdit,
  onDelete,
  isNew,
  currentUserId,
  canEdit = true,
  canDelete = true,
  canToggle = true,
  compact = false,
  onTagClick,
  onAddTag,
  draggable = false,
  onLinkClick,  // NEW
}) {
```

**Step 3: Wire onLinkClick in MainApp.jsx**

In MainApp.jsx, everywhere `<NoteCard>` is rendered (around line 3403 for list view), add:

```javascript
onLinkClick={(noteId) => {
  // Navigate to the note's section
  const linkedNote = notes.find(n => n.id === noteId);
  if (!linkedNote) return;
  const section = allSections.find(s => s.id === linkedNote.sectionId);
  if (section) {
    setCurrentPage(section.pageId);
    setCurrentSection(section.id);
    setViewingPageLevel(false);
  }
}}
```

**Step 4: Commit**

```
feat: parse and render [[wikilink]] chips in note content
```

---

## Task 5: Connection badge — Show connection count on each note

**Files:**
- Modify: `src/components/NoteCard.jsx`

**Step 1: Add connectionCount prop and badge**

Add `connectionCount` to NoteCard props (default 0).

After the tags/date row (around line 218), add a connections badge:

```jsx
{connectionCount > 0 && !compact && (
  <span
    onClick={(e) => {
      e.stopPropagation();
      onConnectionBadgeClick?.(note.id);
    }}
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      padding: '2px 8px',
      border: `1px solid ${colors.border}`,
      borderRadius: 3,
      color: colors.textMuted,
      fontSize: 11,
      cursor: 'pointer',
    }}
    title={`${connectionCount} connection${connectionCount === 1 ? '' : 's'}`}
  >
    {connectionCount}
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="6" cy="6" r="3"/><circle cx="18" cy="18" r="3"/><line x1="8.5" y1="8.5" x2="15.5" y2="15.5"/>
    </svg>
  </span>
)}
```

Add `connectionCount` and `onConnectionBadgeClick` to the destructured props.

**Step 2: Pass connectionCount from MainApp.jsx**

In the `renderNote` function (around line 3403), compute and pass count:

```javascript
connectionCount={connections.filter(c =>
  c.source_note_id === note.id || c.target_note_id === note.id
).length}
onConnectionBadgeClick={(noteId) => {
  // Will be used in Task 7 for the connections popover
}}
```

**Step 3: Commit**

```
feat: add connection count badge to NoteCard
```

---

## Task 6: Wikilink autocomplete — Type `[[` to search and insert links

**Files:**
- Create: `src/components/WikilinkAutocomplete.jsx`
- Modify: `src/components/NoteCard.jsx`

**Step 1: Create WikilinkAutocomplete component**

Create `src/components/WikilinkAutocomplete.jsx`:

```jsx
import { useState, useEffect, useRef } from 'react';
import { colors } from '../styles/theme.js';

/**
 * Autocomplete popover that appears when user types [[
 * Shows matching notes for creating wikilinks.
 */
export function WikilinkAutocomplete({ notes, position, onSelect, onClose }) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filtered = notes
    .filter(n => n.content.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 8);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && filtered.length > 0) {
      e.preventDefault();
      onSelect(filtered[selectedIndex]);
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: position.top,
        left: position.left,
        width: 280,
        maxHeight: 320,
        background: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: 4,
        zIndex: 1000,
        overflow: 'hidden',
        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
      }}
    >
      <input
        ref={inputRef}
        value={query}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Search notes..."
        style={{
          width: '100%',
          padding: '8px 12px',
          background: colors.bg,
          border: 'none',
          borderBottom: `1px solid ${colors.border}`,
          color: colors.textPrimary,
          fontSize: 13,
          fontFamily: "'Inter', sans-serif",
          outline: 'none',
        }}
      />
      <div style={{ maxHeight: 260, overflowY: 'auto' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: '12px', color: colors.textMuted, fontSize: 12 }}>
            No matching notes
          </div>
        ) : (
          filtered.map((note, i) => (
            <div
              key={note.id}
              onClick={() => onSelect(note)}
              style={{
                padding: '8px 12px',
                cursor: 'pointer',
                background: i === selectedIndex ? colors.surfaceRaised : 'transparent',
                borderBottom: `1px solid ${colors.border}`,
              }}
            >
              <div style={{
                color: colors.textPrimary,
                fontSize: 13,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>
                {note.content.substring(0, 60)}
              </div>
              {note.pageName && (
                <div style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                  {note.pageName} / {note.sectionName}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
```

**Step 2: Integrate into NoteCard editing**

In NoteCard.jsx, when the note is in editing mode, detect `[[` typed in the input. When detected, show the WikilinkAutocomplete popover. On select, insert the wikilink syntax into the content.

Modify the editing input (around line 123) to track cursor position and detect `[[`:

Add state:
```javascript
const [showAutocomplete, setShowAutocomplete] = useState(false);
const [autocompletePos, setAutocompletePos] = useState({ top: 0, left: 0 });
const editInputRef = useRef(null);
```

Replace the onChange handler:
```javascript
onChange={e => {
  const val = e.target.value;
  setContent(val);
  // Detect [[ trigger
  const cursor = e.target.selectionStart;
  if (val.substring(cursor - 2, cursor) === '[[') {
    const rect = e.target.getBoundingClientRect();
    setAutocompletePos({ top: rect.bottom + 4, left: rect.left });
    setShowAutocomplete(true);
  }
}}
```

Add the autocomplete below the input (inside the editing block):
```jsx
{showAutocomplete && (
  <WikilinkAutocomplete
    notes={allNotes || []}
    position={autocompletePos}
    onSelect={(targetNote) => {
      const displayText = targetNote.content.substring(0, 40).replace(/\n/g, ' ');
      const link = `[[${targetNote.id}|${displayText}]]`;
      // Replace the [[ with the full link
      const before = content.substring(0, content.lastIndexOf('[['));
      const after = content.substring(content.lastIndexOf('[[') + 2);
      setContent(before + link + after);
      setShowAutocomplete(false);
      onCreateConnection?.(note.id, targetNote.id);
    }}
    onClose={() => setShowAutocomplete(false)}
  />
)}
```

Add `allNotes` and `onCreateConnection` to NoteCard props.

**Step 3: Pass allNotes and onCreateConnection from MainApp.jsx**

In the renderNote calls, add:
```javascript
allNotes={notes.map(n => ({
  ...n,
  pageName: allPages.find(p => p.sections?.some(s => s.id === n.sectionId))?.name,
  sectionName: allSections.find(s => s.id === n.sectionId)?.name,
}))}
onCreateConnection={(sourceId, targetId) => handleCreateConnection(sourceId, targetId)}
```

**Step 4: Commit**

```
feat: add [[wikilink]] autocomplete when editing notes
```

---

## Task 7: Connections popover — Show connections when clicking badge

**Files:**
- Create: `src/components/ConnectionsPopover.jsx`
- Modify: `src/screens/MainApp.jsx`

**Step 1: Create ConnectionsPopover component**

Create `src/components/ConnectionsPopover.jsx`:

```jsx
import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { colors } from '../styles/theme.js';
import { dataStore } from '../lib/storage.js';

const TYPE_COLORS = {
  related: colors.textMuted,
  supports: '#2d6b3a',
  contradicts: '#b83c2a',
  extends: colors.primary,
  source: '#7a5c1a',
};

export default function ConnectionsPopover({ noteId, position, onClose, onNavigate, onDelete }) {
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    dataStore.getNoteConnections(noteId).then(data => {
      if (!cancelled) {
        setConnections(data || []);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [noteId]);

  const outgoing = connections.filter(c => c.direction === 'outgoing');
  const incoming = connections.filter(c => c.direction === 'incoming');

  return (
    <div
      style={{
        position: 'fixed',
        top: position.top,
        left: position.left,
        width: 300,
        maxHeight: 400,
        background: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: 4,
        zIndex: 1000,
        overflow: 'hidden',
        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
      }}
    >
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '8px 12px',
        borderBottom: `1px solid ${colors.border}`,
      }}>
        <span style={{ color: colors.textPrimary, fontSize: 12, fontWeight: 600, letterSpacing: 1 }}>
          CONNECTIONS
        </span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: colors.textMuted, cursor: 'pointer' }}>
          <X size={14} />
        </button>
      </div>

      <div style={{ maxHeight: 340, overflowY: 'auto', padding: '8px 0' }}>
        {loading ? (
          <div style={{ padding: 12, color: colors.textMuted, fontSize: 12 }}>Loading...</div>
        ) : connections.length === 0 ? (
          <div style={{ padding: 12, color: colors.textMuted, fontSize: 12 }}>No connections</div>
        ) : (
          <>
            {outgoing.length > 0 && (
              <div style={{ padding: '4px 12px' }}>
                <div style={{ color: colors.textMuted, fontSize: 10, fontWeight: 600, letterSpacing: 1, marginBottom: 4 }}>
                  LINKS TO
                </div>
                {outgoing.map(c => (
                  <ConnectionRow key={c.connection_id} connection={c} onNavigate={onNavigate} onDelete={onDelete} />
                ))}
              </div>
            )}
            {incoming.length > 0 && (
              <div style={{ padding: '4px 12px' }}>
                <div style={{ color: colors.textMuted, fontSize: 10, fontWeight: 600, letterSpacing: 1, marginBottom: 4 }}>
                  LINKED FROM
                </div>
                {incoming.map(c => (
                  <ConnectionRow key={c.connection_id} connection={c} onNavigate={onNavigate} onDelete={onDelete} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ConnectionRow({ connection, onNavigate, onDelete }) {
  const [hover, setHover] = useState(false);
  const typeColor = TYPE_COLORS[connection.connection_type] || colors.textMuted;

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => onNavigate(connection.connected_note_id, connection.connected_note_section_id, connection.connected_page_id)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 8px',
        borderRadius: 3,
        cursor: 'pointer',
        background: hover ? colors.surfaceRaised : 'transparent',
      }}
    >
      <span style={{
        width: 6, height: 6, borderRadius: '50%',
        background: typeColor, flexShrink: 0,
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          color: colors.textPrimary, fontSize: 12,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {connection.connected_note_content?.substring(0, 50)}
        </div>
        <div style={{ color: colors.textMuted, fontSize: 10 }}>
          {connection.connected_page_name} / {connection.connected_section_name}
          {connection.connection_type !== 'related' && (
            <span style={{ color: typeColor, marginLeft: 4 }}>
              {connection.connection_type}
            </span>
          )}
        </div>
      </div>
      {hover && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(connection.connection_id); }}
          style={{ background: 'none', border: 'none', color: colors.danger, cursor: 'pointer', padding: 2 }}
        >
          <X size={10} />
        </button>
      )}
    </div>
  );
}
```

**Step 2: Add to component index**

In `src/components/index.js`, add:
```javascript
export { default as ConnectionsPopover } from './ConnectionsPopover.jsx';
```

**Step 3: Wire into MainApp.jsx**

Add state for the active popover:
```javascript
const [connectionsPopover, setConnectionsPopover] = useState(null); // { noteId, top, left }
```

Add the popover component to the JSX (before the ChatPanel):
```jsx
{connectionsPopover && (
  <ConnectionsPopover
    noteId={connectionsPopover.noteId}
    position={{ top: connectionsPopover.top, left: connectionsPopover.left }}
    onClose={() => setConnectionsPopover(null)}
    onNavigate={(noteId, sectionId, pageId) => {
      setCurrentPage(pageId);
      setCurrentSection(sectionId);
      setViewingPageLevel(false);
      setConnectionsPopover(null);
    }}
    onDelete={(connId) => handleDeleteConnection(connId)}
  />
)}
```

Update `onConnectionBadgeClick` in the renderNote function:
```javascript
onConnectionBadgeClick={(noteId, e) => {
  const rect = e?.target?.getBoundingClientRect();
  setConnectionsPopover({
    noteId,
    top: rect ? rect.bottom + 4 : 200,
    left: rect ? rect.left : 200,
  });
}}
```

**Step 4: Commit**

```
feat: add connections popover with grouped incoming/outgoing links
```

---

## Task 8: Install D3 force + Create GraphView component

**Files:**
- Install: `d3-force`, `d3-selection`, `d3-zoom`
- Create: `src/components/GraphView.jsx`
- Modify: `src/components/index.js`
- Modify: `src/screens/MainApp.jsx` (add 'graph' view mode)

**Step 1: Install D3 modules**

```bash
cd /Users/jacksonsweet/Projects/slate-web && npm install d3-force d3-selection d3-zoom
```

**Step 2: Create GraphView component**

Create `src/components/GraphView.jsx` — a force-directed graph visualization using D3 rendered in a canvas/SVG. This is the largest new component:

Key features:
- SVG with D3 force simulation
- Nodes = notes (colored by page, sized by connection count)
- Edges = connections (colored by type)
- Zoom/pan via d3-zoom
- Click node to navigate
- Hover for preview tooltip
- Filter controls for connection type and page
- Responsive sizing

The component receives: `connections`, `notes`, `pages`, `onNavigate`, `onNoteClick`.

This is a substantial component (~200 lines). Create it with proper D3 force layout, link rendering, and interactive controls. Use `useRef` for the SVG element and `useEffect` for D3 setup.

**Step 3: Register as view mode**

In `src/components/index.js`, add:
```javascript
export { GraphView } from './GraphView.jsx';
```

In MainApp.jsx:
- Import `GraphView` from components
- Import `GitBranch` or `Network` from lucide-react for the icon
- Add `'graph'` to `viewModes` array (line 248)
- Add graph icon to the view mode picker (line 2662):
  ```javascript
  { m: 'graph', I: Network },
  ```
- Add the GraphView render block after the table view block (around line 3575):
  ```jsx
  {viewMode === 'graph' && (
    <GraphView
      connections={connections}
      notes={viewingPageLevel
        ? notes.filter(n => currentPageData?.sections.some(s => s.id === n.sectionId))
        : notes
      }
      pages={allPages}
      sections={allSections}
      onNavigate={(pageId, sectionId) => {
        setCurrentPage(pageId);
        setCurrentSection(sectionId);
        setViewingPageLevel(false);
        setViewMode('list');
      }}
    />
  )}
  ```

**Step 4: Commit**

```
feat: add global graph view with D3 force layout
```

---

## Task 9: AI connection suggestions — Popover adjacent to selected note

**Files:**
- Create: `src/components/AISuggestionsPopover.jsx`
- Modify: `src/screens/MainApp.jsx`

**Step 1: Create the AI suggestions popover**

Create `src/components/AISuggestionsPopover.jsx`:

This component:
- Receives a `noteId` and the note's position
- Calls the existing `match_notes()` RPC via Supabase to find semantically similar notes
- Shows 2-3 suggestions with accept/dismiss buttons
- On accept, calls `onCreateConnection`

The popover anchors adjacent to the note (right side or below depending on space).

**Step 2: Trigger the popover**

In MainApp.jsx, add a way to trigger AI suggestions. Option: Add a small "suggest connections" icon to NoteCard (visible on hover), or trigger when clicking the connection badge if count is 0.

Add state:
```javascript
const [aiSuggestionsNote, setAISuggestionsNote] = useState(null); // { noteId, top, left }
```

Wire into NoteCard as a new prop `onSuggestConnections`.

**Step 3: Commit**

```
feat: add AI-powered connection suggestions popover
```

---

## Task 10: Agent integration — Add connection functions to AI agent

**Files:**
- Modify: `api/agentDefinitions.js`
- Modify: `api/agentFunctions.js`

**Step 1: Add function definitions**

In `api/agentDefinitions.js`, add three new tool definitions:

```javascript
// ============ CONNECTION OPERATIONS ============
{
  type: 'function',
  function: {
    name: 'get_connected_notes',
    description: 'Get all notes connected to a specific note (both incoming and outgoing links)',
    parameters: {
      type: 'object',
      properties: {
        note_id: { type: 'string', description: 'The note ID to find connections for' },
      },
      required: ['note_id']
    }
  }
},
{
  type: 'function',
  function: {
    name: 'create_connection',
    description: 'Create a connection (link) between two notes. Use when the user says "connect", "link", or "relate" notes.',
    parameters: {
      type: 'object',
      properties: {
        source_note_id: { type: 'string', description: 'Source note ID' },
        target_note_id: { type: 'string', description: 'Target note ID' },
        connection_type: {
          type: 'string',
          description: 'Type of connection',
          enum: ['related', 'supports', 'contradicts', 'extends', 'source']
        },
        label: { type: 'string', description: 'Optional display label for the connection' },
      },
      required: ['source_note_id', 'target_note_id']
    }
  }
},
{
  type: 'function',
  function: {
    name: 'delete_connection',
    description: 'Delete a connection between two notes',
    parameters: {
      type: 'object',
      properties: {
        connection_id: { type: 'string', description: 'The connection ID to delete' },
      },
      required: ['connection_id']
    }
  }
},
```

**Step 2: Add function implementations**

In `api/agentFunctions.js`, add to the switch statement:

```javascript
// Connection Operations
case 'get_connected_notes':
  return await getConnectedNotes(supabase, userId, args);
case 'create_connection':
  return await createConnectionAgent(supabase, userId, args);
case 'delete_connection':
  return await deleteConnectionAgent(supabase, userId, args);
```

And implement the functions:

```javascript
async function getConnectedNotes(supabase, userId, { note_id }) {
  const { data, error } = await supabase.rpc('get_note_connections', { p_note_id: note_id });
  if (error) return { error: error.message };
  return { connections: data || [], count: data?.length || 0 };
}

async function createConnectionAgent(supabase, userId, { source_note_id, target_note_id, connection_type = 'related', label = null }) {
  const { data, error } = await supabase
    .from('note_connections')
    .insert({
      source_note_id,
      target_note_id,
      connection_type,
      label,
      created_by_user_id: userId,
    })
    .select()
    .single();

  if (error) return { error: error.message };
  return { success: true, connection_id: data.id };
}

async function deleteConnectionAgent(supabase, userId, { connection_id }) {
  const { error } = await supabase
    .from('note_connections')
    .delete()
    .eq('id', connection_id)
    .eq('created_by_user_id', userId);

  if (error) return { error: error.message };
  return { success: true };
}
```

**Step 3: Commit**

```
feat: add connection tools to AI agent
```

---

## Task 11: Integration testing + Polish

**Step 1: Manual testing checklist**

1. Create two notes, edit one to type `[[` — verify autocomplete shows
2. Select a note from autocomplete — verify wikilink chip renders
3. Click the wikilink chip — verify navigation to linked note
4. Verify connection count badge shows on both notes
5. Click the badge — verify connections popover with incoming/outgoing
6. Switch to graph view — verify nodes and edges render
7. Click a graph node — verify navigation
8. Test AI suggestions — verify match_notes returns results
9. Test agent commands: "connect note X to note Y"
10. Test delete connection from popover

**Step 2: Commit and deploy**

```
feat: note connections — complete feature with wikilinks, graph view, and AI suggestions
```

```bash
cd /Users/jacksonsweet/Projects/slate-web && git push origin main
```
