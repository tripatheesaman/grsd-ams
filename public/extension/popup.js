const apiUrlInput = document.getElementById('apiUrl');
const saveBtn = document.getElementById('saveBtn');
const syncBtn = document.getElementById('syncBtn');
const statusDiv = document.getElementById('status');

function showStatus(message, type) {
  statusDiv.textContent = message;
  statusDiv.className = `status ${type}`;
  setTimeout(() => {
    statusDiv.className = 'status';
  }, 5000);
}

chrome.storage.local.get(['nacApiUrl'], (result) => {
  if (result.nacApiUrl) {
    apiUrlInput.value = result.nacApiUrl;
    syncBtn.style.display = 'block';
  }
});

saveBtn.addEventListener('click', () => {
  const url = apiUrlInput.value.trim();
  if (!url) {
    showStatus('Please enter a URL', 'error');
    return;
  }
  
  const baseUrl = url.replace(/\/$/, '');
  chrome.storage.local.set({ nacApiUrl: baseUrl }, () => {
    showStatus('URL saved!', 'success');
    syncBtn.style.display = 'block';
  });
});

syncBtn.addEventListener('click', async () => {
  const { nacApiUrl } = await chrome.storage.local.get(['nacApiUrl']);
  if (!nacApiUrl) {
    showStatus('Please save URL first', 'error');
    return;
  }
  
  syncBtn.disabled = true;
  syncBtn.textContent = 'Syncing...';
  showStatus('Scraping page data...', 'info');
  
  chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    if (!tabs[0]) {
      showStatus('No active tab found', 'error');
      syncBtn.disabled = false;
      syncBtn.textContent = 'Sync This Page';
      return;
    }
    
    try {
      const response = await chrome.tabs.sendMessage(tabs[0].id, { action: 'scrape' });
      
      if (response.error) {
        showStatus(response.error, 'error');
        syncBtn.disabled = false;
        syncBtn.textContent = 'Sync This Page';
        return;
      }
      
      if (!response.success || !response.tables || response.tables.length === 0) {
        showStatus('No data found on this page', 'error');
        syncBtn.disabled = false;
        syncBtn.textContent = 'Sync This Page';
        return;
      }
      
      showStatus('Sending data to NAC...', 'info');
      
      const apiResponse = await fetch(`${nacApiUrl}/api/files/from-extension`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          tables: response.tables,
          sourceUrl: tabs[0].url,
          timestamp: new Date().toISOString()
        })
      });
      
      const data = await apiResponse.json();
      
      if (!apiResponse.ok) {
        showStatus(data.error || 'Sync failed', 'error');
        syncBtn.disabled = false;
        syncBtn.textContent = 'Sync This Page';
        return;
      }
      
      showStatus(`Success! ${data.message || 'Data synced'}`, 'success');
      syncBtn.disabled = false;
      syncBtn.textContent = 'Sync This Page';
      
      if (data.fileId) {
        setTimeout(() => {
          chrome.tabs.create({ url: `${nacApiUrl}/app/files/${data.fileId}` });
        }, 1500);
      }
    } catch (error) {
      showStatus('Error: ' + error.message, 'error');
      syncBtn.disabled = false;
      syncBtn.textContent = 'Sync This Page';
    }
  });
});
