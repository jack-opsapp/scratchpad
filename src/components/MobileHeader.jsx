import React from 'react';
import { Menu, MoreVertical, ChevronLeft, X } from 'lucide-react';
import { colors } from '../styles/theme';

export default function MobileHeader({
  currentPage,
  currentSection,
  onMenuClick,
  onMoreClick,
  onBackClick,
  showBack = false,
  agentViewTitle = null,
  onCloseAgentView
}) {
  return (
    <div style={{
      height: 56,
      background: colors.surface,
      borderBottom: `1px solid ${colors.border}`,
      display: 'flex',
      alignItems: 'center',
      padding: '0 8px',
      gap: 4,
      position: 'sticky',
      top: 0,
      zIndex: 100,
      paddingTop: 'env(safe-area-inset-top)'
    }}>
      {/* Left button - Menu or Back */}
      {showBack ? (
        <button
          onClick={onBackClick}
          style={{
            background: 'transparent',
            border: 'none',
            padding: 8,
            cursor: 'pointer',
            color: colors.textMuted,
            minWidth: 44,
            minHeight: 44,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          aria-label="Go back"
        >
          <ChevronLeft size={24} />
        </button>
      ) : (
        <button
          onClick={onMenuClick}
          style={{
            background: 'transparent',
            border: 'none',
            padding: 8,
            cursor: 'pointer',
            color: colors.textMuted,
            minWidth: 44,
            minHeight: 44,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          aria-label="Open menu"
        >
          <Menu size={22} />
        </button>
      )}

      {/* Breadcrumb */}
      <div style={{ flex: 1, minWidth: 0, paddingLeft: 4 }}>
        <p style={{
          color: colors.textPrimary,
          fontSize: 15,
          fontWeight: 600,
          margin: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          fontFamily: "'Inter', sans-serif"
        }}>
          {agentViewTitle ? (
            <>
              <span style={{ color: colors.textMuted, fontWeight: 400 }}>AGENT / </span>
              {agentViewTitle}
            </>
          ) : (
            <>
              {currentPage || 'Slate'}
              {currentSection && (
                <span style={{ color: colors.textMuted, fontWeight: 400 }}>
                  {' / '}{currentSection}
                </span>
              )}
            </>
          )}
        </p>
      </div>

      {/* Close agent view button */}
      {agentViewTitle && onCloseAgentView && (
        <button
          onClick={onCloseAgentView}
          style={{
            background: 'transparent',
            border: 'none',
            padding: 8,
            cursor: 'pointer',
            color: colors.textMuted,
            minWidth: 44,
            minHeight: 44,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          aria-label="Close agent view"
        >
          <X size={18} />
        </button>
      )}

      {/* More options */}
      {!agentViewTitle && (
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onMoreClick && onMoreClick(e);
        }}
        onTouchEnd={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onMoreClick && onMoreClick(e);
        }}
        style={{
          background: 'transparent',
          border: 'none',
          padding: 8,
          cursor: 'pointer',
          color: colors.textMuted,
          minWidth: 44,
          minHeight: 44,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          WebkitTapHighlightColor: 'transparent',
          touchAction: 'manipulation'
        }}
        aria-label="More options"
      >
        <MoreVertical size={20} />
      </button>
      )}
    </div>
  );
}
