// Background service worker for Slate Chrome Extension

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
    // Send selected text to popup or save directly
    chrome.storage.local.set({
      pendingNote: {
        content: info.selectionText.trim(),
        sourceUrl: tab.url,
        sourceTitle: tab.title,
        timestamp: Date.now(),
      },
    });
    // Open popup
    chrome.action.openPopup();
  }
});
