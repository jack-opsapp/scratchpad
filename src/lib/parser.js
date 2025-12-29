/**
 * Fallback parser for note input
 *
 * Extracts dates, tags, and content from natural language input.
 * Used when the AI agent is unavailable or as a quick local parse.
 */

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const DATE_PATTERNS = [
  // MM/DD format: "on 3/15", "by 12/25"
  /\b(?:on|by|for|due)?\s*(\d{1,2})\/(\d{1,2})\b/i,
  // Month Day format: "on Jan 15", "by March 3rd"
  /\b(?:on|by|for|due)?\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})(?:st|nd|rd|th)?\b/i,
  // Day Month format: "15th Jan", "3 March"
  /\b(?:on|by|for|due)?\s*(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i,
];

// Keywords to auto-tag mapping
const AUTO_TAG_KEYWORDS = {
  marketing: ['campaign', 'marketing', 'promo', 'ad', 'social'],
  bug: ['bug', 'fix', 'issue', 'error', 'broken'],
  website: ['website', 'site', 'web', 'page', 'landing'],
  urgent: ['urgent', 'asap', 'critical', 'emergency'],
  idea: ['idea', 'thought', 'maybe', 'consider'],
};

// Tactical response messages
const RESPONSES = [
  'Logged.',
  'Noted.',
  'On the board.',
  'Tracked.',
  'Roger.',
  'Confirmed.',
  'Filed.',
];

/**
 * Format a month name from index
 * @param {number} monthIndex - 0-based month index
 * @returns {string} Capitalized 3-letter month
 */
function formatMonth(monthIndex) {
  const month = MONTHS[monthIndex];
  return month.charAt(0).toUpperCase() + month.slice(1);
}

/**
 * Extract date from input string
 * @param {string} input - Raw input string
 * @returns {{ date: string|null, cleanInput: string }} Extracted date and cleaned input
 */
function extractDate(input) {
  let extractedDate = null;
  let cleanInput = input;

  for (const pattern of DATE_PATTERNS) {
    const match = input.match(pattern);
    if (!match) continue;

    if (pattern === DATE_PATTERNS[0]) {
      // MM/DD format
      const monthIdx = parseInt(match[1]) - 1;
      if (monthIdx >= 0 && monthIdx < 12) {
        extractedDate = `${formatMonth(monthIdx)} ${parseInt(match[2])}`;
      }
    } else if (pattern === DATE_PATTERNS[1]) {
      // Month Day format
      extractedDate = `${formatMonth(MONTHS.indexOf(match[1].toLowerCase().slice(0, 3)))} ${parseInt(match[2])}`;
    } else if (pattern === DATE_PATTERNS[2]) {
      // Day Month format
      extractedDate = `${formatMonth(MONTHS.indexOf(match[2].toLowerCase().slice(0, 3)))} ${parseInt(match[1])}`;
    }

    cleanInput = input.replace(match[0], '').trim();
    break;
  }

  return { date: extractedDate, cleanInput };
}

/**
 * Extract auto-tags based on keywords
 * @param {string} input - Input text
 * @param {number} maxTags - Maximum tags to return
 * @returns {string[]} Array of detected tags
 */
function extractAutoTags(input, maxTags = 3) {
  const lower = input.toLowerCase();
  const tags = [];

  for (const [tag, keywords] of Object.entries(AUTO_TAG_KEYWORDS)) {
    if (keywords.some(keyword => lower.includes(keyword))) {
      tags.push(tag);
      if (tags.length >= maxTags) break;
    }
  }

  return tags;
}

/**
 * Get a random tactical response
 * @returns {string} Response message
 */
function getRandomResponse() {
  return RESPONSES[Math.floor(Math.random() * RESPONSES.length)];
}

/**
 * Parse input into structured note data
 * @param {string} input - Raw user input
 * @returns {{ parsed: object, response: object }} Parsed data and response message
 */
export function fallbackParse(input) {
  const { date, cleanInput } = extractDate(input);
  const autoTags = extractAutoTags(input);
  const content = cleanInput || input.trim();

  const message = date
    ? `Scheduled: ${date}.`
    : getRandomResponse();

  return {
    parsed: {
      page: null,
      section: null,
      content,
      date,
      tags: autoTags,
      action: 'add',
      newPage: false,
      newSection: false,
    },
    response: {
      message,
      note: content,
      needsInput: false,
      options: [],
    },
  };
}

export default fallbackParse;
