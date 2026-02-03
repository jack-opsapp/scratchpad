/**
 * Serverless API route to backfill embeddings for existing notes
 *
 * Call with POST to generate embeddings for all notes missing them.
 * Processes in batches to avoid timeouts.
 */

const OPENAI_ENDPOINT = 'https://api.openai.com/v1/embeddings';
const EMBEDDING_MODEL = 'text-embedding-3-small';
const BATCH_SIZE = 20; // Process 20 notes at a time

/**
 * Generate embedding for text using OpenAI
 */
async function generateEmbedding(text, apiKey) {
  const response = await fetch(OPENAI_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: text,
    }),
  });

  if (!response.ok) {
    throw new Error(`Embedding API error: ${response.status}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Check for API keys
  const openaiKey = process.env.OPENAI_API_KEY;
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

  if (!openaiKey || !supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'API keys not configured' });
  }

  try {
    // Get notes without embeddings
    const notesResponse = await fetch(
      `${supabaseUrl}/rest/v1/notes?embedding=is.null&select=id,content&limit=${BATCH_SIZE}`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        },
      }
    );

    if (!notesResponse.ok) {
      throw new Error(`Failed to fetch notes: ${notesResponse.status}`);
    }

    const notes = await notesResponse.json();

    if (notes.length === 0) {
      return res.status(200).json({
        message: 'All notes have embeddings',
        processed: 0,
        remaining: 0
      });
    }

    // Process each note
    let processed = 0;
    let errors = 0;

    for (const note of notes) {
      try {
        // Generate embedding
        const embedding = await generateEmbedding(note.content, openaiKey);

        // Update note with embedding
        const updateResponse = await fetch(
          `${supabaseUrl}/rest/v1/notes?id=eq.${note.id}`,
          {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`,
              'Prefer': 'return=minimal',
            },
            body: JSON.stringify({ embedding }),
          }
        );

        if (updateResponse.ok) {
          processed++;
        } else {
          errors++;
          console.error(`Failed to update note ${note.id}`);
        }
      } catch (error) {
        errors++;
        console.error(`Error processing note ${note.id}:`, error.message);
      }
    }

    // Check how many notes still need embeddings
    const countResponse = await fetch(
      `${supabaseUrl}/rest/v1/notes?embedding=is.null&select=id`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Prefer': 'count=exact',
        },
      }
    );

    const remaining = parseInt(countResponse.headers.get('content-range')?.split('/')[1] || '0');

    return res.status(200).json({
      message: remaining > 0 ? 'Batch processed, more notes remaining' : 'All notes processed',
      processed,
      errors,
      remaining,
      callAgain: remaining > 0
    });

  } catch (error) {
    console.error('Backfill error:', error);
    return res.status(500).json({ error: error.message });
  }
}
