/**
 * Configuration Exports
 *
 * Central export point for all configuration modules.
 */

// Supabase client and helpers
export {
  supabase,
  getCurrentUser,
  getSession,
  signInWithEmail,
  signUpWithEmail,
  signInWithProvider,
  signOut,
  onAuthStateChange,
} from './supabase.js';
