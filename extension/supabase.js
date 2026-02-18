// Supabase REST API helper for Chrome extension
// Uses direct REST calls instead of the JS client (no bundler needed)

const SUPABASE_URL = 'https://lepksnpkrnkokiwxfcsj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxlcGtzbnBrcm5rb2tpd3hmY3NqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1NDA4NzAsImV4cCI6MjA4NTExNjg3MH0.iuvLg9Pmc8mPIGqrb20MyiRHuTANb-FKcU65vpArPX0';

/**
 * Get stored auth session
 */
async function getSession() {
  const result = await chrome.storage.local.get('slate_session');
  return result.slate_session || null;
}

/**
 * Store auth session
 */
async function setSession(session) {
  await chrome.storage.local.set({ slate_session: session });
}

/**
 * Clear auth session
 */
async function clearSession() {
  await chrome.storage.local.remove('slate_session');
}

/**
 * Make authenticated request to Supabase REST API
 */
async function supabaseRequest(path, options = {}) {
  const session = await getSession();
  if (!session?.access_token) throw new Error('Not authenticated');

  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const headers = {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${session.access_token}`,
    'Content-Type': 'application/json',
    'Prefer': options.prefer || 'return=representation',
  };

  const response = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (response.status === 401) {
    // Try to refresh token
    const refreshed = await refreshToken();
    if (refreshed) {
      // Retry with new token
      const newSession = await getSession();
      headers['Authorization'] = `Bearer ${newSession.access_token}`;
      const retryResponse = await fetch(url, {
        method: options.method || 'GET',
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
      if (!retryResponse.ok) throw new Error(`API error: ${retryResponse.status}`);
      return retryResponse.json();
    }
    throw new Error('Session expired. Please sign in again.');
  }

  if (!response.ok) throw new Error(`API error: ${response.status}`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

/**
 * Refresh the access token using refresh_token
 */
async function refreshToken() {
  const session = await getSession();
  if (!session?.refresh_token) return false;

  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    });

    if (!response.ok) return false;
    const data = await response.json();
    await setSession({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      user: data.user,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Sign in with Google OAuth via background service worker.
 * The background script opens a tab for Supabase OAuth (redirecting to the
 * web app URL which is already whitelisted in Supabase), monitors the tab for
 * tokens, and stores the session in chrome.storage.local.
 *
 * This function asks the background to start the flow, then waits for the
 * session to appear in storage. This works even if the popup closes while
 * the user is completing sign-in — the background persists.
 */
async function signInWithGoogle() {
  // Tell the background service worker to start the OAuth flow
  chrome.runtime.sendMessage({ action: 'googleAuth' });

  // Wait for session to appear in storage (background sets it after auth)
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.storage.onChanged.removeListener(listener);
      reject(new Error('Sign-in timed out. Please try again.'));
    }, 120000);

    const listener = (changes, area) => {
      if (area !== 'local' || !changes.slate_session?.newValue) return;
      clearTimeout(timeout);
      chrome.storage.onChanged.removeListener(listener);
      resolve(changes.slate_session.newValue.user);
    };

    chrome.storage.onChanged.addListener(listener);
  });
}

/**
 * Get user's pages with sections
 */
async function getPages() {
  const pages = await supabaseRequest('pages?deleted_at=is.null&order=position.asc&select=id,name,starred,sections(id,name,position)');
  return pages || [];
}

/**
 * Create a note
 */
async function createNote(sectionId, content, tags = [], date = null) {
  const session = await getSession();
  const body = {
    section_id: sectionId,
    content,
    created_by_user_id: session.user?.id,
  };
  if (tags.length > 0) body.tags = tags;
  if (date) body.date = date;

  const result = await supabaseRequest('notes', {
    method: 'POST',
    body,
  });
  return result;
}
