/**
 * Serverless API route for OpenAI note parsing with full agent capabilities
 * Supports: text responses, view changes, clarifications, bulk ops, plan mode
 */

const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const MODEL = 'gpt-4o-2024-11-20';
const MAX_TOKENS = 2000;

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Check for API key
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('OPENAI_API_KEY not configured');
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    const { input, context, planState } = req.body;

    if (!input) {
      return res.status(400).json({ error: 'Missing input' });
    }

    // Build system prompt based on mode
    const systemPrompt = buildSystemPrompt(context || {}, planState, input);

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
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: input },
        ],
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
    return res.status(200).json(parsed);

  } catch (error) {
    console.error('Parse API error:', error);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * Build the system prompt with current context and plan state
 */
function buildSystemPrompt(context, planState, userInput) {
  const pageList = context.pages?.map(p => p.name).join(', ') || 'None';
  const sectionList = context.pages
    ?.flatMap(p => p.sections?.map(s => `${p.name}/${s.name}`) || [])
    .join(', ') || 'None';
  const tagList = context.tags?.join(', ') || 'None';
  const currentFilters = JSON.stringify(context.currentFilters || {});
  const viewMode = context.viewMode || 'list';

  const baseContext = `
CONTEXT:
- Pages: ${pageList}
- Sections: ${sectionList}
- Tags: ${tagList}
- Current location: ${context.currentPage || 'None'}/${context.currentSection || 'None'}
- Current filters: ${currentFilters}
- View mode: ${viewMode}
`;

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
  return `You are SCRATCHPAD's intelligent command center agent.

${baseContext}

You can respond in these ways:

1. TEXT_RESPONSE - Answer questions about notes, stats, analytics
   Use when: User asks for information without wanting to change the view
   Examples: "how many notes?", "what's my most used tag?", "show me stats"
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

4. BULK_CONFIRMATION - Confirm before bulk operations
   Use when: User wants to modify/delete many notes at once
   Examples: "mark all website notes complete", "delete completed notes"
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

   Operation types: mark_complete, mark_incomplete, delete, add_tag, remove_tag

5. PLAN_PROPOSAL - For creating pages or sections (ALWAYS use this, never SINGLE_ACTION)
   Use when: User wants to create ANY page or section (even just one)
   Examples:
   - "Create page OPS with sections marketing, app, web"
   - "create page test"
   - "add a new page called Projects"
   - "create section Ideas"
   - "add 3 sections: A, B, C"
   - "new page X and add sections Y, Z"
   Format:
   {
     "type": "plan_proposal",
     "plan": {
       "totalGroups": 2,
       "groups": [
         {"id": "g1", "description": "Create page OPS", "actionCount": 1, "actions": [{"type": "create_page", "name": "OPS"}]},
         {"id": "g2", "description": "Add 3 sections", "actionCount": 3, "actions": [{"type": "create_section", "pageName": "OPS", "name": "Marketing"}, ...]}
       ],
       "totalActions": 4
     },
     "message": "I'll break this into 2 groups. Proceed?"
   }

   Action types for creation: create_page, create_section, create_note

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
       "tags": [],
       "action": "add",
       "newPage": false,
       "newSection": false
     },
     "response": {
       "message": "Logged.",
       "note": "the note content"
     }
   }

DECISION RULES (check in this order):

1. Questions about data → TEXT_RESPONSE
   - "how many", "what's my", "show me stats", "count", "who created"

2. Navigation/filtering → VIEW_CHANGE
   - "show me X", "go to X", "filter by X", "switch to X view", "show everything"
   - If X matches a section name → navigate to it
   - If X matches a tag → filter by it
   - If X could be both → CLARIFICATION

3. Bulk modifications → BULK_CONFIRMATION
   - "mark all X complete", "delete all X", "tag all X with Y"

4. Multi-step creation → PLAN_PROPOSAL (IMPORTANT: check this before SINGLE_ACTION)
   - ANY request to create a page (pages always need confirmation)
   - ANY request to create sections (sections always need confirmation)
   - "create page X", "add page X", "new page X"
   - "create section X", "add section X", "add X sections"
   - "create page X with sections A, B, C"
   - Multiple entities being created
   - Keywords: "create", "add", "new" + "page" or "section" or "sections"

5. Simple note addition → SINGLE_ACTION
   - ONLY for adding a single note to an EXISTING section
   - User just typing text without structural commands
   - NOT for creating pages or sections

FILTER CONTEXT:
- New conflicting filter → replace existing
- Additive filter → merge with existing
- "everything" or "all" or "clear" → clear all filters

Respond ONLY with valid JSON. No markdown, no explanations.`;
}
