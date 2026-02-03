# Scratchpad Changelog

All notable changes to this project will be documented in this file.

---

## [5.2.0] - 2025-02-02

### Chat UX Improvements & Agent Enhancements

Major improvements to the chat interface and agent behavior.

#### Floating Chat Panel
- Chat panel is now a floating window with rounded corners and shadow
- Can be minimized to just the input field with minimize button
- Maximize button appears when minimized to expand back
- Drag handle to resize height

#### Input Improvements
- **Instant typing** - Input is no longer disabled while processing; type your next command immediately
- **Command history** - Use Up/Down arrows to cycle through previous inputs (like terminal)
- Placeholder shows "Processing... (type next command)" when agent is working

#### Compact Mode
- New COMPACT button in toolbar hides note details (tags, dates, avatars)
- Makes it easy to select and copy just note text without metadata

#### Default Sort: Incomplete First
- Notes now default to sorting incomplete items first
- New "Incomplete first" option in sort menu
- Completed notes appear after incomplete ones

#### Quick Note Shortcut
- Start message with hyphen (-) to quickly create a note
- Example: "- call mom tomorrow" creates a note immediately
- Auto-tagging still applies

#### Auto-Tagging
- Agent now automatically tags all new notes
- Checks existing tags first for consistency
- Smart categorization based on content

#### Clickable Navigation in Chat
- When agent creates a note, response includes clickable link to navigate there
- "Go to PAGE/SECTION" button appears below agent responses
- Clickable "Open view" button for custom views

#### Files Changed
- **src/components/ChatPanel.jsx** - Floating panel, minimize, history, instant input
- **src/components/NoteCard.jsx** - Compact mode support
- **src/screens/MainApp.jsx** - Compact mode, status sort, navigation handlers
- **api/agent.js** - Quick note shortcut, auto-tagging instructions

---

## [5.1.0] - 2025-02-02

### Agent Custom Views & Rich Text Support

Added the ability for the agent to create custom filtered views and display rich text in chat.

#### Custom Views Feature
- **`create_custom_view`** function allows agent to build dynamic views
- Users can say "show me all bug notes" and agent creates a filtered view
- Three view modes: list, boxes, calendar
- Grouping options: section, page, tag, month, week, day, completed
- Views are parameterized - they update automatically as notes are added
- Header shows "AGENT / VIEW TITLE" with note count and filter criteria
- X button to close agent view and return to normal navigation

#### View Types
- **List view** - Shows notes with their page/section breadcrumb
- **Boxes view** - Groups notes in boxes by the specified groupBy field
- **Calendar view** - Shows notes on a calendar (uses existing CalendarView)

#### Rich Text in Chat
- **MarkdownText component** - Renders markdown in agent responses
- Supports: headers (#, ##, ###), bold (**text**), inline `code`, bullet lists, numbered lists
- Agent can use formatting to structure responses better
- Brighter text color for improved legibility

#### Navigation Fixes
- Agent can now navigate to pages when user says "go to X"
- Navigation clears any active agent view
- View mode toggle works with agent views (changes agent view type)

#### Mobile Support
- MobileHeader updated to show agent view title
- Close button in mobile header to dismiss agent view

#### Files Changed
- **src/screens/MainApp.jsx** - Added agentView state, filtering, rendering
- **src/components/MarkdownText.jsx** - New markdown renderer
- **src/components/MobileHeader.jsx** - Agent view support
- **src/components/ChatPanel.jsx** - Uses MarkdownText for messages
- **api/agentDefinitions.js** - Added create_custom_view function
- **api/agent.js** - Added custom view handling in frontend actions
- **src/styles/theme.js** - Brighter textSecondary color

---

## [5.0.0] - 2025-02-02

### Complete Agent Architecture Rewrite

Replaced the old parse-based agent with a proper OpenAI Function Calling architecture.

#### New Architecture
- **`/api/agent.js`** - Main endpoint with iterative function calling loop
- **`/api/agentDefinitions.js`** - 24 OpenAI function definitions
- **`/api/agentFunctions.js`** - Server-side Supabase operations

#### Key Improvements
- **On-demand data fetching** - Agent queries only what it needs instead of receiving all data
- **OpenAI Function Calling** - Intelligent routing via tools API
- **Server-side operations** - All database operations happen server-side with service role key
- **Simpler response types** - `response`, `clarification`, `confirmation`
- **Smart search** - Fuzzy matching for tags, semantic interpretation of queries

#### Agent Capabilities
- Query pages, sections, notes with filters
- Create, update, delete pages/sections/notes
- Bulk operations (tag, move, complete, delete)
- Navigation and filtering commands
- Confirmation for destructive actions
- Clarification when requests are ambiguous

#### Environment Variables
- Added `SUPABASE_SERVICE_ROLE_KEY` - Required for server-side database access

---

## [4.0.2] - 2025-02-02

### Enhanced Bulk Operations & Data Manipulation

Added comprehensive bulk operation support so the agent can handle any data manipulation request.

#### New Bulk Operations
- **move_to_section** - Move notes matching a filter to a different section
- **bulk_add_tag** - Add tag to notes matching content keywords (for plan mode)
- **bulk_remove_tag** - Remove tag from matching notes
- **bulk_mark_complete/incomplete** - Change completion status in bulk

#### New Filter Options
- `untagged: true` - Match notes with no tags
- `contentContains: ["keyword1", "keyword2"]` - Match notes containing keywords

#### Auto-Tag Review Feature
Agent can now respond to "review and tag all notes" with a plan:
- Creates groups for each tag category (website, bug, marketing, etc.)
- Each group applies tags to notes containing relevant keywords
- User can approve/skip each category

#### Tag Priority System
1. Check existing tags first - prefer reusing for consistency
2. Extract explicit hashtags from user input
3. Auto-tag based on content keywords
4. Create new tags when content has a clear uncovered category

#### Files Changed
- **api/parse.js** - Added bulk operation formats, filter options, auto-tag review guidance
- **src/lib/bulkOperations.js** - Added `untagged` and `contentContains` filters
- **src/lib/planExecutor.js** - Added bulk operation execution functions

---

## [4.0.1] - 2025-02-02

### Bug Fix: Agent Not Tagging Notes

Fixed issue where the AI agent was not applying tags to notes.

#### Changes
- **api/parse.js**: Updated LLM prompt with explicit tagging instructions
  - Added `create_note` action format with required `tags` field
  - Expanded auto-tag keyword mappings
  - Made tagging rules more prominent
  - Emphasized tags array must always be included

---

## [4.0.0] - 2025-02-02

### Phase 4: Mobile Optimization - COMPLETE

Mobile-first experience with PWA support, voice input, and touch gestures.

#### PWA Setup
- **Service Worker** (`public/service-worker.js`) - Network-first caching with offline fallback
- **Web App Manifest** (`public/manifest.json`) - Installable app with standalone display
- **Meta tags** - Apple mobile web app support, theme color, viewport optimization
- **Service worker registration** in `src/index.jsx`
- **Offline mode verified working**

#### Responsive Hooks (`src/hooks/useMediaQuery.js`)
- `useMediaQuery` - Detects screen size (mobile <768px, tablet 768-1024px, desktop >1024px)
- `useKeyboardVisible` - Detects virtual keyboard presence
- `useOnlineStatus` - Tracks online/offline state

#### Mobile Components
- **MobileSidebar** (`src/components/MobileSidebar.jsx`)
  - Full-screen slide-in drawer (100vw)
  - Collapsible pages with expandable sections
  - Swipe gesture to close
  - Edge swipe detection to open (20px from left)
  - User profile display in footer
  - "All sections" option when page expanded
- **MobileHeader** (`src/components/MobileHeader.jsx`)
  - 56px header with hamburger menu
  - Breadcrumb navigation (Page / Section)
  - Ellipsis menu with Rename, Share, Star options
  - Touch-optimized with `touchAction: manipulation`
  - Safe area insets for notched devices
- **MobileNoteCard** (`src/components/MobileNoteCard.jsx`)
  - 44px touch targets
  - Swipe-left to reveal delete button (80px threshold)
  - 500ms long-press for context menu
  - 16px font size prevents iOS auto-zoom
- **VoiceInput** (`src/components/VoiceInput.jsx`)
  - Web Speech API integration
  - Large 52px button with primary gold color
  - Audio visualization with pulsing ring
  - Live transcript preview above button
  - Shadow and visual prominence for easy access

#### Offline Support (`src/lib/offlineHandler.js`)
- Operation queue for offline mode
- Automatic sync when back online
- Fallback parser for critical operations
- LocalStorage persistence

#### ChatPanel Mobile Enhancements
- **No collapsed state** - minimum height shows input bar (100px)
- Mobile snap heights: 100px (input only) → 250px → 400px → 80vh
- Larger drag handle (48x5px) with 44px touch target
- Auto-expands to 250px when first message sent
- Voice input button integrated in input area
- Safe area padding for bottom toolbar

#### MainApp Mobile Integration
- Conditional rendering: desktop sidebar vs mobile drawer
- Toolbar hidden on mobile (MobileHeader replaces)
- Page title header hidden on mobile (shown in MobileHeader instead)
- Bottom padding accounts for Safari toolbar: `calc(180px + env(safe-area-inset-bottom))`
- Mobile context menu for header actions (Rename, Share, Star)
- Offline status banner
- Pending sync count display

#### App Icons
- SVG icons at 192x192 and 512x512
- Branded "S" logo with #d1b18f accent on #000 background

---

### Files Changed

#### New Files
- `public/service-worker.js` - PWA caching
- `public/manifest.json` - PWA manifest
- `public/icon-192.svg` - App icon
- `public/icon-512.svg` - App icon large
- `src/hooks/useMediaQuery.js` - Responsive hooks
- `src/lib/offlineHandler.js` - Offline queue
- `src/components/MobileSidebar.jsx` - Full-screen mobile drawer with collapsible navigation
- `src/components/MobileHeader.jsx` - Mobile header with touch-optimized menu
- `src/components/MobileNoteCard.jsx` - Touch-friendly cards
- `src/components/VoiceInput.jsx` - Voice transcription with visualization

#### Modified Files
- `index.html` - PWA meta tags, viewport, safe area styles
- `src/index.jsx` - Service worker registration
- `src/components/ChatPanel.jsx` - Mobile heights, voice input, larger drag handle
- `src/screens/MainApp.jsx` - Mobile layout, responsive rendering, Safari padding

---

### Testing Completed

- [x] Build succeeds without errors
- [x] Deploys to Vercel
- [x] Mobile sidebar opens/closes
- [x] Collapsible page/section navigation
- [x] Voice input button visible and accessible
- [x] Offline mode works
- [x] Bottom padding correct for Safari toolbar
- [x] Ellipsis menu functional on touch
- [x] Chat box minimum height shows input bar
- [x] No redundant page titles on mobile

---

## [3.0.0] - 2025-01-31

### Phase 3: Conversational Command Center - COMPLETE

Major release transforming Scratchpad into an AI-powered command center with natural language control and intelligent memory.

#### Chat Panel (Task 3A)
- **Resizable chat panel** replaces floating input box
- Drag handle at top edge for manual resizing (60px - 600px)
- Auto-expands from collapsed (60px) to expanded (160px) on first message
- Snaps to common sizes on release (60px, 160px, 300px, 600px)
- Scrollable message history with fade gradient at top
- Persists across page navigation

#### Chat State Management (Task 3B)
- `useChatState` hook for managing conversation flow
- Message types: user, agent, system
- Support for confirmations, clarifications, and plan mode
- Auto-compacting at 100 messages
- Recent context retrieval for agent

#### View Controller (Task 3C)
- `executeViewChanges` function for agent-commanded view manipulation
- Action types: navigate, apply_filter, clear_filter, switch_view, sort
- Intelligent filter context management (replace, merge, clear)

#### Enhanced Agent (Task 3D)
- Six response types:
  - `text_response` - Answer questions without changing view
  - `view_change` - Navigate, filter, switch view modes
  - `clarification` - Ask for disambiguation
  - `bulk_confirmation` - Confirm before bulk operations
  - `plan_proposal` - Multi-step progressive confirmation
  - `execution_result` - Confirm completed actions
- Context-aware decision making
- Integrated with Phase 2 plan mode

#### MainApp Integration (Task 3E)
- Chat panel integrated as primary input interface
- Plan mode moved from right sidebar into chat panel
- Plan progress visualization at top of chat
- Inline Yes/Revise/Skip/Cancel buttons
- Keyboard shortcuts preserved

#### Bulk Operations (Task 3F)
- `bulkOperations.js` library for batch note modifications
- Operations: mark_complete, mark_incomplete, delete, add_tag, remove_tag, move_to_section
- Filter-based targeting (tags, completion status, date, creator)

---

### Additional Features Implemented

#### Plan Mode Enhancements
- **Revise mode with text input** - Click Revise, type changes, submit
- **Plan step completion tracking** - Uses `planState.results.length` for accurate progress
- **Page/section deletion** - Routed through plan mode for safety
- Each deletion is a separate group for granular control

#### State Management Fixes
- Fixed `setPages` vs `setOwnedPages` mismatch causing changes to not appear until reload
- Synchronized local and global state for plan view persistence
- Fixed second/consecutive plan mode uses showing incorrect completion states

#### UI Enhancements
- **Typewriter animation** for newly created pages/sections
- **API error badge** - Red badge appears when fallback parser is used (API failure)
- Badge positioned on right side of chat response

#### Tagging Improvements
- Extract explicit hashtags from content (#marketing)
- Auto-tag based on keywords (website, bug, urgent, idea)
- Remove hashtags from content after extraction

---

### RAG (Retrieval Augmented Generation) System

#### Database Schema (Migration 005)
- Enabled pgvector extension in Supabase
- Added `embedding` column to notes table (1536-dimension vectors)
- Created `chat_history` table for persistent conversation memory
- Indexes for fast similarity search (ivfflat with cosine distance)

#### Supabase Functions
- `match_notes` - Semantic search across notes with similarity threshold
- `match_chat_history` - Search past conversations
- `get_database_context` - Returns full database overview (pages, sections, tags, stats)
- All functions respect RLS and filter by user ID

#### API Endpoints
- `POST /api/parse` - Updated with RAG integration (replaced Mem0)
- `POST /api/embeddings` - New endpoint for embedding operations:
  - `generate` - Generate embedding for text
  - `embed_note` - Generate and store embedding for a note
  - `search_notes` - Semantic search across notes
  - `search_chat` - Semantic search across chat history
  - `store_chat` - Store chat message with embedding
  - `get_context` - Get database context
- `POST /api/backfill-embeddings` - Batch process existing notes

#### Automatic Embedding Generation
- Notes automatically embedded when created or updated
- `storage.js` detects content changes and triggers embedding
- `planExecutor.js` embeds notes created via plan mode
- Non-blocking async operation

#### Intelligent Context Retrieval
- Parallel retrieval: notes + chat history + database context
- Only relevant context sent to LLM (token efficient)
- Semantic similarity threshold: 0.4 for notes, 0.5 for chat
- Top 5 results from each source

---

### Files Changed

#### New Files
- `src/components/ChatPanel.jsx` - Resizable chat panel component
- `src/hooks/useChatState.js` - Chat state management
- `src/hooks/usePlanState.js` - Plan mode state management
- `src/lib/viewController.js` - View change execution
- `src/lib/bulkOperations.js` - Bulk note operations
- `src/lib/planExecutor.js` - Plan action execution
- `api/embeddings.js` - Embedding management endpoint
- `api/backfill-embeddings.js` - Backfill utility
- `supabase/migrations/005_rag_vector_support.sql` - Vector search schema

#### Modified Files
- `api/parse.js` - Complete rewrite with RAG and enhanced response types
- `src/screens/MainApp.jsx` - Chat panel integration, state fixes, animations
- `src/lib/storage.js` - Auto-embedding on note save
- `src/lib/agent.js` - Fallback flags for API errors
- `vercel.json` - Fixed rewrites to not override `/api/*` routes
- `.env.example` - Added MEM0_API_KEY (deprecated), documented env vars

---

### Configuration

#### Environment Variables
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
OPENAI_API_KEY=sk-your-key (server-side only)
```

#### Database Migration Required
Run `supabase/migrations/005_rag_vector_support.sql` in Supabase SQL Editor to enable:
- pgvector extension
- Note embeddings
- Chat history table
- Semantic search functions

---

### Testing Completed

- [x] Chat panel auto-expand and resize
- [x] Text responses (stats, analytics)
- [x] View changes (navigate, filter, view modes)
- [x] Clarification dialogs
- [x] Bulk operations with confirmation
- [x] Plan mode in chat panel
- [x] Revise/Skip/Cancel functionality
- [x] RAG semantic search
- [x] Conversation memory persistence
- [x] API error fallback badge
- [x] Typewriter animations

---

### Known Issues
- None currently reported

---

### Deployment
- Production: https://scratchpad.opsapp.co
- Hosting: Vercel
- Database: Supabase (PostgreSQL + pgvector)
- AI: OpenAI GPT-4o + text-embedding-3-small

---

## [2.0.0] - Previous Release

### Phase 2: Multi-Step Parsing with Progressive Confirmation
- Plan mode for multi-step operations
- Group-based progressive confirmation
- Plan proposal and execution flow

---

## [1.0.0] - Initial Release

### Phase 1: Multi-User Collaboration
- Supabase authentication
- Page sharing with permissions
- Team roles (owner, team-admin, team, team-limited)
- Real-time collaboration
