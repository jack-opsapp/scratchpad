-- ============================================================================
-- FIX RLS POLICIES
-- Migration: 002_fix_rls_policies.sql
-- Description: Fix infinite recursion and missing INSERT policies
-- ============================================================================

-- ============================================================================
-- SECTION 1: DROP EXISTING PROBLEMATIC POLICIES
-- ============================================================================

-- Drop all existing policies to start fresh
DROP POLICY IF EXISTS users_select_own ON users;
DROP POLICY IF EXISTS users_update_own ON users;

DROP POLICY IF EXISTS pages_select ON pages;
DROP POLICY IF EXISTS pages_insert ON pages;
DROP POLICY IF EXISTS pages_update ON pages;
DROP POLICY IF EXISTS pages_delete ON pages;

DROP POLICY IF EXISTS sections_select ON sections;
DROP POLICY IF EXISTS sections_insert ON sections;
DROP POLICY IF EXISTS sections_update ON sections;
DROP POLICY IF EXISTS sections_delete ON sections;

DROP POLICY IF EXISTS notes_select ON notes;
DROP POLICY IF EXISTS notes_insert ON notes;
DROP POLICY IF EXISTS notes_update ON notes;
DROP POLICY IF EXISTS notes_delete ON notes;

DROP POLICY IF EXISTS page_permissions_select ON page_permissions;
DROP POLICY IF EXISTS page_permissions_insert ON page_permissions;
DROP POLICY IF EXISTS page_permissions_update ON page_permissions;
DROP POLICY IF EXISTS page_permissions_delete ON page_permissions;

DROP POLICY IF EXISTS box_configs_select ON box_configs;
DROP POLICY IF EXISTS box_configs_insert ON box_configs;
DROP POLICY IF EXISTS box_configs_update ON box_configs;
DROP POLICY IF EXISTS box_configs_delete ON box_configs;

-- ============================================================================
-- SECTION 2: USERS TABLE POLICIES
-- ============================================================================

-- Users can read their own profile
CREATE POLICY users_select_own ON users
  FOR SELECT
  USING (id = auth.uid());

-- Users can insert their own profile (for sync on first login)
CREATE POLICY users_insert_own ON users
  FOR INSERT
  WITH CHECK (id = auth.uid());

-- Users can update their own profile
CREATE POLICY users_update_own ON users
  FOR UPDATE
  USING (id = auth.uid());

-- ============================================================================
-- SECTION 3: PAGES TABLE POLICIES (simplified, no recursion)
-- ============================================================================

-- SELECT: User owns page OR has direct permission entry
CREATE POLICY pages_select ON pages
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR id IN (
      SELECT page_id FROM page_permissions WHERE user_id = auth.uid()
    )
  );

-- INSERT: User sets themselves as owner
CREATE POLICY pages_insert ON pages
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- UPDATE: User owns page OR has editor/owner permission
CREATE POLICY pages_update ON pages
  FOR UPDATE
  USING (
    user_id = auth.uid()
    OR id IN (
      SELECT page_id FROM page_permissions
      WHERE user_id = auth.uid() AND role IN ('owner', 'editor')
    )
  );

-- DELETE: User owns page
CREATE POLICY pages_delete ON pages
  FOR DELETE
  USING (user_id = auth.uid());

-- ============================================================================
-- SECTION 4: SECTIONS TABLE POLICIES
-- ============================================================================

-- SELECT: User has access to parent page
CREATE POLICY sections_select ON sections
  FOR SELECT
  USING (
    page_id IN (
      SELECT id FROM pages WHERE user_id = auth.uid()
    )
    OR page_id IN (
      SELECT page_id FROM page_permissions WHERE user_id = auth.uid()
    )
  );

-- INSERT: User owns parent page
CREATE POLICY sections_insert ON sections
  FOR INSERT
  WITH CHECK (
    page_id IN (
      SELECT id FROM pages WHERE user_id = auth.uid()
    )
  );

-- UPDATE: User owns parent page or has editor permission
CREATE POLICY sections_update ON sections
  FOR UPDATE
  USING (
    page_id IN (
      SELECT id FROM pages WHERE user_id = auth.uid()
    )
    OR page_id IN (
      SELECT page_id FROM page_permissions
      WHERE user_id = auth.uid() AND role IN ('owner', 'editor')
    )
  );

-- DELETE: User owns parent page
CREATE POLICY sections_delete ON sections
  FOR DELETE
  USING (
    page_id IN (
      SELECT id FROM pages WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- SECTION 5: NOTES TABLE POLICIES
-- ============================================================================

-- Helper: Get section IDs user has access to
-- SELECT: User has access to parent section's page
CREATE POLICY notes_select ON notes
  FOR SELECT
  USING (
    section_id IN (
      SELECT s.id FROM sections s
      JOIN pages p ON p.id = s.page_id
      WHERE p.user_id = auth.uid()
    )
    OR section_id IN (
      SELECT s.id FROM sections s
      WHERE s.page_id IN (
        SELECT page_id FROM page_permissions WHERE user_id = auth.uid()
      )
    )
  );

-- INSERT: User has editor access to parent page
CREATE POLICY notes_insert ON notes
  FOR INSERT
  WITH CHECK (
    section_id IN (
      SELECT s.id FROM sections s
      JOIN pages p ON p.id = s.page_id
      WHERE p.user_id = auth.uid()
    )
    OR section_id IN (
      SELECT s.id FROM sections s
      WHERE s.page_id IN (
        SELECT page_id FROM page_permissions
        WHERE user_id = auth.uid() AND role IN ('owner', 'editor')
      )
    )
  );

-- UPDATE: User has editor access to parent page
CREATE POLICY notes_update ON notes
  FOR UPDATE
  USING (
    section_id IN (
      SELECT s.id FROM sections s
      JOIN pages p ON p.id = s.page_id
      WHERE p.user_id = auth.uid()
    )
    OR section_id IN (
      SELECT s.id FROM sections s
      WHERE s.page_id IN (
        SELECT page_id FROM page_permissions
        WHERE user_id = auth.uid() AND role IN ('owner', 'editor')
      )
    )
  );

-- DELETE: User has editor access to parent page
CREATE POLICY notes_delete ON notes
  FOR DELETE
  USING (
    section_id IN (
      SELECT s.id FROM sections s
      JOIN pages p ON p.id = s.page_id
      WHERE p.user_id = auth.uid()
    )
    OR section_id IN (
      SELECT s.id FROM sections s
      WHERE s.page_id IN (
        SELECT page_id FROM page_permissions
        WHERE user_id = auth.uid() AND role IN ('owner', 'editor')
      )
    )
  );

-- ============================================================================
-- SECTION 6: PAGE_PERMISSIONS TABLE POLICIES (no recursion)
-- ============================================================================

-- SELECT: User is the permission holder OR owns the page
CREATE POLICY page_permissions_select ON page_permissions
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR page_id IN (
      SELECT id FROM pages WHERE user_id = auth.uid()
    )
  );

-- INSERT: User owns the page (can grant permissions)
CREATE POLICY page_permissions_insert ON page_permissions
  FOR INSERT
  WITH CHECK (
    page_id IN (
      SELECT id FROM pages WHERE user_id = auth.uid()
    )
  );

-- UPDATE: User owns the page
CREATE POLICY page_permissions_update ON page_permissions
  FOR UPDATE
  USING (
    page_id IN (
      SELECT id FROM pages WHERE user_id = auth.uid()
    )
  );

-- DELETE: User owns the page
CREATE POLICY page_permissions_delete ON page_permissions
  FOR DELETE
  USING (
    page_id IN (
      SELECT id FROM pages WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- SECTION 7: BOX_CONFIGS TABLE POLICIES
-- ============================================================================

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
-- END OF MIGRATION
-- ============================================================================
