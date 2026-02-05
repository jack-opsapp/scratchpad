/**
 * Slate AI Agent - Main Endpoint
 * Uses OpenAI Function Calling to handle user requests
 */

import { functionDefinitions } from './agentDefinitions.js';
import { executeFunction } from './agentFunctions.js';
import { createClient } from '@supabase/supabase-js';
import {
  getMem0Profile,
  buildMem0Context,
  extractObservations,
  storeObservationsAsync
} from './mem0.js';

const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const MODEL = 'gpt-4o-2024-11-20';
const MAX_ITERATIONS = 10;

// Supabase client for fetching user settings
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// =============================================================================
// Personality Prompts
// =============================================================================

const PERSONALITY_PROMPTS = {
  tactical: `PERSONALITY: Tactical - Maximum efficiency.
STYLE: Military brevity. 2-5 words when possible. No explanations.
TONE: 70% Jocko Willink discipline, 30% defense contractor precision.

RESPONSE EXAMPLES:
- Note created: "✓ Added." or "✓ Logged."
- Showing notes: "Showing 8 notes."
- Bulk operation: "Mark 37 complete?"
- Error: "Failed."
- Navigation: "Now on Marketing."

NO explanations. NO elaboration. NO pleasantries. Pure efficiency.`,

  balanced: `PERSONALITY: Balanced - Professional with context.
STYLE: Medium-length responses. Include key details (section, tags, dates).
TONE: Efficient professional. 10-20 words typical.

RESPONSE EXAMPLES:
- Note created: "✓ Added to Marketing, tagged 'campaign', due Feb 1."
- Showing notes: "Showing 8 website notes in List view."
- Bulk operation: "Mark 37 website notes complete?"
- Error: "Failed to create note - invalid section."
- Navigation: "Now viewing Marketing/Tasks."

Include essential context. Skip unnecessary explanation. Stay focused.`,

  conversational: `PERSONALITY: Conversational - Comprehensive and helpful.
STYLE: Full explanations with reasoning and context. 30-80 words typical.
TONE: Helpful AI assistant. Guide users through everything.

RESPONSE EXAMPLES:
- Note created: "I've created a note in your Marketing section with the content you specified. I've automatically tagged it with 'campaign' and set the due date for February 1st based on your request. This note will now appear in your default List view, sorted by creation date."
- Showing notes: "I'm now displaying 8 notes from the Website section. These are filtered by the 'website' tag and sorted by newest first."
- Bulk operation: "You currently have 37 notes tagged with 'website'. Would you like me to mark all of them as complete? This will move them to your completed list."
- Error: "I wasn't able to create the note because the section you specified doesn't exist. Would you like me to create the section first?"

Provide full explanations. Guide users. Offer alternatives. Be thorough.`
};

const SYSTEM_PROMPT = `You are Slate's agent. Direct. Efficient. No fluff.

TONE:
- Short sentences. No filler words.
- Acknowledge with "Done.", "Got it.", "On it." — not paragraphs.
- State what you did. Move on.
- When something's wrong, say it straight. Offer the fix.
- You're a teammate, not a servant. Professional. Reliable.

EXAMPLES OF GOOD RESPONSES:
- "Done. Created 'Q2 Planning' with 3 sections."
- "Moved 12 notes to Marketing. Tagged urgent."
- "No notes found with that tag. Want me to search content instead?"
- "That'll delete 47 notes. Confirm?"

EXAMPLES OF BAD RESPONSES:
- "I'd be happy to help you with that! I've successfully created..."
- "Great question! Let me look into that for you..."
- "I've gone ahead and completed the task you requested..."

CAPABILITIES:
- Query, create, update, move, delete pages/sections/notes
- Bulk operations (tag, move, complete, delete multiple)
- Navigate views, create filtered views
- Answer questions about data

RULES:
- Fetch data before acting. Don't assume what exists.
- Destructive actions (delete, bulk ops): confirm_action first
- Ambiguous request: ask_clarification
- Always end with respond_to_user
- Read note contents before auto-tagging
- MULTI-STEP: If request involves creating page+sections, or 2+ different entity types, MUST use propose_plan() - never execute directly

SEARCH:
- Check tags, content, section names, page names
- "bugs" matches "bug", "issues", "fixes"
- Try multiple approaches before "not found"
- Report what you did find

NAVIGATION:
- "go to X" → navigate(), then respond_to_user("Now on X.")

QUICK NOTE SHORTCUT:
- If user's message starts with a hyphen (-), treat the text after it as a note to create
- Example: "- call mom tomorrow" → create a note with content "call mom tomorrow"
- Example: "- fix the login bug on staging" → create note "fix the login bug on staging"
- Still apply auto-tagging and navigate to the section
- Use CURRENT VIEW page/section as default location (provided at end of system prompt)

PATH SHORTHAND (IMPORTANT):
When a message contains "page/section:" pattern, parse it as a targeted note:
- "ops/app: fix the login bug" → create note "fix the login bug" in page "ops", section "app"
- "marketing/campaigns: launch email sequence" → create note in marketing/campaigns
- The format is: page_name/section_name: note_content

CRITICAL: You MUST call create_note() to actually create the note. Do NOT just respond with "Got it" - you must make the function call first. If you respond without calling create_note, the note will NOT be created.

Steps when you see this pattern:
1. Parse the path (before colon) and content (after colon)
2. Call create_note(page_name: "...", section_name: "...", content: "...")
3. Then call respond_to_user with confirmation
4. If section not found, tell the user and offer to create it

NOTE CREATION:
- When user doesn't specify a page/section, use CURRENT VIEW context (provided at end of system prompt)
- If CURRENT VIEW is provided, create notes there by default
- If no location specified AND no CURRENT VIEW, ask "Which page/section?"
- NEVER read back the full note content in your response
- After creating a note, respond briefly: "Recorded to PAGE/SECTION." or "Got it. See PAGE/SECTION."
- Always call navigate(page_name, section_name) so user can click to go there
- Example: create_note(...) → navigate(page_name: "Work", section_name: "Tasks") → respond_to_user("Got it. See Work/Tasks.")

AUTO-TAGGING (IMPORTANT):
- ALWAYS auto-tag notes when creating them - never leave notes untagged
- Before creating a note, call get_notes(limit: 100) to see existing tags in use
- Analyze the note content and pick 1-3 relevant tags
- Prefer existing tags for consistency (e.g., if "bug" exists, use it instead of creating "bugs")
- Only create new tags if no existing tag fits
- Common tag categories: bug, feature, idea, todo, urgent, question, meeting, personal, work
- Be smart: "fix the login error" → tag with "bug"; "remember to call mom" → tag with "personal"
- Include tags in create_note call, don't add them separately

CUSTOM VIEWS:
When user asks to "show me" or "list" or "what are my" notes:
1. First, query the notes to see how many match
2. Based on count:
   - 0 notes: Just say "No notes found matching that."
   - 1-3 notes: List them briefly in chat (content snippet + tags)
   - 4-5 notes: List them in chat, then ask "Want me to open these in a view?"
   - 6+ notes: Use create_custom_view, respond "Showing X notes in a view."

Examples:
- 2 bug notes → List them: "Found 2 bug notes: 'Fix login error' and 'Debug API timeout'"
- 5 bug notes → List them + "Want a dedicated view for these?"
- 15 bug notes → create_custom_view(title: "BUG NOTES", filter: {tags: ["bug"]}) + "Showing 15 bug notes."

PLAN MODE (CRITICAL - MUST FOLLOW):
When request involves page+sections OR 2+ different operations, you MUST call propose_plan().
DO NOT call create_page, create_section, create_note directly for multi-step requests.
The propose_plan function triggers a special UI that lets users approve each step.

MUST use propose_plan() for:
- "Create project X with sections Y, Z" → propose_plan() NOT create_page+create_section
- "Set up a workspace" → propose_plan()
- "Reorganize notes" → propose_plan()
- Creating page + anything else → propose_plan()

OK to execute directly (no plan needed):
- Single note creation
- Single page creation (no sections)
- Single section creation
- Simple navigation

WRONG: create_page("Test") then create_section("A") then create_section("B")
RIGHT: propose_plan({ summary: "Create Test with A, B", groups: [...] })

STEP REVISIONS (CRITICAL):
When user requests to "revise step X" with feedback:
- Use revise_plan_step() to update ONLY that specific step
- DO NOT call propose_plan() again - that replaces the entire plan
- The user's message will be like: "Revise step 2 "Add Sections": change section names to X and Y"
- Extract the step number (0-indexed: step 1 = index 0, step 2 = index 1)
- Apply the user's requested changes to that step only
- Call revise_plan_step(step_index, revised_group, message)

WRONG for revisions: propose_plan() with full new plan
RIGHT for revisions: revise_plan_step(step_index: 1, revised_group: {...})

Execute. Report. Done.`;

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const OPENAI_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_KEY) {
    return res.status(500).json({ error: 'OpenAI not configured' });
  }

  try {
    const { message, userId, conversationHistory = [], confirmed, context } = req.body;

    if (!message || !userId) {
      return res.status(400).json({ error: 'Missing message or userId' });
    }

    // Fetch user's AI response style preference and mem0 profile in parallel
    let responseStyle = 'tactical'; // Default
    let mem0Profile = null;

    const fetchPromises = [];

    // Settings fetch promise
    if (supabaseUrl && supabaseServiceKey) {
      const settingsPromise = (async () => {
        try {
          const supabase = createClient(supabaseUrl, supabaseServiceKey);
          const { data: settings } = await supabase
            .from('user_settings')
            .select('ai_response_style')
            .eq('user_id', userId)
            .single();

          if (settings?.ai_response_style) {
            responseStyle = settings.ai_response_style;
          }
        } catch (e) {
          console.log('Could not fetch user settings, using default style:', e.message);
        }
      })();
      fetchPromises.push(settingsPromise);
    }

    // mem0 profile fetch promise (with graceful degradation)
    const mem0Promise = (async () => {
      try {
        mem0Profile = await getMem0Profile(userId);
        if (mem0Profile) {
          console.log('mem0 profile loaded for user');
        }
      } catch (e) {
        console.log('mem0 profile fetch failed, continuing without:', e.message);
      }
    })();
    fetchPromises.push(mem0Promise);

    // Wait for both to complete
    await Promise.all(fetchPromises);

    // Build personality-aware system prompt with mem0 context
    const personalityPrompt = PERSONALITY_PROMPTS[responseStyle] || PERSONALITY_PROMPTS.tactical;
    const mem0Context = buildMem0Context(mem0Profile);
    const fullSystemPrompt = `${personalityPrompt}\n\n${SYSTEM_PROMPT}${mem0Context}`;

    // Build context string for the agent
    let contextInfo = '';
    if (context?.currentPage || context?.currentSection) {
      const parts = [];
      if (context.currentPage) parts.push(`page "${context.currentPage}"`);
      if (context.currentSection) parts.push(`section "${context.currentSection}"`);
      contextInfo = `\n\nCURRENT VIEW: User is viewing ${parts.join(', ')}. When creating notes without a specified location, use this as the default.`;
    }

    // Build messages array
    const messages = [
      { role: 'system', content: fullSystemPrompt + contextInfo },
      ...conversationHistory.slice(-10), // Keep last 10 messages for context
      { role: 'user', content: message }
    ];

    // If this is a confirmation response, add context
    if (confirmed) {
      messages.push({
        role: 'assistant',
        content: null,
        tool_calls: [{
          id: 'confirmed',
          type: 'function',
          function: { name: 'confirm_action', arguments: '{}' }
        }]
      });
      messages.push({
        role: 'tool',
        tool_call_id: 'confirmed',
        content: JSON.stringify({ confirmed: true, value: confirmed })
      });
    }

    const frontendActions = []; // Collect navigation/filter actions
    let finalResponse = null;
    let iterations = 0;
    let noteCreated = false; // Track if create_note was called

    // Detect note creation patterns in user message
    const isNoteCreationRequest = (msg) => {
      // Pattern: "page/section: content"
      if (/^[\w\s]+\/[\w\s]+:\s*.+/i.test(msg)) return true;
      // Pattern: starts with hyphen "- content"
      if (/^-\s+.+/.test(msg)) return true;
      return false;
    };
    const expectsNoteCreation = isNoteCreationRequest(message);

    while (iterations < MAX_ITERATIONS) {
      iterations++;

      // Call OpenAI
      const response = await fetch(OPENAI_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_KEY}`,
        },
        body: JSON.stringify({
          model: MODEL,
          messages,
          tools: functionDefinitions,
          tool_choice: 'auto'
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('OpenAI API error:', response.status, errorText);
        return res.status(500).json({
          error: 'AI service error',
          status: response.status,
          details: errorText.substring(0, 200)
        });
      }

      const completion = await response.json();
      const choice = completion.choices[0];
      const assistantMessage = choice.message;

      // Log tool calls for debugging
      if (assistantMessage.tool_calls) {
        console.log('Agent tool calls:', assistantMessage.tool_calls.map(tc => tc.function.name));
      }

      // Add assistant message to conversation
      messages.push(assistantMessage);

      // If no tool calls, agent is done
      if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
        console.log('Agent responded without tool calls:', assistantMessage.content?.substring(0, 100));
        finalResponse = {
          type: 'response',
          message: assistantMessage.content || 'Done.',
          actions: frontendActions
        };
        break;
      }

      // Sort tool calls so terminal functions (respond_to_user, etc.) come LAST
      // This ensures data operations (create_note) execute before we respond
      const terminalFunctions = ['respond_to_user', 'ask_clarification', 'confirm_action', 'propose_plan', 'revise_plan_step'];
      const sortedToolCalls = [...assistantMessage.tool_calls].sort((a, b) => {
        const aIsTerminal = terminalFunctions.includes(a.function.name);
        const bIsTerminal = terminalFunctions.includes(b.function.name);
        if (aIsTerminal && !bIsTerminal) return 1;  // a comes after b
        if (!aIsTerminal && bIsTerminal) return -1; // a comes before b
        return 0;
      });

      // Process each tool call
      for (const toolCall of sortedToolCalls) {
        const functionName = toolCall.function.name;
        let args = {};

        try {
          args = JSON.parse(toolCall.function.arguments || '{}');
        } catch (e) {
          console.error('Failed to parse function arguments:', e);
        }

        // Check for terminal functions
        if (functionName === 'respond_to_user') {
          finalResponse = {
            type: 'response',
            message: args.message,
            actions: frontendActions
          };
          break;
        }

        if (functionName === 'ask_clarification') {
          finalResponse = {
            type: 'clarification',
            question: args.question,
            options: args.options || null,
            actions: frontendActions
          };
          break;
        }

        if (functionName === 'confirm_action') {
          finalResponse = {
            type: 'confirmation',
            message: args.message,
            confirmValue: args.confirm_value,
            actions: frontendActions
          };
          break;
        }

        if (functionName === 'propose_plan') {
          // Transform to format expected by frontend
          const planGroups = args.groups.map((g, idx) => ({
            id: `group-${idx}`,
            title: g.title,
            description: g.description,
            actions: g.operations.map((op, opIdx) => ({
              id: `action-${idx}-${opIdx}`,
              type: op.type,
              ...op.params
            }))
          }));

          const totalActions = planGroups.reduce((sum, g) => sum + g.actions.length, 0);

          finalResponse = {
            type: 'plan_proposal',
            message: args.summary,
            plan: {
              summary: args.summary,
              groups: planGroups,
              totalGroups: planGroups.length,
              totalActions: totalActions
            },
            actions: frontendActions
          };
          break;
        }

        if (functionName === 'revise_plan_step') {
          // Transform the revised group to frontend format
          const revisedGroup = {
            id: `group-${args.step_index}`,
            title: args.revised_group.title,
            description: args.revised_group.description,
            actions: args.revised_group.operations.map((op, opIdx) => ({
              id: `action-${args.step_index}-${opIdx}`,
              type: op.type,
              ...op.params
            }))
          };

          finalResponse = {
            type: 'step_revision',
            stepIndex: args.step_index,
            revisedGroup: revisedGroup,
            message: args.message || `Step ${args.step_index + 1} revised.`,
            actions: frontendActions
          };
          break;
        }

        // Navigation/filter/view actions - collect for frontend
        if (['navigate', 'apply_filter', 'clear_filters', 'create_custom_view'].includes(functionName)) {
          console.log('Adding frontend action:', functionName, args);
          frontendActions.push({ function: functionName, ...args });
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify({ success: true })
          });
          continue;
        }

        // Execute data query or mutation
        console.log(`Executing function: ${functionName}`, args, 'for userId:', userId);
        const result = await executeFunction(functionName, args, userId);
        console.log(`Function result:`, JSON.stringify(result).substring(0, 200));

        // Track note creation
        if (functionName === 'create_note' && result.id) {
          noteCreated = true;
        }

        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result)
        });
      }

      if (finalResponse) break;
    }

    if (!finalResponse) {
      finalResponse = {
        type: 'error',
        message: 'Agent did not complete properly. Please try again.'
      };
    }

    // Safeguard: If message looked like note creation but no note was created, warn user
    if (expectsNoteCreation && !noteCreated && finalResponse.type === 'response') {
      console.warn('Note creation pattern detected but create_note was not called');
      finalResponse = {
        type: 'error',
        message: 'Failed to create note. Please try again.',
        _debug: 'Note pattern detected but create_note not called'
      };
    }

    // Add the messages exchanged for debugging/conversation history
    finalResponse.messageCount = messages.length;
    finalResponse.iterations = iterations;

    // Fire-and-forget: Store behavioral observations to mem0
    setImmediate(() => {
      try {
        const observations = extractObservations({
          userMessage: message,
          agentResponse: finalResponse,
          context
        });
        if (observations.length > 0) {
          storeObservationsAsync(userId, observations);
        }
      } catch (e) {
        console.warn('mem0 observation extraction failed:', e.message);
      }
    });

    return res.status(200).json(finalResponse);

  } catch (error) {
    console.error('Agent error:', error);
    return res.status(500).json({
      type: 'error',
      message: 'Something went wrong. Please try again.',
      details: error.message
    });
  }
}
