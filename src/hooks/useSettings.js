/**
 * Settings Hook
 *
 * Manages user settings with Supabase sync.
 * Settings are stored in the user_settings table and synced across devices.
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../config/supabase.js';

// =============================================================================
// Default Settings
// =============================================================================

export const DEFAULT_SETTINGS = {
  // Appearance
  theme: 'dark',
  accentColor: 'beige',
  customAccentColor: null,
  defaultViewMode: 'list',
  fontSize: 'medium',
  viewDensity: 'comfortable',

  // Chat Appearance
  chatFontSize: 'medium',
  chatTextColor: 'default',
  chatBackgroundColor: 'default',

  // AI Behavior
  aiResponseStyle: 'tactical',
  autoTaggingSensitivity: 2, // 1=light, 2=medium, 3=heavy
  confirmationLevel: 2,
  voiceLanguage: 'en-US',

  // Content
  defaultPageId: null,
  defaultSectionId: null,
  noteSortOrder: 'created_desc',
  autoArchiveCompleted: null, // null = never

  // Data & Privacy
  chatHistoryRetention: null, // null = forever
  ragContextEnabled: true,

  // Keyboard Shortcuts
  customShortcuts: {},

  // API Keys
  customOpenAIKey: null,

  // Team
  defaultMemberPermission: 'team',
  requireInviteApproval: false
};

// =============================================================================
// Database Column Mapping
// =============================================================================

/**
 * Map camelCase settings keys to snake_case database columns
 */
const SETTING_TO_COLUMN = {
  theme: 'theme',
  accentColor: 'accent_color',
  customAccentColor: 'custom_accent_color',
  defaultViewMode: 'default_view_mode',
  fontSize: 'font_size',
  viewDensity: 'view_density',
  chatFontSize: 'chat_font_size',
  chatTextColor: 'chat_text_color',
  chatBackgroundColor: 'chat_background_color',
  aiResponseStyle: 'ai_response_style',
  autoTaggingSensitivity: 'auto_tagging_sensitivity',
  confirmationLevel: 'confirmation_level',
  voiceLanguage: 'voice_language',
  defaultPageId: 'default_page_id',
  defaultSectionId: 'default_section_id',
  noteSortOrder: 'note_sort_order',
  autoArchiveCompleted: 'auto_archive_completed',
  chatHistoryRetention: 'chat_history_retention',
  ragContextEnabled: 'rag_context_enabled',
  customShortcuts: 'custom_shortcuts',
  customOpenAIKey: 'custom_openai_key',
  defaultMemberPermission: 'default_member_permission',
  requireInviteApproval: 'require_invite_approval'
};

/**
 * Map snake_case database columns to camelCase settings keys
 */
const COLUMN_TO_SETTING = Object.fromEntries(
  Object.entries(SETTING_TO_COLUMN).map(([k, v]) => [v, k])
);

// =============================================================================
// Hook
// =============================================================================

/**
 * Custom hook for managing user settings
 * @returns {{
 *   settings: object,
 *   loading: boolean,
 *   saving: boolean,
 *   updateSettings: function,
 *   resetSettings: function
 * }}
 */
export function useSettings() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  /**
   * Load settings from Supabase
   */
  const loadSettings = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error) {
        // Settings don't exist yet, create default
        if (error.code === 'PGRST116') {
          const { error: insertError } = await supabase
            .from('user_settings')
            .insert({ user_id: user.id });

          if (insertError) {
            console.error('Error creating default settings:', insertError);
          }
          setSettings(DEFAULT_SETTINGS);
        } else {
          console.error('Error loading settings:', error);
        }
      } else if (data) {
        // Map database columns to camelCase settings
        const loadedSettings = { ...DEFAULT_SETTINGS };

        Object.keys(COLUMN_TO_SETTING).forEach(column => {
          const settingKey = COLUMN_TO_SETTING[column];
          if (data[column] !== undefined && data[column] !== null) {
            loadedSettings[settingKey] = data[column];
          }
        });

        setSettings(loadedSettings);
      }
    } catch (error) {
      console.error('Settings load error:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Update settings in Supabase
   * @param {object} updates - Partial settings object to update
   */
  const updateSettings = useCallback(async (updates) => {
    setSaving(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('Not authenticated');
      }

      // Map camelCase to snake_case for database
      const dbUpdates = {};
      Object.keys(updates).forEach(key => {
        const column = SETTING_TO_COLUMN[key];
        if (column) {
          dbUpdates[column] = updates[key];
        }
      });

      const { error } = await supabase
        .from('user_settings')
        .update(dbUpdates)
        .eq('user_id', user.id);

      if (error) throw error;

      // Update local state
      setSettings(prev => ({ ...prev, ...updates }));
    } catch (error) {
      console.error('Settings update error:', error);
      throw error;
    } finally {
      setSaving(false);
    }
  }, []);

  /**
   * Reset settings to defaults
   */
  const resetSettings = useCallback(async () => {
    setSaving(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('Not authenticated');
      }

      // Map all default settings to database columns
      const dbDefaults = {};
      Object.keys(DEFAULT_SETTINGS).forEach(key => {
        const column = SETTING_TO_COLUMN[key];
        if (column) {
          dbDefaults[column] = DEFAULT_SETTINGS[key];
        }
      });

      const { error } = await supabase
        .from('user_settings')
        .update(dbDefaults)
        .eq('user_id', user.id);

      if (error) throw error;

      setSettings(DEFAULT_SETTINGS);
    } catch (error) {
      console.error('Settings reset error:', error);
      throw error;
    } finally {
      setSaving(false);
    }
  }, []);

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // Listen for auth changes to reload settings
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') {
        loadSettings();
      } else if (event === 'SIGNED_OUT') {
        setSettings(DEFAULT_SETTINGS);
      }
    });

    return () => subscription.unsubscribe();
  }, [loadSettings]);

  return {
    settings,
    loading,
    saving,
    updateSettings,
    resetSettings
  };
}

export default useSettings;
