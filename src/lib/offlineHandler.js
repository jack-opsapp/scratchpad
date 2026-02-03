/**
 * Offline queue and sync management for mobile
 * Handles operations when network unavailable and syncs when restored
 */

const QUEUE_KEY = 'scratchpad-offline-queue';
const CHAT_QUEUE_KEY = 'scratchpad-chat-queue';

/**
 * Queue an operation for sync when back online
 */
export function queueOperation(operation) {
  const queue = getOfflineQueue();
  queue.push({
    ...operation,
    timestamp: Date.now(),
    id: crypto.randomUUID()
  });
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

/**
 * Get all queued operations
 */
export function getOfflineQueue() {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
  } catch {
    return [];
  }
}

/**
 * Clear the offline queue
 */
export function clearOfflineQueue() {
  localStorage.removeItem(QUEUE_KEY);
}

/**
 * Queue chat message for RAG sync when back online
 */
export function queueChatMessage(message, role = 'user') {
  const queue = getChatQueue();
  queue.push({ message, role, timestamp: Date.now() });
  localStorage.setItem(CHAT_QUEUE_KEY, JSON.stringify(queue));
}

/**
 * Get queued chat messages
 */
export function getChatQueue() {
  try {
    return JSON.parse(localStorage.getItem(CHAT_QUEUE_KEY) || '[]');
  } catch {
    return [];
  }
}

/**
 * Clear chat queue
 */
export function clearChatQueue() {
  localStorage.removeItem(CHAT_QUEUE_KEY);
}

/**
 * Sync offline queue when connection restored
 */
export async function syncOfflineQueue() {
  const operations = getOfflineQueue();
  const chatMessages = getChatQueue();

  let synced = 0;
  let failed = 0;

  // Sync note embeddings
  for (const op of operations) {
    try {
      if (op.type === 'embed_note') {
        await fetch('/api/embeddings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'embed_note',
            noteId: op.noteId,
            content: op.content
          })
        });
        synced++;
      }
    } catch (err) {
      console.error('Sync failed:', op, err);
      failed++;
    }
  }

  // Sync chat messages to chat_history (for RAG)
  for (const msg of chatMessages) {
    try {
      await fetch('/api/embeddings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'store_chat',
          userId: msg.userId,
          role: msg.role,
          content: msg.message,
          metadata: { offlineSync: true, originalTimestamp: msg.timestamp }
        })
      });
      synced++;
    } catch (err) {
      console.error('Chat sync failed:', msg, err);
      failed++;
    }
  }

  // Clear queues if fully synced
  if (failed === 0) {
    clearOfflineQueue();
    clearChatQueue();
  }

  return { success: failed === 0, synced, failed };
}

/**
 * Get pending sync count
 */
export function getPendingSyncCount() {
  return getOfflineQueue().length + getChatQueue().length;
}

/**
 * Fallback parser for offline mode
 * Uses simple regex patterns without AI
 */
export function offlineParser(input) {
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  let extractedDate = null;
  let cleanInput = input;

  // Date patterns
  const patterns = [
    /\b(?:on|by|for|due)?\s*(\d{1,2})\/(\d{1,2})\b/i,
    /\b(?:on|by|for|due)?\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})(?:st|nd|rd|th)?\b/i,
    /\b(?:on|by|for|due)?\s*(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i,
    /\btomorrow\b/i,
    /\btoday\b/i
  ];

  for (const pattern of patterns) {
    const match = input.match(pattern);
    if (match) {
      if (pattern === patterns[0]) {
        const monthIdx = parseInt(match[1]) - 1;
        if (monthIdx >= 0 && monthIdx < 12) {
          extractedDate = `${months[monthIdx].charAt(0).toUpperCase() + months[monthIdx].slice(1)} ${parseInt(match[2])}`;
        }
      } else if (pattern === patterns[1]) {
        extractedDate = `${match[1].charAt(0).toUpperCase() + match[1].slice(1, 3)} ${parseInt(match[2])}`;
      } else if (pattern === patterns[2]) {
        extractedDate = `${match[2].charAt(0).toUpperCase() + match[2].slice(1, 3)} ${parseInt(match[1])}`;
      } else if (pattern === patterns[3]) {
        // Tomorrow
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        extractedDate = `${months[tomorrow.getMonth()].charAt(0).toUpperCase() + months[tomorrow.getMonth()].slice(1)} ${tomorrow.getDate()}`;
      } else if (pattern === patterns[4]) {
        // Today
        const today = new Date();
        extractedDate = `${months[today.getMonth()].charAt(0).toUpperCase() + months[today.getMonth()].slice(1)} ${today.getDate()}`;
      }
      cleanInput = input.replace(match[0], '').trim();
      break;
    }
  }

  // Extract hashtags
  const tags = [];
  const hashtagMatches = input.match(/#(\w+)/g);
  if (hashtagMatches) {
    tags.push(...hashtagMatches.map(t => t.substring(1).toLowerCase()));
    cleanInput = cleanInput.replace(/#\w+/g, '').trim();
  }

  // Keyword-based auto-tags
  const lower = input.toLowerCase();
  if (lower.includes('website') || lower.includes('web')) tags.push('website');
  if (lower.includes('bug') || lower.includes('fix')) tags.push('bug');
  if (lower.includes('urgent') || lower.includes('asap')) tags.push('urgent');
  if (lower.includes('marketing') || lower.includes('campaign')) tags.push('marketing');
  if (lower.includes('idea')) tags.push('idea');

  return {
    type: 'single_action',
    parsed: {
      content: cleanInput || input.trim(),
      date: extractedDate,
      tags: [...new Set(tags)].slice(0, 3),
      action: 'add'
    },
    response: {
      message: 'Offline - using basic parser',
      note: cleanInput || input.trim()
    },
    _source: 'fallback',
    _fallback: true,
    _error: 'Offline mode'
  };
}
