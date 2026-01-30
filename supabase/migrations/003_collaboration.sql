-- =============================================================================
-- SCRATCHPAD PHASE 1: MULTI-USER COLLABORATION
-- Migration 003: Collaboration tables and policies
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. UPDATE page_permissions role constraint
-- -----------------------------------------------------------------------------
ALTER TABLE page_permissions
  DROP CONSTRAINT IF EXISTS page_permissions_role_check;

ALTER TABLE page_permissions
  ADD CONSTRAINT page_permissions_role_check
  CHECK (role IN ('owner', 'team-admin', 'team', 'team-limited'));


-- -----------------------------------------------------------------------------
-- 2. ADD completion tracking to notes
-- -----------------------------------------------------------------------------
ALTER TABLE notes
  ADD COLUMN IF NOT EXISTS completed_by_user_id UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;


-- -----------------------------------------------------------------------------
-- 3. CREATE pending_invitations table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pending_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('team-admin', 'team', 'team-limited')),
  invited_by_user_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days',
  UNIQUE(page_id, email)
);

CREATE INDEX IF NOT EXISTS idx_pending_invitations_email ON pending_invitations(email);
CREATE INDEX IF NOT EXISTS idx_pending_invitations_page_id ON pending_invitations(page_id);


-- -----------------------------------------------------------------------------
-- 4. CREATE public_links table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  password_hash TEXT,
  is_active BOOLEAN DEFAULT true,
  created_by_user_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  view_count INTEGER DEFAULT 0,
  last_viewed_at TIMESTAMPTZ,
  UNIQUE(page_id)
);

CREATE INDEX IF NOT EXISTS idx_public_links_token ON public_links(token);
CREATE INDEX IF NOT EXISTS idx_public_links_page_id ON public_links(page_id);


-- -----------------------------------------------------------------------------
-- 5. ADD created_by tracking to sections
-- -----------------------------------------------------------------------------
ALTER TABLE sections
  ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES users(id);


-- -----------------------------------------------------------------------------
-- 6. CREATE trigger for auto-applying pending invitations
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION apply_pending_invitations()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO page_permissions (page_id, user_id, role)
  SELECT page_id, NEW.id, role
  FROM pending_invitations
  WHERE email = NEW.email
    AND expires_at > NOW();

  DELETE FROM pending_invitations
  WHERE email = NEW.email;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_user_created_apply_invites ON users;
CREATE TRIGGER on_user_created_apply_invites
  AFTER INSERT ON users
  FOR EACH ROW
  EXECUTE FUNCTION apply_pending_invitations();


-- -----------------------------------------------------------------------------
-- 7. ENABLE RLS on new tables
-- -----------------------------------------------------------------------------
ALTER TABLE pending_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public_links ENABLE ROW LEVEL SECURITY;


-- -----------------------------------------------------------------------------
-- 8. CREATE RLS policies for pending_invitations (owner/team-admin only)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS pending_invitations_select ON pending_invitations;
DROP POLICY IF EXISTS pending_invitations_insert ON pending_invitations;
DROP POLICY IF EXISTS pending_invitations_delete ON pending_invitations;

CREATE POLICY pending_invitations_select ON pending_invitations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM page_permissions
      WHERE page_permissions.page_id = pending_invitations.page_id
        AND page_permissions.user_id = auth.uid()
        AND page_permissions.role IN ('owner', 'team-admin')
    )
  );

CREATE POLICY pending_invitations_insert ON pending_invitations
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM page_permissions
      WHERE page_permissions.page_id = pending_invitations.page_id
        AND page_permissions.user_id = auth.uid()
        AND page_permissions.role IN ('owner', 'team-admin')
    )
  );

CREATE POLICY pending_invitations_delete ON pending_invitations
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM page_permissions
      WHERE page_permissions.page_id = pending_invitations.page_id
        AND page_permissions.user_id = auth.uid()
        AND page_permissions.role IN ('owner', 'team-admin')
    )
  );


-- -----------------------------------------------------------------------------
-- 9. CREATE RLS policies for public_links (owner/team-admin only)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS public_links_select ON public_links;
DROP POLICY IF EXISTS public_links_insert ON public_links;
DROP POLICY IF EXISTS public_links_update ON public_links;

CREATE POLICY public_links_select ON public_links
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM page_permissions
      WHERE page_permissions.page_id = public_links.page_id
        AND page_permissions.user_id = auth.uid()
        AND page_permissions.role IN ('owner', 'team-admin')
    )
  );

CREATE POLICY public_links_insert ON public_links
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM page_permissions
      WHERE page_permissions.page_id = public_links.page_id
        AND page_permissions.user_id = auth.uid()
        AND page_permissions.role IN ('owner', 'team-admin')
    )
  );

CREATE POLICY public_links_update ON public_links
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM page_permissions
      WHERE page_permissions.page_id = public_links.page_id
        AND page_permissions.user_id = auth.uid()
        AND page_permissions.role IN ('owner', 'team-admin')
    )
  );


-- -----------------------------------------------------------------------------
-- 10. UPDATE sections RLS policies (team can create/update, owner/team-admin can delete)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS sections_insert ON sections;
DROP POLICY IF EXISTS sections_update ON sections;
DROP POLICY IF EXISTS sections_delete ON sections;

CREATE POLICY sections_insert ON sections
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM page_permissions
      WHERE page_permissions.page_id = sections.page_id
        AND page_permissions.user_id = auth.uid()
        AND page_permissions.role IN ('owner', 'team-admin', 'team')
    )
  );

CREATE POLICY sections_update ON sections
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM page_permissions
      WHERE page_permissions.page_id = sections.page_id
        AND page_permissions.user_id = auth.uid()
        AND page_permissions.role IN ('owner', 'team-admin', 'team')
    )
  );

CREATE POLICY sections_delete ON sections
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM page_permissions
      WHERE page_permissions.page_id = sections.page_id
        AND page_permissions.user_id = auth.uid()
        AND page_permissions.role IN ('owner', 'team-admin')
    )
  );


-- -----------------------------------------------------------------------------
-- 11. UPDATE notes RLS policies (owner/team-admin edit any, team edit own)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS notes_update ON notes;
DROP POLICY IF EXISTS notes_delete ON notes;

CREATE POLICY notes_update ON notes
  FOR UPDATE USING (
    -- Owner/Team-Admin can edit any note
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
    -- Team-Limited can mark complete (for completion tracking)
    EXISTS (
      SELECT 1 FROM sections s
      JOIN page_permissions pp ON pp.page_id = s.page_id
      WHERE s.id = notes.section_id
        AND pp.user_id = auth.uid()
        AND pp.role = 'team-limited'
    )
  );

CREATE POLICY notes_delete ON notes
  FOR DELETE USING (
    -- Owner/Team-Admin can delete any note
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


-- -----------------------------------------------------------------------------
-- 12. UPDATE page_permissions RLS (owner/team-admin can manage)
-- Note: Team-Admin cannot modify Owner is enforced in application logic
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS page_permissions_insert ON page_permissions;
DROP POLICY IF EXISTS page_permissions_delete ON page_permissions;
DROP POLICY IF EXISTS page_permissions_update ON page_permissions;

CREATE POLICY page_permissions_insert ON page_permissions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM page_permissions existing
      WHERE existing.page_id = page_permissions.page_id
        AND existing.user_id = auth.uid()
        AND existing.role IN ('owner', 'team-admin')
    )
  );

CREATE POLICY page_permissions_delete ON page_permissions
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM page_permissions existing
      WHERE existing.page_id = page_permissions.page_id
        AND existing.user_id = auth.uid()
        AND existing.role IN ('owner', 'team-admin')
    )
  );

CREATE POLICY page_permissions_update ON page_permissions
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM page_permissions existing
      WHERE existing.page_id = page_permissions.page_id
        AND existing.user_id = auth.uid()
        AND existing.role IN ('owner', 'team-admin')
    )
  );


-- -----------------------------------------------------------------------------
-- 13. ADD indexes for performance
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_notes_completed_by ON notes(completed_by_user_id);
CREATE INDEX IF NOT EXISTS idx_sections_created_by ON sections(created_by_user_id);


-- -----------------------------------------------------------------------------
-- 14. ADD RLS policy for public page viewing (unauthenticated)
-- This allows the public page to read data via public links
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS public_links_public_select ON public_links;
CREATE POLICY public_links_public_select ON public_links
  FOR SELECT USING (
    is_active = true
  );

-- Allow reading pages that have an active public link
DROP POLICY IF EXISTS pages_public_select ON pages;
CREATE POLICY pages_public_select ON pages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public_links
      WHERE public_links.page_id = pages.id
        AND public_links.is_active = true
    )
    OR user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM page_permissions
      WHERE page_permissions.page_id = pages.id
        AND page_permissions.user_id = auth.uid()
    )
  );

-- Allow reading sections for public pages
DROP POLICY IF EXISTS sections_public_select ON sections;
CREATE POLICY sections_public_select ON sections
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public_links
      WHERE public_links.page_id = sections.page_id
        AND public_links.is_active = true
    )
    OR EXISTS (
      SELECT 1 FROM page_permissions
      WHERE page_permissions.page_id = sections.page_id
        AND page_permissions.user_id = auth.uid()
    )
  );

-- Allow reading notes for public pages
DROP POLICY IF EXISTS notes_public_select ON notes;
CREATE POLICY notes_public_select ON notes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM sections s
      JOIN public_links pl ON pl.page_id = s.page_id
      WHERE s.id = notes.section_id
        AND pl.is_active = true
    )
    OR EXISTS (
      SELECT 1 FROM sections s
      JOIN page_permissions pp ON pp.page_id = s.page_id
      WHERE s.id = notes.section_id
        AND pp.user_id = auth.uid()
    )
  );


-- =============================================================================
-- END OF MIGRATION
-- =============================================================================
