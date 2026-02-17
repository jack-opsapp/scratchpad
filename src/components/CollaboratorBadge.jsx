/**
 * CollaboratorBadge Component
 *
 * Shows a small badge indicating the number of collaborators on a page.
 */

import React from 'react';

const colors = {
  primary: 'var(--color-primary, #d1b18f)',
  textMuted: '#888888',
  border: '#1a1a1a',
};

export default function CollaboratorBadge({ count, type = 'owned' }) {
  if (!count || count === 0) return null;

  const bgColor = type === 'shared' ? colors.primary : colors.textMuted;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 16,
        height: 16,
        padding: '0 4px',
        background: bgColor,
        color: '#000',
        fontSize: 9,
        fontWeight: 600,
        borderRadius: 8,
        marginLeft: 6,
      }}
    >
      {count}
    </span>
  );
}
