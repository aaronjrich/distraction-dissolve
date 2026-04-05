// Background service worker
// Handles toolbar icon click as an alternative to popup
// (Currently the popup handles activation, but this is here for future use
// e.g. keyboard shortcut command support)

chrome.runtime.onInstalled.addListener(() => {
  console.log('Dissolve extension installed.');
});
