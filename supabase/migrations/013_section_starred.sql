-- Add starred flag to sections
-- Starred sections appear at the top of the page view
ALTER TABLE sections
ADD COLUMN IF NOT EXISTS starred BOOLEAN DEFAULT false;
