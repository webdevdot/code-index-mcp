# Code Index MCP - Production-Ready Code Indexing & Search

A powerful, production-ready **Model Context Protocol (MCP)** server for fast code indexing and intelligent search across multi-language codebases. Built with Node.js, SQLite + FTS5, and designed for high performance.

## ✨ Features

- **🔍 Full-Text Search** - Fast content search across all files using SQLite FTS5
- **🎯 Symbol Lookup** - Find functions, classes, variables, and their definitions
- **📊 Code Context** - Intelligent ranking combining file matches and symbol search
- **👁️ File Watching** - Automatic re-indexing on file changes
- **🚀 Multi-Language Support** - JavaScript/TypeScript, Python, PHP (extensible)
- **⚡ Performance Optimized** - Batch inserts, prepared statements, proper indexing
- **🏗️ Structured Output** - Clean JSON responses for integration
- **📈 Scalable** - Handles 10,000+ files efficiently

## 📋 Tech Stack

- **Runtime**: Node.js (ESM)
- **Database**: SQLite with FTS5 + WAL mode
- **Parsing**:
  - JavaScript/TypeScript: @babel/parser (full AST)
  - Python: Regex-based extraction
  - PHP: Regex-based extraction
- **File Watching**: chokidar
- **MCP**: @modelcontextprotocol/sdk
- **HTTP**: Express (optional alternative server)

## 🚀 Quick Start

### 1. Installation

```bash
cd code-index-mcp
npm install
```

### 2. Index Your Project

```bash
npm run index /path/to/your/project
```

Or from the project directory:
```bash
npm run index
```

**Options:**
- `-v` or `--verbose` - Show all indexed files
- `--clear` - Clear the index before indexing

**Example with verbose output:**
```bash
npm run index /path/to/project -v
```

### 3. Start the MCP Server

```bash
npm run server
```

The server will start in stdio mode (compatible with Claude Code).

**Alternative: HTTP mode**
```bash
node mcp/server.js http 3000
```

Server will be available at `http://localhost:3000/mcp`

### 4. (Optional) Start File Watcher

In another terminal:
```bash
npm run watch /path/to/your/project
```

The watcher will automatically re-index files as they change.

## 🔧 Database Commands

Check index statistics:
```bash
npm run index stats
```

Clear the entire index:
```bash
npm run index clear
```

## 📡 MCP Tools

The server exposes 8 powerful tools:

### 1. `search_code`
Full-text search across all indexed file content.

**Input:**
```json
{
  "query": "function handleClick",
  "limit": 20
}
```

**Output:**
```json
[
  {
    "path": "src/components/Button.tsx",
    "language": "typescript",
    "snippet": "function handleClick(event) {\n  // handle click\n}",
    "content_length": 1024
  }
]
```

### 2. `find_symbol`
Find symbol definitions (functions, classes, variables) by name.

**Input:**
```json
{
  "name": "handleClick",
  "limit": 50
}
```

**Output:**
```json
[
  {
    "name": "handleClick",
    "type": "function",
    "path": "src/components/Button.tsx",
    "language": "typescript",
    "line": 45,
    "column": 10,
    "scope": "Button"
  }
]
```

### 3. `get_file`
Retrieve full file content with line numbers.

**Input:**
```json
{
  "path": "src/main.js"
}
```

**Output:**
```json
{
  "path": "src/main.js",
  "language": "javascript",
  "size": 2048,
  "lines": 100,
  "content": [
    { "line_number": 1, "content": "import React from 'react'" },
    { "line_number": 2, "content": "" }
  ]
}
```

### 4. `get_context`
Get comprehensive context combining file and symbol matches.

**Input:**
```json
{
  "query": "authentication handler",
  "limit": 30
}
```

**Output:**
```json
{
  "query": "authentication handler",
  "result_count": 5,
  "results": [
    {
      "type": "file_match",
      "path": "src/auth/handler.ts",
      "language": "typescript",
      "snippet": "export function authenticateUser(credentials) { ... }"
    },
    {
      "type": "symbol_match",
      "name": "authenticateUser",
      "symbol_type": "function",
      "path": "src/auth/handler.ts",
      "language": "typescript",
      "line": 42,
      "scope": null
    }
  ]
}
```

### 5. `get_stats`
Get database statistics.

**Output:**
```json
{
  "indexed_files": 1250,
  "total_symbols": 8500,
  "total_imports": 3200,
  "database_size_mb": "25.5"
}
```

### 6. `list_files`
List all indexed files with optional language filter.

**Input:**
```json
{
  "language": "typescript",
  "limit": 100
}
```

**Output:**
```json
{
  "count": 50,
  "files": [
    {
      "path": "src/components/Button.tsx",
      "language": "typescript",
      "file_size": 2048
    }
  ]
}
```

### 7. `get_imports`
Get all imports from a specific file.

**Input:**
```json
{
  "path": "src/main.ts"
}
```

**Output:**
```json
{
  "path": "src/main.ts",
  "import_count": 12,
  "imports": [
    {
      "import_path": "react",
      "import_name": "React",
      "import_type": "import"
    }
  ]
}
```

### 8. `get_dependents`
Find files that import or depend on a specific file.

**Input:**
```json
{
  "path": "src/utils/helpers.ts",
  "limit": 50
}
```

**Output:**
```json
{
  "target_path": "src/utils/helpers.ts",
  "dependent_count": 8,
  "dependents": [
    {
      "path": "src/components/Button.tsx",
      "language": "typescript",
      "import_name": "{ formatDate }"
    }
  ]
}
```

## 🧪 Testing

### Using curl (HTTP mode)

Start server in HTTP mode:
```bash
node mcp/server.js http 3000
```

Test search:
```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "search_code",
      "arguments": {
        "query": "function",
        "limit": 10
      }
    }
  }'
```

Test symbol search:
```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "find_symbol",
      "arguments": {
        "name": "handleClick"
      }
    }
  }'
```

Get stats:
```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "get_stats",
      "arguments": {}
    }
  }'
```

### With Claude Code

The MCP server is fully compatible with Claude Code. To use with Claude Code:

1. **Configure Claude Code** to connect to this MCP server
2. **Run the server** in stdio mode: `npm run server`
3. **Claude** will have access to all code search tools

## 📊 Database Schema

### files
Metadata about indexed files:
- `id` - Primary key
- `path` - Unique file path (relative)
- `language` - Programming language
- `last_modified` - Unix timestamp
- `file_size` - File size in bytes

### file_index (FTS5)
Full-text search index of file contents:
- `content` - File content
- `path` - File path
- `file_id` - Reference to files table

### symbols
Extracted code symbols:
- `id` - Primary key
- `file_id` - Reference to file
- `name` - Symbol name
- `type` - Type (function, class, variable, method, etc.)
- `line` - Line number
- `column` - Column number
- `scope` - Parent scope (e.g., class name)

### imports
Import/require statements:
- `id` - Primary key
- `file_id` - Reference to file
- `import_path` - Path being imported
- `import_name` - Name imported as
- `import_type` - Type (import, require, use, etc.)

## ⚙️ Performance Optimizations

1. **FTS5 Tokenizer** - Optimized for code search patterns
2. **Prepared Statements** - All queries use prepared statements
3. **Batch Inserts** - Processes 100 files per batch
4. **WAL Mode** - SQLite write-ahead logging for concurrency
5. **Proper Indexing** - Indexes on frequently queried columns
6. **File Exclusion** - Skips node_modules, .git, build folders
7. **Modification Checks** - Only re-indexes changed files

## 🔮 Advanced Features

### Extensibility

The system is designed to be extended with:

1. **Vector Embeddings** - Add semantic search with embeddings
   - Store embeddings in a new `embeddings` table
   - Use vector similarity search

2. **Dependency Graph** - Build a full dependency graph
   - Add `dependencies` table tracking imports
   - Query transitive dependencies

3. **AI Summarization** - Automatic code summarization
   - Summarize functions/classes
   - Generate documentation

4. **Language Support** - Easy to add new languages
   - Implement parser in `indexer/parser.js`
   - Add to `detectLanguage` mapping

### Example: Adding Vector Search

```javascript
// Add embeddings table
CREATE TABLE embeddings (
  id INTEGER PRIMARY KEY,
  symbol_id INTEGER,
  embedding BLOB,
  FOREIGN KEY (symbol_id) REFERENCES symbols(id)
);

// Query by similarity
SELECT symbols.* FROM symbols
WHERE symbol_id IN (
  SELECT symbol_id FROM embeddings
  WHERE vector_similarity(embedding, query_embedding) > 0.8
);
```

## 📁 Project Structure

```
code-index-mcp/
├── db/
│   └── schema.sql           # Database schema
├── indexer/
│   ├── indexer.js           # Main indexing engine
│   └── parser.js            # AST parsers (JS, Python, PHP)
├── mcp/
│   ├── server.js            # MCP server (stdio & HTTP)
│   └── tools.js             # Tool implementations
├── watcher/
│   └── watcher.js           # File watcher with debouncing
├── utils/
│   └── file.js              # File utilities
├── package.json
└── README.md
```

## 🚨 Troubleshooting

### Database file not found
```bash
# Verify the database was created
ls -la code-index.db

# Recreate from scratch
npm run clean && npm run index
```

### No results from search
1. Ensure files were indexed: `npm run index stats`
2. Check file was indexed with correct language
3. Try different search terms

### Watcher not detecting changes
1. Ensure watcher is running: `npm run watch`
2. Check file is in supported language (.js, .ts, .py, .php)
3. Verify file is not in excluded directory (node_modules, .git, etc.)

### Performance issues with large codebase
1. Increase batch size in `indexer.js`
2. Use SQLite pragma optimizations (already configured)
3. Consider filtering to specific directories in glob patterns

## 📜 License

MIT

## 🤝 Contributing

This is a complete, production-ready implementation. Feel free to extend it with:
- Additional language parsers
- Vector embeddings
- Dependency graph analysis
- Custom indexing strategies

## 📞 Support

For issues or questions:
1. Check the troubleshooting section
2. Review the database schema in `db/schema.sql`
3. Check MCP tool documentation above
