chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ nacApiUrl: '' });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'scrapeAndSend') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'scrape' }, (response) => {
          if (chrome.runtime.lastError) {
            sendResponse({ error: 'Failed to scrape: ' + chrome.runtime.lastError.message });
            return;
          }
          sendResponse(response);
        });
      } else {
        sendResponse({ error: 'No active tab found' });
      }
    });
    return true;
  }
});
