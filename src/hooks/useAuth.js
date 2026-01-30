/**
 * Authentication Hook
 *
 * Manages Supabase authentication state throughout the app.
 * Handles session persistence, auth state changes, and user sync.
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../config/supabase.js';

/**
 * Sync user to database
 * Creates or updates user record with latest info
 */
async function syncUserToDatabase(authUser) {
  if (!authUser) return;

  try {
    const { error: syncError } = await supabase
      .from('users')
      .upsert({
        id: authUser.id,
        email: authUser.email,
        last_sign_in: new Date().toISOString(),
      }, {
        onConflict: 'id',
      });

    if (syncError) {
      console.error('Error syncing user to database:', syncError);
    }
  } catch (err) {
    console.error('Error syncing user:', err);
  }
}

/**
 * Check if URL contains OAuth callback hash
 */
function hasAuthCallback() {
  return window.location.hash.includes('access_token');
}

/**
 * Custom hook for authentication state management
 * @returns {{
 *   user: object|null,
 *   session: object|null,
 *   loading: boolean,
 *   error: string|null,
 *   signInWithGoogle: function,
 *   signOut: function
 * }}
 */
export function useAuth() {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  /**
   * Initialize auth state on mount
   */
  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      try {
        // If we have an OAuth callback in the URL, let Supabase handle it first
        if (hasAuthCallback()) {
          console.log('OAuth callback detected in URL, processing...');

          // Parse the hash manually and set the session
          const hashParams = new URLSearchParams(
            window.location.hash.substring(1) // Remove the #
          );

          const accessToken = hashParams.get('access_token');
          const refreshToken = hashParams.get('refresh_token');

          if (accessToken && refreshToken) {
            console.log('Setting session from URL tokens...');
            const { data, error: setSessionError } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });

            if (setSessionError) {
              console.error('Error setting session:', setSessionError);
              if (mounted) setError(setSessionError.message);
            } else if (data.session) {
              console.log('Session set successfully for:', data.session.user.email);
              if (mounted) {
                setUser(data.session.user);
                setSession(data.session);
                syncUserToDatabase(data.session.user);
              }
              // Clean up the URL
              window.history.replaceState(null, '', window.location.pathname);
            }

            if (mounted) setLoading(false);
            return;
          }
        }

        // No OAuth callback, check for existing session
        console.log('Checking for existing session...');
        const { data: { session: currentSession }, error: sessionError } =
          await supabase.auth.getSession();

        if (sessionError) {
          console.error('Error getting session:', sessionError);
          if (mounted) setError(sessionError.message);
        }

        if (currentSession?.user) {
          console.log('Found existing session for:', currentSession.user.email);
          if (mounted) {
            setUser(currentSession.user);
            setSession(currentSession);
            syncUserToDatabase(currentSession.user);
          }
        } else {
          console.log('No existing session found');
        }

        if (mounted) setLoading(false);
      } catch (err) {
        console.error('Auth initialization error:', err);
        if (mounted) {
          setError(err.message);
          setLoading(false);
        }
      }
    };

    initAuth();

    // Listen for auth state changes (for sign out, token refresh, etc.)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        console.log('Auth state changed:', event, newSession?.user?.email);

        if (mounted) {
          setSession(newSession);
          setUser(newSession?.user ?? null);

          // Sync user on sign in
          if (event === 'SIGNED_IN' && newSession?.user) {
            syncUserToDatabase(newSession.user);
          }

          // Clear error on successful auth
          if (newSession) {
            setError(null);
          }
        }
      }
    );

    // Cleanup subscription on unmount
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  /**
   * Sign in with Google OAuth
   */
  const signInWithGoogle = useCallback(async () => {
    setError(null);

    try {
      const { error: signInError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
        },
      });

      if (signInError) {
        console.error('Google sign-in error:', signInError);
        setError(signInError.message);
      }
      // Note: On success, page will redirect to Google
    } catch (err) {
      console.error('Sign-in error:', err);
      setError(err.message);
    }
  }, []);

  /**
   * Sign out current user
   */
  const signOut = useCallback(async () => {
    setError(null);

    try {
      const { error: signOutError } = await supabase.auth.signOut();

      if (signOutError) {
        console.error('Sign-out error:', signOutError);
        setError(signOutError.message);
      } else {
        setUser(null);
        setSession(null);
      }
    } catch (err) {
      console.error('Sign-out error:', err);
      setError(err.message);
    }
  }, []);

  return {
    user,
    session,
    loading,
    error,
    signInWithGoogle,
    signOut,
  };
}

export default useAuth;
