import { useState, useMemo } from 'react';
import { X } from 'lucide-react';
import { colors } from '../styles/theme';

/**
 * RichTextConvertModal
 *
 * When converting a section with existing notes to rich text,
 * lets the user map each tag to a heading role (H1, H2, or Body).
 * Generates structured markdown from the notes accordingly.
 */
export default function RichTextConvertModal({
  sectionName,
  notes,
  onConvert,
  onClose,
}) {
  // Collect unique tags across all notes
  const uniqueTags = useMemo(() => {
    const tagSet = new Set();
    notes.forEach(n => (n.tags || []).forEach(t => tagSet.add(t)));
    return [...tagSet].sort();
  }, [notes]);

  // { [tag]: 'h1' | 'h2' | 'body' }
  const [tagRoles, setTagRoles] = useState(() => {
    const initial = {};
    uniqueTags.forEach(t => { initial[t] = 'body'; });
    return initial;
  });

  const setRole = (tag, role) => {
    setTagRoles(prev => ({ ...prev, [tag]: role }));
  };

  // Priority: h1 > h2 > body
  const rolePriority = { h1: 2, h2: 1, body: 0 };

  // Generate markdown from notes + role mapping
  const markdown = useMemo(() => {
    const lines = [];
    notes.forEach(n => {
      const content = (n.content || '').trim();
      if (!content) return;
      // Determine the highest-priority role from this note's tags
      let bestRole = 'body';
      (n.tags || []).forEach(t => {
        const role = tagRoles[t] || 'body';
        if (rolePriority[role] > rolePriority[bestRole]) bestRole = role;
      });
      if (bestRole === 'h1') {
        if (lines.length > 0) lines.push('');
        lines.push(`# ${content}`);
      } else if (bestRole === 'h2') {
        if (lines.length > 0) lines.push('');
        lines.push(`## ${content}`);
      } else {
        lines.push(`- ${content}`);
      }
    });
    return lines.join('\n');
  }, [notes, tagRoles]);

  const roleButtons = ['h1', 'h2', 'body'];
  const roleLabels = { h1: 'H1', h2: 'H2', body: 'Body' };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99999,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: colors.surface,
          border: `1px solid ${colors.border}`,
          width: 'min(560px, 90%)',
          maxHeight: '80vh',
          overflow: 'auto',
          fontFamily: "'Manrope', sans-serif",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: 20,
            borderBottom: `1px solid ${colors.border}`,
          }}
        >
          <h2
            style={{
              color: colors.textPrimary,
              fontSize: 18,
              fontWeight: 600,
              margin: 0,
            }}
          >
            Convert "{sectionName}"
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: colors.textMuted,
              cursor: 'pointer',
              padding: 4,
              display: 'flex',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Tag role mapping */}
        <div style={{ padding: 20 }}>
          {uniqueTags.length > 0 && (
            <>
              <p style={{ color: colors.textSecondary, fontSize: 13, margin: '0 0 16px' }}>
                Map each tag to a heading level:
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                {uniqueTags.map(tag => (
                  <div
                    key={tag}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                    }}
                  >
                    <span
                      style={{
                        color: colors.textPrimary,
                        fontSize: 13,
                        fontWeight: 500,
                        minWidth: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {tag}
                    </span>
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      {roleButtons.map(role => (
                        <button
                          key={role}
                          onClick={() => setRole(tag, role)}
                          style={{
                            padding: '4px 10px',
                            fontSize: 11,
                            fontWeight: 600,
                            fontFamily: "'Manrope', sans-serif",
                            border: `1px solid ${tagRoles[tag] === role ? colors.primary : colors.border}`,
                            background: tagRoles[tag] === role ? colors.primary : 'transparent',
                            color: tagRoles[tag] === role ? '#000' : colors.textSecondary,
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          {roleLabels[role]}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          <p style={{ color: colors.textMuted, fontSize: 11, margin: '0 0 16px' }}>
            Untagged notes become bullet points.
          </p>

          {/* Live markdown preview */}
          <p style={{ color: colors.textSecondary, fontSize: 13, fontWeight: 500, margin: '0 0 8px' }}>
            Preview
          </p>
          <pre
            style={{
              background: colors.bg,
              border: `1px solid ${colors.border}`,
              padding: 16,
              fontSize: 12,
              color: colors.textSecondary,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              maxHeight: 200,
              overflow: 'auto',
              margin: 0,
              fontFamily: 'monospace',
            }}
          >
            {markdown || '(empty)'}
          </pre>
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 10,
            padding: '16px 20px',
            borderTop: `1px solid ${colors.border}`,
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              fontSize: 13,
              fontWeight: 500,
              fontFamily: "'Manrope', sans-serif",
              background: 'transparent',
              border: `1px solid ${colors.border}`,
              color: colors.textSecondary,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => onConvert(markdown)}
            style={{
              padding: '8px 16px',
              fontSize: 13,
              fontWeight: 500,
              fontFamily: "'Manrope', sans-serif",
              background: colors.primary,
              border: 'none',
              color: '#000',
              cursor: 'pointer',
            }}
          >
            Convert
          </button>
        </div>
      </div>
    </div>
  );
}
