# Slate Web App Design System

**Primary Reference:** The live Slate web app — a dark, minimal productivity tool for operators.
**Feel:** Tactical, disciplined, monochromatic. Pure black canvas with a warm beige accent used sparingly. Reads like a military-grade tool, not a SaaS template.

---

## Colors

| Token | Value | Usage |
|-------|-------|-------|
| `bg` | `#000000` | Page background (pure black) |
| `surface` | `#0d0d0d` | Sidebar, elevated panels |
| `surfaceRaised` | `#1a1a1a` | Cards, popovers, hover states |
| `border` | `rgba(255, 255, 255, 0.1)` | Ultra-thin 1px dividers, card edges, input borders |
| `primary` | `#948b72` (default beige) | Accent — user-configurable via CSS variable `--color-primary` |
| `primaryDark` | `#766f5b` | Darker accent variant |
| `primaryLight` | `#b5ae9a` | Lighter accent variant |
| `textPrimary` | `#e8e8e8` | Body text, headings |
| `textSecondary` | `#a0a0a0` | Captions, metadata |
| `textMuted` | `#525252` | Disabled states, placeholders, tertiary text |
| `success` | `#2d6b3a` | Completion indicators |
| `danger` | `#b83c2a` | Delete buttons, destructive actions |
| `warning` | `#7a5c1a` | Warnings |
| `overlay` | `rgba(0, 0, 0, 0.72)` | Modal backdrops |

**Rule:** The app is monochromatic — black, near-black, and gray. The beige accent (`#948b72`) is a precision tool, not a paint bucket. Use it for: active/selected states, focus outlines, primary action highlights, starred items, and wikilink chips. Never use it as a background fill or broad decorative element.

**User-configurable accent:** The primary color is set via `--color-primary` CSS variable. Always reference `colors.primary` from `theme.js`, never hardcode the hex.

---

## Typography

| Role | Font | Weight | Style |
|------|------|--------|-------|
| All UI text | Manrope | 400 (Regular) | Normal |
| Medium emphasis | Manrope | 500 (Medium) | Normal |
| Strong emphasis | Manrope | 600 (SemiBold) | Normal |
| Code / monospace | JetBrains Mono | 400 | Normal |
| Fallback stack | Inter, Helvetica Now, Helvetica Neue, Arial | — | sans-serif |

**Font sizes (from `theme.js`):**

| Token | Value | Usage |
|-------|-------|-------|
| `xs` | 11px | Timestamps, metadata, keyboard shortcuts |
| `sm` | 13px | Secondary text, captions, sidebar items |
| `base` | 14px | Body text, note content, inputs |
| `md` | 16px | Section headers |
| `lg` | 18px | Page titles |
| `xl` | 24px | Modal headers |
| `2xl` | 32px | Large display text (rare) |

**Principles:**
- **Manrope** is the primary typeface — used for all body text, headings, inputs, buttons, and UI chrome
- **Inter** is the fallback — only loads if Manrope is unavailable
- Left-justified text preferred
- Uppercase + wider letter-spacing for section labels (e.g., PAGES, TAGS, COMPLETED)
- Generous line-height (1.4–1.5) for readability
- Avoid excessive bold — use medium weight (500) for emphasis, semibold (600) sparingly

---

## Layout Rules

- **No border-radius on cards, buttons, inputs** — 2px maximum everywhere, reads as sharp
- Exception: avatars and circular indicators use `border-radius: 50%`
- Exception: popovers use 4px max
- Sidebar width: 240px expanded, 56px collapsed
- Input max-width: 560px
- Card min-width: 280px
- Consistent 16px padding on content areas
- 8px gap as standard spacing unit

---

## Borders & Dividers

- Ultra-thin `1px` at `rgba(255, 255, 255, 0.1)` — the single border token
- Card borders barely visible by default
- Section dividers are `1px solid` bottom borders on note cards
- Inputs have no visible border by default, only on focus

---

## Depth Strategy

- **No shadows.** The `shadows` tokens in `theme.js` are all set to `'none'`.
- Surface elevation via subtle lightness shifts: `#000000` → `#0d0d0d` → `#1a1a1a`
- Each step is barely perceptible in isolation, but stacking creates clear hierarchy

### Frosted Glass (Superimposed Surfaces)

Floating elements (chat panel, settings modal, popovers, context menus) use frosted glass:
- `background: rgba(13, 13, 13, 0.85)` (dark tint, not opaque)
- `backdropFilter: 'blur(24px) saturate(150%)'`
- `-webkit-backdrop-filter: blur(24px) saturate(150%)` (Safari)
- Ultra-thin border: `1px solid rgba(255, 255, 255, 0.1)`
- Border radius: 2–4px

**Use for:** Chat panel, settings modal, context menus, popovers, autocomplete dropdowns. Never use a solid opaque background for superimposed elements.

---

## Motion & Animation

- **Transitions:** `0.15s ease` (fast), `0.2s ease` (normal), `0.25s ease` (slow)
- **Typewriter effect:** Character-by-character reveal for new notes (title: 40ms, body: 25ms, subtitle: 30ms)
- **Hover states:** Opacity transitions (0.7 → 1.0), border-color brightening
- **View transitions:** Instant swaps, no page-level animations
- **Philosophy:** Quick and functional. No bouncy easing, no playful motion. Transitions serve clarity, not delight.
- **Selection highlight:** Shimmer ripple animation on text (Apple-style gradient sweep using `--color-primary`)
- **Accessibility:** Respect `prefers-reduced-motion`

---

## Components

### Buttons
- **Primary:** Transparent background, `1px solid rgba(255,255,255,0.1)` border, white/primary text
- **Destructive:** Transparent, `#b83c2a` text, opacity 0.7 → 1.0 on hover
- **Ghost:** No border, muted text, hover shows subtle background
- No border-radius (2px max)
- No filled/colored backgrounds for standard actions

### Inputs
- Transparent background
- No visible border (content appears inline with surrounding text)
- `color: textPrimary`, `fontSize: 14px`, `fontFamily: Manrope`
- No focus ring — uses `outline: 1px solid var(--color-primary)` only for keyboard focus-visible
- Textarea auto-resizes to content

### Cards (Note Cards)
- No background color (transparent, inherits page black)
- Bottom border `1px solid` as separator between notes
- 16px vertical padding
- No border-radius
- Checkbox: 16x16px square, `1px solid` border, no radius

### Tags
- Small pills: `padding: 2px 8px`
- `1px solid` border with muted text
- Uppercase text, 10–11px font
- Click to filter

### Popovers & Dropdowns
- Frosted glass background (see Depth Strategy)
- `boxShadow: '0 8px 24px rgba(0,0,0,0.5)'`
- `borderRadius: 4px`
- `zIndex: 1200` for autocomplete, `9999` for modals, `10000` for tooltips

### Sidebar
- `background: #0d0d0d` (surface)
- Page list items: 13px Manrope, left-aligned
- Active page: `primary` color text
- Section labels: 11px, uppercase, `textMuted` color
- Collapse to 56px width on toggle

### Checkboxes
- Square (no border-radius)
- 16x16px
- Unchecked: transparent with `1px solid border`
- Checked: filled with `textMuted` color, white check icon

---

## Icons

- **Library:** Lucide React
- Line-based, not filled
- Default size: 14–16px
- Color: `textMuted` by default, `textPrimary` or `primary` on interaction
- Opacity: 0.7 resting → 1.0 on hover

---

## Empty States

Brief and functional:
- "No notes yet."
- "No results."
- "No matching notes"

---

## Voice & Copy

### Agent Responses
Short, tactical confirmations:
- "Logged." / "Noted." / "On the board." / "Tracked." / "Roger." / "Confirmed." / "Filed."

### UI Labels
- Uppercase for section headers with letter-spacing
- Concise, action-oriented
- Examples: PAGES, TAGS, COMPLETED, FILTER

---

## Scrollbars

- Width: 6px
- Track: transparent
- Thumb: `#1a1a1a`, `border-radius: 3px`
- Thumb hover: `#333333`

---

## Selection

- `background: rgba(148, 139, 114, 0.3)` (primary at 30% opacity)
- `color: #e8e8e8`

---

## Avoid

- Rounded corners (ever, except avatars)
- Shadows (all shadow tokens are `'none'`)
- Colored backgrounds on buttons or cards
- Radial gradients
- Decorative elements or illustrations
- Emojis in UI
- Playful or casual language
- Hardcoded accent hex — always use CSS variable / theme token
- More than one accent color
- Center-aligned text in content areas
- Heavy font weights (bold/800+)
