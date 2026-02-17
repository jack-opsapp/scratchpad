// Slate Chrome Extension - Popup UI Logic

const app = document.getElementById('app');
let pages = [];
let selectedPageId = null;
let selectedSectionId = null;

// Initialize popup
async function init() {
  const session = await getSession();
  if (session?.access_token) {
    await showNoteForm();
  } else {
    showSignIn();
  }
}

// Sign in view
function showSignIn() {
  app.innerHTML = `
    <div class="header">
      <h1>Slate</h1>
    </div>
    <div class="sign-in">
      <p>Sign in to your Slate account to save notes from any webpage.</p>
      <input type="email" id="email" placeholder="Email" autocomplete="email" />
      <input type="password" id="password" placeholder="Password" autocomplete="current-password" />
      <button id="sign-in-btn">Sign In</button>
      <div id="error" class="error"></div>
    </div>
  `;

  document.getElementById('sign-in-btn').addEventListener('click', handleSignIn);
  document.getElementById('password').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleSignIn();
  });
  document.getElementById('email').focus();
}

async function handleSignIn() {
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const errorEl = document.getElementById('error');
  const btn = document.getElementById('sign-in-btn');

  if (!email || !password) {
    errorEl.textContent = 'Please enter email and password';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Signing in...';
  errorEl.textContent = '';

  try {
    await signIn(email, password);
    await showNoteForm();
  } catch (err) {
    errorEl.textContent = err.message;
    btn.disabled = false;
    btn.textContent = 'Sign In';
  }
}

// Note form view
async function showNoteForm() {
  const session = await getSession();

  app.innerHTML = `
    <div class="header">
      <h1>Slate</h1>
      <button class="sign-out" id="sign-out-btn">Sign Out</button>
    </div>
    <div class="note-form">
      <textarea id="note-content" placeholder="Type a note or select text on any page..." rows="3"></textarea>
      <div id="source-info" class="source"></div>
      <div class="picker">
        <label>Save to</label>
        <select id="page-select"><option>Loading pages...</option></select>
        <select id="section-select"><option>Select a page first</option></select>
      </div>
      <div class="tags-input">
        <input type="text" id="tags-input" placeholder="Tags (comma separated)" />
      </div>
      <div class="actions">
        <button class="btn-save" id="save-btn">Save Note</button>
      </div>
    </div>
    <div id="status" class="status"></div>
    <a href="https://scratchpad.jackwillis.io" target="_blank" class="open-app">Open Slate →</a>
  `;

  document.getElementById('sign-out-btn').addEventListener('click', handleSignOut);
  document.getElementById('save-btn').addEventListener('click', handleSave);
  document.getElementById('page-select').addEventListener('change', handlePageChange);
  document.getElementById('note-content').addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleSave();
  });

  // Load selected text or pending note
  await loadInitialContent();

  // Load pages
  await loadPages();

  document.getElementById('note-content').focus();
}

async function loadInitialContent() {
  const textarea = document.getElementById('note-content');
  const sourceEl = document.getElementById('source-info');

  // Check for pending note from context menu
  const stored = await chrome.storage.local.get('pendingNote');
  if (stored.pendingNote) {
    textarea.value = stored.pendingNote.content;
    if (stored.pendingNote.sourceTitle) {
      sourceEl.textContent = `From: ${stored.pendingNote.sourceTitle}`;
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
        sourceEl.textContent = `From: ${response.title || response.url}`;
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
      pageSelect.innerHTML = '<option value="">No pages found</option>';
      return;
    }

    pageSelect.innerHTML = pages.map(p =>
      `<option value="${p.id}">${p.name}</option>`
    ).join('');

    // Load saved default
    const saved = await chrome.storage.local.get('slate_default_page');
    if (saved.slate_default_page) {
      const exists = pages.find(p => p.id === saved.slate_default_page);
      if (exists) pageSelect.value = saved.slate_default_page;
    }

    handlePageChange();
  } catch (err) {
    pageSelect.innerHTML = `<option value="">Error loading pages</option>`;
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
    sectionSelect.innerHTML = '<option value="">No sections</option>';
    selectedSectionId = null;
    return;
  }

  // Sort sections by position
  const sections = [...page.sections].sort((a, b) => (a.position || 0) - (b.position || 0));
  sectionSelect.innerHTML = sections.map(s =>
    `<option value="${s.id}">${s.name}</option>`
  ).join('');

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
