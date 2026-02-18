// Slate Chrome Extension - Popup UI Logic

const app = document.getElementById('app');
const WEB_APP_URL = 'https://slate.opsapp.co';

// Send arrow SVG (matches web app)
const SEND_ICON = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#e8e8e8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>';

// Google icon SVG markup (static, safe)
const GOOGLE_ICON = '<svg width="16" height="16" viewBox="0 0 24 24"><path fill="#e8e8e8" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#e8e8e8" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#e8e8e8" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#e8e8e8" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>';

// Helper: build DOM elements safely
function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'className') node.className = v;
    else if (k === 'textContent') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2).toLowerCase(), v);
    else node.setAttribute(k, v);
  }
  for (const child of children) {
    if (typeof child === 'string') node.appendChild(document.createTextNode(child));
    else if (child) node.appendChild(child);
  }
  return node;
}

// Helper: set innerHTML for static trusted markup only
function setTrustedHTML(element, html) {
  element.innerHTML = html;
}

// Initialize popup
async function init() {
  const session = await getSession();
  if (session?.access_token) {
    showChat();
  } else {
    showSignIn();
  }
}

// Sign in view
function showSignIn() {
  app.replaceChildren();

  const header = el('div', { className: 'header' }, [
    el('h1', { textContent: 'Slate' }),
  ]);

  const signInDiv = el('div', { className: 'sign-in' });
  signInDiv.appendChild(el('p', { textContent: 'Sign in to your Slate account to save notes from any webpage.' }));

  const googleBtn = el('button', { className: 'btn-google', id: 'google-btn' });
  setTrustedHTML(googleBtn, GOOGLE_ICON + ' Sign in with Google');
  signInDiv.appendChild(googleBtn);

  const errorDiv = el('div', { id: 'error', className: 'error' });
  signInDiv.appendChild(errorDiv);

  app.appendChild(header);
  app.appendChild(signInDiv);

  googleBtn.addEventListener('click', handleGoogleSignIn);
}

async function handleGoogleSignIn() {
  const errorEl = document.getElementById('error');
  const btn = document.getElementById('google-btn');

  btn.disabled = true;
  setTrustedHTML(btn, '<div class="spinner-lg"></div> Signing in...');
  errorEl.textContent = '';

  try {
    await signInWithGoogle();
    showChat();
  } catch (err) {
    if (err.message?.includes('canceled') || err.message?.includes('closed')) {
      btn.disabled = false;
      setTrustedHTML(btn, GOOGLE_ICON + ' Sign in with Google');
      return;
    }
    errorEl.textContent = err.message;
    btn.disabled = false;
    setTrustedHTML(btn, GOOGLE_ICON + ' Sign in with Google');
  }
}

// Chat view — simple input like the web app
async function showChat() {
  const session = await getSession();
  const userName = session?.user?.user_metadata?.full_name
    || session?.user?.user_metadata?.name
    || session?.user?.email?.split('@')[0]
    || 'User';

  app.replaceChildren();

  // Header
  const signOutBtn = el('button', { className: 'sign-out', id: 'sign-out-btn', textContent: userName + ' \u00b7 Sign Out' });
  const header = el('div', { className: 'header' }, [
    el('h1', { textContent: 'Slate' }),
    signOutBtn,
  ]);

  // Source info (shown if text was selected)
  const sourceInfo = el('div', { id: 'source-info', className: 'source' });

  // Chat input row
  const inputRow = el('div', { className: 'chat-input' });
  const textarea = el('textarea', { id: 'chat-input', placeholder: 'Type a command...', rows: '1' });
  const sendBtn = el('button', { className: 'send-btn', id: 'send-btn', disabled: 'true' });
  setTrustedHTML(sendBtn, SEND_ICON);
  inputRow.appendChild(textarea);
  inputRow.appendChild(sendBtn);

  // Response area
  const responseDiv = el('div', { id: 'response' });

  // Open app link
  const openApp = el('a', { href: WEB_APP_URL, target: '_blank', className: 'open-app' });
  setTrustedHTML(openApp, 'Open Slate &rarr;');

  app.appendChild(header);
  app.appendChild(sourceInfo);
  app.appendChild(inputRow);
  app.appendChild(responseDiv);
  app.appendChild(openApp);

  // Event listeners
  signOutBtn.addEventListener('click', handleSignOut);
  sendBtn.addEventListener('click', handleSend);

  textarea.addEventListener('input', () => {
    // Auto-resize
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
    // Toggle send button
    sendBtn.disabled = !textarea.value.trim();
  });

  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (textarea.value.trim()) handleSend();
    }
  });

  // Load selected text or pending note
  await loadInitialContent();

  textarea.focus();
}

async function loadInitialContent() {
  const textarea = document.getElementById('chat-input');
  const sourceEl = document.getElementById('source-info');

  // Check for pending note from context menu
  const stored = await chrome.storage.local.get('pendingNote');
  if (stored.pendingNote) {
    textarea.value = stored.pendingNote.content;
    if (stored.pendingNote.sourceTitle) {
      sourceEl.textContent = 'From: ' + stored.pendingNote.sourceTitle;
    }
    await chrome.storage.local.remove('pendingNote');
    // Trigger input event to resize and enable send
    textarea.dispatchEvent(new Event('input'));
    return;
  }

  // Try to get selection from active tab
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'getSelection' });
      if (response?.text) {
        textarea.value = response.text;
        sourceEl.textContent = 'From: ' + (response.title || response.url);
        textarea.dispatchEvent(new Event('input'));
      }
    }
  } catch {
    // Content script may not be injected on some pages
  }
}

async function handleSend() {
  const textarea = document.getElementById('chat-input');
  const sendBtn = document.getElementById('send-btn');
  const responseDiv = document.getElementById('response');
  const message = textarea.value.trim();

  if (!message) return;

  const session = await getSession();
  if (!session?.user?.id) {
    responseDiv.className = 'response error';
    responseDiv.textContent = 'Session expired. Please sign in again.';
    return;
  }

  // Show processing state
  sendBtn.disabled = true;
  textarea.disabled = true;
  responseDiv.className = 'processing';
  setTrustedHTML(responseDiv, '<div class="spinner"></div> Processing...');

  try {
    const result = await fetch(`${WEB_APP_URL}/api/agent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        userId: session.user.id,
        conversationHistory: [],
        context: null,
        source: 'extension',
      }),
    });

    if (!result.ok) {
      throw new Error(`API error: ${result.status}`);
    }

    const data = await result.json();

    if (data.type === 'error') {
      responseDiv.className = 'response error';
      responseDiv.textContent = data.message;
    } else if (data.type === 'clarification') {
      responseDiv.className = 'response';
      responseDiv.textContent = data.question || 'Could you clarify?';
    } else {
      responseDiv.className = 'response success';
      responseDiv.textContent = data.message || 'Done.';
      textarea.value = '';
      textarea.style.height = 'auto';

      // Auto-close after short delay
      setTimeout(() => window.close(), 1500);
    }
  } catch (err) {
    responseDiv.className = 'response error';
    responseDiv.textContent = err.message;
  }

  textarea.disabled = false;
  sendBtn.disabled = !textarea.value.trim();
  textarea.focus();
}

async function handleSignOut() {
  await clearSession();
  showSignIn();
}

// Start
init();
