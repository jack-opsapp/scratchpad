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
 * Interpret error messages into user-friendly responses
 */
function interpretError(error, statusCode) {
  const msg = error.toLowerCase();

  // OpenAI API errors
  if (msg.includes('401') || msg.includes('unauthorized') || msg.includes('invalid api key')) {
    return 'AI service not configured. Please check the API key.';
  }
  if (msg.includes('429') || msg.includes('rate limit')) {
    return 'Too many requests. Please wait a moment and try again.';
  }
  if (msg.includes('503') || msg.includes('overloaded')) {
    return 'AI service is busy. Please try again shortly.';
  }
  if (msg.includes('timeout') || msg.includes('timed out')) {
    return 'Request timed out. Please try again.';
  }

  // Database errors
  if (msg.includes('database') || msg.includes('supabase')) {
    return 'Database connection issue. Please try again.';
  }

  // Network errors
  if (msg.includes('network') || msg.includes('fetch') || msg.includes('failed to fetch')) {
    return 'Connection failed. Check your internet and try again.';
  }

  // OpenAI not configured
  if (msg.includes('openai not configured')) {
    return 'AI service not configured. Contact support.';
  }

  // Generic AI service error - include status if available
  if (msg.includes('ai service error')) {
    if (statusCode) {
      return `AI service error (${statusCode}). Please try again.`;
    }
    return 'AI service temporarily unavailable. Please try again.';
  }

  // Default: return original with prefix
  return `Something went wrong: ${error}`;
}

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
      const rawError = errorData.details
        ? `${errorData.error}: ${errorData.details}`
        : (errorData.error || `API error: ${response.status}`);
      const friendlyMsg = interpretError(rawError, errorData.status || response.status);
      return {
        type: 'error',
        message: friendlyMsg,
        _source: 'api_error',
        _rawError: rawError
      };
    }

    const data = await response.json();
    return { ...data, _source: 'api' };

  } catch (error) {
    console.error('Agent call failed:', error);
    const friendlyMsg = interpretError(error.message, null);
    return {
      type: 'error',
      message: friendlyMsg,
      _source: 'error',
      _rawError: error.message
    };
  }
}

export default callAgent;
