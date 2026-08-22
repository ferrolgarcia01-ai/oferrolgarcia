import './background.js';

async function configurePrimaryUi() {
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
  } catch {}
}

configurePrimaryUi();
chrome.runtime.onInstalled.addListener(configurePrimaryUi);
chrome.runtime.onStartup.addListener(configurePrimaryUi);

chrome.action.onClicked.addListener(async (tab) => {
  try {
    if (tab?.id && /^https:\/\/lovable\.dev\//i.test(tab.url || '')) {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const bubble = document.getElementById('fg-ai-bubble');
          if (bubble) {
            bubble.click();
            return;
          }
          window.dispatchEvent(new CustomEvent('fg-ai-open-request'));
        },
      });
      return;
    }

    if (tab?.windowId) {
      await chrome.sidePanel.open({ windowId: tab.windowId });
    }
  } catch (error) {
    console.warn('FG AI action', error);
  }
});
