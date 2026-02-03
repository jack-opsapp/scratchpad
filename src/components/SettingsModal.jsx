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
  HardDrive
} from 'lucide-react';
import { useSettings, DEFAULT_SETTINGS } from '../hooks/useSettings.js';
import { ACCENT_COLORS } from '../lib/themes.js';
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

const colors = {
  bg: '#000000',
  surface: '#0a0a0a',
  border: '#1a1a1a',
  primary: '#d1b18f',
  textPrimary: '#ffffff',
  textMuted: '#888888',
  danger: '#ff6b6b',
  success: '#4CAF50'
};

const TABS = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'ai', label: 'AI Behavior' },
  { id: 'content', label: 'Content' },
  { id: 'data', label: 'Data & Privacy' },
  { id: 'account', label: 'Account' }
];

// =============================================================================
// Main Component
// =============================================================================

export default function SettingsModal({ isOpen, onClose, pages = [], user }) {
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
            fontFamily: "'Manrope', sans-serif"
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
              <DataPrivacyTab settings={localSettings} onChange={handleChange} />
            )}
            {activeTab === 'account' && (
              <AccountTab user={user} />
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
      <h3 style={{ color: colors.textPrimary, fontSize: 16, marginBottom: 20, fontFamily: "'Manrope', sans-serif" }}>
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
      <div style={{ marginTop: 40, paddingTop: 24, borderTop: `1px solid ${colors.border}` }}>
        <h4 style={{
          color: colors.textPrimary,
          fontSize: 14,
          fontWeight: 600,
          marginBottom: 20,
          letterSpacing: 0.5,
          fontFamily: "'Manrope', sans-serif"
        }}>
          CHAT PANEL
        </h4>

        {/* Chat Font Size */}
        <SettingGroup label="CHAT FONT SIZE" description="Adjust text size in chat messages">
          <SegmentedControl
            options={['small', 'medium', 'large']}
            value={settings.chatFontSize}
            onChange={(chatFontSize) => onChange({ chatFontSize })}
          />
        </SettingGroup>

        {/* Chat Text Color */}
        <SettingGroup label="CHAT TEXT COLOR">
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <SelectButton
              selected={settings.chatTextColor === 'default'}
              onClick={() => onChange({ chatTextColor: 'default' })}
              small
            >
              Default
            </SelectButton>
            <input
              type="color"
              value={settings.chatTextColor === 'default' ? '#ffffff' : settings.chatTextColor}
              onChange={(e) => onChange({ chatTextColor: e.target.value })}
              style={{
                width: 48,
                height: 36,
                border: `1px solid ${colors.border}`,
                cursor: 'pointer',
                background: 'transparent'
              }}
            />
            {settings.chatTextColor !== 'default' && (
              <span style={{ color: colors.textMuted, fontSize: 12, fontFamily: 'monospace' }}>
                {settings.chatTextColor}
              </span>
            )}
          </div>
        </SettingGroup>

        {/* Chat Background Color */}
        <SettingGroup label="CHAT BACKGROUND COLOR">
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <SelectButton
              selected={settings.chatBackgroundColor === 'default'}
              onClick={() => onChange({ chatBackgroundColor: 'default' })}
              small
            >
              Default
            </SelectButton>
            <input
              type="color"
              value={settings.chatBackgroundColor === 'default' ? '#0a0a0a' : settings.chatBackgroundColor}
              onChange={(e) => onChange({ chatBackgroundColor: e.target.value })}
              style={{
                width: 48,
                height: 36,
                border: `1px solid ${colors.border}`,
                cursor: 'pointer',
                background: 'transparent'
              }}
            />
            {settings.chatBackgroundColor !== 'default' && (
              <span style={{ color: colors.textMuted, fontSize: 12, fontFamily: 'monospace' }}>
                {settings.chatBackgroundColor}
              </span>
            )}
          </div>
        </SettingGroup>

        {/* Preview */}
        <SettingGroup label="PREVIEW">
          <div style={{
            padding: 16,
            background: settings.chatBackgroundColor === 'default' ? colors.surface : settings.chatBackgroundColor,
            border: `1px solid ${colors.border}`
          }}>
            <p style={{
              color: settings.chatTextColor === 'default' ? colors.textPrimary : settings.chatTextColor,
              fontSize: settings.chatFontSize === 'small' ? 12 : settings.chatFontSize === 'large' ? 15 : 13,
              margin: 0,
              lineHeight: 1.6,
              fontFamily: "'Manrope', sans-serif"
            }}>
              <strong>Agent:</strong> Created note in Marketing section
            </p>
            <p style={{
              color: settings.chatTextColor === 'default' ? colors.textMuted : settings.chatTextColor,
              fontSize: settings.chatFontSize === 'small' ? 12 : settings.chatFontSize === 'large' ? 15 : 13,
              margin: '8px 0 0 0',
              lineHeight: 1.6,
              opacity: 0.8,
              fontFamily: "'Manrope', sans-serif"
            }}>
              <strong>You:</strong> create note launch campaign tomorrow
            </p>
          </div>
        </SettingGroup>
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
      description: 'Military-style brevity. Jocko Willink discipline. Default Scratchpad style.',
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
      <h3 style={{ color: colors.textPrimary, fontSize: 16, marginBottom: 20, fontFamily: "'Manrope', sans-serif" }}>
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
                <span style={{ fontWeight: 600, fontSize: 15, fontFamily: "'Manrope', sans-serif" }}>
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
      <h3 style={{ color: colors.textPrimary, fontSize: 16, marginBottom: 20, fontFamily: "'Manrope', sans-serif" }}>
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

function DataPrivacyTab({ settings, onChange }) {
  const [exporting, setExporting] = useState(null);

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

  return (
    <div>
      <h3 style={{ color: colors.textPrimary, fontSize: 16, marginBottom: 20, fontFamily: "'Manrope', sans-serif" }}>
        Data & Privacy
      </h3>

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

      {/* Export Section */}
      <div style={{ marginTop: 40, paddingTop: 24, borderTop: `1px solid ${colors.border}` }}>
        <h4 style={{
          color: colors.textPrimary,
          fontSize: 14,
          fontWeight: 600,
          marginBottom: 20,
          letterSpacing: 0.5,
          fontFamily: "'Manrope', sans-serif"
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
          fontFamily: "'Manrope', sans-serif"
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
          fontFamily: "'Manrope', sans-serif"
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
      <h3 style={{ color: colors.textPrimary, fontSize: 16, marginBottom: 20, fontFamily: "'Manrope', sans-serif" }}>
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
        background: selected ? colors.primary : 'transparent',
        border: `1px solid ${selected ? colors.primary : colors.border}`,
        color: selected ? colors.bg : colors.textPrimary,
        fontSize: small ? 13 : 14,
        cursor: 'pointer',
        transition: 'all 0.2s'
      }}
    >
      {children}
    </button>
  );
}

function SegmentedControl({ options, value, onChange }) {
  // Normalize options to objects
  const normalizedOptions = options.map(opt =>
    typeof opt === 'string' ? { value: opt, label: opt.charAt(0).toUpperCase() + opt.slice(1) } : opt
  );

  return (
    <div style={{ display: 'flex', border: `1px solid ${colors.border}` }}>
      {normalizedOptions.map((opt, i) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          style={{
            flex: 1,
            padding: '12px 20px',
            background: value === opt.value ? colors.primary : 'transparent',
            border: 'none',
            borderRight: i < normalizedOptions.length - 1 ? `1px solid ${colors.border}` : 'none',
            color: value === opt.value ? colors.bg : colors.textPrimary,
            fontSize: 14,
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
        >
          {opt.label}
        </button>
      ))}
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
