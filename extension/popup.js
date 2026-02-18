// Slate Chrome Extension - Popup UI Logic

const app = document.getElementById('app');
let pages = [];
let selectedPageId = null;
let selectedSectionId = null;

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

// Helper: set innerHTML for static trusted markup only (extension-controlled templates)
function setTrustedHTML(element, html) {
  // All HTML set here is hardcoded in this extension file - no user input is interpolated unsanitized
  element.innerHTML = html;
}

// Initialize popup
async function init() {
  const session = await getSession();
  if (session?.access_token) {
    await showNoteForm();
  } else {
    showSignIn();
  }
}

// Sign in view - Google OAuth
function showSignIn() {
  app.replaceChildren();

  // Header
  const header = el('div', { className: 'header' }, [
    el('h1', { textContent: 'Slate' }),
  ]);

  // Sign-in section
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
  setTrustedHTML(btn, '<div class="spinner"></div> Signing in...');
  errorEl.textContent = '';

  try {
    await signInWithGoogle();
    await showNoteForm();
  } catch (err) {
    // User closing the popup is not an error worth showing
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

// Note form view
async function showNoteForm() {
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

  // Note form
  const noteForm = el('div', { className: 'note-form' });

  const textarea = el('textarea', { id: 'note-content', placeholder: 'Type a note or select text on any page...', rows: '3' });
  noteForm.appendChild(textarea);

  const sourceInfo = el('div', { id: 'source-info', className: 'source' });
  noteForm.appendChild(sourceInfo);

  // Picker
  const picker = el('div', { className: 'picker' });
  picker.appendChild(el('label', { textContent: 'Save to' }));
  const pageSelect = el('select', { id: 'page-select' });
  pageSelect.appendChild(el('option', { textContent: 'Loading pages...' }));
  picker.appendChild(pageSelect);
  const sectionSelect = el('select', { id: 'section-select' });
  sectionSelect.appendChild(el('option', { textContent: 'Select a page first' }));
  picker.appendChild(sectionSelect);
  noteForm.appendChild(picker);

  // Tags
  const tagsDiv = el('div', { className: 'tags-input' });
  tagsDiv.appendChild(el('input', { type: 'text', id: 'tags-input', placeholder: 'Tags (comma separated)' }));
  noteForm.appendChild(tagsDiv);

  // Actions
  const actions = el('div', { className: 'actions' });
  actions.appendChild(el('button', { className: 'btn-save', id: 'save-btn', textContent: 'Save Note' }));
  noteForm.appendChild(actions);

  const statusDiv = el('div', { id: 'status', className: 'status' });

  const openApp = el('a', { href: 'https://slate.opsapp.co', target: '_blank', className: 'open-app' });
  setTrustedHTML(openApp, 'Open Slate &rarr;');

  app.appendChild(header);
  app.appendChild(noteForm);
  app.appendChild(statusDiv);
  app.appendChild(openApp);

  // Event listeners
  signOutBtn.addEventListener('click', handleSignOut);
  document.getElementById('save-btn').addEventListener('click', handleSave);
  pageSelect.addEventListener('change', handlePageChange);
  textarea.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleSave();
  });

  // Load selected text or pending note
  await loadInitialContent();

  // Load pages
  await loadPages();

  textarea.focus();
}

async function loadInitialContent() {
  const textarea = document.getElementById('note-content');
  const sourceEl = document.getElementById('source-info');

  // Check for pending note from context menu
  const stored = await chrome.storage.local.get('pendingNote');
  if (stored.pendingNote) {
    textarea.value = stored.pendingNote.content;
    if (stored.pendingNote.sourceTitle) {
      sourceEl.textContent = 'From: ' + stored.pendingNote.sourceTitle;
    }
    await chrome.storage.local.remove('pendingNote');
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
      }
    }
  } catch {
    // Content script may not be injected on some pages - that's ok
  }
}

async function loadPages() {
  const pageSelect = document.getElementById('page-select');

  try {
    pages = await getPages();

    if (pages.length === 0) {
      pageSelect.replaceChildren(el('option', { value: '', textContent: 'No pages found' }));
      return;
    }

    pageSelect.replaceChildren();
    for (const p of pages) {
      pageSelect.appendChild(el('option', { value: p.id, textContent: p.name }));
    }

    // Load saved default
    const saved = await chrome.storage.local.get('slate_default_page');
    if (saved.slate_default_page) {
      const exists = pages.find(p => p.id === saved.slate_default_page);
      if (exists) pageSelect.value = saved.slate_default_page;
    }

    handlePageChange();
  } catch (err) {
    pageSelect.replaceChildren(el('option', { value: '', textContent: 'Error loading pages' }));
  }
}

function handlePageChange() {
  const pageSelect = document.getElementById('page-select');
  const sectionSelect = document.getElementById('section-select');
  selectedPageId = pageSelect.value;

  // Save as default
  chrome.storage.local.set({ slate_default_page: selectedPageId });

  const page = pages.find(p => p.id === selectedPageId);
  if (!page?.sections?.length) {
    sectionSelect.replaceChildren(el('option', { value: '', textContent: 'No sections' }));
    selectedSectionId = null;
    return;
  }

  // Sort sections by position
  const sections = [...page.sections].sort((a, b) => (a.position || 0) - (b.position || 0));
  sectionSelect.replaceChildren();
  for (const s of sections) {
    sectionSelect.appendChild(el('option', { value: s.id, textContent: s.name }));
  }

  // Load saved default section
  chrome.storage.local.get('slate_default_section').then(saved => {
    if (saved.slate_default_section) {
      const exists = sections.find(s => s.id === saved.slate_default_section);
      if (exists) sectionSelect.value = saved.slate_default_section;
    }
    selectedSectionId = sectionSelect.value;
  });

  sectionSelect.addEventListener('change', () => {
    selectedSectionId = sectionSelect.value;
    chrome.storage.local.set({ slate_default_section: selectedSectionId });
  });
}

async function handleSave() {
  const content = document.getElementById('note-content').value.trim();
  const tagsRaw = document.getElementById('tags-input').value.trim();
  const statusEl = document.getElementById('status');
  const btn = document.getElementById('save-btn');
  const sectionId = document.getElementById('section-select').value;

  if (!content) {
    statusEl.textContent = 'Please enter some text';
    statusEl.className = 'status error';
    return;
  }

  if (!sectionId) {
    statusEl.textContent = 'Please select a page and section';
    statusEl.className = 'status error';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Saving...';
  statusEl.textContent = '';

  const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : [];

  try {
    await createNote(sectionId, content, tags);
    statusEl.textContent = 'Saved!';
    statusEl.className = 'status success';
    document.getElementById('note-content').value = '';
    document.getElementById('tags-input').value = '';
    btn.textContent = 'Save Note';
    btn.disabled = false;

    // Auto-close after short delay
    setTimeout(() => window.close(), 1200);
  } catch (err) {
    statusEl.textContent = err.message;
    statusEl.className = 'status error';
    btn.textContent = 'Save Note';
    btn.disabled = false;
  }
}

async function handleSignOut() {
  await clearSession();
  showSignIn();
}

// Start
init();
