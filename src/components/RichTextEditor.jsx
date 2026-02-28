import { useState, useRef, useEffect, useCallback } from 'react';
import { colors } from '../styles/theme.js';
import MarkdownText from './MarkdownText.jsx';

/**
 * RichTextEditor
 *
 * A split-pane markdown editor: textarea on the left, live preview on the right.
 * Falls back to a single textarea on narrow viewports.
 *
 * Props:
 *   content      {string}   - current markdown content
 *   onChange     {function} - called with (newContent) whenever content changes (debounced 1s)
 *   onSave       {function} - called immediately on blur
 *   readOnly     {boolean}  - if true, only the preview is shown
 */
export default function RichTextEditor({ content, onChange, onSave, readOnly = false }) {
  const [text, setText] = useState(content || '');
  const [showPreview, setShowPreview] = useState(false);
  const debounceTimer = useRef(null);
  const textareaRef = useRef(null);

  // Sync external content changes (e.g. switching sections)
  useEffect(() => {
    setText(content || '');
  }, [content]);

  const handleChange = useCallback((e) => {
    const newText = e.target.value;
    setText(newText);

    // Debounced auto-save after 1 second of inactivity
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      onChange(newText);
    }, 1000);
  }, [onChange]);

  const handleBlur = useCallback(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    onChange(text);
    if (onSave) onSave(text);
  }, [text, onChange, onSave]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  // Tab key inserts 2 spaces instead of moving focus
  const handleKeyDown = (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = e.target.selectionStart;
      const end = e.target.selectionEnd;
      const newText = text.slice(0, start) + '  ' + text.slice(end);
      setText(newText);
      // Re-position cursor after inserted spaces
      requestAnimationFrame(() => {
        e.target.selectionStart = start + 2;
        e.target.selectionEnd = start + 2;
      });
    }
  };

  if (readOnly) {
    return (
      <div style={{
        padding: '8px 0',
        lineHeight: 1.7,
        fontFamily: "'Manrope', sans-serif",
      }}>
        {text ? (
          <MarkdownText content={text} baseColor={colors.textSecondary} />
        ) : (
          <p style={{ color: colors.textMuted, fontSize: 13, margin: 0 }}>Empty document.</p>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        paddingBottom: 10,
        borderBottom: `1px solid ${colors.border}`,
        marginBottom: 12,
        flexShrink: 0,
      }}>
        <span style={{
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: 1.2,
          color: colors.textMuted,
          textTransform: 'uppercase',
          fontFamily: "'Manrope', sans-serif",
        }}>
          Markdown
        </span>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => setShowPreview(p => !p)}
          style={{
            background: showPreview ? colors.surfaceRaised : 'transparent',
            border: `1px solid ${colors.border}`,
            color: showPreview ? colors.textPrimary : colors.textMuted,
            cursor: 'pointer',
            padding: '3px 10px',
            fontSize: 11,
            fontWeight: 500,
            fontFamily: "'Manrope', sans-serif",
            transition: 'all 0.15s ease',
          }}
        >
          {showPreview ? 'Edit' : 'Preview'}
        </button>
      </div>

      {/* Editor / Preview */}
      {showPreview ? (
        <div style={{
          flex: 1,
          overflowY: 'auto',
          lineHeight: 1.7,
          fontFamily: "'Manrope', sans-serif",
        }}>
          {text ? (
            <MarkdownText content={text} baseColor={colors.textSecondary} />
          ) : (
            <p style={{ color: colors.textMuted, fontSize: 13, margin: 0 }}>Nothing to preview.</p>
          )}
        </div>
      ) : (
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleChange}
          onBlur={e => { e.target.style.borderColor = colors.border; handleBlur(); }}
          onFocus={e => { e.target.style.borderColor = colors.primary; }}
          onKeyDown={handleKeyDown}
          placeholder={
            '# Heading\n\nStart writing in **markdown**...\n\n- bullet point\n- another item\n\n1. numbered list\n2. second item'
          }
          spellCheck={true}
          style={{
            flex: 1,
            width: '100%',
            minHeight: 320,
            background: 'transparent',
            border: `1px solid ${colors.border}`,
            borderRadius: 2,
            color: colors.textSecondary,
            fontSize: 13,
            fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
            lineHeight: 1.7,
            padding: '12px 14px',
            resize: 'none',
            outline: 'none',
            boxSizing: 'border-box',
            transition: 'border-color 0.15s ease',
          }}
        />
      )}

      {/* Subtle markdown cheatsheet hint */}
      {!showPreview && (
        <p style={{
          marginTop: 8,
          fontSize: 10,
          color: colors.textMuted,
          fontFamily: "'Manrope', sans-serif",
          flexShrink: 0,
        }}>
          # H1 &nbsp;|&nbsp; ## H2 &nbsp;|&nbsp; **bold** &nbsp;|&nbsp; *italic* &nbsp;|&nbsp; - list &nbsp;|&nbsp; 1. numbered &nbsp;|&nbsp; `code`
        </p>
      )}
    </div>
  );
}
