/**
 * Theme System
 *
 * Manages theme colors, accent colors, and applies them to the document.
 * Supports dark/light themes with 5 preset accent colors plus custom.
 */

// =============================================================================
// Accent Colors
// =============================================================================

export const ACCENT_COLORS = {
  beige: {
    primary: '#d1b18f',
    primaryDark: '#BC8E5E',
    primaryLight: '#E5D4C1'
  },
  blue: {
    primary: '#5B9BD5',
    primaryDark: '#2E75B6',
    primaryLight: '#A5C9E8'
  },
  green: {
    primary: '#70AD47',
    primaryDark: '#507E34',
    primaryLight: '#A8D08D'
  },
  purple: {
    primary: '#9B7EBD',
    primaryDark: '#6C5A8A',
    primaryLight: '#C5B3D9'
  },
  red: {
    primary: '#E06666',
    primaryDark: '#CC4125',
    primaryLight: '#EAA5A5'
  }
};

// =============================================================================
// Base Themes
// =============================================================================

export const THEMES = {
  dark: {
    bg: '#000000',
    surface: '#0a0a0a',
    border: '#1a1a1a',
    textPrimary: '#ffffff',
    textSecondary: '#cccccc',
    textMuted: '#888888',
    success: '#4CAF50',
    error: '#ff4444',
    warning: '#ff9800',
    danger: '#ff6b6b'
  },
  light: {
    bg: '#ffffff',
    surface: '#f5f5f5',
    border: '#e0e0e0',
    textPrimary: '#000000',
    textSecondary: '#333333',
    textMuted: '#666666',
    success: '#4CAF50',
    error: '#d32f2f',
    warning: '#f57c00',
    danger: '#d32f2f'
  }
};

// =============================================================================
// Theme Functions
// =============================================================================

/**
 * Get a complete theme object combining base theme with accent color
 * @param {string} themeName - 'dark' or 'light'
 * @param {string} accentColor - 'beige', 'blue', 'green', 'purple', 'red', or 'custom'
 * @param {string|null} customAccent - Hex color if accentColor is 'custom'
 * @returns {object} Complete theme object
 */
export function getTheme(themeName, accentColor, customAccent = null) {
  const base = THEMES[themeName] || THEMES.dark;

  let accent;
  if (accentColor === 'custom' && customAccent) {
    // For custom colors, generate darker and lighter variants
    accent = {
      primary: customAccent,
      primaryDark: adjustBrightness(customAccent, -20),
      primaryLight: adjustBrightness(customAccent, 30)
    };
  } else {
    accent = ACCENT_COLORS[accentColor] || ACCENT_COLORS.beige;
  }

  return {
    ...base,
    ...accent
  };
}

/**
 * Apply theme to document CSS variables
 * @param {object} theme - Theme object from getTheme()
 */
export function applyTheme(theme) {
  const root = document.documentElement;

  // Background colors
  root.style.setProperty('--color-bg', theme.bg);
  root.style.setProperty('--color-surface', theme.surface);
  root.style.setProperty('--color-border', theme.border);

  // Accent colors
  root.style.setProperty('--color-primary', theme.primary);
  root.style.setProperty('--color-primary-dark', theme.primaryDark);
  root.style.setProperty('--color-primary-light', theme.primaryLight);

  // Text colors
  root.style.setProperty('--color-text-primary', theme.textPrimary);
  root.style.setProperty('--color-text-secondary', theme.textSecondary);
  root.style.setProperty('--color-text-muted', theme.textMuted);

  // Semantic colors
  root.style.setProperty('--color-success', theme.success);
  root.style.setProperty('--color-error', theme.error);
  root.style.setProperty('--color-warning', theme.warning);
  root.style.setProperty('--color-danger', theme.danger);

  // Update body background for theme
  document.body.style.backgroundColor = theme.bg;
  document.body.style.color = theme.textPrimary;
}

// =============================================================================
// Font Size Presets
// =============================================================================

export const FONT_SIZES = {
  small: {
    base: 13,
    large: 15,
    xlarge: 18
  },
  medium: {
    base: 14,
    large: 16,
    xlarge: 20
  },
  large: {
    base: 16,
    large: 18,
    xlarge: 24
  }
};

/**
 * Apply font size preset to document
 * @param {string} size - 'small', 'medium', or 'large'
 */
export function applyFontSize(size) {
  const preset = FONT_SIZES[size] || FONT_SIZES.medium;
  const root = document.documentElement;

  root.style.setProperty('--font-size-base', `${preset.base}px`);
  root.style.setProperty('--font-size-large', `${preset.large}px`);
  root.style.setProperty('--font-size-xlarge', `${preset.xlarge}px`);
}

// =============================================================================
// Chat Font Size Presets
// =============================================================================

export const CHAT_FONT_SIZES = {
  small: {
    message: 12,
    input: 13
  },
  medium: {
    message: 13,
    input: 14
  },
  large: {
    message: 15,
    input: 16
  }
};

/**
 * Apply chat-specific styling
 * @param {string} fontSize - 'small', 'medium', or 'large'
 * @param {string} textColor - 'default' or hex color
 * @param {string} backgroundColor - 'default' or hex color
 * @param {object} theme - Current theme object
 */
export function applyChatStyling(fontSize, textColor, backgroundColor, theme) {
  const chatFontPreset = CHAT_FONT_SIZES[fontSize] || CHAT_FONT_SIZES.medium;
  const root = document.documentElement;

  // Font sizes
  root.style.setProperty('--chat-font-message', `${chatFontPreset.message}px`);
  root.style.setProperty('--chat-font-input', `${chatFontPreset.input}px`);

  // Colors (use 'default' to inherit from theme)
  if (textColor === 'default') {
    root.style.setProperty('--chat-text-color', theme.textPrimary);
  } else {
    root.style.setProperty('--chat-text-color', textColor);
  }

  if (backgroundColor === 'default') {
    root.style.setProperty('--chat-background-color', theme.surface);
  } else {
    root.style.setProperty('--chat-background-color', backgroundColor);
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Adjust the brightness of a hex color
 * @param {string} hex - Hex color string
 * @param {number} percent - Percentage to adjust (-100 to 100)
 * @returns {string} Adjusted hex color
 */
function adjustBrightness(hex, percent) {
  // Remove # if present
  hex = hex.replace(/^#/, '');

  // Parse RGB values
  let r = parseInt(hex.substring(0, 2), 16);
  let g = parseInt(hex.substring(2, 4), 16);
  let b = parseInt(hex.substring(4, 6), 16);

  // Adjust brightness
  r = Math.min(255, Math.max(0, r + (r * percent / 100)));
  g = Math.min(255, Math.max(0, g + (g * percent / 100)));
  b = Math.min(255, Math.max(0, b + (b * percent / 100)));

  // Convert back to hex
  const toHex = (n) => Math.round(n).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Check if a color is light or dark
 * @param {string} hex - Hex color string
 * @returns {boolean} True if light, false if dark
 */
export function isLightColor(hex) {
  hex = hex.replace(/^#/, '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  // Calculate relative luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5;
}

export default {
  ACCENT_COLORS,
  THEMES,
  FONT_SIZES,
  CHAT_FONT_SIZES,
  getTheme,
  applyTheme,
  applyFontSize,
  applyChatStyling,
  isLightColor
};
