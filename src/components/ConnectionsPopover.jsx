import { useState, useEffect, useRef } from 'react';
import { X, Sparkles, Plus, Check } from 'lucide-react';
import { colors } from '../styles/theme.js';
import { dataStore } from '../lib/storage.js';

const TYPE_COLORS = {
  related: colors.textMuted,
  supports: '#2d6b3a',
  contradicts: '#b83c2a',
  extends: colors.primary,
  source: '#7a5c1a',
};

export default function ConnectionsPopover({ noteId, position, onClose, onNavigate, onDelete, onCreateConnection, userId }) {
  const [connections, setConnections] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [acceptedIds, setAcceptedIds] = useState(new Set());
  const containerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    dataStore.getNoteConnections(noteId).then(data => {
      if (!cancelled) {
        setConnections(data || []);
        setLoading(false);

        // Fetch AI suggestions after connections load
        const connectedNoteIds = (data || []).map(c => c.connected_note_id);
        if (userId) {
          setLoadingSuggestions(true);
          dataStore.suggestConnections(noteId, userId, connectedNoteIds).then(results => {
            if (!cancelled) {
              setSuggestions(results || []);
              setLoadingSuggestions(false);
            }
          });
        }
      }
    });
    return () => { cancelled = true; };
  }, [noteId, userId]);

  // Close on click outside
  useEffect(() => {
    const handleClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  const outgoing = connections.filter(c => c.direction === 'outgoing');
  const incoming = connections.filter(c => c.direction === 'incoming');

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        top: position.top,
        left: position.left,
        width: 300,
        maxHeight: 400,
        background: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: 4,
        zIndex: 1200,
        overflow: 'hidden',
        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
      }}
    >
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '8px 12px',
        borderBottom: `1px solid ${colors.border}`,
      }}>
        <span style={{
          color: colors.textPrimary,
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: 1.5,
          fontFamily: "'Manrope', sans-serif",
        }}>
          CONNECTIONS
        </span>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: colors.textMuted,
            cursor: 'pointer',
            padding: 2,
            display: 'flex',
          }}
        >
          <X size={14} />
        </button>
      </div>

      <div style={{ maxHeight: 340, overflowY: 'auto', padding: '4px 0' }}>
        {loading ? (
          <div style={{ padding: 12, color: colors.textMuted, fontSize: 12, fontFamily: "'Manrope', sans-serif" }}>
            Loading...
          </div>
        ) : connections.length === 0 ? (
          <div style={{ padding: 12, color: colors.textMuted, fontSize: 12, fontFamily: "'Manrope', sans-serif" }}>
            No connections yet
          </div>
        ) : (
          <>
            {outgoing.length > 0 && (
              <div style={{ padding: '4px 12px' }}>
                <div style={{
                  color: colors.textMuted,
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: 1.5,
                  fontFamily: "'Manrope', sans-serif",
                  marginBottom: 4,
                  marginTop: 4,
                }}>
                  LINKS TO
                </div>
                {outgoing.map(c => (
                  <ConnectionRow key={c.connection_id} connection={c} onNavigate={onNavigate} onDelete={onDelete} />
                ))}
              </div>
            )}
            {incoming.length > 0 && (
              <div style={{ padding: '4px 12px' }}>
                <div style={{
                  color: colors.textMuted,
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: 1.5,
                  fontFamily: "'Manrope', sans-serif",
                  marginBottom: 4,
                  marginTop: 4,
                }}>
                  LINKED FROM
                </div>
                {incoming.map(c => (
                  <ConnectionRow key={c.connection_id} connection={c} onNavigate={onNavigate} onDelete={onDelete} />
                ))}
              </div>
            )}
          </>
        )}

        {/* AI Suggestions */}
        {!loading && userId && (
          <div style={{ padding: '4px 12px', borderTop: connections.length > 0 ? `1px solid ${colors.border}` : 'none' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              color: colors.primary,
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: 1.5,
              fontFamily: "'Manrope', sans-serif",
              marginBottom: 4,
              marginTop: 4,
            }}>
              <Sparkles size={10} />
              SUGGESTED
            </div>
            {loadingSuggestions ? (
              <div style={{ padding: '6px 0', color: colors.textMuted, fontSize: 11, fontFamily: "'Manrope', sans-serif" }}>
                Finding similar notes...
              </div>
            ) : suggestions.length > 0 ? (
              suggestions.map(s => (
                <SuggestionRow
                  key={s.id}
                  suggestion={s}
                  accepted={acceptedIds.has(s.id)}
                  onAccept={() => {
                    setAcceptedIds(prev => new Set([...prev, s.id]));
                    onCreateConnection?.(noteId, s.id);
                  }}
                  onNavigate={onNavigate}
                />
              ))
            ) : (
              <div style={{ padding: '6px 0', color: colors.textMuted, fontSize: 11, fontFamily: "'Manrope', sans-serif" }}>
                Building search index — check back soon
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ConnectionRow({ connection, onNavigate, onDelete }) {
  const [hover, setHover] = useState(false);
  const typeColor = TYPE_COLORS[connection.connection_type] || colors.textMuted;

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => onNavigate(
        connection.connected_note_id,
        connection.connected_note_section_id,
        connection.connected_page_id
      )}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 8px',
        borderRadius: 3,
        cursor: 'pointer',
        background: hover ? colors.surfaceRaised : 'transparent',
        transition: 'background 0.1s ease',
      }}
    >
      <span style={{
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: typeColor,
        flexShrink: 0,
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          color: colors.textPrimary,
          fontSize: 12,
          fontFamily: "'Manrope', sans-serif",
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {connection.connected_note_content?.substring(0, 50)}
        </div>
        <div style={{
          color: colors.textMuted,
          fontSize: 10,
          fontFamily: "'Manrope', sans-serif",
        }}>
          {connection.connected_page_name} / {connection.connected_section_name}
          {connection.connection_type !== 'related' && (
            <span style={{ color: typeColor, marginLeft: 4 }}>
              {connection.connection_type}
            </span>
          )}
        </div>
      </div>
      {hover && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(connection.connection_id);
          }}
          style={{
            background: 'none',
            border: 'none',
            color: colors.danger,
            cursor: 'pointer',
            padding: 2,
            display: 'flex',
            flexShrink: 0,
          }}
        >
          <X size={10} />
        </button>
      )}
    </div>
  );
}

function SuggestionRow({ suggestion, accepted, onAccept, onNavigate }) {
  const [hover, setHover] = useState(false);
  const similarity = Math.round((suggestion.similarity || 0) * 100);

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 8px',
        borderRadius: 3,
        cursor: 'pointer',
        background: hover ? colors.surfaceRaised : 'transparent',
        transition: 'background 0.1s ease',
        opacity: accepted ? 0.5 : 1,
      }}
      onClick={() => onNavigate(suggestion.id, suggestion.section_id, suggestion.page_id)}
    >
      <span style={{
        color: colors.primary,
        fontSize: 10,
        fontFamily: "'Manrope', sans-serif",
        flexShrink: 0,
        opacity: 0.7,
      }}>
        {similarity}%
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          color: colors.textPrimary,
          fontSize: 12,
          fontFamily: "'Manrope', sans-serif",
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {suggestion.content?.substring(0, 50)}
        </div>
        <div style={{
          color: colors.textMuted,
          fontSize: 10,
          fontFamily: "'Manrope', sans-serif",
        }}>
          {suggestion.page_name} / {suggestion.section_name}
        </div>
      </div>
      {!accepted ? (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onAccept();
          }}
          style={{
            background: 'none',
            border: `1px solid ${colors.border}`,
            borderRadius: 2,
            color: colors.primary,
            cursor: 'pointer',
            padding: '2px 4px',
            display: 'flex',
            flexShrink: 0,
            transition: 'border-color 0.15s ease',
          }}
          onMouseOver={e => e.currentTarget.style.borderColor = colors.primary}
          onMouseOut={e => e.currentTarget.style.borderColor = colors.border}
          title="Connect"
        >
          <Plus size={10} />
        </button>
      ) : (
        <Check size={10} style={{ color: colors.success, flexShrink: 0 }} />
      )}
    </div>
  );
}
