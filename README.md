# Scratchpad

**Your ideas, organized.**

Natural language note-taking with AI-powered organization. Built for operators.

## Quick Start

```bash
npm install
npm run dev
```

## Project Structure

```
src/
├── components/     # Reusable UI components
├── screens/        # Full-page screen components
├── hooks/          # Custom React hooks
├── lib/            # Core utilities (storage, AI agent, parser)
├── styles/         # Theme and design tokens
├── App.jsx         # Root component
└── index.jsx       # Entry point
```

## Key Features

- Natural language note input with AI parsing
- Hierarchical organization (Pages → Sections → Notes)
- Multiple views: List, Boxes (Kanban), Calendar
- Tag management with filtering
- Keyboard shortcuts
- Drag-and-drop for notes and sections

## Brand Guidelines

See [BRAND.md](./BRAND.md) for visual identity, voice, and component patterns.

## Tech Stack

- React 18
- Vite
- Tailwind CSS
- Lucide Icons
- Claude API (for AI parsing)
