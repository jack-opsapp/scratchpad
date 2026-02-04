/**
 * mem0 Client Wrapper
 * Handles user behavioral profile storage and retrieval
 */

const MEM0_API_KEY = process.env.MEM0_API_KEY;
const MEM0_BASE_URL = 'https://api.mem0.ai/v1';
const PROFILE_TIMEOUT_MS = 2000;

// =============================================================================
// Observation Types
// =============================================================================

export const OBSERVATION_TYPES = {
  RESPONSE_PREFERENCE: 'response_preference',
  TAG_USAGE: 'tag_usage',
  NAVIGATION_PATTERN: 'navigation_pattern',
  CONFIRMATION_CHOICE: 'confirmation_choice',
  NOTE_STYLE: 'note_style',
  TIME_PATTERN: 'time_pattern'
};

// =============================================================================
// Core Functions
// =============================================================================

/**
 * Load learned profile for a user from mem0
 * @param {string} userId - User ID
 * @returns {Promise<object|null>} Profile data or null if unavailable
 */
export async function getMem0Profile(userId) {
  if (!MEM0_API_KEY) {
    return null;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), PROFILE_TIMEOUT_MS);

    const response = await fetch(`${MEM0_BASE_URL}/memories/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Token ${MEM0_API_KEY}`
      },
      body: JSON.stringify({
        query: 'user behavioral profile and preferences',
        user_id: userId,
        limit: 20
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn('mem0 profile fetch failed:', response.status);
      return null;
    }

    const data = await response.json();
    return parseMemories(data.memories || data.results || []);

  } catch (error) {
    if (error.name === 'AbortError') {
      console.warn('mem0 profile fetch timed out');
    } else {
      console.warn('mem0 profile fetch error:', error.message);
    }
    return null;
  }
}

/**
 * Store a behavioral observation for a user
 * @param {string} userId - User ID
 * @param {object} observation - Observation data
 * @param {string} observation.type - One of OBSERVATION_TYPES
 * @param {string} observation.content - The observation content
 * @param {object} observation.metadata - Additional metadata
 * @returns {Promise<boolean>} Success status
 */
export async function storeObservation(userId, observation) {
  if (!MEM0_API_KEY) {
    return false;
  }

  try {
    const response = await fetch(`${MEM0_BASE_URL}/memories`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Token ${MEM0_API_KEY}`
      },
      body: JSON.stringify({
        messages: [
          {
            role: 'user',
            content: `Behavioral observation: ${observation.content}`
          }
        ],
        user_id: userId,
        metadata: {
          type: observation.type,
          timestamp: new Date().toISOString(),
          ...observation.metadata
        }
      })
    });

    if (!response.ok) {
      console.warn('mem0 store observation failed:', response.status);
      return false;
    }

    return true;

  } catch (error) {
    console.warn('mem0 store observation error:', error.message);
    return false;
  }
}

/**
 * Clear all memories for a user (privacy feature)
 * @param {string} userId - User ID
 * @returns {Promise<boolean>} Success status
 */
export async function clearUserMemory(userId) {
  if (!MEM0_API_KEY) {
    return false;
  }

  try {
    const response = await fetch(`${MEM0_BASE_URL}/memories`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Token ${MEM0_API_KEY}`
      },
      body: JSON.stringify({
        user_id: userId
      })
    });

    if (!response.ok) {
      console.warn('mem0 clear memory failed:', response.status);
      return false;
    }

    return true;

  } catch (error) {
    console.warn('mem0 clear memory error:', error.message);
    return false;
  }
}

// =============================================================================
// Profile Parsing
// =============================================================================

/**
 * Parse mem0 memories into a structured profile
 * @param {Array} memories - Raw memories from mem0
 * @returns {object} Structured profile
 */
function parseMemories(memories) {
  const profile = {
    communicationPreferences: [],
    tagPatterns: [],
    workflowInsights: [],
    raw: memories
  };

  for (const memory of memories) {
    const content = memory.memory || memory.content || '';
    const type = memory.metadata?.type;

    if (type === OBSERVATION_TYPES.RESPONSE_PREFERENCE || content.includes('prefer')) {
      profile.communicationPreferences.push(content);
    } else if (type === OBSERVATION_TYPES.TAG_USAGE || content.includes('tag')) {
      profile.tagPatterns.push(content);
    } else if (type === OBSERVATION_TYPES.NAVIGATION_PATTERN ||
               type === OBSERVATION_TYPES.TIME_PATTERN ||
               content.includes('section') ||
               content.includes('active')) {
      profile.workflowInsights.push(content);
    } else {
      // Generic insight
      profile.workflowInsights.push(content);
    }
  }

  return profile;
}

// =============================================================================
// Profile Context Builder
// =============================================================================

/**
 * Build system prompt context from mem0 profile
 * @param {object} profile - Parsed profile from getMem0Profile
 * @returns {string} Context string for system prompt
 */
export function buildMem0Context(profile) {
  if (!profile || (!profile.communicationPreferences?.length &&
                   !profile.tagPatterns?.length &&
                   !profile.workflowInsights?.length)) {
    return '';
  }

  let context = '\n\nUSER PROFILE (learned from past interactions):';

  if (profile.communicationPreferences.length > 0) {
    context += '\n\nLEARNED COMMUNICATION PREFERENCES:';
    profile.communicationPreferences.slice(0, 3).forEach(pref => {
      context += `\n- ${pref}`;
    });
  }

  if (profile.tagPatterns.length > 0) {
    context += '\n\nUSER\'S TAG PATTERNS:';
    profile.tagPatterns.slice(0, 3).forEach(pattern => {
      context += `\n- ${pattern}`;
    });
  }

  if (profile.workflowInsights.length > 0) {
    context += '\n\nWORKFLOW INSIGHTS:';
    profile.workflowInsights.slice(0, 3).forEach(insight => {
      context += `\n- ${insight}`;
    });
  }

  context += '\n\nUse these insights to personalize responses while respecting the user\'s configured response style setting.';

  return context;
}

// =============================================================================
// Observation Extraction
// =============================================================================

/**
 * Extract observations from an interaction
 * @param {object} interaction - Interaction data
 * @param {string} interaction.userMessage - User's message
 * @param {object} interaction.agentResponse - Agent's response
 * @param {object} interaction.context - UI context
 * @returns {Array} Array of observations to store
 */
export function extractObservations(interaction) {
  const observations = [];
  const { userMessage, agentResponse, context } = interaction;

  // Tag usage observation
  if (agentResponse?.actions) {
    const createActions = agentResponse.actions.filter(a =>
      a.function === 'create_note' && a.tags?.length > 0
    );
    if (createActions.length > 0) {
      const tags = createActions.flatMap(a => a.tags || []);
      observations.push({
        type: OBSERVATION_TYPES.TAG_USAGE,
        content: `User created notes with tags: ${tags.join(', ')}`,
        metadata: { tags }
      });
    }
  }

  // Navigation pattern observation
  if (context?.currentPage) {
    observations.push({
      type: OBSERVATION_TYPES.NAVIGATION_PATTERN,
      content: `User working in ${context.currentPage}${context.currentSection ? '/' + context.currentSection : ''} section`,
      metadata: {
        page: context.currentPage,
        section: context.currentSection
      }
    });
  }

  // Time pattern observation
  const hour = new Date().getHours();
  const timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
  observations.push({
    type: OBSERVATION_TYPES.TIME_PATTERN,
    content: `User active in ${timeOfDay}`,
    metadata: { hour, timeOfDay }
  });

  // Confirmation behavior observation
  if (agentResponse?.type === 'confirmation') {
    observations.push({
      type: OBSERVATION_TYPES.CONFIRMATION_CHOICE,
      content: 'User was asked for confirmation on operation',
      metadata: { confirmationType: agentResponse.confirmValue }
    });
  }

  // Note style observation (message length)
  if (userMessage && userMessage.startsWith('-')) {
    const noteContent = userMessage.slice(1).trim();
    const wordCount = noteContent.split(/\s+/).length;
    observations.push({
      type: OBSERVATION_TYPES.NOTE_STYLE,
      content: `User creates ${wordCount <= 10 ? 'short' : wordCount <= 25 ? 'medium' : 'long'} notes (${wordCount} words)`,
      metadata: { wordCount }
    });
  }

  return observations;
}

/**
 * Store multiple observations asynchronously (fire-and-forget)
 * @param {string} userId - User ID
 * @param {Array} observations - Array of observations
 */
export async function storeObservationsAsync(userId, observations) {
  if (!MEM0_API_KEY || !observations.length) {
    return;
  }

  // Fire-and-forget - don't await
  Promise.all(
    observations.map(obs => storeObservation(userId, obs))
  ).catch(err => {
    console.warn('mem0 batch store error:', err.message);
  });
}
