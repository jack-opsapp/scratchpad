// Background service worker for Slate Chrome Extension

const BG_SUPABASE_URL = 'https://lepksnpkrnkokiwxfcsj.supabase.co';
const BG_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxlcGtzbnBrcm5rb2tpd3hmY3NqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1NDA4NzAsImV4cCI6MjA4NTExNjg3MH0.iuvLg9Pmc8mPIGqrb20MyiRHuTANb-FKcU65vpArPX0';

// Create context menu on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'slate-save-selection',
    title: 'Save to Slate',
    contexts: ['selection'],
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'slate-save-selection' && info.selectionText) {
    chrome.storage.local.set({
      pendingNote: {
        content: info.selectionText.trim(),
        sourceUrl: tab.url,
        sourceTitle: tab.title,
        timestamp: Date.now(),
      },
    });
    chrome.action.openPopup();
  }
});

// Handle messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'googleAuth') {
    startGoogleAuth();
    sendResponse({ started: true });
  }
  return false;
});

/**
 * Launch Google OAuth via chrome.identity.launchWebAuthFlow.
 *
 * This uses the extension's built-in redirect URL (chrome.identity.getRedirectURL())
 * which returns the full URL including hash fragments — unlike chrome.tabs.onUpdated
 * which strips hash fragments and breaks token extraction.
 *
 * IMPORTANT: The extension's redirect URL must be added to the Supabase project's
 * allowed redirect URLs in the dashboard. The URL format is:
 *   https://<extension-id>.chromiumapp.org/
 *
 * Log chrome.identity.getRedirectURL() to find the exact URL to whitelist.
 */
async function startGoogleAuth() {
  const redirectUrl = chrome.identity.getRedirectURL();

  const authUrl = `${BG_SUPABASE_URL}/auth/v1/authorize?` + new URLSearchParams({
    provider: 'google',
    redirect_to: redirectUrl,
  }).toString();

  try {
    const responseUrl = await chrome.identity.launchWebAuthFlow({
      url: authUrl,
      interactive: true,
    });

    if (!responseUrl) return;

    // Extract tokens from hash fragment — launchWebAuthFlow returns the full URL
    const hashIndex = responseUrl.indexOf('#');
    if (hashIndex === -1) return;

    const hashParams = new URLSearchParams(responseUrl.substring(hashIndex + 1));
    const accessToken = hashParams.get('access_token');
    const refreshTokenVal = hashParams.get('refresh_token');

    if (!accessToken) return;

    // Fetch user info from Supabase
    const resp = await fetch(`${BG_SUPABASE_URL}/auth/v1/user`, {
      headers: {
        'apikey': BG_SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!resp.ok) return;
    const user = await resp.json();

    // Store session — popup will detect this via chrome.storage.onChanged
    await chrome.storage.local.set({
      slate_session: {
        access_token: accessToken,
        refresh_token: refreshTokenVal,
        user,
      },
    });
  } catch {
    // Auth canceled or failed — user can retry from popup
  }
}
