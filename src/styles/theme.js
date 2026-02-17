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
  surface: '#0d0d0d',
  surfaceRaised: '#1a1a1a',
  border: 'rgba(255, 255, 255, 0.1)',

  // Brand accent - uses CSS variable set by applyTheme() so user's chosen accent applies everywhere
  primary: 'var(--color-primary, #948b72)',
  primaryDark: 'var(--color-primary-dark, #766f5b)',
  primaryLight: 'var(--color-primary-light, #b5ae9a)',
  accentForeground: '#0d0d0d',

  // Text
  textPrimary: '#e8e8e8',
  textSecondary: '#a0a0a0',
  textMuted: '#525252',

  // Semantic
  success: '#2d6b3a',
  danger: '#b83c2a',
  warning: '#7a5c1a',

  // Overlay
  overlay: 'rgba(0, 0, 0, 0.72)',
};

export const fonts = {
  sans: "'Inter', 'Helvetica Now', 'Helvetica Neue', Arial, sans-serif",
  mono: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace",
};

export const fontSizes = {
  xs: '11px',
  sm: '13px',
  base: '14px',
  md: '16px',
  lg: '18px',
  xl: '24px',
  '2xl': '32px',
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
  sm: 'none',
  md: 'none',
  lg: 'none',
  dropdown: 'none',
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
