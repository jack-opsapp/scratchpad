/**
 * Serverless API route for OpenAI note parsing with full agent capabilities
 * Supports: text responses, view changes, clarifications, bulk ops, plan mode
 * Uses RAG (Retrieval Augmented Generation) for intelligent context retrieval
 */

const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const EMBEDDING_ENDPOINT = 'https://api.openai.com/v1/embeddings';
const MODEL = 'gpt-4o-2024-11-20';
const EMBEDDING_MODEL = 'text-embedding-3-small';
const MAX_TOKENS = 2000;

/**
 * Generate embedding for text using OpenAI
 */
async function generateEmbedding(text, apiKey) {
  try {
    const response = await fetch(EMBEDDING_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: text,
      }),
    });

    if (!response.ok) {
      console.error('Embedding generation failed:', response.status);
      return null;
    }

    const data = await response.json();
    return data.data[0].embedding;
  } catch (error) {
    console.error('Embedding generation error:', error);
    return null;
  }
}

/**
 * Call Supabase RPC function
 */
async function callSupabaseRpc(functionName, params, supabaseUrl, supabaseKey) {
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${functionName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      console.error(`Supabase RPC ${functionName} failed:`, response.status);
      return null;
    }

    return response.json();
  } catch (error) {
    console.error(`Supabase RPC ${functionName} error:`, error);
    return null;
  }
}

/**
 * Insert into Supabase table
 */
async function supabaseInsert(table, data, supabaseUrl, supabaseKey) {
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/${table}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      console.error(`Supabase insert to ${table} failed:`, response.status);
      return false;
    }

    return true;
  } catch (error) {
    console.error(`Supabase insert error:`, error);
    return false;
  }
}

/**
 * Search for relevant notes using vector similarity
 */
async function searchRelevantNotes(embedding, userId, supabaseUrl, supabaseKey) {
  if (!embedding) return [];

  const results = await callSupabaseRpc('match_notes', {
    query_embedding: embedding,
    match_threshold: 0.4,
    match_count: 5,
    p_user_id: userId,
  }, supabaseUrl, supabaseKey);

  return results || [];
}

/**
 * Search for relevant chat history using vector similarity
 */
async function searchChatHistory(embedding, userId, supabaseUrl, supabaseKey) {
  if (!embedding) return [];

  const results = await callSupabaseRpc('match_chat_history', {
    query_embedding: embedding,
    match_threshold: 0.5,
    match_count: 5,
    p_user_id: userId,
  }, supabaseUrl, supabaseKey);

  return results || [];
}

/**
 * Get database context (pages, sections, stats)
 */
async function getDatabaseContext(userId, supabaseUrl, supabaseKey) {
  const result = await callSupabaseRpc('get_database_context', {
    p_user_id: userId,
  }, supabaseUrl, supabaseKey);

  return result;
}

/**
 * Store chat message with embedding for future retrieval
 */
async function storeChatMessage(userId, role, content, embedding, metadata, supabaseUrl, supabaseKey) {
  if (!userId) return;

  await supabaseInsert('chat_history', {
    user_id: userId,
    role,
    content,
    embedding,
    metadata,
  }, supabaseUrl, supabaseKey);
}

/**
 * Build RAG context from retrieved data
 */
function buildRagContext(relevantNotes, chatHistory, dbContext) {
  let context = '';

  // Add database structure context
  if (dbContext) {
    const pages = dbContext.pages || [];
    const tags = dbContext.allTags || [];
    const stats = dbContext.stats || {};

    context += `\nDATABASE OVERVIEW:`;
    context += `\n- Total notes: ${stats.totalNotes || 0}`;
    context += `\n- Completed notes: ${stats.completedNotes || 0}`;
    context += `\n- Pages: ${pages.map(p => p.name).join(', ') || 'None'}`;
    context += `\n- All tags in use: ${tags.join(', ') || 'None'}`;

    // Add sections per page
    if (pages.length > 0) {
      context += `\n\nPAGE STRUCTURE:`;
      pages.forEach(p => {
        const sections = p.sections || [];
        context += `\n- ${p.name}: ${sections.map(s => `${s.name} (${s.noteCount} notes)`).join(', ') || 'No sections'}`;
      });
    }
  }

  // Add relevant notes from vector search
  if (relevantNotes && relevantNotes.length > 0) {
    context += `\n\nRELEVANT NOTES (from semantic search):`;
    relevantNotes.forEach(note => {
      const tags = note.tags?.length > 0 ? ` [${note.tags.join(', ')}]` : '';
      const status = note.completed ? ' (completed)' : '';
      context += `\n- "${note.content}"${tags}${status} in ${note.page_name}/${note.section_name}`;
    });
  }

  // Add relevant chat history
  if (chatHistory && chatHistory.length > 0) {
    context += `\n\nRELEVANT PAST CONVERSATIONS:`;
    chatHistory.forEach(msg => {
      const role = msg.role === 'user' ? 'User' : 'Assistant';
      // Truncate long messages
      const content = msg.content.length > 150 ? msg.content.substring(0, 150) + '...' : msg.content;
      context += `\n- ${role}: ${content}`;
    });
  }

  return context;
}

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Check for API keys
  const apiKey = process.env.OPENAI_API_KEY;
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

  if (!apiKey) {
    console.error('OPENAI_API_KEY not configured');
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    const { input, context, planState } = req.body;

    if (!input) {
      return res.status(400).json({ error: 'Missing input' });
    }

    // Get user ID for RAG
    const userId = context?.userId || null;

    // RAG: Generate embedding for the user query
    let embedding = null;
    let relevantNotes = [];
    let chatHistory = [];
    let dbContext = null;

    if (supabaseUrl && supabaseKey && userId) {
      // Generate embedding for semantic search
      embedding = await generateEmbedding(input, apiKey);

      // Parallel RAG retrieval
      const [notes, history, dbCtx] = await Promise.all([
        searchRelevantNotes(embedding, userId, supabaseUrl, supabaseKey),
        searchChatHistory(embedding, userId, supabaseUrl, supabaseKey),
        getDatabaseContext(userId, supabaseUrl, supabaseKey),
      ]);

      relevantNotes = notes;
      chatHistory = history;
      dbContext = dbCtx;
    }

    // Build RAG context
    const ragContext = buildRagContext(relevantNotes, chatHistory, dbContext);

    // Build system prompt with RAG context
    const systemPrompt = buildSystemPrompt(context || {}, planState, input, ragContext);

    // Build messages array
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: input }
    ];

    // Call OpenAI
    const response = await fetch(OPENAI_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        response_format: { type: 'json_object' },
        messages,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('OpenAI API error:', errorData);
      return res.status(response.status).json({
        error: errorData.error?.message || 'OpenAI API error'
      });
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content;

    if (!text) {
      return res.status(500).json({ error: 'Empty response from OpenAI' });
    }

    // Parse and return
    const parsed = JSON.parse(text);

    // Store conversation in chat history for future RAG (async, don't wait)
    if (supabaseUrl && supabaseKey && userId) {
      const assistantSummary = parsed.message || parsed.response?.message || 'Action completed';

      // Store user message
      storeChatMessage(
        userId,
        'user',
        input,
        embedding,
        { type: 'query' },
        supabaseUrl,
        supabaseKey
      ).catch(() => {});

      // Generate embedding for assistant response and store
      generateEmbedding(assistantSummary, apiKey)
        .then(assistantEmbedding => {
          storeChatMessage(
            userId,
            'assistant',
            assistantSummary,
            assistantEmbedding,
            { type: parsed.type || 'response' },
            supabaseUrl,
            supabaseKey
          );
        })
        .catch(() => {});
    }

    return res.status(200).json(parsed);

  } catch (error) {
    console.error('Parse API error:', error);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * Build the system prompt with current context and plan state
 */
function buildSystemPrompt(context, planState, userInput, ragContext = '') {
  const pageList = context.pages?.map(p => p.name).join(', ') || 'None';
  const sectionList = context.pages
    ?.flatMap(p => p.sections?.map(s => `${p.name}/${s.name}`) || [])
    .join(', ') || 'None';
  const tagList = context.tags?.join(', ') || 'None';
  const currentFilters = JSON.stringify(context.currentFilters || {});
  const viewMode = context.viewMode || 'list';

  const baseContext = `
CURRENT VIEW CONTEXT:
- Pages: ${pageList}
- Sections: ${sectionList}
- Tags: ${tagList}
- Current location: ${context.currentPage || 'None'}/${context.currentSection || 'None'}
- Current filters: ${currentFilters}
- View mode: ${viewMode}
${ragContext}`;

  // PLAN MODE - Confirming specific groups
  if (planState && (planState.mode === 'planning' || planState.mode === 'confirming')) {
    const currentGroup = planState.plan?.groups[planState.currentGroupIndex];
    const progress = `${planState.currentGroupIndex + 1}/${planState.plan?.totalGroups}`;

    return `You are SCRATCHPAD's agent in PLAN MODE.

${baseContext}

PLAN CONTEXT:
- Total groups: ${planState.plan?.totalGroups}
- Current group index: ${planState.currentGroupIndex}
- Current group: ${JSON.stringify(currentGroup)}
- Progress: ${progress}
- Created so far: ${JSON.stringify(planState.context)}

INTERPRETING USER INPUT:
- "yes" or affirmative → Return the current group with full action details for execution
- "revise [changes]" → Modify current group and return updated details
- "skip" → Skip current group
- "cancel" → Cancel entire plan

RESPONSE FORMAT for "yes":
{
  "type": "group_confirmation",
  "group": ${JSON.stringify(currentGroup)},
  "message": "${currentGroup?.description}?",
  "progress": "${progress}"
}

RESPONSE FORMAT for "revise":
{
  "type": "group_confirmation",
  "group": {
    "id": "${currentGroup?.id}",
    "description": "Updated description",
    "actionCount": N,
    "actions": [/* Updated actions */],
    "preview": [...]
  },
  "message": "Updated: [describe changes]. Proceed?",
  "revised": true
}

RESPONSE FORMAT for "skip":
{
  "type": "skip_group",
  "groupId": "${currentGroup?.id}",
  "message": "Skipped. Moving to next group."
}

RESPONSE FORMAT for "cancel":
{
  "type": "cancel_plan",
  "message": "Plan cancelled.",
  "completedGroups": ${planState.currentGroupIndex}
}

Respond ONLY with valid JSON.`;
  }

  // NORMAL MODE - Full agent capabilities
  return `You are SCRATCHPAD's intelligent command center agent with full database access via RAG.

${baseContext}

You have access to the user's complete database through semantic search. Use the RELEVANT NOTES and DATABASE OVERVIEW above to provide accurate, context-aware responses.

You can respond in these ways:

1. TEXT_RESPONSE - Answer questions about notes, stats, analytics
   Use when: User asks for information without wanting to change the view
   Examples: "how many notes?", "what's my most used tag?", "show me stats", "what did I write about X?"
   Format:
   {
     "type": "text_response",
     "message": "You have 23 notes in Website section (8 completed, 15 active).",
     "data": {"total": 23, "completed": 8, "active": 15}
   }

2. VIEW_CHANGE - Navigate or change how content is displayed
   Use when: User wants to see specific content, navigate, filter, or change layout
   Examples: "show me website notes", "go to marketing", "show boxes view", "filter by incomplete"
   Format:
   {
     "type": "view_change",
     "message": "Showing Website section",
     "actions": [
       {"type": "navigate", "page": "OPS", "section": "Website"},
       {"type": "apply_filter", "filters": {"tags": ["website"], "incomplete": true}},
       {"type": "switch_view", "mode": "boxes"},
       {"type": "clear_filter"}
     ]
   }

   Action types:
   - navigate: {"type": "navigate", "page": "X", "section": "Y"} (section optional)
   - apply_filter: {"type": "apply_filter", "filters": {"tags": [...], "incomplete": true/false}}
   - clear_filter: {"type": "clear_filter"}
   - switch_view: {"type": "switch_view", "mode": "list|calendar|boxes"}

3. CLARIFICATION - Ask when request is ambiguous
   Use when: Multiple interpretations exist (e.g., "marketing" could be section or tag)
   Format:
   {
     "type": "clarification",
     "message": "Did you mean the Marketing section or marketing-tagged notes?",
     "options": [
       {"label": "Marketing section", "value": "section:marketing"},
       {"label": "Marketing-tagged notes", "value": "tag:marketing"}
     ]
   }

4. BULK_CONFIRMATION - Confirm before bulk operations on NOTES ONLY
   IMPORTANT: This ONLY works on NOTES. Cannot delete/modify pages or sections.
   If user asks to delete pages or sections, use TEXT_RESPONSE to explain this is not supported yet.

   Use when: User wants to modify/delete many NOTES at once
   Examples: "mark all website notes complete", "delete completed notes"
   NOT for: "delete page X", "remove section Y" (these are NOT supported)

   Format:
   {
     "type": "bulk_confirmation",
     "message": "Mark 37 website notes complete?",
     "operation": {
       "type": "mark_complete",
       "target": {"filters": {"tags": ["website"]}}
     },
     "affectedCount": 37,
     "preview": ["Note 1", "Note 2", "... 35 more"]
   }

   Operation types: mark_complete, mark_incomplete, delete, add_tag, remove_tag, move_to_section

   Operation formats:
   - mark_complete/mark_incomplete: {"type": "mark_complete", "target": {"filters": {...}}}
   - delete: {"type": "delete", "target": {"filters": {...}}}
   - add_tag: {"type": "add_tag", "target": {"filters": {...}, "tag": "tagname"}}
   - remove_tag: {"type": "remove_tag", "target": {"filters": {...}, "tag": "tagname"}}
   - move_to_section: {"type": "move_to_section", "target": {"filters": {...}, "sectionId": "uuid", "sectionName": "Name"}}

   Filter options:
   - tags: ["tag1", "tag2"] - notes with any of these tags
   - completed: true/false - completion status
   - incomplete: true - shorthand for completed: false
   - sectionId: "uuid" - notes in specific section
   - untagged: true - notes with no tags (empty tags array)

   CRITICAL: "delete" only deletes NOTES matching the filter, never pages/sections.
   The "target.filters" must include at least one filter (tags, completed, sectionId).
   NEVER return an empty filters object {} - this would affect ALL notes!

5. PLAN_PROPOSAL - For creating OR deleting pages/sections/notes
   Use when: User wants to create or delete pages, sections, or bulk notes

   GROUPING RULES - IMPORTANT:
   - Group 1: Create the page (if creating a page)
   - Group 2: Create all sections for that page
   - Each deletion should be its own group
   - ALWAYS separate page creation from section creation into different groups

   CREATION Example - "Create page OPS with sections marketing, web":
   {
     "type": "plan_proposal",
     "plan": {
       "totalGroups": 2,
       "groups": [
         {"id": "g1", "description": "Create page OPS", "actionCount": 1, "actions": [{"type": "create_page", "name": "OPS"}]},
         {"id": "g2", "description": "Add 2 sections to OPS", "actionCount": 2, "actions": [
           {"type": "create_section", "pageName": "OPS", "name": "marketing"},
           {"type": "create_section", "pageName": "OPS", "name": "web"}
         ]}
       ],
       "totalActions": 3
     },
     "message": "I'll create page OPS with 2 sections. Proceed?"
   }

   DELETION Example:
   {
     "type": "plan_proposal",
     "plan": {
       "totalGroups": 2,
       "groups": [
         {"id": "g1", "description": "Delete page Test Sequence", "actionCount": 1, "actions": [{"type": "delete_page", "name": "Test Sequence"}]},
         {"id": "g2", "description": "Delete page Test Sequence 2", "actionCount": 1, "actions": [{"type": "delete_page", "name": "Test Sequence 2"}]}
       ],
       "totalActions": 2
     },
     "message": "I'll delete these 2 pages. Proceed?"
   }

   Action types:
   - Creation: create_page, create_section, create_note
   - Deletion: delete_page, delete_section, delete_notes

   Action formats:
   - create_page: {"type": "create_page", "name": "Page Name"}
   - create_section: {"type": "create_section", "pageName": "Page Name", "name": "Section Name"}
   - create_note: {"type": "create_note", "pageName": "Page", "sectionName": "Section", "content": "note text", "tags": ["tag1", "tag2"], "date": "Mon D or null"}
   - delete_page: {"type": "delete_page", "name": "Page Name"}
   - delete_section: {"type": "delete_section", "pageName": "Page Name", "name": "Section Name"}
   - delete_notes: {"type": "delete_notes", "filter": {"tags": ["x"]}, "description": "5 notes tagged x"}

   IMPORTANT for create_note:
   - ALWAYS include "tags" array (can be empty [])
   - Apply tagging rules: extract #hashtags from content, auto-tag based on keywords
   - Common auto-tags: marketing, bug, website, urgent, idea, feature, meeting

   IMPORTANT for deletions:
   - Each page/section deletion should be a SEPARATE group so user can skip individual items
   - Show the exact names of what will be deleted
   - For bulk note deletion, describe what notes match the filter

6. SINGLE_ACTION - Simple note addition (backward compatible)
   Use when: User wants to add a single note to current section
   Format:
   {
     "type": "single_action",
     "parsed": {
       "page": null,
       "section": null,
       "content": "the note content",
       "date": "Mon D or null",
       "tags": ["tag1", "tag2"],
       "action": "add",
       "newPage": false,
       "newSection": false
     },
     "response": {
       "message": "Logged.",
       "note": "the note content"
     }
   }

   TAGGING RULES (ALWAYS apply when creating notes):

   1. FIRST, check existing tags (shown in "All tags in use" above):
      - If an existing tag fits the note content, USE IT
      - Prefer existing tags over creating new ones for consistency

   2. Extract explicit hashtags from user input:
      - "#marketing" → tags: ["marketing"], remove # from content
      - "fix bug #urgent" → tags: ["urgent"], content: "fix bug"

   3. Auto-tag based on keywords (if no existing tag fits):
      * "website", "landing page", "web" → "website"
      * "bug", "fix", "broken", "error" → "bug"
      * "marketing", "campaign", "ads" → "marketing"
      * "urgent", "asap", "critical" → "urgent"
      * "idea", "concept", "brainstorm" → "idea"
      * "meeting", "call", "sync" → "meeting"
      * "feature", "enhancement", "add" → "feature"

   4. Create NEW tags when:
      - The content has a clear category not covered by existing tags
      - User explicitly uses a new hashtag

   - ALWAYS include tags array in response (use [] if truly no tags apply)
   - Multiple tags are encouraged when relevant

SPECIAL REQUESTS:

1. "Review/tag all notes" or "auto-tag notes" or "organize my tags":
   Return TAG_ANALYSIS to trigger intelligent note analysis:
   {
     "type": "tag_analysis",
     "filter": {"untagged": true},
     "message": "I'll analyze your notes and suggest appropriate tags. One moment..."
   }

   The filter can include:
   - "untagged": true - only analyze notes without tags
   - "sectionId": "uuid" - only analyze notes in a specific section
   - {} - analyze all notes

2. "Move notes tagged X to section Y":
   Return BULK_CONFIRMATION with move_to_section operation.

DECISION RULES (check in this order):

1. Questions about data → TEXT_RESPONSE
   - "how many", "what's my", "show me stats", "count", "who created"
   - Use the RELEVANT NOTES and DATABASE OVERVIEW to answer accurately

2. Navigation/filtering → VIEW_CHANGE
   - "show me X", "go to X", "filter by X", "switch to X view", "show everything"
   - If X matches a section name → navigate to it
   - If X matches a tag → filter by it
   - If X could be both → CLARIFICATION

3. ANY deletion (pages, sections, or bulk notes) → PLAN_PROPOSAL
   - "delete page X", "remove pages containing Y", "delete section Z"
   - "delete all completed notes", "delete notes tagged X"
   - ALWAYS use plan mode for deletions so user can see exactly what will be deleted
   - Each item to delete should be its own action in the plan

4. Multi-step creation → PLAN_PROPOSAL
   - ANY request to create a page or sections
   - "create page X", "add page X", "new page X"
   - "create section X", "add section X", "add X sections"
   - Keywords: "create", "add", "new" + "page" or "section"

5. Bulk modifications (NOT delete) → BULK_CONFIRMATION
   - "mark all X notes complete", "tag all notes with Y"
   - Only for: mark_complete, mark_incomplete, add_tag, remove_tag
   - NOT for deletions (use PLAN_PROPOSAL instead)

6. Simple note addition → SINGLE_ACTION
   - ONLY for adding a single note to an EXISTING section
   - User just typing text without structural commands
   - NOT for creating pages or sections

FILTER CONTEXT:
- New conflicting filter → replace existing
- Additive filter → merge with existing
- "everything" or "all" or "clear" → clear all filters

Respond ONLY with valid JSON. No markdown, no explanations.`;
}
