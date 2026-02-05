/**
 * AI Agent Client - Calls the /api/agent endpoint
 *
 * The agent uses OpenAI function calling to:
 * 1. Query data on-demand (pages, sections, notes)
 * 2. Execute operations (create, update, delete, bulk)
 * 3. Navigate the user to views
 * 4. Ask for clarification when needed
 */

/**
 * Call the AI agent
 * @param {string} message - User message
 * @param {string} userId - User ID for data access
 * @param {Array} conversationHistory - Recent messages for context
 * @param {string} confirmed - If this is a confirmation response, the confirmed value
 * @param {object} context - Current UI context (page, section)
 * @returns {Promise<object>} Agent response
 */
export async function callAgent(message, userId, conversationHistory = [], confirmed = null, context = null) {
  try {
    const body = {
      message,
      userId,
      conversationHistory: conversationHistory.slice(-10) // Last 10 messages
    };

    if (confirmed) {
      body.confirmed = confirmed;
    }

    if (context) {
      body.context = context;
    }

    const response = await fetch('/api/agent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMsg = errorData.details
        ? `${errorData.error}: ${errorData.details}`
        : (errorData.error || `API error: ${response.status}`);
      throw new Error(errorMsg);
    }

    const data = await response.json();
    return { ...data, _source: 'api' };

  } catch (error) {
    console.error('Agent call failed:', error);
    return {
      type: 'error',
      message: `Error: ${error.message}`,
      _source: 'error',
      _error: error.message
    };
  }
}

export default callAgent;
