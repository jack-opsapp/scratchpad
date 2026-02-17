import React from 'react';
import { colors } from '../styles/theme';

export default function Toggle({ checked, onChange, disabled = false, label }) {
  return (
    <label
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => !disabled && onChange?.(!checked)}
        disabled={disabled}
        style={{
          width: 36,
          height: 20,
          borderRadius: 9999,
          background: checked ? colors.primary : colors.border,
          border: 'none',
          padding: 2,
          cursor: disabled ? 'not-allowed' : 'pointer',
          position: 'relative',
          transition: 'background 150ms ease',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: 16,
            height: 16,
            borderRadius: 9999,
            background: colors.textPrimary,
            transform: checked ? 'translateX(16px)' : 'translateX(0)',
            transition: 'transform 150ms ease',
          }}
        />
      </button>
      {label && (
        <span style={{ color: colors.textPrimary, fontSize: 13, fontWeight: 500 }}>
          {label}
        </span>
      )}
    </label>
  );
}
