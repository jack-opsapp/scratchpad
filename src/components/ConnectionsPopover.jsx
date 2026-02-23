import { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { colors } from '../styles/theme.js';
import { dataStore } from '../lib/storage.js';

const TYPE_COLORS = {
  related: colors.textMuted,
  supports: '#2d6b3a',
  contradicts: '#b83c2a',
  extends: colors.primary,
  source: '#7a5c1a',
};

export default function ConnectionsPopover({ noteId, position, onClose, onNavigate, onDelete }) {
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    dataStore.getNoteConnections(noteId).then(data => {
      if (!cancelled) {
        setConnections(data || []);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [noteId]);

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
