-- Add demo_complete flag to user_settings
-- Controls whether the first-time user demo has been shown
ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS demo_complete BOOLEAN DEFAULT false;
