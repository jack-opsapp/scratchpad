/**
 * Data Export Functions
 *
 * Export user data in various formats: Markdown, JSON, CSV
 * Also supports full workspace backup.
 */

import { supabase } from '../config/supabase.js';

// =============================================================================
// Export as Markdown (ZIP)
// =============================================================================

/**
 * Export all notes as Markdown files in a ZIP archive
 * Each page becomes a separate .md file
 */
export async function exportAsMarkdown() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Fetch all user's pages with sections and notes
  const { data: pages, error } = await supabase
    .from('pages')
    .select(`
      id,
      name,
      starred,
      sections (
        id,
        name,
        position,
        notes (
          id,
          content,
          completed,
          date,
          tags,
          created_at
        )
      )
    `)
    .eq('user_id', user.id)
    .order('name');

  if (error) throw error;

  // Generate markdown files
  const files = [];

  for (const page of pages || []) {
    let markdown = `# ${page.name}\n\n`;

    if (page.starred) {
      markdown += `> ⭐ Starred Page\n\n`;
    }

    // Sort sections by position
    const sections = (page.sections || []).sort((a, b) => (a.position || 0) - (b.position || 0));

    for (const section of sections) {
      markdown += `## ${section.name}\n\n`;

      // Sort notes by created_at (newest first)
      const notes = (section.notes || []).sort((a, b) =>
        new Date(b.created_at) - new Date(a.created_at)
      );

      for (const note of notes) {
        const checkbox = note.completed ? '[x]' : '[ ]';
        markdown += `- ${checkbox} ${note.content}`;

        if (note.tags?.length) {
          markdown += ` #${note.tags.join(' #')}`;
        }

        if (note.date) {
          markdown += ` | ${note.date}`;
        }

        markdown += '\n';
      }

      markdown += '\n';
    }

    files.push({
      name: `${sanitizeFilename(page.name)}.md`,
      content: markdown
    });
  }

  // Create ZIP using JSZip
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();

  files.forEach(file => {
    zip.file(file.name, file.content);
  });

  const blob = await zip.generateAsync({ type: 'blob' });
  downloadBlob(blob, 'slate-export.zip');

  return { success: true, fileCount: files.length };
}

// =============================================================================
// Export as JSON
// =============================================================================

/**
 * Export all data as a structured JSON file
 */
export async function exportAsJSON() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Fetch pages with all nested data
  const { data: pages, error: pagesError } = await supabase
    .from('pages')
    .select(`
      id,
      name,
      starred,
      created_at,
      sections (
        id,
        name,
        position,
        created_at,
        notes (
          id,
          content,
          completed,
          date,
          tags,
          created_at
        )
      )
    `)
    .eq('user_id', user.id);

  if (pagesError) throw pagesError;

  // Get unique tags from all notes
  const allTags = new Set();
  pages?.forEach(page => {
    page.sections?.forEach(section => {
      section.notes?.forEach(note => {
        note.tags?.forEach(tag => allTags.add(tag));
      });
    });
  });

  const exportData = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    userId: user.id,
    email: user.email,
    stats: {
      pageCount: pages?.length || 0,
      sectionCount: pages?.reduce((sum, p) => sum + (p.sections?.length || 0), 0) || 0,
      noteCount: pages?.reduce((sum, p) =>
        sum + (p.sections?.reduce((s, sec) => s + (sec.notes?.length || 0), 0) || 0), 0) || 0,
      tagCount: allTags.size
    },
    pages,
    tags: Array.from(allTags).sort()
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  downloadBlob(blob, 'slate-export.json');

  return { success: true, stats: exportData.stats };
}

// =============================================================================
// Export as CSV
// =============================================================================

/**
 * Export notes as a flat CSV file
 */
export async function exportAsCSV() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Fetch notes with page and section names
  const { data: notes, error } = await supabase
    .from('notes')
    .select(`
      id,
      content,
      completed,
      date,
      tags,
      created_at,
      sections (
        name,
        pages (
          name
        )
      )
    `)
    .eq('sections.pages.user_id', user.id);

  if (error) throw error;

  // CSV headers
  let csv = 'Page,Section,Note,Tags,Date,Completed,Created At\n';

  // CSV rows
  for (const note of notes || []) {
    const page = escapeCSV(note.sections?.pages?.name || '');
    const section = escapeCSV(note.sections?.name || '');
    const content = escapeCSV(note.content || '');
    const tags = escapeCSV(note.tags?.join(', ') || '');
    const date = note.date || '';
    const completed = note.completed ? 'Yes' : 'No';
    const createdAt = note.created_at ? new Date(note.created_at).toLocaleDateString() : '';

    csv += `${page},${section},${content},${tags},${date},${completed},${createdAt}\n`;
  }

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, 'slate-notes.csv');

  return { success: true, noteCount: notes?.length || 0 };
}

// =============================================================================
// Full Backup
// =============================================================================

/**
 * Create a full backup of the workspace including chat history and settings
 */
export async function backupWorkspace() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Fetch all data in parallel
  const [pagesResult, chatResult, settingsResult] = await Promise.all([
    supabase
      .from('pages')
      .select(`
        id,
        name,
        starred,
        created_at,
        sections (
          id,
          name,
          position,
          created_at,
          notes (*)
        )
      `)
      .eq('user_id', user.id),
    supabase
      .from('chat_history')
      .select('id, role, content, metadata, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true }),
    supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', user.id)
      .single()
  ]);

  const backup = {
    version: '1.0',
    backupDate: new Date().toISOString(),
    userId: user.id,
    email: user.email,
    pages: pagesResult.data || [],
    chatHistory: chatResult.data || [],
    settings: settingsResult.data || null,
    metadata: {
      pageCount: pagesResult.data?.length || 0,
      chatMessageCount: chatResult.data?.length || 0
    }
  };

  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const dateStr = new Date().toISOString().split('T')[0];
  downloadBlob(blob, `slate-backup-${dateStr}.json`);

  return { success: true, metadata: backup.metadata };
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Download a blob as a file
 * @param {Blob} blob - The blob to download
 * @param {string} filename - The filename for the download
 */
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Sanitize a string for use as a filename
 * @param {string} name - The name to sanitize
 * @returns {string} Sanitized filename
 */
function sanitizeFilename(name) {
  return name
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 100);
}

/**
 * Escape a string for CSV format
 * @param {string} str - The string to escape
 * @returns {string} Escaped string
 */
function escapeCSV(str) {
  if (!str) return '';
  // If contains comma, newline, or quote, wrap in quotes and escape quotes
  if (str.includes(',') || str.includes('\n') || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export default {
  exportAsMarkdown,
  exportAsJSON,
  exportAsCSV,
  backupWorkspace
};
