-- ============================================================================
-- SCRATCHPAD DATABASE SCHEMA
-- Migration: 001_initial_schema.sql
-- Description: Initial database setup with tables, indexes, RLS policies,
--              and trigger functions for the Scratchpad application.
-- ============================================================================

-- ============================================================================
-- SECTION 1: HELPER FUNCTIONS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Function: update_updated_at_column
-- Description: Automatically sets updated_at to current timestamp on row update
-- Usage: Attached as a trigger to tables with updated_at columns
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- Function: handle_new_user
-- Description: Syncs new auth.users entries to public.users table
-- Usage: Triggered on INSERT to auth.users
-- Example: When a user signs up, their profile is auto-created
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, created_at, last_sign_in)
  VALUES (
    NEW.id,
    NEW.email,
    NOW(),
    NEW.last_sign_in_at
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    last_sign_in = EXCLUDED.last_sign_in;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- Function: create_page_owner_permission
-- Description: Automatically creates an 'owner' permission when a page is created
-- Usage: Triggered on INSERT to pages table
-- Example: INSERT INTO pages (user_id, name) VALUES (uuid, 'My Page')
--          -> Automatically creates page_permissions entry with role='owner'
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_page_owner_permission()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.page_permissions (page_id, user_id, role)
  VALUES (NEW.id, NEW.user_id, 'owner');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- SECTION 2: TABLES
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Table: users
-- Description: User profile table that syncs with auth.users
-- ----------------------------------------------------------------------------
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_sign_in TIMESTAMPTZ
);

COMMENT ON TABLE users IS 'User profiles synced from auth.users';
COMMENT ON COLUMN users.id IS 'References auth.users.id';
COMMENT ON COLUMN users.email IS 'User email address';
COMMENT ON COLUMN users.last_sign_in IS 'Last sign-in timestamp, updated on auth';

-- ----------------------------------------------------------------------------
-- Table: pages
-- Description: Top-level organization containers (like folders)
-- ----------------------------------------------------------------------------
CREATE TABLE pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  starred BOOLEAN DEFAULT FALSE,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE pages IS 'Top-level organizational containers';
COMMENT ON COLUMN pages.user_id IS 'Owner of the page';
COMMENT ON COLUMN pages.starred IS 'Whether page is starred/pinned';
COMMENT ON COLUMN pages.position IS 'Custom sort order (lower = higher priority)';

-- ----------------------------------------------------------------------------
-- Table: sections
-- Description: Sub-containers within pages
-- ----------------------------------------------------------------------------
CREATE TABLE sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE sections IS 'Sub-containers within pages';
COMMENT ON COLUMN sections.page_id IS 'Parent page reference';
COMMENT ON COLUMN sections.position IS 'Custom sort order within page';

-- ----------------------------------------------------------------------------
-- Table: notes
-- Description: Individual note items within sections
-- ----------------------------------------------------------------------------
CREATE TABLE notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id UUID NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  completed BOOLEAN DEFAULT FALSE,
  date TEXT,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by_user_id UUID REFERENCES users(id),

  -- Ensure no null elements in tags array
  CONSTRAINT tags_no_nulls CHECK (array_position(tags, NULL) IS NULL)
);

COMMENT ON TABLE notes IS 'Individual note items';
COMMENT ON COLUMN notes.section_id IS 'Parent section reference';
COMMENT ON COLUMN notes.content IS 'Note text content';
COMMENT ON COLUMN notes.completed IS 'Whether note/task is completed';
COMMENT ON COLUMN notes.date IS 'Optional date in "Mon D" format (e.g., "Jan 15")';
COMMENT ON COLUMN notes.tags IS 'Array of tag strings';
COMMENT ON COLUMN notes.created_by_user_id IS 'User who created the note (for shared pages)';

-- ----------------------------------------------------------------------------
-- Table: page_permissions
-- Description: Sharing permissions for pages
-- ----------------------------------------------------------------------------
CREATE TABLE page_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Each user can only have one permission entry per page
  CONSTRAINT page_permissions_unique UNIQUE (page_id, user_id),

  -- Role must be one of the allowed values
  CONSTRAINT page_permissions_role_check CHECK (role IN ('owner', 'editor', 'viewer'))
);

COMMENT ON TABLE page_permissions IS 'Sharing permissions for pages';
COMMENT ON COLUMN page_permissions.role IS 'Permission level: owner, editor, or viewer';

-- ----------------------------------------------------------------------------
-- Table: box_configs
-- Description: User view preferences (column order, view settings)
-- ----------------------------------------------------------------------------
CREATE TABLE box_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  context_id TEXT NOT NULL,
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Each user can only have one config per context
  CONSTRAINT box_configs_unique UNIQUE (user_id, context_id)
);

COMMENT ON TABLE box_configs IS 'User view preferences per context';
COMMENT ON COLUMN box_configs.context_id IS 'Context identifier (e.g., "page-uuid" or "section-uuid")';
COMMENT ON COLUMN box_configs.config IS 'JSON config object with view settings like { "order": [...] }';

-- ============================================================================
-- SECTION 3: INDEXES
-- ============================================================================

-- pages indexes
CREATE INDEX idx_pages_user_id ON pages(user_id);

-- sections indexes
CREATE INDEX idx_sections_page_id ON sections(page_id);

-- notes indexes
CREATE INDEX idx_notes_section_id ON notes(section_id);
CREATE INDEX idx_notes_created_at ON notes(created_at DESC);

-- page_permissions indexes (composite for efficient lookups)
CREATE INDEX idx_page_permissions_page_user ON page_permissions(page_id, user_id);

-- box_configs indexes (composite for efficient lookups)
CREATE INDEX idx_box_configs_user_context ON box_configs(user_id, context_id);

-- ============================================================================
-- SECTION 4: TRIGGERS
-- ============================================================================

-- Trigger: Sync auth.users to public.users on signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- Trigger: Update last_sign_in when user signs in
CREATE TRIGGER on_auth_user_updated
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- Trigger: Auto-update updated_at on pages
CREATE TRIGGER update_pages_updated_at
  BEFORE UPDATE ON pages
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger: Auto-update updated_at on sections
CREATE TRIGGER update_sections_updated_at
  BEFORE UPDATE ON sections
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger: Auto-update updated_at on notes
CREATE TRIGGER update_notes_updated_at
  BEFORE UPDATE ON notes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger: Auto-update updated_at on box_configs
CREATE TRIGGER update_box_configs_updated_at
  BEFORE UPDATE ON box_configs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger: Auto-create owner permission when page is created
CREATE TRIGGER create_page_owner_permission_trigger
  AFTER INSERT ON pages
  FOR EACH ROW
  EXECUTE FUNCTION create_page_owner_permission();

-- ============================================================================
-- SECTION 5: ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE page_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE box_configs ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- RLS Policies: users
-- ----------------------------------------------------------------------------

-- Users can read their own profile
CREATE POLICY users_select_own ON users
  FOR SELECT
  USING (id = auth.uid());

-- Users can update their own profile
CREATE POLICY users_update_own ON users
  FOR UPDATE
  USING (id = auth.uid());

-- ----------------------------------------------------------------------------
-- RLS Policies: pages
-- ----------------------------------------------------------------------------

-- SELECT: User owns page OR has permission to view
CREATE POLICY pages_select ON pages
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM page_permissions
      WHERE page_permissions.page_id = pages.id
        AND page_permissions.user_id = auth.uid()
    )
  );

-- INSERT: User must own the page
CREATE POLICY pages_insert ON pages
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- UPDATE: User owns page OR has editor/owner permission
CREATE POLICY pages_update ON pages
  FOR UPDATE
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM page_permissions
      WHERE page_permissions.page_id = pages.id
        AND page_permissions.user_id = auth.uid()
        AND page_permissions.role IN ('owner', 'editor')
    )
  );

-- DELETE: User owns page
CREATE POLICY pages_delete ON pages
  FOR DELETE
  USING (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- RLS Policies: sections
-- ----------------------------------------------------------------------------

-- SELECT: User owns parent page OR has permission
CREATE POLICY sections_select ON sections
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM pages
      WHERE pages.id = sections.page_id
        AND (
          pages.user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM page_permissions
            WHERE page_permissions.page_id = pages.id
              AND page_permissions.user_id = auth.uid()
          )
        )
    )
  );

-- INSERT: User owns parent page
CREATE POLICY sections_insert ON sections
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM pages
      WHERE pages.id = sections.page_id
        AND pages.user_id = auth.uid()
    )
  );

-- UPDATE: User owns parent page OR has editor permission
CREATE POLICY sections_update ON sections
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM pages
      WHERE pages.id = sections.page_id
        AND (
          pages.user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM page_permissions
            WHERE page_permissions.page_id = pages.id
              AND page_permissions.user_id = auth.uid()
              AND page_permissions.role IN ('owner', 'editor')
          )
        )
    )
  );

-- DELETE: User owns parent page
CREATE POLICY sections_delete ON sections
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM pages
      WHERE pages.id = sections.page_id
        AND pages.user_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------------------
-- RLS Policies: notes
-- ----------------------------------------------------------------------------

-- Helper: Check if user has access to a note's parent page
-- (Used in all notes policies via subquery to pages->sections chain)

-- SELECT: User has access to parent page
CREATE POLICY notes_select ON notes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM sections
      JOIN pages ON pages.id = sections.page_id
      WHERE sections.id = notes.section_id
        AND (
          pages.user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM page_permissions
            WHERE page_permissions.page_id = pages.id
              AND page_permissions.user_id = auth.uid()
          )
        )
    )
  );

-- INSERT: User has editor access to parent page
CREATE POLICY notes_insert ON notes
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM sections
      JOIN pages ON pages.id = sections.page_id
      WHERE sections.id = notes.section_id
        AND (
          pages.user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM page_permissions
            WHERE page_permissions.page_id = pages.id
              AND page_permissions.user_id = auth.uid()
              AND page_permissions.role IN ('owner', 'editor')
          )
        )
    )
  );

-- UPDATE: User has editor access to parent page
CREATE POLICY notes_update ON notes
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM sections
      JOIN pages ON pages.id = sections.page_id
      WHERE sections.id = notes.section_id
        AND (
          pages.user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM page_permissions
            WHERE page_permissions.page_id = pages.id
              AND page_permissions.user_id = auth.uid()
              AND page_permissions.role IN ('owner', 'editor')
          )
        )
    )
  );

-- DELETE: User has editor access to parent page
CREATE POLICY notes_delete ON notes
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM sections
      JOIN pages ON pages.id = sections.page_id
      WHERE sections.id = notes.section_id
        AND (
          pages.user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM page_permissions
            WHERE page_permissions.page_id = pages.id
              AND page_permissions.user_id = auth.uid()
              AND page_permissions.role IN ('owner', 'editor')
          )
        )
    )
  );

-- ----------------------------------------------------------------------------
-- RLS Policies: page_permissions
-- ----------------------------------------------------------------------------

-- SELECT: User is owner of page OR is in permissions list
CREATE POLICY page_permissions_select ON page_permissions
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM pages
      WHERE pages.id = page_permissions.page_id
        AND pages.user_id = auth.uid()
    )
  );

-- INSERT: User is owner of page
CREATE POLICY page_permissions_insert ON page_permissions
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM pages
      WHERE pages.id = page_permissions.page_id
        AND pages.user_id = auth.uid()
    )
  );

-- UPDATE: User is owner of page
CREATE POLICY page_permissions_update ON page_permissions
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM pages
      WHERE pages.id = page_permissions.page_id
        AND pages.user_id = auth.uid()
    )
  );

-- DELETE: User is owner of page
CREATE POLICY page_permissions_delete ON page_permissions
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM pages
      WHERE pages.id = page_permissions.page_id
        AND pages.user_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------------------
-- RLS Policies: box_configs
-- ----------------------------------------------------------------------------

-- SELECT: User owns the config
CREATE POLICY box_configs_select ON box_configs
  FOR SELECT
  USING (user_id = auth.uid());

-- INSERT: User owns the config
CREATE POLICY box_configs_insert ON box_configs
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- UPDATE: User owns the config
CREATE POLICY box_configs_update ON box_configs
  FOR UPDATE
  USING (user_id = auth.uid());

-- DELETE: User owns the config
CREATE POLICY box_configs_delete ON box_configs
  FOR DELETE
  USING (user_id = auth.uid());

-- ============================================================================
-- SECTION 6: GRANTS
-- ============================================================================

-- Grant usage on schema to authenticated users
GRANT USAGE ON SCHEMA public TO authenticated;

-- Grant table permissions to authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON users TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON pages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON sections TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON notes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON page_permissions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON box_configs TO authenticated;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
