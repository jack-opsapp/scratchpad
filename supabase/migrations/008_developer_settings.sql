-- =============================================================================
-- Migration 008: Developer Settings
-- =============================================================================
-- Adds custom_openai_model column for user-configurable AI model
-- =============================================================================

-- Add custom_openai_model column
ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS custom_openai_model TEXT;

-- Add comment for documentation
COMMENT ON COLUMN user_settings.custom_openai_model IS 'Custom OpenAI model name (e.g., gpt-4o-mini, gpt-4o). Null = use default.';
