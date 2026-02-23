# SLATE Brand Guidelines

## Brand Identity

**Tagline:** Your ideas, organized.

**Voice:** 70% Jocko Willink discipline, 30% defense contractor precision. Tactical, no-nonsense, mission-focused.

**Target User:** Operators and defense contractors who need a productivity tool that solves limited context windows through backend storage and visual organization for easy reference.

---

## Color Palette

| Token | Value | Usage |
|-------|-------|-------|
| Background | `#000000` | Primary canvas |
| Surface | `#0d0d0d` | Elevated elements, sidebar |
| Surface Raised | `#1a1a1a` | Cards, popovers, hover states |
| Border | `rgba(255,255,255,0.1)` | Subtle dividers and outlines |
| Primary | `#948b72` | Beige accent - use sparingly (user-configurable via CSS var) |
| Primary Dark | `#766f5b` | Darker beige variant |
| Primary Light | `#b5ae9a` | Lighter beige variant |
| Text | `#e8e8e8` | Primary content |
| Text Secondary | `#a0a0a0` | Captions, metadata |
| Text Muted | `#525252` | Disabled, placeholders |
| Danger | `#b83c2a` | Destructive actions |

### Color Usage

- **Gold accent:** Reserved for emphasis - starred items, active states, key highlights
- **Restrained palette:** Let the dark background dominate; avoid color overuse
- **Text hierarchy:** White for primary, muted gray for secondary
- **Borders:** Subtle, not prominent

---

## Typography

### Fonts
- **Primary:** Manrope (all UI text, headings, inputs, buttons)
- **Fallback:** Inter, Helvetica Now, Helvetica Neue, Arial, sans-serif
- **Monospace:** JetBrains Mono (code, keyboard shortcuts)

### Principles

- **Left-justified** text preferred
- **Tighter letter spacing** on headings
- **Uppercase** for labels and section headers with wider tracking
- **Generous line-height** for readability
- Avoid excessive bold - use medium weights

---

## Spacing & Layout

- **Generous negative space** - let content breathe
- **Consistent padding** patterns throughout
- **Sharp corners** - no border-radius on cards, buttons, inputs
- **Grid-based** box layouts that adapt to screen width

---

## Visual Effects

### Frosted Glass / Ultra-Thin Material
Use for floating elements, popovers, and focus menus:
- Semi-transparent background
- Backdrop blur
- Creates depth without heavy shadows

### Gradients
Acceptable when minimal and purposeful:
- Subtle dark gradients for depth
- Keep opacity low
- Never colorful or attention-grabbing

### Motion
- Quick, functional transitions
- Typewriter effect for key text reveals
- Subtle opacity/transform animations
- No bouncy or playful easing

---

## UI Principles

### Components
- **Buttons:** Transparent with subtle border, white text
- **Inputs:** Transparent, minimal border, no visible focus ring
- **Cards:** Dark background, thin border, no rounded corners
- **Tags:** Small, uppercase, bordered pills
- **Checkboxes:** Square, not rounded

### Icons
- Lucide icon set
- Line-based, not filled
- Small scale
- Muted by default, brighter on interaction

### Empty States
Brief and functional:
- "No notes yet."
- "No notes"

---

## Voice & Copy

### Agent Responses
Short, tactical confirmations:
- "Logged."
- "Noted."
- "On the board."
- "Tracked."
- "Roger."
- "Confirmed."
- "Filed."

### UI Labels
- Uppercase for section headers
- Concise, action-oriented
- Examples: PAGES, TAGS, RECENT, FILTER, SORT

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `/` | Focus input |
| `Cmd/Ctrl + K` | Open search |
| `P` | New page |
| `S` | New section (in current page) |
| `?` | Show shortcuts modal |
| `Esc` | Close modal / blur input |

---

## Do's and Don'ts

### Do
- Sharp corners throughout
- High contrast (white on black)
- Minimal, functional UI
- Gold accent used sparingly
- Left-align text
- Frosted glass for floating elements
- Subtle gradients when needed for depth

### Don't
- Rounded corners
- Colorful or prominent gradients
- Heavy shadows
- Decorative elements
- Emojis in UI
- Playful or casual language
- Overuse of accent color

---

*Built for operators. No fluff.*
