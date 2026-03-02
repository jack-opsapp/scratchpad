import { useState, useEffect } from 'react';
import { useTypewriter } from '../hooks/useTypewriter.js';
import { colors, transitions } from '../styles/theme.js';
import { useMediaQuery } from '../hooks/useMediaQuery.js';
import { signInWithEmail, signUpWithEmail } from '../config/supabase.js';

/**
 * Landing/sign-in screen with animated branding
 *
 * @param {object} props
 * @param {function} props.onSignIn - Sign in handler (triggers Google OAuth)
 * @param {string} props.error - Error message to display
 */
export function SignedOutScreen({ onSignIn, error }) {
  const title = useTypewriter('SLATE', 60);
  const subtitle = useTypewriter('Your ideas, organized.', 30, 700);
  const [showContent, setShowContent] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const { isMobile } = useMediaQuery();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState(null);
  const [confirmationSent, setConfirmationSent] = useState(false);

  useEffect(() => {
    if (subtitle.done) {
      setTimeout(() => setShowContent(true), 150);
    }
  }, [subtitle.done]);

  const handleSignIn = async () => {
    setSigningIn(true);
    try {
      await onSignIn();
    } catch (err) {
      console.error('Sign-in error:', err);
      setSigningIn(false);
    }
  };

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;

    setEmailLoading(true);
    setEmailError(null);

    if (isSignUp) {
      const { data, error: signUpError } = await signUpWithEmail(email.trim(), password);
      if (signUpError) {
        setEmailError(signUpError.message);
        setEmailLoading(false);
      } else if (!data.session) {
        setConfirmationSent(true);
        setEmailLoading(false);
      } else {
        setEmailLoading(false);
      }
    } else {
      const { error: signInError } = await signInWithEmail(email.trim(), password);
      if (signInError) {
        setEmailError(signInError.message);
      }
      setEmailLoading(false);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        background: colors.bg,
        fontFamily: "'Manrope', sans-serif",
      }}
    >
      {/* Sidebar branding — hidden on mobile */}
      {!isMobile && (
        <div
          style={{
            width: 64,
            background: colors.surface,
            borderRight: `1px solid ${colors.border}`,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
            padding: '0 0 80px 0',
          }}
        >
          <span
            style={{
              writingMode: 'vertical-rl',
              transform: 'rotate(180deg)',
              color: colors.textPrimary,
              fontSize: 32,
              fontWeight: 600,
              letterSpacing: -1,
              margin: '0 auto',
            }}
          >
            SLATE
          </span>
        </div>
      )}

      {/* Main content */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: isMobile ? '0 24px' : '0 80px',
        }}
      >
        {/* Title with typewriter */}
        <h1
          style={{
            color: colors.textPrimary,
            fontSize: isMobile ? 40 : 56,
            fontWeight: 600,
            letterSpacing: -2,
            marginBottom: 16,
          }}
        >
          {title.displayed}
          {!title.done && <span style={{ color: colors.primary }}>_</span>}
        </h1>

        {/* Subtitle with typewriter */}
        <p
          style={{
            color: colors.textPrimary,
            fontSize: 14,
            fontWeight: 500,
            fontFamily: "'Manrope', sans-serif",
            marginBottom: 8,
            minHeight: 24,
          }}
        >
          {subtitle.displayed}
          {title.done && !subtitle.done && (
            <span style={{ color: colors.primary }}>_</span>
          )}
        </p>

        {/* Fade-in content */}
        <div
          style={{
            opacity: showContent ? 1 : 0,
            transform: showContent ? 'translateY(0)' : 'translateY(8px)',
            transition: `all ${transitions.slow}`,
            marginTop: 32,
          }}
        >
          <p
            style={{
              color: colors.textPrimary,
              fontSize: 13,
              fontFamily: "'Manrope', sans-serif",
              lineHeight: 1.6,
              marginBottom: 40,
              opacity: 0.7,
              maxWidth: 360,
            }}
          >
            Natural language note-taking with automatic organization and tagging.
            Built for operators.
          </p>

          {/* Error message */}
          {(error || emailError) && (
            <div
              style={{
                marginBottom: 16,
                padding: '12px 16px',
                background: 'rgba(184, 60, 42, 0.1)',
                border: `1px solid ${colors.danger}`,
                color: colors.danger,
                fontSize: 13,
                maxWidth: 360,
              }}
            >
              {error || emailError}
            </div>
          )}

          {/* Confirmation message */}
          {confirmationSent && (
            <div
              style={{
                marginBottom: 16,
                padding: '12px 16px',
                border: `1px solid ${colors.success}`,
                color: colors.success,
                fontSize: 13,
                maxWidth: 360,
              }}
            >
              Check your email to confirm your account.
            </div>
          )}

          {/* Email / Password form */}
          <form onSubmit={handleEmailSubmit} style={{ maxWidth: 360 }}>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={emailLoading}
              style={{
                width: '100%',
                padding: '12px 16px',
                background: colors.surface,
                border: `1px solid ${colors.border}`,
                color: colors.textPrimary,
                fontSize: 14,
                fontFamily: "'Manrope', sans-serif",
                outline: 'none',
                marginBottom: 8,
                boxSizing: 'border-box',
              }}
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={emailLoading}
              style={{
                width: '100%',
                padding: '12px 16px',
                background: colors.surface,
                border: `1px solid ${colors.border}`,
                color: colors.textPrimary,
                fontSize: 14,
                fontFamily: "'Manrope', sans-serif",
                outline: 'none',
                marginBottom: 12,
                boxSizing: 'border-box',
              }}
            />
            <button
              type="submit"
              disabled={emailLoading || !email.trim() || !password.trim()}
              style={{
                width: '100%',
                padding: '12px 24px',
                background: colors.primary,
                border: 'none',
                color: '#000',
                fontSize: 14,
                fontWeight: 500,
                fontFamily: "'Manrope', sans-serif",
                letterSpacing: 1.5,
                cursor: emailLoading || !email.trim() || !password.trim() ? 'not-allowed' : 'pointer',
                opacity: emailLoading || !email.trim() || !password.trim() ? 0.5 : 1,
                transition: 'opacity 0.2s ease',
                boxSizing: 'border-box',
              }}
            >
              {emailLoading ? 'Loading...' : isSignUp ? 'SIGN UP' : 'SIGN IN'}
            </button>
            <div
              onClick={() => { setIsSignUp(!isSignUp); setEmailError(null); setConfirmationSent(false); }}
              style={{
                color: colors.textMuted,
                fontSize: 12,
                textAlign: 'center',
                marginTop: 8,
                cursor: 'pointer',
              }}
            >
              {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
            </div>
          </form>

          {/* Divider */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              maxWidth: 360,
              width: '100%',
              margin: '24px 0',
            }}
          >
            <div style={{ flex: 1, height: 1, background: colors.border }} />
            <span
              style={{
                color: colors.textMuted,
                fontSize: 11,
                fontFamily: "'Manrope', sans-serif",
                letterSpacing: 1,
                textTransform: 'uppercase',
                margin: '0 16px',
              }}
            >
              or
            </span>
            <div style={{ flex: 1, height: 1, background: colors.border }} />
          </div>

          {/* Google sign in button */}
          <button
            onClick={handleSignIn}
            disabled={signingIn}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '12px 24px',
              background: 'transparent',
              border: `1px solid ${colors.border}`,
              color: colors.textPrimary,
              fontSize: 14,
              fontWeight: 500,
              cursor: signingIn ? 'not-allowed' : 'pointer',
              opacity: signingIn ? 0.6 : 1,
              transition: 'opacity 0.2s ease',
            }}
          >
            {signingIn ? (
              <>
                <div
                  style={{
                    width: 16,
                    height: 16,
                    border: `2px solid ${colors.textMuted}`,
                    borderTopColor: colors.textPrimary,
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                  }}
                />
                Signing in...
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24">
                  <path
                    fill="#fff"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#fff"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#fff"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#fff"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                Sign in with Google
              </>
            )}
          </button>

          {/* Spinner animation */}
          <style>
            {`
              @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
              }
            `}
          </style>
        </div>
      </div>
    </div>
  );
}

export default SignedOutScreen;
