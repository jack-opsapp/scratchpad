-- =============================================================================
-- Migration 006: User Settings
-- =============================================================================
-- Adds user settings table for cross-device sync of preferences
-- =============================================================================

-- User settings table
CREATE TABLE IF NOT EXISTS user_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Appearance
  theme TEXT DEFAULT 'dark' CHECK (theme IN ('dark', 'light')),
  accent_color TEXT DEFAULT 'beige' CHECK (accent_color IN ('beige', 'blue', 'green', 'purple', 'red', 'custom')),
  custom_accent_color TEXT, -- Hex color if accent_color = 'custom'
  default_view_mode TEXT DEFAULT 'list' CHECK (default_view_mode IN ('list', 'calendar', 'boxes')),
  font_size TEXT DEFAULT 'medium' CHECK (font_size IN ('small', 'medium', 'large')),
  view_density TEXT DEFAULT 'comfortable' CHECK (view_density IN ('compact', 'comfortable')),

  -- Chat Appearance
  chat_font_size TEXT DEFAULT 'medium' CHECK (chat_font_size IN ('small', 'medium', 'large')),
  chat_text_color TEXT DEFAULT 'default', -- 'default' or hex color
  chat_background_color TEXT DEFAULT 'default', -- 'default' or hex color

  -- AI Behavior (using 1-3 scale: 1=light, 2=medium, 3=heavy)
  ai_response_style TEXT DEFAULT 'tactical' CHECK (ai_response_style IN ('tactical', 'balanced', 'conversational')),
  auto_tagging_sensitivity INTEGER DEFAULT 2 CHECK (auto_tagging_sensitivity BETWEEN 1 AND 3),
  confirmation_level INTEGER DEFAULT 2 CHECK (confirmation_level BETWEEN 1 AND 3),
  voice_language TEXT DEFAULT 'en-US',

  -- Content
  default_page_id TEXT, -- Can be null
  default_section_id TEXT, -- Can be null
  note_sort_order TEXT DEFAULT 'created_desc' CHECK (note_sort_order IN ('created_desc', 'created_asc', 'alpha', 'modified')),
  auto_archive_completed INTEGER, -- Days, null = never

  -- Data & Privacy
  chat_history_retention INTEGER, -- Days, null = forever
  rag_context_enabled BOOLEAN DEFAULT true,

  -- Keyboard Shortcuts (JSONB for flexibility)
  custom_shortcuts JSONB DEFAULT '{}'::jsonb,

  -- API Keys (encrypted at application level)
  custom_openai_key TEXT,

  -- Team Defaults (for page owners)
  default_member_permission TEXT DEFAULT 'team' CHECK (default_member_permission IN ('team', 'team-limited')),
  require_invite_approval BOOLEAN DEFAULT false,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- Row Level Security
-- =============================================================================

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

-- Users can only view their own settings
CREATE POLICY "Users can view own settings"
  ON user_settings FOR SELECT
  USING (auth.uid() = user_id);

-- Users can only update their own settings
CREATE POLICY "Users can update own settings"
  ON user_settings FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can only insert their own settings
CREATE POLICY "Users can insert own settings"
  ON user_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- =============================================================================
-- Triggers
-- =============================================================================

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_user_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_settings_updated_at
  BEFORE UPDATE ON user_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_user_settings_updated_at();

-- =============================================================================
-- Auto-create settings on user signup
-- =============================================================================

CREATE OR REPLACE FUNCTION create_default_user_settings()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_settings (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists (for idempotency)
DROP TRIGGER IF EXISTS create_user_settings_on_signup ON auth.users;

CREATE TRIGGER create_user_settings_on_signup
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION create_default_user_settings();
