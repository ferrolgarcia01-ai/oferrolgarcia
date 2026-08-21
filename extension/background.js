chrome.runtime.onInstalled.addListener(() => {
  console.log('Ferrol AI Developer instalado');
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'OPEN_TAB' && message.url) {
    chrome.tabs.create({ url: message.url });
    sendResponse({ ok: true });
  }
  return true;
});
