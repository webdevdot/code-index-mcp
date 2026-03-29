# Code Index MCP - Quick Start Guide

Get up and running with the Code Index MCP server in 5 minutes.

## Prerequisites

- Node.js 18+
- npm or yarn
- A codebase to index (JavaScript, TypeScript, Python, or PHP)

## Installation

1. **Install dependencies**
   ```bash
   npm install
   ```

   This installs:
   - `@modelcontextprotocol/sdk` - MCP protocol support
   - `better-sqlite3` - High-performance SQLite driver
   - `@babel/parser` - JavaScript/TypeScript parsing
   - `chokidar` - File watching
   - `fast-glob` - Fast file globbing
   - `express` - Optional HTTP server

## Step 1: Index Your Project

Index a local codebase:

```bash
# Index current directory
npm run index

# Index a specific directory
npm run index /path/to/project

# Verbose output (shows all files)
npm run index /path/to/project -v
```

**What happens:**
- Scans all `.js`, `.ts`, `.tsx`, `.py`, `.php` files
- Skips `node_modules`, `.git`, `dist`, `build`, etc.
- Extracts symbols (functions, classes, variables)
- Parses imports/requires
- Stores everything in `code-index.db`
- Creates FTS5 index for fast search

**Example output:**
```
🚀 Code Index - SQLite Indexer

📂 Project Root: /Users/me/myproject
💾 Database: /Users/me/Developer/code_index/code-index.db

🔍 Scanning project for files...
📁 Found 1,250 files to index
⏳ Indexing batch 1/13
⏳ Indexing batch 2/13
...

📊 Indexing Summary:
   Indexed: 1,250
   Skipped: 0
   Failed: 0
   Total Symbols: 8,500
   Total Imports: 3,200
   Database: /Users/me/Developer/code_index/code-index.db
```

## Step 2: Check Index Stats

View what was indexed:

```bash
npm run index stats
```

Example output:
```
📈 Database Statistics:
   Files: 1,250
   Symbols: 8,500
   Imports: 3,200
   Size: 25.50 MB
```

## Step 3: Start the Server

### Option A: MCP Mode (Default - for Claude Code)

```bash
npm run server
```

The server starts in stdio mode, ready for MCP connections.

### Option B: HTTP Mode (for testing)

```bash
node mcp/server.js http 3000
```

Server available at `http://localhost:3000`

## Step 4: Use the Tools

### A. With Claude Code

The MCP server is ready to use with Claude Code. Tools are automatically available.

### B. With curl (HTTP mode)

Search for code:
```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "search_code",
      "arguments": {"query": "handleClick", "limit": 10}
    }
  }'
```

Find a symbol:
```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "find_symbol",
      "arguments": {"name": "useState"}
    }
  }'
```

Get file content:
```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "get_file",
      "arguments": {"path": "src/App.js"}
    }
  }'
```

Get database stats:
```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 4,
    "method": "tools/call",
    "params": {
      "name": "get_stats",
      "arguments": {}
    }
  }'
```

## Step 5: (Optional) Start Auto-Indexing

In another terminal, watch for file changes:

```bash
npm run watch /path/to/project
```

The watcher will automatically re-index files as they change (with 1 second debounce).

**Example output:**
```
🚀 Code Index - File Watcher

📂 Project Root: /Users/me/myproject
💾 Database: /Users/me/Developer/code_index/code-index.db

👀 File watcher started

📂 Watching: /Users/me/myproject
Press Ctrl+C to stop

⏳ Processing 3 pending update(s)...
  ✓ add src/components/NewButton.tsx
  ✓ ✏️  src/utils/helpers.js
  🗑️  Removed src/old/deprecated.py
✓ Updates complete
```

## Example Workflows

### 1. Find all function definitions

```bash
curl -X POST http://localhost:3000/mcp \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call",
       "params":{"name":"find_symbol","arguments":{"name":"function","limit":100}}}'
```

### 2. Search for error handling patterns

```bash
curl -X POST http://localhost:3000/mcp \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call",
       "params":{"name":"search_code","arguments":{"query":"try catch error","limit":20}}}'
```

### 3. Find all files that import React

```bash
curl -X POST http://localhost:3000/mcp \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call",
       "params":{"name":"search_code","arguments":{"query":"from react import","limit":50}}}'
```

### 4. Get context around authentication

```bash
curl -X POST http://localhost:3000/mcp \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call",
       "params":{"name":"get_context","arguments":{"query":"authentication handler","limit":30}}}'
```

### 5. Find files that depend on a utility

```bash
curl -X POST http://localhost:3000/mcp \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call",
       "params":{"name":"get_dependents","arguments":{"path":"src/utils/helpers.ts","limit":50}}}'
```

## Database Management

### Clear the entire index

```bash
npm run index clear
```

### Start fresh

```bash
npm run clean     # Remove database file
npm run index     # Re-index from scratch
```

## Troubleshooting

### "command not found: npm run index"

Make sure you're in the project directory:
```bash
cd /path/to/code-index-mcp
npm run index
```

### No results from search

1. Check stats: `npm run index stats`
2. Verify files were indexed
3. Try different search terms (search is case-insensitive but query-specific)

### File watcher not detecting changes

- Ensure watcher is running in another terminal
- Check that file is `.js`, `.ts`, `.py`, or `.php`
- Verify file is not in ignored directory

### "Database file not found"

The database is created automatically on first index:
```bash
npm run index
ls code-index.db
```

### Very slow indexing

On large codebases:
- Index happens in batches of 100 files
- Use `npm run index /specific/dir` to index a subdirectory
- FTS5 will be slower on very large files (>10MB)

## Configuration

### Change database location

Edit `indexer/indexer.js` and `mcp/tools.js`:
```javascript
const DB_PATH = path.join(__dirname, '..', 'custom-location.db');
```

### Exclude more directories

In `indexer/indexer.js`, update the `ignorePatterns`:
```javascript
const ignorePatterns = [
  '**/node_modules/**',
  '**/.git/**',
  // Add your patterns here
];
```

### Change supported languages

In `utils/file.js`, update `detectLanguage()`:
```javascript
const extMap = {
  '.js': 'javascript',
  '.rb': 'ruby',  // Add new mappings
  // ...
};
```

### Add more import types

In `indexer/parser.js`, extend the parsers for your language.

## Performance Tips

1. **Batch operations**: Indexing runs in batches of 100 for memory efficiency
2. **Use specific directories**: Index subdirectories instead of entire project
3. **WAL mode**: Enabled by default for better concurrency
4. **Prepared statements**: All queries use prepared statements
5. **FTS5 index**: Automatically used for full-text search

On a typical machine:
- 1,000 files: ~2-3 seconds
- 10,000 files: ~20-30 seconds
- 100,000 files: ~5-10 minutes

## Next Steps

1. Read [README.md](./README.md) for full documentation
2. Explore the [Database Schema](./db/schema.sql)
3. Check the [Tool Definitions](./mcp/tools.js)
4. Extend the system with embeddings or dependency graphs

## Support

- Check [README.md](./README.md) for detailed documentation
- See individual files for implementation details
- Review database schema for structure
