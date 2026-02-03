import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useAuth } from './hooks/useAuth.js';
import { SignedOutScreen, MainApp } from './screens/index.js';
import PublicPage from './pages/PublicPage.jsx';
import { colors } from './styles/theme.js';

/**
 * Loading spinner component
 */
function LoadingScreen() {
  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        alignItems: 'center',
        justifyContent: 'center',
        background: colors.bg,
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 16,
        }}
      >
        {/* Animated loading bars */}
        <div style={{ display: 'flex', gap: 4 }}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                width: 4,
                height: 24,
                background: colors.primary,
                animation: `pulse 1s ease-in-out ${i * 0.15}s infinite`,
              }}
            />
          ))}
        </div>
        <span
          style={{
            color: colors.textMuted,
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          Loading...
        </span>
        <style>
          {`
            @keyframes pulse {
              0%, 100% { opacity: 0.3; transform: scaleY(0.6); }
              50% { opacity: 1; transform: scaleY(1); }
            }
          `}
        </style>
      </div>
    </div>
  );
}

/**
 * Main Slate app component
 * Handles authentication state and screen routing
 */
function Slate() {
  const { user, loading, error, signInWithGoogle, signOut } = useAuth();

  // Show loading screen while checking auth
  if (loading) {
    return <LoadingScreen />;
  }

  // Show sign-in screen if not authenticated
  if (!user) {
    return (
      <SignedOutScreen
        onSignIn={signInWithGoogle}
        error={error}
      />
    );
  }

  // Show main app when authenticated
  return <MainApp user={user} onSignOut={signOut} />;
}

/**
 * Root application component with routing
 */
export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/public/:token" element={<PublicPage />} />
        <Route path="/*" element={<Slate />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
