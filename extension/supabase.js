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
 * Sign in with Google OAuth via chrome.identity.launchWebAuthFlow
 * Opens a popup window that handles the Google OAuth flow through Supabase
 */
async function signInWithGoogle() {
  // Build the redirect URL for the Chrome extension
  // chrome.identity.getRedirectURL() returns https://<id>.chromiumapp.org/
  // Fallback: construct manually from chrome.runtime.id
  let redirectUrl;
  if (chrome.identity?.getRedirectURL) {
    redirectUrl = chrome.identity.getRedirectURL();
  } else {
    redirectUrl = `https://${chrome.runtime.id}.chromiumapp.org/`;
  }

  const authUrl = `${SUPABASE_URL}/auth/v1/authorize?` + new URLSearchParams({
    provider: 'google',
    redirect_to: redirectUrl,
  }).toString();

  // Launch the OAuth flow in a popup
  // Use chrome.identity if available, otherwise fall back to window.open
  let responseUrl;
  if (chrome.identity?.launchWebAuthFlow) {
    responseUrl = await new Promise((resolve, reject) => {
      chrome.identity.launchWebAuthFlow(
        { url: authUrl, interactive: true },
        (callbackUrl) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(callbackUrl);
          }
        }
      );
    });
  } else {
    // Fallback: open in a new tab and listen for the redirect
    responseUrl = await new Promise((resolve, reject) => {
      // Open auth URL in new tab
      chrome.tabs.create({ url: authUrl }, (tab) => {
        const tabId = tab.id;
        // Listen for the tab to navigate to our redirect URL
        const listener = (updatedTabId, changeInfo) => {
          if (updatedTabId === tabId && changeInfo.url?.startsWith(redirectUrl)) {
            chrome.tabs.onUpdated.removeListener(listener);
            chrome.tabs.remove(tabId);
            resolve(changeInfo.url);
          }
        };
        chrome.tabs.onUpdated.addListener(listener);
        // Clean up if tab is closed manually
        chrome.tabs.onRemoved.addListener(function onRemoved(closedId) {
          if (closedId === tabId) {
            chrome.tabs.onUpdated.removeListener(listener);
            chrome.tabs.onRemoved.removeListener(onRemoved);
            reject(new Error('Sign-in was canceled'));
          }
        });
      });
    });
  }

  // Parse tokens from the callback URL hash fragment
  // Supabase returns: #access_token=...&refresh_token=...&...
  const hashIndex = responseUrl.indexOf('#');
  if (hashIndex === -1) throw new Error('No auth tokens received');

  const hashParams = new URLSearchParams(responseUrl.substring(hashIndex + 1));
  const accessToken = hashParams.get('access_token');
  const refreshToken = hashParams.get('refresh_token');

  if (!accessToken) throw new Error('No access token received');

  // Fetch user info from Supabase using the access token
  const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!userResponse.ok) throw new Error('Failed to get user info');
  const user = await userResponse.json();

  // Store the session
  await setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
    user,
  });

  return user;
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
