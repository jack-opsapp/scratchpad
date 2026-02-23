import { useState, useEffect, useRef } from 'react';
import { colors } from '../styles/theme.js';

/**
 * Autocomplete popover that appears when user types [[
 * Shows matching notes for creating wikilinks.
 */
export function WikilinkAutocomplete({ notes, position, onSelect, onClose }) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

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

  const filtered = (notes || [])
    .filter(n => n.content && n.content.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 8);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && filtered.length > 0) {
      e.preventDefault();
      onSelect(filtered[selectedIndex]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        top: position.top,
        left: position.left,
        width: 280,
        maxHeight: 320,
        background: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: 4,
        zIndex: 1200,
        overflow: 'hidden',
        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
      }}
    >
      <input
        ref={inputRef}
        value={query}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Search notes..."
        style={{
          width: '100%',
          padding: '8px 12px',
          background: colors.bg,
          border: 'none',
          borderBottom: `1px solid ${colors.border}`,
          color: colors.textPrimary,
          fontSize: 13,
          fontFamily: "'Manrope', sans-serif",
          outline: 'none',
          boxSizing: 'border-box',
        }}
      />
      <div style={{ maxHeight: 260, overflowY: 'auto' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: '12px', color: colors.textMuted, fontSize: 12, fontFamily: "'Manrope', sans-serif" }}>
            No matching notes
          </div>
        ) : (
          filtered.map((note, i) => (
            <div
              key={note.id}
              onClick={() => onSelect(note)}
              onMouseEnter={() => setSelectedIndex(i)}
              style={{
                padding: '8px 12px',
                cursor: 'pointer',
                background: i === selectedIndex ? colors.surfaceRaised : 'transparent',
                borderBottom: `1px solid ${colors.border}`,
                transition: 'background 0.1s ease',
              }}
            >
              <div style={{
                color: colors.textPrimary,
                fontSize: 13,
                fontFamily: "'Manrope', sans-serif",
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>
                {note.content.substring(0, 60)}
              </div>
              {note.pageName && (
                <div style={{ color: colors.textMuted, fontSize: 11, fontFamily: "'Manrope', sans-serif", marginTop: 2 }}>
                  {note.pageName} / {note.sectionName}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default WikilinkAutocomplete;
