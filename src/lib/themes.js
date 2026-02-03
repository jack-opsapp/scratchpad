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
  // Warm tones
  beige: {
    name: 'Beige',
    primary: '#d1b18f',
    primaryDark: '#BC8E5E',
    primaryLight: '#E5D4C1'
  },
  sand: {
    name: 'Sand',
    primary: '#c2b280',
    primaryDark: '#a39260',
    primaryLight: '#d6cca0'
  },
  gold: {
    name: 'Gold',
    primary: '#c9a227',
    primaryDark: '#a68521',
    primaryLight: '#ddc36a'
  },
  amber: {
    name: 'Amber',
    primary: '#d4a574',
    primaryDark: '#b8895a',
    primaryLight: '#e6c9a8'
  },
  rust: {
    name: 'Rust',
    primary: '#c17f59',
    primaryDark: '#a36845',
    primaryLight: '#d9a889'
  },
  terracotta: {
    name: 'Terracotta',
    primary: '#c4786e',
    primaryDark: '#a65d54',
    primaryLight: '#d9a099'
  },
  coral: {
    name: 'Coral',
    primary: '#d4897a',
    primaryDark: '#b86d5e',
    primaryLight: '#e6b3a8'
  },
  dustyRose: {
    name: 'Dusty Rose',
    primary: '#c4a4a4',
    primaryDark: '#a88585',
    primaryLight: '#d9c4c4'
  },
  // Cool tones
  mauve: {
    name: 'Mauve',
    primary: '#b09ab0',
    primaryDark: '#917a91',
    primaryLight: '#c9b9c9'
  },
  lavender: {
    name: 'Lavender',
    primary: '#9a8fb8',
    primaryDark: '#7a6f98',
    primaryLight: '#b8afd0'
  },
  slate: {
    name: 'Slate',
    primary: '#708090',
    primaryDark: '#556270',
    primaryLight: '#94a3b3'
  },
  steel: {
    name: 'Steel',
    primary: '#7895a8',
    primaryDark: '#5a7488',
    primaryLight: '#9bb3c4'
  },
  sage: {
    name: 'Sage',
    primary: '#9caf88',
    primaryDark: '#7a8f6a',
    primaryLight: '#b8c9a8'
  },
  olive: {
    name: 'Olive',
    primary: '#8a9a5b',
    primaryDark: '#6b7a45',
    primaryLight: '#a8b87a'
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
 * Calculate a color based on mode (accent or grayscale) and brightness
 * @param {string} mode - 'accent' or 'grayscale'
 * @param {number} brightness - 0-100 (0=black, 100=white, 50=mid)
 * @param {string} accentColor - hex color of current accent
 * @param {string} themeName - 'dark' or 'light'
 * @returns {string} Calculated hex color
 */
export function calculateChatColor(mode, brightness, accentColor, themeName) {
  if (mode === 'grayscale') {
    // For grayscale, brightness maps directly to gray value
    const gray = Math.round((brightness / 100) * 255);
    const hex = gray.toString(16).padStart(2, '0');
    return `#${hex}${hex}${hex}`;
  } else {
    // For accent mode, adjust the accent color brightness
    // brightness 50 = original accent, 0 = black, 100 = white
    return adjustColorBrightness(accentColor, brightness);
  }
}

/**
 * Adjust color brightness on a 0-100 scale
 * 0 = black, 50 = original color, 100 = white
 */
function adjustColorBrightness(hex, brightness) {
  hex = hex.replace(/^#/, '');
  let r = parseInt(hex.substring(0, 2), 16);
  let g = parseInt(hex.substring(2, 4), 16);
  let b = parseInt(hex.substring(4, 6), 16);

  if (brightness < 50) {
    // Darken towards black
    const factor = brightness / 50;
    r = Math.round(r * factor);
    g = Math.round(g * factor);
    b = Math.round(b * factor);
  } else if (brightness > 50) {
    // Lighten towards white
    const factor = (brightness - 50) / 50;
    r = Math.round(r + (255 - r) * factor);
    g = Math.round(g + (255 - g) * factor);
    b = Math.round(b + (255 - b) * factor);
  }

  const toHex = (n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Apply chat-specific styling
 * @param {object} chatSettings - Chat styling settings
 * @param {object} theme - Current theme object
 * @param {string} accentColor - Current accent color hex
 */
export function applyChatStyling(chatSettings, theme, accentColor) {
  const {
    chatFontSize = 'medium',
    chatAgentTextMode = 'grayscale',
    chatAgentTextBrightness = 80,
    chatUserTextMode = 'grayscale',
    chatUserTextBrightness = 60,
    chatBackgroundMode = 'grayscale',
    chatBackgroundBrightness = 8
  } = chatSettings || {};

  const chatFontPreset = CHAT_FONT_SIZES[chatFontSize] || CHAT_FONT_SIZES.medium;
  const root = document.documentElement;

  // Font sizes
  root.style.setProperty('--chat-font-message', `${chatFontPreset.message}px`);
  root.style.setProperty('--chat-font-input', `${chatFontPreset.input}px`);

  // Calculate colors
  const agentTextColor = calculateChatColor(chatAgentTextMode, chatAgentTextBrightness, accentColor, theme.name);
  const userTextColor = calculateChatColor(chatUserTextMode, chatUserTextBrightness, accentColor, theme.name);
  const bgColor = calculateChatColor(chatBackgroundMode, chatBackgroundBrightness, accentColor, theme.name);

  root.style.setProperty('--chat-agent-text-color', agentTextColor);
  root.style.setProperty('--chat-user-text-color', userTextColor);
  root.style.setProperty('--chat-background-color', bgColor);

  // Keep legacy variable for compatibility
  root.style.setProperty('--chat-text-color', agentTextColor);
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
