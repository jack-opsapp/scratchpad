import { createClient } from '@supabase/supabase-js';

const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Initialize clients inside handler to catch errors
    const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    const OPENAI_KEY = process.env.OPENAI_API_KEY;

    if (!SUPABASE_URL || !SUPABASE_KEY) {
      console.error('Supabase not configured - missing env vars');
      return res.status(500).json({ error: 'Database not configured' });
    }
    if (!OPENAI_KEY) {
      console.error('OpenAI not configured - missing OPENAI_API_KEY');
      return res.status(500).json({ error: 'AI service not configured' });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    const { userId, filter = {} } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId required' });
    }

    // Step 1: Get user's pages
    const { data: pages, error: pagesError } = await supabase
      .from('pages')
      .select('id, name')
      .eq('user_id', userId);

    if (pagesError) {
      console.error('Failed to fetch pages:', pagesError);
      return res.status(500).json({ error: 'Failed to fetch pages', details: pagesError.message });
    }

    if (!pages || pages.length === 0) {
      return res.json({
        success: true,
        message: 'No pages found for user',
        suggestions: []
      });
    }

    const pageIds = pages.map(p => p.id);
    const pageMap = Object.fromEntries(pages.map(p => [p.id, p.name]));

    // Step 2: Get sections for those pages
    const { data: sections, error: sectionsError } = await supabase
      .from('sections')
      .select('id, name, page_id')
      .in('page_id', pageIds);

    if (sectionsError) {
      console.error('Failed to fetch sections:', sectionsError);
      return res.status(500).json({ error: 'Failed to fetch sections', details: sectionsError.message });
    }

    if (!sections || sections.length === 0) {
      return res.json({
        success: true,
        message: 'No sections found',
        suggestions: []
      });
    }

    const sectionIds = sections.map(s => s.id);
    const sectionMap = Object.fromEntries(sections.map(s => [s.id, { name: s.name, pageName: pageMap[s.page_id] }]));

    // Step 3: Get notes for those sections
    let notesQuery = supabase
      .from('notes')
      .select('id, content, tags, section_id')
      .in('section_id', sectionIds);

    // Apply filters
    if (filter.untagged) {
      notesQuery = notesQuery.or('tags.is.null,tags.eq.{}');
    }
    if (filter.sectionId) {
      notesQuery = notesQuery.eq('section_id', filter.sectionId);
    }

    const { data: notes, error: notesError } = await notesQuery;

    if (notesError) {
      console.error('Failed to fetch notes:', notesError);
      return res.status(500).json({ error: 'Failed to fetch notes', details: notesError.message });
    }

    if (!notes || notes.length === 0) {
      return res.json({
        success: true,
        message: 'No notes found matching criteria',
        suggestions: []
      });
    }

    // Get existing tags from all notes
    const existingTags = [...new Set(
      notes
        .flatMap(n => n.tags || [])
        .filter(Boolean)
    )];

    // Prepare notes for analysis (batch to avoid token limits)
    const notesForAnalysis = notes.slice(0, 50).map(n => ({
      id: n.id,
      content: n.content,
      currentTags: n.tags || [],
      section: sectionMap[n.section_id]?.name,
      page: sectionMap[n.section_id]?.pageName
    }));

    // Call LLM to analyze notes and suggest tags
    const prompt = `You are a note organization assistant. Analyze these notes and suggest appropriate tags for each.

EXISTING TAGS IN USE: ${existingTags.length > 0 ? existingTags.join(', ') : 'None'}

NOTES TO ANALYZE:
${notesForAnalysis.map((n, i) => `${i + 1}. [${n.page}/${n.section}] "${n.content}"${n.currentTags.length > 0 ? ` (current tags: ${n.currentTags.join(', ')})` : ''}`).join('\n')}

INSTRUCTIONS:
1. For each note, suggest 1-3 relevant tags based on its content
2. PREFER existing tags when they fit - consistency is important
3. Only create new tags if the content clearly doesn't fit existing categories
4. Tags should be lowercase, single words or hyphenated (e.g., "bug-fix", "meeting-notes")
5. Skip notes that already have appropriate tags

Respond with JSON only:
{
  "suggestions": [
    {"noteId": "uuid", "tags": ["tag1", "tag2"], "reason": "brief reason"},
    ...
  ],
  "newTagsNeeded": ["any-new-tag", ...],
  "summary": "Brief summary of what you found"
}`;

    const response = await fetch(OPENAI_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-2024-11-20',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        response_format: { type: 'json_object' }
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('OpenAI API error:', errorData);
      return res.status(500).json({ error: 'AI analysis failed' });
    }

    const completion = await response.json();
    const analysis = JSON.parse(completion.choices[0].message.content);

    return res.json({
      success: true,
      totalNotes: notes.length,
      analyzedNotes: notesForAnalysis.length,
      existingTags,
      ...analysis
    });

  } catch (error) {
    console.error('Tag analysis error:', error);
    return res.status(500).json({
      error: 'Failed to analyze tags',
      details: error.message
    });
  }
}
