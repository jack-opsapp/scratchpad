/**
 * ApiDocsPage Component
 *
 * Public API documentation page at /docs.
 * No authentication required — can be bookmarked and shared.
 */

import React, { useState } from 'react';
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
            <td
              style={{
                padding: '8px 12px',
                borderBottom: `1px solid ${colors.border}`,
                fontFamily: 'monospace',
                color: colors.textPrimary,
                fontSize: 12,
              }}
            >
              {p.name}
            </td>
            <td
              style={{
                padding: '8px 12px',
                borderBottom: `1px solid ${colors.border}`,
                color: colors.textMuted,
                fontFamily: 'monospace',
                fontSize: 12,
              }}
            >
              {p.type}
            </td>
            <td
              style={{
                padding: '8px 12px',
                borderBottom: `1px solid ${colors.border}`,
                color: p.required ? colors.primary : colors.textMuted,
                fontSize: 12,
              }}
            >
              {p.required ? 'Yes' : 'No'}
            </td>
            <td
              style={{
                padding: '8px 12px',
                borderBottom: `1px solid ${colors.border}`,
                color: colors.textMuted,
                fontSize: 12,
              }}
            >
              {p.description}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function EndpointCard({ method, path, auth, description, params, curl, response }) {
  return (
    <div
      style={{
        background: colors.surface,
        border: `1px solid ${colors.border}`,
        marginBottom: 24,
        padding: 24,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
        <MethodBadge method={method} />
        <code
          style={{
            color: colors.textPrimary,
            fontSize: 14,
            fontFamily: "'SF Mono', 'Fira Code', monospace",
          }}
        >
          {path}
        </code>
      </div>
      <p style={{ color: colors.textMuted, fontSize: 13, marginTop: 4, marginBottom: 0 }}>
        {description}
      </p>
      <p style={{ color: colors.textMuted, fontSize: 11, marginTop: 8, marginBottom: 0 }}>
        Auth:{' '}
        <code
          style={{
            color: colors.primary,
            fontFamily: 'monospace',
            fontSize: 11,
          }}
        >
          {auth}
        </code>
      </p>

      {params && params.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h4
            style={{
              color: colors.textMuted,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: 1,
              textTransform: 'uppercase',
              marginBottom: 4,
            }}
          >
            Parameters
          </h4>
          <ParamsTable params={params} />
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <h4
          style={{
            color: colors.textMuted,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: 1,
            textTransform: 'uppercase',
            marginBottom: 8,
          }}
        >
          Example Request
        </h4>
        <CodeBlock>{curl}</CodeBlock>
      </div>

      <div style={{ marginTop: 16 }}>
        <h4
          style={{
            color: colors.textMuted,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: 1,
            textTransform: 'uppercase',
            marginBottom: 8,
          }}
        >
          Example Response
        </h4>
        <CodeBlock>{response}</CodeBlock>
      </div>
    </div>
  );
}

const endpoints = [
  {
    method: 'POST',
    path: '/api/v1/keys',
    auth: 'Authorization: Bearer <supabase_jwt>',
    description:
      'Generate a new API key. The raw key is returned once and cannot be retrieved again. Requires a Supabase JWT — you cannot use an API key to create another API key.',
    params: [
      {
        name: 'name',
        type: 'string',
        required: true,
        description: 'A label for the key (e.g. "CI pipeline")',
      },
    ],
    curl: `curl -X POST ${BASE_URL}/api/v1/keys \\
  -H "Authorization: Bearer YOUR_SUPABASE_JWT" \\
  -H "Content-Type: application/json" \\
  -d '{"name": "My CLI key"}'`,
    response: JSON.stringify(
      {
        id: 'uuid',
        name: 'My CLI key',
        key: 'sk_live_abc123...def456',
        created_at: '2025-01-15T10:30:00Z',
      },
      null,
      2
    ),
  },
  {
    method: 'GET',
    path: '/api/v1/pages',
    auth: 'X-API-Key',
    description: 'List all pages for the authenticated user, ordered by position.',
    params: [],
    curl: `curl ${BASE_URL}/api/v1/pages \\
  -H "X-API-Key: sk_live_YOUR_KEY"`,
    response: JSON.stringify(
      {
        pages: [
          {
            id: 'uuid',
            name: 'Work',
            starred: false,
            position: 0,
            created_at: '2025-01-15T10:30:00Z',
          },
        ],
      },
      null,
      2
    ),
  },
  {
    method: 'POST',
    path: '/api/v1/pages',
    auth: 'X-API-Key',
    description: 'Create a new page. Position is auto-assigned after the last existing page.',
    params: [
      {
        name: 'name',
        type: 'string',
        required: true,
        description: 'Page name',
      },
    ],
    curl: `curl -X POST ${BASE_URL}/api/v1/pages \\
  -H "X-API-Key: sk_live_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"name": "New Project"}'`,
    response: JSON.stringify(
      {
        page: {
          id: 'uuid',
          name: 'New Project',
          starred: false,
          position: 1,
          created_at: '2025-01-15T10:30:00Z',
        },
      },
      null,
      2
    ),
  },
  {
    method: 'GET',
    path: '/api/v1/sections',
    auth: 'X-API-Key',
    description:
      'List sections. Optionally filter by page_id. Omit page_id to get all sections across all pages.',
    params: [
      {
        name: 'page_id',
        type: 'uuid',
        required: false,
        description: 'Filter to sections in this page',
      },
    ],
    curl: `curl "${BASE_URL}/api/v1/sections?page_id=PAGE_UUID" \\
  -H "X-API-Key: sk_live_YOUR_KEY"`,
    response: JSON.stringify(
      {
        sections: [
          {
            id: 'uuid',
            name: 'To Do',
            page_id: 'uuid',
            page_name: 'Work',
            position: 0,
            created_at: '2025-01-15T10:30:00Z',
          },
        ],
      },
      null,
      2
    ),
  },
  {
    method: 'POST',
    path: '/api/v1/sections',
    auth: 'X-API-Key',
    description:
      'Create a new section inside a page. Position is auto-assigned after the last existing section in that page.',
    params: [
      {
        name: 'name',
        type: 'string',
        required: true,
        description: 'Section name',
      },
      {
        name: 'page_id',
        type: 'uuid',
        required: true,
        description: 'The page to add the section to',
      },
    ],
    curl: `curl -X POST ${BASE_URL}/api/v1/sections \\
  -H "X-API-Key: sk_live_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"name": "Backlog", "page_id": "PAGE_UUID"}'`,
    response: JSON.stringify(
      {
        section: {
          id: 'uuid',
          name: 'Backlog',
          page_id: 'uuid',
          page_name: 'Work',
          position: 1,
          created_at: '2025-01-15T10:30:00Z',
        },
      },
      null,
      2
    ),
  },
  {
    method: 'GET',
    path: '/api/v1/notes',
    auth: 'X-API-Key',
    description:
      'List notes with optional filters. Returns up to 200 notes (default 50), ordered newest-first.',
    params: [
      { name: 'page_id', type: 'uuid', required: false, description: 'Filter by page' },
      { name: 'section_id', type: 'uuid', required: false, description: 'Filter by section' },
      {
        name: 'completed',
        type: 'boolean',
        required: false,
        description: 'Filter by completion status ("true" or "false")',
      },
      {
        name: 'tags',
        type: 'string',
        required: false,
        description: 'Comma-separated tag names (matches any)',
      },
      {
        name: 'date_from',
        type: 'ISO 8601',
        required: false,
        description: 'Notes created on or after this date',
      },
      {
        name: 'date_to',
        type: 'ISO 8601',
        required: false,
        description: 'Notes created on or before this date',
      },
      {
        name: 'search',
        type: 'string',
        required: false,
        description: 'Case-insensitive substring search on content',
      },
      {
        name: 'limit',
        type: 'integer',
        required: false,
        description: 'Max results (1-200, default 50)',
      },
    ],
    curl: `curl "${BASE_URL}/api/v1/notes?section_id=SEC_UUID&completed=false&limit=10" \\
  -H "X-API-Key: sk_live_YOUR_KEY"`,
    response: JSON.stringify(
      {
        notes: [
          {
            id: 'uuid',
            content: 'Ship v2 update',
            tags: ['urgent'],
            date: '2025-01-20',
            completed: false,
            created_at: '2025-01-15T10:30:00Z',
            section_id: 'uuid',
            section_name: 'To Do',
            page_id: 'uuid',
            page_name: 'Work',
          },
        ],
        total: 1,
      },
      null,
      2
    ),
  },
  {
    method: 'POST',
    path: '/api/v1/notes',
    auth: 'X-API-Key',
    description: 'Create a new note in a section.',
    params: [
      {
        name: 'content',
        type: 'string',
        required: true,
        description: 'Note text',
      },
      {
        name: 'section_id',
        type: 'uuid',
        required: true,
        description: 'The section to add the note to',
      },
      {
        name: 'tags',
        type: 'string[]',
        required: false,
        description: 'Array of tag names',
      },
      {
        name: 'date',
        type: 'string',
        required: false,
        description: 'Date string (e.g. "2025-01-20")',
      },
    ],
    curl: `curl -X POST ${BASE_URL}/api/v1/notes \\
  -H "X-API-Key: sk_live_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"content": "Review PR #42", "section_id": "SEC_UUID", "tags": ["review"]}'`,
    response: JSON.stringify(
      {
        note: {
          id: 'uuid',
          content: 'Review PR #42',
          tags: ['review'],
          date: null,
          completed: false,
          created_at: '2025-01-15T10:30:00Z',
          section_id: 'uuid',
        },
      },
      null,
      2
    ),
  },
  {
    method: 'GET',
    path: '/api/v1/tags',
    auth: 'X-API-Key',
    description:
      'Get a sorted, deduplicated array of all tag names across the authenticated user\'s notes.',
    params: [],
    curl: `curl ${BASE_URL}/api/v1/tags \\
  -H "X-API-Key: sk_live_YOUR_KEY"`,
    response: JSON.stringify(
      {
        tags: ['bugfix', 'review', 'urgent'],
      },
      null,
      2
    ),
  },
];

const errorRows = [
  { code: 400, description: 'Bad request — missing or invalid parameters' },
  { code: 401, description: 'Unauthorized — missing or invalid API key / JWT' },
  { code: 403, description: 'Forbidden — resource belongs to another user' },
  { code: 405, description: 'Method not allowed' },
  { code: 500, description: 'Internal server error' },
];

export default function ApiDocsPage() {
  return (
    <div style={{ minHeight: '100vh', background: colors.bg }}>
      {/* Header */}
      <div
        style={{
          maxWidth: 800,
          margin: '0 auto',
          padding: '60px 20px 40px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <h1
            style={{
              color: colors.textPrimary,
              fontSize: 28,
              fontWeight: 600,
              letterSpacing: -0.5,
              margin: 0,
            }}
          >
            Slate API
          </h1>
          <span
            style={{
              padding: '2px 8px',
              border: `1px solid ${colors.border}`,
              color: colors.textMuted,
              fontSize: 11,
              fontWeight: 600,
              fontFamily: 'monospace',
            }}
          >
            v1
          </span>
        </div>
        <p
          style={{
            color: colors.textMuted,
            fontSize: 14,
            lineHeight: 1.6,
            maxWidth: 600,
            margin: 0,
          }}
        >
          Programmatic access to your pages, sections, notes, and tags. All data
          endpoints use API key authentication. Keys are generated from{' '}
          <strong style={{ color: colors.textPrimary }}>Settings &gt; Developer</strong> or via the{' '}
          <code style={{ color: colors.primary, fontFamily: 'monospace', fontSize: 13 }}>
            POST /api/v1/keys
          </code>{' '}
          endpoint.
        </p>
      </div>

      <div style={{ maxWidth: 800, margin: '0 auto', padding: '0 20px 60px' }}>
        {/* Authentication Section */}
        <div style={{ marginBottom: 48 }}>
          <h2
            style={{
              color: colors.textMuted,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: 1.5,
              textTransform: 'uppercase',
              marginBottom: 16,
            }}
          >
            Authentication
          </h2>
          <div
            style={{
              background: colors.surface,
              border: `1px solid ${colors.border}`,
              padding: 24,
            }}
          >
            <div style={{ marginBottom: 20 }}>
              <h3
                style={{
                  color: colors.textPrimary,
                  fontSize: 14,
                  fontWeight: 600,
                  marginBottom: 6,
                  marginTop: 0,
                }}
              >
                API Key (data endpoints)
              </h3>
              <p style={{ color: colors.textMuted, fontSize: 13, lineHeight: 1.5, margin: 0 }}>
                Pass your key in the{' '}
                <code style={{ color: colors.primary, fontFamily: 'monospace', fontSize: 12 }}>
                  X-API-Key
                </code>{' '}
                header. Keys start with{' '}
                <code style={{ color: colors.primary, fontFamily: 'monospace', fontSize: 12 }}>
                  sk_live_
                </code>{' '}
                and are hashed server-side — store them securely.
              </p>
            </div>
            <div>
              <h3
                style={{
                  color: colors.textPrimary,
                  fontSize: 14,
                  fontWeight: 600,
                  marginBottom: 6,
                  marginTop: 0,
                }}
              >
                Bearer JWT (key creation only)
              </h3>
              <p style={{ color: colors.textMuted, fontSize: 13, lineHeight: 1.5, margin: 0 }}>
                The{' '}
                <code style={{ color: colors.primary, fontFamily: 'monospace', fontSize: 12 }}>
                  POST /api/v1/keys
                </code>{' '}
                endpoint requires a Supabase session JWT in the{' '}
                <code style={{ color: colors.primary, fontFamily: 'monospace', fontSize: 12 }}>
                  Authorization: Bearer
                </code>{' '}
                header. You can also generate keys from{' '}
                <strong style={{ color: colors.textPrimary }}>Settings &gt; Developer</strong> in the
                app.
              </p>
            </div>
          </div>
        </div>

        {/* Endpoints Section */}
        <div style={{ marginBottom: 48 }}>
          <h2
            style={{
              color: colors.textMuted,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: 1.5,
              textTransform: 'uppercase',
              marginBottom: 16,
            }}
          >
            Endpoints
          </h2>
          {endpoints.map((ep, i) => (
            <EndpointCard key={i} {...ep} />
          ))}
        </div>

        {/* Error Responses Section */}
        <div style={{ marginBottom: 48 }}>
          <h2
            style={{
              color: colors.textMuted,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: 1.5,
              textTransform: 'uppercase',
              marginBottom: 16,
            }}
          >
            Error Responses
          </h2>
          <div
            style={{
              background: colors.surface,
              border: `1px solid ${colors.border}`,
              padding: 24,
            }}
          >
            <p
              style={{
                color: colors.textMuted,
                fontSize: 13,
                lineHeight: 1.5,
                marginTop: 0,
                marginBottom: 16,
              }}
            >
              All errors return a JSON body with an{' '}
              <code style={{ color: colors.primary, fontFamily: 'monospace', fontSize: 12 }}>
                error
              </code>{' '}
              field:
            </p>
            <CodeBlock>{`{ "error": "Missing X-API-Key header" }`}</CodeBlock>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: 13,
                marginTop: 16,
              }}
            >
              <thead>
                <tr>
                  {['Status', 'Description'].map((h) => (
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
                {errorRows.map((row) => (
                  <tr key={row.code}>
                    <td
                      style={{
                        padding: '8px 12px',
                        borderBottom: `1px solid ${colors.border}`,
                        fontFamily: 'monospace',
                        color: colors.textPrimary,
                        fontSize: 12,
                      }}
                    >
                      {row.code}
                    </td>
                    <td
                      style={{
                        padding: '8px 12px',
                        borderBottom: `1px solid ${colors.border}`,
                        color: colors.textMuted,
                        fontSize: 12,
                      }}
                    >
                      {row.description}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            borderTop: `1px solid ${colors.border}`,
            padding: '20px 0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <p style={{ color: colors.textMuted, fontSize: 12, margin: 0 }}>
            Powered by{' '}
            <strong style={{ color: colors.primary }}>SLATE</strong>
          </p>
          <Link
            to="/"
            style={{
              color: colors.primary,
              fontSize: 12,
              textDecoration: 'none',
            }}
          >
            Back to app
          </Link>
        </div>
      </div>
    </div>
  );
}
