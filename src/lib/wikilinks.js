/**
 * Wikilink parser for note connections
 *
 * Syntax: [[note-id|display text]] or [[note-id|type:display text]]
 * Renders as clickable chips in note content.
 */

// Regex to match [[uuid|text]] or [[uuid|type:text]]
const WIKILINK_REGEX = /\[\[([a-f0-9-]+)\|(?:([a-z]+):)?([^\]]+)\]\]/g;

/**
 * Parse note content and split into text segments and wikilink segments
 * @param {string} content - Raw note content
 * @returns {Array<{type: 'text'|'link', value: string, noteId?: string, linkType?: string, displayText?: string}>}
 */
export function parseWikilinks(content) {
  if (!content) return [{ type: 'text', value: '' }];

  const segments = [];
  let lastIndex = 0;

  for (const match of content.matchAll(WIKILINK_REGEX)) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: content.slice(lastIndex, match.index) });
    }

    segments.push({
      type: 'link',
      value: match[0],
      noteId: match[1],
      linkType: match[2] || null,
      displayText: match[3],
    });

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    segments.push({ type: 'text', value: content.slice(lastIndex) });
  }

  if (segments.length === 0) {
    segments.push({ type: 'text', value: content });
  }

  return segments;
}

/**
 * Strip wikilinks from content, keeping only display text
 */
export function stripWikilinks(content) {
  if (!content) return '';
  return content.replace(WIKILINK_REGEX, '$3');
}

/**
 * Build a wikilink string
 */
export function buildWikilink(noteId, displayText, type = null) {
  if (type) {
    return `[[${noteId}|${type}:${displayText}]]`;
  }
  return `[[${noteId}|${displayText}]]`;
}
