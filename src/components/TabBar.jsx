import React from 'react';
import { colors } from '../styles/theme';

export default function TabBar({ tabs = [], activeTab, onChange }) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 24,
        borderBottom: `1px solid ${colors.border}`,
        background: colors.bg,
      }}
    >
      {tabs.map((tab) => {
        const isActive = tab.value === activeTab;
        return (
          <button
            key={tab.value}
            onClick={() => onChange?.(tab.value)}
            style={{
              padding: '0 0 12px 0',
              background: 'transparent',
              border: 'none',
              borderBottom: isActive ? `2px solid ${colors.primary}` : '2px solid transparent',
              color: isActive ? colors.textPrimary : colors.textMuted,
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'color 150ms ease, border-color 150ms ease',
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
