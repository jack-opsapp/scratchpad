/**
 * ApiDocsPage Component
 *
 * Public API documentation page at /docs.
 * No authentication required — can be bookmarked and shared.
 */

import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';

const colors = {
  bg: '#000000',
  surface: '#0a0a0a',
  border: '#1a1a1a',
  primary: '#d1b18f',
  textPrimary: '#ffffff',
  textMuted: '#888888',
  green: '#4ade80',
  blue: '#60a5fa',
  codeBg: '#111111',
};

const BASE_URL = 'https://slate.opsapp.co';

// Sidebar nav structure
const navSections = [
  { id: 'authentication', label: 'Authentication' },
  {
    id: 'endpoints',
    label: 'Endpoints',
    children: [
      { id: 'post-keys',     label: 'POST /keys',     method: 'POST' },
      { id: 'get-pages',     label: 'GET /pages',     method: 'GET'  },
      { id: 'post-pages',    label: 'POST /pages',    method: 'POST' },
      { id: 'get-sections',  label: 'GET /sections',  method: 'GET'  },
      { id: 'post-sections', label: 'POST /sections', method: 'POST' },
      { id: 'get-notes',     label: 'GET /notes',     method: 'GET'  },
      { id: 'post-notes',    label: 'POST /notes',    method: 'POST' },
      { id: 'get-tags',      label: 'GET /tags',      method: 'GET'  },
    ],
  },
  { id: 'errors', label: 'Error Responses' },
];

function Sidebar({ activeId }) {
  return (
    <nav
      style={{
        position: 'sticky',
        top: 40,
        width: 200,
        flexShrink: 0,
        alignSelf: 'flex-start',
        paddingRight: 24,
      }}
    >
      <p
        style={{
          color: colors.textMuted,
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: 1.5,
          textTransform: 'uppercase',
          marginBottom: 12,
          marginTop: 0,
        }}
      >
        On this page
      </p>
      {navSections.map((section) => (
        <div key={section.id} style={{ marginBottom: 4 }}>
          <a
            href={`#${section.id}`}
            style={{
              display: 'block',
              padding: '4px 0',
              fontSize: 13,
              color: activeId === section.id ? colors.primary : colors.textMuted,
              textDecoration: 'none',
              fontWeight: activeId === section.id ? 600 : 400,
              transition: 'color 0.15s',
            }}
          >
            {section.label}
          </a>
          {section.children && (
            <div style={{ paddingLeft: 12, marginTop: 2 }}>
              {section.children.map((child) => (
                <a
                  key={child.id}
                  href={`#${child.id}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '3px 0',
                    fontSize: 12,
                    color: activeId === child.id ? colors.primary : colors.textMuted,
                    textDecoration: 'none',
                    fontWeight: activeId === child.id ? 600 : 400,
                    opacity: activeId === child.id ? 1 : 0.7,
                    transition: 'color 0.15s, opacity 0.15s',
                  }}
                >
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      fontFamily: 'monospace',
                      color: child.method === 'GET' ? colors.green : colors.blue,
                      opacity: 0.9,
                    }}
                  >
                    {child.method}
                  </span>
                  <span style={{ fontFamily: 'monospace' }}>{child.label.split(' ')[1]}</span>
                </a>
              ))}
            </div>
          )}
        </div>
      ))}
    </nav>
  );
}

function MethodBadge({ method }) {
  const isGet = method === 'GET';
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        fontSize: 11,
        fontWeight: 700,
        fontFamily: 'monospace',
        letterSpacing: 0.5,
        color: isGet ? colors.green : colors.blue,
        border: `1px solid ${isGet ? colors.green : colors.blue}`,
        borderRadius: 2,
        marginRight: 10,
      }}
    >
      {method}
    </span>
  );
}

function CodeBlock({ children }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div style={{ position: 'relative' }}>
      <pre
        style={{
          background: colors.codeBg,
          border: `1px solid ${colors.border}`,
          padding: 16,
          fontSize: 12,
          fontFamily: "'SF Mono', 'Fira Code', monospace",
          color: colors.textMuted,
          overflowX: 'auto',
          lineHeight: 1.6,
          margin: 0,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
        }}
      >
        {children}
      </pre>
      <button
        onClick={handleCopy}
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          background: colors.border,
          border: 'none',
          color: colors.textMuted,
          fontSize: 11,
          padding: '3px 8px',
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

function ParamsTable({ params }) {
  return (
    <table
      style={{
        width: '100%',
        borderCollapse: 'collapse',
        fontSize: 13,
        marginTop: 12,
      }}
    >
      <thead>
        <tr>
          {['Parameter', 'Type', 'Required', 'Description'].map((h) => (
            <th
              key={h}
              style={{
                textAlign: 'left',
                padding: '8px 12px',
                borderBottom: `1px solid ${colors.border}`,
                color: colors.textMuted,
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: 0.5,
                textTransform: 'uppercase',
              }}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {params.map((p) => (
          <tr key={p.name}>
            <td style={{ padding: '8px 12px', borderBottom: `1px solid ${colors.border}`, fontFamily: 'monospace', color: colors.textPrimary, fontSize: 12 }}>
              {p.name}
            </td>
            <td style={{ padding: '8px 12px', borderBottom: `1px solid ${colors.border}`, color: colors.textMuted, fontFamily: 'monospace', fontSize: 12 }}>
              {p.type}
            </td>
            <td style={{ padding: '8px 12px', borderBottom: `1px solid ${colors.border}`, color: p.required ? colors.primary : colors.textMuted, fontSize: 12 }}>
              {p.required ? 'Yes' : 'No'}
            </td>
            <td style={{ padding: '8px 12px', borderBottom: `1px solid ${colors.border}`, color: colors.textMuted, fontSize: 12 }}>
              {p.description}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function EndpointCard({ id, method, path, auth, description, params, curl, response }) {
  return (
    <div
      id={id}
      style={{
        background: colors.surface,
        border: `1px solid ${colors.border}`,
        marginBottom: 24,
        padding: 24,
        scrollMarginTop: 40,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
        <MethodBadge method={method} />
        <code style={{ color: colors.textPrimary, fontSize: 14, fontFamily: "'SF Mono', 'Fira Code', monospace" }}>
          {path}
        </code>
      </div>
      <p style={{ color: colors.textMuted, fontSize: 13, marginTop: 4, marginBottom: 0 }}>
        {description}
      </p>
      <p style={{ color: colors.textMuted, fontSize: 11, marginTop: 8, marginBottom: 0 }}>
        Auth:{' '}
        <code style={{ color: colors.primary, fontFamily: 'monospace', fontSize: 11 }}>
          {auth}
        </code>
      </p>

      {params && params.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h4 style={{ color: colors.textMuted, fontSize: 11, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>
            Parameters
          </h4>
          <ParamsTable params={params} />
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <h4 style={{ color: colors.textMuted, fontSize: 11, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>
          Example Request
        </h4>
        <CodeBlock>{curl}</CodeBlock>
      </div>

      <div style={{ marginTop: 16 }}>
        <h4 style={{ color: colors.textMuted, fontSize: 11, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>
          Example Response
        </h4>
        <CodeBlock>{response}</CodeBlock>
      </div>
    </div>
  );
}

const endpoints = [
  {
    id: 'post-keys',
    method: 'POST',
    path: '/api/v1/keys',
    auth: 'Authorization: Bearer <supabase_jwt>',
    description:
      'Generate a new API key. The raw key is returned once and cannot be retrieved again. Requires a Supabase JWT — you cannot use an API key to create another API key.',
    params: [
      { name: 'name', type: 'string', required: true, description: 'A label for the key (e.g. "CI pipeline")' },
    ],
    curl: `curl -X POST ${BASE_URL}/api/v1/keys \\
  -H "Authorization: Bearer YOUR_SUPABASE_JWT" \\
  -H "Content-Type: application/json" \\
  -d '{"name": "My CLI key"}'`,
    response: JSON.stringify({ id: 'uuid', name: 'My CLI key', key: 'sk_live_abc123...def456', created_at: '2025-01-15T10:30:00Z' }, null, 2),
  },
  {
    id: 'get-pages',
    method: 'GET',
    path: '/api/v1/pages',
    auth: 'X-API-Key',
    description: 'List all pages for the authenticated user, ordered by position. Excludes deleted pages by default.',
    params: [
      { name: 'deleted', type: 'string', required: false, description: '"include" to return all pages, "only" to return only deleted pages. Omit for active pages only.' },
    ],
    curl: `curl ${BASE_URL}/api/v1/pages \\
  -H "X-API-Key: sk_live_YOUR_KEY"`,
    response: JSON.stringify({ pages: [{ id: 'uuid', name: 'Work', starred: false, position: 0, created_at: '2025-01-15T10:30:00Z' }] }, null, 2),
  },
  {
    id: 'post-pages',
    method: 'POST',
    path: '/api/v1/pages',
    auth: 'X-API-Key',
    description: 'Create a new page. Position is auto-assigned after the last existing page.',
    params: [
      { name: 'name', type: 'string', required: true, description: 'Page name' },
    ],
    curl: `curl -X POST ${BASE_URL}/api/v1/pages \\
  -H "X-API-Key: sk_live_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"name": "New Project"}'`,
    response: JSON.stringify({ page: { id: 'uuid', name: 'New Project', starred: false, position: 1, created_at: '2025-01-15T10:30:00Z' } }, null, 2),
  },
  {
    id: 'get-sections',
    method: 'GET',
    path: '/api/v1/sections',
    auth: 'X-API-Key',
    description: 'List sections. Optionally filter by page_id. Omit page_id to get all sections across all pages. Excludes deleted sections by default.',
    params: [
      { name: 'page_id', type: 'uuid', required: false, description: 'Filter to sections in this page' },
      { name: 'deleted', type: 'string', required: false, description: '"include" to return all sections, "only" to return only deleted sections. Omit for active sections only.' },
    ],
    curl: `curl "${BASE_URL}/api/v1/sections?page_id=PAGE_UUID" \\
  -H "X-API-Key: sk_live_YOUR_KEY"`,
    response: JSON.stringify({ sections: [{ id: 'uuid', name: 'To Do', page_id: 'uuid', page_name: 'Work', position: 0, created_at: '2025-01-15T10:30:00Z' }] }, null, 2),
  },
  {
    id: 'post-sections',
    method: 'POST',
    path: '/api/v1/sections',
    auth: 'X-API-Key',
    description: 'Create a new section inside a page. Position is auto-assigned after the last existing section in that page.',
    params: [
      { name: 'name', type: 'string', required: true, description: 'Section name' },
      { name: 'page_id', type: 'uuid', required: true, description: 'The page to add the section to' },
    ],
    curl: `curl -X POST ${BASE_URL}/api/v1/sections \\
  -H "X-API-Key: sk_live_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"name": "Backlog", "page_id": "PAGE_UUID"}'`,
    response: JSON.stringify({ section: { id: 'uuid', name: 'Backlog', page_id: 'uuid', page_name: 'Work', position: 1, created_at: '2025-01-15T10:30:00Z' } }, null, 2),
  },
  {
    id: 'get-notes',
    method: 'GET',
    path: '/api/v1/notes',
    auth: 'X-API-Key',
    description: 'List notes with optional filters. Returns up to 200 notes (default 50), ordered newest-first. Excludes deleted notes by default.',
    params: [
      { name: 'page_id', type: 'uuid', required: false, description: 'Filter by page' },
      { name: 'section_id', type: 'uuid', required: false, description: 'Filter by section' },
      { name: 'completed', type: 'boolean', required: false, description: 'Filter by completion status ("true" or "false")' },
      { name: 'tags', type: 'string', required: false, description: 'Comma-separated tag names (matches any)' },
      { name: 'date_from', type: 'ISO 8601', required: false, description: 'Notes created on or after this date' },
      { name: 'date_to', type: 'ISO 8601', required: false, description: 'Notes created on or before this date' },
      { name: 'search', type: 'string', required: false, description: 'Case-insensitive substring search on content' },
      { name: 'limit', type: 'integer', required: false, description: 'Max results (1-200, default 50)' },
      { name: 'deleted', type: 'string', required: false, description: '"include" to return all notes, "only" to return only deleted notes. Omit for active notes only.' },
    ],
    curl: `curl "${BASE_URL}/api/v1/notes?section_id=SEC_UUID&completed=false&limit=10" \\
  -H "X-API-Key: sk_live_YOUR_KEY"`,
    response: JSON.stringify({
      notes: [{ id: 'uuid', content: 'Ship v2 update', tags: ['urgent'], date: '2025-01-20', completed: false, created_at: '2025-01-15T10:30:00Z', section_id: 'uuid', section_name: 'To Do', page_id: 'uuid', page_name: 'Work' }],
      total: 1,
    }, null, 2),
  },
  {
    id: 'post-notes',
    method: 'POST',
    path: '/api/v1/notes',
    auth: 'X-API-Key',
    description: 'Create a new note in a section.',
    params: [
      { name: 'content', type: 'string', required: true, description: 'Note text' },
      { name: 'section_id', type: 'uuid', required: true, description: 'The section to add the note to' },
      { name: 'tags', type: 'string[]', required: false, description: 'Array of tag names' },
      { name: 'date', type: 'string', required: false, description: 'Date string (e.g. "2025-01-20")' },
    ],
    curl: `curl -X POST ${BASE_URL}/api/v1/notes \\
  -H "X-API-Key: sk_live_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"content": "Review PR #42", "section_id": "SEC_UUID", "tags": ["review"]}'`,
    response: JSON.stringify({ note: { id: 'uuid', content: 'Review PR #42', tags: ['review'], date: null, completed: false, created_at: '2025-01-15T10:30:00Z', section_id: 'uuid' } }, null, 2),
  },
  {
    id: 'get-tags',
    method: 'GET',
    path: '/api/v1/tags',
    auth: 'X-API-Key',
    description: "Get a sorted, deduplicated array of all tag names across the authenticated user's notes.",
    params: [],
    curl: `curl ${BASE_URL}/api/v1/tags \\
  -H "X-API-Key: sk_live_YOUR_KEY"`,
    response: JSON.stringify({ tags: ['bugfix', 'review', 'urgent'] }, null, 2),
  },
];

const errorRows = [
  { code: 400, description: 'Bad request — missing or invalid parameters' },
  { code: 401, description: 'Unauthorized — missing or invalid API key / JWT' },
  { code: 403, description: 'Forbidden — resource belongs to another user' },
  { code: 405, description: 'Method not allowed' },
  { code: 500, description: 'Internal server error' },
];

// All scrollable section IDs in order
const allSectionIds = [
  'authentication',
  ...endpoints.map((e) => e.id),
  'errors',
];

export default function ApiDocsPage() {
  const [activeId, setActiveId] = useState('authentication');

  useEffect(() => {
    const observers = [];

    allSectionIds.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;

      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setActiveId(id);
          }
        },
        { rootMargin: '-20% 0px -70% 0px', threshold: 0 }
      );

      observer.observe(el);
      observers.push(observer);
    });

    return () => observers.forEach((o) => o.disconnect());
  }, []);

  return (
    <div style={{ height: '100vh', overflowY: 'auto', background: colors.bg }}>
      {/* Page header */}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '60px 32px 40px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <h1 style={{ color: colors.textPrimary, fontSize: 28, fontWeight: 600, letterSpacing: -0.5, margin: 0 }}>
            Slate API
          </h1>
          <span style={{ padding: '2px 8px', border: `1px solid ${colors.border}`, color: colors.textMuted, fontSize: 11, fontWeight: 600, fontFamily: 'monospace' }}>
            v1
          </span>
        </div>
        <p style={{ color: colors.textMuted, fontSize: 14, lineHeight: 1.6, maxWidth: 600, margin: 0 }}>
          Programmatic access to your pages, sections, notes, and tags. All data
          endpoints use API key authentication. Keys are generated from{' '}
          <strong style={{ color: colors.textPrimary }}>Settings &gt; Developer</strong> or via the{' '}
          <code style={{ color: colors.primary, fontFamily: 'monospace', fontSize: 13 }}>
            POST /api/v1/keys
          </code>{' '}
          endpoint.
        </p>
      </div>

      {/* Two-column layout */}
      <div
        style={{
          maxWidth: 1100,
          margin: '0 auto',
          padding: '0 32px 80px',
          display: 'flex',
          gap: 48,
          alignItems: 'flex-start',
        }}
      >
        {/* Sidebar */}
        <Sidebar activeId={activeId} />

        {/* Main content */}
        <div style={{ flex: 1, minWidth: 0 }}>

          {/* Authentication */}
          <div id="authentication" style={{ marginBottom: 48, scrollMarginTop: 40 }}>
            <h2 style={{ color: colors.textMuted, fontSize: 11, fontWeight: 600, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 16, marginTop: 0 }}>
              Authentication
            </h2>
            <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, padding: 24 }}>
              <div style={{ marginBottom: 20 }}>
                <h3 style={{ color: colors.textPrimary, fontSize: 14, fontWeight: 600, marginBottom: 6, marginTop: 0 }}>
                  API Key (data endpoints)
                </h3>
                <p style={{ color: colors.textMuted, fontSize: 13, lineHeight: 1.5, margin: 0 }}>
                  Pass your key in the{' '}
                  <code style={{ color: colors.primary, fontFamily: 'monospace', fontSize: 12 }}>X-API-Key</code>{' '}
                  header. Keys start with{' '}
                  <code style={{ color: colors.primary, fontFamily: 'monospace', fontSize: 12 }}>sk_live_</code>{' '}
                  and are hashed server-side — store them securely.
                </p>
              </div>
              <div>
                <h3 style={{ color: colors.textPrimary, fontSize: 14, fontWeight: 600, marginBottom: 6, marginTop: 0 }}>
                  Bearer JWT (key creation only)
                </h3>
                <p style={{ color: colors.textMuted, fontSize: 13, lineHeight: 1.5, margin: 0 }}>
                  The{' '}
                  <code style={{ color: colors.primary, fontFamily: 'monospace', fontSize: 12 }}>POST /api/v1/keys</code>{' '}
                  endpoint requires a Supabase session JWT in the{' '}
                  <code style={{ color: colors.primary, fontFamily: 'monospace', fontSize: 12 }}>Authorization: Bearer</code>{' '}
                  header. You can also generate keys from{' '}
                  <strong style={{ color: colors.textPrimary }}>Settings &gt; Developer</strong> in the app.
                </p>
              </div>
            </div>
          </div>

          {/* Endpoints */}
          <div id="endpoints" style={{ marginBottom: 8, scrollMarginTop: 40 }}>
            <h2 style={{ color: colors.textMuted, fontSize: 11, fontWeight: 600, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 16, marginTop: 0 }}>
              Endpoints
            </h2>
          </div>
          <div style={{ marginBottom: 48 }}>
            {endpoints.map((ep) => (
              <EndpointCard key={ep.id} {...ep} />
            ))}
          </div>

          {/* Error Responses */}
          <div id="errors" style={{ marginBottom: 48, scrollMarginTop: 40 }}>
            <h2 style={{ color: colors.textMuted, fontSize: 11, fontWeight: 600, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 16, marginTop: 0 }}>
              Error Responses
            </h2>
            <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, padding: 24 }}>
              <p style={{ color: colors.textMuted, fontSize: 13, lineHeight: 1.5, marginTop: 0, marginBottom: 16 }}>
                All errors return a JSON body with an{' '}
                <code style={{ color: colors.primary, fontFamily: 'monospace', fontSize: 12 }}>error</code> field:
              </p>
              <CodeBlock>{`{ "error": "Missing X-API-Key header" }`}</CodeBlock>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 16 }}>
                <thead>
                  <tr>
                    {['Status', 'Description'].map((h) => (
                      <th key={h} style={{ textAlign: 'left', padding: '8px 12px', borderBottom: `1px solid ${colors.border}`, color: colors.textMuted, fontSize: 11, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {errorRows.map((row) => (
                    <tr key={row.code}>
                      <td style={{ padding: '8px 12px', borderBottom: `1px solid ${colors.border}`, fontFamily: 'monospace', color: colors.textPrimary, fontSize: 12 }}>
                        {row.code}
                      </td>
                      <td style={{ padding: '8px 12px', borderBottom: `1px solid ${colors.border}`, color: colors.textMuted, fontSize: 12 }}>
                        {row.description}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Footer */}
          <div style={{ borderTop: `1px solid ${colors.border}`, padding: '20px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <p style={{ color: colors.textMuted, fontSize: 12, margin: 0 }}>
              Powered by <strong style={{ color: colors.primary }}>SLATE</strong>
            </p>
            <Link to="/" style={{ color: colors.primary, fontSize: 12, textDecoration: 'none' }}>
              Back to app
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
