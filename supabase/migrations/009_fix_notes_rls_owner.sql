-- ============================================================================
-- FIX NOTES RLS FOR PAGE OWNERS
-- Migration: 009_fix_notes_rls_owner.sql
-- Description: notes_update and notes_delete policies from 003_collaboration
--   only check page_permissions, but page owners may not have a row there.
--   Add fallback check for pages.user_id = auth.uid().
-- ============================================================================

-- Fix notes_update: allow page owner (via pages.user_id) in addition to page_permissions
DROP POLICY IF EXISTS notes_update ON notes;
CREATE POLICY notes_update ON notes
  FOR UPDATE USING (
    -- Page owner can always edit
    EXISTS (
      SELECT 1 FROM sections s
      JOIN pages p ON p.id = s.page_id
      WHERE s.id = notes.section_id
        AND p.user_id = auth.uid()
    )
    OR
    -- Owner/Team-Admin via permissions can edit any note
    EXISTS (
      SELECT 1 FROM sections s
      JOIN page_permissions pp ON pp.page_id = s.page_id
      WHERE s.id = notes.section_id
        AND pp.user_id = auth.uid()
        AND pp.role IN ('owner', 'team-admin')
    )
    OR
    -- Team can edit own notes
    (
      created_by_user_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM sections s
        JOIN page_permissions pp ON pp.page_id = s.page_id
        WHERE s.id = notes.section_id
          AND pp.user_id = auth.uid()
          AND pp.role = 'team'
      )
    )
    OR
    -- Team-Limited can update (for completion tracking)
    EXISTS (
      SELECT 1 FROM sections s
      JOIN page_permissions pp ON pp.page_id = s.page_id
      WHERE s.id = notes.section_id
        AND pp.user_id = auth.uid()
        AND pp.role = 'team-limited'
    )
  );

-- Fix notes_delete: allow page owner (via pages.user_id) in addition to page_permissions
DROP POLICY IF EXISTS notes_delete ON notes;
CREATE POLICY notes_delete ON notes
  FOR DELETE USING (
    -- Page owner can always delete
    EXISTS (
      SELECT 1 FROM sections s
      JOIN pages p ON p.id = s.page_id
      WHERE s.id = notes.section_id
        AND p.user_id = auth.uid()
    )
    OR
    -- Owner/Team-Admin via permissions can delete any note
    EXISTS (
      SELECT 1 FROM sections s
      JOIN page_permissions pp ON pp.page_id = s.page_id
      WHERE s.id = notes.section_id
        AND pp.user_id = auth.uid()
        AND pp.role IN ('owner', 'team-admin')
    )
    OR
    -- Team can delete own notes
    (
      created_by_user_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM sections s
        JOIN page_permissions pp ON pp.page_id = s.page_id
        WHERE s.id = notes.section_id
          AND pp.user_id = auth.uid()
          AND pp.role = 'team'
      )
    )
  );

-- Also fix sections_insert/update/delete for page owners without page_permissions
DROP POLICY IF EXISTS sections_insert ON sections;
CREATE POLICY sections_insert ON sections
  FOR INSERT WITH CHECK (
    page_id IN (SELECT id FROM pages WHERE user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM page_permissions
      WHERE page_permissions.page_id = sections.page_id
        AND page_permissions.user_id = auth.uid()
        AND page_permissions.role IN ('owner', 'team-admin', 'team')
    )
  );

DROP POLICY IF EXISTS sections_update ON sections;
CREATE POLICY sections_update ON sections
  FOR UPDATE USING (
    page_id IN (SELECT id FROM pages WHERE user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM page_permissions
      WHERE page_permissions.page_id = sections.page_id
        AND page_permissions.user_id = auth.uid()
        AND page_permissions.role IN ('owner', 'team-admin', 'team')
    )
  );

DROP POLICY IF EXISTS sections_delete ON sections;
CREATE POLICY sections_delete ON sections
  FOR DELETE USING (
    page_id IN (SELECT id FROM pages WHERE user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM page_permissions
      WHERE page_permissions.page_id = sections.page_id
        AND page_permissions.user_id = auth.uid()
        AND page_permissions.role IN ('owner', 'team-admin')
    )
  );
