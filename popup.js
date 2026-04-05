async function sendToTab(action) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { action });
  } catch (e) {
    // Content script not yet injected (e.g. chrome:// pages) — fail silently
  }
}

document.getElementById('btn-activate').addEventListener('click', async () => {
  await sendToTab('togglePickMode');
  window.close();
});

document.getElementById('btn-show-all').addEventListener('click', async () => {
  await sendToTab('showAll');
  window.close();
});
