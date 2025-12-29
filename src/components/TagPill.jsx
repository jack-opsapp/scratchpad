import { colors } from '../styles/theme.js';

/**
 * Tag pill component for displaying and selecting tags
 *
 * @param {object} props
 * @param {string} props.tag - Tag text
 * @param {boolean} props.small - Use smaller sizing
 * @param {boolean} props.selected - Whether tag is selected
 * @param {function} props.onClick - Click handler
 */
export function TagPill({ tag, small, selected, onClick }) {
  return (
    <span
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: small ? '2px 6px' : '3px 8px',
        border: `1px solid ${selected ? colors.primary : colors.border}`,
        color: selected ? colors.primary : colors.textMuted,
        fontSize: small ? 10 : 11,
        fontWeight: 500,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      {tag}
    </span>
  );
}

export default TagPill;
