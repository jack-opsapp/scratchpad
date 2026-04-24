# Slate Bugs & Features Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix 2 agent bugs, implement 7 web UI features, and fix 2 chrome extension issues.

**Architecture:** All changes are in the existing Vite + React SPA. Agent bugs are server-side in `/api/agentFunctions.js`. UI features are client-side in `MainApp.jsx`, `ChatPanel.jsx`, and `NoteCard.jsx`. Chrome extension is standalone in `/extension/`.

**Tech Stack:** React, Supabase, Vite, Lucide icons, OpenAI function calling

---

## Group A: Agent Bugs

### Task 1: Fix note creation overwriting other notes

The agent's `bulkOperations.js` and `planExecutor.js` handle note creation. The `dataStore.saveAll()` in MainApp.jsx (line 422) runs on a 1500ms debounce and calls `dataStore.setNotes()` which does a full upsert. If a note is created by the agent server-side but the client's debounced save fires with stale state, it can overwrite/delete notes.

**Files:**
- Modify: `src/screens/MainApp.jsx:418-426` (debounced save)
- Modify: `src/lib/storage.js` (saveAll/setNotes)

**Step 1:** In `MainApp.jsx`, change the debounced save to NOT save notes (since notes are already persisted directly to Supabase on create/toggle/edit/delete). Only save pages, tags, and boxConfigs in the debounce.

```javascript
// Line 418-426: Change from saving everything to only saving non-note data
useEffect(() => {
  if (!loading) {
    const timer = setTimeout(() => {
      dataStore.saveAll({ pages, tags, boxConfigs });
    }, 1500);
    return () => clearTimeout(timer);
  }
}, [pages, tags, boxConfigs, loading]);
```

**Step 2:** Verify that all note mutations (create, toggle, edit, delete) already persist directly to Supabase. Check:
- `addNote()` (line 881-890) - already does `supabase.from('notes').upsert()`
- `handleNoteToggle()` (line 1131) - check if it persists directly
- `handleNoteEdit()` - check if it persists directly
- `handleNoteDelete()` - check if it persists directly

If any note mutation does NOT persist directly, add the direct Supabase call.

**Step 3:** In `storage.js`, update `saveAll()` to skip notes when not passed:
```javascript
async saveAll({ pages, tags, notes, boxConfigs }) {
  if (pages) await this.setPages(pages);
  if (tags) await this.setTags(tags);
  if (notes) await this.setNotes(notes);  // Only if explicitly passed
  if (boxConfigs) await this.setBoxConfigs(boxConfigs);
}
```

**Step 4:** Commit.

---

### Task 2: Fix agent bulk operations partially executing

The agent's bulk operations in `agentFunctions.js` loop through notes and continue on error. The issue is likely that the filter logic returns more notes than expected, or the update loop has race conditions.

**Files:**
- Modify: `api/agentFunctions.js` (bulkUpdateNotes function)
- Modify: `src/lib/bulkOperations.js`

**Step 1:** Read `agentFunctions.js` lines 652-757 and `bulkOperations.js` fully. Identify:
- How notes are filtered for bulk operations
- Whether updates are sequential or parallel
- Whether the count reported matches actual updates

**Step 2:** If updates are parallel (Promise.all), change to sequential to avoid race conditions:
```javascript
// Instead of Promise.all, process sequentially
for (const note of matchingNotes) {
  const { error } = await supabase.from('notes').update(updates).eq('id', note.id);
  if (error) { failCount++; } else { successCount++; }
}
```

**Step 3:** Ensure the response includes accurate counts:
```javascript
return { success: true, updated: successCount, failed: failCount, total: matchingNotes.length };
```

**Step 4:** Commit.

---

## Group B: Web UI Features

### Task 3: Fix rename inline in page title and drawer

Rename already works in the sidebar (lines 1758-1784 for pages, 1855-1879 for sections). The bug is that changes are only saved to local state — not persisted to Supabase. Also, the header title area doesn't support inline editing.

**Files:**
- Modify: `src/screens/MainApp.jsx` — sidebar rename onBlur handlers, header title area

**Step 1:** Add Supabase persistence to page rename onBlur (around line 1771):
```javascript
onBlur={() => {
  const updatedName = pages.find(p => p.id === page.id)?.name;
  if (updatedName) {
    supabase.from('pages').update({ name: updatedName }).eq('id', page.id);
  }
  setEditingItem(null);
}}
```

**Step 2:** Add same for section rename onBlur (around line 1876):
```javascript
onBlur={() => {
  const pg = pages.find(p => p.id === page.id);
  const sec = pg?.sections?.find(s => s.id === section.id);
  if (sec?.name) {
    supabase.from('sections').update({ name: sec.name }).eq('id', section.id);
  }
  setEditingItem(null);
}}
```

**Step 3:** Make the header page/section title clickable to enter edit mode. Find the header title display (around line 2830-2860) and wrap it similar to the sidebar pattern — show an input when `editingItem` matches.

**Step 4:** Commit.

---

### Task 4: Fix page creation/deletion not updating until reload

When the agent creates a page server-side, the client doesn't refresh its page list. The `handleSubmit` function (line 769) calls `callAgent()` but only handles note creation in the response — not page/section creation done by agent functions.

**Files:**
- Modify: `src/screens/MainApp.jsx` — after agent response, refresh data
- Modify: `src/lib/agent.js` — return flags for data mutations

**Step 1:** In the agent response handler (`handleSubmit`, line 793-830), after the switch statement completes, call `refreshData()` to pick up any server-side changes:
```javascript
// After the switch block, always refresh if agent may have mutated data
if (result.type === 'single_action' || result.type === 'plan_proposal') {
  // Debounce to let Supabase settle
  setTimeout(() => refreshData(), 500);
}
```

**Step 2:** Also refresh after plan execution completes (around line 944-970).

**Step 3:** Commit.

---

### Task 5: Add + icon to manually add tags on notes

**Files:**
- Modify: `src/components/NoteCard.jsx:165-191` — tag display area

**Step 1:** Add a `+` button after the tags list. Add an `onAddTag` prop.

```jsx
// After the tags map (line 178), add:
{canEdit && !compact && (
  <button
    onClick={(e) => {
      e.stopPropagation();
      onAddTag?.(note.id);
    }}
    style={{
      width: 20, height: 20,
      border: `1px dashed ${colors.border}`,
      background: 'transparent',
      color: colors.textMuted,
      fontSize: 12,
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}
    title="Add tag"
  >
    +
  </button>
)}
```

**Step 2:** In `MainApp.jsx`, implement the `onAddTag` handler — show a small inline input or popover for entering a tag name. On submit, update the note's tags array and persist to Supabase.

**Step 3:** Commit.

---

### Task 6: Double-tap ESC to clear chat input

**Files:**
- Modify: `src/components/ChatPanel.jsx:345-352` — ESC handler

**Step 1:** Add a `lastEscTime` ref and double-tap detection:

```jsx
const lastEscTime = useRef(0);

// In the Escape handler (line 345):
} else if (e.key === 'Escape') {
  e.preventDefault();
  const now = Date.now();
  if (now - lastEscTime.current < 400) {
    // Double-tap ESC: clear chat input
    setInputValue('');
    lastEscTime.current = 0;
  } else if (planState?.isReviewing) {
    handlePlanAction('cancel');
    lastEscTime.current = now;
  } else if (pendingMessage?.type === 'group_confirmation') {
    onUserResponse('cancel', pendingMessageIndex);
    lastEscTime.current = now;
  } else {
    lastEscTime.current = now;
  }
}
```

**Step 2:** Commit.

---

### Task 7: Store page and section in URL path

URL sync already exists (MainApp.jsx lines 393-406) using query params (`?page=X&section=Y`). The routes are also defined in App.jsx (lines 102-103) for `/p/:pageId/s/:sectionId`. But they're not wired together.

**Files:**
- Modify: `src/screens/MainApp.jsx:393-406` — URL sync effect
- Modify: `src/screens/MainApp.jsx:356-386` — URL reading on load
- Modify: `src/App.jsx:102-104` — pass URL params to MainApp

**Step 1:** Change URL sync to use path-based routing instead of query params:
```javascript
useEffect(() => {
  if (loading) return;
  let path = '/';
  if (currentPage) {
    path = `/p/${currentPage}`;
    if (currentSection && !viewingPageLevel) {
      path += `/s/${currentSection}`;
    }
  }
  window.history.replaceState(null, '', path);
}, [currentPage, currentSection, viewingPageLevel, loading]);
```

**Step 2:** In App.jsx, pass `useParams()` values into MainApp via the Slate component, or read from `window.location.pathname` on mount in MainApp.

**Step 3:** Update the initial load (lines 356-386) to parse path params instead of query params:
```javascript
const pathMatch = window.location.pathname.match(/\/p\/([^/]+)(?:\/s\/([^/]+))?/);
const urlPageId = pathMatch?.[1];
const urlSectionId = pathMatch?.[2];
```

**Step 4:** Commit.

---

### Task 8: Add complete-all button in header

**Files:**
- Modify: `src/screens/MainApp.jsx` — header area (around line 2830)
- Modify: `src/components/MobileHeader.jsx` — mobile header

**Step 1:** Add a "Complete All" button in the header bar, next to the existing action buttons. Only show when viewing a section with incomplete notes:

```jsx
{currentSection && !viewingPageLevel && currentSectionNotes.some(n => !n.completed) && (
  <button
    onClick={handleCompleteAll}
    title="Complete all notes in this section"
    style={{
      background: 'transparent',
      border: `1px solid ${colors.border}`,
      color: colors.textMuted,
      cursor: 'pointer',
      padding: '4px 8px',
      fontSize: 11,
      display: 'flex',
      alignItems: 'center',
      gap: 4,
    }}
  >
    <Check size={12} /> All
  </button>
)}
```

**Step 2:** Implement `handleCompleteAll`:
```javascript
const handleCompleteAll = async () => {
  const incomplete = currentSectionNotes.filter(n => !n.completed);
  const ids = incomplete.map(n => n.id);

  // Optimistic update
  setNotes(prev => prev.map(n =>
    ids.includes(n.id) ? { ...n, completed: true, completed_at: new Date().toISOString() } : n
  ));

  // Persist to Supabase
  const { error } = await supabase.from('notes')
    .update({ completed: true, completed_at: new Date().toISOString() })
    .in('id', ids);

  if (error) {
    console.error('Complete all failed:', error);
    refreshData(); // Rollback by refreshing
  }
};
```

**Step 3:** Add same button to MobileHeader.

**Step 4:** Commit.

---

### Task 9: Agent cut-off detection

When the user sends a long message that might be truncated (mobile voice input, paste), the agent should ask if the full note was captured before posting.

**Files:**
- Modify: `api/agent.js` — note creation detection logic

**Step 1:** In `agent.js`, after detecting the message looks like a note (around line 427-449), check for truncation indicators:
- Message ends mid-word or mid-sentence (no terminal punctuation)
- Message is very long (>500 chars) and ends abruptly

```javascript
// After expectsNoteCreation is set to true:
const possiblyTruncated = expectsNoteCreation &&
  message.length > 200 &&
  !message.match(/[.!?)\]"']$/);

if (possiblyTruncated) {
  // Add instruction to agent to ask for confirmation
  systemPromptAddition = "The user's message appears to be cut off. Before creating the note, ask the user: 'It looks like your note may have been cut off. Should I save it as-is, or would you like to finish it?'";
}
```

**Step 2:** Commit.

---

## Group C: Chrome Extension

### Task 10: Chrome extension ultrathin material background

**Files:**
- Modify: `extension/popup.html` — body background style

**Step 1:** Change the body background from solid `#000000` to a translucent material effect:

```css
body {
  width: 360px;
  background: rgba(0, 0, 0, 0.75);
  -webkit-backdrop-filter: blur(40px) saturate(180%);
  backdrop-filter: blur(40px) saturate(180%);
  color: #e8e8e8;
  font-family: 'Inter', 'Helvetica Now', 'Helvetica Neue', Arial, sans-serif;
  font-size: 13px;
}
```

Note: Chrome extension popups may not support backdrop-filter. If not, use a semi-transparent dark background as fallback.

**Step 2:** Commit.

---

### Task 11: Fix chrome extension login

**Files:**
- Modify: `extension/popup.html` — sign-in UI
- Modify: `extension/popup.js` — auth flow
- Modify: `extension/background.js` — Google OAuth

**Step 1:** Read `extension/background.js` and `extension/popup.js` fully to understand the current auth flow and identify why login fails.

**Step 2:** Ensure the Google OAuth flow uses the correct redirect URL for the extension. Chrome extensions need `chrome.identity.launchWebAuthFlow()` with the extension's redirect URL, not a web redirect.

**Step 3:** Verify the Supabase client in `extension/supabase.js` has the correct project URL and anon key.

**Step 4:** Test the login flow, fix any issues found.

**Step 5:** Commit.

---

## Execution Order

1. Task 1 (note overwrite bug) — highest impact, data loss prevention
2. Task 2 (bulk ops bug) — agent reliability
3. Task 4 (page creation not updating) — closely related to Task 1
4. Task 3 (rename persistence) — quick fix
5. Task 7 (URL path routing) — improves UX significantly
6. Task 6 (double-tap ESC) — quick keyboard feature
7. Task 8 (complete-all button) — quick UI addition
8. Task 5 (add tag icon) — UI enhancement
9. Task 9 (cut-off detection) — agent polish
10. Task 10 (extension background) — CSS change
11. Task 11 (extension login) — needs investigation
