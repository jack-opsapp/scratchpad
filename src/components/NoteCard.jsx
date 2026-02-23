import { useState, useRef } from 'react';
import { Check, Trash2, Link2 } from 'lucide-react';
import { useTypewriter } from '../hooks/useTypewriter.js';
import { colors } from '../styles/theme.js';
import { TagPill } from './TagPill.jsx';
import UserAvatar from './UserAvatar.jsx';
import { parseWikilinks, buildWikilink } from '../lib/wikilinks.js';

/**
 * Render note content with wikilink chips inline
 */
function renderContentWithLinks(content, onLinkClick) {
  const segments = parseWikilinks(content);
  if (segments.length === 1 && segments[0].type === 'text') {
    return content;
  }
  return segments.map((seg, i) => {
    if (seg.type === 'text') return <span key={i}>{seg.value}</span>;
    return (
      <span
        key={i}
        onClick={(e) => {
          e.stopPropagation();
          onLinkClick?.(seg.noteId);
        }}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 2,
          padding: '0 1px',
          margin: '0 1px',
          background: 'transparent',
          border: '1px solid transparent',
          borderRadius: 2,
          color: colors.primary,
          fontSize: 13,
          cursor: 'pointer',
          transition: 'border-color 0.15s ease',
          verticalAlign: 'baseline',
        }}
        onMouseOver={e => {
          e.currentTarget.style.borderColor = colors.primary;
          e.currentTarget.querySelector('.wikilink-icon').style.opacity = '1';
        }}
        onMouseOut={e => {
          e.currentTarget.style.borderColor = 'transparent';
          e.currentTarget.querySelector('.wikilink-icon').style.opacity = '0';
        }}
      >
        <span style={{ color: colors.textMuted, fontSize: 11 }}>[[</span>
        <Link2 className="wikilink-icon" size={10} style={{ flexShrink: 0, opacity: 0, transition: 'opacity 0.15s ease' }} />
        {seg.displayText}
        <span style={{ color: colors.textMuted, fontSize: 11 }}>]]</span>
      </span>
    );
  });
}

/**
 * Inline wikilink autocomplete for note editing (uses WikilinkAutocomplete pattern)
 */
function WikilinkAutocompleteInline({ notes, position, onSelect, onClose }) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const searchRef = useRef(null);
  const containerRef = useRef(null);

  const filtered = (notes || [])
    .filter(n => n.content && n.content.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 6);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        top: position.top,
        left: position.left,
        width: 260,
        maxHeight: 280,
        background: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: 4,
        zIndex: 1200,
        overflow: 'hidden',
        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
      }}
      onMouseDown={e => e.preventDefault()} // Prevent blur on parent input
    >
      <input
        ref={searchRef}
        value={query}
        onChange={e => { setQuery(e.target.value); setSelectedIndex(0); }}
        onKeyDown={e => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex(i => Math.min(i + 1, filtered.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex(i => Math.max(i - 1, 0)); }
          else if (e.key === 'Enter' && filtered.length > 0) { e.preventDefault(); onSelect(filtered[selectedIndex]); }
          else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
        }}
        placeholder="Search notes..."
        style={{
          width: '100%',
          padding: '6px 10px',
          background: colors.bg,
          border: 'none',
          borderBottom: `1px solid ${colors.border}`,
          color: colors.textPrimary,
          fontSize: 12,
          fontFamily: "'Inter', sans-serif",
          outline: 'none',
          boxSizing: 'border-box',
        }}
      />
      <div style={{ maxHeight: 220, overflowY: 'auto' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: 10, color: colors.textMuted, fontSize: 11, fontFamily: "'Inter', sans-serif" }}>
            No matching notes
          </div>
        ) : (
          filtered.map((n, i) => (
            <div
              key={n.id}
              onClick={() => onSelect(n)}
              onMouseEnter={() => setSelectedIndex(i)}
              style={{
                padding: '6px 10px',
                cursor: 'pointer',
                background: i === selectedIndex ? colors.surfaceRaised : 'transparent',
                borderBottom: `1px solid ${colors.border}`,
              }}
            >
              <div style={{ color: colors.textPrimary, fontSize: 12, fontFamily: "'Inter', sans-serif", whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {n.content?.substring(0, 50)}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

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
 * @param {function} props.onAddTag - Add tag handler, receives noteId
 * @param {function} props.onLinkClick - Handler when a wikilink chip is clicked (noteId)
 * @param {number} props.connectionCount - Number of connections for this note
 * @param {function} props.onConnectionBadgeClick - Handler for connection badge click (noteId, event)
 * @param {Array} props.allNotes - All notes for wikilink autocomplete
 * @param {function} props.onCreateConnection - Handler to create a connection via wikilink
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
  onAddTag,
  draggable = false,
  onLinkClick,
  connectionCount = 0,
  onConnectionBadgeClick,
  allNotes = [],
  onCreateConnection,
}) {
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(note.content);
  const [dragHover, setDragHover] = useState(false);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [autocompletePos, setAutocompletePos] = useState({ top: 0, left: 0 });
  const inputRef = useRef(null);
  const typewriter = useTypewriter(note.content, 20, 0, isNew);

  const handleDragStart = (e) => {
    e.dataTransfer.setData('text/plain', `note:${note.id}`);
    e.dataTransfer.setData('application/x-note-content', note.content);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const isOwnNote = note.created_by_user_id === currentUserId;
  const showCreatorAvatar = note.created_by_user_id && !isOwnNote;

  return (
    <div
      style={{ padding: '16px 0', borderBottom: `1px solid ${colors.border}` }}
      onMouseEnter={() => setDragHover(true)}
      onMouseLeave={() => setDragHover(false)}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
        {/* Drag handle */}
        {draggable && (
          <div
            draggable
            onDragStart={handleDragStart}
            style={{
              display: 'grid',
              gridTemplateColumns: '4px 4px',
              gap: 3,
              cursor: 'grab',
              padding: '4px 2px',
              marginTop: 2,
              flexShrink: 0,
              opacity: dragHover ? 0.6 : 0,
              transition: 'opacity 0.15s ease',
            }}
            title="Drag to chat"
          >
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                style={{
                  width: 4,
                  height: 4,
                  borderRadius: '50%',
                  background: colors.textMuted,
                }}
              />
            ))}
          </div>
        )}

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
            <div style={{ position: 'relative' }}>
              <input
                ref={inputRef}
                value={content}
                onChange={e => {
                  const val = e.target.value;
                  setContent(val);
                  // Detect [[ trigger for wikilink autocomplete
                  const cursorPos = e.target.selectionStart;
                  const textBefore = val.substring(0, cursorPos);
                  if (textBefore.endsWith('[[')) {
                    const rect = e.target.getBoundingClientRect();
                    setAutocompletePos({ top: rect.bottom + 4, left: rect.left });
                    setShowAutocomplete(true);
                  } else if (!textBefore.includes('[[') || textBefore.endsWith(']]')) {
                    setShowAutocomplete(false);
                  }
                }}
                onBlur={() => {
                  // Small delay to allow autocomplete click to register
                  setTimeout(() => {
                    if (!showAutocomplete) {
                      onEdit(note.id, content);
                      setEditing(false);
                    }
                  }, 150);
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !showAutocomplete) {
                    onEdit(note.id, content);
                    setEditing(false);
                  }
                  if (e.key === 'Escape') {
                    setShowAutocomplete(false);
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
                  fontFamily: "'Inter', sans-serif",
                  outline: 'none',
                }}
              />
              {showAutocomplete && (
                <WikilinkAutocompleteInline
                  notes={allNotes.filter(n => n.id !== note.id)}
                  position={autocompletePos}
                  onSelect={(targetNote) => {
                    // Replace the [[ trigger with the full wikilink
                    const cursorPos = inputRef.current?.selectionStart || content.length;
                    const textBefore = content.substring(0, cursorPos);
                    const lastBracket = textBefore.lastIndexOf('[[');
                    const displayText = targetNote.content?.substring(0, 40) || 'note';
                    const wikilink = buildWikilink(targetNote.id, displayText);
                    const newContent = content.substring(0, lastBracket) + wikilink + content.substring(cursorPos);
                    setContent(newContent);
                    setShowAutocomplete(false);
                    onCreateConnection?.(note.id, targetNote.id);
                    inputRef.current?.focus();
                  }}
                  onClose={() => setShowAutocomplete(false)}
                />
              )}
            </div>
          ) : (
            <p
              onClick={() => canEdit && setEditing(true)}
              style={{
                color: note.completed ? colors.textMuted : colors.textPrimary,
                fontSize: 14,
                fontFamily: "'Inter', sans-serif",
                textDecoration: note.completed ? 'line-through' : 'none',
                cursor: canEdit ? 'text' : 'default',
                margin: 0,
                lineHeight: 1.5,
              }}
            >
              {isNew ? (
                <>
                  {typewriter.displayed}
                  {!typewriter.done && <span style={{ color: colors.primary }}>_</span>}
                </>
              ) : (
                renderContentWithLinks(note.content, onLinkClick)
              )}
            </p>
          )}

          {/* Tags and date - hidden in compact mode */}
          {!compact && (note.tags?.length > 0 || note.date || canEdit) && (!isNew || typewriter.done) && (
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
              {canEdit && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddTag?.(note.id);
                  }}
                  style={{
                    width: 20,
                    height: 20,
                    border: `1px dashed ${colors.border}`,
                    background: 'transparent',
                    color: colors.textMuted,
                    fontSize: 12,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    borderRadius: 2,
                    padding: 0,
                  }}
                  title="Add tag"
                >
                  +
                </button>
              )}
              {connectionCount > 0 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onConnectionBadgeClick?.(note.id, e);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '2px 8px',
                    background: 'transparent',
                    border: `1px solid ${colors.border}`,
                    borderRadius: 2,
                    color: colors.primary,
                    fontSize: 11,
                    fontFamily: "'Inter', sans-serif",
                    cursor: 'pointer',
                    transition: 'border-color 0.15s ease',
                  }}
                  onMouseOver={e => e.currentTarget.style.borderColor = colors.primary}
                  onMouseOut={e => e.currentTarget.style.borderColor = colors.border}
                  title={`${connectionCount} connection${connectionCount !== 1 ? 's' : ''}`}
                >
                  <Link2 size={10} />
                  {connectionCount}
                </button>
              )}
              {note.date && (
                <span
                  style={{
                    color: colors.textMuted,
                    fontSize: 11,
                    fontFamily: "'Inter', sans-serif",
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
              color: '#b83c2a',
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
