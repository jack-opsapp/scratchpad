/**
 * PublicPage Component
 *
 * Read-only view of a shared page accessed via public link.
 * Supports optional password protection.
 */

import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { getPublicPageData } from '../lib/permissions';
import { Check } from 'lucide-react';

const colors = {
  bg: '#000000',
  surface: '#0a0a0a',
  border: '#1a1a1a',
  primary: '#d1b18f',
  textPrimary: '#ffffff',
  textMuted: '#888888',
};

export default function PublicPage() {
  const { token } = useParams();
  const [page, setPage] = useState(null);
  const [password, setPassword] = useState('');
  const [needsPassword, setNeedsPassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadPage();
  }, [token]);

  const loadPage = async (pwd = null) => {
    setLoading(true);
    setError(null);

    try {
      const data = await getPublicPageData(token, pwd);
      setPage(data);
      setNeedsPassword(false);
    } catch (err) {
      if (err.message === 'Invalid password') {
        setNeedsPassword(true);
        if (pwd !== null) {
          setError('Incorrect password');
        }
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordSubmit = (e) => {
    e.preventDefault();
    loadPage(password);
  };

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          background: colors.bg,
          color: colors.textPrimary,
        }}
      >
        Loading...
      </div>
    );
  }

  if (needsPassword) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          background: colors.bg,
        }}
      >
        <div
          style={{
            background: colors.surface,
            border: `1px solid ${colors.border}`,
            padding: 32,
            maxWidth: 400,
            width: '90%',
          }}
        >
          <h2
            style={{
              color: colors.textPrimary,
              fontSize: 18,
              fontWeight: 600,
              marginBottom: 16,
            }}
          >
            Password Required
          </h2>
          <p
            style={{
              color: colors.textMuted,
              fontSize: 13,
              marginBottom: 20,
            }}
          >
            This page is password protected.
          </p>
          <form onSubmit={handlePasswordSubmit}>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              autoFocus
              style={{
                width: '100%',
                background: colors.bg,
                border: `1px solid ${colors.border}`,
                color: colors.textPrimary,
                padding: '10px 14px',
                fontSize: 14,
                marginBottom: 12,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            {error && (
              <p style={{ color: '#ff4444', fontSize: 12, marginBottom: 12 }}>
                {error}
              </p>
            )}
            <button
              type="submit"
              style={{
                width: '100%',
                padding: '10px 14px',
                background: colors.primary,
                border: 'none',
                color: colors.bg,
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Access Page
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          background: colors.bg,
        }}
      >
        <div
          style={{
            background: colors.surface,
            border: `1px solid ${colors.border}`,
            padding: 32,
            maxWidth: 400,
            width: '90%',
            textAlign: 'center',
          }}
        >
          <h2
            style={{
              color: colors.textPrimary,
              fontSize: 18,
              fontWeight: 600,
              marginBottom: 8,
            }}
          >
            Page Not Found
          </h2>
          <p style={{ color: colors.textMuted, fontSize: 13 }}>{error}</p>
        </div>
      </div>
    );
  }

  if (!page) return null;

  return (
    <div style={{ minHeight: '100vh', background: colors.bg }}>
      {/* Banner */}
      <div
        style={{
          background: colors.surface,
          borderBottom: `1px solid ${colors.border}`,
          padding: '12px 20px',
          textAlign: 'center',
        }}
      >
        <p style={{ color: colors.textMuted, fontSize: 12, margin: 0 }}>
          This is a public view - Read-only
        </p>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '40px 20px' }}>
        <h1
          style={{
            color: colors.textPrimary,
            fontSize: 32,
            fontWeight: 600,
            letterSpacing: -1,
            marginBottom: 40,
          }}
        >
          {page.name.toUpperCase()}
        </h1>

        {page.sections.map((section) => (
          <div key={section.id} style={{ marginBottom: 40 }}>
            <h2
              style={{
                color: colors.textMuted,
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: 1.5,
                marginBottom: 16,
              }}
            >
              {section.name.toUpperCase()}
            </h2>

            {section.notes.length === 0 ? (
              <p
                style={{
                  color: colors.textMuted,
                  fontSize: 13,
                  opacity: 0.5,
                }}
              >
                No notes
              </p>
            ) : (
              section.notes.map((note) => (
                <div
                  key={note.id}
                  style={{
                    padding: '16px 0',
                    borderBottom: `1px solid ${colors.border}`,
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 16,
                  }}
                >
                  <div
                    style={{
                      width: 16,
                      height: 16,
                      border: `1px solid ${note.completed ? colors.textMuted : colors.border}`,
                      background: note.completed
                        ? colors.textMuted
                        : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      marginTop: 3,
                    }}
                  >
                    {note.completed && (
                      <Check size={10} color={colors.bg} strokeWidth={3} />
                    )}
                  </div>

                  <div style={{ flex: 1 }}>
                    <p
                      style={{
                        color: note.completed
                          ? colors.textMuted
                          : colors.textPrimary,
                        fontSize: 14,
                        textDecoration: note.completed
                          ? 'line-through'
                          : 'none',
                        margin: 0,
                        lineHeight: 1.5,
                      }}
                    >
                      {note.content}
                    </p>

                    {(note.tags?.length > 0 || note.date) && (
                      <div
                        style={{
                          display: 'flex',
                          gap: 8,
                          marginTop: 10,
                          alignItems: 'center',
                          flexWrap: 'wrap',
                        }}
                      >
                        {note.tags?.map((tag) => (
                          <span
                            key={tag}
                            style={{
                              display: 'inline-flex',
                              padding: '2px 6px',
                              border: `1px solid ${colors.border}`,
                              color: colors.textMuted,
                              fontSize: 10,
                              fontWeight: 500,
                              textTransform: 'uppercase',
                              letterSpacing: 0.5,
                            }}
                          >
                            {tag}
                          </span>
                        ))}
                        {note.date && (
                          <span
                            style={{ color: colors.textMuted, fontSize: 11 }}
                          >
                            {note.date}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div
        style={{
          borderTop: `1px solid ${colors.border}`,
          padding: '20px',
          textAlign: 'center',
          marginTop: 60,
        }}
      >
        <p style={{ color: colors.textMuted, fontSize: 12, margin: 0 }}>
          Powered by{' '}
          <strong style={{ color: colors.primary }}>SLATE</strong> -
          https://slate.opsapp.co
        </p>
      </div>
    </div>
  );
}
