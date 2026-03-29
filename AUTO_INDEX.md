# Auto-Index Feature

## Overview

The MCP server now automatically indexes your project files when it starts up. This ensures that the code search database is always up-to-date whenever the server is launched.

## How It Works

When the MCP server (`mcp/server.js`) starts in HTTP or stdio mode:

1. **Database Initialization** - SQLite database is prepared
2. **Auto-Indexing** - The project directory is scanned and all supported files are indexed
3. **Server Ready** - Once indexing completes, the server starts listening for requests

### Startup Flow

```
Server Start
    ↓
Initialize Database
    ↓
Auto-Index Project (unless SKIP_AUTO_INDEX=true)
    ├─ Scan files
    ├─ Parse symbols and imports
    └─ Update database
    ↓
Start HTTP/stdio Server
    ↓
Ready for Requests
```

## Configuration

### Enable Auto-Indexing (Default)

Simply start the server normally:

```bash
node mcp/server.js http 34244
npm run server
npm run dev
npm run dashboard
```

### Disable Auto-Indexing

Set the `SKIP_AUTO_INDEX` environment variable:

```bash
SKIP_AUTO_INDEX=true node mcp/server.js http 34244
SKIP_AUTO_INDEX=true npm run server
```

This is useful when:
- You want faster server startup
- You've already indexed and don't need a fresh index
- You're using the watcher for continuous indexing

## Stdio Mode (Claude MCP)

Auto-indexing also works in stdio mode, which is used when the server is connected via Claude's MCP protocol:

```bash
node mcp/server.js
npm run server
```

The server will:
1. Auto-index the project
2. Connect via stdio
3. Be ready to handle MCP calls

## Sample Output

```
🚀 Code Index MCP Server

🔄 Starting auto-indexing...
✓ Database initialized at /Users/hardik/Developer/code_index/code-index.db
🔍 Scanning project for files...
📁 Found 14 files to index
⏳ Indexing batch 1/1

📊 Indexing Summary:
   Indexed: 14
   Skipped: 0
   Failed: 0
   Total Symbols: 204
   Total Imports: 53
   Database: /Users/hardik/Developer/code_index/code-index.db
✓ Auto-indexing completed successfully

📡 HTTP Server running on http://localhost:34244
   🎨 Dashboard: http://localhost:34244/dashboard
   📊 API: http://localhost:34244/api
   POST /mcp - MCP JSON-RPC endpoint
   GET /health - Health check
```

## Integration with Claude MCP

When you connect to this MCP server via Claude:

1. The server starts
2. Auto-indexing begins immediately
3. By the time Claude receives the MCP connection, your project is already indexed
4. You can immediately use code search tools

## Performance Notes

- **Initial startup**: Includes indexing time (typically 1-5 seconds for small projects)
- **Cached startup**: If you skip auto-indexing with `SKIP_AUTO_INDEX=true`, startup is instant
- **Database persists**: Once indexed, the database is saved to disk and reused across restarts
- **Clean slate**: Use `npm run clean` to remove the database and force fresh indexing

## Troubleshooting

### Auto-indexing takes too long
- Use `SKIP_AUTO_INDEX=true` for faster startup
- Use the watcher mode (`npm run watch`) for continuous indexing
- Check for large files or excluded patterns

### Search results are stale
- Restart the server to trigger fresh indexing
- Use `npm run watch` for continuous updates
- Use the dashboard to manually trigger indexing

### Port already in use
- Kill any existing server: `pkill -f "node mcp/server.js"`
- Use a different port: `node mcp/server.js http 34245`
