/**
 * Serverless API route for generating embeddings and managing RAG
 *
 * Endpoints via action parameter:
 * - generate: Generate embedding for text
 * - search_notes: Semantic search across notes
 * - search_chat: Semantic search across chat history
 * - store_chat: Store chat message with embedding
 */

const OPENAI_ENDPOINT = 'https://api.openai.com/v1/embeddings';
const EMBEDDING_MODEL = 'text-embedding-3-small';

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
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `Embedding API error: ${response.status}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

/**
 * Call Supabase RPC function
 */
async function callSupabaseRpc(functionName, params, supabaseUrl, supabaseKey) {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${functionName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `Supabase RPC error: ${response.status}`);
  }

  return response.json();
}

/**
 * Insert into Supabase table
 */
async function supabaseInsert(table, data, supabaseUrl, supabaseKey) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `Supabase insert error: ${response.status}`);
  }

  return true;
}

/**
 * Update note embedding in Supabase
 */
async function updateNoteEmbedding(noteId, embedding, supabaseUrl, supabaseKey) {
  const response = await fetch(`${supabaseUrl}/rest/v1/notes?id=eq.${noteId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify({ embedding }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `Supabase update error: ${response.status}`);
  }

  return true;
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

  if (!openaiKey) {
    return res.status(500).json({ error: 'OpenAI API key not configured' });
  }
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  try {
    const { action, ...params } = req.body;

    switch (action) {
      case 'generate': {
        // Generate embedding for text
        const { text } = params;
        if (!text) {
          return res.status(400).json({ error: 'Missing text parameter' });
        }
        const embedding = await generateEmbedding(text, openaiKey);
        return res.status(200).json({ embedding });
      }

      case 'embed_note': {
        // Generate and store embedding for a note
        const { noteId, content } = params;
        if (!noteId || !content) {
          return res.status(400).json({ error: 'Missing noteId or content' });
        }
        const embedding = await generateEmbedding(content, openaiKey);
        await updateNoteEmbedding(noteId, embedding, supabaseUrl, supabaseKey);
        return res.status(200).json({ success: true });
      }

      case 'search_notes': {
        // Semantic search across notes
        const { query, userId, threshold = 0.5, limit = 10 } = params;
        if (!query) {
          return res.status(400).json({ error: 'Missing query parameter' });
        }
        const embedding = await generateEmbedding(query, openaiKey);
        const results = await callSupabaseRpc('match_notes', {
          query_embedding: embedding,
          match_threshold: threshold,
          match_count: limit,
          p_user_id: userId || null,
        }, supabaseUrl, supabaseKey);
        return res.status(200).json({ results });
      }

      case 'search_chat': {
        // Semantic search across chat history
        const { query, userId, threshold = 0.5, limit = 10 } = params;
        if (!query) {
          return res.status(400).json({ error: 'Missing query parameter' });
        }
        const embedding = await generateEmbedding(query, openaiKey);
        const results = await callSupabaseRpc('match_chat_history', {
          query_embedding: embedding,
          match_threshold: threshold,
          match_count: limit,
          p_user_id: userId || null,
        }, supabaseUrl, supabaseKey);
        return res.status(200).json({ results });
      }

      case 'store_chat': {
        // Store chat message with embedding
        const { userId, role, content, metadata = {} } = params;
        if (!userId || !role || !content) {
          return res.status(400).json({ error: 'Missing required parameters' });
        }
        const embedding = await generateEmbedding(content, openaiKey);
        await supabaseInsert('chat_history', {
          user_id: userId,
          role,
          content,
          embedding,
          metadata,
        }, supabaseUrl, supabaseKey);
        return res.status(200).json({ success: true });
      }

      case 'get_context': {
        // Get database context for RAG
        const { userId } = params;
        if (!userId) {
          return res.status(400).json({ error: 'Missing userId parameter' });
        }
        const context = await callSupabaseRpc('get_database_context', {
          p_user_id: userId,
        }, supabaseUrl, supabaseKey);
        return res.status(200).json({ context });
      }

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }

  } catch (error) {
    console.error('Embeddings API error:', error);
    return res.status(500).json({ error: error.message });
  }
}
