-- Junction table for shared notes (one note appearing in multiple sections)
CREATE TABLE note_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  section_id UUID NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(note_id, section_id)
);

-- Index for fast lookups by section
CREATE INDEX idx_note_sections_section_id ON note_sections(section_id);
CREATE INDEX idx_note_sections_note_id ON note_sections(note_id);

-- Enable RLS
ALTER TABLE note_sections ENABLE ROW LEVEL SECURITY;

-- RLS policy: users can manage note_sections for notes they have access to
CREATE POLICY "Users can view note_sections for accessible notes"
  ON note_sections FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM notes n
      JOIN sections s ON n.section_id = s.id
      JOIN pages p ON s.page_id = p.id
      LEFT JOIN page_permissions pp ON pp.page_id = p.id
      WHERE n.id = note_sections.note_id
        AND (p.user_id = auth.uid() OR pp.user_id = auth.uid())
    )
  );

CREATE POLICY "Users can insert note_sections for accessible notes"
  ON note_sections FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM notes n
      JOIN sections s ON n.section_id = s.id
      JOIN pages p ON s.page_id = p.id
      LEFT JOIN page_permissions pp ON pp.page_id = p.id
      WHERE n.id = note_sections.note_id
        AND (p.user_id = auth.uid() OR pp.user_id = auth.uid())
    )
  );

CREATE POLICY "Users can delete note_sections for accessible notes"
  ON note_sections FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM notes n
      JOIN sections s ON n.section_id = s.id
      JOIN pages p ON s.page_id = p.id
      LEFT JOIN page_permissions pp ON pp.page_id = p.id
      WHERE n.id = note_sections.note_id
        AND (p.user_id = auth.uid() OR pp.user_id = auth.uid())
    )
  );
