import React from 'react';
import { colors } from '../styles/theme';

const VARIANTS = {
  accent: {
    background: colors.primary,
    color: colors.accentForeground,
  },
  error: {
    background: colors.danger,
    color: '#fde4de',
  },
  success: {
    background: colors.success,
    color: '#d6f0dc',
  },
  warning: {
    background: colors.warning,
    color: '#f5e6c0',
  },
};

export default function Badge({ children, variant = 'accent', size = 'md' }) {
  const style = VARIANTS[variant] || VARIANTS.accent;
  const isSmall = size === 'sm';

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: isSmall ? '2px 4px' : '4px 8px',
        background: style.background,
        color: style.color,
        fontSize: 11,
        fontWeight: 600,
        borderRadius: 1,
        lineHeight: 1,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}
