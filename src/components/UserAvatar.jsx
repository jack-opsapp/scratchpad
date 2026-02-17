/**
 * UserAvatar Component
 *
 * Displays a user avatar with optional hover tooltip showing name and email.
 */

import React, { useState, useEffect } from 'react';
import { getUserById } from '../lib/permissions';
import { colors } from '../styles/theme';

export default function UserAvatar({ userId, size = 'sm', showTooltip = true }) {
  const [user, setUser] = useState(null);
  const [showHover, setShowHover] = useState(false);

  useEffect(() => {
    if (userId) {
      getUserById(userId)
        .then(setUser)
        .catch(console.error);
    }
  }, [userId]);

  if (!user) return null;

  const initial = user.email?.[0]?.toUpperCase() || '?';
  const sizeMap = { sm: 20, md: 28, lg: 36 };
  const fontSize = { sm: 10, md: 12, lg: 14 };
  const avatarSize = sizeMap[size];

  return (
    <div
      style={{ position: 'relative', display: 'inline-block' }}
      onMouseEnter={() => setShowHover(true)}
      onMouseLeave={() => setShowHover(false)}
    >
      <div
        style={{
          width: avatarSize,
          height: avatarSize,
          borderRadius: '50%',
          background: colors.textMuted,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: colors.bg,
          fontSize: fontSize[size],
          fontWeight: 600,
          flexShrink: 0,
        }}
      >
        {initial}
      </div>

      {showTooltip && showHover && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            marginBottom: 8,
            background: colors.surface,
            border: `1px solid ${colors.border}`,
            padding: '8px 12px',
            whiteSpace: 'nowrap',
            zIndex: 1000,
            fontSize: 12,
            color: colors.textPrimary,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 2 }}>
            {user.email.split('@')[0]}
          </div>
          <div style={{ color: colors.textMuted, fontSize: 11 }}>
            {user.email}
          </div>
        </div>
      )}
    </div>
  );
}
