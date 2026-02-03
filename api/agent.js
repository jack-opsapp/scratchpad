/**
 * Scratchpad AI Agent - Main Endpoint
 * Uses OpenAI Function Calling to handle user requests
 */

import { functionDefinitions } from './agentDefinitions.js';
import { executeFunction } from './agentFunctions.js';

const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const MODEL = 'gpt-4o-2024-11-20';
const MAX_ITERATIONS = 10;

const SYSTEM_PROMPT = `You are Scratchpad's agent. Direct. Efficient. No fluff.

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
      { role: 'system', content: SYSTEM_PROMPT + contextInfo },
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

      // Add assistant message to conversation
      messages.push(assistantMessage);

      // If no tool calls, agent is done
      if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
        finalResponse = {
          type: 'response',
          message: assistantMessage.content || 'Done.',
          actions: frontendActions
        };
        break;
      }

      // Process each tool call
      for (const toolCall of assistantMessage.tool_calls) {
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

    // Add the messages exchanged for debugging/conversation history
    finalResponse.messageCount = messages.length;
    finalResponse.iterations = iterations;

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
