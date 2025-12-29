import { useState } from 'react';
import { Check, Trash2 } from 'lucide-react';
import { useTypewriter } from '../hooks/useTypewriter.js';
import { colors } from '../styles/theme.js';
import { TagPill } from './TagPill.jsx';

/**
 * Animated note card with typewriter effect for new notes
 *
 * @param {object} props
 * @param {object} props.note - Note object
 * @param {function} props.onToggle - Toggle completion handler
 * @param {function} props.onEdit - Edit content handler
 * @param {function} props.onDelete - Delete handler
 * @param {boolean} props.isNew - Whether to animate as new note
 */
export function NoteCard({ note, onToggle, onEdit, onDelete, isNew }) {
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(note.content);
  const typewriter = useTypewriter(note.content, 20, 0, isNew);

  return (
    <div style={{ padding: '16px 0', borderBottom: `1px solid ${colors.border}` }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
        {/* Checkbox */}
        <button
          onClick={() => onToggle(note.id)}
          style={{
            width: 16,
            height: 16,
            border: `1px solid ${note.completed ? colors.textMuted : colors.border}`,
            background: note.completed ? colors.textMuted : 'transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            marginTop: 3,
          }}
        >
          {note.completed && <Check size={10} color={colors.bg} strokeWidth={3} />}
        </button>

        {/* Content */}
        <div style={{ flex: 1 }}>
          {editing ? (
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
              onClick={() => setEditing(true)}
              style={{
                color: note.completed ? colors.textMuted : colors.textPrimary,
                fontSize: 14,
                fontFamily: "'Manrope', sans-serif",
                textDecoration: note.completed ? 'line-through' : 'none',
                cursor: 'text',
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

          {/* Tags and date */}
          {(note.tags?.length > 0 || note.date) && (!isNew || typewriter.done) && (
            <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
              {note.tags?.map(tag => (
                <TagPill key={tag} tag={tag} small />
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
        </div>

        {/* Delete button */}
        <button
          onClick={() => onDelete(note.id)}
          style={{
            background: 'transparent',
            border: 'none',
            color: colors.textMuted,
            cursor: 'pointer',
            padding: 4,
            opacity: 0.3,
          }}
          onMouseOver={e => (e.currentTarget.style.opacity = 1)}
          onMouseOut={e => (e.currentTarget.style.opacity = 0.3)}
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

export default NoteCard;
