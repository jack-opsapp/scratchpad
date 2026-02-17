/**
 * Slate Design Tokens
 *
 * These values are the source of truth for the application's visual design.
 * They mirror the Tailwind config and can be used in inline styles or JS.
 *
 * @see /BRAND.md for full brand guidelines
 */

export const colors = {
  // Core backgrounds
  bg: '#000000',
  surface: '#0a0a0a',
  border: '#1a1a1a',

  // Brand accent - uses CSS variable set by applyTheme() so user's chosen accent applies everywhere
  primary: 'var(--color-primary, #d1b18f)',
  primaryDark: 'var(--color-primary-dark, #BC8E5E)',
  primaryLight: 'var(--color-primary-light, #E5D4C1)',

  // Text
  textPrimary: '#ffffff',
  textSecondary: '#cccccc',  // Brighter than muted, for agent responses
  textMuted: '#888888',

  // Semantic
  success: '#4CAF50',
  danger: '#ff6b6b',
};

export const fonts = {
  sans: "'Inter', system-ui, sans-serif",
  display: "'Manrope', sans-serif",
};

export const fontSizes = {
  xxs: '10px',
  xs: '11px',
  sm: '12px',
  base: '13px',
  md: '14px',
  lg: '16px',
  xl: '20px',
  '2xl': '24px',
  '3xl': '32px',
  '4xl': '56px',
};

export const fontWeights = {
  normal: 400,
  medium: 500,
  semibold: 600,
};

export const spacing = {
  0: '0',
  1: '4px',
  2: '8px',
  3: '12px',
  4: '16px',
  5: '20px',
  6: '24px',
  8: '32px',
  10: '40px',
  12: '48px',
  16: '64px',
  20: '80px',
};

export const transitions = {
  fast: '0.15s ease',
  normal: '0.2s ease',
  slow: '0.25s ease',
};

export const shadows = {
  dropdown: '0 4px 20px rgba(0, 0, 0, 0.3)',
};

export const zIndex = {
  dropdown: 100,
  modal: 9999,
  tooltip: 10000,
};

// Component-specific tokens
export const components = {
  sidebar: {
    widthExpanded: 240,
    widthCollapsed: 56,
  },
  input: {
    maxWidth: 560,
  },
  card: {
    minWidth: 280,
  },
};

// Animation timings for typewriter effects
export const typewriter = {
  titleSpeed: 40,
  bodySpeed: 25,
  subtitleSpeed: 30,
};

// Default export for convenience
export default {
  colors,
  fonts,
  fontSizes,
  fontWeights,
  spacing,
  transitions,
  shadows,
  zIndex,
  components,
  typewriter,
};
