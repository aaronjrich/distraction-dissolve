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
