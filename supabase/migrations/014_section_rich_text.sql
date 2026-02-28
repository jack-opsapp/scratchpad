-- Add rich text support to sections
-- section_type: 'notes' (default) or 'richtext'
-- rich_content: stores the markdown content for richtext sections
ALTER TABLE sections
ADD COLUMN IF NOT EXISTS section_type TEXT NOT NULL DEFAULT 'notes';

ALTER TABLE sections
ADD COLUMN IF NOT EXISTS rich_content TEXT;
