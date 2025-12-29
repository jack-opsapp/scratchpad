/**
 * AI Agent for natural language note parsing
 *
 * Uses Claude API to intelligently parse notes, extract metadata,
 * and provide tactical responses in the Scratchpad voice.
 */

import { fallbackParse } from './parser.js';

const API_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-20250514';
const MAX_TOKENS = 1000;

/**
 * Build the system prompt with current context
 * @param {object} context - Current app context
 * @returns {string} System prompt
 */
function buildSystemPrompt(context) {
  const pageList = context.pages.map(p => p.name).join(', ');
  const sectionList = context.pages
    .map(p => `${p.name}: [${p.sections?.map(s => s.name).join(', ')}]`)
    .join('; ');
  const tagList = context.tags.join(', ');

  return `You are SCRATCHPAD's agent. Parse notes, respond tactically (70% Jocko, 30% defense contractor).
CONTEXT: Pages: ${pageList}. Sections: ${sectionList}. Tags: ${tagList}. Current: ${context.currentPage}/${context.currentSection}.
Respond ONLY JSON: {"parsed":{"page":null,"section":null,"content":"...","date":"Mon D or null","tags":[],"action":"add","newPage":false,"newSection":false},"response":{"message":"...","note":"...","needsInput":false,"options":[]}}`;
}

/**
 * Parse the API response text into structured data
 * @param {string} text - Raw response text
 * @returns {object|null} Parsed JSON or null
 */
function parseResponse(text) {
  try {
    // Remove markdown code blocks if present
    const cleaned = text.replace(/```json|```/g, '').trim();
    return JSON.parse(cleaned);
  } catch (error) {
    console.error('Failed to parse agent response:', error);
    return null;
  }
}

/**
 * Call the AI agent to parse input
 * @param {string} input - User input text
 * @param {object} context - Current app context
 * @param {object} context.pages - Array of pages with sections
 * @param {object} context.tags - Array of existing tags
 * @param {string} context.currentPage - Current page name
 * @param {string} context.currentSection - Current section name
 * @returns {Promise<object>} Parsed result with response
 */
export async function callAgent(input, context) {
  try {
    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: buildSystemPrompt(context),
        messages: [{ role: 'user', content: input }],
      }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const text = data.content?.[0]?.text;

    if (!text) {
      throw new Error('Empty response from API');
    }

    const parsed = parseResponse(text);
    if (!parsed) {
      throw new Error('Failed to parse response JSON');
    }

    return parsed;
  } catch (error) {
    console.error('Agent call failed, using fallback:', error);
    return fallbackParse(input);
  }
}

export default callAgent;
