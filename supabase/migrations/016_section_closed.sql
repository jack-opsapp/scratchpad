-- Add closed_at timestamp to sections for "closing" completed sections
ALTER TABLE sections ADD COLUMN IF NOT EXISTS closed_at timestamptz DEFAULT NULL;
