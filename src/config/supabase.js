/**
 * Supabase Client Configuration
 *
 * Initializes the Supabase client with proper auth settings for the
 * Slate application. Handles session persistence and auto-refresh.
 */

import { createClient } from '@supabase/supabase-js';

// =============================================================================
// Environment Variables
// =============================================================================

// Default keys for Apple App Store review builds
// These are the Supabase anon key (safe for client-side, RLS protects data)
const DEFAULT_SUPABASE_URL = 'https://lepksnpkrnkokiwxfcsj.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxlcGtzbnBrcm5rb2tpd3hmY3NqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1NDA4NzAsImV4cCI6MjA4NTExNjg3MH0.iuvLg9Pmc8mPIGqrb20MyiRHuTANb-FKcU65vpArPX0';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;

// =============================================================================
// Supabase Client
// =============================================================================

/**
 * Supabase client instance configured with:
 * - Auto session refresh
 * - Local storage persistence
 * - URL detection for OAuth callbacks
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Automatically refresh the session before it expires
    autoRefreshToken: true,

    // Persist session in localStorage
    persistSession: true,

    // Detect OAuth callback URLs automatically
    detectSessionInUrl: true,

    // Storage key for session data
    storageKey: 'slate-auth',

    // Use localStorage for session persistence
    storage: window.localStorage,
  },
});

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get the currently authenticated user
 * @returns {Promise<{user: object|null, error: Error|null}>}
 */
export async function getCurrentUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  return { user, error };
}

/**
 * Get the current session
 * @returns {Promise<{session: object|null, error: Error|null}>}
 */
export async function getSession() {
  const { data: { session }, error } = await supabase.auth.getSession();
  return { session, error };
}

/**
 * Sign in with email and password
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{data: object|null, error: Error|null}>}
 */
export async function signInWithEmail(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  return { data, error };
}

/**
 * Sign up with email and password
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{data: object|null, error: Error|null}>}
 */
export async function signUpWithEmail(email, password) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });
  return { data, error };
}

/**
 * Sign in with OAuth provider (Google, GitHub, etc.)
 * @param {'google'|'github'|'discord'} provider
 * @returns {Promise<{data: object|null, error: Error|null}>}
 */
export async function signInWithProvider(provider) {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: window.location.origin,
    },
  });
  return { data, error };
}

/**
 * Sign out the current user
 * @returns {Promise<{error: Error|null}>}
 */
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  return { error };
}

/**
 * Subscribe to auth state changes
 * @param {function} callback - Called with (event, session) on auth changes
 * @returns {function} Unsubscribe function
 */
export function onAuthStateChange(callback) {
  const { data: { subscription } } = supabase.auth.onAuthStateChange(callback);
  return () => subscription.unsubscribe();
}

// =============================================================================
// Exports
// =============================================================================

export default supabase;
