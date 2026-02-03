-- ============================================================================
-- SCRATCHPAD RAG VECTOR SUPPORT
-- Migration: 005_rag_vector_support.sql
-- Description: Adds pgvector support for semantic search over notes and chat
--              history, enabling RAG (Retrieval Augmented Generation)
-- ============================================================================

-- ============================================================================
-- SECTION 1: ENABLE VECTOR EXTENSION
-- ============================================================================

-- Enable the pgvector extension for semantic search
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- ============================================================================
-- SECTION 2: ADD EMBEDDING COLUMN TO NOTES
-- ============================================================================

-- Add embedding column to notes table
-- Using 1536 dimensions for OpenAI text-embedding-3-small
ALTER TABLE notes ADD COLUMN IF NOT EXISTS embedding extensions.vector(1536);

-- Index for fast similarity search on notes
CREATE INDEX IF NOT EXISTS idx_notes_embedding ON notes
USING ivfflat (embedding extensions.vector_cosine_ops)
WITH (lists = 100);

-- ============================================================================
-- SECTION 3: CHAT HISTORY TABLE
-- ============================================================================

-- Table: chat_history
-- Description: Stores conversation history with embeddings for context retrieval
CREATE TABLE IF NOT EXISTS chat_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  embedding extensions.vector(1536),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE chat_history IS 'Conversation history with embeddings for RAG';
COMMENT ON COLUMN chat_history.role IS 'Message role: user or assistant';
COMMENT ON COLUMN chat_history.content IS 'Message content';
COMMENT ON COLUMN chat_history.embedding IS 'Vector embedding for semantic search';
COMMENT ON COLUMN chat_history.metadata IS 'Additional metadata (context, actions taken, etc.)';

-- Index for fast similarity search on chat history
CREATE INDEX IF NOT EXISTS idx_chat_history_embedding ON chat_history
USING ivfflat (embedding extensions.vector_cosine_ops)
WITH (lists = 100);

-- Index for user lookups
CREATE INDEX IF NOT EXISTS idx_chat_history_user_id ON chat_history(user_id);

-- Index for recent messages
CREATE INDEX IF NOT EXISTS idx_chat_history_created_at ON chat_history(created_at DESC);

-- ============================================================================
-- SECTION 4: SEMANTIC SEARCH FUNCTIONS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Function: match_notes
-- Description: Find notes most similar to a query embedding
-- Parameters:
--   query_embedding: The embedding vector to match against
--   match_threshold: Minimum similarity score (0 to 1, higher = more similar)
--   match_count: Maximum number of results to return
--   p_user_id: User ID for RLS filtering
-- Returns: Table of matching notes with similarity scores
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION match_notes(
  query_embedding extensions.vector(1536),
  match_threshold FLOAT DEFAULT 0.5,
  match_count INT DEFAULT 10,
  p_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  section_id UUID,
  content TEXT,
  completed BOOLEAN,
  date TEXT,
  tags TEXT[],
  created_at TIMESTAMPTZ,
  section_name TEXT,
  page_name TEXT,
  page_id UUID,
  similarity FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    n.id,
    n.section_id,
    n.content,
    n.completed,
    n.date,
    n.tags,
    n.created_at,
    s.name AS section_name,
    p.name AS page_name,
    p.id AS page_id,
    1 - (n.embedding <=> query_embedding) AS similarity
  FROM notes n
  JOIN sections s ON s.id = n.section_id
  JOIN pages p ON p.id = s.page_id
  WHERE
    n.embedding IS NOT NULL
    AND 1 - (n.embedding <=> query_embedding) > match_threshold
    AND (
      p_user_id IS NULL
      OR p.user_id = p_user_id
      OR EXISTS (
        SELECT 1 FROM page_permissions pp
        WHERE pp.page_id = p.id AND pp.user_id = p_user_id
      )
    )
  ORDER BY n.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ----------------------------------------------------------------------------
-- Function: match_chat_history
-- Description: Find chat messages most similar to a query embedding
-- Parameters:
--   query_embedding: The embedding vector to match against
--   match_threshold: Minimum similarity score (0 to 1)
--   match_count: Maximum number of results to return
--   p_user_id: User ID for filtering
-- Returns: Table of matching chat messages with similarity scores
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION match_chat_history(
  query_embedding extensions.vector(1536),
  match_threshold FLOAT DEFAULT 0.5,
  match_count INT DEFAULT 10,
  p_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  role TEXT,
  content TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ,
  similarity FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ch.id,
    ch.role,
    ch.content,
    ch.metadata,
    ch.created_at,
    1 - (ch.embedding <=> query_embedding) AS similarity
  FROM chat_history ch
  WHERE
    ch.embedding IS NOT NULL
    AND 1 - (ch.embedding <=> query_embedding) > match_threshold
    AND (p_user_id IS NULL OR ch.user_id = p_user_id)
  ORDER BY ch.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ----------------------------------------------------------------------------
-- Function: get_database_context
-- Description: Get full context for RAG including pages, sections, tags summary
-- Parameters:
--   p_user_id: User ID for filtering
-- Returns: JSON object with database context
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_database_context(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'pages', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', p.id,
        'name', p.name,
        'starred', p.starred,
        'sections', (
          SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'id', s.id,
            'name', s.name,
            'noteCount', (SELECT COUNT(*) FROM notes n WHERE n.section_id = s.id)
          ) ORDER BY s.position), '[]'::jsonb)
          FROM sections s WHERE s.page_id = p.id
        )
      ) ORDER BY p.position), '[]'::jsonb)
      FROM pages p
      WHERE p.user_id = p_user_id
         OR EXISTS (
           SELECT 1 FROM page_permissions pp
           WHERE pp.page_id = p.id AND pp.user_id = p_user_id
         )
    ),
    'allTags', (
      SELECT COALESCE(jsonb_agg(DISTINCT tag), '[]'::jsonb)
      FROM notes n
      JOIN sections s ON s.id = n.section_id
      JOIN pages p ON p.id = s.page_id
      CROSS JOIN LATERAL unnest(n.tags) AS tag
      WHERE p.user_id = p_user_id
         OR EXISTS (
           SELECT 1 FROM page_permissions pp
           WHERE pp.page_id = p.id AND pp.user_id = p_user_id
         )
    ),
    'stats', jsonb_build_object(
      'totalNotes', (
        SELECT COUNT(*)
        FROM notes n
        JOIN sections s ON s.id = n.section_id
        JOIN pages p ON p.id = s.page_id
        WHERE p.user_id = p_user_id
           OR EXISTS (
             SELECT 1 FROM page_permissions pp
             WHERE pp.page_id = p.id AND pp.user_id = p_user_id
           )
      ),
      'completedNotes', (
        SELECT COUNT(*)
        FROM notes n
        JOIN sections s ON s.id = n.section_id
        JOIN pages p ON p.id = s.page_id
        WHERE n.completed = true
          AND (p.user_id = p_user_id
           OR EXISTS (
             SELECT 1 FROM page_permissions pp
             WHERE pp.page_id = p.id AND pp.user_id = p_user_id
           ))
      )
    )
  ) INTO result;

  RETURN result;
END;
$$;

-- ============================================================================
-- SECTION 5: RLS POLICIES FOR CHAT HISTORY
-- ============================================================================

-- Enable RLS on chat_history
ALTER TABLE chat_history ENABLE ROW LEVEL SECURITY;

-- Users can only see their own chat history
CREATE POLICY chat_history_select ON chat_history
  FOR SELECT
  USING (user_id = auth.uid());

-- Users can only insert their own chat history
CREATE POLICY chat_history_insert ON chat_history
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Users can only delete their own chat history
CREATE POLICY chat_history_delete ON chat_history
  FOR DELETE
  USING (user_id = auth.uid());

-- ============================================================================
-- SECTION 6: GRANTS
-- ============================================================================

-- Grant access to chat_history
GRANT SELECT, INSERT, DELETE ON chat_history TO authenticated;

-- Grant execute on functions
GRANT EXECUTE ON FUNCTION match_notes TO authenticated;
GRANT EXECUTE ON FUNCTION match_chat_history TO authenticated;
GRANT EXECUTE ON FUNCTION get_database_context TO authenticated;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
