/**
 * Analytics Library
 * Get analytics data for text responses
 */

/**
 * Get analytics based on query
 * @param {string} query - User query
 * @param {Array} notes - All notes
 * @param {Array} sections - All sections
 * @param {Array} pages - All pages
 * @returns {Object|null} Analytics data or null
 */
export function getAnalytics(query, notes, sections, pages) {
  const lower = query.toLowerCase();

  // Count notes in section
  if (lower.includes('how many notes') || lower.includes('count notes')) {
    // Check for section name
    for (const section of sections) {
      if (lower.includes(section.name.toLowerCase())) {
        const sectionNotes = notes.filter(n => n.sectionId === section.id);
        const completed = sectionNotes.filter(n => n.completed).length;
        return {
          type: 'note_count',
          section: section.name,
          total: sectionNotes.length,
          completed,
          active: sectionNotes.length - completed
        };
      }
    }

    // Check for tag
    const tags = getAllTags(notes);
    for (const tag of tags) {
      if (lower.includes(tag.toLowerCase())) {
        const taggedNotes = notes.filter(n => n.tags?.includes(tag));
        const completed = taggedNotes.filter(n => n.completed).length;
        return {
          type: 'note_count',
          tag: tag,
          total: taggedNotes.length,
          completed,
          active: taggedNotes.length - completed
        };
      }
    }

    // Generic count
    const completed = notes.filter(n => n.completed).length;
    return {
      type: 'note_count',
      total: notes.length,
      completed,
      active: notes.length - completed
    };
  }

  // Most used tag
  if (lower.includes('most used tag') || lower.includes('popular tag')) {
    const tagCounts = {};
    notes.forEach(n => {
      n.tags?.forEach(tag => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });
    });
    const sorted = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]);

    if (sorted.length === 0) {
      return {
        type: 'tag_stats',
        message: 'No tags found'
      };
    }

    return {
      type: 'tag_stats',
      mostUsed: sorted[0][0],
      count: sorted[0][1],
      topTags: sorted.slice(0, 5).map(([tag, count]) => ({ tag, count }))
    };
  }

  // Completion stats
  if (lower.includes('completion') || lower.includes('completed') || lower.includes('progress')) {
    const completed = notes.filter(n => n.completed).length;
    const total = notes.length;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

    return {
      type: 'completion_stats',
      total,
      completed,
      incomplete: total - completed,
      percentage
    };
  }

  // Page stats
  if (lower.includes('how many pages')) {
    return {
      type: 'page_stats',
      total: pages.length,
      pages: pages.map(p => ({
        name: p.name,
        sections: p.sections?.length || 0
      }))
    };
  }

  // Section stats
  if (lower.includes('how many sections')) {
    return {
      type: 'section_stats',
      total: sections.length
    };
  }

  return null;
}

/**
 * Get all unique tags from notes
 */
function getAllTags(notes) {
  const tags = new Set();
  notes.forEach(n => {
    n.tags?.forEach(tag => tags.add(tag));
  });
  return Array.from(tags);
}

/**
 * Format analytics data into message
 */
export function formatAnalyticsMessage(data) {
  if (!data) return null;

  switch (data.type) {
    case 'note_count':
      if (data.section) {
        return `You have ${data.total} notes in ${data.section} section (${data.completed} completed, ${data.active} active).`;
      }
      if (data.tag) {
        return `You have ${data.total} notes tagged "${data.tag}" (${data.completed} completed, ${data.active} active).`;
      }
      return `You have ${data.total} notes total (${data.completed} completed, ${data.active} active).`;

    case 'tag_stats':
      if (data.message) return data.message;
      return `Your most used tag is "${data.mostUsed}" with ${data.count} notes.`;

    case 'completion_stats':
      return `${data.percentage}% complete (${data.completed}/${data.total} notes done).`;

    case 'page_stats':
      return `You have ${data.total} pages.`;

    case 'section_stats':
      return `You have ${data.total} sections across all pages.`;

    default:
      return null;
  }
}
