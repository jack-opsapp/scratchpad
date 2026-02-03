-- =============================================================================
-- Migration 007: Update Chat Styling Columns
-- =============================================================================
-- Replaces old chat color columns with new mode/brightness approach
-- =============================================================================

-- Drop old columns if they exist
ALTER TABLE user_settings DROP COLUMN IF EXISTS chat_text_color;
ALTER TABLE user_settings DROP COLUMN IF EXISTS chat_background_color;

-- Add new chat styling columns
ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS chat_agent_text_mode TEXT DEFAULT 'grayscale' CHECK (chat_agent_text_mode IN ('accent', 'grayscale'));

ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS chat_agent_text_brightness INTEGER DEFAULT 80 CHECK (chat_agent_text_brightness BETWEEN 0 AND 100);

ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS chat_user_text_mode TEXT DEFAULT 'grayscale' CHECK (chat_user_text_mode IN ('accent', 'grayscale'));

ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS chat_user_text_brightness INTEGER DEFAULT 60 CHECK (chat_user_text_brightness BETWEEN 0 AND 100);

ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS chat_background_mode TEXT DEFAULT 'grayscale' CHECK (chat_background_mode IN ('accent', 'grayscale'));

ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS chat_background_brightness INTEGER DEFAULT 8 CHECK (chat_background_brightness BETWEEN 0 AND 100);
