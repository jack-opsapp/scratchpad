// Content script - listens for messages from the popup to get selected text
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getSelection') {
    const selection = window.getSelection().toString().trim();
    sendResponse({
      text: selection,
      url: window.location.href,
      title: document.title,
    });
  }
  return true;
});
