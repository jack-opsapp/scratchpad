/**
 * Settings Modal Component
 *
 * Full-screen modal for managing user settings.
 * Includes tabs for Appearance, AI Behavior, Content, Data & Privacy, Account, and Team.
 */

import React, { useState, useEffect } from 'react';
import {
  X,
  Check,
  Download,
  Trash2,
  Eye,
  EyeOff,
  AlertTriangle,
  FileText,
  FileJson,
  Table,
  HardDrive,
  Send,
  RotateCcw,
  Brain,
  Code
} from 'lucide-react';
import { useSettings, DEFAULT_SETTINGS } from '../hooks/useSettings.js';
import { ACCENT_COLORS, calculateChatColor } from '../lib/themes.js';
import {
  exportAsMarkdown,
  exportAsJSON,
  exportAsCSV,
  backupWorkspace
} from '../lib/dataExport.js';
import { supabase } from '../config/supabase.js';

// =============================================================================
// Constants
// =============================================================================

import { colors } from '../styles/theme';

const TABS = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'ai', label: 'AI Behavior' },
  { id: 'content', label: 'Content' },
  { id: 'data', label: 'Data & Privacy' },
  { id: 'account', label: 'Account' },
  { id: 'developer', label: 'Developer' }
];

// =============================================================================
// Main Component
// =============================================================================

export default function SettingsModal({ isOpen, onClose, pages = [], user, onOpenTrash }) {
  const { settings, saving, updateSettings, resetSettings } = useSettings();
  const [activeTab, setActiveTab] = useState('appearance');
  const [localSettings, setLocalSettings] = useState(settings);
  const [hasChanges, setHasChanges] = useState(false);

  // Sync local settings when settings load
  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  // Track changes
  useEffect(() => {
    const changed = JSON.stringify(localSettings) !== JSON.stringify(settings);
    setHasChanges(changed);
  }, [localSettings, settings]);

  if (!isOpen) return null;

  const handleChange = (updates) => {
    setLocalSettings(prev => ({ ...prev, ...updates }));
  };

  const handleSave = async () => {
    try {
      await updateSettings(localSettings);
      onClose();
    } catch (error) {
      console.error('Failed to save settings:', error);
      alert('Failed to save settings. Please try again.');
    }
  };

  const handleReset = async () => {
    if (confirm('Reset all settings to defaults? This cannot be undone.')) {
      try {
        await resetSettings();
        setLocalSettings(DEFAULT_SETTINGS);
      } catch (error) {
        console.error('Failed to reset settings:', error);
      }
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        padding: 20
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: colors.surface,
          border: `1px solid ${colors.border}`,
          width: '100%',
          maxWidth: 900,
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: `1px solid ${colors.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <h2 style={{
            color: colors.textPrimary,
            fontSize: 20,
            fontWeight: 600,
            margin: 0,
            fontFamily: "'Inter', sans-serif"
          }}>
            Settings
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: colors.textMuted,
              cursor: 'pointer',
              padding: 4
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Sidebar Tabs */}
          <div style={{
            width: 200,
            borderRight: `1px solid ${colors.border}`,
            padding: '16px 0',
            overflowY: 'auto'
          }}>
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  width: '100%',
                  padding: '10px 20px',
                  background: activeTab === tab.id ? colors.bg : 'transparent',
                  border: 'none',
                  borderLeft: activeTab === tab.id ? `2px solid ${colors.primary}` : '2px solid transparent',
                  color: activeTab === tab.id ? colors.textPrimary : colors.textMuted,
                  fontSize: 14,
                  fontFamily: "'Inter', sans-serif",
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                {tab.label}
              </button>
            ))}

            {/* Reset to Defaults */}
            <div style={{ padding: '20px', marginTop: 'auto' }}>
              <button
                onClick={handleReset}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: 'transparent',
                  border: `1px solid ${colors.border}`,
                  color: colors.textMuted,
                  fontSize: 12,
                  cursor: 'pointer'
                }}
              >
                Reset to Defaults
              </button>
            </div>
          </div>

          {/* Tab Content */}
          <div style={{
            flex: 1,
            padding: 24,
            overflowY: 'auto'
          }}>
            {activeTab === 'appearance' && (
              <AppearanceTab settings={localSettings} onChange={handleChange} />
            )}
            {activeTab === 'ai' && (
              <AIBehaviorTab settings={localSettings} onChange={handleChange} />
            )}
            {activeTab === 'content' && (
              <ContentTab settings={localSettings} pages={pages} onChange={handleChange} />
            )}
            {activeTab === 'data' && (
              <DataPrivacyTab settings={localSettings} onChange={handleChange} user={user} onOpenTrash={onOpenTrash} />
            )}
            {activeTab === 'account' && (
              <AccountTab user={user} />
            )}
            {activeTab === 'developer' && (
              <DeveloperTab settings={localSettings} onChange={handleChange} user={user} />
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 24px',
          borderTop: `1px solid ${colors.border}`,
          display: 'flex',
          gap: 12,
          justifyContent: 'flex-end'
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              background: 'transparent',
              border: `1px solid ${colors.border}`,
              color: colors.textMuted,
              fontSize: 14,
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !hasChanges}
            style={{
              padding: '8px 16px',
              background: hasChanges ? colors.primary : colors.border,
              border: 'none',
              color: hasChanges ? colors.bg : colors.textMuted,
              fontSize: 14,
              fontWeight: 600,
              cursor: saving || !hasChanges ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.5 : 1
            }}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Appearance Tab
// =============================================================================

function AppearanceTab({ settings, onChange }) {
  return (
    <div>
      <h3 style={{ color: colors.textPrimary, fontSize: 16, marginBottom: 20, fontFamily: "'Inter', sans-serif" }}>
        Appearance
      </h3>

      {/* Theme */}
      <SettingGroup label="THEME">
        <div style={{ display: 'flex', gap: 12 }}>
          {['dark', 'light'].map(theme => (
            <SelectButton
              key={theme}
              selected={settings.theme === theme}
              onClick={() => onChange({ theme })}
            >
              {theme.charAt(0).toUpperCase() + theme.slice(1)}
            </SelectButton>
          ))}
        </div>
      </SettingGroup>

      {/* Accent Color */}
      <SettingGroup label="ACCENT COLOR">
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {Object.keys(ACCENT_COLORS).map(colorName => (
            <button
              key={colorName}
              onClick={() => onChange({ accentColor: colorName })}
              style={{
                width: 48,
                height: 48,
                background: ACCENT_COLORS[colorName].primary,
                border: settings.accentColor === colorName ? `3px solid ${colors.textPrimary}` : '3px solid transparent',
                cursor: 'pointer',
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              {settings.accentColor === colorName && (
                <Check size={18} color="#fff" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))' }} />
              )}
            </button>
          ))}
        </div>
      </SettingGroup>

      {/* Default View Mode */}
      <SettingGroup label="DEFAULT VIEW MODE">
        <div style={{ display: 'flex', gap: 12 }}>
          {['list', 'calendar', 'boxes'].map(mode => (
            <SelectButton
              key={mode}
              selected={settings.defaultViewMode === mode}
              onClick={() => onChange({ defaultViewMode: mode })}
            >
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </SelectButton>
          ))}
        </div>
      </SettingGroup>

      {/* Font Size */}
      <SettingGroup label="FONT SIZE">
        <SegmentedControl
          options={['small', 'medium', 'large']}
          value={settings.fontSize}
          onChange={(fontSize) => onChange({ fontSize })}
        />
      </SettingGroup>

      {/* Chat Panel Section */}
      <ChatPanelSettings settings={settings} onChange={onChange} />
    </div>
  );
}

// =============================================================================
// Chat Panel Settings Component
// =============================================================================

function ChatPanelSettings({ settings, onChange }) {
  // Get current accent color for preview
  const accentColor = ACCENT_COLORS[settings.accentColor]?.primary || ACCENT_COLORS.khaki.primary;

  // Calculate preview colors
  const agentTextColor = calculateChatColor(
    settings.chatAgentTextMode || 'grayscale',
    settings.chatAgentTextBrightness ?? 80,
    accentColor,
    settings.theme
  );
  const userTextColor = calculateChatColor(
    settings.chatUserTextMode || 'grayscale',
    settings.chatUserTextBrightness ?? 60,
    accentColor,
    settings.theme
  );
  const bgColor = calculateChatColor(
    settings.chatBackgroundMode || 'grayscale',
    settings.chatBackgroundBrightness ?? 8,
    accentColor,
    settings.theme
  );

  const chatFontSize = settings.chatFontSize === 'small' ? 12 : settings.chatFontSize === 'large' ? 15 : 13;

  return (
    <div style={{ marginTop: 40, paddingTop: 24, borderTop: `1px solid ${colors.border}` }}>
      <h4 style={{
        color: colors.textPrimary,
        fontSize: 14,
        fontWeight: 600,
        marginBottom: 20,
        letterSpacing: 0.5,
        fontFamily: "'Inter', sans-serif"
      }}>
        CHAT PANEL
      </h4>

      {/* Chat Font Size */}
      <SettingGroup label="CHAT FONT SIZE" description="Adjust text size in chat messages">
        <SegmentedControl
          options={['small', 'medium', 'large']}
          value={settings.chatFontSize}
          onChange={(chatFontSize) => onChange({ chatFontSize })}
          defaultValue="medium"
        />
      </SettingGroup>

      {/* Agent Text Color */}
      <SettingGroup label="AGENT TEXT">
        <ColorModeControl
          mode={settings.chatAgentTextMode || 'grayscale'}
          brightness={settings.chatAgentTextBrightness ?? 80}
          onModeChange={(mode) => onChange({ chatAgentTextMode: mode })}
          onBrightnessChange={(brightness) => onChange({ chatAgentTextBrightness: brightness })}
          onReset={() => onChange({ chatAgentTextMode: 'grayscale', chatAgentTextBrightness: 80 })}
          accentColor={accentColor}
          defaultMode="grayscale"
          defaultBrightness={80}
        />
      </SettingGroup>

      {/* User Text Color */}
      <SettingGroup label="USER TEXT">
        <ColorModeControl
          mode={settings.chatUserTextMode || 'grayscale'}
          brightness={settings.chatUserTextBrightness ?? 60}
          onModeChange={(mode) => onChange({ chatUserTextMode: mode })}
          onBrightnessChange={(brightness) => onChange({ chatUserTextBrightness: brightness })}
          onReset={() => onChange({ chatUserTextMode: 'grayscale', chatUserTextBrightness: 60 })}
          accentColor={accentColor}
          defaultMode="grayscale"
          defaultBrightness={60}
        />
      </SettingGroup>

      {/* Background Color */}
      <SettingGroup label="BACKGROUND">
        <ColorModeControl
          mode={settings.chatBackgroundMode || 'grayscale'}
          brightness={settings.chatBackgroundBrightness ?? 8}
          onModeChange={(mode) => onChange({ chatBackgroundMode: mode })}
          onBrightnessChange={(brightness) => onChange({ chatBackgroundBrightness: brightness })}
          onReset={() => onChange({ chatBackgroundMode: 'grayscale', chatBackgroundBrightness: 8 })}
          accentColor={accentColor}
          defaultMode="grayscale"
          defaultBrightness={8}
        />
      </SettingGroup>

      {/* Live Preview */}
      <SettingGroup label="PREVIEW">
        <div style={{
          background: `rgba(${hexToRgb(bgColor)}, 0.45)`,
          backdropFilter: 'blur(24px) saturate(150%)',
          WebkitBackdropFilter: 'blur(24px) saturate(150%)',
          border: `1px solid rgba(255,255,255,0.08)`,
          borderRadius: 4,
          overflow: 'hidden'
        }}>
          {/* Messages area */}
          <div style={{ padding: '12px 20px' }}>
            {/* Agent message 1 */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 10 }}>
              <span style={{ color: accentColor, fontSize: 11, flexShrink: 0 }}>←</span>
              <p style={{
                color: agentTextColor,
                fontSize: chatFontSize,
                margin: 0,
                lineHeight: 1.4,
                fontFamily: "'Inter', sans-serif"
              }}>
                Found 3 notes tagged "marketing". Opening view.
              </p>
            </div>

            {/* User message 1 */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 10 }}>
              <span style={{ color: userTextColor, fontSize: 11, flexShrink: 0, opacity: 0.6 }}>→</span>
              <p style={{
                color: userTextColor,
                fontSize: chatFontSize,
                margin: 0,
                lineHeight: 1.4,
                fontFamily: "'Inter', sans-serif"
              }}>
                create note: launch campaign tomorrow
              </p>
            </div>

            {/* Agent message 2 - success */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 10 }}>
              <span style={{ color: colors.success, fontSize: 11, flexShrink: 0 }}>✓</span>
              <p style={{
                color: agentTextColor,
                fontSize: chatFontSize,
                margin: 0,
                lineHeight: 1.4,
                fontFamily: "'Inter', sans-serif"
              }}>
                Added to Marketing/Tasks.
              </p>
            </div>

            {/* User message 2 */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <span style={{ color: userTextColor, fontSize: 11, flexShrink: 0, opacity: 0.6 }}>→</span>
              <p style={{
                color: userTextColor,
                fontSize: chatFontSize,
                margin: 0,
                lineHeight: 1.4,
                fontFamily: "'Inter', sans-serif"
              }}>
                show me all urgent notes
              </p>
            </div>
          </div>

          {/* Input area - matches actual chat panel */}
          <div style={{
            padding: '12px 20px',
            borderTop: `1px solid rgba(255,255,255,0.08)`,
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}>
            <input
              readOnly
              placeholder="Type a command..."
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                color: userTextColor,
                fontSize: chatFontSize,
                fontFamily: "'Inter', sans-serif",
                outline: 'none',
                opacity: 0.5
              }}
            />
            <button
              style={{
                background: 'transparent',
                border: `1px solid rgba(255,255,255,0.1)`,
                padding: 6,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'default',
                opacity: 0.4
              }}
            >
              <Send size={12} color={colors.textPrimary} />
            </button>
          </div>
        </div>
      </SettingGroup>
    </div>
  );
}

// Helper to convert hex to rgb values
function hexToRgb(hex) {
  hex = hex.replace(/^#/, '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}

// =============================================================================
// Color Mode Control Component
// =============================================================================

function ColorModeControl({
  mode,
  brightness,
  onModeChange,
  onBrightnessChange,
  onReset,
  accentColor,
  defaultMode = 'grayscale',
  defaultBrightness = 50
}) {
  const previewColor = calculateChatColor(mode, brightness, accentColor, 'dark');
  const isDefault = mode === defaultMode && brightness === defaultBrightness;

  return (
    <div>
      {/* Mode selector */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
        <SelectButton
          selected={mode === 'grayscale'}
          onClick={() => onModeChange('grayscale')}
          small
        >
          Grayscale
        </SelectButton>
        <SelectButton
          selected={mode === 'accent'}
          onClick={() => onModeChange('accent')}
          small
        >
          Accent Color
        </SelectButton>
        {/* Color preview swatch */}
        <div style={{
          width: 36,
          height: 36,
          background: previewColor,
          border: `1px solid ${colors.border}`,
          marginLeft: 'auto'
        }} />
        {/* Reset button */}
        {!isDefault && onReset && (
          <button
            onClick={onReset}
            title="Reset to default"
            style={{
              background: 'transparent',
              border: 'none',
              color: colors.textMuted,
              cursor: 'pointer',
              padding: 4,
              display: 'flex',
              alignItems: 'center',
              opacity: 0.6
            }}
          >
            <RotateCcw size={14} />
          </button>
        )}
      </div>

      {/* Brightness slider */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ color: colors.textMuted, fontSize: 11, width: 60 }}>Brightness</span>
        <input
          type="range"
          min="0"
          max="100"
          value={brightness}
          onChange={(e) => onBrightnessChange(parseInt(e.target.value))}
          style={{
            flex: 1,
            accentColor: colors.textMuted,
            cursor: 'pointer'
          }}
        />
        <span style={{ color: colors.textMuted, fontSize: 11, width: 30, textAlign: 'right' }}>
          {brightness}%
        </span>
      </div>
    </div>
  );
}

// =============================================================================
// AI Behavior Tab
// =============================================================================

function AIBehaviorTab({ settings, onChange }) {
  const personalities = [
    {
      id: 'tactical',
      label: 'Tactical',
      description: 'Military-style brevity. Jocko Willink discipline. Default Slate style.',
      example: '"✓ Added."'
    },
    {
      id: 'balanced',
      label: 'Balanced',
      description: 'Medium-length responses with key context and details.',
      example: '"✓ Added to Marketing, tagged \'campaign\', due tomorrow."'
    },
    {
      id: 'conversational',
      label: 'Conversational',
      description: 'Extensive explanations. AI walks you through everything step-by-step.',
      example: '"I\'ve created a note in your Marketing section with the campaign tag..."'
    }
  ];

  return (
    <div>
      <h3 style={{ color: colors.textPrimary, fontSize: 16, marginBottom: 20, fontFamily: "'Inter', sans-serif" }}>
        AI Behavior
      </h3>

      {/* Agent Personality */}
      <SettingGroup label="AGENT PERSONALITY">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {personalities.map(style => (
            <button
              key={style.id}
              onClick={() => onChange({ aiResponseStyle: style.id })}
              style={{
                padding: '16px 20px',
                background: settings.aiResponseStyle === style.id ? `${colors.primary}15` : 'transparent',
                border: `1px solid ${settings.aiResponseStyle === style.id ? colors.primary : colors.border}`,
                borderLeft: settings.aiResponseStyle === style.id ? `3px solid ${colors.primary}` : `3px solid transparent`,
                color: colors.textPrimary,
                fontSize: 14,
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <span style={{ fontWeight: 600, fontSize: 15, fontFamily: "'Inter', sans-serif" }}>
                  {style.label}
                </span>
                {settings.aiResponseStyle === style.id && (
                  <span style={{
                    padding: '2px 8px',
                    background: colors.primary,
                    color: colors.bg,
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: 0.5
                  }}>
                    ACTIVE
                  </span>
                )}
              </div>
              <p style={{ color: colors.textMuted, fontSize: 12, margin: '0 0 8px 0', lineHeight: 1.5 }}>
                {style.description}
              </p>
              <div style={{
                padding: '8px 12px',
                background: colors.bg,
                border: `1px solid ${colors.border}`,
                marginTop: 8
              }}>
                <span style={{ color: colors.textMuted, fontSize: 11, fontStyle: 'italic' }}>
                  Example: {style.example}
                </span>
              </div>
            </button>
          ))}
        </div>
      </SettingGroup>

      {/* Auto-Tagging Sensitivity */}
      <SettingGroup
        label="AUTO-TAGGING SENSITIVITY"
        description="How aggressively the AI auto-tags your notes"
      >
        <SegmentedControl
          options={[
            { value: 1, label: 'Light' },
            { value: 2, label: 'Medium' },
            { value: 3, label: 'Heavy' }
          ]}
          value={settings.autoTaggingSensitivity}
          onChange={(autoTaggingSensitivity) => onChange({ autoTaggingSensitivity })}
        />
      </SettingGroup>

      {/* Confirmation Level */}
      <SettingGroup
        label="CONFIRMATION LEVEL"
        description={
          settings.confirmationLevel === 1 ? 'Auto-execute simple tasks' :
          settings.confirmationLevel === 2 ? 'Confirm before bulk operations (default)' :
          'Confirm before all operations'
        }
      >
        <SegmentedControl
          options={[
            { value: 1, label: 'Light' },
            { value: 2, label: 'Medium' },
            { value: 3, label: 'Heavy' }
          ]}
          value={settings.confirmationLevel}
          onChange={(confirmationLevel) => onChange({ confirmationLevel })}
        />
      </SettingGroup>
    </div>
  );
}

// =============================================================================
// Content Tab
// =============================================================================

function ContentTab({ settings, pages, onChange }) {
  // Get sections for selected default page
  const selectedPage = pages.find(p => p.id === settings.defaultPageId);
  const sections = selectedPage?.sections || [];

  return (
    <div>
      <h3 style={{ color: colors.textPrimary, fontSize: 16, marginBottom: 20, fontFamily: "'Inter', sans-serif" }}>
        Content
      </h3>

      {/* Default Page */}
      <SettingGroup label="DEFAULT PAGE" description="Page to open on startup">
        <select
          value={settings.defaultPageId || ''}
          onChange={(e) => onChange({
            defaultPageId: e.target.value || null,
            defaultSectionId: null // Reset section when page changes
          })}
          style={{
            width: '100%',
            maxWidth: 300,
            padding: '10px 12px',
            background: colors.bg,
            border: `1px solid ${colors.border}`,
            color: colors.textPrimary,
            fontSize: 14,
            cursor: 'pointer'
          }}
        >
          <option value="">None (last viewed)</option>
          {pages.map(page => (
            <option key={page.id} value={page.id}>{page.name}</option>
          ))}
        </select>
      </SettingGroup>

      {/* Default Section */}
      {settings.defaultPageId && (
        <SettingGroup label="DEFAULT SECTION">
          <select
            value={settings.defaultSectionId || ''}
            onChange={(e) => onChange({ defaultSectionId: e.target.value || null })}
            style={{
              width: '100%',
              maxWidth: 300,
              padding: '10px 12px',
              background: colors.bg,
              border: `1px solid ${colors.border}`,
              color: colors.textPrimary,
              fontSize: 14,
              cursor: 'pointer'
            }}
          >
            <option value="">None (first section)</option>
            {sections.map(section => (
              <option key={section.id} value={section.id}>{section.name}</option>
            ))}
          </select>
        </SettingGroup>
      )}

      {/* Note Sort Order */}
      <SettingGroup label="NOTE SORT ORDER">
        <select
          value={settings.noteSortOrder}
          onChange={(e) => onChange({ noteSortOrder: e.target.value })}
          style={{
            width: '100%',
            maxWidth: 300,
            padding: '10px 12px',
            background: colors.bg,
            border: `1px solid ${colors.border}`,
            color: colors.textPrimary,
            fontSize: 14,
            cursor: 'pointer'
          }}
        >
          <option value="created_desc">Date Created (Newest First)</option>
          <option value="created_asc">Date Created (Oldest First)</option>
          <option value="alpha">Alphabetical</option>
          <option value="modified">Date Modified</option>
        </select>
      </SettingGroup>

      {/* Auto-Archive */}
      <SettingGroup label="AUTO-ARCHIVE COMPLETED" description="Automatically archive completed notes after">
        <select
          value={settings.autoArchiveCompleted || ''}
          onChange={(e) => onChange({ autoArchiveCompleted: e.target.value ? parseInt(e.target.value) : null })}
          style={{
            width: '100%',
            maxWidth: 300,
            padding: '10px 12px',
            background: colors.bg,
            border: `1px solid ${colors.border}`,
            color: colors.textPrimary,
            fontSize: 14,
            cursor: 'pointer'
          }}
        >
          <option value="">Never</option>
          <option value="7">7 days</option>
          <option value="30">30 days</option>
          <option value="90">90 days</option>
        </select>
      </SettingGroup>
    </div>
  );
}

// =============================================================================
// Data & Privacy Tab
// =============================================================================

function DataPrivacyTab({ settings, onChange, user, onOpenTrash }) {
  const [exporting, setExporting] = useState(null);
  const [clearingMemory, setClearingMemory] = useState(false);
  const [memoryCleared, setMemoryCleared] = useState(false);

  const handleExport = async (type) => {
    setExporting(type);
    try {
      switch (type) {
        case 'markdown':
          await exportAsMarkdown();
          break;
        case 'json':
          await exportAsJSON();
          break;
        case 'csv':
          await exportAsCSV();
          break;
        case 'backup':
          await backupWorkspace();
          break;
      }
    } catch (error) {
      console.error('Export failed:', error);
      alert('Export failed. Please try again.');
    } finally {
      setExporting(null);
    }
  };

  const handleClearMemory = async () => {
    if (!user?.id) return;

    if (!confirm('Clear all AI memory? Slate will forget your behavioral patterns and preferences.')) {
      return;
    }

    setClearingMemory(true);
    try {
      const response = await fetch('/api/mem0-settings', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id })
      });

      const data = await response.json();

      if (data.success) {
        setMemoryCleared(true);
        setTimeout(() => setMemoryCleared(false), 3000);
      } else {
        alert('Failed to clear memory. Please try again.');
      }
    } catch (error) {
      console.error('Clear memory failed:', error);
      alert('Failed to clear memory. Please try again.');
    } finally {
      setClearingMemory(false);
    }
  };

  return (
    <div>
      <h3 style={{ color: colors.textPrimary, fontSize: 16, marginBottom: 20, fontFamily: "'Inter', sans-serif" }}>
        Data & Privacy
      </h3>

      {/* Recently Deleted */}
      <SettingGroup label="RECENTLY DELETED" description="View and restore deleted pages, sections, and notes">
        <button
          onClick={() => {
            if (onOpenTrash) onOpenTrash();
          }}
          style={{
            padding: '12px 16px',
            background: colors.bg,
            border: `1px solid ${colors.border}`,
            color: colors.textPrimary,
            fontSize: 14,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            width: '100%',
            maxWidth: 300,
            transition: 'all 0.2s'
          }}
        >
          <Trash2 size={16} color={colors.danger} />
          <span>View Trash</span>
          <RotateCcw size={14} color={colors.textMuted} style={{ marginLeft: 'auto' }} />
        </button>
      </SettingGroup>

      {/* Chat History Retention */}
      <SettingGroup label="CHAT HISTORY RETENTION" description="How long to keep chat messages">
        <select
          value={settings.chatHistoryRetention || ''}
          onChange={(e) => onChange({ chatHistoryRetention: e.target.value ? parseInt(e.target.value) : null })}
          style={{
            width: '100%',
            maxWidth: 300,
            padding: '10px 12px',
            background: colors.bg,
            border: `1px solid ${colors.border}`,
            color: colors.textPrimary,
            fontSize: 14,
            cursor: 'pointer'
          }}
        >
          <option value="">Forever</option>
          <option value="30">30 days</option>
          <option value="7">7 days</option>
        </select>
      </SettingGroup>

      {/* RAG Context */}
      <SettingGroup label="RAG CONTEXT" description="Allow AI to search your notes for context">
        <div style={{ display: 'flex', gap: 12 }}>
          <SelectButton
            selected={settings.ragContextEnabled}
            onClick={() => onChange({ ragContextEnabled: true })}
          >
            Enabled
          </SelectButton>
          <SelectButton
            selected={!settings.ragContextEnabled}
            onClick={() => onChange({ ragContextEnabled: false })}
          >
            Disabled
          </SelectButton>
        </div>
      </SettingGroup>

      {/* AI Memory Section */}
      <div style={{ marginTop: 40, paddingTop: 24, borderTop: `1px solid ${colors.border}` }}>
        <h4 style={{
          color: colors.textPrimary,
          fontSize: 14,
          fontWeight: 600,
          marginBottom: 12,
          letterSpacing: 0.5,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontFamily: "'Inter', sans-serif"
        }}>
          <Brain size={16} />
          AI MEMORY
        </h4>
        <p style={{ color: colors.textMuted, fontSize: 12, marginBottom: 16, lineHeight: 1.5 }}>
          Slate learns from your interactions to personalize responses. This includes your
          communication preferences, frequently used tags, and workflow patterns. No note
          content is stored.
        </p>
        <button
          onClick={handleClearMemory}
          disabled={clearingMemory || !user?.id}
          style={{
            padding: '10px 16px',
            background: 'transparent',
            border: `1px solid ${colors.border}`,
            color: memoryCleared ? colors.success : colors.textMuted,
            fontSize: 14,
            cursor: clearingMemory || !user?.id ? 'not-allowed' : 'pointer',
            opacity: clearingMemory ? 0.5 : 1,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            transition: 'all 0.2s'
          }}
        >
          {memoryCleared ? (
            <>
              <Check size={16} />
              Memory Cleared
            </>
          ) : (
            <>
              <Trash2 size={16} />
              {clearingMemory ? 'Clearing...' : 'Clear Memory'}
            </>
          )}
        </button>
      </div>

      {/* Export Section */}
      <div style={{ marginTop: 40, paddingTop: 24, borderTop: `1px solid ${colors.border}` }}>
        <h4 style={{
          color: colors.textPrimary,
          fontSize: 14,
          fontWeight: 600,
          marginBottom: 20,
          letterSpacing: 0.5,
          fontFamily: "'Inter', sans-serif"
        }}>
          EXPORT DATA
        </h4>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <ExportButton
            icon={FileText}
            label="Markdown"
            description="ZIP with .md files"
            loading={exporting === 'markdown'}
            onClick={() => handleExport('markdown')}
          />
          <ExportButton
            icon={FileJson}
            label="JSON"
            description="Structured data"
            loading={exporting === 'json'}
            onClick={() => handleExport('json')}
          />
          <ExportButton
            icon={Table}
            label="CSV"
            description="Spreadsheet format"
            loading={exporting === 'csv'}
            onClick={() => handleExport('csv')}
          />
        </div>
      </div>

      {/* Backup Section */}
      <div style={{ marginTop: 32 }}>
        <h4 style={{
          color: colors.textPrimary,
          fontSize: 14,
          fontWeight: 600,
          marginBottom: 12,
          letterSpacing: 0.5,
          fontFamily: "'Inter', sans-serif"
        }}>
          FULL BACKUP
        </h4>
        <p style={{ color: colors.textMuted, fontSize: 12, marginBottom: 16 }}>
          Download a complete backup including notes, chat history, and settings.
        </p>
        <ExportButton
          icon={HardDrive}
          label="Download Backup"
          description="Full workspace JSON"
          loading={exporting === 'backup'}
          onClick={() => handleExport('backup')}
          wide
        />
      </div>

      {/* Danger Zone */}
      <div style={{
        marginTop: 40,
        paddingTop: 24,
        borderTop: `1px solid ${colors.danger}33`
      }}>
        <h4 style={{
          color: colors.danger,
          fontSize: 14,
          fontWeight: 600,
          marginBottom: 12,
          letterSpacing: 0.5,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontFamily: "'Inter', sans-serif"
        }}>
          <AlertTriangle size={16} />
          DANGER ZONE
        </h4>
        <p style={{ color: colors.textMuted, fontSize: 12, marginBottom: 16 }}>
          Permanently delete your account and all associated data. This cannot be undone.
        </p>
        <button
          onClick={() => {
            if (confirm('Are you sure you want to delete your account? This action cannot be undone.')) {
              if (confirm('This will permanently delete ALL your data. Type DELETE to confirm.')) {
                // Would trigger account deletion
                alert('Account deletion not yet implemented.');
              }
            }
          }}
          style={{
            padding: '10px 16px',
            background: 'transparent',
            border: `1px solid ${colors.danger}`,
            color: colors.danger,
            fontSize: 14,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}
        >
          <Trash2 size={16} />
          Delete Account
        </button>
      </div>
    </div>
  );
}

// =============================================================================
// Account Tab
// =============================================================================

function AccountTab({ user }) {
  const [showApiKey, setShowApiKey] = useState(false);

  return (
    <div>
      <h3 style={{ color: colors.textPrimary, fontSize: 16, marginBottom: 20, fontFamily: "'Inter', sans-serif" }}>
        Account
      </h3>

      {/* Email */}
      <SettingGroup label="EMAIL">
        <div style={{
          padding: '12px 16px',
          background: colors.bg,
          border: `1px solid ${colors.border}`,
          color: colors.textPrimary,
          fontSize: 14
        }}>
          {user?.email || 'Not signed in'}
        </div>
      </SettingGroup>

      {/* Auth Provider */}
      <SettingGroup label="SIGN-IN METHOD">
        <div style={{
          padding: '12px 16px',
          background: colors.bg,
          border: `1px solid ${colors.border}`,
          color: colors.textMuted,
          fontSize: 14,
          display: 'flex',
          alignItems: 'center',
          gap: 8
        }}>
          {user?.app_metadata?.provider === 'google' ? (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Google Account
            </>
          ) : (
            'Email & Password'
          )}
        </div>
      </SettingGroup>

      {/* User ID */}
      <SettingGroup label="USER ID" description="Your unique identifier">
        <div style={{
          padding: '12px 16px',
          background: colors.bg,
          border: `1px solid ${colors.border}`,
          color: colors.textMuted,
          fontSize: 12,
          fontFamily: 'monospace',
          wordBreak: 'break-all'
        }}>
          {user?.id || 'N/A'}
        </div>
      </SettingGroup>

      {/* Sign Out */}
      <div style={{ marginTop: 32 }}>
        <button
          onClick={async () => {
            await supabase.auth.signOut();
            window.location.reload();
          }}
          style={{
            padding: '10px 16px',
            background: 'transparent',
            border: `1px solid ${colors.border}`,
            color: colors.textMuted,
            fontSize: 14,
            cursor: 'pointer'
          }}
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}

// =============================================================================
// Developer Tab
// =============================================================================

function DeveloperTab({ settings, onChange, user }) {
  const [showApiKey, setShowApiKey] = useState(false);
  const [keys, setKeys] = useState([]);
  const [keysLoading, setKeysLoading] = useState(true);
  const [showKeyForm, setShowKeyForm] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [generatingKey, setGeneratingKey] = useState(false);
  const [revealedKey, setRevealedKey] = useState(null);
  const [copied, setCopied] = useState(false);

  // Load existing keys from Supabase (RLS scopes to current user)
  useEffect(() => {
    if (!user?.id) return;
    setKeysLoading(true);
    supabase
      .from('api_keys')
      .select('id, name, created_at, last_used_at, revoked_at')
      .is('revoked_at', null)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setKeys(data || []);
        setKeysLoading(false);
      });
  }, [user?.id]);

  const handleGenerateKey = async () => {
    if (!newKeyName.trim()) return;
    setGeneratingKey(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');

      const response = await fetch('/api/v1/keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ name: newKeyName.trim() })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to generate key');

      setRevealedKey(data.key);
      setNewKeyName('');
      setShowKeyForm(false);

      // Refresh key list
      const { data: updated } = await supabase
        .from('api_keys')
        .select('id, name, created_at, last_used_at, revoked_at')
        .is('revoked_at', null)
        .order('created_at', { ascending: false });
      setKeys(updated || []);
    } catch (err) {
      alert('Failed to generate key: ' + err.message);
    } finally {
      setGeneratingKey(false);
    }
  };

  const handleRevoke = async (keyId) => {
    if (!confirm('Revoke this API key? Any tools using it will stop working immediately.')) return;
    await supabase
      .from('api_keys')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', keyId);
    setKeys(prev => prev.filter(k => k.id !== keyId));
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(revealedKey).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const formatDate = (iso) => {
    if (!iso) return null;
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatRelative = (iso) => {
    if (!iso) return 'Never used';
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return formatDate(iso);
  };

  return (
    <div>
      <h3 style={{ color: colors.textPrimary, fontSize: 16, marginBottom: 8, fontFamily: "'Inter', sans-serif" }}>
        Developer Settings
      </h3>
      <p style={{ color: colors.textMuted, fontSize: 12, marginBottom: 24, lineHeight: 1.5 }}>
        Configure your own OpenAI API key and model. Leave blank to use the default.
      </p>

      {/* ── Slate API Keys ─────────────────────────────────────────── */}
      <div style={{ marginBottom: 40 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <label style={{ color: colors.textMuted, fontSize: 11, fontWeight: 600, letterSpacing: 0.5 }}>
            SLATE API KEYS
          </label>
          <button
            onClick={() => { setShowKeyForm(v => !v); setRevealedKey(null); }}
            style={{
              padding: '6px 12px',
              background: 'transparent',
              border: `1px solid ${colors.border}`,
              color: colors.textPrimary,
              fontSize: 12,
              cursor: 'pointer'
            }}
          >
            + Generate New Key
          </button>
        </div>
        <p style={{ color: colors.textMuted, fontSize: 11, marginBottom: 12, lineHeight: 1.5 }}>
          Use these keys to access your notes from Claude Code or other tools.
        </p>

        {/* Inline key-name form */}
        {showKeyForm && (
          <div style={{
            marginBottom: 12,
            padding: 12,
            background: colors.bg,
            border: `1px solid ${colors.border}`,
            display: 'flex',
            gap: 8,
            alignItems: 'center'
          }}>
            <input
              type="text"
              value={newKeyName}
              onChange={e => setNewKeyName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleGenerateKey()}
              placeholder='e.g. "Claude Code - MacBook"'
              autoFocus
              style={{
                flex: 1,
                padding: '8px 10px',
                background: colors.surface,
                border: `1px solid ${colors.border}`,
                color: colors.textPrimary,
                fontSize: 13
              }}
            />
            <button
              onClick={handleGenerateKey}
              disabled={generatingKey || !newKeyName.trim()}
              style={{
                padding: '8px 14px',
                background: newKeyName.trim() ? colors.primary : colors.border,
                border: 'none',
                color: newKeyName.trim() ? colors.bg : colors.textMuted,
                fontSize: 13,
                fontWeight: 600,
                cursor: generatingKey || !newKeyName.trim() ? 'not-allowed' : 'pointer'
              }}
            >
              {generatingKey ? 'Generating...' : 'Create'}
            </button>
            <button
              onClick={() => setShowKeyForm(false)}
              style={{
                padding: '8px 10px',
                background: 'transparent',
                border: `1px solid ${colors.border}`,
                color: colors.textMuted,
                fontSize: 13,
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
          </div>
        )}

        {/* Revealed key (shown once) */}
        {revealedKey && (
          <div style={{
            marginBottom: 12,
            padding: 14,
            background: `${colors.success}12`,
            border: `1px solid ${colors.success}40`
          }}>
            <p style={{ color: colors.success, fontSize: 11, fontWeight: 600, marginBottom: 8 }}>
              ✓ Your new API key — copy it now. It won't be shown again.
            </p>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <code style={{
                flex: 1,
                padding: '8px 10px',
                background: colors.bg,
                border: `1px solid ${colors.border}`,
                color: colors.textPrimary,
                fontSize: 12,
                fontFamily: 'monospace',
                wordBreak: 'break-all'
              }}>
                {revealedKey}
              </code>
              <button
                onClick={handleCopy}
                style={{
                  padding: '8px 14px',
                  background: copied ? colors.success : colors.primary,
                  border: 'none',
                  color: colors.bg,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  flexShrink: 0
                }}
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
              <button
                onClick={() => setRevealedKey(null)}
                style={{
                  padding: '8px 10px',
                  background: 'transparent',
                  border: `1px solid ${colors.border}`,
                  color: colors.textMuted,
                  fontSize: 12,
                  cursor: 'pointer',
                  flexShrink: 0
                }}
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Keys list */}
        {keysLoading ? (
          <p style={{ color: colors.textMuted, fontSize: 12 }}>Loading keys...</p>
        ) : keys.length === 0 ? (
          <div style={{
            padding: 16,
            border: `1px solid ${colors.border}`,
            color: colors.textMuted,
            fontSize: 12,
            textAlign: 'center'
          }}>
            No API keys yet. Generate one above.
          </div>
        ) : (
          <div style={{ border: `1px solid ${colors.border}` }}>
            {keys.map((key, i) => (
              <div
                key={key.id}
                style={{
                  padding: '12px 16px',
                  borderBottom: i < keys.length - 1 ? `1px solid ${colors.border}` : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12
                }}
              >
                <div>
                  <div style={{ color: colors.textPrimary, fontSize: 13, fontWeight: 500 }}>
                    {key.name}
                  </div>
                  <div style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                    Created {formatDate(key.created_at)} · {formatRelative(key.last_used_at)}
                  </div>
                </div>
                <button
                  onClick={() => handleRevoke(key.id)}
                  style={{
                    padding: '6px 12px',
                    background: 'transparent',
                    border: `1px solid ${colors.danger}`,
                    color: colors.danger,
                    fontSize: 12,
                    cursor: 'pointer',
                    flexShrink: 0
                  }}
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Divider ─────────────────────────────────────────────────── */}
      <div style={{ borderTop: `1px solid ${colors.border}`, marginBottom: 32 }} />

      {/* OpenAI API Key */}
      <SettingGroup label="OPENAI API KEY" description="Your personal OpenAI API key (stored securely)">
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type={showApiKey ? 'text' : 'password'}
            value={settings.customOpenAIKey || ''}
            onChange={(e) => onChange({ customOpenAIKey: e.target.value || null })}
            placeholder="sk-..."
            style={{
              flex: 1,
              maxWidth: 400,
              padding: '10px 12px',
              background: colors.bg,
              border: `1px solid ${colors.border}`,
              color: colors.textPrimary,
              fontSize: 14,
              fontFamily: 'monospace'
            }}
          />
          <button
            onClick={() => setShowApiKey(!showApiKey)}
            style={{
              padding: '10px 12px',
              background: 'transparent',
              border: `1px solid ${colors.border}`,
              color: colors.textMuted,
              cursor: 'pointer'
            }}
          >
            {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </SettingGroup>

      {/* OpenAI Model */}
      <SettingGroup label="OPENAI MODEL" description="Model to use for AI agent (e.g., gpt-4o-mini, gpt-4o)">
        <input
          type="text"
          value={settings.customOpenAIModel || ''}
          onChange={(e) => onChange({ customOpenAIModel: e.target.value || null })}
          placeholder="gpt-4o-mini"
          style={{
            width: '100%',
            maxWidth: 400,
            padding: '10px 12px',
            background: colors.bg,
            border: `1px solid ${colors.border}`,
            color: colors.textPrimary,
            fontSize: 14,
            fontFamily: 'monospace'
          }}
        />
      </SettingGroup>

      {/* Info Box */}
      <div style={{
        marginTop: 32,
        padding: 16,
        background: `${colors.primary}10`,
        border: `1px solid ${colors.primary}30`,
        display: 'flex',
        gap: 12,
        alignItems: 'flex-start'
      }}>
        <Code size={20} color={colors.primary} style={{ flexShrink: 0, marginTop: 2 }} />
        <div>
          <p style={{ color: colors.textPrimary, fontSize: 13, margin: 0, marginBottom: 8, fontWeight: 500 }}>
            Using your own API key
          </p>
          <ul style={{ color: colors.textMuted, fontSize: 12, margin: 0, paddingLeft: 16, lineHeight: 1.6 }}>
            <li>Bypasses rate limits from shared key</li>
            <li>Costs are billed to your OpenAI account</li>
            <li>Key is stored encrypted in your user settings</li>
            <li>Leave blank to use the default shared key</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Reusable Components
// =============================================================================

function SettingGroup({ label, description, children }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <label style={{
        color: colors.textMuted,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: 0.5,
        display: 'block',
        marginBottom: 8
      }}>
        {label}
      </label>
      {children}
      {description && (
        <p style={{ color: colors.textMuted, fontSize: 11, marginTop: 6, opacity: 0.8 }}>
          {description}
        </p>
      )}
    </div>
  );
}

function SelectButton({ children, selected, onClick, small }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: small ? '8px 14px' : '12px 20px',
        background: 'transparent',
        border: `1px solid ${selected ? colors.textPrimary : colors.border}`,
        color: colors.textPrimary,
        fontSize: small ? 13 : 14,
        fontWeight: selected ? 600 : 400,
        cursor: 'pointer',
        transition: 'all 0.2s'
      }}
    >
      {children}
    </button>
  );
}

function SegmentedControl({ options, value, onChange, defaultValue }) {
  // Normalize options to objects
  const normalizedOptions = options.map(opt =>
    typeof opt === 'string' ? { value: opt, label: opt.charAt(0).toUpperCase() + opt.slice(1) } : opt
  );

  const isDefault = defaultValue !== undefined && value === defaultValue;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ display: 'flex', border: `1px solid ${colors.border}` }}>
        {normalizedOptions.map((opt, i) => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            style={{
              flex: 1,
              padding: '10px 16px',
              background: 'transparent',
              border: 'none',
              borderRight: i < normalizedOptions.length - 1 ? `1px solid ${colors.border}` : 'none',
              borderBottom: value === opt.value ? `2px solid ${colors.textPrimary}` : '2px solid transparent',
              color: value === opt.value ? colors.textPrimary : colors.textMuted,
              fontSize: 13,
              fontWeight: value === opt.value ? 600 : 400,
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {defaultValue !== undefined && !isDefault && (
        <button
          onClick={() => onChange(defaultValue)}
          title="Reset to default"
          style={{
            background: 'transparent',
            border: 'none',
            color: colors.textMuted,
            cursor: 'pointer',
            padding: 4,
            display: 'flex',
            alignItems: 'center',
            opacity: 0.6
          }}
        >
          <RotateCcw size={14} />
        </button>
      )}
    </div>
  );
}

function ExportButton({ icon: Icon, label, description, loading, onClick, wide }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      style={{
        padding: '16px 20px',
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        color: colors.textPrimary,
        cursor: loading ? 'not-allowed' : 'pointer',
        opacity: loading ? 0.5 : 1,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        minWidth: wide ? 250 : 150,
        transition: 'all 0.2s'
      }}
    >
      <Icon size={20} color={colors.primary} />
      <div style={{ textAlign: 'left' }}>
        <div style={{ fontSize: 14, fontWeight: 500 }}>
          {loading ? 'Exporting...' : label}
        </div>
        <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>
          {description}
        </div>
      </div>
    </button>
  );
}
