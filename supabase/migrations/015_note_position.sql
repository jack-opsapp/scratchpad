-- Add position column to notes table for drag-to-reorder
ALTER TABLE notes ADD COLUMN IF NOT EXISTS position INTEGER DEFAULT 0;
