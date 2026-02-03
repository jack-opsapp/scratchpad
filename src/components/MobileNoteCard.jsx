import React, { useState, useRef, useEffect } from 'react';
import { Trash2, Check, Edit3 } from 'lucide-react';

const colors = {
  bg: '#000000',
  surface: '#0a0a0a',
  border: '#1a1a1a',
  primary: '#d1b18f',
  textPrimary: '#ffffff',
  textMuted: '#888888',
  error: '#ff4444'
};

export default function MobileNoteCard({
  note,
  onToggle,
  onEdit,
  onDelete,
  isNew = false
}) {
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(note.content);
  const [swiping, setSwiping] = useState(false);
  const [swipeX, setSwipeX] = useState(0);
  const [showMenu, setShowMenu] = useState(false);

  const touchStartX = useRef(0);
  const touchStartTime = useRef(0);
  const longPressTimer = useRef(null);
  const inputRef = useRef(null);

  // Update content when note changes
  useEffect(() => {
    setContent(note.content);
  }, [note.content]);

  // Focus input when editing
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  // Handle swipe and long-press
  const handleTouchStart = (e) => {
    if (editing) return;

    touchStartX.current = e.touches[0].clientX;
    touchStartTime.current = Date.now();

    // Start long-press timer (500ms)
    longPressTimer.current = setTimeout(() => {
      setShowMenu(true);
      // Haptic feedback if supported
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }
    }, 500);
  };

  const handleTouchMove = (e) => {
    if (editing) return;

    const currentX = e.touches[0].clientX;
    const deltaX = Math.abs(currentX - touchStartX.current);

    // Cancel long-press if finger moves
    if (deltaX > 10 && longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }

    const moveX = currentX - touchStartX.current;

    // Only allow swipe left (to reveal delete)
    if (moveX < 0) {
      setSwiping(true);
      setSwipeX(Math.max(-100, moveX));
    }
  };

  const handleTouchEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }

    if (!swiping) return;

    // Snap to delete or reset
    if (swipeX < -60) {
      setSwipeX(-80);
    } else {
      setSwipeX(0);
    }

    setSwiping(false);
  };

  const handleSave = () => {
    if (content.trim() !== note.content) {
      onEdit(note.id, content.trim());
    }
    setEditing(false);
  };

  const handleCancel = () => {
    setContent(note.content);
    setEditing(false);
  };

  // Cleanup
  useEffect(() => {
    return () => {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
      }
    };
  }, []);

  // Reset swipe when clicking elsewhere
  useEffect(() => {
    const handleClickOutside = () => {
      if (swipeX !== 0) {
        setSwipeX(0);
      }
    };

    document.addEventListener('touchstart', handleClickOutside);
    return () => document.removeEventListener('touchstart', handleClickOutside);
  }, [swipeX]);

  return (
    <div style={{ position: 'relative', overflow: 'hidden' }}>
      {/* Delete button (revealed by swipe) */}
      <div
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          width: 80,
          background: colors.error,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: swipeX < -10 ? 1 : 0,
          transition: swiping ? 'none' : 'opacity 0.2s ease'
        }}
      >
        <button
          onClick={() => {
            onDelete(note.id);
            setSwipeX(0);
          }}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#fff',
            cursor: 'pointer',
            padding: 16,
            minWidth: 44,
            minHeight: 44,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <Trash2 size={20} />
        </button>
      </div>

      {/* Note card */}
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          padding: '16px 0',
          borderBottom: `1px solid ${colors.border}`,
          background: colors.bg,
          transform: `translateX(${swipeX}px)`,
          transition: swiping ? 'none' : 'transform 0.2s ease'
        }}
      >
        <div style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 16,
          paddingRight: 16
        }}>
          {/* Checkbox - 44px touch target */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggle(note.id);
            }}
            style={{
              width: 44,
              height: 44,
              minWidth: 44,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              marginLeft: -6
            }}
          >
            <div style={{
              width: 24,
              height: 24,
              border: `2px solid ${note.completed ? colors.textMuted : colors.border}`,
              background: note.completed ? colors.textMuted : 'transparent',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              {note.completed && (
                <Check size={14} color={colors.bg} strokeWidth={3} />
              )}
            </div>
          </button>

          {/* Content */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {editing ? (
              <div>
                <input
                  ref={inputRef}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  onBlur={handleSave}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSave();
                    if (e.key === 'Escape') handleCancel();
                  }}
                  style={{
                    width: '100%',
                    background: 'transparent',
                    border: `1px solid ${colors.border}`,
                    color: colors.textPrimary,
                    fontSize: 16,
                    fontFamily: "'Manrope', sans-serif",
                    outline: 'none',
                    padding: '8px 12px',
                    borderRadius: 4
                  }}
                />
              </div>
            ) : (
              <p
                onClick={() => setEditing(true)}
                style={{
                  color: note.completed ? colors.textMuted : colors.textPrimary,
                  fontSize: 16,
                  fontFamily: "'Manrope', sans-serif",
                  textDecoration: note.completed ? 'line-through' : 'none',
                  cursor: 'text',
                  margin: 0,
                  lineHeight: 1.5,
                  wordBreak: 'break-word',
                  paddingTop: 2
                }}
              >
                {note.content}
              </p>
            )}

            {/* Tags and date */}
            {(note.tags?.length > 0 || note.date) && !editing && (
              <div style={{
                display: 'flex',
                gap: 8,
                marginTop: 10,
                alignItems: 'center',
                flexWrap: 'wrap'
              }}>
                {note.tags?.map(tag => (
                  <span
                    key={tag}
                    style={{
                      display: 'inline-flex',
                      padding: '3px 8px',
                      border: `1px solid ${colors.border}`,
                      color: colors.textMuted,
                      fontSize: 11,
                      fontWeight: 500,
                      textTransform: 'uppercase',
                      letterSpacing: 0.5
                    }}
                  >
                    {tag}
                  </span>
                ))}
                {note.date && (
                  <span style={{ color: colors.textMuted, fontSize: 12 }}>
                    {note.date}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Long-press context menu */}
      {showMenu && (
        <div
          onClick={() => setShowMenu(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.6)',
            display: 'flex',
            alignItems: 'flex-end',
            zIndex: 9999,
            backdropFilter: 'blur(4px)'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: colors.surface,
              width: '100%',
              borderTopLeftRadius: 12,
              borderTopRightRadius: 12,
              padding: '20px 16px',
              paddingBottom: 'calc(20px + env(safe-area-inset-bottom))'
            }}
          >
            {/* Handle */}
            <div style={{
              width: 40,
              height: 4,
              background: colors.border,
              margin: '0 auto 20px',
              borderRadius: 2
            }} />

            {/* Note preview */}
            <p style={{
              color: colors.textMuted,
              fontSize: 13,
              margin: '0 0 16px 0',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}>
              {note.content}
            </p>

            {/* Edit */}
            <button
              onClick={() => {
                setEditing(true);
                setShowMenu(false);
              }}
              style={{
                width: '100%',
                padding: '16px 20px',
                background: 'transparent',
                border: `1px solid ${colors.border}`,
                color: colors.textPrimary,
                fontSize: 16,
                textAlign: 'left',
                cursor: 'pointer',
                marginBottom: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                borderRadius: 4
              }}
            >
              <Edit3 size={18} />
              Edit
            </button>

            {/* Toggle complete */}
            <button
              onClick={() => {
                onToggle(note.id);
                setShowMenu(false);
              }}
              style={{
                width: '100%',
                padding: '16px 20px',
                background: 'transparent',
                border: `1px solid ${colors.border}`,
                color: colors.textPrimary,
                fontSize: 16,
                textAlign: 'left',
                cursor: 'pointer',
                marginBottom: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                borderRadius: 4
              }}
            >
              <Check size={18} />
              {note.completed ? 'Mark incomplete' : 'Mark complete'}
            </button>

            {/* Delete */}
            <button
              onClick={() => {
                onDelete(note.id);
                setShowMenu(false);
              }}
              style={{
                width: '100%',
                padding: '16px 20px',
                background: 'transparent',
                border: `1px solid ${colors.error}`,
                color: colors.error,
                fontSize: 16,
                textAlign: 'left',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                borderRadius: 4
              }}
            >
              <Trash2 size={18} />
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
