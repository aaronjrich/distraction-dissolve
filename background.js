// Background service worker
// Handles toolbar icon click to toggle pick mode directly on the active tab.

chrome.runtime.onInstalled.addListener(() => {
  console.log('Dissolve extension installed.');
});

// Tabs that were already open when the extension was installed or updated have no
// content script until they reload. Inject it on demand, then pass the click on.
async function togglePickMode(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { action: 'togglePickMode' });
    return true;
  } catch (e) {
    // No content script in this tab yet: fall through and inject it
  }
  try {
    await chrome.scripting.insertCSS({ target: { tabId }, files: ['dissolve.css'] });
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    await chrome.tabs.sendMessage(tabId, { action: 'togglePickMode' });
    return true;
  } catch (e) {
    // Pages the browser does not let extensions touch (edge://, the add-ons store)
    return false;
  }
}

// Show a short "!" on the icon when Dissolve cannot run on the current page
function signalUnavailable(tabId) {
  chrome.action.setBadgeBackgroundColor({ tabId, color: '#d9534f' });
  chrome.action.setBadgeText({ tabId, text: '!' });
  chrome.action.setTitle({ tabId, title: "Dissolve can't run on this page" });
  setTimeout(() => {
    chrome.action.setBadgeText({ tabId, text: '' });
    chrome.action.setTitle({ tabId, title: 'Dissolve — Hide Distracting Items' });
  }, 3000);
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  if (!(await togglePickMode(tab.id))) signalUnavailable(tab.id);
});

// The dissolve effects animate the element's real pixels, so the content
// script asks for a screenshot of the visible tab and crops it itself.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'openPractice') {
    chrome.tabs.create({ url: chrome.runtime.getURL('practice.html') });
    return;
  }
  if (msg.action !== 'captureTab' || !sender.tab) return;
  chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: 'png' })
    .then(url => sendResponse({ url }))
    .catch(e => sendResponse({ error: String(e) }));
  return true; // reply is asynchronous
});
