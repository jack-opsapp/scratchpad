// Background service worker for Slate Chrome Extension

const BG_SUPABASE_URL = 'https://lepksnpkrnkokiwxfcsj.supabase.co';
const BG_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxlcGtzbnBrcm5rb2tpd3hmY3NqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1NDA4NzAsImV4cCI6MjA4NTExNjg3MH0.iuvLg9Pmc8mPIGqrb20MyiRHuTANb-FKcU65vpArPX0';
const WEB_APP_URL = 'https://scratchpad.jackwillis.io';

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
 * Open a tab for Google OAuth via Supabase, monitor for redirect with tokens.
 * Redirects to the web app URL (already whitelisted in Supabase).
 * Stores session in chrome.storage.local so the popup picks it up.
 */
async function startGoogleAuth() {
  const authUrl = `${BG_SUPABASE_URL}/auth/v1/authorize?` + new URLSearchParams({
    provider: 'google',
    redirect_to: WEB_APP_URL,
  }).toString();

  const tab = await chrome.tabs.create({ url: authUrl });
  const tabId = tab.id;
  let handled = false;

  const cleanup = () => {
    chrome.tabs.onUpdated.removeListener(onUpdated);
    chrome.tabs.onRemoved.removeListener(onRemoved);
  };

  const tryExtractTokens = async (url) => {
    if (handled) return;

    const hashIndex = url.indexOf('#');
    if (hashIndex === -1) return;

    const hashParams = new URLSearchParams(url.substring(hashIndex + 1));
    const accessToken = hashParams.get('access_token');
    const refreshTokenVal = hashParams.get('refresh_token');

    if (!accessToken) return;

    handled = true;
    cleanup();

    try {
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

      // Close the auth tab
      try { await chrome.tabs.remove(tabId); } catch {}
    } catch {
      // Auth failed silently — user can retry from popup
    }
  };

  const onUpdated = async (updatedTabId, changeInfo) => {
    if (updatedTabId !== tabId || handled) return;

    // Check changeInfo.url for hash tokens (works on full navigations)
    if (changeInfo.url?.startsWith(WEB_APP_URL)) {
      await tryExtractTokens(changeInfo.url);
      return;
    }

    // Fallback: when page finishes loading on web app, read full URL via tabs.get
    // (hash fragments may not appear in changeInfo.url on some browsers)
    if (changeInfo.status === 'complete') {
      try {
        const currentTab = await chrome.tabs.get(tabId);
        if (currentTab.url?.startsWith(WEB_APP_URL)) {
          await tryExtractTokens(currentTab.url);
        }
      } catch {
        // Tab may have been closed
      }
    }
  };

  const onRemoved = (closedTabId) => {
    if (closedTabId !== tabId) return;
    cleanup();
  };

  chrome.tabs.onUpdated.addListener(onUpdated);
  chrome.tabs.onRemoved.addListener(onRemoved);

  // Safety timeout: clean up listeners after 3 minutes
  setTimeout(() => {
    if (!handled) cleanup();
  }, 180000);
}
