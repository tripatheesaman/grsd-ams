(function() {
  if (window.nacExtensionInjected) return;
  window.nacExtensionInjected = true;

  function scrapeTableData() {
    const tables = document.querySelectorAll('table');
    if (tables.length === 0) {
      return { error: 'No tables found on this page' };
    }

    const results = [];
    tables.forEach((table, idx) => {
      const rows = Array.from(table.querySelectorAll('tr'));
      if (rows.length === 0) return;

      const headers = Array.from(rows[0].querySelectorAll('th, td')).map(cell => 
        cell.textContent.trim()
      );

      const data = rows.slice(1).map(row => {
        const cells = Array.from(row.querySelectorAll('td'));
        const rowData = {};
        cells.forEach((cell, i) => {
          const header = headers[i] || `Column${i + 1}`;
          rowData[header] = cell.textContent.trim();
        });
        return rowData;
      });

      if (data.length > 0) {
        results.push({
          tableIndex: idx,
          headers: headers,
          data: data,
          rowCount: data.length
        });
      }
    });

    if (results.length === 0) {
      return { error: 'No data found in tables' };
    }

    return { success: true, tables: results };
  }

  function highlightTable(table) {
    table.style.outline = '3px solid #d32c3c';
    table.style.outlineOffset = '2px';
    setTimeout(() => {
      table.style.outline = '';
      table.style.outlineOffset = '';
    }, 2000);
  }

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'scrape') {
      const result = scrapeTableData();
      if (result.success && result.tables.length > 0) {
        result.tables.forEach((t, idx) => {
          const tables = document.querySelectorAll('table');
          if (tables[idx]) highlightTable(tables[idx]);
        });
      }
      sendResponse(result);
      return true;
    }
    return false;
  });

  const indicator = document.createElement('div');
  indicator.id = 'nac-extension-indicator';
  indicator.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: linear-gradient(135deg, #d32c3c, #ea4b5a);
    color: white;
    padding: 8px 16px;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 600;
    z-index: 999999;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    display: none;
  `;
  indicator.textContent = 'NAC Extension Active';
  document.body.appendChild(indicator);

  chrome.storage.local.get(['nacApiUrl'], (result) => {
    if (result.nacApiUrl) {
      indicator.style.display = 'block';
      setTimeout(() => {
        indicator.style.display = 'none';
      }, 3000);
    }
  });
})();
