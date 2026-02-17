import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { colors } from '../styles/theme';

export default function Dropdown({ options = [], value, onChange, placeholder = 'Select...', disabled = false }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const selected = options.find(o => o.value === value);

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          height: 40,
          padding: '8px 12px',
          background: colors.surface,
          border: `1px solid ${colors.border}`,
          borderRadius: 2,
          color: selected ? colors.textPrimary : colors.textMuted,
          fontSize: 13,
          fontWeight: 500,
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          minWidth: 160,
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          size={14}
          color={colors.textMuted}
          style={{
            flexShrink: 0,
            transform: open ? 'rotate(180deg)' : 'rotate(0)',
            transition: 'transform 150ms ease',
          }}
        />
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: 4,
            background: colors.surface,
            border: `1px solid ${colors.border}`,
            borderRadius: 2,
            zIndex: 100,
            maxHeight: 220,
            overflowY: 'auto',
          }}
        >
          {options.map((option, i) => (
            <button
              key={option.value}
              onClick={() => {
                onChange?.(option.value);
                setOpen(false);
              }}
              style={{
                width: '100%',
                height: 36,
                padding: '8px 12px',
                background: option.value === value ? colors.surfaceRaised : 'transparent',
                border: 'none',
                borderBottom: i < options.length - 1 ? `1px solid ${colors.border}` : 'none',
                color: option.value === value ? colors.textPrimary : colors.textSecondary,
                fontSize: 13,
                fontWeight: 500,
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
