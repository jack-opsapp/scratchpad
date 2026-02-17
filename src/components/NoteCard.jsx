import { useState } from 'react';
import { Check, Trash2 } from 'lucide-react';
import { useTypewriter } from '../hooks/useTypewriter.js';
import { colors } from '../styles/theme.js';
import { TagPill } from './TagPill.jsx';
import UserAvatar from './UserAvatar.jsx';

/**
 * Animated note card with typewriter effect for new notes
 *
 * @param {object} props
 * @param {object} props.note - Note object
 * @param {function} props.onToggle - Toggle completion handler
 * @param {function} props.onEdit - Edit content handler
 * @param {function} props.onDelete - Delete handler
 * @param {boolean} props.isNew - Whether to animate as new note
 * @param {string} props.currentUserId - Current user's ID
 * @param {boolean} props.canEdit - Whether user can edit this note
 * @param {boolean} props.canDelete - Whether user can delete this note
 * @param {boolean} props.canToggle - Whether user can toggle completion
 * @param {boolean} props.compact - Hide details (tags, dates, avatars) for easy copy
 */
export function NoteCard({
  note,
  onToggle,
  onEdit,
  onDelete,
  isNew,
  currentUserId,
  canEdit = true,
  canDelete = true,
  canToggle = true,
  compact = false,
  onTagClick,
}) {
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(note.content);
  const typewriter = useTypewriter(note.content, 20, 0, isNew);

  const isOwnNote = note.created_by_user_id === currentUserId;
  const showCreatorAvatar = note.created_by_user_id && !isOwnNote;

  return (
    <div style={{ padding: '16px 0', borderBottom: `1px solid ${colors.border}` }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
        {/* Checkbox */}
        <button
          onClick={() => canToggle && onToggle(note.id)}
          disabled={!canToggle}
          style={{
            width: 16,
            height: 16,
            border: `1px solid ${note.completed ? colors.textMuted : colors.border}`,
            background: note.completed ? colors.textMuted : 'transparent',
            cursor: canToggle ? 'pointer' : 'default',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            marginTop: 3,
            opacity: canToggle ? 1 : 0.5,
          }}
        >
          {note.completed && <Check size={10} color={colors.bg} strokeWidth={3} />}
        </button>

        {/* Creator Avatar (for shared pages) - hidden in compact mode */}
        {showCreatorAvatar && !compact && (
          <div style={{ flexShrink: 0, marginTop: 2 }}>
            <UserAvatar userId={note.created_by_user_id} size="sm" showTooltip={true} />
          </div>
        )}

        {/* Content */}
        <div style={{ flex: 1 }}>
          {editing && canEdit ? (
            <input
              value={content}
              onChange={e => setContent(e.target.value)}
              onBlur={() => {
                onEdit(note.id, content);
                setEditing(false);
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  onEdit(note.id, content);
                  setEditing(false);
                }
              }}
              autoFocus
              style={{
                width: '100%',
                background: 'transparent',
                border: 'none',
                color: colors.textPrimary,
                fontSize: 14,
                fontFamily: "'Manrope', sans-serif",
                outline: 'none',
              }}
            />
          ) : (
            <p
              onClick={() => canEdit && setEditing(true)}
              style={{
                color: note.completed ? colors.textMuted : colors.textPrimary,
                fontSize: 14,
                fontFamily: "'Manrope', sans-serif",
                textDecoration: note.completed ? 'line-through' : 'none',
                cursor: canEdit ? 'text' : 'default',
                margin: 0,
                lineHeight: 1.5,
              }}
            >
              {isNew ? typewriter.displayed : note.content}
              {isNew && !typewriter.done && (
                <span style={{ color: colors.primary }}>_</span>
              )}
            </p>
          )}

          {/* Tags and date - hidden in compact mode */}
          {!compact && (note.tags?.length > 0 || note.date) && (!isNew || typewriter.done) && (
            <div
              style={{
                display: 'flex',
                gap: 8,
                marginTop: 10,
                alignItems: 'center',
                flexWrap: 'wrap',
              }}
            >
              {note.tags?.map(tag => (
                <TagPill key={tag} tag={tag} small onClick={() => onTagClick?.(tag)} />
              ))}
              {note.date && (
                <span
                  style={{
                    color: colors.textMuted,
                    fontSize: 11,
                    fontFamily: "'Manrope', sans-serif",
                  }}
                >
                  {note.date}
                </span>
              )}
            </div>
          )}

          {/* Completion info - hidden in compact mode */}
          {!compact && note.completed && note.completed_by_user_id && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                marginTop: 8,
                fontSize: 11,
                color: colors.textMuted,
              }}
            >
              <Check size={10} />
              <span>Completed by</span>
              <UserAvatar
                userId={note.completed_by_user_id}
                size="sm"
                showTooltip={true}
              />
              {note.completed_at && (
                <span>
                  on {new Date(note.completed_at).toLocaleDateString()}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Delete button - hidden in compact mode */}
        {canDelete && !compact && (
          <button
            onClick={() => onDelete(note.id)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#ff4444',
              cursor: 'pointer',
              padding: 4,
              opacity: 0.7,
            }}
            onMouseOver={e => (e.currentTarget.style.opacity = 1)}
            onMouseOut={e => (e.currentTarget.style.opacity = 0.7)}
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

export default NoteCard;
