import { useRef, useState, useEffect } from 'react';
import { colors } from '../styles/theme.js';

/**
 * Dropdown context menu component
 *
 * @param {object} props
 * @param {Array} props.items - Menu items: { label, icon, action, danger?, divider? }
 * @param {function} props.onClose - Called when menu should close
 * @param {{ top: number, left: number }} props.position - Initial position
 */
export function ContextMenu({ items, onClose, position }) {
  const menuRef = useRef(null);
  const [menuStyle, setMenuStyle] = useState({ opacity: 0 });

  // Adjust position to stay within viewport
  useEffect(() => {
    if (position && menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      let top = position.top;
      let left = position.left;

      // Keep menu within viewport
      if (top + rect.height > window.innerHeight - 20) {
        top = window.innerHeight - rect.height - 20;
      }
      if (left + rect.width > window.innerWidth - 20) {
        left = window.innerWidth - rect.width - 20;
      }

      setMenuStyle({ top, left, opacity: 1 });
    }
  }, [position]);

  return (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        background: colors.surface,
        border: `1px solid ${colors.border}`,
        padding: 4,
        minWidth: 180,
        zIndex: 99999,
        ...menuStyle,
      }}
    >
      {items.filter(item => item.visible !== false).map((item, i) =>
        item.divider ? (
          <div
            key={i}
            style={{
              height: 1,
              background: colors.border,
              margin: '4px 0',
            }}
          />
        ) : (
          <button
            key={i}
            onClick={async () => {
              onClose();
              await item.action();
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              width: '100%',
              padding: '8px 12px',
              background: 'transparent',
              border: 'none',
              color: item.danger ? colors.danger : colors.textMuted,
              fontSize: 12,
              fontFamily: "'Manrope', sans-serif",
              cursor: 'pointer',
              textAlign: 'left',
            }}
            onMouseOver={e => (e.currentTarget.style.background = colors.bg)}
            onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
          >
            {item.icon && <item.icon size={12} />}
            {item.label}
          </button>
        )
      )}
    </div>
  );
}

export default ContextMenu;
