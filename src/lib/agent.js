/**
 * AI Agent for natural language note parsing with plan mode support
 *
 * Calls the secure /api/parse serverless function which handles
 * OpenAI API calls with the key kept server-side.
 */

import { fallbackParse } from './parser.js';

/**
 * Call the AI agent to parse input
 * @param {string} input - User input text
 * @param {object} context - Current app context
 * @param {object} context.pages - Array of pages with sections
 * @param {object} context.tags - Array of existing tags
 * @param {string} context.currentPage - Current page name
 * @param {string} context.currentSection - Current section name
 * @param {object} planState - Current plan state (if in plan mode)
 * @returns {Promise<object>} Parsed result with response
 */
export async function callAgent(input, context, planState = null) {
  try {
    const response = await fetch('/api/parse', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ input, context, planState }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `API error: ${response.status}`);
    }

    const data = await response.json();
    return data;

  } catch (error) {
    console.error('Agent call failed, using fallback:', error);
    return fallbackParse(input);
  }
}

export default callAgent;
