import { useTypewriter } from '../hooks/useTypewriter.js';
import { colors } from '../styles/theme.js';

/**
 * Displays AI agent response with typewriter animation
 *
 * @param {object} props
 * @param {object} props.response - Response object with message, note, location, options
 * @param {function} props.onOptionSelect - Handler for option button clicks
 */
export function ChatResponseBox({ response, onOptionSelect }) {
  const message = useTypewriter(response.message || '', 25);
  const note = useTypewriter(response.note || '', 20, message.done ? 100 : 99999);

  return (
    <div
      style={{
        marginBottom: 8,
        padding: '12px 18px',
        background: `${colors.surface}ee`,
        backdropFilter: 'blur(20px)',
        border: `1px solid ${colors.border}`,
      }}
    >
      {/* Main message with typewriter */}
      <p
        style={{
          color: colors.textPrimary,
          fontSize: 13,
          fontFamily: "'Manrope', sans-serif",
          margin: 0,
          lineHeight: 1.6,
          fontWeight: 500,
        }}
      >
        {message.displayed}
        {!message.done && <span style={{ color: colors.primary }}>_</span>}
      </p>

      {/* Note preview */}
      {response.note && message.done && (
        <div
          style={{
            marginTop: 8,
            padding: '8px 12px',
            background: colors.bg,
            border: `1px solid ${colors.border}`,
            display: 'inline-block',
          }}
        >
          <span
            style={{
              color: colors.textMuted,
              fontSize: 13,
              fontFamily: "'Manrope', sans-serif",
            }}
          >
            {note.displayed}
            {!note.done && <span style={{ color: colors.primary }}>_</span>}
          </span>
        </div>
      )}

      {/* Location indicator */}
      {response.location && note.done && (
        <p
          style={{
            color: colors.textMuted,
            fontSize: 11,
            fontFamily: "'Manrope', sans-serif",
            margin: '8px 0 0 0',
          }}
        >
          → {response.location}
        </p>
      )}

      {/* Option buttons */}
      {response.options?.length > 0 && note.done && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          {response.options.map((opt, i) => (
            <button
              key={i}
              onClick={() => onOptionSelect(opt)}
              style={{
                padding: '6px 12px',
                background: 'transparent',
                border: `1px solid ${colors.border}`,
                color: colors.textPrimary,
                fontSize: 12,
                fontFamily: "'Manrope', sans-serif",
                cursor: 'pointer',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default ChatResponseBox;
