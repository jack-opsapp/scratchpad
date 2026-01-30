/**
 * Bulk Operations Library
 * Handle bulk operations on notes
 */

/**
 * Execute bulk operation on notes
 * @param {string} operation - Operation type
 * @param {Array} notes - All notes
 * @param {Object} target - Target filter and params
 * @param {Function} setNotes - State setter
 * @param {string} userId - Current user ID for tracking
 * @returns {Object} Result stats
 */
export function executeBulkOperation(operation, notes, target, setNotes, userId = null) {
  // Filter target notes
  const targetNotes = filterNotes(notes, target.filters || {});

  const results = {
    total: targetNotes.length,
    succeeded: 0,
    failed: 0,
    errors: []
  };

  switch (operation) {
    case 'mark_complete':
      setNotes(notes.map(n => {
        if (targetNotes.find(tn => tn.id === n.id)) {
          results.succeeded++;
          return {
            ...n,
            completed: true,
            completed_by_user_id: userId,
            completed_at: new Date().toISOString()
          };
        }
        return n;
      }));
      break;

    case 'mark_incomplete':
      setNotes(notes.map(n => {
        if (targetNotes.find(tn => tn.id === n.id)) {
          results.succeeded++;
          return {
            ...n,
            completed: false,
            completed_by_user_id: null,
            completed_at: null
          };
        }
        return n;
      }));
      break;

    case 'delete':
      const idsToDelete = new Set(targetNotes.map(n => n.id));
      setNotes(notes.filter(n => {
        if (idsToDelete.has(n.id)) {
          results.succeeded++;
          return false;
        }
        return true;
      }));
      break;

    case 'add_tag':
      if (!target.tag) {
        results.errors.push('No tag specified');
        break;
      }
      setNotes(notes.map(n => {
        if (targetNotes.find(tn => tn.id === n.id)) {
          results.succeeded++;
          return {
            ...n,
            tags: [...new Set([...(n.tags || []), target.tag])]
          };
        }
        return n;
      }));
      break;

    case 'remove_tag':
      if (!target.tag) {
        results.errors.push('No tag specified');
        break;
      }
      setNotes(notes.map(n => {
        if (targetNotes.find(tn => tn.id === n.id)) {
          results.succeeded++;
          return {
            ...n,
            tags: (n.tags || []).filter(t => t !== target.tag)
          };
        }
        return n;
      }));
      break;

    case 'move_to_section':
      if (!target.sectionId) {
        results.errors.push('No section specified');
        break;
      }
      setNotes(notes.map(n => {
        if (targetNotes.find(tn => tn.id === n.id)) {
          results.succeeded++;
          return { ...n, sectionId: target.sectionId };
        }
        return n;
      }));
      break;

    default:
      throw new Error(`Unknown operation: ${operation}`);
  }

  return results;
}

/**
 * Filter notes based on criteria
 */
function filterNotes(notes, filters) {
  return notes.filter(note => {
    // Tag filter
    if (filters.tags && filters.tags.length > 0) {
      const hasTag = filters.tags.some(tag =>
        note.tags?.map(t => t.toLowerCase()).includes(tag.toLowerCase())
      );
      if (!hasTag) return false;
    }

    // Completion filter
    if (filters.completed !== undefined) {
      if (filters.completed && !note.completed) return false;
      if (!filters.completed && note.completed) return false;
    }

    // Incomplete filter (opposite of completed)
    if (filters.incomplete !== undefined) {
      if (filters.incomplete && note.completed) return false;
    }

    // Section filter
    if (filters.sectionId) {
      if (note.sectionId !== filters.sectionId) return false;
    }

    // Creator filter
    if (filters.createdBy) {
      if (note.created_by_user_id !== filters.createdBy) return false;
    }

    return true;
  });
}

/**
 * Get count of notes matching filter
 */
export function getMatchingCount(notes, filters) {
  return filterNotes(notes, filters).length;
}

/**
 * Get preview of notes matching filter (first few)
 */
export function getMatchingPreview(notes, filters, limit = 4) {
  const matching = filterNotes(notes, filters);
  const preview = matching.slice(0, limit).map(n =>
    n.content.length > 40 ? n.content.substring(0, 40) + '...' : n.content
  );

  if (matching.length > limit) {
    preview.push(`... ${matching.length - limit} more`);
  }

  return preview;
}
