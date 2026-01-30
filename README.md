# Scratchpad

**Your ideas, organized.**

Natural language note-taking with AI-powered organization. Built for operators.

## Tech Stack

- React 18 + Vite
- Supabase (Auth + Database)
- OpenAI GPT-4 (AI parsing)
- Tailwind CSS
- Deployed on Vercel

## Environment Variables

Create `.env.local` in the project root:

```bash
# Client-side (safe to expose)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# Server-side only (secure)
OPENAI_API_KEY=sk-your-openai-key
SENDGRID_API_KEY=SG.your-sendgrid-key  # Optional: for email invites
```

## Local Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Supabase Setup

1. Create a new project at [supabase.com](https://supabase.com)
2. Run the database migrations in SQL Editor:
   - `supabase/migrations/001_initial_schema.sql`
   - `supabase/migrations/002_fix_rls_policies.sql`
   - `supabase/migrations/003_collaboration.sql`
3. Copy your project URL and anon key from **Settings → API**

## Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create OAuth 2.0 credentials
3. Add authorized redirect URIs:
   - Local: `http://localhost:3000`
   - Production: `https://scratchpad.opsapp.co`
4. In Supabase: **Authentication → Providers → Google**
   - Enable Google provider
   - Add Client ID and Client Secret
   - Callback URL: `https://your-project.supabase.co/auth/v1/callback`

## Deployment (Vercel)

1. Connect repo to Vercel
2. Set environment variables in Vercel dashboard:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `OPENAI_API_KEY` (no VITE_ prefix - server-side only)
   - `SENDGRID_API_KEY` (optional - for email invites)
3. Deploy

Production URL: `https://scratchpad.opsapp.co`

## Project Structure

```
src/
├── components/     # UI components (NoteCard, ShareModal, UserAvatar, etc.)
├── config/         # Supabase client configuration
├── hooks/          # React hooks (useAuth, useTypewriter)
├── lib/            # Storage, AI agent, parser, permissions
├── pages/          # Public page views
├── screens/        # MainApp, SignedOutScreen
├── styles/         # Theme tokens
├── App.jsx         # Root component with routing
└── index.jsx       # Entry point
api/
├── parse.js        # OpenAI parsing endpoint
└── send-invite.js  # SendGrid email endpoint
supabase/
└── migrations/     # Database schema migrations
```

## Key Features

- Natural language note input with AI parsing
- Hierarchical organization (Pages → Sections → Notes)
- Multiple views: List, Boxes (Kanban), Calendar
- Google OAuth authentication
- Real-time sync with Supabase
- Tag management with filtering
- Keyboard shortcuts

## Collaboration Features

- **Share pages** with other users via email invite
- **5-tier permission system**:
  - **Owner**: Full control, can delete page
  - **Team-Admin**: Can manage collaborators, edit everything
  - **Team**: Can add/edit own notes, create sections
  - **Team-Limited**: Can only mark notes as complete
  - **Public**: Read-only access via public link
- **Public links** with optional password protection
- **Email invitations** via SendGrid (optional)
- **Completion tracking** shows who completed each note

## Brand Guidelines

See [BRAND.md](./BRAND.md) for visual identity and voice.
