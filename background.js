// Background service worker
// Handles toolbar icon click to toggle pick mode directly on the active tab.

chrome.runtime.onInstalled.addListener(() => {
  console.log('Dissolve extension installed.');
});

chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id) {
    try {
      await chrome.tabs.sendMessage(tab.id, { action: 'togglePickMode' });
    } catch (e) {
      // Content script not yet injected (e.g. chrome:// pages) — fail silently
    }
  }
});

// The dissolve effects animate the element's real pixels, so the content
// script asks for a screenshot of the visible tab and crops it itself.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action !== 'captureTab' || !sender.tab) return;
  chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: 'png' })
    .then(url => sendResponse({ url }))
    .catch(e => sendResponse({ error: String(e) }));
  return true; // reply is asynchronous
});
