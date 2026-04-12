# Nepal Airlines Attendance Sync Extension

## Installation

1. Download the extension ZIP file from the NAC app
2. Extract the ZIP file to a folder
3. Open Chrome/Edge and navigate to `chrome://extensions` or `edge://extensions`
4. Enable "Developer mode" (toggle in top-right corner)
5. Click "Load unpacked" and select the extracted extension folder
6. The extension icon should appear in your browser toolbar

## Usage

1. Open the external system in a browser tab
2. Navigate to the page containing the attendance data table
3. Click the extension icon in your browser toolbar
4. Enter your NAC app URL (if not already saved) and click "Save URL"
5. Click "Sync This Page" to scrape and send data to NAC
6. The extension will highlight the tables it finds and send them to your NAC app

## How It Works

- The extension injects a content script into web pages
- When you click "Sync This Page", it finds all `<table>` elements
- It extracts headers and data rows from each table
- The data is sent to your NAC app's API endpoint
- Your NAC app converts it to Excel format and processes it like a manual upload
