# Global Setup - Code Index Dashboard

The Code Index Dashboard is now available as a **global npm package**. You can use it from anywhere in your system without navigating to the project directory.

## Installation

The package is already installed globally at:
```
/Users/hardik/.nvm/versions/node/v22.21.1/lib/code-index-mcp@1.0.0
```

## Global Commands

Three global commands are now available from anywhere:

### 1. `code-index` - CLI Tool
Run dashboard commands from the terminal.

```bash
# Show statistics
code-index stats

# Display configuration
code-index config show

# Update configuration
code-index config set --path=/your/path --port=34244 --db=/path/to/db

# Search code
code-index search "function"

# List indexed files
code-index files 50

# Check server health
code-index health

# Live monitor (updates every 5 seconds)
code-index monitor

# Show help
code-index help
```

### 2. `code-index-server` - Start MCP Server
Start the MCP server for integration with Claude Code.

```bash
# Start on default port 34244
code-index-server

# Start on custom port
code-index-server 8080
```

### 3. `code-index-dashboard` - Start Dashboard
Start the dashboard server with web UI.

```bash
# Start on default port 34244
code-index-dashboard

# Start on custom port
code-index-dashboard 9000
```

## Quick Usage Examples

### From Your Project Directory
```bash
# In any directory, access the dashboard
code-index-dashboard

# Open in browser: http://localhost:34244/dashboard
```

### Check Installation Status
```bash
which code-index
which code-index-server
which code-index-dashboard

npm list -g code-index-mcp
```

### Run Commands From Any Directory
```bash
# Get stats from anywhere
$ cd ~
$ code-index stats

# Search code from anywhere
$ code-index search "handleClick"

# Monitor in real-time from anywhere
$ code-index monitor
```

## Configuration

Configuration is stored in `.env` file at the project root:
```
/Users/hardik/Developer/code_index/.env
```

Update settings:
```bash
# Via CLI
code-index config set --path=/new/path --port=34244

# Via file
Edit /Users/hardik/Developer/code_index/.env
```

## Files Added for Global Setup

```
bin/
├── cli.js           - Executable for 'code-index' command
├── server.js        - Executable for 'code-index-server' command
└── dashboard.js     - Executable for 'code-index-dashboard' command

package.json        - Updated with "bin" field
```

## Uninstall (if needed)

```bash
npm uninstall -g code-index-mcp
```

## Verify Installation

```bash
echo "Checking global installation..."
which code-index && echo "✓ CLI tool installed"
which code-index-server && echo "✓ Server installed"
which code-index-dashboard && echo "✓ Dashboard installed"
```

## Environment Variables

The global commands use the same configuration as the local installation:

- `DB_PATH` - Database location (default: `./code-index.db`)
- `MCP_FOLDER` - MCP folder path (default: `./`)
- `DASHBOARD_PORT` - Server port (default: `34244`)
- `AUTO_INDEX` - Auto-indexing (default: `false`)

## Usage Workflow

### Scenario 1: Development
```bash
# Terminal 1 - Start dashboard
code-index-dashboard

# Terminal 2 - Run CLI commands
code-index stats
code-index search "function"
code-index monitor
```

### Scenario 2: CI/CD Integration
```bash
# Get stats in CI pipeline
code-index stats

# Check server health
code-index health

# Search for specific patterns
code-index search "TODO"
```

### Scenario 3: Quick Monitoring
```bash
# Monitor from anywhere
code-index monitor

# Check server status
code-index health

# View recent files
code-index files 20
```

## Troubleshooting

### Command Not Found
```bash
# Verify npm global path
npm list -g code-index-mcp

# Reinstall if needed
cd /Users/hardik/Developer/code_index
npm install -g .
```

### Wrong Configuration Used
```bash
# Check which config is being used
code-index config show

# Update if needed
code-index config set --path=/correct/path
```

### Port Already in Use
```bash
# Start on different port
code-index-dashboard 8080

# Or kill process using port 34244
lsof -i :34244 | grep -v PID | awk '{print $2}' | xargs kill
```

## Performance

- CLI command startup: ~500ms
- Server startup: ~1-2 seconds
- Memory usage: 50-80MB

## Notes

- Global commands use the same database and configuration as local commands
- The project directory must exist at `/Users/hardik/Developer/code_index`
- All settings are stored in `.env` file in the project root
- Global commands work from any directory in your system

---

**Global Package Location:** `/Users/hardik/.nvm/versions/node/v22.21.1/lib/code-index-mcp`

**Project Root:** `/Users/hardik/Developer/code_index`

**Configuration File:** `/Users/hardik/Developer/code_index/.env`
