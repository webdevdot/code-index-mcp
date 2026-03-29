# Multiple Folders Indexing & Start Indexing Button

## Overview

The Code Index Dashboard now supports indexing **multiple project folders** and includes a **"Start Indexing" button** in the web UI to trigger indexing from the dashboard.

## Features

### 1. Multiple Project Folders Support

**Configuration:**
- Add multiple folders in the `.env` file under `PROJECT_FOLDERS`
- Folders should be comma-separated absolute paths
- Optionally configure via the Settings tab in the dashboard

**Example .env:**
```env
PROJECT_FOLDERS=/Users/hardik/Developer/project1,/Users/hardik/Developer/project2,/Users/hardik/Developer/project3
```

**Example Settings Tab:**
```
/Users/hardik/Developer/project1
/Users/hardik/Developer/project2
/Users/hardik/Developer/project3
```

### 2. Start Indexing Button

**Web Dashboard Features:**
- **Reindex All button** - Reindex the configured MCP folder
- **Index Folder button** - Open a modal to select any folder to index
- **Live Progress** - Shows indexing status with spinner

**How to Use:**
1. Click "📁 Index Folder" button in the Overview tab
2. Enter the folder path (absolute or relative)
3. Click "Start Indexing"
4. Monitor the progress

### 3. Configuration Options

**Environment Variables:**

```env
# Multiple project folders to index (comma-separated)
PROJECT_FOLDERS=/path/to/project1,/path/to/project2

# Enable the indexing button in web UI
ENABLE_INDEXING_BUTTON=true
```

**Via Dashboard Settings:**
- Textarea field for entering multiple folder paths
- One path per line
- Supports both absolute and relative paths

## API Endpoints

### New Endpoints

**GET /api/folders**
- Returns list of configured project folders
- Response:
```json
{
  "folders": ["/path1", "/path2"],
  "enableIndexing": true
}
```

**POST /api/index**
- Trigger indexing for a specific folder
- Request:
```json
{
  "folderPath": "/path/to/project"
}
```
- Response:
```json
{
  "success": true,
  "message": "Indexing started for /path/to/project",
  "folder": "/path/to/project",
  "startedAt": "2026-03-29T18:00:00.000Z"
}
```

## UI Components

### New Dashboard Elements

1. **Indexing Section**
   - Last Indexed timestamp
   - "🔄 Reindex All" button
   - "📁 Index Folder" button

2. **Folder Modal**
   - Input field for folder path
   - Status indicator during indexing
   - Start/Cancel buttons

3. **Settings Tab**
   - Project Folders textarea
   - Multiple paths, one per line
   - Save and reset options

## Files Modified/Created

**Modified:**
- `mcp/server.js` - Added new API routes
- `web/index.html` - Added button and modal
- `web/styles.css` - Added modal and animation styles
- `web/app.js` - Added indexing functions
- `api/dashboard.js` - Added indexing logic
- `config/loader.js` - Added project folders config
- `.env` - Added new config options
- `.env.example` - Updated with examples

**New:**
- `MULTIPLE_FOLDERS.md` - This guide

## Usage Examples

### Command Line

```bash
# Start dashboard
code-index-dashboard

# View configured folders
code-index stats

# Search across all indexed folders
code-index search "function name"
```

### Web Dashboard

```
1. Open http://localhost:34244/dashboard
2. Click "📁 Index Folder" button
3. Enter path: /Users/hardik/Developer/my-project
4. Click "Start Indexing"
5. Wait for completion
6. View results in Overview tab
```

### Settings Configuration

```
1. Click Settings tab
2. Scroll to "Project Folders to Index" section
3. Add paths (one per line):
   /Users/hardik/Developer/project1
   /Users/hardik/Developer/project2
4. Click "Save Configuration"
```

## How It Works

### Indexing Process

1. User clicks "Index Folder" button
2. Modal opens for path input
3. User enters folder path and clicks "Start Indexing"
4. Frontend sends POST request to `/api/index`
5. Backend validates folder path
6. Indexer instance created for the folder
7. Async indexing started in background
8. Dashboard updated with results

### Configuration Management

1. Folders stored in `PROJECT_FOLDERS` env variable
2. Loaded by config/loader.js
3. Accessible via `/api/folders` endpoint
4. Updatable via Settings form
5. Persisted to .env file

### Database

- **Single database** for all indexed folders
- Database tracks file paths across all folders
- Symbols and imports organized by file
- Full-text search works across all indexed files

## Features

✅ Index multiple project folders
✅ Start indexing from web UI
✅ Real-time progress indication
✅ Configure folders in settings
✅ Store configuration in .env
✅ API endpoints for automation
✅ Modal for folder selection
✅ Status spinners during indexing
✅ Support for absolute and relative paths
✅ Path validation

## Limitations

- Indexing happens asynchronously (non-blocking)
- Folder paths must exist and be readable
- Single database for all folders
- No indexing history tracking (yet)
- No folder-specific statistics (yet)

## Future Enhancements

- [ ] Folder-specific statistics
- [ ] Indexing history and logs
- [ ] Scheduled indexing
- [ ] Progress percentage display
- [ ] Index status for each folder
- [ ] Folder organization in UI
- [ ] Selective folder search
- [ ] Folder-wise export

## Troubleshooting

### Folder not indexing
- Check path exists: `ls -la /path/to/folder`
- Check permissions: `ls -ld /path/to/folder`
- Check disk space: `df -h`

### Changes not showing
- Wait for indexing to complete
- Click "Reindex All" to force refresh
- Check database connection

### Configuration not saving
- Ensure .env file is writable: `chmod 644 .env`
- Check dashboard output for errors
- Restart dashboard server

## Security Notes

- Only index trusted folders
- Dashboard should be behind authentication in production
- File paths are logged in console
- No encryption of configuration file

---

**Updated:** 2026-03-29
**Version:** 1.1.0
